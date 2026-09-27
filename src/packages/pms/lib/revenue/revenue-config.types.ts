/**
 * Rate & Revenue read models (Phase 1 Prompt 4).
 * Master configuration only. Distinct from operational calendar / restriction rows.
 */

export type RevenuePropertyContext = {
  propertyId: string;
  propertyName: string;
  timezone: string;
  businessDate: string;
  currency: string;
};

export type RevenueRoomType = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sellable: boolean;
};

export type RevenueRateCategory = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type RevenueRatePlan = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  roomTypeId: string;
  roomTypeName: string;
  currency: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
};

/** Property Setup commercial restriction template. Not an applied hotel_rate_restrictions row. */
export type RevenueRestrictionMaster = {
  id: string;
  code: string;
  name: string;
  restrictionKind: string;
  restrictionKindLabel: string;
  minStayNights: number | null;
  validFrom: string;
  validTo: string;
  description: string;
  active: boolean;
  roomTypeIds: string[];
};

export type RevenuePromotionMaster = {
  id: string;
  code: string;
  name: string;
  promoKind: string;
  promoKindLabel: string;
  promoValue: number;
  validFrom: string;
  validTo: string;
  conditions: string;
  description: string;
  active: boolean;
  roomTypeIds: string[];
};

export type RevenuePackageMaster = {
  id: string;
  code: string;
  name: string;
  packagePrice: number;
  typeLabel: string;
  active: boolean;
  roomTypeIds: string[];
  ratePlanIds: string[];
};

export type RevenueSeason = {
  id: string;
  code: string;
  name: string;
  seasonType: string;
  seasonTypeLabel: string;
  startDate: string;
  endDate: string;
  rateAdjustmentPercent: number | null;
  active: boolean;
  roomTypeIds: string[];
};

export type RevenueMarketSegment = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

/** Commercial booking-source master (pms_source_codes). Not reservation.origin staff/walk_in/direct_booking. */
export type RevenueBookingSource = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type RevenueSalesChannel = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type RevenueCorporateAgreement = {
  id: string;
  companyId: string;
  companyName: string;
  code: string;
  name: string;
  active: boolean;
  validFrom: string;
  validTo: string;
  currency: string;
};

export type RevenueBaseConfig = {
  property: RevenuePropertyContext;
  roomTypes: RevenueRoomType[];
  rateCategories: RevenueRateCategory[];
  ratePlans: RevenueRatePlan[];
};

export type RevenueCatalogueConfig = {
  available: boolean;
  marketSegments: RevenueMarketSegment[];
  bookingSources: RevenueBookingSource[];
  salesChannels: RevenueSalesChannel[];
};

export type RevenueCommercialMasters = {
  available: boolean;
  restrictionMasters: RevenueRestrictionMaster[];
  promotions: RevenuePromotionMaster[];
  seasons: RevenueSeason[];
};

export type RevenuePackageConfig = {
  available: boolean;
  packages: RevenuePackageMaster[];
};

export type RevenueCorporateConfig = {
  available: boolean;
  corporateAgreements: RevenueCorporateAgreement[];
};

export type RevenueConfig = RevenueBaseConfig & {
  restrictionMasters: RevenueRestrictionMaster[];
  promotions: RevenuePromotionMaster[];
  packages: RevenuePackageMaster[];
  seasons: RevenueSeason[];
  marketSegments: RevenueMarketSegment[];
  bookingSources: RevenueBookingSource[];
  salesChannels: RevenueSalesChannel[];
  corporateAgreements: RevenueCorporateAgreement[];
};
