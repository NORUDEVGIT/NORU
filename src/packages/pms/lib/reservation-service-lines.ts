/**
 * Priced service lines for reservations. Quantity follows the configured pricing
 * unit; the guest total mirrors post_folio_service_charge (unit amount x quantity,
 * taxed as source 'service').
 */
import {
  defaultServiceQuantity,
  effectiveServiceQuantity,
  serviceChargeFigures,
  serviceQuantityEditable,
  serviceUnitQuantityLabel,
  type ServiceChargeRules,
  type ServicePricingUnit,
} from "./room-charge-guest-total.ts";

export type ServiceStayContext = {
  nights: number;
  persons: number;
  rooms: number;
};

export type ServiceLineInput = {
  pricingUnit: ServicePricingUnit | null;
  unitAmount: number | null;
  quantity: number;
  departmentId?: string | null;
};

export type ServiceLineFigures = {
  quantity: number;
  net: number | null;
  total: number | null;
  taxLines: string[];
};

export function serviceLineFigures(
  line: ServiceLineInput,
  rules?: ServiceChargeRules | null,
): ServiceLineFigures {
  const quantity = effectiveServiceQuantity(line.pricingUnit, line.quantity);
  if (line.unitAmount == null || !(line.unitAmount > 0)) {
    return { quantity, net: null, total: null, taxLines: [] };
  }
  const figures = serviceChargeFigures(line.unitAmount, quantity, rules, line.departmentId ?? null);
  return {
    quantity,
    net: Math.round(line.unitAmount * quantity * 100) / 100,
    total: figures.total,
    taxLines: figures.lines.map((row) => row.name),
  };
}

function unitNoun(unit: ServicePricingUnit | null, quantity: number): string {
  const plural = quantity !== 1;
  switch (unit) {
    case "per_night":
      return plural ? "nights" : "night";
    case "per_person":
      return plural ? "persons" : "person";
    case "per_room":
      return plural ? "rooms" : "room";
    default:
      return plural ? "items" : "item";
  }
}

/** "3 nights × $50.00"; null when the price is per service (no calculation). */
export function serviceLineDetail(
  line: ServiceLineInput,
  money: (value: number) => string,
): string | null {
  if (line.unitAmount == null || !serviceQuantityEditable(line.pricingUnit)) return null;
  const quantity = effectiveServiceQuantity(line.pricingUnit, line.quantity);
  return `${quantity} ${unitNoun(line.pricingUnit, quantity)} × ${money(line.unitAmount)}`;
}

export function seedServiceQuantity(
  unit: ServicePricingUnit | null,
  stay: ServiceStayContext,
): number {
  return defaultServiceQuantity(unit, stay);
}

export { serviceQuantityEditable, serviceUnitQuantityLabel };

/** Check-in feedback for auto-posted reservation services; null when there is nothing to say. */
export function servicePostingNotice(
  posting: { posted: number; skipped: number; failed: boolean } | null | undefined,
): { tone: "success" | "warning"; message: string } | null {
  if (!posting) return null;
  if (posting.failed) {
    return {
      tone: "warning",
      message: "Reservation services could not be posted. Post them from Cashiering.",
    };
  }
  if (posting.skipped > 0) {
    return {
      tone: "warning",
      message: `${posting.skipped} reservation ${posting.skipped === 1 ? "service" : "services"} could not be posted. Post from Cashiering.`,
    };
  }
  if (posting.posted > 0) {
    return {
      tone: "success",
      message: `${posting.posted} reservation ${posting.posted === 1 ? "service" : "services"} posted to the folio.`,
    };
  }
  return null;
}

export function sumServiceTotals(figures: ServiceLineFigures[]): number {
  return Math.round(figures.reduce((sum, row) => sum + (row.total ?? 0), 0) * 100) / 100;
}

/** Print line: "Airport transfer · 2 nights × $50.00 · $110.00" */
export function reservationServicePrintLine(
  name: string,
  line: ServiceLineInput,
  money: (value: number) => string,
  rules?: ServiceChargeRules | null,
): string {
  const figures = serviceLineFigures(line, rules);
  const detail = serviceLineDetail(line, money);
  const total = figures.total == null ? null : money(figures.total);
  return [name, detail, total].filter((part): part is string => Boolean(part)).join(" · ");
}
