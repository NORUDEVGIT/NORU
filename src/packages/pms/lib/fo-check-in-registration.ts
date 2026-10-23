/**
 * B02 — Check-In registration through Guest Profile.
 * Identity documents stay on guest_documents. Scalar id_document_* columns are not written here.
 */

import { countryCodeFromInput, countryNameFromInput } from "@/packages/pms/lib/pms-geography";
import { canonicalRegistrationPhone } from "@/packages/pms/lib/pms-property-setup-phone";

export const CHECK_IN_PROFILE_COLUMNS = {
  firstName: "first_name",
  lastName: "last_name",
  middleName: "middle_name",
  preferredName: "preferred_name",
  title: "title",
  gender: "gender",
  dateOfBirth: "date_of_birth",
  phone: "phone",
  email: "email",
  nationality: "nationality",
  language: "language",
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  city: "city",
  region: "region",
  country: "country",
  postalCode: "postal_code",
} as const;

export type CheckInProfileField = keyof typeof CHECK_IN_PROFILE_COLUMNS;

const PROFILE_FIELD_KEYS = new Set<string>(Object.keys(CHECK_IN_PROFILE_COLUMNS));
const PROFILE_COLUMN_KEYS = new Set<string>(Object.values(CHECK_IN_PROFILE_COLUMNS));

function withoutFlag(value: string): string {
  return value
    .replace(/\p{Regional_Indicator}/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stores the demonym, never the flag label "🇪🇹 Ethiopian (Ethiopia)". */
export function registrationNationalityValue(value: string | null | undefined): string {
  const cleaned = withoutFlag(value ?? "");
  const wrapped = cleaned.match(/^(.*?)\s+\((.+)\)$/);
  return (wrapped?.[1] ?? cleaned).trim();
}

/** Stores the country name used by Guest Profile, never a flag label. */
export function registrationCountryValue(value: string | null | undefined): string {
  const cleaned = withoutFlag(value ?? "");
  if (!cleaned) return "";
  return countryNameFromInput(cleaned);
}

/** Stores the ISO code. Guest documents reject a long display name. */
export function registrationIssuingCountry(value: string | null | undefined): string | null {
  const cleaned = withoutFlag(value ?? "");
  if (!cleaned) return null;
  return countryCodeFromInput(cleaned) || cleaned.slice(0, 8);
}

export function registrationProfileColumns(
  fields: Record<string, string | null | undefined>,
): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    const column = PROFILE_FIELD_KEYS.has(key)
      ? CHECK_IN_PROFILE_COLUMNS[key as CheckInProfileField]
      : PROFILE_COLUMN_KEYS.has(key)
        ? key
        : null;
    if (!column) continue;
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (column === "phone") {
      columns.phone = canonicalRegistrationPhone(trimmed) || null;
      continue;
    }
    if (column === "country") {
      columns.country = registrationCountryValue(trimmed) || null;
      continue;
    }
    if (column === "nationality") {
      columns.nationality = registrationNationalityValue(trimmed) || null;
      continue;
    }
    columns[column] = trimmed.length > 0 ? trimmed : null;
  }
  return columns;
}

export type CheckInDocumentVerification = {
  warnings: string[];
  blockers: string[];
};

/**
 * Unverified is a warning. It blocks only when an existing document-type rule
 * already requires staff verification. This does not add a new property flag.
 */
export function checkInIdentityVerification(input: {
  documents: Array<{ typeId: string | null; verificationStatus: string | null }>;
  types: Array<{ id: string; requiresStaffVerification?: boolean }>;
}): CheckInDocumentVerification {
  const warnings: string[] = [];
  const blockers: string[] = [];
  for (const document of input.documents) {
    if (document.verificationStatus === "verified") continue;
    const type = input.types.find((item) => item.id === document.typeId);
    if (type?.requiresStaffVerification === true) {
      blockers.push("Staff verification is required for this identity document.");
      continue;
    }
    warnings.push("Identity document is not verified.");
  }
  return { warnings, blockers };
}
