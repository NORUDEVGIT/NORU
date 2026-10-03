import type { GuaranteeMethodOption } from "./create-reservation-phase1-section7.ts";
import {
  DEPOSIT_POLICY_TYPES,
  formatDepositPolicyResult,
  type DepositPolicyCard3Row,
  type DepositPolicyType,
} from "./payments-card3.server.ts";
import { allowCashieringTender } from "./pms-polish1-payment-admin.ts";

export type DepositComputeQuote = {
  subtotal: number | null;
  nightly: Array<{ rate: number }>;
  currency: string | null;
};

export type DepositRequirementSnapshot = {
  id: string;
  code: string;
  name: string;
  required: boolean;
  deposit_type: DepositPolicyType;
  deposit_value: number;
  currency: string;
  computed_amount: number;
  intended_tender_code: string | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isCardGuaranteeMethod(
  value: string,
  options: GuaranteeMethodOption[],
): boolean {
  const row = options.find((option) => option.value === value);
  if ((row?.typeClass ?? "").toLowerCase() === "card") return true;
  const hay = `${value} ${row?.label ?? ""}`.toLowerCase();
  return /\b(card|credit|visa|mastercard|amex)\b/.test(hay);
}

export function formatGuaranteeCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function formatQuotedPolicySummary(
  cancellationLabel: string | null | undefined,
  refundabilityLabel: string | null | undefined,
): string | null {
  const parts = [cancellationLabel, refundabilityLabel].filter(
    (row) => row && row !== "—",
  ) as string[];
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function quotedNonRefundable(kind: string | null | undefined): boolean {
  return kind === "non_refundable";
}

export function asDepositPolicyType(value: string | null | undefined): DepositPolicyType {
  return (DEPOSIT_POLICY_TYPES as readonly string[]).includes(String(value))
    ? (value as DepositPolicyType)
    : "none";
}

/** Cashiering/Settings default deposit hint. Not a posted amount. */
export function defaultDepositPolicyHint(
  policies: DepositPolicyCard3Row[] | undefined,
  currencyCode: string,
): string | null {
  const policy = defaultActiveDepositPolicy(policies);
  return formatDepositPolicyResult(policy, currencyCode);
}

export function defaultActiveDepositPolicy(
  policies: DepositPolicyCard3Row[] | undefined,
): DepositPolicyCard3Row | null {
  return (policies ?? []).find((row) => row.active && row.isDefault) ?? null;
}

export function activeDepositPolicies(
  policies: DepositPolicyCard3Row[] | undefined,
): DepositPolicyCard3Row[] {
  return (policies ?? []).filter((row) => row.active);
}

/** Server authority. Browser totals are preview-only. Nightly rates already include rooms. */
export function computeDepositRequirementAmount(
  policy: { depositType: DepositPolicyType; depositValue: number },
  quote: DepositComputeQuote | null,
): number {
  if (policy.depositType === "none") return 0;
  if (policy.depositType === "fixed") return round2(Number(policy.depositValue) || 0);
  if (policy.depositType === "percent") {
    if (quote?.subtotal == null) return 0;
    return round2((Number(quote.subtotal) * Number(policy.depositValue)) / 100);
  }
  if (policy.depositType === "first_night") {
    const first = quote?.nightly[0]?.rate;
    if (first == null) return 0;
    return round2(Number(first));
  }
  return 0;
}

export function buildDepositRequirementSnapshot(input: {
  policy: DepositPolicyCard3Row;
  quote: DepositComputeQuote | null;
  currency: string;
  intendedTenderCode: string | null;
}): DepositRequirementSnapshot {
  return {
    id: input.policy.id,
    code: input.policy.code,
    name: input.policy.name,
    required: input.policy.required,
    deposit_type: input.policy.depositType,
    deposit_value: input.policy.depositValue,
    currency: input.currency,
    computed_amount: computeDepositRequirementAmount(input.policy, input.quote),
    intended_tender_code: input.intendedTenderCode,
  };
}

export function resolveDepositTenderCode(input: {
  selected: string;
  guaranteeMethod: string;
}): string | null {
  const selected = input.selected.trim();
  if (!selected) return null;
  if (selected === "same_as_guarantee") return input.guaranteeMethod.trim() || null;
  return selected;
}

export function assertReservationTenderCode(
  code: string,
  activeCodes: string[] | null,
): void {
  if (!allowCashieringTender(code, activeCodes)) {
    throw new Error("That payment method is not an active Settings tender.");
  }
}
