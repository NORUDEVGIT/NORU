import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  bookingRowActions,
  bookingTimelineLabel,
  filterGuestBookings,
  guestBookingsCsv,
  newReservationHref,
  pickActiveBooking,
  stayNumberForBooking,
  uniqueBookingIds,
} from "./guest-bookings-workspace.ts";
import { mapReservationToStay, type GuestStay, type GuestStayAccess } from "./guest-profile-wave3.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const FULL: GuestStayAccess = { reservation: true, frontOffice: true, folio: true };
const NONE: GuestStayAccess = { reservation: false, frontOffice: false, folio: false };

function stay(
  partial: Partial<GuestStay> &
    Pick<GuestStay, "id" | "confirmationNumber" | "arrivalDate" | "departureDate" | "status">,
): GuestStay {
  return mapReservationToStay({
    roomTypeName: "Deluxe",
    roomId: null,
    roomNumber: null,
    roomSubtotal: 120,
    currency: "ZAR",
    ratePlanName: "BAR",
    sourceLabel: "Phone",
    ...partial,
  });
}

describe("Guest bookings workspace helpers", () => {
  const inHouse = stay({
    id: "res-in",
    confirmationNumber: "NR-1",
    arrivalDate: "2026-09-20",
    departureDate: "2026-09-22",
    status: "checked_in",
    roomId: "r1",
    roomNumber: "204",
  });
  const upcoming = stay({
    id: "res-up",
    confirmationNumber: "NR-2",
    arrivalDate: "2026-10-01",
    departureDate: "2026-10-03",
    status: "confirmed",
  });
  const later = stay({
    id: "res-later",
    confirmationNumber: "NR-3",
    arrivalDate: "2026-11-01",
    departureDate: "2026-11-02",
    status: "pending",
  });
  const past = stay({
    id: "res-out",
    confirmationNumber: "NR-4",
    arrivalDate: "2026-08-01",
    departureDate: "2026-08-03",
    status: "checked_out",
  });

  it("picks in-house before nearest upcoming", () => {
    assert.equal(pickActiveBooking([upcoming, inHouse, later], "2026-09-21")?.id, "res-in");
    assert.equal(pickActiveBooking([later, upcoming], "2026-09-21")?.id, "res-up");
    assert.equal(pickActiveBooking([past], "2026-09-21"), null);
  });

  it("filters by search, status, and overlapping dates without duplicating ids", () => {
    const rows = [inHouse, upcoming, later, past];
    const found = filterGuestBookings(rows, {
      search: "204",
      status: "all",
      from: "",
      to: "",
    });
    assert.deepEqual(found.map((row) => row.id), ["res-in"]);
    const confirmed = filterGuestBookings(rows, {
      search: "",
      status: "confirmed",
      from: "",
      to: "",
    });
    assert.deepEqual(confirmed.map((row) => row.id), ["res-up"]);
    const ranged = filterGuestBookings(rows, {
      search: "",
      status: "all",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    assert.deepEqual(ranged.map((row) => row.id), ["res-up"]);
    assert.equal(uniqueBookingIds(rows).length, rows.length);
  });

  it("hides invalid row actions and keeps Stay No. as confirmation only when occupied", () => {
    assert.equal(stayNumberForBooking(inHouse), "NR-1");
    assert.equal(stayNumberForBooking(upcoming), "");
    const checkedOut = bookingRowActions(past, FULL);
    assert.equal(checkedOut.cancel, "hidden");
    assert.equal(checkedOut.checkIn, "hidden");
    assert.equal(checkedOut.checkOut, "hidden");
    assert.equal(checkedOut.modify, "hidden");
    assert.equal(checkedOut.view, "enabled");
    const confirmed = bookingRowActions(upcoming, FULL);
    assert.equal(confirmed.checkIn, "enabled");
    assert.equal(confirmed.cancel, "enabled");
    assert.equal(confirmed.checkOut, "hidden");
    const inHouseActions = bookingRowActions(inHouse, FULL);
    assert.equal(inHouseActions.checkOut, "enabled");
    assert.equal(inHouseActions.checkIn, "hidden");
    const hidden = bookingRowActions(upcoming, NONE);
    assert.equal(hidden.view, "hidden");
    assert.equal(hidden.cancel, "hidden");
  });

  it("prints and exports one CSV row per reservation id", () => {
    const csv = guestBookingsCsv([inHouse, upcoming]);
    assert.match(csv, /^id,confirmation/);
    assert.equal(csv.split("\n").length, 3);
    assert.match(csv, /NR-1/);
    assert.match(csv, /NR-2/);
    assert.equal(newReservationHref("guest-1"), "/restaurant/bookings/new?guestId=guest-1");
    assert.equal(bookingTimelineLabel("check_in"), "Checked In");
    assert.equal(bookingTimelineLabel("created"), "Reservation Created");
  });
});

describe("Guest bookings workspace honesty", () => {
  it("uses one Stays & Reservations nav item and aliases legacy stays/reservations", () => {
    const wave1 = readRel("./guest-profile-wave1.ts");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const overview = readRel("../components/guests/guest-overview-history-tabs.tsx");
    assert.match(wave1, /id: "bookings"/);
    assert.match(wave1, /Stays & Reservations/);
    assert.match(wave1, /stays: "bookings"/);
    assert.match(wave1, /reservations: "bookings"/);
    assert.doesNotMatch(wave1, /id: "stays"/);
    assert.doesNotMatch(wave1, /id: "reservations"/);
    assert.match(shell, /selectNav\("bookings"\)/);
    assert.doesNotMatch(shell, /scope=\{navId/);
    assert.match(overview, /Stays & Reservations/);
    assert.doesNotMatch(overview, /Reservation History/);
  });

  it("lists hotel_reservations once and does not invent a stay table, waitlist, or activity feed", () => {
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    const functions = readRel("./guests.functions.ts");
    const helpers = readRel("./guest-bookings-workspace.ts");
    assert.match(functions, /from\("hotel_reservations"\)/);
    assert.match(functions, /export const getGuestBookingDetail/);
    assert.match(functions, /hotel_reservation_history/);
    assert.match(functions, /hotel_rate_plans/);
    assert.match(functions, /pms_source_codes/);
    assert.doesNotMatch(functions, /from\("guest_stays"\)/);
    assert.doesNotMatch(history, /Waitlist|Recent Activity/);
    assert.doesNotMatch(helpers, /waitlist/);
    assert.match(history, /guestId/);
    assert.match(history, /\/restaurant\/bookings\/new/);
    assert.match(history, /window.print/);
    assert.match(history, /guestBookingsCsv/);
    assert.match(history, /guest-booking-quick-actions/);
    assert.match(history, /guest-booking-details/);
    assert.match(history, /Stay No\./);
    assert.match(history, /Rate Plan/);
  });

  it("connects actions to existing reservation, FO, folio, notes, services, and financial surfaces", () => {
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    const actions = readRel("../components/guests/guest-stay-actions.tsx");
    assert.match(actions, /to="\/restaurant\/pms\/reservations\/\$reservationId"/);
    assert.match(actions, /to="\/restaurant\/pms\/front-office"/);
    assert.match(actions, /tab: "cancellations"/);
    assert.match(actions, /to="\/restaurant\/pms\/cashiering"/);
    assert.match(history, /openNote/);
    assert.match(history, /\/restaurant\/pms\/guest-services/);
    assert.match(history, /onOpenFinancial/);
    assert.doesNotMatch(history, /Coming soon/);
  });
});
