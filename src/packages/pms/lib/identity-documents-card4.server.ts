/**
 * Card 4 Phase 3 — Identity Document Types validation.
 *
 * This module describes document TYPE configuration only. It never stores
 * guest document numbers, images, OCR output, or verification data.
 */

export type IdentityDocumentTypeRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  issuingCountryRequired: boolean;
  expiryDateRequired: boolean;
  documentNumberRequired: boolean;
  scanImageAllowed: boolean;
  requiredAtCheckIn: boolean;
  active: boolean;
  validForProfileTypeIds: string[];
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type IdentityDocumentTypeDraft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  issuingCountryRequired: boolean;
  expiryDateRequired: boolean;
  documentNumberRequired: boolean;
  scanImageAllowed: boolean;
  requiredAtCheckIn: boolean;
  active: boolean;
  validForProfileTypeIds: string[];
  displayOrder: number;
};

export type IdentityDocumentProfileTypeOption = {
  id: string;
  name: string;
  active: boolean;
};

export type IdentityDocumentTypeSnapshot = {
  documentTypes: IdentityDocumentTypeRecord[];
  profileTypes: IdentityDocumentProfileTypeOption[];
  lastUpdatedAt: string | null;
};

export type IdentityDocumentTypeError = { field: string; message: string };

export const DEFAULT_IDENTITY_DOCUMENT_TYPES = [
  {
    name: "Passport",
    code: "PAS",
    description: "International passport issued by a government.",
    issuingCountryRequired: true,
    expiryDateRequired: true,
    documentNumberRequired: true,
    scanImageAllowed: true,
    requiredAtCheckIn: true,
  },
  {
    name: "National ID",
    code: "NID",
    description: "National identity document issued by a government.",
    issuingCountryRequired: true,
    expiryDateRequired: false,
    documentNumberRequired: true,
    scanImageAllowed: true,
    requiredAtCheckIn: false,
  },
  {
    name: "Driving License",
    code: "DL",
    description: "Government-issued driving licence.",
    issuingCountryRequired: true,
    expiryDateRequired: true,
    documentNumberRequired: true,
    scanImageAllowed: true,
    requiredAtCheckIn: false,
  },
  {
    name: "Other ID",
    code: "OID",
    description: "Another accepted form of identification.",
    issuingCountryRequired: false,
    expiryDateRequired: false,
    documentNumberRequired: true,
    scanImageAllowed: true,
    requiredAtCheckIn: false,
  },
] as const;

export function normalizeIdentityDocumentName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeIdentityDocumentCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

export function codeFromIdentityDocumentName(name: string): string {
  return normalizeIdentityDocumentCode(name).slice(0, 12);
}

export function emptyIdentityDocumentTypeDraft(displayOrder = 1): IdentityDocumentTypeDraft {
  return {
    id: null,
    name: "",
    code: "",
    description: "",
    issuingCountryRequired: false,
    expiryDateRequired: false,
    documentNumberRequired: true,
    scanImageAllowed: false,
    requiredAtCheckIn: false,
    active: true,
    validForProfileTypeIds: [],
    displayOrder,
  };
}

export function identityDocumentFlagsForActiveChange(
  active: boolean,
  requiredAtCheckIn: boolean,
): { active: boolean; requiredAtCheckIn: boolean } {
  return { active, requiredAtCheckIn: active ? requiredAtCheckIn : false };
}

export function identityDocumentTypesConfigured(rows: IdentityDocumentTypeRecord[]): boolean {
  return rows.some(
    (row) =>
      row.active &&
      row.name.trim().length > 0 &&
      row.code.trim().length > 0 &&
      row.validForProfileTypeIds.length > 0 &&
      Number.isInteger(row.displayOrder) &&
      row.displayOrder > 0,
  );
}

export function validateIdentityDocumentTypeDraft(
  draft: IdentityDocumentTypeDraft,
  existing: Array<{ id: string; name: string; code: string; displayOrder: number }>,
  profileTypes: IdentityDocumentProfileTypeOption[],
): IdentityDocumentTypeError[] {
  const errors: IdentityDocumentTypeError[] = [];
  const name = normalizeIdentityDocumentName(draft.name);
  const code = normalizeIdentityDocumentCode(draft.code);

  if (!name) errors.push({ field: "name", message: "Document type name is required." });
  if (name.length > 80)
    errors.push({ field: "name", message: "Document type name must be 80 characters or fewer." });
  if (!code) errors.push({ field: "code", message: "Document type code is required." });
  if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(code)) {
    errors.push({
      field: "code",
      message: "Use 1–20 uppercase letters, numbers, or underscores, starting with a letter.",
    });
  }
  if (draft.description.length > 400)
    errors.push({ field: "description", message: "Description must be 400 characters or fewer." });

  const others = existing.filter((row) => row.id !== draft.id);
  if (
    others.some(
      (row) => normalizeIdentityDocumentName(row.name).toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.push({ field: "name", message: "A document type with this name already exists." });
  }
  if (others.some((row) => normalizeIdentityDocumentCode(row.code) === code)) {
    errors.push({ field: "code", message: "A document type with this code already exists." });
  }
  if (!Number.isInteger(draft.displayOrder) || draft.displayOrder < 1) {
    errors.push({
      field: "displayOrder",
      message: "Display order must be a positive whole number.",
    });
  } else if (others.some((row) => row.displayOrder === draft.displayOrder)) {
    errors.push({ field: "displayOrder", message: "Display order must be unique." });
  }
  if (!draft.active && draft.requiredAtCheckIn) {
    errors.push({
      field: "requiredAtCheckIn",
      message: "An inactive document type cannot be required at check-in.",
    });
  }

  const knownProfileIds = new Set(profileTypes.map((row) => row.id));
  if (draft.validForProfileTypeIds.length === 0) {
    errors.push({ field: "validForProfileTypeIds", message: "Select at least one guest type." });
  } else if (draft.validForProfileTypeIds.some((id) => !knownProfileIds.has(id))) {
    errors.push({
      field: "validForProfileTypeIds",
      message: "One or more selected guest types no longer exist.",
    });
  }
  return errors;
}
