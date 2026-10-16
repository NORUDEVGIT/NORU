import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isOperationalWalkIn, walkInMenuItems } from "./fo-walkin.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const liveHints: Parameters<typeof walkInMenuItems>[0]["hints"] = {
  canAssignRoom: true,
  canCheckIn: true,
  canOpenCheckIn: true,
  needsGuestVerification: false,
  needsRegistration: false,
  needsDeposit: false,
  roomReady: true,
  hasBlockingException: false,
  canUpdateEta: true,
  canViewGuest: true,
  canOpenFolio: true,
  canOpenReservation: true,
};

describe("FO Phase 5 — walk-in create and source", () => {
  it("creates through createReservation with source walk_in and starts canonical check-in", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const walkIn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkIn, /createReservation/);
    assert.match(walkIn, /source:\s*"walk_in"/);
    assert.match(walkIn, /quoteStay/);
    assert.match(walkIn, /listAssignableRooms/);
    assert.match(walkIn, /startWalkInCheckIn/);
    assert.match(walkIn, /GuestFormDialog/);
    assert.doesNotMatch(walkIn, /createWalkInReservation/);
    assert.doesNotMatch(walkIn, /\/restaurant\/bookings\/new/);
    assert.doesNotMatch(walkIn, /nightly \* nights/);
    const create = readRel("./reservations.functions.ts");
    assert.match(create, /source: z\.enum\(\["walk_in"\]\)/);
  });

  it("does not write room_id or invent pricing in the walk-in overlay", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const walkIn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.doesNotMatch(walkIn, /\.update\(\{[^}]*room_id/);
    assert.match(walkIn, /listAssignableRooms/);
    assert.match(walkIn, /quoteStay/);
    assert.match(walkIn, /isRoomReady/);
  });
});

describe("FO Phase 5 — desk and QV", () => {
  it("lists source=walk_in stays on the Walk-ins tab", () => {
    const fns = readRel("./fo-walkin.functions.ts");
    const workspace = readRel("../components/workspaces/walk-ins-workspace.tsx");
    const fo = readRel("../components/workspaces/front-office-workspace.tsx");
    const qv = readRel("../components/frontoffice/walk-in-quick-view.tsx");
    assert.match(fns, /export const listFrontOfficeWalkInsDesk/);
    assert.match(fns, /export const getFrontOfficeWalkInQuickView/);
    assert.match(fns, /\.eq\("source", "walk_in"\)/);
    assert.match(workspace, /listFrontOfficeWalkInsDesk/);
    assert.match(workspace, /WalkInQuickViewSheet/);
    assert.match(qv, /What remains before this walk-in can become in-house/);
    assert.match(fo, /WalkInsWorkspace/);
    assert.match(fo, /tab: id/);
  });

  it("only pending/confirmed walk-ins stay on the operational desk after checkout", () => {
    assert.equal(
      isOperationalWalkIn({
        source: "walk_in",
        status: "confirmed",
        arrivalDate: "2026-09-26",
        businessDate: "2026-09-26",
      }),
      true,
    );
    assert.equal(
      isOperationalWalkIn({
        source: "walk_in",
        status: "checked_in",
        arrivalDate: "2026-09-26",
        businessDate: "2026-09-26",
      }),
      true,
    );
    assert.equal(
      isOperationalWalkIn({
        source: "walk_in",
        status: "checked_out",
        arrivalDate: "2026-09-26",
        businessDate: "2026-09-26",
      }),
      false,
    );
    assert.equal(
      isOperationalWalkIn({
        source: "staff",
        status: "confirmed",
        arrivalDate: "2026-09-26",
        businessDate: "2026-09-26",
      }),
      false,
    );
    const inHouse = readRel("./frontoffice.functions.ts");
    const body = inHouse.slice(inHouse.indexOf("export async function loadFrontOfficeInHouse"));
    assert.match(body, /\.eq\("status", "checked_in"\)/);
  });
});

describe("FO Phase 5 — check-in handoff and ownership", () => {
  it("reuses Phase 2 registration, deposit and completeFoCheckIn", () => {
    const workspace = readRel("../components/workspaces/walk-ins-workspace.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const stepper = readRel("../components/frontoffice/fo-check-in-stepper.tsx");
    const checkIn = readRel("./fo-check-in.functions.ts");
    assert.match(workspace, /CheckInDialog/);
    assert.match(workspace, /initialStep="registration"/);
    assert.match(dialogs, /FoCheckInStepper/);
    assert.match(stepper, /completeFoCheckIn/);
    assert.match(stepper, /saveCheckInRegistration/);
    assert.match(checkIn, /export const completeFoCheckIn/);
    assert.doesNotMatch(workspace, /completeFoCheckIn\(/);
    assert.doesNotMatch(readRel("./fo-walkin.functions.ts"), /completeFoCheckIn/);
  });

  it("status-aware actions drop check-in after the stay is in-house", () => {
    const confirmed = walkInMenuItems({ status: "confirmed", hints: liveHints });
    assert.equal(confirmed.some((item) => item.id === "check_in"), true);
    assert.equal(confirmed.some((item) => item.id === "assign"), true);
    assert.equal(confirmed.some((item) => item.id === "cancel"), true);
    const inHouse = walkInMenuItems({
      status: "checked_in",
      hints: { ...liveHints, canAssignRoom: false, canOpenCheckIn: false, canCheckIn: false },
    });
    assert.equal(inHouse.some((item) => item.id === "check_in"), false);
    assert.equal(inHouse.some((item) => item.id === "assign"), false);
    assert.equal(inHouse.some((item) => item.id === "cancel"), false);
  });

  it("does not add guest, payment or HK engines", () => {
    const fns = readRel("./fo-walkin.functions.ts");
    const workspace = readRel("../components/workspaces/walk-ins-workspace.tsx");
    const qv = readRel("../components/frontoffice/walk-in-quick-view.tsx");
    for (const src of [fns, workspace, qv]) {
      assert.doesNotMatch(src, /\.update\(\{[^}]*housekeeping_status/);
      assert.doesNotMatch(src, /createWalkInReservation/);
      assert.doesNotMatch(src, /post_folio_transaction/);
      assert.doesNotMatch(src, /from\("guest_profiles"\)[\s\S]{0,80}\.insert\(/);
    }
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const walkIn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkIn, /GuestFormDialog/);
    assert.doesNotMatch(walkIn, /createGuest\(/);
    const extra = [
      ...readdirSync(join(here, "../../../..", "drizzle/migrations")),
      ...readdirSync(join(here, "../../../..", "supabase/migrations")),
    ].filter((name) => name.startsWith("0101_") || name.startsWith("0102_"));
    assert.equal(extra.length, 0);
  });
});
