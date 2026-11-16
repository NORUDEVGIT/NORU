/**
 * NORU PMS — Predefined Early Departure Policy Catalogue
 *
 * Application-level catalogue for Card 2 Rate & Pricing.
 * Stored in pms_early_departure_policies only when selected.
 *
 * Early departure = guest leaves before the booked departure DATE.
 * Check-in / check-out TIME rules stay in Property Setup.
 */

import type { EarlyDeparturePenaltyType } from "./early-departure-policy";
import type { RateEarlyDeparturePolicyRow } from "./rates-card2.server";

export type PredefinedEarlyDeparturePolicy = {
  code: string;
  name: string;
  summary: string;
  description: string;
  legacyCodes?: readonly string[];
  penaltyType: EarlyDeparturePenaltyType;
  /** Required when penaltyType is percent_stay or fixed_amount. */
  penaltyValue: number;
};

export const PREDEFINED_EARLY_DEPARTURE_POLICIES: readonly PredefinedEarlyDeparturePolicy[] = [
  {
    code: "EARLY_NONE",
    name: "No Early Departure Charge",
    summary: "Guest may shorten the stay without an early-departure penalty.",
    description: "No early-departure charge when the guest departs before the reserved departure date.",
    penaltyType: "none",
    penaltyValue: 0,
  },
  {
    code: "EARLY_FIRST_NIGHT",
    name: "First Night Penalty",
    summary: "Charge one night when the guest departs before the reserved departure date.",
    description: "Charge the first night when the guest shortens the stay before the reserved departure date.",
    /** EARLY_ONE_NIGHT / One Additional Night previously aliased the same first_night rule — keep codes for match only. */
    legacyCodes: ["EARLY_ONE_NIGHT", "EARLY_ADD_NIGHT"],
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "EARLY_50",
    name: "50% of Remaining Stay",
    summary: "Charge 50% of the unused reserved nights.",
    description:
      "Charge 50% of the unused reserved stay when the guest departs early (percent_stay against remaining room amount).",
    penaltyType: "percent_stay",
    penaltyValue: 50,
  },
  {
    code: "EARLY_FULL",
    name: "Full Remaining Stay",
    summary: "Charge the unused balance of the reserved stay.",
    description: "Charge the unused balance of the reserved stay when the guest departs early.",
    penaltyType: "full_stay",
    penaltyValue: 0,
  },
  {
    code: "EARLY_FIXED",
    name: "Fixed Amount Penalty",
    summary: "Apply a property-defined fixed early-departure charge.",
    description:
      "Apply a fixed early-departure charge. Default amount is a starter value — edit the policy to set the property amount.",
    penaltyType: "fixed_amount",
    /** Starter value required by validation (must be > 0); hotels should edit after add. */
    penaltyValue: 100,
  },
] as const;

export function normalizeEarlyDeparturePolicyKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isPredefinedEarlyDepartureConfigured(
  preset: PredefinedEarlyDeparturePolicy,
  configured: readonly RateEarlyDeparturePolicyRow[],
): boolean {
  const presetCode = preset.code.toUpperCase().trim();
  const presetLegacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const presetNorm = normalizeEarlyDeparturePolicyKey(preset.name);
  const presetNameLower = preset.name.toLowerCase().trim();

  return configured.some((row) => {
    const rowCode = (row.code ?? "").toUpperCase().trim();
    if (rowCode === presetCode || presetLegacy.includes(rowCode)) return true;
    const rowNameLower = (row.name ?? "").toLowerCase().trim();
    if (rowNameLower === presetNameLower) return true;
    const rowNorm = normalizeEarlyDeparturePolicyKey(row.name ?? "");
    return Boolean(rowNorm && rowNorm === presetNorm);
  });
}

export function findMatchingPredefinedEarlyDeparture(
  name: string,
  code?: string,
): PredefinedEarlyDeparturePolicy | undefined {
  const normName = normalizeEarlyDeparturePolicyKey(name);
  const lowerName = name.toLowerCase().trim();
  const upperCode = code ? code.toUpperCase().trim() : "";

  return PREDEFINED_EARLY_DEPARTURE_POLICIES.find((preset) => {
    if (upperCode) {
      if (preset.code.toUpperCase() === upperCode) return true;
      if (preset.legacyCodes?.some((lc) => lc.toUpperCase() === upperCode)) return true;
    }
    if (lowerName && preset.name.toLowerCase().trim() === lowerName) return true;
    const pNorm = normalizeEarlyDeparturePolicyKey(preset.name);
    return Boolean(normName && normName === pNorm);
  });
}
