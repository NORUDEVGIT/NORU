import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingSchemaError } from "@/packages/pms/lib/pms-set2-structure";
import { getAssignmentEligibilityCompat } from "@/packages/pms/lib/room-inventory-compat";
import { requireReservationManager } from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

export type ReservationRoomDisplay = {
  id: string;
  eligible: boolean;
  blockerCode: string | null;
  occupiedUntil: string | null;
};

type OverlapStay = {
  reservationId: string;
  roomId: string;
  unitId: string | null;
  departureDate: string;
};

function blockerCode(
  notes: Array<Record<string, string | number | boolean | null>>,
): string | null {
  const code = notes[0]?.code;
  return typeof code === "string" ? code : null;
}

function laterDate(current: string | null, next: string): string {
  return current == null || next > current ? next : current;
}

/**
 * Display read for one reservation room unit.
 * Selectable still means `pms_evaluate_room_assignment` returned eligible.
 * A sibling unit on this reservation is shown as occupied because that RPC
 * excludes the whole reservation. Assignment commit stays on assignReservationRoom.
 */
export const listReservationRoomDisplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationRoomDisplay[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { data: unit, error: unitError } = await context.supabase
      .from("hotel_reservation_rooms")
      .select("id, room_type_id, arrival_date, departure_date, adults, children")
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .eq("id", data.reservationRoomId)
      .maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit) throw new Error("Reservation room was not found.");

    const { data: rooms, error } = await context.supabase
      .from("hotel_rooms")
      .select("id, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", unit.room_type_id)
      .eq("active", true);
    if (error) throw new Error(error.message);
    const candidates = rooms ?? [];
    const overlaps = await overlappingStays(
      context.supabase as { from(table: string): StayQuery },
      {
        restaurantId: data.restaurantId,
        roomIds: candidates.map((room) => room.id),
        arrival: unit.arrival_date,
        departure: unit.departure_date,
      },
    );

    const output: ReservationRoomDisplay[] = [];
    for (const room of candidates) {
      const roomOverlaps = overlaps.filter((stay) => stay.roomId === room.id);
      const sibling = roomOverlaps.find(
        (stay) => stay.reservationId === data.reservationId && stay.unitId !== unit.id,
      );
      const others = roomOverlaps.filter((stay) => stay.reservationId !== data.reservationId);
      const eligibility = await getAssignmentEligibilityCompat(
        context.supabase,
        {
          restaurantId: data.restaurantId,
          roomId: room.id,
          roomTypeId: unit.room_type_id,
          arrival: unit.arrival_date,
          departure: unit.departure_date,
          excludeReservationId: data.reservationId,
          adults: unit.adults,
          children: unit.children,
        },
        () => ({
          source: "legacy" as const,
          eligible: room.status === "available" && others.length === 0 && !sibling,
          blockers: [],
          warnings: [],
          preferenceScore: 0,
          preferenceReasons: [],
        }),
      );
      const evaluatedBlocker = blockerCode(eligibility.blockers);
      const occupiedUntil = (sibling ? [sibling, ...others] : others).reduce<string | null>(
        (latest, stay) => laterDate(latest, stay.departureDate),
        null,
      );
      output.push({
        id: room.id,
        eligible: eligibility.eligible && !sibling,
        blockerCode: sibling ? "ROOM_ALREADY_BOOKED" : evaluatedBlocker,
        occupiedUntil: sibling || evaluatedBlocker === "ROOM_ALREADY_BOOKED" ? occupiedUntil : null,
      });
    }
    return output;
  });

type StayQuery = {
  select(columns: string): StayQuery;
  eq(column: string, value: string): StayQuery;
  in(column: string, values: readonly string[]): StayQuery;
  lt(column: string, value: string): StayQuery;
  gt(
    column: string,
    value: string,
  ): Promise<{
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  }>;
};

async function overlappingStays(
  supabase: { from(table: string): StayQuery },
  input: { restaurantId: string; roomIds: string[]; arrival: string; departure: string },
): Promise<OverlapStay[]> {
  if (input.roomIds.length === 0) return [];
  const unitResult = await supabase
    .from("hotel_reservation_rooms")
    .select("id, reservation_id, room_id, arrival_date, departure_date, status")
    .eq("restaurant_id", input.restaurantId)
    .in("room_id", input.roomIds)
    .in("status", ["pending", "confirmed", "checked_in"])
    .lt("arrival_date", input.departure)
    .gt("departure_date", input.arrival);
  if (unitResult.error && !isMissingSchemaError(unitResult.error)) {
    throw new Error(unitResult.error.message);
  }
  const stays: OverlapStay[] = (
    unitResult.error ? [] : ((unitResult.data ?? []) as Array<Record<string, unknown>>)
  )
    .filter((row) => typeof row.room_id === "string")
    .map((row) => ({
      reservationId: String(row.reservation_id),
      roomId: String(row.room_id),
      unitId: String(row.id),
      departureDate: String(row.departure_date),
    }));

  const masterResult = await supabase
    .from("hotel_reservations")
    .select("id, room_id, departure_date")
    .eq("restaurant_id", input.restaurantId)
    .in("room_id", input.roomIds)
    .in("status", ["pending", "confirmed", "checked_in"])
    .lt("arrival_date", input.departure)
    .gt("departure_date", input.arrival);
  if (masterResult.error) throw new Error(masterResult.error.message);
  const masters = (masterResult.data ?? []) as Array<Record<string, unknown>>;
  const withUnits = new Set(stays.map((stay) => stay.reservationId));
  const masterIds = masters.map((row) => String(row.id));
  if (masterIds.length > 0) {
    const anyUnits = await supabase
      .from("hotel_reservation_rooms")
      .select("reservation_id")
      .eq("restaurant_id", input.restaurantId)
      .in("reservation_id", masterIds);
    if (!anyUnits.error) {
      for (const row of (anyUnits.data ?? []) as Array<Record<string, unknown>>) {
        withUnits.add(String(row.reservation_id));
      }
    }
  }
  for (const master of masters) {
    if (typeof master.room_id !== "string" || withUnits.has(String(master.id))) continue;
    stays.push({
      reservationId: String(master.id),
      roomId: master.room_id,
      unitId: null,
      departureDate: String(master.departure_date),
    });
  }
  return stays;
}
