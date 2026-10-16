import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  HK_AREA_ITEMS,
  HK_CANONICAL_PATH,
  HK_DESK_TITLE,
  HK_LANDING_TAB,
  HK_LEGACY_PATH,
  HK_MAINTENANCE_PATH,
  boardColumnForRoom,
  firstVisibleHkArea,
  mapLegacyHousekeepingTab,
  resolveHkArea,
  visibleHkAreas,
} from "./housekeeping-shell.ts";
import type { RackRoom } from "./housekeeping.functions.ts";
import { EMPTY_HK_DEMAND } from "./housekeeping-ops.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function room(partial: Partial<RackRoom>): RackRoom {
  return {
    id: "r1",
    roomNumber: "101",
    roomTypeId: "t1",
    roomTypeName: "King",
    floor: "1",
    occupancy: "vacant",
    guestName: null,
    housekeepingStatus: "dirty",
    maintenanceStatus: null,
    restriction: "available",
    restrictionReason: null,
    restrictionExpectedReturn: null,
    assignedAttendant: null,
    assignedMembershipId: null,
    openTaskId: null,
    openTaskStatus: null,
    openTaskType: null,
    openTaskPriority: null,
    openTaskNotes: null,
    openTaskCreatedAt: null,
    openTaskStartedAt: null,
    ready: false,
    checkInReady: false,
    readyReason: null,
    stayId: null,
    guestId: null,
    demand: EMPTY_HK_DEMAND,
    awaitingInspection: false,
    ...partial,
  };
}

describe("HK Phase 1 — entry IA", () => {
  it("lands on Board and uses the screenshot tab set", () => {
    assert.equal(HK_LANDING_TAB, "board");
    assert.equal(HK_DESK_TITLE, "Housekeeping Desk");
    assert.deepEqual(
      HK_AREA_ITEMS.map((item) => item.id),
      ["board", "cleaning", "inspections", "requests", "maintenance", "exceptions", "history"],
    );
    assert.equal(
      HK_AREA_ITEMS.some((item) => /linen|lost|turndown|restriction/i.test(item.label)),
      false,
    );
  });

  it("maps legacy tabs and keeps restrictions addressable", () => {
    assert.equal(mapLegacyHousekeepingTab(undefined), "board");
    assert.equal(mapLegacyHousekeepingTab("dashboard"), "board");
    assert.equal(mapLegacyHousekeepingTab("rack"), "board");
    assert.equal(mapLegacyHousekeepingTab("board"), "cleaning");
    assert.equal(mapLegacyHousekeepingTab("discrepancies"), "exceptions");
    assert.equal(mapLegacyHousekeepingTab("restrictions"), "restrictions");
    assert.equal(resolveHkArea("dashboard"), "board");
    assert.equal(resolveHkArea("board"), "board");
    assert.equal(resolveHkArea("board", { fromLegacy: true }), "cleaning");
  });

  it("gates tabs by housekeeping scope", () => {
    assert.deepEqual(visibleHkAreas("supervisor"), [
      "board",
      "cleaning",
      "inspections",
      "requests",
      "maintenance",
      "exceptions",
      "history",
    ]);
    assert.deepEqual(visibleHkAreas("housekeeper"), ["board", "cleaning", "requests"]);
    assert.deepEqual(visibleHkAreas("maintenance"), ["board", "maintenance"]);
    assert.equal(firstVisibleHkArea("housekeeper", "inspections"), "board");
    assert.equal(firstVisibleHkArea("maintenance", "cleaning"), "board");
    assert.equal(firstVisibleHkArea("supervisor", "restrictions"), "restrictions");
  });

  it("redirects the legacy route and writes tab on the canonical workspace", () => {
    const legacy = readRel("../../../routes/restaurant/housekeeping/index.tsx");
    assert.match(legacy, /\/restaurant\/pms\/housekeeping/);
    assert.match(legacy, /mapLegacyHousekeepingTab/);
    assert.match(legacy, /throw redirect/);

    const canonical = readRel("../../../routes/restaurant/pms/housekeeping.tsx");
    assert.match(canonical, /hidePackageRail/);
    assert.match(canonical, /HK_LANDING_TAB/);
    assert.match(canonical, /validateSearch/);

    const maintenance = readRel("../../../routes/restaurant/pms/maintenance.tsx");
    assert.match(maintenance, /HousekeepingWorkspace/);
    assert.match(maintenance, /defaultArea="maintenance"/);
    assert.doesNotMatch(maintenance, /Standalone Maintenance Workspace/);

    const workspace = readRel("../components/workspaces/housekeeping-workspace.tsx");
    assert.match(workspace, /hkAreaPath/);
    assert.match(workspace, /replace: true/);
    assert.match(workspace, /HousekeepingRequestsTab/);
    assert.doesNotMatch(workspace, /Linen|Lost & Found|Turndown/);

    const reports = readRel("../../../core/components/workspaces/reports-workspace.tsx");
    assert.match(reports, /\/restaurant\/pms\/housekeeping/);
    assert.match(reports, /tab: "history"/);
  });
});

describe("HK Phase 1 — board columns stay derived", () => {
  it("does not treat pickup or occupied OOO rooms as Ready", () => {
    assert.equal(boardColumnForRoom(room({ housekeepingStatus: "dirty" })), "dirty");
    assert.equal(
      boardColumnForRoom(room({ housekeepingStatus: "dirty", openTaskStatus: "assigned", openTaskId: "t" })),
      "assigned",
    );
    assert.equal(
      boardColumnForRoom(room({ housekeepingStatus: "dirty", openTaskStatus: "in_progress", openTaskId: "t" })),
      "cleaning",
    );
    assert.equal(boardColumnForRoom(room({ housekeepingStatus: "clean" })), "inspection");
    assert.equal(boardColumnForRoom(room({ housekeepingStatus: "inspected", ready: true })), "ready");
    assert.equal(boardColumnForRoom(room({ housekeepingStatus: "pickup" })), "dirty");
    assert.equal(boardColumnForRoom(room({ restriction: "out_of_order", housekeepingStatus: "clean" })), null);
    assert.equal(HK_CANONICAL_PATH, "/restaurant/pms/housekeeping");
    assert.equal(HK_MAINTENANCE_PATH, "/restaurant/pms/maintenance");
    assert.equal(HK_LEGACY_PATH, "/restaurant/housekeeping");
  });
});
