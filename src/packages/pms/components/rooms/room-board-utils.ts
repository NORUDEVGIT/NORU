import type {
  RoomBoardBlockRow,
  RoomBoardOccupancyRow,
} from "@/packages/pms/lib/room-board.functions";
import type { HotelRoom } from "@/packages/pms/lib/rooms.functions";

export type RoomBoardPrimaryState =
  | "inactive"
  | "out_of_order"
  | "out_of_service"
  | "blocked"
  | "occupied"
  | "departing"
  | "reserved"
  | "dirty"
  | "available";

export function roomBoardPrimaryState(
  room: HotelRoom,
  occupancy?: RoomBoardOccupancyRow,
  block?: RoomBoardBlockRow,
): RoomBoardPrimaryState {
  if (!room.active) return "inactive";
  if (room.status === "out_of_order") return "out_of_order";
  if (room.status === "out_of_service") return "out_of_service";
  if (block) return "blocked";
  if (occupancy?.state === "occupied") return "occupied";
  if (occupancy?.state === "departing") return "departing";
  if (occupancy?.state === "reserved") return "reserved";
  if (room.housekeepingStatus === "dirty") return "dirty";
  return "available";
}

export const ROOM_STATE_LABELS: Record<RoomBoardPrimaryState, string> = {
  inactive: "Inactive",
  out_of_order: "Out of Order",
  out_of_service: "Out of Service",
  blocked: "Blocked",
  occupied: "Occupied",
  departing: "Departing",
  reserved: "Reserved",
  dirty: "Dirty",
  available: "Available",
};

export function roomStateClasses(state: RoomBoardPrimaryState): string {
  const classes: Record<RoomBoardPrimaryState, string> = {
    available: "border-emerald-200 bg-emerald-50 text-emerald-700",
    occupied: "border-blue-200 bg-blue-50 text-blue-700",
    departing: "border-sky-200 bg-sky-50 text-sky-700",
    reserved: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dirty: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-violet-200 bg-violet-50 text-violet-700",
    out_of_order: "border-red-200 bg-red-50 text-red-700",
    out_of_service: "border-rose-200 bg-rose-50 text-rose-700",
    inactive: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return classes[state];
}

export function selectedRoomClasses(state: RoomBoardPrimaryState): string {
  if (state === "out_of_order" || state === "out_of_service") {
    return "border-red-300 bg-red-50/60 ring-1 ring-red-200";
  }
  if (state === "blocked") return "border-violet-300 bg-violet-50/60 ring-1 ring-violet-200";
  return "border-[#C89933] bg-[#FFF9EB] ring-1 ring-[#C89933]/30";
}

export function metricPercentage(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

const ROOM_TYPE_MINOR_WORDS = new Set(["and", "of", "with", "the", "a", "an", "for", "&"]);

/**
 * One display style for room type names: "deluxe KING" and "DELUXE king" both
 * read "Deluxe King". Short all-caps words (VIP, ADA) stay as written.
 */
export function formatRoomTypeName(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean
    .split(" ")
    .map((word, index) => {
      if (word.length <= 3 && word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      if (index > 0 && ROOM_TYPE_MINOR_WORDS.has(lower)) return lower;
      return lower.replace(/(^|[-/(])([a-z])/g, (_, lead: string, letter: string) =>
        `${lead}${letter.toUpperCase()}`,
      );
    })
    .join(" ");
}

/** Plain-language label for a stored status code ("pickup" -> "Pickup"). */
export function statusPhrase(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function hkStatusLabel(value: string | null | undefined): string {
  return value ? statusPhrase(value) : "Not set";
}

/** Housekeeping readiness colours (dot + text). Independent of operational and maintenance colours. */
export function hkStatusDot(value: string | null | undefined): string {
  switch (value) {
    case "clean":
      return "bg-emerald-600";
    case "inspected":
      return "bg-teal-600";
    case "dirty":
      return "bg-amber-500";
    case "pickup":
      return "bg-sky-500";
    default:
      return "bg-slate-400";
  }
}

export function maintenanceStatusLabel(value: string | null | undefined): string {
  if (!value || value === "normal") return "Good";
  if (value === "maintenance_required") return "Maintenance Required";
  return statusPhrase(value);
}

export function maintenanceNeedsAttention(value: string | null | undefined): boolean {
  return Boolean(value) && value !== "normal";
}

/** Maintenance Required and worse stand out with a filled badge; "Good" stays quiet. */
export function maintenanceBadgeClasses(value: string | null | undefined): string {
  switch (value) {
    case "maintenance_required":
      return "border-orange-400 bg-orange-100 text-orange-900";
    case "out_of_order":
      return "border-red-300 bg-red-100 text-red-800";
    case "out_of_service":
      return "border-rose-300 bg-rose-100 text-rose-800";
    case "in_progress":
      return "border-amber-300 bg-amber-100 text-amber-900";
    case "inspection":
      return "border-sky-300 bg-sky-100 text-sky-900";
    default:
      return "border-transparent bg-transparent text-[#756A5B]";
  }
}

export type RoomKpiFilter = "all" | "available" | "occupied" | "dirty" | "ooo" | "blocked";

/** Same state logic as the KPI counts, so a clicked card lists exactly the rooms it counts. */
export function roomMatchesKpiFilter(filter: RoomKpiFilter, state: RoomBoardPrimaryState): boolean {
  switch (filter) {
    case "all":
      return true;
    case "available":
      return state === "available";
    case "occupied":
      return state === "occupied" || state === "departing";
    case "dirty":
      return state === "dirty";
    case "ooo":
      return state === "out_of_order";
    case "blocked":
      return state === "blocked";
  }
}

export const ROOM_KPI_LABELS: Record<RoomKpiFilter, string> = {
  all: "Total Rooms",
  available: "Available",
  occupied: "Occupied",
  dirty: "Dirty",
  ooo: "Out of Order",
  blocked: "Blocked",
};
