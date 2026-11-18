/**
 * NORU PMS — Predefined No-Show Policy Catalogue
 *
 * Application-level catalogue for Rate Plan selection.
 * Rows are stored in pms_no_show_policies only when selected/materialised.
 */

import type { PolicyPenaltyType } from "./corporate-contracts.server";
import { buildNoShowPolicyPreview } from "./corporate-contracts.server";
import type { RateNoShowPolicyRow } from "./rates-card2.server";

export type PredefinedNoShowPolicy = {
  code: string;
  name: string;
  summary: string;
  description: string;
  legacyCodes?: readonly string[];
  penaltyType: PolicyPenaltyType;
  penaltyValue: number;
  releaseHour: number;
};

export const PREDEFINED_NO_SHOW_POLICIES: readonly PredefinedNoShowPolicy[] = [
  {
    code: "NS_NONE",
    name: "No No-Show Charge",
    summary: "No financial penalty · Room released at 18:00",
    description: "No financial penalty when a guest fails to arrive. Unclaimed room is released at 18:00 on arrival day.",
    penaltyType: "none",
    penaltyValue: 0,
    releaseHour: 18,
  },
  {
    code: "NS_FIRST",
    name: "First Night Charge",
    summary: "First night charged · Room released at 18:00",
    description: "Charge the first night when a guest fails to arrive. Unclaimed room is released at 18:00 on arrival day.",
    legacyCodes: ["NS_1N"],
    penaltyType: "first_night",
    penaltyValue: 0,
    releaseHour: 18,
  },
  {
    code: "NS_FULL",
    name: "Full Stay Charge",
    summary: "Full stay charged · Room released at 18:00",
    description: "Charge the full stay when a guest fails to arrive. Unclaimed room is released at 18:00 on arrival day.",
    penaltyType: "full_stay",
    penaltyValue: 0,
    releaseHour: 18,
  },
  {
    code: "NS_50",
    name: "Percentage of Stay",
    summary: "50% of stay charged · Room released at 18:00",
    description: "Charge 50% of the stay when a guest fails to arrive. Unclaimed room is released at 18:00 on arrival day.",
    penaltyType: "percent_stay",
    penaltyValue: 50,
    releaseHour: 18,
  },
] as const;

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function noShowPresetDetailLine(preset: PredefinedNoShowPolicy): string {
  if (preset.summary.trim()) return preset.summary;
  return buildNoShowPolicyPreview(preset.penaltyType, preset.penaltyValue, preset.releaseHour);
}

export function isPredefinedNoShowConfigured(
  preset: PredefinedNoShowPolicy,
  configured: readonly Pick<RateNoShowPolicyRow, "code" | "name">[],
): boolean {
  return Boolean(findConfiguredNoShowForPreset(preset, configured));
}

export function findConfiguredNoShowForPreset<T extends { id?: string; code: string; name: string }>(
  preset: PredefinedNoShowPolicy,
  configured: readonly T[],
): T | undefined {
  const presetCode = preset.code.toUpperCase().trim();
  const legacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const presetNorm = normalizeKey(preset.name);
  const presetNameLower = preset.name.toLowerCase().trim();

  return configured.find((row) => {
    const rowCode = (row.code ?? "").toUpperCase().trim();
    if (rowCode === presetCode || legacy.includes(rowCode)) return true;
    const rowNameLower = (row.name ?? "").toLowerCase().trim();
    if (rowNameLower === presetNameLower) return true;
    return Boolean(presetNorm && normalizeKey(row.name ?? "") === presetNorm);
  });
}

export function findMatchingPredefinedNoShow(
  name: string,
  code?: string,
): PredefinedNoShowPolicy | undefined {
  const normName = normalizeKey(name);
  const lowerName = name.toLowerCase().trim();
  const upperCode = code ? code.toUpperCase().trim() : "";

  return PREDEFINED_NO_SHOW_POLICIES.find((preset) => {
    if (upperCode) {
      if (preset.code.toUpperCase() === upperCode) return true;
      if (preset.legacyCodes?.some((lc) => lc.toUpperCase() === upperCode)) return true;
    }
    if (lowerName && preset.name.toLowerCase().trim() === lowerName) return true;
    return Boolean(normName && normalizeKey(preset.name) === normName);
  });
}
