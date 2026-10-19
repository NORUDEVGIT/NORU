/**
 * B01.1 — unit aggregate read.
 * B01.2 — progress for that unit. Assignment stays on the existing room commands.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  emptyCheckInUnitProgress,
  resolveCheckInUnitTarget,
  selectCheckInUnitProgress,
  type CheckInUnitMaster,
  type CheckInUnitOccupantSource,
  type CheckInUnitPackageSource,
  type CheckInUnitProgress,
  type CheckInUnitRow,
  type CheckInUnitTarget,
} from "@/packages/pms/lib/fo-check-in-unit";
import { isMissingSchemaError } from "@/packages/pms/lib/pms-set2-structure";
import {
  listReservationRoomDisplay,
  type ReservationRoomDisplay,
} from "@/packages/pms/lib/reservation-room-display.functions";
import {
  listAssignableRooms,
  type AssignableRoom,
} from "@/packages/pms/lib/reservations.functions";
import { requireReservationManager } from "@/packages/pms/lib/reservations.server";
import { getReservationPackageAttributions } from "@/packages/pms/lib/revenue/commercial-package.server";

export type CheckInUnitRead = CheckInUnitTarget & {
  display: ReservationRoomDisplay[];
  assignableRooms: AssignableRoom[];
  progress: CheckInUnitProgress;
};

const idSchema = z.string().uuid();

type UnitDb = {
  id: string;
  unit_sequence: number;
  status?: string | null;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  infants: number | null;
  rate_plan_id: string | null;
  currency: string | null;
  room_subtotal: number | string | null;
};

function moneyAmount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function guestName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Guest";
}

// hotel_reservation_rooms is not in the generated Database type yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = any;

async function loadUnits(
  db: UntypedDb,
  restaurantId: string,
  reservationId: string,
): Promise<UnitDb[]> {
  const columns =
    "id, unit_sequence, status, room_type_id, room_id, arrival_date, departure_date, adults, children, infants, rate_plan_id, currency, room_subtotal";
  let result = await db
    .from("hotel_reservation_rooms")
    .select(columns)
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .order("unit_sequence", { ascending: true });
  if (result.error && isMissingSchemaError(result.error) && /status/i.test(result.error.message)) {
    result = await db
      .from("hotel_reservation_rooms")
      .select(columns.replace("status, ", ""))
      .eq("restaurant_id", restaurantId)
      .eq("reservation_id", reservationId)
      .order("unit_sequence", { ascending: true });
  }
  if (result.error && isMissingSchemaError(result.error)) return [];
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as UnitDb[];
}

async function lookupName(
  db: UntypedDb,
  restaurantId: string,
  table: string,
  column: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as Array<Record<string, string>>).map((row) => [row.id, row[column] ?? ""]),
  );
}

export const getCheckInUnit = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }): Promise<CheckInUnitRead> => {
    await requireReservationManager(context as never, data.restaurantId);
    const loaded = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const { unitCount, ...target } = loaded;
    const display: ReservationRoomDisplay[] = target.reservationRoomId
      ? await listReservationRoomDisplay({
          data: {
            restaurantId: data.restaurantId,
            reservationId: data.reservationId,
            reservationRoomId: target.reservationRoomId,
          },
        })
      : [];
    const assignableRooms: AssignableRoom[] = await listAssignableRooms({
      data: {
        restaurantId: data.restaurantId,
        roomTypeId: target.roomTypeId,
        arrival: target.arrivalDate,
        departure: target.departureDate,
        excludeReservationId: data.reservationId,
      },
    });
    const progress = await loadUnitProgress(db, data.restaurantId, data.reservationId, {
      reservationRoomId: target.reservationRoomId,
      unitCount,
    });
    return { ...target, display, assignableRooms, progress };
  });

const PROGRESS_COLUMNS =
  "reservation_room_id, walk_in_incomplete, registration_snapshot, registration_waived, registration_waiver_reason, registration_waived_by, registration_waived_at, deposit_transaction_id, deposit_amount, deposit_method, deposit_waived, deposit_waiver_reason, deposit_waived_by, deposit_waived_at, key_access_type, key_identifier, key_count, key_issued_at, key_issued_by, key_waived, key_waiver_reason, key_waived_by, key_waived_at, completed_at";

type ProgressDb = {
  reservation_room_id: string | null;
  walk_in_incomplete: boolean;
  registration_snapshot: CheckInUnitProgress["registrationSnapshot"];
  registration_waived: boolean;
  registration_waiver_reason: string | null;
  registration_waived_by: string | null;
  registration_waived_at: string | null;
  deposit_transaction_id: string | null;
  deposit_amount: number | string | null;
  deposit_method: string | null;
  deposit_waived: boolean;
  deposit_waiver_reason: string | null;
  deposit_waived_by: string | null;
  deposit_waived_at: string | null;
  key_access_type: string | null;
  key_identifier: string | null;
  key_count: number | null;
  key_issued_at: string | null;
  key_issued_by: string | null;
  key_waived: boolean;
  key_waiver_reason: string | null;
  key_waived_by: string | null;
  key_waived_at: string | null;
  completed_at: string | null;
};

function toUnitProgress(row: ProgressDb): CheckInUnitProgress {
  return {
    reservationRoomId: row.reservation_room_id,
    walkInIncomplete: row.walk_in_incomplete,
    registrationSnapshot: row.registration_snapshot,
    registrationWaived: row.registration_waived,
    registrationWaiverReason: row.registration_waiver_reason,
    registrationWaivedBy: row.registration_waived_by,
    registrationWaivedAt: row.registration_waived_at,
    depositTransactionId: row.deposit_transaction_id,
    depositAmount: row.deposit_amount == null ? null : Number(row.deposit_amount),
    depositMethod: row.deposit_method,
    depositWaived: row.deposit_waived,
    depositWaiverReason: row.deposit_waiver_reason,
    depositWaivedBy: row.deposit_waived_by,
    depositWaivedAt: row.deposit_waived_at,
    keyAccessType: row.key_access_type,
    keyIdentifier: row.key_identifier,
    keyCount: row.key_count,
    keyIssuedAt: row.key_issued_at,
    keyIssuedBy: row.key_issued_by,
    keyWaived: row.key_waived,
    keyWaiverReason: row.key_waiver_reason,
    keyWaivedBy: row.key_waived_by,
    keyWaivedAt: row.key_waived_at,
    completedAt: row.completed_at,
  };
}

export async function loadUnitProgress(
  db: UntypedDb,
  restaurantId: string,
  reservationId: string,
  target: { reservationRoomId: string | null; unitCount: number },
): Promise<CheckInUnitProgress> {
  const result = await db
    .from("fo_checkin_progress")
    .select(PROGRESS_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId);
  if (result.error && isMissingSchemaError(result.error)) {
    if (target.unitCount > 0) return emptyCheckInUnitProgress(target.reservationRoomId);
    const legacy = await db
      .from("fo_checkin_progress")
      .select(PROGRESS_COLUMNS.replace("reservation_room_id, ", ""))
      .eq("restaurant_id", restaurantId)
      .eq("reservation_id", reservationId);
    if (legacy.error && isMissingSchemaError(legacy.error)) return emptyCheckInUnitProgress(null);
    if (legacy.error) throw new Error(legacy.error.message);
    return selectCheckInUnitProgress({
      reservationRoomId: null,
      unitCount: 0,
      rows: ((legacy.data ?? []) as Array<Omit<ProgressDb, "reservation_room_id">>).map((row) =>
        toUnitProgress({ ...row, reservation_room_id: null }),
      ),
    });
  }
  if (result.error) throw new Error(result.error.message);
  return selectCheckInUnitProgress({
    reservationRoomId: target.reservationRoomId,
    unitCount: target.unitCount,
    rows: ((result.data ?? []) as ProgressDb[]).map(toUnitProgress),
  });
}

export async function loadCheckInUnitTarget(input: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId?: string;
}): Promise<CheckInUnitTarget & { unitCount: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as UntypedDb;
  const { data: reservation, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      `id, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, infants, status, rate_plan_id, currency, room_subtotal,
       guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name ),
       room_types!hotel_reservations_type_same_property ( name ),
       hotel_rooms!hotel_reservations_room_same_type ( room_number ),
       rate_plan:hotel_rate_plans!hotel_reservations_rate_plan_same_property ( name )`,
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!reservation) throw new Error("Reservation not found for this property.");

  const guest = reservation.guest_profiles as {
    first_name: string | null;
    last_name: string | null;
  } | null;
  const master: CheckInUnitMaster = {
    guestId: reservation.guest_id,
    guestName: guestName(guest?.first_name, guest?.last_name),
    status: reservation.status,
    arrivalDate: reservation.arrival_date,
    departureDate: reservation.departure_date,
    adults: reservation.adults,
    children: reservation.children,
    infants: reservation.infants,
    roomTypeId: reservation.room_type_id,
    roomTypeName: (reservation.room_types as { name: string } | null)?.name ?? null,
    roomId: reservation.room_id,
    roomNumber: (reservation.hotel_rooms as { room_number: string } | null)?.room_number ?? null,
    ratePlanId: reservation.rate_plan_id,
    ratePlanName: (reservation.rate_plan as { name: string } | null)?.name ?? null,
    subtotal: moneyAmount(reservation.room_subtotal),
    currency: reservation.currency,
  };

  const unitRows = await loadUnits(db, input.restaurantId, input.reservationId);
  const typeIds = [...new Set(unitRows.map((row) => row.room_type_id))];
  const roomIds = [
    ...new Set(unitRows.map((row) => row.room_id).filter((id): id is string => Boolean(id))),
  ];
  const planIds = [
    ...new Set(unitRows.map((row) => row.rate_plan_id).filter((id): id is string => Boolean(id))),
  ];
  const [typeNames, roomNumbers, planNames] = await Promise.all([
    lookupName(db, input.restaurantId, "room_types", "name", typeIds),
    lookupName(db, input.restaurantId, "hotel_rooms", "room_number", roomIds),
    lookupName(db, input.restaurantId, "hotel_rate_plans", "name", planIds),
  ]);
  const units: CheckInUnitRow[] = unitRows.map((row) => ({
    id: row.id,
    sequence: row.unit_sequence,
    status: row.status ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    roomTypeId: row.room_type_id,
    roomTypeName: typeNames.get(row.room_type_id) ?? null,
    roomId: row.room_id,
    roomNumber: row.room_id ? (roomNumbers.get(row.room_id) ?? null) : null,
    ratePlanId: row.rate_plan_id,
    ratePlanName: row.rate_plan_id ? (planNames.get(row.rate_plan_id) ?? null) : null,
    subtotal: moneyAmount(row.room_subtotal),
    currency: row.currency,
  }));

  const occupantQuery = await db
    .from("hotel_reservation_room_guests")
    .select("reservation_room_id, guest_id, is_primary")
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId);
  if (occupantQuery.error && !isMissingSchemaError(occupantQuery.error)) {
    throw new Error(occupantQuery.error.message);
  }
  const occupantRows =
    occupantQuery.error || !occupantQuery.data
      ? []
      : (occupantQuery.data as Array<{
          reservation_room_id: string;
          guest_id: string;
          is_primary: boolean;
        }>);
  const guestIds = [...new Set(occupantRows.map((row) => row.guest_id))];
  const profileQuery =
    guestIds.length === 0
      ? { data: [], error: null }
      : await supabaseAdmin
          .from("guest_profiles")
          .select("id, first_name, last_name")
          .eq("restaurant_id", input.restaurantId)
          .in("id", guestIds);
  if (profileQuery.error) throw new Error(profileQuery.error.message);
  const profiles = new Map(
    (
      (profileQuery.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>
    ).map((profile) => [profile.id, profile]),
  );
  const occupants: CheckInUnitOccupantSource[] = occupantRows.map((row) => {
    const profile = profiles.get(row.guest_id);
    return {
      reservationRoomId: row.reservation_room_id,
      guestId: row.guest_id,
      name: guestName(profile?.first_name, profile?.last_name),
      isPrimary: row.is_primary,
    };
  });

  let packageRows: CheckInUnitPackageSource[] = [];
  try {
    const attributions = await getReservationPackageAttributions(db, {
      restaurantId: input.restaurantId,
      reservationId: input.reservationId,
    });
    packageRows = attributions.map((row) => ({
      reservationRoomId: row.reservationRoomId,
      id: row.id,
      packageId: row.packageId,
      packageName: row.packageName,
      appliedAmount: Number.isFinite(row.appliedAmount) ? row.appliedAmount : 0,
    }));
  } catch (packageError) {
    const message = packageError instanceof Error ? packageError.message : "";
    if (!isMissingSchemaError({ message })) throw packageError;
  }

  const target = resolveCheckInUnitTarget({
    ...(input.reservationRoomId ? { reservationRoomId: input.reservationRoomId } : {}),
    master,
    units,
    occupants,
    packages: packageRows,
  });
  return { ...target, unitCount: units.length };
}

/** Writes the unit progress row. A null unit id is only for a stay with no units. */
export async function writeCheckInUnitProgress(input: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string | null;
  patch: Record<string, unknown>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as UntypedDb;
  const existing = await db
    .from("fo_checkin_progress")
    .select("id, reservation_room_id")
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId);
  if (existing.error) throw new Error(existing.error.message);
  const rows = (existing.data ?? []) as Array<{ id: string; reservation_room_id: string | null }>;
  const match = input.reservationRoomId
    ? rows.find((row) => row.reservation_room_id === input.reservationRoomId)
    : rows.find((row) => row.reservation_room_id == null);
  if (match) {
    let update = db
      .from("fo_checkin_progress")
      .update(input.patch)
      .eq("id", match.id)
      .eq("restaurant_id", input.restaurantId);
    update = input.reservationRoomId
      ? update.eq("reservation_room_id", input.reservationRoomId)
      : update.is("reservation_room_id", null);
    const { error } = await update;
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db.from("fo_checkin_progress").insert({
    restaurant_id: input.restaurantId,
    reservation_id: input.reservationId,
    reservation_room_id: input.reservationRoomId,
    ...input.patch,
  });
  if (error) throw new Error(error.message);
}
