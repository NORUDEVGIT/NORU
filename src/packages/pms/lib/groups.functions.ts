import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "./reservation-dates";
import { assertStayDates, requireReservationManager } from "./reservations.server";
import { createReservation } from "./reservations.functions";
import {
  GROUP_STATUSES,
  GROUP_TYPES,
  allotmentTotals,
  effectiveGroupBlockCutoff,
  headerGroupBlockIdFromUnits,
  isAllowedGroupStatusTransition,
  nightlyAllotment,
  staysFitAllotment,
  type GroupPickupStay,
  type GroupStatus,
} from "./groups";
import {
  GROUP_OPERATIONAL_UNIT_LIMIT,
  guestDisplayName,
  mapGroupOperationalUnit,
  type GroupOperationalIdentity,
  type GroupOperationalUnit,
} from "./groups-operational-detail";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type LooseResult = {
  data: unknown;
  error: { message?: string | null } | null;
  count?: number | null;
};

interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: unknown[]): LooseQuery;
  or(filters: string): LooseQuery;
  ilike(column: string, value: string): LooseQuery;
  gte(column: string, value: unknown): LooseQuery;
  lte(column: string, value: unknown): LooseQuery;
  is(column: string, value: unknown): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(value: number): LooseQuery;
  maybeSingle(): PromiseLike<LooseResult>;
  insert(values: Record<string, unknown>): LooseQuery;
  update(values: Record<string, unknown>): LooseQuery;
  delete(): LooseQuery;
}

type LooseDb = { from(table: string): LooseQuery };
type LooseRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string | null } | null }>;
};

function db(client: unknown): LooseDb {
  return client as LooseDb;
}

function rpc(client: unknown): LooseRpc {
  return client as LooseRpc;
}

async function requireGroupWriter(context: never, restaurantId: string) {
  const membership = await requireReservationManager(context, restaurantId);
  if (membership.role !== "owner" && membership.role !== "manager") {
    throw new Error("You don't have permission to manage Groups & Blocks.");
  }
  return membership;
}

export interface GroupBlockRead {
  id: string;
  roomTypeId: string;
  roomTypeName: string | null;
  startDate: string;
  endDate: string;
  allotted: number;
  cutoffDate: string | null;
  status: string;
  nights: ReturnType<typeof nightlyAllotment>;
  totals: ReturnType<typeof allotmentTotals>;
}

export interface GroupRecord {
  id: string;
  confirmationNumber: string;
  name: string;
  code: string | null;
  groupType: string;
  status: GroupStatus;
  companyMasterId: string | null;
  travelAgentMasterId: string | null;
  groupAccountMasterId: string | null;
  leaderGuestId: string | null;
  arrivalDate: string;
  departureDate: string;
  cutoffDate: string | null;
  externalReference: string | null;
  notes: string | null;
  source: string | null;
  marketSegment: string | null;
  ratePlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupListRow extends GroupRecord {
  blockedRooms: number;
  pickedUp: number;
  remaining: number;
  reservationCount: number;
}

type GroupRow = {
  id: string;
  confirmation_number: string;
  name: string;
  code: string | null;
  group_type: string;
  status: GroupStatus;
  company_master_id: string | null;
  travel_agent_master_id: string | null;
  group_account_master_id: string | null;
  leader_guest_id: string | null;
  arrival_date: string;
  departure_date: string;
  cutoff_date: string | null;
  external_reference: string | null;
  notes: string | null;
  source: string | null;
  market_segment: string | null;
  rate_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapGroup(row: GroupRow): GroupRecord {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    name: row.name,
    code: row.code,
    groupType: row.group_type,
    status: row.status,
    companyMasterId: row.company_master_id,
    travelAgentMasterId: row.travel_agent_master_id,
    groupAccountMasterId: row.group_account_master_id,
    leaderGuestId: row.leader_guest_id,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    cutoffDate: row.cutoff_date,
    externalReference: row.external_reference,
    notes: row.notes,
    source: row.source,
    marketSegment: row.market_segment,
    ratePlanId: row.rate_plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function recordHistory(
  client: unknown,
  input: {
    restaurantId: string;
    groupId: string;
    eventType: string;
    actorId: string | null;
    previous?: Record<string, unknown> | null;
    next?: Record<string, unknown> | null;
    notes?: string | null;
  },
) {
  await db(client)
    .from("pms_group_history")
    .insert({
      restaurant_id: input.restaurantId,
      group_id: input.groupId,
      event_type: input.eventType,
      previous_values: input.previous ?? null,
      new_values: input.next ?? null,
      notes: input.notes ?? null,
      actor_membership_id: input.actorId || null,
    });
}

type PickupUnitRow = {
  id: string;
  reservation_id: string;
  arrival_date: string;
  departure_date: string;
  status: string | null;
  pms_group_block_id: string | null;
};

type PickupHeaderRow = {
  id: string;
  arrival_date: string;
  departure_date: string;
  status: string;
  pms_group_block_id: string | null;
};

export async function loadPickupStaysForBlocks(
  client: unknown,
  restaurantId: string,
  blockIds: string[],
): Promise<Map<string, GroupPickupStay[]>> {
  const byBlock = new Map<string, GroupPickupStay[]>();
  for (const blockId of blockIds) byBlock.set(blockId, []);
  if (blockIds.length === 0) return byBlock;

  const unitResult = await db(client)
    .from("hotel_reservation_rooms")
    .select("id, reservation_id, arrival_date, departure_date, status, pms_group_block_id")
    .eq("restaurant_id", restaurantId)
    .in("pms_group_block_id", blockIds);
  if (unitResult.error) throw new Error(unitResult.error.message || "Could not load group pickup.");
  const unitRows = (unitResult.data ?? []) as PickupUnitRow[];

  const headerResult = await db(client)
    .from("hotel_reservations")
    .select("id, arrival_date, departure_date, status, pms_group_block_id")
    .eq("restaurant_id", restaurantId)
    .in("pms_group_block_id", blockIds);
  if (headerResult.error)
    throw new Error(headerResult.error.message || "Could not load group pickup.");
  const headerRows = (headerResult.data ?? []) as PickupHeaderRow[];

  const reservationIds = [
    ...new Set([...unitRows.map((row) => row.reservation_id), ...headerRows.map((row) => row.id)]),
  ];
  const headerById = new Map(headerRows.map((row) => [row.id, row]));
  if (reservationIds.length > 0) {
    const extraHeaders = await db(client)
      .from("hotel_reservations")
      .select("id, arrival_date, departure_date, status, pms_group_block_id")
      .eq("restaurant_id", restaurantId)
      .in("id", reservationIds);
    if (extraHeaders.error)
      throw new Error(extraHeaders.error.message || "Could not load group pickup.");
    for (const row of (extraHeaders.data ?? []) as PickupHeaderRow[]) {
      headerById.set(row.id, row);
    }
  }

  const seenUnits = new Set<string>();
  const pushStay = (blockId: string, stay: GroupPickupStay) => {
    const list = byBlock.get(blockId);
    if (list) list.push(stay);
  };

  for (const unit of unitRows) {
    if (!unit.pms_group_block_id) continue;
    const header = headerById.get(unit.reservation_id);
    pushStay(unit.pms_group_block_id, {
      arrivalDate: unit.arrival_date,
      departureDate: unit.departure_date,
      status: unit.status ?? header?.status ?? "pending",
      reservationId: unit.reservation_id,
      reservationRoomId: unit.id,
    });
    seenUnits.add(unit.id);
  }

  const headerIds = headerRows.map((row) => row.id);
  if (headerIds.length > 0) {
    const fallbackUnits = await db(client)
      .from("hotel_reservation_rooms")
      .select("id, reservation_id, arrival_date, departure_date, status, pms_group_block_id")
      .eq("restaurant_id", restaurantId)
      .in("reservation_id", headerIds);
    if (fallbackUnits.error)
      throw new Error(fallbackUnits.error.message || "Could not load group pickup.");
    const fallbackRows = (fallbackUnits.data ?? []) as PickupUnitRow[];
    const unitsByReservation = new Map<string, PickupUnitRow[]>();
    for (const unit of fallbackRows) {
      const list = unitsByReservation.get(unit.reservation_id) ?? [];
      list.push(unit);
      unitsByReservation.set(unit.reservation_id, list);
    }
    for (const header of headerRows) {
      if (!header.pms_group_block_id) continue;
      const rooms = unitsByReservation.get(header.id) ?? [];
      const unmatched = rooms.filter((unit) => !unit.pms_group_block_id);
      if (unmatched.length > 0) {
        for (const unit of unmatched) {
          if (seenUnits.has(unit.id)) continue;
          pushStay(header.pms_group_block_id, {
            arrivalDate: unit.arrival_date,
            departureDate: unit.departure_date,
            status: unit.status ?? header.status,
            reservationId: header.id,
            reservationRoomId: unit.id,
          });
          seenUnits.add(unit.id);
        }
        continue;
      }
      if (rooms.length === 0) {
        pushStay(header.pms_group_block_id, {
          arrivalDate: header.arrival_date,
          departureDate: header.departure_date,
          status: header.status,
          reservationId: header.id,
        });
      }
    }
  }

  return byBlock;
}

export async function loadPickupStays(
  client: unknown,
  restaurantId: string,
  blockId: string,
): Promise<GroupPickupStay[]> {
  const loaded = await loadPickupStaysForBlocks(client, restaurantId, [blockId]);
  return loaded.get(blockId) ?? [];
}

function filterPickupStays(
  stays: GroupPickupStay[],
  exclude?: { reservationId?: string | null; reservationRoomIds?: string[] },
): GroupPickupStay[] {
  const roomIds = new Set(exclude?.reservationRoomIds ?? []);
  return stays.filter((stay) => {
    if (
      exclude?.reservationId &&
      stay.reservationId === exclude.reservationId &&
      !stay.reservationRoomId
    ) {
      return false;
    }
    if (stay.reservationRoomId && roomIds.has(stay.reservationRoomId)) return false;
    return true;
  });
}

type LoadedGroupBlock = {
  id: string;
  groupId: string;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  allotted: number;
  status: string;
};

async function loadGroupBlock(
  client: unknown,
  restaurantId: string,
  blockId: string,
): Promise<LoadedGroupBlock> {
  const loaded = await db(client)
    .from("pms_group_blocks")
    .select("id, group_id, room_type_id, start_date, end_date, allotted, status")
    .eq("restaurant_id", restaurantId)
    .eq("id", blockId)
    .maybeSingle();
  if (loaded.error) throw new Error(loaded.error.message || "Could not load room block.");
  if (!loaded.data) throw new Error("Room block not found for this property.");
  const block = loaded.data as {
    id: string;
    group_id: string;
    room_type_id: string;
    start_date: string;
    end_date: string;
    allotted: number;
    status: string;
  };
  return {
    id: block.id,
    groupId: block.group_id,
    roomTypeId: block.room_type_id,
    startDate: block.start_date,
    endDate: block.end_date,
    allotted: block.allotted,
    status: block.status,
  };
}

async function remainingForBlock(
  client: unknown,
  restaurantId: string,
  block: { id: string; allotted: number; startDate: string; endDate: string },
): Promise<number> {
  const stays = await loadPickupStays(client, restaurantId, block.id);
  return allotmentTotals(
    nightlyAllotment({
      allotted: block.allotted,
      startDate: block.startDate,
      endDate: block.endDate,
      stays,
    }),
  ).remaining;
}

async function syncBlockInventory(
  client: unknown,
  membershipId: string,
  restaurantId: string,
  block: {
    id: string;
    roomTypeId: string;
    startDate: string;
    endDate: string;
    allotted: number;
    status: string;
    groupId: string;
  },
) {
  const existing = await db(client)
    .from("pms_group_allotment_nights")
    .select("id, night, inventory_block_id")
    .eq("restaurant_id", restaurantId)
    .eq("group_block_id", block.id);
  const existingRows =
    ((await existing).data as Array<{
      id: string;
      night: string;
      inventory_block_id: string | null;
    }> | null) ?? [];

  for (const row of existingRows) {
    if (row.inventory_block_id) {
      await rpc(client).rpc("pms_release_operational_block", {
        _restaurant_id: restaurantId,
        _block_id: row.inventory_block_id,
        _membership_id: membershipId,
        _release_reason: "Groups allotment resync",
      });
    }
  }
  await db(client)
    .from("pms_group_allotment_nights")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("group_block_id", block.id);

  if (block.status !== "active") return;

  const stays = await loadPickupStays(client, restaurantId, block.id);
  const nights = nightlyAllotment({
    allotted: block.allotted,
    startDate: block.startDate,
    endDate: block.endDate,
    stays,
  });

  for (const night of nights) {
    let inventoryBlockId: string | null = null;
    if (night.remaining > 0) {
      const created = await rpc(client).rpc("pms_create_operational_block", {
        _restaurant_id: restaurantId,
        _target_kind: "quantity",
        _room_id: null,
        _room_type_id: block.roomTypeId,
        _quantity: night.remaining,
        _group_id: block.groupId,
        _block_type: "group",
        _start_date: night.night,
        _end_date: addDays(night.night, 1),
        _reason: "Group allotment remaining rooms",
        _notes: block.id,
        _membership_id: membershipId,
      });
      if (created.error) {
        throw new Error(created.error.message || "Could not hold remaining allotment.");
      }
      if (typeof created.data === "string") {
        inventoryBlockId = created.data;
        const activated = await rpc(client).rpc("pms_activate_operational_block", {
          _restaurant_id: restaurantId,
          _block_id: inventoryBlockId,
          _membership_id: membershipId,
        });
        if (activated.error) {
          throw new Error(
            activated.error.message || "Could not activate remaining allotment hold.",
          );
        }
      }
    }
    await db(client).from("pms_group_allotment_nights").insert({
      restaurant_id: restaurantId,
      group_block_id: block.id,
      night: night.night,
      allotted: night.allotted,
      inventory_block_id: inventoryBlockId,
    });
  }
}

const GROUP_SELECT =
  "id, confirmation_number, name, code, group_type, status, company_master_id, travel_agent_master_id, group_account_master_id, leader_guest_id, arrival_date, departure_date, cutoff_date, external_reference, notes, source, market_segment, rate_plan_id, created_at, updated_at";

export type GroupUnitPickupInput = {
  roomTypeId: string;
  blockId: string | null;
  proposed: GroupPickupStay;
};

async function assertGroupExists(client: unknown, restaurantId: string, groupId: string) {
  const group = await db(client)
    .from("pms_groups")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("id", groupId)
    .maybeSingle();
  if (group.error) throw new Error(group.error.message || "Could not load group.");
  if (!group.data) throw new Error("Group not found for this property.");
}

export async function assertGroupUnitsPickup(
  client: unknown,
  input: {
    restaurantId: string;
    pmsGroupId: string | null;
    units: GroupUnitPickupInput[];
    excludeReservationId?: string | null;
    excludeReservationRoomIds?: string[];
  },
): Promise<{ groupId: string; blockId: string | null; unitBlockIds: Array<string | null> }> {
  if (input.units.length === 0) throw new Error("Group or room block is required.");

  const unitBlockIds = input.units.map((unit) => unit.blockId);
  let groupId = input.pmsGroupId;
  const byBlock = new Map<string, GroupUnitPickupInput[]>();

  for (const unit of input.units) {
    if (!unit.blockId) continue;
    const block = await loadGroupBlock(client, input.restaurantId, unit.blockId);
    if (groupId && groupId !== block.groupId) {
      throw new Error("That room block does not belong to the selected group.");
    }
    if (!groupId) groupId = block.groupId;
    if (block.status !== "active") throw new Error("That room block is not open for pickup.");
    if (block.roomTypeId !== unit.roomTypeId) {
      throw new Error("Stay room type must match the group room block.");
    }
    if (
      unit.proposed.arrivalDate < block.startDate ||
      unit.proposed.departureDate > block.endDate
    ) {
      throw new Error("Stay dates must fall inside the group room block.");
    }
    const list = byBlock.get(block.id) ?? [];
    list.push(unit);
    byBlock.set(block.id, list);
  }

  if (!groupId) throw new Error("Group or room block is required.");
  await assertGroupExists(client, input.restaurantId, groupId);

  for (const [blockId, units] of byBlock) {
    const block = await loadGroupBlock(client, input.restaurantId, blockId);
    const stays = filterPickupStays(await loadPickupStays(client, input.restaurantId, block.id), {
      reservationId: input.excludeReservationId,
      reservationRoomIds: input.excludeReservationRoomIds,
    });
    if (
      !staysFitAllotment({
        allotted: block.allotted,
        startDate: block.startDate,
        endDate: block.endDate,
        stays,
        proposed: units.map((unit) => unit.proposed),
      })
    ) {
      throw new Error("This stay would over-pick the group room block.");
    }
  }

  return {
    groupId,
    blockId: headerGroupBlockIdFromUnits(unitBlockIds),
    unitBlockIds,
  };
}

export async function assertGroupStayPickup(
  client: unknown,
  input: {
    restaurantId: string;
    pmsGroupId: string | null;
    pmsGroupBlockId: string | null;
    roomTypeId: string;
    proposed: GroupPickupStay;
    excludeReservationId?: string | null;
    excludeReservationRoomIds?: string[];
  },
): Promise<{ groupId: string; blockId: string | null }> {
  const result = await assertGroupUnitsPickup(client, {
    restaurantId: input.restaurantId,
    pmsGroupId: input.pmsGroupId,
    excludeReservationId: input.excludeReservationId,
    excludeReservationRoomIds: input.excludeReservationRoomIds,
    units: [
      {
        roomTypeId: input.roomTypeId,
        blockId: input.pmsGroupBlockId,
        proposed: input.proposed,
      },
    ],
  });
  return { groupId: result.groupId, blockId: result.blockId };
}

export async function assertExistingReservationGroupPickup(
  client: unknown,
  input: {
    restaurantId: string;
    reservationId: string;
    overlay?: {
      reservationRoomId?: string | null;
      roomTypeId?: string;
      arrivalDate?: string;
      departureDate?: string;
      status?: string;
    };
  },
) {
  const headerRead = await db(client)
    .from("hotel_reservations")
    .select(
      "id, status, arrival_date, departure_date, room_type_id, pms_group_id, pms_group_block_id",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId)
    .maybeSingle();
  if (headerRead.error) throw new Error(headerRead.error.message || "Could not load reservation.");
  if (!headerRead.data) throw new Error("Reservation not found for this property.");
  const header = headerRead.data as {
    id: string;
    status: string;
    arrival_date: string;
    departure_date: string;
    room_type_id: string;
    pms_group_id: string | null;
    pms_group_block_id: string | null;
  };

  const unitsRead = await db(client)
    .from("hotel_reservation_rooms")
    .select("id, room_type_id, arrival_date, departure_date, status, pms_group_block_id")
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId);
  if (unitsRead.error)
    throw new Error(unitsRead.error.message || "Could not load reservation rooms.");
  const units = (unitsRead.data ?? []) as Array<{
    id: string;
    room_type_id: string;
    arrival_date: string;
    departure_date: string;
    status: string | null;
    pms_group_block_id: string | null;
  }>;

  const overlay = input.overlay;
  const overlayAll = Boolean(overlay && !overlay.reservationRoomId);
  const overlayRoomId = overlay?.reservationRoomId ?? null;
  const excludeRoomIds = overlayRoomId
    ? [overlayRoomId]
    : overlayAll
      ? units.map((unit) => unit.id)
      : [];

  const planned: GroupUnitPickupInput[] =
    units.length > 0
      ? units.map((unit) => {
          const match = overlay && (overlayAll || overlay.reservationRoomId === unit.id);
          return {
            roomTypeId: match && overlay.roomTypeId ? overlay.roomTypeId : unit.room_type_id,
            blockId: unit.pms_group_block_id ?? header.pms_group_block_id,
            proposed: {
              arrivalDate: match && overlay.arrivalDate ? overlay.arrivalDate : unit.arrival_date,
              departureDate:
                match && overlay.departureDate ? overlay.departureDate : unit.departure_date,
              status: match
                ? (overlay.status ?? unit.status ?? header.status)
                : (unit.status ?? header.status),
              reservationId: header.id,
              reservationRoomId: unit.id,
            },
          };
        })
      : [
          {
            roomTypeId: overlay?.roomTypeId ?? header.room_type_id,
            blockId: header.pms_group_block_id,
            proposed: {
              arrivalDate: overlay?.arrivalDate ?? header.arrival_date,
              departureDate: overlay?.departureDate ?? header.departure_date,
              status: overlay?.status ?? header.status,
              reservationId: header.id,
            },
          },
        ];

  const linked = planned.filter((unit) => unit.blockId);
  if (linked.length === 0) {
    if (header.pms_group_id)
      await assertGroupExists(client, input.restaurantId, header.pms_group_id);
    return;
  }

  await assertGroupUnitsPickup(client, {
    restaurantId: input.restaurantId,
    pmsGroupId: header.pms_group_id,
    units: linked,
    excludeReservationId: units.length === 0 ? input.reservationId : null,
    excludeReservationRoomIds: excludeRoomIds,
  });
}

export async function collectReservationGroupBlockIds(
  client: unknown,
  restaurantId: string,
  reservationId: string,
): Promise<{ groupId: string | null; blockIds: string[] }> {
  const headerRead = await db(client)
    .from("hotel_reservations")
    .select("pms_group_id, pms_group_block_id")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (headerRead.error) throw new Error(headerRead.error.message || "Could not load reservation.");
  const header = (headerRead.data ?? null) as {
    pms_group_id: string | null;
    pms_group_block_id: string | null;
  } | null;
  const unitsRead = await db(client)
    .from("hotel_reservation_rooms")
    .select("pms_group_block_id")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId);
  if (unitsRead.error)
    throw new Error(unitsRead.error.message || "Could not load reservation rooms.");
  const unitBlocks = ((unitsRead.data ?? []) as Array<{ pms_group_block_id: string | null }>)
    .map((row) => row.pms_group_block_id)
    .filter((id): id is string => Boolean(id));
  const blockIds = [
    ...new Set(
      [header?.pms_group_block_id, ...unitBlocks].filter((id): id is string => Boolean(id)),
    ),
  ];
  return { groupId: header?.pms_group_id ?? null, blockIds };
}

export async function resyncGroupBlockInventoryForReservation(
  client: unknown,
  membershipId: string | null,
  restaurantId: string,
  reservationId: string,
) {
  const { blockIds } = await collectReservationGroupBlockIds(client, restaurantId, reservationId);
  if (blockIds.length === 0) return;
  const actorId = membershipId;

  for (const blockId of blockIds) {
    const block = await loadGroupBlock(client, restaurantId, blockId);
    const beforeRemaining = await remainingForBlock(client, restaurantId, block);
    await syncBlockInventory(client, actorId ?? "", restaurantId, {
      id: block.id,
      roomTypeId: block.roomTypeId,
      startDate: block.startDate,
      endDate: block.endDate,
      allotted: block.allotted,
      status: block.status,
      groupId: block.groupId,
    });
    const afterRemaining = await remainingForBlock(client, restaurantId, block);
    await recordHistory(client, {
      restaurantId,
      groupId: block.groupId,
      eventType: "inventory_resync",
      actorId,
      previous: { remaining: beforeRemaining },
      next: { remaining: afterRemaining, reservationId, blockId: block.id },
      notes: "Linked stay pickup resync.",
    });
  }
}

export async function attachReservationToGroup(
  client: unknown,
  membershipId: string,
  input: {
    restaurantId: string;
    reservationId: string;
    groupId: string;
    blockId: string | null;
    unitBlockIds?: Array<{
      reservationRoomId?: string;
      unitSequence?: number;
      blockId: string | null;
    }>;
  },
) {
  const roomsRead = await db(client)
    .from("hotel_reservation_rooms")
    .select("id, unit_sequence")
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .order("unit_sequence", { ascending: true });
  if (roomsRead.error)
    throw new Error(roomsRead.error.message || "Could not load reservation rooms.");
  const rooms = (roomsRead.data ?? []) as Array<{ id: string; unit_sequence: number }>;
  const assigned = rooms.map((room) => {
    const mapped =
      input.unitBlockIds?.find((row) => row.reservationRoomId === room.id) ??
      input.unitBlockIds?.find((row) => row.unitSequence === room.unit_sequence);
    return { id: room.id, blockId: mapped?.blockId ?? input.blockId };
  });
  const headerBlockId =
    headerGroupBlockIdFromUnits(assigned.map((row) => row.blockId)) ?? input.blockId;

  const updated = await db(client)
    .from("hotel_reservations")
    .update({
      pms_group_id: input.groupId,
      pms_group_block_id: headerBlockId,
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId);
  if (updated.error) throw new Error(updated.error.message || "Could not link the group stay.");

  for (const room of assigned) {
    const unitWrite = await db(client)
      .from("hotel_reservation_rooms")
      .update({ pms_group_block_id: room.blockId })
      .eq("restaurant_id", input.restaurantId)
      .eq("id", room.id);
    if (unitWrite.error)
      throw new Error(unitWrite.error.message || "Could not link the group room unit.");
  }

  const distinctBlocks = [
    ...new Set(assigned.map((row) => row.blockId).filter((id): id is string => Boolean(id))),
  ];
  if (headerBlockId && !distinctBlocks.includes(headerBlockId)) distinctBlocks.push(headerBlockId);

  for (const blockId of distinctBlocks) {
    const block = await loadGroupBlock(client, input.restaurantId, blockId);
    await syncBlockInventory(client, membershipId, input.restaurantId, {
      id: block.id,
      roomTypeId: block.roomTypeId,
      startDate: block.startDate,
      endDate: block.endDate,
      allotted: block.allotted,
      status: block.status,
      groupId: input.groupId,
    });
  }

  await recordHistory(client, {
    restaurantId: input.restaurantId,
    groupId: input.groupId,
    eventType: "reservation_linked",
    actorId: membershipId,
    next: {
      reservationId: input.reservationId,
      blockId: headerBlockId,
      unitBlockIds: assigned.map((row) => row.blockId),
    },
  });
}

export async function applyGroupBlockRelease(
  client: unknown,
  membershipId: string,
  input: {
    restaurantId: string;
    groupId: string;
    blockId: string;
    allotted: number;
    notes?: string | null;
  },
) {
  const row = await loadGroupBlock(client, input.restaurantId, input.blockId);
  if (row.groupId !== input.groupId) throw new Error("Room block not found.");
  const nextAllotted = Math.max(input.allotted, 0);
  const nextStatus = nextAllotted === 0 ? "released" : "active";
  const updated = await db(client)
    .from("pms_group_blocks")
    .update({ allotted: nextAllotted, status: nextStatus })
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.blockId);
  if (updated.error) throw new Error(updated.error.message || "Could not release block.");
  await syncBlockInventory(client, membershipId, input.restaurantId, {
    id: row.id,
    roomTypeId: row.roomTypeId,
    startDate: row.startDate,
    endDate: row.endDate,
    allotted: nextAllotted,
    status: nextStatus,
    groupId: input.groupId,
  });
  await recordHistory(client, {
    restaurantId: input.restaurantId,
    groupId: input.groupId,
    eventType: nextStatus === "released" ? "block_released" : "block_amended",
    actorId: membershipId,
    previous: { allotted: row.allotted },
    next: { allotted: nextAllotted, status: nextStatus },
    notes: input.notes ?? "Linked reservations were not cancelled.",
  });
  return { blockId: input.blockId, status: nextStatus, allotted: nextAllotted };
}

export async function releaseGroupBlocksPastCutoff(
  client: unknown,
  membershipId: string,
  restaurantId: string,
  businessDate: string,
) {
  const blocksRead = await db(client)
    .from("pms_group_blocks")
    .select("id, group_id, allotted, cutoff_date, status, start_date, end_date")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active");
  if (blocksRead.error) throw new Error(blocksRead.error.message || "Could not load group blocks.");
  const blocks = (blocksRead.data ?? []) as Array<{
    id: string;
    group_id: string;
    allotted: number;
    cutoff_date: string | null;
    status: string;
    start_date: string;
    end_date: string;
  }>;
  if (blocks.length === 0) return { released: 0 };

  const groupIds = [...new Set(blocks.map((block) => block.group_id))];
  const groupsRead = await db(client)
    .from("pms_groups")
    .select("id, cutoff_date")
    .eq("restaurant_id", restaurantId)
    .in("id", groupIds);
  if (groupsRead.error) throw new Error(groupsRead.error.message || "Could not load groups.");
  const groupCutoff = new Map(
    ((groupsRead.data ?? []) as Array<{ id: string; cutoff_date: string | null }>).map((group) => [
      group.id,
      group.cutoff_date,
    ]),
  );

  let released = 0;
  for (const block of blocks) {
    const cutoff = effectiveGroupBlockCutoff(
      block.cutoff_date,
      groupCutoff.get(block.group_id) ?? null,
    );
    if (!cutoff || cutoff > businessDate) continue;
    const stays = await loadPickupStays(client, restaurantId, block.id);
    const totals = allotmentTotals(
      nightlyAllotment({
        allotted: block.allotted,
        startDate: block.start_date,
        endDate: block.end_date,
        stays,
      }),
    );
    if (totals.remaining <= 0) continue;
    await applyGroupBlockRelease(client, membershipId, {
      restaurantId,
      groupId: block.group_id,
      blockId: block.id,
      allotted: totals.pickedUp,
      notes: `cutoff_auto_release ${businessDate}. Linked reservations were not cancelled.`,
    });
    released += 1;
  }
  return { released };
}

export const listGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        search: z.string().trim().max(120).optional(),
        status: z.enum(GROUP_STATUSES).optional(),
        arrivalFrom: dateSchema.optional(),
        arrivalTo: dateSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    let query = db(context.supabase)
      .from("pms_groups")
      .select(GROUP_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .order("arrival_date", { ascending: true })
      .limit(200);
    if (data.status) query = query.eq("status", data.status);
    if (data.arrivalFrom) query = query.gte("arrival_date", data.arrivalFrom);
    if (data.arrivalTo) query = query.lte("arrival_date", data.arrivalTo);
    if (data.search && data.search.length >= 2) {
      const term = `%${data.search.replaceAll("%", "")}%`;
      query = query.or(
        `name.ilike.${term},confirmation_number.ilike.${term},code.ilike.${term},external_reference.ilike.${term}`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message || "Could not load groups.");
    const groups = ((rows ?? []) as GroupRow[]).map(mapGroup);
    const ids = groups.map((group) => group.id);
    const blockResult =
      ids.length === 0
        ? { data: [], error: null }
        : await db(context.supabase)
            .from("pms_group_blocks")
            .select("id, group_id, allotted, start_date, end_date, status")
            .eq("restaurant_id", data.restaurantId)
            .in("group_id", ids);
    if (blockResult.error) throw new Error(blockResult.error.message || "Could not load blocks.");
    const blocks = (blockResult.data ?? []) as Array<{
      id: string;
      group_id: string;
      allotted: number;
      start_date: string;
      end_date: string;
      status: string;
    }>;
    const pickupByBlock = await loadPickupStaysForBlocks(
      context.supabase,
      data.restaurantId,
      blocks.map((block) => block.id),
    );
    const linkedCount =
      groups.length === 0
        ? { data: [], error: null }
        : await db(context.supabase)
            .from("hotel_reservations")
            .select("id, pms_group_id")
            .eq("restaurant_id", data.restaurantId)
            .in(
              "pms_group_id",
              groups.map((group) => group.id),
            );
    if (linkedCount.error) throw new Error(linkedCount.error.message || "Could not load pickup.");
    const linked = (linkedCount.data ?? []) as Array<{ id: string; pms_group_id: string | null }>;

    const rowsOut: GroupListRow[] = groups.map((group) => {
      const groupBlocks = blocks.filter(
        (block) => block.group_id === group.id && block.status === "active",
      );
      let blockedRooms = 0;
      let pickedUp = 0;
      let remaining = 0;
      for (const block of groupBlocks) {
        const nights = nightlyAllotment({
          allotted: block.allotted,
          startDate: block.start_date,
          endDate: block.end_date,
          stays: pickupByBlock.get(block.id) ?? [],
        });
        const totals = allotmentTotals(nights);
        blockedRooms += totals.allotted;
        pickedUp += totals.pickedUp;
        remaining += totals.remaining;
      }
      return {
        ...group,
        blockedRooms,
        pickedUp,
        remaining,
        reservationCount: linked.filter((stay) => stay.pms_group_id === group.id).length,
      };
    });

    return { groups: rowsOut };
  });

export const getGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const { data: row, error } = await db(context.supabase)
      .from("pms_groups")
      .select(GROUP_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.groupId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Could not load group.");
    if (!row) throw new Error("Group not found for this property.");
    const group = mapGroup(row as GroupRow);

    const [blockResult, roomingResult, historyResult, stayResult, typesResult] = await Promise.all([
      db(context.supabase)
        .from("pms_group_blocks")
        .select("id, room_type_id, start_date, end_date, allotted, cutoff_date, status")
        .eq("restaurant_id", data.restaurantId)
        .eq("group_id", data.groupId),
      db(context.supabase)
        .from("pms_group_rooming_rows")
        .select(
          "id, guest_id, guest_name, arrival_date, departure_date, adults, children, room_type_id, special_requests, reservation_id, status, group_block_id",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("group_id", data.groupId),
      db(context.supabase)
        .from("pms_group_history")
        .select(
          "id, event_type, previous_values, new_values, notes, created_at, actor_membership_id",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("group_id", data.groupId)
        .order("created_at", { ascending: false })
        .limit(50),
      db(context.supabase)
        .from("hotel_reservations")
        .select(
          "id, confirmation_number, guest_id, arrival_date, departure_date, status, room_type_id, pms_group_block_id",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("pms_group_id", data.groupId),
      db(context.supabase)
        .from("room_types")
        .select("id, name")
        .eq("restaurant_id", data.restaurantId),
    ]);

    if (blockResult.error) throw new Error(blockResult.error.message || "Could not load blocks.");
    const typeNames = new Map(
      ((typesResult.data ?? []) as Array<{ id: string; name: string }>).map((type) => [
        type.id,
        type.name,
      ]),
    );
    const stays = (stayResult.data ?? []) as Array<{
      id: string;
      confirmation_number: string;
      arrival_date: string;
      departure_date: string;
      status: string;
      pms_group_block_id: string | null;
    }>;
    const blockRows = (blockResult.data ?? []) as Array<{
      id: string;
      room_type_id: string;
      start_date: string;
      end_date: string;
      allotted: number;
      cutoff_date: string | null;
      status: string;
    }>;
    const pickupByBlock = await loadPickupStaysForBlocks(
      context.supabase,
      data.restaurantId,
      blockRows.map((block) => block.id),
    );
    const blocks: GroupBlockRead[] = blockRows.map((block) => {
      const nights = nightlyAllotment({
        allotted: block.allotted,
        startDate: block.start_date,
        endDate: block.end_date,
        stays: pickupByBlock.get(block.id) ?? [],
      });
      return {
        id: block.id,
        roomTypeId: block.room_type_id,
        roomTypeName: typeNames.get(block.room_type_id) ?? null,
        startDate: block.start_date,
        endDate: block.end_date,
        allotted: block.allotted,
        cutoffDate: block.cutoff_date,
        status: block.status,
        nights,
        totals: allotmentTotals(nights),
      };
    });

    return {
      group,
      blocks,
      rooming: roomingResult.data ?? [],
      history: historyResult.data ?? [],
      reservations: stays,
    };
  });

export interface GroupOperationalDetail {
  group: GroupOperationalIdentity;
  blocks: GroupBlockRead[];
  units: GroupOperationalUnit[];
  generatedAt: string;
  truncated: boolean;
  totalUnits: number;
}

type OperationalHeaderRow = {
  id: string;
  confirmation_number: string;
  guest_id: string | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  room_type_id: string | null;
  pms_group_id: string | null;
  pms_group_block_id: string | null;
};

type OperationalUnitRow = {
  id: string;
  reservation_id: string;
  room_type_id: string | null;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  status: string | null;
  pms_group_block_id: string | null;
};

function mergeOperationalUnits(batches: OperationalUnitRow[][]): OperationalUnitRow[] {
  const seen = new Set<string>();
  const merged: OperationalUnitRow[] = [];
  for (const batch of batches) {
    for (const unit of batch) {
      if (seen.has(unit.id)) continue;
      seen.add(unit.id);
      merged.push(unit);
    }
  }
  return merged;
}

export async function loadGroupOperationalDetail(
  client: unknown,
  restaurantId: string,
  groupId: string,
): Promise<GroupOperationalDetail> {
  const { data: row, error } = await db(client)
    .from("pms_groups")
    .select(GROUP_SELECT)
    .eq("restaurant_id", restaurantId)
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load group.");
  if (!row) throw new Error("Group not found for this property.");
  const groupRecord = mapGroup(row as GroupRow);
  const group: GroupOperationalIdentity = {
    id: groupRecord.id,
    confirmationNumber: groupRecord.confirmationNumber,
    name: groupRecord.name,
    code: groupRecord.code,
  };

  const [blockResult, headerResult, typesResult] = await Promise.all([
    db(client)
      .from("pms_group_blocks")
      .select("id, room_type_id, start_date, end_date, allotted, cutoff_date, status")
      .eq("restaurant_id", restaurantId)
      .eq("group_id", groupId),
    db(client)
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, arrival_date, departure_date, status, room_type_id, pms_group_id, pms_group_block_id",
      )
      .eq("restaurant_id", restaurantId)
      .eq("pms_group_id", groupId),
    db(client).from("room_types").select("id, name").eq("restaurant_id", restaurantId),
  ]);
  if (blockResult.error) throw new Error(blockResult.error.message || "Could not load blocks.");
  if (headerResult.error)
    throw new Error(headerResult.error.message || "Could not load group reservations.");
  if (typesResult.error) throw new Error(typesResult.error.message || "Could not load room types.");

  const blockRows = (blockResult.data ?? []) as Array<{
    id: string;
    room_type_id: string;
    start_date: string;
    end_date: string;
    allotted: number;
    cutoff_date: string | null;
    status: string;
  }>;
  const typeNames = new Map(
    ((typesResult.data ?? []) as Array<{ id: string; name: string }>).map((type) => [
      type.id,
      type.name,
    ]),
  );
  const groupBlockIds = new Set(blockRows.map((block) => block.id));
  const headersById = new Map(
    ((headerResult.data ?? []) as OperationalHeaderRow[]).map((stay) => [stay.id, stay]),
  );

  const unitBatches: OperationalUnitRow[][] = [];
  const headerIds = [...headersById.keys()];
  if (headerIds.length > 0) {
    const unitsByReservation = await db(client)
      .from("hotel_reservation_rooms")
      .select(
        "id, reservation_id, room_type_id, room_id, arrival_date, departure_date, status, pms_group_block_id",
      )
      .eq("restaurant_id", restaurantId)
      .in("reservation_id", headerIds);
    if (unitsByReservation.error)
      throw new Error(unitsByReservation.error.message || "Could not load reservation units.");
    unitBatches.push((unitsByReservation.data ?? []) as OperationalUnitRow[]);
  }
  if (blockRows.length > 0) {
    const unitsByBlock = await db(client)
      .from("hotel_reservation_rooms")
      .select(
        "id, reservation_id, room_type_id, room_id, arrival_date, departure_date, status, pms_group_block_id",
      )
      .eq("restaurant_id", restaurantId)
      .in(
        "pms_group_block_id",
        blockRows.map((block) => block.id),
      );
    if (unitsByBlock.error)
      throw new Error(unitsByBlock.error.message || "Could not load block units.");
    unitBatches.push((unitsByBlock.data ?? []) as OperationalUnitRow[]);
  }

  const allUnits = mergeOperationalUnits(unitBatches);
  const totalUnits = allUnits.length;
  const truncated = totalUnits > GROUP_OPERATIONAL_UNIT_LIMIT;
  const unitRows = truncated ? allUnits.slice(0, GROUP_OPERATIONAL_UNIT_LIMIT) : allUnits;

  const missingHeaderIds = [
    ...new Set(unitRows.map((unit) => unit.reservation_id).filter((id) => !headersById.has(id))),
  ];
  if (missingHeaderIds.length > 0) {
    const extraHeaders = await db(client)
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, arrival_date, departure_date, status, room_type_id, pms_group_id, pms_group_block_id",
      )
      .eq("restaurant_id", restaurantId)
      .in("id", missingHeaderIds);
    if (extraHeaders.error)
      throw new Error(extraHeaders.error.message || "Could not load reservation headers.");
    for (const stay of (extraHeaders.data ?? []) as OperationalHeaderRow[]) {
      headersById.set(stay.id, stay);
    }
  }

  const guestIds = [
    ...new Set(
      [...headersById.values()]
        .map((stay) => stay.guest_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roomIds = [
    ...new Set(unitRows.map((unit) => unit.room_id).filter((id): id is string => Boolean(id))),
  ];
  const [guestResult, roomResult] = await Promise.all([
    guestIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db(client)
          .from("guest_profiles")
          .select("id, first_name, last_name")
          .eq("restaurant_id", restaurantId)
          .in("id", guestIds),
    roomIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db(client)
          .from("hotel_rooms")
          .select("id, room_number")
          .eq("restaurant_id", restaurantId)
          .in("id", roomIds),
  ]);
  if (guestResult.error) throw new Error(guestResult.error.message || "Could not load guests.");
  if (roomResult.error) throw new Error(roomResult.error.message || "Could not load rooms.");
  const guestNames = new Map(
    (
      (guestResult.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>
    ).map((guest) => [guest.id, guestDisplayName(guest.first_name, guest.last_name)]),
  );
  const roomNumbers = new Map(
    ((roomResult.data ?? []) as Array<{ id: string; room_number: string }>).map((room) => [
      room.id,
      room.room_number,
    ]),
  );

  const pickupByBlock = await loadPickupStaysForBlocks(
    client,
    restaurantId,
    blockRows.map((block) => block.id),
  );
  const blocks: GroupBlockRead[] = blockRows.map((block) => {
    const nights = nightlyAllotment({
      allotted: block.allotted,
      startDate: block.start_date,
      endDate: block.end_date,
      stays: pickupByBlock.get(block.id) ?? [],
    });
    return {
      id: block.id,
      roomTypeId: block.room_type_id,
      roomTypeName: typeNames.get(block.room_type_id) ?? null,
      startDate: block.start_date,
      endDate: block.end_date,
      allotted: block.allotted,
      cutoffDate: block.cutoff_date,
      status: block.status,
      nights,
      totals: allotmentTotals(nights),
    };
  });
  const blockLabels = new Map(
    blocks.map((block) => [block.id, block.roomTypeName ?? "Room block"]),
  );

  const units: GroupOperationalUnit[] = [];
  for (const unit of unitRows) {
    const header = headersById.get(unit.reservation_id);
    if (!header) continue;
    units.push(
      mapGroupOperationalUnit({
        unit,
        header,
        groupId,
        groupBlockIds,
        blockLabel: unit.pms_group_block_id
          ? (blockLabels.get(unit.pms_group_block_id) ?? null)
          : null,
        guestName: header.guest_id ? (guestNames.get(header.guest_id) ?? null) : null,
        roomNumber: unit.room_id ? (roomNumbers.get(unit.room_id) ?? null) : null,
        roomTypeName: unit.room_type_id ? (typeNames.get(unit.room_type_id) ?? null) : null,
      }),
    );
  }

  return {
    group,
    blocks,
    units,
    generatedAt: new Date().toISOString(),
    truncated,
    totalUnits,
  };
}

export const getGroupOperationalDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    return loadGroupOperationalDetail(context.supabase, data.restaurantId, data.groupId);
  });

const groupWriteSchema = z.object({
  restaurantId: idSchema,
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(40).nullable().optional(),
  groupType: z.enum(GROUP_TYPES).optional(),
  status: z.enum(GROUP_STATUSES).optional(),
  companyMasterId: idSchema.nullable().optional(),
  travelAgentMasterId: idSchema.nullable().optional(),
  groupAccountMasterId: idSchema.nullable().optional(),
  leaderGuestId: idSchema.nullable().optional(),
  arrivalDate: dateSchema,
  departureDate: dateSchema,
  cutoffDate: dateSchema.nullable().optional(),
  externalReference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(80).nullable().optional(),
  marketSegment: z.string().trim().max(80).nullable().optional(),
  ratePlanId: idSchema.nullable().optional(),
});

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => groupWriteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGroupWriter(context as never, data.restaurantId);
    assertStayDates(data.arrivalDate, data.departureDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counted = await db(supabaseAdmin)
      .from("pms_groups")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId);
    const next = (counted.count ?? 0) + 1;
    const confirmationNumber = `GR-${String(next).padStart(6, "0")}`;
    const inserted = await db(supabaseAdmin)
      .from("pms_groups")
      .insert({
        restaurant_id: data.restaurantId,
        confirmation_number: confirmationNumber,
        name: data.name,
        code: data.code ?? null,
        group_type: data.groupType ?? "leisure",
        status: data.status ?? "tentative",
        company_master_id: data.companyMasterId ?? null,
        travel_agent_master_id: data.travelAgentMasterId ?? null,
        group_account_master_id: data.groupAccountMasterId ?? null,
        leader_guest_id: data.leaderGuestId ?? null,
        arrival_date: data.arrivalDate,
        departure_date: data.departureDate,
        cutoff_date: data.cutoffDate ?? null,
        external_reference: data.externalReference ?? null,
        notes: data.notes ?? null,
        source: data.source ?? null,
        market_segment: data.marketSegment ?? null,
        rate_plan_id: data.ratePlanId ?? null,
        created_by_membership_id: me.id,
      })
      .select(GROUP_SELECT)
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message || "Could not create group.");
    const group = mapGroup(inserted.data as GroupRow);
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      groupId: group.id,
      eventType: "group_created",
      actorId: me.id,
      next: { name: group.name, status: group.status },
    });
    return group;
  });

export const amendGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => groupWriteSchema.extend({ groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGroupWriter(context as never, data.restaurantId);
    assertStayDates(data.arrivalDate, data.departureDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const current = await db(supabaseAdmin)
      .from("pms_groups")
      .select(GROUP_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.groupId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message || "Could not load group.");
    if (!current.data) throw new Error("Group not found for this property.");
    const previous = mapGroup(current.data as GroupRow);
    if (data.status && data.status !== previous.status) {
      if (!isAllowedGroupStatusTransition(previous.status, data.status)) {
        throw new Error("That group status change is not allowed.");
      }
    }
    const updated = await db(supabaseAdmin)
      .from("pms_groups")
      .update({
        name: data.name,
        code: data.code ?? null,
        group_type: data.groupType ?? previous.groupType,
        status: data.status ?? previous.status,
        company_master_id: data.companyMasterId ?? null,
        travel_agent_master_id: data.travelAgentMasterId ?? null,
        group_account_master_id: data.groupAccountMasterId ?? null,
        leader_guest_id: data.leaderGuestId ?? null,
        arrival_date: data.arrivalDate,
        departure_date: data.departureDate,
        cutoff_date: data.cutoffDate ?? null,
        external_reference: data.externalReference ?? null,
        notes: data.notes ?? null,
        source: data.source ?? null,
        market_segment: data.marketSegment ?? null,
        rate_plan_id: data.ratePlanId ?? null,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.groupId)
      .select(GROUP_SELECT)
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message || "Could not update group.");
    const group = mapGroup(updated.data as GroupRow);
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      groupId: group.id,
      eventType: "group_amended",
      actorId: me.id,
      previous: { name: previous.name, status: previous.status, arrival: previous.arrivalDate },
      next: { name: group.name, status: group.status, arrival: group.arrivalDate },
    });
    return group;
  });

export const addGroupBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        roomTypeId: idSchema,
        startDate: dateSchema,
        endDate: dateSchema,
        allotted: z.number().int().min(1).max(500),
        cutoffDate: dateSchema.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGroupWriter(context as never, data.restaurantId);
    assertStayDates(data.startDate, data.endDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inserted = await db(supabaseAdmin)
      .from("pms_group_blocks")
      .insert({
        restaurant_id: data.restaurantId,
        group_id: data.groupId,
        room_type_id: data.roomTypeId,
        start_date: data.startDate,
        end_date: data.endDate,
        allotted: data.allotted,
        cutoff_date: data.cutoffDate ?? null,
        status: "active",
      })
      .select("id, room_type_id, start_date, end_date, allotted, status")
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message || "Could not create room block.");
    const row = inserted.data as {
      id: string;
      room_type_id: string;
      start_date: string;
      end_date: string;
      allotted: number;
      status: string;
    };
    await syncBlockInventory(supabaseAdmin, me.id, data.restaurantId, {
      id: row.id,
      roomTypeId: row.room_type_id,
      startDate: row.start_date,
      endDate: row.end_date,
      allotted: row.allotted,
      status: row.status,
      groupId: data.groupId,
    });
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      groupId: data.groupId,
      eventType: "block_created",
      actorId: me.id,
      next: { blockId: row.id, allotted: row.allotted, roomTypeId: row.room_type_id },
    });
    return { blockId: row.id };
  });

export const releaseGroupBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        blockId: idSchema,
        allotted: z.number().int().min(0).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGroupWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return applyGroupBlockRelease(supabaseAdmin, me.id, {
      restaurantId: data.restaurantId,
      groupId: data.groupId,
      blockId: data.blockId,
      allotted: data.allotted ?? 0,
    });
  });

export const addRoomingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        groupBlockId: idSchema.nullable().optional(),
        guestId: idSchema.nullable().optional(),
        guestName: z.string().trim().min(1).max(200),
        arrivalDate: dateSchema,
        departureDate: dateSchema,
        adults: z.number().int().min(1).max(20),
        children: z.number().int().min(0).max(20),
        roomTypeId: idSchema.nullable().optional(),
        specialRequests: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGroupWriter(context as never, data.restaurantId);
    assertStayDates(data.arrivalDate, data.departureDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inserted = await db(supabaseAdmin)
      .from("pms_group_rooming_rows")
      .insert({
        restaurant_id: data.restaurantId,
        group_id: data.groupId,
        group_block_id: data.groupBlockId ?? null,
        guest_id: data.guestId ?? null,
        guest_name: data.guestName,
        arrival_date: data.arrivalDate,
        departure_date: data.departureDate,
        adults: data.adults,
        children: data.children,
        room_type_id: data.roomTypeId ?? null,
        special_requests: data.specialRequests ?? null,
        status: "draft",
      })
      .select("id")
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message || "Could not add rooming row.");
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      groupId: data.groupId,
      eventType: "rooming_updated",
      actorId: me.id,
      next: { rowId: (inserted.data as { id: string }).id, guestName: data.guestName },
    });
    return { rowId: (inserted.data as { id: string }).id };
  });

export const convertRoomingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema, rowId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGroupWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await db(supabaseAdmin)
      .from("pms_group_rooming_rows")
      .select(
        "id, guest_id, guest_name, arrival_date, departure_date, adults, children, room_type_id, special_requests, group_block_id, reservation_id, status",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.rowId)
      .eq("group_id", data.groupId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load rooming row.");
    if (!loaded.data) throw new Error("Rooming row not found.");
    const row = loaded.data as {
      guest_id: string | null;
      arrival_date: string;
      departure_date: string;
      adults: number;
      children: number;
      room_type_id: string | null;
      special_requests: string | null;
      group_block_id: string | null;
      reservation_id: string | null;
    };
    if (row.reservation_id) return { reservationId: row.reservation_id };
    if (!row.guest_id) throw new Error("Select a guest profile before creating the reservation.");
    if (!row.room_type_id) throw new Error("Select a room type before creating the reservation.");
    const group = await db(supabaseAdmin)
      .from("pms_groups")
      .select("rate_plan_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.groupId)
      .maybeSingle();
    const created = await createReservation({
      data: {
        restaurantId: data.restaurantId,
        guestId: row.guest_id,
        roomTypeId: row.room_type_id,
        roomId: null,
        arrival: row.arrival_date,
        departure: row.departure_date,
        adults: row.adults,
        children: row.children,
        specialRequests: row.special_requests,
        ratePlanId: ((group.data as { rate_plan_id: string | null } | null)?.rate_plan_id ??
          null) as string | null,
        status: "pending",
        pmsGroupId: data.groupId,
        pmsGroupBlockId: row.group_block_id,
      },
    });
    await db(supabaseAdmin)
      .from("pms_group_rooming_rows")
      .update({ reservation_id: created.id, status: "created" })
      .eq("id", data.rowId)
      .eq("restaurant_id", data.restaurantId);
    return { reservationId: created.id, confirmationNumber: created.confirmationNumber };
  });
