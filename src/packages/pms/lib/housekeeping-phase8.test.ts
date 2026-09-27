import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HK_BOARD_FIELD_STACK_CLASS,
  HK_BOARD_LANES_DESKTOP_CLASS,
  HK_CANONICAL_PATH,
  HK_DESKTOP_ONLY_CLASS,
  HK_FIELD_ACTION_CLASS,
  HK_FIELD_STACK_CLASS,
  HK_MAINTENANCE_PATH,
} from "./housekeeping-shell.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("HK Phase 8 — same routes, stacked field worklists", () => {
  it("keeps phone layout stacked with large tap targets and no table-only min-width", () => {
    assert.match(HK_FIELD_STACK_CLASS, /md:hidden/);
    assert.match(HK_DESKTOP_ONLY_CLASS, /hidden md:block/);
    assert.match(HK_FIELD_ACTION_CLASS, /h-11/);
    assert.match(HK_BOARD_FIELD_STACK_CLASS, /lg:hidden/);
    assert.match(HK_BOARD_LANES_DESKTOP_CLASS, /hidden lg:block/);

    const tabs = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    assert.match(tabs, /hk-cleaning-field-worklist/);
    assert.match(tabs, /completeHousekeepingTask/);
    assert.match(tabs, /housekeeping_inspect_room|inspectRoom/);
    assert.match(tabs, /hk-maintenance-field-worklist/);
    assert.match(tabs, /Start work/);
    assert.match(tabs, /HK_FIELD_ACTION_CLASS/);
    assert.match(tabs, /hk-inspections-history-field/);
    assert.doesNotMatch(tabs, /createFileRoute/);

    const board = readRel("../components/housekeeping/housekeeping-board.tsx");
    assert.match(board, /hk-board-field-worklist/);
    assert.match(board, /HK_BOARD_LANES_DESKTOP_CLASS/);
    assert.match(board, /completeHousekeepingTask/);
    assert.doesNotMatch(board, /\/restaurant\/pms\/housekeeping\/mobile/);

    const requests = readRel("../components/housekeeping/housekeeping-requests-tab.tsx");
    assert.match(requests, /hk-requests-field-worklist/);
    assert.match(requests, /updateHousekeepingGuestRequest/);

    const chrome = readRel("../components/housekeeping/housekeeping-chrome.tsx");
    assert.match(chrome, /h-11 min-h-11/);

    const workspace = readRel("../components/workspaces/housekeeping-workspace.tsx");
    assert.match(workspace, /HK_CANONICAL_PATH|hkAreaPath/);
    assert.doesNotMatch(workspace, /native app|hk-mobile-route/);

    assert.equal(HK_CANONICAL_PATH, "/restaurant/pms/housekeeping");
    assert.equal(HK_MAINTENANCE_PATH, "/restaurant/pms/maintenance");
  });

  it("does not introduce a second app or new writers", () => {
    const fns = readRel("./housekeeping.functions.ts");
    assert.match(fns, /export const completeHousekeepingTask/);
    assert.match(fns, /export const inspectRoom/);
    assert.match(fns, /export const updateMaintenanceRequest/);
    assert.match(fns, /export const updateHousekeepingGuestRequest/);
    assert.doesNotMatch(fns, /from\("housekeeping_requests"\)/);
    assert.doesNotMatch(fns, /from\("work_orders"\)/);
  });
});
