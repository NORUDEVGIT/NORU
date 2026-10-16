/**
 * Bulk Apply Restriction (UI-09) + Impact Review (UI-10) helpers.
 * Target expansion and review composition only. Preview/apply stay on the
 * official restriction-change domain. Occupancy is joined from the calendar
 * read model (first 14 days; later dates show "—").
 *
 * Template prefill is deferred: Card 3 kinds exclude max stay, roomTypeIds
 * do not map cleanly to plan×date targets, and the workspace does not load
 * commercial restriction masters. Template apply stays out of this wizard.
 */

import {
  expandBulkTargets,
  plansForSelectedRoomTypes,
  prunePlanIdsForRoomTypes,
  buildInventoryLookup,
  inventoryLookupKey,
  inclusiveDayCount,
  eachBulkDate,
  uniqueIds,
  type BulkInventoryLookup,
  type BulkTargetExpansion,
} from "./bulk-rate-change.ts";
import {
  RESTRICTION_CHANGE_MAX_TARGETS,
  RESTRICTION_FIELD_KEYS,
  RESTRICTION_STAY_LIMIT,
  restrictionFieldCount,
  type RestrictionChangeFields,
  type RestrictionChangeOperation,
  type RestrictionChangePreviewItem,
  type RestrictionFieldKey,
} from "./restriction-change.ts";
import { formatRestrictionFieldValue, parseStayInput } from "./restriction-calendar.ts";

export const BULK_RESTRICTION_STALE_COPY =
  "One or more restrictions changed after this preview. Refresh and review again.";

export const BULK_RESTRICTION_SUCCESS_COPY = "Restrictions applied.";

export const BULK_RESTRICTION_IMPACT_COPY =
  "This preview shows the operational restriction changes that will be applied. Existing reservations are not cancelled, repriced, or amended.";

export const BULK_RESTRICTION_EXISTING_RESERVATION_COPY =
  "Existing reservations stay as booked. Restriction changes apply to future pricing and validation only.";

export const BULK_RESTRICTION_STOP_SELL_OCCUPIED_COPY =
  "Stop sell is being applied on one or more dates with existing occupancy. This does not cancel those reservations.";

export const BULK_RESTRICTION_STOP_SELL_COPY =
  "Stop sell is checked for every occupied night of a future stay. Existing reservations are not cancelled.";

export const BULK_RESTRICTION_CTA_CTD_COPY =
  "Closed to arrival is checked on the arrival date. Closed to departure is checked on the departure date. Existing reservations are not changed.";

export const BULK_RESTRICTION_CLEAR_COPY =
  "Removes all operational restrictions for every selected rate plan and stay date. This deletes the operational row.";

export const BULK_RESTRICTION_OVER_MAX_COPY = `This selection exceeds the ${RESTRICTION_CHANGE_MAX_TARGETS}-change limit. Narrow the date range or selected plans.`;

export const RESTRICTION_FIELD_LABELS: Record<RestrictionFieldKey, string> = {
  minStay: "Min stay",
  maxStay: "Max stay",
  closedToArrival: "CTA",
  closedToDeparture: "CTD",
  stopSell: "Stop sell",
};

export type RestrictionStayTriState = {
  mode: "unchanged" | "set" | "clear";
  value: string;
};

export type RestrictionBooleanTriState = {
  mode: "unchanged" | "on" | "off";
};

export type RestrictionTriStatePatch = {
  minStay: RestrictionStayTriState;
  maxStay: RestrictionStayTriState;
  closedToArrival: RestrictionBooleanTriState;
  closedToDeparture: RestrictionBooleanTriState;
  stopSell: RestrictionBooleanTriState;
};

export type RestrictionOperationBuild =
  | { ok: true; operation: RestrictionChangeOperation }
  | { ok: false; message: string };

export type RestrictionFieldsBuild =
  | { ok: true; fields: RestrictionChangeFields }
  | { ok: false; message: string };

export type RestrictionReviewRow = RestrictionChangePreviewItem & {
  occupancyPercent: number | null;
  roomsSold: number | null;
  roomsAvailable: number | null;
};

export type RestrictionPreviewSummary = {
  affectedDates: number;
  affectedRatePlans: number;
  affectedRoomTypes: number;
  changedFields: RestrictionFieldKey[];
  validTargets: number;
  invalidTargets: number;
  targetCount: number;
  occupiedStopSellCount: number;
};

const VALIDATION_COPY: Record<string, string> = {
  RESTRICTION_PLAN_NOT_FOUND: "That rate plan doesn't belong to this property.",
  RESTRICTION_CHANGE_STALE: BULK_RESTRICTION_STALE_COPY,
  RESTRICTION_INVALID_DATE: "Use a valid YYYY-MM-DD date.",
  RESTRICTION_DUPLICATE_TARGET: "The same rate plan and date cannot appear twice in one change.",
  RESTRICTION_MIN_STAY_INVALID: "Min stay must be empty or an integer from 1 to 365.",
  RESTRICTION_MAX_STAY_INVALID: "Max stay must be empty or an integer from 1 to 365.",
  RESTRICTION_STAY_RANGE_INVALID: "Max stay cannot be shorter than min stay.",
  RESTRICTION_NO_FIELDS: "Provide at least one restriction field to change.",
  RESTRICTION_TARGET_LIMIT: BULK_RESTRICTION_OVER_MAX_COPY,
  RESTRICTION_CHANGE_FORBIDDEN: "You don't have access to change restrictions for this property.",
  RESTRICTION_CHANGE_EMPTY: "Select at least one date to change.",
  RESTRICTION_CHANGE_UNSUPPORTED: "That restriction change is not supported.",
};

export function emptyTriStatePatch(): RestrictionTriStatePatch {
  return {
    minStay: { mode: "unchanged", value: "" },
    maxStay: { mode: "unchanged", value: "" },
    closedToArrival: { mode: "unchanged" },
    closedToDeparture: { mode: "unchanged" },
    stopSell: { mode: "unchanged" },
  };
}

function stayFromTriState(
  state: RestrictionStayTriState,
  field: "minStay" | "maxStay",
): RestrictionFieldsBuild {
  if (state.mode === "unchanged") return { ok: true, fields: {} };
  if (state.mode === "clear") return { ok: true, fields: { [field]: null } };
  const parsed = parseStayInput(state.value);
  if (parsed == null || !Number.isInteger(parsed) || parsed < 1 || parsed > RESTRICTION_STAY_LIMIT) {
    return {
      ok: false,
      message:
        field === "minStay"
          ? "Min stay must be an integer from 1 to 365."
          : "Max stay must be an integer from 1 to 365.",
    };
  }
  return { ok: true, fields: { [field]: parsed } };
}

function booleanFromTriState(
  state: RestrictionBooleanTriState,
  field: "closedToArrival" | "closedToDeparture" | "stopSell",
): RestrictionChangeFields {
  if (state.mode === "unchanged") return {};
  return { [field]: state.mode === "on" };
}

export function fieldsFromTriState(patch: RestrictionTriStatePatch): RestrictionFieldsBuild {
  const min = stayFromTriState(patch.minStay, "minStay");
  if (!min.ok) return min;
  const max = stayFromTriState(patch.maxStay, "maxStay");
  if (!max.ok) return max;

  const fields: RestrictionChangeFields = {
    ...min.fields,
    ...max.fields,
    ...booleanFromTriState(patch.closedToArrival, "closedToArrival"),
    ...booleanFromTriState(patch.closedToDeparture, "closedToDeparture"),
    ...booleanFromTriState(patch.stopSell, "stopSell"),
  };

  if (
    Object.prototype.hasOwnProperty.call(fields, "minStay") &&
    Object.prototype.hasOwnProperty.call(fields, "maxStay") &&
    fields.minStay != null &&
    fields.maxStay != null &&
    fields.maxStay < fields.minStay
  ) {
    return { ok: false, message: "Max stay cannot be shorter than min stay." };
  }

  return { ok: true, fields };
}

export function triStateChangedCount(patch: RestrictionTriStatePatch): number {
  const built = fieldsFromTriState(patch);
  if (!built.ok) {
    return RESTRICTION_FIELD_KEYS.filter((key) => {
      if (key === "minStay") return patch.minStay.mode !== "unchanged";
      if (key === "maxStay") return patch.maxStay.mode !== "unchanged";
      return patch[key].mode !== "unchanged";
    }).length;
  }
  return restrictionFieldCount(built.fields);
}

export function buildRestrictionOperation(input: {
  type: "SET_FIELDS" | "CLEAR_ALL";
  patch: RestrictionTriStatePatch;
}): RestrictionOperationBuild {
  if (input.type === "CLEAR_ALL") return { ok: true, operation: { type: "CLEAR_ALL" } };
  const built = fieldsFromTriState(input.patch);
  if (!built.ok) return built;
  if (restrictionFieldCount(built.fields) < 1) {
    return { ok: false, message: "Change at least one restriction field, or choose Clear all." };
  }
  return { ok: true, operation: { type: "SET_FIELDS", fields: built.fields } };
}

export function joinRestrictionPreviewInventory(
  items: RestrictionChangePreviewItem[],
  lookup: BulkInventoryLookup,
): RestrictionReviewRow[] {
  return items.map((item) => {
    const inventory = item.roomTypeId ? lookup.get(inventoryLookupKey(item.roomTypeId, item.date)) : undefined;
    return {
      ...item,
      occupancyPercent: inventory?.occupancyPercent ?? null,
      roomsSold: inventory?.roomsSold ?? null,
      roomsAvailable: inventory?.roomsAvailable ?? null,
    };
  });
}

export function summarizeRestrictionPreview(items: RestrictionChangePreviewItem[]): RestrictionPreviewSummary {
  const dates = new Set<string>();
  const plans = new Set<string>();
  const types = new Set<string>();
  const changed = new Set<RestrictionFieldKey>();
  let validTargets = 0;
  let invalidTargets = 0;

  for (const item of items) {
    dates.add(item.date);
    plans.add(item.ratePlanId);
    if (item.roomTypeId) types.add(item.roomTypeId);
    if (item.validationStatus === "valid") validTargets += 1;
    else invalidTargets += 1;
    for (const field of item.changedFields) changed.add(field);
  }

  return {
    affectedDates: dates.size,
    affectedRatePlans: plans.size,
    affectedRoomTypes: types.size,
    changedFields: RESTRICTION_FIELD_KEYS.filter((key) => changed.has(key)),
    validTargets,
    invalidTargets,
    targetCount: items.length,
    occupiedStopSellCount: 0,
  };
}

export function countOccupiedStopSell(rows: RestrictionReviewRow[]): number {
  return rows.filter((row) => row.after.stopSell && (row.roomsSold ?? 0) > 0).length;
}

export function withOccupiedStopSell(summary: RestrictionPreviewSummary, rows: RestrictionReviewRow[]): RestrictionPreviewSummary {
  return { ...summary, occupiedStopSellCount: countOccupiedStopSell(rows) };
}

export function humanizeRestrictionField(key: RestrictionFieldKey): string {
  return RESTRICTION_FIELD_LABELS[key];
}

export function formatRestrictionBeforeAfter(item: RestrictionChangePreviewItem): string {
  if (item.changedFields.length === 0) return "No change";
  return item.changedFields
    .map((field) => {
      const before = formatRestrictionFieldValue(field, item.before[field]);
      const after = formatRestrictionFieldValue(field, item.after[field]);
      return `${RESTRICTION_FIELD_LABELS[field]}: ${before} → ${after}`;
    })
    .join("; ");
}

export function humanizeRestrictionValidation(code: string): string {
  if (isRestrictionBulkStaleMessage(code)) return BULK_RESTRICTION_STALE_COPY;
  return VALIDATION_COPY[code] ?? code;
}

export function humanizeRestrictionMessages(messages: string[]): string[] {
  return messages.map(humanizeRestrictionValidation);
}

export function isRestrictionBulkStaleMessage(message: string): boolean {
  return /RESTRICTION_CHANGE_STALE|changed after this preview|changed by someone else/i.test(message);
}

export function expectedVersionsFromRestrictionPreview(items: RestrictionChangePreviewItem[]) {
  return items.map((item) => ({
    ratePlanId: item.ratePlanId,
    date: item.date,
    expectedVersion: item.expectedVersion,
  }));
}

export function reviewTurnsOnCtaOrCtd(items: RestrictionChangePreviewItem[]): boolean {
  return items.some(
    (item) =>
      item.changedFields.includes("closedToArrival") || item.changedFields.includes("closedToDeparture"),
  );
}

export function reviewTurnsOnStopSell(items: RestrictionChangePreviewItem[]): boolean {
  return items.some((item) => item.changedFields.includes("stopSell") && item.after.stopSell);
}

export {
  expandBulkTargets,
  plansForSelectedRoomTypes,
  prunePlanIdsForRoomTypes,
  buildInventoryLookup,
  inventoryLookupKey,
  inclusiveDayCount,
  eachBulkDate,
  uniqueIds,
  RESTRICTION_CHANGE_MAX_TARGETS,
};

export type { BulkInventoryLookup, BulkTargetExpansion };
