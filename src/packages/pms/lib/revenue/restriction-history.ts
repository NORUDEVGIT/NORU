/**
 * Restriction Change History (UI-11) display helpers.
 * Reads hotel_rate_restriction_change_events only. created_at range is
 * "Changed Between". History starts at migration 0102 — no pre-0102 backfill.
 *
 * saveRateRestriction remains an unmounted compatibility writer.
 */

import { historyPaginationRange } from "./rate-history.ts";
import {
  RESTRICTION_ACTION_TYPES,
  RESTRICTION_FIELD_KEYS,
  RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE,
  isEmptyRestriction,
  restrictionChangedFields,
  type RestrictionActionType,
  type RestrictionFieldKey,
  type RestrictionHistoryRow,
  type RestrictionOperationDetail,
  type RestrictionState,
} from "./restriction-change.ts";
import { formatRestrictionFieldValue } from "./restriction-calendar.ts";

export const RESTRICTION_HISTORY_EMPTY_COPY =
  "No restriction changes have been recorded since restriction history was enabled.";
export const RESTRICTION_HISTORY_EMPTY_SECONDARY =
  "Earlier restriction changes are not available in this history.";
export const RESTRICTION_HISTORY_PAGE_SIZES = [10, 25, 50] as const;
export const RESTRICTION_HISTORY_PAGE_SIZE = RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE;
export const RESTRICTION_HISTORY_REASON_EMPTY = "No reason provided";
export const RESTRICTION_HISTORY_CLEARED_COPY = "No restrictions";

export const RESTRICTION_HISTORY_FIELD_LABELS: Record<RestrictionFieldKey, string> = {
  minStay: "Min Stay",
  maxStay: "Max Stay",
  closedToArrival: "CTA",
  closedToDeparture: "CTD",
  stopSell: "Stop Sell",
};

export function restrictionHistoryActionLabel(actionType: RestrictionActionType | string): string {
  if (actionType === "bulk_restriction_change") return "Bulk Restriction Change";
  if (actionType === "clear_restriction") return "Clear Restrictions";
  return "Single Restriction Change";
}

export function restrictionHistorySourceLabel(source: string): string {
  if (source === "restriction_calendar") return "Restriction Calendar";
  if (source === "rate_revenue") return "Rate & Revenue";
  return source;
}

export function restrictionHistoryActorLabel(row: {
  actorName?: string | null;
  actorMembershipId?: string | null;
}): string {
  if (row.actorName && row.actorName.trim()) return row.actorName;
  return "Staff";
}

export function restrictionHistoryReasonLabel(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  return trimmed === "" ? RESTRICTION_HISTORY_REASON_EMPTY : trimmed;
}

export function restrictionHistoryChangedFields(row: {
  previous: RestrictionState;
  next: RestrictionState;
}): RestrictionFieldKey[] {
  return restrictionChangedFields(row.previous, row.next);
}

export function restrictionHistoryFieldLabel(key: RestrictionFieldKey): string {
  return RESTRICTION_HISTORY_FIELD_LABELS[key];
}

export function restrictionHistorySnapshotLine(
  state: RestrictionState,
  fields: RestrictionFieldKey[],
): string {
  if (fields.length === 0) return "—";
  return fields
    .map((field) => `${RESTRICTION_HISTORY_FIELD_LABELS[field]}: ${formatRestrictionFieldValue(field, state[field])}`)
    .join(" · ");
}

export function restrictionHistoryBeforeLabel(row: RestrictionHistoryRow): string {
  const fields = restrictionHistoryChangedFields(row);
  return restrictionHistorySnapshotLine(row.previous, fields);
}

export function restrictionHistoryAfterLabel(row: RestrictionHistoryRow): string {
  if (row.actionType === "clear_restriction" || isEmptyRestriction(row.next)) {
    return RESTRICTION_HISTORY_CLEARED_COPY;
  }
  const fields = restrictionHistoryChangedFields(row);
  return restrictionHistorySnapshotLine(row.next, fields);
}

export function restrictionHistoryBeforeAfter(row: RestrictionHistoryRow): string {
  const fields = restrictionHistoryChangedFields(row);
  if (fields.length === 0) return "No change";
  if (row.actionType === "clear_restriction" || isEmptyRestriction(row.next)) {
    return `${restrictionHistorySnapshotLine(row.previous, fields)} → ${RESTRICTION_HISTORY_CLEARED_COPY}`;
  }
  return fields
    .map((field) => {
      const before = formatRestrictionFieldValue(field, row.previous[field]);
      const after = formatRestrictionFieldValue(field, row.next[field]);
      return `${RESTRICTION_HISTORY_FIELD_LABELS[field]}: ${before} → ${after}`;
    })
    .join("; ");
}

export function summarizeRestrictionOperation(detail: RestrictionOperationDetail) {
  const dates = new Set<string>();
  const plans = new Set<string>();
  for (const event of detail.events) {
    dates.add(event.stayDate);
    plans.add(event.ratePlanId);
  }
  return {
    targetCount: detail.events.length,
    ratePlanCount: plans.size,
    dateCount: dates.size,
  };
}

export function restrictionHistoryEventSummary(row: RestrictionHistoryRow): string {
  return `${restrictionHistoryActionLabel(row.actionType)} · ${row.ratePlanCode ?? "Plan"} · ${row.stayDate}`;
}

export { historyPaginationRange, RESTRICTION_ACTION_TYPES, RESTRICTION_FIELD_KEYS };
