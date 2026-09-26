import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { guestCreateBlocked } from "./pms-set3-rates-guest.ts";
import { canCompleteCheckIn, canContinueRegistration } from "./fo-check-in.ts";
import {
  etaTiming,
  foArrivalActionHints,
  foArrivalExceptionKeys,
  foCheckInReadiness,
  guestVerificationMissing,
  registrationOkFromProgress,
  GUARANTEE_HOLD_UNSUPPORTED,
} from "./fo-arrival.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const rules = {
  requiredFields: { firstName: true, lastName: true, phone: true, email: false },
  consentDefaults: { marketing: false, dataProcessing: true },
  companyRelationshipEnabled: false,
  savedAt: "2026-01-01T00:00:00.000Z",
};

describe("FO Phase 2 — arrivals read model", () => {
  it("lists business-date arrivals through listFrontOfficeArrivalsDesk", () => {
    const fns = readRel("./fo-arrival.functions.ts");
    assert.match(fns, /export const listFrontOfficeArrivalsDesk/);
    assert.match(fns, /export const getFrontOfficeArrivalQuickView/);
    assert.match(fns, /loadFrontOfficeArrivals/);
    assert.match(fns, /loadFrontOfficeStay/);
    assert.doesNotMatch(fns, /fake arrival|seedArrival/i);
  });

  it("Arrival QV lives on the Arrivals tab as a dedicated sheet", () => {
    const workspace = readRel("../components/workspaces/arrivals-workspace.tsx");
    const qv = readRel("../components/frontoffice/arrival-quick-view.tsx");
    const fo = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /ArrivalQuickViewSheet/);
    assert.match(workspace, /listFrontOfficeArrivalsDesk/);
    assert.match(qv, /data-testid="fo-arrival-qv"/);
    assert.match(qv, /Can this guest be checked in now/);
    assert.match(fo, /view === "arrivals"/);
    assert.match(fo, /ArrivalsWorkspace/);
  });
});

describe("FO Phase 2 — ETA honesty", () => {
  it("does not invent timing without expected arrival and check-in time", () => {
    assert.equal(
      etaTiming({ expectedArrivalAt: null, checkInTime: "14:00", timezone: "UTC" }),
      null,
    );
    assert.equal(
      etaTiming({ expectedArrivalAt: "2026-09-25T13:00:00.000Z", checkInTime: null, timezone: "UTC" }),
      null,
    );
    assert.equal(
      etaTiming({
        expectedArrivalAt: "2026-09-25T13:00:00.000Z",
        checkInTime: "14:00",
        timezone: "UTC",
      }),
      "early",
    );
    assert.equal(
      etaTiming({
        expectedArrivalAt: "2026-09-25T14:00:00.000Z",
        checkInTime: "14:00",
        timezone: "UTC",
      }),
      "on_time",
    );
    assert.equal(
      etaTiming({
        expectedArrivalAt: "2026-09-25T15:00:00.000Z",
        checkInTime: "14:00",
        timezone: "UTC",
      }),
      "late",
    );
  });

  it("reuses setExpectedArrivalTime rather than a new ETA writer", () => {
    const workspace = readRel("../components/workspaces/arrivals-workspace.tsx");
    const eta = readRel("./arrivals-departures.functions.ts");
    assert.match(workspace, /ExpectedArrivalDialog/);
    assert.match(eta, /export const setExpectedArrivalTime/);
    assert.doesNotMatch(workspace, /updateEta\(|setArrivalEta/);
  });
});

describe("FO Phase 2 — exceptions and hints", () => {
  it("marks unassigned, not-ready, deposit and missing guest as blockers from real signals", () => {
    const keys = foArrivalExceptionKeys({
      status: "confirmed",
      roomId: null,
      room: undefined,
      financialState: "available",
      depositUnpaid: true,
      outstandingBalance: false,
      specialRequests: "Late arrival",
      missingGuestFields: ["Last name is required."],
      registrationOk: false,
      etaTiming: "early",
    });
    assert.equal(keys.includes("unassigned"), true);
    assert.equal(keys.includes("payment_issue"), true);
    assert.equal(keys.includes("missing_guest_data"), true);
    assert.equal(keys.includes("special_request"), true);
    assert.equal(keys.includes("early_arrival"), true);

    const notReady = foArrivalExceptionKeys({
      status: "confirmed",
      roomId: "room-1",
      room: { operationalStatus: "available", housekeepingStatus: "dirty" },
      financialState: "not_available",
      depositUnpaid: false,
      outstandingBalance: false,
      specialRequests: null,
      missingGuestFields: [],
      registrationOk: true,
      etaTiming: null,
    });
    assert.equal(notReady.includes("room_not_ready"), true);

    const ooo = foArrivalExceptionKeys({
      status: "confirmed",
      roomId: "room-1",
      room: { operationalStatus: "out_of_order", housekeepingStatus: "clean" },
      financialState: "not_available",
      depositUnpaid: false,
      outstandingBalance: false,
      specialRequests: null,
      missingGuestFields: [],
      registrationOk: true,
      etaTiming: null,
    });
    assert.equal(ooo.includes("room_unavailable"), true);
  });

  it("pending cannot check in even when the room is ready", () => {
    const hints = foArrivalActionHints({
      status: "pending",
      assigned: true,
      roomReady: true,
      registrationOk: true,
      depositOk: true,
      missingGuestFields: [],
      blockingKeys: [],
      folioId: "folio-1",
      guestId: "guest-1",
    });
    assert.equal(hints.canCheckIn, false);
    assert.equal(hints.canOpenCheckIn, false);
    assert.equal(hints.canUpdateEta, true);

    const gate = foCheckInReadiness({
      status: "pending",
      arrivalDate: "2026-09-25",
      departureDate: "2026-09-26",
      assigned: true,
      roomEligible: true,
      roomReady: true,
      registrationOk: true,
      missingGuestFields: [],
      depositOk: true,
      blockingKeys: [],
    });
    assert.equal(gate.canComplete, false);
    assert.match(gate.blockers.join(" "), /Pending/);
  });
});

describe("FO Phase 2 — guest verification and registration", () => {
  it("enforces SET3 required fields and does not add a duplicate engine", () => {
    assert.equal(
      guestCreateBlocked(rules, { firstName: "Ada", lastName: null, phone: "+1", email: null }),
      "Last name is required.",
    );
    assert.deepEqual(
      guestVerificationMissing({
        rules,
        firstName: "Ada",
        lastName: null,
        phone: "+1",
        email: null,
      }),
      ["Last name is required."],
    );
    const qv = readRel("../components/frontoffice/arrival-quick-view.tsx");
    assert.match(qv, /Duplicate matching is not available/);
    assert.doesNotMatch(qv, /mergeGuest|findDuplicate/);
    const fns = readRel("./fo-check-in.functions.ts");
    assert.match(fns, /export const saveCheckInRegistration/);
    assert.match(fns, /guestCreateBlocked/);
    assert.match(fns, /registration_snapshot/);
  });

  it("treats a saved registration snapshot or waiver as complete", () => {
    assert.equal(
      registrationOkFromProgress({
        snapshot: {
          fullName: "Ada Smith",
          phone: "+44",
          email: null,
          idDocumentType: "passport",
          idDocumentNumber: "A1",
        },
        waived: false,
        guest: {
          fullName: "Ada",
          phone: null,
          email: null,
          idDocumentType: null,
          idDocumentNumber: null,
        },
      }),
      true,
    );
    assert.equal(
      canContinueRegistration(
        { fullName: "", phone: null, email: null, idDocumentType: null, idDocumentNumber: null },
        true,
      ),
      true,
    );
  });
});

describe("FO Phase 2 — assignment, finance and completion ownership", () => {
  it("assignment at check-in still uses assignReservationRoom", () => {
    const stepper = readRel("../components/frontoffice/fo-check-in-stepper.tsx");
    assert.match(stepper, /assignReservationRoom/);
    assert.match(stepper, /listAssignableRooms/);
    assert.match(stepper, /completeFoCheckIn/);
    assert.match(stepper, /"Check In"/);
    assert.doesNotMatch(stepper, /checkInReservation/);
  });

  it("deposit posting stays on Cashiering helpers and names unsupported guarantee holds", () => {
    const stepper = readRel("../components/frontoffice/fo-check-in-stepper.tsx");
    const fns = readRel("./fo-check-in.functions.ts");
    assert.match(stepper, /postCheckInDeposit/);
    assert.match(stepper, /waiveCheckInDeposit/);
    assert.match(stepper, /GUARANTEE_HOLD_UNSUPPORTED/);
    assert.match(fns, /folio_transactions/);
    assert.doesNotMatch(fns, /authorizeCard|payment_intent/);
    assert.match(GUARANTEE_HOLD_UNSUPPORTED, /not available/i);
  });

  it("completion remains completeFoCheckIn / check_in_hotel_reservation", () => {
    const fns = readRel("./fo-check-in.functions.ts");
    const complete = fns.slice(fns.indexOf("export const completeFoCheckIn"));
    assert.match(complete, /check_in_hotel_reservation/);
    assert.match(complete, /Only confirmed stays can be checked in/);
    assert.doesNotMatch(complete, /checkInReservation/);
    assert.equal(
      canCompleteCheckIn({ roomReady: true, registrationOk: true, depositOk: true, keyOk: false }),
      false,
    );
  });

  it("does not add a migration or FO HK writer", () => {
    const fns = readRel("./fo-arrival.functions.ts");
    assert.doesNotMatch(fns, /\.update\(\{[^}]*housekeeping_status/);
    assert.doesNotMatch(fns, /create table/i);
    const repoRoot = join(here, "../../../..");
    const drizzleDir = join(repoRoot, "drizzle/migrations");
    const supabaseDir = join(repoRoot, "supabase/migrations");
    const extra = [...readdirSync(drizzleDir), ...readdirSync(supabaseDir)].filter((name) =>
      name.startsWith("0101_"),
    );
    assert.equal(extra.length, 0);
  });
});
