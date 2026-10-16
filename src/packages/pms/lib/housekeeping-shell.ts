/**
 * Housekeeping workspace Phase 1 — entry IA and board presentation helpers.
 * Ready stays derived. Room HK stays dirty|clean|inspected|pickup.
 */
import type { HousekeepingScope } from "@/core/lib/module-access";
import type { RackRoom } from "./housekeeping.functions";

export const HK_CANONICAL_PATH = "/restaurant/pms/housekeeping" as const;
export const HK_MAINTENANCE_PATH = "/restaurant/pms/maintenance" as const;
export const HK_LEGACY_PATH = "/restaurant/housekeeping" as const;
export const HK_GUEST_SERVICES_PATH = "/restaurant/pms/guest-services" as const;

export const HK_LANDING_TAB = "board" as const;
export const HK_DESK_TITLE = "Housekeeping Desk";
export const HK_DESK_DESCRIPTION =
  "Manage room cleaning, inspections, requests and maintenance across your property.";

export const HK_AREA_IDS = [
  "board",
  "cleaning",
  "inspections",
  "requests",
  "maintenance",
  "exceptions",
  "history",
] as const;
export type HkAreaId = (typeof HK_AREA_IDS)[number];

/** Extra URL area: restriction writer, not a primary screenshot tab. */
export const HK_EXTRA_AREA_IDS = ["restrictions"] as const;
export type HkResolvableAreaId = HkAreaId | (typeof HK_EXTRA_AREA_IDS)[number];

export const HK_AREA_ITEMS: Array<{
  id: HkAreaId;
  label: string;
  scopes: HousekeepingScope[];
}> = [
  { id: "board", label: "Board", scopes: ["supervisor", "housekeeper", "maintenance"] },
  { id: "cleaning", label: "Cleaning Tasks", scopes: ["supervisor", "housekeeper"] },
  { id: "inspections", label: "Inspections", scopes: ["supervisor"] },
  { id: "requests", label: "Requests", scopes: ["supervisor", "housekeeper"] },
  { id: "maintenance", label: "Maintenance", scopes: ["supervisor", "maintenance"] },
  { id: "exceptions", label: "Exceptions", scopes: ["supervisor"] },
  { id: "history", label: "History", scopes: ["supervisor"] },
];

const LEGACY_ON_LEGACY_ROUTE: Record<string, HkResolvableAreaId> = {
  dashboard: "board",
  rack: "board",
  board: "cleaning",
  inspections: "inspections",
  discrepancies: "exceptions",
  restrictions: "restrictions",
  maintenance: "maintenance",
  history: "history",
  cleaning: "cleaning",
  requests: "requests",
  exceptions: "exceptions",
};

const CANONICAL_ALIASES: Record<string, HkResolvableAreaId> = {
  dashboard: "board",
  rack: "board",
  discrepancies: "exceptions",
  board: "board",
  cleaning: "cleaning",
  inspections: "inspections",
  requests: "requests",
  maintenance: "maintenance",
  exceptions: "exceptions",
  history: "history",
  restrictions: "restrictions",
};

export function mapLegacyHousekeepingTab(tab: string | undefined): HkResolvableAreaId {
  if (!tab) return HK_LANDING_TAB;
  return LEGACY_ON_LEGACY_ROUTE[tab] ?? HK_LANDING_TAB;
}

export function resolveHkArea(
  tab: string | undefined,
  opts?: { fromLegacy?: boolean; defaultArea?: HkResolvableAreaId },
): HkResolvableAreaId {
  const fallback = opts?.defaultArea ?? HK_LANDING_TAB;
  if (!tab) return fallback;
  if (opts?.fromLegacy) return mapLegacyHousekeepingTab(tab);
  return CANONICAL_ALIASES[tab] ?? fallback;
}

export function visibleHkAreas(scope: HousekeepingScope): HkAreaId[] {
  return HK_AREA_ITEMS.filter((item) => item.scopes.includes(scope)).map((item) => item.id);
}

export function firstVisibleHkArea(
  scope: HousekeepingScope,
  preferred: HkResolvableAreaId,
): HkResolvableAreaId {
  if (preferred === "restrictions" && scope === "supervisor") return "restrictions";
  const visible = visibleHkAreas(scope);
  if ((visible as string[]).includes(preferred)) return preferred;
  return visible[0] ?? HK_LANDING_TAB;
}

export function hkAreaPath(area: HkResolvableAreaId): {
  to: "/restaurant/pms/housekeeping" | "/restaurant/pms/maintenance";
  search: { tab: string };
} {
  if (area === "maintenance") {
    return { to: HK_MAINTENANCE_PATH, search: { tab: "maintenance" } };
  }
  return { to: HK_CANONICAL_PATH, search: { tab: area } };
}

export function hkRoomQuickViewPath(roomId: string): {
  to: "/restaurant/pms/housekeeping";
  search: { tab: "board"; room: string };
} {
  return { to: HK_CANONICAL_PATH, search: { tab: "board", room: roomId } };
}

export const HK_BOARD_COLUMNS = [
  "dirty",
  "assigned",
  "cleaning",
  "clean",
  "inspection",
  "ready",
] as const;
export type HkBoardColumn = (typeof HK_BOARD_COLUMNS)[number];

export const HK_BOARD_COLUMN_META: Record<
  HkBoardColumn,
  { label: string; hint: string; accent: string }
> = {
  dirty: { label: "Dirty", hint: "Need cleaning", accent: "text-rose-700" },
  assigned: { label: "Assigned", hint: "Rooms assigned", accent: "text-amber-800" },
  cleaning: { label: "Cleaning", hint: "Being cleaned", accent: "text-sky-700" },
  clean: { label: "Clean", hint: "Awaiting inspection", accent: "text-emerald-700" },
  inspection: { label: "Inspection", hint: "Awaiting release", accent: "text-violet-700" },
  ready: { label: "Ready", hint: "Ready for check-in", accent: "text-teal-700" },
};

/**
 * Exclusive board column. Product lifecycle on existing room + task fields.
 * OOO/OOS rooms stay off the board (KPI only). pickup is not Ready.
 */
export function boardColumnForRoom(room: RackRoom): HkBoardColumn | null {
  if (room.restriction === "out_of_order" || room.restriction === "out_of_service") return null;
  if (room.openTaskStatus === "in_progress") return "cleaning";
  if (room.openTaskStatus === "assigned") return "assigned";
  if (room.housekeepingStatus === "dirty" || room.housekeepingStatus === "pickup") return "dirty";
  if (room.ready) return "ready";
  if (room.housekeepingStatus === "clean") return "inspection";
  if (room.housekeepingStatus === "inspected") return "clean";
  return "dirty";
}

export function deriveHkBoardKpis(rooms: RackRoom[]): {
  dirty: number;
  assigned: number;
  inProgress: number;
  clean: number;
  inspected: number;
  ready: number;
  pickup: number;
  outOfOrder: number;
} {
  return {
    dirty: rooms.filter((r) => r.housekeepingStatus === "dirty").length,
    assigned: rooms.filter((r) => r.openTaskStatus === "assigned").length,
    inProgress: rooms.filter((r) => r.openTaskStatus === "in_progress").length,
    clean: rooms.filter((r) => r.housekeepingStatus === "clean").length,
    inspected: rooms.filter((r) => r.housekeepingStatus === "inspected").length,
    ready: rooms.filter((r) => r.ready).length,
    pickup: rooms.filter((r) => r.housekeepingStatus === "pickup").length,
    outOfOrder: rooms.filter((r) => r.restriction === "out_of_order").length,
  };
}

export function occupancyCaption(room: RackRoom): string {
  if (room.restriction === "out_of_order") return "Out of order";
  if (room.restriction === "out_of_service") return "Out of service";
  if (room.occupancy === "occupied") return room.guestName ? `Occupied · ${room.guestName}` : "Occupied";
  return "Vacant";
}

/** Phase 8 — phone field ops. Same routes; stacked worklist is the primary phone UI. */
export const HK_FIELD_ACTION_CLASS = "h-11 min-h-11 w-full sm:w-auto";
export const HK_FIELD_STACK_CLASS = "space-y-3 md:hidden";
export const HK_DESKTOP_ONLY_CLASS = "hidden md:block";
export const HK_BOARD_FIELD_STACK_CLASS = "space-y-3 lg:hidden";
export const HK_BOARD_LANES_DESKTOP_CLASS = "hidden lg:block overflow-x-auto rounded-2xl border border-[#E6DDD0] bg-[#F7F4EE]";
