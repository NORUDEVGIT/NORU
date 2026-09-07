import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().nullable(),
  password: z.string().min(8).max(128),
  redirectTo: z.string().url().max(300).optional().nullable(),
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().nullable(),
});

/**
 * Registration happens entirely server-side: passwords are handed straight to
 * Supabase Auth, and the profile row is created with the privileged client so
 * the browser can never choose an account_type. A database trigger also forces
 * account_type back to 'customer' for any non-service-role write.
 */
export const registerCustomer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    const { publicServerClient } = await import("@/lib/order-pricing.server");
    const auth = publicServerClient();

    const { data: signUp, error } = await auth.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { first_name: data.firstName, last_name: data.lastName },
        ...(data.redirectTo ? { emailRedirectTo: data.redirectTo } : {}),
      },
    });

    if (error) {
      console.error("[registerCustomer] signUp failed", error.message);
      const message = /already|registered|exists/i.test(error.message)
        ? "An account with that email already exists. Try logging in instead."
        : /password/i.test(error.message)
          ? "Please choose a stronger password."
          : "We couldn't create your account. Please try again.";
      return { ok: false as const, message };
    }

    const userId = signUp.user?.id;
    if (userId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone?.trim() || null,
          account_type: "customer",
        },
        { onConflict: "id" },
      );
      if (profileError) console.error("[registerCustomer] profile upsert", profileError.message);
    }

    return {
      ok: true as const,
      needsVerification: !signUp.session,
    };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, account_type")
      .eq("id", userId)
      .maybeSingle();

    if (data) return data;

    // Self-heal a missing profile (e.g. accounts created before this phase).
    const meta = (claims as { email?: string }).email ?? null;
    const { data: created } = await supabase
      .from("profiles")
      .insert({ id: userId, email: meta, account_type: "customer" })
      .select("id, first_name, last_name, email, phone, account_type")
      .maybeSingle();
    return created ?? null;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    // account_type / id are never accepted from the browser.
    const { error } = await context.supabase
      .from("profiles")
      .update({
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone?.trim() || null,
      })
      .eq("id", context.userId);
    if (error) {
      console.error("[updateMyProfile]", error.message);
      throw new Error("We couldn't save your details. Please try again.");
    }
    return { ok: true as const };
  });

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // RLS restricts this to orders where customer_id = auth.uid().
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, order_number, table_number, total, status, created_at, restaurants(name)")
      .eq("customer_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[getMyOrders]", error.message);
      throw new Error("We couldn't load your orders right now.");
    }
    return (data ?? []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      tableNumber: order.table_number,
      total: Number(order.total),
      status: order.status,
      createdAt: order.created_at,
      restaurantName: (order as { restaurants?: { name: string } | null }).restaurants?.name ?? "Restaurant",
    }));
  });

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, order_number, table_number, total, status, created_at, restaurants(name)")
      .eq("id", data.orderId)
      .eq("customer_id", context.userId)
      .maybeSingle();
    if (error) {
      console.error("[getMyOrder]", error.message);
      throw new Error("We couldn't load that order.");
    }
    if (!order) return null;

    const { data: items } = await context.supabase
      .from("order_items")
      .select("id, item_name, quantity, price, line_total, special_instructions")
      .eq("order_id", data.orderId);

    return {
      id: order.id,
      orderNumber: order.order_number,
      tableNumber: order.table_number,
      total: Number(order.total),
      status: order.status,
      createdAt: order.created_at,
      restaurantName: (order as { restaurants?: { name: string } | null }).restaurants?.name ?? "Restaurant",
      items: (items ?? []).map((item) => ({
        id: item.id,
        name: item.item_name,
        quantity: item.quantity,
        price: Number(item.price),
        lineTotal: Number(item.line_total ?? Number(item.price) * item.quantity),
        specialInstructions: item.special_instructions,
      })),
    };
  });
