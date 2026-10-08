import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_GUEST_PAGE_SIZE,
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

  it("combines step 0 as Stay request, room/rate availability, then guest", () => {
    assert.match(page, /create-reservation-step-guest-stay-availability/);
    assert.match(page, /CreateReservationStay/);
    const stay = readRel("../components/bookings/create-reservation-stay.tsx");
    assert.match(stay, /pms-operational-surface/);
    assert.match(stay, /PMS_OP_INPUT/);
    assert.match(page, /PMS_OP_SELECT_TRIGGER/);
    assert.match(page, /SelectTrigger/);
    assert.match(page, /CreateReservationRoomType/);
    assert.match(page, /CreateReservationGuest/);
    assert.doesNotMatch(page, /CreateReservationSearchCriteria/);
    const section = page.slice(
      page.indexOf("guestStayAvailabilitySection"),
      page.indexOf("const bookingDetailsSection"),
    );
    const stayIdx = section.indexOf("staySection");
    const roomIdx = section.indexOf("roomSection");
    const guestIdx = section.indexOf("CreateReservationGuest");
    assert.ok(stayIdx >= 0 && roomIdx > stayIdx && guestIdx > roomIdx);
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

  it("guest picker uses server pagination with page size 10", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    assert.equal(CREATE_RESERVATION_GUEST_PAGE_SIZE, 10);
    assert.match(guest, /limit: CREATE_RESERVATION_GUEST_PAGE_SIZE/);
    assert.match(guest, /pms-operational-surface/);
    assert.match(guest, /PMS_OP_TABLE_SHELL/);
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
});
