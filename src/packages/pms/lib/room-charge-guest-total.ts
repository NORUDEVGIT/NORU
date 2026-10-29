/**
 * Guest-facing room charge total. Mirrors preview_folio_charge_scoped for a
 * room charge: inclusive taxes are carved out of the entered rate, exclusive
 * taxes and service charges are added on the pretax base. An occupancy fee
 * configured as a room tax is one of those tax lines.
 */
import { computeTaxComponentAmount, roundMoney, type TaxComponentInput } from "./cashiering-tax.ts";

export type RoomChargeTaxRule = TaxComponentInput & { code: string; name?: string };
export type RoomChargeServiceRule = {
  code: string;
  name?: string;
  chargeType: TaxComponentInput["chargeType"];
  rate: number;
};

export type RoomChargeRules = {
  taxes: RoomChargeTaxRule[];
  services: RoomChargeServiceRule[];
};

export type PostedRoomChargeLine = {
  name: string;
  amount: number;
};

export type PostedRoomChargePreview = {
  netAmount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  lines: PostedRoomChargeLine[];
};

function chargeLabel(rule: {
  name?: string;
  code: string;
  chargeType: string;
  rate: number;
  calculation?: string;
}): string {
  const title = rule.name?.trim() || rule.code;
  const labelled = rule.chargeType === "percentage" ? `${title} (${rule.rate}%)` : title;
  return rule.calculation === "inclusive" ? `${labelled} included` : labelled;
}

function byChargeOrder(left: { chargeType: string; code: string }, right: { chargeType: string; code: string }) {
  const type = (left.chargeType === "fixed" ? 0 : 1) - (right.chargeType === "fixed" ? 0 : 1);
  if (type !== 0) return type;
  return left.code.localeCompare(right.code);
}

export function previewPostedRoomCharge(
  enteredAmount: number,
  taxes: RoomChargeTaxRule[],
  services: RoomChargeServiceRule[] = [],
): PostedRoomChargePreview {
  const entered = roundMoney(enteredAmount);
  const lines: PostedRoomChargeLine[] = [];
  if (!(entered > 0)) return { netAmount: 0, tax: 0, serviceCharge: 0, total: 0, lines };

  const orderedTaxes = [...taxes].sort((left, right) => {
    const calculation =
      (left.calculation === "inclusive" ? 0 : 1) - (right.calculation === "inclusive" ? 0 : 1);
    if (calculation !== 0) return calculation;
    return byChargeOrder(left, right);
  });

  let remaining = entered;
  let parentBase = entered;
  let taxTotal = 0;
  const inclusive = orderedTaxes.filter((tax) => tax.calculation === "inclusive");
  if (inclusive.length > 0) {
    for (const tax of inclusive) {
      const line = computeTaxComponentAmount(remaining, tax);
      if (line <= 0) continue;
      remaining = roundMoney(remaining - line);
      taxTotal = roundMoney(taxTotal + line);
      lines.push({ name: chargeLabel(tax), amount: line });
    }
    parentBase = remaining;
  }

  for (const tax of orderedTaxes) {
    if (tax.calculation === "inclusive") continue;
    const line = computeTaxComponentAmount(parentBase, tax);
    if (line <= 0) continue;
    taxTotal = roundMoney(taxTotal + line);
    lines.push({ name: chargeLabel(tax), amount: line });
  }

  let serviceTotal = 0;
  for (const service of [...services].sort(byChargeOrder)) {
    const line = computeTaxComponentAmount(parentBase, {
      chargeType: service.chargeType,
      rate: service.rate,
      calculation: "exclusive",
    });
    if (line <= 0) continue;
    serviceTotal = roundMoney(serviceTotal + line);
    lines.push({ name: chargeLabel({ ...service, calculation: "exclusive" }), amount: line });
  }

  return {
    netAmount: parentBase,
    tax: taxTotal,
    serviceCharge: serviceTotal,
    total: roundMoney(parentBase + taxTotal + serviceTotal),
    lines,
  };
}

/** Taxes and service charges that post on a package charge. Rate-plan rules do not. */
export function packageChargeScopeApplies(
  scope: string | null | undefined,
  basis?: string | null,
): boolean {
  if (scope === "all" || scope === "packages") return true;
  if (scope) return false;
  return basis === "all";
}

export function packageChargeFigures(
  amount: number,
  rules?: RoomChargeRules | null,
): PostedRoomChargePreview {
  return previewPostedRoomCharge(amount, rules?.taxes ?? [], rules?.services ?? []);
}

/** Same stack as create-reservation Expected Total: room + packages + services. */
export function sumReservationGuestTotal(
  room: number | null | undefined,
  packages = 0,
  services = 0,
): number | null {
  const packageAmount = Number.isFinite(packages) && packages > 0 ? packages : 0;
  const serviceAmount = Number.isFinite(services) && services > 0 ? services : 0;
  if (room == null && packageAmount <= 0 && serviceAmount <= 0) return null;
  return Math.round(((room ?? 0) + packageAmount + serviceAmount) * 100) / 100;
}

export type ServicePricingUnit = "per_service" | "per_room" | "per_item" | "per_person" | "per_night";

export const SERVICE_QUANTITY_MAX = 99;

/** Department-scoped rules are keyed by billing department id. */
export type ServiceChargeRules = RoomChargeRules & {
  departmentTaxes: Record<string, RoomChargeTaxRule[]>;
  departmentServices: Record<string, RoomChargeServiceRule[]>;
};

export function serviceQuantityEditable(unit: string | null | undefined): boolean {
  return unit === "per_room" || unit === "per_item" || unit === "per_person" || unit === "per_night";
}

export function serviceUnitLabel(unit: string | null | undefined): string {
  switch (unit) {
    case "per_service":
      return "Per service";
    case "per_room":
      return "Per room";
    case "per_item":
      return "Per item";
    case "per_person":
      return "Per person";
    case "per_night":
      return "Per night";
    default:
      return "—";
  }
}

export function serviceUnitQuantityLabel(unit: string | null | undefined): string {
  switch (unit) {
    case "per_room":
      return "Rooms";
    case "per_person":
      return "Persons";
    case "per_night":
      return "Nights";
    default:
      return "Quantity";
  }
}

export function clampServiceQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SERVICE_QUANTITY_MAX, Math.max(1, Math.round(value)));
}

export function defaultServiceQuantity(
  unit: string | null | undefined,
  stay: { nights?: number | null; persons?: number | null; rooms?: number | null },
): number {
  switch (unit) {
    case "per_night":
      return clampServiceQuantity(stay.nights ?? 1);
    case "per_person":
      return clampServiceQuantity(stay.persons ?? 1);
    case "per_room":
      return clampServiceQuantity(stay.rooms ?? 1);
    default:
      return 1;
  }
}

export function effectiveServiceQuantity(unit: string | null | undefined, quantity: number): number {
  return serviceQuantityEditable(unit) ? clampServiceQuantity(quantity) : 1;
}

export function serviceRulesForDepartment(
  rules: ServiceChargeRules | null | undefined,
  departmentId: string | null | undefined,
): RoomChargeRules {
  if (!rules) return { taxes: [], services: [] };
  const extraTaxes = departmentId ? (rules.departmentTaxes[departmentId] ?? []) : [];
  const extraServices = departmentId ? (rules.departmentServices[departmentId] ?? []) : [];
  return {
    taxes: [...rules.taxes, ...extraTaxes],
    services: [...rules.services, ...extraServices],
  };
}

/** Mirrors post_folio_service_charge: entered amount = unit amount x quantity, taxed as source service. */
export function serviceChargeFigures(
  unitAmount: number,
  quantity: number,
  rules?: ServiceChargeRules | null,
  departmentId?: string | null,
): PostedRoomChargePreview {
  const scoped = serviceRulesForDepartment(rules, departmentId);
  return previewPostedRoomCharge(roundMoney(unitAmount * quantity), scoped.taxes, scoped.services);
}
