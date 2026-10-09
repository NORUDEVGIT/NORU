import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_GUEST_PAGE_SIZE,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
  canAdvanceFromGuestStayAvailability,
  guestPickerPageCount,
} from "./create-reservation-phase1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Create reservation 4-step workflow", () => {
  const page =
    readRel("../components/bookings/create-reservation-page.tsx") +
    readRel("../../../routes/restaurant/bookings/new.tsx");

  it("defines exactly four numbered workflow steps ending at Review & Confirm", () => {
    const match = page.match(/const CREATE_WORKFLOW_STEPS = \[([\s\S]*?)\] as const;/);
    assert.ok(match, "CREATE_WORKFLOW_STEPS");
    const block = match[1];
    assert.match(block, /guest-stay-availability/);
    assert.match(block, /Guest, Stay & Availability/);
    assert.match(block, /Continue to Booking Details/);
    assert.match(block, /Booking Details/);
    assert.match(block, /Policies & Guarantee/);
    assert.match(block, /Review & Confirm/);
    assert.doesNotMatch(block, /Search Availability/);
    assert.doesNotMatch(block, /id: "availability"/);
    assert.doesNotMatch(block, /Guest & Stay/);
    const idCount = (block.match(/id: "/g) ?? []).length;
    assert.equal(idCount, 4);
  });

  it("Step 1 desk places guest search, selected guest, and stay above availability", () => {
    assert.match(page, /create-reservation-step-guest-stay-availability/);
    assert.match(page, /CreateReservationStay/);
    assert.match(page, /title="Stay Information"/);
    const stay = readRel("../components/bookings/create-reservation-stay.tsx");
    assert.match(stay, /pms-operational-surface/);
    assert.match(stay, /PMS_OP_INPUT/);
    assert.match(page, /PMS_OP_SELECT_TRIGGER/);
    assert.match(page, /SelectTrigger/);
    assert.match(page, /CreateReservationRoomType/);
    assert.match(page, /CreateReservationGuest/);
    assert.match(page, /CreateReservationGuestSearch/);
    assert.match(page, /CreateReservationGuestSelected/);
    assert.match(page, /CreateReservationSelectedRoom/);
    assert.doesNotMatch(page, /CreateReservationSearchCriteria/);
    const section = page.slice(
      page.indexOf("guestStayAvailabilitySection"),
      page.indexOf("const bookingDetailsSection"),
    );
    const searchIdx = section.indexOf("CreateReservationGuestSearch");
    const selectedIdx = section.indexOf("CreateReservationGuestSelected");
    const stayIdx = section.indexOf("staySection");
    const roomIdx = section.indexOf("roomsAndRates");
    const selectedRoomIdx = section.indexOf("CreateReservationSelectedRoom");
    assert.ok(searchIdx >= 0 && selectedIdx > searchIdx);
    assert.ok(stayIdx > selectedIdx && roomIdx > stayIdx && selectedRoomIdx > roomIdx);
    const altIdx = section.indexOf("CreateReservationAlternatives");
    assert.ok(altIdx > roomIdx);
  });

  it("gates step 0 Continue on guest, stay, room, occupancy, and priced/unpriced rules", () => {
    assert.match(page, /canAdvanceFromGuestStayAvailability/);
    assert.match(page, /workflowStep === 0 && !canContinueGuestStayAvailability/);
    assert.match(page, /workflowStep === 1 && !canContinueBookingDetails/);
    assert.equal(
      canAdvanceFromGuestStayAvailability({
        datesValid: true,
        hasGuest: false,
        roomTypeId: "rt-1",
        occupancyOk: true,
        priced: true,
        canCreateUnpriced: false,
        available: 2,
      }),
      false,
    );
    assert.equal(
      canAdvanceFromGuestStayAvailability({
        datesValid: true,
        hasGuest: true,
        roomTypeId: "rt-1",
        occupancyOk: true,
        priced: true,
        canCreateUnpriced: false,
        available: 2,
      }),
      true,
    );
  });

  it("uses the same stepper for embedded and /restaurant/bookings/new", () => {
    assert.match(page, /CreateWorkflowStepper/);
    assert.match(page, /data-testid="create-reservation-stepper"/);
    assert.doesNotMatch(page, /embedded \? \(\s*stepSections/s);
  });

  it("guest search uses a bounded listGuests query without directory pagination", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    assert.equal(CREATE_RESERVATION_GUEST_SEARCH_LIMIT, 8);
    assert.equal(CREATE_RESERVATION_GUEST_PAGE_SIZE, 10);
    assert.match(guest, /limit: CREATE_RESERVATION_GUEST_SEARCH_LIMIT/);
    assert.match(guest, /offset: 0/);
    assert.match(guest, /listGuests/);
    assert.match(guest, /pms-operational-surface/);
    assert.match(guest, /PMS_OP_INPUT/);
    assert.doesNotMatch(guest, /PMS_OP_TABLE_SHELL/);
    assert.doesNotMatch(guest, /guest-picker-pagination/);
    assert.doesNotMatch(guest, /<thead/);
    const surface = readRel("./pms-operational-surface.ts");
    assert.match(surface, /PMS_OP_CONTROL_RADIUS/);
    assert.match(surface, /!rounded-\[6px\]/);
    assert.match(surface, /#CCCCCC/);
    assert.match(surface, /export const PMS_OP_INPUT =[\s\S]*?!rounded-\[6px\]/);
    assert.match(surface, /export const PMS_OP_SELECT_TRIGGER =[\s\S]*?!rounded-\[6px\]/);
    assert.match(surface, /guest-create-modal/);
    assert.match(guest, /Guest ID/);
    assert.match(guest, /profileNumber/);
    assert.doesNotMatch(guest, /Company/);
    assert.equal(guestPickerPageCount(25, 10), 3);
    assert.equal(guestPickerPageCount(0, 10), 1);
  });

  it("keeps package selection on the page and drops activations that are no longer bindable", () => {
    assert.match(
      page,
      /const \[packageActivationIds, setPackageActivationIds\] = useState<string\[\]>\(\[\]\)/,
    );
    assert.match(
      page,
      /selectedCreatePackageRows\(createPackageMerchandiseCards, packageActivationIds\)/,
    );
    assert.match(page, /current\.filter\(\(id\) => allowed\.has\(id\)\)/);
    assert.match(page, /canBindCreatePackage\(card\) && card\.activationId/);
    assert.doesNotMatch(page, /setPackageActivationIds\(\[\]\)/);
    assert.match(
      page,
      /packageActivationIds:\s*selectedCreatePackages\.length > 0/,
    );
  });
});
