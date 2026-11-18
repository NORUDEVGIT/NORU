/**
 * Payment method setup code from a display name.
 * Matches setupCode: uppercase letters, numbers, underscores; max 20.
 * Client convenience only — server uniqueness remains authoritative.
 */

import { suggestTaxSetupCode } from "./taxes-card3-code.ts";

export function suggestPaymentMethodCode(name: string): string {
  return suggestTaxSetupCode(name);
}
