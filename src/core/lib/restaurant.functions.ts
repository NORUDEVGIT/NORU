import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deriveStatus } from "./restaurant-status";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, isValidTimeZone } from "@/shared/lib/property-time";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  restaurantName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  postcode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
  redirectTo: z.string().url().max(300).optional().nullable(),
});

const settingsSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  postcode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  logoUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, "Please choose a valid timezone."),
  currencyCode: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
});

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "restaurant";
}

/**
 * Trusted onboarding: the browser never inserts profiles, restaurants or
 * memberships. The server assigns account_type='restaurant_user',
 * role='owner' and approved=false; none of those come from the request.
 */
export const registerRestaurant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    const { publicServerClient } = await import("@/packages/restaurant-management/lib/order-pricing.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const auth = publicServerClient();
    const { data: signUp, error: signUpError } = await auth.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { first_name: data.firstName, last_name: data.lastName },
        ...(data.redirectTo ? { emailRedirectTo: data.redirectTo } : {}),
      },
    });

    if (signUpError) {
      console.error("[registerRestaurant] signUp", signUpError.message);
      return {
        ok: false as const,
        message: /already|registered|exists/i.test(signUpError.message)
          ? "An account with that email already exists. Log in to add a restaurant."
          : /password/i.test(signUpError.message)
            ? "Please choose a stronger password."
            : "We couldn't create your account. Please try again.",
      };
    }

    const user = signUp.user;
    // Supabase returns an obfuscated user with no identities when the email exists.
    if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
      return {
        ok: false as const,
        message: "An account with that email already exists. Log in to add a restaurant.",
      };
    }

    const userId = user.id;
    let createdRestaurantId: string | null = null;

    try {
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone?.trim() || null,
          account_type: "restaurant_user",
        },
        { onConflict: "id" },
      );
      if (profileError) throw new Error(`profile: ${profileError.message}`);

      // Unique slug: retry with -2, -3 ... on conflict.
      const base = slugify(data.restaurantName);
      let restaurantId: string | null = null;
      for (let attempt = 1; attempt <= 12 && !restaurantId; attempt += 1) {
        const slug = attempt === 1 ? base : `${base}-${attempt}`;
        const { data: inserted, error } = await supabaseAdmin
          .from("restaurants")
          .insert({
            name: data.restaurantName,
            slug,
            email: data.email,
            phone: data.phone?.trim() || null,
            address: data.address,
            city: data.city,
            postcode: data.postcode?.trim() || null,
            country: data.country,
            active: true,
            approved: false,
          })
          .select("id")
          .maybeSingle();
        if (inserted) {
          restaurantId = inserted.id;
        } else if (error && !/duplicate key|unique/i.test(error.message)) {
          throw new Error(`restaurant: ${error.message}`);
        }
      }
      if (!restaurantId) throw new Error("restaurant: could not allocate a unique slug");
      createdRestaurantId = restaurantId;

      const { error: memberError } = await supabaseAdmin.from("restaurant_users").insert({
        restaurant_id: restaurantId,
        user_id: userId,
        role: "owner",
        active: true,
      });
      if (memberError) throw new Error(`membership: ${memberError.message}`);

      return {
        ok: true as const,
        needsVerification: !signUp.session,
        restaurantId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[registerRestaurant] rollback", message);
      // Compensating cleanup so no half-created account survives.
      if (createdRestaurantId) {
        await supabaseAdmin.from("restaurant_users").delete().eq("restaurant_id", createdRestaurantId);
        await supabaseAdmin.from("restaurants").delete().eq("id", createdRestaurantId);
      }
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      return {
        ok: false as const,
        message: "We couldn't finish setting up your restaurant. Nothing was saved — please try again.",
      };
    }
  });

export interface RestaurantMembership {
  restaurantId: string;
  role: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
    logoUrl: string | null;
    timezone: string;
    currencyCode: string;
    approved: boolean;
    active: boolean;
    status: "pending" | "approved" | "suspended" | "rejected";
    rejectionReason: string | null;
    suspensionReason: string | null;
  };
}

/**
 * Restaurant context is derived from restaurant_users under RLS — never from
 * the browser. Returns every active membership so multi-restaurant switching
 * can be layered on later.
 */
export const getMyRestaurants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RestaurantMembership[]> => {
    const { data, error } = await context.supabase
      .from("restaurant_users")
      .select(
        "restaurant_id, role, active, restaurants(id, name, slug, address, city, postcode, country, logo_url, timezone, currency_code, approved, active, rejection_reason, suspension_reason)",
      )
      .eq("user_id", context.userId)
      .eq("active", true);

    if (error) {
      console.error("[getMyRestaurants]", error.message);
      throw new Error("We couldn't load your restaurant right now.");
    }

    const rows = (data ?? []).filter((row) => row.restaurants);

    // email/phone are private contact columns: not readable by the anon or
    // authenticated roles at all. They are re-read with the privileged client
    // only for restaurants this user is already a verified member of.
    const contacts = new Map<string, { email: string | null; phone: string | null }>();
    if (rows.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: contactRows } = await supabaseAdmin
        .from("restaurants")
        .select("id, email, phone")
        .in(
          "id",
          rows.map((row) => row.restaurant_id),
        );
      for (const c of contactRows ?? []) {
        contacts.set(c.id, { email: c.email, phone: c.phone });
      }
    }

    return rows
      .map((row) => {
        const r = row.restaurants as NonNullable<typeof row.restaurants>;
        const contact = contacts.get(r.id);
        return {
          restaurantId: row.restaurant_id,
          role: row.role,
          restaurant: {
            id: r.id,
            name: r.name,
            slug: r.slug,
            email: contact?.email ?? null,
            phone: contact?.phone ?? null,
            address: r.address,
            city: r.city,
            postcode: r.postcode,
            country: r.country,
            logoUrl: r.logo_url,
            timezone: r.timezone ?? DEFAULT_TIMEZONE,
            currencyCode: r.currency_code ?? DEFAULT_CURRENCY,
            approved: r.approved,
            active: r.active,
            status: deriveStatus(r.approved, r.active),
            rejectionReason: r.rejection_reason,
            suspensionReason: r.suspension_reason,
          },
        };
      });
  });

/**
 * Owners/managers may edit profile fields only. approved/active/slug are
 * additionally pinned by a database trigger, so even a crafted request cannot
 * self-approve a restaurant.
 */
export const updateMyRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: membership } = await context.supabase
      .from("restaurant_users")
      .select("role")
      .eq("user_id", context.userId)
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .maybeSingle();

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      throw new Error("You don't have permission to update this restaurant.");
    }

    const { error } = await context.supabase
      .from("restaurants")
      .update({
        name: data.name,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        address: data.address?.trim() || null,
        city: data.city?.trim() || null,
        postcode: data.postcode?.trim() || null,
        country: data.country?.trim() || null,
        logo_url: data.logoUrl?.trim() || null,
        timezone: data.timezone,
        currency_code: data.currencyCode.toUpperCase(),
      })
      .eq("id", data.restaurantId);

    if (error) {
      console.error("[updateMyRestaurant]", error.message);
      throw new Error("We couldn't save those details. Please try again.");
    }
    return { ok: true as const };
  });