import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RestaurantStatus = "pending" | "approved" | "suspended" | "rejected";

export function deriveStatus(approved: boolean, active: boolean): RestaurantStatus {
  if (approved && active) return "approved";
  if (approved && !active) return "suspended";
  if (!approved && active) return "pending";
  return "rejected";
}

/**
 * Platform-admin authorization is decided server-side from the verified
 * session: the caller's own profile row (readable under RLS) must carry
 * account_type = 'platform_admin'. Nothing about admin identity or role is
 * ever read from the request body.
 */
async function requirePlatformAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("account_type")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || data?.account_type !== "platform_admin") {
    throw new Error("Administrator access required.");
  }
  return context.userId;
}

export const amIPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", context.userId)
      .maybeSingle();
    return { isAdmin: data?.account_type === "platform_admin" };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: restaurants }, customers, orders] = await Promise.all([
      supabaseAdmin.from("restaurants").select("approved, active"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("account_type", "customer"),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
    ]);

    const rows = restaurants ?? [];
    const count = (s: RestaurantStatus) =>
      rows.filter((r) => deriveStatus(r.approved, r.active) === s).length;

    return {
      totalRestaurants: rows.length,
      pending: count("pending"),
      approved: count("approved"),
      suspended: count("suspended"),
      rejected: count("rejected"),
      totalCustomers: customers.count ?? 0,
      totalOrders: orders.count ?? 0,
    };
  });

export interface AdminRestaurantRow {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  approved: boolean;
  active: boolean;
  status: RestaurantStatus;
  ownerEmail: string | null;
}

export const listRestaurantsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminRestaurantRow[]> => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: restaurants, error } = await supabaseAdmin
      .from("restaurants")
      .select("id, name, slug, email, phone, city, country, created_at, approved, active")
      .order("created_at", { ascending: false });
    if (error) throw new Error("We couldn't load restaurants right now.");

    const { data: memberships } = await supabaseAdmin
      .from("restaurant_users")
      .select("restaurant_id, user_id, role")
      .eq("role", "owner")
      .eq("active", true);

    const ownerIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
    const emailById = new Map<string, string | null>();
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);
      for (const p of profiles ?? []) emailById.set(p.id, p.email);
    }
    const ownerByRestaurant = new Map<string, string | null>();
    for (const m of memberships ?? []) {
      ownerByRestaurant.set(m.restaurant_id, emailById.get(m.user_id) ?? null);
    }

    return (restaurants ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      email: r.email,
      phone: r.phone,
      city: r.city,
      country: r.country,
      createdAt: r.created_at,
      approved: r.approved,
      active: r.active,
      status: deriveStatus(r.approved, r.active),
      ownerEmail: ownerByRestaurant.get(r.id) ?? null,
    }));
  });

export const getRestaurantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: r, error } = await supabaseAdmin
      .from("restaurants")
      .select(
        "id, name, slug, email, phone, address, city, postcode, country, logo_url, approved, active, created_at, approved_at, approved_by, rejection_reason, suspension_reason, status_updated_at",
      )
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (error || !r) throw new Error("That restaurant could not be found.");

    const { data: members } = await supabaseAdmin
      .from("restaurant_users")
      .select("user_id, role, active")
      .eq("restaurant_id", r.id);

    const userIds = (members ?? []).map((m) => m.user_id);
    const profileById = new Map<string, { first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .in("id", userIds);
      for (const p of profiles ?? []) profileById.set(p.id, p);
    }

    const team = (members ?? []).map((m) => {
      const p = profileById.get(m.user_id);
      return {
        role: m.role,
        active: m.active,
        name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
      };
    });

    const { data: audit } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, reason, created_at")
      .eq("restaurant_id", r.id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      restaurant: {
        id: r.id,
        name: r.name,
        slug: r.slug,
        email: r.email,
        phone: r.phone,
        address: r.address,
        city: r.city,
        postcode: r.postcode,
        country: r.country,
        logoUrl: r.logo_url,
        approved: r.approved,
        active: r.active,
        status: deriveStatus(r.approved, r.active),
        createdAt: r.created_at,
        approvedAt: r.approved_at,
        rejectionReason: r.rejection_reason,
        suspensionReason: r.suspension_reason,
        statusUpdatedAt: r.status_updated_at,
      },
      team,
      audit: audit ?? [],
    };
  });

const reasonSchema = z.object({
  restaurantId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

async function transition(
  context: { supabase: any; userId: string },
  restaurantId: string,
  allowedFrom: RestaurantStatus[],
  next: { approved: boolean; active: boolean },
  action: string,
  reason: string | null,
  patch: Record<string, unknown> = {},
) {
  const adminId = await requirePlatformAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: current } = await supabaseAdmin
    .from("restaurants")
    .select("id, approved, active")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!current) throw new Error("That restaurant could not be found.");

  const status = deriveStatus(current.approved, current.active);
  if (!allowedFrom.includes(status)) {
    throw new Error(`This restaurant is ${status}; that action isn't allowed from this state.`);
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("restaurants")
    .update({ approved: next.approved, active: next.active, status_updated_at: now, ...patch })
    .eq("id", restaurantId);
  if (error) {
    console.error(`[${action}]`, error.message);
    throw new Error("We couldn't update that restaurant. Please try again.");
  }

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: adminId,
    action,
    restaurant_id: restaurantId,
    reason,
    metadata: { from: status, to: deriveStatus(next.approved, next.active) },
  });

  return { ok: true as const, status: deriveStatus(next.approved, next.active) };
}

export const approveRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    transition(context, data.restaurantId, ["pending"], { approved: true, active: true }, "restaurant_approved", null, {
      approved_at: new Date().toISOString(),
      approved_by: context.userId,
      rejection_reason: null,
      suspension_reason: null,
    }),
  );

export const rejectRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reasonSchema.parse(input))
  .handler(async ({ data, context }) =>
    transition(context, data.restaurantId, ["pending"], { approved: false, active: false }, "restaurant_rejected", data.reason, {
      rejection_reason: data.reason,
    }),
  );

export const suspendRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reasonSchema.parse(input))
  .handler(async ({ data, context }) =>
    transition(context, data.restaurantId, ["approved"], { approved: true, active: false }, "restaurant_suspended", data.reason, {
      suspension_reason: data.reason,
    }),
  );

export const reactivateRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: z.string().uuid(), reason: z.string().trim().max(500).optional().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) =>
    transition(context, data.restaurantId, ["suspended"], { approved: true, active: true }, "restaurant_reactivated", data.reason?.trim() || null, {
      suspension_reason: null,
    }),
  );

export const listCustomersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, phone, created_at")
      .eq("account_type", "customer")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "—",
      email: p.email,
      phone: p.phone,
      joinedAt: p.created_at,
    }));
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, reason, created_at, restaurant_id, restaurants(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      createdAt: row.created_at,
      restaurantName: (row.restaurants as { name: string } | null)?.name ?? null,
    }));
  });
