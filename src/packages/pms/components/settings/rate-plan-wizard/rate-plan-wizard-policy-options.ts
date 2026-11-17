import {
  findMatchingPredefinedCancellation,
  PREDEFINED_CANCELLATION_POLICIES,
  cancellationPresetDetailLine,
  type PredefinedCancellationPolicy,
} from "@/packages/pms/lib/rates-cancellation-catalogue";
import {
  findConfiguredDepositForPreset,
  findMatchingPredefinedDeposit,
  PREDEFINED_DEPOSIT_POLICIES,
  depositPresetDetailLine,
  type PredefinedDepositPolicy,
} from "@/packages/pms/lib/rates-deposit-catalogue";
import {
  findConfiguredNoShowForPreset,
  findMatchingPredefinedNoShow,
  PREDEFINED_NO_SHOW_POLICIES,
  noShowPresetDetailLine,
  type PredefinedNoShowPolicy,
} from "@/packages/pms/lib/rates-no-show-catalogue";
import {
  findMatchingPredefinedEarlyDeparture,
  PREDEFINED_EARLY_DEPARTURE_POLICIES,
  type PredefinedEarlyDeparturePolicy,
} from "@/packages/pms/lib/rates-early-departure-catalogue";
import type {
  RateCancellationPolicyRow,
  RateEarlyDeparturePolicyRow,
  RateNoShowPolicyRow,
  RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";
import type { CancellationPolicyKind } from "@/packages/pms/lib/cancellation-policy-rules";
import { RATE_PLAN_NONE } from "./rate-plan-wizard-types";

export type WizardPolicyOption = {
  value: string;
  name: string;
  detail?: string;
  group: "noru" | "custom";
};

const PREDEF_CANCEL = "predef:cancel:";
const PREDEF_NOSHOW = "predef:noshow:";
const PREDEF_DEPOSIT = "predef:deposit:";
const PREDEF_EARLY = "predef:early:";

/** Early-departure presets safe for Rate Plan selection (excludes fixed amount). */
export const RATE_PLAN_EARLY_DEPARTURE_PRESETS = PREDEFINED_EARLY_DEPARTURE_POLICIES.filter(
  (preset) => preset.penaltyType !== "fixed_amount",
);

export function isPredefinedPolicySelection(value: string): boolean {
  return (
    value.startsWith(PREDEF_CANCEL) ||
    value.startsWith(PREDEF_NOSHOW) ||
    value.startsWith(PREDEF_DEPOSIT) ||
    value.startsWith(PREDEF_EARLY)
  );
}

export function predefCancellationValue(code: string) {
  return `${PREDEF_CANCEL}${code}`;
}
export function predefNoShowValue(code: string) {
  return `${PREDEF_NOSHOW}${code}`;
}
export function predefDepositValue(code: string) {
  return `${PREDEF_DEPOSIT}${code}`;
}
export function predefEarlyValue(code: string) {
  return `${PREDEF_EARLY}${code}`;
}

function findConfiguredCancellation(
  preset: PredefinedCancellationPolicy,
  configured: readonly RateCancellationPolicyRow[],
): RateCancellationPolicyRow | undefined {
  const presetCode = preset.code.toUpperCase().trim();
  const legacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const nameLower = preset.name.toLowerCase().trim();
  return configured.find((row) => {
    const code = (row.code ?? "").toUpperCase().trim();
    if (code === presetCode || legacy.includes(code)) return true;
    return (row.name ?? "").toLowerCase().trim() === nameLower;
  });
}

function findConfiguredEarly(
  preset: PredefinedEarlyDeparturePolicy,
  configured: readonly RateEarlyDeparturePolicyRow[],
): RateEarlyDeparturePolicyRow | undefined {
  const presetCode = preset.code.toUpperCase().trim();
  const legacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const nameLower = preset.name.toLowerCase().trim();
  return configured.find((row) => {
    const code = (row.code ?? "").toUpperCase().trim();
    if (code === presetCode || legacy.includes(code)) return true;
    return (row.name ?? "").toLowerCase().trim() === nameLower;
  });
}

export function buildCancellationWizardOptions(
  configured: readonly RateCancellationPolicyRow[],
  selectedId: string,
): WizardPolicyOption[] {
  const noru: WizardPolicyOption[] = PREDEFINED_CANCELLATION_POLICIES.map((preset) => {
    const existing = findConfiguredCancellation(preset, configured);
    return {
      value: existing?.id ?? predefCancellationValue(preset.code),
      name: preset.name,
      detail: cancellationPresetDetailLine(preset),
      group: "noru" as const,
    };
  });

  const custom = configured
    .filter((row) => {
      if (findMatchingPredefinedCancellation(row.name, row.code)) return false;
      return row.active || row.id === selectedId;
    })
    .map((row) => ({
      value: row.id,
      name: row.name,
      detail: row.description?.trim() || undefined,
      group: "custom" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return [...noru, ...custom];
}

export function buildNoShowWizardOptions(
  configured: readonly RateNoShowPolicyRow[],
  selectedId: string,
): WizardPolicyOption[] {
  const noru: WizardPolicyOption[] = PREDEFINED_NO_SHOW_POLICIES.map((preset) => {
    const existing = findConfiguredNoShowForPreset(preset, configured);
    return {
      value: existing?.id ?? predefNoShowValue(preset.code),
      name: preset.name,
      detail: noShowPresetDetailLine(preset),
      group: "noru" as const,
    };
  });

  const custom = configured
    .filter((row) => {
      if (findMatchingPredefinedNoShow(row.name, row.code)) return false;
      return row.active || row.id === selectedId;
    })
    .map((row) => ({
      value: row.id,
      name: row.name,
      detail: row.description?.trim() || undefined,
      group: "custom" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return [...noru, ...custom];
}

export function buildDepositWizardOptions(
  configured: RatesCard2Snapshot["depositPolicies"],
  selectedId: string,
): WizardPolicyOption[] {
  const noru: WizardPolicyOption[] = PREDEFINED_DEPOSIT_POLICIES.map((preset) => {
    const existing = findConfiguredDepositForPreset(preset, configured);
    return {
      value: existing?.id ?? predefDepositValue(preset.code),
      name: preset.name,
      detail: depositPresetDetailLine(preset),
      group: "noru" as const,
    };
  });

  const custom = configured
    .filter((row) => {
      if (findMatchingPredefinedDeposit(row.name, row.code)) return false;
      return row.active || row.id === selectedId;
    })
    .map((row) => ({
      value: row.id,
      name: row.name,
      group: "custom" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return [...noru, ...custom];
}

export function buildEarlyDepartureWizardOptions(
  configured: readonly RateEarlyDeparturePolicyRow[],
  selectedId: string,
): WizardPolicyOption[] {
  const noru: WizardPolicyOption[] = RATE_PLAN_EARLY_DEPARTURE_PRESETS.map((preset) => {
    const existing = findConfiguredEarly(preset, configured);
    return {
      value: existing?.id ?? predefEarlyValue(preset.code),
      name: preset.name,
      detail: preset.summary,
      group: "noru" as const,
    };
  });

  const custom = configured
    .filter((row) => {
      if (findMatchingPredefinedEarlyDeparture(row.name, row.code)) return false;
      const code = row.code.trim().toUpperCase();
      if (code === "EARLY_ONE_NIGHT" || code === "EARLY_ADD_NIGHT") return false;
      if (/one additional night/i.test(row.name)) return false;
      return row.active || row.id === selectedId;
    })
    .map((row) => ({
      value: row.id,
      name: row.name,
      detail: row.description?.trim() || undefined,
      group: "custom" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return [...noru, ...custom];
}

export function policyOptionLabel(
  value: string,
  options: readonly WizardPolicyOption[],
  noneLabel = "None",
): string {
  if (!value || value === RATE_PLAN_NONE) return noneLabel;
  return options.find((row) => row.value === value)?.name ?? noneLabel;
}

export function derivedCancellationKindFromSelection(
  selection: string,
  configured: readonly RateCancellationPolicyRow[],
): CancellationPolicyKind | null {
  if (!selection || selection === RATE_PLAN_NONE) return null;
  if (selection.startsWith(PREDEF_CANCEL)) {
    const code = selection.slice(PREDEF_CANCEL.length);
    return PREDEFINED_CANCELLATION_POLICIES.find((p) => p.code === code)?.policyKind ?? null;
  }
  return configured.find((row) => row.id === selection)?.policyKind ?? null;
}

export function parsePredefCancellation(selection: string): PredefinedCancellationPolicy | null {
  if (!selection.startsWith(PREDEF_CANCEL)) return null;
  const code = selection.slice(PREDEF_CANCEL.length);
  return PREDEFINED_CANCELLATION_POLICIES.find((p) => p.code === code) ?? null;
}

export function parsePredefNoShow(selection: string): PredefinedNoShowPolicy | null {
  if (!selection.startsWith(PREDEF_NOSHOW)) return null;
  const code = selection.slice(PREDEF_NOSHOW.length);
  return PREDEFINED_NO_SHOW_POLICIES.find((p) => p.code === code) ?? null;
}

export function parsePredefDeposit(selection: string): PredefinedDepositPolicy | null {
  if (!selection.startsWith(PREDEF_DEPOSIT)) return null;
  const code = selection.slice(PREDEF_DEPOSIT.length);
  return PREDEFINED_DEPOSIT_POLICIES.find((p) => p.code === code) ?? null;
}

export function parsePredefEarly(selection: string): PredefinedEarlyDeparturePolicy | null {
  if (!selection.startsWith(PREDEF_EARLY)) return null;
  const code = selection.slice(PREDEF_EARLY.length);
  return RATE_PLAN_EARLY_DEPARTURE_PRESETS.find((p) => p.code === code) ?? null;
}

export {
  findConfiguredCancellation,
  findConfiguredEarly,
  findConfiguredNoShowForPreset,
  findConfiguredDepositForPreset,
};
