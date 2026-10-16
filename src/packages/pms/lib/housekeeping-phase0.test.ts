import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORBIDDEN_HOUSEKEEPING_ROOM_STATUSES,
  HOUSEKEEPING_OPERATIONAL_STATUSES,
  emptyHousekeepingCard2Settings,
  evaluateRoomReadinessWithPolicy,
} from "./housekeeping-card2.server.ts";
import { isRoomReady } from "./fo-check-in.ts";
import { foRoomReadiness } from "./front-office-room-operations.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const ROOM_HK_CHECK = /housekeeping_status = ANY \(ARRAY\['dirty','clean','inspected','pickup'\]\)/;

describe("HK workspace Phase 0 — room status vocabulary freeze", () => {
  it("locks operational hotel_rooms.housekeeping_status to dirty|clean|inspected|pickup", () => {
    assert.deepEqual([...HOUSEKEEPING_OPERATIONAL_STATUSES], ["dirty", "clean", "inspected", "pickup"]);
    const server = readRel("./housekeeping.server.ts");
    assert.match(server, /export const HK_STATUSES = \["dirty", "clean", "inspected", "pickup"\]/);
    for (const code of FORBIDDEN_HOUSEKEEPING_ROOM_STATUSES) {
      assert.equal((HOUSEKEEPING_OPERATIONAL_STATUSES as readonly string[]).includes(code), false);
    }

    const origin = readRel("../../../../drizzle/migrations/0015_housekeeping_operations.sql");
    const originIdx = origin.indexOf("hotel_rooms_hk_status_check");
    assert.ok(originIdx >= 0);
    const originSlice = origin.slice(originIdx, originIdx + 280);
    assert.match(originSlice, ROOM_HK_CHECK);
    for (const code of FORBIDDEN_HOUSEKEEPING_ROOM_STATUSES) {
      assert.doesNotMatch(originSlice, new RegExp(`'${code}'`));
    }

    const greenfield = readRel("../../../../supabase/migrations/20260908_noru_greenfield_schema.sql");
    const checkIdx = greenfield.indexOf("hotel_rooms_hk_status_check");
    assert.ok(checkIdx > 0);
    const checkSlice = greenfield.slice(checkIdx, checkIdx + 280);
    assert.match(checkSlice, ROOM_HK_CHECK);
    for (const code of FORBIDDEN_HOUSEKEEPING_ROOM_STATUSES) {
      assert.doesNotMatch(checkSlice, new RegExp(`'${code}'`));
    }
  });
});

describe("HK workspace Phase 0 — pickup inventory", () => {
  it("keeps pickup as a live operational code with named writers and readers", () => {
    const server = readRel("./housekeeping.server.ts");
    assert.match(server, /pickup: live operational HK code/);
    assert.match(server, /saveRoom \/ batch create/);
    assert.match(server, /housekeeping_complete_task/);
    assert.match(server, /housekeeping_inspect_room/);
    assert.match(server, /check_in_hotel_reservation/);
    assert.match(server, /check_out_hotel_reservation/);
    assert.match(server, /LIVE_HK_STATUSES/);

    const rooms = readRel("./rooms.functions.ts");
    assert.match(rooms, /housekeeping_status: effectiveHousekeepingStatus/);
    assert.match(rooms, /housekeeping_status: defaultHousekeepingStatus/);

    const set4 = readRel("./pms-set4-hk-inventory.ts");
    assert.match(set4, /"pickup"/);

    const shell = readRel("./front-office-shell.ts");
    assert.match(shell, /LIVE_HK_STATUSES = \["clean", "dirty", "inspected", "pickup"\]/);
  });
});

describe("HK workspace Phase 0 — canonical readiness", () => {
  it("uses one policy matrix for OOO, dirty, clean, inspected, pickup, and maintenance", () => {
    const inspectedPolicy = emptyHousekeepingCard2Settings();
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "normal" },
        inspectedPolicy,
      ).ready,
      true,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "available", housekeepingStatus: "clean", maintenanceStatus: "normal" },
        inspectedPolicy,
      ).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "available", housekeepingStatus: "pickup", maintenanceStatus: "normal" },
        inspectedPolicy,
      ).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "available", housekeepingStatus: "dirty", maintenanceStatus: "normal" },
        inspectedPolicy,
      ).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "out_of_order", housekeepingStatus: "inspected", maintenanceStatus: "normal" },
        inspectedPolicy,
      ).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        {
          status: "available",
          housekeepingStatus: "inspected",
          maintenanceStatus: "maintenance_required",
        },
        inspectedPolicy,
      ).ready,
      false,
    );

    const wrappers = [
      isRoomReady(
        { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "normal" },
        inspectedPolicy,
      ),
      foRoomReadiness({
        physicalStatus: "available",
        housekeepingStatus: "inspected",
        maintenanceStatus: "normal",
        housekeepingPolicy: inspectedPolicy,
      }),
    ];
    for (const result of wrappers) assert.equal(result.ready, true);
  });

  it("points Board helpers, FO QV, arrivals, rack, check-in, and exceptions at the policy", () => {
    const files: Array<[string, RegExp]> = [
      ["./housekeeping.functions.ts", /evaluateRoomReadinessWithPolicy|isRoomReady\(/],
      ["./housekeeping.server.ts", /evaluateRoomReadinessWithPolicy/],
      ["./front-office-room-operations.ts", /evaluateRoomReadinessWithPolicy/],
      ["./front-office-room-operations.server.ts", /foRoomReadiness\(/],
      ["./reservation-workspace/arrivals-departures.ts", /isRoomReady\(/],
      ["./reservation-workspace/arrivals-departures.server.ts", /housekeepingPolicy: hkSnapshot\.settings/],
      ["./reservation-workspace/quick-view.server.ts", /isRoomReady\(/],
      ["./reservation-workspace/exceptions.server.ts", /isRoomReady\(/],
      ["./fo-check-in.ts", /evaluateRoomReadinessWithPolicy/],
      ["./fo-check-in.functions.ts", /isRoomReady\(/],
      ["./fo-rack-power.ts", /targetReady/],
      ["../components/frontoffice/room-rack-calendar.tsx", /targetReady: hk\?\.ready/],
    ];
    for (const [rel, pattern] of files) {
      assert.match(readRel(rel), pattern, rel);
    }

    const qv = readRel("./reservation-workspace/quick-view.server.ts");
    assert.doesNotMatch(qv, /dirty \| pickup|dirty\|pickup/);
    const exceptions = readRel("./reservation-workspace/exceptions.server.ts");
    assert.doesNotMatch(exceptions, /dirty \| pickup|dirty\|pickup/);
  });
});

describe("HK workspace Phase 0 — writers stay in their lanes", () => {
  it("does not let complete-task write maintenance tickets or maintenance_status", () => {
    const sql = readRel("../../../../drizzle/migrations/0068_pms_card2_housekeeping.sql");
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(");
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION public.housekeeping_inspect_room(");
    assert.ok(start >= 0 && end > start);
    const completeFn = sql.slice(start, end);
    assert.doesNotMatch(completeFn, /maintenance_status/);
    assert.doesNotMatch(completeFn, /housekeeping_maintenance_requests/);

    const ts = readRel("./housekeeping.functions.ts");
    const completeStart = ts.indexOf("export const completeHousekeepingTask");
    const completeEnd = ts.indexOf("export const listInspections");
    const completeTs = ts.slice(completeStart, completeEnd);
    assert.match(completeTs, /housekeeping_complete_task/);
    assert.doesNotMatch(completeTs, /maintenance_status/);
    assert.doesNotMatch(completeTs, /housekeeping_maintenance_requests/);
  });

  it("keeps guest_check_in invalid Card 2 targets as a no-op on the room CHECK", () => {
    const rpc = readRel("../../../../drizzle/migrations/0100_fo_phase0_stay_dates_and_checkin_hk.sql");
    assert.match(rpc, /pms_housekeeping_transition_target/);
    assert.match(rpc, /target_status IN \('dirty', 'clean', 'inspected', 'pickup'\)/);
    assert.match(rpc, /room\.housekeeping_status <> target_status/);

    const foFns = readRel("./fo-check-in.functions.ts");
    assert.doesNotMatch(
      foFns,
      /from\("hotel_rooms"\)[\s\S]{0,200}update\(\{[\s\S]{0,80}housekeeping_status/,
    );
  });

  it("does not introduce a third Settings store inside HK ops", () => {
    const ops = readRel("./housekeeping.functions.ts");
    assert.match(ops, /loadCard2HousekeepingSnapshot/);
    assert.match(ops, /loadSet4Snapshot/);
    assert.doesNotMatch(ops, /housekeeping_workspace_settings|hk_runtime_config/);
  });
});
