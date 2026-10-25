/**
 * Step 2 registration view rules.
 * Guest Profile owns identity. This file does not merge guests or change occupancy.
 */
import { CANONICAL_FIELD_CODE_MAP } from "@/packages/pms/lib/guest-field-rules";
import {
  CHECK_IN_PROFILE_COLUMNS,
  registrationIssuingCountry,
  registrationProfileColumns,
  type CheckInProfileField,
} from "@/packages/pms/lib/fo-check-in-registration";
import type {
  CheckInRegistrationDocument,
  CheckInRegistrationField,
  CheckInRegistrationRead,
} from "@/packages/pms/lib/fo-check-in-registration.functions";

export const REGISTRATION_DETAIL_FIELDS = [
  "title",
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "gender",
  "dateOfBirth",
  "nationality",
  "country",
] as const satisfies readonly CheckInProfileField[];

export const REGISTRATION_CONTACT_FIELDS = [
  "phone",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
  "language",
] as const satisfies readonly CheckInProfileField[];

export const REGISTRATION_EXTRA_FIELDS = [
  "language",
] as const satisfies readonly CheckInProfileField[];

export const REGISTRATION_FIELD_LABELS: Record<CheckInProfileField, string> = {
  firstName: "First name",
  lastName: "Last name",
  middleName: "Middle name",
  preferredName: "Preferred name",
  title: "Title",
  gender: "Gender",
  dateOfBirth: "Date of birth",
  phone: "Mobile phone",
  email: "Email",
  nationality: "Nationality",
  language: "Language",
  addressLine1: "Address",
  addressLine2: "Address line 2",
  city: "City",
  region: "Region",
  country: "Country",
  postalCode: "Postal code",
};

export type RegistrationDocumentTone = "verified" | "warning" | "blocked" | "empty";

export type RegistrationDocumentState = {
  tone: RegistrationDocumentTone;
  label: string;
  summary: string;
};

export function registrationRelationship(guestSource: "unit_primary" | "booker"): string {
  return guestSource === "booker" ? "Booker" : "Primary Guest";
}

export function registrationCanonicalKey(code: string): CheckInProfileField | null {
  const key = CANONICAL_FIELD_CODE_MAP[code.toUpperCase()];
  if (!key || !(key in CHECK_IN_PROFILE_COLUMNS)) return null;
  return key as CheckInProfileField;
}

/** Required markers come from the registration read. Optional profile values fill the rest. */
export function registrationDraft(
  fields: CheckInRegistrationField[],
  profile: Partial<Record<CheckInProfileField, string | null>>,
): Record<CheckInProfileField, string> {
  const draft = {} as Record<CheckInProfileField, string>;
  for (const key of Object.keys(CHECK_IN_PROFILE_COLUMNS) as CheckInProfileField[]) {
    draft[key] = profile[key]?.trim() ?? "";
  }
  for (const field of fields) {
    const key = registrationCanonicalKey(field.code);
    if (!key || field.value == null) continue;
    draft[key] = field.value;
  }
  return draft;
}

export function registrationFieldRequired(
  fields: CheckInRegistrationField[],
  key: CheckInProfileField,
): boolean {
  return fields.some((field) => field.required && registrationCanonicalKey(field.code) === key);
}

export function registrationRequiredErrors(
  fields: CheckInRegistrationField[],
  draft: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    const key = registrationCanonicalKey(field.code);
    if (!key) {
      if (!field.value?.trim())
        errors.push(`${field.label} is required and cannot be edited here.`);
      continue;
    }
    if (!draft[key]?.trim()) errors.push(`${field.label} is required.`);
  }
  return errors;
}

/**
 * Save payload is profile columns plus an optional guest_documents row.
 * Occupancy and scalar id_document_* keys are dropped.
 */
export function buildRegistrationSave(input: {
  draft: Record<string, string | null | undefined>;
  document: {
    documentId?: string;
    idTypeId: string;
    documentNumber: string;
    issuingCountry: string;
    issueDate: string;
    expiryDate: string;
  } | null;
}): {
  fields: Record<string, string | null>;
  document: {
    documentId?: string;
    idTypeId: string;
    documentNumber: string | null;
    issuingCountry: string | null;
    issueDate: string | null;
    expiryDate: string | null;
  } | null;
} {
  const fields = registrationProfileColumns(input.draft);
  if (!input.document?.idTypeId) return { fields, document: null };
  return {
    fields,
    document: {
      ...(input.document.documentId ? { documentId: input.document.documentId } : {}),
      idTypeId: input.document.idTypeId,
      documentNumber: input.document.documentNumber.trim() || null,
      issuingCountry: registrationIssuingCountry(input.document.issuingCountry),
      issueDate: input.document.issueDate.trim() || null,
      expiryDate: input.document.expiryDate.trim() || null,
    },
  };
}

function expired(expiryDate: string | null, today: string): boolean {
  const expiry = expiryDate?.trim() ?? "";
  return Boolean(expiry) && expiry < today;
}

type RegistrationIdentityDocument = {
  id?: string;
  verificationStatus: string;
  expiryDate: string | null;
  typeId?: string | null;
  documentNumber?: string | null;
  issuingCountry?: string | null;
  issueDate?: string | null;
};

function identityFieldsPresent(document: RegistrationIdentityDocument): boolean {
  return Boolean(document.typeId?.trim()) && Boolean(document.documentNumber?.trim());
}

/** Prefer the Guest Profile document that is verified and has identity fields. */
export function registrationIdentitySelection<T extends RegistrationIdentityDocument>(
  documents: readonly T[],
  today: string,
): T | null {
  const usable = documents.filter((document) => !expired(document.expiryDate, today));
  return (
    usable.find(
      (document) => document.verificationStatus === "verified" && identityFieldsPresent(document),
    ) ??
    usable[0] ??
    documents[0] ??
    null
  );
}

export function registrationDocumentState(input: {
  documents: Array<RegistrationIdentityDocument>;
  warnings: string[];
  today: string;
}): RegistrationDocumentState {
  const documents = input.documents;
  if (documents.length === 0) {
    return {
      tone: "blocked",
      label: "Missing identity document",
      summary: "Missing required ID",
    };
  }
  const usable = documents.filter((document) => !expired(document.expiryDate, input.today));
  if (usable.length === 0) {
    return {
      tone: "blocked",
      label: "Expired document",
      summary: "Expired document",
    };
  }
  if (
    usable.some((document) => document.verificationStatus === "rejected") &&
    !usable.some((document) => document.verificationStatus === "verified")
  ) {
    return { tone: "blocked", label: "Rejected", summary: "Needs attention" };
  }
  const verified = usable.filter((document) => document.verificationStatus === "verified");
  if (verified.some((document) => identityFieldsPresent(document))) {
    return {
      tone: "verified",
      label: "Verified",
      summary: "Identity document verified",
    };
  }
  if (verified.length > 0) {
    return {
      tone: "blocked",
      label: "Identity details incomplete",
      summary: "Identity details incomplete",
    };
  }
  const unverified =
    usable.some((document) => document.verificationStatus === "unverified") ||
    input.warnings.some((warning) => /not verified/i.test(warning));
  if (unverified) {
    return {
      tone: "warning",
      label: "Unverified",
      summary: "Warning: ID unverified",
    };
  }
  return {
    tone: "blocked",
    label: "Identity details incomplete",
    summary: "Identity details incomplete",
  };
}

export function registrationFailureCopy(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/could not be found/i.test(message)) return "Guest profile unavailable.";
  if (/permission|don't have access|do not have access|not authorized|forbidden/i.test(message)) {
    return "You don't have access to update this registration.";
  }
  if (/choose which room/i.test(message)) return "Choose which room this registration applies to.";
  if (/not on this reservation/i.test(message))
    return "That room is no longer on this reservation.";
  return "Registration could not be saved. Try again.";
}

export function registrationTargetsGuest(
  read: Pick<CheckInRegistrationRead, "guestId" | "guestSource">,
): {
  guestId: string;
  relationship: string;
} {
  return {
    guestId: read.guestId,
    relationship: registrationRelationship(read.guestSource),
  };
}
