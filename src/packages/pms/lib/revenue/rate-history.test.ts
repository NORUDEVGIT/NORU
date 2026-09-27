import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RATE_CHANGE_HISTORY_PAGE_SIZE,
  groupHistoryByOperation,
  type RateChangeHistoryRow,
} from "./rate-change.ts";
import {
  RATE_HISTORY_DEFAULT_PAGE_SIZE,
  RATE_HISTORY_EMPTY_COPY,
  RATE_HISTORY_EMPTY_SECONDARY,
  RATE_HISTORY_PAGE_SIZES,
  RATE_HISTORY_REASON_EMPTY,
  copySourceDateFromMetadata,
  formatHistoryMoney,
  historyPaginationRange,
  rateHistoryActionLabel,
  rateHistoryActorLabel,
  rateHistoryReasonLabel,
  rateHistorySourceLabel,
} from "./rate-history.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function row(partial: Partial<RateChangeHistoryRow> = {}): RateChangeHistoryRow {
  return {
    id: "e1",
    operationId: "op-1",
    actionType: "single_rate_change",
    ratePlanId: "11111111-1111-1111-1111-111111111111",
    ratePlanCode: "BAR",
    ratePlanName: "Best Available",
    roomTypeId: "22222222-2222-2222-2222-222222222222",
    roomTypeName: "Deluxe",
    stayDate: "2026-09-24",
    previousBaseRate: 100,
    previousOverrideRate: null,
    previousEffectiveRate: 100,
    newOverrideRate: 120,
    newEffectiveRate: 120,
    absoluteDelta: 20,
    percentageDelta: 20,
    currency: "EUR",
    reason: null,
    actorMembershipId: "mem-1",
    actorName: null,
    source: "rate_calendar",
    createdAt: "2026-09-24T10:00:00.000Z",
    metadata: {},
    ...partial,
  };
}

describe("RR-P2-05 — history display", () => {
  it("humanizes actions, sources, currency, before/after, and null reason", () => {
    assert.equal(rateHistoryActionLabel("single_rate_change"), "Single Rate Change");
    assert.equal(rateHistoryActionLabel("bulk_rate_change"), "Bulk Rate Change");
    assert.equal(rateHistoryActionLabel("reset_override"), "Reset to Base");
    assert.equal(rateHistoryActionLabel("copy_rate"), "Copied Rate");
    assert.equal(rateHistorySourceLabel("rate_calendar"), "Rate Calendar");
    assert.equal(rateHistorySourceLabel("rate_revenue"), "Rate & Revenue");
    assert.equal(rateHistoryReasonLabel(null), RATE_HISTORY_REASON_EMPTY);
    assert.equal(rateHistoryActorLabel({ actorName: null, actorMembershipId: "mem-1" }), "Staff");
    assert.equal(rateHistoryActorLabel({ actorName: "Ada", actorMembershipId: "mem-1" }), "Ada");
    assert.match(formatHistoryMoney(120, "EUR"), /120/);
    const reset = row({
      actionType: "reset_override",
      previousEffectiveRate: 140,
      newEffectiveRate: 100,
      newOverrideRate: null,
    });
    assert.equal(reset.newOverrideRate, null);
    assert.equal(reset.newEffectiveRate, 100);
    assert.equal(copySourceDateFromMetadata({ sourceDate: "2026-09-20" }), "2026-09-20");
    assert.equal(copySourceDateFromMetadata({}), null);
  });

  it("paginates with Room & Inventory sizes and does not load unbounded rows", () => {
    assert.equal(RATE_HISTORY_DEFAULT_PAGE_SIZE, 25);
    assert.deepEqual([...RATE_HISTORY_PAGE_SIZES], [10, 25, 50]);
    const first = historyPaginationRange(1, 25, 80);
    assert.deepEqual(first, { start: 1, end: 25, total: 80, pageCount: 4 });
    const next = historyPaginationRange(2, 25, 80);
    assert.equal(next.start, 26);
    assert.equal(next.end, 50);
    const empty = historyPaginationRange(1, 25, 0);
    assert.deepEqual(empty, { start: 0, end: 0, total: 0, pageCount: 1 });
    assert.equal(RATE_CHANGE_HISTORY_PAGE_SIZE, 25);
  });

  it("groups a bulk operation and keeps a single event as one operation", () => {
    const bulk = groupHistoryByOperation([
      row({ id: "a", stayDate: "2026-09-24", actionType: "bulk_rate_change" }),
      row({ id: "b", stayDate: "2026-09-25", actionType: "bulk_rate_change", ratePlanCode: "CORP" }),
    ]);
    assert.equal(bulk.length, 1);
    assert.equal(bulk[0]?.events.length, 2);
    assert.equal(bulk[0]?.affectedDates.length, 2);
    assert.equal(bulk[0]?.affectedRatePlanIds.length, 1);
    const single = groupHistoryByOperation([row({})]);
    assert.equal(single[0]?.events.length, 1);
  });
});

describe("RR-P2-05 — wiring, honesty and Phase 2 flow lock", () => {
  const view = readRel("../../components/rates/rate-history/rate-history-view.tsx");
  const filters = readRel("../../components/rates/rate-history/rate-history-filters.tsx");
  const table = readRel("../../components/rates/rate-history/rate-history-table.tsx");
  const drawer = readRel("../../components/rates/rate-history/rate-history-detail-drawer.tsx");
  const empty = readRel("../../components/rates/rate-history/rate-history-empty-state.tsx");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const ia = readRel("../rate-revenue-workspace.ts");
  const functions = readRel("./rate-change.functions.ts");
  const server = readRel("./rate-change.server.ts");
  const calendarEdit = readRel("../../components/rates/rate-detail/rate-edit-form.tsx");
  const bulkView = readRel("../../components/rates/bulk-rate-change/bulk-rate-change-view.tsx");
  const confirm = readRel("../../components/rates/impact-review/bulk-confirm-apply.tsx");
  const activity = readRel("../../components/rates/revenue-control/recent-rate-activity.tsx");
  const calendarView = readRel("../../components/rates/rate-calendar/rate-calendar-view.tsx");

  it("lists history from hotel_rate_change_events with created_at filters", () => {
    assert.match(view, /listRateChangeHistory/);
    assert.match(view, /from: context\.fromDate/);
    assert.match(view, /to: context\.toDate/);
    assert.doesNotMatch(view, /stayDate: context/);
    assert.match(filters, /Changed Between/);
    assert.match(filters, /when the\s+change was recorded/);
    assert.match(view, /roomTypeId: context\.roomTypeId/);
    assert.match(view, /ratePlanId: context\.ratePlanId/);
    assert.match(view, /actionType: actionType/);
    assert.doesNotMatch(filters, /Published|Pending|Approved/);
    assert.match(functions, /export const listRateChangeHistory/);
    assert.match(server, /gte\("created_at"/);
    assert.match(server, /lte\("created_at"/);
  });

  it("paginates on the server and shows Showing X–Y of Z", () => {
    assert.match(view, /page,/);
    assert.match(view, /pageSize,/);
    assert.match(view, /RATE_HISTORY_DEFAULT_PAGE_SIZE/);
    assert.match(view, /RATE_HISTORY_PAGE_SIZES/);
    assert.match(view, /Showing \{range\.start\}–\{range\.end\} of \{range\.total\}/);
    assert.match(view, /Previous/);
    assert.match(view, /Next/);
    assert.doesNotMatch(view, /limit: 10000|pageSize: 1000/);
  });

  it("opens a consistent operation drawer for single and bulk rows", () => {
    assert.match(table, /View Details/);
    assert.match(table, /View Operation/);
    assert.match(table, /MoreHorizontal/);
    assert.match(view, /getRateChangeOperationDetail/);
    assert.match(view, /\["rate-change-operation"/);
    assert.match(drawer, /Rate Change Details/);
    assert.match(drawer, /affected rate\/date cells/);
    assert.match(drawer, /Copied effective rate from/);
    assert.match(drawer, /Previous Effective Rate/);
    assert.match(drawer, /New Effective Rate \/ Base Rate/);
    assert.match(drawer, /RATE_HISTORY_REASON_EMPTY|rateHistoryReasonLabel/);
    assert.match(drawer, /rateHistoryActorLabel/);
    assert.match(empty, /RATE_HISTORY_EMPTY_COPY/);
    assert.match(empty, /RATE_HISTORY_EMPTY_SECONDARY/);
    assert.equal(RATE_HISTORY_EMPTY_COPY.includes("rate-change history was enabled"), true);
    assert.equal(RATE_HISTORY_EMPTY_SECONDARY.includes("Earlier calendar changes are not available"), true);
  });

  it("does not present export, approval, forecast or invented statuses", () => {
    const files = [view, filters, table, drawer, empty];
    for (const source of files) {
      assert.doesNotMatch(source, /Published/);
      assert.doesNotMatch(source, /Pending/);
      assert.doesNotMatch(source, /Approved/);
      assert.doesNotMatch(source, /Submit for Approval/);
      assert.doesNotMatch(source, /Export CSV/);
      assert.doesNotMatch(source, /forecast/i);
      assert.doesNotMatch(source, /competitor rate/i);
    }
  });

  it("enriches actor names without a migration or new RPC", () => {
    assert.match(server, /export async function attachHistoryActorNames/);
    assert.match(server, /from\("restaurant_users"\)/);
    assert.match(server, /from\("profiles"\)/);
    assert.match(functions, /supabaseAdmin/);
    assert.match(functions, /loadRateChangeHistory\(supabaseAdmin/);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0101_pms_rate_change_events.sql"));
    assert.ok(!migrations.some((name) => /p2-05|rate.history.ui/i.test(name)));
  });

  it("locks the Phase 2 apply → history → bulk → Control Center path", () => {
    assert.match(calendarView, /RateCalendarGrid/);
    assert.match(calendarEdit, /previewRateChanges/);
    assert.match(calendarEdit, /applyRateChanges/);
    assert.match(calendarEdit, /invalidateQueries\(\{ queryKey: \["rate-change-history"\] \}\)/);
    assert.match(bulkView, /expandBulkTargets/);
    assert.match(bulkView, /previewRateChanges/);
    assert.match(bulkView, /applyFn\(\{ data: requestPayload\(\) \}\)/);
    assert.match(confirm, /Confirm & Apply/);
    assert.match(bulkView, /invalidateQueries\(\{ queryKey: \["rate-change-history"\] \}\)/);
    assert.match(server, /operation_id/);
    assert.match(view, /listRateChangeHistory/);
    assert.match(drawer, /operationId/);
    assert.match(activity, /hotel_rate_change_events/);
    assert.match(workspace, /<RateHistoryView/);
    assert.match(workspace, /<RevenueControlView /);
    assert.match(ia, /id: "rate-history"/);
    assert.match(ia, /implemented: true/);
  });
});
