/**
 * Register New Travel Agency workflow helpers.
 * Canonical rows stay on guest_account_masters.account_type = travel_agent.
 * Extra commercial defaults are stored as account_operations, not a second ledger.
 */

import {
  AGENCY_TYPE_LABELS,
  AGENCY_TYPES,
  TA_COMMISSION_REFERENCE_COPY,
  isAgencyType,
  type AgencyType,
} from "./guest-profile-travel-agency.ts";
import { GUEST_ACCOUNT_STATUSES, type GuestAccountStatus } from "./guest-profile-wave4.ts";
import { TA_COMMISSION_PLAN_TYPES } from "./guest-travel-agent-detail-workspace.ts";
import { uniqueIssueMessages, type CreateFieldIssue } from "./guest-create-step-issues.ts";

export const GUEST_TRAVEL_AGENT_CREATE_MIGRATION_FILE = "0099_pms_account_create_drafts.sql";

export const GUEST_TRAVEL_AGENT_CREATE_STEPS = [
  { id: "basic_info", number: 1, title: "Basic Information" },
  { id: "contacts", number: 2, title: "Contacts" },
  { id: "commission_rates", number: 3, title: "Commission & Rates" },
  { id: "payment_rules", number: 4, title: "Payment, Credit & Reservation Rules" },
  { id: "review", number: 5, title: "Final Review & Create" },
] as const;

export type GuestTravelAgentCreateStepId =
  | (typeof GUEST_TRAVEL_AGENT_CREATE_STEPS)[number]["id"]
  | "booking_operations" // legacy compatibility alias
  | "billing"; // legacy compatibility alias

export type Step3CommercialModel = "commissionable" | "net_rate";
export type Step3CommissionApplicationMode = "all" | "specific";
export type Step3RateDefaultMode = "all" | "specific";
export type Step3NetPricingMethod = "rate_plan" | "rate_plan_discount" | "contracted_rates";

export type CommissionRuleDraft = {
  id?: string;
  scopeType: "all" | "room_type" | "rate_plan";
  roomTypeId: string | null;
  ratePlanId: string | null;
  commissionType: "percent" | "fixed";
  commissionValue: string;
};

export type AgencyRateDefaultDraft = {
  roomTypeId: string;
  ratePlanId: string;
};

export type ContractedRateDraft = {
  roomTypeId: string;
  amount: string;
};

export const GUEST_TRAVEL_AGENT_CREATE_TITLE = "Register New Travel Agency";
export const GUEST_TRAVEL_AGENT_CREATE_COPY =
  "Create a travel agency master and keep commercial defaults in one place.";
export const GUEST_TRAVEL_AGENT_CREATE_DRAFT_SAVED =
  "Draft travel agency saved. You can continue this registration later.";
export const GUEST_TRAVEL_AGENT_CREATE_PROGRESS_KEPT =
  "Your progress is kept. Return to Register New Travel Agency to continue.";
export const GUEST_TRAVEL_AGENT_CREATE_START_OVER = "Start Over";
export const GUEST_TRAVEL_AGENT_CREATE_START_OVER_COPY =
  "This clears the form and saved progress. An agency already created is kept.";
export const GUEST_TRAVEL_AGENT_CREATE_HOLD_KEY_PREFIX = "noru.travel-agent-create.hold";
export const GUEST_TRAVEL_AGENT_CREATE_HOLD_DEBOUNCE_MS = 700;

export const TRAVEL_AGENT_CREATE_CONTRACT_COPY =
  "Contract here is a reference default, not a signed agreement row.";
export const TRAVEL_AGENT_CREATE_CREDIT_COPY =
  "Credit limit amount is stored on this agency only. It is not enforced here.";

export const ACCOUNT_BILLING_ARRANGEMENTS = [
  { id: "agency_master", label: "Agency Master" },
  { id: "individual", label: "Individual Guests" },
  { id: "split", label: "Split Billing" },
] as const;

export const CONTACT_PREFERRED_METHODS = [
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

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
};

export type AccountCreateContactDraft = {
  key: string;
  id: string | null;
  name: string;
  roleId: string | null;
  position: string;
  email: string;
  phone: string;
  whatsapp: string;
  isPrimary: boolean;
  preferredMethod: string;
  notes: string;
};

export function generateAgencyCode(typeCode: string, sequence = 1): string {
  const prefix = (typeCode || "TA").trim().toUpperCase();
  const padded = String(sequence).padStart(3, "0");
  return `${prefix}-${padded}`;
}

export type TravelAgencyDraftDocument = {
  documentTypeId: string;
  documentTypeCode?: string;
  name: string;
  storagePath: string;
  fileSizeBytes?: number;
};

export type GuestTravelAgentCreateDraft = {
  accountId: string | null;
  name: string;
  tradeName: string;
  code: string;
  agencyType: string;
  agencyTypeOther: string;
  accountStatus: GuestAccountStatus;
  iataLicenseNumber: string;
  licenseExpiryDate: string;
  website: string;
  notes: string;
  contacts: AccountCreateContactDraft[];
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  taxId: string;
  registrationNumber: string;
  marketSegmentId: string;
  sourceCodeId: string;
  sourceOfBusiness: string;
  accountManagerId: string;
  ratePlanId: string;
  packageId: string;
  mealPlanId: string;
  contractReference: string;
  contractStartDate: string;
  contractEndDate: string;
  billingArrangement: string;
  billingContactName: string;
  billingEmail: string;
  paymentMethodId: string;
  currency: string;
  paymentTerms: string;
  billingInstruction: string;
  creditLimitAmount: string;
  creditLimitNote: string;

  // Step 3: Commercial Model & Rates Domain
  commercialModel: Step3CommercialModel;

  // Step 3: Commission Setup (Commissionable only)
  commissionEnabled: boolean;
  commissionType: string;
  commissionValue: string;
  commissionCurrency: string;
  commissionEffectiveOn: string;
  commissionExpiresOn: string;
  commissionNotes: string;

  // Step 3: Commission Application Rules
  commissionApplicationMode: Step3CommissionApplicationMode;
  allCommissionType: "percent" | "fixed";
  allCommissionValue: string;
  commissionRules: CommissionRuleDraft[];

  // Step 3: Agency Rate Defaults (Commissionable only)
  rateDefaultMode: Step3RateDefaultMode;
  rateDefaultCategoryId: string | null;
  agencyRateDefaults: AgencyRateDefaultDraft[];

  // Step 3: Net Rate Pricing (Net Rate only)
  netPricingMethod: Step3NetPricingMethod | null;
  netRoomTypeId: string | null;
  netRatePlanId: string | null;
  netDiscountType: "percent" | "fixed" | null;
  netDiscountValue: string;
  netCurrencyCode: string;
  netValidFrom: string;
  netValidUntil: string;
  contractedRates: ContractedRateDraft[];

  commercialNotes: string;

  // Step 4: Payment, Credit & Reservation Rules
  billingCurrencyCode: string;
  defaultPaymentMethodId: string | null;
  paymentTiming: "due_on_arrival" | "due_on_departure" | "prepaid" | "credit_terms" | null;
  defaultBillingRuleId: string | null;
  allowCredit: boolean;
  creditDays: number | null;
  creditDaysPreset: string;
  creditStatus: "pending_approval" | "approved" | "suspended" | null;
  defaultDepositPolicyId: string | null;
  defaultCancellationPolicyId: string | null;
  defaultNoShowPolicyId: string | null;
  bookingNotes: string;
  documents: TravelAgencyDraftDocument[];
};

export type GuestTravelAgentCreateHold = {
  step: GuestTravelAgentCreateStepId;
  draft: GuestTravelAgentCreateDraft;
};

export type GuestTravelAgentCreateCompletionItem = {
  id: string;
  label: string;
  complete: boolean;
  requiredRemaining: boolean;
  step: GuestTravelAgentCreateStepId;
};

export function isGuestTravelAgentCreateStepId(
  value: string | undefined,
): value is GuestTravelAgentCreateStepId {
  return Boolean(value && GUEST_TRAVEL_AGENT_CREATE_STEPS.some((step) => step.id === value));
}

export function guestTravelAgentCreateHoldKey(restaurantId: string): string {
  return `${GUEST_TRAVEL_AGENT_CREATE_HOLD_KEY_PREFIX}:${restaurantId}`;
}

function accountCreateStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isTravelAgentCreateDraftShape(value: unknown): value is GuestTravelAgentCreateDraft {
  return Boolean(value && typeof value === "object" && "name" in value && "contacts" in value);
}

export function inferGuestTravelAgentCreateStep(draft: GuestTravelAgentCreateDraft): GuestTravelAgentCreateStepId {
  if (
    filled(draft.defaultBillingRuleId) ||
    draft.allowCredit ||
    filled(draft.defaultDepositPolicyId) ||
    (draft.documents && draft.documents.length > 0)
  ) {
    return "payment_rules";
  }
  if (
    draft.commercialModel === "net_rate" ||
    draft.commissionEnabled ||
    (draft.commissionRules && draft.commissionRules.length > 1) ||
    (draft.agencyRateDefaults && draft.agencyRateDefaults.length > 0) ||
    filled(draft.commissionCurrency)
  ) {
    return "commission_rates";
  }
  if (draft.contacts && draft.contacts.some((c) => filled(c.name))) {
    return "contacts";
  }
  return "basic_info";
}

export function parseGuestTravelAgentCreateHold(payload: unknown): GuestTravelAgentCreateHold | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { step?: unknown; draft?: unknown };
  if (isTravelAgentCreateDraftShape(record.draft)) {
    const rawStep = String(record.step ?? "");
    const mappedStep: GuestTravelAgentCreateStepId =
      rawStep === "billing"
        ? "commission_rates"
        : rawStep === "booking_operations"
          ? "payment_rules"
          : rawStep === "details" || rawStep === "business"
            ? "basic_info"
            : isGuestTravelAgentCreateStepId(rawStep)
              ? (rawStep as GuestTravelAgentCreateStepId)
              : inferGuestTravelAgentCreateStep(record.draft);
    return {
      step: mappedStep,
      draft: normalizeTravelAgentCreateDraft(record.draft),
    };
  }
  if (isTravelAgentCreateDraftShape(record)) {
    return { step: inferGuestTravelAgentCreateStep(record), draft: normalizeTravelAgentCreateDraft(record) };
  }
  return null;
}

export function readGuestTravelAgentCreateHold(restaurantId: string): GuestTravelAgentCreateHold | null {
  const storage = accountCreateStorage();
  if (!storage) return null;
  try {
    return parseGuestTravelAgentCreateHold(
      JSON.parse(storage.getItem(guestTravelAgentCreateHoldKey(restaurantId)) ?? ""),
    );
  } catch {
    return null;
  }
}

export function writeGuestTravelAgentCreateHold(restaurantId: string, hold: GuestTravelAgentCreateHold): void {
  accountCreateStorage()?.setItem(guestTravelAgentCreateHoldKey(restaurantId), JSON.stringify(hold));
}

export function clearGuestTravelAgentCreateHold(restaurantId: string): void {
  accountCreateStorage()?.removeItem(guestTravelAgentCreateHoldKey(restaurantId));
}

export function emptyAccountCreateContact(primary = false): AccountCreateContactDraft {
  return {
    key: `contact-${Math.random().toString(36).slice(2, 10)}`,
    id: null,
    name: "",
    roleId: null,
    position: "",
    email: "",
    phone: "",
    whatsapp: "",
    isPrimary: primary,
    preferredMethod: "",
    notes: "",
  };
}

export function emptyGuestTravelAgentCreateDraft(): GuestTravelAgentCreateDraft {
  return {
    accountId: null,
    name: "",
    tradeName: "",
    code: generateAgencyCode("TA"),
    agencyType: "",
    agencyTypeOther: "",
    accountStatus: "active",
    iataLicenseNumber: "",
    licenseExpiryDate: "",
    website: "",
    notes: "",
    contacts: [emptyAccountCreateContact(true)],
    addressLine1: "",
    addressLine2: "",
    city: "Addis Ababa",
    region: "Addis Ababa",
    postalCode: "",
    country: "Ethiopia",
    taxId: "",
    registrationNumber: "",
    marketSegmentId: "",
    sourceCodeId: "",
    sourceOfBusiness: "",
    accountManagerId: "",
    ratePlanId: "",
    packageId: "",
    mealPlanId: "",
    contractReference: "",
    contractStartDate: "",
    contractEndDate: "",
    billingArrangement: "",
    billingContactName: "",
    billingEmail: "",
    paymentMethodId: "",
    currency: "",
    paymentTerms: "",
    billingInstruction: "",
    creditLimitAmount: "",
    creditLimitNote: "",

    // Step 3 defaults
    commercialModel: "commissionable",
    commissionEnabled: true,
    commissionType: "percent",
    commissionValue: "10",
    commissionCurrency: "",
    commissionEffectiveOn: "",
    commissionExpiresOn: "",
    commissionNotes: "",
    commissionApplicationMode: "all",
    allCommissionType: "percent",
    allCommissionValue: "10",
    commissionRules: [
      {
        scopeType: "all",
        roomTypeId: null,
        ratePlanId: null,
        commissionType: "percent",
        commissionValue: "10",
      },
    ],
    rateDefaultMode: "all",
    rateDefaultCategoryId: null,
    agencyRateDefaults: [],
    netPricingMethod: "rate_plan",
    netRoomTypeId: null,
    netRatePlanId: null,
    netDiscountType: "percent",
    netDiscountValue: "",
    netCurrencyCode: "",
    netValidFrom: "",
    netValidUntil: "",
    // Step 4: Payment, Credit & Reservation Rules
    billingCurrencyCode: "",
    defaultPaymentMethodId: null,
    paymentTiming: "due_on_departure",
    defaultBillingRuleId: null,
    allowCredit: false,
    creditDays: 30,
    creditDaysPreset: "30",
    creditStatus: "pending_approval",
    defaultDepositPolicyId: null,
    defaultCancellationPolicyId: null,
    defaultNoShowPolicyId: null,
    bookingNotes: "",
    documents: [],
  };
}

export function normalizeTravelAgentCreateDraft(draft: GuestTravelAgentCreateDraft): GuestTravelAgentCreateDraft {
  const contacts =
    Array.isArray(draft.contacts) && draft.contacts.length > 0
      ? draft.contacts
      : [emptyAccountCreateContact(true)];
  const status = GUEST_ACCOUNT_STATUSES.includes(draft.accountStatus) ? draft.accountStatus : "pending";
  return {
    ...emptyGuestTravelAgentCreateDraft(),
    ...draft,
    accountStatus: status,
    contacts,
    documents: Array.isArray(draft.documents) ? draft.documents : [],
    allowCredit: Boolean(draft.allowCredit),
    paymentTiming: draft.paymentTiming || "due_on_departure",
    creditStatus: draft.creditStatus || "pending_approval",
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

export type TravelAgentCreateFieldIssue = CreateFieldIssue<GuestTravelAgentCreateStepId>;

export function travelAgentCreateFieldIssues(
  draft: GuestTravelAgentCreateDraft,
  options?: {
    paymentMethodIds?: string[];
    currencyCodes?: string[];
  },
): TravelAgentCreateFieldIssue[] {
  const issues: TravelAgentCreateFieldIssue[] = [];
  if (!filled(draft.name)) issues.push({ key: "name", message: "Agency name is required.", step: "basic_info" });
  if (!filled(draft.agencyType) || !isAgencyType(draft.agencyType)) {
    issues.push({ key: "agencyType", message: "Agency type is required.", step: "basic_info" });
  }
  if (
    (draft.agencyType.toLowerCase() === "other" || draft.agencyType.toUpperCase() === "OTHR") &&
    !filled(draft.agencyTypeOther)
  ) {
    issues.push({ key: "agencyTypeOther", message: "Describe the agency type when Other is selected.", step: "basic_info" });
  }
  const named = draft.contacts.filter((row) => filled(row.name));
  const primaries = named.filter((row) => row.isPrimary);
  if (named.length > 0 && primaries.length !== 1) {
    issues.push({
      key: "contacts",
      message: "Exactly one primary contact is required when contacts are entered.",
      step: "basic_info",
    });
  }
  for (const contact of named) {
    if (!validEmail(contact.email)) {
      issues.push({ key: "contacts", message: "Enter a valid contact email.", step: "basic_info" });
    }
  }
  const dateError = contractDateError(draft.contractStartDate, draft.contractEndDate);
  if (dateError) {
    issues.push({ key: "contractStartDate", message: dateError, step: "booking_operations" });
    issues.push({ key: "contractEndDate", message: dateError, step: "booking_operations" });
  }
  if (
    filled(draft.billingArrangement) &&
    !ACCOUNT_BILLING_ARRANGEMENTS.some((row) => row.id === draft.billingArrangement)
  ) {
    issues.push({ key: "billingArrangement", message: "Select a configured billing arrangement.", step: "review" });
  }
  if (filled(draft.paymentMethodId) && options?.paymentMethodIds && !options.paymentMethodIds.includes(draft.paymentMethodId)) {
    issues.push({ key: "paymentMethodId", message: "Select a configured payment method.", step: "review" });
  }
  if (filled(draft.currency) && options?.currencyCodes?.length && !options.currencyCodes.includes(draft.currency)) {
    issues.push({ key: "currency", message: "Select a configured currency.", step: "review" });
  }
  if (filled(draft.billingEmail) && !validEmail(draft.billingEmail)) {
    issues.push({ key: "billingEmail", message: "Enter a valid billing email.", step: "review" });
  }
  if (filled(draft.creditLimitAmount)) {
    const amount = Number(draft.creditLimitAmount);
    if (Number.isNaN(amount) || amount < 0) {
      issues.push({ key: "creditLimitAmount", message: "Credit limit amount cannot be negative.", step: "review" });
    }
  }

  // Step 3 Issues: Commission & Rates
  if (draft.commercialModel === "commissionable") {
    if (!filled(draft.commissionCurrency)) {
      issues.push({ key: "commissionCurrency", message: "Select a commission currency.", step: "commission_rates" });
    }
    if (!filled(draft.commissionEffectiveOn)) {
      issues.push({ key: "commissionEffectiveOn", message: "Effective from date is required.", step: "commission_rates" });
    }
    if (filled(draft.commissionExpiresOn) && filled(draft.commissionEffectiveOn) && draft.commissionExpiresOn < draft.commissionEffectiveOn) {
      issues.push({ key: "commissionExpiresOn", message: "Expires on cannot be earlier than effective date.", step: "commission_rates" });
    }
    if (draft.commissionApplicationMode === "all") {
      const val = Number(draft.allCommissionValue || draft.commissionValue);
      if (!filled(draft.allCommissionValue) && !filled(draft.commissionValue)) {
        issues.push({ key: "commissionValue", message: "Enter a commission value.", step: "commission_rates" });
      } else if (Number.isNaN(val) || val < 0) {
        issues.push({ key: "commissionValue", message: "Commission value cannot be negative.", step: "commission_rates" });
      } else if (draft.allCommissionType === "percent" && val > 100) {
        issues.push({ key: "commissionValue", message: "Commission percentage cannot exceed 100%.", step: "commission_rates" });
      }
    } else {
      if (!draft.commissionRules || draft.commissionRules.length === 0) {
        issues.push({ key: "commissionRules", message: "At least one commission rule is required.", step: "commission_rates" });
      }
    }
  } else if (draft.commercialModel === "net_rate") {
    if (!draft.netPricingMethod) {
      issues.push({ key: "netPricingMethod", message: "Select a net pricing method.", step: "commission_rates" });
    }
    if (!filled(draft.netValidFrom)) {
      issues.push({ key: "netValidFrom", message: "Valid from date is required.", step: "commission_rates" });
    }
    if (!filled(draft.netValidUntil)) {
      issues.push({ key: "netValidUntil", message: "Valid until date is required.", step: "commission_rates" });
    }
    if (filled(draft.netValidUntil) && filled(draft.netValidFrom) && draft.netValidUntil < draft.netValidFrom) {
      issues.push({ key: "netValidUntil", message: "Valid until date cannot be earlier than valid from.", step: "commission_rates" });
    }
    if (!filled(draft.netCurrencyCode)) {
      issues.push({ key: "netCurrencyCode", message: "Select a settlement currency.", step: "commission_rates" });
    }
    if (draft.netPricingMethod === "contracted_rates" && (!draft.contractedRates || draft.contractedRates.length === 0)) {
      issues.push({ key: "contractedRates", message: "At least one contracted room rate is required.", step: "commission_rates" });
    }
  }

  // Step 4 Issues: Payment, Credit & Reservation Rules
  if (!filled(draft.billingCurrencyCode) && !filled(draft.currency)) {
    issues.push({ key: "billingCurrencyCode", message: "Billing currency is required.", step: "payment_rules" });
  }

  const validTimings = ["due_on_arrival", "due_on_departure", "prepaid", "credit_terms"];
  if (!draft.paymentTiming || !validTimings.includes(draft.paymentTiming)) {
    issues.push({ key: "paymentTiming", message: "A valid payment timing is required.", step: "payment_rules" });
  }

  if (!filled(draft.defaultBillingRuleId)) {
    issues.push({ key: "defaultBillingRuleId", message: "Default billing rule is required.", step: "payment_rules" });
  }

  if (draft.paymentTiming === "credit_terms") {
    if (!draft.allowCredit) {
      issues.push({ key: "allowCredit", message: "Enable Credit Arrangement to use Credit Terms.", step: "payment_rules" });
    }
    if (draft.creditDays == null || Number.isNaN(Number(draft.creditDays)) || Number(draft.creditDays) <= 0) {
      issues.push({ key: "creditDays", message: "Credit days is required when payment timing is credit terms.", step: "payment_rules" });
    }
  }

  if (draft.allowCredit) {
    if (!draft.creditStatus) {
      issues.push({ key: "creditStatus", message: "Credit status is required when credit is enabled.", step: "payment_rules" });
    }
    if (filled(draft.creditLimitAmount)) {
      const limit = Number(draft.creditLimitAmount);
      if (Number.isNaN(limit) || limit < 0) {
        issues.push({ key: "creditLimitAmount", message: "Credit limit cannot be negative.", step: "payment_rules" });
      }
    }
    if (draft.creditDays != null) {
      const days = Number(draft.creditDays);
      if (Number.isNaN(days) || days < 0 || days > 365) {
        issues.push({ key: "creditDays", message: "Credit days must be between 0 and 365.", step: "payment_rules" });
      }
    }
  }

  if (draft.bookingNotes && draft.bookingNotes.length > 500) {
    issues.push({ key: "bookingNotes", message: "Booking notes cannot exceed 500 characters.", step: "payment_rules" });
  }

  return issues;
}

export function travelAgentCreateStepErrors(
  step: GuestTravelAgentCreateStepId,
  draft: GuestTravelAgentCreateDraft,
  options?: Parameters<typeof travelAgentCreateFieldIssues>[1],
): string[] {
  return uniqueIssueMessages(travelAgentCreateFieldIssues(draft, options), step);
}

export function travelAgentCreateDraftErrors(
  draft: GuestTravelAgentCreateDraft,
  options?: Parameters<typeof travelAgentCreateStepErrors>[2],
): string[] {
  return travelAgentCreateStepErrors("review", draft, options);
}

export function travelAgentCreateDraftErrorsForSave(draft: GuestTravelAgentCreateDraft): string[] {
  return filled(draft.name) ? [] : ["Agency name is required to save a draft."];
}

export function guestTravelAgentCreateHasChanges(draft: GuestTravelAgentCreateDraft): boolean {
  const empty = emptyGuestTravelAgentCreateDraft();
  const current = { ...draft, accountId: null };
  const baseline = { ...empty, accountId: null };
  return JSON.stringify(current) !== JSON.stringify(baseline);
}

export function travelAgentCommissionReady(draft: GuestTravelAgentCreateDraft): boolean {
  if (draft.commercialModel === "net_rate") return false;
  if (!draft.commissionEnabled) return false;
  if (draft.commissionApplicationMode === "all") {
    return filled(draft.commissionValue || draft.allCommissionValue) && Number(draft.commissionValue || draft.allCommissionValue) >= 0;
  }
  return Boolean(draft.commissionRules && draft.commissionRules.length > 0);
}

export function guestTravelAgentCreateCompletion(draft: GuestTravelAgentCreateDraft): {
  percent: number;
  items: GuestTravelAgentCreateCompletionItem[];
} {
  const items: GuestTravelAgentCreateCompletionItem[] = [
    {
      id: "identity",
      label: "Agency identity",
      complete: filled(draft.name) && isAgencyType(draft.agencyType),
      requiredRemaining: !filled(draft.name) || !isAgencyType(draft.agencyType),
      step: "basic_info",
    },
    {
      id: "contacts",
      label: "Contacts & Role",
      complete: true,
      requiredRemaining: false,
      step: "contacts",
    },
    {
      id: "commercial",
      label: "Commission & Rates",
      complete:
        draft.commercialModel === "net_rate"
          ? Boolean(draft.netPricingMethod && filled(draft.netValidFrom) && filled(draft.netValidUntil))
          : Boolean(filled(draft.commissionCurrency) && filled(draft.commissionEffectiveOn)),
      requiredRemaining: false,
      step: "commission_rates",
    },
    {
      id: "operations",
      label: "Payment, Credit & Rules",
      complete: Boolean(
        filled(draft.billingCurrencyCode || draft.currency) &&
          draft.paymentTiming &&
          filled(draft.defaultBillingRuleId),
      ),
      requiredRemaining: false,
      step: "payment_rules",
    },
    {
      id: "billing",
      label: "Final Review & Create",
      complete: true,
      requiredRemaining: false,
      step: "review",
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

export function agencyTypeLabel(id: string): string {
  return isAgencyType(id) ? AGENCY_TYPE_LABELS[id] : id;
}

export function primaryTravelAgentContact(
  draft: GuestTravelAgentCreateDraft,
): AccountCreateContactDraft | undefined {
  return draft.contacts.find((row) => row.isPrimary && filled(row.name)) ?? draft.contacts.find((row) => filled(row.name));
}

export function draftToTravelAgentAccountInput(draft: GuestTravelAgentCreateDraft) {
  const primary = primaryTravelAgentContact(draft);
  return {
    name: draft.name,
    code: blank(draft.code),
    tradeName: blank(draft.tradeName),
    agencyType: blank(draft.agencyType) as AgencyType | null,
    agencyTypeOther: draft.agencyType === "other" ? blank(draft.agencyTypeOther) : null,
    accountStatus: (draft.accountStatus === "inactive" ? "inactive" : "active") as GuestAccountStatus,
    website: blank(draft.website),
    notes: blank(draft.notes),
    email: primary?.email ? primary.email.trim() : null,
    phone: primary?.phone ? primary.phone.trim() : null,
    primaryContactName: primary?.name ? primary.name.trim() : null,
    addressLine1: blank(draft.addressLine1),
    addressLine2: blank(draft.addressLine2),
    city: blank(draft.city),
    region: blank(draft.region),
    postalCode: blank(draft.postalCode),
    country: blank(draft.country),
    taxId: blank(draft.taxId),
    businessRegistrationNumber: blank(draft.registrationNumber),
    iataLicenseNumber: blank(draft.iataLicenseNumber),
    licenseExpiryDate: blank(draft.licenseExpiryDate),
    billingContactName: blank(draft.billingContactName),
    contractReference: blank(draft.contractReference),
    contractStartDate: blank(draft.contractStartDate),
    contractEndDate: blank(draft.contractEndDate),
    paymentTerms:
      draft.paymentTiming === "credit_terms" && draft.creditDays
        ? `Net ${draft.creditDays} Days`
        : draft.paymentTiming === "due_on_arrival"
          ? "Due on Arrival"
          : draft.paymentTiming === "prepaid"
            ? "Prepaid"
            : draft.paymentTiming === "due_on_departure"
              ? "Due on Departure"
              : blank(draft.paymentTerms),
    creditLimitNote: blank(draft.creditLimitNote),
    billingInstruction: blank(draft.billingInstruction),
    commissionType: draft.commissionEnabled ? blank(draft.commissionType) : null,
    commissionLabel: draft.commissionEnabled ? blank(draft.commissionValue) : null,
    commissionCurrencyNote: draft.commissionEnabled ? blank(draft.commissionCurrency) : null,
  };
}

export function draftToTravelAgentAccountOperations(draft: GuestTravelAgentCreateDraft): Record<string, unknown> {
  return {
    sourceCodeId: blank(draft.sourceCodeId),
    sourceOfBusiness: blank(draft.sourceOfBusiness),
    accountManagerMembershipId: blank(draft.accountManagerId),
    contract: {
      reference: blank(draft.contractReference),
      startDate: blank(draft.contractStartDate),
      endDate: blank(draft.contractEndDate),
      copy: TRAVEL_AGENT_CREATE_CONTRACT_COPY,
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
    contactPreferredMethods: draft.contacts
      .filter((row) => filled(row.name))
      .map((row) => ({ key: row.key, id: row.id, method: blank(row.preferredMethod) })),
  };
}

export { AGENCY_TYPES, TA_COMMISSION_REFERENCE_COPY, TA_COMMISSION_PLAN_TYPES };
