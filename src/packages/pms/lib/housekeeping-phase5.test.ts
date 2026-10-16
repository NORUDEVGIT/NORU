import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_SERVICE_TYPES } from "./service-types-card4.server.ts";
import {
  HK_CARD4_SERVICE_TYPE_CODES,
  guestServiceSpawnsCleaningTask,
  isHousekeepingRoutedGuestService,
} from "./housekeeping-ops.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("HK Phase 5 — Guest Services routing", () => {
  it("uses Card 4 HK type codes and department assignment when present", () => {
    assert.deepEqual([...HK_CARD4_SERVICE_TYPE_CODES].sort(), ["HK_CLEAN", "HK_LAUNDRY", "HK_TOWELS", "HK_TURNDOWN"]);
    assert.equal(
      DEFAULT_SERVICE_TYPES.some((row) => row.code === "HK_CLEAN" && row.categoryCode === "HK"),
      true,
    );
    assert.equal(
      isHousekeepingRoutedGuestService({
        typeCode: "HK_TOWELS",
        categoryCode: "HK",
        assignedDepartmentCodes: [],
      }),
      true,
    );
    assert.equal(
      isHousekeepingRoutedGuestService({
        typeCode: "DIN_ROOM_SVC",
        categoryCode: "DIN",
        assignedDepartmentCodes: [],
      }),
      false,
    );
    assert.equal(
      isHousekeepingRoutedGuestService({
        typeCode: "CUSTOM",
        categoryCode: "DIN",
        assignedDepartmentCodes: ["HOUSEKEEPING"],
      }),
      true,
    );
    assert.equal(
      isHousekeepingRoutedGuestService({
        typeCode: "HK_TOWELS",
        categoryCode: "HK",
        assignedDepartmentCodes: ["FO"],
      }),
      false,
    );
    assert.equal(guestServiceSpawnsCleaningTask("HK_CLEAN"), true);
    assert.equal(guestServiceSpawnsCleaningTask("HK_TOWELS"), false);
    assert.equal(guestServiceSpawnsCleaningTask("HK_TURNDOWN"), false);
  });
});

describe("HK Phase 5 — one request engine", () => {
  it("executes through the Guest Services writer and does not clone a request table", () => {
    const ops = readRel("./housekeeping.functions.ts");
    const list = ops.slice(
      ops.indexOf("export const listHousekeepingGuestRequests"),
      ops.indexOf("export const updateHousekeepingGuestRequest"),
    );
    const update = ops.slice(ops.indexOf("export const updateHousekeepingGuestRequest"));
    assert.match(list, /from\("guest_service_history"\)/);
    assert.match(list, /from\("pms_guest_service_types"\)/);
    assert.match(list, /isHousekeepingRoutedGuestService/);
    assert.match(update, /applyGuestServiceRequestUpdate/);
    assert.match(update, /guestServiceSpawnsCleaningTask/);
    assert.match(update, /housekeeping_create_task/);
    assert.doesNotMatch(ops, /from\("housekeeping_requests"\)/);
    assert.doesNotMatch(ops, /from\("hk_requests"\)/);
    assert.doesNotMatch(ops, /from\("fo_guest_requests"\)/);
    assert.doesNotMatch(update, /createGuestServiceRequest/);

    const guests = readRel("./guests.functions.ts");
    const gsUpdate = guests.slice(
      guests.indexOf("export const updateGuestServiceRequest"),
      guests.indexOf("export const createGuestPhotoUpload"),
    );
    assert.match(gsUpdate, /applyGuestServiceRequestUpdate/);
    assert.match(readRel("./guests.server.ts"), /from\("guest_service_history"\)/);
  });

  it("turns Requests into an execution queue without a local GS composer", () => {
    const tab = readRel("../components/housekeeping/housekeeping-requests-tab.tsx");
    assert.match(tab, /hk-requests-workspace/);
    assert.match(tab, /listHousekeepingGuestRequests/);
    assert.match(tab, /updateHousekeepingGuestRequest/);
    assert.match(tab, /Open Guest Services/);
    assert.match(tab, /No housekeeping-routed guest requests/);
    assert.doesNotMatch(tab, /createGuestServiceRequest/);
    assert.doesNotMatch(tab, /hk-requests-placeholder/);
    assert.doesNotMatch(tab, /from\("housekeeping_requests"\)/);

    const workspace = readRel("../components/workspaces/housekeeping-workspace.tsx");
    assert.match(workspace, /HousekeepingRequestsTab \{\.\.\.props\}/);

    const board = readRel("../components/housekeeping/housekeeping-board.tsx");
    assert.match(board, /listHousekeepingGuestRequests/);
    assert.doesNotMatch(board, /execution queue not live yet/);
  });
});
