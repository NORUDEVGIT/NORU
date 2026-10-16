/**
 * Provider BuyerDetails.Region is a numeric code, not a place name.
 *
 * A human-readable NORU region stays on the company or guest record. New B2B
 * invoice requests send it only when it is already a 1–3 digit code. Names are
 * not guessed, and stored fiscal snapshots are not rewritten here.
 */

const FISCAL_REGION_CODE = /^[0-9]{1,3}$/;

export function normalizeFiscalRegion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!FISCAL_REGION_CODE.test(trimmed)) return null;
  return trimmed;
}
