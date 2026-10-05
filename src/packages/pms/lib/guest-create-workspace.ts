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
import { uniqueIssueMessages, type CreateFieldIssue } from "./guest-create-step-issues.ts";

export const GUEST_CREATE_MIGRATION_FILE = "0093_pms_guest_create_drafts.sql";

export const GUEST_CREATE_STEPS = [
  { id: "basic", number: 1, title: "Basic Information" },
  { id: "identity", number: 2, title: "Identity Documents" },
  { id: "preferences", number: 3, title: "Preferences" },
  { id: "business", number: 4, title: "Business & Membership" },
  { id: "additional", number: 5, title: "Additional Information" },
  { id: "review", number: 6, title: "Review & Save" },
] as const;

export function resolveGuestCreateSteps(identityActive: boolean = true) {
  const list = identityActive
    ? GUEST_CREATE_STEPS
    : GUEST_CREATE_STEPS.filter((item) => item.id !== "identity");
  return list.map((item, index) => ({
    ...item,
    number: index + 1,
  }));
}

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
  | "COMPANY"
  | "TITLE"
  | "MIDDLE_NAME"
  | "PREFERRED_NAME"
  | "GENDER"
  | "LANGUAGE"
  | "VIP_STATUS"
  | "GUEST_PHOTO"
  | "PHONE_ALT"
  | "EMAIL_ALT"
  | "PREFERRED_CONTACT_METHOD"
  | "PREFERRED_CONTACT_TIME"
  | "COUNTRY"
  | "CITY"
  | "REGION"
  | "POSTAL_CODE"
  | "ADDRESS_LINE1";

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
  existingDocumentId?: string;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
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
    country: defaults?.countryId ?? "Ethiopia",
    region: "Addis Ababa",
    city: "Addis Ababa",
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
  if (!touched.has("country") && (!draft.country || draft.country === "Ethiopia") && defaults.countryId) next.country = defaults.countryId;
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

export const ALL_CREATION_FIELD_DEFINITIONS: Array<[GuestCreateFieldCode, string]> = [
  ["FIRST_NAME", "First Name"],
  ["LAST_NAME", "Last Name"],
  ["PHONE", "Mobile Phone"],
  ["EMAIL", "Email Address"],
  ["NATIONALITY", "Nationality"],
  ["DATE_OF_BIRTH", "Date of Birth"],
  ["IDENTITY_DOCUMENT", "Identity Document"],
  ["ADDRESS", "Address"],
  ["COMPANY", "Company"],
  ["TITLE", "Title"],
  ["MIDDLE_NAME", "Middle Name"],
  ["PREFERRED_NAME", "Preferred Name"],
  ["GENDER", "Gender"],
  ["LANGUAGE", "Language"],
  ["VIP_STATUS", "VIP Guest"],
  ["GUEST_PHOTO", "Guest Photo"],
  ["PHONE_ALT", "Alternative Phone"],
  ["EMAIL_ALT", "Alternative Email"],
  ["PREFERRED_CONTACT_METHOD", "Preferred Contact Method"],
  ["PREFERRED_CONTACT_TIME", "Preferred Contact Time"],
  ["COUNTRY", "Country"],
  ["CITY", "City"],
  ["REGION", "Region / State"],
  ["POSTAL_CODE", "Postal Code"],
  ["ADDRESS_LINE1", "Street Address"],
];

export function createFieldRules(
  fields: GuestFieldRecord[],
  profileType: ProfileTypeRecord | null,
): GuestCreateFieldRule[] {
  const seen = new Set<string>();
  const rules: GuestCreateFieldRule[] = [];

  for (const [code, label] of ALL_CREATION_FIELD_DEFINITIONS) {
    seen.add(code.toUpperCase());
    rules.push(createFieldRule(fields, profileType, code, label));
  }

  for (const field of fields) {
    const code = field.code.trim().toUpperCase() as GuestCreateFieldCode;
    if (!seen.has(code)) {
      seen.add(code);
      rules.push(createFieldRule(fields, profileType, code, field.name));
    }
  }

  return rules;
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
  options?: { hasPhoto?: boolean; identityActive?: boolean },
): Array<{ code: GuestCreateFieldCode; label: string; step: GuestCreateStepId }> {
  const gaps: Array<{ code: GuestCreateFieldCode; label: string; step: GuestCreateStepId }> = [];
  const byCode = new Map(rules.map((rule) => [rule.code, rule]));
  const need = (code: GuestCreateFieldCode, ok: boolean, step: GuestCreateStepId) => {
    const rule = byCode.get(code);
    if (rule?.required && !ok) gaps.push({ code, label: rule.label, step });
  };
  need("FIRST_NAME", filled(draft.firstName), "basic");
  need("LAST_NAME", filled(draft.lastName), "basic");
  need("TITLE", filled(draft.title), "basic");
  need("MIDDLE_NAME", filled(draft.middleName), "basic");
  need("PREFERRED_NAME", filled(draft.preferredName), "basic");
  need("DATE_OF_BIRTH", filled(draft.dateOfBirth), "basic");
  need("GENDER", filled(draft.gender), "basic");
  need("NATIONALITY", filled(draft.nationality), "basic");
  need("LANGUAGE", filled(draft.language), "basic");
  need("GUEST_PHOTO", Boolean(options?.hasPhoto), "basic");
  need("PHONE", filled(draft.phone), "basic");
  need("PHONE_ALT", filled(draft.phoneAlt), "basic");
  need("EMAIL", filled(draft.email), "basic");
  need("EMAIL_ALT", filled(draft.emailAlt), "basic");
  need("PREFERRED_CONTACT_METHOD", filled(draft.preferredContactMethod), "basic");
  need("PREFERRED_CONTACT_TIME", filled(draft.preferredContactTime), "basic");
  need("ADDRESS", addressFilled(draft), "basic");
  need("COUNTRY", filled(draft.country), "basic");
  need("CITY", filled(draft.city), "basic");
  need("REGION", filled(draft.region), "basic");
  need("POSTAL_CODE", filled(draft.postalCode), "basic");
  need("ADDRESS_LINE1", filled(draft.addressLine1), "basic");
  need("COMPANY", draft.links.length > 0, "business");
  if (options?.identityActive !== false) {
    need("IDENTITY_DOCUMENT", draft.documents.length > 0, "identity");
  }
  return gaps;
}

export type GuestCreateDocumentTypeOption = {
  id: string;
  name?: string;
  code?: string;
  active?: boolean;
  documentNumberActive?: boolean;
  documentNumberRequired?: boolean;
  issuingCountryActive?: boolean;
  issuingCountryRequired?: boolean;
  issueDateActive?: boolean;
  issueDateRequired?: boolean;
  expiryDateActive?: boolean;
  expiryDateRequired?: boolean;
  issuingAuthorityActive?: boolean;
  issuingAuthorityRequired?: boolean;
  scanImageAllowed?: boolean;
  scanImageRequired?: boolean;
  validForProfileTypeIds?: string[];
};

export type GuestCreateFieldIssue = CreateFieldIssue<GuestCreateStepId>;

export function guestCreateFieldIssues(
  draft: GuestCreateDraft,
  options: {
    rules: GuestCreateFieldRule[];
    set3: GuestProfileRules | null;
    requiredPreferenceTypeIds: string[];
    dataProcessingRequired: boolean;
    hasPhoto?: boolean;
    documentTypes?: GuestCreateDocumentTypeOption[];
    docFiles?: Record<string, File | undefined>;
    identityActive?: boolean;
  },
): GuestCreateFieldIssue[] {
  const issues: GuestCreateFieldIssue[] = [];
  if (!filled(draft.firstName)) {
    issues.push({ key: "FIRST_NAME", message: "First name is required.", step: "basic" });
  }
  const set3 = options.set3 ? guestCreateBlocked(options.set3, draft) : null;
  if (set3) issues.push({ key: "SET3", message: set3, step: "basic" });
  for (const gap of card4CreateGaps(draft, options.rules, { hasPhoto: options.hasPhoto, identityActive: options.identityActive })) {
    if (gap.code === "FIRST_NAME" && issues.some((issue) => issue.key === "FIRST_NAME")) continue;
    const message = gap.code === "IDENTITY_DOCUMENT" ? "At least one identity document is required." : `${gap.label} is required.`;
    issues.push({ key: gap.code, message, step: gap.step });
  }
  if (options.identityActive !== false && options.documentTypes && options.documentTypes.length > 0) {
    draft.documents.forEach((doc, i) => {
      const docType = options.documentTypes?.find((t) => t.id === doc.idTypeId && t.active !== false);
      if (!docType) return;
      if (docType.documentNumberActive !== false && docType.documentNumberRequired && !doc.documentNumber.trim()) {
        issues.push({
          key: `DOC_${doc.key}_documentNumber`,
          message: `Document #${i + 1}: Document number is required.`,
          step: "identity",
        });
      }
      if (docType.issuingCountryActive !== false && docType.issuingCountryRequired && !doc.issuingCountry.trim()) {
        issues.push({
          key: `DOC_${doc.key}_issuingCountry`,
          message: `Document #${i + 1}: Issuing country is required.`,
          step: "identity",
        });
      }
      if (docType.issueDateActive !== false && docType.issueDateRequired && !doc.issueDate.trim()) {
        issues.push({
          key: `DOC_${doc.key}_issueDate`,
          message: `Document #${i + 1}: Issue date is required.`,
          step: "identity",
        });
      }
      if (docType.expiryDateActive !== false && docType.expiryDateRequired && !doc.expiryDate.trim()) {
        issues.push({
          key: `DOC_${doc.key}_expiryDate`,
          message: `Document #${i + 1}: Expiry date is required.`,
          step: "identity",
        });
      }
      if (docType.issuingAuthorityActive !== false && docType.issuingAuthorityRequired && !doc.issuingAuthority.trim()) {
        issues.push({
          key: `DOC_${doc.key}_issuingAuthority`,
          message: `Document #${i + 1}: Issuing authority is required.`,
          step: "identity",
        });
      }
      if (
        docType.scanImageAllowed &&
        docType.scanImageRequired &&
        !doc.hasFront &&
        !options.docFiles?.[`${doc.key}-front`]
      ) {
        issues.push({
          key: `DOC_${doc.key}_scan`,
          message: `Document #${i + 1}: Front document scan/image is required.`,
          step: "identity",
        });
      }
    });
  }
  for (const typeId of options.requiredPreferenceTypeIds) {
    const answer = draft.preferenceAnswers.find((row) => row.typeId === typeId);
    if (!answer || answer.values.length === 0) {
      issues.push({
        key: `PREF:${typeId}`,
        message: "Complete the required preferences configured for this property.",
        step: "preferences",
      });
    }
  }
  const emergencyError = validateEmergencyContacts(draft.emergencyContacts);
  if (emergencyError) issues.push({ key: "emergency", message: emergencyError, step: "additional" });
  const restrictionError = validateRestrictionReason(draft.restricted, draft.blacklisted, draft.restrictionReason);
  if (restrictionError) issues.push({ key: "restrictionReason", message: restrictionError, step: "additional" });
  if (options.dataProcessingRequired && draft.dataProcessingConsent !== "granted") {
    issues.push({
      key: "dataProcessing",
      message: "Data-processing consent is required by this property.",
      step: "additional",
    });
  }
  return issues;
}

export function guestCreateStepErrors(
  step: GuestCreateStepId,
  draft: GuestCreateDraft,
  options: {
    rules: GuestCreateFieldRule[];
    set3: GuestProfileRules | null;
    requiredPreferenceTypeIds: string[];
    dataProcessingRequired: boolean;
    hasPhoto?: boolean;
    documentTypes?: GuestCreateDocumentTypeOption[];
    docFiles?: Record<string, File | undefined>;
    identityActive?: boolean;
  },
): string[] {
  return uniqueIssueMessages(guestCreateFieldIssues(draft, options), step);
}

export function guestCreateCompletion(
  draft: GuestCreateDraft,
  rules: GuestCreateFieldRule[],
  options?: {
    documentTypes?: GuestCreateDocumentTypeOption[];
    docFiles?: Record<string, File | undefined>;
    identityActive?: boolean;
  },
): {
  percent: number;
  items: GuestCreateCompletionItem[];
} {
  const byCode = new Map(rules.map((rule) => [rule.code, rule]));
  const personalReqs: GuestCreateFieldCode[] = [
    "FIRST_NAME",
    "LAST_NAME",
    "TITLE",
    "MIDDLE_NAME",
    "PREFERRED_NAME",
    "DATE_OF_BIRTH",
    "GENDER",
    "NATIONALITY",
    "LANGUAGE",
  ];
  const personalVals: Record<string, string> = {
    FIRST_NAME: draft.firstName,
    LAST_NAME: draft.lastName,
    TITLE: draft.title,
    MIDDLE_NAME: draft.middleName,
    PREFERRED_NAME: draft.preferredName,
    DATE_OF_BIRTH: draft.dateOfBirth,
    GENDER: draft.gender,
    NATIONALITY: draft.nationality,
    LANGUAGE: draft.language,
  };
  const personalMissing = personalReqs.some(
    (code) => byCode.get(code)?.required && !filled(personalVals[code]),
  );

  const contactReqs: GuestCreateFieldCode[] = [
    "PHONE",
    "EMAIL",
    "PHONE_ALT",
    "EMAIL_ALT",
    "PREFERRED_CONTACT_METHOD",
    "PREFERRED_CONTACT_TIME",
  ];
  const contactVals: Record<string, string> = {
    PHONE: draft.phone,
    EMAIL: draft.email,
    PHONE_ALT: draft.phoneAlt,
    EMAIL_ALT: draft.emailAlt,
    PREFERRED_CONTACT_METHOD: draft.preferredContactMethod,
    PREFERRED_CONTACT_TIME: draft.preferredContactTime,
  };
  const contactMissing = contactReqs.some(
    (code) => byCode.get(code)?.required && !filled(contactVals[code]),
  );

  const addressReqs: GuestCreateFieldCode[] = [
    "COUNTRY",
    "CITY",
    "REGION",
    "POSTAL_CODE",
    "ADDRESS_LINE1",
  ];
  const addressVals: Record<string, string> = {
    COUNTRY: draft.country,
    CITY: draft.city,
    REGION: draft.region,
    POSTAL_CODE: draft.postalCode,
    ADDRESS_LINE1: draft.addressLine1,
  };
  const addressMissing =
    (byCode.get("ADDRESS")?.required && !addressFilled(draft)) ||
    addressReqs.some((code) => byCode.get(code)?.required && !filled(addressVals[code]));

  const items: GuestCreateCompletionItem[] = [
    {
      id: "personal",
      label: "Personal Information",
      complete: filled(draft.firstName) && !personalMissing,
      requiredRemaining: personalMissing,
      step: "basic",
    },
    {
      id: "contact",
      label: "Contact Information",
      complete: (filled(draft.phone) || filled(draft.email)) && !contactMissing,
      requiredRemaining: contactMissing,
      step: "basic",
    },
    {
      id: "address",
      label: "Address",
      complete: addressFilled(draft) && !addressMissing,
      requiredRemaining: addressMissing,
      step: "basic",
    },
    ...(byCode.get("IDENTITY_DOCUMENT")?.visible !== false && options?.identityActive !== false
      ? [
          {
            id: "identity",
            label: "Identity Document",
            complete:
              (!byCode.get("IDENTITY_DOCUMENT")?.required || draft.documents.length > 0) &&
              (!options?.documentTypes ||
                draft.documents.every((doc) => {
                  const docType = options.documentTypes?.find((t) => t.id === doc.idTypeId && t.active !== false);
                  if (!docType) return true;
                  if (docType.documentNumberActive !== false && docType.documentNumberRequired && !doc.documentNumber.trim()) return false;
                  if (docType.issuingCountryActive !== false && docType.issuingCountryRequired && !doc.issuingCountry.trim()) return false;
                  if (docType.issueDateActive !== false && docType.issueDateRequired && !doc.issueDate.trim()) return false;
                  if (docType.expiryDateActive !== false && docType.expiryDateRequired && !doc.expiryDate.trim()) return false;
                  if (docType.issuingAuthorityActive !== false && docType.issuingAuthorityRequired && !doc.issuingAuthority.trim()) return false;
                  if (docType.scanImageAllowed && docType.scanImageRequired && !doc.hasFront && !options.docFiles?.[`${doc.key}-front`]) return false;
                  return true;
                })),
            requiredRemaining: Boolean(
              (byCode.get("IDENTITY_DOCUMENT")?.required && draft.documents.length === 0) ||
              (options?.documentTypes &&
                draft.documents.some((doc) => {
                  const docType = options.documentTypes?.find((t) => t.id === doc.idTypeId && t.active !== false);
                  if (!docType) return false;
                  return (
                    (docType.documentNumberActive !== false && docType.documentNumberRequired && !doc.documentNumber.trim()) ||
                    (docType.issuingCountryActive !== false && docType.issuingCountryRequired && !doc.issuingCountry.trim()) ||
                    (docType.issueDateActive !== false && docType.issueDateRequired && !doc.issueDate.trim()) ||
                    (docType.expiryDateActive !== false && docType.expiryDateRequired && !doc.expiryDate.trim()) ||
                    (docType.issuingAuthorityActive !== false && docType.issuingAuthorityRequired && !doc.issuingAuthority.trim()) ||
                    (docType.scanImageAllowed && docType.scanImageRequired && !doc.hasFront && !options.docFiles?.[`${doc.key}-front`])
                  );
                })),
            ),
            step: "identity" as GuestCreateStepId,
          },
        ]
      : []),
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
