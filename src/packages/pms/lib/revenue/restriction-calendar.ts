/**
 * Restriction Calendar (UI-07) read-model helpers.
 *
 * Composes on getRevenueRateCalendar. Restriction is primary; inventory is
 * secondary context. Templates are not applied state.
 *
 * Template prefill is deferred (possible UI-09). Card 3 catalogue stays
 * Property Setup only — no template write, no FK.
 */

import {
  restrictionLabel,
  type RateCalendarCell,
  type RateCalendarGroup,
  type RateCalendarInventory,
  type RateCalendarPlan,
  type RateCalendarRestriction,
  type RateCalendarRoomType,
  type RateCalendarWorkspace,
} from "./rate-calendar.ts";
import {
  emptyRestrictionState,
  restrictionChangedFields,
  restrictionVersionToken,
  type RestrictionChangeFields,
  type RestrictionFieldKey,
  type RestrictionState,
} from "./restriction-change.ts";

export const RESTRICTION_CALENDAR_STALE_COPY =
  "The restriction changed after this preview. Refresh and review again.";
export const RESTRICTION_CALENDAR_HISTORY_EMPTY =
  "No recorded restriction-change history for this date.";
export const RESTRICTION_CALENDAR_CLEAR_COPY =
  "Removes all operational restrictions for this rate plan and stay date.";
export const RESTRICTION_CALENDAR_OPEN_LABEL = "Open";

export type RestrictionMarkKind = "stopSell" | "cta" | "ctd" | "stay";

export type RestrictionMark = {
  key: RestrictionFieldKey;
  kind: RestrictionMarkKind;
  label: string;
};

export type RestrictionCalendarCell = {
  date: string;
  roomTypeId: string;
  ratePlanId: string;
  restriction: RateCalendarRestriction;
  restrictionExpectedVersion: string;
  restrictionLabel: string | null;
  marks: RestrictionMark[];
  hasRestriction: boolean;
  inventory: RateCalendarInventory;
  planActive: boolean;
  outsideValidity: boolean;
};

export type RestrictionCalendarPlanRow = {
  plan: RateCalendarPlan;
  cells: RestrictionCalendarCell[];
};

export type RestrictionCalendarGroup = {
  roomType: RateCalendarRoomType;
  rows: RestrictionCalendarPlanRow[];
};

export type RestrictionCalendarWorkspace = Omit<RateCalendarWorkspace, "groups"> & {
  groups: RestrictionCalendarGroup[];
};

export function restrictionStateFromCell(cell: RateCalendarRestriction): RestrictionState {
  return {
    minStay: cell.minStay,
    maxStay: cell.maxStay,
    closedToArrival: cell.closedToArrival,
    closedToDeparture: cell.closedToDeparture,
    stopSell: cell.stopSell,
  };
}

export function hasOperationalRestriction(state: RateCalendarRestriction): boolean {
  return restrictionLabel(state) != null;
}

export function restrictionMarks(state: RateCalendarRestriction): RestrictionMark[] {
  const marks: RestrictionMark[] = [];
  if (state.stopSell) marks.push({ key: "stopSell", kind: "stopSell", label: "SS" });
  if (state.closedToArrival) marks.push({ key: "closedToArrival", kind: "cta", label: "CTA" });
  if (state.closedToDeparture) marks.push({ key: "closedToDeparture", kind: "ctd", label: "CTD" });
  if (state.minStay != null) marks.push({ key: "minStay", kind: "stay", label: `Min ${state.minStay}` });
  if (state.maxStay != null) marks.push({ key: "maxStay", kind: "stay", label: `Max ${state.maxStay}` });
  return marks;
}

export function restrictionMarkClass(kind: RestrictionMarkKind): string {
  if (kind === "stopSell") {
    return "rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-700";
  }
  
  if (kind === "cta" || kind === "ctd") {
    return "rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700";
  }
  
  return "rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700";
}

export function toRestrictionCalendarCell(cell: RateCalendarCell): RestrictionCalendarCell {
  const marks = restrictionMarks(cell.restriction);
  return {
    date: cell.date,
    roomTypeId: cell.roomTypeId,
    ratePlanId: cell.ratePlanId,
    restriction: cell.restriction,
    restrictionExpectedVersion: cell.restrictionExpectedVersion ?? restrictionVersionToken(null),
    restrictionLabel: cell.restrictionLabel,
    marks,
    hasRestriction: marks.length > 0,
    inventory: cell.inventory,
    planActive: cell.planActive,
    outsideValidity: cell.outsideValidity,
  };
}

export function toRestrictionCalendar(model: RateCalendarWorkspace): RestrictionCalendarWorkspace {
  return {
    ...model,
    groups: model.groups.map((group) => toRestrictionCalendarGroup(group)),
  };
}

export function toRestrictionCalendarGroup(group: RateCalendarGroup): RestrictionCalendarGroup {
  return {
    roomType: group.roomType,
    rows: group.rows.map((row) => ({
      plan: row.plan,
      cells: row.cells.map(toRestrictionCalendarCell),
    })),
  };
}

export function parseStayInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export function changedRestrictionFields(
  current: RestrictionState,
  draft: RestrictionState,
): RestrictionChangeFields {
  const fields: RestrictionChangeFields = {};
  for (const key of restrictionChangedFields(current, draft)) {
    if (key === "minStay") fields.minStay = draft.minStay;
    if (key === "maxStay") fields.maxStay = draft.maxStay;
    if (key === "closedToArrival") fields.closedToArrival = draft.closedToArrival;
    if (key === "closedToDeparture") fields.closedToDeparture = draft.closedToDeparture;
    if (key === "stopSell") fields.stopSell = draft.stopSell;
  }
  return fields;
}

export function formatRestrictionFieldValue(
  key: RestrictionFieldKey,
  value: RestrictionState[RestrictionFieldKey],
): string {
  if (key === "minStay" || key === "maxStay") {
    return value == null ? "—" : `${value} nights`;
  }
  if (key === "closedToArrival" || key === "closedToDeparture") {
    return value ? "Closed" : "Open";
  }
  return value ? "On" : "Off";
}

export function restrictionActionLabel(actionType: string): string {
  if (actionType === "clear_restriction") return "Clear restriction";
  if (actionType === "bulk_restriction_change") return "Bulk restriction change";
  return "Restriction change";
}

export function restrictionSourceLabel(source: string): string {
  if (source === "restriction_calendar") return "Restriction Calendar";
  if (source === "rate_revenue") return "Rate & Revenue";
  return source;
}

export function restrictionActorLabel(row: { actorName: string | null; actorMembershipId: string | null }): string {
  return row.actorName?.trim() || "Staff";
}

export function isRestrictionStaleMessage(message: string): boolean {
  return /RESTRICTION_CHANGE_STALE|changed by someone else|changed after this preview/i.test(message);
}

export function humanizeRestrictionCalendarError(message: string): string {
  if (isRestrictionStaleMessage(message)) return RESTRICTION_CALENDAR_STALE_COPY;
  return message;
}

export function emptyRestrictionDraft(): RestrictionState {
  return emptyRestrictionState();
}

export { restrictionChangedFields };
