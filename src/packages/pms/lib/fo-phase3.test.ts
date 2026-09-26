import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  differentRoomTypeNeedsAmendment,
  foInHouseActionHints,
  foInHouseExceptionKeys,
  inHouseMenuItems,
} from "./fo-inhouse.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const policy = {
  allowed: true,
  fee: null,
  needsApproval: false,
  checkOutTime: "11:00",
};

describe("FO Phase 3 — in-house read model", () => {
  it("lists checked-in stays through listFrontOfficeInHouseDesk", () => {
    const fns = readRel("./fo-inhouse.functions.ts");
    const load = readRel("./frontoffice.functions.ts");
    assert.match(fns, /export const listFrontOfficeInHouseDesk/);
    assert.match(fns, /export const getFrontOfficeInHouseQuickView/);
    assert.match(fns, /loadFrontOfficeInHouse/);
    assert.match(load, /export async function loadFrontOfficeInHouse/);
    const body = load.slice(load.indexOf("export async function loadFrontOfficeInHouse"));
    assert.match(body, /\.eq\("status", "checked_in"\)/);
    assert.doesNotMatch(fns, /fake in-house|seedInHouse/i);
  });

  it("In-House QV lives on the In-House tab as a dedicated sheet", () => {
    const workspace = readRel("../components/workspaces/in-house-workspace.tsx");
    const qv = readRel("../components/frontoffice/in-house-quick-view.tsx");
    const fo = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /InHouseQuickViewSheet/);
    assert.match(workspace, /listFrontOfficeInHouseDesk/);
    assert.match(qv, /data-testid="fo-inhouse-qv"/);
    assert.match(qv, /What does Front Desk need to know/);
    assert.match(qv, /Open Reservation/);
    assert.match(qv, /More stay actions/);
    assert.match(fo, /view === "inhouse"/);
    assert.match(fo, /InHouseWorkspace/);
  });
});

describe("FO Phase 3 — exceptions and hints", () => {
  it("marks OOO, overstay, folio and late-checkout conflicts from real signals", () => {
    const keys = foInHouseExceptionKeys({
      status: "checked_in",
      roomId: "room-1",
      operationalStatus: "out_of_order",
      maintenanceStatus: "hvac",
      overstay: true,
      folioLane: "live",
      balance: 40,
      specialRequests: "High floor",
      lateCheckoutGranted: true,
      lateCheckoutUntil: null,
      lateCheckoutPolicy: { ...policy, allowed: false },
      arrivalDate: "2026-09-24",
      departureDate: "2026-09-26",
    });
    assert.equal(keys.includes("room_unavailable"), true);
    assert.equal(keys.includes("maintenance"), true);
    assert.equal(keys.includes("overstay"), true);
    assert.equal(keys.includes("folio_warning"), true);
    assert.equal(keys.includes("late_checkout_conflict"), true);
    assert.equal(keys.includes("special_request"), true);
  });

  it("does not invent exceptions from a dirty occupied room", () => {
    const keys = foInHouseExceptionKeys({
      status: "checked_in",
      roomId: "room-1",
      operationalStatus: "occupied",
      maintenanceStatus: null,
      overstay: false,
      folioLane: "live",
      balance: 0,
      specialRequests: null,
      lateCheckoutGranted: false,
      lateCheckoutUntil: null,
      lateCheckoutPolicy: policy,
      arrivalDate: "2026-09-24",
      departureDate: "2026-09-26",
    });
    assert.deepEqual(keys, []);
  });

  it("only checked-in stays get in-house actions", () => {
    const live = foInHouseActionHints({
      status: "checked_in",
      assigned: true,
      folioId: "folio-1",
      guestId: "guest-1",
      blockingKeys: [],
    });
    assert.equal(live.canMoveRoom, true);
    assert.equal(live.canAmendStay, true);
    assert.equal(live.canSetLateCheckout, true);
    assert.equal(live.canCheckOut, true);
    const done = foInHouseActionHints({
      status: "checked_out",
      assigned: true,
      folioId: "folio-1",
      guestId: "guest-1",
      blockingKeys: [],
    });
    assert.equal(done.canMoveRoom, false);
    assert.equal(done.canAmendStay, false);
    assert.equal(done.canCheckOut, false);
    assert.equal(inHouseMenuItems(done).some((item) => item.id === "check_out"), false);
    assert.equal(inHouseMenuItems(live).some((item) => item.id === "room_move"), true);
  });
});

describe("FO Phase 3 — writers and ownership", () => {
  it("room move uses moveReservationRoom and stays same-type via listAssignableRooms", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const workspace = readRel("../components/workspaces/in-house-workspace.tsx");
    assert.match(dialogs, /moveReservationRoom/);
    assert.match(dialogs, /listAssignableRooms/);
    assert.match(dialogs, /Move guest/);
    assert.match(dialogs, /different room type is a commercial amendment/);
    assert.match(workspace, /RoomMoveDialog/);
    assert.equal(differentRoomTypeNeedsAmendment("type-a", "type-b"), true);
    assert.equal(differentRoomTypeNeedsAmendment("type-a", "type-a"), false);
  });

  it("stay amendment uses changeStayDates and does not write departure_date directly", () => {
    const workspace = readRel("../components/workspaces/in-house-workspace.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const fns = readRel("./frontoffice.functions.ts");
    assert.match(workspace, /StayDatesDialog/);
    assert.match(dialogs, /changeStayDates|FoRackConfirmSheet/);
    const change = fns.slice(fns.indexOf("export const changeStayDates"));
    assert.match(change, /change_hotel_stay_dates/);
    assert.doesNotMatch(workspace, /\.update\(\{[^}]*departure_date/);
  });

  it("late checkout reuses setLateCheckout", () => {
    const workspace = readRel("../components/workspaces/in-house-workspace.tsx");
    const dialogs = readRel("../components/workspaces/arrivals-departures-dialogs.tsx");
    assert.match(workspace, /LateCheckoutDialog/);
    assert.match(workspace, /late_checkout/);
    assert.match(dialogs, /setLateCheckout/);
    assert.doesNotMatch(readRel("./fo-inhouse.functions.ts"), /create table/i);
  });

  it("checkout entry opens the existing gated flow", () => {
    const workspace = readRel("../components/workspaces/in-house-workspace.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    assert.match(workspace, /CheckOutDialog/);
    assert.match(dialogs, /FoCheckOutStepper/);
    assert.doesNotMatch(workspace, /checkOutReservation/);
    assert.doesNotMatch(workspace, /completeFoCheckOut\(/);
  });

  it("does not add FO HK, room-state or folio writers", () => {
    const fns = readRel("./fo-inhouse.functions.ts");
    const workspace = readRel("../components/workspaces/in-house-workspace.tsx");
    const qv = readRel("../components/frontoffice/in-house-quick-view.tsx");
    for (const src of [fns, workspace, qv]) {
      assert.doesNotMatch(src, /\.update\(\{[^}]*housekeeping_status/);
      assert.doesNotMatch(src, /\.update\(\{[^}]*room_id/);
      assert.doesNotMatch(src, /folio_transactions/);
    }
    const repoRoot = join(here, "../../../..");
    const extra = [...readdirSync(join(repoRoot, "drizzle/migrations")), ...readdirSync(join(repoRoot, "supabase/migrations"))].filter(
      (name) => name.startsWith("0101_") || name.startsWith("0102_"),
    );
    assert.equal(extra.length, 0);
  });
});
