import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  foFolioPaymentStatusLabel,
  foGuestWorkspaceTabs,
  foInHouseRoomInventoryNote,
} from "./fo-guest-workspace-tabs";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const confirmedSheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
const inHouseSheet = readRel("../components/frontoffice/in-house-quick-view.tsx");
const inHouseWorkspace = readRel("../components/workspaces/in-house-workspace.tsx");
const foWorkspace = readRel("../components/workspaces/front-office-workspace.tsx");

function ids(status: Parameters<typeof foGuestWorkspaceTabs>[0]) {
  return foGuestWorkspaceTabs(status).map((tab) => tab.id);
}

function overviewSlice(source: string, testId: string, endMarker: string): string {
  const start = source.indexOf(`data-testid="${testId}"`);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, testId);
  return source.slice(start, end);
}

describe("FO guest workspace — status-aware tabs", () => {
  it("confirmed and pending stays get pre-arrival tabs only", () => {
    const expected = ["overview", "edit_details", "assign_room", "check_in", "cancel_no_show"];
    assert.deepEqual(ids("confirmed"), expected);
    assert.deepEqual(ids("pending"), expected);
    assert.deepEqual(
      foGuestWorkspaceTabs("confirmed").map((tab) => tab.label),
      ["Stay Overview", "Edit Details", "Assign / Change Room", "Check-In", "Cancel / No-Show"],
    );
  });

  it("checked-in stays get in-house tabs only", () => {
    assert.deepEqual(ids("checked_in"), [
      "overview",
      "edit_details",
      "move_room",
      "extend_stay",
      "check_out",
    ]);
    assert.deepEqual(
      foGuestWorkspaceTabs("checked_in").map((tab) => tab.label),
      [
        "Stay Overview",
        "Edit Details",
        "Move / Change Room",
        "Extend Stay",
        "Check-Out / Folio Review",
      ],
    );
  });

  it("checkout is absent before check-in and check-in is absent after", () => {
    for (const status of ["pending", "confirmed"] as const) {
      assert.ok(!ids(status).includes("check_out"));
      assert.ok(!ids(status).includes("extend_stay"));
      assert.ok(!ids(status).includes("move_room"));
    }
    assert.ok(!ids("checked_in").includes("check_in"));
    assert.ok(!ids("checked_in").includes("cancel_no_show"));
    assert.ok(!ids("checked_in").includes("assign_room"));
    assert.deepEqual(ids("checked_out"), ["overview"]);
    assert.deepEqual(ids("cancelled"), ["overview"]);
    assert.equal(ids("checked_in").includes("folio"), false);
    assert.deepEqual(foGuestWorkspaceTabs("checked_in", { canReadFolio: true }).at(-1), {
      id: "folio",
      label: "Folio & Charges",
    });
    assert.deepEqual(
      foGuestWorkspaceTabs("checked_out", { canReadFolio: true }).map((tab) => tab.id),
      ["overview", "folio"],
    );
  });

  it("both workspaces derive tabs from the stay status", () => {
    assert.match(
      confirmedSheet,
      /foGuestWorkspaceTabs\(stay\.status, \{ canReadFolio: canOpenCashiering \}\)/,
    );
    assert.match(inHouseSheet, /foGuestWorkspaceTabs\(qv\.stay\.status, \{ canReadFolio \}\)/);
    assert.match(confirmedSheet, /activeTab === "check_in"/);
    assert.doesNotMatch(confirmedSheet, /activeTab === "check_out"/);
    assert.match(inHouseSheet, /activeTab === "check_out"/);
    assert.doesNotMatch(inHouseSheet, /activeTab === "check_in"/);
  });
});

describe("FO guest workspace — read-only Stay Overview", () => {
  it("confirmed overview has no buttons, edit, folio or view-all actions", () => {
    const overview = overviewSlice(confirmedSheet, "fo-ci-workspace-overview", "</SheetContent>");
    for (const gone of ["<Button", "View all", "View All", "View Folio", ">Edit<", "onClick"]) {
      assert.equal(overview.includes(gone), false, gone);
    }
  });

  it("in-house overview has no buttons, edit, folio or view-all actions", () => {
    const overview = overviewSlice(
      inHouseSheet,
      "fo-inhouse-qv-overview",
      'activeTab === "edit_details"',
    );
    for (const gone of ["<Button", "View all", "View All", "View Folio", ">Edit<", "onClick"]) {
      assert.equal(overview.includes(gone), false, gone);
    }
    assert.match(overview, /<FoGuestServicesPanel[\s\S]*summaryOnly/);
  });

  it("guest services summary renders only when there are active services and has no links", () => {
    const panel = readRel("../components/frontoffice/fo-guest-services-panel.tsx");
    const summary = panel.slice(panel.indexOf("if (summaryOnly)"));
    assert.match(summary, /activeCount === 0/);
    assert.match(summary, /fo-gs-summary/);
    const block = summary.slice(0, summary.indexOf("return (", summary.indexOf("fo-gs-summary")));
    assert.doesNotMatch(block, /<Link|href=/);
  });
});

describe("FO guest workspace — workflows reuse existing handlers", () => {
  it("confirmed tabs call the same owner handlers", () => {
    assert.match(confirmedSheet, /onAction\("assign", stay\)/);
    assert.match(confirmedSheet, /onContinueCheckIn\(stay\)/);
    assert.match(confirmedSheet, /onAction\("no_show", stay\)/);
    assert.match(confirmedSheet, /setCancelOpen\(true\)/);
    assert.match(confirmedSheet, /<FoCancelStepper/);
  });

  it("in-house tabs call the same FO-09 handlers", () => {
    assert.match(inHouseSheet, /onAction\("room_move", qv\)/);
    assert.match(inHouseSheet, /onAction\("amend_stay", qv\)/);
    assert.match(inHouseSheet, /onAction\("check_out", qv\)/);
    assert.match(inHouseSheet, /setTab\("folio"\)/);
    assert.match(inHouseSheet, /menuIds\.has\("open_folio"\)/);
    assert.match(inHouseSheet, /qv\.hints\.canCheckOut/);
    assert.match(inHouseSheet, /qv\.hints\.canMoveRoom/);
    assert.match(inHouseWorkspace, /if \(action === "room_move"\) setMoveStay\(qv\.stay\);/);
    assert.match(inHouseWorkspace, /if \(action === "check_out"\) setCheckOutStay\(qv\.stay\);/);
    assert.match(inHouseWorkspace, /if \(action === "amend_stay"\) setDatesStay\(qv\.stay\);/);
  });

  it("reservationRoomId stays in the in-house read and parent dialogs", () => {
    assert.match(
      inHouseSheet,
      /queryKey: \["front-office", "inhouse-qv", restaurantId, reservationId, reservationRoomId\]/,
    );
    assert.match(inHouseSheet, /\.\.\.\(reservationRoomId \? \{ reservationRoomId \} : \{\}\)/);
    assert.match(
      inHouseSheet,
      /setTab\(initialTab\);\n {2}\}, \[reservationId, reservationRoomId, initialTab\]\);/,
    );
    assert.match(inHouseWorkspace, /reservationRoomId=\{qvRoomId\}/);
    assert.match(
      inHouseWorkspace,
      /initialReservationRoomId=\{moveStay\.reservationRoomId \?\? undefined\}/,
    );
    assert.match(
      inHouseWorkspace,
      /initialReservationRoomId=\{checkOutStay\.reservationRoomId \?\? undefined\}/,
    );
    assert.match(foWorkspace, /<InHouseQuickViewSheet/);
    assert.match(confirmedSheet, /stay\.reservationRoomId/);
  });

  it("does not add writers or financial calculations", () => {
    for (const source of [confirmedSheet, inHouseSheet]) {
      assert.doesNotMatch(source, /useMutation/);
      assert.doesNotMatch(source, /\.update\(\{/);
      assert.doesNotMatch(source, /folio_transactions/);
    }
    assert.doesNotMatch(inHouseSheet, /charges\s+-\s+|credits\s+\+/);
  });
});

describe("FO guest workspace — display helpers", () => {
  it("payment status follows the cashiering balance", () => {
    assert.equal(foFolioPaymentStatusLabel(120), "Balance due");
    assert.equal(foFolioPaymentStatusLabel(-5), "Credit balance");
    assert.equal(foFolioPaymentStatusLabel(0), "Settled");
    assert.equal(foFolioPaymentStatusLabel(null), "—");
  });

  it("never shows an in-house room as available", () => {
    assert.equal(foInHouseRoomInventoryNote("available"), null);
    assert.equal(foInHouseRoomInventoryNote("occupied"), null);
    assert.equal(foInHouseRoomInventoryNote(null), null);
    assert.equal(foInHouseRoomInventoryNote("out_of_order"), "out of order");
  });
});
