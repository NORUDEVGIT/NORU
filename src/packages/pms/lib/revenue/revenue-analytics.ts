/**
 * Revenue Performance & Commercial Analytics Pure Domain Engine (P8-STEP-02).
 *
 * Implements authoritative stay-date allocation from nightly_rate_snapshot.
 * Non-inventory dimension filters strictly disable Occupancy and RevPAR.
 * All reservation counts reflect COUNT(DISTINCT reservation_id).
 * Pure functions: client/server safe, no database or server dependencies.
 */

export const REVENUE_ANALYTICS_MAX_RANGE_DAYS = 90;

export const REVENUE_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;

export type RevenuePerformanceQuery = {
  restaurantId: string;
  fromDate: string;
  toDate: string;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
  marketSegmentId?: string | null;
  commercialSourceId?: string | null;
  technicalOrigin?: string | null;
  salesChannelId?: string | null;
};

export type RevenuePerformanceSummary = {
  bookedRoomRevenue: number;
  soldRoomNights: number;
  availableRoomNights: number | null;
  pricedRoomNights: number;
  pricedShare: number;
  occupancyPct: number | null;
  adr: number;
  revpar: number | null;
  reservationCount: number;
  inventoryMetricSupport: "SUPPORTED" | "NOT_MEANINGFUL";
};

export type DailyRevenueTrendRow = {
  date: string;
  bookedRoomRevenue: number;
  soldRoomNights: number;
  availableRoomNights: number | null;
  pricedRoomNights: number;
  pricedShare: number;
  occupancyPct: number | null;
  adr: number;
  revpar: number | null;
  reservationCount: number;
  inventoryMetricSupport: "SUPPORTED" | "NOT_MEANINGFUL";
};

export type RoomTypeBreakdownRow = {
  roomTypeId: string;
  roomTypeName: string;
  soldRoomNights: number;
  availableRoomNights: number;
  bookedRoomRevenue: number;
  pricedRoomNights: number;
  reservationCount: number;
  occupancyPct: number;
  adr: number;
  revpar: number;
  shareOfRevenue: number;
};

export type RatePlanBreakdownRow = {
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  soldRoomNights: number;
  bookedRoomRevenue: number;
  pricedRoomNights: number;
  reservationCount: number;
  adr: number;
  shareOfRevenue: number;
  occupancyPct: null;
  revpar: null;
  inventoryMetricSupport: "NOT_MEANINGFUL";
};

export type SegmentBreakdownRow = {
  marketSegment: string;
  marketSegmentLabel: string;
  soldRoomNights: number;
  bookedRoomRevenue: number;
  reservationCount: number;
  adr: number;
  shareOfRevenue: number;
  occupancyPct: null;
  revpar: null;
  inventoryMetricSupport: "NOT_MEANINGFUL";
};

export type CommercialSourceBreakdownRow = {
  commercialSource: string;
  commercialSourceLabel: string;
  soldRoomNights: number;
  bookedRoomRevenue: number;
  reservationCount: number;
  adr: number;
  shareOfRevenue: number;
  occupancyPct: null;
  revpar: null;
  inventoryMetricSupport: "NOT_MEANINGFUL";
};

export type TechnicalOriginBreakdownRow = {
  origin: string;
  originLabel: string;
  soldRoomNights: number;
  bookedRoomRevenue: number;
  reservationCount: number;
  adr: number;
  shareOfRevenue: number;
  occupancyPct: null;
  revpar: null;
  inventoryMetricSupport: "NOT_MEANINGFUL";
};

export type RevenuePerformanceOverview = {
  restaurantId: string;
  fromDate: string;
  toDate: string;
  rangeDays: number;
  currency: string;
  dateBasis: "stay_date";
  hasNonInventoryFilter: boolean;
  salesChannelBreakdown: "unsupported";
  summary: RevenuePerformanceSummary;
  dailyTrend: DailyRevenueTrendRow[];
  breakdowns: {
    roomTypes: RoomTypeBreakdownRow[];
    ratePlans: RatePlanBreakdownRow[];
    marketSegments: SegmentBreakdownRow[];
    commercialSources: CommercialSourceBreakdownRow[];
    technicalOrigins: TechnicalOriginBreakdownRow[];
  };
  distribution: {
    averageLeadTimeDays: number | null;
    averageLengthOfStayNights: number;
  };
  warnings: {
    unpricedSoldNights: number;
    legacyDimensionCoverage: boolean;
    availabilityIncludesOperationallyUnavailableRooms: boolean;
    mixedCurrencyDetected: boolean;
  };
};

export type PromotionPerformanceRow = {
  promotionActivationId: string;
  promotionName: string;
  reservationCount: number;
  soldRoomNights: number;
  preCommercialRoomAmount: number;
  discountAmount: number;
  postPromotionRoomAmount: number;
};

export type PackagePerformanceRow = {
  packageActivationId: string;
  packageName: string;
  reservationCount: number;
  selectionCount: number;
  bookedPackageAmount: number;
  soldRoomNights: number;
};

export type CommercialPerformance = {
  restaurantId: string;
  fromDate: string;
  toDate: string;
  currency: string;
  dateBasis: "stay_date";
  promotions: PromotionPerformanceRow[];
  packages: PackagePerformanceRow[];
  metadata: {
    attributionStartMigration: "0104";
    claimsSettlement: false;
    claimsRoi: false;
  };
};

export interface NightlyRate {
  date: string;
  rate: number;
}

export function parseSnapshot(raw: unknown): NightlyRate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is { date: string; rate: number | string } => !!n && typeof n === "object")
    .map((n) => ({ date: String(n.date), rate: Number(n.rate) }));
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string, maxDays = 120): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < maxDays) {
    out.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return out;
}

export function validateAnalyticsRange(
  from: string,
  to: string,
): { fromDate: string; toDate: string; dayCount: number } {
  const normalizedFrom = to < from ? to : from;
  const normalizedTo = to < from ? from : to;
  const dates = eachDate(normalizedFrom, normalizedTo, REVENUE_ANALYTICS_MAX_RANGE_DAYS + 5);
  if (dates.length > REVENUE_ANALYTICS_MAX_RANGE_DAYS) {
    throw new Error("REVENUE_ANALYTICS_RANGE_EXCEEDS_MAX");
  }
  return {
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    dayCount: dates.length,
  };
}

export type RawReservationInput = {
  id: string;
  room_type_id: string;
  rate_plan_id: string | null;
  market_segment: string | null;
  commercial_booking_source: string | null;
  source: string;
  arrival_date: string;
  departure_date: string;
  nightly_rate_snapshot: unknown;
  currency: string | null;
  created_at: string;
  status: string;
};

export function computeRevenuePerformanceOverview(options: {
  query: RevenuePerformanceQuery;
  reservations: RawReservationInput[];
  activeRooms: Array<{ id: string; room_type_id: string }>;
  roomTypes: Array<{ id: string; name: string }>;
  ratePlans: Array<{ id: string; code: string; name: string }>;
  propertyCurrency: string;
}): RevenuePerformanceOverview {
  const { query, reservations, activeRooms, roomTypes, ratePlans, propertyCurrency } = options;
  const { fromDate, toDate, dayCount } = validateAnalyticsRange(query.fromDate, query.toDate);
  const stayDates = eachDate(fromDate, toDate, REVENUE_ANALYTICS_MAX_RANGE_DAYS);
  const dateSet = new Set(stayDates);

  const roomsByType = new Map<string, number>();
  for (const room of activeRooms) {
    roomsByType.set(room.room_type_id, (roomsByType.get(room.room_type_id) ?? 0) + 1);
  }
  const totalActiveRooms = activeRooms.length;

  const roomTypeNameMap = new Map<string, string>(
    roomTypes.map((t) => [t.id, t.name || "Room Type"]),
  );
  const ratePlanMap = new Map<string, { code: string; name: string }>(
    ratePlans.map((p) => [p.id, { code: p.code || "PLAN", name: p.name || "Rate Plan" }]),
  );

  // Check whether non-inventory dimension filter is applied
  const hasNonInventoryFilter = Boolean(
    query.ratePlanId ||
    query.marketSegmentId ||
    query.commercialSourceId ||
    query.technicalOrigin ||
    query.salesChannelId,
  );

  // Detect currency mismatch
  let mixedCurrencyDetected = false;
  for (const r of reservations) {
    if (r.currency && r.currency !== propertyCurrency) {
      mixedCurrencyDetected = true;
      break;
    }
  }

  // Daily stay aggregation buckets
  type DayBucket = {
    sold: number;
    revenue: number;
    priced: number;
    resIds: Set<string>;
  };
  const dayBuckets = new Map<string, DayBucket>();
  for (const date of stayDates) {
    dayBuckets.set(date, { sold: 0, revenue: 0, priced: 0, resIds: new Set() });
  }

  // Dimension aggregation buckets (distinct reservation IDs)
  type BreakdownBucket = {
    id: string;
    label: string;
    subLabel?: string;
    sold: number;
    revenue: number;
    priced: number;
    resIds: Set<string>;
  };

  const typeBuckets = new Map<string, BreakdownBucket>();
  const planBuckets = new Map<string, BreakdownBucket>();
  const segmentBuckets = new Map<string, BreakdownBucket>();
  const sourceBuckets = new Map<string, BreakdownBucket>();
  const originBuckets = new Map<string, BreakdownBucket>();

  const overallDistinctResIds = new Set<string>();
  let overallSoldRoomNights = 0;
  let overallBookedRoomRevenue = 0;
  let overallPricedRoomNights = 0;
  let unpricedSoldNights = 0;
  let legacyDimensionCoverage = false;

  let totalLeadTimeDays = 0;
  let leadTimeCount = 0;
  let totalLengthOfStayNights = 0;

  for (const r of reservations) {
    // Lead time & Length of stay
    const arrivalTime = new Date(`${r.arrival_date}T00:00:00Z`).getTime();
    const departureTime = new Date(`${r.departure_date}T00:00:00Z`).getTime();
    const losNights = Math.max(
      1,
      Math.round((departureTime - arrivalTime) / (1000 * 60 * 60 * 24)),
    );

    if (r.created_at) {
      const createdDate = r.created_at.slice(0, 10);
      const createdTime = new Date(`${createdDate}T00:00:00Z`).getTime();
      const leadDays = Math.max(0, Math.round((arrivalTime - createdTime) / (1000 * 60 * 60 * 24)));
      totalLeadTimeDays += leadDays;
      leadTimeCount += 1;
    }
    totalLengthOfStayNights += losNights;

    // Expand stay nights for this reservation: [arrival_date, departure_date)
    const stayNightsInRange: string[] = [];
    let cur = r.arrival_date;
    while (cur < r.departure_date) {
      if (dateSet.has(cur)) {
        stayNightsInRange.push(cur);
      }
      cur = shiftIsoDate(cur, 1);
    }

    if (stayNightsInRange.length === 0) continue;

    overallDistinctResIds.add(r.id);

    // Parse snapshot
    const nightlyList = parseSnapshot(r.nightly_rate_snapshot);
    const nightlyMap = new Map<string, number>();
    for (const item of nightlyList) {
      nightlyMap.set(item.date, item.rate);
    }

    const typeKey = r.room_type_id;
    const planKey = r.rate_plan_id || "unassigned";
    const segmentKey = r.market_segment || "unassigned";
    const sourceKey = r.commercial_booking_source || "unassigned";
    const originKey = r.source || "direct_booking";

    if (!r.rate_plan_id || !r.market_segment || !r.commercial_booking_source) {
      legacyDimensionCoverage = true;
    }

    // Ensure buckets exist
    if (!typeBuckets.has(typeKey)) {
      typeBuckets.set(typeKey, {
        id: typeKey,
        label: roomTypeNameMap.get(typeKey) || "Room Type",
        sold: 0,
        revenue: 0,
        priced: 0,
        resIds: new Set(),
      });
    }
    if (!planBuckets.has(planKey)) {
      const planMeta = planKey !== "unassigned" ? ratePlanMap.get(planKey) : null;
      planBuckets.set(planKey, {
        id: planKey,
        label: planMeta?.name || "Standard / Unspecified",
        subLabel: planMeta?.code || "UNSPECIFIED",
        sold: 0,
        revenue: 0,
        priced: 0,
        resIds: new Set(),
      });
    }
    if (!segmentBuckets.has(segmentKey)) {
      segmentBuckets.set(segmentKey, {
        id: segmentKey,
        label: segmentKey !== "unassigned" ? segmentKey : "Unassigned / Legacy",
        sold: 0,
        revenue: 0,
        priced: 0,
        resIds: new Set(),
      });
    }
    if (!sourceBuckets.has(sourceKey)) {
      sourceBuckets.set(sourceKey, {
        id: sourceKey,
        label: sourceKey !== "unassigned" ? sourceKey : "Unassigned / Legacy",
        sold: 0,
        revenue: 0,
        priced: 0,
        resIds: new Set(),
      });
    }
    if (!originBuckets.has(originKey)) {
      originBuckets.set(originKey, {
        id: originKey,
        label: originKey,
        sold: 0,
        revenue: 0,
        priced: 0,
        resIds: new Set(),
      });
    }

    // Add reservation count (COUNT(DISTINCT reservation_id))
    typeBuckets.get(typeKey)!.resIds.add(r.id);
    planBuckets.get(planKey)!.resIds.add(r.id);
    segmentBuckets.get(segmentKey)!.resIds.add(r.id);
    sourceBuckets.get(sourceKey)!.resIds.add(r.id);
    originBuckets.get(originKey)!.resIds.add(r.id);

    // Nightly rate accumulation
    for (const nightDate of stayNightsInRange) {
      overallSoldRoomNights += 1;
      const rate = nightlyMap.get(nightDate);
      const isPriced = rate !== undefined;

      if (isPriced) {
        overallBookedRoomRevenue += rate;
        overallPricedRoomNights += 1;
      } else {
        unpricedSoldNights += 1;
      }

      // Day bucket
      const day = dayBuckets.get(nightDate)!;
      day.sold += 1;
      day.resIds.add(r.id);
      if (isPriced) {
        day.revenue += rate;
        day.priced += 1;
      }

      // Type bucket
      const tb = typeBuckets.get(typeKey)!;
      tb.sold += 1;
      if (isPriced) {
        tb.revenue += rate;
        tb.priced += 1;
      }

      // Plan bucket
      const pb = planBuckets.get(planKey)!;
      pb.sold += 1;
      if (isPriced) {
        pb.revenue += rate;
        pb.priced += 1;
      }

      // Segment bucket
      const sb = segmentBuckets.get(segmentKey)!;
      sb.sold += 1;
      if (isPriced) {
        sb.revenue += rate;
        sb.priced += 1;
      }

      // Commercial source bucket
      const cb = sourceBuckets.get(sourceKey)!;
      cb.sold += 1;
      if (isPriced) {
        cb.revenue += rate;
        cb.priced += 1;
      }

      // Technical origin bucket
      const ob = originBuckets.get(originKey)!;
      ob.sold += 1;
      if (isPriced) {
        ob.revenue += rate;
        ob.priced += 1;
      }
    }
  }

  // Summary Inventory metrics
  let availableRoomNights: number | null = null;
  let occupancyPct: number | null = null;
  let revpar: number | null = null;
  let inventoryMetricSupport: "SUPPORTED" | "NOT_MEANINGFUL" = "NOT_MEANINGFUL";

  if (!hasNonInventoryFilter) {
    if (query.roomTypeId) {
      const typeActive = roomsByType.get(query.roomTypeId) ?? 0;
      availableRoomNights = typeActive * dayCount;
    } else {
      availableRoomNights = totalActiveRooms * dayCount;
    }
    occupancyPct =
      availableRoomNights > 0 ? round2((overallSoldRoomNights / availableRoomNights) * 100) : 0;
    revpar = availableRoomNights > 0 ? round2(overallBookedRoomRevenue / availableRoomNights) : 0;
    inventoryMetricSupport = "SUPPORTED";
  }

  const adr =
    overallSoldRoomNights > 0 ? round2(overallBookedRoomRevenue / overallSoldRoomNights) : 0;
  const pricedShare =
    overallSoldRoomNights > 0 ? round2((overallPricedRoomNights / overallSoldRoomNights) * 100) : 0;

  const summary: RevenuePerformanceSummary = {
    bookedRoomRevenue: round2(overallBookedRoomRevenue),
    soldRoomNights: overallSoldRoomNights,
    availableRoomNights,
    pricedRoomNights: overallPricedRoomNights,
    pricedShare,
    occupancyPct,
    adr,
    revpar,
    reservationCount: overallDistinctResIds.size,
    inventoryMetricSupport,
  };

  // Daily Trend Rows
  const dailyRoomsAvailable = query.roomTypeId
    ? (roomsByType.get(query.roomTypeId) ?? 0)
    : totalActiveRooms;
  const dailyTrend: DailyRevenueTrendRow[] = stayDates.map((date) => {
    const bucket = dayBuckets.get(date)!;
    const dailyAdr = bucket.sold > 0 ? round2(bucket.revenue / bucket.sold) : 0;
    const dailyPricedShare = bucket.sold > 0 ? round2((bucket.priced / bucket.sold) * 100) : 0;
    let dayOcc: number | null = null;
    let dayRevpar: number | null = null;
    let dayInvSupport: "SUPPORTED" | "NOT_MEANINGFUL" = "NOT_MEANINGFUL";

    if (!hasNonInventoryFilter) {
      dayOcc = dailyRoomsAvailable > 0 ? round2((bucket.sold / dailyRoomsAvailable) * 100) : 0;
      dayRevpar = dailyRoomsAvailable > 0 ? round2(bucket.revenue / dailyRoomsAvailable) : 0;
      dayInvSupport = "SUPPORTED";
    }

    return {
      date,
      bookedRoomRevenue: round2(bucket.revenue),
      soldRoomNights: bucket.sold,
      availableRoomNights: hasNonInventoryFilter ? null : dailyRoomsAvailable,
      pricedRoomNights: bucket.priced,
      pricedShare: dailyPricedShare,
      occupancyPct: dayOcc,
      adr: dailyAdr,
      revpar: dayRevpar,
      reservationCount: bucket.resIds.size,
      inventoryMetricSupport: dayInvSupport,
    };
  });

  // Breakdowns
  const totalRev = overallBookedRoomRevenue || 1;

  // 1. Room Types Breakdown
  const roomTypesBreakdown: RoomTypeBreakdownRow[] = roomTypes.map((rt) => {
    const b = typeBuckets.get(rt.id);
    const sold = b?.sold ?? 0;
    const rev = b?.revenue ?? 0;
    const priced = b?.priced ?? 0;
    const resCount = b?.resIds.size ?? 0;
    const typeActiveRooms = roomsByType.get(rt.id) ?? 0;
    const typeAvailable = typeActiveRooms * dayCount;
    const occ = typeAvailable > 0 ? round2((sold / typeAvailable) * 100) : 0;
    const bAdr = sold > 0 ? round2(rev / sold) : 0;
    const bRevpar = typeAvailable > 0 ? round2(rev / typeAvailable) : 0;
    const share = round2((rev / totalRev) * 100);

    return {
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      soldRoomNights: sold,
      availableRoomNights: typeAvailable,
      bookedRoomRevenue: round2(rev),
      pricedRoomNights: priced,
      reservationCount: resCount,
      occupancyPct: occ,
      adr: bAdr,
      revpar: bRevpar,
      shareOfRevenue: share,
    };
  });

  // 2. Rate Plans Breakdown
  const ratePlansBreakdown: RatePlanBreakdownRow[] = [...planBuckets.values()].map((b) => {
    const bAdr = b.sold > 0 ? round2(b.revenue / b.sold) : 0;
    const share = round2((b.revenue / totalRev) * 100);
    return {
      ratePlanId: b.id,
      ratePlanCode: b.subLabel || "PLAN",
      ratePlanName: b.label,
      soldRoomNights: b.sold,
      bookedRoomRevenue: round2(b.revenue),
      pricedRoomNights: b.priced,
      reservationCount: b.resIds.size,
      adr: bAdr,
      shareOfRevenue: share,
      occupancyPct: null,
      revpar: null,
      inventoryMetricSupport: "NOT_MEANINGFUL",
    };
  });

  // 3. Market Segments Breakdown
  const segmentsBreakdown: SegmentBreakdownRow[] = [...segmentBuckets.values()].map((b) => {
    const bAdr = b.sold > 0 ? round2(b.revenue / b.sold) : 0;
    const share = round2((b.revenue / totalRev) * 100);
    return {
      marketSegment: b.id,
      marketSegmentLabel: b.label,
      soldRoomNights: b.sold,
      bookedRoomRevenue: round2(b.revenue),
      reservationCount: b.resIds.size,
      adr: bAdr,
      shareOfRevenue: share,
      occupancyPct: null,
      revpar: null,
      inventoryMetricSupport: "NOT_MEANINGFUL",
    };
  });

  // 4. Commercial Sources Breakdown
  const commercialSourcesBreakdown: CommercialSourceBreakdownRow[] = [
    ...sourceBuckets.values(),
  ].map((b) => {
    const bAdr = b.sold > 0 ? round2(b.revenue / b.sold) : 0;
    const share = round2((b.revenue / totalRev) * 100);
    return {
      commercialSource: b.id,
      commercialSourceLabel: b.label,
      soldRoomNights: b.sold,
      bookedRoomRevenue: round2(b.revenue),
      reservationCount: b.resIds.size,
      adr: bAdr,
      shareOfRevenue: share,
      occupancyPct: null,
      revpar: null,
      inventoryMetricSupport: "NOT_MEANINGFUL",
    };
  });

  // 5. Technical Origins Breakdown
  const technicalOriginsBreakdown: TechnicalOriginBreakdownRow[] = [...originBuckets.values()].map(
    (b) => {
      const bAdr = b.sold > 0 ? round2(b.revenue / b.sold) : 0;
      const share = round2((b.revenue / totalRev) * 100);
      return {
        origin: b.id,
        originLabel: b.label,
        soldRoomNights: b.sold,
        bookedRoomRevenue: round2(b.revenue),
        reservationCount: b.resIds.size,
        adr: bAdr,
        shareOfRevenue: share,
        occupancyPct: null,
        revpar: null,
        inventoryMetricSupport: "NOT_MEANINGFUL",
      };
    },
  );

  const avgLeadTime = leadTimeCount > 0 ? round2(totalLeadTimeDays / leadTimeCount) : null;
  const avgLos =
    reservations.length > 0 ? round2(totalLengthOfStayNights / reservations.length) : 0;

  return {
    restaurantId: query.restaurantId,
    fromDate,
    toDate,
    rangeDays: dayCount,
    currency: propertyCurrency,
    dateBasis: "stay_date",
    hasNonInventoryFilter,
    salesChannelBreakdown: "unsupported",
    summary,
    dailyTrend,
    breakdowns: {
      roomTypes: roomTypesBreakdown,
      ratePlans: ratePlansBreakdown,
      marketSegments: segmentsBreakdown,
      commercialSources: commercialSourcesBreakdown,
      technicalOrigins: technicalOriginsBreakdown,
    },
    distribution: {
      averageLeadTimeDays: avgLeadTime,
      averageLengthOfStayNights: avgLos,
    },
    warnings: {
      unpricedSoldNights,
      legacyDimensionCoverage,
      availabilityIncludesOperationallyUnavailableRooms: true,
      mixedCurrencyDetected,
    },
  };
}

export function computeCommercialPerformance(options: {
  restaurantId: string;
  fromDate: string;
  toDate: string;
  propertyCurrency: string;
  eligibleReservations: Array<{ id: string; arrival_date: string; departure_date: string }>;
  promoAttributions: Array<{
    reservation_id: string;
    promotion_activation_id: string;
    discount_amount: number | string;
    base_room_subtotal: number | string;
    room_subtotal_after_promotion: number | string;
  }>;
  packageAttributions: Array<{
    reservation_id: string;
    package_activation_id: string;
    applied_amount: number | string;
    quantity: number | string;
  }>;
  promoActivations: Array<{ id: string; hotel_commercial_promotions?: { name: string } | null }>;
  packageActivations: Array<{ id: string; hotel_commercial_packages?: { name: string } | null }>;
}): CommercialPerformance {
  const {
    restaurantId,
    fromDate,
    toDate,
    propertyCurrency,
    eligibleReservations,
    promoAttributions,
    packageAttributions,
    promoActivations,
    packageActivations,
  } = options;

  const eligibleResIds = new Set<string>();
  const resStayNightsMap = new Map<string, number>();

  for (const r of eligibleReservations) {
    let overlapNights = 0;
    let cur = r.arrival_date;
    while (cur < r.departure_date) {
      if (cur >= fromDate && cur <= toDate) {
        overlapNights += 1;
      }
      cur = shiftIsoDate(cur, 1);
    }
    if (overlapNights > 0) {
      eligibleResIds.add(r.id);
      resStayNightsMap.set(r.id, overlapNights);
    }
  }

  const promoActToName = new Map<string, string>();
  for (const act of promoActivations) {
    promoActToName.set(act.id, act.hotel_commercial_promotions?.name || "Promotion");
  }

  const pkgActToName = new Map<string, string>();
  for (const act of packageActivations) {
    pkgActToName.set(act.id, act.hotel_commercial_packages?.name || "Package");
  }

  // Aggregate promotions
  type PromoAgg = {
    id: string;
    name: string;
    resIds: Set<string>;
    soldNights: number;
    baseAmount: number;
    discount: number;
    postAmount: number;
  };
  const promoMap = new Map<string, PromoAgg>();

  for (const pa of promoAttributions) {
    if (!eligibleResIds.has(pa.reservation_id)) continue;
    const actId = pa.promotion_activation_id;
    if (!promoMap.has(actId)) {
      promoMap.set(actId, {
        id: actId,
        name: promoActToName.get(actId) || "Promotion",
        resIds: new Set(),
        soldNights: 0,
        baseAmount: 0,
        discount: 0,
        postAmount: 0,
      });
    }
    const item = promoMap.get(actId)!;
    item.resIds.add(pa.reservation_id);
    item.soldNights += resStayNightsMap.get(pa.reservation_id) ?? 0;
    item.baseAmount += Number(pa.base_room_subtotal) || 0;
    item.discount += Number(pa.discount_amount) || 0;
    item.postAmount += Number(pa.room_subtotal_after_promotion) || 0;
  }

  const promotions: PromotionPerformanceRow[] = [...promoMap.values()].map((p) => ({
    promotionActivationId: p.id,
    promotionName: p.name,
    reservationCount: p.resIds.size,
    soldRoomNights: p.soldNights,
    preCommercialRoomAmount: round2(p.baseAmount),
    discountAmount: round2(p.discount),
    postPromotionRoomAmount: round2(p.postAmount),
  }));

  // Aggregate packages
  type PkgAgg = {
    id: string;
    name: string;
    resIds: Set<string>;
    selections: number;
    amount: number;
    soldNights: number;
  };
  const pkgMap = new Map<string, PkgAgg>();

  for (const pka of packageAttributions) {
    if (!eligibleResIds.has(pka.reservation_id)) continue;
    const actId = pka.package_activation_id;
    if (!pkgMap.has(actId)) {
      pkgMap.set(actId, {
        id: actId,
        name: pkgActToName.get(actId) || "Package",
        resIds: new Set(),
        selections: 0,
        amount: 0,
        soldNights: 0,
      });
    }
    const item = pkgMap.get(actId)!;
    item.resIds.add(pka.reservation_id);
    item.selections += Number(pka.quantity) || 1;
    item.amount += Number(pka.applied_amount) || 0;
    item.soldNights += resStayNightsMap.get(pka.reservation_id) ?? 0;
  }

  const packages: PackagePerformanceRow[] = [...pkgMap.values()].map((k) => ({
    packageActivationId: k.id,
    packageName: k.name,
    reservationCount: k.resIds.size,
    selectionCount: k.selections,
    bookedPackageAmount: round2(k.amount),
    soldRoomNights: k.soldNights,
  }));

  return {
    restaurantId,
    fromDate,
    toDate,
    currency: propertyCurrency,
    dateBasis: "stay_date",
    promotions,
    packages,
    metadata: {
      attributionStartMigration: "0104",
      claimsSettlement: false,
      claimsRoi: false,
    },
  };
}
