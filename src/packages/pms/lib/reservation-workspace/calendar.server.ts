import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPermissionDeniedMessage, stayOverlapsRange } from "../front-office-shell";
import { getRoomTypeAvailabilityCompat } from "../room-inventory-compat";
import { addDays } from "../reservation-dates";
import {
  nightsBetween,
  requireReservationManager,
  RESERVATION_STATUSES,
  type ReservationStatus,
} from "../reservations.server";
import { resolvePropertyBusinessDate } from "./business-date";
import {
  OPERATIONAL_RESERVATION_SELECT,
  toReservationOperationalSummary,
  type OperationalReservationRow,
} from "./search.server";
import {
  CALENDAR_AVAILABILITY_TYPE_CAP,
  CALENDAR_BAR_STATUSES,
  CALENDAR_BLOCK_CAP,
  CALENDAR_MODES,
  CALENDAR_RESERVATION_CAP,
  type CalendarBar,
  type CalendarBarExceptionKey,
  type CalendarBlock,
  type CalendarHorizon,
  type CalendarRead,
  type CalendarRoom,
  type CalendarRoomType,
  type CalendarWarningKey,
  type ReservationOperationalSummary,
} from "./shared-read-models";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const locationSchema = z.string().trim().min(1).max(80);

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

export const calendarReadInputSchema = z
  .object({
    restaurantId: idSchema,
    rangeStart: dateSchema.optional(),
    rangeEnd: dateSchema.optional(),
    horizon: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)]),
    mode: z.enum(CALENDAR_MODES),
    building: locationSchema.optional(),
    floor: locationSchema.optional(),
    wing: locationSchema.optional(),
    roomTypeId: idSchema.optional(),
    statuses: z
      .array(z.enum(RESERVATION_STATUSES))
      .min(1)
      .max(RESERVATION_STATUSES.length)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rangeStart && value.rangeEnd) {
      if (value.rangeEnd <= value.rangeStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rangeEnd must be after rangeStart.",
          path: ["rangeEnd"],
        });
      } else if (nightsBetween(value.rangeStart, value.rangeEnd) !== value.horizon) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rangeEnd must equal rangeStart plus the horizon (exclusive).",
          path: ["rangeEnd"],
        });
      }
    }
  });

export type CalendarReadInput = z.infer<typeof calendarReadInputSchema>;

export function resolveCalendarWindow(input: {
  rangeStart?: string;
  rangeEnd?: string;
  horizon: CalendarHorizon;
  businessDate: string;
}): { start: string; end: string; horizon: CalendarHorizon } {
  const start = input.rangeStart ?? input.businessDate;
  const end = addDays(start, input.horizon);
  if (input.rangeEnd && input.rangeEnd !== end) {
    throw new Error("rangeEnd must equal rangeStart plus the horizon (exclusive).");
  }
  return { start, end, horizon: input.horizon };
}

/** Stay occupies [arrival, departure). Window is [start, end). */
export function stayOverlapsCalendarWindow(
  arrivalDate: string,
  departureDate: string,
  rangeStart: string,
  horizon: CalendarHorizon,
): boolean {
  return stayOverlapsRange(arrivalDate, departureDate, rangeStart, horizon);
}

export function mapCalendarBar(
  row: ReservationOperationalSummary,
  extraKeys: CalendarBarExceptionKey[] = [],
): CalendarBar {
  const keys: CalendarBarExceptionKey[] = [];
  if ((row.status === "pending" || row.status === "confirmed") && row.roomId === null) {
    keys.push("unassigned");
  }
  keys.push(...extraKeys);
  return {
    reservationId: row.reservationId,
    confirmationNumber: row.confirmationNumber,
    guestId: row.guestId,
    guestName: row.guestName,
    guestVip: row.guestVip,
    status: row.status,
    roomTypeId: row.roomTypeId,
    roomId: row.roomId,
    arrivalDate: row.arrivalDate,
    departureDate: row.departureDate,
    adults: row.adults,
    children: row.children,
    updatedAt: row.updatedAt,
    source: row.source,
    ratePlanName: row.ratePlanName,
    exceptionKeys: keys,
  };
}

export function assignmentOverlapIds(bars: CalendarBar[]): Set<string> {
  const byRoom = new Map<string, CalendarBar[]>();
  for (const bar of bars) {
    if (!bar.roomId) continue;
    const list = byRoom.get(bar.roomId) ?? [];
    list.push(bar);
    byRoom.set(bar.roomId, list);
  }
  const overlapping = new Set<string>();
  for (const group of byRoom.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (a.arrivalDate < b.departureDate && b.arrivalDate < a.departureDate) {
          overlapping.add(a.reservationId);
          overlapping.add(b.reservationId);
        }
      }
    }
  }
  return overlapping;
}

function defaultStatuses(requested?: ReservationStatus[]): ReservationStatus[] {
  if (!requested) return [...CALENDAR_BAR_STATUSES];
  return requested;
}

async function loadCalendarRooms(
  supabase: WorkspaceClient,
  restaurantId: string,
  filters: { building?: string; floor?: string; wing?: string; roomTypeId?: string },
): Promise<CalendarRoom[]> {
  let query = supabase
    .from("hotel_rooms")
    .select(
      "id, room_number, room_type_id, building, floor, wing, status, housekeeping_status, sellable, active, room_types!inner ( name )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("room_number");
  if (filters.building) query = query.eq("building", filters.building);
  if (filters.floor) query = query.eq("floor", filters.floor);
  if (filters.wing) query = query.eq("wing", filters.wing);
  if (filters.roomTypeId) query = query.eq("room_type_id", filters.roomTypeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as Array<{
      id: string;
      room_number: string;
      room_type_id: string;
      building: string | null;
      floor: string | null;
      wing: string | null;
      status: string;
      housekeeping_status: string;
      sellable: boolean;
      room_types: { name: string } | { name: string }[] | null;
    }>
  ).map((row) => {
    const type = Array.isArray(row.room_types) ? row.room_types[0] : row.room_types;
    return {
      roomId: row.id,
      roomNumber: row.room_number,
      roomTypeId: row.room_type_id,
      roomTypeName: type?.name ?? "Room type",
      building: row.building,
      floor: row.floor,
      wing: row.wing,
      operationalStatus: row.status,
      housekeepingStatus: row.housekeeping_status,
      occupiedNow: false,
      sellable: row.sellable,
    };
  });
}

async function loadCalendarRoomTypes(
  supabase: WorkspaceClient,
  restaurantId: string,
  roomTypeId?: string,
): Promise<Array<{ id: string; name: string }>> {
  let query = supabase
    .from("room_types")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (roomTypeId) query = query.eq("id", roomTypeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

async function loadOverlapReservations(
  supabase: WorkspaceClient,
  restaurantId: string,
  rangeStart: string,
  rangeEnd: string,
  statuses: ReservationStatus[],
  roomTypeId?: string,
): Promise<{ rows: ReservationOperationalSummary[]; truncated: boolean }> {
  let query = supabase
    .from("hotel_reservations")
    .select(OPERATIONAL_RESERVATION_SELECT)
    .eq("restaurant_id", restaurantId)
    .in("status", statuses)
    .gt("departure_date", rangeStart)
    .lt("arrival_date", rangeEnd)
    .order("arrival_date")
    .order("id")
    .limit(CALENDAR_RESERVATION_CAP + 1);
  if (roomTypeId) query = query.eq("room_type_id", roomTypeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const raw = (data ?? []) as unknown as OperationalReservationRow[];
  const truncated = raw.length > CALENDAR_RESERVATION_CAP;
  return {
    rows: raw.slice(0, CALENDAR_RESERVATION_CAP).map(toReservationOperationalSummary),
    truncated,
  };
}

async function loadCalendarBlocks(
  supabase: WorkspaceClient,
  restaurantId: string,
  rangeStart: string,
  rangeEnd: string,
  roomTypeId?: string,
): Promise<{ blocks: CalendarBlock[]; truncated: boolean; unavailable: boolean }> {
  try {
    let query = supabase
      .from("pms_operational_inventory_blocks")
      .select(
        "id, target_kind, room_id, room_type_id, start_date, end_date, block_type, status, reason",
      )
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .gt("end_date", rangeStart)
      .lt("start_date", rangeEnd)
      .order("start_date")
      .limit(CALENDAR_BLOCK_CAP + 1);
    if (roomTypeId) query = query.eq("room_type_id", roomTypeId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const raw = (data ?? []) as Array<{
      id: string;
      target_kind: "room" | "room_type";
      room_id: string | null;
      room_type_id: string;
      start_date: string;
      end_date: string;
      block_type: string;
      status: string;
      reason: string;
    }>;
    const truncated = raw.length > CALENDAR_BLOCK_CAP;
    return {
      blocks: raw.slice(0, CALENDAR_BLOCK_CAP).map((row) => ({
        id: row.id,
        targetKind: row.target_kind,
        roomId: row.room_id,
        roomTypeId: row.room_type_id,
        startDate: row.start_date,
        endDate: row.end_date,
        blockType: row.block_type,
        status: row.status,
        reason: row.reason,
      })),
      truncated,
      unavailable: false,
    };
  } catch (error) {
    if (isPermissionDeniedMessage(error)) {
      return { blocks: [], truncated: false, unavailable: true };
    }
    throw error;
  }
}

async function loadOccupiedNow(
  supabase: WorkspaceClient,
  restaurantId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("hotel_reservations")
    .select("room_id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "checked_in")
    .not("room_id", "is", null);
  if (error) throw new Error(error.message);
  return new Set(
    ((data ?? []) as Array<{ room_id: string | null }>)
      .map((row) => row.room_id)
      .filter((id): id is string => !!id),
  );
}

async function loadAvailabilityOverlay(
  supabase: WorkspaceClient,
  restaurantId: string,
  types: Array<{ id: string; name: string }>,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ rows: CalendarRoomType[]; truncated: boolean; unavailable: boolean }> {
  const sliced = types.slice(0, CALENDAR_AVAILABILITY_TYPE_CAP);
  const truncated = types.length > CALENDAR_AVAILABILITY_TYPE_CAP;
  try {
    const results = await Promise.all(
      sliced.map(async (type) => {
        const availability = await getRoomTypeAvailabilityCompat(supabase, {
          restaurantId,
          roomTypeId: type.id,
          arrival: rangeStart,
          departure: rangeEnd,
        });
        const row: CalendarRoomType = {
          roomTypeId: type.id,
          roomTypeName: type.name,
          physicalCapacity: availability.physicalCapacity,
          available: availability.available,
          reserved: availability.reserved,
          source: availability.source,
        };
        return row;
      }),
    );
    return { rows: results, truncated, unavailable: false };
  } catch (error) {
    if (isPermissionDeniedMessage(error)) {
      return { rows: [], truncated, unavailable: true };
    }
    return { rows: [], truncated, unavailable: true };
  }
}

function withBarExceptions(
  bar: CalendarBar,
  roomsById: Map<string, CalendarRoom>,
  overlapIds: Set<string>,
): CalendarBar {
  const keys = new Set(bar.exceptionKeys);
  if (bar.roomId) {
    const room = roomsById.get(bar.roomId);
    if (
      room &&
      (room.operationalStatus === "out_of_order" || room.operationalStatus === "out_of_service")
    ) {
      keys.add("room_unavailable");
    }
  }
  if (overlapIds.has(bar.reservationId)) keys.add("assignment_overlap");
  return { ...bar, exceptionKeys: [...keys] };
}

export const getReservationCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => calendarReadInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CalendarRead> => {
    await requireReservationManager(context as never, data.restaurantId);
    const generatedAt = new Date().toISOString();
    const supabase: WorkspaceClient = context.supabase;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property, error: propertyError } = await supabaseAdmin
      .from("restaurants")
      .select("business_date, timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property) throw new Error("Property not found.");

    const businessDate = resolvePropertyBusinessDate(property.business_date, property.timezone);
    const range = resolveCalendarWindow({
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      horizon: data.horizon,
      businessDate,
    });
    const statuses = defaultStatuses(data.statuses);

    const [occupiedNow, typeRows, overlap, blockResult, rooms] = await Promise.all([
      loadOccupiedNow(supabase, data.restaurantId),
      loadCalendarRoomTypes(supabase, data.restaurantId, data.roomTypeId),
      loadOverlapReservations(
        supabase,
        data.restaurantId,
        range.start,
        range.end,
        statuses,
        data.roomTypeId,
      ),
      loadCalendarBlocks(supabase, data.restaurantId, range.start, range.end, data.roomTypeId),
      loadCalendarRooms(supabase, data.restaurantId, {
        building: data.building,
        floor: data.floor,
        wing: data.wing,
        roomTypeId: data.roomTypeId,
      }),
    ]);

    for (const room of rooms) {
      room.occupiedNow = occupiedNow.has(room.roomId);
    }

    const availabilityResult = await loadAvailabilityOverlay(
      supabase,
      data.restaurantId,
      typeRows,
      range.start,
      range.end,
    );

    const roomsById = new Map(rooms.map((room) => [room.roomId, room]));
    const locationFiltered = Boolean(data.building || data.floor || data.wing);
    const rawBars = overlap.rows.map((row) => mapCalendarBar(row));
    const overlapIds = assignmentOverlapIds(rawBars.filter((bar) => bar.roomId !== null));
    const decorated = rawBars.map((bar) => withBarExceptions(bar, roomsById, overlapIds));
    const unassigned = decorated.filter(
      (bar) => bar.roomId === null && (bar.status === "pending" || bar.status === "confirmed"),
    );
    const bars = decorated.filter((bar) => {
      if (!bar.roomId) return false;
      if (locationFiltered && !roomsById.has(bar.roomId)) return false;
      return true;
    });
    const blocks = locationFiltered
      ? blockResult.blocks.filter(
          (block) =>
            block.targetKind === "room_type" || !block.roomId || roomsById.has(block.roomId),
        )
      : blockResult.blocks;

    const roomTypes: CalendarRoomType[] = typeRows.map((type) => {
      const overlay = availabilityResult.rows.find((row) => row.roomTypeId === type.id);
      return (
        overlay ?? {
          roomTypeId: type.id,
          roomTypeName: type.name,
          physicalCapacity: null,
          available: null,
          reserved: null,
          source: null,
        }
      );
    });

    const warnings: CalendarWarningKey[] = [];
    if (overlap.truncated) warnings.push("reservations_truncated");
    if (blockResult.truncated) warnings.push("blocks_truncated");
    if (blockResult.unavailable) warnings.push("blocks_unavailable");
    if (availabilityResult.truncated) warnings.push("availability_truncated");
    if (availabilityResult.unavailable) warnings.push("availability_unavailable");

    return {
      restaurantId: data.restaurantId,
      businessDate,
      generatedAt,
      range,
      mode: data.mode,
      filters: {
        building: data.building ?? null,
        floor: data.floor ?? null,
        wing: data.wing ?? null,
        roomTypeId: data.roomTypeId ?? null,
        statuses,
      },
      rooms,
      roomTypes,
      bars,
      blocks,
      unassigned,
      availability: availabilityResult.unavailable ? null : availabilityResult.rows,
      warnings,
      truncated: warnings.some(
        (key) =>
          key === "reservations_truncated" ||
          key === "blocks_truncated" ||
          key === "availability_truncated",
      ),
    };
  });
