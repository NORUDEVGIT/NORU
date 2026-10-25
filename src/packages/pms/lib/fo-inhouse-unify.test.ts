import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS } from "./fo-check-in-workspace";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const qv = readRel("../components/frontoffice/in-house-quick-view.tsx");
const workspace = readRel("../components/workspaces/in-house-workspace.tsx");

describe("FO-09 — in-house detail workspace matches the professional pattern", () => {
  it("uses the same desktop sheet width as the confirmed reservation overlay", () => {
    assert.match(qv, /FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS/);
    assert.doesNotMatch(qv, /sm:max-w-\[640px\]/);
    assert.match(FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS, /min\(78vw,1180px\)/);
    assert.match(FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS, /sm:max-w-\[1180px\]/);
    assert.match(qv, /lg:grid-cols-2/);
  });

  it("in-house rows still open the unified sheet component via InHouseQuickViewSheet", () => {
    assert.match(workspace, /<InHouseQuickViewSheet/);
    assert.match(workspace, /reservationId=\{qvId\}/);
    assert.match(workspace, /reservationRoomId=\{qvRoomId\}/);
    assert.match(workspace, /setQvRoomId\(row\.stay\.reservationRoomId \?\? null\)/);
  });

  it("header shows Check Out as primary action and Move Room as secondary action", () => {
    assert.match(qv, /data-testid="fo-inhouse-qv-check-out"/);
    assert.match(qv, />\s*Check Out\s*</);
    assert.match(qv, /onAction\("check_out", qv\)/);
    assert.match(qv, /data-testid="fo-inhouse-qv-move-room"/);
    assert.match(qv, />\s*Move Room\s*</);
    assert.match(qv, /onAction\("room_move", qv\)/);
    assert.match(qv, /qv\.hints\.canCheckOut/);
    assert.match(qv, /qv\.hints\.canMoveRoom/);
  });

  it("does not show Assign Room, Check In, or a room assignment required banner", () => {
    assert.doesNotMatch(qv, /Assign Room/);
    assert.doesNotMatch(qv, /Check In\b/);
    assert.doesNotMatch(qv, /[Rr]oom assignment required/);
  });

  it("does not duplicate actions already in the header or More actions", () => {
    assert.doesNotMatch(qv, /Open Reservation/);
    // Only one Check Out / Move Room control exists (the header one).
    assert.equal(qv.match(/>\s*Check Out\s*</g)?.length ?? 0, 1);
    assert.equal(qv.match(/>\s*Move Room\s*</g)?.length ?? 0, 1);
    assert.doesNotMatch(qv, /Update special request/);
  });

  it("keeps the six compact cards used by the confirmed workflow's visual pattern", () => {
    assert.match(qv, /testId="fo-inhouse-qv-stay-information"/);
    assert.match(qv, /title="Stay Information"/);
    assert.match(qv, /testId="fo-inhouse-qv-guest"/);
    assert.match(qv, /title="Guest Information"/);
    assert.match(qv, /testId="fo-inhouse-qv-room-information"/);
    assert.match(qv, /title="Room Information"/);
    assert.match(qv, /testId="fo-inhouse-qv-financial"/);
    assert.match(qv, /title="Financial Overview"/);
    assert.match(qv, /testId="fo-inhouse-qv-special-requests"/);
    assert.match(qv, /title="Special Requests \/ Guest Services"/);
    assert.match(qv, /testId="fo-inhouse-qv-notes"/);
    assert.match(qv, /title="Internal Notes"/);
  });

  it("Room Information uses only the authoritative in-house read (room, building, floor, status, housekeeping)", () => {
    assert.match(qv, /qv\.room\.roomNumber/);
    assert.match(qv, /qv\.room\.building/);
    assert.match(qv, /qv\.room\.floor/);
    assert.match(qv, /qv\.room\.status/);
    assert.match(qv, /qv\.room\.housekeepingStatus/);
    const fns = readRel("./fo-inhouse.functions.ts");
    assert.match(fns, /building: \(roomRow\.building as string \| null\) \?\? null/);
    assert.match(fns, /building: string \| null;/);
  });

  it("Financial Overview reads the existing folio/cashiering signal, not a new writer", () => {
    assert.match(qv, /qv\.financial\.folioNumber/);
    assert.match(qv, /qv\.financial\.balance/);
    assert.doesNotMatch(qv, /folio_transactions/);
  });

  it("More actions keeps the existing in-house workflows gated by canonical hints", () => {
    assert.match(qv, /inHouseMenuItems\(qv\.hints\)/);
    assert.match(qv, /Extend Stay/);
    assert.match(qv, /Early Departure/);
    assert.match(qv, /Occupancy/);
    assert.match(qv, /Update Guest/);
    assert.match(qv, /Special Request/);
    assert.match(qv, /Maintenance/);
    assert.match(qv, /maintenanceRelevant/);
    // "Open Folio" / "Add Service" / "Guest Request" labels come straight from the
    // canonical inHouseMenuItems() output rather than being re-typed here.
    const helpers = readRel("./fo-inhouse.ts");
    assert.match(helpers, /label: "Open Folio"/);
    assert.match(helpers, /label: "Add Service"/);
    assert.match(helpers, /label: "Guest Request"/);
    assert.match(qv, /flatItems/);
  });

  it("Check Out and Move Room are unit-scoped through the existing FO-09 handlers", () => {
    assert.match(
      workspace,
      /initialReservationRoomId=\{moveStay\.reservationRoomId \?\? undefined\}/,
    );
    assert.match(
      workspace,
      /initialReservationRoomId=\{checkOutStay\.reservationRoomId \?\? undefined\}/,
    );
    assert.match(workspace, /if \(action === "room_move"\) setMoveStay\(qv\.stay\);/);
    assert.match(workspace, /if \(action === "check_out"\) setCheckOutStay\(qv\.stay\);/);
  });

  it("Extend Stay / Early Departure still route through StayDatesDialog and the multi-room guard", () => {
    assert.match(workspace, /if \(action === "amend_stay"\) setDatesStay\(qv\.stay\);/);
    assert.match(workspace, /<StayDatesDialog/);
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const stayDates = dialogs.slice(dialogs.indexOf("export function StayDatesDialog"));
    assert.match(stayDates, /stayDateTargetsOneRoom/);
  });

  it("does not add new writers or a second request engine for in-house actions", () => {
    assert.doesNotMatch(qv, /\.update\(\{[^}]*housekeeping_status/);
    assert.doesNotMatch(qv, /\.update\(\{[^}]*room_id/);
    assert.doesNotMatch(qv, /CREATE TABLE/i);
  });
});
