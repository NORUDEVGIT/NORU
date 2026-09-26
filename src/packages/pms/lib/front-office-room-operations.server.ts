/**
 * Front Office Phase 1 — Room Quick View / queue / history loaders.
 * Joins existing tables only. No new writers.
 */
import { canManageHousekeeping } from "./housekeeping.server";
import { deriveExceptionRows, isOooOrOos } from "./fo-exceptions";
import { loadFoExceptionFeeds } from "./fo-exceptions.functions";
import {
  activeBlockQueueItem,
  assignedNotReadyQueueItem,
  foRoomActionHints,
  foRoomReadiness,
  historyTouchesRoom,
  isRoomOpsHistoryEvent,
  occupancyOnDate,
  queueFromExceptionRows,
  type FoRoomBlockImpact,
  type FoRoomHistoryRow,
  type FoRoomQuickView,
  type FoRoomStaySnippet,
  type RoomOpsQueueItem,
} from "./front-office-room-operations";
import type { ReservationStatus } from "./reservation-dates";
import type { Membership } from "@/core/lib/workforce.server";

type Db = {
  from: (table: string) => any;
};

type StayRow = {
  id: string;
  confirmation_number: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  guest_profiles: { first_name: string | null; last_name: string | null; vip_status: boolean | null } | null;
  room_types: { name: string } | null;
  hotel_rooms: { room_number: string } | null;
};

const STAY_SELECT =
  "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, status, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, vip_status ), room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )";

function snippet(row: StayRow): FoRoomStaySnippet {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: [row.guest_profiles?.first_name, row.guest_profiles?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    guestVip: row.guest_profiles?.vip_status === true,
    status: row.status as ReservationStatus,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    ratePlanName: null,
  };
}

async function actorNames(supabase: Db, restaurantId: string, membershipIds: Array<string | null>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return names;
  const { data: members } = await supabase.from("restaurant_users").select("id, user_id").eq("restaurant_id", restaurantId).in("id", ids);
  const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];
  const { data: profiles } =
    userIds.length > 0 ? await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds) : { data: [] };
  const byUser = new Map(
    ((profiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Staff",
    ]),
  );
  for (const member of memberRows) names.set(member.id, byUser.get(member.user_id) ?? "Staff");
  return names;
}

export async function loadFrontOfficeRoomQuickView(params: {
  supabase: Db;
  restaurantId: string;
  roomId: string;
  businessDate: string;
  hasDiscrepancy: boolean;
}): Promise<FoRoomQuickView> {
  const { supabase, restaurantId, roomId, businessDate } = params;
  const { data: room, error } = await supabase
    .from("hotel_rooms")
    .select(
      "id, room_number, room_code, floor, building, wing, status, sellable, housekeeping_status, maintenance_status, restriction_reason, restriction_expected_return, room_type_id, room_types!inner ( name, max_occupancy )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!room) throw new Error("Room not found for this property.");

  const roomRow = room as {
    id: string;
    room_number: string;
    room_code: string | null;
    floor: string | null;
    building: string | null;
    wing: string | null;
    status: string;
    sellable: boolean;
    housekeeping_status: string | null;
    maintenance_status: string | null;
    restriction_reason: string | null;
    restriction_expected_return: string | null;
    room_type_id: string;
    room_types: { name: string; max_occupancy: number | null } | null;
  };

  const { data: stayRows } = await supabase
    .from("hotel_reservations")
    .select(STAY_SELECT)
    .eq("restaurant_id", restaurantId)
    .eq("room_id", roomId)
    .in("status", ["pending", "confirmed", "checked_in"])
    .order("arrival_date");

  const stays = (stayRows ?? []) as unknown as StayRow[];
  const currentStay = stays.find((s) => s.status === "checked_in") ?? null;
  const assignedArrival =
    stays.find(
      (s) =>
        (s.status === "pending" || s.status === "confirmed") && occupancyOnDate({ arrivalDate: s.arrival_date, departureDate: s.departure_date, status: s.status }, businessDate),
    ) ?? null;
  const nextStay =
    stays.find((s) => s.arrival_date > businessDate && s.id !== currentStay?.id && s.id !== assignedArrival?.id) ?? null;

  const occupancy: "vacant" | "occupied" = currentStay ? "occupied" : "vacant";
  const readiness = foRoomReadiness({
    physicalStatus: roomRow.status,
    housekeepingStatus: roomRow.housekeeping_status,
    maintenanceStatus: roomRow.maintenance_status,
  });

  const { data: blockRows } = await supabase
    .from("pms_operational_inventory_blocks")
    .select("id, target_kind, block_type, reason, start_date, end_date, group_id, room_id, room_type_id, status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .lte("start_date", businessDate)
    .gt("end_date", businessDate);

  const blocks: FoRoomBlockImpact[] = ((blockRows ?? []) as Array<{
    id: string;
    target_kind: string;
    block_type: string;
    reason: string;
    start_date: string;
    end_date: string;
    group_id: string | null;
    room_id: string | null;
    room_type_id: string;
  }>)
    .filter((b) => b.room_id === roomId || (b.target_kind !== "room" && b.room_type_id === roomRow.room_type_id))
    .map((b) => ({
      id: b.id,
      kind: b.target_kind === "room" ? "room" : b.target_kind === "quantity" ? "quantity" : "room_type",
      blockType: b.block_type,
      reason: b.reason,
      startDate: b.start_date,
      endDate: b.end_date,
      groupId: b.group_id,
    }));

  const recentHistory = await loadFrontOfficeRoomHistory({ supabase, restaurantId, roomId, limit: 8 });
  const current = currentStay ? snippet(currentStay) : null;
  const assigned = assignedArrival ? snippet(assignedArrival) : null;

  return {
    roomId: roomRow.id,
    roomNumber: roomRow.room_number,
    roomCode: roomRow.room_code,
    roomTypeId: roomRow.room_type_id,
    roomTypeName: roomRow.room_types?.name ?? "Room type",
    floor: roomRow.floor,
    building: roomRow.building,
    wing: roomRow.wing,
    maxOccupancy: roomRow.room_types?.max_occupancy ?? null,
    physicalStatus: roomRow.status,
    occupancy,
    sellable: roomRow.sellable,
    housekeepingStatus: roomRow.housekeeping_status,
    maintenanceStatus: roomRow.maintenance_status,
    ready: occupancy === "occupied" ? false : readiness.ready,
    readinessReason: occupancy === "occupied" ? "Room is occupied." : readiness.reason,
    restrictionReason: roomRow.restriction_reason,
    restrictionExpectedReturn: roomRow.restriction_expected_return,
    currentStay: current,
    assignedArrival: assigned,
    nextStay: nextStay ? snippet(nextStay) : null,
    blocks,
    recentHistory,
    actionHints: foRoomActionHints({
      occupancy,
      physicalStatus: roomRow.status,
      ready: occupancy === "occupied" ? false : readiness.ready,
      currentStay: current,
      assignedArrival: assigned,
      unassignedArrival: false,
      blocks,
      hasDiscrepancy: params.hasDiscrepancy,
    }),
  };
}

export async function loadFrontOfficeRoomHistory(params: {
  supabase: Db;
  restaurantId: string;
  roomId: string;
  limit?: number;
}): Promise<FoRoomHistoryRow[]> {
  const { supabase, restaurantId, roomId } = params;
  const limit = params.limit ?? 80;
  const { data: events, error } = await supabase
    .from("hotel_reservation_history")
    .select("id, reservation_id, event_type, created_at, actor_membership_id, previous_values, new_values")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const reservationRows = ((events ?? []) as Array<{
    id: string;
    reservation_id: string;
    event_type: string;
    created_at: string;
    actor_membership_id: string | null;
    previous_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
  }>).filter(
    (row) => isRoomOpsHistoryEvent(row.event_type) && historyTouchesRoom(roomId, row.previous_values, row.new_values),
  );

  const names = await actorNames(
    supabase,
    restaurantId,
    reservationRows.map((r) => r.actor_membership_id),
  );
  const reservationIds = [...new Set(reservationRows.map((r) => r.reservation_id))];
  const meta = new Map<string, string>();
  if (reservationIds.length > 0) {
    const { data: reservations } = await supabase
      .from("hotel_reservations")
      .select("id, confirmation_number")
      .eq("restaurant_id", restaurantId)
      .in("id", reservationIds);
    for (const r of (reservations ?? []) as Array<{ id: string; confirmation_number: string }>) {
      meta.set(r.id, r.confirmation_number);
    }
  }

  const history: FoRoomHistoryRow[] = reservationRows.slice(0, limit).map((row) => ({
    id: row.id,
    source: "reservation",
    eventType: row.event_type,
    createdAt: row.created_at,
    actorName: row.actor_membership_id ? (names.get(row.actor_membership_id) ?? null) : null,
    reservationId: row.reservation_id,
    confirmationNumber: meta.get(row.reservation_id) ?? null,
    summary: row.event_type.replaceAll("_", " "),
  }));

  const { data: hkRows, error: hkError } = await supabase
    .from("housekeeping_history")
    .select("id, event_type, created_at, actor_membership_id, notes")
    .eq("restaurant_id", restaurantId)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!hkError) {
    const hkNames = await actorNames(
      supabase,
      restaurantId,
      ((hkRows ?? []) as Array<{ actor_membership_id: string | null }>).map((r) => r.actor_membership_id),
    );
    for (const row of (hkRows ?? []) as Array<{
      id: string;
      event_type: string;
      created_at: string;
      actor_membership_id: string | null;
      notes: string | null;
    }>) {
      history.push({
        id: row.id,
        source: "housekeeping",
        eventType: row.event_type,
        createdAt: row.created_at,
        actorName: row.actor_membership_id ? (hkNames.get(row.actor_membership_id) ?? null) : null,
        reservationId: null,
        confirmationNumber: null,
        summary: row.notes?.trim() || row.event_type.replaceAll("_", " "),
      });
    }
  }

  return history.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

export async function loadFrontOfficeRoomOpsQueue(params: {
  supabase: Db;
  context: Parameters<typeof loadFoExceptionFeeds>[0]["context"];
  membership: Membership;
  restaurantId: string;
  businessDate: string;
}): Promise<RoomOpsQueueItem[]> {
  const { supabase, restaurantId, businessDate, membership, context } = params;
  const feeds = await loadFoExceptionFeeds({
    context,
    restaurantId,
    businessDate,
    canResolveDiscrepancy: canManageHousekeeping(membership.role),
  });

  const [{ data: arrivalRows }, { data: inHouseRows }, { data: depRows }, { data: roomRows }] = await Promise.all([
    supabase
      .from("hotel_reservations")
      .select(STAY_SELECT)
      .eq("restaurant_id", restaurantId)
      .eq("arrival_date", businessDate)
      .in("status", ["pending", "confirmed"]),
    supabase.from("hotel_reservations").select(STAY_SELECT).eq("restaurant_id", restaurantId).eq("status", "checked_in"),
    supabase
      .from("hotel_reservations")
      .select(STAY_SELECT)
      .eq("restaurant_id", restaurantId)
      .eq("departure_date", businessDate)
      .in("status", ["checked_in", "confirmed"]),
    supabase.from("hotel_rooms").select("id, status, room_number, room_type_id, housekeeping_status, maintenance_status, room_types!inner ( name )").eq("restaurant_id", restaurantId).eq("active", true),
  ]);

  const toStayLike = (row: StayRow) => ({
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestName: snippet(row).guestName,
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    status: row.status,
    overstay: row.status === "checked_in" && row.departure_date < businessDate,
  });

  const rooms = ((roomRows ?? []) as Array<{
    id: string;
    status: string;
    room_number: string;
    room_type_id: string;
    housekeeping_status: string | null;
    maintenance_status: string | null;
    room_types: { name: string } | null;
  }>).map((r) => ({
    id: r.id,
    status: r.status,
    roomTypeId: r.room_type_id,
    roomTypeName: r.room_types?.name,
    roomNumber: r.room_number,
    housekeepingStatus: r.housekeeping_status,
    maintenanceStatus: r.maintenance_status,
  }));

  const derived = deriveExceptionRows({
    arrivals: ((arrivalRows ?? []) as unknown as StayRow[]).map(toStayLike),
    inHouse: ((inHouseRows ?? []) as unknown as StayRow[]).map(toStayLike),
    departures: ((depRows ?? []) as unknown as StayRow[]).map(toStayLike),
    rooms,
    folioLane: "coming_soon",
    businessDate,
    overbookingLane: feeds.overbookingLane,
    discrepancyLane: feeds.discrepancyLane,
    demandStays: feeds.demandStays,
    discrepancies: feeds.discrepancies,
    canResolveDiscrepancy: feeds.canResolveDiscrepancy,
  });

  const items = queueFromExceptionRows(derived.rows);
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  for (const stay of ((arrivalRows ?? []) as unknown as StayRow[])) {
    if (!stay.room_id) continue;
    const room = roomById.get(stay.room_id);
    if (!room) continue;
    const readiness = foRoomReadiness({
      physicalStatus: room.status,
      housekeepingStatus: room.housekeepingStatus,
      maintenanceStatus: room.maintenanceStatus,
    });
    if (readiness.ready) continue;
    if (isOooOrOos(room.status)) continue;
    items.push(
      assignedNotReadyQueueItem({
        stayId: stay.id,
        guestName: snippet(stay).guestName,
        confirmationNumber: stay.confirmation_number,
        roomId: stay.room_id,
        roomNumber: room.roomNumber,
        reason: readiness.reason ?? "Assigned room is not ready.",
      }),
    );
  }

  const { data: blockRows } = await supabase
    .from("pms_operational_inventory_blocks")
    .select("id, target_kind, block_type, reason, start_date, end_date, group_id, room_id, room_type_id, status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .eq("target_kind", "room")
    .lte("start_date", businessDate)
    .gt("end_date", businessDate)
    .not("room_id", "is", null);

  for (const b of (blockRows ?? []) as Array<{
    id: string;
    block_type: string;
    reason: string;
    start_date: string;
    end_date: string;
    group_id: string | null;
    room_id: string;
    target_kind: string;
  }>) {
    const room = roomById.get(b.room_id);
    items.push(
      activeBlockQueueItem(
        {
          id: b.id,
          kind: "room",
          blockType: b.block_type,
          reason: b.reason,
          startDate: b.start_date,
          endDate: b.end_date,
          groupId: b.group_id,
        },
        room?.roomNumber ?? null,
        b.room_id,
      ),
    );
  }

  return items;
}
