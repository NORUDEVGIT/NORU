/**
 * Pricing Season setup code from a display name.
 * Matches pms_seasons code check: uppercase letters, numbers, underscores; max 20.
 * Client convenience only — server uniqueness remains authoritative.
 */

import { suggestTaxSetupCode, taxSetupCodeIsTaken } from "./taxes-card3-code.ts";

export function suggestPricingSeasonCode(name: string): string {
  return suggestTaxSetupCode(name);
}

export function pricingSeasonCodeIsTaken(
  code: string,
  existingCodes: readonly string[],
  savedCode?: string | null,
): boolean {
  return taxSetupCodeIsTaken(code, existingCodes, savedCode);
}

export function isValidPricingSeasonCode(code: string): boolean {
  return /^[A-Z0-9_]{1,20}$/.test(code.trim().toUpperCase());
}
