/**
 * Canonical server read of the property's current hotel day.
 *
 * Writes never take a business date from the client: the database stamps
 * business_date on insert (0208). This read is for daily totals and checks
 * that must agree with that stamp.
 */
import {
  BUSINESS_DATE_UNRESOLVED,
  strictPropertyBusinessDate,
} from "./reservation-workspace/business-date";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type CurrentPropertyBusinessDate = {
  businessDate: string;
  /** Null until the first close. */
  persistedBusinessDate: string | null;
  timezone: string;
  currency: string;
};

export async function resolveCurrentPropertyBusinessDate(
  admin: Admin,
  restaurantId: string,
): Promise<CurrentPropertyBusinessDate> {
  const { data, error } = await admin
    .from("restaurants")
    .select("business_date, timezone, currency_code")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(BUSINESS_DATE_UNRESOLVED);
  const row = data as {
    business_date: string | null;
    timezone: string | null;
    currency_code: string | null;
  } | null;
  const resolved = strictPropertyBusinessDate(row);
  return { ...resolved, currency: row?.currency_code || "GBP" };
}
