import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import type { GuestProfile } from "./guests.functions";
import type { FrontOfficeStay } from "./frontoffice.functions";
import {
  FO_EDIT_DETAILS_MULTI_ROOM,
  FO_EDIT_DETAILS_PLACEHOLDERS,
  FO_EDIT_DETAILS_ROOM_TYPE_ROOM,
  foEditDetailsErrors,
  foEditDetailsFinancial,
  foEditDetailsPlan,
  foEditDetailsSeed,
  foGuestProfileWrite,
  type FoEditDetailsDraft,
} from "./fo-edit-details";

const here = dirname(fileURLToPath(import.meta.url));

const stay = {
  arrivalDate: "2026-10-26",
  departureDate: "2026-10-28",
  roomTypeId: "type-1",
  adults: 2,
  children: 1,
  guestName: "Tariq Al-Mansoor",
  guestPhone: "+251911000000",
  guestEmail: "tariq@example.com",
  specialRequests: "Late arrival",
  roomId: "room-1",
  roomUnits: [],
} as Pick<
  FrontOfficeStay,
  | "arrivalDate"
  | "departureDate"
  | "roomTypeId"
  | "adults"
  | "children"
  | "guestName"
  | "guestPhone"
  | "guestEmail"
  | "specialRequests"
  | "roomId"
  | "roomUnits"
>;

function draft(overrides: Partial<FoEditDetailsDraft> = {}): FoEditDetailsDraft {
  return { ...foEditDetailsSeed({ stay, notes: "VIP" }), ...overrides };
}

describe("FO Edit Details — current values and placeholders", () => {
  it("seeds stay fields and guest profile name parts without combining them", () => {
    const seeded = foEditDetailsSeed({
      stay,
      notes: "VIP",
      firstName: "Tariq",
      middleName: "A.",
      lastName: "Al-Mansoor",
    });
    assert.equal(seeded.arrival, "2026-10-26");
    assert.equal(seeded.departure, "2026-10-28");
    assert.equal(seeded.roomTypeId, "type-1");
    assert.equal(seeded.adults, "2");
    assert.equal(seeded.children, "1");
    assert.equal(seeded.firstName, "Tariq");
    assert.equal(seeded.middleName, "A.");
    assert.equal(seeded.lastName, "Al-Mansoor");
    assert.notEqual(seeded.firstName, stay.guestName);
    assert.equal(seeded.phone, "+251911000000");
    assert.equal(seeded.email, "tariq@example.com");
    assert.equal(seeded.specialRequests, "Late arrival");
    assert.equal(seeded.notes, "VIP");
  });

  it("leaves empty profile and contact fields empty so the placeholders show", () => {
    const seeded = foEditDetailsSeed({
      stay: { ...stay, guestPhone: null, guestEmail: null, specialRequests: null, children: 0 },
      notes: null,
    });
    assert.equal(seeded.firstName, "");
    assert.equal(seeded.middleName, "");
    assert.equal(seeded.lastName, "");
    assert.equal(seeded.phone, "");
    assert.equal(seeded.email, "");
    assert.equal(seeded.specialRequests, "");
    assert.equal(seeded.notes, "");
    assert.equal(seeded.children, "0");
    assert.equal(FO_EDIT_DETAILS_PLACEHOLDERS.firstName, "Enter first name");
    assert.equal(FO_EDIT_DETAILS_PLACEHOLDERS.middleName, "Enter middle name");
    assert.equal(FO_EDIT_DETAILS_PLACEHOLDERS.lastName, "Enter last name");
    assert.equal(FO_EDIT_DETAILS_PLACEHOLDERS.phone, "Enter phone number");
    assert.equal(FO_EDIT_DETAILS_PLACEHOLDERS.requests, "Enter special requests or notes");
    assert.equal(FO_EDIT_DETAILS_PLACEHOLDERS.room, "Select assigned room");
  });
});

describe("FO Edit Details — financial display", () => {
  it("shows a dash until the stay-date quote returns", () => {
    assert.deepEqual(foEditDetailsFinancial(null), {
      duration: null,
      total: null,
      adjustment: null,
    });
  });

  it("uses the quoted nights, total and charge delta", () => {
    const shown = foEditDetailsFinancial({
      nextNights: 3,
      previousSubtotal: 180,
      quotedSubtotal: 240,
    });
    assert.equal(shown.duration, "3 nights");
    assert.equal(shown.total, 240);
    assert.equal(shown.adjustment, 60);
  });
});

describe("FO Edit Details — save plan and validation", () => {
  it("pre-arrival changes use the reservation amend, including the new dates", () => {
    const baseline = draft();
    const next = draft({ departure: "2026-10-30" });
    const plan = foEditDetailsPlan({ draft: next, baseline, status: "confirmed" });
    assert.equal(plan.amend, true);
    assert.equal(plan.inHouseDates, false);
    assert.equal(plan.amendDates, "form");
    assert.equal(plan.roomTypeId, "type-1");
  });

  it("checked-in date changes stay on the in-house date writer", () => {
    const baseline = draft();
    const next = draft({ departure: "2026-10-30", roomTypeId: "type-2" });
    const plan = foEditDetailsPlan({ draft: next, baseline, status: "checked_in" });
    assert.equal(plan.inHouseDates, true);
    assert.equal(plan.amendDates, "stored");
    assert.equal(plan.roomTypeId, "type-1");
    assert.equal(plan.guest, false);
  });

  it("guest contact is a profile write and does not amend the stay", () => {
    const baseline = draft();
    const next = draft({ phone: "+251922000000" });
    const plan = foEditDetailsPlan({ draft: next, baseline, status: "confirmed" });
    assert.equal(plan.guest, true);
    assert.equal(plan.amend, false);
    assert.equal(plan.inHouseDates, false);
  });

  it("keeps special requests and notes as separate fields", () => {
    const baseline = draft();
    const requests = foEditDetailsPlan({
      draft: draft({ specialRequests: "Quiet room" }),
      baseline,
      status: "confirmed",
    });
    const notes = foEditDetailsPlan({
      draft: draft({ notes: "Do not publish" }),
      baseline,
      status: "confirmed",
    });
    assert.equal(requests.amend, true);
    assert.equal(notes.amend, true);
    assert.notEqual(baseline.specialRequests, baseline.notes);
  });

  it("blocks an invalid date range, occupancy, guest fields and a room-type change that needs a room", () => {
    const baseline = draft();
    const invalid = foEditDetailsErrors({
      draft: draft({
        departure: "2026-10-26",
        adults: "9",
        firstName: "",
        email: "not-an-email",
        roomTypeId: "type-2",
      }),
      baseline,
      status: "checked_in",
      stay,
      maxOccupancy: 4,
    });
    assert.equal(invalid.departure, "Check-out must be after check-in.");
    assert.match(invalid.adults ?? "", /4/);
    assert.equal(invalid.firstName, FO_EDIT_DETAILS_PLACEHOLDERS.firstName);
    assert.equal(invalid.phone, undefined);
    assert.equal(invalid.email, "Enter a valid email address.");
    assert.equal(invalid.roomType, FO_EDIT_DETAILS_ROOM_TYPE_ROOM);
  });

  it("blocks date and occupancy changes when the stay has more than one room", () => {
    const errors = foEditDetailsErrors({
      draft: draft({ arrival: "2026-10-27" }),
      baseline: draft(),
      status: "checked_in",
      stay: {
        roomId: "room-1",
        roomUnits: [
          { id: "unit-1", status: "checked_in" },
          { id: "unit-2", status: "checked_in" },
        ],
      } as Pick<FrontOfficeStay, "roomId" | "roomUnits">,
      maxOccupancy: 4,
    });
    assert.equal(errors.form, FO_EDIT_DETAILS_MULTI_ROOM);
  });

  it("allows an unassigned pre-arrival room category change", () => {
    const errors = foEditDetailsErrors({
      draft: draft({ roomTypeId: "type-2" }),
      baseline: draft(),
      status: "confirmed",
      stay: { ...stay, roomId: null },
      maxOccupancy: 4,
    });
    assert.equal(errors.roomType, undefined);
    assert.equal(errors.form, undefined);
  });
});

describe("FO Edit Details — guest profile ownership", () => {
  const profile = {
    firstName: "Tariq",
    lastName: "Al-Mansoor",
    fullName: "Tariq Al-Mansoor",
    phone: "+251911000000",
    email: "tariq@example.com",
    notes: "Profile note",
    nationality: "Ethiopian",
    vipStatus: true,
    guestStatus: "active",
    restricted: false,
    blacklisted: false,
    emergencyContacts: [],
    title: null,
    gender: null,
    preferredContactMethod: null,
    preferredContactTime: null,
    restrictionSeverity: null,
  } as unknown as GuestProfile;

  it("writes the profile name parts and phone without merging them", () => {
    const payload = foGuestProfileWrite(profile, {
      firstName: "Tariq",
      middleName: "A.",
      lastName: "Al-Mansoor",
      phone: "+251922000000",
      email: "new@example.com",
    });
    assert.equal(payload.firstName, "Tariq");
    assert.equal(payload.middleName, "A.");
    assert.equal(payload.lastName, "Al-Mansoor");
    assert.equal(payload.phone, "+251922000000");
    assert.equal(payload.email, "new@example.com");
    assert.equal(payload.notes, "Profile note");
    assert.equal(payload.nationality, "Ethiopian");
  });
});

describe("FO Edit Details — form reuses the existing writers", () => {
  const form = readFileSync(
    join(here, "../components/frontoffice/fo-edit-details-form.tsx"),
    "utf8",
  );
  const confirmed = readFileSync(
    join(here, "../components/frontoffice/fo-check-in-workspace-sheet.tsx"),
    "utf8",
  );
  const inHouse = readFileSync(
    join(here, "../components/frontoffice/in-house-quick-view.tsx"),
    "utf8",
  );

  it("save calls amendReservation, changeStayDates and updateGuest", () => {
    assert.match(form, /amendReservation/);
    assert.match(form, /changeStayDates/);
    assert.match(form, /updateGuest/);
    assert.match(form, /quoteInHouseStayChange/);
    assert.match(form, /stayDateWriteInput/);
    assert.match(form, /roomId: stay\.roomId/);
    assert.match(form, /expectedArrival: stay\.arrivalDate/);
    assert.match(form, /reservationRoomId: stay\.reservationRoomId/);
    assert.doesNotMatch(form, /createServerFn/);
    assert.doesNotMatch(form, /upgradeReservationType/);
    assert.doesNotMatch(form, /room_move/);
    assert.doesNotMatch(form, /quotedSubtotal\s*-/);
  });

  it("both workspaces render the form and no longer render the action pills", () => {
    assert.match(confirmed, /<FoEditDetailsForm/);
    assert.match(inHouse, /<FoEditDetailsForm/);
    assert.doesNotMatch(confirmed, /fo-ci-workspace-edit-/);
    assert.doesNotMatch(inHouse, /fo-inhouse-edit-/);
    assert.match(form, /Save Changes & Recalculate/);
    assert.match(form, /CanonicalPhoneInput/);
    assert.match(form, /First name/);
    assert.match(form, /Middle name/);
    assert.match(form, /Last name/);
    assert.doesNotMatch(form, /Guest full name/);
    assert.doesNotMatch(form, /foGuestNameWrite/);
    assert.match(form, /rounded-\[6px\] border border-\[#CCCCCC\]/);
    assert.match(confirmed, /bg-\[#1A1208\]/);
    assert.match(inHouse, /bg-\[#1A1208\]/);
    assert.match(form, /disabled/);
    assert.match(form, /data-testid="fo-edit-details-room"/);
  });
});
