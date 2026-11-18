/**
 * Taxes & Fees setup code from a display name.
 * Matches isSetupCode / pms_* code checks: uppercase letters, numbers,
 * underscores, max 20. Client convenience only — server uniqueness stays
 * authoritative. This module does not suffix collisions.
 *
 * Tokens stay whole (Service Charge → SERVICE_CHARGE). Room-type
 * abbreviations are not applied, so "Value Added Tax" does not become VAT.
 * Percentage taxes may append a rate token when the result still fits
 * (Value Added Tax + 15 → VALUE_ADDED_TAX_15).
 */

export const TAX_SETUP_CODE_MAX = 20;

const CODE_PATTERN = /^[A-Z0-9_]{1,20}$/;

export function suggestTaxSetupCode(
  name: string,
  options?: { percentageRate?: number | null },
): string {
  const base = fitCode(slugName(name));
  if (!base) return "";

  const token = rateToken(options?.percentageRate);
  if (!token) return base;

  const withRate = `${base}_${token}`;
  if (withRate.length <= TAX_SETUP_CODE_MAX && CODE_PATTERN.test(withRate)) return withRate;
  return base;
}

/** True when another saved code already uses this value. A record's own saved code is ignored. */
export function taxSetupCodeIsTaken(
  code: string,
  existingCodes: readonly string[],
  savedCode?: string | null,
): boolean {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return false;
  const saved = savedCode?.trim().toUpperCase() ?? "";
  return existingCodes.some((row) => {
    const other = row.trim().toUpperCase();
    if (!other || other === saved) return false;
    return other === normalized;
  });
}

function slugName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fitCode(code: string): string {
  if (!code) return "";
  if (code.length <= TAX_SETUP_CODE_MAX) return code;
  return code.slice(0, TAX_SETUP_CODE_MAX).replace(/_+$/g, "");
}

function rateToken(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0 || rate > 100) return "";
  const rounded = Math.round(rate * 100) / 100;
  if (!(rounded > 0) || rounded > 100) return "";
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", "_");
  return /^[0-9]+(?:_[0-9]+)?$/.test(text) ? text : "";
}
