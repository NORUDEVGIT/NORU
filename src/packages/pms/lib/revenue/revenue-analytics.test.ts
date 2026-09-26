import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCommercialPerformance,
  computeRevenuePerformanceOverview,
  validateAnalyticsRange,
  type RawReservationInput,
} from "./revenue-analytics.ts";

const PROPERTY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM_TYPE_1 = "11111111-1111-4111-8111-111111111111";
const ROOM_TYPE_2 = "22222222-2222-4222-8222-222222222222";
const RATE_PLAN_1 = "33333333-3333-4333-8333-333333333333";
const RATE_PLAN_2 = "44444444-4444-4444-8444-444444444444";

const activeRooms = [
  { id: "r1", room_type_id: ROOM_TYPE_1 },
  { id: "r2", room_type_id: ROOM_TYPE_1 },
  { id: "r3", room_type_id: ROOM_TYPE_2 },
];

const roomTypes = [
  { id: ROOM_TYPE_1, name: "Deluxe King" },
  { id: ROOM_TYPE_2, name: "Standard Queen" },
];

const ratePlans = [
  { id: RATE_PLAN_1, code: "BAR", name: "Best Available Rate" },
  { id: RATE_PLAN_2, code: "CORP", name: "Corporate Flex" },
];

describe("P8-STEP-02 & P8-STEP-02B Revenue Performance Read Models", () => {
  it("enforces 90-day maximum range limit", () => {
    assert.throws(
      () => validateAnalyticsRange("2026-01-01", "2026-04-15"),
      /REVENUE_ANALYTICS_RANGE_EXCEEDS_MAX/,
    );

    const valid = validateAnalyticsRange("2026-06-01", "2026-06-30");
    assert.equal(valid.dayCount, 30);
    assert.equal(valid.fromDate, "2026-06-01");
    assert.equal(valid.toDate, "2026-06-30");
  });

  it("authoritatively allocates nightly rates from nightly_rate_snapshot and respects partial stay overlap", () => {
    const reservations: RawReservationInput[] = [
      {
        id: "res-1",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-04", // 3 nights: June 1, 2, 3
        created_at: "2026-05-20T10:00:00Z",
        currency: "USD",
        nightly_rate_snapshot: [
          { date: "2026-06-01", rate: 100 },
          { date: "2026-06-02", rate: 120 },
          { date: "2026-06-03", rate: 110 },
        ],
      },
      {
        id: "res-overlap",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "checked_in",
        arrival_date: "2026-05-31", // starts before requested range
        departure_date: "2026-06-03", // nights: May 31, June 1, June 2
        created_at: "2026-05-15T10:00:00Z",
        currency: "USD",
        nightly_rate_snapshot: [
          { date: "2026-05-31", rate: 200 }, // outside range
          { date: "2026-06-01", rate: 150 }, // in range
          { date: "2026-06-02", rate: 150 }, // in range
        ],
      },
    ];

    const overview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-03", // 3 days
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });

    // res-1 has 3 nights in range: 100 + 120 + 110 = 330
    // res-overlap has 2 nights in range: 150 + 150 = 300 (May 31 is excluded)
    // Total sold room nights in range = 5
    // Total booked room revenue = 630
    assert.equal(overview.summary.soldRoomNights, 5);
    assert.equal(overview.summary.bookedRoomRevenue, 630);
    assert.equal(overview.summary.adr, 126); // 630 / 5 = 126.00

    // 3 active rooms * 3 days = 9 available room nights
    assert.equal(overview.summary.availableRoomNights, 9);
    assert.equal(overview.summary.occupancyPct, 55.56); // (5 / 9) * 100
    assert.equal(overview.summary.revpar, 70); // 630 / 9 = 70.00
    assert.equal(overview.summary.inventoryMetricSupport, "SUPPORTED");

    // DISTINCT reservation count rule: 2 reservations
    assert.equal(overview.summary.reservationCount, 2);
  });

  it("handles unpriced stays honestly without inflating revenue and tracks unpricedSoldNights", () => {
    const reservations: RawReservationInput[] = [
      {
        id: "res-priced",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-02", // 1 night
        nightly_rate_snapshot: [{ date: "2026-06-01", rate: 100 }],
        created_at: "2026-05-01T00:00:00Z",
        currency: "USD",
      },
      {
        id: "res-unpriced",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-03", // 2 nights with empty snapshot
        nightly_rate_snapshot: null,
        created_at: "2026-05-01T00:00:00Z",
        currency: "USD",
      },
    ];

    const overview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02", // 2 days
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });

    // Total sold: 1 (res-priced) + 2 (res-unpriced) = 3 sold nights
    assert.equal(overview.summary.soldRoomNights, 3);
    assert.equal(overview.summary.pricedRoomNights, 1);
    assert.equal(overview.summary.bookedRoomRevenue, 100);
    assert.equal(overview.warnings.unpricedSoldNights, 2);
    assert.equal(overview.summary.pricedShare, 33.33); // (1 / 3) * 100

    // ADR = 100 / 3 = 33.33 (revenue over total sold nights)
    assert.equal(overview.summary.adr, 33.33);
  });

  it("strictly disables Occupancy and RevPAR across Summary, Daily Trend, AND Room Type breakdown when filtered by non-inventory dimensions", () => {
    const reservations: RawReservationInput[] = [
      {
        id: "res-1",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "corporate",
        commercial_booking_source: "gds",
        source: "staff",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-03",
        nightly_rate_snapshot: [
          { date: "2026-06-01", rate: 150 },
          { date: "2026-06-02", rate: 150 },
        ],
        created_at: "2026-05-01T00:00:00Z",
        currency: "USD",
      },
    ];

    // Test 1: Filter by ratePlanId
    const ratePlanOverview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02",
        ratePlanId: RATE_PLAN_1,
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });
    assert.equal(ratePlanOverview.hasNonInventoryFilter, true);
    assert.equal(ratePlanOverview.summary.occupancyPct, null);
    assert.equal(ratePlanOverview.summary.revpar, null);
    assert.equal(ratePlanOverview.summary.availableRoomNights, null);
    assert.equal(ratePlanOverview.summary.inventoryMetricSupport, "NOT_MEANINGFUL");
    assert.equal(ratePlanOverview.summary.adr, 150); // ADR remains valid!

    // P8-STEP-02B FIX: Room Type breakdown rows MUST also return null occupancy/revpar under ratePlan filter
    const rtRowBAR = ratePlanOverview.breakdowns.roomTypes.find(
      (r) => r.roomTypeId === ROOM_TYPE_1,
    )!;
    assert.equal(rtRowBAR.availableRoomNights, null);
    assert.equal(rtRowBAR.occupancyPct, null);
    assert.equal(rtRowBAR.revpar, null);
    assert.equal(rtRowBAR.inventoryMetricSupport, "NOT_MEANINGFUL");
    assert.equal(rtRowBAR.adr, 150); // ADR remains valid!

    // Test 2: Filter by marketSegmentId
    const segmentOverview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02",
        marketSegmentId: "corporate",
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });
    assert.equal(segmentOverview.summary.occupancyPct, null);
    assert.equal(segmentOverview.summary.revpar, null);
    assert.equal(segmentOverview.summary.inventoryMetricSupport, "NOT_MEANINGFUL");

    // P8-STEP-02B FIX: Room Type breakdown rows under segment filter
    const rtRowSegment = segmentOverview.breakdowns.roomTypes.find(
      (r) => r.roomTypeId === ROOM_TYPE_1,
    )!;
    assert.equal(rtRowSegment.availableRoomNights, null);
    assert.equal(rtRowSegment.occupancyPct, null);
    assert.equal(rtRowSegment.revpar, null);
    assert.equal(rtRowSegment.inventoryMetricSupport, "NOT_MEANINGFUL");

    // Test 3: Filter by commercialSourceId
    const sourceOverview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02",
        commercialSourceId: "gds",
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });
    assert.equal(sourceOverview.summary.occupancyPct, null);
    assert.equal(sourceOverview.summary.revpar, null);
    assert.equal(sourceOverview.summary.inventoryMetricSupport, "NOT_MEANINGFUL");
    assert.equal(sourceOverview.breakdowns.roomTypes[0].occupancyPct, null);
    assert.equal(sourceOverview.breakdowns.roomTypes[0].revpar, null);

    // Test 4: Filter by technicalOrigin
    const originOverview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02",
        technicalOrigin: "staff",
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });
    assert.equal(originOverview.summary.occupancyPct, null);
    assert.equal(originOverview.summary.revpar, null);
    assert.equal(originOverview.summary.inventoryMetricSupport, "NOT_MEANINGFUL");
    assert.equal(originOverview.breakdowns.roomTypes[0].occupancyPct, null);
    assert.equal(originOverview.breakdowns.roomTypes[0].revpar, null);

    // Test 5: Combination of roomTypeId + ratePlanId MUST NOT return Occupancy/RevPAR
    const comboOverview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02",
        roomTypeId: ROOM_TYPE_1,
        ratePlanId: RATE_PLAN_1,
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });
    assert.equal(comboOverview.hasNonInventoryFilter, true);
    assert.equal(comboOverview.summary.occupancyPct, null);
    assert.equal(comboOverview.summary.revpar, null);
    assert.equal(comboOverview.summary.inventoryMetricSupport, "NOT_MEANINGFUL");
    assert.equal(comboOverview.breakdowns.roomTypes[0].occupancyPct, null);
    assert.equal(comboOverview.breakdowns.roomTypes[0].revpar, null);

    // Test 6: Pure roomTypeId query DOES support Occupancy & RevPAR for Room Types & Summary
    const roomTypeOverview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-02", // 2 days * 2 active rooms = 4 available
        roomTypeId: ROOM_TYPE_1,
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });
    assert.equal(roomTypeOverview.hasNonInventoryFilter, false);
    assert.equal(roomTypeOverview.summary.availableRoomNights, 4);
    assert.equal(roomTypeOverview.summary.inventoryMetricSupport, "SUPPORTED");
    assert.equal(roomTypeOverview.summary.occupancyPct, 50); // 2 sold / 4 available = 50%
    assert.equal(roomTypeOverview.summary.revpar, 75); // 300 / 4 = 75.00

    const rtRowPure = roomTypeOverview.breakdowns.roomTypes.find(
      (r) => r.roomTypeId === ROOM_TYPE_1,
    )!;
    assert.equal(rtRowPure.availableRoomNights, 4);
    assert.equal(rtRowPure.occupancyPct, 50);
    assert.equal(rtRowPure.revpar, 75);
    assert.equal(rtRowPure.inventoryMetricSupport, "SUPPORTED");
  });

  it("blocks mixed-currency monetary aggregation and throws REVENUE_ANALYTICS_MIXED_CURRENCY", () => {
    const reservations: RawReservationInput[] = [
      {
        id: "res-usd",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-03",
        currency: "USD",
        nightly_rate_snapshot: [
          { date: "2026-06-01", rate: 100 },
          { date: "2026-06-02", rate: 100 },
        ],
        created_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "res-etb",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-03",
        currency: "ETB", // different currency from property USD!
        nightly_rate_snapshot: [
          { date: "2026-06-01", rate: 5000 },
          { date: "2026-06-02", rate: 5000 },
        ],
        created_at: "2026-05-01T00:00:00Z",
      },
    ];

    assert.throws(
      () =>
        computeRevenuePerformanceOverview({
          query: {
            restaurantId: PROPERTY_ID,
            fromDate: "2026-06-01",
            toDate: "2026-06-02",
          },
          reservations,
          activeRooms,
          roomTypes,
          ratePlans,
          propertyCurrency: "USD",
        }),
      /REVENUE_ANALYTICS_MIXED_CURRENCY/,
    );
  });

  it("rejects non-null salesChannelId with REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED rather than silently ignoring it", () => {
    assert.throws(
      () =>
        computeRevenuePerformanceOverview({
          query: {
            restaurantId: PROPERTY_ID,
            fromDate: "2026-06-01",
            toDate: "2026-06-02",
            salesChannelId: "channel-ota-expedia",
          },
          reservations: [],
          activeRooms,
          roomTypes,
          ratePlans,
          propertyCurrency: "USD",
        }),
      /REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED/,
    );
  });

  it("reservationCount counts distinct reservation IDs across stay dates and breakdowns", () => {
    const reservations: RawReservationInput[] = [
      {
        id: "res-multi-night",
        room_type_id: ROOM_TYPE_1,
        rate_plan_id: RATE_PLAN_1,
        market_segment: "transient",
        commercial_booking_source: "website",
        source: "direct_booking",
        status: "confirmed",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-05", // 4 nights: June 1, 2, 3, 4
        nightly_rate_snapshot: [
          { date: "2026-06-01", rate: 100 },
          { date: "2026-06-02", rate: 100 },
          { date: "2026-06-03", rate: 100 },
          { date: "2026-06-04", rate: 100 },
        ],
        created_at: "2026-05-01T00:00:00Z",
        currency: "USD",
      },
    ];

    const overview = computeRevenuePerformanceOverview({
      query: {
        restaurantId: PROPERTY_ID,
        fromDate: "2026-06-01",
        toDate: "2026-06-04",
      },
      reservations,
      activeRooms,
      roomTypes,
      ratePlans,
      propertyCurrency: "USD",
    });

    assert.equal(overview.summary.soldRoomNights, 4);
    assert.equal(overview.summary.reservationCount, 1);

    const roomTypeRow = overview.breakdowns.roomTypes.find((r) => r.roomTypeId === ROOM_TYPE_1)!;
    assert.equal(roomTypeRow.soldRoomNights, 4);
    assert.equal(roomTypeRow.reservationCount, 1);

    const ratePlanRow = overview.breakdowns.ratePlans[0];
    assert.equal(ratePlanRow.soldRoomNights, 4);
    assert.equal(ratePlanRow.reservationCount, 1);

    for (const day of overview.dailyTrend) {
      assert.equal(day.soldRoomNights, 1);
      assert.equal(day.reservationCount, 1);
    }
  });

  it("loads commercial promotions and packages based strictly on attributions", () => {
    const eligibleReservations = [
      {
        id: "res-promo",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-03",
      },
    ];

    const promoAttributions = [
      {
        reservation_id: "res-promo",
        promotion_activation_id: "promo-act-1",
        discount_amount: 30,
        base_room_subtotal: 200,
        room_subtotal_after_promotion: 170,
      },
    ];

    const promoActivations = [
      {
        id: "promo-act-1",
        hotel_commercial_promotions: { name: "Early Summer 15%" },
      },
    ];

    const packageAttributions = [
      {
        reservation_id: "res-promo",
        package_activation_id: "pkg-act-1",
        applied_amount: 50,
        quantity: 2,
      },
    ];

    const packageActivations = [
      {
        id: "pkg-act-1",
        hotel_commercial_packages: { name: "Champagne & Breakfast" },
      },
    ];

    const commercial = computeCommercialPerformance({
      restaurantId: PROPERTY_ID,
      fromDate: "2026-06-01",
      toDate: "2026-06-02",
      propertyCurrency: "USD",
      eligibleReservations,
      promoAttributions,
      packageAttributions,
      promoActivations,
      packageActivations,
    });

    assert.equal(commercial.promotions.length, 1);
    assert.equal(commercial.promotions[0].promotionName, "Early Summer 15%");
    assert.equal(commercial.promotions[0].reservationCount, 1);
    assert.equal(commercial.promotions[0].discountAmount, 30);
    assert.equal(commercial.promotions[0].postPromotionRoomAmount, 170);

    assert.equal(commercial.packages.length, 1);
    assert.equal(commercial.packages[0].packageName, "Champagne & Breakfast");
    assert.equal(commercial.packages[0].reservationCount, 1);
    assert.equal(commercial.packages[0].selectionCount, 2);
    assert.equal(commercial.packages[0].bookedPackageAmount, 50);
  });
});
