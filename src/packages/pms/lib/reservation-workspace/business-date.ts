import { propertyToday } from "../../../../shared/lib/property-dates.ts";
import { isValidTimeZone } from "../../../../shared/lib/property-time.ts";

/**
 * Property operational date contract shared with Night Audit and Reservation
 * reads: use the persisted business date, falling back to the property-local
 * calendar date only when the persisted value is absent.
 */
export function resolvePropertyBusinessDate(
  persistedBusinessDate: string | null,
  timezone: string,
): string {
  return persistedBusinessDate ?? propertyToday(timezone);
}

export const BUSINESS_DATE_UNRESOLVED = "BUSINESS_DATE_UNRESOLVED";

/**
 * Strict form for writes and daily totals. Same rule as the database's
 * current_property_business_date: a missing property, or a never-closed
 * property without a valid zone, fails instead of guessing today.
 */
export function strictPropertyBusinessDate(
  row: { business_date: string | null; timezone: string | null } | null | undefined,
): { businessDate: string; persistedBusinessDate: string | null; timezone: string } {
  if (!row) throw new Error(BUSINESS_DATE_UNRESOLVED);
  const persisted = row.business_date ? row.business_date.slice(0, 10) : null;
  const timezone = row.timezone?.trim() ?? "";
  if (!persisted && (!timezone || !isValidTimeZone(timezone))) {
    throw new Error(BUSINESS_DATE_UNRESOLVED);
  }
  return {
    businessDate: resolvePropertyBusinessDate(persisted, timezone),
    persistedBusinessDate: persisted,
    timezone: timezone || "UTC",
  };
}
