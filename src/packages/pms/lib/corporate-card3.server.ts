/**
 * Card 3 Phase 7 — Corporate & Contract Rates (pure helpers).
 * Company identity stays on Guest Profile. Authorized bookers stay out.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD3_CORPORATE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "agreements", label: "Corporate Agreements" },
  { id: "contract-rates", label: "Contract Rates" },
] as const;
export type Card3CorporateTabId = (typeof CARD3_CORPORATE_TABS)[number]["id"];

export const CARD3_CORPORATE_AUDIT_SECTION = "card3-corporate";
export const CARD3_CORPORATE_UNAVAILABLE =
  "Corporate & Contract Rates are unavailable until their approved migration is applied.";

export const CONTRACT_RATE_KINDS = ["negotiated", "fixed"] as const;
export type ContractRateKind = (typeof CONTRACT_RATE_KINDS)[number];

export const CONTRACT_RATE_KIND_LABELS: Record<ContractRateKind, string> = {
  negotiated: "Negotiated",
  fixed: "Fixed",
};

export type CorporateCard3AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type CorporateCompanyRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  paymentTerms: string;
  creditLimitNote: string;
};

export type CorporateRoomTypeRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type CorporateCurrencyRef = {
  code: string;
  isBase: boolean;
};

export type CorporateAgreementRow = {
  id: string;
  companyId: string;
  companyLabel: string;
  code: string;
  name: string;
  contractNumber: string;
  validFrom: string;
  validTo: string;
  currencyCode: string;
  description: string;
  active: boolean;
};

export type ContractRateRow = {
  id: string;
  agreementId: string;
  agreementLabel: string;
  roomTypeId: string;
  roomTypeLabel: string;
  rateKind: ContractRateKind;
  rateKindLabel: string;
  amount: number;
  validFrom: string;
  validTo: string;
  active: boolean;
};

export type CorporateCard3Snapshot = {
  companies: CorporateCompanyRef[];
  roomTypes: CorporateRoomTypeRef[];
  currencies: CorporateCurrencyRef[];
  agreements: CorporateAgreementRow[];
  contractRates: ContractRateRow[];
};

export type CorporateCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function isValidDateWindow(from: string, to: string): boolean {
  return Boolean(from) && Boolean(to) && to >= from;
}

export function evaluateCorporateCard3Readiness(
  snapshot: CorporateCard3Snapshot,
): CorporateCard3Readiness {
  const blockers: string[] = [];
  const hasRows = snapshot.agreements.length > 0 || snapshot.contractRates.length > 0;

  const completeAgreement = snapshot.agreements.find(
    (row) =>
      row.active &&
      isValidDateWindow(row.validFrom, row.validTo) &&
      snapshot.contractRates.some(
        (rate) =>
          rate.agreementId === row.id &&
          rate.active &&
          isValidDateWindow(rate.validFrom, rate.validTo),
      ),
  );
  if (!completeAgreement) {
    blockers.push(
      "Save an active corporate agreement with valid dates and at least one active contract rate.",
    );
  }

  if (!hasRows) return { ready: false, status: "not_started", blockers };
  if (blockers.length === 0) return { ready: true, status: "complete", blockers };
  return { ready: false, status: "in_progress", blockers };
}
