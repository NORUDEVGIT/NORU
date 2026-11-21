/**
 * New Reservation presentation: rate inclusions, add-ons, and guest requests.
 * Display and selection filtering only. Does not price a stay or write rate plans.
 */
import type { GuestServiceTypeOption } from "@/packages/pms/lib/guests.functions";
import { ratePlanPackageMerchandising } from "@/packages/pms/lib/create-reservation-phase1-section5";
import type { RatePlanPackageLink } from "@/packages/pms/lib/rate-plan-package-inclusion";
import type { AvailablePackageCard } from "@/packages/pms/lib/reservation-detail-packages";

export type CatalogueSourceRef = {
  id: string;
  code: string;
  name: string;
};

const MAINTENANCE_CATEGORY_CODES = new Set(["MNT"]);
const MAINTENANCE_SERVICE_CODES = new Set(["MNT_PLUMB", "MNT_ELEC", "MNT_HVAC"]);
const MAINTENANCE_NAMES = new Set(["plumbing", "electrical", "hvac", "maintenance"]);
const BREAKFAST_SERVICE_CODES = new Set(["DIN_BKFST", "BREAKFAST"]);

function compactKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/_-]+/g, "");
}

/** Walk-in commercial source from the property catalogue. Null when none is configured. */
export function resolveWalkInBookingSource(
  sources: readonly CatalogueSourceRef[],
): string | null {
  const match = sources.find((row) => {
    const code = compactKey(row.code);
    const name = compactKey(row.name);
    return code === "walkin" || code === "walk_in" || name === "walkin" || name === "walk-in";
  });
  return match?.id ?? null;
}

export function rateIncludesBreakfast(input: {
  breakfastIncluded?: boolean;
  breakfastLabel?: string | null;
  mealPlanName?: string | null;
} | null | undefined): boolean {
  if (!input) return false;
  if (input.breakfastIncluded) return true;
  const label = input.breakfastLabel?.trim().toLowerCase() ?? "";
  if (label === "included" || label.includes("breakfast")) return true;
  const meal = input.mealPlanName?.trim().toLowerCase() ?? "";
  if (!meal || meal === "room only" || meal.includes("without breakfast")) return false;
  return meal.includes("breakfast");
}

export function rateInclusionSummary(input: {
  breakfastIncluded?: boolean;
  breakfastLabel?: string | null;
  mealPlanName?: string | null;
  mealPlanId?: string | null;
  packages?: RatePlanPackageLink[];
}): { included: string[]; optional: string[] } {
  const included: string[] = [];
  const seen = new Set<string>();
  const push = (bucket: string[], line: string) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    bucket.push(line.trim());
  };
  if (rateIncludesBreakfast(input)) push(included, "Breakfast included");
  else {
    const meal = input.mealPlanName?.trim() ?? "";
    if (meal && !/^room only$/i.test(meal)) push(included, meal);
  }
  const merch = ratePlanPackageMerchandising({
    id: "",
    code: "",
    name: "",
    description: null,
    mealPlanId: input.mealPlanId ?? null,
    packages: input.packages ?? [],
  });
  for (const row of merch.includedServices) {
    const name = row.packageName.trim();
    if (name) push(included, `${name} included`);
  }
  const optional: string[] = [];
  for (const row of merch.optionalAddOns) {
    const name = row.packageName.trim();
    if (name) push(optional, `${name} available as optional add-on`);
  }
  return { included, optional };
}

export function rateInclusionSummaryLines(input: Parameters<typeof rateInclusionSummary>[0]): string[] {
  const summary = rateInclusionSummary(input);
  return [...summary.included, ...summary.optional];
}

function duplicatesSelectedMeal(card: AvailablePackageCard, mealPlanId: string | null): boolean {
  if (!mealPlanId) return false;
  const meals = card.componentMealPlanIds ?? [];
  if (meals.length === 0 || card.hasNonMealComponent) return false;
  if ((card.serviceTypeIds?.length ?? 0) > 0) return false;
  return meals.every((id) => id === mealPlanId);
}

/** Included vs optional add-ons for the selected rate. Meal-only duplicates stay on the rate. */
export function reservationAddOnPresentation(
  cards: readonly AvailablePackageCard[],
  mealPlanId: string | null,
): { included: AvailablePackageCard[]; optional: AvailablePackageCard[] } {
  const included: AvailablePackageCard[] = [];
  const optional: AvailablePackageCard[] = [];
  for (const card of cards) {
    if (duplicatesSelectedMeal(card, mealPlanId)) continue;
    if (card.inclusionType === "included") included.push(card);
    else optional.push(card);
  }
  return { included, optional };
}

/** Guest service types already represented by an included or optional package on this rate. */
export function coveredGuestServiceTypeIds(
  cards: readonly AvailablePackageCard[],
  mealPlanId: string | null,
): Set<string> {
  const ids = new Set<string>();
  const { included, optional } = reservationAddOnPresentation(cards, mealPlanId);
  for (const card of [...included, ...optional]) {
    for (const id of card.serviceTypeIds ?? []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function isMaintenanceGuestService(row: {
  code?: string | null;
  name?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
}): boolean {
  const category = (row.categoryCode ?? "").trim().toUpperCase();
  const code = (row.code ?? "").trim().toUpperCase();
  if (MAINTENANCE_CATEGORY_CODES.has(category) || category === "MAINTENANCE") return true;
  if (MAINTENANCE_SERVICE_CODES.has(code) || code.startsWith("MNT_")) return true;
  const categoryName = (row.categoryName ?? "").trim().toLowerCase();
  if (categoryName === "maintenance") return true;
  const name = (row.name ?? "").trim().toLowerCase();
  return MAINTENANCE_NAMES.has(name);
}

export function isBreakfastGuestService(row: {
  code?: string | null;
  name?: string | null;
}): boolean {
  const code = (row.code ?? "").trim().toUpperCase();
  if (BREAKFAST_SERVICE_CODES.has(code)) return true;
  return (row.name ?? "").trim().toLowerCase() === "breakfast";
}

export function filterReservationGuestRequests(
  types: readonly GuestServiceTypeOption[],
  input: {
    coveredServiceTypeIds: ReadonlySet<string>;
    breakfastIncluded: boolean;
  },
): GuestServiceTypeOption[] {
  return types.filter((row) => {
    if (!row.active) return false;
    if (isMaintenanceGuestService(row)) return false;
    if (input.coveredServiceTypeIds.has(row.id)) return false;
    if (input.breakfastIncluded && isBreakfastGuestService(row)) return false;
    return true;
  });
}

export function preferenceChipText(row: { label: string; value: string }): string {
  const label = row.label.trim();
  const value = row.value.trim();
  if (!value || value.toLowerCase() === label.toLowerCase()) return label || value;
  if (/^[0-9a-f-]{36}$/i.test(value)) return label || value;
  if (/^(yes|true|preferred)$/i.test(value)) return label || value;
  return value;
}
