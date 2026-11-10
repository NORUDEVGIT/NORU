/**
 * Night Audit shared date and close helpers (pure).
 *
 * close_business_date rolls restaurants.business_date by one calendar day.
 * The End of Day step model lives in night-audit-steps.ts.
 */

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export const NA1_STALE_BUSINESS_DATE =
  "This run is not the current business date. Refresh Night Audit and close the current date.";

/** Next calendar day — the close_business_date roll contract. */
export function nextBusinessDate(businessDate: string): string {
  return addDays(businessDate, 1);
}

/** Historical summaries stored the overstay count in inHouse. Trust inHouse only when overstays is separate. */
export function summaryRoomUnitCount(
  summary: { inHouse?: number; overstays?: number } | null | undefined,
): number | null {
  if (!summary || typeof summary.overstays !== "number" || typeof summary.inHouse !== "number") {
    return null;
  }
  return summary.inHouse;
}

export const NIGHT_AUDIT_OTB_FAILED_NOTICE =
  "Business date closed successfully. OTB snapshot failed.";

export function nightAuditOtbNotice(
  status: "captured" | "already_present" | "failed" | null | undefined,
): string | null {
  return status === "failed" ? NIGHT_AUDIT_OTB_FAILED_NOTICE : null;
}

export function formatNa1Date(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
