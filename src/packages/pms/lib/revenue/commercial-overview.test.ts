import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVENUE_SECTION_DEFAULTS,
  REVENUE_UI_SCREEN_MAP,
  foundationRevenueViews,
  implementedRevenueViews,
} from "../rate-revenue-workspace.ts";
import {
  activationMatchesScopeFilter,
  buildCommercialAttention,
  buildCommercialPromotionRows,
  commercialExpiringSoon,
  commercialKindLabel,
  commercialOperationalStatus,
  commercialValueLabel,
  detectPromotionOverlaps,
  filterPromotionRows,
  reservationStayOverlapsRange,
  stayNightsOverlappingRange,
  summarizeAttributedPerformance,
  type CommercialPromotionInput,
} from "./commercial-overview.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const ROOM = "33333333-3333-4333-8333-333333333333";
const PLAN = "66666666-6666-4666-8666-666666666666";

function promo(overrides: Partial<CommercialPromotionInput> = {}): CommercialPromotionInput {
  return {
    activationId: "11111111-1111-4111-8111-111111111111",
    promotionId: "22222222-2222-4222-8222-222222222222",
    code: "SPRING10",
    name: "Spring 10",
    kind: "percent",
    value: 10,
    active: true,
    masterActive: true,
    validFrom: "2026-09-20",
    validTo: "2026-10-10",
    bookingFrom: "2026-09-01",
    bookingTo: "2026-09-30",
    priority: 10,
    roomTypeIds: [],
    ratePlanIds: [],
    masterRoomTypeIds: [ROOM],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("RR-P5-UI-01 commercial overview + promotions", () => {
  it("maps Commercial default to UI-17 and promotions to UI-18", () => {
    assert.equal(REVENUE_SECTION_DEFAULTS.commercial, "commercial");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-17")?.view, "commercial");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-18")?.view, "promotions");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-19")?.view, "packages");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-20")?.view, null);
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-21")?.view, "commercial-history");
    assert.ok(implementedRevenueViews().includes("commercial"));
    assert.ok(implementedRevenueViews().includes("promotions"));
    assert.ok(implementedRevenueViews().includes("packages"));
    assert.ok(implementedRevenueViews().includes("commercial-history"));
    assert.ok(!foundationRevenueViews().includes("packages"));
    assert.ok(!foundationRevenueViews().includes("commercial-history"));
  });

  it("does not add forbidden top-level commercial views", () => {
    const workspace = readRel("../rate-revenue-workspace.ts");
    assert.doesNotMatch(workspace, /promotion-performance/);
    assert.doesNotMatch(workspace, /promotion-activation/);
    assert.doesNotMatch(workspace, /commercial-impact/);
  });

  it("derives operational status from business date", () => {
    assert.equal(commercialOperationalStatus({ active: false, validFrom: "2026-09-01", validTo: "2026-10-01" }, "2026-09-25"), "inactive");
    assert.equal(commercialOperationalStatus({ active: true, validFrom: "2026-09-01", validTo: "2026-09-20" }, "2026-09-25"), "expired");
    assert.equal(commercialOperationalStatus({ active: true, validFrom: "2026-10-01", validTo: "2026-10-20" }, "2026-09-25"), "upcoming");
    assert.equal(commercialOperationalStatus({ active: true, validFrom: "2026-09-01", validTo: "2026-10-01" }, "2026-09-25"), "active");
    assert.equal(commercialExpiringSoon({ active: true, validFrom: "2026-09-01", validTo: "2026-09-28" }, "2026-09-25"), true);
    assert.equal(commercialExpiringSoon({ active: true, validFrom: "2026-09-01", validTo: "2026-10-20" }, "2026-09-25"), false);
  });

  it("counts stay-overlap nights and excludes reservations outside the range", () => {
    assert.equal(stayNightsOverlappingRange("2026-09-24", "2026-09-27", "2026-09-25", "2026-09-26"), 2);
    assert.equal(stayNightsOverlappingRange("2026-09-24", "2026-09-27"), 3);
    assert.equal(reservationStayOverlapsRange("2026-08-01", "2026-08-03", "2026-09-01", "2026-09-30"), false);
    assert.equal(reservationStayOverlapsRange("2026-09-20", "2026-09-22", "2026-09-01", "2026-09-30"), true);
  });

  it("summarizes attributed performance only from attribution rows", () => {
    const summary = summarizeAttributedPerformance(
      [
        {
          reservationId: "r1",
          discountAmount: 10,
          roomSubtotalAfterPromotion: 90,
          arrivalDate: "2026-09-20",
          departureDate: "2026-09-22",
        },
        {
          reservationId: "r1",
          discountAmount: 5,
          roomSubtotalAfterPromotion: 45,
          arrivalDate: "2026-09-20",
          departureDate: "2026-09-22",
        },
        {
          reservationId: "old",
          discountAmount: 100,
          roomSubtotalAfterPromotion: 400,
          arrivalDate: "2026-01-01",
          departureDate: "2026-01-03",
        },
      ],
      "2026-09-01",
      "2026-09-30",
    );
    assert.equal(summary.bookings, 1);
    assert.equal(summary.discountAmount, 15);
    assert.equal(summary.postPromotionRoomRevenue, 135);
    assert.equal(summary.roomNights, 4);
  });

  it("detects overlaps and attention without inventing forecast items", () => {
    const other = promo({
      activationId: "77777777-7777-4777-8777-777777777777",
      code: "AUTUMN",
      validFrom: "2026-09-25",
      validTo: "2026-10-05",
    });
    const overlaps = detectPromotionOverlaps([promo(), other]);
    assert.equal(overlaps.get(promo().activationId)?.length, 1);
    const rows = buildCommercialPromotionRows([
      promo({ kind: "free_night", masterActive: false }),
      other,
      promo({
        activationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        code: "ENDED",
        validFrom: "2026-09-01",
        validTo: "2026-09-20",
      }),
    ], {
      businessDate: "2026-09-25",
      performanceByActivation: new Map(),
      roomNames: new Map(),
      planNames: new Map(),
    });
    const attention = buildCommercialAttention(rows);
    assert.ok(attention.some((item) => item.kind === "overlap"));
    assert.ok(attention.some((item) => item.kind === "unsupported_free_night"));
    assert.ok(attention.some((item) => item.kind === "inactive_master"));
    assert.ok(attention.some((item) => item.kind === "validity_ended"));
    assert.ok(!attention.some((item) => /forecast|expected|roi/i.test(item.title)));
  });

  it("filters promotions by search, status, kind, and scope", () => {
    const rows = buildCommercialPromotionRows(
      [
        promo(),
        promo({
          activationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          code: "FIXED20",
          name: "Fixed Twenty",
          kind: "fixed",
          value: 20,
          active: false,
          roomTypeIds: [ROOM],
          ratePlanIds: [PLAN],
        }),
      ],
      {
        businessDate: "2026-09-25",
        performanceByActivation: new Map(),
        roomNames: new Map([[ROOM, "Deluxe"]]),
        planNames: new Map([[PLAN, "BAR"]]),
      },
    );
    assert.equal(filterPromotionRows(rows, { search: "fixed" }).length, 1);
    assert.equal(filterPromotionRows(rows, { status: "inactive" }).length, 1);
    assert.equal(filterPromotionRows(rows, { kind: "percent" }).length, 1);
    assert.equal(activationMatchesScopeFilter(promo({ roomTypeIds: [ROOM], masterRoomTypeIds: [ROOM] }), "99999999-9999-4999-8999-999999999999", null), false);
    assert.equal(activationMatchesScopeFilter(promo({ roomTypeIds: [], masterRoomTypeIds: [] }), ROOM, null), true);
    assert.equal(commercialKindLabel("percent"), "Percentage");
    assert.equal(commercialValueLabel("percent", 10, (value) => `€${value}`), "10%");
    assert.equal(commercialValueLabel("fixed", 15, (value) => `€${value}`), "€15");
  });

  it("overview and promotions UI stay honest and preview before apply", () => {
    const overview = readRel("../../components/rates/commercial-overview/commercial-overview-view.tsx");
    const promotions = readRel("../../components/rates/promotions/promotions-view.tsx");
    const drawer = readRel("../../components/rates/promotions/promotion-detail-drawer.tsx");
    const actions = readRel("../../components/rates/commercial/promotion-activation-action-sheet.tsx");
    const workflow = readRel("../../components/rates/commercial-activation/commercial-activation-workflow.tsx");
    const functions = readRel("./commercial-overview.functions.ts");
    const server = readRel("./commercial-overview.server.ts");
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");

    assert.match(overview, /Commercial/);
    assert.match(overview, /Create Activation/);
    assert.match(overview, /COMMERCIAL_ATTRIBUTION_LABEL|COMMERCIAL_PERFORMANCE_NOTE/);
    assert.match(readRel("./commercial-overview.ts"), /Based on attributed bookings since Commercial Engine launch/);
    assert.match(overview, /COMMERCIAL_EMPTY_COPY/);
    assert.match(readRel("./commercial-overview.ts"), /No commercial activations yet/);
    assert.doesNotMatch(overview, /Expected Revenue|Expected Uplift|Occupancy Impact|Commercial ROI|Publish to Channels|Approve|Auto Optimize/);
    assert.doesNotMatch(overview, /Collected Promotion Revenue|Posted Discount|Paid Discount/);
    assert.match(promotions, /Activate Promotion/);
    assert.match(promotions, /Search name or code/);
    assert.doesNotMatch(promotions, /Create Promotion/);
    assert.doesNotMatch(promotions, /Pending Approval|Published|Draft|Rejected/);
    assert.match(drawer, /Overview/);
    assert.match(drawer, /Scope & Eligibility/);
    assert.match(drawer, /Performance/);
    assert.match(drawer, /Activity/);
    assert.match(drawer, /COMMERCIAL_ATTRIBUTION_LABEL/);
    assert.doesNotMatch(drawer, /Edit Promotion Master/);
    assert.match(actions, /previewPromotionActivation/);
    assert.match(actions, /applyPromotionActivation/);
    assert.match(actions, /COMMERCIAL_STALE_COPY/);
    assert.match(actions, /Review/);
    assert.match(actions, /Confirm/);
    assert.match(workflow, /Package/);
    assert.match(workflow, /Promotion/);
    assert.doesNotMatch(workflow, /Coming next/);
    assert.match(promotions, /CommercialActivationWorkflow/);
    assert.match(promotions, /rowKind === "master"/);
    assert.match(functions, /requireRateManager/);
    assert.doesNotMatch(server, /from\("pms_promotions"\)\s*\.update/);
    assert.doesNotMatch(server, /from\("pms_promotions"\)\s*\.insert/);
    assert.match(workspace, /case "commercial"/);
    assert.match(workspace, /case "promotions"/);
    assert.match(workspace, /case "packages"/);
    assert.match(workspace, /case "commercial-history"/);
  });

  it("compose uses batched attribution and stay overlap, not N+1 or room_subtotal", () => {
    const server = readRel("./commercial-overview.server.ts");
    assert.match(server, /hotel_reservation_promotions/);
    assert.match(server, /hotel_reservations/);
    assert.match(server, /room_subtotal_after_promotion/);
    assert.doesNotMatch(server, /SUM\(room_subtotal\)/);
    assert.doesNotMatch(server, /from\("pms_promotions"\)[\s\S]*\.update/);
    assert.match(server, /listPackageActivations/);
    assert.match(server, /listCommercialChangeHistory/);
    assert.match(server, /from\("pms_promotions"\)/);
    assert.match(server, /loadPromotionMasters/);
  });
});
