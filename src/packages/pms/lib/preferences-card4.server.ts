/**
 * Card 4 Phase 4 — Preference categories and types.
 *
 * Property Setup catalogue only. Does not replace Wave 2 pms_preference_options
 * or store values on guest_preferences.
 */

export const PREFERENCE_VALUE_TYPES = ["single", "multi", "yes_no", "text", "number"] as const;
export type PreferenceValueType = (typeof PREFERENCE_VALUE_TYPES)[number];

export const PREFERENCE_VALUE_TYPE_LABELS: Record<PreferenceValueType, string> = {
  single: "Select (Single Choice)",
  multi: "Multiple Choice",
  yes_no: "Yes / No",
  text: "Text",
  number: "Number",
};

export type PreferenceOption = {
  id: string;
  label: string;
  value: string;
  active: boolean;
  displayOrder: number;
};

export type PreferenceCategoryRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PreferenceTypeRecord = {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  valueType: PreferenceValueType;
  options: PreferenceOption[];
  required: boolean;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PreferenceCategoryDraft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  active: boolean;
  displayOrder: number;
};

export type PreferenceTypeDraft = {
  id: string | null;
  categoryId: string;
  name: string;
  code: string;
  valueType: PreferenceValueType;
  options: PreferenceOption[];
  required: boolean;
  active: boolean;
  displayOrder: number;
};

export type PreferenceSnapshot = {
  categories: PreferenceCategoryRecord[];
  types: PreferenceTypeRecord[];
  lastUpdatedAt: string | null;
};

export type PreferenceError = { field: string; message: string };

export const DEFAULT_PREFERENCE_CATEGORIES = [
  {
    name: "Room Preferences",
    code: "ROOM",
    description: "Room, bed and floor choices.",
  },
  {
    name: "Communication",
    code: "COMM",
    description: "How guests prefer to be contacted.",
  },
  {
    name: "Service",
    code: "SVC",
    description: "In-stay service requests.",
  },
  {
    name: "Dietary",
    code: "DIET",
    description: "Food and dietary restrictions.",
  },
] as const;

export const DEFAULT_PREFERENCE_TYPES: Array<{
  categoryCode: string;
  name: string;
  code: string;
  valueType: PreferenceValueType;
  required: boolean;
  options: Array<{ label: string; value: string }>;
}> = [
  {
    categoryCode: "ROOM",
    name: "Floor",
    code: "FLOOR",
    valueType: "single",
    required: false,
    options: [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
      { label: "5", value: "5" },
      { label: "6+", value: "6+" },
    ],
  },
  {
    categoryCode: "ROOM",
    name: "Bed Type",
    code: "BED_TYPE",
    valueType: "single",
    required: true,
    options: [
      { label: "King", value: "king" },
      { label: "Queen", value: "queen" },
      { label: "Twin", value: "twin" },
      { label: "Double", value: "double" },
    ],
  },
  {
    categoryCode: "ROOM",
    name: "Quiet Room",
    code: "QUIET",
    valueType: "single",
    required: false,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    categoryCode: "ROOM",
    name: "Connecting Room",
    code: "CONNECT",
    valueType: "single",
    required: false,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    categoryCode: "COMM",
    name: "Language",
    code: "LANG",
    valueType: "single",
    required: false,
    options: [
      { label: "English", value: "en" },
      { label: "Amharic", value: "am" },
      { label: "French", value: "fr" },
      { label: "Arabic", value: "ar" },
    ],
  },
  {
    categoryCode: "SVC",
    name: "Wake-up Call",
    code: "WAKE",
    valueType: "single",
    required: false,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    categoryCode: "DIET",
    name: "Dietary Restrictions",
    code: "DIET_REST",
    valueType: "multi",
    required: false,
    options: [
      { label: "Vegetarian", value: "vegetarian" },
      { label: "Vegan", value: "vegan" },
      { label: "No Nuts", value: "no_nuts" },
      { label: "Gluten Free", value: "gluten_free" },
    ],
  },
];

export function normalizePreferenceName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePreferenceCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

export function codeFromPreferenceName(name: string): string {
  return normalizePreferenceCode(name).slice(0, 32);
}

export function isPreferenceValueType(value: string): value is PreferenceValueType {
  return (PREFERENCE_VALUE_TYPES as readonly string[]).includes(value);
}

export function emptyPreferenceOption(order: number): PreferenceOption {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `opt-${order}-${Date.now()}`;
  return { id, label: "", value: "", active: true, displayOrder: order };
}

export function normalizePreferenceOptions(value: unknown): PreferenceOption[] {
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

export function emptyPreferenceCategoryDraft(displayOrder = 1): PreferenceCategoryDraft {
  return {
    id: null,
    name: "",
    code: "",
    description: "",
    active: true,
    displayOrder,
  };
}

export function emptyPreferenceTypeDraft(
  categoryId: string,
  displayOrder = 1,
): PreferenceTypeDraft {
  return {
    id: null,
    categoryId,
    name: "",
    code: "",
    valueType: "single",
    options: [],
    required: false,
    active: true,
    displayOrder,
  };
}

export function preferenceFlagsForActiveChange(
  active: boolean,
  required: boolean,
): { active: boolean; required: boolean } {
  return { active, required: active ? required : false };
}

export function preferencesConfigured(
  categories: PreferenceCategoryRecord[],
  types: PreferenceTypeRecord[],
): boolean {
  const activeCategories = categories.filter((row) => row.active);
  if (activeCategories.length === 0) return false;
  return activeCategories.every((category) =>
    types.some((row) => {
      if (row.categoryId !== category.id || !row.active) return false;
      if (row.valueType === "yes_no" || row.valueType === "text" || row.valueType === "number") {
        return true;
      }
      return row.options.some((option) => option.label.trim() && option.value.trim());
    }),
  );
}

export function validatePreferenceCategoryDraft(
  draft: PreferenceCategoryDraft,
  existing: Array<{ id: string; name: string; code: string }>,
): PreferenceError[] {
  const errors: PreferenceError[] = [];
  const name = normalizePreferenceName(draft.name);
  const code = normalizePreferenceCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Category name is required." });
  if (name.length > 80) errors.push({ field: "name", message: "Category name is too long." });
  if (!code) errors.push({ field: "code", message: "Category code is required." });
  if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) {
    errors.push({
      field: "code",
      message: "Use 2–20 uppercase letters, numbers, or underscores, starting with a letter.",
    });
  }
  if (draft.description.length > 400) {
    errors.push({ field: "description", message: "Description must be 400 characters or fewer." });
  }
  if (!Number.isInteger(draft.displayOrder) || draft.displayOrder < 1) {
    errors.push({
      field: "displayOrder",
      message: "Display order must be a positive whole number.",
    });
  }
  const others = existing.filter((row) => row.id !== draft.id);
  if (
    others.some((row) => normalizePreferenceName(row.name).toLowerCase() === name.toLowerCase())
  ) {
    errors.push({ field: "name", message: "A category with this name already exists." });
  }
  if (others.some((row) => normalizePreferenceCode(row.code) === code)) {
    errors.push({ field: "code", message: "A category with this code already exists." });
  }
  return errors;
}

export function validatePreferenceTypeDraft(
  draft: PreferenceTypeDraft,
  existing: Array<{ id: string; name: string; code: string; categoryId: string }>,
  categoryIds: string[],
): PreferenceError[] {
  const errors: PreferenceError[] = [];
  const name = normalizePreferenceName(draft.name);
  const code = normalizePreferenceCode(draft.code);
  if (!draft.categoryId || !categoryIds.includes(draft.categoryId)) {
    errors.push({ field: "categoryId", message: "A preference type must belong to a category." });
  }
  if (!name) errors.push({ field: "name", message: "Preference type name is required." });
  if (name.length > 80) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) {
    errors.push({
      field: "code",
      message: "Use 2–32 uppercase letters, numbers, or underscores, starting with a letter.",
    });
  }
  if (!isPreferenceValueType(draft.valueType)) {
    errors.push({ field: "valueType", message: "Choose a valid value type." });
  }
  if (!Number.isInteger(draft.displayOrder) || draft.displayOrder < 1) {
    errors.push({
      field: "displayOrder",
      message: "Display order must be a positive whole number.",
    });
  }
  const others = existing.filter((row) => row.id !== draft.id);
  if (
    others.some(
      (row) =>
        row.categoryId === draft.categoryId &&
        normalizePreferenceName(row.name).toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.push({
      field: "name",
      message: "A preference type with this name already exists in the category.",
    });
  }
  if (others.some((row) => normalizePreferenceCode(row.code) === code)) {
    errors.push({ field: "code", message: "A preference type with this code already exists." });
  }
  if (!draft.active && draft.required) {
    errors.push({ field: "required", message: "An inactive preference cannot be required." });
  }
  const needsOptions = draft.valueType === "single" || draft.valueType === "multi";
  const live = draft.options.filter((row) => row.label.trim() && row.value.trim());
  if (needsOptions && live.length === 0) {
    errors.push({ field: "options", message: "Add at least one option." });
  }
  const labels = new Set<string>();
  const values = new Set<string>();
  for (const option of live) {
    const labelKey = option.label.trim().toLowerCase();
    const valueKey = option.value.trim().toLowerCase();
    if (labels.has(labelKey) || values.has(valueKey)) {
      errors.push({ field: "options", message: "Option labels and values must be unique." });
      break;
    }
    labels.add(labelKey);
    values.add(valueKey);
  }
  return errors;
}
