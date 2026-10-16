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
    name: "Room Type",
    code: "ROOM_TYPE",
    valueType: "single",
    required: false,
    options: [
      { label: "Standard Room", value: "standard" },
      { label: "Deluxe Room", value: "deluxe" },
      { label: "Superior Room", value: "superior" },
      { label: "Suite", value: "suite" },
      { label: "Executive Suite", value: "executive_suite" },
      { label: "Presidential Suite", value: "presidential_suite" },
    ],
  },
  {
    categoryCode: "ROOM",
    name: "Rate Plan",
    code: "RATE_PLAN",
    valueType: "single",
    required: false,
    options: [
      { label: "Standard Rate (BAR)", value: "standard_rate" },
      { label: "Non-Refundable Rate", value: "non_refundable" },
      { label: "Flexible Rate", value: "flexible_rate" },
      { label: "Corporate Rate", value: "corporate_rate" },
      { label: "Promotional Package", value: "promotional_package" },
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
    name: "Meal Plan",
    code: "MEAL_PLAN",
    valueType: "single",
    required: false,
    options: [
      { label: "Room Only (EP)", value: "room_only" },
      { label: "Bed & Breakfast (CP)", value: "bed_and_breakfast" },
      { label: "Half Board (MAP)", value: "half_board" },
      { label: "Full Board (AP)", value: "full_board" },
      { label: "All Inclusive (AI)", value: "all_inclusive" },
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

export function enrichPreferenceTypesWithOptions(
  types: PreferenceTypeRecord[],
  roomTypes?: Array<{ id: string; name: string; code?: string | null; active?: boolean | null }> | null,
  mealPlans?: Array<{ id: string; name: string; code?: string | null; active?: boolean | null }> | null,
  ratePlans?: Array<{ id: string; name: string; code?: string | null; active?: boolean | null }> | null,
): PreferenceTypeRecord[] {
  if (!roomTypes?.length && !mealPlans?.length && !ratePlans?.length) return types;
  return types.map((type) => {
    if (type.code === "ROOM_TYPE" && roomTypes && roomTypes.length > 0) {
      const existingValues = new Set(type.options.map((o) => o.value.toLowerCase()));
      const existingLabels = new Set(type.options.map((o) => o.label.toLowerCase()));
      const newOptions = [...type.options];
      let order = newOptions.length;
      for (const rt of roomTypes) {
        if (rt.active === false) continue;
        if (!existingValues.has(rt.id.toLowerCase()) && !existingLabels.has(rt.name.toLowerCase())) {
          newOptions.push({
            id: rt.id,
            label: rt.name,
            value: rt.id,
            active: true,
            displayOrder: order++,
          });
          existingValues.add(rt.id.toLowerCase());
          existingLabels.add(rt.name.toLowerCase());
        }
      }
      return { ...type, options: newOptions };
    }
    if (type.code === "RATE_PLAN" && ratePlans && ratePlans.length > 0) {
      const existingValues = new Set(type.options.map((o) => o.value.toLowerCase()));
      const existingLabels = new Set(type.options.map((o) => o.label.toLowerCase()));
      const newOptions = [...type.options];
      let order = newOptions.length;
      for (const rp of ratePlans) {
        if (rp.active === false) continue;
        if (!existingValues.has(rp.id.toLowerCase()) && !existingLabels.has(rp.name.toLowerCase())) {
          newOptions.push({
            id: rp.id,
            label: rp.name,
            value: rp.id,
            active: true,
            displayOrder: order++,
          });
          existingValues.add(rp.id.toLowerCase());
          existingLabels.add(rp.name.toLowerCase());
        }
      }
      return { ...type, options: newOptions };
    }
    if (type.code === "MEAL_PLAN" && mealPlans && mealPlans.length > 0) {
      const existingValues = new Set(type.options.map((o) => o.value.toLowerCase()));
      const existingLabels = new Set(type.options.map((o) => o.label.toLowerCase()));
      const newOptions = [...type.options];
      let order = newOptions.length;
      for (const mp of mealPlans) {
        if (mp.active === false) continue;
        if (!existingValues.has(mp.id.toLowerCase()) && !existingLabels.has(mp.name.toLowerCase())) {
          newOptions.push({
            id: mp.id,
            label: mp.name,
            value: mp.id,
            active: true,
            displayOrder: order++,
          });
          existingValues.add(mp.id.toLowerCase());
          existingLabels.add(mp.name.toLowerCase());
        }
      }
      return { ...type, options: newOptions };
    }
    return type;
  });
}

export function resolveEffectivePreferences(
  categories: PreferenceCategoryRecord[],
  types: PreferenceTypeRecord[],
  roomTypes?: Array<{ id: string; name: string; code?: string | null; active?: boolean | null }> | null,
  mealPlans?: Array<{ id: string; name: string; code?: string | null; active?: boolean | null }> | null,
  ratePlans?: Array<{ id: string; name: string; code?: string | null; active?: boolean | null }> | null,
): { categories: PreferenceCategoryRecord[]; types: PreferenceTypeRecord[] } {
  let resolvedCategories = [...categories];
  if (resolvedCategories.length === 0) {
    resolvedCategories = DEFAULT_PREFERENCE_CATEGORIES.map((c, idx) => ({
      id: `default-cat-${c.code.toLowerCase()}`,
      name: c.name,
      code: c.code,
      description: c.description ?? null,
      active: true,
      displayOrder: idx + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  const catByCode = new Map(resolvedCategories.map((c) => [c.code, c.id]));
  const roomCatId = catByCode.get("ROOM") || resolvedCategories[0]?.id || "default-cat-room";
  const dietCatId = catByCode.get("DIET") || resolvedCategories[0]?.id || "default-cat-diet";

  // Filter out QUIET and CONNECT from types
  let resolvedTypes = types.filter((t) => t.code !== "QUIET" && t.code !== "CONNECT");

  if (resolvedTypes.length === 0) {
    const orderByCat = new Map<string, number>();
    resolvedTypes = DEFAULT_PREFERENCE_TYPES.filter(
      (def) => def.code !== "QUIET" && def.code !== "CONNECT",
    ).map((def) => {
      const catId = catByCode.get(def.categoryCode) || resolvedCategories[0]?.id || "default-cat";
      const displayOrder = (orderByCat.get(def.categoryCode) ?? 0) + 1;
      orderByCat.set(def.categoryCode, displayOrder);
      return {
        id: `default-type-${def.code.toLowerCase()}`,
        categoryId: catId,
        name: def.name,
        code: def.code,
        valueType: def.valueType,
        options: def.options.map((opt, i) => ({
          id: `opt-${def.code.toLowerCase()}-${i}`,
          label: opt.label,
          value: opt.value,
          active: true,
          displayOrder: i,
        })),
        required: def.required,
        active: true,
        displayOrder,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  } else {
    const existingCodes = new Set(resolvedTypes.map((t) => t.code));
    if (!existingCodes.has("ROOM_TYPE")) {
      const roomDef = DEFAULT_PREFERENCE_TYPES.find((d) => d.code === "ROOM_TYPE");
      if (roomDef) {
        resolvedTypes.push({
          id: "default-type-room_type",
          categoryId: roomCatId,
          name: roomDef.name,
          code: roomDef.code,
          valueType: roomDef.valueType,
          options: roomDef.options.map((opt, i) => ({
            id: `opt-room_type-${i}`,
            label: opt.label,
            value: opt.value,
            active: true,
            displayOrder: i,
          })),
          required: false,
          active: true,
          displayOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (!existingCodes.has("RATE_PLAN")) {
      const rateDef = DEFAULT_PREFERENCE_TYPES.find((d) => d.code === "RATE_PLAN");
      if (rateDef) {
        resolvedTypes.push({
          id: "default-type-rate_plan",
          categoryId: roomCatId,
          name: rateDef.name,
          code: rateDef.code,
          valueType: rateDef.valueType,
          options: rateDef.options.map((opt, i) => ({
            id: `opt-rate_plan-${i}`,
            label: opt.label,
            value: opt.value,
            active: true,
            displayOrder: 2,
          })),
          required: false,
          active: true,
          displayOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (!existingCodes.has("MEAL_PLAN")) {
      const mealDef = DEFAULT_PREFERENCE_TYPES.find((d) => d.code === "MEAL_PLAN");
      if (mealDef) {
        resolvedTypes.push({
          id: "default-type-meal_plan",
          categoryId: dietCatId,
          name: mealDef.name,
          code: mealDef.code,
          valueType: mealDef.valueType,
          options: mealDef.options.map((opt, i) => ({
            id: `opt-meal_plan-${i}`,
            label: opt.label,
            value: opt.value,
            active: true,
            displayOrder: 1,
          })),
          required: false,
          active: true,
          displayOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  const enrichedTypes = enrichPreferenceTypesWithOptions(
    resolvedTypes,
    roomTypes,
    mealPlans,
    ratePlans,
  );

  return {
    categories: resolvedCategories,
    types: enrichedTypes,
  };
}
