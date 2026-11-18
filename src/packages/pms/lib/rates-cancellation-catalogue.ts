/**
 * NORU PMS — Predefined Cancellation Policy Catalogue
 *
 * Application-level catalogue for Card 2 Rate & Pricing.
 * Policies are stored in pms_rate_cancellation_policies only when selected.
 *
 * Persist only values supported by cancellation-policy-rules /
 * pms_rate_cancellation_policies (kind, window, cutoff, penalty).
 * No-show penalties are a separate policy table and are not set here.
 */

import type {
  CancellationPenaltyType,
  CancellationPolicyKind,
  CancellationWindowUnit,
} from "./cancellation-policy-rules";
import {
  CANCELLATION_PENALTY_TYPE_LABELS,
  CANCELLATION_WINDOW_UNIT_LABELS,
} from "./cancellation-policy-rules";
import type { RateCancellationPolicyRow } from "./rates-card2.server";

/** Catalogue-facing kind label (may be broader than persisted policy_kind). */
export type CancellationCatalogueKindLabel =
  | "Flexible"
  | "Non-refundable"
  | "Restricted"
  | "Group"
  | "Long stay";

export type PredefinedCancellationPolicy = {
  code: string;
  name: string;
  /** Short catalogue summary under the name. */
  summary: string;
  /** Display grouping label in the catalogue. */
  catalogueKind: CancellationCatalogueKindLabel;
  description: string;
  legacyCodes?: readonly string[];
  /** Values written to pms_rate_cancellation_policies. */
  policyKind: CancellationPolicyKind;
  windowValue: number | null;
  windowUnit: CancellationWindowUnit;
  cutoffTime: string | null;
  penaltyType: CancellationPenaltyType;
  penaltyValue: number;
};

export const PREDEFINED_CANCELLATION_POLICIES: readonly PredefinedCancellationPolicy[] = [
  {
    code: "FLEX_24",
    name: "Flexible 24 Hours",
    catalogueKind: "Flexible",
    summary: "Free until 24h before arrival · First night after",
    description: "Guests may cancel free of charge until 24 hours before arrival. After that, the first night is charged.",
    policyKind: "flexible",
    windowValue: 24,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "FLEX_48",
    name: "Flexible 48 Hours",
    catalogueKind: "Flexible",
    summary: "Free until 48h before arrival · First night after",
    description: "Guests may cancel free of charge until 48 hours before arrival. After that, the first night is charged.",
    policyKind: "flexible",
    windowValue: 48,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "FLEX_72",
    name: "Flexible 72 Hours",
    catalogueKind: "Flexible",
    summary: "Free until 72h before arrival · First night after",
    description: "Guests may cancel free of charge until 72 hours before arrival. After that, the first night is charged.",
    policyKind: "flexible",
    windowValue: 72,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "SAME_DAY",
    name: "Same Day Flexible",
    catalogueKind: "Flexible",
    summary: "Free until same-day 18:00 cutoff · First night after",
    description:
      "Guests may cancel free of charge until the property-local same-day cutoff (default 18:00). After that, the first night is charged.",
    policyKind: "flexible",
    windowValue: 0,
    windowUnit: "hours_before_arrival",
    cutoffTime: "18:00",
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "NON_REF",
    name: "Non-Refundable",
    catalogueKind: "Non-refundable",
    summary: "No free cancellation · Full stay penalty",
    description: "No free-cancellation window. Any cancellation forfeits the full stay.",
    policyKind: "non_refundable",
    windowValue: null,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "full_stay",
    penaltyValue: 0,
  },
  {
    code: "FIRST_NIGHT_NR",
    name: "First Night Non-Refundable",
    catalogueKind: "Restricted",
    summary: "No free cancellation · First night penalty",
    description:
      "No free-cancellation window. Cancellation forfeits the first night. (Catalogue “Restricted” maps to non-refundable + first-night in this schema.)",
    policyKind: "non_refundable",
    windowValue: null,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "PENALTY_50",
    name: "50% Penalty",
    catalogueKind: "Restricted",
    summary: "Free until 24h before arrival · 50% of stay after",
    description:
      "Free cancellation until 24 hours before arrival; afterwards 50% of the stay is charged. (Window defaulted to 24h — catalogue did not specify a window.)",
    policyKind: "flexible",
    windowValue: 24,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "percentage",
    penaltyValue: 50,
  },
  {
    code: "FULL_STAY",
    name: "Full Stay Penalty",
    catalogueKind: "Restricted",
    summary: "Free until 24h before arrival · Full stay after",
    description:
      "Free cancellation until 24 hours before arrival; afterwards the full stay is charged. (Window defaulted to 24h — catalogue did not specify a window.)",
    policyKind: "flexible",
    windowValue: 24,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "full_stay",
    penaltyValue: 0,
  },
  {
    code: "GROUP_7D",
    name: "Group Booking – 7 Days",
    catalogueKind: "Group",
    summary: "Free until 7 days before arrival · Full stay after",
    description:
      "Group booking cancellation: free until 7 days before arrival; afterwards the full stay is charged. (Catalogue “Group” maps to flexible in this schema.)",
    policyKind: "flexible",
    windowValue: 7,
    windowUnit: "days_before_arrival",
    cutoffTime: null,
    penaltyType: "full_stay",
    penaltyValue: 0,
  },
  {
    code: "GROUP_14D",
    name: "Group Booking – 14 Days",
    catalogueKind: "Group",
    summary: "Free until 14 days before arrival · Full stay after",
    description:
      "Group booking cancellation: free until 14 days before arrival; afterwards the full stay is charged. (Catalogue “Group” maps to flexible in this schema.)",
    policyKind: "flexible",
    windowValue: 14,
    windowUnit: "days_before_arrival",
    cutoffTime: null,
    penaltyType: "full_stay",
    penaltyValue: 0,
  },
  {
    code: "LONG_STAY_7D",
    name: "Long Stay – 7 Days",
    catalogueKind: "Long stay",
    summary: "Free until 7 days before arrival · First night after",
    description:
      "Long-stay cancellation: free until 7 days before arrival; afterwards the first night is charged. (Penalty defaulted to first night — catalogue did not specify penalty.)",
    policyKind: "flexible",
    windowValue: 7,
    windowUnit: "days_before_arrival",
    cutoffTime: null,
    penaltyType: "first_night",
    penaltyValue: 0,
  },
  {
    code: "ADVANCE_PURCHASE",
    name: "Early Booking / Advance Purchase",
    catalogueKind: "Non-refundable",
    summary: "No free cancellation · Full stay penalty",
    description: "Advance-purchase rate: no free-cancellation window; any cancellation forfeits the full stay.",
    policyKind: "non_refundable",
    windowValue: null,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    penaltyType: "full_stay",
    penaltyValue: 0,
  },
] as const;

export function normalizeCancellationPolicyKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isPredefinedCancellationConfigured(
  preset: PredefinedCancellationPolicy,
  configured: readonly RateCancellationPolicyRow[],
): boolean {
  const presetCode = preset.code.toUpperCase().trim();
  const presetLegacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const presetNorm = normalizeCancellationPolicyKey(preset.name);
  const presetNameLower = preset.name.toLowerCase().trim();

  return configured.some((row) => {
    const rowCode = (row.code ?? "").toUpperCase().trim();
    if (rowCode === presetCode || presetLegacy.includes(rowCode)) return true;
    const rowNameLower = (row.name ?? "").toLowerCase().trim();
    if (rowNameLower === presetNameLower) return true;
    const rowNorm = normalizeCancellationPolicyKey(row.name ?? "");
    return Boolean(rowNorm && rowNorm === presetNorm);
  });
}

export function findMatchingPredefinedCancellation(
  name: string,
  code?: string,
): PredefinedCancellationPolicy | undefined {
  const normName = normalizeCancellationPolicyKey(name);
  const lowerName = name.toLowerCase().trim();
  const upperCode = code ? code.toUpperCase().trim() : "";

  return PREDEFINED_CANCELLATION_POLICIES.find((preset) => {
    if (upperCode) {
      if (preset.code.toUpperCase() === upperCode) return true;
      if (preset.legacyCodes?.some((lc) => lc.toUpperCase() === upperCode)) return true;
    }
    if (lowerName && preset.name.toLowerCase().trim() === lowerName) return true;
    const pNorm = normalizeCancellationPolicyKey(preset.name);
    return Boolean(normName && normName === pNorm);
  });
}

/** Human-readable window/penalty line for catalogue cards (uses preset.summary when present). */
export function cancellationPresetDetailLine(preset: PredefinedCancellationPolicy): string {
  if (preset.summary.trim()) return preset.summary;
  if (preset.policyKind === "non_refundable") {
    return `No free cancellation · ${CANCELLATION_PENALTY_TYPE_LABELS[preset.penaltyType]} penalty`;
  }
  const penalty =
    preset.penaltyType === "percentage"
      ? `${preset.penaltyValue}% of stay`
      : CANCELLATION_PENALTY_TYPE_LABELS[preset.penaltyType];
  if (preset.cutoffTime) {
    return `Free until same-day ${preset.cutoffTime} · ${penalty} after`;
  }
  if (preset.windowValue == null) {
    return `${CANCELLATION_WINDOW_UNIT_LABELS[preset.windowUnit]} · ${penalty} after`;
  }
  const unit =
    preset.windowUnit === "days_before_arrival"
      ? preset.windowValue === 1
        ? "day"
        : "days"
      : "h";
  const windowLabel =
    preset.windowUnit === "days_before_arrival"
      ? `${preset.windowValue} ${unit}`
      : `${preset.windowValue}${unit}`;
  return `Free until ${windowLabel} before arrival · ${penalty} after`;
}
