/**
 * Rate plan ↔ package inclusion merchandising.
 * Maps pms_package_rate_plans.inclusion_type. Does not price or persist selections.
 */

export const PACKAGE_INCLUSION_TYPES = ["included", "optional"] as const;
export type PackageInclusionType = (typeof PACKAGE_INCLUSION_TYPES)[number];

export const PACKAGE_INCLUSION_TYPE_LABELS: Record<PackageInclusionType, string> = {
  included: "Included in rate",
  optional: "Optional add-on",
};

export type RatePlanPackageComponent = {
  kind: string;
  label: string;
  mealPlanId: string | null;
};

export type RatePlanPackageLink = {
  packageId: string;
  packageName: string;
  inclusionType: PackageInclusionType;
  components: RatePlanPackageComponent[];
};

export function parsePackageInclusionType(value: unknown): PackageInclusionType {
  return value === "included" ? "included" : "optional";
}

export function packageDuplicatesDirectMealPlan(
  link: RatePlanPackageLink,
  mealPlanId: string | null,
): boolean {
  if (!mealPlanId) return false;
  const other = link.components.filter(
    (row) => !(row.kind === "meal_plan" && row.mealPlanId === mealPlanId),
  );
  return other.length === 0 && link.components.some((row) => row.mealPlanId === mealPlanId);
}

export function partitionRatePlanPackages(input: {
  links: RatePlanPackageLink[];
  mealPlanId: string | null;
}): {
  includedServices: RatePlanPackageLink[];
  optionalAddOns: RatePlanPackageLink[];
} {
  const includedServices: RatePlanPackageLink[] = [];
  const optionalAddOns: RatePlanPackageLink[] = [];
  for (const link of input.links) {
    const inclusionType = parsePackageInclusionType(link.inclusionType);
    if (inclusionType === "optional") {
      optionalAddOns.push({ ...link, inclusionType: "optional" });
      continue;
    }
    if (packageDuplicatesDirectMealPlan(link, input.mealPlanId)) continue;
    includedServices.push({
      ...link,
      inclusionType: "included",
      components: input.mealPlanId
        ? link.components.filter(
            (row) => !(row.kind === "meal_plan" && row.mealPlanId === input.mealPlanId),
          )
        : link.components,
    });
  }
  return { includedServices, optionalAddOns };
}
