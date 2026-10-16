/**
 * Card 4 — Group Types catalogue helpers.
 *
 * Property Setup only. Operational group masters stay on guest_account_masters.
 * Values persist on pms_group_types.
 */

export type GroupTypeRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type GroupTypeDraft = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

export type GroupTypeFieldError = { field: string; message: string };

export const DEFAULT_GROUP_TYPES = [
  {
    name: "Corporate",
    code: "CORP",
    description: "Corporate and business groups.",
    sortOrder: 10,
  },
  {
    name: "Tour",
    code: "TOUR",
    description: "Tour series and leisure groups.",
    sortOrder: 20,
  },
  {
    name: "Wedding",
    code: "WEDD",
    description: "Wedding parties and related stays.",
    sortOrder: 30,
  },
  {
    name: "Conference",
    code: "CONF",
    description: "Conferences, meetings and events.",
    sortOrder: 40,
  },
  {
    name: "Crew",
    code: "CREW",
    description: "Airline, ship or production crew.",
    sortOrder: 50,
  },
  {
    name: "Government",
    code: "GOVT",
    description: "Government and official delegations.",
    sortOrder: 60,
  },
  {
    name: "Other",
    code: "OTHR",
    description: "Other group business.",
    sortOrder: 70,
  },
] as const;

export function normalizeGroupTypeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeGroupTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function emptyGroupTypeDraft(): GroupTypeDraft {
  return {
    id: null,
    code: "",
    name: "",
    description: "",
    active: true,
    sortOrder: 0,
  };
}

export function validateGroupTypeDraft(
  draft: GroupTypeDraft,
  existing: readonly { id: string; name: string; code: string }[],
): GroupTypeFieldError[] {
  const errors: GroupTypeFieldError[] = [];
  const name = normalizeGroupTypeName(draft.name);
  const code = normalizeGroupTypeCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Group type name is required." });
  else if (name.length > 120) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  else if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code)) {
    errors.push({ field: "code", message: "Use 2–12 letters or numbers, starting with a letter." });
  }
  const clash = existing.find((row) => {
    if (draft.id && row.id === draft.id) return false;
    return (
      normalizeGroupTypeName(row.name).toLowerCase() === name.toLowerCase() ||
      normalizeGroupTypeCode(row.code) === code
    );
  });
  if (clash && normalizeGroupTypeName(clash.name).toLowerCase() === name.toLowerCase()) {
    errors.push({ field: "name", message: "A group type with this name already exists." });
  }
  if (clash && normalizeGroupTypeCode(clash.code) === code) {
    errors.push({ field: "code", message: "A group type with this code already exists." });
  }
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0 || draft.sortOrder > 999) {
    errors.push({ field: "sortOrder", message: "Sort order must be between 0 and 999." });
  }
  return errors;
}

export function groupTypesConfigured(types: readonly { name: string; code: string }[]): boolean {
  return (
    types.length > 0 &&
    types.every((row) => row.name.trim().length > 0 && row.code.trim().length > 0)
  );
}
