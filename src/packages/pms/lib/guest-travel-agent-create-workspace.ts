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
import { ALL_TRAVEL_AGENCY_CREATION_FIELDS } from "./guest-creation-field-definitions.ts";

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

export const TRAVEL_AGENCY_FIELD_ALIASES_MAP: Record<string, string[]> = {
  TA_NAME: ["TA_NAME", "AGENCY_NAME", "TRAVEL_AGENCY_NAME", "NAME"],
  TA_AGENCY_TYPE: ["TA_AGENCY_TYPE", "AGENCY_TYPE", "TRAVEL_AGENCY_TYPE"],
  TA_TRADE_NAME: ["TA_TRADE_NAME", "AGENCY_TRADE_NAME", "TRAVEL_AGENCY_TRADE_NAME", "TRADE_NAME"],
  TA_CODE: ["TA_CODE", "AGENCY_CODE", "TRAVEL_AGENCY_CODE", "CODE"],
  TA_ACCOUNT_STATUS: ["TA_ACCOUNT_STATUS", "AGENCY_ACCOUNT_STATUS", "TRAVEL_AGENCY_ACCOUNT_STATUS", "ACCOUNT_STATUS"],
  TA_IATA_NUMBER: ["TA_IATA_NUMBER", "TA_IATA_LICENSE_NUMBER", "AGENCY_IATA_NUMBER", "IATA_LICENSE_NUMBER", "IATA_NUMBER"],
  TA_LICENSE_EXPIRY: ["TA_LICENSE_EXPIRY", "TA_LICENSE_EXPIRY_DATE", "AGENCY_LICENSE_EXPIRY", "LICENSE_EXPIRY_DATE", "LICENSE_EXPIRY"],
  TA_WEBSITE: ["TA_WEBSITE", "AGENCY_WEBSITE", "TRAVEL_AGENCY_WEBSITE", "WEBSITE"],
  TA_NOTES: ["TA_NOTES", "AGENCY_NOTES", "TRAVEL_AGENCY_NOTES", "NOTES"],
  TA_COUNTRY: ["TA_COUNTRY", "AGENCY_COUNTRY", "TRAVEL_AGENCY_COUNTRY", "COUNTRY"],
  TA_REGION: ["TA_REGION", "AGENCY_REGION", "TRAVEL_AGENCY_REGION", "REGION", "STATE"],
  TA_CITY: ["TA_CITY", "AGENCY_CITY", "TRAVEL_AGENCY_CITY", "CITY"],
  TA_POSTAL_CODE: ["TA_POSTAL_CODE", "AGENCY_POSTAL_CODE", "TRAVEL_AGENCY_POSTAL_CODE", "POSTAL_CODE", "ZIP"],
  TA_ADDRESS_LINE1: ["TA_ADDRESS_LINE1", "AGENCY_ADDRESS_LINE1", "TRAVEL_AGENCY_ADDRESS_LINE1", "ADDRESS_LINE1", "STREET_ADDRESS"],
  TA_ADDRESS_LINE2: ["TA_ADDRESS_LINE2", "AGENCY_ADDRESS_LINE2", "TRAVEL_AGENCY_ADDRESS_LINE2", "ADDRESS_LINE2"],
  TA_TAX_ID: ["TA_TAX_ID", "AGENCY_TAX_ID", "TRAVEL_AGENCY_TAX_ID", "TAX_ID", "TIN"],
  TA_REGISTRATION_NUMBER: ["TA_REGISTRATION_NUMBER", "AGENCY_REGISTRATION_NUMBER", "TRAVEL_AGENCY_REGISTRATION_NUMBER", "REGISTRATION_NUMBER"],
  TA_MARKET_SEGMENT: ["TA_MARKET_SEGMENT", "AGENCY_MARKET_SEGMENT", "TRAVEL_AGENCY_MARKET_SEGMENT", "MARKET_SEGMENT", "MARKET_SEGMENT_ID"],
  TA_SOURCE: ["TA_SOURCE", "AGENCY_SOURCE", "TRAVEL_AGENCY_SOURCE", "SOURCE", "SOURCE_CODE", "SOURCE_CODE_ID"],
  TA_ACCOUNT_MANAGER: ["TA_ACCOUNT_MANAGER", "AGENCY_ACCOUNT_MANAGER", "TRAVEL_AGENCY_ACCOUNT_MANAGER", "ACCOUNT_MANAGER", "ACCOUNT_MANAGER_ID"],
  TA_CONTACT_NAME: ["TA_CONTACT_NAME", "AGENCY_CONTACT_NAME", "TRAVEL_AGENCY_CONTACT_NAME", "CONTACT_NAME"],
  TA_CONTACT_ROLE: ["TA_CONTACT_ROLE", "AGENCY_CONTACT_ROLE", "TRAVEL_AGENCY_CONTACT_ROLE", "CONTACT_ROLE", "CONTACT_ROLE_ID"],
  TA_CONTACT_POSITION: ["TA_CONTACT_POSITION", "AGENCY_CONTACT_POSITION", "TRAVEL_AGENCY_CONTACT_POSITION", "CONTACT_POSITION", "POSITION"],
  TA_CONTACT_EMAIL: ["TA_CONTACT_EMAIL", "AGENCY_CONTACT_EMAIL", "TRAVEL_AGENCY_CONTACT_EMAIL", "CONTACT_EMAIL", "EMAIL"],
  TA_CONTACT_PHONE: ["TA_CONTACT_PHONE", "AGENCY_CONTACT_PHONE", "TRAVEL_AGENCY_CONTACT_PHONE", "CONTACT_PHONE", "PHONE"],
  TA_CONTACT_WHATSAPP: ["TA_CONTACT_WHATSAPP", "AGENCY_CONTACT_WHATSAPP", "TRAVEL_AGENCY_CONTACT_WHATSAPP", "CONTACT_WHATSAPP", "WHATSAPP"],
  TA_CONTACT_PREFERRED_METHOD: ["TA_CONTACT_PREFERRED_METHOD", "AGENCY_CONTACT_PREFERRED_METHOD", "TRAVEL_AGENCY_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD", "PREFERRED_METHOD"],
  TA_CONTACT_NOTES: ["TA_CONTACT_NOTES", "AGENCY_CONTACT_NOTES", "TRAVEL_AGENCY_CONTACT_NOTES", "CONTACT_NOTES"],

  // Step 3: Commission & Rates Aliases
  TA_COMMERCIAL_MODEL: ["TA_COMMERCIAL_MODEL", "COMMERCIAL_MODEL"],
  TA_COMMISSION_CURRENCY: ["TA_COMMISSION_CURRENCY", "COMMISSION_CURRENCY"],
  TA_COMMISSION_EFFECTIVE_ON: ["TA_COMMISSION_EFFECTIVE_ON", "COMMISSION_EFFECTIVE_ON", "COMMISSION_EFFECTIVE_DATE"],
  TA_COMMISSION_EXPIRES_ON: ["TA_COMMISSION_EXPIRES_ON", "COMMISSION_EXPIRES_ON", "COMMISSION_EXPIRY_DATE"],
  TA_COMMISSION_NOTES: ["TA_COMMISSION_NOTES", "COMMISSION_NOTES"],
  TA_COMMISSION_APPLICATION_MODE: ["TA_COMMISSION_APPLICATION_MODE", "COMMISSION_APPLICATION_MODE"],
  TA_COMMISSION_TYPE: ["TA_COMMISSION_TYPE", "COMMISSION_TYPE", "ALL_COMMISSION_TYPE"],
  TA_COMMISSION_VALUE: ["TA_COMMISSION_VALUE", "COMMISSION_VALUE", "ALL_COMMISSION_VALUE"],
  TA_NET_PRICING_METHOD: ["TA_NET_PRICING_METHOD", "NET_PRICING_METHOD"],
  TA_NET_ROOM_TYPE: ["TA_NET_ROOM_TYPE", "NET_ROOM_TYPE", "NET_ROOM_TYPE_ID"],
  TA_NET_RATE_PLAN: ["TA_NET_RATE_PLAN", "NET_RATE_PLAN", "NET_RATE_PLAN_ID"],
  TA_NET_DISCOUNT_TYPE: ["TA_NET_DISCOUNT_TYPE", "NET_DISCOUNT_TYPE"],
  TA_NET_DISCOUNT_VALUE: ["TA_NET_DISCOUNT_VALUE", "NET_DISCOUNT_VALUE"],
  TA_NET_VALID_FROM: ["TA_NET_VALID_FROM", "NET_VALID_FROM", "NET_RATE_VALID_FROM"],
  TA_NET_VALID_UNTIL: ["TA_NET_VALID_UNTIL", "NET_VALID_UNTIL", "NET_RATE_VALID_UNTIL"],
  TA_NET_CURRENCY: ["TA_NET_CURRENCY", "NET_CURRENCY", "NET_SETTLEMENT_CURRENCY"],
  TA_COMMERCIAL_NOTES: ["TA_COMMERCIAL_NOTES", "COMMERCIAL_NOTES"],

  // Step 4: Payment, Credit & Reservation Rules Aliases
  TA_BILLING_CURRENCY: ["TA_BILLING_CURRENCY", "BILLING_CURRENCY"],
  TA_PAYMENT_METHOD: ["TA_PAYMENT_METHOD", "PAYMENT_METHOD", "SETTLEMENT_METHOD"],
  TA_PAYMENT_TIMING: ["TA_PAYMENT_TIMING", "PAYMENT_TIMING"],
  TA_BILLING_RULE: ["TA_BILLING_RULE", "BILLING_RULE", "DEFAULT_BILLING_RULE"],
  TA_BILLING_INSTRUCTION: ["TA_BILLING_INSTRUCTION", "BILLING_INSTRUCTION", "BILLING_INSTRUCTIONS"],
  TA_ALLOW_CREDIT: ["TA_ALLOW_CREDIT", "ALLOW_CREDIT", "CREDIT_FACILITY"],
  TA_CREDIT_LIMIT: ["TA_CREDIT_LIMIT", "CREDIT_LIMIT", "CREDIT_LIMIT_AMOUNT"],
  TA_CREDIT_DAYS: ["TA_CREDIT_DAYS", "CREDIT_DAYS", "CREDIT_TERMS"],
  TA_CREDIT_STATUS: ["TA_CREDIT_STATUS", "CREDIT_STATUS"],
  TA_DEPOSIT_POLICY: ["TA_DEPOSIT_POLICY", "DEPOSIT_POLICY", "GUARANTEE_POLICY"],
  TA_CANCELLATION_POLICY: ["TA_CANCELLATION_POLICY", "CANCELLATION_POLICY"],
  TA_NOSHOW_POLICY: ["TA_NOSHOW_POLICY", "NOSHOW_POLICY", "NO_SHOW_POLICY"],
  TA_BOOKING_NOTES: ["TA_BOOKING_NOTES", "BOOKING_NOTES"],
};

export type TravelAgencyCreateFieldRule = {
  code: string;
  label: string;
  required: boolean;
  visible?: boolean;
};

export function createTravelAgencyFieldRules(
  fields: Array<{ id: string; code: string; name?: string; required?: boolean; active?: boolean }>,
  profileType: { id?: string; requiredFieldIds?: string[] } | null,
): TravelAgencyCreateFieldRule[] {
  const byCode = new Map<string, { id: string; code: string; name?: string; required?: boolean; active?: boolean }>();
  for (const f of fields) {
    byCode.set(f.code.trim().toUpperCase(), f);
  }

  const rules: TravelAgencyCreateFieldRule[] = [];

  for (const def of ALL_TRAVEL_AGENCY_CREATION_FIELDS) {
    const code = def.code.toUpperCase();
    const strippedCode = code.startsWith("TA_")
      ? code.replace(/^TA_/, "")
      : code.startsWith("TRAVEL_AGENCY_")
        ? code.replace(/^TRAVEL_AGENCY_/, "")
        : code;
    const aliases = TRAVEL_AGENCY_FIELD_ALIASES_MAP[code] ?? [code, strippedCode];

    let matched: { id: string; code: string; name?: string; required?: boolean; active?: boolean } | undefined;
    for (const alias of aliases) {
      const found = byCode.get(alias.toUpperCase());
      if (found) {
        matched = found;
        break;
      }
    }
    if (!matched) {
      matched = byCode.get(code) || byCode.get(strippedCode);
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
      const fieldRequired = Boolean(matched?.required);
      required = inProfileType || fieldRequired;
    }

    const rule: TravelAgencyCreateFieldRule = {
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
    if (def.code.startsWith("TA_")) {
      rules.push({
        ...rule,
        code: def.code.replace(/^TA_/, ""),
      });
    }
  }

  return rules;
}

export function isTravelAgencyRuleRequired(
  rules: TravelAgencyCreateFieldRule[] | undefined,
  code: string,
): boolean {
  if (!rules || rules.length === 0) {
    const upper = code.toUpperCase();
    return upper === "TA_NAME" || upper === "NAME" || upper === "TA_AGENCY_TYPE" || upper === "AGENCY_TYPE";
  }
  const upper = code.toUpperCase();
  const canonical = upper.startsWith("TA_") ? upper : `TA_${upper}`;
  const stripped = upper.startsWith("TA_") ? upper.replace(/^TA_/, "") : upper;
  const aliases = TRAVEL_AGENCY_FIELD_ALIASES_MAP[canonical] ?? [canonical, stripped];
  for (const c of [canonical, stripped, upper, ...aliases]) {
    const found = rules.find((r) => r.code.toUpperCase() === c.toUpperCase());
    if (found) return Boolean(found.required);
  }
  return false;
}

export function card4TravelAgencyCreateGaps(
  draft: GuestTravelAgentCreateDraft,
  rules: TravelAgencyCreateFieldRule[],
): Array<{ code: string; label: string; step: GuestTravelAgentCreateStepId }> {
  const gaps: Array<{ code: string; label: string; step: GuestTravelAgentCreateStepId }> = [];
  const byCode = new Map(rules.map((rule) => [rule.code.toUpperCase(), rule]));

  const need = (codes: string[], ok: boolean, step: GuestTravelAgentCreateStepId, customKey?: string) => {
    for (const code of codes) {
      const rule = byCode.get(code.toUpperCase());
      if (rule?.required && !ok) {
        gaps.push({ code: customKey || codes[0], label: rule.label, step });
        break;
      }
    }
  };

  // Step 1: Basic Information - Agency Details
  need(["TA_NAME", "AGENCY_NAME", "NAME"], filled(draft.name), "basic_info", "name");
  need(["TA_AGENCY_TYPE", "AGENCY_TYPE", "TYPE"], filled(draft.agencyType) && isAgencyType(draft.agencyType), "basic_info", "agencyType");
  need(["TA_TRADE_NAME", "TRADE_NAME"], filled(draft.tradeName), "basic_info", "tradeName");
  need(["TA_CODE", "CODE"], filled(draft.code), "basic_info", "code");
  need(["TA_ACCOUNT_STATUS", "ACCOUNT_STATUS"], filled(draft.accountStatus), "basic_info", "accountStatus");
  need(["TA_IATA_NUMBER", "IATA_NUMBER", "TA_IATA_LICENSE_NUMBER", "IATA_LICENSE_NUMBER"], filled(draft.iataLicenseNumber), "basic_info", "iataLicenseNumber");
  need(["TA_LICENSE_EXPIRY", "LICENSE_EXPIRY", "TA_LICENSE_EXPIRY_DATE", "LICENSE_EXPIRY_DATE"], filled(draft.licenseExpiryDate), "basic_info", "licenseExpiryDate");
  need(["TA_WEBSITE", "WEBSITE"], filled(draft.website), "basic_info", "website");
  need(["TA_NOTES", "NOTES"], filled(draft.notes), "basic_info", "notes");

  // Step 1: Basic Information - Address & Business
  need(["TA_COUNTRY", "COUNTRY"], filled(draft.country), "basic_info", "country");
  need(["TA_REGION", "REGION", "STATE"], filled(draft.region), "basic_info", "region");
  need(["TA_CITY", "CITY"], filled(draft.city), "basic_info", "city");
  need(["TA_POSTAL_CODE", "POSTAL_CODE", "ZIP"], filled(draft.postalCode), "basic_info", "postalCode");
  need(["TA_ADDRESS_LINE1", "ADDRESS_LINE1", "STREET_ADDRESS"], filled(draft.addressLine1), "basic_info", "addressLine1");
  need(["TA_ADDRESS_LINE2", "ADDRESS_LINE2"], filled(draft.addressLine2), "basic_info", "addressLine2");
  need(["TA_TAX_ID", "TAX_ID", "TIN"], filled(draft.taxId), "basic_info", "taxId");
  need(["TA_REGISTRATION_NUMBER", "REGISTRATION_NUMBER"], filled(draft.registrationNumber), "basic_info", "registrationNumber");
  need(["TA_MARKET_SEGMENT", "MARKET_SEGMENT"], filled(draft.marketSegmentId), "basic_info", "marketSegmentId");
  need(["TA_SOURCE", "SOURCE", "SOURCE_CODE"], filled(draft.sourceCodeId), "basic_info", "sourceCodeId");
  need(["TA_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"], filled(draft.accountManagerId), "basic_info", "accountManagerId");

  // Step 2: Contacts
  const hasContacts = draft.contacts.length > 0;
  need(["TA_CONTACT_NAME", "CONTACT_NAME"], hasContacts && draft.contacts.some((c) => filled(c.name)), "contacts", "contactName");
  need(["TA_CONTACT_ROLE", "CONTACT_ROLE"], hasContacts && draft.contacts.some((c) => filled(c.roleId)), "contacts", "contactRole");
  need(["TA_CONTACT_POSITION", "CONTACT_POSITION"], hasContacts && draft.contacts.some((c) => filled(c.position)), "contacts", "contactPosition");
  need(["TA_CONTACT_EMAIL", "CONTACT_EMAIL"], hasContacts && draft.contacts.some((c) => filled(c.email)), "contacts", "contactEmail");
  need(["TA_CONTACT_PHONE", "CONTACT_PHONE"], hasContacts && draft.contacts.some((c) => filled(c.phone)), "contacts", "contactPhone");
  need(["TA_CONTACT_WHATSAPP", "CONTACT_WHATSAPP"], hasContacts && draft.contacts.some((c) => filled(c.whatsapp)), "contacts", "contactWhatsapp");
  need(["TA_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD"], hasContacts && draft.contacts.some((c) => filled(c.preferredMethod)), "contacts", "contactPreferredMethod");
  need(["TA_CONTACT_NOTES", "CONTACT_NOTES"], hasContacts && draft.contacts.some((c) => filled(c.notes)), "contacts", "contactNotes");

  const isContactReq = (code: string) => {
    const upper = code.toUpperCase();
    const canonical = upper.startsWith("TA_") ? upper : `TA_${upper}`;
    const stripped = upper.startsWith("TA_") ? upper.replace(/^TA_/, "") : upper;
    return Boolean(byCode.get(canonical)?.required || byCode.get(stripped)?.required || byCode.get(upper)?.required);
  };

  // Check required fields on any contacts that are partially filled
  for (const contact of draft.contacts) {
    if (filled(contact.name)) {
      if (isContactReq("TA_CONTACT_EMAIL") && !filled(contact.email)) {
        gaps.push({ code: "contactEmail", label: "Contact Email", step: "contacts" });
      }
      if (isContactReq("TA_CONTACT_PHONE") && !filled(contact.phone)) {
        gaps.push({ code: "contactPhone", label: "Contact Phone", step: "contacts" });
      }
      if (isContactReq("TA_CONTACT_POSITION") && !filled(contact.position)) {
        gaps.push({ code: "contactPosition", label: "Contact Position", step: "contacts" });
      }
      if (isContactReq("TA_CONTACT_ROLE") && !filled(contact.roleId)) {
        gaps.push({ code: "contactRole", label: "Contact Role", step: "contacts" });
      }
      if (isContactReq("TA_CONTACT_WHATSAPP") && !filled(contact.whatsapp)) {
        gaps.push({ code: "contactWhatsapp", label: "Contact WhatsApp", step: "contacts" });
      }
      if (isContactReq("TA_CONTACT_PREFERRED_METHOD") && !filled(contact.preferredMethod)) {
        gaps.push({ code: "contactPreferredMethod", label: "Contact Preferred Method", step: "contacts" });
      }
      if (isContactReq("TA_CONTACT_NOTES") && !filled(contact.notes)) {
        gaps.push({ code: "contactNotes", label: "Contact Notes", step: "contacts" });
      }
    }
  }

  // Step 3: Commission & Rates
  need(["TA_COMMERCIAL_MODEL", "COMMERCIAL_MODEL"], filled(draft.commercialModel), "commission_rates", "commercialModel");
  if (draft.commercialModel === "commissionable") {
    need(["TA_COMMISSION_CURRENCY", "COMMISSION_CURRENCY"], filled(draft.commissionCurrency), "commission_rates", "commissionCurrency");
    need(["TA_COMMISSION_EFFECTIVE_ON", "COMMISSION_EFFECTIVE_ON", "COMMISSION_EFFECTIVE_DATE"], filled(draft.commissionEffectiveOn), "commission_rates", "commissionEffectiveOn");
    need(["TA_COMMISSION_EXPIRES_ON", "COMMISSION_EXPIRES_ON", "COMMISSION_EXPIRY_DATE"], filled(draft.commissionExpiresOn), "commission_rates", "commissionExpiresOn");
    need(["TA_COMMISSION_NOTES", "COMMISSION_NOTES"], filled(draft.commissionNotes), "commission_rates", "commissionNotes");
    need(["TA_COMMISSION_APPLICATION_MODE", "COMMISSION_APPLICATION_MODE"], filled(draft.commissionApplicationMode), "commission_rates", "commissionApplicationMode");
    need(["TA_COMMISSION_TYPE", "COMMISSION_TYPE"], filled(draft.commissionType || draft.allCommissionType), "commission_rates", "commissionType");
    const hasCommVal = draft.commissionApplicationMode === "all"
      ? filled(draft.allCommissionValue || draft.commissionValue)
      : (draft.commissionRules?.length ?? 0) > 0 && draft.commissionRules.some((r) => filled(r.commissionValue));
    need(["TA_COMMISSION_VALUE", "COMMISSION_VALUE"], hasCommVal, "commission_rates", "commissionValue");
  } else if (draft.commercialModel === "net_rate") {
    need(["TA_NET_PRICING_METHOD", "NET_PRICING_METHOD"], filled(draft.netPricingMethod), "commission_rates", "netPricingMethod");
    if (draft.netPricingMethod === "rate_plan") {
      need(["TA_NET_ROOM_TYPE", "NET_ROOM_TYPE"], filled(draft.netRoomTypeId), "commission_rates", "netRoomTypeId");
      need(["TA_NET_RATE_PLAN", "NET_RATE_PLAN"], filled(draft.netRatePlanId), "commission_rates", "netRatePlanId");
    } else if (draft.netPricingMethod === "rate_plan_discount") {
      need(["TA_NET_ROOM_TYPE", "NET_ROOM_TYPE"], filled(draft.netRoomTypeId), "commission_rates", "netRoomTypeId");
      need(["TA_NET_RATE_PLAN", "NET_RATE_PLAN"], filled(draft.netRatePlanId), "commission_rates", "netRatePlanId");
      need(["TA_NET_DISCOUNT_TYPE", "NET_DISCOUNT_TYPE"], filled(draft.netDiscountType), "commission_rates", "netDiscountType");
      need(["TA_NET_DISCOUNT_VALUE", "NET_DISCOUNT_VALUE"], filled(draft.netDiscountValue), "commission_rates", "netDiscountValue");
    } else if (draft.netPricingMethod === "contracted_rates") {
      need(["TA_NET_ROOM_TYPE", "NET_ROOM_TYPE"], (draft.contractedRates?.length ?? 0) > 0, "commission_rates", "contractedRates");
    }
    need(["TA_NET_VALID_FROM", "NET_VALID_FROM", "NET_RATE_VALID_FROM"], filled(draft.netValidFrom), "commission_rates", "netValidFrom");
    need(["TA_NET_VALID_UNTIL", "NET_VALID_UNTIL", "NET_RATE_VALID_UNTIL"], filled(draft.netValidUntil), "commission_rates", "netValidUntil");
    need(["TA_NET_CURRENCY", "NET_CURRENCY", "NET_SETTLEMENT_CURRENCY"], filled(draft.netCurrencyCode), "commission_rates", "netCurrencyCode");
  }
  need(["TA_COMMERCIAL_NOTES", "COMMERCIAL_NOTES"], filled(draft.commercialNotes), "commission_rates", "commercialNotes");

  // Step 4: Payment, Credit & Reservation Rules
  need(["TA_BILLING_CURRENCY", "BILLING_CURRENCY"], filled(draft.billingCurrencyCode) || filled(draft.currency), "payment_rules", "billingCurrencyCode");
  need(["TA_PAYMENT_METHOD", "PAYMENT_METHOD", "SETTLEMENT_METHOD"], filled(draft.defaultPaymentMethodId) || filled(draft.paymentMethodId), "payment_rules", "defaultPaymentMethodId");
  need(["TA_PAYMENT_TIMING", "PAYMENT_TIMING"], filled(draft.paymentTiming), "payment_rules", "paymentTiming");
  need(["TA_BILLING_RULE", "BILLING_RULE", "DEFAULT_BILLING_RULE"], filled(draft.defaultBillingRuleId), "payment_rules", "defaultBillingRuleId");
  need(["TA_BILLING_INSTRUCTION", "BILLING_INSTRUCTION", "BILLING_INSTRUCTIONS"], filled(draft.billingInstruction), "payment_rules", "billingInstruction");
  need(["TA_ALLOW_CREDIT", "ALLOW_CREDIT", "CREDIT_FACILITY"], Boolean(draft.allowCredit), "payment_rules", "allowCredit");
  need(["TA_CREDIT_LIMIT", "CREDIT_LIMIT", "CREDIT_LIMIT_AMOUNT"], filled(draft.creditLimitAmount), "payment_rules", "creditLimitAmount");
  need(["TA_CREDIT_DAYS", "CREDIT_DAYS", "CREDIT_TERMS"], draft.creditDays != null && !Number.isNaN(Number(draft.creditDays)) && Number(draft.creditDays) > 0, "payment_rules", "creditDays");
  need(["TA_CREDIT_STATUS", "CREDIT_STATUS"], filled(draft.creditStatus), "payment_rules", "creditStatus");
  need(["TA_DEPOSIT_POLICY", "DEPOSIT_POLICY", "GUARANTEE_POLICY"], filled(draft.defaultDepositPolicyId), "payment_rules", "defaultDepositPolicyId");
  need(["TA_CANCELLATION_POLICY", "CANCELLATION_POLICY"], filled(draft.defaultCancellationPolicyId), "payment_rules", "defaultCancellationPolicyId");
  need(["TA_NOSHOW_POLICY", "NOSHOW_POLICY", "NO_SHOW_POLICY"], filled(draft.defaultNoShowPolicyId), "payment_rules", "defaultNoShowPolicyId");
  need(["TA_BOOKING_NOTES", "BOOKING_NOTES"], filled(draft.bookingNotes), "payment_rules", "bookingNotes");

  return gaps;
}

const FIELD_CODES_BY_TA_PROP: Record<string, string[]> = {
  name: ["TA_NAME", "AGENCY_NAME", "NAME"],
  agencyType: ["TA_AGENCY_TYPE", "AGENCY_TYPE"],
  agencyTypeOther: ["TA_AGENCY_TYPE", "AGENCY_TYPE"],
  tradeName: ["TA_TRADE_NAME", "TRADE_NAME"],
  code: ["TA_CODE", "AGENCY_CODE", "CODE"],
  accountStatus: ["TA_ACCOUNT_STATUS", "ACCOUNT_STATUS"],
  iataLicenseNumber: ["TA_IATA_NUMBER", "TA_IATA_LICENSE_NUMBER", "IATA_NUMBER", "IATA_LICENSE_NUMBER"],
  licenseExpiryDate: ["TA_LICENSE_EXPIRY", "TA_LICENSE_EXPIRY_DATE", "LICENSE_EXPIRY"],
  website: ["TA_WEBSITE", "WEBSITE"],
  notes: ["TA_NOTES", "NOTES"],
  country: ["TA_COUNTRY", "COUNTRY"],
  region: ["TA_REGION", "REGION", "STATE"],
  city: ["TA_CITY", "CITY"],
  postalCode: ["TA_POSTAL_CODE", "POSTAL_CODE", "ZIP"],
  addressLine1: ["TA_ADDRESS_LINE1", "ADDRESS_LINE1", "STREET_ADDRESS"],
  addressLine2: ["TA_ADDRESS_LINE2", "ADDRESS_LINE2"],
  taxId: ["TA_TAX_ID", "TAX_ID", "TIN"],
  registrationNumber: ["TA_REGISTRATION_NUMBER", "REGISTRATION_NUMBER"],
  marketSegmentId: ["TA_MARKET_SEGMENT", "MARKET_SEGMENT"],
  sourceCodeId: ["TA_SOURCE", "SOURCE", "SOURCE_CODE"],
  accountManagerId: ["TA_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"],
  contacts: ["TA_CONTACT_NAME", "TA_CONTACT_EMAIL", "TA_CONTACT_PHONE", "CONTACT_NAME", "CONTACTS"],
  contactName: ["TA_CONTACT_NAME", "CONTACT_NAME"],
  contactEmail: ["TA_CONTACT_EMAIL", "CONTACT_EMAIL"],
  contactPhone: ["TA_CONTACT_PHONE", "CONTACT_PHONE"],
  contactPosition: ["TA_CONTACT_POSITION", "CONTACT_POSITION"],
  contactRole: ["TA_CONTACT_ROLE", "CONTACT_ROLE"],
  contactWhatsapp: ["TA_CONTACT_WHATSAPP", "CONTACT_WHATSAPP"],
  contactPreferredMethod: ["TA_CONTACT_PREFERRED_METHOD", "CONTACT_PREFERRED_METHOD"],
  contactNotes: ["TA_CONTACT_NOTES", "CONTACT_NOTES"],

  // Step 3 properties
  commercialModel: ["TA_COMMERCIAL_MODEL", "COMMERCIAL_MODEL"],
  commissionCurrency: ["TA_COMMISSION_CURRENCY", "COMMISSION_CURRENCY"],
  commissionEffectiveOn: ["TA_COMMISSION_EFFECTIVE_ON", "COMMISSION_EFFECTIVE_ON", "COMMISSION_EFFECTIVE_DATE"],
  commissionExpiresOn: ["TA_COMMISSION_EXPIRES_ON", "COMMISSION_EXPIRES_ON", "COMMISSION_EXPIRY_DATE"],
  commissionNotes: ["TA_COMMISSION_NOTES", "COMMISSION_NOTES"],
  commissionApplicationMode: ["TA_COMMISSION_APPLICATION_MODE", "COMMISSION_APPLICATION_MODE"],
  commissionType: ["TA_COMMISSION_TYPE", "COMMISSION_TYPE", "ALL_COMMISSION_TYPE"],
  commissionValue: ["TA_COMMISSION_VALUE", "COMMISSION_VALUE", "ALL_COMMISSION_VALUE"],
  netPricingMethod: ["TA_NET_PRICING_METHOD", "NET_PRICING_METHOD"],
  netRoomTypeId: ["TA_NET_ROOM_TYPE", "NET_ROOM_TYPE", "NET_ROOM_TYPE_ID"],
  netRatePlanId: ["TA_NET_RATE_PLAN", "NET_RATE_PLAN", "NET_RATE_PLAN_ID"],
  netDiscountType: ["TA_NET_DISCOUNT_TYPE", "NET_DISCOUNT_TYPE"],
  netDiscountValue: ["TA_NET_DISCOUNT_VALUE", "NET_DISCOUNT_VALUE"],
  netValidFrom: ["TA_NET_VALID_FROM", "NET_VALID_FROM", "NET_RATE_VALID_FROM"],
  netValidUntil: ["TA_NET_VALID_UNTIL", "NET_VALID_UNTIL", "NET_RATE_VALID_UNTIL"],
  netCurrencyCode: ["TA_NET_CURRENCY", "NET_CURRENCY", "NET_SETTLEMENT_CURRENCY"],
  commercialNotes: ["TA_COMMERCIAL_NOTES", "COMMERCIAL_NOTES"],

  // Step 4 properties
  billingCurrencyCode: ["TA_BILLING_CURRENCY", "BILLING_CURRENCY"],
  defaultPaymentMethodId: ["TA_PAYMENT_METHOD", "PAYMENT_METHOD", "SETTLEMENT_METHOD"],
  paymentTiming: ["TA_PAYMENT_TIMING", "PAYMENT_TIMING"],
  defaultBillingRuleId: ["TA_BILLING_RULE", "BILLING_RULE", "DEFAULT_BILLING_RULE"],
  billingInstruction: ["TA_BILLING_INSTRUCTION", "BILLING_INSTRUCTION", "BILLING_INSTRUCTIONS"],
  allowCredit: ["TA_ALLOW_CREDIT", "ALLOW_CREDIT", "CREDIT_FACILITY"],
  creditLimitAmount: ["TA_CREDIT_LIMIT", "CREDIT_LIMIT", "CREDIT_LIMIT_AMOUNT"],
  creditDays: ["TA_CREDIT_DAYS", "CREDIT_DAYS", "CREDIT_TERMS"],
  creditStatus: ["TA_CREDIT_STATUS", "CREDIT_STATUS"],
  defaultDepositPolicyId: ["TA_DEPOSIT_POLICY", "DEPOSIT_POLICY", "GUARANTEE_POLICY"],
  defaultCancellationPolicyId: ["TA_CANCELLATION_POLICY", "CANCELLATION_POLICY"],
  defaultNoShowPolicyId: ["TA_NOSHOW_POLICY", "NOSHOW_POLICY", "NO_SHOW_POLICY"],
  bookingNotes: ["TA_BOOKING_NOTES", "BOOKING_NOTES"],
};

export function matchTravelAgencyFieldIssue(
  issues: TravelAgentCreateFieldIssue[],
  key: string,
): TravelAgentCreateFieldIssue | undefined {
  if (!issues || issues.length === 0 || !key) return undefined;
  const direct = issues.find((issue) => issue.key === key);
  if (direct) return direct;

  const upperKey = key.toUpperCase();
  const strippedKey = upperKey.startsWith("TA_") ? upperKey.slice(3) : upperKey;
  const taKey = upperKey.startsWith("TA_") ? upperKey : `TA_${upperKey}`;

  const aliasList = FIELD_CODES_BY_TA_PROP[key] || [];
  const mapList = TRAVEL_AGENCY_FIELD_ALIASES_MAP[upperKey] || TRAVEL_AGENCY_FIELD_ALIASES_MAP[taKey] || [];

  const candidateKeys = new Set<string>([
    key,
    upperKey,
    strippedKey,
    taKey,
    ...aliasList.map((a) => a.toUpperCase()),
    ...mapList.map((a) => a.toUpperCase()),
  ]);

  return issues.find((issue) => {
    const k = issue.key;
    if (candidateKeys.has(k)) return true;
    const kUpper = k.toUpperCase();
    if (candidateKeys.has(kUpper)) return true;
    const kStripped = kUpper.startsWith("TA_") ? kUpper.slice(3) : kUpper;
    if (candidateKeys.has(kStripped)) return true;
    const kTa = kUpper.startsWith("TA_") ? kUpper : `TA_${kUpper}`;
    if (candidateKeys.has(kTa)) return true;
    return false;
  });
}

export type TravelAgentCreateFieldIssue = CreateFieldIssue<GuestTravelAgentCreateStepId>;

export function travelAgentCreateFieldIssues(
  draft: GuestTravelAgentCreateDraft,
  options?: {
    rules?: TravelAgencyCreateFieldRule[];
    paymentMethodIds?: string[];
    currencyCodes?: string[];
  },
): TravelAgentCreateFieldIssue[] {
  const issues: TravelAgentCreateFieldIssue[] = [];

  // Step 1: Basic Information & Step 2: Contacts via Card 4 Rules
  if (options?.rules && options.rules.length > 0) {
    const gaps = card4TravelAgencyCreateGaps(draft, options.rules);
    for (const gap of gaps) {
      if (!issues.some((iss) => iss.key === gap.code && iss.message.includes(gap.label))) {
        issues.push({
          key: gap.code,
          message: `${gap.label} is required.`,
          step: gap.step,
        });
      }
    }
  } else {
    // Default fallback when no rules passed (backwards compatibility)
    if (!filled(draft.name)) issues.push({ key: "name", message: "Agency name is required.", step: "basic_info" });
    if (!filled(draft.agencyType) || !isAgencyType(draft.agencyType)) {
      issues.push({ key: "agencyType", message: "Agency type is required.", step: "basic_info" });
    }
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
