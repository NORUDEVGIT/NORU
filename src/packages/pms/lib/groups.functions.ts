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
  isAllowedGroupStatusTransition,
  nightlyAllotment,
  stayFitsAllotment,
  type GroupPickupStay,
  type GroupStatus,
} from "./groups";

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
    actorId: string;
    previous?: Record<string, unknown> | null;
    next?: Record<string, unknown> | null;
    notes?: string | null;
  },
) {
  await db(client).from("pms_group_history").insert({
    restaurant_id: input.restaurantId,
    group_id: input.groupId,
    event_type: input.eventType,
    previous_values: input.previous ?? null,
    new_values: input.next ?? null,
    notes: input.notes ?? null,
    actor_membership_id: input.actorId,
  });
}

export async function loadPickupStays(
  client: unknown,
  restaurantId: string,
  blockId: string,
): Promise<GroupPickupStay[]> {
  const { data, error } = await db(client)
    .from("hotel_reservations")
    .select("arrival_date, departure_date, status")
    .eq("restaurant_id", restaurantId)
    .eq("pms_group_block_id", blockId);
  if (error) throw new Error(error.message || "Could not load group pickup.");
  return ((data ?? []) as Array<{ arrival_date: string; departure_date: string; status: string }>).map(
    (row) => ({
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: row.status,
    }),
  );
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
          throw new Error(activated.error.message || "Could not activate remaining allotment hold.");
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

export async function assertGroupStayPickup(
  client: unknown,
  input: {
    restaurantId: string;
    pmsGroupId: string | null;
    pmsGroupBlockId: string | null;
    roomTypeId: string;
    proposed: GroupPickupStay;
  },
): Promise<{ groupId: string; blockId: string | null }> {
  if (input.pmsGroupBlockId) {
    const loaded = await db(client)
      .from("pms_group_blocks")
      .select("id, group_id, room_type_id, start_date, end_date, allotted, status")
      .eq("restaurant_id", input.restaurantId)
      .eq("id", input.pmsGroupBlockId)
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
    if (input.pmsGroupId && input.pmsGroupId !== block.group_id) {
      throw new Error("That room block does not belong to the selected group.");
    }
    if (block.status !== "active") throw new Error("That room block is not open for pickup.");
    if (block.room_type_id !== input.roomTypeId) {
      throw new Error("Stay room type must match the group room block.");
    }
    if (input.proposed.arrivalDate < block.start_date || input.proposed.departureDate > block.end_date) {
      throw new Error("Stay dates must fall inside the group room block.");
    }
    const stays = await loadPickupStays(client, input.restaurantId, block.id);
    if (
      !stayFitsAllotment({
        allotted: block.allotted,
        startDate: block.start_date,
        endDate: block.end_date,
        stays,
        proposed: input.proposed,
      })
    ) {
      throw new Error("This stay would over-pick the group room block.");
    }
    return { groupId: block.group_id, blockId: block.id };
  }

  if (!input.pmsGroupId) throw new Error("Group or room block is required.");
  const group = await db(client)
    .from("pms_groups")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.pmsGroupId)
    .maybeSingle();
  if (group.error) throw new Error(group.error.message || "Could not load group.");
  if (!group.data) throw new Error("Group not found for this property.");
  return { groupId: input.pmsGroupId, blockId: null };
}

export async function attachReservationToGroup(
  client: unknown,
  membershipId: string,
  input: {
    restaurantId: string;
    reservationId: string;
    groupId: string;
    blockId: string | null;
  },
) {
  const updated = await db(client)
    .from("hotel_reservations")
    .update({
      pms_group_id: input.groupId,
      pms_group_block_id: input.blockId,
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId);
  if (updated.error) throw new Error(updated.error.message || "Could not link the group stay.");

  if (input.blockId) {
    const block = await db(client)
      .from("pms_group_blocks")
      .select("id, room_type_id, start_date, end_date, allotted, status")
      .eq("restaurant_id", input.restaurantId)
      .eq("id", input.blockId)
      .maybeSingle();
    const row = block.data as {
      id: string;
      room_type_id: string;
      start_date: string;
      end_date: string;
      allotted: number;
      status: string;
    } | null;
    if (row) {
      await syncBlockInventory(client, membershipId, input.restaurantId, {
        id: row.id,
        roomTypeId: row.room_type_id,
        startDate: row.start_date,
        endDate: row.end_date,
        allotted: row.allotted,
        status: row.status,
        groupId: input.groupId,
      });
    }
  }

  await recordHistory(client, {
    restaurantId: input.restaurantId,
    groupId: input.groupId,
    eventType: "reservation_linked",
    actorId: membershipId,
    next: { reservationId: input.reservationId, blockId: input.blockId },
  });
}

export const listGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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
    const stayResult =
      blocks.length === 0
        ? { data: [], error: null }
        : await db(context.supabase)
            .from("hotel_reservations")
            .select("pms_group_id, pms_group_block_id, arrival_date, departure_date, status")
            .eq("restaurant_id", data.restaurantId)
            .in(
              "pms_group_block_id",
              blocks.map((block) => block.id),
            );
    if (stayResult.error) throw new Error(stayResult.error.message || "Could not load pickup.");
    const stays = (stayResult.data ?? []) as Array<{
      pms_group_id: string | null;
      pms_group_block_id: string | null;
      arrival_date: string;
      departure_date: string;
      status: string;
    }>;

    const rowsOut: GroupListRow[] = groups.map((group) => {
      const groupBlocks = blocks.filter((block) => block.group_id === group.id && block.status === "active");
      let blockedRooms = 0;
      let pickedUp = 0;
      let remaining = 0;
      for (const block of groupBlocks) {
        const nights = nightlyAllotment({
          allotted: block.allotted,
          startDate: block.start_date,
          endDate: block.end_date,
          stays: stays
            .filter((stay) => stay.pms_group_block_id === block.id)
            .map((stay) => ({
              arrivalDate: stay.arrival_date,
              departureDate: stay.departure_date,
              status: stay.status,
            })),
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
        reservationCount: stays.filter((stay) => stay.pms_group_id === group.id).length,
      };
    });

    return { groups: rowsOut };
  });

export const getGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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
        .select("id, event_type, previous_values, new_values, notes, created_at, actor_membership_id")
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
      ((typesResult.data ?? []) as Array<{ id: string; name: string }>).map((type) => [type.id, type.name]),
    );
    const stays = (stayResult.data ?? []) as Array<{
      id: string;
      confirmation_number: string;
      arrival_date: string;
      departure_date: string;
      status: string;
      pms_group_block_id: string | null;
    }>;
    const blocks: GroupBlockRead[] = (
      (blockResult.data ?? []) as Array<{
        id: string;
        room_type_id: string;
        start_date: string;
        end_date: string;
        allotted: number;
        cutoff_date: string | null;
        status: string;
      }>
    ).map((block) => {
      const nights = nightlyAllotment({
        allotted: block.allotted,
        startDate: block.start_date,
        endDate: block.end_date,
        stays: stays
          .filter((stay) => stay.pms_group_block_id === block.id)
          .map((stay) => ({
            arrivalDate: stay.arrival_date,
            departureDate: stay.departure_date,
            status: stay.status,
          })),
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
  .inputValidator((input: unknown) => groupWriteSchema.parse(input))
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
  .inputValidator((input: unknown) => groupWriteSchema.extend({ groupId: idSchema }).parse(input))
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
  .inputValidator((input: unknown) =>
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
  .inputValidator((input: unknown) =>
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
    const current = await db(supabaseAdmin)
      .from("pms_group_blocks")
      .select("id, room_type_id, start_date, end_date, allotted, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.blockId)
      .eq("group_id", data.groupId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message || "Could not load block.");
    if (!current.data) throw new Error("Room block not found.");
    const row = current.data as {
      id: string;
      room_type_id: string;
      start_date: string;
      end_date: string;
      allotted: number;
      status: string;
    };
    const nextAllotted = data.allotted ?? 0;
    const nextStatus = nextAllotted === 0 ? "released" : "active";
    const updated = await db(supabaseAdmin)
      .from("pms_group_blocks")
      .update({ allotted: Math.max(nextAllotted, 0), status: nextStatus })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.blockId);
    if (updated.error) throw new Error(updated.error.message || "Could not release block.");
    await syncBlockInventory(supabaseAdmin, me.id, data.restaurantId, {
      id: row.id,
      roomTypeId: row.room_type_id,
      startDate: row.start_date,
      endDate: row.end_date,
      allotted: nextAllotted,
      status: nextStatus,
      groupId: data.groupId,
    });
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      groupId: data.groupId,
      eventType: nextStatus === "released" ? "block_released" : "block_amended",
      actorId: me.id,
      previous: { allotted: row.allotted },
      next: { allotted: nextAllotted, status: nextStatus },
      notes: "Linked reservations were not cancelled.",
    });
    return { blockId: data.blockId, status: nextStatus };
  });

export const addRoomingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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
  .inputValidator((input: unknown) =>
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
        ratePlanId: ((group.data as { rate_plan_id: string | null } | null)?.rate_plan_id ?? null) as
          | string
          | null,
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
