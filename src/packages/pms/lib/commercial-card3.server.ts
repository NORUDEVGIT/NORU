/**
 * Card 3 Phase 8 — Revenue & Commercial Rules (pure helpers).
 * Staff surface owns Promotions + Pricing Seasons only.
 * Restrictions belong to Rate & Pricing; overbooking belongs to Inventory Rules.
 * Setup catalogues only. Does not write hotel_rate_restrictions or inventory rules.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

/** Staff-facing sections retained on this domain after ownership consolidation. */
export const CARD3_COMMERCIAL_TABS = [
  { id: "promotions", label: "Promotions" },
  { id: "pricing-seasons", label: "Pricing Seasons" },
] as const;
export type Card3CommercialTabId = (typeof CARD3_COMMERCIAL_TABS)[number]["id"];

/** Legacy focus values formerly used under this domain — redirected away from Card 3. */
export const CARD3_COMMERCIAL_LEGACY_FOCUSES = [
  "restrictions",
  "restriction",
  "overbooking",
  "overview",
  "seasons",
] as const;
export type Card3CommercialLegacyFocus = (typeof CARD3_COMMERCIAL_LEGACY_FOCUSES)[number];

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

/**
 * Kinds staff may create in Property Setup.
 * `free_night` remains in PROMO_KINDS for legacy rows but is not V1-executable
 * (pricing/activation reject it with PROMOTION_KIND_UNSUPPORTED).
 */
export const PROMO_CREATE_KINDS = ["percent", "fixed"] as const;
export type PromoCreateKind = (typeof PROMO_CREATE_KINDS)[number];

/** Staff-facing discount/offer types persisted as promo_kind (no separate classification column). */
export const PROMO_KIND_LABELS: Record<PromoKind, string> = {
  percent: "Percentage Discount",
  fixed: "Fixed Amount Discount",
  free_night: "Free Night (legacy)",
};

export const PROMOTION_WIZARD_STEPS = [
  { id: 1, title: "Promotion Details" },
  { id: 2, title: "Discount & Conditions" },
  { id: 3, title: "Applicability" },
  { id: 4, title: "Review" },
] as const;
export type PromotionWizardStepId = (typeof PROMOTION_WIZARD_STEPS)[number]["id"];

export const PROMOTION_CODE_STAFF_HINT =
  "Use 1–20 letters, numbers, or underscores.";

export const SEASON_TYPES = ["high", "shoulder", "low", "custom"] as const;
export type SeasonType = (typeof SEASON_TYPES)[number];

/** Staff-facing labels for persisted season_type values (high|shoulder|low|custom). */
export const SEASON_TYPE_LABELS: Record<SeasonType, string> = {
  high: "High Season",
  shoulder: "Regular Season",
  low: "Low Season",
  custom: "Custom",
};

export const PRICING_SEASON_WIZARD_STEPS = [
  { id: 1, title: "Season Details" },
  { id: 2, title: "Applicability" },
  { id: 3, title: "Review" },
] as const;
export type PricingSeasonWizardStepId = (typeof PRICING_SEASON_WIZARD_STEPS)[number]["id"];

export const PRICING_SEASON_CODE_STAFF_HINT =
  "Use 1–20 letters, numbers, or underscores.";

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

/** Retained for API/snapshot shape; Card 3 no longer displays overbooking. */
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
  /** Retained for backward compatibility / revenue config; not edited on this page. */
  restrictions: CommercialRestrictionRow[];
  promotions: CommercialPromotionRow[];
  seasons: CommercialSeasonRow[];
  /** Always null on Card 3 load — Inventory Rules is the source of truth. */
  overbooking: CommercialOverbookingOverlay | null;
};

export type CommercialCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export function isValidDateWindow(from: string, to: string): boolean {
  return Boolean(from) && Boolean(to) && to >= from;
}

/**
 * Optional domain readiness.
 * Zero promotions and zero pricing seasons are valid and never block activation.
 * Restrictions / overbooking never gate this domain.
 * Invalid saved promotion/season rows are warnings only.
 */
export function evaluateCommercialCard3Readiness(
  snapshot: CommercialCard3Snapshot,
): CommercialCard3Readiness {
  const warnings: string[] = [];

  for (const row of snapshot.promotions) {
    if (!isValidDateWindow(row.validFrom, row.validTo)) {
      warnings.push(`Promotion “${row.name || row.code}” has an invalid date window.`);
    }
  }
  for (const row of snapshot.seasons) {
    if (!isValidDateWindow(row.validFrom, row.validTo)) {
      warnings.push(`Pricing season “${row.name || row.code}” has an invalid date window.`);
    }
  }

  return {
    ready: true,
    status: "complete",
    blockers: [],
    warnings,
  };
}
