import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HK_EVENT_TYPES } from "./housekeeping.server.ts";
import {
  formatHousekeepingHistoryDetail,
  hkHistoryEventTypesForGroup,
} from "./housekeeping-ops.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("HK Phase 7 — one history store", () => {
  it("filters housekeeping_history and does not add a parallel audit table", () => {
    const ops = readRel("./housekeeping.functions.ts");
    const list = ops.slice(
      ops.indexOf("export const listHousekeepingHistory"),
      ops.indexOf("export const listHousekeepingGuestRequests"),
    );
    assert.match(list, /from\("housekeeping_history"\)/);
    assert.match(list, /eventGroup/);
    assert.match(list, /actorMembershipId/);
    assert.match(list, /dateFrom/);
    assert.match(list, /dateTo/);
    assert.match(list, /actor_membership_id/);
    assert.match(list, /actorMembershipId: r\.actor_membership_id/);
    assert.doesNotMatch(ops, /from\("housekeeping_audit_2"\)/);
    assert.doesNotMatch(list, /from\("pms_room_inventory_events"\)/);

    const restrict = ops.slice(
      ops.indexOf("export const setRoomRestriction"),
      ops.indexOf("export const listDiscrepancies"),
    );
    assert.match(restrict, /setOperationalRestrictionCompat/);
    assert.doesNotMatch(restrict, /recordHousekeepingEvent/);

    const inspect = ops.slice(ops.indexOf("export const inspectRoom"), ops.indexOf("export const setRoomRestriction"));
    assert.match(inspect, /housekeeping_inspect_room/);

    const complete = ops.slice(
      ops.indexOf("export const completeHousekeepingTask"),
      ops.indexOf("export const inspectRoom"),
    );
    assert.match(complete, /housekeeping_complete_task/);

    const gs = ops.slice(ops.indexOf("export const updateHousekeepingGuestRequest"));
    assert.match(gs, /recordHousekeepingEvent/);
    assert.match(gs, /guest_request_updated/);
    assert.match(gs, /actorMembershipId: me\.id/);

    assert.equal(HK_EVENT_TYPES.includes("guest_request_updated"), true);
    assert.deepEqual(hkHistoryEventTypesForGroup("inspection"), ["inspection_passed", "inspection_failed"]);
    assert.deepEqual(hkHistoryEventTypesForGroup("maintenance"), [
      "maintenance_created",
      "maintenance_updated",
      "maintenance_resolved",
    ]);
    assert.equal(hkHistoryEventTypesForGroup("linen"), null);
  });
});

describe("HK Phase 7 — History UI is searchable and links Room QV", () => {
  it("filters by room, event, actor, date and opens Board QV", () => {
    const ui = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    const history = ui.slice(ui.indexOf("export function HousekeepingHistoryTab"));
    assert.match(history, /hk-history-room/);
    assert.match(history, /Event type/);
    assert.match(history, /Actor/);
    assert.match(history, /type="date"/);
    assert.match(history, /hkRoomQuickViewPath/);
    assert.match(history, /formatHousekeepingHistoryDetail/);
    assert.doesNotMatch(history, /housekeeping_audit_2/);
    assert.doesNotMatch(history, /h\.notes \?\? h\.newValues/);

    const board = readRel("../components/housekeeping/housekeeping-board.tsx");
    assert.match(board, /openRoomId/);
    assert.match(board, /HK_CANONICAL_PATH/);

    const route = readRel("../../../routes/restaurant/pms/housekeeping.tsx");
    assert.match(route, /search\["room"\]/);
    assert.match(route, /initialRoomId/);

    const drizzle = readRel("../../../../drizzle/migrations/0101_hk_history_guest_request_event.sql");
    const supabase = readRel("../../../../supabase/migrations/0101_hk_history_guest_request_event.sql");
    assert.match(drizzle, /guest_request_updated/);
    assert.match(supabase, /guest_request_updated/);
    assert.doesNotMatch(drizzle, /CREATE TABLE public.housekeeping_audit/);
  });

  it("formats guest-request and restriction history without ids", () => {
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "guest_request_updated",
        newValues: { status: "completed", request_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      }),
      "Guest request completed",
    );
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "room_ooo",
        notes: "Flooded bathroom",
      }),
      "Out of order · Flooded bathroom",
    );
    const text = formatHousekeepingHistoryDetail({
      eventType: "guest_request_updated",
      newValues: JSON.stringify({
        status: "in_progress",
        request_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      }),
    });
    assert.equal(text, "Guest request started");
    assert.doesNotMatch(text, /request_id/);
  });
});
