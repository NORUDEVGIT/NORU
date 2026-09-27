import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyHousekeepingCard2Settings, evaluateRoomReadinessWithPolicy } from "./housekeeping-card2.server.ts";
import { roomAwaitsInspection } from "./housekeeping-ops.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("HK Phase 3 — inspection queue is derived", () => {
  it("queues clean rooms only when inspection is required, never OOO/OOS or pickup", () => {
    assert.equal(
      roomAwaitsInspection({
        housekeepingStatus: "clean",
        restriction: "available",
        inspectionRequired: true,
      }),
      true,
    );
    assert.equal(
      roomAwaitsInspection({
        housekeepingStatus: "clean",
        restriction: "available",
        inspectionRequired: false,
      }),
      false,
    );
    assert.equal(
      roomAwaitsInspection({
        housekeepingStatus: "inspected",
        restriction: "available",
        inspectionRequired: true,
      }),
      false,
    );
    assert.equal(
      roomAwaitsInspection({
        housekeepingStatus: "pickup",
        restriction: "available",
        inspectionRequired: true,
      }),
      false,
    );
    assert.equal(
      roomAwaitsInspection({
        housekeepingStatus: "clean",
        restriction: "out_of_order",
        inspectionRequired: true,
      }),
      false,
    );
  });
});

describe("HK Phase 3 — pass/fail RPC preserved", () => {
  it("pass writes inspected (or Card 2 target) and fail writes dirty plus re_clean", () => {
    const sql = readRel("../../../../drizzle/migrations/0068_pms_card2_housekeeping.sql");
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.housekeeping_inspect_room(");
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation(");
    assert.ok(start >= 0 && end > start);
    const inspect = sql.slice(start, end);
    assert.match(inspect, /inspection_complete/);
    assert.match(inspect, /housekeeping_status = target_status/);
    assert.match(inspect, /housekeeping_status = 'dirty'/);
    assert.match(inspect, /re_clean/);
    assert.doesNotMatch(inspect, /SET status =/);
    assert.doesNotMatch(inspect, /out_of_order/);
    assert.doesNotMatch(inspect, /checklist/);

    const ts = readRel("./housekeeping.functions.ts");
    const handler = ts.slice(ts.indexOf("export const inspectRoom"), ts.indexOf("export const setRoomRestriction"));
    assert.match(handler, /housekeeping_inspect_room/);
    assert.match(handler, /supervisorApprovalRequired/);
    assert.match(handler, /Add notes describing why inspection failed/);
    assert.match(handler, /out_of_order/);
    assert.doesNotMatch(handler, /\.update\(/);
    assert.doesNotMatch(handler, /checklist/);
  });
});

describe("HK Phase 3 — ready stays derived, no checklist theatre", () => {
  it("shows outcome + reason from the Phase 0 helper, not a Ready dropdown", () => {
    const policy = emptyHousekeepingCard2Settings();
    const clean = evaluateRoomReadinessWithPolicy(
      { status: "available", housekeepingStatus: "clean", maintenanceStatus: "normal" },
      policy,
    );
    assert.equal(clean.ready, false);
    assert.match(clean.reason ?? "", /inspection/i);

    const inspected = evaluateRoomReadinessWithPolicy(
      { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "normal" },
      policy,
    );
    assert.equal(inspected.ready, true);

    const ui = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    const tab = ui.slice(ui.indexOf("export function InspectionsTab"), ui.indexOf("export function RestrictionsTab"));
    assert.match(tab, /hk-inspections/);
    assert.match(tab, /awaitingInspection/);
    assert.match(tab, /readyReason/);
    assert.match(tab, /Fail notes/);
    assert.doesNotMatch(tab, /checklist/i);
    assert.doesNotMatch(tab, /SelectItem value="ready"/);
    assert.doesNotMatch(tab, /setRoomRestriction/);
  });
});
