import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { requirePmsActor, requirePmsActorAny } from "./pms-permissions.server";
import {
  REMOVE_ROOM_PAIR_RPC,
  SAVE_ROOMING_PAIR_RPC,
  SAVE_ROOM_PAIR_RPC,
  assertValidPairSequences,
  carryRoomingPairToReservations,
  pairLabelFor,
  roomPairErrorMessage,
  saveRoomPairsBySequence,
  type ReservationPairUnit,
  type ReservationPairView,
  type RoomPairDb,
} from "./reservation-room-pairs";

const idSchema = z.string().uuid();

type LooseResult = { data: unknown; error: { message: string } | null };
interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  or(filters: string): LooseQuery;
  is(column: string, value: null): LooseQuery;
  maybeSingle(): PromiseLike<LooseResult>;
}
type LooseDb = {
  from(table: string): LooseQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<LooseResult>;
};

async function adminDb(): Promise<LooseDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseDb;
}

type UnitRow = {
  id: string;
  reservation_id: string;
  unit_sequence: number;
  status: string;
  room_type_id: string | null;
  adults: number;
  children: number;
};
type PairRow = { id: string; unit_a_id: string; unit_b_id: string };

const UNIT_COLUMNS = "id, reservation_id, unit_sequence, status, room_type_id, adults, children";

const PAIR_SCHEMA_MISSING = /hotel_reservation_room_pairs|connecting_partner_row_id|schema cache|does not exist/i;

class PairSchemaMissing extends Error {}

async function loadPairsTouching(client: LooseDb, restaurantId: string, unitIds: readonly string[]) {
  if (unitIds.length === 0) return [] as PairRow[];
  const list = unitIds.join(",");
  const { data, error } = await client
    .from("hotel_reservation_room_pairs")
    .select("id, unit_a_id, unit_b_id")
    .eq("restaurant_id", restaurantId)
    .is("ended_at", null)
    .or(`unit_a_id.in.(${list}),unit_b_id.in.(${list})`);
  if (error) {
    if (PAIR_SCHEMA_MISSING.test(error.message)) throw new PairSchemaMissing(error.message);
    throw new Error("Could not load connecting pairs.");
  }
  return (data ?? []) as PairRow[];
}

async function describeUnits(
  client: LooseDb,
  restaurantId: string,
  units: readonly UnitRow[],
  ownReservationId: string | null,
): Promise<ReservationPairUnit[]> {
  const reservationIds = [...new Set(units.map((unit) => unit.reservation_id))];
  const typeIds = [...new Set(units.flatMap((unit) => (unit.room_type_id ? [unit.room_type_id] : [])))];
  const [reservations, types] = await Promise.all([
    reservationIds.length
      ? client
          .from("hotel_reservations")
          .select("id, confirmation_number")
          .eq("restaurant_id", restaurantId)
          .in("id", reservationIds)
      : Promise.resolve({ data: [], error: null } as LooseResult),
    typeIds.length
      ? client.from("room_types").select("id, name").eq("restaurant_id", restaurantId).in("id", typeIds)
      : Promise.resolve({ data: [], error: null } as LooseResult),
  ]);
  const confirmation = new Map(
    ((reservations.data ?? []) as Array<{ id: string; confirmation_number: string | null }>).map(
      (row) => [row.id, row.confirmation_number],
    ),
  );
  const typeName = new Map(
    ((types.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );
  return units.map((unit) => ({
    id: unit.id,
    reservationId: unit.reservation_id,
    unitSequence: Number(unit.unit_sequence),
    status: unit.status,
    roomTypeName: unit.room_type_id ? (typeName.get(unit.room_type_id) ?? null) : null,
    adults: Number(unit.adults ?? 0),
    children: Number(unit.children ?? 0),
    confirmationNumber: confirmation.get(unit.reservation_id) ?? null,
    own: unit.reservation_id === ownReservationId,
  }));
}

export type ReservationRoomPairsRead = {
  /** False until the pairing schema exists on this database. */
  available: boolean;
  units: ReservationPairUnit[];
  pairs: ReservationPairView[];
};

/**
 * The connecting pairs of one reservation, and the units it may pair with:
 * its own units and the units of other reservations in the same group.
 */
export async function loadReservationRoomPairs(
  client: LooseDb,
  restaurantId: string,
  reservationId: string,
): Promise<ReservationRoomPairsRead> {
  const header = await client
    .from("hotel_reservations")
    .select("id, pms_group_id, group_account_master_id")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (header.error) throw new Error("Could not load the reservation.");
  const row = header.data as {
    id: string;
    pms_group_id: string | null;
    group_account_master_id: string | null;
  } | null;
  if (!row) throw new Error("Reservation not found for this property.");

  const related = new Set<string>([reservationId]);
  const groupFilters = [
    row.pms_group_id ? `pms_group_id.eq.${row.pms_group_id}` : null,
    row.group_account_master_id ? `group_account_master_id.eq.${row.group_account_master_id}` : null,
  ].filter((value): value is string => value !== null);
  if (groupFilters.length > 0) {
    const siblings = await client
      .from("hotel_reservations")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .or(groupFilters.join(","));
    if (siblings.error) throw new Error("Could not load the group reservations.");
    for (const sibling of (siblings.data ?? []) as Array<{ id: string }>) related.add(sibling.id);
  }

  const unitsResult = await client
    .from("hotel_reservation_rooms")
    .select(UNIT_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .in("reservation_id", [...related]);
  if (unitsResult.error) throw new Error("Could not load the reservation rooms.");
  const unitRows = (unitsResult.data ?? []) as UnitRow[];
  const ownIds = unitRows.filter((unit) => unit.reservation_id === reservationId).map((unit) => unit.id);
  let pairRows: PairRow[];
  try {
    pairRows = await loadPairsTouching(client, restaurantId, ownIds);
  } catch (error) {
    if (error instanceof PairSchemaMissing) return { available: false, units: [], pairs: [] };
    throw error;
  }

  const known = new Set(unitRows.map((unit) => unit.id));
  const missing = pairRows
    .flatMap((pair) => [pair.unit_a_id, pair.unit_b_id])
    .filter((id) => !known.has(id));
  if (missing.length > 0) {
    const extra = await client
      .from("hotel_reservation_rooms")
      .select(UNIT_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .in("id", [...new Set(missing)]);
    if (extra.error) throw new Error("Could not load the reservation rooms.");
    unitRows.push(...((extra.data ?? []) as UnitRow[]));
  }

  const units = (await describeUnits(client, restaurantId, unitRows, reservationId)).sort(
    (a, b) =>
      Number(b.own) - Number(a.own) ||
      (a.confirmationNumber ?? "").localeCompare(b.confirmationNumber ?? "") ||
      a.unitSequence - b.unitSequence,
  );
  const pairs = pairRows.map((pair) => {
    const view = { pairId: pair.id, unitAId: pair.unit_a_id, unitBId: pair.unit_b_id };
    return { ...view, label: pairLabelFor(view, units) };
  });
  return { available: true, units, pairs };
}

export const listReservationRoomPairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationRoomPairsRead> => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RESERVATION_VIEW);
    return loadReservationRoomPairs(await adminDb(), data.restaurantId, data.reservationId);
  });

/** Edit: create a pair, or replace the unit's current partner. */
export const saveReservationRoomPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        unitId: idSchema,
        partnerUnitId: idSchema,
        replaceExisting: z.boolean().default(false),
        keepReplacedPartnerRequirement: z.boolean().default(false),
      })
      .refine((value) => value.unitId !== value.partnerUnitId, "A room cannot be paired with itself.")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.RESERVATION_EDIT,
    );
    const client = await adminDb();
    const { data: saved, error } = await client.rpc(SAVE_ROOM_PAIR_RPC, {
      _restaurant_id: data.restaurantId,
      _unit_id: data.unitId,
      _partner_unit_id: data.partnerUnitId,
      _actor_membership_id: me.id,
      _replace_existing: data.replaceExisting,
      _keep_replaced_partner_requirement: data.keepReplacedPartnerRequirement,
    });
    if (error) {
      console.error("save_reservation_room_pair_failed", { message: error.message });
      throw new Error(roomPairErrorMessage(error.message));
    }
    const result = (saved ?? {}) as { pair_id?: string; created?: boolean };
    return { pairId: result.pair_id ?? null, created: result.created === true };
  });

/** Edit: end a pair. Each unit's connecting requirement is kept or turned off as chosen. */
export const removeReservationRoomPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        pairId: idSchema,
        decisions: z
          .array(z.object({ unitId: idSchema, keepRequirement: z.boolean() }))
          .length(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.RESERVATION_EDIT,
    );
    const client = await adminDb();
    const pair = await client
      .from("hotel_reservation_room_pairs")
      .select("id, unit_a_id, unit_b_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.pairId)
      .is("ended_at", null)
      .maybeSingle();
    if (pair.error) throw new Error(roomPairErrorMessage(pair.error.message));
    const row = pair.data as PairRow | null;
    if (!row) throw new Error(roomPairErrorMessage("ROOM_PAIR_NOT_FOUND"));
    const decisionFor = (unitId: string) =>
      data.decisions.find((decision) => decision.unitId === unitId)?.keepRequirement;
    const keepA = decisionFor(row.unit_a_id);
    const keepB = decisionFor(row.unit_b_id);
    if (keepA === undefined || keepB === undefined) {
      throw new Error(roomPairErrorMessage("ROOM_PAIR_DECISION_REQUIRED"));
    }
    const { error } = await client.rpc(REMOVE_ROOM_PAIR_RPC, {
      _restaurant_id: data.restaurantId,
      _pair_id: row.id,
      _keep_unit_a_requirement: keepA,
      _keep_unit_b_requirement: keepB,
      _actor_membership_id: me.id,
    });
    if (error) {
      console.error("remove_reservation_room_pair_failed", { message: error.message });
      throw new Error(roomPairErrorMessage(error.message));
    }
    return { removed: true };
  });

const pairSequenceSchema = z.object({
  unitSequenceA: z.number().int().min(1).max(20),
  unitSequenceB: z.number().int().min(1).max(20),
});

/**
 * Retry for the create flow. Pairs the units of a reservation that already
 * exists and never creates one. Saving a pair that exists is a no-op.
 */
export const saveReservationRoomPairsAfterCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        pairs: z.array(pairSequenceSchema).min(1).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ complete: boolean; reason: string | null }> => {
    const me = await requirePmsActorAny(context as never, data.restaurantId, [
      PMS_PERMISSIONS.RESERVATION_CREATE,
      PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN,
    ]);
    assertValidPairSequences(data.pairs, 20);
    const saved = await saveRoomPairsBySequence((await adminDb()) as unknown as RoomPairDb, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      actorMembershipId: me.id,
      pairs: data.pairs,
    });
    if (!saved.complete) {
      console.error("save_reservation_room_pairs_failed", {
        reservationId: data.reservationId,
        message: saved.errorMessage,
      });
    }
    return {
      complete: saved.complete,
      reason: saved.complete ? null : roomPairErrorMessage(saved.errorMessage),
    };
  });

/**
 * Rooming list: set or clear "Paired with" between two rows of one group.
 * When both rows already have reservations the reservation pair is saved too.
 */
export const saveGroupRoomingPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        rowId: idSchema,
        partnerRowId: idSchema.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ pairSaved: boolean; reason: string | null }> => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.RESERVATION_GROUP_EDIT,
    );
    const client = await adminDb();
    const { error } = await client.rpc(SAVE_ROOMING_PAIR_RPC, {
      _restaurant_id: data.restaurantId,
      _group_id: data.groupId,
      _row_id: data.rowId,
      _partner_row_id: data.partnerRowId,
    });
    if (error) {
      console.error("save_group_rooming_pair_failed", { message: error.message });
      throw new Error(roomPairErrorMessage(error.message));
    }
    if (!data.partnerRowId) return { pairSaved: false, reason: null };
    const carried = await carryRoomingPairToReservations(client as unknown as RoomPairDb, {
      restaurantId: data.restaurantId,
      groupId: data.groupId,
      rowId: data.rowId,
      actorMembershipId: me.id,
    });
    if (!carried.complete) {
      console.error("carry_group_rooming_pair_failed", { message: carried.errorMessage });
    }
    return {
      pairSaved: carried.complete,
      reason: carried.complete ? null : roomPairErrorMessage(carried.errorMessage),
    };
  });

export type GroupConnectingPairs = {
  /** False until the pairing schema exists on this database. */
  available: boolean;
  /** Rooming row to its "Paired with" row. Both directions are listed. */
  partners: Record<string, string>;
  /** Rooming rows whose reservation pair is saved. */
  savedRowIds: string[];
  /** Saved pairs among the group's reservations, as staff labels. */
  labels: string[];
};

const NO_GROUP_PAIRS: GroupConnectingPairs = {
  available: false,
  partners: {},
  savedRowIds: [],
  labels: [],
};

export async function loadGroupConnectingPairs(
  client: LooseDb,
  restaurantId: string,
  groupId: string,
): Promise<GroupConnectingPairs> {
  const rooming = await client
    .from("pms_group_rooming_rows")
    .select("id, reservation_id, connecting_partner_row_id")
    .eq("restaurant_id", restaurantId)
    .eq("group_id", groupId);
  if (rooming.error) {
    if (PAIR_SCHEMA_MISSING.test(rooming.error.message)) return NO_GROUP_PAIRS;
    throw new Error("Could not load the rooming list.");
  }
  const rows = (rooming.data ?? []) as Array<{
    id: string;
    reservation_id: string | null;
    connecting_partner_row_id: string | null;
  }>;
  const partners: Record<string, string> = {};
  for (const row of rows) {
    if (row.connecting_partner_row_id) partners[row.id] = row.connecting_partner_row_id;
  }

  const reservations = await client
    .from("hotel_reservations")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("pms_group_id", groupId);
  if (reservations.error) throw new Error("Could not load the group reservations.");
  const reservationIds = ((reservations.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (reservationIds.length === 0) return { available: true, partners, savedRowIds: [], labels: [] };

  const unitsResult = await client
    .from("hotel_reservation_rooms")
    .select(UNIT_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .in("reservation_id", reservationIds);
  if (unitsResult.error) throw new Error("Could not load the reservation rooms.");
  const unitRows = (unitsResult.data ?? []) as UnitRow[];
  let pairRows: PairRow[];
  try {
    pairRows = await loadPairsTouching(client, restaurantId, unitRows.map((unit) => unit.id));
  } catch (error) {
    if (error instanceof PairSchemaMissing) return NO_GROUP_PAIRS;
    throw error;
  }
  const reservationOf = new Map(unitRows.map((unit) => [unit.id, unit.reservation_id]));
  const pairKey = (left: string, right: string) => [left, right].sort().join(":");
  const pairedReservations = new Set(
    pairRows.map((pair) =>
      pairKey(reservationOf.get(pair.unit_a_id) ?? "", reservationOf.get(pair.unit_b_id) ?? ""),
    ),
  );
  const reservationOfRow = new Map(rows.map((row) => [row.id, row.reservation_id]));
  const savedRowIds = rows
    .filter((row) => {
      const partnerReservation = row.connecting_partner_row_id
        ? reservationOfRow.get(row.connecting_partner_row_id)
        : null;
      if (!row.reservation_id || !partnerReservation) return false;
      return pairedReservations.has(pairKey(row.reservation_id, partnerReservation));
    })
    .map((row) => row.id);

  const pairedUnitIds = new Set(pairRows.flatMap((pair) => [pair.unit_a_id, pair.unit_b_id]));
  const units = await describeUnits(
    client,
    restaurantId,
    unitRows.filter((unit) => pairedUnitIds.has(unit.id)),
    null,
  );
  const labels = pairRows.map((pair) =>
    pairLabelFor({ unitAId: pair.unit_a_id, unitBId: pair.unit_b_id }, units),
  );
  return { available: true, partners, savedRowIds, labels };
}

export const getGroupConnectingPairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GroupConnectingPairs> => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.RESERVATION_VIEW);
    return loadGroupConnectingPairs(await adminDb(), data.restaurantId, data.groupId);
  });
