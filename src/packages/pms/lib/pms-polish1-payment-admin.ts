/**
 * PMS Polish Wave 1 — Payment methods · Administration · Fee presets
 * (Issue #106).
 *
 * Abel-approved 2026-09-14 locks:
 * - Payment methods is the accepted-tenders catalogue. Not payment gateways.
 *   Hub title is Payment methods. Hash #payment-methods. #banks may alias.
 * - Administration replaces Admin controls. Hash #administration.
 *   #admin-controls may alias. Roles · shifts · staff · small HR.
 *   SET5 numbering / approvals stay a subsection. Payments stay out.
 * - Shifts live on pms_shift_definitions. Not jsonb-only. Not staff_shifts.
 * - Fee presets reuse cancel_fee_basis / noshow_fee_basis + fo_* defaults.
 *   Full charge = percent_stay 100. No pms_fee_preset_posture unless chip
 *   state cannot be derived (it can).
 * - Empty Payment methods = Warning. Wave 1 Warnings do not block Activate.
 * - Single Activate still flips only pms_set1_live. No pms_polish1_live.
 * - Integrations stays its own SET5 card. Not merged into Payment methods.
 * - 0056 tables are additive and may be absent — never crash.
 * - OUT: Wave 2 · TIN/Device ID · FO-CHROME1 · overbooking · gateway invent ·
 *   full HRIS · bank reconciliation · sample seed invent.
 */

import type { FeeBasis, Set1DomainReport, Set1Readiness } from "./pms-set1-foundation.ts";
import { evaluateAdminControls, type Set5ActivateInput } from "./pms-set5-depts-guestsvc.ts";

export const POLISH1_ADMIN_HREF = "/restaurant/pms/administration";
export const POLISH1_HR_HREF = "/restaurant/back-office/hr";
export const POLISH1_PAYMENT_METHODS_HREF = "/restaurant/settings#payment-methods";

export const POLISH1_PAYMENTS_UNAVAILABLE = "Unavailable — payment methods are not applied yet.";
export const POLISH1_PAYMENTS_WARNING =
  "No active payment methods in the catalogue yet. This is a warning, not a block.";
export const POLISH1_PAYMENTS_PURPOSE =
  "Accepted tenders for folio posting. This is not a payment-gateway catalogue.";
export const POLISH1_SHIFTS_UNAVAILABLE = "Unavailable — shift definitions are not applied yet.";
export const POLISH1_SHIFTS_WARNING =
  "No active shift definitions in the catalogue yet. This is a warning, not a block.";
export const POLISH1_ADMIN_PURPOSE =
  "Roles, shifts, staff and thin HR. Numbering and approvals stay a subsection. Deep-link to Administration — not a second staff manager.";
export const POLISH1_CUSTOM_FEE_BLANK = "Custom fee preset needs a basis and a value before Save.";
export const SET5_TENDERS_LIVE_ON_PAYMENT_METHODS =
  "Accepted tenders live on Payment methods. This Integrations card is connectors only — not the tenders catalogue.";

export const POLISH1_AUDIT_PAYMENT_METHOD = "pms_polish1_payment_method_updated";
export const POLISH1_AUDIT_SHIFT = "pms_polish1_shift_updated";
export const POLISH1_AUDIT_FEE_PRESET = "pms_polish1_fee_preset_updated";
export const POLISH1_AUDIT_ACTIONS = [
  POLISH1_AUDIT_PAYMENT_METHOD,
  POLISH1_AUDIT_SHIFT,
  POLISH1_AUDIT_FEE_PRESET,
] as const;

export const FEE_PRESETS = ["fifty", "ten", "full", "custom"] as const;
export type FeePresetId = (typeof FEE_PRESETS)[number];

export const FEE_PRESET_LABELS: Record<FeePresetId, string> = {
  fifty: "50% of room",
  ten: "10%",
  full: "Full charge",
  custom: "Custom",
};

export const CUSTOM_FEE_BASES = ["percent_stay", "fixed"] as const;
export type CustomFeeBasis = (typeof CUSTOM_FEE_BASES)[number];

export type NamedFeePreset = Exclude<FeePresetId, "custom">;

export const FEE_PRESET_MAP: Record<NamedFeePreset, { basis: "percent_stay"; value: number }> = {
  fifty: { basis: "percent_stay", value: 50 },
  ten: { basis: "percent_stay", value: 10 },
  full: { basis: "percent_stay", value: 100 },
};

export type PmsPaymentMethod = {
  id: string;
  code: string;
  name: string;
  typeClass: string;
  notes: string;
  active: boolean;
};

export type PmsShiftDefinition = {
  id: string;
  code: string;
  name: string;
  typeClass: string;
  notes: string;
  startTime: string;
  endTime: string;
  active: boolean;
};

export type Polish1ActivateInput = {
  paymentMethodsAvailable: boolean;
  activePaymentMethodCount: number;
  shiftsAvailable: boolean;
  activeShiftCount: number;
};

export type Polish1Snapshot = {
  paymentMethodsAvailable: boolean;
  shiftsAvailable: boolean;
  paymentMethods: PmsPaymentMethod[];
  shifts: PmsShiftDefinition[];
};

export const FALLBACK_CASHIERING_TENDERS = [
  { code: "cash", name: "Cash" },
  { code: "card", name: "Card" },
  { code: "bank_transfer", name: "Bank transfer" },
  { code: "mobile_money", name: "Mobile money" },
  { code: "other", name: "Other" },
] as const;

export function emptyPolish1Activate(
  partial?: Partial<Polish1ActivateInput>,
): Polish1ActivateInput {
  return {
    paymentMethodsAvailable: false,
    activePaymentMethodCount: 0,
    shiftsAvailable: false,
    activeShiftCount: 0,
    ...partial,
  };
}

export function completePolish1Activate(
  partial?: Partial<Polish1ActivateInput>,
): Polish1ActivateInput {
  return emptyPolish1Activate({
    paymentMethodsAvailable: true,
    activePaymentMethodCount: 1,
    shiftsAvailable: true,
    activeShiftCount: 1,
    ...partial,
  });
}

export function emptyPolish1Snapshot(partial?: Partial<Polish1Snapshot>): Polish1Snapshot {
  return {
    paymentMethodsAvailable: false,
    shiftsAvailable: false,
    paymentMethods: [],
    shifts: [],
    ...partial,
  };
}

export function activateInputFromPolish1Snapshot(snapshot: Polish1Snapshot): Polish1ActivateInput {
  return {
    paymentMethodsAvailable: snapshot.paymentMethodsAvailable,
    activePaymentMethodCount: snapshot.paymentMethods.filter((row) => row.active).length,
    shiftsAvailable: snapshot.shiftsAvailable,
    activeShiftCount: snapshot.shifts.filter((row) => row.active).length,
  };
}

function domain(
  id: Set1DomainReport["id"],
  missing: string[],
  warnings: string[],
): Set1DomainReport {
  const readiness: Set1Readiness = missing.length
    ? "incomplete"
    : warnings.length
      ? "warning"
      : "complete";
  return { id, readiness, missing, warnings };
}

export function evaluatePaymentMethods(input: Polish1ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.paymentMethodsAvailable) warnings.push(POLISH1_PAYMENTS_UNAVAILABLE);
  else if (input.activePaymentMethodCount === 0) warnings.push(POLISH1_PAYMENTS_WARNING);
  return domain("payment-methods", [], warnings);
}

export function evaluateAdministration(
  polish1: Polish1ActivateInput,
  set5: Set5ActivateInput,
): Set1DomainReport {
  const admin = evaluateAdminControls(set5);
  const warnings = [...admin.warnings];
  if (!polish1.shiftsAvailable) warnings.push(POLISH1_SHIFTS_UNAVAILABLE);
  else if (polish1.activeShiftCount === 0) warnings.push(POLISH1_SHIFTS_WARNING);
  return domain("administration", [], warnings);
}

/** Wave 1 never adds Activate Incomplete blockers. */
export function polish1MandatoryMissing(_input: Polish1ActivateInput): string[] {
  return [];
}

export function feePresetFromStorage(basis: FeeBasis | "", value: number): FeePresetId {
  if (basis === "percent_stay" && value === 50) return "fifty";
  if (basis === "percent_stay" && value === 10) return "ten";
  if (basis === "percent_stay" && value === 100) return "full";
  return "custom";
}

export function applyFeePreset(
  preset: FeePresetId,
  custom?: { basis: CustomFeeBasis; value: number },
): { basis: FeeBasis; value: number } {
  if (preset !== "custom") return FEE_PRESET_MAP[preset];
  return {
    basis: custom?.basis ?? "percent_stay",
    value: Number.isFinite(custom?.value) ? Number(custom?.value) : 0,
  };
}

export function customFeePresetBlocked(
  preset: FeePresetId,
  customBasis: "" | CustomFeeBasis,
  customValue: string,
): boolean {
  if (preset !== "custom") return false;
  if (!customBasis) return true;
  if (!String(customValue ?? "").trim()) return true;
  const parsed = Number(customValue);
  return !Number.isFinite(parsed) || parsed < 0;
}

export function feePresetSaveBlocked(
  cancel: {
    preset: FeePresetId;
    basis: "" | CustomFeeBasis;
    value: string;
  },
  noshow: {
    preset: FeePresetId;
    basis: "" | CustomFeeBasis;
    value: string;
  },
): string | null {
  if (customFeePresetBlocked(cancel.preset, cancel.basis, cancel.value))
    return POLISH1_CUSTOM_FEE_BLANK;
  if (customFeePresetBlocked(noshow.preset, noshow.basis, noshow.value))
    return POLISH1_CUSTOM_FEE_BLANK;
  return null;
}

export function isCityLedgerTender(method: { code: string; typeClass?: string | null }): boolean {
  return (
    normalizeTenderCode(method.code) === "city_ledger" ||
    normalizeTenderCode(method.typeClass ?? "") === "city_ledger"
  );
}

export function cashieringTenderOptions(input: {
  available: boolean;
  methods: Array<{ code: string; name: string; active: boolean; typeClass?: string | null }>;
}): Array<{ code: string; name: string }> {
  if (!input.available) {
    return FALLBACK_CASHIERING_TENDERS.map((row) => ({ code: row.code, name: row.name }));
  }
  return input.methods
    .filter((row) => row.active && !isCityLedgerTender(row))
    .map((row) => ({ code: row.code, name: row.name }));
}

export function normalizeTenderCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function allowCashieringTender(code: string, activeCodes: string[] | null): boolean {
  const normalized = normalizeTenderCode(code);
  if (activeCodes === null) {
    return (FALLBACK_CASHIERING_TENDERS as readonly { code: string }[]).some(
      (row) => row.code === normalized,
    );
  }
  return activeCodes.some((row) => row === code || normalizeTenderCode(row) === normalized);
}

/** Values allowed by folio_transactions.payment_method. Not a provider status. */
export const LEDGER_PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "mobile_money",
  "other",
] as const;

export const TENDER_NONE_ACTIVE =
  "No active payment methods. Configure them in Settings → Payment methods.";
export const TENDER_NOT_ACTIVE = "That payment method is not active.";
export const TENDER_NOT_FOLIO = "That payment method cannot be posted on a guest folio.";

/**
 * Resolve a tender before any ledger insert. Catalogue codes outside the
 * ledger CHECK are stored as `other` so the insert cannot fail after this check.
 */
export function resolveStoredTender(
  method: string,
  activeCodes: string[] | null,
): { ok: true; stored: string } | { ok: false; message: string } {
  const normalized = normalizeTenderCode(method);
  if (!normalized) return { ok: false, message: "Choose a payment method." };
  if (activeCodes && activeCodes.length === 0) return { ok: false, message: TENDER_NONE_ACTIVE };
  if (!allowCashieringTender(normalized, activeCodes))
    return { ok: false, message: TENDER_NOT_ACTIVE };
  const catalogueCode =
    activeCodes?.find((code) => normalizeTenderCode(code) === normalized) ?? normalized;
  const ledger = normalizeTenderCode(catalogueCode);
  if (ledger === "city_ledger") return { ok: false, message: TENDER_NOT_FOLIO };
  if (ledger === "transfer") return { ok: true, stored: "bank_transfer" };
  if ((LEDGER_PAYMENT_METHODS as readonly string[]).includes(ledger))
    return { ok: true, stored: ledger };
  return { ok: true, stored: "other" };
}

/** Active catalogue tender for a folio line. City ledger is not a guest-folio method. */
export function folioTenderFromCatalogue(
  method: string,
  catalogue: Array<{ code: string; typeClass?: string | null; active: boolean }> | null,
): { ok: true; stored: string } | { ok: false; message: string } {
  if (catalogue) {
    const normalized = normalizeTenderCode(method);
    const match = catalogue.find(
      (row) => row.active && (row.code === method || normalizeTenderCode(row.code) === normalized),
    );
    if (match && isCityLedgerTender(match)) return { ok: false, message: TENDER_NOT_FOLIO };
    return resolveStoredTender(
      method,
      catalogue.filter((row) => row.active && !isCityLedgerTender(row)).map((row) => row.code),
    );
  }
  return resolveStoredTender(method, null);
}

export function paymentsStayOffAdministration(copy: string): boolean {
  return !/payment methods? catalogue|tenders catalogue/i.test(copy);
}
