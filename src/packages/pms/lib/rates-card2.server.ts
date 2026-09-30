/**
 * PMS Property Setup Card 2 — Rate & Pricing (pure helpers and types).
 * Canonical owner for master rate categories, rate plans, base rates,
 * and room type relationships.
 *
 * Operational overrides and daily rate adjustments live in Rate & Revenue.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD2_RATES_AUDIT_SECTION = "card2-rates";
export const CARD2_RATES_UNAVAILABLE =
  "Rates & Pricing are unavailable until hotel rates are applied.";
export const CARD2_RATES_DERIVED_COPY =
  "Derived and corporate-style pricing is not in this schema. Card 2 does not invent a second rate engine.";
export const CARD2_RATES_ROOM_TYPES_COPY =
  "Room types come from Rooms & Operations. Rates assign a price to an existing type. They do not create types.";

export type Card2RatesAuditRow = {
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
  validFrom?: string | null;
  validTo?: string | null;
  active: boolean;
};

export type RatesCard2Snapshot = {
  roomTypes: Card2RoomTypeRef[];
  categories: RateCategoryRow[];
  plans: RatePlanRow[];
};

export type RatesCard2Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function evaluateRatesCard2Readiness(snapshot: RatesCard2Snapshot): RatesCard2Readiness {
  const blockers: string[] = [];
  const typeIds = new Set(snapshot.roomTypes.map((row) => row.id));
  const hasRows = snapshot.plans.length > 0 || snapshot.categories.length > 0;

  if (snapshot.roomTypes.length === 0) {
    blockers.push("Add a room type in Rooms & Operations before assigning rates.");
  }

  const completePlan = snapshot.plans.find(
    (row) => row.active && row.baseRate > 0 && typeIds.has(row.roomTypeId),
  );
  if (!completePlan) {
    blockers.push(
      "Save at least one active rate plan with a price on an existing Card 2 room type.",
    );
  }

  if (!hasRows) {
    return { ready: false, status: "not_started", blockers };
  }
  if (blockers.length === 0) {
    return { ready: true, status: "complete", blockers };
  }
  return { ready: false, status: "in_progress", blockers };
}
