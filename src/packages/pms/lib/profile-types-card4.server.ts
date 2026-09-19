/**
 * Card 4 Phase 1 — Profile Types types and validation.
 *
 * Pure module. This catalogue is Property Setup only. It does not replace
 * GUEST_PROFILE_TYPES on the operational Guest Profile workspace.
 */

export const PROFILE_TYPE_ICONS = [
  "user",
  "users",
  "building",
  "briefcase",
  "plane",
  "landmark",
  "contact",
  "hotel",
] as const;
export type ProfileTypeIcon = (typeof PROFILE_TYPE_ICONS)[number];

export const PROFILE_TYPE_REQUIRED_FIELDS = [
  { id: "firstName", label: "First Name" },
  { id: "lastName", label: "Last Name" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "nationality", label: "Nationality" },
  { id: "dateOfBirth", label: "Date of Birth" },
  { id: "identityDocument", label: "ID / Passport" },
  { id: "address", label: "Address" },
  { id: "company", label: "Company" },
] as const;

import { PREFERENCE_OPTION_CATEGORIES } from "./guest-profile-wave2.ts";

const PREFERENCE_TYPE_LABELS: Record<(typeof PREFERENCE_OPTION_CATEGORIES)[number], string> = {
  bed: "Bed Type",
  view: "View",
  food: "Dietary Requirement",
  communication: "Preferred Channel",
};

export const PROFILE_TYPE_PREFERENCE_TYPES = PREFERENCE_OPTION_CATEGORIES.map((id) => ({
  id,
  label: PREFERENCE_TYPE_LABELS[id],
}));

export const PROFILE_TYPE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "am", label: "Amharic" },
  { id: "fr", label: "French" },
  { id: "ar", label: "Arabic" },
] as const;

export const PROFILE_TYPE_CURRENCIES = [
  { id: "ETB", label: "ETB" },
  { id: "USD", label: "USD" },
  { id: "EUR", label: "EUR" },
  { id: "GBP", label: "GBP" },
] as const;

export const PROFILE_TYPE_COMMUNICATION = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "sms", label: "SMS" },
  { id: "in_app", label: "In-app" },
] as const;

export const DEFAULT_PROFILE_TYPES = [
  {
    name: "Individual Guest",
    code: "IND",
    description: "Single guest or individual traveler.",
    icon: "user" as const,
  },
  {
    name: "Company",
    code: "COM",
    description: "Corporate account or company booking.",
    icon: "building" as const,
  },
  {
    name: "Travel Agency",
    code: "TRA",
    description: "Travel agency booking on behalf of guests.",
    icon: "briefcase" as const,
  },
  {
    name: "Tour Operator",
    code: "TOU",
    description: "Tour operator or package organiser.",
    icon: "plane" as const,
  },
  {
    name: "Organization",
    code: "ORG",
    description: "Organisation, embassy or institution.",
    icon: "landmark" as const,
  },
  {
    name: "Contact Person",
    code: "CON",
    description: "Contact person linked to another profile.",
    icon: "contact" as const,
  },
] as const;

export type ProfileTypeDefaults = {
  countryId: string | null;
  languageId: string | null;
  currencyId: string | null;
  communicationChannelId: string | null;
  guestTypeId: string | null;
};

export const EMPTY_PROFILE_TYPE_DEFAULTS: ProfileTypeDefaults = {
  countryId: null,
  languageId: null,
  currencyId: null,
  communicationChannelId: null,
  guestTypeId: null,
};

export type ProfileTypeRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  icon: ProfileTypeIcon;
  active: boolean;
  requiredFieldIds: string[];
  documentTypeIds: string[];
  preferenceTypeIds: string[];
  defaults: ProfileTypeDefaults;
  createdAt: string;
  updatedAt: string;
};

export type NamedOption = { id: string; name: string };

export type ProfileTypeSnapshot = {
  types: ProfileTypeRecord[];
  documentTypes: NamedOption[];
  lastUpdatedAt: string | null;
};

export type ProfileTypeDraft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  icon: ProfileTypeIcon;
  active: boolean;
  requiredFieldIds: string[];
  documentTypeIds: string[];
  preferenceTypeIds: string[];
  defaults: ProfileTypeDefaults;
};

export type ProfileTypeFieldError = { field: string; message: string };

export function normalizeProfileTypeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeProfileTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isProfileTypeIcon(value: string): value is ProfileTypeIcon {
  return (PROFILE_TYPE_ICONS as readonly string[]).includes(value);
}

export function emptyProfileTypeDraft(): ProfileTypeDraft {
  return {
    id: null,
    name: "",
    code: "",
    description: "",
    icon: "user",
    active: true,
    requiredFieldIds: [],
    documentTypeIds: [],
    preferenceTypeIds: [],
    defaults: { ...EMPTY_PROFILE_TYPE_DEFAULTS },
  };
}

export function validateProfileTypeDraft(
  draft: ProfileTypeDraft,
  existing: readonly { id: string; name: string; code: string }[],
): ProfileTypeFieldError[] {
  const errors: ProfileTypeFieldError[] = [];
  const name = normalizeProfileTypeName(draft.name);
  const code = normalizeProfileTypeCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Profile type name is required." });
  else if (name.length > 80) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  else if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code)) {
    errors.push({ field: "code", message: "Use 2–12 letters or numbers, starting with a letter." });
  }
  const clash = existing.find((row) => {
    if (draft.id && row.id === draft.id) return false;
    return (
      normalizeProfileTypeName(row.name).toLowerCase() === name.toLowerCase() ||
      normalizeProfileTypeCode(row.code) === code
    );
  });
  if (clash && normalizeProfileTypeName(clash.name).toLowerCase() === name.toLowerCase()) {
    errors.push({ field: "name", message: "A profile type with this name already exists." });
  }
  if (clash && normalizeProfileTypeCode(clash.code) === code) {
    errors.push({ field: "code", message: "A profile type with this code already exists." });
  }
  if (!isProfileTypeIcon(draft.icon)) {
    errors.push({ field: "icon", message: "Choose an icon from the catalogue." });
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (draft.requiredFieldIds.some((id) => !uuid.test(id))) {
    errors.push({
      field: "requiredFieldIds",
      message: "A required field is not in the catalogue.",
    });
  }
  const knownPrefs = new Set(PROFILE_TYPE_PREFERENCE_TYPES.map((row) => row.id));
  if (draft.preferenceTypeIds.some((id) => !knownPrefs.has(id))) {
    errors.push({
      field: "preferenceTypeIds",
      message: "A preference type is not in the catalogue.",
    });
  }
  return errors;
}

export function profileTypeConfigured(types: readonly ProfileTypeRecord[]): boolean {
  return (
    types.length > 0 &&
    types.every((row) => row.name.trim().length > 0 && row.code.trim().length > 0)
  );
}

export function normalizeProfileTypeDefaults(value: unknown): ProfileTypeDefaults {
  if (!value || typeof value !== "object") return { ...EMPTY_PROFILE_TYPE_DEFAULTS };
  const input = value as Partial<ProfileTypeDefaults>;
  const asId = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
  return {
    countryId: asId(input.countryId),
    languageId: asId(input.languageId),
    currencyId: asId(input.currencyId),
    communicationChannelId: asId(input.communicationChannelId),
    guestTypeId: asId(input.guestTypeId),
  };
}
