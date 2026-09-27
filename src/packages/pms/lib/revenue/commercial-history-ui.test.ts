import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVENUE_UI_SCREEN_MAP,
  foundationRevenueViews,
  implementedRevenueViews,
} from "../rate-revenue-workspace.ts";
import { CARD3_PACKAGES_HREF, CARD3_PROMOTIONS_HREF } from "../pms-property-setup-card3.ts";
import {
  COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE,
  COMMERCIAL_HISTORY_EMPTY_COPY,
  COMMERCIAL_HISTORY_IMMUTABLE_COPY,
  COMMERCIAL_HISTORY_PAGE_SIZES,
  COMMERCIAL_HISTORY_STATUS_NOT_ACTIVATED,
  commercialHistoryActionLabel,
  commercialHistoryChangesSummary,
  commercialHistoryEntityFromState,
  commercialHistoryPageSize,
  historyPaginationRange,
  type CommercialHistoryRow,
} from "./commercial-history.ts";
import {
  commercialHistoryFieldChanges,
  composeCommercialHistoryOperationDetail,
  groupCommercialHistoryByOperation,
  toCommercialHistoryWorkspaceRow,
} from "./commercial-history-ui.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const ROOM = "33333333-3333-4333-8333-333333333333";
const PLAN = "66666666-6666-4666-8666-666666666666";
const OP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function event(partial: Partial<CommercialHistoryRow> = {}): CommercialHistoryRow {
  return {
    id: "e1",
    restaurantId: "44444444-4444-4444-8444-444444444444",
    operationId: OP,
    entityType: "promotion_activation",
    entityId: "11111111-1111-4111-8111-111111111111",
    masterId: "22222222-2222-4222-8222-222222222222",
    actionType: "promotion_activation_edited",
    beforeState: {
      active: true,
      validFrom: "2026-10-01",
      validTo: "2026-10-10",
      bookingFrom: "2026-09-01",
      bookingTo: "2026-09-30",
      priority: 10,
      reason: "launch",
      roomTypeIds: [],
      ratePlanIds: [],
      promotionName: "Spring 10",
      promotionCode: "SPRING10",
    },
    afterState: {
      active: true,
      validFrom: "2026-10-05",
      validTo: "2026-10-20",
      bookingFrom: "2026-09-01",
      bookingTo: "2026-09-30",
      priority: 10,
      reason: "launch",
      roomTypeIds: [ROOM],
      ratePlanIds: [PLAN],
      promotionName: "Spring 10",
      promotionCode: "SPRING10",
    },
    reason: "Stay window update",
    actorMembershipId: "mem-1",
    actorName: "Ada",
    source: "rate_revenue",
    createdAt: "2026-09-24T10:00:00.000Z",
    changedFields: ["validity", "roomTypes", "ratePlans"],
    ...partial,
  };
}

describe("RR-P5-UI-04 commercial history", () => {
  it("marks commercial-history implemented and keeps UI-17–20", () => {
    assert.ok(implementedRevenueViews().includes("commercial"));
    assert.ok(implementedRevenueViews().includes("promotions"));
    assert.ok(implementedRevenueViews().includes("packages"));
    assert.ok(implementedRevenueViews().includes("commercial-history"));
    assert.ok(!foundationRevenueViews().includes("commercial-history"));
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-17")?.view, "commercial");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-18")?.view, "promotions");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-19")?.view, "packages");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-20")?.view, null);
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-21")?.view, "commercial-history");
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /case "commercial-history"/);
    assert.match(workspace, /<CommercialHistoryView/);
    assert.match(workspace, /requestedView !== "commercial-history"/);
    assert.doesNotMatch(workspace, /view=activation|view: "activation"/);
  });

  it("groups multiple events for one operation_id into one list row", () => {
    const later = event({
      id: "e2",
      createdAt: "2026-09-24T10:05:00.000Z",
      changedFields: ["ratePlans"],
      afterState: {
        ...event().afterState,
        ratePlanIds: [PLAN],
      },
    });
    const grouped = groupCommercialHistoryByOperation([later, event()]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.operationId, OP);
    assert.equal(grouped[0]?.createdAt, "2026-09-24T10:05:00.000Z");
    assert.deepEqual(grouped[0]?.changedFields, ["ratePlans", "validity", "roomTypes"]);
    const row = toCommercialHistoryWorkspaceRow(grouped[0]!, 2);
    assert.equal(row.eventCount, 2);
    assert.equal(row.entityName, "Spring 10");
    assert.equal(row.entityCode, "SPRING10");
    const detail = composeCommercialHistoryOperationDetail(
      {
        operationId: OP,
        actionType: "promotion_activation_edited",
        entityType: "promotion_activation",
        source: "rate_revenue",
        reason: "Stay window update",
        actorMembershipId: "mem-1",
        actorName: "Ada",
        createdAt: "2026-09-24T10:00:00.000Z",
        restaurantId: event().restaurantId,
        events: [event(), later],
      },
      { roomNames: new Map([[ROOM, "Deluxe"]]), planNames: new Map([[PLAN, "BAR"]]) },
    );
    assert.equal(detail.events.length, 2);
    assert.ok(detail.changes.some((change) => change.label === "Stay Valid From"));
    assert.ok(detail.changes.some((change) => change.after === "Deluxe"));
    assert.ok(detail.changes.some((change) => change.after === "BAR"));
  });

  it("humanizes create/edit/deactivate/reactivate labels for promotions and packages", () => {
    assert.equal(commercialHistoryActionLabel("promotion_activation_created"), "Promotion Activated");
    assert.equal(commercialHistoryActionLabel("promotion_activation_edited"), "Promotion Edited");
    assert.equal(commercialHistoryActionLabel("promotion_activation_deactivated"), "Promotion Deactivated");
    assert.equal(
      commercialHistoryActionLabel("promotion_activation_edited", { active: false }, { active: true }),
      "Promotion Reactivated",
    );
    assert.equal(commercialHistoryActionLabel("package_activation_created"), "Package Activated");
    assert.equal(commercialHistoryActionLabel("package_activation_edited"), "Package Edited");
    assert.equal(commercialHistoryActionLabel("package_activation_deactivated"), "Package Deactivated");
    assert.equal(
      commercialHistoryActionLabel("package_activation_edited", { active: false }, { active: true }),
      "Package Reactivated",
    );
    assert.equal(commercialHistoryActionLabel("promotion_activation_scope_changed"), "Promotion Scope Changed");
    assert.equal(commercialHistoryActionLabel("package_activation_scope_changed"), "Package Scope Changed");
    assert.equal(commercialHistoryChangesSummary(["validity", "roomTypes"]), "Stay dates, room scope");
    assert.equal(commercialHistoryEntityFromState("promotion_activation", null).name, "Promotion Activation");
    assert.equal(commercialHistoryEntityFromState("package_activation", null).name, "Package Activation");
  });

  it("resets page on filter changes and searches on the server only", () => {
    const view = readRel("../../components/rates/commercial-history/commercial-history-view.tsx");
    const filters = readRel("../../components/rates/commercial-history/commercial-history-filters.tsx");
    const server = readRel("./commercial-history.server.ts");
    assert.match(view, /setPage\(1\)/);
    assert.match(view, /context\.fromDate, context\.toDate, entityType, actionType, actorId, search, pageSize/);
    assert.match(view, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 300\)/);
    assert.match(view, /search: search \|\| undefined/);
    assert.match(view, /"commercial-change-history"/);
    assert.doesNotMatch(view, /rows\.filter\(/);
    assert.doesNotMatch(filters, /rows\.filter\(/);
    assert.match(server, /reason\.ilike\.%\$\{term\}%/);
    assert.match(server, /after_state->>promotionCode\.ilike/);
    assert.match(server, /after_state->>packageName\.ilike/);
    assert.match(server, /actor_membership_id/);
  });

  it("paginates on the server with default 25 and 10/25/50", () => {
    const view = readRel("../../components/rates/commercial-history/commercial-history-view.tsx");
    assert.deepEqual(COMMERCIAL_HISTORY_PAGE_SIZES, [10, 25, 50]);
    assert.equal(COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE, 25);
    assert.equal(commercialHistoryPageSize(25), 25);
    assert.deepEqual(historyPaginationRange(1, 25, 40), { start: 1, end: 25, total: 40, pageCount: 2 });
    assert.match(view, /COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE/);
    assert.match(view, /COMMERCIAL_HISTORY_PAGE_SIZES/);
    assert.match(view, /historyPaginationRange/);
    assert.match(view, /Showing \{range\.start\}–\{range\.end\} of \{range\.total\}/);
    assert.match(view, /page,/);
    assert.match(view, /pageSize,/);
    assert.doesNotMatch(view, /pageSize: 1000|limit: 10000/);
  });

  it("renders named scopes, actor, reason, and create before state without UUID arrays", () => {
    const names = { roomNames: new Map([[ROOM, "Deluxe"]]), planNames: new Map([[PLAN, "BAR"]]) };
    const created = commercialHistoryFieldChanges(null, {
      active: true,
      validFrom: "2026-10-01",
      validTo: "2026-10-10",
      roomTypeIds: [ROOM],
      ratePlanIds: [],
      promotionName: "Spring 10",
      promotionCode: "SPRING10",
    }, names);
    assert.equal(created.find((row) => row.key === "active")?.before, COMMERCIAL_HISTORY_STATUS_NOT_ACTIVATED);
    assert.equal(created.find((row) => row.key === "roomTypes")?.after, "Deluxe");
    assert.equal(created.find((row) => row.key === "ratePlans")?.after, "All eligible");
    assert.ok(!JSON.stringify(created).includes(ROOM));
    const detail = composeCommercialHistoryOperationDetail(
      {
        operationId: OP,
        actionType: "promotion_activation_created",
        entityType: "promotion_activation",
        source: "rate_revenue",
        reason: null,
        actorMembershipId: "mem-1",
        actorName: "Ada",
        createdAt: "2026-09-24T10:00:00.000Z",
        restaurantId: event().restaurantId,
        events: [event({ actionType: "promotion_activation_created", beforeState: null, reason: null })],
      },
      names,
    );
    assert.equal(detail.actorName, "Ada");
    assert.equal(detail.reason, null);
    assert.ok(detail.changes.every((change) => !change.before.includes(ROOM) && !change.after.includes(ROOM) && !change.after.includes(PLAN)));
    assert.ok(detail.snapshot.every((field) => !field.value.includes(ROOM) && !field.value.includes(PLAN)));
    assert.equal(COMMERCIAL_HISTORY_EMPTY_COPY, "No commercial activation changes have been recorded yet.");
    assert.equal(COMMERCIAL_HISTORY_IMMUTABLE_COPY, "Commercial history is immutable.");
  });

  it("keeps history read-only and wires entity plus Card 3 links", () => {
    const view = readRel("../../components/rates/commercial-history/commercial-history-view.tsx");
    const table = readRel("../../components/rates/commercial-history/commercial-history-table.tsx");
    const drawer = readRel("../../components/rates/commercial-history/commercial-history-detail-drawer.tsx");
    const empty = readRel("../../components/rates/commercial-history/commercial-history-empty-state.tsx");
    const filters = readRel("../../components/rates/commercial-history/commercial-history-filters.tsx");
    const server = readRel("./commercial-history.server.ts");
    const uiServer = readRel("./commercial-history-ui.server.ts");
    const functions = readRel("./commercial-history.functions.ts");
    const applyPromo = readRel("../../components/rates/commercial-activation/promotion-activation-flow.tsx");
    const applyPackage = readRel("../../components/rates/commercial-activation/package-activation-flow.tsx");
    const overview = readRel("../../components/rates/commercial-overview/commercial-overview-view.tsx");
    const promoDrawer = readRel("../../components/rates/promotions/promotion-detail-drawer.tsx");
    const packageDrawer = readRel("../../components/rates/packages/package-detail-drawer.tsx");
    for (const source of [view, table, drawer, empty, filters]) {
      assert.doesNotMatch(source, /Undo|Revert|Replay|Delete History|Edit History/);
      assert.doesNotMatch(source, /Approval Status|OTA Status|forecast impact/i);
    }
    assert.doesNotMatch(server, /\s*\.update\b/);
    assert.doesNotMatch(server, /\s*\.delete\b/);
    assert.doesNotMatch(uiServer, /\s*\.update\b/);
    assert.doesNotMatch(uiServer, /\s*\.delete\b/);
    assert.doesNotMatch(functions, /\s*\.update\b/);
    assert.doesNotMatch(functions, /\s*\.delete\b/);
    assert.match(drawer, /onNavigateView\(detail\.entityType === "package_activation" \? "packages" : "promotions"\)/);
    assert.match(drawer, /CARD3_PROMOTIONS_HREF/);
    assert.match(drawer, /CARD3_PACKAGES_HREF/);
    assert.ok(CARD3_PROMOTIONS_HREF.includes("card3Domain=revenue-commercial-rules"));
    assert.ok(CARD3_PACKAGES_HREF.includes("card3Domain=meal-plans-packages"));
    assert.match(applyPromo, /\["commercial-change-history"\]/);
    assert.match(applyPackage, /\["commercial-change-history"\]/);
    assert.match(overview, /View full history/);
    assert.match(overview, /onNavigateView\("commercial-history"\)/);
    assert.match(promoDrawer, /View full history/);
    assert.match(packageDrawer, /View full history/);
    assert.match(empty, /COMMERCIAL_HISTORY_EMPTY_COPY/);
  });
});
