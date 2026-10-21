/**
 * Loads and reconciles operational entitlements, then reads the report.
 * Reconciliation is deterministic and idempotent. It does not post charges.
 */
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import {
  assembleServiceEntitlementReport,
  ServiceEntitlementReportError,
  type ServiceEntitlementReportFilters,
  type ServiceEntitlementReportResult,
  type ServiceEntitlementSourceRow,
} from "@/packages/pms/lib/service-entitlement-report";
import {
  EXPLICIT_DEFAULT_MEAL_POLICY,
  expectedEntitlements,
  isTerminalReservationStatus,
  reconcileEntitlements,
  type EntitlementStatus,
  type ExpectedEntitlement,
  type MealApplicabilityPolicy,
  type MealPlanSource,
  type PackageComponentSource,
  type ReservationRoomSource,
  type ServiceDateRule,
  type StoredEntitlement,
} from "@/packages/pms/lib/service-entitlement";

export type ServiceEntitlementDb = {
  from: (table: string) => {
    select: (columns: string) => ServiceQuery;
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => PromiseLike<{
      error: { message?: string } | null;
    }>;
    update: (values: Record<string, unknown>) => ServiceQuery;
    upsert: (
      rows: Record<string, unknown>[],
      options: { onConflict: string },
    ) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

export type ServiceQuery = {
  eq: (column: string, value: string) => ServiceQuery;
  in: (column: string, values: string[]) => ServiceQuery;
  gte: (column: string, value: string) => ServiceQuery;
  lte: (column: string, value: string) => ServiceQuery;
  order: (column: string, options?: { ascending?: boolean }) => ServiceQuery;
  maybeSingle: () => PromiseLike<{
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
  }>;
  then: PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: { message?: string } | null;
  }>["then"];
};

const CHUNK = 200;

export async function loadServiceEntitlementReport(
  db: ServiceEntitlementDb,
  restaurantId: string,
  filters: ServiceEntitlementReportFilters,
): Promise<ServiceEntitlementReportResult> {
  const serviceDate = assertDate(filters.serviceDate);
  const property = await loadProperty(db, restaurantId);
  const policy = await loadPolicy(db, restaurantId);
  if (serviceDate >= property.businessDate) {
    await reconcileServiceDate(db, restaurantId, serviceDate, policy);
  }
  const stored = await listEntitlements(db, restaurantId, serviceDate);
  const departments = await loadDepartments(db, restaurantId);
  const stayStatuses = await loadStayStatuses(db, restaurantId, stored);
  const rows = stored.map((row) => toSourceRow(row, restaurantId, departments, stayStatuses));
  return assembleServiceEntitlementReport({
    restaurantId,
    businessDate: property.businessDate,
    timezone: property.timezone,
    rows,
    filters: { ...filters, serviceDate },
  });
}

export async function updateServiceEntitlementStatus(
  db: ServiceEntitlementDb,
  restaurantId: string,
  entitlementId: string,
  status: EntitlementStatus,
  membershipId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === "COMPLETED" || status === "IN_PROGRESS") {
    patch.fulfilled_at = now;
    patch.fulfilled_by_membership_id = membershipId;
    patch.cancelled_at = null;
    patch.cancellation_reason = null;
  }
  if (status === "CANCELLED") {
    patch.cancelled_at = now;
    patch.cancellation_reason = "Marked cancelled from the operational report";
  }
  if (status === "PENDING") {
    patch.fulfilled_at = null;
    patch.fulfilled_by_membership_id = null;
    patch.cancelled_at = null;
    patch.cancellation_reason = null;
  }
  const result = await db
    .from("pms_reservation_service_entitlements")
    .update(patch)
    .eq("restaurant_id", restaurantId)
    .eq("id", entitlementId);
  if (result.error) throw new ServiceEntitlementReportError();
}

async function reconcileServiceDate(
  db: ServiceEntitlementDb,
  restaurantId: string,
  serviceDate: string,
  policy: MealApplicabilityPolicy,
): Promise<void> {
  const rooms = await loadRooms(db, restaurantId, serviceDate);
  const expected = expectedEntitlements(rooms, policy).filter(
    (row) => row.serviceDate === serviceDate,
  );
  const existing = await loadStoredForDate(db, restaurantId, serviceDate);
  const plan = reconcileEntitlements(expected, existing);
  if (plan.insert.length > 0) {
    const written = await db.from("pms_reservation_service_entitlements").upsert(
      plan.insert.map((row) => toInsert(row)),
      { onConflict: "restaurant_id,generation_key" },
    );
    if (written.error) throw new ServiceEntitlementReportError();
  }
  const now = new Date().toISOString();
  for (const id of plan.reactivateIds) {
    const result = await db
      .from("pms_reservation_service_entitlements")
      .update({
        status: "PENDING",
        cancelled_at: null,
        cancellation_reason: null,
        updated_at: now,
      })
      .eq("restaurant_id", restaurantId)
      .eq("id", id);
    if (result.error) throw new ServiceEntitlementReportError();
  }
  for (const id of plan.cancelIds) {
    const result = await db
      .from("pms_reservation_service_entitlements")
      .update({
        status: "CANCELLED",
        cancelled_at: now,
        cancellation_reason: "Stay or source no longer includes this service",
        updated_at: now,
      })
      .eq("restaurant_id", restaurantId)
      .eq("id", id);
    if (result.error) throw new ServiceEntitlementReportError();
  }
}

async function loadRooms(
  db: ServiceEntitlementDb,
  restaurantId: string,
  serviceDate: string,
): Promise<ReservationRoomSource[]> {
  const roomResult = await db
    .from("hotel_reservation_rooms")
    .select(
      "id, restaurant_id, reservation_id, unit_sequence, room_id, arrival_date, departure_date, adults, children, infants, rate_plan_id",
    )
    .eq("restaurant_id", restaurantId)
    .lte("arrival_date", serviceDate)
    .gte("departure_date", serviceDate);
  if (roomResult.error) throw new ServiceEntitlementReportError();
  const roomRows = (roomResult.data ?? []).filter(
    (row) => text(row.restaurant_id) === restaurantId,
  );
  if (roomRows.length === 0) return [];
  const reservationIds = unique(roomRows.map((row) => text(row.reservation_id)));
  const ratePlanIds = unique(roomRows.map((row) => text(row.rate_plan_id)));
  const roomIds = unique(roomRows.map((row) => text(row.room_id)));
  const [reservations, ratePlans, hotelRooms, packages] = await Promise.all([
    selectIn(
      db,
      "hotel_reservations",
      "id, restaurant_id, status, guest_id, special_requests",
      "id",
      reservationIds,
      restaurantId,
    ),
    selectIn(
      db,
      "hotel_rate_plans",
      "id, restaurant_id, meal_plan_id",
      "id",
      ratePlanIds,
      restaurantId,
    ),
    selectIn(
      db,
      "hotel_rooms",
      "id, restaurant_id, room_number, building, floor",
      "id",
      roomIds,
      restaurantId,
    ),
    selectIn(
      db,
      "hotel_reservation_packages",
      "id, restaurant_id, reservation_id, reservation_room_id, package_id",
      "reservation_id",
      reservationIds,
      restaurantId,
    ),
  ]);
  const guestIds = unique(reservations.map((row) => text(row.guest_id)));
  const mealPlanIds = unique(ratePlans.map((row) => text(row.meal_plan_id)));
  const packageIds = unique(packages.map((row) => text(row.package_id)));
  const [guests, mealPlans, components] = await Promise.all([
    selectIn(
      db,
      "guest_profiles",
      "id, restaurant_id, first_name, last_name",
      "id",
      guestIds,
      restaurantId,
    ),
    selectIn(
      db,
      "pms_meal_plans",
      "id, restaurant_id, name, includes_breakfast, includes_lunch, includes_dinner",
      "id",
      mealPlanIds,
      restaurantId,
    ),
    selectIn(
      db,
      "pms_package_components",
      "id, restaurant_id, package_id, component_kind, meal_plan_id, fo_service_id, room_amenity_id, quantity, requires_fulfillment, fulfillment_department_id, service_date_rule",
      "package_id",
      packageIds,
      restaurantId,
    ),
  ]);
  const extraMealIds = unique(
    components
      .map((row) => text(row.meal_plan_id))
      .filter((id) => !mealPlans.some((plan) => text(plan.id) === id)),
  );
  const moreMeals = await selectIn(
    db,
    "pms_meal_plans",
    "id, restaurant_id, name, includes_breakfast, includes_lunch, includes_dinner",
    "id",
    extraMealIds,
    restaurantId,
  );
  const serviceIds = unique(components.map((row) => text(row.fo_service_id)));
  const amenityIds = unique(components.map((row) => text(row.room_amenity_id)));
  const [services, amenities] = await Promise.all([
    selectIn(db, "fo_service_catalogue", "id, restaurant_id, name", "id", serviceIds, restaurantId),
    selectIn(db, "room_amenities", "id, restaurant_id, name", "id", amenityIds, restaurantId),
  ]);
  const mealById = new Map([...mealPlans, ...moreMeals].map((row) => [text(row.id), mapMeal(row)]));
  const guestById = new Map(
    guests.map((row) => [
      text(row.id),
      [text(row.first_name), text(row.last_name)].filter(Boolean).join(" "),
    ]),
  );
  const reservationById = new Map(reservations.map((row) => [text(row.id), row]));
  const rateById = new Map(ratePlans.map((row) => [text(row.id), text(row.meal_plan_id)]));
  const hotelRoomById = new Map(hotelRooms.map((row) => [text(row.id), row]));
  const serviceById = new Map(services.map((row) => [text(row.id), text(row.name)]));
  const amenityById = new Map(amenities.map((row) => [text(row.id), text(row.name)]));
  const componentsByPackage = new Map<string, Record<string, unknown>[]>();
  for (const component of components) {
    const list = componentsByPackage.get(text(component.package_id)) ?? [];
    list.push(component);
    componentsByPackage.set(text(component.package_id), list);
  }
  return roomRows.map((row) => {
    const reservation = reservationById.get(text(row.reservation_id));
    const hotelRoom = hotelRoomById.get(text(row.room_id));
    const mealId = rateById.get(text(row.rate_plan_id)) ?? "";
    const roomPackages = packages
      .filter((pkg) => text(pkg.reservation_id) === text(row.reservation_id))
      .flatMap((pkg) =>
        (componentsByPackage.get(text(pkg.package_id)) ?? []).map((component) =>
          mapComponent(component, pkg, mealById, serviceById, amenityById),
        ),
      )
      .filter((component): component is PackageComponentSource => component != null);
    return {
      id: text(row.id),
      restaurantId,
      reservationId: text(row.reservation_id),
      unitSequence: Number(row.unit_sequence ?? 1),
      reservationStatus: text(reservation?.status) || "confirmed",
      arrivalDate: text(row.arrival_date).slice(0, 10),
      departureDate: text(row.departure_date).slice(0, 10),
      adults: Number(row.adults ?? 0),
      children: Number(row.children ?? 0),
      infants: Number(row.infants ?? 0),
      guestId: text(reservation?.guest_id) || null,
      guestName: guestById.get(text(reservation?.guest_id)) || "—",
      roomNumber: text(hotelRoom?.room_number) || "Unassigned",
      building: text(hotelRoom?.building) || null,
      floor: text(hotelRoom?.floor) || null,
      specialRequests: text(reservation?.special_requests) || null,
      mealPlan: mealById.get(mealId) ?? null,
      packages: roomPackages,
    } satisfies ReservationRoomSource;
  });
}

function mapMeal(row: Record<string, unknown>): MealPlanSource {
  return {
    id: text(row.id),
    name: text(row.name) || "Meal plan",
    includesBreakfast: row.includes_breakfast === true,
    includesLunch: row.includes_lunch === true,
    includesDinner: row.includes_dinner === true,
  };
}

function mapComponent(
  component: Record<string, unknown>,
  pkg: Record<string, unknown>,
  meals: Map<string, MealPlanSource>,
  services: Map<string, string>,
  amenities: Map<string, string>,
): PackageComponentSource | null {
  const kind = text(component.component_kind);
  const rule = text(component.service_date_rule);
  const serviceDateRule = isServiceDateRule(rule) ? rule : null;
  if (kind === "meal_plan") {
    const meal = meals.get(text(component.meal_plan_id)) ?? null;
    if (!meal) return null;
    return {
      assignmentId: text(pkg.id),
      reservationRoomId: text(pkg.reservation_room_id) || null,
      componentId: text(component.id),
      requiresFulfillment: component.requires_fulfillment === true,
      departmentId: text(component.fulfillment_department_id) || null,
      serviceDateRule,
      kind: "meal_plan",
      serviceReferenceId: meal.id,
      serviceName: meal.name,
      quantity: Number(component.quantity ?? 1),
      mealPlan: meal,
    };
  }
  if (kind === "fo_service") {
    const id = text(component.fo_service_id);
    return {
      assignmentId: text(pkg.id),
      reservationRoomId: text(pkg.reservation_room_id) || null,
      componentId: text(component.id),
      requiresFulfillment: component.requires_fulfillment === true,
      departmentId: text(component.fulfillment_department_id) || null,
      serviceDateRule,
      kind: "fo_service",
      serviceReferenceId: id,
      serviceName: services.get(id) || "Service",
      quantity: Number(component.quantity ?? 1),
      mealPlan: null,
    };
  }
  if (kind === "room_amenity") {
    const id = text(component.room_amenity_id);
    return {
      assignmentId: text(pkg.id),
      reservationRoomId: text(pkg.reservation_room_id) || null,
      componentId: text(component.id),
      requiresFulfillment: component.requires_fulfillment === true,
      departmentId: text(component.fulfillment_department_id) || null,
      serviceDateRule,
      kind: "room_amenity",
      serviceReferenceId: id,
      serviceName: amenities.get(id) || "Amenity",
      quantity: Number(component.quantity ?? 1),
      mealPlan: null,
    };
  }
  return null;
}

async function loadStoredForDate(
  db: ServiceEntitlementDb,
  restaurantId: string,
  serviceDate: string,
): Promise<StoredEntitlement[]> {
  const result = await db
    .from("pms_reservation_service_entitlements")
    .select("id, restaurant_id, generation_key, status, service_date")
    .eq("restaurant_id", restaurantId)
    .eq("service_date", serviceDate);
  if (result.error) throw new ServiceEntitlementReportError();
  return (result.data ?? [])
    .filter((row) => text(row.restaurant_id) === restaurantId)
    .filter((row) => text(row.service_date).slice(0, 10) === serviceDate)
    .map((row) => ({
      id: text(row.id),
      generationKey: text(row.generation_key),
      status: text(row.status) as EntitlementStatus,
    }));
}

async function listEntitlements(
  db: ServiceEntitlementDb,
  restaurantId: string,
  serviceDate: string,
): Promise<Record<string, unknown>[]> {
  const result = await db
    .from("pms_reservation_service_entitlements")
    .select(
      "id, restaurant_id, reservation_id, service_kind, meal_code, service_reference_id, service_name_snapshot, service_date, adult_quantity, child_quantity, total_quantity, department_id, meal_plan_name_snapshot, room_number_snapshot, guest_name_snapshot, building_snapshot, floor_snapshot, notes_snapshot, status",
    )
    .eq("restaurant_id", restaurantId)
    .eq("service_date", serviceDate);
  if (result.error) throw new ServiceEntitlementReportError();
  return (result.data ?? []).filter((row) => text(row.restaurant_id) === restaurantId);
}

async function loadStayStatuses(
  db: ServiceEntitlementDb,
  restaurantId: string,
  rows: readonly Record<string, unknown>[],
): Promise<Map<string, string>> {
  const ids = unique(rows.map((row) => text(row.reservation_id)));
  const reservations = await selectIn(
    db,
    "hotel_reservations",
    "id, restaurant_id, status",
    "id",
    ids,
    restaurantId,
  );
  return new Map(reservations.map((row) => [text(row.id), text(row.status)]));
}

function toSourceRow(
  row: Record<string, unknown>,
  restaurantId: string,
  departments: Map<string, string>,
  stayStatuses: Map<string, string>,
): ServiceEntitlementSourceRow {
  const kind = text(row.service_kind) === "MEAL" ? "MEAL" : "PACKAGE_COMPONENT";
  const meal = text(row.meal_code);
  return {
    id: text(row.id),
    restaurantId,
    roomNumber: text(row.room_number_snapshot) || "Unassigned",
    guestName: text(row.guest_name_snapshot) || "—",
    adultQuantity: Number(row.adult_quantity ?? 0),
    childQuantity: Number(row.child_quantity ?? 0),
    totalQuantity: Number(row.total_quantity ?? 0),
    serviceName: text(row.service_name_snapshot),
    mealCode: meal === "BREAKFAST" || meal === "LUNCH" || meal === "DINNER" ? meal : null,
    mealPlanName: text(row.meal_plan_name_snapshot) || null,
    serviceDate: text(row.service_date).slice(0, 10),
    departmentId: text(row.department_id) || null,
    departmentName: departments.get(text(row.department_id)) ?? null,
    status: (text(row.status) || "PENDING") as EntitlementStatus,
    notes: text(row.notes_snapshot) || null,
    building: text(row.building_snapshot) || null,
    floor: text(row.floor_snapshot) || null,
    stayStatus: stayStatuses.get(text(row.reservation_id)) || "",
    serviceKind: kind,
    serviceReferenceId: text(row.service_reference_id),
  };
}

function toInsert(row: ExpectedEntitlement): Record<string, unknown> {
  return {
    restaurant_id: row.restaurantId,
    reservation_id: row.reservationId,
    reservation_room_id: row.reservationRoomId,
    guest_id: row.guestId,
    service_kind: row.serviceKind,
    meal_code: row.mealCode,
    service_reference_id: row.serviceReferenceId,
    service_name_snapshot: row.serviceNameSnapshot,
    service_date: row.serviceDate,
    adult_quantity: row.adultQuantity,
    child_quantity: row.childQuantity,
    infant_quantity: row.infantQuantity,
    total_quantity: row.totalQuantity,
    source_type: row.sourceType,
    source_id: row.sourceId,
    component_id: row.componentId,
    department_id: row.departmentId,
    meal_plan_name_snapshot: row.mealPlanName,
    room_number_snapshot: row.roomNumber,
    guest_name_snapshot: row.guestName,
    building_snapshot: row.building,
    floor_snapshot: row.floor,
    notes_snapshot: row.notesSnapshot,
    status: "PENDING",
    generation_key: row.generationKey,
  };
}

async function loadPolicy(
  db: ServiceEntitlementDb,
  restaurantId: string,
): Promise<MealApplicabilityPolicy> {
  const existing = await db
    .from("pms_meal_applicability_policies")
    .select(
      "restaurant_id, breakfast_include_arrival, breakfast_include_stay, breakfast_include_departure, lunch_include_arrival, lunch_include_stay, lunch_include_departure, dinner_include_arrival, dinner_include_stay, dinner_include_departure, count_infants, breakfast_department_id, lunch_department_id, dinner_department_id",
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (existing.error) throw new ServiceEntitlementReportError();
  const row = existing.data;
  if (!row) {
    const inserted = await db.from("pms_meal_applicability_policies").insert({
      restaurant_id: restaurantId,
    });
    if (inserted.error) throw new ServiceEntitlementReportError();
    return {
      breakfast: { ...EXPLICIT_DEFAULT_MEAL_POLICY.breakfast },
      lunch: { ...EXPLICIT_DEFAULT_MEAL_POLICY.lunch },
      dinner: { ...EXPLICIT_DEFAULT_MEAL_POLICY.dinner },
      countInfants: EXPLICIT_DEFAULT_MEAL_POLICY.countInfants,
      breakfastDepartmentId: null,
      lunchDepartmentId: null,
      dinnerDepartmentId: null,
    };
  }
  return {
    breakfast: rule(row, "breakfast"),
    lunch: rule(row, "lunch"),
    dinner: rule(row, "dinner"),
    countInfants: row.count_infants === true,
    breakfastDepartmentId: text(row.breakfast_department_id) || null,
    lunchDepartmentId: text(row.lunch_department_id) || null,
    dinnerDepartmentId: text(row.dinner_department_id) || null,
  };
}

function rule(row: Record<string, unknown>, meal: "breakfast" | "lunch" | "dinner") {
  return {
    includeArrival: row[`${meal}_include_arrival`] === true,
    includeStay: row[`${meal}_include_stay`] === true,
    includeDeparture: row[`${meal}_include_departure`] === true,
  };
}

async function loadDepartments(
  db: ServiceEntitlementDb,
  restaurantId: string,
): Promise<Map<string, string>> {
  const result = await db
    .from("pms_departments")
    .select("id, restaurant_id, name")
    .eq("restaurant_id", restaurantId);
  if (result.error) throw new ServiceEntitlementReportError();
  return new Map(
    (result.data ?? [])
      .filter((row) => text(row.restaurant_id) === restaurantId)
      .map((row) => [text(row.id), text(row.name)]),
  );
}

async function loadProperty(
  db: ServiceEntitlementDb,
  restaurantId: string,
): Promise<{ businessDate: string; timezone: string }> {
  const result = await db
    .from("restaurants")
    .select("timezone, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error || !result.data) throw new ServiceEntitlementReportError();
  const timezone = text(result.data.timezone);
  if (!timezone) throw new ServiceEntitlementReportError();
  const persisted = text(result.data.business_date);
  return {
    timezone,
    businessDate: resolvePropertyBusinessDate(persisted ? persisted.slice(0, 10) : null, timezone),
  };
}

async function selectIn(
  db: ServiceEntitlementDb,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  restaurantId: string,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += CHUNK) {
    const result = await db
      .from(table)
      .select(columns)
      .eq("restaurant_id", restaurantId)
      .in(column, ids.slice(index, index + CHUNK));
    if (result.error) throw new ServiceEntitlementReportError();
    for (const row of result.data ?? []) {
      if (text(row.restaurant_id) === restaurantId) rows.push(row);
    }
  }
  return rows;
}

function isServiceDateRule(value: string): value is ServiceDateRule {
  return (
    value === "ON_ARRIVAL" ||
    value === "ON_DEPARTURE" ||
    value === "EACH_STAY_DATE" ||
    value === "ONCE_PER_STAY"
  );
}

function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ServiceEntitlementReportError("Service date must be a valid date.");
  }
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function terminalStayProducesNoEntitlement(status: string): boolean {
  return isTerminalReservationStatus(status);
}
