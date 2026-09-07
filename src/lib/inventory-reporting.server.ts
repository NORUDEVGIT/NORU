/**
 * Inventory reporting — server-only helpers.
 *
 * Reporting reads the Phase 5A ledger and the Phase 5B asset register without
 * changing either. Date boundaries are always resolved from the restaurant's
 * own calendar day, never the browser's.
 */

import { addDaysIso, localDateInZone, zonedMoment } from "@/shared/lib/property-time";
import type { MovementType } from "./inventory.server";

export const RANGE_PRESETS = ["today", "7d", "30d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface ResolvedRange {
  /** Restaurant-local inclusive start date, `YYYY-MM-DD`. */
  fromDate: string;
  /** Restaurant-local inclusive end date, `YYYY-MM-DD`. */
  toDate: string;
  /** Every local calendar day in the range, ascending. */
  days: string[];
  /** UTC instant for the first millisecond of `fromDate` locally. */
  fromIso: string;
  /** UTC instant immediately after the last millisecond of `toDate` locally. */
  toIso: string;
  /** Restaurant-local "today" the range was resolved against. */
  today: string;
}

const MAX_DAYS = 120;

/**
 * Turns a preset (or a custom pair of local dates) into safe UTC query
 * boundaries. Custom ranges are clamped so a report can't scan forever.
 */
export function resolveRange(
  timeZone: string,
  preset: RangePreset,
  from?: string | null,
  to?: string | null,
): ResolvedRange {
  const today = localDateInZone(timeZone);

  let fromDate = today;
  let toDate = today;
  if (preset === "7d") fromDate = addDaysIso(today, -6);
  else if (preset === "30d") fromDate = addDaysIso(today, -29);
  else if (preset === "custom") {
    fromDate = from || addDaysIso(today, -6);
    toDate = to || today;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  }

  const days: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate && days.length < MAX_DAYS) {
    days.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  // Clamp an over-long custom range to the last MAX_DAYS local days.
  if (days.length === MAX_DAYS && cursor <= toDate) {
    fromDate = addDaysIso(toDate, -(MAX_DAYS - 1));
    days.length = 0;
    let c = fromDate;
    while (c <= toDate) {
      days.push(c);
      c = addDaysIso(c, 1);
    }
  }

  return {
    fromDate,
    toDate,
    days,
    fromIso: zonedMoment(fromDate, "00:00:00", timeZone).toISOString(),
    toIso: zonedMoment(addDaysIso(toDate, 1), "00:00:00", timeZone).toISOString(),
    today,
  };
}

export const MOVEMENT_CATEGORIES = ["stock_in", "usage", "waste", "loss", "adjustment"] as const;
export type MovementCategory = (typeof MOVEMENT_CATEGORIES)[number];

const CATEGORY: Record<MovementType, MovementCategory> = {
  opening_balance: "stock_in",
  purchase_received: "stock_in",
  usage: "usage",
  waste: "waste",
  loss: "loss",
  adjustment_in: "adjustment",
  adjustment_out: "adjustment",
  stocktake_adjustment: "adjustment",
};

export function categoryOf(type: string): MovementCategory {
  return CATEGORY[type as MovementType] ?? "adjustment";
}

/** Only owners and managers see money: valuation, costs, purchase prices. */
export function canViewFinancials(role: string): boolean {
  return role === "owner" || role === "manager";
}

/** Management report tables are owner/manager only. */
export function canViewReports(role: string): boolean {
  return canViewFinancials(role);
}

/**
 * Value of one movement. The movement's own recorded cost wins (that's what the
 * stock was worth at the time); otherwise the item's current cost is used.
 * With neither, the movement has no value and is counted only as an event.
 */
export function movementValue(
  movementUnitCost: number | null,
  itemUnitCost: number | null,
  quantity: number,
): number | null {
  const cost = movementUnitCost ?? itemUnitCost;
  if (cost === null || cost === undefined) return null;
  return Math.abs(quantity) * Number(cost);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Local calendar day for an instant, used to bucket movements into days. */
export function localDayOf(iso: string, timeZone: string): string {
  return localDateInZone(timeZone, new Date(iso));
}
