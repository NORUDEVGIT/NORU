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
