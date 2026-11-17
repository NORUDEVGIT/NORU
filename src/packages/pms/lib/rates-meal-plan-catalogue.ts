/**
 * NORU PMS — Predefined Meal Plan Catalogue
 *
 * Application-level catalogue for Rate Plan selection.
 * Persistable plans are stored in pms_meal_plans only when selected/materialised.
 * Room Only remains a UI default that maps to no meal-plan link (null) on the Rate Plan.
 */

import type { MealPlanType, TaxPosture } from "./pms-set3-rates-guest";

export type PredefinedMealPlan = {
  code: string;
  name: string;
  summary: string;
  description: string;
  legacyCodes?: readonly string[];
  type: MealPlanType;
  includesBreakfast: boolean;
  includesLunch: boolean;
  includesDinner: boolean;
  taxPosture: TaxPosture;
  /** When false, Rate Plan stores mealPlanId = null (Room Only). */
  materialize: boolean;
};

export const PREDEFINED_MEAL_PLANS: readonly PredefinedMealPlan[] = [
  {
    code: "ROOM_ONLY",
    name: "Room Only",
    summary: "Accommodation only.",
    description: "Accommodation only — no meals included with the rate.",
    type: "room_only",
    includesBreakfast: false,
    includesLunch: false,
    includesDinner: false,
    taxPosture: "inherit",
    materialize: false,
  },
  {
    code: "BED_BREAKFAST",
    name: "Bed & Breakfast",
    summary: "Breakfast included.",
    description: "Room with breakfast included. Lunch and dinner are not included.",
    legacyCodes: ["BB", "B_AND_B"],
    type: "breakfast",
    includesBreakfast: true,
    includesLunch: false,
    includesDinner: false,
    taxPosture: "inherit",
    materialize: true,
  },
  {
    code: "HALF_BOARD",
    name: "Half Board",
    summary: "Breakfast and dinner included.",
    description: "Room with breakfast and dinner included. Lunch is not included.",
    legacyCodes: ["HB"],
    type: "half_board",
    includesBreakfast: true,
    includesLunch: false,
    includesDinner: true,
    taxPosture: "inherit",
    materialize: true,
  },
  {
    code: "FULL_BOARD",
    name: "Full Board",
    summary: "Breakfast, lunch and dinner included.",
    description: "Room with breakfast, lunch and dinner included.",
    legacyCodes: ["FB"],
    type: "full_board",
    includesBreakfast: true,
    includesLunch: true,
    includesDinner: true,
    taxPosture: "inherit",
    materialize: true,
  },
] as const;

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function mealPlanPresetDetailLine(preset: PredefinedMealPlan): string {
  return preset.summary.trim() || preset.description;
}

export function findConfiguredMealPlanForPreset<T extends { id?: string; code: string; name: string }>(
  preset: PredefinedMealPlan,
  configured: readonly T[],
): T | undefined {
  const presetCode = preset.code.toUpperCase().trim();
  const legacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const presetNorm = normalizeKey(preset.name);
  const presetNameLower = preset.name.toLowerCase().trim();

  return configured.find((row) => {
    const rowCode = (row.code ?? "").toUpperCase().trim();
    if (rowCode === presetCode || legacy.includes(rowCode)) return true;
    const rowNameLower = (row.name ?? "").toLowerCase().trim();
    if (rowNameLower === presetNameLower) return true;
    return Boolean(presetNorm && normalizeKey(row.name ?? "") === presetNorm);
  });
}

export function findMatchingPredefinedMealPlan(
  name: string,
  code?: string,
): PredefinedMealPlan | undefined {
  const normName = normalizeKey(name);
  const lowerName = name.toLowerCase().trim();
  const upperCode = code ? code.toUpperCase().trim() : "";

  return PREDEFINED_MEAL_PLANS.find((preset) => {
    if (upperCode) {
      if (preset.code.toUpperCase() === upperCode) return true;
      if (preset.legacyCodes?.some((lc) => lc.toUpperCase() === upperCode)) return true;
    }
    if (lowerName && preset.name.toLowerCase().trim() === lowerName) return true;
    return Boolean(normName && normalizeKey(preset.name) === normName);
  });
}
