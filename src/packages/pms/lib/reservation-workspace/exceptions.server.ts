import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRoomReady } from "../fo-check-in";
import {
  deriveExceptionRows,
  type ExceptionRow,
  type FolioSignalLane,
  type StayMoneySignal,
} from "../fo-exceptions";
import { loadFoExceptionFeeds, loadFoStaySignals } from "../fo-exceptions.functions";
import { isPermissionDeniedMessage } from "../front-office-shell";
import {
  loadFrontOfficeArrivals,
  loadFrontOfficeDepartures,
  loadFrontOfficeInHouse,
  type FrontOfficeStay,
} from "../frontoffice.functions";
import { canManageHousekeeping } from "../housekeeping.server";
import { addDays } from "../reservation-dates";
import {
  requireReservationManager,
  RESERVATION_STATUSES,
  type ReservationStatus,
} from "../reservations.server";
import { resolvePropertyBusinessDate } from "./business-date";
import {
  FINANCIAL_SIGNAL_BATCH_CAP,
  RESERVATION_EXCEPTION_ITEM_CAP,
  RESERVATION_EXCEPTION_KEYS,
  type ArrivalDepartureFinancial,
  type CalendarBlock,
  type ReservationExceptionActionTarget,
  type ReservationExceptionItem,
  type ReservationExceptionKey,
  type ReservationExceptionResponsibleModule,
  type ReservationExceptionSeverity,
  type ReservationExceptionSnapshot,
  type ReservationExceptionSourceModule,
  type ReservationExceptionWarningKey,
} from "./shared-read-models";

const idSchema = z.string().uuid();

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

type RoomState = {
  id: string;
  status: string;
  housekeepingStatus: string;
  active: boolean;
  roomNumber: string;
  roomTypeId: string;
};

type PricingSnapshot = {
  ratePlanId: string | null;
  roomSubtotal: number | null;
};

const KEY_META: Record<
  ReservationExceptionKey,
  {
    sourceModule: ReservationExceptionSourceModule;
    responsibleModule: ReservationExceptionResponsibleModule;
    actionTarget: ReservationExceptionActionTarget;
    defaultBlocking: boolean;
  }
> = {
  unassigned: {
    sourceModule: "reservation",
    responsibleModule: "reservation",
    actionTarget: "assign_room",
    defaultBlocking: false,
  },
  room_unavailable: {
    sourceModule: "inventory",
    responsibleModule: "inventory",
    actionTarget: "open_room_rack",
    defaultBlocking: true,
  },
  room_not_ready: {
    sourceModule: "housekeeping",
    responsibleModule: "housekeeping",
    actionTarget: "open_housekeeping",
    defaultBlocking: false,
  },
  operational_block: {
    sourceModule: "inventory",
    responsibleModule: "inventory",
    actionTarget: "open_room_rack",
    defaultBlocking: true,
  },
  payment_issue: {
    sourceModule: "cashiering",
    responsibleModule: "cashiering",
    actionTarget: "open_folio",
    defaultBlocking: true,
  },
  overstay: {
    sourceModule: "front_office",
    responsibleModule: "front_office",
    actionTarget: "check_out",
    defaultBlocking: true,
  },
  room_discrepancy: {
    sourceModule: "housekeeping",
    responsibleModule: "housekeeping",
    actionTarget: "open_housekeeping",
    defaultBlocking: false,
  },
  overbooking: {
    sourceModule: "inventory",
    responsibleModule: "reservation",
    actionTarget: "open_room_rack",
    defaultBlocking: true,
  },
  missing_rate_snapshot: {
    sourceModule: "reservation",
    responsibleModule: "reservation",
    actionTarget: "open_reservation",
    defaultBlocking: false,
  },
  missing_guest_contact: {
    sourceModule: "guest",
    responsibleModule: "guest_profile",
    actionTarget: "open_reservation",
    defaultBlocking: false,
  },
  assignment_overlap: {
    sourceModule: "inventory",
    responsibleModule: "inventory",
    actionTarget: "open_room_rack",
    defaultBlocking: true,
  },
};

export function exceptionIdentity(item: {
  key: ReservationExceptionKey;
  reservationId: string | null;
  extra?: string | null;
}): string {
  return `${item.reservationId ?? "_"}:${item.key}:${item.extra ?? ""}`;
}

export function isBlockingException(
  key: ReservationExceptionKey,
  stayStatus: string | null,
): boolean {
  if (key === "unassigned") return stayStatus === "confirmed";
  if (key === "payment_issue") return true;
  return KEY_META[key].defaultBlocking;
}

export function staysOverlapExclusive(
  arrival: string,
  departure: string,
  start: string,
  end: string,
): boolean {
  return arrival < end && departure > start;
}

export function deriveRoomNotReadyItems(
  arrivals: FrontOfficeStay[],
  rooms: Map<string, RoomState>,
  detectedAt: string,
): ReservationExceptionItem[] {
  const items: ReservationExceptionItem[] = [];
  for (const stay of arrivals) {
    if (!stay.roomId) continue;
    const room = rooms.get(stay.roomId);
    if (!room) continue;
    const ready = isRoomReady({
      status: room.status,
      housekeepingStatus: room.housekeepingStatus,
    }).ready;
    if (ready) continue;
    if (room.status === "out_of_order" || room.status === "out_of_service" || !room.active) {
      continue;
    }
    items.push(
      toItem({
        key: "room_not_ready",
        stay,
        summary: "Assigned arrival room is not ready for check-in.",
        detectedAt,
        room,
      }),
    );
  }
  return items;
}

export function deriveOperationalBlockItems(
  stays: FrontOfficeStay[],
  blocks: CalendarBlock[],
  detectedAt: string,
): ReservationExceptionItem[] {
  const items: ReservationExceptionItem[] = [];
  for (const stay of stays) {
    if (stay.status === "cancelled" || stay.status === "checked_out" || stay.status === "no_show") {
      continue;
    }
    const hit = blocks.find((block) => {
      if (
        !staysOverlapExclusive(stay.arrivalDate, stay.departureDate, block.startDate, block.endDate)
      ) {
        return false;
      }
      if (block.targetKind === "room") {
        return Boolean(stay.roomId && block.roomId === stay.roomId);
      }
      return block.roomTypeId === stay.roomTypeId;
    });
    if (!hit) continue;
    items.push(
      toItem({
        key: "operational_block",
        stay,
        summary: "An active inventory block overlaps this stay.",
        detectedAt,
      }),
    );
  }
  return items;
}

export function deriveMissingRateItems(
  stays: FrontOfficeStay[],
  pricing: Map<string, PricingSnapshot>,
  detectedAt: string,
): ReservationExceptionItem[] {
  const items: ReservationExceptionItem[] = [];
  for (const stay of stays) {
    if (stay.status !== "confirmed") continue;
    const snap = pricing.get(stay.id);
    if (!snap) continue;
    if (snap.ratePlanId !== null && snap.roomSubtotal !== null) continue;
    items.push(
      toItem({
        key: "missing_rate_snapshot",
        stay,
        summary: "Confirmed reservation is missing a required pricing snapshot.",
        detectedAt,
      }),
    );
  }
  return items;
}

export function deriveMissingContactItems(
  stays: FrontOfficeStay[],
  detectedAt: string,
): ReservationExceptionItem[] {
  const items: ReservationExceptionItem[] = [];
  for (const stay of stays) {
    if (stay.status === "cancelled" || stay.status === "checked_out" || stay.status === "no_show") {
      continue;
    }
    const phone = (stay.guestPhone ?? "").trim();
    const email = (stay.guestEmail ?? "").trim();
    if (phone || email) continue;
    items.push(
      toItem({
        key: "missing_guest_contact",
        stay,
        summary: "Guest profile has no phone or email.",
        detectedAt,
      }),
    );
  }
  return items;
}

export function deriveInactiveUnavailableItems(
  stays: FrontOfficeStay[],
  rooms: Map<string, RoomState>,
  detectedAt: string,
): ReservationExceptionItem[] {
  const items: ReservationExceptionItem[] = [];
  for (const stay of stays) {
    if (!stay.roomId) continue;
    const room = rooms.get(stay.roomId);
    if (!room || room.active) continue;
    items.push(
      toItem({
        key: "room_unavailable",
        stay,
        summary: "Assigned room is inactive.",
        detectedAt,
        room,
      }),
    );
  }
  return items;
}

export function mapFoExceptionRow(
  row: ExceptionRow,
  stay: FrontOfficeStay | undefined,
  detectedAt: string,
): ReservationExceptionItem {
  const key = row.type as ReservationExceptionKey;
  const status = (stay?.status ?? null) as ReservationStatus | null;
  const severity: ReservationExceptionSeverity =
    key === "unassigned" && stay?.status === "confirmed" ? "high" : row.severity;
  return {
    key,
    severity,
    blocking: isBlockingException(key, stay?.status ?? status),
    reservationId: row.stayId,
    confirmationNumber: row.confirmationNumber || stay?.confirmationNumber || null,
    guest: {
      id: stay?.guestId ?? null,
      name: stay?.guestName || row.guestName || "Guest",
      vip: stay?.guestVip ?? false,
      phone: stay?.guestPhone ?? null,
      email: stay?.guestEmail ?? null,
    },
    stay: {
      arrivalDate: stay?.arrivalDate ?? row.arrivalDate,
      departureDate: stay?.departureDate ?? row.departureDate,
      status,
    },
    room:
      stay || row.roomNumber || row.roomId
        ? {
            roomId: stay?.roomId ?? row.roomId ?? null,
            roomNumber: stay?.roomNumber ?? row.roomNumber ?? null,
            roomTypeId: stay?.roomTypeId ?? row.roomTypeId ?? null,
            roomTypeName: stay?.roomTypeName ?? row.roomTypeName ?? null,
          }
        : null,
    financial: emptyFinancial(),
    sourceModule: KEY_META[key].sourceModule,
    responsibleModule: KEY_META[key].responsibleModule,
    summary: row.reason,
    actionTarget: KEY_META[key].actionTarget,
    detectedAt,
  };
}

export function dedupeExceptionItems(
  items: ReservationExceptionItem[],
): ReservationExceptionItem[] {
  const byId = new Map<string, ReservationExceptionItem>();
  for (const item of items) {
    const id = exceptionIdentity({
      key: item.key,
      reservationId: item.reservationId,
      extra:
        item.key === "room_discrepancy"
          ? item.room?.roomId
          : item.key === "overbooking"
            ? item.stay.arrivalDate
            : null,
    });
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      continue;
    }
    if (item.severity === "high" && existing.severity !== "high") {
      byId.set(id, item);
    }
  }
  return [...byId.values()];
}

export function applyExceptionFilters(
  items: ReservationExceptionItem[],
  filters: ReservationExceptionSnapshot["filters"],
): ReservationExceptionItem[] {
  return items.filter((item) => {
    if (filters.severity && item.severity !== filters.severity) return false;
    if (filters.sourceModule && item.sourceModule !== filters.sourceModule) return false;
    if (filters.responsibleModule && item.responsibleModule !== filters.responsibleModule)
      return false;
    if (filters.key && item.key !== filters.key) return false;
    if (filters.status && item.stay.status !== filters.status) return false;
    return true;
  });
}

export function exceptionTotals(
  items: ReservationExceptionItem[],
  exact: boolean,
): ReservationExceptionSnapshot["totals"] {
  const byKey: ReservationExceptionSnapshot["totals"]["byKey"] = {};
  const bySource: ReservationExceptionSnapshot["totals"]["bySource"] = {};
  let high = 0;
  let standard = 0;
  let blocking = 0;
  for (const item of items) {
    if (item.severity === "high") high += 1;
    else standard += 1;
    if (item.blocking) blocking += 1;
    byKey[item.key] = (byKey[item.key] ?? 0) + 1;
    bySource[item.sourceModule] = (bySource[item.sourceModule] ?? 0) + 1;
  }
  return { total: items.length, high, standard, blocking, exact, byKey, bySource };
}

function toItem(input: {
  key: ReservationExceptionKey;
  stay: FrontOfficeStay;
  summary: string;
  detectedAt: string;
  room?: RoomState;
}): ReservationExceptionItem {
  const meta = KEY_META[input.key];
  return {
    key: input.key,
    severity: severityFor(input.key, input.stay.status),
    blocking: isBlockingException(input.key, input.stay.status),
    reservationId: input.stay.id,
    confirmationNumber: input.stay.confirmationNumber,
    guest: {
      id: input.stay.guestId,
      name: input.stay.guestName,
      vip: input.stay.guestVip,
      phone: input.stay.guestPhone,
      email: input.stay.guestEmail,
    },
    stay: {
      arrivalDate: input.stay.arrivalDate,
      departureDate: input.stay.departureDate,
      status: input.stay.status,
    },
    room: {
      roomId: input.stay.roomId,
      roomNumber: input.stay.roomNumber,
      roomTypeId: input.stay.roomTypeId,
      roomTypeName: input.stay.roomTypeName,
    },
    financial: emptyFinancial(),
    sourceModule: meta.sourceModule,
    responsibleModule: meta.responsibleModule,
    summary: input.summary,
    actionTarget: meta.actionTarget,
    detectedAt: input.detectedAt,
  };
}

function emptyFinancial(): ArrivalDepartureFinancial {
  return {
    state: "not_available",
    folioId: null,
    balance: null,
    depositPosted: null,
    depositWaived: null,
  };
}

function financialFromSignal(
  folioLane: FolioSignalLane,
  signal: StayMoneySignal | undefined,
): ArrivalDepartureFinancial {
  if (folioLane === "permission_denied") {
    return {
      state: "permission_denied",
      folioId: null,
      balance: null,
      depositPosted: null,
      depositWaived: null,
    };
  }
  if (folioLane !== "live") {
    return emptyFinancial();
  }
  return {
    state: "available",
    folioId: signal?.folioId ?? null,
    balance: signal?.balance ?? null,
    depositPosted: signal?.depositPosted ?? null,
    depositWaived: signal ? signal.depositWaived : null,
  };
}

export function attachExceptionFinancial(
  items: ReservationExceptionItem[],
  folioLane: FolioSignalLane,
  moneyByStay: Record<string, StayMoneySignal>,
): ReservationExceptionItem[] {
  return items.map((item) => ({
    ...item,
    financial: item.reservationId
      ? financialFromSignal(folioLane, moneyByStay[item.reservationId])
      : financialFromSignal(folioLane, undefined),
  }));
}

export function deriveAssignmentOverlapItems(
  stays: FrontOfficeStay[],
  detectedAt: string,
): ReservationExceptionItem[] {
  const assigned = stays.filter(
    (stay) =>
      stay.roomId &&
      stay.status !== "cancelled" &&
      stay.status !== "checked_out" &&
      stay.status !== "no_show",
  );
  const byRoom = new Map<string, FrontOfficeStay[]>();
  for (const stay of assigned) {
    const roomId = stay.roomId as string;
    const list = byRoom.get(roomId) ?? [];
    list.push(stay);
    byRoom.set(roomId, list);
  }
  const overlapIds = new Set<string>();
  for (const group of byRoom.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (staysOverlapExclusive(a.arrivalDate, a.departureDate, b.arrivalDate, b.departureDate)) {
          overlapIds.add(a.id);
          overlapIds.add(b.id);
        }
      }
    }
  }
  return assigned
    .filter((stay) => overlapIds.has(stay.id))
    .map((stay) =>
      toItem({
        key: "assignment_overlap",
        stay,
        summary: "Assigned room overlaps another stay.",
        detectedAt,
      }),
    );
}

function severityFor(
  key: ReservationExceptionKey,
  stayStatus: string | null,
): ReservationExceptionSeverity {
  if (key === "unassigned") return stayStatus === "confirmed" ? "high" : "standard";
  return KEY_META[key].defaultBlocking ? "high" : "standard";
}

function uniqueStays(groups: FrontOfficeStay[][]): FrontOfficeStay[] {
  const byId = new Map<string, FrontOfficeStay>();
  for (const group of groups) {
    for (const stay of group) byId.set(stay.id, stay);
  }
  return [...byId.values()];
}

async function loadRooms(
  supabase: WorkspaceClient,
  restaurantId: string,
): Promise<Map<string, RoomState>> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("id, status, housekeeping_status, active, room_number, room_type_id")
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(error.message);
  const map = new Map<string, RoomState>();
  for (const row of (data ?? []) as Array<{
    id: string;
    status: string;
    housekeeping_status: string;
    active: boolean;
    room_number: string;
    room_type_id: string;
  }>) {
    map.set(row.id, {
      id: row.id,
      status: row.status,
      housekeepingStatus: row.housekeeping_status,
      active: row.active,
      roomNumber: row.room_number,
      roomTypeId: row.room_type_id,
    });
  }
  return map;
}

async function loadPricing(
  supabase: WorkspaceClient,
  restaurantId: string,
  ids: string[],
): Promise<Map<string, PricingSnapshot>> {
  const map = new Map<string, PricingSnapshot>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("hotel_reservations")
    .select("id, rate_plan_id, room_subtotal")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{
    id: string;
    rate_plan_id: string | null;
    room_subtotal: number | string | null;
  }>) {
    map.set(row.id, {
      ratePlanId: row.rate_plan_id,
      roomSubtotal: row.room_subtotal == null ? null : Number(row.room_subtotal),
    });
  }
  return map;
}

async function loadActiveBlocks(
  supabase: WorkspaceClient,
  restaurantId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ blocks: CalendarBlock[]; unavailable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("pms_operational_inventory_blocks")
      .select(
        "id, target_kind, room_id, room_type_id, start_date, end_date, block_type, status, reason",
      )
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .gt("end_date", rangeStart)
      .lt("start_date", rangeEnd)
      .limit(500);
    if (error) throw new Error(error.message);
    return {
      unavailable: false,
      blocks: (
        (data ?? []) as Array<{
          id: string;
          target_kind: "room" | "room_type";
          room_id: string | null;
          room_type_id: string;
          start_date: string;
          end_date: string;
          block_type: string;
          status: string;
          reason: string;
        }>
      ).map((row) => ({
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
    };
  } catch (error) {
    if (isPermissionDeniedMessage(error)) return { blocks: [], unavailable: true };
    throw error;
  }
}

export const getReservationExceptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        severity: z.enum(["high", "standard"]).optional(),
        sourceModule: z
          .enum(["reservation", "front_office", "inventory", "housekeeping", "cashiering", "guest"])
          .optional(),
        responsibleModule: z
          .enum([
            "reservation",
            "front_office",
            "housekeeping",
            "cashiering",
            "inventory",
            "guest_profile",
          ])
          .optional(),
        key: z.enum(RESERVATION_EXCEPTION_KEYS).optional(),
        status: z.enum(RESERVATION_STATUSES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationExceptionSnapshot> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
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
    const blockRangeEnd = addDays(businessDate, 7);

    const [arrivals, inHouse, departures, rooms, feeds, blockResult] = await Promise.all([
      loadFrontOfficeArrivals(supabase, { restaurantId: data.restaurantId, date: businessDate }),
      loadFrontOfficeInHouse(supabase, { restaurantId: data.restaurantId, today: businessDate }),
      loadFrontOfficeDepartures(supabase, { restaurantId: data.restaurantId, date: businessDate }),
      loadRooms(supabase, data.restaurantId),
      loadFoExceptionFeeds({
        context: context as never,
        restaurantId: data.restaurantId,
        businessDate,
        canResolveDiscrepancy: canManageHousekeeping(me.role),
      }),
      loadActiveBlocks(supabase, data.restaurantId, businessDate, blockRangeEnd),
    ]);

    const scoped = uniqueStays([arrivals, inHouse, departures]);
    const signalIds = scoped.map((stay) => stay.id).slice(0, FINANCIAL_SIGNAL_BATCH_CAP);
    const financialTruncated = scoped.length > FINANCIAL_SIGNAL_BATCH_CAP;

    const [signals, pricing] = await Promise.all([
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: signalIds,
      }),
      loadPricing(
        supabase,
        data.restaurantId,
        scoped.map((stay) => stay.id),
      ),
    ]);

    const folioLane: FolioSignalLane = signals.folioLane;
    const fo = deriveExceptionRows({
      arrivals,
      inHouse,
      departures,
      rooms: [...rooms.values()].map((room) => ({
        id: room.id,
        status: room.status,
        roomTypeId: room.roomTypeId,
        roomTypeName: undefined,
      })),
      folioLane,
      moneyByStay: signals.byStay,
      businessDate,
      overbookingLane: feeds.overbookingLane,
      discrepancyLane: feeds.discrepancyLane,
      demandStays: feeds.demandStays,
      discrepancies: feeds.discrepancies,
      canResolveDiscrepancy: feeds.canResolveDiscrepancy,
    });

    const stayById = new Map(scoped.map((stay) => [stay.id, stay]));
    const fromFo = fo.rows.map((row) =>
      mapFoExceptionRow(row, stayById.get(row.stayId ?? "") ?? undefined, generatedAt),
    );
    const extra = [
      ...deriveRoomNotReadyItems(arrivals, rooms, generatedAt),
      ...deriveOperationalBlockItems(scoped, blockResult.blocks, generatedAt),
      ...deriveInactiveUnavailableItems(scoped, rooms, generatedAt),
      ...deriveMissingRateItems(scoped, pricing, generatedAt),
      ...deriveMissingContactItems(scoped, generatedAt),
      ...deriveAssignmentOverlapItems(scoped, generatedAt),
    ];

    const deduped = attachExceptionFinancial(
      dedupeExceptionItems([...fromFo, ...extra]),
      folioLane,
      signals.byStay,
    );
    const filters = {
      severity: data.severity ?? null,
      sourceModule: data.sourceModule ?? null,
      responsibleModule: data.responsibleModule ?? null,
      key: data.key ?? null,
      status: data.status ?? null,
    };
    const filtered = applyExceptionFilters(deduped, filters);
    const itemTruncated = filtered.length > RESERVATION_EXCEPTION_ITEM_CAP;
    const items = filtered.slice(0, RESERVATION_EXCEPTION_ITEM_CAP);

    const warnings: ReservationExceptionWarningKey[] = [];
    if (folioLane === "permission_denied" || folioLane === "coming_soon") {
      warnings.push("financial_signals_unavailable");
    }
    if (financialTruncated) warnings.push("financial_signals_truncated");
    if (feeds.overbookingLane === "coming_soon") warnings.push("overbooking_feed_truncated");
    if (feeds.discrepancyLane !== "live") warnings.push("discrepancy_feed_unavailable");
    if (blockResult.unavailable) warnings.push("blocks_unavailable");
    if (itemTruncated) warnings.push("items_truncated");

    const truncated = warnings.some(
      (key) =>
        key === "overbooking_feed_truncated" ||
        key === "financial_signals_truncated" ||
        key === "items_truncated",
    );

    return {
      restaurantId: data.restaurantId,
      businessDate,
      generatedAt,
      filters,
      totals: exceptionTotals(items, !truncated),
      items,
      truncated,
      warnings,
    };
  });
