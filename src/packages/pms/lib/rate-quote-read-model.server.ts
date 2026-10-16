/**
 * Step 2 quote merchandising. Joins existing meal/package/restriction masters.
 * Does not add meal_plan / min_stay columns onto hotel_rate_plans.
 */

export type QuoteMerchandising = {
  breakfastLabel: string;
  includedServicesLabel: string;
  restrictionSummary: string | null;
  cancellationLabel: string;
  refundabilityLabel: string;
  refundabilityKind: string | null;
};

export const EMPTY_QUOTE_MERCHANDISING: QuoteMerchandising = {
  breakfastLabel: "—",
  includedServicesLabel: "—",
  restrictionSummary: null,
  cancellationLabel: "—",
  refundabilityLabel: "—",
  refundabilityKind: null,
};

export type RestrictionDisplayRow = {
  date: string;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export type LinkedMealPlan = {
  name: string;
  includesBreakfast: boolean;
};

export type LinkedInclusion = {
  packageName: string;
  kind: "meal_plan" | "room_amenity" | "fo_service";
  label: string;
};

export function summarizeBreakfast(meals: LinkedMealPlan[]): string {
  if (meals.length === 0) return "—";
  if (meals.some((meal) => meal.includesBreakfast)) return "Included";
  return "Not included";
}

export function summarizeIncludedServices(items: LinkedInclusion[]): string {
  if (items.length === 0) return "—";
  const labels = [...new Set(items.map((item) => item.label).filter(Boolean))];
  return labels.length > 0 ? labels.join(" · ") : "—";
}

export function summarizeStayRestrictions(
  rows: RestrictionDisplayRow[],
  arrival: string,
  departure: string,
): string | null {
  if (rows.length === 0) return null;
  const parts: string[] = [];
  const arrivalRow = rows.find((row) => row.date === arrival);
  const departureRow = rows.find((row) => row.date === departure);
  const minStay = rows.reduce<number | null>((current, row) => {
    if (row.minStay == null) return current;
    return current == null ? row.minStay : Math.max(current, row.minStay);
  }, null);
  const maxStay = rows.reduce<number | null>((current, row) => {
    if (row.maxStay == null) return current;
    return current == null ? row.maxStay : Math.min(current, row.maxStay);
  }, null);
  if (minStay != null) parts.push(`Min stay ${minStay}`);
  if (maxStay != null) parts.push(`Max stay ${maxStay}`);
  if (arrivalRow?.closedToArrival) parts.push("Closed to arrival");
  if (departureRow?.closedToDeparture) parts.push("Closed to departure");
  const stopDates = rows.filter((row) => row.stopSell).map((row) => row.date);
  if (stopDates.length > 0) parts.push(`Stop sell ${stopDates.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type DbClient = any;

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("does not exist"));
}

export async function loadQuoteMerchandising(
  db: DbClient,
  restaurantId: string,
  planIds: string[],
  arrival: string,
  departure: string,
  policies?: Map<
    string,
    { cancellationLabel: string; refundabilityLabel: string; refundabilityKind: string | null }
  >,
): Promise<Map<string, QuoteMerchandising>> {
  const out = new Map<string, QuoteMerchandising>();
  for (const id of planIds) {
    const policy = policies?.get(id);
    out.set(id, {
      ...EMPTY_QUOTE_MERCHANDISING,
      cancellationLabel: policy?.cancellationLabel ?? "—",
      refundabilityLabel: policy?.refundabilityLabel ?? "—",
      refundabilityKind: policy?.refundabilityKind ?? null,
    });
  }
  if (planIds.length === 0) return out;

  const links = await db
    .from("pms_package_rate_plans")
    .select("package_id, rate_plan_id")
    .eq("restaurant_id", restaurantId)
    .in("rate_plan_id", planIds);
  if (links.error && !missingRelation(links.error)) throw new Error(links.error.message);

  const packageIds = [...new Set(((links.data ?? []) as Array<{ package_id: string }>).map((row) => row.package_id))];
  const packagesById = new Map<string, { name: string; active: boolean }>();
  if (packageIds.length > 0) {
    const packages = await db
      .from("pms_packages")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .in("id", packageIds);
    if (packages.error && !missingRelation(packages.error)) throw new Error(packages.error.message);
    for (const row of (packages.data ?? []) as Array<{ id: string; name: string; active: boolean }>) {
      packagesById.set(row.id, { name: row.name, active: row.active !== false });
    }
  }

  const components = packageIds.length
    ? await db
        .from("pms_package_components")
        .select("package_id, component_kind, meal_plan_id, room_amenity_id, fo_service_id")
        .eq("restaurant_id", restaurantId)
        .in("package_id", packageIds)
    : { data: [], error: null };
  if (components.error && !missingRelation(components.error)) throw new Error(components.error.message);

  const mealIds = [
    ...new Set(
      ((components.data ?? []) as Array<{ meal_plan_id: string | null }>)
        .map((row) => row.meal_plan_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const amenityIds = [
    ...new Set(
      ((components.data ?? []) as Array<{ room_amenity_id: string | null }>)
        .map((row) => row.room_amenity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const serviceIds = [
    ...new Set(
      ((components.data ?? []) as Array<{ fo_service_id: string | null }>)
        .map((row) => row.fo_service_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const mealsById = new Map<string, LinkedMealPlan>();
  if (mealIds.length > 0) {
    const meals = await db
      .from("pms_meal_plans")
      .select("id, name, includes_breakfast")
      .eq("restaurant_id", restaurantId)
      .in("id", mealIds);
    if (meals.error && !missingRelation(meals.error)) throw new Error(meals.error.message);
    for (const row of (meals.data ?? []) as Array<{ id: string; name: string; includes_breakfast: boolean }>) {
      mealsById.set(row.id, { name: row.name, includesBreakfast: row.includes_breakfast === true });
    }
  }
  const amenityNames = new Map<string, string>();
  if (amenityIds.length > 0) {
    const amenities = await db
      .from("room_amenities")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .in("id", amenityIds);
    if (amenities.error && !missingRelation(amenities.error)) throw new Error(amenities.error.message);
    for (const row of (amenities.data ?? []) as Array<{ id: string; name: string }>) {
      amenityNames.set(row.id, row.name);
    }
  }
  const serviceNames = new Map<string, string>();
  if (serviceIds.length > 0) {
    const services = await db
      .from("fo_service_catalogue")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .in("id", serviceIds);
    if (services.error && !missingRelation(services.error)) throw new Error(services.error.message);
    for (const row of (services.data ?? []) as Array<{ id: string; name: string }>) {
      serviceNames.set(row.id, row.name);
    }
  }

  const restrictions = await db
    .from("hotel_rate_restrictions")
    .select("rate_plan_id, restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell")
    .eq("restaurant_id", restaurantId)
    .gte("restriction_date", arrival)
    .lte("restriction_date", departure)
    .in("rate_plan_id", planIds);
  if (restrictions.error && !missingRelation(restrictions.error)) throw new Error(restrictions.error.message);

  const restrictionsByPlan = new Map<string, RestrictionDisplayRow[]>();
  for (const row of (restrictions.data ?? []) as Array<{
    rate_plan_id: string;
    restriction_date: string;
    min_stay: number | null;
    max_stay: number | null;
    closed_to_arrival: boolean;
    closed_to_departure: boolean;
    stop_sell: boolean;
  }>) {
    const list = restrictionsByPlan.get(row.rate_plan_id) ?? [];
    list.push({
      date: String(row.restriction_date),
      minStay: row.min_stay == null ? null : Number(row.min_stay),
      maxStay: row.max_stay == null ? null : Number(row.max_stay),
      closedToArrival: row.closed_to_arrival === true,
      closedToDeparture: row.closed_to_departure === true,
      stopSell: row.stop_sell === true,
    });
    restrictionsByPlan.set(row.rate_plan_id, list);
  }

  const mealsByPlan = new Map<string, LinkedMealPlan[]>();
  const inclusionsByPlan = new Map<string, LinkedInclusion[]>();
  for (const link of (links.data ?? []) as Array<{ package_id: string; rate_plan_id: string }>) {
    const pack = packagesById.get(link.package_id);
    if (!pack?.active) continue;
    const packComponents = ((components.data ?? []) as Array<{
      package_id: string;
      component_kind: string;
      meal_plan_id: string | null;
      room_amenity_id: string | null;
      fo_service_id: string | null;
    }>).filter((row) => row.package_id === link.package_id);
    for (const component of packComponents) {
      if (component.component_kind === "meal_plan" && component.meal_plan_id) {
        const meal = mealsById.get(component.meal_plan_id);
        if (meal) {
          const meals = mealsByPlan.get(link.rate_plan_id) ?? [];
          meals.push(meal);
          mealsByPlan.set(link.rate_plan_id, meals);
          const inclusions = inclusionsByPlan.get(link.rate_plan_id) ?? [];
          inclusions.push({ packageName: pack.name, kind: "meal_plan", label: meal.name });
          inclusionsByPlan.set(link.rate_plan_id, inclusions);
        }
      } else if (component.component_kind === "room_amenity" && component.room_amenity_id) {
        const label = amenityNames.get(component.room_amenity_id);
        if (label) {
          const inclusions = inclusionsByPlan.get(link.rate_plan_id) ?? [];
          inclusions.push({ packageName: pack.name, kind: "room_amenity", label });
          inclusionsByPlan.set(link.rate_plan_id, inclusions);
        }
      } else if (component.component_kind === "fo_service" && component.fo_service_id) {
        const label = serviceNames.get(component.fo_service_id);
        if (label) {
          const inclusions = inclusionsByPlan.get(link.rate_plan_id) ?? [];
          inclusions.push({ packageName: pack.name, kind: "fo_service", label });
          inclusionsByPlan.set(link.rate_plan_id, inclusions);
        }
      }
    }
  }

  for (const id of planIds) {
    const current = out.get(id) ?? EMPTY_QUOTE_MERCHANDISING;
    out.set(id, {
      ...current,
      breakfastLabel: summarizeBreakfast(mealsByPlan.get(id) ?? []),
      includedServicesLabel: summarizeIncludedServices(inclusionsByPlan.get(id) ?? []),
      restrictionSummary: summarizeStayRestrictions(restrictionsByPlan.get(id) ?? [], arrival, departure),
    });
  }
  return out;
}
