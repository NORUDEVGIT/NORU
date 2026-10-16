import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Create reservation Booking Details layout", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const details = readRel("../components/bookings/create-reservation-booking-details.tsx");

  it("Step 2 contains only Source, relationships, packages, and guest requests", () => {
    assert.match(details, /data-testid="create-reservation-booking-details"/);
    assert.match(details, /booking-details-source-channel/);
    assert.match(details, /Source & Channel/);
    assert.match(details, /booking-details-company-agent-group/);
    assert.match(details, /Company \/ Agent \/ Group/);
    assert.match(details, /booking-details-packages/);
    assert.match(details, /Packages & Add-ons/);
    assert.match(details, /booking-details-guest-requests/);
    assert.match(details, /Guest Requests & Preferences/);
    assert.doesNotMatch(details, /Guest & Booker Information/);
    assert.doesNotMatch(details, /booking-details-guest-booker/);
    assert.doesNotMatch(details, /Room & Rate Details/);
    assert.doesNotMatch(details, /booking-details-room-rate/);
    assert.doesNotMatch(details, /Stay Details/);
    assert.doesNotMatch(details, /booking-details-stay/);
    assert.doesNotMatch(details, /Booking Source & Classification/);
    assert.doesNotMatch(details, /Booking Relationships \(Optional\)/);
    assert.doesNotMatch(details, /Reservation type/);
    assert.doesNotMatch(details, /reservation-type-/);
    assert.match(details, /label="Source" required/);
    assert.match(details, /label="Channel" required/);
  });

  it("Step 2 page shell starts with booking details; no Context strip or associations card", () => {
    assert.match(page, /create-reservation-booking-details-step/);
    assert.match(page, /CreateReservationBookingDetails/);
    assert.doesNotMatch(page, /create-reservation-context-strip/);
    assert.doesNotMatch(page, /CreateReservationContext/);
    assert.match(page, /onRequestTypeChange={requestTypeChange}/);
    assert.match(page, /reservationType={reservationType}/);
    assert.doesNotMatch(page, /CreateReservationAssociations/);
    const stepStart = page.slice(
      page.indexOf("const bookingDetailsSection"),
      page.indexOf("const stepSections"),
    );
    assert.doesNotMatch(stepStart, /CreateReservationContext/);
    assert.match(stepStart, /CreateReservationBookingDetails/);
    assert.match(stepStart, /packagesSlot=/);
  });

  it("uses restrained operational card shells", () => {
    assert.match(details, /PMS_OP_PANEL/);
    assert.doesNotMatch(details, /rounded-xl border border-\[#DDD4C5\]/);
  });
});
