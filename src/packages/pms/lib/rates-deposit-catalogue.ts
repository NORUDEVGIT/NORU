/**
 * NORU PMS — Predefined Deposit Policy Catalogue
 *
 * Application-level catalogue for Rate Plan selection.
 * Rows are stored in pms_deposit_policies only when selected/materialised.
 * Uses only DepositPolicyType values supported by payments-card3.
 */

import type { DepositPolicyType } from "./payments-card3";
import { DEPOSIT_POLICY_TYPE_LABELS } from "./payments-card3";

export type PredefinedDepositPolicy = {
  code: string;
  name: string;
  summary: string;
  description: string;
  legacyCodes?: readonly string[];
  depositType: DepositPolicyType;
  depositValue: number;
  required: boolean;
};

export const PREDEFINED_DEPOSIT_POLICIES: readonly PredefinedDepositPolicy[] = [
  {
    code: "DEP_NONE",
    name: "No Deposit",
    summary: "No deposit required at booking",
    description: "No deposit is required when the reservation is created.",
    depositType: "none",
    depositValue: 0,
    required: false,
  },
  {
    code: "DEP_FIRST",
    name: "First Night Deposit",
    summary: "First night deposit required",
    description: "Require a first-night deposit when the reservation is created.",
    legacyCodes: ["FIRST_NIGHT", "DEP_1N"],
    depositType: "first_night",
    depositValue: 0,
    required: true,
  },
  {
    code: "DEP_50",
    name: "Percentage Deposit",
    summary: "50% of stay required as deposit",
    description: "Require 50% of the stay as a deposit when the reservation is created.",
    depositType: "percent",
    depositValue: 50,
    required: true,
  },
  {
    code: "DEP_FULL",
    name: "Full Prepayment",
    summary: "100% of stay required before arrival",
    description: "Require full prepayment (100% of stay) when the reservation is created.",
    legacyCodes: ["DEP_100"],
    depositType: "percent",
    depositValue: 100,
    required: true,
  },
] as const;

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function depositPresetDetailLine(preset: PredefinedDepositPolicy): string {
  if (preset.summary.trim()) return preset.summary;
  if (preset.depositType === "none") return "No deposit required";
  if (preset.depositType === "percent") {
    return `${preset.depositValue}% of stay · ${DEPOSIT_POLICY_TYPE_LABELS[preset.depositType]}`;
  }
  return DEPOSIT_POLICY_TYPE_LABELS[preset.depositType];
}

export function findConfiguredDepositForPreset<T extends { id?: string; code: string; name: string }>(
  preset: PredefinedDepositPolicy,
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

export function findMatchingPredefinedDeposit(
  name: string,
  code?: string,
): PredefinedDepositPolicy | undefined {
  const normName = normalizeKey(name);
  const lowerName = name.toLowerCase().trim();
  const upperCode = code ? code.toUpperCase().trim() : "";

  return PREDEFINED_DEPOSIT_POLICIES.find((preset) => {
    if (upperCode) {
      if (preset.code.toUpperCase() === upperCode) return true;
      if (preset.legacyCodes?.some((lc) => lc.toUpperCase() === upperCode)) return true;
    }
    if (lowerName && preset.name.toLowerCase().trim() === lowerName) return true;
    return Boolean(normName && normalizeKey(preset.name) === normName);
  });
}
