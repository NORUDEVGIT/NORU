/**
 * Register New Company workflow helpers.
 * Canonical rows stay on guest_account_masters.account_type = company.
 * Extra commercial defaults are stored as account_operations, not a second ledger.
 */

import { COMPANY_TYPES, isCompanyType } from "./guest-profile-company.ts";
import { GUEST_ACCOUNT_STATUSES, type GuestAccountStatus } from "./guest-profile-wave4.ts";
import { uniqueIssueMessages, type CreateFieldIssue } from "./guest-create-step-issues.ts";

export const GUEST_COMPANY_CREATE_MIGRATION_FILE = "0099_pms_account_create_drafts.sql";

export const GUEST_COMPANY_CREATE_STEPS = [
  { id: "details", number: 1, title: "Company Details" },
  { id: "contacts", number: 2, title: "Contacts" },
  { id: "business", number: 3, title: "Business & Commercial" },
  { id: "billing", number: 4, title: "Billing & Credit" },
  { id: "review", number: 5, title: "Review & Confirm" },
] as const;

export type GuestCompanyCreateStepId = (typeof GUEST_COMPANY_CREATE_STEPS)[number]["id"];

export const GUEST_COMPANY_CREATE_TITLE = "Register New Company";
export const GUEST_COMPANY_CREATE_COPY =
  "Create a company master and keep commercial defaults in one place.";
export const GUEST_COMPANY_CREATE_DRAFT_SAVED =
  "Draft company saved. You can continue this registration later.";
export const GUEST_COMPANY_CREATE_PROGRESS_KEPT =
  "Your progress is kept. Return to Register New Company to continue.";
export const GUEST_COMPANY_CREATE_START_OVER = "Start Over";
export const GUEST_COMPANY_CREATE_START_OVER_COPY =
  "This clears the form and saved progress. A company already created is kept.";
export const GUEST_COMPANY_CREATE_HOLD_KEY_PREFIX = "noru.company-create.hold";
export const GUEST_COMPANY_CREATE_HOLD_DEBOUNCE_MS = 700;

export const COMPANY_CREATE_CONTRACT_COPY =
  "Contract here is a reference default, not a signed agreement row.";
export const COMPANY_CREATE_CREDIT_COPY =
  "Credit is stored on this company only. It does not enforce a credit limit or post to a ledger.";
export const COMPANY_CREATE_TAX_COPY =
  "Tax exemption notes are stored as defaults. They do not change folio tax.";

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
  if (filled(draft.billingArrangement) || draft.creditAccountEnabled || filled(draft.paymentMethodId)) {
    return "billing";
  }
  if (filled(draft.addressLine1) || filled(draft.marketSegmentId) || filled(draft.contractReference)) {
    return "business";
  }
  if (draft.contacts.some((row) => filled(row.name))) return "contacts";
  return "details";
}

export function parseGuestCompanyCreateHold(payload: unknown): GuestCompanyCreateHold | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { step?: unknown; draft?: unknown };
  if (isGuestCompanyCreateDraftShape(record.draft)) {
    return {
      step: isGuestCompanyCreateStepId(String(record.step ?? ""))
        ? (record.step as GuestCompanyCreateStepId)
        : inferGuestCompanyCreateStep(record.draft),
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
    city: "",
    region: "",
    postalCode: "",
    country: "",
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
    contacts,
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

export type CompanyCreateFieldIssue = CreateFieldIssue<GuestCompanyCreateStepId>;

export function companyCreateFieldIssues(
  draft: GuestCompanyCreateDraft,
  options?: {
    businessProfileTypeIds?: string[];
    paymentMethodIds?: string[];
    currencyCodes?: string[];
    creditAccountAllowed?: boolean;
  },
): CompanyCreateFieldIssue[] {
  const issues: CompanyCreateFieldIssue[] = [];
  const typeIds = options?.businessProfileTypeIds;
  if (!filled(draft.name)) issues.push({ key: "name", message: "Company name is required.", step: "details" });
  if (!filled(draft.businessProfileTypeId)) {
    issues.push({ key: "businessProfileTypeId", message: "Company type is required.", step: "details" });
  }
  if (filled(draft.businessProfileTypeId) && typeIds && !typeIds.includes(draft.businessProfileTypeId)) {
    issues.push({ key: "businessProfileTypeId", message: "Select a configured company type.", step: "details" });
  }
  if (filled(draft.companyType) && !isCompanyType(draft.companyType)) {
    issues.push({ key: "companyType", message: "Select a recognised legal form.", step: "details" });
  }
  if (draft.companyType === "other" && !filled(draft.companyTypeOther)) {
    issues.push({ key: "companyTypeOther", message: "Describe the legal form when Other is selected.", step: "details" });
  }
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
  }
  const dateError = contractDateError(draft.contractStartDate, draft.contractEndDate);
  if (dateError) {
    issues.push({ key: "contractStartDate", message: dateError, step: "business" });
    issues.push({ key: "contractEndDate", message: dateError, step: "business" });
  }
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
  if (draft.creditAccountEnabled && options?.creditAccountAllowed === false) {
    issues.push({ key: "creditAccountEnabled", message: "This company type does not allow a credit account.", step: "billing" });
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

export function guestCompanyCreateCompletion(draft: GuestCompanyCreateDraft): {
  percent: number;
  items: GuestCompanyCreateCompletionItem[];
} {
  const items: GuestCompanyCreateCompletionItem[] = [
    {
      id: "identity",
      label: "Company identity",
      complete: filled(draft.name) && filled(draft.businessProfileTypeId),
      requiredRemaining: !filled(draft.name) || !filled(draft.businessProfileTypeId),
      step: "details",
    },
    {
      id: "contacts",
      label: "Contacts",
      complete: draft.contacts.some((row) => filled(row.name) && row.isPrimary) || draft.contacts.every((row) => !filled(row.name)),
      requiredRemaining: false,
      step: "contacts",
    },
    {
      id: "business",
      label: "Business defaults",
      complete: !contractDateError(draft.contractStartDate, draft.contractEndDate),
      requiredRemaining: Boolean(contractDateError(draft.contractStartDate, draft.contractEndDate)),
      step: "business",
    },
    {
      id: "billing",
      label: "Billing & credit",
      complete: true,
      requiredRemaining: false,
      step: "billing",
    },
  ];
  const done = items.filter((item) => item.complete && !item.requiredRemaining).length;
  return {
    percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    items,
  };
}

export function optionLabel(options: AccountCreateCatalogueOption[], id: string): string {
  return options.find((row) => row.id === id)?.name || "";
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

export function draftToCompanyAccountInput(draft: GuestCompanyCreateDraft) {
  const primary = primaryCompanyContact(draft);
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
    creditAccountEnabled: draft.creditAccountEnabled,
    acknowledgeNameDuplicate: draft.acknowledgeNameDuplicate,
  };
}

export function draftToAccountOperations(draft: GuestCompanyCreateDraft): Record<string, unknown> {
  return {
    industry: blank(draft.industry),
    sourceCodeId: blank(draft.sourceCodeId),
    sourceOfBusiness: blank(draft.sourceOfBusiness),
    marketSegmentId: blank(draft.marketSegmentId),
    accountManagerMembershipId: blank(draft.accountManagerId),
    contract: {
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
