import {
  buildEarlyDeparturePolicySnapshot,
  type EarlyDeparturePolicyMaster,
  type EarlyDeparturePolicySnapshot,
} from "./early-departure-policy.ts";
import type { GuaranteeMethodOption } from "./create-reservation-phase1-section7.ts";
import {
  DEPOSIT_POLICY_TYPES,
  formatDepositPolicyResult,
  type DepositPolicyCard3Row,
  type DepositPolicyType,
} from "./payments-card3.ts";
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

export function isCardGuaranteeMethod(value: string, options: GuaranteeMethodOption[]): boolean {
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

export function assertReservationTenderCode(code: string, activeCodes: string[] | null): void {
  if (!allowCashieringTender(code, activeCodes)) {
    throw new Error("That payment method is not an active Settings tender.");
  }
}

/** Canonical pms_no_show_policies.penalty_type values. */
export const NO_SHOW_PENALTY_TYPES = [
  "none",
  "first_night",
  "percent_stay",
  "fixed_amount",
  "full_stay",
] as const;

export type NoShowPenaltyType = (typeof NO_SHOW_PENALTY_TYPES)[number];

/** Historical no-show terms. Later master edits do not rewrite this object. */
export type NoShowPolicySnapshot = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  penalty_type: NoShowPenaltyType;
  penalty_value: number;
  release_hour: number;
  active: boolean;
};

export type NoShowPolicyMaster = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  penaltyType: string;
  penaltyValue: number;
  releaseHour: number;
  active: boolean;
};

export function noShowPenaltySummary(
  penaltyType: string | null | undefined,
  penaltyValue: number | string | null | undefined,
  currency?: string | null,
): string | null {
  const type = NO_SHOW_PENALTY_TYPES.find((value) => value === penaltyType);
  if (!type) return null;
  if (type === "none") return "No charge";
  if (type === "first_night") return "First night";
  if (type === "full_stay") return "Full stay";
  if (type === "percent_stay") {
    const value = Number(penaltyValue);
    return Number.isFinite(value) ? `${value}% of stay` : null;
  }
  const value = Number(penaltyValue);
  const code = currency?.trim();
  if (!Number.isFinite(value) || !code) return null;
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${code} ${amount}`;
}

export function buildNoShowPolicySnapshot(policy: NoShowPolicyMaster): NoShowPolicySnapshot {
  const penaltyType = NO_SHOW_PENALTY_TYPES.find((value) => value === policy.penaltyType);
  if (!penaltyType) {
    throw new Error("The rate plan no-show policy has an unsupported penalty type.");
  }
  const description = policy.description?.trim() ?? "";
  return {
    id: policy.id,
    code: policy.code,
    name: policy.name,
    description: description ? description : null,
    penalty_type: penaltyType,
    penalty_value: Number(policy.penaltyValue),
    release_hour: policy.releaseHour,
    active: policy.active,
  };
}

export function assertLinkedStayPolicyResolved(
  kind: "deposit" | "no-show" | "early-departure",
  linkedId: string | null,
  resolved: boolean,
): void {
  if (!linkedId || resolved) return;
  throw new Error(
    kind === "deposit"
      ? "The rate plan deposit policy is missing or belongs to another property."
      : kind === "no-show"
        ? "The rate plan no-show policy is missing or belongs to another property."
        : "The rate plan early departure policy is missing or belongs to another property.",
  );
}

/** Deposit and no-show columns written from the selected rate plan. Null means not configured. */
export function ratePlanStayPolicyWrite(input: {
  deposit: DepositPolicyCard3Row | null;
  noShow: NoShowPolicyMaster | null;
  earlyDeparture?: EarlyDeparturePolicyMaster | null;
  quote: DepositComputeQuote | null;
  currency: string;
  intendedTenderCode: string | null;
}): {
  deposit_policy_id: string | null;
  deposit_requirement_snapshot: DepositRequirementSnapshot | null;
  no_show_policy_id: string | null;
  no_show_policy_snapshot: NoShowPolicySnapshot | null;
  early_departure_policy_id: string | null;
  early_departure_policy_snapshot: EarlyDeparturePolicySnapshot | null;
} {
  return {
    deposit_policy_id: input.deposit?.id ?? null,
    deposit_requirement_snapshot: input.deposit
      ? buildDepositRequirementSnapshot({
          policy: input.deposit,
          quote: input.quote,
          currency: input.currency,
          intendedTenderCode: input.intendedTenderCode,
        })
      : null,
    no_show_policy_id: input.noShow?.id ?? null,
    no_show_policy_snapshot: input.noShow ? buildNoShowPolicySnapshot(input.noShow) : null,
    early_departure_policy_id: input.earlyDeparture?.id ?? null,
    early_departure_policy_snapshot: input.earlyDeparture
      ? buildEarlyDeparturePolicySnapshot(input.earlyDeparture)
      : null,
  };
}
