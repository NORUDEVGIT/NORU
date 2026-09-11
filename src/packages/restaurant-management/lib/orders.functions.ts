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
  // Both are untrusted hints: the server re-resolves the real table row.
  restaurantTableId: z.string().uuid().nullable().optional(),
  tableNumber: z.string().trim().max(20).optional().default(""),
  lines: z.array(lineSchema).min(1).max(50),
});

/**
 * Customer (QR) ordering. A thin wrapper over the shared order pipeline in
 * `order-core.server`: it derives the customer identity from the verified
 * bearer token, never writes staff attribution, and stays resilient when the
 * restaurant has no usable waiter staffing data.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }) => {
    // Guests are allowed to INSERT orders, but have no SELECT policy on the
    // table, so PostgREST rejects an insert that returns the created row.
    // Use the privileged server client for this trusted, validated write.
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    // Prices/names come from the authoritative catalog, never from the browser.
    const { resolveOrderLines } = await import("./order-pricing.server");
    const core = await import("./order-core.server");

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

    // Tenant context arrives as a slug from the public /r/:restaurantSlug route
    // and is re-resolved here; the record's own approval flags decide whether
    // ordering is allowed. Expected business states are returned as data.
    const restaurantResult = await core.resolveRestaurant(supabase, { slug: data.restaurantSlug });
    if (!restaurantResult.ok) return { ok: false as const, message: restaurantResult.message };
    const restaurant = restaurantResult.restaurant;

    // Phase 8E1: a stale tab must not be able to submit an order after the
    // Restaurant Management package is switched off. Neutral message only, and
    // checked before any menu/table resolution or write.
    const { publicRestaurantManagementAvailable, PUBLIC_UNAVAILABLE } = await import(
      "./restaurant-package.server"
    );
    if (!(await publicRestaurantManagementAvailable(restaurant.id))) {
      return { ok: false as const, message: PUBLIC_UNAVAILABLE };
    }


    const tableResult = await core.resolveRestaurantTable(supabase, restaurant.id, {
      tableId: data.restaurantTableId ?? null,
      tableLabel: data.tableNumber,
    });
    if (!tableResult.ok) return { ok: false as const, message: tableResult.message };

    const { resolved } = await resolveOrderLines(data.lines, restaurant.id);

    // Attribution is best-effort for customer ordering: missing staffing,
    // missing attendance or conflicting assignments must never block a guest.
    let waiterMembershipId: string | null = null;
    let waiterName: string | null = null;
    try {
      const waiter = await core.resolveAssignedWaiter(supabase, restaurant.id, tableResult.tableId);
      if (waiter.status === "ok") {
        waiterMembershipId = waiter.membershipId;
        waiterName = waiter.name;
      }
    } catch (error) {
      console.error("[placeOrder] waiter attribution skipped", error);
    }

    // Guest tracking: a 256-bit random token is minted per order and only its
    // SHA-256 hash is stored. The raw token is returned once, to this browser,
    // and is the sole way an anonymous guest can later read their own order.
    const { newTrackingToken, hashTrackingToken } = await import("./guest-order.server");
    const trackingToken = newTrackingToken();

    const order = await core.createValidatedOrder(supabase, {
      restaurantId: restaurant.id,
      restaurantTableId: tableResult.tableId,
      tableLabel: tableResult.tableLabel,
      customerId,
      orderSource: "customer_qr",
      assignedWaiterMembershipId: waiterMembershipId,
      assignedWaiterName: waiterName,
      createdByStaffMembershipId: null,
      createdByStaffName: null,
      guestTokenHash: await hashTrackingToken(trackingToken),
      lines: resolved,
    });

    return {
      ok: true as const,
      id: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      total: order.total,
      bill: order.bill,
      trackingToken,
    };
  });
