export const DESK_SEARCH_DEBOUNCE_MS = 300;
export const DESK_FILTER_ALL = "all";

export type DeskAssignmentFilter = "all" | "assigned" | "unassigned";
export type DeskVipFilter = "all" | "yes" | "no";
export type DeskSourceFilter = "all" | "staff" | "walk_in" | "direct_booking" | "future_online";
export type DeskStatusFilter =
  "all" | "pending" | "confirmed" | "cancelled" | "checked_in" | "checked_out" | "no_show";

export type DeskAdvancedFilters = {
  vip: DeskVipFilter;
  assignment: DeskAssignmentFilter;
  departureFrom: string;
  departureTo: string;
  roomId: string;
  roomNumber: string;
  ratePlanId: string;
  ratePlanName: string;
  companyMasterId: string;
  companyName: string;
  travelAgentMasterId: string;
  travelAgentName: string;
  groupAccountMasterId: string;
  groupName: string;
  commercialBookingSource: string;
  commercialBookingSourceLabel: string;
  marketSegment: string;
  marketSegmentLabel: string;
};

export type DeskBarFilters = {
  arrivalFrom: string;
  arrivalTo: string;
  status: DeskStatusFilter;
  roomTypeId: string;
  roomTypeName: string;
  source: DeskSourceFilter;
};

export type DeskFilterChip = {
  id: string;
  label: string;
  removeLabel: string;
};

export const EMPTY_ADVANCED_FILTERS: DeskAdvancedFilters = {
  vip: "all",
  assignment: "all",
  departureFrom: "",
  departureTo: "",
  roomId: DESK_FILTER_ALL,
  roomNumber: "",
  ratePlanId: DESK_FILTER_ALL,
  ratePlanName: "",
  companyMasterId: "",
  companyName: "",
  travelAgentMasterId: "",
  travelAgentName: "",
  groupAccountMasterId: "",
  groupName: "",
  commercialBookingSource: DESK_FILTER_ALL,
  commercialBookingSourceLabel: "",
  marketSegment: DESK_FILTER_ALL,
  marketSegmentLabel: "",
};

export const EMPTY_BAR_FILTERS: DeskBarFilters = {
  arrivalFrom: "",
  arrivalTo: "",
  status: "all",
  roomTypeId: DESK_FILTER_ALL,
  roomTypeName: "",
  source: "all",
};

export function validateDateRange(
  from: string,
  to: string,
  fromLabel: string,
  toLabel: string,
): string | null {
  if (from && to && to < from) {
    return `${toLabel} must be on or after ${fromLabel}.`;
  }
  return null;
}

export function validateAdvancedFilters(draft: DeskAdvancedFilters, view: string): string | null {
  const departureError = validateDateRange(
    draft.departureFrom,
    draft.departureTo,
    "Departure From",
    "Departure To",
  );
  if (departureError) return departureError;
  if (view === "unassigned" && draft.assignment === "assigned") {
    return "Unassigned view cannot combine with Assigned.";
  }
  return null;
}

export function countActiveAdvancedFilters(applied: DeskAdvancedFilters): number {
  let count = 0;
  if (applied.vip !== "all") count += 1;
  if (applied.assignment !== "all") count += 1;
  if (applied.departureFrom || applied.departureTo) count += 1;
  if (applied.roomId && applied.roomId !== DESK_FILTER_ALL) count += 1;
  if (applied.ratePlanId && applied.ratePlanId !== DESK_FILTER_ALL) count += 1;
  if (applied.companyMasterId) count += 1;
  if (applied.travelAgentMasterId) count += 1;
  if (applied.groupAccountMasterId) count += 1;
  if (applied.commercialBookingSource && applied.commercialBookingSource !== DESK_FILTER_ALL) {
    count += 1;
  }
  if (applied.marketSegment && applied.marketSegment !== DESK_FILTER_ALL) count += 1;
  return count;
}

export function hasActiveDeskConstraints(
  search: string,
  bar: DeskBarFilters,
  advanced: DeskAdvancedFilters,
): boolean {
  return (
    search.trim().length > 0 || hasActiveBarFilters(bar) || countActiveAdvancedFilters(advanced) > 0
  );
}

export function hasActiveBarFilters(bar: DeskBarFilters): boolean {
  return Boolean(
    bar.arrivalFrom ||
    bar.arrivalTo ||
    bar.status !== "all" ||
    (bar.roomTypeId && bar.roomTypeId !== DESK_FILTER_ALL) ||
    bar.source !== "all",
  );
}

function chipDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [, month, day] = value.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${Number(day)} ${months[Number(month) - 1]}`;
}

function rangeLabel(prefix: string, from: string, to: string): string {
  if (from && to) return `${prefix}: ${chipDate(from)}–${chipDate(to)}`;
  if (from) return `${prefix} from ${chipDate(from)}`;
  return `${prefix} to ${chipDate(to)}`;
}

function sourceChipLabel(value: DeskSourceFilter): string {
  if (value === "walk_in") return "Walk-in";
  if (value === "direct_booking") return "Direct booking";
  if (value === "future_online") return "Future online";
  if (value === "staff") return "Staff";
  return value;
}

function statusChipLabel(value: DeskStatusFilter): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function deskFilterChips(
  bar: DeskBarFilters,
  advanced: DeskAdvancedFilters,
): DeskFilterChip[] {
  const chips: DeskFilterChip[] = [];
  if (bar.arrivalFrom || bar.arrivalTo) {
    const label = rangeLabel("Arrival", bar.arrivalFrom, bar.arrivalTo);
    chips.push({ id: "arrival", label, removeLabel: `Remove ${label}` });
  }
  if (bar.status !== "all") {
    const label = `Status: ${statusChipLabel(bar.status)}`;
    chips.push({ id: "status", label, removeLabel: `Remove ${label}` });
  }
  if (bar.roomTypeId && bar.roomTypeId !== DESK_FILTER_ALL) {
    const label = `Room type: ${bar.roomTypeName || "Selected"}`;
    chips.push({ id: "roomType", label, removeLabel: `Remove ${label}` });
  }
  if (bar.source !== "all") {
    const label = `Source: ${sourceChipLabel(bar.source)}`;
    chips.push({ id: "source", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.vip === "yes") {
    chips.push({ id: "vip", label: "VIP", removeLabel: "Remove VIP" });
  } else if (advanced.vip === "no") {
    chips.push({ id: "vip", label: "Not VIP", removeLabel: "Remove Not VIP" });
  }
  if (advanced.assignment === "assigned") {
    chips.push({ id: "assignment", label: "Assigned", removeLabel: "Remove Assigned" });
  } else if (advanced.assignment === "unassigned") {
    chips.push({ id: "assignment", label: "Unassigned", removeLabel: "Remove Unassigned" });
  }
  if (advanced.departureFrom || advanced.departureTo) {
    const label = rangeLabel("Departure", advanced.departureFrom, advanced.departureTo);
    chips.push({ id: "departure", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.roomId && advanced.roomId !== DESK_FILTER_ALL) {
    const label = `Room: ${advanced.roomNumber || "Selected"}`;
    chips.push({ id: "room", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.ratePlanId && advanced.ratePlanId !== DESK_FILTER_ALL) {
    const label = `Rate Plan: ${advanced.ratePlanName || "Selected"}`;
    chips.push({ id: "ratePlan", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.companyMasterId) {
    const label = `Company: ${advanced.companyName || "Selected"}`;
    chips.push({ id: "company", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.travelAgentMasterId) {
    const label = `Travel Agent: ${advanced.travelAgentName || "Selected"}`;
    chips.push({ id: "travelAgent", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.groupAccountMasterId) {
    const label = `Group: ${advanced.groupName || "Selected"}`;
    chips.push({ id: "group", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.commercialBookingSource && advanced.commercialBookingSource !== DESK_FILTER_ALL) {
    const label = `Booking source: ${advanced.commercialBookingSourceLabel || advanced.commercialBookingSource}`;
    chips.push({ id: "commercial", label, removeLabel: `Remove ${label}` });
  }
  if (advanced.marketSegment && advanced.marketSegment !== DESK_FILTER_ALL) {
    const label = `Market segment: ${advanced.marketSegmentLabel || advanced.marketSegment}`;
    chips.push({ id: "segment", label, removeLabel: `Remove ${label}` });
  }
  return chips;
}

export function removeDeskFilterChip(
  id: string,
  bar: DeskBarFilters,
  advanced: DeskAdvancedFilters,
): { bar: DeskBarFilters; advanced: DeskAdvancedFilters } {
  const nextBar = { ...bar };
  const nextAdvanced = { ...advanced };
  switch (id) {
    case "arrival":
      nextBar.arrivalFrom = "";
      nextBar.arrivalTo = "";
      break;
    case "status":
      nextBar.status = "all";
      break;
    case "roomType":
      nextBar.roomTypeId = DESK_FILTER_ALL;
      nextBar.roomTypeName = "";
      break;
    case "source":
      nextBar.source = "all";
      break;
    case "vip":
      nextAdvanced.vip = "all";
      break;
    case "assignment":
      nextAdvanced.assignment = "all";
      break;
    case "departure":
      nextAdvanced.departureFrom = "";
      nextAdvanced.departureTo = "";
      break;
    case "room":
      nextAdvanced.roomId = DESK_FILTER_ALL;
      nextAdvanced.roomNumber = "";
      break;
    case "ratePlan":
      nextAdvanced.ratePlanId = DESK_FILTER_ALL;
      nextAdvanced.ratePlanName = "";
      break;
    case "company":
      nextAdvanced.companyMasterId = "";
      nextAdvanced.companyName = "";
      break;
    case "travelAgent":
      nextAdvanced.travelAgentMasterId = "";
      nextAdvanced.travelAgentName = "";
      break;
    case "group":
      nextAdvanced.groupAccountMasterId = "";
      nextAdvanced.groupName = "";
      break;
    case "commercial":
      nextAdvanced.commercialBookingSource = DESK_FILTER_ALL;
      nextAdvanced.commercialBookingSourceLabel = "";
      break;
    case "segment":
      nextAdvanced.marketSegment = DESK_FILTER_ALL;
      nextAdvanced.marketSegmentLabel = "";
      break;
    default:
      break;
  }
  return { bar: nextBar, advanced: nextAdvanced };
}

export type DeskSearchQuerySlice = {
  search?: string;
  arrivalFrom?: string;
  arrivalTo?: string;
  departureFrom?: string;
  departureTo?: string;
  statuses?: Exclude<DeskStatusFilter, "all">[];
  roomTypeId?: string;
  roomId?: string;
  unassigned?: boolean;
  vip?: boolean;
  source?: Exclude<DeskSourceFilter, "all">;
  commercialBookingSource?: string;
  marketSegment?: string;
  ratePlanId?: string;
  companyMasterId?: string;
  travelAgentMasterId?: string;
  groupAccountMasterId?: string;
};

export function toDeskSearchQuerySlice(
  search: string,
  bar: DeskBarFilters,
  advanced: DeskAdvancedFilters,
): DeskSearchQuerySlice {
  const slice: DeskSearchQuerySlice = {};
  const term = search.trim();
  if (term.length >= 2) slice.search = term;
  if (bar.arrivalFrom) slice.arrivalFrom = bar.arrivalFrom;
  if (bar.arrivalTo) slice.arrivalTo = bar.arrivalTo;
  if (bar.status !== "all") slice.statuses = [bar.status];
  if (bar.roomTypeId && bar.roomTypeId !== DESK_FILTER_ALL) slice.roomTypeId = bar.roomTypeId;
  if (bar.source !== "all") slice.source = bar.source;
  if (advanced.departureFrom) slice.departureFrom = advanced.departureFrom;
  if (advanced.departureTo) slice.departureTo = advanced.departureTo;
  if (advanced.roomId && advanced.roomId !== DESK_FILTER_ALL) slice.roomId = advanced.roomId;
  if (advanced.assignment === "unassigned") slice.unassigned = true;
  if (advanced.assignment === "assigned") slice.unassigned = false;
  if (advanced.vip === "yes") slice.vip = true;
  if (advanced.vip === "no") slice.vip = false;
  if (advanced.ratePlanId && advanced.ratePlanId !== DESK_FILTER_ALL) {
    slice.ratePlanId = advanced.ratePlanId;
  }
  if (advanced.companyMasterId) slice.companyMasterId = advanced.companyMasterId;
  if (advanced.travelAgentMasterId) slice.travelAgentMasterId = advanced.travelAgentMasterId;
  if (advanced.groupAccountMasterId) slice.groupAccountMasterId = advanced.groupAccountMasterId;
  if (advanced.commercialBookingSource && advanced.commercialBookingSource !== DESK_FILTER_ALL) {
    slice.commercialBookingSource = advanced.commercialBookingSource;
  }
  if (advanced.marketSegment && advanced.marketSegment !== DESK_FILTER_ALL) {
    slice.marketSegment = advanced.marketSegment;
  }
  return slice;
}
