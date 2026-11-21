import { propertyToday } from "../../../../shared/lib/property-dates.ts";
import { isValidTimeZone } from "../../../../shared/lib/property-time.ts";

/**
 * Setup / pre-live helper only.
 * Persisted hotel day when present; otherwise property-local calendar today.
 * Operational live modules must not use this as their hotel-day source.
 */
export function resolvePropertyBusinessDate(
  persistedBusinessDate: string | null,
  timezone: string,
): string {
  return persistedBusinessDate ?? propertyToday(timezone);
}

export const BUSINESS_DATE_UNRESOLVED = "BUSINESS_DATE_UNRESOLVED";

/** Thrown when a live/operational path needs restaurants.business_date and it is null. */
export const BUSINESS_DATE_MISSING = "BUSINESS_DATE_MISSING";

export const BUSINESS_DATE_MISSING_MESSAGE =
  "Hotel business date is not configured. Complete Go-Live business-date initialization before using this module.";

export type ResolvedPropertyBusinessDate = {
  businessDate: string;
  persistedBusinessDate: string | null;
  timezone: string;
};

function timezoneOf(row: { timezone: string | null } | null | undefined): string {
  return row?.timezone?.trim() || "UTC";
}

function persistedOf(row: { business_date: string | null } | null | undefined): string | null {
  return row?.business_date ? String(row.business_date).slice(0, 10) : null;
}

/**
 * Operational hotel day for live PMS modules.
 * Requires restaurants.business_date — never invents wall-clock / UTC / browser today.
 */
export function requirePersistedBusinessDate(
  row: { business_date: string | null; timezone: string | null } | null | undefined,
): ResolvedPropertyBusinessDate {
  if (!row) throw new Error(BUSINESS_DATE_UNRESOLVED);
  const persisted = persistedOf(row);
  const timezone = timezoneOf(row);
  if (!persisted) {
    throw new Error(BUSINESS_DATE_MISSING_MESSAGE);
  }
  if (timezone !== "UTC" && !isValidTimeZone(timezone) && !row.timezone?.trim()) {
    throw new Error(BUSINESS_DATE_UNRESOLVED);
  }
  return {
    businessDate: persisted,
    persistedBusinessDate: persisted,
    timezone: row.timezone?.trim() ? timezone : "UTC",
  };
}

/**
 * Strict operational form for writes and daily totals.
 * Same contract as requirePersistedBusinessDate: no calendar invent.
 */
export function strictPropertyBusinessDate(
  row: { business_date: string | null; timezone: string | null } | null | undefined,
): ResolvedPropertyBusinessDate {
  return requirePersistedBusinessDate(row);
}

/**
 * Read helper for loaders that already selected business_date + timezone.
 * Prefer this over resolvePropertyBusinessDate in FO / HK / Cashiering / Reports.
 */
export function operationalBusinessDate(
  businessDate: string | null | undefined,
  timezone: string | null | undefined,
): string {
  return requirePersistedBusinessDate({
    business_date: businessDate ?? null,
    timezone: timezone ?? null,
  }).businessDate;
}
