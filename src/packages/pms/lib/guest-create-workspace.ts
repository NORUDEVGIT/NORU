/**
 * Individual Create New Guest workflow helpers.
 * Canonical rows stay on guest_profiles. Settings stay Card 4 + SET3.
 */

import { guestCreateBlocked, type GuestProfileRules } from "./pms-set3-rates-guest.ts";
import type { GuestFieldRecord } from "./required-fields-card4.server.ts";
import type { ProfileTypeDefaults, ProfileTypeRecord } from "./profile-types-card4.server.ts";
import type { PreferenceValueType } from "./preferences-card4.server.ts";
import type { PreferredContactMethod, PreferredContactTime } from "./guest-profile-overview.ts";
import type { GuestConsentState } from "./guest-profile-wave2.ts";
import {
  validateEmergencyContacts,
  validateRestrictionReason,
  type GuestGender,
  type GuestTitle,
  type IndividualLinkRole,
  type RestrictionSeverity,
} from "./guest-profile-individual.ts";
import type { GuestStatus } from "./guests.server.ts";

export const GUEST_CREATE_MIGRATION_FILE = "0093_pms_guest_create_drafts.sql";

export const GUEST_CREATE_STEPS = [
  { id: "basic", number: 1, title: "Basic Information" },
  { id: "identity", number: 2, title: "Identity Documents" },
  { id: "preferences", number: 3, title: "Preferences" },
  { id: "business", number: 4, title: "Business & Membership" },
  { id: "additional", number: 5, title: "Additional Information" },
  { id: "review", number: 6, title: "Review & Save" },
] as const;

export type GuestCreateStepId = (typeof GUEST_CREATE_STEPS)[number]["id"];

export const GUEST_CREATE_TITLE = "Create New Guest";
export const GUEST_CREATE_COPY =
  "Add a new guest profile. All required fields are based on your property setup.";
export const GUEST_CREATE_LOYALTY_UNAVAILABLE =
  "Loyalty points and membership tiers are not available. VIP remains a staff flag on the guest profile.";
export const GUEST_CREATE_NO_DOC_TYPES =
  "Configure active identity document types in Property Setup before adding a document.";
export const GUEST_CREATE_NO_PREFERENCES =
  "No preference types are configured for this property.";
export const GUEST_CREATE_DRAFT_SAVED = "Draft saved. It will not appear in guest search.";
export const GUEST_CREATE_PROGRESS_KEPT =
  "Your progress is kept. Return to Create New Guest to continue.";
export const GUEST_CREATE_START_OVER = "Start Over";
export const GUEST_CREATE_START_OVER_COPY =
  "This clears the form and saved progress. No guest is created or deleted.";
export const GUEST_CREATE_HOLD_KEY_PREFIX = "noru.guest-create.hold";
export const GUEST_CREATE_HOLD_DEBOUNCE_MS = 700;

export type GuestCreateFieldCode =
  | "FIRST_NAME"
  | "LAST_NAME"
  | "PHONE"
  | "EMAIL"
  | "NATIONALITY"
  | "DATE_OF_BIRTH"
  | "IDENTITY_DOCUMENT"
  | "ADDRESS"
  | "COMPANY";

export type GuestCreateFieldRule = {
  code: GuestCreateFieldCode;
  visible: boolean;
  required: boolean;
  label: string;
};

export type GuestCreateDocumentDraft = {
  key: string;
  idTypeId: string;
  documentNumber: string;
  issuingCountry: string;
  issueDate: string;
  expiryDate: string;
  issuingAuthority: string;
  notes: string;
  hasFront: boolean;
  hasBack: boolean;
};

export type GuestCreateLinkDraft = {
  key: string;
  masterId: string;
  masterName: string;
  role: IndividualLinkRole;
};

export type GuestCreatePreferenceAnswer = {
  typeId: string;
  values: string[];
};

export type GuestCreateEmergencyDraft = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
};

export type GuestCreateDraft = {
  title: GuestTitle | "";
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string;
  gender: GuestGender | "";
  nationality: string;
  language: string;
  country: string;
  region: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  phone: string;
  phoneAlt: string;
  email: string;
  emailAlt: string;
  preferredContactMethod: PreferredContactMethod | "";
  preferredContactTime: PreferredContactTime | "";
  vipStatus: boolean;
  guestStatus: GuestStatus;
  position: string;
  department: string;
  sourceOfBusiness: string;
  notes: string;
  restricted: boolean;
  blacklisted: boolean;
  restrictionSeverity: RestrictionSeverity | "";
  restrictionReason: string;
  restrictionUntil: string;
  emergencyContacts: GuestCreateEmergencyDraft[];
  documents: GuestCreateDocumentDraft[];
  preferenceAnswers: GuestCreatePreferenceAnswer[];
  links: GuestCreateLinkDraft[];
  stagedNote: string;
  marketingConsent: GuestConsentState;
  dataProcessingConsent: GuestConsentState;
  acknowledgeDuplicates: boolean;
};

export type GuestCreateCompletionItem = {
  id: string;
  label: string;
  complete: boolean;
  requiredRemaining: boolean;
  step: GuestCreateStepId;
};

export function isGuestCreateStepId(value: string | undefined): value is GuestCreateStepId {
  return Boolean(value && GUEST_CREATE_STEPS.some((step) => step.id === value));
}

export function guestCreateStep(id: string | undefined): GuestCreateStepId {
  return isGuestCreateStepId(id) ? id : "basic";
}

export type GuestCreateHold = {
  step: GuestCreateStepId;
  draft: GuestCreateDraft;
};

export function guestCreateHoldKey(restaurantId: string): string {
  return `${GUEST_CREATE_HOLD_KEY_PREFIX}:${restaurantId}`;
}

function guestCreateStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isGuestCreateDraftShape(value: unknown): value is GuestCreateDraft {
  return Boolean(value && typeof value === "object" && "firstName" in value);
}

export function inferGuestCreateStep(draft: GuestCreateDraft): GuestCreateStepId {
  if (draft.links.length > 0 || filled(draft.position) || filled(draft.department) || filled(draft.sourceOfBusiness)) {
    return "business";
  }
  if (draft.preferenceAnswers.some((row) => row.values.length > 0)) return "preferences";
  if (draft.documents.length > 0) return "identity";
  return "basic";
}

export function parseGuestCreateHold(payload: unknown): GuestCreateHold | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { step?: unknown; draft?: unknown };
  if (isGuestCreateDraftShape(record.draft)) {
    return {
      step: isGuestCreateStepId(String(record.step ?? "")) ? (record.step as GuestCreateStepId) : inferGuestCreateStep(record.draft),
      draft: record.draft,
    };
  }
  if (isGuestCreateDraftShape(record)) {
    return { step: inferGuestCreateStep(record), draft: record };
  }
  return null;
}

export function readGuestCreateHold(restaurantId: string): GuestCreateHold | null {
  const storage = guestCreateStorage();
  if (!storage) return null;
  try {
    return parseGuestCreateHold(JSON.parse(storage.getItem(guestCreateHoldKey(restaurantId)) ?? ""));
  } catch {
    return null;
  }
}

export function writeGuestCreateHold(restaurantId: string, hold: GuestCreateHold): void {
  const storage = guestCreateStorage();
  if (!storage) return;
  storage.setItem(guestCreateHoldKey(restaurantId), JSON.stringify(hold));
}

export function clearGuestCreateHold(restaurantId: string): void {
  guestCreateStorage()?.removeItem(guestCreateHoldKey(restaurantId));
}

export function emptyGuestCreateDraft(defaults?: ProfileTypeDefaults | null): GuestCreateDraft {
  return {
    title: "",
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    dateOfBirth: "",
    gender: "",
    nationality: "",
    language: defaults?.languageId ?? "",
    country: defaults?.countryId ?? "",
    region: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    phone: "",
    phoneAlt: "",
    email: "",
    emailAlt: "",
    preferredContactMethod: (defaults?.communicationChannelId as PreferredContactMethod | undefined) ?? "",
    preferredContactTime: "",
    vipStatus: false,
    guestStatus: "active",
    position: "",
    department: "",
    sourceOfBusiness: "",
    notes: "",
    restricted: false,
    blacklisted: false,
    restrictionSeverity: "",
    restrictionReason: "",
    restrictionUntil: "",
    emergencyContacts: [{ name: "", relationship: "", phone: "", email: "" }],
    documents: [],
    preferenceAnswers: [],
    links: [],
    stagedNote: "",
    marketingConsent: "not_asked",
    dataProcessingConsent: "not_asked",
    acknowledgeDuplicates: false,
  };
}

export function applyCreateDefaults(
  draft: GuestCreateDraft,
  defaults: ProfileTypeDefaults | null | undefined,
  touched: Set<string>,
): GuestCreateDraft {
  if (!defaults) return draft;
  const next = { ...draft };
  if (!touched.has("language") && !draft.language && defaults.languageId) next.language = defaults.languageId;
  if (!touched.has("country") && !draft.country && defaults.countryId) next.country = defaults.countryId;
  if (
    !touched.has("preferredContactMethod") &&
    !draft.preferredContactMethod &&
    defaults.communicationChannelId
  ) {
    next.preferredContactMethod = defaults.communicationChannelId as PreferredContactMethod;
  }
  return next;
}

const ALWAYS_VISIBLE_CREATE_FIELDS = new Set<GuestCreateFieldCode>(["FIRST_NAME"]);

function fieldByCode(fields: GuestFieldRecord[], code: GuestCreateFieldCode): GuestFieldRecord | undefined {
  return fields.find((field) => field.code.trim().toUpperCase() === code);
}

export function createFieldRule(
  fields: GuestFieldRecord[],
  profileType: ProfileTypeRecord | null,
  code: GuestCreateFieldCode,
  label: string,
): GuestCreateFieldRule {
  const field = fieldByCode(fields, code);
  const typeRequired = Boolean(field && profileType?.requiredFieldIds.includes(field.id));
  const alwaysVisible = ALWAYS_VISIBLE_CREATE_FIELDS.has(code);
  if (!field) {
    return {
      code,
      visible: true,
      required: typeRequired || code === "FIRST_NAME",
      label,
    };
  }
  return {
    code,
    visible: alwaysVisible || field.active,
    required: alwaysVisible || (field.active && (field.required || typeRequired)),
    label: field.name || label,
  };
}

export function createFieldRules(
  fields: GuestFieldRecord[],
  profileType: ProfileTypeRecord | null,
): GuestCreateFieldRule[] {
  return (
    [
      ["FIRST_NAME", "First Name"],
      ["LAST_NAME", "Last Name"],
      ["PHONE", "Mobile Phone"],
      ["EMAIL", "Email"],
      ["NATIONALITY", "Nationality"],
      ["DATE_OF_BIRTH", "Date of Birth"],
      ["IDENTITY_DOCUMENT", "Identity Document"],
      ["ADDRESS", "Address"],
      ["COMPANY", "Company"],
    ] as Array<[GuestCreateFieldCode, string]>
  ).map(([code, label]) => createFieldRule(fields, profileType, code, label));
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function addressFilled(draft: GuestCreateDraft): boolean {
  return [draft.country, draft.city, draft.addressLine1].some((value) => filled(value));
}

export function card4CreateGaps(
  draft: GuestCreateDraft,
  rules: GuestCreateFieldRule[],
): Array<{ code: GuestCreateFieldCode; label: string; step: GuestCreateStepId }> {
  const gaps: Array<{ code: GuestCreateFieldCode; label: string; step: GuestCreateStepId }> = [];
  const byCode = new Map(rules.map((rule) => [rule.code, rule]));
  const need = (code: GuestCreateFieldCode, ok: boolean, step: GuestCreateStepId) => {
    const rule = byCode.get(code);
    if (rule?.required && !ok) gaps.push({ code, label: rule.label, step });
  };
  need("FIRST_NAME", filled(draft.firstName), "basic");
  need("LAST_NAME", filled(draft.lastName), "basic");
  need("PHONE", filled(draft.phone), "basic");
  need("EMAIL", filled(draft.email), "basic");
  need("NATIONALITY", filled(draft.nationality), "basic");
  need("DATE_OF_BIRTH", filled(draft.dateOfBirth), "basic");
  need("ADDRESS", addressFilled(draft), "basic");
  need("IDENTITY_DOCUMENT", draft.documents.some((row) => filled(row.documentNumber) || row.hasFront), "identity");
  need("COMPANY", draft.links.length > 0, "business");
  return gaps;
}

export function guestCreateStepErrors(
  step: GuestCreateStepId,
  draft: GuestCreateDraft,
  options: {
    rules: GuestCreateFieldRule[];
    set3: GuestProfileRules | null;
    requiredPreferenceTypeIds: string[];
    dataProcessingRequired: boolean;
  },
): string[] {
  const errors: string[] = [];
  const gaps = card4CreateGaps(draft, options.rules);
  if (step === "basic" || step === "review") {
    if (!filled(draft.firstName)) errors.push("First name is required.");
    const set3 = options.set3 ? guestCreateBlocked(options.set3, draft) : null;
    if (set3) errors.push(set3);
    for (const gap of gaps.filter((item) => item.step === "basic")) {
      errors.push(`${gap.label} is required.`);
    }
  }
  if (step === "identity" || step === "review") {
    for (const gap of gaps.filter((item) => item.step === "identity")) {
      errors.push(`${gap.label} is required.`);
    }
  }
  if (step === "preferences" || step === "review") {
    for (const typeId of options.requiredPreferenceTypeIds) {
      const answer = draft.preferenceAnswers.find((row) => row.typeId === typeId);
      if (!answer || answer.values.length === 0) {
        errors.push("Complete the required preferences configured for this property.");
        break;
      }
    }
  }
  if (step === "business" || step === "review") {
    for (const gap of gaps.filter((item) => item.step === "business")) {
      errors.push(`${gap.label} is required.`);
    }
  }
  if (step === "additional" || step === "review") {
    const emergencyError = validateEmergencyContacts(draft.emergencyContacts);
    if (emergencyError) errors.push(emergencyError);
    const restrictionError = validateRestrictionReason(
      draft.restricted,
      draft.blacklisted,
      draft.restrictionReason,
    );
    if (restrictionError) errors.push(restrictionError);
    if (options.dataProcessingRequired && draft.dataProcessingConsent !== "granted") {
      errors.push("Data-processing consent is required by this property.");
    }
  }
  return [...new Set(errors)];
}

export function guestCreateCompletion(
  draft: GuestCreateDraft,
  rules: GuestCreateFieldRule[],
): {
  percent: number;
  items: GuestCreateCompletionItem[];
} {
  const byCode = new Map(rules.map((rule) => [rule.code, rule]));
  const items: GuestCreateCompletionItem[] = [
    {
      id: "personal",
      label: "Personal Information",
      complete: filled(draft.firstName) && (!(byCode.get("LAST_NAME")?.required) || filled(draft.lastName)),
      requiredRemaining: Boolean(byCode.get("FIRST_NAME")?.required && !filled(draft.firstName)),
      step: "basic",
    },
    {
      id: "contact",
      label: "Contact Information",
      complete:
        (!(byCode.get("PHONE")?.required) || filled(draft.phone)) &&
        (!(byCode.get("EMAIL")?.required) || filled(draft.email)),
      requiredRemaining:
        Boolean(byCode.get("PHONE")?.required && !filled(draft.phone)) ||
        Boolean(byCode.get("EMAIL")?.required && !filled(draft.email)),
      step: "basic",
    },
    {
      id: "address",
      label: "Address",
      complete: !byCode.get("ADDRESS")?.required || addressFilled(draft),
      requiredRemaining: Boolean(byCode.get("ADDRESS")?.required && !addressFilled(draft)),
      step: "basic",
    },
    {
      id: "identity",
      label: "Identity Document",
      complete: !byCode.get("IDENTITY_DOCUMENT")?.required || draft.documents.length > 0,
      requiredRemaining: Boolean(byCode.get("IDENTITY_DOCUMENT")?.required && draft.documents.length === 0),
      step: "identity",
    },
    {
      id: "preferences",
      label: "Preferences",
      complete: true,
      requiredRemaining: false,
      step: "preferences",
    },
    {
      id: "business",
      label: "Business Information",
      complete: !byCode.get("COMPANY")?.required || draft.links.length > 0,
      requiredRemaining: Boolean(byCode.get("COMPANY")?.required && draft.links.length === 0),
      step: "business",
    },
    {
      id: "additional",
      label: "Additional Information",
      complete: true,
      requiredRemaining: false,
      step: "additional",
    },
  ];
  const scored = items.filter((item) => item.requiredRemaining || item.complete || true);
  const done = scored.filter((item) => item.complete && !item.requiredRemaining).length;
  return {
    percent: scored.length === 0 ? 0 : Math.round((done / scored.length) * 100),
    items,
  };
}

export function guestDisplayName(draft: GuestCreateDraft): string {
  return [draft.title, draft.firstName, draft.middleName, draft.lastName]
    .filter((value) => filled(value))
    .join(" ")
    .trim();
}

export function preferenceControl(valueType: PreferenceValueType): "select" | "multi" | "yes_no" | "text" | "number" {
  return valueType;
}

export function guestCreateHasChanges(draft: GuestCreateDraft, defaults?: ProfileTypeDefaults | null): boolean {
  const empty = emptyGuestCreateDraft(defaults);
  return JSON.stringify({ ...draft, acknowledgeDuplicates: false }) !== JSON.stringify({ ...empty, acknowledgeDuplicates: false });
}
