import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// The browser sends what it wants to order, not what it costs: the id is the
// only field the server trusts, and name/price are display-only echoes.
const lineSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().int().positive().max(20),
  price: z.number().nonnegative().optional(),
  specialInstructions: z.string().max(500).nullable().optional(),
});

const placeOrderSchema = z.object({
  restaurantSlug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/i),
  tableNumber: z.number().int().positive().max(999),
  lines: z.array(lineSchema).min(1).max(50),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }) => {
    // Guests are allowed to INSERT orders, but have no SELECT policy on the
    // table, so PostgREST rejects an insert that returns the created row.
    // Use the privileged server client for this trusted, validated write.
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    // Prices/names come from the authoritative catalog, never from the browser.
    const { resolveOrderLines } = await import("./order-pricing.server");

    // The customer identity comes ONLY from the verified bearer token on the
    // request — never from anything the browser puts in the payload. Anonymous
    // ordering stays supported: no valid token simply means customer_id null.
    let customerId: string | null = null;
    try {
      const authHeader = getRequest()?.headers.get("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (token && token.split(".").length === 3) {
        const { publicServerClient } = await import("./order-pricing.server");
        const { data: claimsData } = await publicServerClient().auth.getClaims(token);
        customerId = claimsData?.claims?.sub ?? null;
      }
    } catch (error) {
      console.error("[placeOrder] could not verify customer session", error);
    }

    // Tenant context comes from the public /r/:restaurantSlug route as a slug,
    // never as a restaurant id chosen by the browser: the slug is re-resolved
    // here and the record's own approval flags decide whether ordering is
    // allowed. There is no default restaurant.
    const slug = data.restaurantSlug.toLowerCase();
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id, approved, active")
      .eq("slug", slug)
      .maybeSingle();

    // Approval gating is enforced here, server-side: a stale page or QR link
    // can never place an order at a pending, rejected or suspended restaurant.
    // This is an expected business state, not a crash — return it as data so it
    // surfaces as a message in the UI instead of an unhandled server error.
    if (!restaurant || !restaurant.approved || !restaurant.active) {
      return {
        ok: false as const,
        message: "This restaurant isn't accepting orders right now. Please ask a member of staff.",
      };
    }

    const { resolved, total } = await resolveOrderLines(data.lines, restaurant.id);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        table_number: data.tableNumber,
        status: "new",
        total,
        restaurant_id: restaurant.id,
        customer_id: customerId,
      })
      .select("id, order_number, table_number, total, status, created_at")
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message ?? "Could not create the order.");
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      resolved.map((line) => ({
        order_id: order.id,
        ...line,
        line_total: Number((line.price * line.quantity).toFixed(2)),
      })),
    );

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    return {
      ok: true as const,
      id: order.id,
      orderNumber: order.order_number,
      tableNumber: order.table_number,
      total: Number(order.total),
    };
  });
