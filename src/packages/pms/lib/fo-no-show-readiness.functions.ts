import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildCancelNoShowContext,
  type CancelNoShowContext,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import {
  computeNoShowPenalty,
  evaluateNoShowReadiness,
  isMatchingNoShowCharge,
  type NoShowReadiness,
} from "@/packages/pms/lib/fo-no-show-readiness";
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { requireReservationManager } from "@/packages/pms/lib/reservations.server";
import { parseSnapshot } from "@/packages/pms/lib/rates.server";
import {
  RESERVATION_UNIT_STATUSES,
  type FrontOfficeRoomTarget,
  type ReservationUnitStatus,
} from "@/packages/pms/lib/reservation-room-units";

const idSchema = z.string().uuid();

export type NoShowReadinessResponse = NoShowReadiness & {
  context: CancelNoShowContext;
  targets: FrontOfficeRoomTarget[];
  commercial: {
    roomSubtotal: number | null;
    packageAmount: number;
    depositRequirementSnapshot: unknown;
    noShowPolicySnapshot: unknown;
  };
};

function unitStatus(value: unknown): ReservationUnitStatus {
  return RESERVATION_UNIT_STATUSES.includes(value as ReservationUnitStatus)
    ? (value as ReservationUnitStatus)
    : "pending";
}

export const getNoShowReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NoShowReadinessResponse> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [reservationResult, unitsResult, propertyResult, progressResult, contextResult] =
      await Promise.all([
        supabaseAdmin
          .from("hotel_reservations")
          .select(
            "id, status, arrival_date, departure_date, room_id, room_subtotal, nightly_rate_snapshot, currency, deposit_requirement_snapshot, no_show_policy_snapshot, hotel_rooms!hotel_reservations_room_same_type ( room_number )",
          )
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.reservationId)
          .maybeSingle(),
        supabaseAdmin
          .from("hotel_reservation_rooms")
          .select(
            "id, unit_sequence, room_type_id, room_id, arrival_date, departure_date, adults, children, infants, status, room_subtotal, nightly_rate_snapshot, currency, room_types ( name ), hotel_rooms ( room_number )",
          )
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId)
          .order("unit_sequence"),
        supabaseAdmin
          .from("restaurants")
          .select("timezone, business_date")
          .eq("id", data.restaurantId)
          .maybeSingle(),
        supabaseAdmin
          .from("fo_checkin_progress")
          .select(
            "reservation_room_id, completed_at, registration_snapshot, deposit_transaction_id, key_issued_at",
          )
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId),
        buildCancelNoShowContext(
          supabaseAdmin,
          data.restaurantId,
          data.reservationId,
          "noshow",
          me.id,
          me.role,
          data.reservationRoomId,
        ),
      ]);

    if (reservationResult.error) throw new Error(reservationResult.error.message);
    if (!reservationResult.data) throw new Error("Reservation not found for this property.");
    if (unitsResult.error) throw new Error(unitsResult.error.message);
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (progressResult.error) throw new Error(progressResult.error.message);

    const reservation = reservationResult.data as {
      status: string;
      arrival_date: string;
      departure_date: string;
      room_id: string | null;
      room_subtotal: number | string | null;
      nightly_rate_snapshot: unknown;
      currency: string | null;
      deposit_requirement_snapshot: unknown;
      no_show_policy_snapshot: unknown;
      hotel_rooms: { room_number: string } | null;
    };
    const units = (unitsResult.data ?? []) as Array<{
      id: string;
      unit_sequence: number;
      room_type_id: string;
      room_id: string | null;
      arrival_date: string;
      departure_date: string;
      adults: number;
      children: number;
      infants: number;
      status: string | null;
      room_subtotal: number | string | null;
      nightly_rate_snapshot: unknown;
      currency: string | null;
      room_types: { name: string } | null;
      hotel_rooms: { room_number: string } | null;
    }>;
    const targets: FrontOfficeRoomTarget[] = units.map((unit) => ({
      id: unit.id,
      unitSequence: Number(unit.unit_sequence),
      roomTypeId: unit.room_type_id,
      roomId: unit.room_id,
      arrivalDate: unit.arrival_date,
      departureDate: unit.departure_date,
      adults: unit.adults,
      children: unit.children,
      infants: unit.infants,
      status: unit.status,
      roomTypeName: unit.room_types?.name ?? null,
      roomNumber: unit.hotel_rooms?.room_number ?? null,
    }));
    const selectedUnit =
      units.length === 1
        ? units[0]
        : (units.find((unit) => unit.id === data.reservationRoomId) ?? null);
    const target = selectedUnit
      ? {
          reservationRoomId: selectedUnit.id,
          unitSequence: Number(selectedUnit.unit_sequence),
          status: selectedUnit.status ?? reservation.status,
          arrivalDate: selectedUnit.arrival_date,
          roomId: selectedUnit.room_id,
          roomNumber: selectedUnit.hotel_rooms?.room_number ?? null,
        }
      : units.length === 0
        ? {
            reservationRoomId: null,
            unitSequence: null,
            status: reservation.status,
            arrivalDate: reservation.arrival_date,
            roomId: reservation.room_id,
            roomNumber: reservation.hotel_rooms?.room_number ?? null,
          }
        : null;
    const roomSubtotal = Number(selectedUnit?.room_subtotal ?? reservation.room_subtotal);
    const normalizedSubtotal = Number.isFinite(roomSubtotal) ? roomSubtotal : null;
    const nightlyRates = parseSnapshot(
      selectedUnit?.nightly_rate_snapshot ?? reservation.nightly_rate_snapshot,
    );
    const currency = selectedUnit?.currency ?? reservation.currency ?? contextResult.folio.currency;
    const penalty = computeNoShowPenalty({
      snapshot: reservation.no_show_policy_snapshot,
      roomSubtotal: normalizedSubtotal,
      nightlyRates,
      currency,
    });
    const posted = contextResult.folio.transactions.some((line) =>
      isMatchingNoShowCharge(line, {
        reservationId: data.reservationId,
        reservationRoomId: target?.reservationRoomId ?? null,
        expectedAmount: penalty.amount,
      }),
    );
    const selectedProgress = (progressResult.data ?? []).filter((row) =>
      target?.reservationRoomId
        ? row.reservation_room_id === target.reservationRoomId
        : row.reservation_room_id == null,
    );
    const checkInProgress = selectedProgress.some(
      (row) =>
        Boolean(row.registration_snapshot) ||
        Boolean(row.deposit_transaction_id) ||
        Boolean(row.key_issued_at) ||
        Boolean(row.completed_at),
    );

    const readiness = evaluateNoShowReadiness({
      businessDate: resolvePropertyBusinessDate(
        propertyResult.data?.business_date ?? null,
        propertyResult.data?.timezone ?? "UTC",
      ),
      unitRequired: units.length > 1 && !target,
      target,
      unitStatuses: units.map((unit) => unitStatus(unit.status ?? reservation.status)),
      fee: {
        required: contextResult.policy.required && penalty.basis !== "none",
        posted,
        waived: contextResult.waived,
        folioStatus: contextResult.folio.status,
        penalty,
      },
      checkInProgress,
    });

    const { data: packageRows, error: packageError } = await supabaseAdmin
      .from("hotel_reservation_packages")
      .select("applied_amount, reservation_room_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId);
    if (packageError) throw new Error(packageError.message);
    const packageAmount = (packageRows ?? []).reduce((sum, row) => {
      if (
        target?.reservationRoomId &&
        row.reservation_room_id &&
        row.reservation_room_id !== target.reservationRoomId
      ) {
        return sum;
      }
      return sum + Number(row.applied_amount ?? 0);
    }, 0);

    return {
      ...readiness,
      context: contextResult,
      targets,
      commercial: {
        roomSubtotal: normalizedSubtotal,
        packageAmount,
        depositRequirementSnapshot: reservation.deposit_requirement_snapshot,
        noShowPolicySnapshot: reservation.no_show_policy_snapshot,
      },
    };
  });
