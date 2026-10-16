/**
 * Card 3 Phase 2 — Taxes & Fees (pure helpers).
 * SET1 / RM restaurants.tax_* and service_* stay the live till rate.
 * Exemption rows here are configuration rules, not applied folio exemptions.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const TAX_CHARGE_TYPES = ["percentage", "fixed"] as const;
export type TaxChargeType = (typeof TAX_CHARGE_TYPES)[number];

export const TAX_BASIS = ["room", "folio", "fnb", "all"] as const;
export type TaxBasis = (typeof TAX_BASIS)[number];

export const FEE_BASIS = ["room", "folio", "stay", "person", "night"] as const;
export type FeeBasis = (typeof FEE_BASIS)[number];

export const TAX_CALCULATIONS = ["inclusive", "exclusive"] as const;
export type TaxCalculation = (typeof TAX_CALCULATIONS)[number];

export const EXEMPTION_REASONS = [
  "government",
  "diplomatic",
  "international_organization",
  "nonprofit",
  "tax_status",
  "corporate_business",
  "guest_status",
  "long_stay",
  "group_event",
  "promotional",
  "management",
  "legal_regulatory",
  "other",
] as const;
export type ExemptionReason = (typeof EXEMPTION_REASONS)[number];

export const CARD3_TAXES_TABS = [
  { id: "overview", label: "Overview" },
  { id: "taxes", label: "Taxes" },
  { id: "service-charges", label: "Service Charges" },
  { id: "fees", label: "Fees" },
  { id: "exemptions", label: "Exemptions" },
] as const;
export type Card3TaxesTabId = (typeof CARD3_TAXES_TABS)[number]["id"];

export const CARD3_TAXES_AUDIT_SECTION = "card3-taxes";
export const CARD3_TAXES_UNAVAILABLE =
  "Taxes & Fees are unavailable until their approved migration is applied.";
export const CARD3_TAXES_SET1_COPY =
  "The SET1 / restaurant till still uses the single property tax and service charge. This catalogue does not replace those columns.";

export const TAX_CHARGE_TYPE_LABELS: Record<TaxChargeType, string> = {
  percentage: "Percentage",
  fixed: "Fixed",
};
export const TAX_BASIS_LABELS: Record<TaxBasis, string> = {
  room: "Room",
  folio: "Folio",
  fnb: "F&B",
  all: "All",
};
export const FEE_BASIS_LABELS: Record<FeeBasis, string> = {
  room: "Room",
  folio: "Folio",
  stay: "Stay",
  person: "Person",
  night: "Night",
};
export const TAX_CALCULATION_LABELS: Record<TaxCalculation, string> = {
  inclusive: "Inclusive",
  exclusive: "Exclusive",
};
export const EXEMPTION_REASON_LABELS: Record<ExemptionReason, string> = {
  government: "Government",
  diplomatic: "Diplomatic",
  international_organization: "International Organization",
  nonprofit: "Non-Profit / NGO",
  tax_status: "Tax Status",
  corporate_business: "Corporate / Business",
  guest_status: "Guest Status",
  long_stay: "Long Stay",
  group_event: "Group / Event",
  promotional: "Promotional",
  management: "Management",
  legal_regulatory: "Legal / Regulatory",
  other: "Other / Custom",
};

export type Card3TaxesAuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type TaxRow = {
  id: string;
  code: string;
  name: string;
  chargeType: TaxChargeType;
  amount: number;
  basis: TaxBasis;
  calculation: TaxCalculation;
  active: boolean;
};

export type TaxGroupRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  taxIds: string[];
};

export type ServiceChargeRow = {
  id: string;
  code: string;
  name: string;
  chargeType: TaxChargeType;
  amount: number;
  basis: TaxBasis;
  active: boolean;
};

export type FeeRow = {
  id: string;
  code: string;
  name: string;
  chargeType: TaxChargeType;
  amount: number;
  basis: FeeBasis;
  active: boolean;
};

export type ExemptionRuleRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  reasonCategory: ExemptionReason;
  customReason?: string | null;
  documentationRequired: boolean;
  approvalRequired: boolean;
  active: boolean;
};

export type TaxesCard3Snapshot = {
  taxes: TaxRow[];
  groups?: TaxGroupRow[];
  serviceCharges: ServiceChargeRow[];
  fees: FeeRow[];
  exemptionRules: ExemptionRuleRow[];
  /** Card 3 tax group applied when posting room charges (optional). */
  defaultRoomTaxGroupId?: string | null;
};

export type TaxesCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function isSetupCode(value: string): boolean {
  return /^[A-Z0-9_]{1,20}$/.test(value.trim().toUpperCase());
}

export function amountIsValid(chargeType: TaxChargeType, amount: number): boolean {
  if (!(amount > 0)) return false;
  if (chargeType === "percentage" && amount > 100) return false;
  return true;
}

export function evaluateTaxesCard3Readiness(snapshot: TaxesCard3Snapshot): TaxesCard3Readiness {
  const blockers: string[] = [];
  const { taxes, groups, serviceCharges, fees, exemptionRules } = snapshot;
  const hasRows =
    taxes.length > 0 ||
    (groups != null && groups.length > 0) ||
    serviceCharges.length > 0 ||
    fees.length > 0 ||
    exemptionRules.length > 0;

  const activeTaxes = taxes.filter((row) => row.active);
  if (activeTaxes.length === 0) blockers.push("Save at least one active tax.");

  if (!serviceCharges.some((row) => row.active)) blockers.push("Save at least one active service charge.");
  if (!fees.some((row) => row.active)) blockers.push("Save at least one active fee.");
  if (!exemptionRules.some((row) => row.active)) blockers.push("Save at least one active exemption rule.");

  if (!hasRows) {
    return { ready: false, status: "not_started", blockers };
  }
  if (blockers.length === 0) {
    return { ready: true, status: "complete", blockers };
  }
  return { ready: false, status: "in_progress", blockers };
}
