/**
 * Shared reservation cancellation workflow (server only).
 *
 * Every cancel entry point writes the status here, then settles the folio through
 * settle_reservation_cancellation: room and package charges that are no longer
 * billable are reversed, deposits and payments stay on the folio, and invoiced
 * charges are reported for a credit note. Refunds are never posted here.
 *
 * Reservation status does not depend on settlement. When settlement fails the
 * cancel still stands, the failure is recorded, and settlement can run again.
 */
import { recordReservationEvent, reservationError, blankToNull } from "./reservations.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { parseSnapshot } from "./rates.server";
import { computeCancellationPenalty, type CancellationPenaltyQuote } from "./reservation-cancel-workspace";
import {
  parseCancellationSettlement,
  settlementOutcome,
  type CancellationSettlement,
  type SettlementKind,
} from "./reservation-cancellation-settlement";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type CancellationSource = "front_office" | "booking" | "public";

const SETTLEMENT_ERROR_MESSAGES: Record<string, string> = {
  MEMBERSHIP_REQUIRED: "A staff member is required to settle the folio.",
  INVALID_SETTLEMENT_KIND: "Unknown settlement type.",
  ROOM_UNIT_NOT_FOUND: "That room is not on this reservation.",
  RESERVATION_NOT_FOUND: "Reservation not found for this property.",
  FOLIO_CLOSED: "The folio is closed. Correct it in Cashiering.",
  CORRECTION_INVOICED: "A charge on this folio is invoiced. Issue a credit note in Cashiering.",
  ALLOCATION_RELEASE_INVALID: "A deposit allocation could not be released.",
  ALLOCATION_RELEASE_EXCEEDS: "A deposit allocation release would exceed the original amount.",
};

export function settlementError(message: string): Error {
  for (const [code, text] of Object.entries(SETTLEMENT_ERROR_MESSAGES)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

export async function settleReservationFolio(
  supabaseAdmin: AdminClient,
  input: {
    restaurantId: string;
    reservationId: string;
    reservationRoomId?: string | null;
    kind: SettlementKind;
    membershipId: string | null;
    dryRun: boolean;
  },
): Promise<CancellationSettlement> {
  const { data, error } = (await supabaseAdmin.rpc("settle_reservation_cancellation" as never, {
    _restaurant_id: input.restaurantId,
    _reservation_id: input.reservationId,
    _reservation_room_id: input.reservationRoomId ?? null,
    _kind: input.kind,
    _membership_id: input.membershipId,
    _dry_run: input.dryRun,
  } as never)) as { data: unknown; error: { message: string } | null };
  if (error) throw settlementError(error.message);
  return parseCancellationSettlement(data);
}

export function settlementHistoryValues(s: CancellationSettlement): Record<string, unknown> {
  return {
    cancellation_settlement: {
      kind: s.kind,
      outcome: settlementOutcome(s),
      folio_id: s.folioId,
      folio_number: s.folioNumber,
      currency: s.currency,
      reversal_total: s.reversalTotal,
      reversed: s.reversed.map((r) => ({ charge_id: r.chargeId, amount: r.amount, mode: r.mode })),
      pending: s.pending.map((p) => ({ charge_id: p.chargeId, amount: p.amount, reason: p.reason })),
      released: s.released.map((r) => ({ allocation_id: r.allocationId, amount: r.amount })),
      fees_posted: s.feesPosted,
      credits: s.credits,
      balance: s.balance,
      refund_due: s.refundDue,
      amount_due: s.amountDue,
    },
    ...(s.reservationRoomId ? { reservation_room_id: s.reservationRoomId } : {}),
  };
}

/**
 * Apply settlement and record it. Settlement errors are recorded and returned,
 * never thrown, so a status change that already happened is not undone.
 */
export async function applySettlementAndRecord(
  supabaseAdmin: AdminClient,
  input: {
    restaurantId: string;
    reservationId: string;
    reservationRoomId?: string | null;
    kind: SettlementKind;
    ledgerMembershipId: string | null;
    actorMembershipId: string | null;
  },
): Promise<{ settlement: CancellationSettlement | null; settlementError: string | null }> {
  try {
    const settlement = await settleReservationFolio(supabaseAdmin, {
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
      reservationRoomId: input.reservationRoomId ?? null,
      kind: input.kind,
      membershipId: input.ledgerMembershipId,
      dryRun: false,
    });
    if (settlement.folioId) {
      await recordReservationEvent({
        restaurantId: input.restaurantId,
        reservationId: input.reservationId,
        eventType: "amended",
        newValues: settlementHistoryValues(settlement),
        notes: "Folio settled after cancellation.",
        actorMembershipId: input.actorMembershipId,
      });
    }
    return { settlement, settlementError: null };
  } catch (error) {
    const message = (error as Error).message;
    await recordReservationEvent({
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
      eventType: "amended",
      newValues: {
        cancellation_settlement_failed: true,
        kind: input.kind,
        error: message,
        ...(input.reservationRoomId ? { reservation_room_id: input.reservationRoomId } : {}),
      },
      notes: "Folio settlement did not complete. Run settlement again.",
      actorMembershipId: input.actorMembershipId,
    });
    return { settlement: null, settlementError: message };
  }
}

export async function loadCancellationPenaltyQuote(
  supabaseAdmin: AdminClient,
  restaurantId: string,
  reservationId: string,
  now: Date = new Date(),
): Promise<CancellationPenaltyQuote> {
  const { data: reservation, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select("arrival_date, room_subtotal, nightly_rate_snapshot, currency, cancellation_policy_snapshot")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!reservation) throw new Error("Reservation not found for this property.");
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("timezone")
    .eq("id", restaurantId)
    .maybeSingle();
  const roomSubtotal = reservation.room_subtotal == null ? null : Number(reservation.room_subtotal);
  return computeCancellationPenalty({
    snapshot: reservation.cancellation_policy_snapshot,
    arrivalDate: reservation.arrival_date,
    timeZone: (restaurant as { timezone?: string | null } | null)?.timezone,
    now,
    roomSubtotal: Number.isFinite(roomSubtotal) ? roomSubtotal : null,
    nightlyRates: parseSnapshot(reservation.nightly_rate_snapshot),
    currency: reservation.currency ?? null,
  });
}

/** Staff membership used for ledger rows when a guest cancels online. */
export async function propertyLedgerMembershipId(
  supabaseAdmin: AdminClient,
  restaurantId: string,
): Promise<string | null> {
  const owner = await supabaseAdmin
    .from("restaurant_users")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (owner.data?.id) return owner.data.id as string;
  const anyone = await supabaseAdmin
    .from("restaurant_users")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle();
  return (anyone.data as { id?: string } | null)?.id ?? null;
}

export type ProcessCancellationResult = {
  id: string;
  status: string;
  settlement: CancellationSettlement | null;
  settlementError: string | null;
};

/**
 * Cancel a reservation, or one room unit, then settle its folio.
 * Callers check permissions and the fee gate first.
 */
export async function processReservationCancellation(
  supabaseAdmin: AdminClient,
  input: {
    restaurantId: string;
    reservationId: string;
    reservationRoomId?: string | null;
    source: CancellationSource;
    reason: string | null;
    actorMembershipId: string | null;
    ledgerMembershipId: string | null;
    historyNotes?: string | null;
  },
): Promise<ProcessCancellationResult> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("hotel_reservations")
    .select("id, status, room_id, travel_agent_master_id, confirmation_number")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("Reservation not found for this property.");
  const row = existing as {
    id: string;
    status: string;
    room_id: string | null;
    travel_agent_master_id: string | null;
    confirmation_number: string;
  };

  const units = await supabaseAdmin
    .from("hotel_reservation_rooms")
    .select("id, status")
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId);
  if (units.error && !isMissingSchemaError(units.error)) throw new Error(units.error.message);
  const unitRows = (units.error ? [] : (units.data ?? [])) as { id: string; status: string }[];

  let status = row.status;
  const reason = blankToNull(input.reason);

  if (input.reservationRoomId) {
    const unit = unitRows.find((u) => u.id === input.reservationRoomId);
    if (!unit) throw reservationError("ROOM_UNIT_NOT_FOUND");
    if (unit.status !== "cancelled") {
      if (!input.actorMembershipId) throw new Error("A staff member is required to cancel a room.");
      const { error: cancelError } = await supabaseAdmin.rpc("cancel_hotel_reservation_unit", {
        _restaurant_id: input.restaurantId,
        _reservation_id: input.reservationId,
        _reason: reason ?? "Cancelled",
        _membership_id: input.actorMembershipId,
        _reservation_room_id: input.reservationRoomId,
      });
      if (cancelError) throw reservationError(cancelError.message);
    }
    const { data: rolled } = await supabaseAdmin
      .from("hotel_reservations")
      .select("status")
      .eq("restaurant_id", input.restaurantId)
      .eq("id", input.reservationId)
      .maybeSingle();
    status = (rolled as { status?: string } | null)?.status ?? status;
  } else if (row.status !== "cancelled") {
    if (row.status !== "pending" && row.status !== "confirmed") {
      throw reservationError("INVALID_TRANSITION");
    }
    const clearRoom = input.source !== "booking";
    const { error } = await supabaseAdmin
      .from("hotel_reservations")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        ...(clearRoom ? { room_id: null } : {}),
      })
      .eq("id", input.reservationId)
      .eq("restaurant_id", input.restaurantId);
    if (error) throw new Error(error.message);

    if (unitRows.length > 0) {
      const unitWrite = await supabaseAdmin
        .from("hotel_reservation_rooms")
        .update({ status: "cancelled", ...(clearRoom ? { room_id: null } : {}) })
        .eq("restaurant_id", input.restaurantId)
        .eq("reservation_id", input.reservationId)
        .in("status", ["pending", "confirmed"]);
      if (unitWrite.error && !isMissingSchemaError(unitWrite.error)) {
        throw new Error(unitWrite.error.message);
      }
    }

    await recordReservationEvent({
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
      eventType: "cancelled",
      previousValues: { status: row.status, room_id: row.room_id },
      newValues: {
        status: "cancelled",
        ...(clearRoom ? { room_id: null } : {}),
        source: input.source,
        ...(unitRows.length === 1 && unitRows[0] ? { reservation_room_id: unitRows[0].id } : {}),
      },
      notes: input.historyNotes ?? reason,
      actorMembershipId: input.actorMembershipId,
    });
    status = "cancelled";
  }

  const settled = await applySettlementAndRecord(supabaseAdmin, {
    restaurantId: input.restaurantId,
    reservationId: input.reservationId,
    reservationRoomId: input.reservationRoomId ?? null,
    kind: "cancel",
    ledgerMembershipId: input.ledgerMembershipId,
    actorMembershipId: input.actorMembershipId,
  });

  const { resyncGroupBlockInventoryForReservation } = await import("./groups.functions");
  await resyncGroupBlockInventoryForReservation(
    supabaseAdmin,
    input.actorMembershipId ?? input.ledgerMembershipId,
    input.restaurantId,
    input.reservationId,
  );

  if (!input.reservationRoomId && row.status !== "cancelled" && row.travel_agent_master_id) {
    const { syncTravelAgentCommission } = await import("./guest-travel-agent-booking");
    const { notifyTravelAgentBookingEvent } = await import("./guest-travel-agent-detail.functions");
    await syncTravelAgentCommission({
      db: supabaseAdmin as never,
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
      actorMembershipId: input.actorMembershipId ?? input.ledgerMembershipId,
      voidEntry: true,
    });
    await notifyTravelAgentBookingEvent({
      restaurantId: input.restaurantId,
      agencyId: row.travel_agent_master_id,
      eventKey: "booking_cancellation",
      body: `Reservation ${row.confirmation_number} was cancelled.`,
    });
  }

  return { id: input.reservationId, status, ...settled };
}
