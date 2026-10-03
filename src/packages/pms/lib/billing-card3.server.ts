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

export type CanonicalBillingRuleCode =
  | "none"
  | "company_master"
  | "individual_guest"
  | "split_billing"
  | "third_party"
  | "direct_bill_city_ledger"
  | "travel_agency"
  | "tour_operator"
  | "government_organization"
  | "custom_other";

export type BillingRuleOperationalStatus = "active" | "planned" | "intent_only" | "deprecated";

export type CanonicalBillingRuleDef = {
  systemCode: CanonicalBillingRuleCode;
  code: string;
  name: string;
  description: string;
  payerKind: BillingPayerKind;
  splitGuestPercent: number | null;
  paymentTerms: string | null;
  operationalStatus: BillingRuleOperationalStatus;
  operationalStatusNote?: string;
  applicableProfileTypes: readonly string[];
  isDefault?: boolean;
};

export const CANONICAL_BILLING_RULES: readonly CanonicalBillingRuleDef[] = [
  {
    systemCode: "none",
    code: "NONE",
    name: "None",
    description: "No pre-assigned billing rule. Settlement details determined at reservation or check-in.",
    payerKind: "guest",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["company", "travel_agent", "group", "individual"],
  },
  {
    systemCode: "company_master",
    code: "COMPANY_MASTER",
    name: "Company Master",
    description: "All agreed room and tax charges billed directly to company master account.",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["company"],
    isDefault: true,
  },
  {
    systemCode: "individual_guest",
    code: "INDIVIDUAL_GUEST",
    name: "Individual Guest",
    description: "Guest settles folio directly upon departure.",
    payerKind: "guest",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["company", "travel_agent", "group", "individual"],
  },
  {
    systemCode: "split_billing",
    code: "SPLIT_BILLING",
    name: "Split Billing",
    description: "Company and guest share billing responsibility according to reservation/folio rules.",
    payerKind: "split",
    splitGuestPercent: 50,
    paymentTerms: null,
    operationalStatus: "intent_only",
    operationalStatusNote: "Financial intent only. Folio charge routing will be active when folio management is configured.",
    applicableProfileTypes: ["company", "travel_agent", "group"],
  },
  {
    systemCode: "third_party",
    code: "THIRD_PARTY",
    name: "Third Party",
    description: "Designated third-party organization or sponsor covers charges.",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["company", "group"],
  },
  {
    systemCode: "direct_bill_city_ledger",
    code: "DIRECT_BILL_CITY_LEDGER",
    name: "Direct Bill / City Ledger",
    description: "Direct billing to approved city ledger account. (Commercial agreement; operational AR pending).",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "planned",
    operationalStatusNote: "City ledger accounting is planned; currently records financial billing relationship without active AR posting.",
    applicableProfileTypes: ["company", "travel_agent", "group"],
  },
  {
    systemCode: "travel_agency",
    code: "TRAVEL_AGENCY",
    name: "Travel Agency",
    description: "Travel agency vouchers or credit arrangement settles authorized charges.",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["travel_agent"],
  },
  {
    systemCode: "tour_operator",
    code: "TOUR_OPERATOR",
    name: "Tour Operator",
    description: "Contracted tour operator account settles package or group allocations.",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["travel_agent", "group"],
  },
  {
    systemCode: "government_organization",
    code: "GOVERNMENT_ORGANIZATION",
    name: "Government / Organization",
    description: "Official government purchase order or embassy letter of guarantee.",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    applicableProfileTypes: ["company"],
  },
  {
    systemCode: "custom_other",
    code: "CUSTOM_OTHER",
    name: "Custom / Other",
    description: "Custom or non-standard billing instructions defined in descriptive metadata.",
    payerKind: "company",
    splitGuestPercent: null,
    paymentTerms: null,
    operationalStatus: "active",
    operationalStatusNote: "Descriptive only; does not define operational folio routing logic.",
    applicableProfileTypes: ["company", "travel_agent", "group", "individual"],
  },
] as const;

export function isBillingRuleApplicableToProfile(
  rule: { applicableProfileTypes?: readonly string[] | null; systemCode?: string | null; code?: string | null },
  profileType: string,
): boolean {
  if (Array.isArray(rule.applicableProfileTypes) && rule.applicableProfileTypes.length > 0) {
    return rule.applicableProfileTypes.includes(profileType);
  }
  const matchingCanonical = CANONICAL_BILLING_RULES.find(
    (c) => c.systemCode === rule.systemCode || c.code.toLowerCase() === (rule.code ?? "").toLowerCase(),
  );
  if (matchingCanonical) {
    return matchingCanonical.applicableProfileTypes.includes(profileType);
  }
  return true;
}

export type BillingRuleCard3Row = {
  id: string;
  code: string;
  systemCode?: CanonicalBillingRuleCode | null;
  name: string;
  description: string;
  payerKind: BillingPayerKind;
  payerKindLabel: string;
  splitGuestPercent: number | null;
  paymentTerms: string;
  isDefault: boolean;
  active: boolean;
  isSystem?: boolean;
  operationalStatus?: BillingRuleOperationalStatus;
  operationalStatusNote?: string | null;
  applicableProfileTypes?: string[];
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
