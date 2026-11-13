import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  dateFallsInWindow,
  eachDateInclusive,
  eventOverlapsWindow,
  formatInclusiveRangeLabel,
  reservationRangeEnd,
  reservationRangeStart,
  reservationStartAfterHorizonChange,
  reservationStartAfterPick,
  shiftReservationRange,
  stayOverlapsWindow,
} from "./section-week.ts";

const workspace = readFileSync(
  new URL("../../components/workspaces/reservations-workspace.tsx", import.meta.url),
  "utf8",
);

describe("reservation section week window", () => {
  const start = "2026-11-09";
  const end = "2026-11-15";

  it("overlaps a stay that is in house during the week", () => {
    assert.equal(stayOverlapsWindow("2026-11-08", "2026-11-10", start, end), true);
    assert.equal(stayOverlapsWindow("2026-11-15", "2026-11-16", start, end), true);
    assert.equal(stayOverlapsWindow("2026-11-02", "2026-11-09", start, end), false);
    assert.equal(stayOverlapsWindow("2026-11-16", "2026-11-18", start, end), false);
  });

  it("treats an arrival or departure day as inclusive", () => {
    assert.equal(dateFallsInWindow("2026-11-09", start, end), true);
    assert.equal(dateFallsInWindow("2026-11-15", start, end), true);
    assert.equal(dateFallsInWindow("2026-11-16", start, end), false);
  });

  it("keeps a single-night event that falls on a day in the week", () => {
    assert.equal(eventOverlapsWindow("2026-11-09", "2026-11-09", start, end), true);
    assert.equal(eventOverlapsWindow("2026-11-08", "2026-11-08", start, end), false);
  });

  it("lists every day in the horizon, capped at 31", () => {
    assert.deepEqual(eachDateInclusive(start, "2026-11-11"), ["2026-11-09", "2026-11-10", "2026-11-11"]);
    assert.equal(eachDateInclusive("2026-11-01", "2026-12-15").length, 31);
  });

  it("passes the shared week into every reservation section", () => {
    for (const component of [
      "GroupsWorkspace",
      "WaitlistWorkspace",
      "ArrivalsDeparturesWorkspace",
      "ReservationControlWorkspace",
    ]) {
      assert.match(workspace, new RegExp(`<${component}[\\s\\S]*?rangeStart=\\{tableWeekStart\\}`));
      assert.match(workspace, new RegExp(`<${component}[\\s\\S]*?rangeEnd=\\{tableStayEnd\\}`));
    }
    assert.match(workspace, /rangeStart: tableWeekStart/);
    assert.match(workspace, /days=\{calendarHorizon\}/);
    assert.match(workspace, /shiftReservationRange\(tableWeekStart, calendarHorizon/);
    assert.doesNotMatch(workspace, /direction \* 7/);
  });

  it("keeps 7 days on Monday through Sunday and steps a week", () => {
    const start = reservationRangeStart({
      storedStart: null,
      horizon: 7,
      businessDate: "2026-11-11",
    });
    assert.equal(start, "2026-11-09");
    assert.equal(reservationRangeEnd(start, 7), "2026-11-15");
    assert.equal(formatInclusiveRangeLabel(start, "2026-11-15"), "9–15 Nov 2026");
    assert.equal(shiftReservationRange(start, 7, 1), "2026-11-16");
    assert.equal(shiftReservationRange(start, 7, -1), "2026-11-02");
    assert.equal(reservationStartAfterPick("2026-11-12", 7), "2026-11-09");
  });

  it("shows one selected day and steps a day", () => {
    const start = reservationStartAfterHorizonChange({
      currentStart: "2026-11-09",
      currentHorizon: 7,
      nextHorizon: 1,
      businessDate: "2026-11-11",
    });
    assert.equal(start, "2026-11-11");
    assert.equal(reservationRangeEnd(start, 1), "2026-11-11");
    assert.equal(formatInclusiveRangeLabel(start, start), "11 Nov 2026");
    assert.equal(shiftReservationRange(start, 1, 1), "2026-11-12");
    assert.equal(shiftReservationRange(start, 1, -1), "2026-11-10");
    const outside = reservationStartAfterHorizonChange({
      currentStart: "2026-11-16",
      currentHorizon: 7,
      nextHorizon: 1,
      businessDate: "2026-11-11",
    });
    assert.equal(outside, "2026-11-16");
  });

  it("extends 14 and 30 days from the current start and steps by that horizon", () => {
    const fourteen = reservationStartAfterHorizonChange({
      currentStart: "2026-11-09",
      currentHorizon: 7,
      nextHorizon: 14,
      businessDate: "2026-11-11",
    });
    assert.equal(fourteen, "2026-11-09");
    assert.equal(reservationRangeEnd(fourteen, 14), "2026-11-22");
    assert.equal(formatInclusiveRangeLabel(fourteen, "2026-11-22"), "9–22 Nov 2026");
    assert.equal(shiftReservationRange(fourteen, 14, 1), "2026-11-23");

    const thirty = reservationStartAfterHorizonChange({
      currentStart: "2026-11-12",
      currentHorizon: 1,
      nextHorizon: 30,
      businessDate: "2026-11-11",
    });
    assert.equal(thirty, "2026-11-12");
    assert.equal(reservationRangeEnd(thirty, 30), "2026-12-11");
    assert.equal(formatInclusiveRangeLabel(thirty, "2026-12-11"), "12 Nov – 11 Dec 2026");
    assert.equal(shiftReservationRange(thirty, 30, 1), "2026-12-12");
    assert.equal(reservationStartAfterPick("2026-11-12", 14), "2026-11-12");
    assert.equal(
      reservationStartAfterHorizonChange({
        currentStart: "2026-11-12",
        currentHorizon: 14,
        nextHorizon: 7,
        businessDate: "2026-11-11",
      }),
      "2026-11-09",
    );
  });
});
