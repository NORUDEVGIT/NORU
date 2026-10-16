import { addDays, nightsBetween } from "./reservation-dates";

export const GROUP_STATUSES = ["tentative", "definite", "cancelled", "completed"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

export const GROUP_TYPES = ["leisure", "corporate", "association", "tour", "other"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export const GROUP_BLOCK_STATUSES = ["active", "released", "cancelled"] as const;
export type GroupBlockStatus = (typeof GROUP_BLOCK_STATUSES)[number];

export const GROUP_PICKUP_STATUSES = ["pending", "confirmed", "checked_in"] as const;

export const GROUP_STATUS_TRANSITIONS: Record<GroupStatus, readonly GroupStatus[]> = {
  tentative: ["definite", "cancelled"],
  definite: ["cancelled", "completed"],
  cancelled: ["tentative"],
  completed: [],
};

export interface GroupPickupStay {
  arrivalDate: string;
  departureDate: string;
  status: string;
}

export interface GroupAllotmentNight {
  night: string;
  allotted: number;
  pickedUp: number;
  remaining: number;
}

export function isGroupPickupStatus(status: string): boolean {
  return (GROUP_PICKUP_STATUSES as readonly string[]).includes(status);
}

export function isAllowedGroupStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (!(GROUP_STATUSES as readonly string[]).includes(from)) return false;
  if (!(GROUP_STATUSES as readonly string[]).includes(to)) return false;
  return GROUP_STATUS_TRANSITIONS[from as GroupStatus].includes(to as GroupStatus);
}

export function groupNights(startDate: string, endDate: string): string[] {
  const count = Math.max(0, nightsBetween(startDate, endDate));
  return Array.from({ length: count }, (_, index) => addDays(startDate, index));
}

export function stayOccupiesNight(arrivalDate: string, departureDate: string, night: string): boolean {
  return arrivalDate <= night && departureDate > night;
}

export function nightlyAllotment(input: {
  allotted: number;
  startDate: string;
  endDate: string;
  stays: GroupPickupStay[];
}): GroupAllotmentNight[] {
  const allotted = Math.max(0, input.allotted);
  return groupNights(input.startDate, input.endDate).map((night) => {
    const pickedUp = input.stays.filter(
      (stay) =>
        isGroupPickupStatus(stay.status) &&
        stayOccupiesNight(stay.arrivalDate, stay.departureDate, night),
    ).length;
    return {
      night,
      allotted,
      pickedUp,
      remaining: Math.max(0, allotted - pickedUp),
    };
  });
}

export function allotmentTotals(nights: GroupAllotmentNight[]): {
  allotted: number;
  pickedUp: number;
  remaining: number;
} {
  if (nights.length === 0) return { allotted: 0, pickedUp: 0, remaining: 0 };
  return {
    allotted: nights[0]!.allotted,
    pickedUp: Math.max(...nights.map((night) => night.pickedUp)),
    remaining: Math.min(...nights.map((night) => night.remaining)),
  };
}

export function stayFitsAllotment(input: {
  allotted: number;
  startDate: string;
  endDate: string;
  stays: GroupPickupStay[];
  proposed: GroupPickupStay;
}): boolean {
  const nights = nightlyAllotment({
    allotted: input.allotted,
    startDate: input.startDate,
    endDate: input.endDate,
    stays: [...input.stays, input.proposed],
  });
  return nights.every((night) => night.pickedUp <= night.allotted);
}

export function groupWorkspaceSectionFromTab(tab: string | undefined): boolean {
  return tab === "groups" || tab === "groups-blocks";
}

export function groupWorkspaceKpis(
  groups: Array<{
    status: string;
    remaining: number;
    pickedUp: number;
    reservationCount: number;
  }>,
) {
  return {
    total: groups.length,
    tentative: groups.filter((group) => group.status === "tentative").length,
    definite: groups.filter((group) => group.status === "definite").length,
    remaining: groups.reduce((sum, group) => sum + group.remaining, 0),
    pickedUp: groups.reduce((sum, group) => sum + group.pickedUp, 0),
    reservations: groups.reduce((sum, group) => sum + group.reservationCount, 0),
  };
}
