import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  departureMenuItems,
  foCheckoutReadiness,
  foDepartureActionHints,
  foDepartureExceptionKeys,
  foDepartureTiming,
} from "./fo-departure.ts";

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

describe("FO Phase 4 — departures read model", () => {
  it("lists checked-in due departures through listFrontOfficeDeparturesDesk", () => {
    const fns = readRel("./fo-departure.functions.ts");
    const load = readRel("./frontoffice.functions.ts");
    assert.match(fns, /export const listFrontOfficeDeparturesDesk/);
    assert.match(fns, /export const getFrontOfficeDepartureQuickView/);
    assert.match(fns, /loadFrontOfficeDepartures/);
    assert.match(fns, /stay\.status === "checked_in"/);
    assert.match(load, /export async function loadFrontOfficeDepartures/);
    const body = load.slice(load.indexOf("export async function loadFrontOfficeDepartures"));
    assert.match(body, /\.eq\("status", "checked_in"\)/);
    const inHouse = load.slice(load.indexOf("export async function loadFrontOfficeInHouse"));
    assert.match(inHouse, /\.eq\("status", "checked_in"\)/);
    assert.doesNotMatch(inHouse.slice(0, inHouse.indexOf("export async function loadFrontOfficeDepartures")), /checked_out/);
  });

  it("Departure QV lives on the Departures tab as a dedicated sheet", () => {
    const workspace = readRel("../components/workspaces/departures-workspace.tsx");
    const qv = readRel("../components/frontoffice/departure-quick-view.tsx");
    const fo = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /DepartureQuickViewSheet/);
    assert.match(workspace, /listFrontOfficeDeparturesDesk/);
    assert.match(qv, /data-testid="fo-departure-qv"/);
    assert.match(qv, /Can this guest be checked out now/);
    assert.match(qv, /Open Reservation/);
    assert.match(qv, /More stay actions/);
    assert.match(fo, /view === "departures"/);
    assert.match(fo, /DeparturesWorkspace/);
    assert.doesNotMatch(workspace, /Check In/);
    assert.doesNotMatch(qv, /No-Show|Assign Room/);
  });
});

describe("FO Phase 4 — readiness and exceptions", () => {
  it("derives unsettled folio, missing folio and overdue without a new table", () => {
    const keys = foDepartureExceptionKeys({
      status: "checked_in",
      roomId: "room-1",
      operationalStatus: "occupied",
      maintenanceStatus: "hvac",
      overstay: true,
      folioLane: "live",
      folioId: "folio-1",
      balance: 40,
      specialRequests: "Taxi",
      lateCheckoutGranted: true,
      lateCheckoutUntil: null,
      lateCheckoutPolicy: { ...policy, allowed: false },
      arrivalDate: "2026-09-24",
      departureDate: "2026-09-26",
    });
    assert.equal(keys.includes("unsettled_folio"), true);
    assert.equal(keys.includes("overdue_departure"), true);
    assert.equal(keys.includes("maintenance"), true);
    assert.equal(keys.includes("late_checkout_conflict"), true);
    assert.equal(keys.includes("guest_request"), true);

    const missing = foDepartureExceptionKeys({
      status: "checked_in",
      roomId: "room-1",
      operationalStatus: "occupied",
      maintenanceStatus: null,
      overstay: false,
      folioLane: "live",
      folioId: null,
      balance: null,
      specialRequests: null,
      lateCheckoutGranted: false,
      lateCheckoutUntil: null,
      lateCheckoutPolicy: policy,
      arrivalDate: "2026-09-24",
      departureDate: "2026-09-26",
    });
    assert.equal(missing.includes("missing_folio"), true);
  });

  it("canCheckOut is false for checked_out and non-in-house statuses", () => {
    const live = foCheckoutReadiness({
      status: "checked_in",
      assigned: true,
      folioId: "folio-1",
      folioLane: "live",
      balance: 0,
      blockingKeys: [],
      datesValid: true,
    });
    assert.equal(live.canCheckOut, true);
    assert.equal(live.needsSettlement, false);
    const owing = foCheckoutReadiness({
      status: "checked_in",
      assigned: true,
      folioId: "folio-1",
      folioLane: "live",
      balance: 25,
      blockingKeys: ["unsettled_folio"],
      datesValid: true,
    });
    assert.equal(owing.canCheckOut, true);
    assert.equal(owing.needsSettlement, true);
    assert.equal(owing.hasBlockingException, true);
    const done = foCheckoutReadiness({
      status: "checked_out",
      assigned: true,
      folioId: "folio-1",
      folioLane: "live",
      balance: 0,
      blockingKeys: [],
      datesValid: true,
    });
    assert.equal(done.canCheckOut, false);
    for (const status of ["pending", "confirmed", "cancelled", "no_show"] as const) {
      assert.equal(
        foCheckoutReadiness({
          status,
          assigned: true,
          folioId: "folio-1",
          folioLane: "live",
          balance: 0,
          blockingKeys: [],
          datesValid: true,
        }).canCheckOut,
        false,
        status,
      );
    }
    const hints = foDepartureActionHints({
      status: "checked_out",
      assigned: true,
      folioId: "folio-1",
      folioLane: "live",
      balance: 0,
      guestId: "guest-1",
      blockingKeys: [],
      datesValid: true,
    });
    assert.equal(departureMenuItems(hints).some((item) => item.id === "check_out"), false);
  });

  it("derives due now, late checkout and overdue from stay dates only", () => {
    assert.equal(
      foDepartureTiming({
        departureDate: "2026-09-26",
        businessDate: "2026-09-26",
        overstay: false,
        lateCheckoutGranted: false,
      }),
      "due_now",
    );
    assert.equal(
      foDepartureTiming({
        departureDate: "2026-09-26",
        businessDate: "2026-09-26",
        overstay: false,
        lateCheckoutGranted: true,
      }),
      "late_checkout",
    );
    assert.equal(
      foDepartureTiming({
        departureDate: "2026-09-25",
        businessDate: "2026-09-26",
        overstay: true,
        lateCheckoutGranted: false,
      }),
      "overdue",
    );
  });
});

describe("FO Phase 4 — writers and ownership", () => {
  it("checkout uses completeFoCheckOut through the existing stepper", () => {
    const workspace = readRel("../components/workspaces/departures-workspace.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const stepper = readRel("../components/frontoffice/fo-check-out-stepper.tsx");
    assert.match(workspace, /CheckOutDialog/);
    assert.match(dialogs, /FoCheckOutStepper/);
    assert.match(stepper, /completeFoCheckOut/);
    assert.match(stepper, /Check Out/);
    assert.doesNotMatch(workspace, /checkOutReservation/);
    assert.doesNotMatch(workspace, /completeFoCheckOut\(/);
    assert.doesNotMatch(readRel("./fo-departure.functions.ts"), /completeFoCheckOut/);
  });

  it("invalidates Front Office, in-house, rack and folio queries after completion", () => {
    const stepper = readRel("../components/frontoffice/fo-check-out-stepper.tsx");
    assert.match(stepper, /invalidateQueries\(\{ queryKey: \["front-office"\] \}\)/);
    assert.match(stepper, /invalidateQueries\(\{ queryKey: \["reservation-folio"\] \}\)/);
    assert.match(stepper, /invalidateQueries\(\{ queryKey: \["rooms-dashboard"\] \}\)/);
    const workspace = readRel("../components/workspaces/departures-workspace.tsx");
    assert.match(workspace, /invalidateQueries\(\{ queryKey: \["front-office"\] \}\)/);
  });

  it("does not add FO HK, folio or second checkout writers", () => {
    const fns = readRel("./fo-departure.functions.ts");
    const workspace = readRel("../components/workspaces/departures-workspace.tsx");
    const qv = readRel("../components/frontoffice/departure-quick-view.tsx");
    for (const src of [fns, workspace, qv]) {
      assert.doesNotMatch(src, /\.update\(\{[^}]*housekeeping_status/);
      assert.doesNotMatch(src, /\.update\(\{[^}]*status:\s*"checked_out"/);
      assert.doesNotMatch(src, /folio_transactions/);
      assert.doesNotMatch(src, /post_folio_transaction/);
      assert.doesNotMatch(src, /close_guest_folio/);
    }
    assert.match(workspace, /\/restaurant\/pms\/cashiering/);
    assert.match(qv, /Open Folio|Guest Profile/);
    assert.match(workspace, /StayDatesDialog/);
    assert.match(workspace, /LateCheckoutDialog/);
    const repoRoot = join(here, "../../../..");
    const extra = [...readdirSync(join(repoRoot, "drizzle/migrations")), ...readdirSync(join(repoRoot, "supabase/migrations"))].filter(
      (name) => name.startsWith("0101_") || name.startsWith("0102_"),
    );
    assert.equal(extra.length, 0);
  });
});
