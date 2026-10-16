import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIVE_HORIZONS,
  calendarHorizonLabel,
  stayQuickViewAmendItems,
  stayQuickViewCanAmend,
  stayQuickViewMenuItems,
} from "./front-office-shell.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO UI polish — range dropdown", () => {
  it("keeps 1/3/7/14/30 as a single View range select", () => {
    assert.deepEqual(LIVE_HORIZONS, [1, 3, 7, 14, 30]);
    assert.equal(calendarHorizonLabel(1), "1 day");
    assert.equal(calendarHorizonLabel(30), "30 days");
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /data-testid="fo-horizon-select"/);
    assert.match(calendar, /placeholder="View range"/);
    for (const days of LIVE_HORIZONS) {
      assert.match(
        calendar,
        new RegExp(`calendarHorizonLabel\\(${days}\\)|value=\\{String\\(n\\)\\}`),
      );
    }
    assert.doesNotMatch(calendar, /LIVE_HORIZONS\.map\(\(n\) => \(\s*<Button/);
  });
});

describe("FO UI polish — Walk-in CTA and grouping", () => {
  it("Walk-in CTA opens the existing walk-in flow", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(calendar, /data-testid="fo-walk-in-cta"/);
    assert.match(calendar, /Walk-in/);
    assert.match(workspace, /onWalkIn=\{\(\) => setWalkIn\(true\)\}/);
    assert.match(workspace, /WalkInDialog/);
    assert.doesNotMatch(
      workspace,
      /onWalkIn=\{\(\) => navigate\(\{ to: "\/restaurant\/bookings\/new"/,
    );
  });

  it("grouping control lives in the rack toolbar, not the Room header", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const toolbarStart = calendar.indexOf('data-testid="fo-rack-toolbar"');
    const toolbarEnd = calendar.indexOf("{hkDenied ?", toolbarStart);
    const toolbar = calendar.slice(
      toolbarStart,
      toolbarEnd > toolbarStart ? toolbarEnd : undefined,
    );
    assert.match(toolbar, /Grouping/);
    assert.match(
      toolbar,
      /<RackGroupSelect groupBy=\{groupBy\} onGroupBy=\{setGroupBy\} toolbar \/>/,
    );
    assert.match(calendar, /data-testid="fo-rack-group-by"/);
    assert.match(calendar, /function RackGroupSelect/);
    assert.match(calendar, />Room</);
    assert.match(calendar, /Room Type/);
    const roomHeader = calendar.slice(
      calendar.indexOf("RackFrozenHeaderCell columnIndex={0}"),
      calendar.indexOf("RackFrozenHeaderCell columnIndex={1}"),
    );
    assert.doesNotMatch(roomHeader, /RackGroupSelect/);
    assert.match(calendar, /rackFrozenGridTemplate/);
    assert.match(calendar, /data-rack-frozen-columns/);
    assert.match(calendar, /data-testid="fo-room-status"/);
    assert.match(calendar, /RACK_DATE_TRACK_GRID_COLUMN/);
    assert.match(calendar, /whitespace-nowrap/);
    assert.doesNotMatch(calendar, /guestName \?\? "—"/);
  });
});

describe("FO UI polish — KPIs remain clickable", () => {
  it("ops strip still filters the rack on click", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /data-testid="fo-ops-strip"/);
    assert.match(calendar, /onClick=\{\(\) => onFilter\(item\.filter\)\}/);
    assert.match(calendar, /aria-pressed=\{active\}/);
    assert.match(calendar, /isOpsStripFilterActive\(filters, item\.filter\)/);
  });
});

describe("FO UI polish — Stay Quick View actions", () => {
  it("replaces generic View with Open Reservation and a three-dot menu", () => {
    const sheet = readRel("../components/frontoffice/reservation-side-sheet.tsx");
    assert.match(sheet, /Open Reservation/);
    assert.match(sheet, /data-testid="fo-stay-qv-open-reservation"/);
    assert.match(sheet, /data-testid="fo-stay-qv-actions"/);
    assert.match(sheet, /MoreHorizontal/);
    assert.doesNotMatch(sheet, />View</);
    assert.doesNotMatch(sheet, /variant=\{action\.id === "view"/);
    assert.match(sheet, /fo-stay-qv-amend/);
    assert.match(sheet, />Amend Stay</);
  });

  it("is status-aware and consolidates amendments", () => {
    const confirmed = stayQuickViewMenuItems({ status: "confirmed", assigned: true }).map(
      (item) => item.id,
    );
    assert.equal(confirmed.includes("check_out"), false);
    assert.equal(confirmed.includes("check_in"), true);
    assert.equal(confirmed.includes("no_show"), true);
    assert.equal(confirmed.includes("extend_stay"), false);
    assert.equal(stayQuickViewCanAmend("confirmed"), true);
    assert.ok(stayQuickViewAmendItems("confirmed").some((item) => item.id === "extend_stay"));

    const inHouse = stayQuickViewMenuItems({ status: "checked_in", assigned: true }).map(
      (item) => item.id,
    );
    assert.equal(inHouse.includes("check_in"), false);
    assert.equal(inHouse.includes("no_show"), false);
    assert.equal(inHouse.includes("check_out"), true);
    assert.equal(inHouse.includes("room_move"), true);

    const departed = stayQuickViewMenuItems({ status: "checked_out", assigned: true }).map(
      (item) => item.id,
    );
    assert.deepEqual(departed, ["view_folio"]);
    assert.equal(stayQuickViewCanAmend("checked_out"), false);
    assert.equal(stayQuickViewCanAmend("cancelled"), false);
    assert.equal(stayQuickViewCanAmend("no_show"), false);

    const unassigned = stayQuickViewMenuItems({ status: "pending", assigned: false }).map(
      (item) => item.id,
    );
    assert.equal(unassigned.includes("assign"), true);
    const assigned = stayQuickViewMenuItems({ status: "pending", assigned: true }).map(
      (item) => item.id,
    );
    assert.equal(assigned.includes("assign"), false);
  });
});

describe("FO UI polish — Room QV stays distinct", () => {
  it("keeps Room Quick View and Stay Quick View as separate sheets", () => {
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /RoomQuickViewSheet/);
    assert.match(workspace, /ReservationSideSheet/);
    assert.match(workspace, /FoCheckInWorkspaceSheet/);
    assert.match(workspace, /foOpensPreArrivalCheckInWorkspace/);
    assert.match(workspace, /openStayQuickView/);
    assert.match(workspace, /openRoomQuickView/);
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.match(qv, /data-testid="fo-room-quick-view"/);
    assert.match(qv, /fo-room-qv-body/);
    assert.match(qv, /FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS/);
    const sheet = readRel("../components/frontoffice/reservation-side-sheet.tsx");
    assert.match(sheet, /data-testid="fo-reservation-sheet"/);
  });
});
