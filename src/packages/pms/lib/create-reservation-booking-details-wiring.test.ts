import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Create reservation Booking Details Phase B wiring", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const details = readRel("../components/bookings/create-reservation-booking-details.tsx");

  it("guest section uses Step 0 guest state and View Profile link", () => {
    assert.match(details, /guest\?\.fullName/);
    assert.match(details, /guest\?\.phone/);
    assert.match(details, /guest\?\.email/);
    assert.match(details, /guest\?\.idDocumentNumber/);
    assert.match(details, /booking-details-guest-name/);
    assert.match(details, /\/restaurant\/pms\/guests\/\$guestId/);
    assert.match(page, /guest={guest}/);
  });

  it("booker same-as-guest maps to create bookerGuestId; separate booker is honest", () => {
    assert.match(page, /bookerGuestId: sameAsGuest && guest\?\.id \? guest\.id : null/);
    assert.match(details, /booker-same-as-guest/);
    assert.match(details, /booker-not-persisted-hint/);
  });

  it("classification owns reservation type and shared source fields; relationships own masters", () => {
    assert.match(page, /onRequestTypeChange={requestTypeChange}/);
    assert.match(details, /onRequestTypeChange\(mode\)/);
    assert.match(details, /booking-details-source/);
    assert.match(details, /booking-details-segment/);
    assert.match(details, /booking-details-external-ref/);
    assert.match(details, /data-testid="booking-agent"/);
    assert.match(details, /value={bookingAgentName}/);
    assert.match(details, /data-testid="booking-agent"[\s\S]{0,120}readOnly/);
    assert.match(details, /classification-company-summary/);
    assert.match(details, /classification-travel-agent-summary/);
    assert.match(details, /classification-group-summary/);
    const classification = details.slice(
      details.indexOf('testId="booking-details-source-classification"'),
      details.indexOf('testId="booking-details-relationships"'),
    );
    assert.doesNotMatch(classification, /CreateReservationMasterPicker/);
    assert.match(
      details,
      /booking-details-relationships[\s\S]{0,4000}CreateReservationMasterPicker/,
    );
    assert.match(details, /companyMaster\?\.name/);
    assert.match(details, /travelAgentMaster\?\.name/);
  });

  it("room and rate reuse selectedQuote without local pricing math", () => {
    assert.match(details, /rateCopyFromQuote\(selectedQuote/);
    assert.match(details, /fromNightlyRate/);
    assert.doesNotMatch(details, /subtotal\s*\+|subtotal\s*\*/);
    assert.match(page, /onChangeRoomRate=\{\(\) => setWorkflowStep\(0\)\}/);
    assert.match(details, /booking-details-change-room-rate/);
  });

  it("stay fields call page handlers; progression gate unchanged", () => {
    assert.match(details, /onArrivalChange/);
    assert.match(details, /onDepartureChange/);
    assert.match(details, /onNightsChange/);
    assert.match(details, /onKeepUnassigned/);
    assert.match(page, /canAdvanceFromBookingDetails/);
    assert.doesNotMatch(page, /canAdvanceFromBookingDetails[\s\S]{0,400}specialRequests/);
  });

  it("special requests persist; room preferences are UI-only", () => {
    assert.match(page, /specialRequests: specialRequests\.trim\(\)/);
    assert.match(details, /onSpecialRequestsChange/);
    assert.match(details, /room-preferences-ui-only/);
    assert.match(details, /not included in the reservation create payload/);
    assert.doesNotMatch(details, /setPreferences/);
  });

  it("legacy CreateReservationContext is not used in production create flow", () => {
    assert.doesNotMatch(page, /CreateReservationContext/);
    assert.doesNotMatch(page, /create-reservation-context/);
  });
});
