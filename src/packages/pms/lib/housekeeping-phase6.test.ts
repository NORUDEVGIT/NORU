import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EMPTY_HK_DEMAND, deriveHousekeepingExceptions, hkExceptionKey } from "./housekeeping-ops.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("HK Phase 6 — derived exception keys stay stable", () => {
  it("emits room-keyed derived signals and persisted discrepancies only", () => {
    const now = Date.parse("2026-09-27T18:00:00Z");
    const items = deriveHousekeepingExceptions({
      nowMs: now,
      rooms: [
        {
          id: "r-arr",
          roomNumber: "101A",
          occupancy: "vacant",
          housekeepingStatus: "dirty",
          maintenanceStatus: "normal",
          restriction: "available",
          checkInReady: false,
          readyReason: "Room is dirty.",
          demand: { ...EMPTY_HK_DEMAND, arrival: true },
          openTaskId: null,
          openTaskStatus: null,
          stayId: "stay-1",
        },
        {
          id: "r-ooo",
          roomNumber: "102",
          occupancy: "occupied",
          housekeepingStatus: "clean",
          maintenanceStatus: "normal",
          restriction: "out_of_order",
          checkInReady: false,
          readyReason: null,
          demand: EMPTY_HK_DEMAND,
          openTaskId: null,
          openTaskStatus: null,
          stayId: "stay-2",
        },
        {
          id: "r-mnt",
          roomNumber: "103",
          occupancy: "vacant",
          housekeepingStatus: "inspected",
          maintenanceStatus: "maintenance_required",
          restriction: "available",
          checkInReady: false,
          readyReason: "Maintenance must clear.",
          demand: EMPTY_HK_DEMAND,
          openTaskId: null,
          openTaskStatus: null,
          stayId: null,
        },
        {
          id: "r-vac",
          roomNumber: "104",
          occupancy: "vacant",
          housekeepingStatus: "dirty",
          maintenanceStatus: "normal",
          restriction: "available",
          checkInReady: false,
          readyReason: null,
          demand: EMPTY_HK_DEMAND,
          openTaskId: null,
          openTaskStatus: null,
          stayId: null,
        },
        {
          id: "r-stale",
          roomNumber: "105",
          occupancy: "vacant",
          housekeepingStatus: "dirty",
          maintenanceStatus: "normal",
          restriction: "available",
          checkInReady: false,
          readyReason: null,
          demand: EMPTY_HK_DEMAND,
          openTaskId: "task-1",
          openTaskStatus: "in_progress",
          openTaskStartedAt: "2026-09-27T06:00:00Z",
          stayId: null,
        },
        {
          id: "r-fail",
          roomNumber: "106",
          occupancy: "vacant",
          housekeepingStatus: "dirty",
          maintenanceStatus: "normal",
          restriction: "available",
          checkInReady: false,
          readyReason: null,
          demand: EMPTY_HK_DEMAND,
          openTaskId: "task-2",
          openTaskStatus: "pending",
          stayId: null,
        },
      ],
      inspections: [
        { id: "i1", roomId: "r-fail", status: "failed", completedAt: "2026-09-27T12:00:00Z", notes: "Missed corners" },
      ],
      discrepancies: [
        { id: "d1", roomId: "r-arr", roomNumber: "101A", status: "open", reason: "Sleepers" },
        { id: "d2", roomId: "r-arr", roomNumber: "101A", status: "resolved", reason: "Old" },
      ],
    });

    assert.equal(hkExceptionKey("dirty_arrival", "r-arr"), "dirty_arrival:r-arr");
    assert.equal(items.some((row) => row.key === "dirty_arrival:r-arr" && row.source === "derived"), true);
    assert.equal(items.some((row) => row.key === "ooo_assigned:r-ooo" && row.action === "restrictions"), true);
    assert.equal(items.some((row) => row.key === "maintenance_blocker:r-mnt" && row.action === "maintenance"), true);
    assert.equal(items.some((row) => row.key === "dirty_vacant_no_task:r-vac"), true);
    assert.equal(items.some((row) => row.key === "stale_task:task-1" && row.action === "cleaning"), true);
    assert.equal(items.some((row) => row.key === "inspect_failed:r-fail" && row.detail === "Missed corners"), true);
    assert.equal(items.some((row) => row.key === "discrepancy:d1" && row.action === "resolve_discrepancy"), true);
    assert.equal(items.some((row) => row.key === "discrepancy:d2"), false);
    assert.equal(items.every((row) => !row.kind.includes("dnd") && !row.kind.includes("refused")), true);

    const again = deriveHousekeepingExceptions({
      nowMs: now,
      rooms: items.slice(0, 1).length
        ? [
            {
              id: "r-arr",
              roomNumber: "101A",
              occupancy: "vacant",
              housekeepingStatus: "dirty",
              maintenanceStatus: "normal",
              restriction: "available",
              checkInReady: false,
              readyReason: "Room is dirty.",
              demand: { ...EMPTY_HK_DEMAND, arrival: true },
              openTaskId: null,
              openTaskStatus: null,
              stayId: "stay-1",
            },
          ]
        : [],
      inspections: [],
      discrepancies: [],
    });
    assert.equal(again[0]?.key, "dirty_arrival:r-arr");
  });
});

describe("HK Phase 6 — discrepancy writer and no DND storage", () => {
  it("keeps resolveDiscrepancy and does not add DND or refused tables", () => {
    const ops = readRel("./housekeeping.functions.ts");
    assert.match(ops, /export const resolveDiscrepancy/);
    assert.match(ops, /export const listHousekeepingExceptions/);
    assert.match(ops, /deriveHousekeepingExceptions/);
    const resolve = ops.slice(ops.indexOf("export const resolveDiscrepancy"), ops.indexOf("export const listHousekeepingExceptions"));
    assert.match(resolve, /from\("housekeeping_discrepancies"\)/);
    assert.match(resolve, /discrepancy_resolved/);
    assert.doesNotMatch(ops, /from\("housekeeping_dnd"\)/);
    assert.doesNotMatch(ops, /from\("refused_service"\)/);
    assert.doesNotMatch(ops, /from\("fo_exceptions"\)/);
    assert.doesNotMatch(ops, /from\("reservation_exceptions"\)/);

    const ui = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    assert.match(ui, /export function ExceptionsTab/);
    assert.match(ui, /resolveDiscrepancy/);
    assert.match(ui, /hk-exceptions-workspace/);
    assert.match(ui, /Do not disturb and refused service are not stored yet/);
    assert.doesNotMatch(ui, /from\("housekeeping_dnd"\)/);
  });
});
