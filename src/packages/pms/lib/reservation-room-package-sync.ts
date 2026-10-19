export type RoomPackageScope = {
  active: boolean;
  validFrom: string;
  validTo: string;
  chargeBasis: string;
  packagePrice: number | null;
  masterRoomTypeIds: string[];
  masterRatePlanIds: string[];
  activationRoomTypeIds: string[];
  activationRatePlanIds: string[];
  masterActive: boolean;
};

export type UnitPackageDecision = {
  kept: boolean;
  reason: string | null;
};

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

/** The night before departure, matching `unit.departure_date - 1` in package apply. */
export function previousStayDate(isoDate: string): string {
  const [year, month, day] = dateOnly(isoDate).split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Compatibility already enforced by `apply_hotel_reservation_room_package`.
 * A kept package stays. An incompatible one is only a review result until confirm.
 */
export function unitPackageKept(input: {
  roomTypeId: string;
  ratePlanId: string | null;
  arrivalDate: string;
  departureDate: string;
  scope: RoomPackageScope;
}): UnitPackageDecision {
  const { scope } = input;
  if (!scope.active || !scope.masterActive) {
    return { kept: false, reason: "PACKAGE_INACTIVE" };
  }
  const arrival = dateOnly(input.arrivalDate);
  const lastNight = previousStayDate(input.departureDate);
  if (arrival < dateOnly(scope.validFrom) || lastNight > dateOnly(scope.validTo)) {
    return { kept: false, reason: "PACKAGE_STAY_WINDOW_MISMATCH" };
  }
  if (scope.masterRoomTypeIds.length > 0 && !scope.masterRoomTypeIds.includes(input.roomTypeId)) {
    return { kept: false, reason: "PACKAGE_ROOM_TYPE_MISMATCH" };
  }
  if (
    scope.activationRoomTypeIds.length > 0 &&
    !scope.activationRoomTypeIds.includes(input.roomTypeId)
  ) {
    return { kept: false, reason: "PACKAGE_ROOM_TYPE_MISMATCH" };
  }
  if (
    scope.masterRatePlanIds.length > 0 &&
    (!input.ratePlanId || !scope.masterRatePlanIds.includes(input.ratePlanId))
  ) {
    return { kept: false, reason: "PACKAGE_RATE_PLAN_MISMATCH" };
  }
  if (
    scope.activationRatePlanIds.length > 0 &&
    (!input.ratePlanId || !scope.activationRatePlanIds.includes(input.ratePlanId))
  ) {
    return { kept: false, reason: "PACKAGE_RATE_PLAN_MISMATCH" };
  }
  if (scope.chargeBasis !== "per_stay") {
    return { kept: false, reason: "PACKAGE_CHARGE_BASIS_UNSUPPORTED" };
  }
  if (scope.packagePrice == null || scope.packagePrice <= 0) {
    return { kept: false, reason: "PACKAGE_PRICE_INVALID" };
  }
  return { kept: true, reason: null };
}
