/**
 * Card 4 Phase 2 — Required Fields types and validation.
 *
 * Pure module. Property Setup catalogue only. Does not replace SET3
 * guestRules.requiredFields or operational guest create / check-in forms.
 */

export const GUEST_FIELD_TYPES = [
  "text",
  "phone",
  "email",
  "number",
  "date",
  "select",
  "multi_select",
  "document",
  "address",
  "lookup",
] as const;
export type GuestFieldType = (typeof GUEST_FIELD_TYPES)[number];

export const GUEST_FIELD_TYPE_LABELS: Record<GuestFieldType, string> = {
  text: "Text",
  phone: "Phone",
  email: "Email",
  number: "Number",
  date: "Date",
  select: "Select",
  multi_select: "Multi-select",
  document: "Document",
  address: "Address",
  lookup: "Lookup",
};

export const GUEST_FIELD_LOOKUP_SOURCES = ["company", "travel_agent", "group"] as const;
export type GuestFieldLookupSource = (typeof GUEST_FIELD_LOOKUP_SOURCES)[number];

export const GUEST_FIELD_LOOKUP_LABELS: Record<GuestFieldLookupSource, string> = {
  company: "Company",
  travel_agent: "Travel Agent",
  group: "Group",
};

export type GuestFieldOption = {
  id: string;
  label: string;
  value: string;
  active: boolean;
  displayOrder: number;
};

export type GuestFieldRecord = {
  id: string;
  name: string;
  code: string;
  fieldType: GuestFieldType;
  description: string | null;
  options: GuestFieldOption[];
  required: boolean;
  checkIn: boolean;
  reservation: boolean;
  active: boolean;
  displayOrder: number;
  lookupSource: GuestFieldLookupSource | null;
  documentTypeIds: string[];
  minValue: number | null;
  maxValue: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GuestFieldDraft = {
  id: string | null;
  name: string;
  code: string;
  fieldType: GuestFieldType;
  description: string;
  options: GuestFieldOption[];
  required: boolean;
  checkIn: boolean;
  reservation: boolean;
  active: boolean;
  lookupSource: GuestFieldLookupSource | null;
  documentTypeIds: string[];
  minValue: number | null;
  maxValue: number | null;
};

export type NamedOption = { id: string; name: string };

export type GuestFieldSnapshot = {
  fields: GuestFieldRecord[];
  documentTypes: NamedOption[];
  lastUpdatedAt: string | null;
};

export type GuestFieldError = { field: string; message: string };

export const DEFAULT_GUEST_FIELDS: Array<{
  name: string;
  code: string;
  fieldType: GuestFieldType;
  required: boolean;
  checkIn: boolean;
  reservation: boolean;
  lookupSource: GuestFieldLookupSource | null;
  options: Array<{ label: string; value: string }>;
}> = [
  {
    name: "First Name",
    code: "FIRST_NAME",
    fieldType: "text",
    required: true,
    checkIn: true,
    reservation: true,
    lookupSource: null,
    options: [],
  },
  {
    name: "Last Name",
    code: "LAST_NAME",
    fieldType: "text",
    required: true,
    checkIn: true,
    reservation: true,
    lookupSource: null,
    options: [],
  },
  {
    name: "Phone",
    code: "PHONE",
    fieldType: "phone",
    required: true,
    checkIn: true,
    reservation: true,
    lookupSource: null,
    options: [],
  },
  {
    name: "Email",
    code: "EMAIL",
    fieldType: "email",
    required: false,
    checkIn: true,
    reservation: true,
    lookupSource: null,
    options: [],
  },
  {
    name: "Nationality",
    code: "NATIONALITY",
    fieldType: "select",
    required: true,
    checkIn: true,
    reservation: true,
    lookupSource: null,
    options: [
      { label: "Ethiopia", value: "ET" },
      { label: "Kenya", value: "KE" },
      { label: "United States", value: "US" },
      { label: "United Kingdom", value: "GB" },
    ],
  },
  {
    name: "Date of Birth",
    code: "DATE_OF_BIRTH",
    fieldType: "date",
    required: false,
    checkIn: false,
    reservation: true,
    lookupSource: null,
    options: [],
  },
  {
    name: "ID / Passport",
    code: "IDENTITY_DOCUMENT",
    fieldType: "document",
    required: true,
    checkIn: true,
    reservation: false,
    lookupSource: null,
    options: [],
  },
  {
    name: "Address",
    code: "ADDRESS",
    fieldType: "address",
    required: false,
    checkIn: false,
    reservation: true,
    lookupSource: null,
    options: [],
  },
  {
    name: "Company",
    code: "COMPANY",
    fieldType: "lookup",
    required: false,
    checkIn: true,
    reservation: true,
    lookupSource: "company",
    options: [],
  },
];

export function normalizeGuestFieldName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeGuestFieldCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

export function codeFromGuestFieldName(name: string): string {
  return normalizeGuestFieldCode(name)
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_");
}

export function isGuestFieldType(value: string): value is GuestFieldType {
  return (GUEST_FIELD_TYPES as readonly string[]).includes(value);
}

export function isLookupSource(value: string | null): value is GuestFieldLookupSource {
  return value !== null && (GUEST_FIELD_LOOKUP_SOURCES as readonly string[]).includes(value);
}

export function emptyGuestFieldDraft(): GuestFieldDraft {
  return {
    id: null,
    name: "",
    code: "",
    fieldType: "text",
    description: "",
    options: [],
    required: false,
    checkIn: true,
    reservation: true,
    active: true,
    lookupSource: null,
    documentTypeIds: [],
    minValue: null,
    maxValue: null,
  };
}

export function emptyFieldOption(order: number): GuestFieldOption {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `opt-${order}-${Date.now()}`;
  return { id, label: "", value: "", active: true, displayOrder: order };
}

export function normalizeGuestFieldOptions(value: unknown): GuestFieldOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((row, index) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const label = String(item.label ?? "").trim();
    const rawValue = String(item.value ?? label).trim();
    return {
      id: typeof item.id === "string" && item.id ? item.id : `opt-${index}`,
      label,
      value: rawValue || label,
      active: item.active !== false,
      displayOrder: typeof item.displayOrder === "number" ? item.displayOrder : index,
    };
  });
}

export function guestFieldsConfigured(fields: readonly GuestFieldRecord[]): boolean {
  return (
    fields.length >= DEFAULT_GUEST_FIELDS.length && fields.every((row) => row.name && row.code)
  );
}

export function validateGuestFieldDraft(
  draft: GuestFieldDraft,
  existing: readonly { id: string; name: string; code: string }[],
): GuestFieldError[] {
  const errors: GuestFieldError[] = [];
  const name = normalizeGuestFieldName(draft.name);
  const code = normalizeGuestFieldCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Field name is required." });
  else if (name.length > 80) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  else if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) {
    errors.push({
      field: "code",
      message: "Use 2–32 letters, numbers or underscores, starting with a letter.",
    });
  }
  if (!isGuestFieldType(draft.fieldType)) {
    errors.push({ field: "fieldType", message: "Choose a field type from the catalogue." });
  }
  const clash = existing.find((row) => {
    if (draft.id && row.id === draft.id) return false;
    return (
      normalizeGuestFieldName(row.name).toLowerCase() === name.toLowerCase() ||
      normalizeGuestFieldCode(row.code) === code
    );
  });
  if (clash && normalizeGuestFieldName(clash.name).toLowerCase() === name.toLowerCase()) {
    errors.push({ field: "name", message: "A field with this name already exists." });
  }
  if (clash && normalizeGuestFieldCode(clash.code) === code) {
    errors.push({ field: "code", message: "A field with this code already exists." });
  }
  if (!draft.active && draft.required) {
    errors.push({ field: "required", message: "An inactive field cannot be required." });
  }
  if (draft.fieldType === "select" || draft.fieldType === "multi_select") {
    const live = draft.options.filter((row) => row.label.trim() && row.value.trim());
    if (live.length === 0) {
      errors.push({ field: "options", message: "Add at least one option." });
    }
  }
  if (draft.fieldType === "lookup" && !isLookupSource(draft.lookupSource)) {
    errors.push({ field: "lookupSource", message: "Choose a lookup source." });
  }
  if (draft.fieldType === "number") {
    if (draft.minValue != null && draft.maxValue != null && draft.minValue > draft.maxValue) {
      errors.push({ field: "minValue", message: "Minimum cannot be greater than maximum." });
    }
  }
  return errors;
}

export function flagsForActiveChange(
  active: boolean,
  required: boolean,
): { active: boolean; required: boolean } {
  return { active, required: active ? required : false };
}
