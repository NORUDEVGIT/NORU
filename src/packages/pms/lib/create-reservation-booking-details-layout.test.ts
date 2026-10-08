import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Create reservation Booking Details Phase A layout", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const details = readRel("../components/bookings/create-reservation-booking-details.tsx");

  it("Step 2 uses the six-card operational layout inside CreateReservationBookingDetails", () => {
    assert.match(details, /data-testid="create-reservation-booking-details"/);
    assert.match(details, /booking-details-guest-booker/);
    assert.match(details, /Guest & Booker Information/);
    assert.match(details, /booking-details-source-classification/);
    assert.match(details, /Booking Source & Classification/);
    assert.match(details, /reservation-type-\$\{mode\}/);
    assert.match(details, /data-testid="booking-agent"/);
    assert.match(details, /booking-details-relationships/);
    assert.match(details, /Booking Relationships \(Optional\)/);
    assert.match(details, /Company \/ Corporate/);
    assert.match(details, /Travel Agent \/ Agency/);
    assert.match(details, /Group \/ Block/);
    assert.match(details, /booking-details-room-rate/);
    assert.match(details, /Room & Rate Details/);
    assert.match(details, /booking-details-stay/);
    assert.match(details, /Stay Details/);
    assert.match(details, /booking-details-special-requests/);
    assert.match(details, /Special Requests & Preferences/);
  });

  it("Step 2 page shell starts with booking details grid; no Context strip or associations card", () => {
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
  });

  it("uses restrained operational card shells", () => {
    assert.match(details, /PMS_OP_PANEL/);
    assert.doesNotMatch(details, /rounded-xl border border-\[#DDD4C5\]/);
  });
});
