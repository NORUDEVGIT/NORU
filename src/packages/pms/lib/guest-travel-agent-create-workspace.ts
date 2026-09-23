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

export const GUEST_TRAVEL_AGENT_CREATE_MIGRATION_FILE = "0099_pms_account_create_drafts.sql";

export const GUEST_TRAVEL_AGENT_CREATE_STEPS = [
  { id: "details", number: 1, title: "Agency Details" },
  { id: "contacts", number: 2, title: "Contacts" },
  { id: "business", number: 3, title: "Business & Registration" },
  { id: "billing", number: 4, title: "Commercial & Billing" },
  { id: "review", number: 5, title: "Review & Confirm" },
] as const;

export type GuestTravelAgentCreateStepId = (typeof GUEST_TRAVEL_AGENT_CREATE_STEPS)[number]["id"];

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
  position: string;
  email: string;
  phone: string;
  whatsapp: string;
  isPrimary: boolean;
  preferredMethod: string;
  notes: string;
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
  commissionEnabled: boolean;
  commissionType: string;
  commissionValue: string;
  commissionCurrency: string;
  commissionEffectiveOn: string;
  commissionExpiresOn: string;
  commissionNotes: string;
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
  if (draft.commissionEnabled || filled(draft.creditLimitAmount) || filled(draft.billingArrangement)) {
    return "billing";
  }
  if (filled(draft.addressLine1) || filled(draft.marketSegmentId) || filled(draft.taxId)) {
    return "business";
  }
  if (draft.contacts.some((row) => filled(row.name))) return "contacts";
  return "details";
}

export function parseGuestTravelAgentCreateHold(payload: unknown): GuestTravelAgentCreateHold | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { step?: unknown; draft?: unknown };
  if (isTravelAgentCreateDraftShape(record.draft)) {
    return {
      step: isGuestTravelAgentCreateStepId(String(record.step ?? ""))
        ? (record.step as GuestTravelAgentCreateStepId)
        : inferGuestTravelAgentCreateStep(record.draft),
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
    code: "",
    agencyType: "",
    agencyTypeOther: "",
    accountStatus: "pending",
    iataLicenseNumber: "",
    licenseExpiryDate: "",
    website: "",
    notes: "",
    contacts: [emptyAccountCreateContact(true)],
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
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
    commissionEnabled: false,
    commissionType: "",
    commissionValue: "",
    commissionCurrency: "",
    commissionEffectiveOn: "",
    commissionExpiresOn: "",
    commissionNotes: "",
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

export function travelAgentCreateStepErrors(
  step: GuestTravelAgentCreateStepId,
  draft: GuestTravelAgentCreateDraft,
  options?: {
    paymentMethodIds?: string[];
    currencyCodes?: string[];
  },
): string[] {
  const errors: string[] = [];

  if (step === "details" || step === "review") {
    if (!filled(draft.name)) errors.push("Agency name is required.");
    if (!filled(draft.agencyType) || !isAgencyType(draft.agencyType)) {
      errors.push("Agency type is required.");
    }
    if (draft.agencyType === "other" && !filled(draft.agencyTypeOther)) {
      errors.push("Describe the agency type when Other is selected.");
    }
  }

  if (step === "contacts" || step === "review") {
    const named = draft.contacts.filter((row) => filled(row.name));
    const primaries = named.filter((row) => row.isPrimary);
    if (named.length > 0 && primaries.length !== 1) {
      errors.push("Exactly one primary contact is required when contacts are entered.");
    }
    for (const contact of named) {
      if (!validEmail(contact.email)) errors.push("Enter a valid contact email.");
    }
  }

  if (step === "business" || step === "review") {
    const dateError = contractDateError(draft.contractStartDate, draft.contractEndDate);
    if (dateError) errors.push(dateError);
  }

  if (step === "billing" || step === "review") {
    if (
      filled(draft.billingArrangement) &&
      !ACCOUNT_BILLING_ARRANGEMENTS.some((row) => row.id === draft.billingArrangement)
    ) {
      errors.push("Select a configured billing arrangement.");
    }
    if (filled(draft.paymentMethodId) && options?.paymentMethodIds && !options.paymentMethodIds.includes(draft.paymentMethodId)) {
      errors.push("Select a configured payment method.");
    }
    if (filled(draft.currency) && options?.currencyCodes?.length && !options.currencyCodes.includes(draft.currency)) {
      errors.push("Select a configured currency.");
    }
    if (filled(draft.billingEmail) && !validEmail(draft.billingEmail)) {
      errors.push("Enter a valid billing email.");
    }
    if (filled(draft.creditLimitAmount)) {
      const amount = Number(draft.creditLimitAmount);
      if (Number.isNaN(amount) || amount < 0) errors.push("Credit limit amount cannot be negative.");
    }
    if (draft.commissionEnabled) {
      if (!TA_COMMISSION_PLAN_TYPES.includes(draft.commissionType as (typeof TA_COMMISSION_PLAN_TYPES)[number])) {
        errors.push("Select a commission type.");
      }
      const value = Number(draft.commissionValue);
      if (!filled(draft.commissionValue) || Number.isNaN(value) || value < 0) {
        errors.push("Enter a commission value.");
      }
    }
  }

  return [...new Set(errors)];
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
      step: "details",
    },
    {
      id: "contacts",
      label: "Contacts",
      complete: true,
      requiredRemaining: false,
      step: "contacts",
    },
    {
      id: "business",
      label: "Registration",
      complete: !contractDateError(draft.contractStartDate, draft.contractEndDate),
      requiredRemaining: Boolean(contractDateError(draft.contractStartDate, draft.contractEndDate)),
      step: "business",
    },
    {
      id: "billing",
      label: "Commercial & billing",
      complete: !draft.commissionEnabled || filled(draft.commissionValue),
      requiredRemaining: draft.commissionEnabled && !filled(draft.commissionValue),
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
    accountStatus: "pending" as const,
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
    paymentTerms: blank(draft.paymentTerms),
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

export function travelAgentCommissionReady(draft: GuestTravelAgentCreateDraft): boolean {
  if (!draft.commissionEnabled) return false;
  const value = Number(draft.commissionValue);
  return (
    TA_COMMISSION_PLAN_TYPES.includes(draft.commissionType as (typeof TA_COMMISSION_PLAN_TYPES)[number]) &&
    filled(draft.commissionValue) &&
    !Number.isNaN(value) &&
    value >= 0
  );
}

export { AGENCY_TYPES, TA_COMMISSION_REFERENCE_COPY, TA_COMMISSION_PLAN_TYPES };
