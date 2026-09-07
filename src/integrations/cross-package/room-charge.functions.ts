/**
 * Phase 7A — Restaurant "Charge to Room" server functions.
 *
 * Every handler re-derives the caller's membership, revalidates each id against
 * the property, and routes writes through the locked SECURITY DEFINER
 * functions. Amounts always come from the stored order total.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { canPostRoomCharge, isManagerRole, roomChargeError } from "./room-charge.server";

const idSchema = z.string().uuid();

export type RoomChargeResult =
  | { ok: true; folioId: string; amount: number; already: boolean }
  | { ok: false; message: string };

export interface ChargeableStay {
  reservationId: string;
  confirmationNumber: string;
  roomId: string;
  roomNumber: string;
  guestId: string;
  guestName: string;
  folioId: string;
  folioNumber: string;
  folioBalance: number;
  currency: string;
}

export interface OrderBilling {
  orderId: string;
  orderNumber: number;
  status: string;
  total: number;
  currency: string;
  billingMethod: string | null;
  /** Caller may open the Charge to Room dialog for this order. */
  canPost: boolean;
  /** Caller may reverse an existing room charge (owner/manager only). */
  canReverse: boolean;
  /** Why posting isn't offered, when it isn't. */
  blockedReason: string | null;
  posted: {
    folioId: string;
    folioNumber: string;
    guestName: string;
    roomNumber: string | null;
    confirmationNumber: string | null;
    postedAt: string;
  } | null;
}

function fullName(g: { first_name?: string | null; last_name?: string | null } | null): string {
  return [g?.first_name, g?.last_name].filter(Boolean).join(" ").trim() || "Guest";
}

/* --------------------------------------------------------------- order info */

export const getOrderBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, orderId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OrderBilling> => {
    const me = await callerMembership(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, total, billing_method, room_charge_folio_id, room_charge_posted_at, assigned_waiter_membership_id, created_by_staff_membership_id",
      )
      .eq("id", data.orderId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!order) throw new Error("Order not found for this property.");

    const { data: property } = await supabaseAdmin
      .from("restaurants")
      .select("currency_code")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const currency = property?.currency_code ?? "GBP";

    let posted: OrderBilling["posted"] = null;
    if (order.room_charge_folio_id && order.room_charge_posted_at) {
      const { data: folio } = await supabaseAdmin
        .from("guest_folios")
        .select(
          "id, folio_number, guest_profiles!guest_folios_guest_same_property ( first_name, last_name ), hotel_reservations!guest_folios_reservation_same_property ( confirmation_number, hotel_rooms!hotel_reservations_room_same_type ( room_number ) )",
        )
        .eq("id", order.room_charge_folio_id)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      const res = (folio as any)?.hotel_reservations ?? null;
      posted = {
        folioId: order.room_charge_folio_id,
        folioNumber: (folio as any)?.folio_number ?? "",
        guestName: fullName((folio as any)?.guest_profiles ?? null),
        roomNumber: res?.hotel_rooms?.room_number ?? null,
        confirmationNumber: res?.confirmation_number ?? null,
        postedAt: order.room_charge_posted_at,
      };
    }

    const permission = posted
      ? ({ ok: false, message: "" } as const)
      : await canPostRoomCharge(supabaseAdmin, data.restaurantId, me, {
          assigned_waiter_membership_id: order.assigned_waiter_membership_id,
          created_by_staff_membership_id: order.created_by_staff_membership_id,
        });

    // A reversed charge stays on the ledger, and the ledger allows one
    // restaurant posting per order, so the order can't be charged again.
    let reversed = false;
    if (!posted) {
      const { data: prior } = await supabaseAdmin
        .from("folio_transactions")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("reference_type", "restaurant_order")
        .eq("reference_id", order.id)
        .maybeSingle();
      reversed = Boolean(prior);
    }

    let blockedReason: string | null = null;
    if (!posted) {
      if (reversed) blockedReason = "This order's room charge was reversed and can't be charged again.";
      else if (order.status === "cancelled") blockedReason = "Cancelled orders can't be charged to a room.";
      else if (order.status !== "served") blockedReason = "The order has to be served first.";
      else if (Number(order.total) <= 0) blockedReason = "This order has no chargeable total.";
      else if (!permission.ok) blockedReason = permission.message;
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      total: Number(order.total),
      currency,
      billingMethod: order.billing_method,
      canPost: !posted && blockedReason === null,
      canReverse: Boolean(posted) && isManagerRole(me.role),
      blockedReason,
      posted,
    };
  });

/* ------------------------------------------------------------ stay search */

export const searchChargeableStays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, search: z.string().trim().max(60).optional().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ChargeableStay[]> => {
    const me = await callerMembership(context, data.restaurantId);
    if (me.role === "kitchen") {
      throw new Error("You don't have permission to charge orders to a room.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: folios } = await supabaseAdmin
      .from("guest_folios")
      .select(
        "id, folio_number, currency, guest_id, reservation_id, guest_profiles!guest_folios_guest_same_property ( first_name, last_name ), hotel_reservations!guest_folios_reservation_same_property ( id, confirmation_number, status, room_id, hotel_rooms!hotel_reservations_room_same_type ( room_number ) )",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open")
      .limit(200);

    const eligible = ((folios ?? []) as any[]).filter((f) => {
      const res = f.hotel_reservations;
      return res && res.status === "checked_in" && res.room_id;
    });
    if (eligible.length === 0) return [];

    const { data: txns } = await supabaseAdmin
      .from("folio_transactions")
      .select("folio_id, amount")
      .in(
        "folio_id",
        eligible.map((f) => f.id as string),
      );
    const balances = new Map<string, number>();
    for (const t of (txns ?? []) as any[]) {
      balances.set(t.folio_id, (balances.get(t.folio_id) ?? 0) + Number(t.amount));
    }

    const term = (data.search ?? "").trim().toLowerCase();
    return eligible
      .map((f): ChargeableStay => {
        const res = f.hotel_reservations;
        return {
          reservationId: res.id,
          confirmationNumber: res.confirmation_number,
          roomId: res.room_id,
          roomNumber: res.hotel_rooms?.room_number ?? "—",
          guestId: f.guest_id,
          guestName: fullName(f.guest_profiles),
          folioId: f.id,
          folioNumber: f.folio_number,
          folioBalance: Math.round((balances.get(f.id) ?? 0) * 100) / 100,
          currency: f.currency,
        };
      })
      .filter(
        (s) =>
          term === "" ||
          s.roomNumber.toLowerCase().includes(term) ||
          s.guestName.toLowerCase().includes(term) ||
          s.confirmationNumber.toLowerCase().includes(term),
      )
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  });

/* ------------------------------------------------------------------- post */

export const postOrderRoomCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, orderId: idSchema, folioId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomChargeResult> => {
    const me = await callerMembership(context, data.restaurantId);
    // Phase 8E1: the bridge needs BOTH packages live, checked before any write.
    try {
      const { requireRestaurantAndPms } = await import("@/packages/restaurant-management/lib/restaurant-package.server");
      await requireRestaurantAndPms(data.restaurantId);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");



    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, assigned_waiter_membership_id, created_by_staff_membership_id")
      .eq("id", data.orderId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Order not found for this property." };

    const permission = await canPostRoomCharge(supabaseAdmin, data.restaurantId, me, {
      assigned_waiter_membership_id: order.assigned_waiter_membership_id,
      created_by_staff_membership_id: order.created_by_staff_membership_id,
    });
    if (!permission.ok) return { ok: false, message: permission.message };

    const { data: result, error } = await supabaseAdmin.rpc("post_order_room_charge", {
      _restaurant_id: data.restaurantId,
      _order_id: data.orderId,
      _folio_id: data.folioId,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: roomChargeError(error.message).message };

    const payload = (result ?? {}) as { already?: boolean; folio_id?: string; amount?: number };
    return {
      ok: true,
      folioId: payload.folio_id ?? data.folioId,
      amount: Number(payload.amount ?? 0),
      already: Boolean(payload.already),
    };
  });

/* ---------------------------------------------------------------- reverse */

export const reverseOrderRoomCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        reason: z.string().trim().min(3).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; amount: number } | { ok: false; message: string }> => {
    const me = await callerMembership(context, data.restaurantId);
    if (!isManagerRole(me.role)) {
      return { ok: false, message: "Only an owner or manager can reverse a room charge." };
    }
    try {
      const { requireRestaurantAndPms } = await import("@/packages/restaurant-management/lib/restaurant-package.server");
      await requireRestaurantAndPms(data.restaurantId);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("reverse_order_room_charge", {
      _restaurant_id: data.restaurantId,
      _order_id: data.orderId,
      _reason: data.reason,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: roomChargeError(error.message).message };
    const payload = (result ?? {}) as { amount?: number };
    return { ok: true, amount: Number(payload.amount ?? 0) };
  });
