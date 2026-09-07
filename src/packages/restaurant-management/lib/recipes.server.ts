/**
 * Recipes (menu item -> inventory ingredient mapping) — shared/server helpers.
 *
 * Phase 5E is configuration only: nothing here touches balances or the stock
 * ledger. Quantities are normalised to the ingredient's base unit so a later
 * phase can consume them directly.
 */

export const RECIPE_MANAGE_ROLES = ["owner", "manager"] as const;
export const RECIPE_VIEW_ROLES = ["owner", "manager", "kitchen"] as const;

export function canManageRecipes(role: string): boolean {
  return (RECIPE_MANAGE_ROLES as readonly string[]).includes(role);
}

export function canViewRecipes(role: string): boolean {
  return (RECIPE_VIEW_ROLES as readonly string[]).includes(role);
}

/**
 * Deliberately small conversion table. Weight and volume convert inside their
 * own family only; count/package units never convert into anything (1 box is
 * not N pieces), so a count ingredient must be measured in its own base unit.
 */
const WEIGHT_TO_KG: Record<string, number> = { kg: 1, g: 0.001, mg: 0.000001 };
const VOLUME_TO_L: Record<string, number> = { L: 1, l: 1, ml: 0.001 };

export type UnitFamily = "weight" | "volume" | "count";

export function unitFamily(code: string): UnitFamily {
  if (code in WEIGHT_TO_KG) return "weight";
  if (code in VOLUME_TO_L) return "volume";
  return "count";
}

/** Unit codes a recipe may use for an ingredient whose base unit is `baseCode`. */
export function compatibleUnitCodes(baseCode: string): string[] {
  const family = unitFamily(baseCode);
  if (family === "weight") return Object.keys(WEIGHT_TO_KG);
  if (family === "volume") return ["L", "ml"];
  return [baseCode];
}

export function areUnitsCompatible(fromCode: string, baseCode: string): boolean {
  return compatibleUnitCodes(baseCode).includes(fromCode);
}

/**
 * Convert a user-entered quantity into the ingredient's base unit.
 * Throws on incompatible pairs (kg -> L, box -> kg, box -> piece).
 */
export function convertToBase(quantity: number, fromCode: string, baseCode: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Enter a quantity greater than zero.");
  }
  if (fromCode === baseCode) return round4(quantity);
  const family = unitFamily(baseCode);
  if (family === "weight" && unitFamily(fromCode) === "weight") {
    const factor = (WEIGHT_TO_KG[fromCode] as number) / (WEIGHT_TO_KG[baseCode] as number);
    return round4(quantity * factor);
  }
  if (family === "volume" && unitFamily(fromCode) === "volume") {
    const factor = (VOLUME_TO_L[fromCode] as number) / (VOLUME_TO_L[baseCode] as number);
    return round4(quantity * factor);
  }
  throw new Error(`${fromCode} cannot be converted to ${baseCode}. Choose a compatible unit.`);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export type RecipeStatus = "no_recipe" | "incomplete" | "ready";

export interface RecipeComponentCost {
  quantityBase: number;
  unitCost: number | null;
}

/** Cost roll-up. A single missing unit cost makes the whole valuation incomplete. */
export function summariseRecipe(components: RecipeComponentCost[]): {
  status: RecipeStatus;
  costComplete: boolean;
  recipeCost: number | null;
} {
  if (components.length === 0) return { status: "no_recipe", costComplete: false, recipeCost: null };
  const missing = components.some((c) => c.unitCost === null || !Number.isFinite(c.unitCost));
  if (missing) return { status: "incomplete", costComplete: false, recipeCost: null };
  const total = components.reduce((sum, c) => sum + c.quantityBase * (c.unitCost as number), 0);
  return { status: "ready", costComplete: true, recipeCost: Math.round(total * 100) / 100 };
}

/** Operational estimates only — no labour, tax, rent, utilities or fees. */
export function marginEstimates(recipeCost: number | null, sellingPrice: number) {
  if (recipeCost === null || !(sellingPrice > 0)) {
    return { grossContribution: null, foodCostPercent: null };
  }
  return {
    grossContribution: Math.round((sellingPrice - recipeCost) * 100) / 100,
    foodCostPercent: Math.round((recipeCost / sellingPrice) * 1000) / 10,
  };
}
