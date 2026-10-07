/**
 * Register New Company workflow helpers.
 * Canonical rows stay on guest_account_masters.account_type = company.
 * Extra commercial defaults are stored as account_operations, not a second ledger.
 */

import { COMPANY_TYPES, isCompanyType } from "./guest-profile-company.ts";
import { GUEST_ACCOUNT_STATUSES, type GuestAccountStatus } from "./guest-profile-wave4.ts";
import { uniqueIssueMessages, type CreateFieldIssue } from "./guest-create-step-issues.ts";
import {
  COMPANY_CREATION_FIELDS,
  ALL_COMPANY_CREATION_FIELDS,
  isCompanyFieldCode,
  type GuestCreationFieldDefinition,
} from "./guest-creation-field-definitions.ts";

export const GUEST_COMPANY_CREATE_MIGRATION_FILE = "0099_pms_account_create_drafts.sql";

// Legacy step titles: "Company Details", "Contacts", "Business & Commercial", "Billing & Credit", "Review & Confirm"
export const GUEST_COMPANY_CREATE_STEPS = [
  { id: "details", number: 1, title: "Company Information" },
  { id: "contacts", number: 2, title: "Contacts" },
  { id: "billing", number: 3, title: "Billing & Credit" },
  { id: "contracts", number: 4, title: "Contracts & Agreements" },
  { id: "review", number: 5, title: "Review & Save" },
] as const;

export type GuestCompanyCreateStepId = (typeof GUEST_COMPANY_CREATE_STEPS)[number]["id"];

export const GUEST_COMPANY_CREATE_TITLE = "Register New Company";
export const GUEST_COMPANY_CREATE_COPY =
  "Create a company master and establish corporate contract terms.";
export const GUEST_COMPANY_CREATE_DRAFT_SAVED =
  "Draft company saved. You can continue this registration later.";
export const GUEST_COMPANY_CREATE_PROGRESS_KEPT =
  "Your progress is kept. Return to Register New Company to continue.";
export const GUEST_COMPANY_CREATE_START_OVER = "Start Over";
export const GUEST_COMPANY_CREATE_START_OVER_COPY =
  "This clears the form and saved progress. A company already created is kept.";
export const GUEST_COMPANY_CREATE_HOLD_KEY_PREFIX = "noru.company-create.hold";
export const GUEST_COMPANY_CREATE_HOLD_DEBOUNCE_MS = 700;

export type CompanyContractDocumentItem = {
  documentTypeId: string;
  fileStoragePath: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
};

export type RatePlanDiscountItem = {
  ratePlanId: string;
  discountType: "percent" | "fixed";
  discountValue: number | null;
};

export type CompanyContractDraft = {
  contractTypeId: string | null;
  name: string;
  code: string;
  contractNumber: string;
  validFrom: string;
  validTo: string;
  currencyCode: string;
  status: "draft" | "active";
  pricingMethod: "rate_plan" | "rate_plan_discount" | "contracted_rates";
  ratePlanScope: "all" | "selected";
  ratePlanIds: string[];
  ratePlanId: string | null;
  discountApplication: "uniform" | "custom";
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  ratePlanDiscounts: RatePlanDiscountItem[];
  contractRates: Array<{
    roomTypeId: string;
    amount: number | null;
  }>;
  depositPolicyId: string | null;
  cancellationPolicyId: string | null;
  noShowPolicyId: string | null;
  documents: CompanyContractDocumentItem[];
  notes: string;
};

export function emptyCompanyContractDraft(defaultCurrency = ""): CompanyContractDraft {
  const today = new Date().toISOString().slice(0, 10);
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    contractTypeId: null,
    name: "",
    code: "",
    contractNumber: "",
    validFrom: today,
    validTo: oneYearLater,
    currencyCode: defaultCurrency,
    status: "active",
    pricingMethod: "rate_plan",
    ratePlanScope: "selected",
    ratePlanIds: [],
    ratePlanId: null,
    discountApplication: "uniform",
    discountType: null,
    discountValue: null,
    ratePlanDiscounts: [],
    contractRates: [],
    depositPolicyId: null,
    cancellationPolicyId: null,
    noShowPolicyId: null,
    documents: [],
    notes: "",
  };
}

export const COMPANY_CREATE_CONTRACT_COPY =
  "Contract here is a reference default, not a signed agreement row.";
export const COMPANY_CREATE_CREDIT_COPY =
  "Credit is stored on this company only. It does not enforce a credit limit or post to a ledger.";
export const COMPANY_CREATE_TAX_COPY =
  "Tax exemption notes are stored as defaults. They do not change folio tax.";

export const COMPANY_BILLING_TIMINGS = [
  { id: "due_on_arrival", label: "Due on Arrival" },
  { id: "due_on_departure", label: "Due on Departure" },
  { id: "prepaid", label: "Prepaid" },
  { id: "credit_terms", label: "Credit Terms / On Invoice" },
] as const;
export type CompanyBillingTiming = (typeof COMPANY_BILLING_TIMINGS)[number]["id"];

export const COMPANY_CREDIT_STATUSES = [
  { id: "pending_approval", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "suspended", label: "Suspended" },
] as const;
export type CompanyCreditStatus = (typeof COMPANY_CREDIT_STATUSES)[number]["id"];

export const ACCOUNT_BILLING_ARRANGEMENTS = [
  { id: "company_master", label: "Company Master" },
  { id: "individual", label: "Individual Guests" },
  { id: "split", label: "Split Billing" },
] as const;
export type AccountBillingArrangementId = (typeof ACCOUNT_BILLING_ARRANGEMENTS)[number]["id"];

export const CONTACT_PREFERRED_METHODS = [
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;
export type ContactPreferredMethodId = (typeof CONTACT_PREFERRED_METHODS)[number]["id"];

export const ACCOUNT_CREATE_STATUS_LABELS: Record<GuestAccountStatus, string> = {
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
};

export type AccountCreateCatalogueOption = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean;
  creditAccountAllowed?: boolean;
  contactRequired?: boolean;
};

export type AccountCreateContactDraft = {
  key: string;
  id: string | null;
  name: string;
  position: string;
  email: string;
  phone: string;
  whatsapp: string;
  roleIds: string[];
  isPrimary: boolean;
  preferredMethod: string;
  notes: string;
};

export type GuestCompanyCreateDraft = {
  accountId: string | null;
  name: string;
  tradeName: string;
  code: string;
  businessProfileTypeId: string;
  companyType: string;
  companyTypeOther: string;
  accountStatus: GuestAccountStatus;
  industry: string;
  taxId: string;
  registrationNumber: string;
  website: string;
  notes: string;
  acknowledgeNameDuplicate: boolean;
  contacts: AccountCreateContactDraft[];
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  marketSegmentId: string;
  sourceCodeId: string;
  sourceOfBusiness: string;
  accountManagerId: string;
  contractReference: string;
  contractStartDate: string;
  contractEndDate: string;
  ratePlanId: string;
  packageId: string;
  mealPlanId: string;
  // Step 3: Structured Billing & Credit
  defaultBillingRuleId: string | null;
  defaultPaymentMethodId: string | null;
  billingCurrencyCode: string;
  paymentTiming: CompanyBillingTiming | null;
  creditDays: number | null;
  creditStatus: CompanyCreditStatus | null;
  creditLimitAmount: number | null;
  taxExempt: boolean;
  taxExemptionRuleId: string | null;
  taxExemptionCertificateNumber: string;
  taxExemptionValidTo: string | null;

  // Legacy compatibility fields (kept for read compatibility)
  billingArrangement: string;
  billingContactName: string;
  billingEmail: string;
  paymentMethodId: string;
  currency: string;
  paymentTerms: string;
  billingInstruction: string;
  creditAccountEnabled: boolean;
  creditLimitNote: string;
  taxExemptionNote: string;
  taxNote: string;
  contract: CompanyContractDraft;
};

export type GuestCompanyCreateHold = {
  step: GuestCompanyCreateStepId;
  draft: GuestCompanyCreateDraft;
};

export type GuestCompanyCreateCompletionItem = {
  id: string;
  label: string;
  complete: boolean;
  requiredRemaining: boolean;
  step: GuestCompanyCreateStepId;
};

export function isGuestCompanyCreateStepId(value: string | undefined): value is GuestCompanyCreateStepId {
  return Boolean(value && GUEST_COMPANY_CREATE_STEPS.some((step) => step.id === value));
}

export function guestCompanyCreateStep(id: string | undefined): GuestCompanyCreateStepId {
  if (id === "basic") return "details";
  if (id === "business") return "contracts";
  return isGuestCompanyCreateStepId(id) ? id : "details";
}

export function guestCompanyCreateHoldKey(restaurantId: string): string {
  return `${GUEST_COMPANY_CREATE_HOLD_KEY_PREFIX}:${restaurantId}`;
}

function accountCreateStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isGuestCompanyCreateDraftShape(value: unknown): value is GuestCompanyCreateDraft {
  return Boolean(value && typeof value === "object" && "name" in value && "contacts" in value);
}

export function inferGuestCompanyCreateStep(draft: GuestCompanyCreateDraft): GuestCompanyCreateStepId {
  if (filled(draft.contract?.name) || draft.contract?.contractTypeId) {
    return "contracts";
  }
  if (
    filled(draft.defaultBillingRuleId) ||
    draft.paymentTiming ||
    draft.creditAccountEnabled ||
    draft.taxExempt ||
    filled(draft.billingArrangement) ||
    filled(draft.paymentMethodId)
  ) {
    return "billing";
  }
  if (draft.contacts.some((row) => filled(row.name))) {
    return "contacts";
  }
  return "details";
}

export function parseGuestCompanyCreateHold(payload: unknown): GuestCompanyCreateHold | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { step?: unknown; draft?: unknown };
  if (isGuestCompanyCreateDraftShape(record.draft)) {
    const rawStep = String(record.step ?? "");
    const normalizedStep: GuestCompanyCreateStepId =
      rawStep === "basic"
        ? "details"
        : rawStep === "business"
          ? "contracts"
          : isGuestCompanyCreateStepId(rawStep)
            ? rawStep
            : inferGuestCompanyCreateStep(record.draft);
    return {
      step: normalizedStep,
      draft: normalizeCompanyCreateDraft(record.draft),
    };
  }
  if (isGuestCompanyCreateDraftShape(record)) {
    return { step: inferGuestCompanyCreateStep(record), draft: normalizeCompanyCreateDraft(record) };
  }
  return null;
}

export function readGuestCompanyCreateHold(restaurantId: string): GuestCompanyCreateHold | null {
  const storage = accountCreateStorage();
  if (!storage) return null;
  try {
    return parseGuestCompanyCreateHold(JSON.parse(storage.getItem(guestCompanyCreateHoldKey(restaurantId)) ?? ""));
  } catch {
    return null;
  }
}

export function writeGuestCompanyCreateHold(restaurantId: string, hold: GuestCompanyCreateHold): void {
  accountCreateStorage()?.setItem(guestCompanyCreateHoldKey(restaurantId), JSON.stringify(hold));
}

export function clearGuestCompanyCreateHold(restaurantId: string): void {
  accountCreateStorage()?.removeItem(guestCompanyCreateHoldKey(restaurantId));
}

export function emptyAccountCreateContact(primary = false): AccountCreateContactDraft {
  return {
    key: `contact-${Math.random().toString(36).slice(2, 10)}`,
    id: null,
    name: "",
    position: "",
    email: "",
    phone: "",
    whatsapp: "",
    roleIds: [],
    isPrimary: primary,
    preferredMethod: "",
    notes: "",
  };
}

export function emptyGuestCompanyCreateDraft(): GuestCompanyCreateDraft {
  return {
    accountId: null,
    name: "",
    tradeName: "",
    code: "",
    businessProfileTypeId: "",
    companyType: "",
    companyTypeOther: "",
    accountStatus: "pending",
    industry: "",
    taxId: "",
    registrationNumber: "",
    website: "",
    notes: "",
    acknowledgeNameDuplicate: false,
    contacts: [emptyAccountCreateContact(true)],
    addressLine1: "",
    addressLine2: "",
    city: "Addis Ababa",
    region: "Addis Ababa",
    postalCode: "",
    country: "Ethiopia",
    marketSegmentId: "",
    sourceCodeId: "",
    sourceOfBusiness: "",
    accountManagerId: "",
    contractReference: "",
    contractStartDate: "",
    contractEndDate: "",
    ratePlanId: "",
    packageId: "",
    mealPlanId: "",
    // Step 3 structured fields
    defaultBillingRuleId: null,
    defaultPaymentMethodId: null,
    billingCurrencyCode: "",
    paymentTiming: null,
    creditDays: null,
    creditStatus: null,
    creditLimitAmount: null,
    taxExempt: false,
    taxExemptionRuleId: null,
    taxExemptionCertificateNumber: "",
    taxExemptionValidTo: null,
    // Legacy fields
    billingArrangement: "",
    billingContactName: "",
    billingEmail: "",
    paymentMethodId: "",
    currency: "",
    paymentTerms: "",
    billingInstruction: "",
    creditAccountEnabled: false,
    creditLimitNote: "",
    taxExemptionNote: "",
    taxNote: "",
    contract: emptyCompanyContractDraft(),
  };
}

export function normalizeCompanyCreateDraft(draft: GuestCompanyCreateDraft): GuestCompanyCreateDraft {
  const contacts = Array.isArray(draft.contacts) && draft.contacts.length > 0
    ? draft.contacts
    : [emptyAccountCreateContact(true)];
  const status = GUEST_ACCOUNT_STATUSES.includes(draft.accountStatus)
    ? draft.accountStatus
    : "pending";
  return {
    ...emptyGuestCompanyCreateDraft(),
    ...draft,
    accountStatus: status,
    defaultBillingRuleId: draft.defaultBillingRuleId ?? null,
    defaultPaymentMethodId: draft.defaultPaymentMethodId ?? (draft.paymentMethodId || null),
    billingCurrencyCode: draft.billingCurrencyCode || draft.currency || "",
    paymentTiming: draft.paymentTiming ?? null,
    creditDays: typeof draft.creditDays === "number" ? draft.creditDays : draft.creditDays ? Number(draft.creditDays) : null,
    creditStatus: draft.creditStatus ?? null,
    creditLimitAmount: typeof draft.creditLimitAmount === "number" ? draft.creditLimitAmount : draft.creditLimitAmount ? Number(draft.creditLimitAmount) : null,
    taxExempt: Boolean(draft.taxExempt),
    taxExemptionRuleId: draft.taxExemptionRuleId ?? null,
    taxExemptionCertificateNumber: draft.taxExemptionCertificateNumber ?? "",
    taxExemptionValidTo: draft.taxExemptionValidTo ?? null,
    creditAccountEnabled: Boolean(draft.creditAccountEnabled),
    contract:
      draft.contract && typeof draft.contract === "object" && !Array.isArray(draft.contract)
        ? {
            ...emptyCompanyContractDraft(),
            ...draft.contract,
            ratePlanScope:
              draft.contract.ratePlanScope ||
              ((draft.contract.ratePlanIds && draft.contract.ratePlanIds.length > 0) || draft.contract.ratePlanId
                ? "selected"
                : "all"),
            ratePlanIds: Array.isArray(draft.contract.ratePlanIds)
              ? draft.contract.ratePlanIds
              : draft.contract.ratePlanId
              ? [draft.contract.ratePlanId]
              : [],
            discountApplication: draft.contract.discountApplication || "uniform",
            ratePlanDiscounts: Array.isArray(draft.contract.ratePlanDiscounts)
              ? draft.contract.ratePlanDiscounts
              : [],
          }
        : emptyCompanyContractDraft(),
  };
}

export function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function blank(value: string): string | null {
  return filled(value) ? value.trim() : null;
}

function validEmail(value: string): boolean {
  return !filled(value) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function contractDateError(start: string, end: string): string | null {
  if (!filled(start) || !filled(end)) return null;
  if (start > end) return "Contract start must be on or before the end date.";
  return null;
}

export function isValidCompanyPhone(value: string): boolean {
  if (!value || !value.trim()) return true;
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  // Ethiopian mobile: +251 9... / +251 7...
  if (/^(\+?251)[79]\d{8}$/.test(trimmed.replace(/[\s\-()]/g, ""))) {
    return true;
  }
  // Ethiopian local: 09... / 07...
  if (/^0[79]\d{8}$/.test(trimmed.replace(/[\s\-()]/g, ""))) {
    return true;
  }
  // International E.164 with +
  if (/^\+[1-9]\d{6,14}$/.test(trimmed.replace(/[\s\-()]/g, ""))) {
    return true;
  }
  // Generic numeric between 9 and 15 digits
  if (digitsOnly.length >= 9 && digitsOnly.length <= 15) {
    return true;
  }
  return false;
}

export function validateCompanyPhone(phone: string): string | null {
  if (!phone || !phone.trim()) return null;
  return isValidCompanyPhone(phone)
    ? null
    : "Enter a valid phone number (+251..., 09..., or 07...)";
}

export type CompanyCreateFieldCode =
  | "COMPANY_NAME"
  | "COMPANY_TYPE"
  | "COMPANY_CODE"
  | "ACCOUNT_STATUS"
  | "TAX_ID"
  | "REGISTRATION_NUMBER"
  | "INDUSTRY"
  | "WEBSITE"
  | "NOTES"
  | "COUNTRY"
  | "REGION"
  | "CITY"
  | "ADDRESS_LINE1"
  | "ADDRESS_LINE2"
  | "POSTAL_CODE"
  | "CONTACT_NAME"
  | "CONTACT_POSITION"
  | "CONTACT_EMAIL"
  | "CONTACT_PHONE"
  | "CONTACT_WHATSAPP"
  | "CONTACT_PREFERRED_METHOD"
  | "CONTACT_ROLE";

export type CompanyCreateFieldRule = {
  code: string;
  visible: boolean;
  required: boolean;
  label: string;
};

export const FIELD_CODE_BY_COMPANY_PROP: Record<string, string> = {
  name: "COMPANY_NAME",
  businessProfileTypeId: "COMPANY_TYPE",
  code: "COMPANY_CODE",
  accountStatus: "COMPANY_ACCOUNT_STATUS",
  taxId: "COMPANY_TAX_ID",
  registrationNumber: "COMPANY_REGISTRATION_NUMBER",
  industry: "COMPANY_INDUSTRY",
  website: "COMPANY_WEBSITE",
  notes: "COMPANY_NOTES",
  country: "COMPANY_COUNTRY",
  region: "COMPANY_REGION",
  city: "COMPANY_CITY",
  addressLine1: "COMPANY_ADDRESS_LINE1",
  addressLine2: "COMPANY_ADDRESS_LINE2",
  postalCode: "COMPANY_POSTAL_CODE",
  contacts: "COMPANY_CONTACT_NAME",
  contactName: "COMPANY_CONTACT_NAME",
  contactPosition: "COMPANY_CONTACT_POSITION",
  contactEmail: "COMPANY_CONTACT_EMAIL",
  contactPhone: "COMPANY_CONTACT_PHONE",
  contactWhatsapp: "COMPANY_CONTACT_WHATSAPP",
  contactPreferredMethod: "COMPANY_CONTACT_PREFERRED_METHOD",
  contactRole: "COMPANY_CONTACT_ROLE",

  // Step 3: Billing & Credit
  defaultBillingRuleId: "COMPANY_DEFAULT_BILLING_RULE",
  paymentTiming: "COMPANY_PAYMENT_TIMING",
  defaultPaymentMethodId: "COMPANY_SETTLEMENT_METHOD",
  billingCurrencyCode: "COMPANY_BILLING_CURRENCY",
  creditAccountEnabled: "COMPANY_CREDIT_FACILITY",
  creditLimitAmount: "COMPANY_CREDIT_LIMIT",
  creditDays: "COMPANY_CREDIT_DAYS",
  creditStatus: "COMPANY_CREDIT_STATUS",
  taxExempt: "COMPANY_TAX_EXEMPTION",
  taxExemptionRuleId: "COMPANY_TAX_EXEMPTION_RULE",
  taxExemptionCertificateNumber: "COMPANY_TAX_EXEMPT_CERT",
  taxExemptionValidTo: "COMPANY_TAX_EXEMPT_VALID_UNTIL",
  billingInstruction: "COMPANY_BILLING_INSTRUCTIONS",

  // Step 4: Contracts & Agreements
  contractTypeId: "COMPANY_CONTRACT_TYPE",
  contractName: "COMPANY_CONTRACT_NAME",
  contractCode: "COMPANY_CONTRACT_CODE",
  contractNumber: "COMPANY_CONTRACT_NUMBER",
  validFrom: "COMPANY_CONTRACT_VALID_FROM",
  validTo: "COMPANY_CONTRACT_VALID_TO",
  currencyCode: "COMPANY_CONTRACT_CURRENCY",
  contractCurrency: "COMPANY_CONTRACT_CURRENCY",
  status: "COMPANY_CONTRACT_STATUS",
  contractStatus: "COMPANY_CONTRACT_STATUS",
  pricingMethod: "COMPANY_CONTRACT_PRICING_METHOD",
  depositPolicyId: "COMPANY_CONTRACT_DEPOSIT_POLICY",
  cancellationPolicyId: "COMPANY_CONTRACT_CANCEL_POLICY",
  noShowPolicyId: "COMPANY_CONTRACT_NOSHOW_POLICY",
  contractNotes: "COMPANY_CONTRACT_NOTES",
};

export const FIELD_CODES_BY_COMPANY_PROP: Record<string, string[]> = {
  name: ["COMPANY_NAME", "NAME"],
  businessProfileTypeId: ["COMPANY_TYPE", "TYPE", "BUSINESS_PROFILE_TYPE_ID"],
  code: ["COMPANY_CODE", "CODE"],
  accountStatus: ["COMPANY_ACCOUNT_STATUS", "ACCOUNT_STATUS"],
  taxId: ["COMPANY_TAX_ID", "TAX_ID", "TIN"],
  registrationNumber: ["COMPANY_REGISTRATION_NUMBER", "REGISTRATION_NUMBER"],
  industry: ["COMPANY_INDUSTRY", "INDUSTRY"],
  website: ["COMPANY_WEBSITE", "WEBSITE"],
  notes: ["COMPANY_NOTES", "NOTES"],
  country: ["COMPANY_COUNTRY", "COUNTRY"],
  region: ["COMPANY_REGION", "REGION"],
  city: ["COMPANY_CITY", "CITY"],
  addressLine1: ["COMPANY_ADDRESS_LINE1", "ADDRESS_LINE1"],
  addressLine2: ["COMPANY_ADDRESS_LINE2", "ADDRESS_LINE2"],
  postalCode: ["COMPANY_POSTAL_CODE", "POSTAL_CODE"],
  contacts: ["COMPANY_CONTACT_NAME", "CONTACT_NAME", "CONTACTS"],
  contactName: ["COMPANY_CONTACT_NAME", "CONTACT_NAME"],
  contactPosition: ["COMPANY_CONTACT_POSITION", "CONTACT_POSITION"],
  position: ["COMPANY_CONTACT_POSITION", "CONTACT_POSITION"],
  contactEmail: ["COMPANY_CONTACT_EMAIL", "CONTACT_EMAIL"],
  email: ["COMPANY_CONTACT_EMAIL", "CONTACT_EMAIL"],
  contactPhone: ["COMPANY_CONTACT_PHONE", "CONTACT_PHONE"],
  phone: ["COMPANY_CONTACT_PHONE", "CONTACT_PHONE"],
  contactWhatsapp: ["COMPANY_CONTACT_WHATSAPP", "CONTACT_WHATSAPP"],
  whatsapp: ["COMPANY_CONTACT_WHATSAPP", "CONTACT_WHATSAPP"],
  contactPreferredMethod: ["COMPANY_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD"],
  preferredMethod: ["COMPANY_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD"],
  contactRole: ["COMPANY_CONTACT_ROLE", "CONTACT_ROLE"],
  role: ["COMPANY_CONTACT_ROLE", "CONTACT_ROLE"],

  // Step 3: Billing & Credit
  defaultBillingRuleId: [
    "COMPANY_DEFAULT_BILLING_RULE",
    "COMPANY_BILLING_RULE",
    "DEFAULT_BILLING_RULE",
    "BILLING_RULE",
    "DEFAULT_BILLING_RULE_ID",
  ],
  paymentTiming: ["COMPANY_PAYMENT_TIMING", "PAYMENT_TIMING"],
  defaultPaymentMethodId: [
    "COMPANY_SETTLEMENT_METHOD",
    "SETTLEMENT_METHOD",
    "DEFAULT_PAYMENT_METHOD_ID",
    "DEFAULT_PAYMENT_METHOD",
    "PAYMENT_METHOD",
  ],
  billingCurrencyCode: ["COMPANY_BILLING_CURRENCY", "BILLING_CURRENCY", "BILLING_CURRENCY_CODE", "CURRENCY_CODE"],
  creditAccountEnabled: ["COMPANY_CREDIT_FACILITY", "CREDIT_FACILITY", "CREDIT_ACCOUNT_ENABLED", "ALLOW_CREDIT"],
  creditLimitAmount: ["COMPANY_CREDIT_LIMIT", "CREDIT_LIMIT", "CREDIT_LIMIT_AMOUNT"],
  creditDays: ["COMPANY_CREDIT_DAYS", "CREDIT_DAYS"],
  creditStatus: ["COMPANY_CREDIT_STATUS", "CREDIT_STATUS"],
  taxExempt: ["COMPANY_TAX_EXEMPTION", "TAX_EXEMPTION", "TAX_EXEMPT"],
  taxExemptionRuleId: ["COMPANY_TAX_EXEMPTION_RULE", "TAX_EXEMPTION_RULE", "TAX_EXEMPTION_RULE_ID"],
  taxExemptionCertificateNumber: [
    "COMPANY_TAX_EXEMPT_CERT",
    "COMPANY_TAX_EXEMPTION_CERTIFICATE",
    "TAX_EXEMPTION_CERTIFICATE",
    "TAX_EXEMPTION_CERTIFICATE_NUMBER",
    "TAX_EXEMPT_CERT",
  ],
  taxExemptionValidTo: [
    "COMPANY_TAX_EXEMPT_VALID_UNTIL",
    "COMPANY_TAX_EXEMPTION_VALID_UNTIL",
    "TAX_EXEMPTION_VALID_UNTIL",
    "TAX_EXEMPTION_VALID_TO",
    "TAX_EXEMPT_VALID_UNTIL",
  ],
  billingInstruction: [
    "COMPANY_BILLING_INSTRUCTIONS",
    "COMPANY_BILLING_INSTRUCTION",
    "BILLING_INSTRUCTIONS",
    "BILLING_INSTRUCTION",
  ],

  // Step 4: Contracts & Agreements
  contractTypeId: ["COMPANY_CONTRACT_TYPE", "CONTRACT_TYPE", "CONTRACT_TYPE_ID"],
  contractName: ["COMPANY_CONTRACT_NAME", "CONTRACT_NAME"],
  contractCode: ["COMPANY_CONTRACT_CODE", "CONTRACT_CODE"],
  contractNumber: ["COMPANY_CONTRACT_NUMBER", "CONTRACT_NUMBER", "EXTERNAL_REFERENCE"],
  validFrom: ["COMPANY_CONTRACT_VALID_FROM", "CONTRACT_VALID_FROM", "VALID_FROM"],
  validTo: ["COMPANY_CONTRACT_VALID_TO", "CONTRACT_VALID_TO", "VALID_TO"],
  currencyCode: ["COMPANY_CONTRACT_CURRENCY", "CONTRACT_CURRENCY", "CURRENCY_CODE"],
  contractCurrency: ["COMPANY_CONTRACT_CURRENCY", "CONTRACT_CURRENCY", "CURRENCY_CODE"],
  status: ["COMPANY_CONTRACT_STATUS", "CONTRACT_STATUS", "STATUS"],
  contractStatus: ["COMPANY_CONTRACT_STATUS", "CONTRACT_STATUS", "STATUS"],
  pricingMethod: ["COMPANY_CONTRACT_PRICING_METHOD", "CONTRACT_PRICING_METHOD", "PRICING_METHOD"],
  depositPolicyId: ["COMPANY_CONTRACT_DEPOSIT_POLICY", "CONTRACT_DEPOSIT_POLICY", "DEPOSIT_POLICY_ID"],
  cancellationPolicyId: [
    "COMPANY_CONTRACT_CANCEL_POLICY",
    "COMPANY_CONTRACT_CANCELLATION_POLICY",
    "CONTRACT_CANCELLATION_POLICY",
    "CONTRACT_CANCEL_POLICY",
    "CANCELLATION_POLICY_ID",
  ],
  noShowPolicyId: ["COMPANY_CONTRACT_NOSHOW_POLICY", "CONTRACT_NOSHOW_POLICY", "NOSHOW_POLICY_ID"],
  contractNotes: ["COMPANY_CONTRACT_NOTES", "CONTRACT_NOTES"],
};

export const FIELD_ALIASES_MAP: Record<string, string[]> = {
  // Step 1: Company Details & Location
  COMPANY_NAME: ["COMPANY_NAME", "NAME"],
  COMPANY_TYPE: ["COMPANY_TYPE", "TYPE"],
  COMPANY_LEGAL_NAME: ["COMPANY_LEGAL_NAME", "LEGAL_NAME"],
  COMPANY_TRADE_NAME: ["COMPANY_TRADE_NAME", "TRADE_NAME"],
  COMPANY_CODE: ["COMPANY_CODE", "CODE"],
  COMPANY_ACCOUNT_STATUS: ["COMPANY_ACCOUNT_STATUS", "ACCOUNT_STATUS"],
  COMPANY_TAX_ID: ["COMPANY_TAX_ID", "TAX_ID", "TIN"],
  COMPANY_REGISTRATION_NUMBER: ["COMPANY_REGISTRATION_NUMBER", "REGISTRATION_NUMBER"],
  COMPANY_WEBSITE: ["COMPANY_WEBSITE", "WEBSITE"],
  COMPANY_NOTES: ["COMPANY_NOTES", "NOTES"],
  COMPANY_COUNTRY: ["COMPANY_COUNTRY", "COUNTRY"],
  COMPANY_REGION: ["COMPANY_REGION", "REGION", "STATE"],
  COMPANY_CITY: ["COMPANY_CITY", "CITY"],
  COMPANY_POSTAL_CODE: ["COMPANY_POSTAL_CODE", "POSTAL_CODE", "ZIP"],
  COMPANY_ADDRESS_LINE1: ["COMPANY_ADDRESS_LINE1", "ADDRESS_LINE1", "ADDRESS"],
  COMPANY_ADDRESS_LINE2: ["COMPANY_ADDRESS_LINE2", "ADDRESS_LINE2"],
  COMPANY_MARKET_SEGMENT: ["COMPANY_MARKET_SEGMENT", "MARKET_SEGMENT"],
  COMPANY_SOURCE: ["COMPANY_SOURCE", "SOURCE"],
  COMPANY_ACCOUNT_MANAGER: ["COMPANY_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"],

  // Step 2: Contact Information
  COMPANY_CONTACT_NAME: ["COMPANY_CONTACT_NAME", "CONTACT_NAME"],
  COMPANY_CONTACT_ROLE: ["COMPANY_CONTACT_ROLE", "CONTACT_ROLE"],
  COMPANY_CONTACT_POSITION: ["COMPANY_CONTACT_POSITION", "CONTACT_POSITION"],
  COMPANY_CONTACT_EMAIL: ["COMPANY_CONTACT_EMAIL", "CONTACT_EMAIL", "EMAIL"],
  COMPANY_CONTACT_PHONE: ["COMPANY_CONTACT_PHONE", "CONTACT_PHONE", "PHONE"],
  COMPANY_CONTACT_WHATSAPP: ["COMPANY_CONTACT_WHATSAPP", "CONTACT_WHATSAPP", "WHATSAPP"],
  COMPANY_CONTACT_PREFERRED_METHOD: ["COMPANY_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD"],
  COMPANY_CONTACT_NOTES: ["COMPANY_CONTACT_NOTES", "CONTACT_NOTES"],

  // Step 3: Billing & Credit
  COMPANY_DEFAULT_BILLING_RULE: ["COMPANY_DEFAULT_BILLING_RULE", "COMPANY_BILLING_RULE", "DEFAULT_BILLING_RULE", "BILLING_RULE"],
  COMPANY_SETTLEMENT_METHOD: ["COMPANY_SETTLEMENT_METHOD", "SETTLEMENT_METHOD", "DEFAULT_PAYMENT_METHOD_ID", "PAYMENT_METHOD"],
  COMPANY_BILLING_CURRENCY: ["COMPANY_BILLING_CURRENCY", "BILLING_CURRENCY", "BILLING_CURRENCY_CODE"],
  COMPANY_CREDIT_FACILITY: ["COMPANY_CREDIT_FACILITY", "CREDIT_FACILITY", "CREDIT_ACCOUNT_ENABLED", "ALLOW_CREDIT"],
  COMPANY_CREDIT_LIMIT: ["COMPANY_CREDIT_LIMIT", "CREDIT_LIMIT", "CREDIT_LIMIT_AMOUNT"],
  COMPANY_CREDIT_DAYS: ["COMPANY_CREDIT_DAYS", "CREDIT_DAYS"],
  COMPANY_CREDIT_STATUS: ["COMPANY_CREDIT_STATUS", "CREDIT_STATUS"],
  COMPANY_TAX_EXEMPTION: ["COMPANY_TAX_EXEMPTION", "TAX_EXEMPTION", "TAX_EXEMPT"],
  COMPANY_TAX_EXEMPTION_RULE: ["COMPANY_TAX_EXEMPTION_RULE", "TAX_EXEMPTION_RULE", "TAX_EXEMPTION_RULE_ID"],
  COMPANY_TAX_EXEMPT_CERT: ["COMPANY_TAX_EXEMPT_CERT", "COMPANY_TAX_EXEMPTION_CERTIFICATE", "TAX_EXEMPTION_CERTIFICATE", "TAX_EXEMPTION_CERTIFICATE_NUMBER", "TAX_EXEMPT_CERT"],
  COMPANY_TAX_EXEMPT_VALID_UNTIL: ["COMPANY_TAX_EXEMPT_VALID_UNTIL", "COMPANY_TAX_EXEMPTION_VALID_UNTIL", "TAX_EXEMPTION_VALID_UNTIL", "TAX_EXEMPTION_VALID_TO", "TAX_EXEMPT_VALID_UNTIL"],
  COMPANY_BILLING_INSTRUCTIONS: ["COMPANY_BILLING_INSTRUCTIONS", "COMPANY_BILLING_INSTRUCTION", "BILLING_INSTRUCTIONS", "BILLING_INSTRUCTION"],
  COMPANY_CONTRACT_TYPE: ["COMPANY_CONTRACT_TYPE", "CONTRACT_TYPE", "CONTRACT_TYPE_ID"],
  COMPANY_CONTRACT_NAME: ["COMPANY_CONTRACT_NAME", "CONTRACT_NAME"],
  COMPANY_CONTRACT_CODE: ["COMPANY_CONTRACT_CODE", "CONTRACT_CODE"],
  COMPANY_CONTRACT_NUMBER: ["COMPANY_CONTRACT_NUMBER", "CONTRACT_NUMBER", "EXTERNAL_REFERENCE"],
  COMPANY_CONTRACT_VALID_FROM: ["COMPANY_CONTRACT_VALID_FROM", "CONTRACT_VALID_FROM", "VALID_FROM"],
  COMPANY_CONTRACT_VALID_TO: ["COMPANY_CONTRACT_VALID_TO", "CONTRACT_VALID_TO", "VALID_TO"],
  COMPANY_CONTRACT_CURRENCY: ["COMPANY_CONTRACT_CURRENCY", "CONTRACT_CURRENCY", "CURRENCY_CODE"],
  COMPANY_CONTRACT_STATUS: ["COMPANY_CONTRACT_STATUS", "CONTRACT_STATUS", "STATUS"],
  COMPANY_CONTRACT_PRICING_METHOD: ["COMPANY_CONTRACT_PRICING_METHOD", "CONTRACT_PRICING_METHOD", "PRICING_METHOD"],
  COMPANY_CONTRACT_DEPOSIT_POLICY: ["COMPANY_CONTRACT_DEPOSIT_POLICY", "CONTRACT_DEPOSIT_POLICY", "DEPOSIT_POLICY_ID"],
  COMPANY_CONTRACT_CANCEL_POLICY: ["COMPANY_CONTRACT_CANCEL_POLICY", "COMPANY_CONTRACT_CANCELLATION_POLICY", "CONTRACT_CANCELLATION_POLICY", "CONTRACT_CANCEL_POLICY", "CANCELLATION_POLICY_ID"],
  COMPANY_CONTRACT_NOSHOW_POLICY: ["COMPANY_CONTRACT_NOSHOW_POLICY", "CONTRACT_NOSHOW_POLICY", "NOSHOW_POLICY_ID"],
  COMPANY_CONTRACT_NOTES: ["COMPANY_CONTRACT_NOTES", "CONTRACT_NOTES"],
};

export function createCompanyFieldRules(
  fields: Array<{ id: string; code: string; name?: string; required?: boolean; active?: boolean }>,
  profileType: { id?: string; requiredFieldIds?: string[] } | null,
  businessProfileType?: { taxIdRequired?: boolean; contactRequired?: boolean; requiredFieldIds?: string[] } | null,
): CompanyCreateFieldRule[] {
  const byCode = new Map<string, { id: string; code: string; name?: string; required?: boolean; active?: boolean }>();
  for (const f of fields) {
    byCode.set(f.code.trim().toUpperCase(), f);
  }

  const rules: CompanyCreateFieldRule[] = [];

  for (const def of ALL_COMPANY_CREATION_FIELDS) {
    const code = def.code.toUpperCase();
    const strippedCode = code.startsWith("COMPANY_") ? code.replace(/^COMPANY_/, "") : code;
    const aliases = FIELD_ALIASES_MAP[code] ?? [code, strippedCode];

    let matched: { id: string; code: string; name?: string; required?: boolean; active?: boolean } | undefined;
    for (const alias of aliases) {
      const found = byCode.get(alias.toUpperCase());
      if (found) {
        matched = found;
        break;
      }
    }
    if (!matched) {
      matched = byCode.get(code) || (code.startsWith("COMPANY_") ? byCode.get(strippedCode) : undefined);
    }

    const isSystem = Boolean(def.systemRequired);
    const active = matched ? matched.active !== false : true;

    let required = false;
    if (isSystem) {
      required = true;
    } else if (active) {
      const allCandidateCodes = new Set([def.code, code, strippedCode, ...aliases.map((a) => a.toUpperCase())]);
      const inProfileType = Boolean(
        (matched && profileType?.requiredFieldIds?.includes(matched.id)) ||
          profileType?.requiredFieldIds?.some((id) => allCandidateCodes.has(id.toUpperCase())),
      );
      const inBusinessProfile = Boolean(
        (matched && businessProfileType?.requiredFieldIds?.includes(matched.id)) ||
          businessProfileType?.requiredFieldIds?.some((id) => allCandidateCodes.has(id.toUpperCase())),
      );
      const isCompanyMatched = Boolean(matched && isCompanyFieldCode(matched.code));
      const fieldRequired = Boolean(isCompanyMatched && matched?.required);

      if (profileType) {
        // Profile Type configuration directly governs field requirement
        required = inProfileType || inBusinessProfile || fieldRequired;
      } else {
        // Fallback when no profileType is supplied
        const taxReq = (code === "COMPANY_TAX_ID" || code === "TAX_ID") && Boolean(businessProfileType?.taxIdRequired);
        const contactReq =
          (code === "COMPANY_CONTACT_NAME" || code === "CONTACT_NAME" || code === "COMPANY_CONTACT_PHONE" || code === "CONTACT_PHONE") &&
          Boolean(businessProfileType?.contactRequired);

        required = inBusinessProfile || fieldRequired || taxReq || contactReq;
      }
    }

    const rule: CompanyCreateFieldRule = {
      code: def.code,
      visible: isSystem ? true : active,
      required,
      label: def.name,
    };
    rules.push(rule);

    for (const alias of aliases) {
      rules.push({
        ...rule,
        code: alias,
      });
    }
    if (def.code.startsWith("COMPANY_")) {
      rules.push({
        ...rule,
        code: def.code.replace(/^COMPANY_/, ""),
      });
    }
  }

  return rules;
}

export function card4CompanyCreateGaps(
  draft: GuestCompanyCreateDraft,
  rules: CompanyCreateFieldRule[],
): Array<{ code: string; label: string; step: GuestCompanyCreateStepId }> {
  const gaps: Array<{ code: string; label: string; step: GuestCompanyCreateStepId }> = [];
  const byCode = new Map(rules.map((rule) => [rule.code.toUpperCase(), rule]));

  const need = (codes: string[], ok: boolean, step: GuestCompanyCreateStepId, customKey?: string) => {
    for (const code of codes) {
      const rule = byCode.get(code.toUpperCase());
      if (rule?.required && !ok) {
        gaps.push({ code: customKey || (codes.includes(rule.code) ? rule.code : codes[0]), label: rule.label, step });
        break;
      }
    }
  };

  // Step 1: Company Information (details)
  need(["COMPANY_NAME", "NAME"], filled(draft.name), "details", "name");
  need(["COMPANY_TYPE", "TYPE", "BUSINESS_PROFILE_TYPE_ID"], filled(draft.businessProfileTypeId), "details", "businessProfileTypeId");
  need(["COMPANY_CODE", "CODE"], filled(draft.code), "details", "code");
  need(["COMPANY_ACCOUNT_STATUS", "ACCOUNT_STATUS"], filled(draft.accountStatus), "details", "accountStatus");
  need(["COMPANY_TAX_ID", "TAX_ID", "TIN"], filled(draft.taxId), "details", "TAX_ID");
  need(["COMPANY_REGISTRATION_NUMBER", "REGISTRATION_NUMBER"], filled(draft.registrationNumber), "details", "registrationNumber");
  need(["COMPANY_INDUSTRY", "INDUSTRY"], filled(draft.industry), "details", "industry");
  need(["COMPANY_WEBSITE", "WEBSITE"], filled(draft.website), "details", "website");
  need(["COMPANY_NOTES", "NOTES"], filled(draft.notes), "details", "notes");

  need(["COMPANY_COUNTRY", "COUNTRY"], filled(draft.country), "details", "country");
  need(["COMPANY_REGION", "REGION", "STATE"], filled(draft.region), "details", "region");
  need(["COMPANY_CITY", "CITY"], filled(draft.city), "details", "CITY");
  need(["COMPANY_ADDRESS_LINE1", "ADDRESS_LINE1"], filled(draft.addressLine1), "details", "addressLine1");
  need(["COMPANY_ADDRESS_LINE2", "ADDRESS_LINE2"], filled(draft.addressLine2), "details", "addressLine2");
  need(["COMPANY_POSTAL_CODE", "POSTAL_CODE", "ZIP"], filled(draft.postalCode), "details", "postalCode");

  // Step 2: Contacts
  const hasContacts = draft.contacts.length > 0;
  need(["COMPANY_CONTACT_NAME", "CONTACT_NAME"], hasContacts && draft.contacts.some((c) => filled(c.name)), "contacts", "contactName");
  need(["COMPANY_CONTACT_POSITION", "CONTACT_POSITION"], hasContacts && draft.contacts.some((c) => filled(c.position)), "contacts", "contactPosition");
  need(["COMPANY_CONTACT_EMAIL", "CONTACT_EMAIL"], hasContacts && draft.contacts.some((c) => filled(c.email)), "contacts", "contactEmail");
  need(["COMPANY_CONTACT_PHONE", "CONTACT_PHONE"], hasContacts && draft.contacts.some((c) => filled(c.phone)), "contacts", "CONTACT_PHONE");
  need(["COMPANY_CONTACT_WHATSAPP", "CONTACT_WHATSAPP"], hasContacts && draft.contacts.some((c) => filled(c.whatsapp)), "contacts", "contactWhatsapp");
  need(["COMPANY_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD"], hasContacts && draft.contacts.some((c) => filled(c.preferredMethod)), "contacts", "contactPreferredMethod");
  need(["COMPANY_CONTACT_ROLE", "CONTACT_ROLE"], hasContacts && draft.contacts.some((c) => Array.isArray(c.roleIds) && c.roleIds.length > 0), "contacts", "contactRole");

  const isContactReq = (code: string) => {
    const upper = code.toUpperCase();
    const canonical = upper.startsWith("COMPANY_") ? upper : `COMPANY_${upper}`;
    const stripped = upper.startsWith("COMPANY_") ? upper.replace(/^COMPANY_/, "") : upper;
    return Boolean(byCode.get(canonical)?.required || byCode.get(stripped)?.required || byCode.get(upper)?.required);
  };

  // Check required fields on any contacts that are partially filled
  for (const contact of draft.contacts) {
    if (filled(contact.name)) {
      if (isContactReq("COMPANY_CONTACT_EMAIL") && !filled(contact.email)) {
        gaps.push({ code: "contactEmail", label: "Contact Email", step: "contacts" });
      }
      if (isContactReq("COMPANY_CONTACT_PHONE") && !filled(contact.phone)) {
        gaps.push({ code: "contactPhone", label: "Contact Phone", step: "contacts" });
      }
      if (isContactReq("COMPANY_CONTACT_POSITION") && !filled(contact.position)) {
        gaps.push({ code: "contactPosition", label: "Contact Position", step: "contacts" });
      }
      if (isContactReq("COMPANY_CONTACT_ROLE") && (!Array.isArray(contact.roleIds) || contact.roleIds.length === 0)) {
        gaps.push({ code: "contactRole", label: "Contact Role", step: "contacts" });
      }
      if (isContactReq("COMPANY_CONTACT_WHATSAPP") && !filled(contact.whatsapp)) {
        gaps.push({ code: "contactWhatsapp", label: "Contact WhatsApp", step: "contacts" });
      }
      if (isContactReq("COMPANY_CONTACT_PREFERRED_METHOD") && !filled(contact.preferredMethod)) {
        gaps.push({ code: "contactPreferredMethod", label: "Contact Preferred Method", step: "contacts" });
      }
      if (isContactReq("COMPANY_CONTACT_NOTES") && !filled(contact.notes)) {
        gaps.push({ code: "contactNotes", label: "Contact Notes", step: "contacts" });
      }
    }
  }

  // Step 3: Billing & Credit
  need(
    ["COMPANY_DEFAULT_BILLING_RULE", "COMPANY_BILLING_RULE", "DEFAULT_BILLING_RULE", "BILLING_RULE", "DEFAULT_BILLING_RULE_ID"],
    filled(draft.defaultBillingRuleId),
    "billing",
    "defaultBillingRuleId",
  );
  need(["COMPANY_PAYMENT_TIMING", "PAYMENT_TIMING"], filled(draft.paymentTiming), "billing", "paymentTiming");
  need(
    ["COMPANY_SETTLEMENT_METHOD", "SETTLEMENT_METHOD", "PAYMENT_METHOD", "DEFAULT_PAYMENT_METHOD_ID"],
    filled(draft.defaultPaymentMethodId) || filled(draft.paymentMethodId),
    "billing",
    "defaultPaymentMethodId",
  );
  need(["COMPANY_BILLING_CURRENCY", "BILLING_CURRENCY", "BILLING_CURRENCY_CODE"], filled(draft.billingCurrencyCode) || filled(draft.currency), "billing", "billingCurrencyCode");
  need(["COMPANY_CREDIT_FACILITY", "CREDIT_FACILITY", "CREDIT_ACCOUNT_ENABLED", "ALLOW_CREDIT"], draft.creditAccountEnabled === true, "billing", "creditAccountEnabled");
  need(
    ["COMPANY_CREDIT_LIMIT", "CREDIT_LIMIT", "CREDIT_LIMIT_AMOUNT"],
    draft.creditAccountEnabled && draft.creditLimitAmount !== null && draft.creditLimitAmount !== undefined && !Number.isNaN(Number(draft.creditLimitAmount)),
    "billing",
    "creditLimitAmount",
  );
  need(
    ["COMPANY_CREDIT_DAYS", "CREDIT_DAYS"],
    draft.creditAccountEnabled && draft.creditDays !== null && draft.creditDays !== undefined && Number(draft.creditDays) > 0,
    "billing",
    "creditDays",
  );
  need(["COMPANY_CREDIT_STATUS", "CREDIT_STATUS"], draft.creditAccountEnabled && filled(draft.creditStatus), "billing", "creditStatus");
  need(["COMPANY_TAX_EXEMPTION", "TAX_EXEMPTION", "TAX_EXEMPT"], draft.taxExempt === true, "billing", "taxExempt");
  need(["COMPANY_TAX_EXEMPTION_RULE", "TAX_EXEMPTION_RULE", "TAX_EXEMPTION_RULE_ID"], draft.taxExempt && filled(draft.taxExemptionRuleId), "billing", "taxExemptionRuleId");
  need(
    ["COMPANY_TAX_EXEMPT_CERT", "COMPANY_TAX_EXEMPTION_CERTIFICATE", "TAX_EXEMPTION_CERTIFICATE", "TAX_EXEMPTION_CERTIFICATE_NUMBER", "TAX_EXEMPT_CERT"],
    draft.taxExempt && filled(draft.taxExemptionCertificateNumber),
    "billing",
    "taxExemptionCertificateNumber",
  );
  need(
    ["COMPANY_TAX_EXEMPT_VALID_UNTIL", "COMPANY_TAX_EXEMPTION_VALID_UNTIL", "TAX_EXEMPTION_VALID_UNTIL", "TAX_EXEMPTION_VALID_TO", "TAX_EXEMPT_VALID_UNTIL"],
    draft.taxExempt && filled(draft.taxExemptionValidTo),
    "billing",
    "taxExemptionValidTo",
  );
  need(
    ["COMPANY_BILLING_INSTRUCTIONS", "COMPANY_BILLING_INSTRUCTION", "BILLING_INSTRUCTIONS", "BILLING_INSTRUCTION"],
    filled(draft.billingInstruction),
    "billing",
    "billingInstruction",
  );

  // Step 4: Contracts & Agreements
  const contract = draft.contract;
  need(["COMPANY_CONTRACT_TYPE", "CONTRACT_TYPE", "CONTRACT_TYPE_ID"], filled(contract?.contractTypeId), "contracts", "contractTypeId");
  need(["COMPANY_CONTRACT_NAME", "CONTRACT_NAME"], filled(contract?.name), "contracts", "contractName");
  need(["COMPANY_CONTRACT_CODE", "CONTRACT_CODE"], filled(contract?.code), "contracts", "contractCode");
  need(["COMPANY_CONTRACT_NUMBER", "CONTRACT_NUMBER", "EXTERNAL_REFERENCE"], filled(contract?.contractNumber), "contracts", "contractNumber");
  need(["COMPANY_CONTRACT_VALID_FROM", "CONTRACT_VALID_FROM", "VALID_FROM"], filled(contract?.validFrom), "contracts", "validFrom");
  need(["COMPANY_CONTRACT_VALID_TO", "CONTRACT_VALID_TO", "VALID_TO"], filled(contract?.validTo), "contracts", "validTo");
  need(["COMPANY_CONTRACT_CURRENCY", "CONTRACT_CURRENCY", "CURRENCY_CODE"], filled(contract?.currencyCode), "contracts", "currencyCode");
  need(["COMPANY_CONTRACT_STATUS", "CONTRACT_STATUS", "STATUS"], filled(contract?.status), "contracts", "status");
  need(["COMPANY_CONTRACT_PRICING_METHOD", "CONTRACT_PRICING_METHOD", "PRICING_METHOD"], filled(contract?.pricingMethod), "contracts", "pricingMethod");
  need(
    ["COMPANY_CONTRACT_DEPOSIT_POLICY", "CONTRACT_DEPOSIT_POLICY", "DEPOSIT_POLICY_ID"],
    filled(contract?.depositPolicyId) && contract?.depositPolicyId !== "none",
    "contracts",
    "depositPolicyId",
  );
  need(
    ["COMPANY_CONTRACT_CANCEL_POLICY", "COMPANY_CONTRACT_CANCELLATION_POLICY", "CONTRACT_CANCELLATION_POLICY", "CONTRACT_CANCEL_POLICY", "CANCELLATION_POLICY_ID"],
    filled(contract?.cancellationPolicyId) && contract?.cancellationPolicyId !== "none",
    "contracts",
    "cancellationPolicyId",
  );
  need(
    ["COMPANY_CONTRACT_NOSHOW_POLICY", "CONTRACT_NOSHOW_POLICY", "NOSHOW_POLICY_ID"],
    filled(contract?.noShowPolicyId) && contract?.noShowPolicyId !== "none",
    "contracts",
    "noShowPolicyId",
  );
  need(["COMPANY_CONTRACT_NOTES", "CONTRACT_NOTES"], filled(contract?.notes), "contracts", "contractNotes");

  return gaps;
}

export type CompanyCreateFieldIssue = CreateFieldIssue<GuestCompanyCreateStepId>;

export function matchCompanyFieldIssue(
  issues: CompanyCreateFieldIssue[],
  key: string,
): CompanyCreateFieldIssue | undefined {
  if (!issues || issues.length === 0 || !key) return undefined;

  const direct = issues.find((issue) => issue.key === key);
  if (direct) return direct;

  const upperKey = key.toUpperCase();
  const strippedKey = upperKey.startsWith("COMPANY_") ? upperKey.slice(8) : upperKey;
  const companyKey = upperKey.startsWith("COMPANY_") ? upperKey : `COMPANY_${upperKey}`;

  const aliasList = FIELD_CODES_BY_COMPANY_PROP[key] || [];
  const singleMapped = FIELD_CODE_BY_COMPANY_PROP[key];
  const mapList = FIELD_ALIASES_MAP[upperKey] || FIELD_ALIASES_MAP[companyKey] || [];

  const candidateKeys = new Set<string>([
    key,
    upperKey,
    strippedKey,
    companyKey,
    ...(singleMapped ? [singleMapped, singleMapped.toUpperCase()] : []),
    ...aliasList.map((a) => a.toUpperCase()),
    ...mapList.map((a) => a.toUpperCase()),
  ]);

  for (const [prop, codes] of Object.entries(FIELD_CODES_BY_COMPANY_PROP)) {
    if (codes.some((c) => c.toUpperCase() === upperKey || c.toUpperCase() === companyKey || c.toUpperCase() === strippedKey)) {
      candidateKeys.add(prop);
      candidateKeys.add(prop.toUpperCase());
    }
  }

  return issues.find((issue) => {
    const k = issue.key;
    if (candidateKeys.has(k)) return true;
    const kUpper = k.toUpperCase();
    if (candidateKeys.has(kUpper)) return true;
    const kStripped = kUpper.startsWith("COMPANY_") ? kUpper.slice(8) : kUpper;
    if (candidateKeys.has(kStripped)) return true;
    const kCompany = kUpper.startsWith("COMPANY_") ? kUpper : `COMPANY_${kUpper}`;
    if (candidateKeys.has(kCompany)) return true;
    return false;
  });
}

export function companyCreateFieldIssues(
  draft: GuestCompanyCreateDraft,
  options?: {
    rules?: CompanyCreateFieldRule[];
    businessProfileTypeIds?: string[];
    paymentMethodIds?: string[];
    currencyCodes?: string[];
    creditAccountAllowed?: boolean;
    contractDocumentTypes?: Array<{ id: string; name: string; required?: boolean; active?: boolean }>;
    billingRuleIds?: string[];
    taxExemptionRules?: Array<{ id: string; name?: string; documentationRequired?: boolean; active?: boolean }>;
  },
): CompanyCreateFieldIssue[] {
  const issues: CompanyCreateFieldIssue[] = [];
  const typeIds = options?.businessProfileTypeIds;
  const hasRules = Boolean(options?.rules && options.rules.length > 0);

  // Step 1: Details, Step 2: Contacts, Step 3: Billing, Step 4: Contracts via Card 4 Rules
  if (hasRules) {
    const gaps = card4CompanyCreateGaps(draft, options!.rules!);
    for (const gap of gaps) {
      if (!issues.some((iss) => iss.key === gap.code && iss.step === gap.step)) {
        issues.push({
          key: gap.code,
          message: `${gap.label} is required.`,
          step: gap.step,
        });
      }
    }
  } else {
    // Default fallback when no rules passed (backwards compatibility)
    if (!filled(draft.name)) issues.push({ key: "name", message: "Company name is required.", step: "details" });
    if (!filled(draft.businessProfileTypeId)) {
      issues.push({ key: "businessProfileTypeId", message: "Company type is required.", step: "details" });
    }
    // Fallback Step 3 required checks
    if (!filled(draft.defaultBillingRuleId)) {
      issues.push({ key: "defaultBillingRuleId", message: "Default billing rule is required.", step: "billing" });
    }
    if (!draft.paymentTiming) {
      issues.push({ key: "paymentTiming", message: "Payment timing is required.", step: "billing" });
    }
    // Fallback Step 4 required checks
    const contract = draft.contract;
    if (contract) {
      if (!filled(contract.contractTypeId)) {
        issues.push({ key: "contractTypeId", message: "Contract type is required.", step: "contracts" });
      }
      if (!filled(contract.name)) {
        issues.push({ key: "contractName", message: "Contract name is required.", step: "contracts" });
      }
      if (!filled(contract.code)) {
        issues.push({ key: "contractCode", message: "Contract code is required.", step: "contracts" });
      }
      if (!filled(contract.validFrom)) {
        issues.push({ key: "validFrom", message: "Valid-from date is required.", step: "contracts" });
      }
      if (!filled(contract.validTo)) {
        issues.push({ key: "validTo", message: "Valid-until date is required.", step: "contracts" });
      }
      if (!filled(contract.currencyCode)) {
        issues.push({ key: "currencyCode", message: "Contract currency is required.", step: "contracts" });
      }
    }
  }

  if (filled(draft.businessProfileTypeId) && typeIds && !typeIds.includes(draft.businessProfileTypeId)) {
    issues.push({ key: "businessProfileTypeId", message: "Select a configured company type.", step: "details" });
  }

  // Step 2: Contacts
  const named = draft.contacts.filter((row) => filled(row.name));
  const primaries = named.filter((row) => row.isPrimary);
  if (named.length > 0 && primaries.length !== 1) {
    issues.push({
      key: "contacts",
      message: "Exactly one primary contact is required when contacts are entered.",
      step: "contacts",
    });
  }
  for (const contact of named) {
    if (!validEmail(contact.email)) {
      issues.push({ key: "contacts", message: "Enter a valid contact email.", step: "contacts" });
    }
    const phoneErr = validateCompanyPhone(contact.phone);
    if (phoneErr) {
      issues.push({ key: "contacts", message: phoneErr, step: "contacts" });
    }
  }
  for (const contact of draft.contacts) {
    if (!filled(contact.name) && filled(contact.phone)) {
      const phoneErr = validateCompanyPhone(contact.phone);
      if (phoneErr) {
        issues.push({ key: "contacts", message: phoneErr, step: "contacts" });
      }
    }
  }

  // Step 3: Billing & Credit Format / Cross-field rules
  if (filled(draft.defaultPaymentMethodId) && options?.paymentMethodIds && !options.paymentMethodIds.includes(draft.defaultPaymentMethodId)) {
    issues.push({ key: "defaultPaymentMethodId", message: "Select a configured payment method.", step: "billing" });
  }

  if (filled(draft.billingCurrencyCode) && options?.currencyCodes?.length && !options.currencyCodes.includes(draft.billingCurrencyCode)) {
    issues.push({ key: "billingCurrencyCode", message: "Select a configured billing currency.", step: "billing" });
  }

  // Cross-conditional: Payment Timing = Credit Terms requires Credit enabled and credit days
  if (draft.paymentTiming === "credit_terms") {
    if (!draft.creditAccountEnabled) {
      issues.push({
        key: "creditAccountEnabled",
        message: "Enable Credit Facility to use Credit Terms.",
        step: "billing",
      });
    }
    if (draft.creditDays === null || draft.creditDays === undefined || draft.creditDays <= 0) {
      issues.push({
        key: "creditDays",
        message: "Credit days are required when credit terms are selected.",
        step: "billing",
      });
    }
  }

  // Section 2: Credit Facility
  if (draft.creditAccountEnabled) {
    if (options?.creditAccountAllowed === false) {
      issues.push({ key: "creditAccountEnabled", message: "This company type does not allow a credit account.", step: "billing" });
    }

    if (!draft.creditStatus) {
      issues.push({ key: "creditStatus", message: "Credit status is required when credit is enabled.", step: "billing" });
    }

    if (draft.creditLimitAmount !== null && draft.creditLimitAmount !== undefined && draft.creditLimitAmount < 0) {
      issues.push({ key: "creditLimitAmount", message: "Credit limit must be 0 or greater.", step: "billing" });
    }

    if (draft.creditDays !== null && draft.creditDays !== undefined && draft.creditDays < 0) {
      issues.push({ key: "creditDays", message: "Credit days must be 0 or greater.", step: "billing" });
    }
  }

  // Section 3: Tax Exemption
  if (draft.taxExempt) {
    if (!filled(draft.taxExemptionRuleId)) {
      issues.push({ key: "taxExemptionRuleId", message: "Tax exemption rule is required when tax exempt is enabled.", step: "billing" });
    } else if (options?.taxExemptionRules) {
      const selectedRule = options.taxExemptionRules.find((r) => r.id === draft.taxExemptionRuleId);
      if (selectedRule?.documentationRequired && !filled(draft.taxExemptionCertificateNumber)) {
        issues.push({
          key: "taxExemptionCertificateNumber",
          message: "Certificate or reference number is required for this exemption rule.",
          step: "billing",
        });
      }
    }
  }

  // Legacy field validation (fallback compatibility if legacy fields are still populated)
  if (
    filled(draft.billingArrangement) &&
    !ACCOUNT_BILLING_ARRANGEMENTS.some((row) => row.id === draft.billingArrangement)
  ) {
    issues.push({ key: "billingArrangement", message: "Select a configured billing arrangement.", step: "billing" });
  }
  if (filled(draft.paymentMethodId) && options?.paymentMethodIds && !options.paymentMethodIds.includes(draft.paymentMethodId)) {
    issues.push({ key: "paymentMethodId", message: "Select a configured payment method.", step: "billing" });
  }
  if (filled(draft.currency) && options?.currencyCodes?.length && !options.currencyCodes.includes(draft.currency)) {
    issues.push({ key: "currency", message: "Select a configured currency.", step: "billing" });
  }
  if (filled(draft.billingEmail) && !validEmail(draft.billingEmail)) {
    issues.push({ key: "billingEmail", message: "Enter a valid billing email.", step: "billing" });
  }

  // Step 4: Contracts & Agreements constraints
  const contract = draft.contract;
  if (contract) {
    if (filled(contract.validFrom) && filled(contract.validTo) && contract.validTo < contract.validFrom) {
      issues.push({ key: "validTo", message: "Valid-until must be on or after valid-from date.", step: "contracts" });
    }
    if (filled(contract.currencyCode) && options?.currencyCodes?.length && !options.currencyCodes.includes(contract.currencyCode)) {
      issues.push({ key: "currencyCode", message: "Select a configured contract currency from settings.", step: "contracts" });
    }

    // Pricing Method validation
    if (contract.pricingMethod === "rate_plan") {
      const isSelected = contract.ratePlanScope === "selected" || !contract.ratePlanScope;
      const hasPlan = (contract.ratePlanIds && contract.ratePlanIds.length > 0) || filled(contract.ratePlanId);
      if (isSelected && !hasPlan) {
        issues.push({ key: "ratePlanId", message: "Method A requires selecting an active Rate Plan.", step: "contracts" });
      }
    } else if (contract.pricingMethod === "rate_plan_discount") {
      const isSelected = contract.ratePlanScope === "selected" || !contract.ratePlanScope;
      const hasPlan = (contract.ratePlanIds && contract.ratePlanIds.length > 0) || filled(contract.ratePlanId);
      if (isSelected && !hasPlan) {
        issues.push({ key: "ratePlanId", message: "Method B requires selecting a base Rate Plan.", step: "contracts" });
      }
      if (contract.discountApplication === "custom") {
        const discounts = contract.ratePlanDiscounts ?? [];
        for (let i = 0; i < discounts.length; i++) {
          const d = discounts[i];
          if (d.discountValue === null || d.discountValue === undefined || d.discountValue < 0) {
            issues.push({ key: `ratePlanDiscounts.${d.ratePlanId}`, message: "Enter a non-negative discount value.", step: "contracts" });
          } else if (d.discountType === "percent" && d.discountValue > 100) {
            issues.push({ key: `ratePlanDiscounts.${d.ratePlanId}`, message: "Percentage discount cannot exceed 100%.", step: "contracts" });
          }
        }
      } else {
        if (!filled(contract.discountType)) {
          issues.push({ key: "discountType", message: "Select a discount type for Method B.", step: "contracts" });
        }
        if (contract.discountValue === null || contract.discountValue === undefined || contract.discountValue < 0) {
          issues.push({ key: "discountValue", message: "Enter a non-negative discount value.", step: "contracts" });
        } else if (contract.discountType === "percent" && contract.discountValue > 100) {
          issues.push({ key: "discountValue", message: "Percentage discount cannot exceed 100%.", step: "contracts" });
        }
      }
    } else if (contract.pricingMethod === "contracted_rates") {
      const rates = contract.contractRates ?? [];
      if (rates.length === 0) {
        if (contract.status === "active") {
          issues.push({ key: "contractRates", message: "At least one contracted room rate is required for Method C.", step: "contracts" });
        }
      } else {
        const seen = new Set<string>();
        for (let i = 0; i < rates.length; i++) {
          const row = rates[i];
          if (!filled(row.roomTypeId)) {
            issues.push({ key: `contractRates.${i}.roomTypeId`, message: `Select a room type for line ${i + 1}.`, step: "contracts" });
          } else if (seen.has(row.roomTypeId)) {
            issues.push({ key: `contractRates.${i}.roomTypeId`, message: `Duplicate room type selected on line ${i + 1}.`, step: "contracts" });
          } else {
            seen.add(row.roomTypeId);
          }
          if (row.amount === null || row.amount === undefined || row.amount < 0) {
            issues.push({ key: `contractRates.${i}.amount`, message: `Rate amount must be 0 or greater on line ${i + 1}.`, step: "contracts" });
          }
        }
      }
    }

    // Required Contract Documents Validation (enforced for Active status)
    if (contract.status === "active" && options?.contractDocumentTypes) {
      for (const docType of options.contractDocumentTypes) {
        if (docType.required && docType.active) {
          const uploaded = contract.documents.some((d) => d.documentTypeId === docType.id);
          if (!uploaded) {
            issues.push({
              key: `documents.${docType.id}`,
              message: `${docType.name} is required for an active contract.`,
              step: "contracts",
            });
          }
        }
      }
    }
  }

  return issues;
}

export function companyCreateStepErrors(
  step: GuestCompanyCreateStepId,
  draft: GuestCompanyCreateDraft,
  options?: Parameters<typeof companyCreateFieldIssues>[1],
): string[] {
  return uniqueIssueMessages(companyCreateFieldIssues(draft, options), step);
}

export function companyCreateDraftErrors(
  draft: GuestCompanyCreateDraft,
  options?: Parameters<typeof companyCreateStepErrors>[2],
): string[] {
  return companyCreateStepErrors("review", draft, options);
}

export function companyCreateDraftErrorsForSave(draft: GuestCompanyCreateDraft): string[] {
  return filled(draft.name) ? [] : ["Company name is required to save a draft."];
}

export function guestCompanyCreateHasChanges(draft: GuestCompanyCreateDraft): boolean {
  const empty = emptyGuestCompanyCreateDraft();
  const current = { ...draft, accountId: null, acknowledgeNameDuplicate: false };
  const baseline = { ...empty, accountId: null, acknowledgeNameDuplicate: false };
  return JSON.stringify(current) !== JSON.stringify(baseline);
}

export function guestCompanyCreateCompletion(
  draft: GuestCompanyCreateDraft,
  options?: { rules?: CompanyCreateFieldRule[] },
): {
  percent: number;
  items: GuestCompanyCreateCompletionItem[];
} {
  const gaps = options?.rules ? card4CompanyCreateGaps(draft, options.rules) : [];
  const detailsGaps = gaps.filter((g) => g.step === "details");
  const contactsGaps = gaps.filter((g) => g.step === "contacts");
  const billingGaps = gaps.filter((g) => g.step === "billing");
  const contractsGaps = gaps.filter((g) => g.step === "contracts");

  const items: GuestCompanyCreateCompletionItem[] = [
    {
      id: "identity",
      label: "Company identity",
      complete: detailsGaps.length === 0 && filled(draft.name) && filled(draft.businessProfileTypeId),
      requiredRemaining: detailsGaps.length > 0 || !filled(draft.name) || !filled(draft.businessProfileTypeId),
      step: "details",
    },
    {
      id: "contacts",
      label: "Contacts",
      complete:
        contactsGaps.length === 0 &&
        (draft.contacts.some((row) => filled(row.name) && row.isPrimary) || draft.contacts.every((row) => !filled(row.name))),
      requiredRemaining: contactsGaps.length > 0,
      step: "contacts",
    },
    {
      id: "billing",
      label: "Billing & credit",
      complete:
        billingGaps.length === 0 &&
        (options?.rules
          ? true
          : filled(draft.defaultBillingRuleId) && Boolean(draft.paymentTiming)),
      requiredRemaining:
        billingGaps.length > 0 ||
        (!options?.rules && (!filled(draft.defaultBillingRuleId) || !draft.paymentTiming)),
      step: "billing",
    },
    {
      id: "contracts",
      label: "Contracts & agreements",
      complete:
        contractsGaps.length === 0 &&
        (options?.rules
          ? true
          : Boolean(draft.contract && filled(draft.contract.name) && filled(draft.contract.contractTypeId))),
      requiredRemaining:
        contractsGaps.length > 0 ||
        (!options?.rules &&
          Boolean(!draft.contract || !filled(draft.contract.name) || !filled(draft.contract.contractTypeId))),
      step: "contracts",
    },
  ];
  const done = items.filter((item) => item.complete && !item.requiredRemaining).length;
  return {
    percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    items,
  };
}

export function optionLabel(options: AccountCreateCatalogueOption[], id: string): string {
  const match = options.find((row) => row.id === id);
  if (!match) return "";
  return match.code && match.code !== match.name ? `${match.code} — ${match.name}` : match.name;
}

export function billingArrangementLabel(id: string): string {
  return ACCOUNT_BILLING_ARRANGEMENTS.find((row) => row.id === id)?.label || id;
}

export function companyTypeLabel(id: string): string {
  return isCompanyType(id)
    ? {
        private_limited: "Private limited",
        plc: "PLC",
        sole_proprietorship: "Sole proprietorship",
        partnership: "Partnership",
        ngo: "NGO",
        government: "Government",
        other: "Other",
      }[id]
    : id;
}

export function primaryCompanyContact(draft: GuestCompanyCreateDraft): AccountCreateContactDraft | undefined {
  return draft.contacts.find((row) => row.isPrimary && filled(row.name)) ?? draft.contacts.find((row) => filled(row.name));
}

export function paymentTimingLabel(id?: string | null): string {
  return COMPANY_BILLING_TIMINGS.find((t) => t.id === id)?.label || id || "—";
}

export function creditStatusLabel(id?: string | null): string {
  return COMPANY_CREDIT_STATUSES.find((s) => s.id === id)?.label || id || "—";
}

export function draftToCompanyAccountInput(draft: GuestCompanyCreateDraft) {
  const primary = primaryCompanyContact(draft);
  const creditEnabled = Boolean(draft.creditAccountEnabled);
  return {
    name: draft.name,
    code: blank(draft.code),
    tradeName: blank(draft.tradeName),
    companyType: blank(draft.companyType),
    companyTypeOther: draft.companyType === "other" ? blank(draft.companyTypeOther) : null,
    businessProfileTypeId: blank(draft.businessProfileTypeId),
    accountStatus: draft.accountStatus,
    taxId: blank(draft.taxId),
    businessRegistrationNumber: blank(draft.registrationNumber),
    website: blank(draft.website),
    notes: blank(draft.notes),
    email: primary?.email ? primary.email.trim() : null,
    phone: primary?.phone ? primary.phone.trim() : null,
    primaryContactName: primary?.name ? primary.name.trim() : null,
    primaryContactTitle: primary?.position ? primary.position.trim() : null,
    addressLine1: blank(draft.addressLine1),
    addressLine2: blank(draft.addressLine2),
    city: blank(draft.city),
    region: blank(draft.region),
    postalCode: blank(draft.postalCode),
    country: blank(draft.country),
    sourceOfBusiness: blank(draft.sourceOfBusiness),
    corporateAccountReference: blank(draft.contractReference),
    paymentTerms: blank(draft.paymentTerms),
    creditLimitNote: blank(draft.creditLimitNote),
    billingInstruction: blank(draft.billingInstruction),
    creditAccountEnabled: creditEnabled,
    acknowledgeNameDuplicate: draft.acknowledgeNameDuplicate,

    // Step 3 Structured fields for guest_account_masters
    defaultBillingRuleId: blank(draft.defaultBillingRuleId),
    defaultPaymentMethodId: blank(draft.defaultPaymentMethodId) || blank(draft.paymentMethodId),
    billingCurrencyCode: blank(draft.billingCurrencyCode) || blank(draft.currency),
    paymentTiming: draft.paymentTiming || null,
    creditLimitAmount: creditEnabled && draft.creditLimitAmount !== null && draft.creditLimitAmount !== undefined ? Number(draft.creditLimitAmount) : null,
    creditDays: creditEnabled && draft.creditDays !== null && draft.creditDays !== undefined ? Number(draft.creditDays) : null,
    creditStatus: creditEnabled ? (draft.creditStatus || "pending_approval") : null,
    taxExempt: Boolean(draft.taxExempt),
    taxExemptionRuleId: draft.taxExempt ? blank(draft.taxExemptionRuleId) : null,
    taxExemptionCertificateNumber: draft.taxExempt ? blank(draft.taxExemptionCertificateNumber) : null,
    taxExemptionValidTo: draft.taxExempt ? blank(draft.taxExemptionValidTo) : null,
  };
}

export function draftToAccountOperations(draft: GuestCompanyCreateDraft): Record<string, unknown> {
  const hasNewContract = Boolean(
    draft.contract && (filled(draft.contract.name) || filled(draft.contract.contractTypeId)),
  );
  return {
    industry: blank(draft.industry),
    sourceCodeId: blank(draft.sourceCodeId),
    sourceOfBusiness: blank(draft.sourceOfBusiness),
    marketSegmentId: blank(draft.marketSegmentId),
    accountManagerMembershipId: blank(draft.accountManagerId),
    // Rule 34: New contract data is authoritative in pms_corporate_agreements
    contract: hasNewContract
      ? null
      : {
          reference: blank(draft.contractReference),
          startDate: blank(draft.contractStartDate),
          endDate: blank(draft.contractEndDate),
          copy: COMPANY_CREATE_CONTRACT_COPY,
        },
    defaults: {
      ratePlanId: blank(draft.ratePlanId),
      packageId: blank(draft.packageId),
      mealPlanId: blank(draft.mealPlanId),
    },
    billing: {
      arrangement: blank(draft.billingArrangement),
      contactName: blank(draft.billingContactName),
      contactEmail: blank(draft.billingEmail),
      paymentMethodId: blank(draft.paymentMethodId),
      currency: blank(draft.currency),
    },
    taxExemptionNote: blank(draft.taxExemptionNote),
    taxNote: blank(draft.taxNote),
    contactPreferredMethods: draft.contacts
      .filter((row) => filled(row.name))
      .map((row) => ({ key: row.key, id: row.id, method: blank(row.preferredMethod) })),
  };
}

export { COMPANY_TYPES };
