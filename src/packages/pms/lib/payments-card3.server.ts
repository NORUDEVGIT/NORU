/**
 * Card 3 Phase 5 — Payments & Deposits (pure helpers).
 * Reuses pms_payment_methods. Deposit policies are Card 3-native.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD3_PAYMENTS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "payment-methods", label: "Payment Methods" },
  { id: "deposit-policies", label: "Deposit Policies" },
] as const;
export type Card3PaymentsTabId = (typeof CARD3_PAYMENTS_TABS)[number]["id"];

export const CARD3_PAYMENTS_AUDIT_SECTION = "card3-payments";
export const CARD3_PAYMENTS_UNAVAILABLE =
  "Payments & Deposits are unavailable until their approved migration is applied.";

export const PAYMENT_TYPE_CLASSES = [
  "cash",
  "card",
  "bank_transfer",
  "mobile_money",
  "voucher",
  "city_ledger",
  "other",
] as const;
export type PaymentTypeClass = (typeof PAYMENT_TYPE_CLASSES)[number];

export const PAYMENT_TYPE_CLASS_LABELS: Record<PaymentTypeClass, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  voucher: "Voucher",
  city_ledger: "City ledger",
  other: "Other",
};

export const DEPOSIT_POLICY_TYPES = ["none", "percent", "fixed", "first_night"] as const;
export type DepositPolicyType = (typeof DEPOSIT_POLICY_TYPES)[number];

export const DEPOSIT_POLICY_TYPE_LABELS: Record<DepositPolicyType, string> = {
  none: "None",
  percent: "Percent of stay",
  fixed: "Fixed amount",
  first_night: "First night",
};

export type PaymentsCard3AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type PaymentMethodCard3Row = {
  id: string;
  code: string;
  name: string;
  typeClass: PaymentTypeClass | "";
  typeClassLabel: string;
  notes: string;
  active: boolean;
};

export type DepositPolicyCard3Row = {
  id: string;
  code: string;
  name: string;
  description: string;
  required: boolean;
  depositType: DepositPolicyType;
  depositTypeLabel: string;
  depositValue: number;
  isDefault: boolean;
  active: boolean;
};

export type PaymentsCard3Snapshot = {
  currencyCode: string;
  paymentMethods: PaymentMethodCard3Row[];
  depositPolicies: DepositPolicyCard3Row[];
};

export type PaymentsCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function evaluatePaymentsCard3Readiness(
  snapshot: PaymentsCard3Snapshot,
): PaymentsCard3Readiness {
  const blockers: string[] = [];
  const hasRows = snapshot.paymentMethods.length > 0 || snapshot.depositPolicies.length > 0;

  if (!snapshot.paymentMethods.some((row) => row.active)) {
    blockers.push("Save at least one active payment method.");
  }
  if (!snapshot.depositPolicies.some((row) => row.active && row.isDefault)) {
    blockers.push("Save at least one active default deposit policy.");
  }

  if (!hasRows) return { ready: false, status: "not_started", blockers };
  if (blockers.length === 0) return { ready: true, status: "complete", blockers };
  return { ready: false, status: "in_progress", blockers };
}
