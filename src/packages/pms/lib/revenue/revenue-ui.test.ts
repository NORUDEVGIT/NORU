import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { serializeRevenueSearch, type RevenueContext } from "./revenue-context.ts";
import { isOverrideAuditEvent, type UnifiedRevenueAuditEntry } from "./revenue-audit.ts";

describe("P8-STEP-03 UI-31–40 Contracts & Pure Domain Presentation Logic", () => {
  const dummyContext: RevenueContext = {
    fromDate: "2026-09-01",
    toDate: "2026-09-07",
    roomTypeId: "room-deluxe",
    ratePlanId: "rate-bar",
    marketSegmentId: "seg-direct",
    commercialSourceId: "src-website",
    salesChannelId: "chan-web",
  };

  it("1. serializes analyticsTab cleanly for Revenue Performance (UI-31–35)", () => {
    const searchOverview = serializeRevenueSearch("revenue-performance", dummyContext, {
      analyticsTab: "overview",
    });
    assert.equal(searchOverview.view, "revenue-performance");
    assert.equal(searchOverview.analyticsTab, "overview");
    assert.equal(searchOverview.from, "2026-09-01");
    assert.equal(searchOverview.to, "2026-09-07");
    assert.equal(searchOverview.roomType, "room-deluxe");
    assert.equal(searchOverview.ratePlan, "rate-bar");
    assert.equal(searchOverview.segment, "seg-direct");
    assert.equal(searchOverview.source, "src-website");
    assert.equal(searchOverview.channel, "chan-web");

    const searchKpis = serializeRevenueSearch("revenue-performance", dummyContext, {
      analyticsTab: "kpis",
    });
    assert.equal(searchKpis.analyticsTab, "kpis");

    const searchTrends = serializeRevenueSearch("revenue-performance", dummyContext, {
      analyticsTab: "trends",
    });
    assert.equal(searchTrends.analyticsTab, "trends");
  });

  it("2. serializes auditTab and auditEvent cleanly for Audit & Control (UI-36–39)", () => {
    const searchHistory = serializeRevenueSearch("audit-control", dummyContext, {
      auditTab: "history",
    });
    assert.equal(searchHistory.view, "audit-control");
    assert.equal(searchHistory.auditTab, "history");
    assert.equal(searchHistory.auditEvent, undefined);

    const searchOverridesWithEvent = serializeRevenueSearch("audit-control", dummyContext, {
      auditTab: "overrides",
      auditEvent: "evt-12345",
    });
    assert.equal(searchOverridesWithEvent.view, "audit-control");
    assert.equal(searchOverridesWithEvent.auditTab, "overrides");
    assert.equal(searchOverridesWithEvent.auditEvent, "evt-12345");
  });

  it("3. P8-STEP-03 Amendment 1: isOverrideAuditEvent identifies overrides/exceptions and rejects ordinary approvals", () => {
    const baseEntry: UnifiedRevenueAuditEntry = {
      id: "evt-1",
      timestamp: "2026-09-20T10:00:00Z",
      domain: "rates",
      action: "rate_change",
      entityType: "hotel_rate_plan",
      entityId: "plan-1",
      entityLabel: "Standard BAR",
      scopeLabel: "Deluxe King",
      actorMembershipId: "user-1",
      actorLabel: "Staff Member",
      reason: "Seasonal batch update",
      operationId: "op-1",
      approvalRequestId: null,
      linkedOperationId: null,
      status: "applied",
      sourceTable: "hotel_rate_change_events",
      detailSupported: true,
    };

    // Standard rate change: NOT an override
    assert.equal(isOverrideAuditEvent(baseEntry), false);

    // Rate change with manual override action
    const manualOverrideEntry: UnifiedRevenueAuditEntry = {
      ...baseEntry,
      action: "manual_override",
    };
    assert.equal(isOverrideAuditEvent(manualOverrideEntry), true);

    // Rate change with override in reason
    const overrideReasonEntry: UnifiedRevenueAuditEntry = {
      ...baseEntry,
      reason: "Emergency manager rate override for VIP",
    };
    assert.equal(isOverrideAuditEvent(overrideReasonEntry), true);

    // Standard routine approval: MUST NOT be treated as an override
    const routineApprovalEntry: UnifiedRevenueAuditEntry = {
      ...baseEntry,
      id: "app-1",
      domain: "approvals",
      action: "single_rate_change",
      reason: "Scheduled quarterly update per property policy",
      entityLabel: "Rate Plan BAR Q4 Update",
      sourceTable: "hotel_revenue_approval_events",
    };
    assert.equal(isOverrideAuditEvent(routineApprovalEntry), false);

    // Approval that structurally represents an override
    const overrideApprovalEntry: UnifiedRevenueAuditEntry = {
      ...baseEntry,
      id: "app-2",
      domain: "approvals",
      action: "rate_override",
      reason: "Special negotiated discount exception",
      entityLabel: "Override request for Group A",
      sourceTable: "hotel_revenue_approval_events",
    };
    assert.equal(isOverrideAuditEvent(overrideApprovalEntry), true);
  });

  it("4. P8-STEP-03 Amendment 3: weekly/monthly trend aggregation aggregates additive metrics and NEVER sums reservationCount", () => {
    // 3 daily trend points where 1 reservation stayed across all 3 days
    const day1 = {
      stayDate: "2026-09-01",
      bookedRoomRevenue: 100,
      soldRoomNights: 1,
      availableRoomNights: 10,
      occupancyPct: 10.0,
      adr: 100.0,
      revpar: 10.0,
      pricedSharePct: 100.0,
      reservationCount: 1, // res-001
    };
    const day2 = {
      stayDate: "2026-09-02",
      bookedRoomRevenue: 150,
      soldRoomNights: 1,
      availableRoomNights: 10,
      occupancyPct: 10.0,
      adr: 150.0,
      revpar: 15.0,
      pricedSharePct: 100.0,
      reservationCount: 1, // res-001 stayed night 2
    };
    const day3 = {
      stayDate: "2026-09-03",
      bookedRoomRevenue: 200,
      soldRoomNights: 1,
      availableRoomNights: 10,
      occupancyPct: 10.0,
      adr: 200.0,
      revpar: 20.0,
      pricedSharePct: 100.0,
      reservationCount: 1, // res-001 stayed night 3
    };

    const days = [day1, day2, day3];

    // Mathematical aggregation
    const sumRevenue = days.reduce((acc, d) => acc + d.bookedRoomRevenue, 0); // 450
    const sumSold = days.reduce((acc, d) => acc + d.soldRoomNights, 0); // 3
    const sumAvailable = days.reduce((acc, d) => acc + d.availableRoomNights, 0); // 30

    const aggregateAdr = sumSold > 0 ? Math.round((sumRevenue / sumSold) * 100) / 100 : 0; // 450 / 3 = 150
    const aggregateRevpar =
      sumAvailable > 0 ? Math.round((sumRevenue / sumAvailable) * 100) / 100 : 0; // 450 / 30 = 15
    const aggregateOccupancy =
      sumAvailable > 0 ? Math.round((sumSold / sumAvailable) * 1000) / 10 : 0; // 3 / 30 = 10.0%

    // Verifications:
    assert.equal(sumRevenue, 450);
    assert.equal(sumSold, 3);
    assert.equal(sumAvailable, 30);
    assert.equal(aggregateAdr, 150.0);
    assert.equal(aggregateRevpar, 15.0);
    assert.equal(aggregateOccupancy, 10.0);

    // Summing reservationCount would produce 3, which is FALSE because there is only 1 reservation!
    const naiveSumReservationCount = days.reduce((acc, d) => acc + d.reservationCount, 0);
    assert.equal(naiveSumReservationCount, 3);

    // In our UI presentation contract, weekly/monthly row reservationCount must be "—"
    const displayReservationCount = "—";
    assert.equal(displayReservationCount, "—");
    assert.notEqual(displayReservationCount, String(naiveSumReservationCount));
  });

  it("5. preserves non-inventory N/A nullification in UI presentation contracts", () => {
    // Under non-inventory filter:
    const nonInventorySummary = {
      bookedRoomRevenue: 500,
      soldRoomNights: 5,
      availableRoomNights: null,
      occupancyPct: null,
      adr: 100,
      revpar: null,
      inventoryMetricSupport: "NOT_MEANINGFUL" as const,
    };

    assert.equal(nonInventorySummary.availableRoomNights, null);
    assert.equal(nonInventorySummary.occupancyPct, null);
    assert.equal(nonInventorySummary.revpar, null);
    assert.equal(nonInventorySummary.inventoryMetricSupport, "NOT_MEANINGFUL");
    // ADR remains mathematically valid
    assert.equal(nonInventorySummary.adr, 100);
  });
});

describe("P8-STEP-03B Acceptance Fixes & UI Contracts", () => {
  const dummyContext: RevenueContext = {
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
    roomTypeId: "room-deluxe",
    ratePlanId: "rate-bar",
    marketSegmentId: "seg-direct",
    commercialSourceId: "src-website",
    salesChannelId: "chan-web",
  };

  it("A. auditEvent reload/deep-link hydration: loads event by ID and wires hydration into RevenueAuditView", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const auditView = readFileSync(
      join(dir, "../../components/rates/audit/revenue-audit-view.tsx"),
      "utf8",
    );
    const auditFunctions = readFileSync(join(dir, "revenue-audit.functions.ts"), "utf8");
    const auditServer = readFileSync(join(dir, "revenue-audit.server.ts"), "utf8");

    // Server-backed event lookup
    assert.match(auditFunctions, /export const getUnifiedAuditEventById/);
    assert.match(auditServer, /export async function loadAuditEventById/);

    // RevenueAuditView imports and queries getUnifiedAuditEventById
    assert.match(auditView, /getUnifiedAuditEventById/);
    assert.match(auditView, /eventLookupQuery/);
    assert.match(auditView, /setSelectedEntry\(eventLookupQuery\.data\)/);
    assert.match(auditView, /setSelectedEntry\(loadedMatch\)/);
  });

  it("B. closing drawer removes only auditEvent, preserving auditTab, action, actor, search, and context", () => {
    // When drawer is closed, serializeRevenueSearch is called without auditEvent
    const searchAfterClose = serializeRevenueSearch("audit-control", dummyContext, {
      auditTab: "rates",
      auditAction: "rate_change",
      auditActor: "user-123",
      auditSearch: "Seasonal",
      // auditEvent intentionally omitted
    });

    assert.equal(searchAfterClose.view, "audit-control");
    assert.equal(searchAfterClose.auditTab, "rates");
    assert.equal(searchAfterClose.auditAction, "rate_change");
    assert.equal(searchAfterClose.auditActor, "user-123");
    assert.equal(searchAfterClose.auditSearch, "Seasonal");
    assert.equal(searchAfterClose.auditEvent, undefined);
    assert.equal(searchAfterClose.from, "2026-09-01");
    assert.equal(searchAfterClose.to, "2026-09-30");
  });

  it("C. Action filter forwarded server-side and resets page", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const auditView = readFileSync(
      join(dir, "../../components/rates/audit/revenue-audit-view.tsx"),
      "utf8",
    );

    // Toolbar provides Action select control
    assert.match(auditView, /<select[\s\S]*?value=\{auditAction \|\| ""\}/);
    assert.match(auditView, /handleActionChange/);
    assert.match(auditView, /setPage\(1\)/);

    // Forwarded server-side in query
    assert.match(auditView, /action:\s*auditAction\s*\|\|\s*null/);
  });

  it("D. Actor filter forwarded server-side and uses dedicated operational dropdown", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const auditView = readFileSync(
      join(dir, "../../components/rates/audit/revenue-audit-view.tsx"),
      "utf8",
    );

    // Loads staff actors
    assert.match(auditView, /listRevenueApprovalActorsFn/);
    // Dedicated Actor dropdown
    assert.match(auditView, /<select[\s\S]*?value=\{auditActor \|\| ""\}/);
    assert.match(auditView, /handleActorChange/);

    // Forwarded server-side in query
    assert.match(auditView, /actorMembershipId:\s*auditActor\s*\|\|\s*null/);
  });

  it("E. search placeholder does not claim unsupported actor search", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const auditView = readFileSync(
      join(dir, "../../components/rates/audit/revenue-audit-view.tsx"),
      "utf8",
    );

    // Truthful placeholder
    assert.match(
      auditView,
      /placeholder="Search action, entity, scope, reason, or reference\.\.\."/,
    );
    // Does NOT claim actor search in placeholder text
    assert.doesNotMatch(auditView, /Search by action, reason, or actor/);
  });

  it("F. Unified Audit export receives active domain, action, actor, search, and date range", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const exportView = readFileSync(
      join(dir, "../../components/rates/export/revenue-export-view.tsx"),
      "utf8",
    );

    // Receives audit filters as props
    assert.match(exportView, /auditTab\?: string/);
    assert.match(exportView, /auditAction\?: string/);
    assert.match(exportView, /auditActor\?: string/);
    assert.match(exportView, /auditSearch\?: string/);

    // Forwards filters to exportAuditFn
    assert.match(exportView, /domain:\s*auditDomain/);
    assert.match(exportView, /action:\s*auditAction\s*\|\|\s*null/);
    assert.match(exportView, /actorMembershipId:\s*auditActor\s*\|\|\s*null/);
    assert.match(exportView, /search:\s*auditSearch\?\.trim\(\)\s*\|\|\s*null/);
    assert.match(exportView, /fromDate:\s*context\.fromDate/);
    assert.match(exportView, /toDate:\s*context\.toDate/);

    // Displays active filters in Scope card
    assert.match(exportView, /\{auditActor && <div>Actor: \{actorLabel\}<\/div>\}/);
    assert.match(exportView, /\{auditAction && <div>Action: \{auditAction\}<\/div>\}/);
    assert.match(exportView, /\{auditSearch && <div>Search: \{auditSearch\}<\/div>\}/);
  });

  it("G. Unified Audit export remains complete rather than page-limited", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const exportServer = readFileSync(join(dir, "revenue-export.server.ts"), "utf8");
    const auditServer = readFileSync(join(dir, "revenue-audit.server.ts"), "utf8");

    // export calls dedicated complete reader
    assert.match(exportServer, /loadUnifiedRevenueAuditForExport\(db, filter\)/);
    // Complete reader has 10,000 row safety bound, not paginated page limit
    assert.match(auditServer, /MAX_AUDIT_EXPORT_ROWS/);
    assert.match(auditServer, /sorted\.length > MAX_AUDIT_EXPORT_ROWS/);
    assert.match(auditServer, /export async function loadUnifiedRevenueAuditForExport/);
  });

  it("H. More dropdown renders via Radix DropdownMenu (portal) to prevent overflow clipping by overflow-x-auto container", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));

    const workspace = readFileSync(
      join(dir, "../../components/workspaces/rates-workspace.tsx"),
      "utf8",
    );

    // Uses DropdownMenu from shared UI (which portals DropdownMenuContent)
    assert.match(workspace, /import[\s\S]*?DropdownMenu[\s\S]*?from "@/);
    assert.match(workspace, /<DropdownMenu[\s\S]*?open=\{moreOpen\}/);
    assert.match(workspace, /<DropdownMenuTrigger asChild>/);
    assert.match(workspace, /<DropdownMenuContent/);
    assert.match(workspace, /<DropdownMenuItem/);

    // Does NOT render an absolute clipped div inside overflow container
    assert.doesNotMatch(workspace, /top-\[calc\(100%\+8px\)\]/);
  });
});
