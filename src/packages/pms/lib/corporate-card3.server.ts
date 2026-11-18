/**
 * Card 3 Phase 7 — Corporate & Contract Rates (pure helpers).
 * Company identity stays on Guest Profile. Authorized bookers stay out.
 * This domain is optional configuration and must never block activation when unused.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD3_CORPORATE_TABS = [
  { id: "agreements", label: "Corporate Agreements" },
  { id: "contract-rates", label: "Contract Rates" },
  { id: "contract-types", label: "Contract Types" },
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

/** Sentinel end date used when staff choose “No end date” (model requires valid_to). */
export const CORPORATE_AGREEMENT_OPEN_ENDED_TO = "9999-12-31";

export const CORPORATE_AGREEMENT_WIZARD_STEPS = [
  { id: 1, title: "Company & Agreement" },
  { id: 2, title: "Contract Terms" },
  { id: 3, title: "Contract Rates" },
  { id: 4, title: "Billing & Commercial" },
  { id: 5, title: "Review" },
] as const;

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
  defaultBillingRuleId: string | null;
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

export type CorporateBillingRuleRef = {
  id: string;
  code: string;
  name: string;
  paymentTerms: string | null;
  active: boolean;
};

export type CorporateAgreementRow = {
  id: string;
  companyId: string;
  companyLabel: string;
  code: string;
  name: string;
  contractNumber: string;
  contractTypeId: string | null;
  contractTypeLabel: string;
  validFrom: string;
  validTo: string;
  currencyCode: string;
  description: string;
  active: boolean;
  autoRenew?: boolean;
  noticePeriodDays?: number | null;
  signedAt?: string | null;
  signedBy?: string | null;
  fileStoragePath?: string | null;
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
  billingRules: CorporateBillingRuleRef[];
  agreements: CorporateAgreementRow[];
  contractRates: ContractRateRow[];
};

export type CorporateCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export function isValidDateWindow(from: string, to: string): boolean {
  return Boolean(from) && Boolean(to) && to >= from;
}

export function isOpenEndedAgreementTo(validTo: string): boolean {
  return validTo === CORPORATE_AGREEMENT_OPEN_ENDED_TO;
}

/**
 * Suggest a next CORP_YYYY_NNN agreement code from existing codes.
 * Matches Guest Profile company-create code generation.
 */
export function suggestCorporateAgreementCode(
  existingCodes: readonly string[],
  year = new Date().getFullYear(),
): string {
  let maxSeq = 0;
  for (const raw of existingCodes) {
    const match = String(raw ?? "").match(/^CORP[_-](\d{4})[_-](\d+)$/i);
    if (!match) continue;
    if (Number(match[1]) !== year) continue;
    const num = parseInt(match[2]!, 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  }
  return `CORP_${year}_${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * Optional domain readiness.
 * - Empty catalogues are valid and never block activation.
 * - Missing company profiles never block.
 * - Contract types never block.
 * - Invalid saved rows are reportable as warnings only (not activation blockers).
 */
export function evaluateCorporateCard3Readiness(
  snapshot: CorporateCard3Snapshot,
): CorporateCard3Readiness {
  const warnings: string[] = [];

  for (const row of snapshot.agreements) {
    if (!isValidDateWindow(row.validFrom, row.validTo)) {
      warnings.push(
        `Agreement “${row.name || row.code}” has an invalid date window.`,
      );
    }
  }

  for (const rate of snapshot.contractRates) {
    if (!isValidDateWindow(rate.validFrom, rate.validTo)) {
      warnings.push(
        `Contract rate for ${rate.roomTypeLabel || "a room type"} has an invalid date window.`,
      );
    }
    if (!snapshot.agreements.some((row) => row.id === rate.agreementId)) {
      warnings.push(
        `A contract rate references a missing corporate agreement.`,
      );
    }
  }

  return {
    ready: true,
    status: "complete",
    blockers: [],
    warnings,
  };
}
