/**
 * Card 3 Phase 3 — Rates & Pricing (pure helpers).
 * Setup masters are hotel_rate_*. Room types stay on Card 2.
 * Derived / corporate pricing is not in this schema.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD3_RATES_TABS = [
  { id: "overview", label: "Overview" },
  { id: "rate-plans", label: "Rate Plans" },
  { id: "room-rates", label: "Room Rates" },
  { id: "rate-calendar", label: "Rate Calendar" },
] as const;
export type Card3RatesTabId = (typeof CARD3_RATES_TABS)[number]["id"];

export const CARD3_RATES_AUDIT_SECTION = "card3-rates";
export const CARD3_RATES_UNAVAILABLE = "Rates & Pricing are unavailable until hotel rates are applied.";
export const CARD3_RATES_DERIVED_COPY =
  "Derived and corporate-style pricing is not in this schema. Card 3 does not invent a second rate engine.";
export const CARD3_RATES_CARD2_COPY =
  "Room types come from Rooms & Operations. Rates assign a price to an existing type. They do not create types.";

export type Card3RatesAuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type Card2RoomTypeRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type RateCategoryRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type RatePlanRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  currency: string;
  baseRate: number;
  active: boolean;
};

export type RateCalendarRow = {
  id: string;
  ratePlanId: string;
  ratePlanCode: string;
  rateDate: string;
  nightlyRate: number;
};

export type RatesCard3Snapshot = {
  roomTypes: Card2RoomTypeRef[];
  categories: RateCategoryRow[];
  plans: RatePlanRow[];
  calendar: RateCalendarRow[];
};

export type RatesCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function evaluateRatesCard3Readiness(snapshot: RatesCard3Snapshot): RatesCard3Readiness {
  const blockers: string[] = [];
  const typeIds = new Set(snapshot.roomTypes.map((row) => row.id));
  const hasRows = snapshot.plans.length > 0 || snapshot.calendar.length > 0;

  if (snapshot.roomTypes.length === 0) {
    blockers.push("Add a room type in Rooms & Operations before assigning rates.");
  }

  const completePlan = snapshot.plans.find(
    (row) => row.active && row.baseRate > 0 && typeIds.has(row.roomTypeId),
  );
  if (!completePlan) {
    blockers.push("Save at least one active rate plan with a price on an existing Card 2 room type.");
  }

  if (!hasRows) {
    return { ready: false, status: "not_started", blockers };
  }
  if (blockers.length === 0) {
    return { ready: true, status: "complete", blockers };
  }
  return { ready: false, status: "in_progress", blockers };
}
