/**
 * B02 — Check-In registration through Guest Profile.
 * Identity documents stay on guest_documents. Scalar id_document_* columns are not written here.
 */

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

export function registrationProfileColumns(
  fields: Record<string, string | null | undefined>,
): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!PROFILE_FIELD_KEYS.has(key)) continue;
    const column = CHECK_IN_PROFILE_COLUMNS[key as CheckInProfileField];
    const trimmed = typeof value === "string" ? value.trim() : "";
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
