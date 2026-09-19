/**
 * Card 3 Phase 8 — Revenue & Commercial Rules (pure helpers).
 * Setup catalogues only. Does not write hotel_rate_restrictions or inventory rules.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD3_COMMERCIAL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "restrictions", label: "Restrictions" },
  { id: "promotions", label: "Promotions" },
  { id: "seasons", label: "Seasons" },
  { id: "overbooking", label: "Overbooking" },
] as const;
export type Card3CommercialTabId = (typeof CARD3_COMMERCIAL_TABS)[number]["id"];

export const CARD3_COMMERCIAL_AUDIT_SECTION = "card3-commercial";
export const CARD3_COMMERCIAL_UNAVAILABLE =
  "Revenue & Commercial Rules are unavailable until their approved migration is applied.";

export const RESTRICTION_KINDS = [
  "min_stay",
  "stop_sell",
  "closed_to_arrival",
  "closed_to_departure",
] as const;
export type RestrictionKind = (typeof RESTRICTION_KINDS)[number];

export const RESTRICTION_KIND_LABELS: Record<RestrictionKind, string> = {
  min_stay: "Minimum stay",
  stop_sell: "Stop sell",
  closed_to_arrival: "Closed to arrival",
  closed_to_departure: "Closed to departure",
};

export const PROMO_KINDS = ["percent", "fixed", "free_night"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export const PROMO_KIND_LABELS: Record<PromoKind, string> = {
  percent: "Percent",
  fixed: "Fixed amount",
  free_night: "Free night",
};

export const SEASON_TYPES = ["high", "shoulder", "low", "custom"] as const;
export type SeasonType = (typeof SEASON_TYPES)[number];

export const SEASON_TYPE_LABELS: Record<SeasonType, string> = {
  high: "High",
  shoulder: "Shoulder",
  low: "Low",
  custom: "Custom",
};

export type CommercialCard3AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type CommercialRoomTypeRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type CommercialRestrictionRow = {
  id: string;
  code: string;
  name: string;
  restrictionKind: RestrictionKind;
  restrictionKindLabel: string;
  minStayNights: number | null;
  validFrom: string;
  validTo: string;
  description: string;
  active: boolean;
  roomTypeIds: string[];
};

export type CommercialPromotionRow = {
  id: string;
  code: string;
  name: string;
  promoKind: PromoKind;
  promoKindLabel: string;
  promoValue: number;
  validFrom: string;
  validTo: string;
  conditions: string;
  description: string;
  active: boolean;
  roomTypeIds: string[];
};

export type CommercialSeasonRow = {
  id: string;
  code: string;
  name: string;
  seasonType: SeasonType;
  seasonTypeLabel: string;
  validFrom: string;
  validTo: string;
  rateAdjustmentPercent: number | null;
  description: string;
  active: boolean;
  roomTypeIds: string[];
};

export type CommercialOverbookingOverlay = {
  overbookingAllowed: boolean;
  maximumOverbooking: number | null;
  percentageLimit: number | null;
  roomTypeLimitEnabled: boolean;
  dateBasedLimitEnabled: boolean;
  managerApprovalRequired: boolean;
  overridePermissionRequired: boolean;
  overbookingReasonRequired: boolean;
  overbookingAlertEnabled: boolean;
};

export type CommercialCard3Snapshot = {
  roomTypes: CommercialRoomTypeRef[];
  restrictions: CommercialRestrictionRow[];
  promotions: CommercialPromotionRow[];
  seasons: CommercialSeasonRow[];
  overbooking: CommercialOverbookingOverlay | null;
};

export type CommercialCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function isValidDateWindow(from: string, to: string): boolean {
  return Boolean(from) && Boolean(to) && to >= from;
}

function isActiveWindow(row: { active: boolean; validFrom: string; validTo: string }): boolean {
  return row.active && isValidDateWindow(row.validFrom, row.validTo);
}

export function evaluateCommercialCard3Readiness(
  snapshot: CommercialCard3Snapshot,
): CommercialCard3Readiness {
  const blockers: string[] = [];
  const hasRows =
    snapshot.restrictions.length > 0 ||
    snapshot.promotions.length > 0 ||
    snapshot.seasons.length > 0;

  if (!snapshot.restrictions.some(isActiveWindow)) {
    blockers.push("Save at least one active restriction with valid dates.");
  }
  if (!snapshot.promotions.some(isActiveWindow)) {
    blockers.push("Save at least one active promotion with valid dates.");
  }
  if (!snapshot.seasons.some(isActiveWindow)) {
    blockers.push("Save at least one active season with valid dates.");
  }

  if (!hasRows) return { ready: false, status: "not_started", blockers };
  if (blockers.length === 0) return { ready: true, status: "complete", blockers };
  return { ready: false, status: "in_progress", blockers };
}
