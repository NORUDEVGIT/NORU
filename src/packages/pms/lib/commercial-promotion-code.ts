/**
 * Promotion setup code from a display name.
 * Matches pms_promotions code check: uppercase letters, numbers, underscores; max 20.
 * Client convenience only — server uniqueness remains authoritative.
 */

import { suggestTaxSetupCode, taxSetupCodeIsTaken } from "./taxes-card3-code.ts";

export const PROMOTION_CODE_MAX = 20;

export function suggestPromotionCode(name: string): string {
  return suggestTaxSetupCode(name);
}

export function promotionCodeIsTaken(
  code: string,
  existingCodes: readonly string[],
  savedCode?: string | null,
): boolean {
  return taxSetupCodeIsTaken(code, existingCodes, savedCode);
}

export function isValidPromotionCode(code: string): boolean {
  return /^[A-Z0-9_]{1,20}$/.test(code.trim().toUpperCase());
}
