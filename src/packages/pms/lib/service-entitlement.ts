/**
 * Operational service entitlements.
 *
 * One expected row is one reservation room unit + one service + one service date.
 * Meal dates come only from the property meal applicability policy.
 * Rate-plan inclusion flags are used. Meal-plan type names are not.
 * Financial folio text is never an input.
 * guest_service_history stays an ad-hoc request log and is not copied here.
 */
export const SERVICE_ENTITLEMENT_REPORT_MEAL = "meal-service";
export const SERVICE_ENTITLEMENT_REPORT_FULFILLMENT = "service-fulfillment";

export const MEAL_CODES = ["BREAKFAST", "LUNCH", "DINNER"] as const;
export type MealCode = (typeof MEAL_CODES)[number];

export const SERVICE_DATE_RULES = [
  "ON_ARRIVAL",
  "ON_DEPARTURE",
  "EACH_STAY_DATE",
  "ONCE_PER_STAY",
] as const;
export type ServiceDateRule = (typeof SERVICE_DATE_RULES)[number];

export const ENTITLEMENT_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export type MealDateRule = {
  includeArrival: boolean;
  includeStay: boolean;
  includeDeparture: boolean;
};

/**
 * Seeded configuration. Reports do not read these constants.
 * The property row in pms_meal_applicability_policies is the live rule.
 */
export const EXPLICIT_DEFAULT_MEAL_POLICY = {
  breakfast: { includeArrival: false, includeStay: true, includeDeparture: true },
  lunch: { includeArrival: true, includeStay: true, includeDeparture: false },
  dinner: { includeArrival: true, includeStay: true, includeDeparture: false },
  countInfants: false,
} as const;

export type MealApplicabilityPolicy = {
  breakfast: MealDateRule;
  lunch: MealDateRule;
  dinner: MealDateRule;
  countInfants: boolean;
  breakfastDepartmentId: string | null;
  lunchDepartmentId: string | null;
  dinnerDepartmentId: string | null;
};

export type MealPlanSource = {
  id: string;
  name: string;
  includesBreakfast: boolean;
  includesLunch: boolean;
  includesDinner: boolean;
};

export type PackageComponentSource = {
  assignmentId: string;
  reservationRoomId: string | null;
  componentId: string;
  requiresFulfillment: boolean;
  departmentId: string | null;
  serviceDateRule: ServiceDateRule | null;
  kind: "meal_plan" | "fo_service" | "room_amenity";
  serviceReferenceId: string;
  serviceName: string;
  quantity: number;
  mealPlan: MealPlanSource | null;
};

export type ReservationRoomSource = {
  id: string;
  restaurantId: string;
  reservationId: string;
  unitSequence: number;
  reservationStatus: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  guestId: string | null;
  guestName: string;
  roomNumber: string;
  building: string | null;
  floor: string | null;
  specialRequests: string | null;
  mealPlan: MealPlanSource | null;
  packages: readonly PackageComponentSource[];
};

export type ExpectedEntitlement = {
  generationKey: string;
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string;
  guestId: string | null;
  guestName: string;
  roomNumber: string;
  building: string | null;
  floor: string | null;
  serviceKind: "MEAL" | "PACKAGE_COMPONENT";
  mealCode: MealCode | null;
  serviceReferenceId: string;
  serviceNameSnapshot: string;
  serviceDate: string;
  adultQuantity: number;
  childQuantity: number;
  infantQuantity: number;
  totalQuantity: number;
  sourceType: "RATE_PLAN_MEAL" | "PACKAGE";
  sourceId: string;
  componentId: string | null;
  departmentId: string | null;
  mealPlanName: string | null;
  notesSnapshot: string | null;
};

export type StoredEntitlement = {
  id: string;
  generationKey: string;
  status: EntitlementStatus;
};

export type EntitlementReconciliation = {
  insert: ExpectedEntitlement[];
  reactivateIds: string[];
  cancelIds: string[];
};

const TERMINAL_STATUSES = new Set(["cancelled", "canceled", "no_show", "no-show"]);

export function isTerminalReservationStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.trim().toLowerCase());
}

export function mealPax(
  room: Pick<ReservationRoomSource, "adults" | "children" | "infants">,
  policy: MealApplicabilityPolicy,
): { adults: number; children: number; infants: number; total: number } {
  const adults = Math.max(0, room.adults);
  const children = Math.max(0, room.children);
  const infants = policy.countInfants ? Math.max(0, room.infants) : 0;
  return {
    adults,
    children,
    infants: policy.countInfants ? infants : 0,
    total: adults + children + infants,
  };
}

export function mealServiceDates(
  arrivalDate: string,
  departureDate: string,
  rule: MealDateRule,
): string[] {
  if (!isDate(arrivalDate) || !isDate(departureDate) || departureDate <= arrivalDate) return [];
  const dates: string[] = [];
  if (rule.includeArrival) dates.push(arrivalDate);
  let cursor = addDays(arrivalDate, 1);
  while (cursor < departureDate) {
    if (rule.includeStay) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  if (rule.includeDeparture) dates.push(departureDate);
  return [...new Set(dates)].sort();
}

export function packageServiceDates(
  arrivalDate: string,
  departureDate: string,
  rule: ServiceDateRule,
): string[] {
  if (!isDate(arrivalDate) || !isDate(departureDate) || departureDate <= arrivalDate) return [];
  if (rule === "ON_ARRIVAL" || rule === "ONCE_PER_STAY") return [arrivalDate];
  if (rule === "ON_DEPARTURE") return [departureDate];
  const dates: string[] = [];
  let cursor = arrivalDate;
  while (cursor < departureDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function expectedEntitlements(
  rooms: readonly ReservationRoomSource[],
  policy: MealApplicabilityPolicy,
): ExpectedEntitlement[] {
  const out: ExpectedEntitlement[] = [];
  const primaryByReservation = new Map<string, { id: string; sequence: number }>();
  for (const room of rooms) {
    const current = primaryByReservation.get(room.reservationId);
    if (!current || room.unitSequence < current.sequence) {
      primaryByReservation.set(room.reservationId, { id: room.id, sequence: room.unitSequence });
    }
  }
  for (const room of rooms) {
    if (isTerminalReservationStatus(room.reservationStatus)) continue;
    out.push(...ratePlanMeals(room, policy));
    out.push(
      ...packageEntitlements(
        room,
        policy,
        primaryByReservation.get(room.reservationId)?.id === room.id,
      ),
    );
  }
  return out;
}

export function reconcileEntitlements(
  expected: readonly ExpectedEntitlement[],
  existing: readonly StoredEntitlement[],
): EntitlementReconciliation {
  const expectedKeys = new Set(expected.map((row) => row.generationKey));
  const existingByKey = new Map(existing.map((row) => [row.generationKey, row]));
  const insert: ExpectedEntitlement[] = [];
  const reactivateIds: string[] = [];
  const cancelIds: string[] = [];
  for (const row of expected) {
    const stored = existingByKey.get(row.generationKey);
    if (!stored) insert.push(row);
    else if (stored.status === "CANCELLED") reactivateIds.push(stored.id);
  }
  for (const stored of existing) {
    if (expectedKeys.has(stored.generationKey)) continue;
    if (stored.status === "PENDING" || stored.status === "IN_PROGRESS") cancelIds.push(stored.id);
  }
  return { insert, reactivateIds, cancelIds };
}

export function generationKey(parts: {
  restaurantId: string;
  reservationRoomId: string;
  serviceDate: string;
  sourceType: string;
  sourceId: string;
  identity: string;
}): string {
  return [
    parts.restaurantId,
    parts.reservationRoomId,
    parts.serviceDate,
    parts.sourceType,
    parts.sourceId,
    parts.identity,
  ].join("|");
}

export function compareRoomNumbers(left: string, right: string): number {
  const leftParts = left.split(/(\d+)/);
  const rightParts = right.split(/(\d+)/);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? "";
    const b = rightParts[index] ?? "";
    const aNum = /^\d+$/.test(a) ? Number(a) : null;
    const bNum = /^\d+$/.test(b) ? Number(b) : null;
    if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
    const text = a.localeCompare(b, undefined, { sensitivity: "base" });
    if (text !== 0) return text;
  }
  return 0;
}

function ratePlanMeals(
  room: ReservationRoomSource,
  policy: MealApplicabilityPolicy,
): ExpectedEntitlement[] {
  const plan = room.mealPlan;
  if (!plan) return [];
  const flags: Array<[MealCode, boolean, MealDateRule, string | null]> = [
    ["BREAKFAST", plan.includesBreakfast, policy.breakfast, policy.breakfastDepartmentId],
    ["LUNCH", plan.includesLunch, policy.lunch, policy.lunchDepartmentId],
    ["DINNER", plan.includesDinner, policy.dinner, policy.dinnerDepartmentId],
  ];
  const rows: ExpectedEntitlement[] = [];
  for (const [meal, included, rule, departmentId] of flags) {
    if (!included) continue;
    for (const serviceDate of mealServiceDates(room.arrivalDate, room.departureDate, rule)) {
      rows.push(
        mealRow(
          room,
          policy,
          meal,
          plan,
          serviceDate,
          "RATE_PLAN_MEAL",
          plan.id,
          null,
          departmentId,
        ),
      );
    }
  }
  return rows;
}

function packageEntitlements(
  room: ReservationRoomSource,
  policy: MealApplicabilityPolicy,
  isPrimaryRoom: boolean,
): ExpectedEntitlement[] {
  const rows: ExpectedEntitlement[] = [];
  for (const component of room.packages) {
    if (!component.requiresFulfillment) continue;
    if (!componentAppliesToRoom(component, room.id, isPrimaryRoom)) continue;
    // Meal components follow the property meal rules. Their service_date_rule is not a date source.
    if (component.kind === "meal_plan" && component.mealPlan) {
      const flags: Array<[MealCode, boolean, MealDateRule]> = [
        ["BREAKFAST", component.mealPlan.includesBreakfast, policy.breakfast],
        ["LUNCH", component.mealPlan.includesLunch, policy.lunch],
        ["DINNER", component.mealPlan.includesDinner, policy.dinner],
      ];
      for (const [meal, included, rule] of flags) {
        if (!included) continue;
        for (const serviceDate of mealServiceDates(room.arrivalDate, room.departureDate, rule)) {
          rows.push(
            mealRow(
              room,
              policy,
              meal,
              component.mealPlan,
              serviceDate,
              "PACKAGE",
              component.componentId,
              component.componentId,
              component.departmentId,
            ),
          );
        }
      }
      continue;
    }
    if (!component.serviceDateRule) continue;
    const dates = packageServiceDates(
      room.arrivalDate,
      room.departureDate,
      component.serviceDateRule,
    );
    for (const serviceDate of dates) {
      const quantity = Math.max(1, component.quantity);
      rows.push({
        generationKey: generationKey({
          restaurantId: room.restaurantId,
          reservationRoomId: room.id,
          serviceDate,
          sourceType: "PACKAGE",
          sourceId: component.componentId,
          identity: component.serviceReferenceId,
        }),
        restaurantId: room.restaurantId,
        reservationId: room.reservationId,
        reservationRoomId: room.id,
        guestId: room.guestId,
        guestName: room.guestName || "—",
        roomNumber: room.roomNumber,
        building: room.building,
        floor: room.floor,
        serviceKind: "PACKAGE_COMPONENT",
        mealCode: null,
        serviceReferenceId: component.serviceReferenceId,
        serviceNameSnapshot: component.serviceName || "Service",
        serviceDate,
        adultQuantity: quantity,
        childQuantity: 0,
        infantQuantity: 0,
        totalQuantity: quantity,
        sourceType: "PACKAGE",
        sourceId: component.componentId,
        componentId: component.componentId,
        departmentId: component.departmentId,
        mealPlanName: null,
        notesSnapshot: conciseNote(room.specialRequests),
      });
    }
  }
  return rows;
}

function componentAppliesToRoom(
  component: PackageComponentSource,
  roomId: string,
  isPrimaryRoom: boolean,
): boolean {
  if (component.reservationRoomId) return component.reservationRoomId === roomId;
  if (component.kind === "meal_plan") return true;
  return isPrimaryRoom;
}

function mealRow(
  room: ReservationRoomSource,
  policy: MealApplicabilityPolicy,
  meal: MealCode,
  plan: MealPlanSource,
  serviceDate: string,
  sourceType: "RATE_PLAN_MEAL" | "PACKAGE",
  sourceId: string,
  componentId: string | null,
  departmentId: string | null,
): ExpectedEntitlement {
  const pax = mealPax(room, policy);
  return {
    generationKey: generationKey({
      restaurantId: room.restaurantId,
      reservationRoomId: room.id,
      serviceDate,
      sourceType,
      sourceId,
      identity: meal,
    }),
    restaurantId: room.restaurantId,
    reservationId: room.reservationId,
    reservationRoomId: room.id,
    guestId: room.guestId,
    guestName: room.guestName || "—",
    roomNumber: room.roomNumber,
    building: room.building,
    floor: room.floor,
    serviceKind: "MEAL",
    mealCode: meal,
    serviceReferenceId: plan.id,
    serviceNameSnapshot: mealLabel(meal),
    serviceDate,
    adultQuantity: pax.adults,
    childQuantity: pax.children,
    infantQuantity: pax.infants,
    totalQuantity: pax.total,
    sourceType,
    sourceId,
    componentId,
    departmentId,
    mealPlanName: plan.name,
    notesSnapshot: conciseNote(room.specialRequests),
  };
}

export function mealLabel(meal: MealCode): string {
  if (meal === "BREAKFAST") return "Breakfast";
  if (meal === "LUNCH") return "Lunch";
  return "Dinner";
}

function conciseNote(value: string | null): string | null {
  const note = (value ?? "").trim();
  if (!note) return null;
  return note.slice(0, 240);
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
