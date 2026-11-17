import {
  findConfiguredMealPlanForPreset,
  findMatchingPredefinedMealPlan,
  mealPlanPresetDetailLine,
  PREDEFINED_MEAL_PLANS,
  type PredefinedMealPlan,
} from "@/packages/pms/lib/rates-meal-plan-catalogue";
import type { RatesCard2Snapshot } from "@/packages/pms/lib/rates-card2.server";
import { RATE_PLAN_NONE } from "./rate-plan-wizard-types";
import type { WizardPolicyOption } from "./rate-plan-wizard-policy-options";

const PREDEF_MEAL = "predef:meal:";

export function predefMealValue(code: string) {
  return `${PREDEF_MEAL}${code}`;
}

export function isPredefinedMealSelection(value: string): boolean {
  return value.startsWith(PREDEF_MEAL);
}

export function parsePredefMeal(selection: string): PredefinedMealPlan | null {
  if (!selection.startsWith(PREDEF_MEAL)) return null;
  const code = selection.slice(PREDEF_MEAL.length);
  return PREDEFINED_MEAL_PLANS.find((p) => p.code === code) ?? null;
}

export function buildMealPlanWizardOptions(
  configured: RatesCard2Snapshot["mealPlans"],
  selectedId: string,
): WizardPolicyOption[] {
  const noru: WizardPolicyOption[] = PREDEFINED_MEAL_PLANS.map((preset) => {
    if (!preset.materialize) {
      return {
        value: RATE_PLAN_NONE,
        name: preset.name,
        detail: mealPlanPresetDetailLine(preset),
        group: "noru" as const,
      };
    }
    const existing = findConfiguredMealPlanForPreset(preset, configured);
    return {
      value: existing?.id ?? predefMealValue(preset.code),
      name: preset.name,
      detail: mealPlanPresetDetailLine(preset),
      group: "noru" as const,
    };
  });

  const custom = configured
    .filter((row) => {
      if (findMatchingPredefinedMealPlan(row.name, row.code)) return false;
      return row.active || row.id === selectedId;
    })
    .map((row) => {
      const meals: string[] = [];
      if (row.includesBreakfast) meals.push("Breakfast");
      return {
        value: row.id,
        name: row.name,
        detail: meals.length > 0 ? `${meals.join(", ")} included.` : undefined,
        group: "custom" as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return [...noru, ...custom];
}

/** Coerce a stored predefined key to the property meal-plan id when already materialised. */
export function resolveMealPlanSelectionValue(
  selection: string,
  configured: RatesCard2Snapshot["mealPlans"],
): string {
  if (!selection || selection === RATE_PLAN_NONE) return RATE_PLAN_NONE;
  const preset = parsePredefMeal(selection);
  if (!preset) return selection;
  if (!preset.materialize) return RATE_PLAN_NONE;
  const existing = findConfiguredMealPlanForPreset(preset, configured);
  return existing?.id ?? selection;
}

export { findConfiguredMealPlanForPreset };
