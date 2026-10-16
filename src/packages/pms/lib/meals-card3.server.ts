/**
 * Card 3 Phase 4 — Meal Plans & Packages (pure helpers).
 * SET3 owns the meal/package masters; Card 3 adds typed setup fields and links.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";
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

// Phase B: CARD3_MEALS_TABS reflects the Package Master editor structure.
// "Package Components" and "Package rate plan types" are no longer primary tabs.
// They will be nested inside the Package Master editor in Phase E / Phase F.
export const CARD3_MEALS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "meal-plans", label: "Meal Plans" },
  // Phase B: one unified Packages entry replaces the old three-section layout
  { id: "packages", label: "Packages" },
  // Phase E placeholder — will become nested includes inside the Package editor
  { id: "package-components", label: "Package Components" },
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
  coverImagePath: string | null;
  coverUrl: string | null;
};

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
};

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

  if (!snapshot.mealPlans.some((row) => row.active)) {
    blockers.push("Save at least one active meal plan.");
  }

  const completePackage = snapshot.packages.find(
    (row) =>
      row.active &&
      row.packagePrice > 0 &&
      (row.roomTypeIds.length > 0 || row.ratePlanIds.length > 0) &&
      snapshot.components.some(
        (component) =>
          component.packageId === row.id && isValidPackageComponent(component, snapshot),
      ),
  );
  if (!completePackage) {
    blockers.push(
      "Save an active priced package with room or rate applicability and at least one valid component.",
    );
  }

  if (!hasRows) return { ready: false, status: "not_started", blockers };
  if (blockers.length === 0) return { ready: true, status: "complete", blockers };
  return { ready: false, status: "in_progress", blockers };
}
