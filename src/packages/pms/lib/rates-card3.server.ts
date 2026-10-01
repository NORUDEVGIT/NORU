/**
 * Card 3 Phase 3 — Rates & Pricing (compatibility aliases).
 * Rate & Pricing has been migrated to Card 2 (Rooms & Operations).
 * This module re-exports types and evaluators from rates-card2.server for backward compatibility.
 */

import {
  evaluateRatesCard2Readiness,
  type RatesCard2Snapshot,
} from "./rates-card2.server.ts";

export const CARD3_RATES_TABS = [
  { id: "overview", label: "Overview" },
  { id: "rate-plans", label: "Rate Plans" },
  { id: "room-rates", label: "Room Rates" },
  { id: "rate-calendar", label: "Rate Calendar" },
] as const;
export type Card3RatesTabId = (typeof CARD3_RATES_TABS)[number]["id"];

export const CARD3_RATES_AUDIT_SECTION = "card3-rates";
export const CARD3_RATES_UNAVAILABLE =
  "Rates & Pricing are unavailable until hotel rates are applied.";
export const CARD3_RATES_DERIVED_COPY =
  "Derived and corporate-style pricing is not in this schema. Card 3 does not invent a second rate engine.";
export const CARD3_RATES_CARD2_COPY =
  "Room types come from Rooms & Operations. Rates assign a price to an existing type. They do not create types.";

export type {
  Card2RatesAuditRow as Card3RatesAuditRow,
  Card2RoomTypeRef,
  RateCategoryRow,
  RatePlanRow,
  RatesCard2Snapshot as RatesCard3Snapshot,
  RatesCard2Readiness as RatesCard3Readiness,
} from "./rates-card2.server.ts";

export type RateCalendarRow = {
  id: string;
  ratePlanId: string;
  ratePlanCode: string;
  rateDate: string;
  nightlyRate: number;
};

/** @deprecated Re-exported from Card 2 canonical evaluator. */
export function evaluateRatesCard3Readiness(snapshot: RatesCard2Snapshot) {
  return evaluateRatesCard2Readiness(snapshot);
}
