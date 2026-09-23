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
