import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FO_ACTIONS, FO_LANDING_NAV, FO_NAV_IDS, foSearchFromUnknown, resolveFoNav } from "./front-office-shell.ts";
import { STAY_MUTATION_CONFLICT, stayMutationIsStale } from "./fo-mutation-freshness.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const FO_UI_FILES = [
  "../components/workspaces/front-office-workspace.tsx",
  "../components/frontoffice/front-office-chrome.tsx",
  "../components/frontoffice/front-office-dialogs.tsx",
  "../components/frontoffice/front-office-frames.tsx",
  "../components/frontoffice/fo-check-in-stepper.tsx",
  "../components/frontoffice/fo-check-out-stepper.tsx",
  "../components/frontoffice/fo-cancel-noshow-stepper.tsx",
  "../components/frontoffice/fo-cancel-stepper.tsx",
  "../components/frontoffice/fo-no-show-stepper.tsx",
  "../components/frontoffice/fo-rack-confirm-sheet.tsx",
  "../components/frontoffice/reservation-side-sheet.tsx",
  "../components/frontoffice/stay-lists.tsx",
  "../components/workspaces/in-house-workspace.tsx",
  "../components/frontoffice/in-house-quick-view.tsx",
  "./fo-inhouse.functions.ts",
  "../components/workspaces/departures-workspace.tsx",
  "../components/frontoffice/departure-quick-view.tsx",
  "./fo-departure.functions.ts",
  "../components/frontoffice/walk-ins-history-frame.tsx",
  "../components/workspaces/walk-ins-workspace.tsx",
  "../components/frontoffice/walk-in-quick-view.tsx",
  "./fo-walkin.functions.ts",
  "../components/frontoffice/room-rack-calendar.tsx",
  "../components/frontoffice/room-quick-view.tsx",
  "../../../routes/restaurant/pms/front-office.tsx",
];

describe("FO Phase 0 — canonical writers", () => {
  it("FO UI source does not import ungated CI/CO/no-show wrappers", () => {
    for (const rel of FO_UI_FILES) {
      const src = readRel(rel);
      assert.doesNotMatch(src, /checkInReservation/, rel);
      assert.doesNotMatch(src, /checkOutReservation/, rel);
      assert.doesNotMatch(src, /markNoShow/, rel);
    }
  });

  it("FO action registry names gated writers only", () => {
    const writes = FO_ACTIONS.map((action) => action.write).filter((name): name is NonNullable<typeof name> => Boolean(name));
    assert.equal(writes.includes("completeFoCheckIn"), true);
    assert.equal(writes.includes("completeFoCheckOut"), true);
    assert.equal(writes.includes("completeFoNoShow"), true);
    assert.equal(writes.includes("completeFoCancel"), true);
    const writeText = writes.join(",");
    assert.doesNotMatch(writeText, /checkInReservation|checkOutReservation|markNoShow|setReservationStatus/);
  });

  it("FO cancellation UI uses completeFoCancel and not setReservationStatus cancelled", () => {
    const stepper = readRel("../components/frontoffice/fo-cancel-noshow-stepper.tsx");
    const frames = readRel("../components/frontoffice/front-office-frames.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    const sheet = readRel("../components/frontoffice/reservation-side-sheet.tsx");
    assert.match(stepper, /completeFoCancel/);
    assert.doesNotMatch(stepper, /setReservationStatus/);
    assert.doesNotMatch(frames, /setReservationStatus/);
    assert.doesNotMatch(workspace, /setReservationStatus/);
    assert.doesNotMatch(sheet, /setReservationStatus/);
  });

  it("Reservation pre-arrival cancel remains setReservationStatus without FO fees", () => {
    const dates = readRel("./reservation-dates.ts");
    const reservations = readRel("./reservations.functions.ts");
    const foCancel = readRel("./fo-cancel-noshow.functions.ts");
    assert.match(dates, /completeFoCancel/);
    assert.match(dates, /setReservationStatus/);
    assert.match(reservations, /Reservation-owned pending\/confirmed\/cancelled/);
    assert.match(reservations, /completeFoCancel/);
    assert.match(foCancel, /room_id: null/);
    assert.match(foCancel, /ReservationEventType = "cancelled"/);
  });
});

describe("FO Phase 0 — walk-in source", () => {
  it("FO walk-in create payload and startWalkInCheckIn stamp source walk_in", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const walkIn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkIn, /createReservation/);
    assert.match(walkIn, /source:\s*"walk_in"/);
    assert.match(walkIn, /startWalkInCheckIn/);
    assert.doesNotMatch(walkIn, /createWalkInReservation/);
    const start = readRel("./fo-check-in.functions.ts");
    const startFn = start.slice(start.indexOf("export const startWalkInCheckIn"));
    assert.match(startFn.slice(0, startFn.indexOf("export const saveCheckInRegistration")), /source:\s*"walk_in"/);
    const create = readRel("./reservations.functions.ts");
    assert.match(create, /source: z\.enum\(\["walk_in"\]\)/);
    assert.doesNotMatch(create, /createWalkInReservation/);
  });
});

describe("FO Phase 0 — URL tabs", () => {
  it("round-trips every supported tab and falls back to rack", () => {
    assert.equal(FO_LANDING_NAV, "rack");
    for (const id of FO_NAV_IDS) {
      assert.equal(foSearchFromUnknown({ tab: id }).tab, id);
      assert.equal(resolveFoNav(id), id);
    }
    assert.equal(foSearchFromUnknown({}).tab, "rack");
    assert.equal(foSearchFromUnknown({ tab: "not-a-tab" }).tab, "rack");
    assert.equal(foSearchFromUnknown({ tab: "overview" }).tab, "rack");
    const route = readRel("../../../routes/restaurant/pms/front-office.tsx");
    assert.match(route, /foSearchFromUnknown/);
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /search: \{ tab: id/);
  });
});

describe("FO Phase 0 — legacy redirects", () => {
  it("in-house and departures redirect to Front Office tabs", () => {
    const inHouse = readRel("../../../routes/restaurant/rooms/in-house.tsx");
    const departures = readRel("../../../routes/restaurant/rooms/departures.tsx");
    const arrivals = readRel("../../../routes/restaurant/rooms/arrivals.tsx");
    assert.match(inHouse, /tab:\s*"inhouse"/);
    assert.match(inHouse, /\/restaurant\/pms\/front-office/);
    assert.doesNotMatch(inHouse, /listInHouse/);
    assert.match(departures, /tab:\s*"departures"/);
    assert.match(departures, /\/restaurant\/pms\/front-office/);
    assert.doesNotMatch(departures, /listDepartures/);
    assert.match(arrivals, /\/restaurant\/pms\/front-office/);
  });
});

describe("FO Phase 0 — rack freshness", () => {
  it("rejects stale room or date snapshots and allows a matching snapshot", () => {
    const current = {
      roomId: "room-1",
      arrival: "2026-09-25",
      departure: "2026-09-27",
      updatedAt: "2026-09-25T10:00:00.000Z",
    };
    assert.equal(
      stayMutationIsStale({ expectedRoomId: "room-1", expectedArrival: "2026-09-25", expectedDeparture: "2026-09-27" }, current),
      false,
    );
    assert.equal(stayMutationIsStale({ expectedRoomId: "room-2" }, current), true);
    assert.equal(stayMutationIsStale({ expectedArrival: "2026-09-24" }, current), true);
    assert.equal(stayMutationIsStale({ expectedUpdatedAt: "2026-09-25T09:00:00.000Z" }, current), true);
    const writer = readRel("./frontoffice.functions.ts");
    assert.match(writer, /assertStayMutationFreshness/);
    assert.match(writer, /STAY_MUTATION_CONFLICT/);
    const sheet = readRel("../components/frontoffice/fo-rack-confirm-sheet.tsx");
    assert.match(sheet, /expectedRoomId: draft.currentRoomId/);
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    assert.match(dialogs, /expectedRoomId: stay.roomId/);
    assert.equal(STAY_MUTATION_CONFLICT.includes("Refresh Front Office"), true);
  });
});

describe("FO Phase 0 — stay-date RPC + HK check-in contract", () => {
  it("aligns drizzle 0100 with the 5-arg stay-date writer and HK-owned check-in transition", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0100_fo_phase0_stay_dates_and_checkin_hk.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0100_fo_phase0_stay_dates_and_checkin_hk.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /_arrival date/);
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.change_hotel_stay_dates\(uuid, uuid, date, uuid\)/);
    assert.match(sql, /guest_check_in/);
    assert.match(sql, /pms_housekeeping_transition_target/);
    const rpc = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.check_in_hotel_reservation"));
    assert.match(rpc, /pms_housekeeping_transition_target/);
    assert.match(rpc, /UPDATE public\.hotel_rooms SET housekeeping_status = target_status/);
    const foFns = readRel("./fo-check-in.functions.ts") + readRel("./frontoffice.functions.ts");
    assert.doesNotMatch(foFns, /from\("hotel_rooms"\)[\s\S]{0,200}update\(\{[\s\S]{0,80}housekeeping_status/);
  });
});

describe("FO Phase 0 — dead summary removed", () => {
  it("does not keep an unmounted FrontOfficeSummary component", () => {
    assert.equal(existsSync(join(here, "../components/frontoffice/front-office-summary.tsx")), false);
  });
});
