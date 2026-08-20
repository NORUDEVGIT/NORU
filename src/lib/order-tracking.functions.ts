import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const trackSchema = z.object({
  orderId: z.string().uuid(),
  restaurantSlug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/i),
  /** Raw guest tracking token. Absent for signed-in customers. */
  token: z
    .string()
    .trim()
    .length(64)
    .regex(/^[a-f0-9]+$/i)
    .nullable()
    .optional(),
});

export interface TrackedOrder {
  id: string;
  orderNumber: number;
  tableNumber: string;
  status: string;
  total: number;
  createdAt: string;
  restaurantName: string;
  restaurantSlug: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    specialInstructions: string | null;
  }[];
}

/**
 * Reads a single order for the customer-facing status page.
 *
 * Access is granted when EITHER
 *   A. the request carries a verified bearer token whose subject owns the order
 *   B. a valid guest tracking token for that exact order is presented
 * Anything else returns `{ ok: false }` — the same shape for a missing order,
 * a wrong token and a foreign order, so nothing is leaked by probing ids or
 * sequential order numbers.
 */
export const getTrackedOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => trackSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; order: TrackedOrder } | { ok: false }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashTrackingToken, safeEqual } = await import("./guest-order.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, table_number, status, total, created_at, customer_id, guest_token_hash, restaurants(name, slug)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order) return { ok: false };

    const restaurant = (order as { restaurants?: { name: string; slug: string } | null }).restaurants;
    // The order must belong to the restaurant in the URL.
    if (!restaurant || restaurant.slug !== data.restaurantSlug.toLowerCase()) return { ok: false };

    let authorised = false;

    // B. Guest tracking token.
    if (data.token && order.guest_token_hash) {
      authorised = safeEqual(await hashTrackingToken(data.token), order.guest_token_hash);
    }

    // A. Signed-in owner — identity comes only from the verified bearer token.
    if (!authorised && order.customer_id) {
      try {
        const authHeader = getRequest()?.headers.get("authorization") ?? "";
        const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (bearer && bearer.split(".").length === 3) {
          const { publicServerClient } = await import("./order-pricing.server");
          const { data: claimsData } = await publicServerClient().auth.getClaims(bearer);
          authorised = claimsData?.claims?.sub === order.customer_id;
        }
      } catch (error) {
        console.error("[getTrackedOrder] could not verify session", error);
      }
    }

    if (!authorised) return { ok: false };

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("id, item_name, quantity, price, line_total, special_instructions")
      .eq("order_id", order.id);

    return {
      ok: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        tableNumber: order.table_number,
        status: order.status,
        total: Number(order.total),
        createdAt: order.created_at,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        items: (items ?? []).map((item) => ({
          id: item.id,
          name: item.item_name,
          quantity: item.quantity,
          price: Number(item.price),
          lineTotal: Number(item.line_total ?? Number(item.price) * item.quantity),
          specialInstructions: item.special_instructions,
        })),
      },
    };
  });
