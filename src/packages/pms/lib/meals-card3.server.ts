/**
 * Card 3 Phase 4 — Meal Plans & Packages (pure helpers).
 * SET3 owns the meal/package masters; Card 3 adds typed setup fields and links.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";
import {
  EXPLICIT_DEFAULT_MEAL_POLICY,
  SERVICE_DATE_RULES,
  type ServiceDateRule,
} from "./service-entitlement.ts";
import {
  PACKAGE_INCLUSION_TYPE_LABELS,
  PACKAGE_INCLUSION_TYPES,
  type PackageInclusionType,
} from "./rate-plan-package-inclusion.ts";
import {
  MEAL_PLAN_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
  TAX_POSTURE_LABELS,
  type MealPlanType,
  type PackageType,
  type TaxPosture,
} from "./pms-set3-rates-guest.ts";

// CARD3_MEALS_TABS reflects the Package Master surface.
// Package components are edited inside Package Master → Includes.
// Room/rate applicability is no longer package-owned in the active editor.
export const CARD3_MEALS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "meal-plans", label: "Meal Plans" },
  { id: "package-components", label: "Package Components" },
  { id: "packages", label: "Packages" },
] as const;
export type Card3MealsTabId = (typeof CARD3_MEALS_TABS)[number]["id"];

export const CARD3_MEALS_AUDIT_SECTION = "card3-meals";
export const CARD3_MEALS_UNAVAILABLE =
  "Meal Plans & Packages are unavailable until their approved migration is applied.";

export const PACKAGE_COMPONENT_KINDS = ["meal_plan", "room_amenity", "fo_service"] as const;
export type PackageComponentKind = (typeof PACKAGE_COMPONENT_KINDS)[number];

export const PACKAGE_COMPONENT_KIND_LABELS: Record<PackageComponentKind, string> = {
  meal_plan: "Meal plan",
  room_amenity: "Room amenity",
  fo_service: "Front-office service",
};

export { MEAL_PLAN_TYPE_LABELS, PACKAGE_TYPE_LABELS, TAX_POSTURE_LABELS };
export type { MealPlanType, PackageType, TaxPosture };
export { PACKAGE_INCLUSION_TYPE_LABELS, PACKAGE_INCLUSION_TYPES, type PackageInclusionType };

export type MealsCard3AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type MealPlanCard3Row = {
  id: string;
  code: string;
  name: string;
  type: MealPlanType;
  typeLabel: string;
  description: string;
  includesBreakfast: boolean;
  includesLunch: boolean;
  includesDinner: boolean;
  taxPosture: TaxPosture;
  taxPostureLabel: string;
  active: boolean;
};

export type PackageCard3RatePlanLink = {
  ratePlanId: string;
  inclusionType: PackageInclusionType;
};

export type PackageCard3Row = {
  id: string;
  code: string;
  name: string;
  type: PackageType;
  typeLabel: string;
  description: string;
  packagePrice: number;
  chargeBasis: PackageChargeBasis;
  active: boolean;
  roomTypeIds: string[];
  ratePlanIds: string[];
  ratePlanLinks: PackageCard3RatePlanLink[];
  /**
   * Guest Service Type IDs bundled with this package.
   * Persisted on existing `pms_packages.inclusion` JSON (string[]) — no separate link table.
   */
  serviceTypeIds: string[];
  coverImagePath: string | null;
  coverUrl: string | null;
};

/** Guest Service Type refs for Package Master → Benefits & Services. */
export type Card3GuestServiceTypeRef = {
  id: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  displayOrder: number;
};

export type Card3GuestServiceCategoryRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  displayOrder: number;
};

/** Temporary UI filter: Maintenance is operational, not a package benefit. */
export const PACKAGE_EXCLUDED_SERVICE_CATEGORY_CODES = ["MNT"] as const;

export function isPackageEligibleServiceCategoryCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return !(PACKAGE_EXCLUDED_SERVICE_CATEGORY_CODES as readonly string[]).includes(normalized);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read Guest Service Type IDs from legacy `pms_packages.inclusion` JSON. */
export function serviceTypeIdsFromPackageInclusion(inclusion: unknown): string[] {
  if (!Array.isArray(inclusion)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of inclusion) {
    if (typeof row !== "string") continue;
    const id = row.trim();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export const PACKAGE_CHARGE_BASES = [
  "per_stay",
  "per_night",
  "per_person",
  "per_room",
  "per_unit",
] as const;

export type PackageChargeBasis = (typeof PACKAGE_CHARGE_BASES)[number];

export const PACKAGE_CHARGE_BASIS_LABELS: Record<PackageChargeBasis, string> = {
  per_stay: "Per stay",
  per_night: "Per night",
  per_person: "Per person",
  per_room: "Per room",
  per_unit: "Per unit",
};

export const PACKAGE_CHARGE_BASIS_DEFAULT: PackageChargeBasis = "per_stay";

export function parsePackageChargeBasis(value: unknown): PackageChargeBasis {
  return (PACKAGE_CHARGE_BASES as readonly string[]).includes(String(value))
    ? (value as PackageChargeBasis)
    : PACKAGE_CHARGE_BASIS_DEFAULT;
}

export const PACKAGE_COVER_MAX_BYTES = 8 * 1024 * 1024;
export const PACKAGE_COVER_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function packageCoverPathPrefix(restaurantId: string, packageId: string): string {
  return `${restaurantId}/packages/${packageId}/`;
}

export function packageCoverImagePath(restaurantId: string, packageId: string, ext: string): string {
  return `${packageCoverPathPrefix(restaurantId, packageId)}${crypto.randomUUID()}.${ext}`;
}

export function isOwnedPackageCoverPath(
  restaurantId: string,
  packageId: string,
  storagePath: string,
): boolean {
  return storagePath.startsWith(packageCoverPathPrefix(restaurantId, packageId));
}

/** Previous object to delete after a successful replace. Identical paths are kept. */
export function previousPackageCoverToRemove(
  currentPath: string | null | undefined,
  nextPath: string,
): string | null {
  const current = (currentPath ?? "").trim();
  if (!current || current === nextPath) return null;
  return current;
}

export type PackageComponentCard3Row = {
  id: string;
  packageId: string;
  kind: PackageComponentKind;
  kindLabel: string;
  mealPlanId: string | null;
  roomAmenityId: string | null;
  foServiceId: string | null;
  sourceLabel: string;
  quantity: number;
  sortOrder: number;
  requiresFulfillment: boolean;
  departmentId: string | null;
  serviceDateRule: ServiceDateRule | null;
};

export type Card3DepartmentRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type MealServiceRuleCard3 = {
  includeArrival: boolean;
  includeStay: boolean;
  includeDeparture: boolean;
  departmentId: string | null;
};

/**
 * @deprecated Property meal service schedule / kitchen rules.
 * Retired from Meal Plans & Packages commercial UI; retained for entitlement loaders.
 */
export type MealApplicabilityCard3 = {
  breakfast: MealServiceRuleCard3;
  lunch: MealServiceRuleCard3;
  dinner: MealServiceRuleCard3;
  countInfants: boolean;
};

export const DEFAULT_MEAL_APPLICABILITY_CARD3: MealApplicabilityCard3 = {
  breakfast: { ...EXPLICIT_DEFAULT_MEAL_POLICY.breakfast, departmentId: null },
  lunch: { ...EXPLICIT_DEFAULT_MEAL_POLICY.lunch, departmentId: null },
  dinner: { ...EXPLICIT_DEFAULT_MEAL_POLICY.dinner, departmentId: null },
  countInfants: EXPLICIT_DEFAULT_MEAL_POLICY.countInfants,
};

export const SERVICE_TIMING_LABELS: Record<ServiceDateRule, string> = {
  ON_ARRIVAL: "On Arrival",
  ON_DEPARTURE: "On Departure",
  EACH_STAY_DATE: "Every Stay Date",
  ONCE_PER_STAY: "Once Per Stay",
};

export function isServiceDateRule(value: unknown): value is ServiceDateRule {
  return (SERVICE_DATE_RULES as readonly string[]).includes(String(value));
}

export function mealApplicabilityFromRow(
  row: Record<string, unknown> | null,
): MealApplicabilityCard3 {
  if (!row) return DEFAULT_MEAL_APPLICABILITY_CARD3;
  const rule = (
    arrival: string,
    stay: string,
    departure: string,
    department: string,
  ): MealServiceRuleCard3 => ({
    includeArrival: row[arrival] === true,
    includeStay: row[stay] === true,
    includeDeparture: row[departure] === true,
    departmentId: typeof row[department] === "string" ? row[department] : null,
  });
  return {
    breakfast: rule(
      "breakfast_include_arrival",
      "breakfast_include_stay",
      "breakfast_include_departure",
      "breakfast_department_id",
    ),
    lunch: rule(
      "lunch_include_arrival",
      "lunch_include_stay",
      "lunch_include_departure",
      "lunch_department_id",
    ),
    dinner: rule(
      "dinner_include_arrival",
      "dinner_include_stay",
      "dinner_include_departure",
      "dinner_department_id",
    ),
    countInfants: row.count_infants === true,
  };
}

export function validatePackageFulfillment(input: {
  kind: PackageComponentKind;
  requiresFulfillment: boolean;
  departmentId: string | null;
  serviceDateRule: ServiceDateRule | null;
}): string | null {
  if (!input.requiresFulfillment) return null;
  if (!input.departmentId) return "Choose a responsible department.";
  if (input.kind !== "meal_plan" && !input.serviceDateRule) {
    return "Choose when this service is delivered.";
  }
  return null;
}

export type Card3RoomTypeRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Card3RoomAmenityRef = {
  id: string;
  code: string;
  name: string;
  category: string;
  active: boolean;
};

export type Card3RatePlanRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Card3FoServiceRef = {
  id: string;
  name: string;
  defaultAmount: number;
  sortOrder: number;
  active: boolean;
};

export type MealsCard3Snapshot = {
  currencyCode: string;
  mealPlans: MealPlanCard3Row[];
  packages: PackageCard3Row[];
  components: PackageComponentCard3Row[];
  roomTypes: Card3RoomTypeRef[];
  roomAmenities: Card3RoomAmenityRef[];
  ratePlans: Card3RatePlanRef[];
  foServices: Card3FoServiceRef[];
  departments: Card3DepartmentRef[];
  guestServiceCategories: Card3GuestServiceCategoryRef[];
  guestServiceTypes: Card3GuestServiceTypeRef[];
  mealPolicy: MealApplicabilityCard3;
};

export type MealsCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function isValidPackageComponent(
  component: PackageComponentCard3Row,
  snapshot: MealsCard3Snapshot,
): boolean {
  if (!(component.quantity > 0)) return false;
  const populated = [component.mealPlanId, component.roomAmenityId, component.foServiceId].filter(
    (value) => value !== null,
  );
  if (populated.length !== 1) return false;
  if (component.kind === "meal_plan") {
    return (
      component.mealPlanId !== null &&
      component.roomAmenityId === null &&
      component.foServiceId === null &&
      snapshot.mealPlans.some((row) => row.id === component.mealPlanId)
    );
  }
  if (component.kind === "room_amenity") {
    return (
      component.roomAmenityId !== null &&
      component.mealPlanId === null &&
      component.foServiceId === null &&
      snapshot.roomAmenities.some((row) => row.id === component.roomAmenityId)
    );
  }
  return (
    component.foServiceId !== null &&
    component.mealPlanId === null &&
    component.roomAmenityId === null &&
    snapshot.foServices.some((row) => row.id === component.foServiceId)
  );
}

export function evaluateMealsCard3Readiness(snapshot: MealsCard3Snapshot): MealsCard3Readiness {
  const blockers: string[] = [];
  const hasRows =
    snapshot.mealPlans.length > 0 || snapshot.packages.length > 0 || snapshot.components.length > 0;

  // Meal Plans & Packages are optional commercial catalogues:
  // Room Only is valid; a Rate Plan may have no Package.
  // Visiting the retired standalone Meal Plans & Packages page is not required.
  if (!hasRows) return { ready: true, status: "not_started", blockers };
  return { ready: true, status: "complete", blockers };
}
