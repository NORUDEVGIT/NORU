/**
 * Card 3 Phase 6 — Billing & Invoicing (pure helpers).
 * Invoice settings + billing rules. City ledger and folio engines stay out.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD3_BILLING_TABS = [
  { id: "overview", label: "Overview" },
  { id: "invoice-settings", label: "Invoice Settings" },
  { id: "billing-rules", label: "Billing Rules" },
] as const;
export type Card3BillingTabId = (typeof CARD3_BILLING_TABS)[number]["id"];

export const CARD3_BILLING_AUDIT_SECTION = "card3-billing";
export const CARD3_BILLING_UNAVAILABLE =
  "Billing & Invoicing are unavailable until their approved migration is applied.";

export const INVOICE_TAX_DISPLAYS = ["exclusive", "inclusive", "both"] as const;
export type InvoiceTaxDisplay = (typeof INVOICE_TAX_DISPLAYS)[number];

export const INVOICE_TAX_DISPLAY_LABELS: Record<InvoiceTaxDisplay, string> = {
  exclusive: "Tax exclusive",
  inclusive: "Tax inclusive",
  both: "Show both",
};

export const INVOICE_FORMATS = ["standard", "detailed", "summary"] as const;
export type InvoiceFormat = (typeof INVOICE_FORMATS)[number];

export const INVOICE_FORMAT_LABELS: Record<InvoiceFormat, string> = {
  standard: "Standard",
  detailed: "Detailed",
  summary: "Summary",
};

export const BILLING_PAYER_KINDS = ["guest", "company", "group", "split"] as const;
export type BillingPayerKind = (typeof BILLING_PAYER_KINDS)[number];

export const BILLING_PAYER_KIND_LABELS: Record<BillingPayerKind, string> = {
  guest: "Guest pays",
  company: "Company pays",
  group: "Group pays",
  split: "Split billing",
};

export type BillingCard3AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type BillingCard3Inherited = {
  currencyCode: string;
  legalEntityName: string;
  legalName: string;
  brandName: string;
  tradingName: string;
  vatNumber: string;
  vatRegistered: boolean;
};

export type InvoiceSettingsCard3 = {
  prefix: string;
  startingNumber: number;
  numberPadding: number;
  taxDisplay: InvoiceTaxDisplay;
  taxDisplayLabel: string;
  invoiceFormat: InvoiceFormat;
  invoiceFormatLabel: string;
};

export type BillingRuleCard3Row = {
  id: string;
  code: string;
  name: string;
  description: string;
  payerKind: BillingPayerKind;
  payerKindLabel: string;
  splitGuestPercent: number | null;
  paymentTerms: string;
  isDefault: boolean;
  active: boolean;
};

export type BillingCard3Snapshot = {
  inherited: BillingCard3Inherited;
  invoiceSettings: InvoiceSettingsCard3 | null;
  billingRules: BillingRuleCard3Row[];
};

export type BillingCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function evaluateBillingCard3Readiness(
  snapshot: BillingCard3Snapshot,
): BillingCard3Readiness {
  const blockers: string[] = [];
  const settings = snapshot.invoiceSettings;
  const hasRows = settings !== null || snapshot.billingRules.length > 0;

  if (!settings || !settings.prefix.trim() || !(settings.startingNumber >= 1)) {
    blockers.push("Save invoice settings with a prefix and starting number.");
  }
  if (!snapshot.billingRules.some((row) => row.active && row.isDefault)) {
    blockers.push("Save at least one active default billing rule.");
  }

  if (!hasRows) return { ready: false, status: "not_started", blockers };
  if (blockers.length === 0) return { ready: true, status: "complete", blockers };
  return { ready: false, status: "in_progress", blockers };
}
