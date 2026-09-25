import { propertyToday } from "../reservation-dates";

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
