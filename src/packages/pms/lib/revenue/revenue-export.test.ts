import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCommercialPerformanceCsv,
  buildRevenuePerformanceCsv,
  buildUnifiedAuditCsv,
  escapeCsvCell,
  MAX_AUDIT_EXPORT_ROWS,
  serializeCsv,
  serializeCsvRow,
} from "./revenue-export.ts";
import type { CommercialPerformance, RevenuePerformanceOverview } from "./revenue-analytics.ts";
import type { UnifiedRevenueAuditEntry } from "./revenue-audit.ts";

describe("P8-STEP-02 Revenue CSV Export Foundation", () => {
  it("escapes cells according to RFC-4180 rules", () => {
    assert.equal(escapeCsvCell("simple"), "simple");
    assert.equal(escapeCsvCell(123), "123");
    assert.equal(escapeCsvCell(null), "");
    assert.equal(escapeCsvCell(undefined), "");

    // Comma requires quotes
    assert.equal(escapeCsvCell("London, UK"), '"London, UK"');

    // Quotes require doubling and wrapping
    assert.equal(escapeCsvCell('King "Suite"'), '"King ""Suite"""');

    // Newlines require quotes
    assert.equal(escapeCsvCell("Line 1\nLine 2"), '"Line 1\nLine 2"');

    // Combinations
    assert.equal(escapeCsvCell('A, "B"\nC'), '"A, ""B""\nC"');
  });

  it("defends against spreadsheet formula injection (=, +, -, @)", () => {
    // Basic formula triggers
    assert.equal(escapeCsvCell("=SUM(A1:A10)"), "'=SUM(A1:A10)");
    assert.equal(escapeCsvCell("+447700900077"), "'+447700900077");
    assert.equal(escapeCsvCell("-250.00"), "'-250.00");
    assert.equal(escapeCsvCell("@command"), "'@command");

    // Formula trigger combined with quotes or commas
    assert.equal(escapeCsvCell("=1+1, test"), '"\'=1+1, test"');
  });

  it("serializes rows and matrices with RFC-4180 CRLF line endings", () => {
    const row = serializeCsvRow(["Date", "Price, GBP", 150]);
    assert.equal(row, 'Date,"Price, GBP",150');

    const table = serializeCsv(
      ["A", "B"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    assert.equal(table, "A,B\r\n1,2\r\n3,4");
  });

  it("serializes complete Revenue Performance Overview with all breakdowns and correct N/A handling", () => {
    const overview: RevenuePerformanceOverview = {
      restaurantId: "test-property-id",
      fromDate: "2026-06-01",
      toDate: "2026-06-02",
      rangeDays: 2,
      currency: "GBP",
      dateBasis: "stay_date",
      hasNonInventoryFilter: true, // Non-inventory filter active
      salesChannelBreakdown: "unsupported",
      summary: {
        bookedRoomRevenue: 500,
        soldRoomNights: 4,
        availableRoomNights: null,
        pricedRoomNights: 4,
        pricedShare: 100,
        occupancyPct: null,
        adr: 125,
        revpar: null,
        reservationCount: 2,
        inventoryMetricSupport: "NOT_MEANINGFUL",
      },
      dailyTrend: [
        {
          date: "2026-06-01",
          bookedRoomRevenue: 250,
          soldRoomNights: 2,
          availableRoomNights: null,
          pricedRoomNights: 2,
          pricedShare: 100,
          occupancyPct: null,
          adr: 125,
          revpar: null,
          reservationCount: 2,
          inventoryMetricSupport: "NOT_MEANINGFUL",
        },
      ],
      breakdowns: {
        roomTypes: [
          {
            roomTypeId: "rt-1",
            roomTypeName: "Deluxe King",
            soldRoomNights: 4,
            availableRoomNights: 10,
            bookedRoomRevenue: 500,
            pricedRoomNights: 4,
            reservationCount: 2,
            occupancyPct: 40,
            adr: 125,
            revpar: 50,
            shareOfRevenue: 100,
          },
        ],
        ratePlans: [
          {
            ratePlanId: "rp-1",
            ratePlanCode: "BAR",
            ratePlanName: "Best Available Rate",
            soldRoomNights: 4,
            bookedRoomRevenue: 500,
            pricedRoomNights: 4,
            reservationCount: 2,
            adr: 125,
            shareOfRevenue: 100,
            occupancyPct: null,
            revpar: null,
            inventoryMetricSupport: "NOT_MEANINGFUL",
          },
        ],
        marketSegments: [],
        commercialSources: [],
        technicalOrigins: [],
      },
      distribution: {
        averageLeadTimeDays: 14,
        averageLengthOfStayNights: 2,
      },
      warnings: {
        unpricedSoldNights: 0,
        legacyDimensionCoverage: false,
        availabilityIncludesOperationallyUnavailableRooms: true,
        mixedCurrencyDetected: false,
      },
    };

    const csv = buildRevenuePerformanceCsv(overview);
    assert.match(csv, /REVENUE PERFORMANCE OVERVIEW/);
    assert.match(csv, /METRIC SUMMARY/);
    assert.match(csv, /DAILY TREND/);
    assert.match(csv, /ROOM TYPE PERFORMANCE/);
    assert.match(csv, /RATE PLAN PERFORMANCE/);
    // Non-inventory filter notice
    assert.match(csv, /N\/A \(Non-inventory filter\)/);
  });

  it("serializes Commercial Performance report with promotions and packages", () => {
    const commercial: CommercialPerformance = {
      restaurantId: "test-property-id",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      currency: "GBP",
      dateBasis: "stay_date",
      promotions: [
        {
          promotionActivationId: "promo-1",
          promotionName: "Summer Solstice 20%",
          reservationCount: 5,
          soldRoomNights: 15,
          preCommercialRoomAmount: 3000,
          discountAmount: 600,
          postPromotionRoomAmount: 2400,
        },
      ],
      packages: [
        {
          packageActivationId: "pkg-1",
          packageName: "Spa & Dinner Package",
          reservationCount: 3,
          selectionCount: 3,
          bookedPackageAmount: 450,
          soldRoomNights: 9,
        },
      ],
      metadata: {
        attributionStartMigration: "0104",
        claimsSettlement: false,
        claimsRoi: false,
      },
    };

    const csv = buildCommercialPerformanceCsv(commercial);
    assert.match(csv, /COMMERCIAL ATTRITION & PERFORMANCE/);
    assert.match(csv, /Summer Solstice 20%/);
    assert.match(csv, /Spa & Dinner Package/);
    assert.match(csv, /600\.00/);
    assert.match(csv, /450\.00/);
  });

  it("serializes Unified Revenue Audit entries with full 12-column audit headers", () => {
    const entries: UnifiedRevenueAuditEntry[] = [
      {
        id: "evt-1",
        timestamp: "2026-06-01T15:30:00Z",
        domain: "rates",
        action: "manual_override",
        entityType: "rate_plan",
        entityId: "plan-1",
        entityLabel: "Best Available Rate",
        scopeLabel: "2026-06-15 • Deluxe King",
        actorMembershipId: "mem-1",
        actorLabel: "Alice Revenue",
        reason: "Competitor sold out",
        operationId: "op-999",
        approvalRequestId: "app-888",
        linkedOperationId: "op-999",
        status: "applied",
        sourceTable: "hotel_rate_change_events",
        detailSupported: true,
      },
    ];

    const csv = buildUnifiedAuditCsv(entries);
    assert.match(
      csv,
      /Timestamp \(UTC\),Domain,Action,Entity Type,Entity Label,Scope \/ Context,Actor,Reason,Status,Operation ID,Approval Request ID,Source Table/,
    );
    assert.match(csv, /Alice Revenue/);
    assert.match(csv, /Competitor sold out/);
    assert.match(csv, /hotel_rate_change_events/);
  });

  it("enforces maximum audit export safety bound of 10,000 rows", () => {
    assert.equal(MAX_AUDIT_EXPORT_ROWS, 10000);
  });

  it("P8-STEP-02B FIX: exports all 250 rows without clamping to visible 100-row page", () => {
    const entries: UnifiedRevenueAuditEntry[] = [];
    const domains = ["rates", "restrictions", "commercial", "approvals"] as const;

    for (let i = 1; i <= 250; i++) {
      entries.push({
        id: `evt-${i.toString().padStart(4, "0")}`,
        timestamp: `2026-06-01T12:00:${String(i % 60).padStart(2, "0")}Z`,
        domain: domains[i % 4],
        action: "action",
        entityType: "entity",
        entityId: `id-${i}`,
        entityLabel: `Entity ${i}`,
        scopeLabel: `Scope ${i}`,
        actorMembershipId: `m-${i}`,
        actorLabel: "Staff",
        reason: `Reason ${i}`,
        operationId: `op-${i}`,
        approvalRequestId: null,
        linkedOperationId: null,
        status: "applied",
        sourceTable: "hotel_rate_change_events",
        detailSupported: true,
      });
    }

    const csv = buildUnifiedAuditCsv(entries);
    const lines = csv.split("\r\n");
    // 1 header + 250 data rows = 251 lines
    assert.equal(lines.length, 251);
    assert.equal(entries.length, 250);
  });
});
