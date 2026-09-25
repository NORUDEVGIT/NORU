import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE,
  emptyRestrictionState,
  groupRestrictionHistoryByOperation,
  type RestrictionHistoryRow,
} from "./restriction-change.ts";
import {
  RESTRICTION_HISTORY_EMPTY_COPY,
  RESTRICTION_HISTORY_EMPTY_SECONDARY,
  RESTRICTION_HISTORY_PAGE_SIZE,
  RESTRICTION_HISTORY_PAGE_SIZES,
  RESTRICTION_HISTORY_REASON_EMPTY,
  historyPaginationRange,
  restrictionHistoryActionLabel,
  restrictionHistoryActorLabel,
  restrictionHistoryAfterLabel,
  restrictionHistoryBeforeAfter,
  restrictionHistoryBeforeLabel,
  restrictionHistoryChangedFields,
  restrictionHistoryReasonLabel,
  restrictionHistorySourceLabel,
  summarizeRestrictionOperation,
} from "./restriction-history.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function row(partial: Partial<RestrictionHistoryRow> = {}): RestrictionHistoryRow {
  return {
    id: "e1",
    restaurantId: "44444444-4444-4444-8444-444444444444",
    operationId: "op-1",
    actionType: "single_restriction_change",
    ratePlanId: "11111111-1111-4111-8111-111111111111",
    ratePlanCode: "BAR",
    ratePlanName: "Best Available",
    roomTypeId: "22222222-2222-4222-8222-222222222222",
    roomTypeName: "Deluxe",
    stayDate: "2026-09-24",
    previous: emptyRestrictionState(),
    next: {
      minStay: 2,
      maxStay: null,
      closedToArrival: true,
      closedToDeparture: false,
      stopSell: false,
    },
    reason: null,
    actorMembershipId: "mem-1",
    actorName: null,
    source: "restriction_calendar",
    createdAt: "2026-09-24T10:00:00.000Z",
    ...partial,
  };
}

describe("RR-P3-04 — history display", () => {
  it("humanizes actions, sources, actor fallback, stay date, and null reason", () => {
    assert.equal(restrictionHistoryActionLabel("single_restriction_change"), "Single Restriction Change");
    assert.equal(restrictionHistoryActionLabel("bulk_restriction_change"), "Bulk Restriction Change");
    assert.equal(restrictionHistoryActionLabel("clear_restriction"), "Clear Restrictions");
    assert.equal(restrictionHistorySourceLabel("restriction_calendar"), "Restriction Calendar");
    assert.equal(restrictionHistorySourceLabel("rate_revenue"), "Rate & Revenue");
    assert.equal(restrictionHistoryReasonLabel(null), RESTRICTION_HISTORY_REASON_EMPTY);
    assert.equal(restrictionHistoryReasonLabel(""), RESTRICTION_HISTORY_REASON_EMPTY);
    assert.equal(restrictionHistoryActorLabel({ actorName: null, actorMembershipId: "mem-1" }), "Staff");
    assert.equal(restrictionHistoryActorLabel({ actorName: "Ada", actorMembershipId: "mem-1" }), "Ada");
    assert.equal(row().stayDate, "2026-09-24");
  });

  it("derives changed-field badges and humanized before/after", () => {
    const item = row();
    assert.deepEqual(restrictionHistoryChangedFields(item), ["minStay", "closedToArrival"]);
    assert.match(restrictionHistoryBeforeLabel(item), /Min Stay: —/);
    assert.match(restrictionHistoryBeforeLabel(item), /CTA: Open/);
    assert.match(restrictionHistoryAfterLabel(item), /Min Stay: 2 nights/);
    assert.match(restrictionHistoryAfterLabel(item), /CTA: Closed/);
    assert.match(restrictionHistoryBeforeAfter(item), /Min Stay: — → 2 nights/);
    assert.match(restrictionHistoryBeforeAfter(item), /CTA: Open → Closed/);
  });

  it("renders CLEAR_ALL as previous restrictions → No restrictions", () => {
    const clear = row({
      actionType: "clear_restriction",
      previous: {
        minStay: 2,
        maxStay: 7,
        closedToArrival: true,
        closedToDeparture: false,
        stopSell: true,
      },
      next: emptyRestrictionState(),
    });
    assert.equal(restrictionHistoryActionLabel(clear.actionType), "Clear Restrictions");
    assert.match(restrictionHistoryBeforeLabel(clear), /Min Stay: 2 nights/);
    assert.equal(restrictionHistoryAfterLabel(clear), "No restrictions");
    assert.match(restrictionHistoryBeforeAfter(clear), /→ No restrictions/);
    assert.doesNotMatch(restrictionHistoryAfterLabel(clear), /Deleted database row/i);
  });

  it("paginates with Room & Inventory sizes and does not load unbounded rows", () => {
    assert.equal(RESTRICTION_HISTORY_PAGE_SIZE, 25);
    assert.equal(RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE, 25);
    assert.deepEqual([...RESTRICTION_HISTORY_PAGE_SIZES], [10, 25, 50]);
    const first = historyPaginationRange(1, 25, 80);
    assert.deepEqual(first, { start: 1, end: 25, total: 80, pageCount: 4 });
    const next = historyPaginationRange(2, 25, 80);
    assert.equal(next.start, 26);
    assert.equal(next.end, 50);
    const empty = historyPaginationRange(1, 25, 0);
    assert.deepEqual(empty, { start: 0, end: 0, total: 0, pageCount: 1 });
  });

  it("groups a bulk operation and keeps a single event as one operation", () => {
    const bulk = groupRestrictionHistoryByOperation([
      row({ id: "a", stayDate: "2026-09-24", actionType: "bulk_restriction_change" }),
      row({
        id: "b",
        stayDate: "2026-09-25",
        actionType: "bulk_restriction_change",
        ratePlanCode: "CORP",
        ratePlanId: "33333333-3333-4333-8333-333333333333",
      }),
    ]);
    assert.equal(bulk.length, 1);
    assert.equal(bulk[0]?.events.length, 2);
    const summary = summarizeRestrictionOperation(bulk[0]!);
    assert.equal(summary.targetCount, 2);
    assert.equal(summary.dateCount, 2);
    assert.equal(summary.ratePlanCount, 2);
    const single = groupRestrictionHistoryByOperation([row({})]);
    assert.equal(single[0]?.events.length, 1);
  });
});

describe("RR-P3-04 — wiring, honesty and Phase 3 flow lock", () => {
  const view = readRel("../../components/rates/restriction-history/restriction-history-view.tsx");
  const filters = readRel("../../components/rates/restriction-history/restriction-history-filters.tsx");
  const table = readRel("../../components/rates/restriction-history/restriction-history-table.tsx");
  const drawer = readRel("../../components/rates/restriction-history/restriction-history-detail-drawer.tsx");
  const empty = readRel("../../components/rates/restriction-history/restriction-history-empty-state.tsx");
  const helper = readRel("./restriction-history.ts");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const ia = readRel("../rate-revenue-workspace.ts");
  const functions = readRel("./restriction-change.functions.ts");
  const server = readRel("./restriction-change.server.ts");
  const calendarCell = readRel("../../components/rates/restrictions/restriction-calendar-cell.tsx");
  const calendarView = readRel("../../components/rates/restrictions/restriction-calendar-view.tsx");
  const edit = readRel("../../components/rates/restriction-detail/restriction-edit-form.tsx");
  const bulkView = readRel("../../components/rates/bulk-restriction/bulk-restriction-view.tsx");
  const confirm = readRel("../../components/rates/restriction-impact/restriction-confirm-apply.tsx");
  const controlServer = readRel("./revenue-control.server.ts");
  const tabs = readRel("../../components/rates/rates-tabs.tsx");

  it("lists history from hotel_rate_restriction_change_events with created_at filters", () => {
    assert.match(view, /listRestrictionChangeHistory/);
    assert.match(view, /from: context\.fromDate/);
    assert.match(view, /to: context\.toDate/);
    assert.doesNotMatch(view, /stayDate:/);
    assert.match(filters, /Changed Between/);
    assert.match(filters, /when the\s+change was recorded/);
    assert.match(view, /roomTypeId: context\.roomTypeId/);
    assert.match(view, /ratePlanId: context\.ratePlanId/);
    assert.match(view, /actionType: actionType/);
    assert.doesNotMatch(filters, /Published|Pending|Approved|Actor/);
    assert.match(functions, /export const listRestrictionChangeHistory/);
    assert.match(server, /gte\("created_at"/);
    assert.match(server, /lte\("created_at"/);
    assert.match(helper, /hotel_rate_restriction_change_events/);
    assert.doesNotMatch(view, /hotel_rate_change_events/);
    assert.doesNotMatch(view, /restaurant_staff_audit_log/);
  });

  it("paginates on the server and shows Showing X–Y of Z", () => {
    assert.match(view, /page,/);
    assert.match(view, /pageSize,/);
    assert.match(view, /RESTRICTION_HISTORY_PAGE_SIZE/);
    assert.match(view, /RESTRICTION_HISTORY_PAGE_SIZES/);
    assert.match(view, /Showing \{range\.start\}–\{range\.end\} of \{range\.total\}/);
    assert.match(view, /Previous/);
    assert.match(view, /Next/);
    assert.doesNotMatch(view, /limit: 10000|pageSize: 1000/);
  });

  it("opens a consistent operation drawer for single and bulk rows", () => {
    assert.match(table, /View Details/);
    assert.match(table, /View Operation/);
    assert.match(table, /MoreHorizontal/);
    assert.match(view, /getRestrictionOperationDetail/);
    assert.match(view, /\["restriction-operation"/);
    assert.match(view, /operationId: selected\?\.operationId/);
    assert.match(drawer, /Restriction Change Details/);
    assert.match(drawer, /affected targets/);
    assert.match(drawer, /restrictionHistoryReasonLabel/);
    assert.match(drawer, /restrictionHistoryActorLabel/);
    assert.match(drawer, /restrictionHistorySourceLabel/);
    assert.match(drawer, /onClose/);
    assert.match(empty, /RESTRICTION_HISTORY_EMPTY_COPY/);
    assert.match(empty, /RESTRICTION_HISTORY_EMPTY_SECONDARY/);
    assert.equal(RESTRICTION_HISTORY_EMPTY_COPY.includes("restriction history was enabled"), true);
    assert.equal(
      RESTRICTION_HISTORY_EMPTY_SECONDARY.includes("Earlier restriction changes are not available"),
      true,
    );
  });

  it("does not present export, approval, forecast or invented statuses", () => {
    const files = [view, filters, table, drawer, empty, helper];
    for (const source of files) {
      assert.doesNotMatch(source, /Published/);
      assert.doesNotMatch(source, /Pending/);
      assert.doesNotMatch(source, /Approved/);
      assert.doesNotMatch(source, /Submit for Approval/);
      assert.doesNotMatch(source, /Export CSV/);
      assert.doesNotMatch(source, /forecast/i);
      assert.doesNotMatch(source, /Synced to OTA/);
      assert.doesNotMatch(source, /pre-0102 history exists/i);
    }
  });

  it("enriches actor names without a migration or new RPC", () => {
    assert.match(server, /attachHistoryActorNames/);
    assert.match(server, /from\("restaurant_users"\)/);
    assert.match(server, /from\("profiles"\)/);
    assert.match(functions, /supabaseAdmin/);
    assert.match(functions, /loadRestrictionChangeHistory\(supabaseAdmin/);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0102_pms_rate_restriction_change_events.sql"));
    assert.ok(!migrations.some((name) => /p3-04|restriction.history.ui/i.test(name)));
  });

  it("locks the Phase 3 calendar → apply → history path", () => {
    assert.match(calendarCell, /export function RestrictionCalendarCell/);
    assert.match(calendarView, /RestrictionCalendarGrid/);
    assert.match(edit, /previewRestrictionChanges/);
    assert.match(edit, /applyRestrictionChanges/);
    assert.match(edit, /invalidateQueries\(\{ queryKey: \["restriction-change-history"\] \}\)/);
    assert.match(bulkView, /expandBulkTargets/);
    assert.match(bulkView, /previewRestrictionChanges/);
    assert.match(bulkView, /applyFn\(\{ data: requestPayload\(\) \}\)/);
    assert.match(confirm, /Confirm & Apply/);
    assert.match(bulkView, /invalidateQueries\(\{ queryKey: \["restriction-change-history"\] \}\)/);
    assert.match(server, /operation_id/);
    assert.match(view, /listRestrictionChangeHistory/);
    assert.match(view, /"restriction-change-history"/);
    assert.match(drawer, /operationId/);
    assert.match(controlServer, /from\("hotel_rate_restrictions"\)/);
    assert.match(workspace, /<RestrictionHistoryView/);
    assert.match(workspace, /<RestrictionCalendarView/);
    assert.match(workspace, /<BulkRestrictionView/);
    assert.doesNotMatch(workspace, /<RateRestrictionsTab/);
    assert.doesNotMatch(workspace, /saveRateRestriction/);
    assert.match(tabs, /export function RateRestrictionsTab/);
    const historyDef = ia.slice(ia.indexOf('id: "restriction-history"'), ia.indexOf('id: "demand-forecast"'));
    assert.match(historyDef, /implemented: true/);
    assert.match(helper, /compatibility writer/);
  });

  it("does not change 0016 pricing", () => {
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(view, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(helper, /rpc\(/);
  });
});
