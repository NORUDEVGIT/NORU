/**
 * Bulk Rate Change (UI-04) + Impact Review (UI-05) helpers.
 * Target expansion and review composition only. Preview/apply stay on the
 * official rate-change domain. Occupancy is joined from the calendar read model.
 */

import {
  RATE_CHANGE_MAX_TARGETS,
  isIsoDate,
  type RateChangePreviewItem,
  type RateChangeRule,
  type RateChangeTarget,
} from "./rate-change.ts";
import type { RateCalendarInventory, RateCalendarWorkspace } from "./rate-calendar.ts";

export const BULK_RATE_CHANGE_STALE_COPY =
  "One or more rates changed after this preview. Refresh and review the changes again.";

export const BULK_RATE_CHANGE_SUCCESS_COPY = "Rate changes applied.";

export const BULK_RATE_CHANGE_IMPACT_COPY =
  "This preview shows the operational rate changes that will be applied. Existing reservation pricing snapshots are not changed.";

export const BULK_RATE_CHANGE_PERCENT_COPY =
  "Percentage change is calculated from each date's current effective rate.";

export const BULK_RATE_CHANGE_RESET_COPY =
  "Reset to Base Rate removes the date-specific override. It does not write the base rate into the calendar.";

export const BULK_RATE_CHANGE_OVER_MAX_COPY = `This selection exceeds the ${RATE_CHANGE_MAX_TARGETS}-change limit. Narrow the date range or selected plans.`;

export type BulkPlanRef = {
  id: string;
  roomTypeId: string;
  currency?: string | null;
};

export type BulkTargetExpansion =
  | { ok: true; targets: RateChangeTarget[]; dates: string[]; targetCount: number }
  | {
      ok: false;
      code: "empty" | "invalid_range" | "over_max";
      dates: string[];
      targetCount: number;
    };

export type BulkInventoryLookup = Map<string, RateCalendarInventory>;

export type BulkReviewRow = RateChangePreviewItem & {
  occupancyPercent: number | null;
  roomsSold: number | null;
  roomsAvailable: number | null;
};

export type BulkPreviewSummary = {
  affectedDates: number;
  affectedRatePlans: number;
  affectedRoomTypes: number;
  validTargets: number;
  invalidTargets: number;
  targetCount: number;
  averageAbsoluteDelta: number | null;
};

const VALIDATION_COPY: Record<string, string> = {
  RATE_PLAN_INACTIVE: "This rate plan is inactive.",
  RATE_PLAN_OUT_OF_RANGE: "This date is outside the rate plan validity window.",
  RATE_PLAN_NOT_FOUND: "This rate plan was not found for this property.",
  RATE_CHANGE_DUPLICATE: "This date and rate plan were selected more than once.",
  RATE_CHANGE_INVALID_DATE: "This date is not valid.",
  RATE_CHANGE_NEGATIVE: "The proposed rate cannot be negative.",
  RATE_CHANGE_OVER_MAX: "The proposed rate is above the allowed maximum.",
  RATE_CHANGE_STALE: BULK_RATE_CHANGE_STALE_COPY,
  RATE_CHANGE_UNSUPPORTED: "This change is not supported.",
  RATE_CHANGE_SOURCE_INVALID: "The copy-from date is not valid for this plan.",
};

export function inclusiveDayCount(fromDate: string, toDate: string): number | null {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) return null;
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function eachBulkDate(fromDate: string, toDate: string): string[] {
  const days = inclusiveDayCount(fromDate, toDate);
  if (days == null || days > RATE_CHANGE_MAX_TARGETS) return [];
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function plansForSelectedRoomTypes<T extends BulkPlanRef>(plans: T[], roomTypeIds: string[]): T[] {
  const selected = uniqueIds(roomTypeIds);
  if (selected.length === 0) return plans;
  const allowed = new Set(selected);
  return plans.filter((plan) => allowed.has(plan.roomTypeId));
}

export function prunePlanIdsForRoomTypes(
  planIds: string[],
  plans: BulkPlanRef[],
  roomTypeIds: string[],
): string[] {
  const allowed = new Set(plansForSelectedRoomTypes(plans, roomTypeIds).map((plan) => plan.id));
  return uniqueIds(planIds).filter((id) => allowed.has(id));
}

export function uniquePlanCurrencies(plans: BulkPlanRef[]): string[] {
  return [...new Set(plans.map((plan) => (plan.currency ?? "").trim()).filter(Boolean))];
}

export function expandBulkTargets(input: {
  planIds: string[];
  fromDate: string;
  toDate: string;
}): BulkTargetExpansion {
  const planIds = uniqueIds(input.planIds);
  const days = inclusiveDayCount(input.fromDate, input.toDate);
  if (days == null) {
    return { ok: false, code: "invalid_range", dates: [], targetCount: 0 };
  }
  if (planIds.length === 0 || days < 1) {
    return { ok: false, code: "empty", dates: [], targetCount: 0 };
  }

  const targetCount = planIds.length * days;
  if (targetCount > RATE_CHANGE_MAX_TARGETS) {
    return { ok: false, code: "over_max", dates: [], targetCount };
  }

  const dates = eachBulkDate(input.fromDate, input.toDate);
  const targets: RateChangeTarget[] = [];
  for (const ratePlanId of planIds) {
    for (const date of dates) {
      targets.push({ ratePlanId, date });
    }
  }
  return { ok: true, targets, dates, targetCount: targets.length };
}

export function inventoryLookupKey(roomTypeId: string, date: string): string {
  return `${roomTypeId}|${date}`;
}

export function buildInventoryLookup(calendar: RateCalendarWorkspace | null | undefined): BulkInventoryLookup {
  const lookup: BulkInventoryLookup = new Map();
  if (!calendar) return lookup;
  for (const group of calendar.groups) {
    for (const row of group.rows) {
      for (const cell of row.cells) {
        lookup.set(inventoryLookupKey(cell.roomTypeId, cell.date), cell.inventory);
      }
    }
  }
  return lookup;
}

export function joinPreviewInventory(
  items: RateChangePreviewItem[],
  lookup: BulkInventoryLookup,
): BulkReviewRow[] {
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

export function summarizeBulkPreview(items: RateChangePreviewItem[]): BulkPreviewSummary {
  const dates = new Set<string>();
  const plans = new Set<string>();
  const types = new Set<string>();
  let validTargets = 0;
  let invalidTargets = 0;
  const deltas: number[] = [];

  for (const item of items) {
    dates.add(item.date);
    plans.add(item.ratePlanId);
    if (item.roomTypeId) types.add(item.roomTypeId);
    if (item.validationStatus === "valid") validTargets += 1;
    else invalidTargets += 1;
    if (item.absoluteDelta != null) deltas.push(item.absoluteDelta);
  }

  return {
    affectedDates: dates.size,
    affectedRatePlans: plans.size,
    affectedRoomTypes: types.size,
    validTargets,
    invalidTargets,
    targetCount: items.length,
    averageAbsoluteDelta:
      deltas.length === 0 ? null : Math.round((deltas.reduce((sum, value) => sum + value, 0) / deltas.length) * 100) / 100,
  };
}

export function humanizeRateChangeValidation(code: string): string {
  return VALIDATION_COPY[code] ?? (/is in effect/i.test(code) ? code : code);
}

export function humanizeRateChangeMessages(messages: string[]): string[] {
  return messages.map(humanizeRateChangeValidation);
}

export function isBulkStaleMessage(message: string): boolean {
  return /RATE_CHANGE_STALE|changed after this preview|changed by someone else/i.test(message);
}

export function restrictionMarks(item: RateChangePreviewItem): string[] {
  const marks: string[] = [];
  if (item.stopSell) marks.push("Stop Sell");
  if (item.closedToArrival) marks.push("CTA");
  if (item.closedToDeparture) marks.push("CTD");
  if (item.minStay != null) marks.push(`Min ${item.minStay}`);
  if (item.maxStay != null) marks.push(`Max ${item.maxStay}`);
  return marks;
}

export function expectedVersionsFromPreview(items: RateChangePreviewItem[]) {
  return items.map((item) => ({
    ratePlanId: item.ratePlanId,
    date: item.date,
    expectedVersion: item.expectedVersion,
  }));
}

export function buildBulkRule(input: {
  type: RateChangeRule["type"];
  value: string;
  sourceDate: string;
}): RateChangeRule | { ok: false; message: string } {
  if (input.type === "RESET_OVERRIDE") return { type: "RESET_OVERRIDE" };
  if (input.type === "COPY_FROM_DATE") {
    if (!isIsoDate(input.sourceDate)) return { ok: false, message: "Choose a valid copy-from date." };
    return { type: "COPY_FROM_DATE", sourceDate: input.sourceDate };
  }
  const numeric = Number(input.value);
  if (!Number.isFinite(numeric)) return { ok: false, message: "Enter a valid number." };
  if (numeric < 0) return { ok: false, message: "Enter a value of 0 or more." };
  if (input.type === "PERCENT_INCREASE") return { type: "PERCENT_INCREASE", value: numeric };
  if (input.type === "PERCENT_DECREASE") return { type: "PERCENT_DECREASE", value: numeric };
  return { type: "SET_RATE", value: numeric };
}
