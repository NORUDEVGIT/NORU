import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
  canAdvanceFromGuestStayAvailability,
} from "./create-reservation-phase1.ts";
import {
  availabilitySearchIsCurrent,
  CREATE_RESERVATION_AVAILABILITY_IDLE,
  CREATE_RESERVATION_AVAILABILITY_STALE,
  type AvailabilitySearchCriteria,
} from "./create-reservation-phase1-section4.ts";
import { rateCopyFromQuote } from "./create-reservation-phase1-section5.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Create reservation Step 1 desk layout", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const guest = readRel("../components/bookings/create-reservation-guest.tsx");
  const stay = readRel("../components/bookings/create-reservation-stay.tsx");
  const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
  const rate = readRel("../components/bookings/create-reservation-rate.tsx");
  const selectedRoom = readRel("../components/bookings/create-reservation-selected-room.tsx");
  const alternatives = readRel("../components/bookings/create-reservation-alternatives.tsx");
  const filters = readRel("../components/bookings/create-reservation-availability-filters.tsx");

  const step = page.slice(
    page.indexOf("const guestStayAvailabilitySection"),
    page.indexOf("const bookingDetailsSection"),
  );

  it("renders the five Step 1 panels in desk order", () => {
    assert.match(guest, /Guest Search/);
    assert.match(guest, /Selected Guest/);
    assert.match(page, /title="Stay Information"/);
    assert.match(roomType, /Availability & Room Selection/);
    assert.match(selectedRoom, /Selected Room & Rate/);
    assert.match(step, /items-stretch/);
    assert.match(step, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)_minmax\(0,1\.3fr\)\]/);
    assert.match(guest, /data-testid="guest-search-panel"/);
    assert.match(guest, /data-testid="selected-guest-panel"/);
    assert.match(guest, /h-full/);
    assert.match(stay, /h-full/);
    assert.match(step, /className="h-full min-w-0 md:col-span-2 lg:col-span-1"/);
    assert.match(step, /xl:grid-cols-\[minmax\(0,1fr\)_300px\]/);
    assert.match(step, /grid-cols-1/);
    const searchIdx = step.indexOf("CreateReservationGuestSearch");
    const selectedIdx = step.indexOf("CreateReservationGuestSelected");
    const stayIdx = step.indexOf("{staySection}");
    const roomIdx = step.indexOf("{roomsAndRates}");
    const summaryIdx = step.indexOf("CreateReservationSelectedRoom");
    assert.ok(searchIdx >= 0 && selectedIdx > searchIdx);
    assert.ok(stayIdx > selectedIdx && roomIdx > stayIdx && summaryIdx > roomIdx);
  });

  it("guest search is a bounded listGuests match list without a table or pagination", () => {
    assert.equal(CREATE_RESERVATION_GUEST_SEARCH_LIMIT, 8);
    assert.match(guest, /listGuests/);
    assert.match(guest, /limit: CREATE_RESERVATION_GUEST_SEARCH_LIMIT/);
    assert.match(guest, /offset: 0/);
    assert.match(guest, /CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS/);
    assert.match(guest, /enabled: listEnabled && !guest && trimmedSearch\.length > 0/);
    assert.match(guest, /data-testid="guest-search-results"/);
    assert.match(guest, /Searching guests…/);
    assert.match(guest, /No matching guests found\./);
    assert.match(guest, /onGuestChange\(toPickedGuest\(row\)\)/);
    assert.match(guest, /Create New Guest/);
    assert.match(guest, /GuestFormDialog/);
    assert.match(guest, /onSaved=\{\(guestId\) => void selectById\(guestId\)\}/);
    assert.doesNotMatch(guest, /guest-picker-pagination/);
    assert.doesNotMatch(guest, /<thead/);
    assert.doesNotMatch(guest, /PMS_OP_TABLE_SHELL/);
    assert.doesNotMatch(guest, /Previous/);
    assert.doesNotMatch(guest, /Page \{page\} of/);
  });

  it("selected guest reuses the page guest and Change Guest only clears that guest", () => {
    assert.match(guest, /data-testid="selected-guest-card"/);
    assert.match(guest, /data-testid="selected-guest-empty"/);
    assert.match(guest, /No guest selected/);
    assert.match(guest, /Select a guest to continue/);
    assert.match(guest, /data-testid="view-guest"/);
    assert.match(guest, /View Profile/);
    assert.match(guest, /data-testid="change-guest"/);
    assert.match(guest, /onGuestChange\(null\)/);
    assert.match(guest, /searchInputRef\.current\?\.focus\(\)/);
    assert.match(step, /onGuestChange=\{setGuest\}/);
    assert.doesNotMatch(guest, /setRatePlanId|setRoomTypeId|setArrival|onArrivalChange/);
  });

  it("stay information keeps the existing stay handlers and operational controls", () => {
    assert.match(stay, /PMS_OP_INPUT/);
    assert.match(stay, /PMS_OP_LABEL/);
    assert.match(stay, /PMS_OP_TEXTAREA/);
    assert.match(stay, /Arrival Date/);
    assert.match(stay, /Departure Date/);
    assert.match(stay, /Special Requirement/);
    assert.match(stay, /data-testid="stay-special-requests"/);
    assert.match(page, /onArrivalChange=\{handleArrivalChange\}/);
    assert.match(page, /onDepartureChange=\{handleDepartureChange\}/);
    assert.match(page, /onNightsChange=\{handleNightsChange\}/);
    assert.match(page, /onSpecialRequestsChange=\{setSpecialRequests\}/);
    assert.match(page, /Preferred Room Type/);
    assert.match(page, /Rate Preference/);
    assert.match(page, /PMS_OP_SELECT_TRIGGER/);
    assert.match(stay, /grid-cols-2 gap-x-2 gap-y-2 @min-\[24rem\]:grid-cols-3/);
    assert.match(stay, /!h-9/);
    assert.match(stay, /\{actions \?/);
    const arrivalIdx = stay.indexOf("Arrival Date");
    const departureIdx = stay.indexOf("Departure Date");
    const nightsIdx = stay.indexOf(">Nights<");
    const roomsIdx = stay.indexOf(">Rooms<");
    const adultsIdx = stay.indexOf(">Adults<");
    const childrenIdx = stay.indexOf(">Children<");
    const infantsIdx = stay.indexOf(">Infants<");
    const extrasIdx = stay.indexOf("{requestExtras}");
    const specialIdx = stay.indexOf("Special Requirement");
    assert.ok(
      arrivalIdx < departureIdx &&
        departureIdx < nightsIdx &&
        nightsIdx < roomsIdx &&
        roomsIdx < adultsIdx &&
        adultsIdx < childrenIdx &&
        childrenIdx < infantsIdx &&
        infantsIdx < extrasIdx &&
        extrasIdx < specialIdx,
    );
  });

  it("treats Any as an empty room-type and rate preference, not a fake id", () => {
    const preferences = page.slice(
      page.indexOf("const preferenceExtras"),
      page.indexOf("const staySection"),
    );
    assert.match(preferences, /<SelectItem value="any">Any<\/SelectItem>/);
    assert.equal(preferences.match(/<SelectItem value="any">Any<\/SelectItem>/g)?.length, 2);
    assert.match(preferences, /setSearchRoomTypeFilter\(value === "any" \? "" : value\)/);
    assert.match(preferences, /setRatePreference\(value === "any" \? "" : value\)/);
    assert.match(preferences, /value=\{searchRoomTypeFilter \|\| "any"\}/);
    assert.match(preferences, /value=\{ratePreference \|\| "any"\}/);
    assert.doesNotMatch(preferences, /selectRoomType|setRatePlanId|setRoomTypeId/);
  });

  it("availability still reads getRoomTypeAvailability and quoteStay without new pricing math", () => {
    assert.match(page, /getRoomTypeAvailability/);
    assert.match(page, /quoteStay/);
    assert.match(roomType, /data-testid="create-reservation-room-type"/);
    assert.match(roomType, /row\.coverUrl/);
    assert.match(rate, /data-testid="rate-plan-list"/);
    assert.match(rate, /row\.plan\.name \|\| row\.plan\.code/);
    assert.doesNotMatch(rate, /row\.cancellationLabel/);
    assert.doesNotMatch(rate, /row\.breakfastLabel/);
    assert.doesNotMatch(rate, /CREATE_RESERVATION_QUOTE_SERVER_COPY/);
    assert.match(rate, /money\(row\.quote\.subtotal\)/);
    assert.doesNotMatch(rate, /quote\.nightly\.reduce|sumNightly/);
    assert.match(page, /onSelect=\{selectRoomType\}/);
    assert.match(page, /selectRoomAndRate\(type, planId\)/);
  });

  it("selected room summary reflects selectedRoomType and selectedQuote via rateCopyFromQuote", () => {
    assert.match(selectedRoom, /rateCopyFromQuote\(selectedQuote, money\)/);
    assert.match(selectedRoom, /rateCopy\.totalAmount/);
    assert.match(selectedRoom, /rateCopy\.ratePerNight/);
    assert.match(selectedRoom, /includedItemsLabel\(selectedQuote\)/);
    assert.match(selectedRoom, /No inclusions listed/);
    assert.match(selectedRoom, /Breakfast included/);
    assert.match(selectedRoom, /Cancellation fee may apply/);
    assert.match(selectedRoom, /displayCancellation\(/);
    assert.match(selectedRoom, /data-testid="selected-room-rate-empty"/);
    assert.match(selectedRoom, /Select a room and rate from availability/);
    assert.match(step, /selectedRoomType=\{selectedMeta\}/);
    assert.match(step, /selectedQuote=\{selectedQuote\}/);
    assert.doesNotMatch(selectedRoom, /fromNightlyRate|nightly\.reduce|subtotal\s*\*|nights\s*\*/);
    const priced = rateCopyFromQuote(
      {
        plan: {
          id: "bar",
          code: "BAR",
          name: "Best Available Rate",
          description: null,
          validFrom: null,
          validTo: null,
        },
        quote: {
          ratePlanId: "bar",
          ratePlanCode: "BAR",
          ratePlanName: "Best Available Rate",
          currency: "ETB",
          nights: 1,
          subtotal: 1500,
          nightly: [{ date: "2026-10-10", rate: 1500 }],
        },
        cancellationLabel: "Free cancellation",
        breakfastLabel: "Breakfast included",
        refundabilityLabel: "—",
        unavailableReason: null,
      },
      (value) => `ETB ${value.toFixed(2)}`,
    );
    assert.equal(priced.totalAmount, "ETB 1500.00");
    assert.equal(priced.ratePerNight, "ETB 1500.00");
    assert.doesNotMatch(priced.totalAmount, /ETB[\s\S]*ETB/);
  });

  it("retires the global collapsible reservation summary beside the create steps", () => {
    assert.match(page, /data-testid="create-reservation-workspace"/);
    assert.doesNotMatch(page, /data-testid="create-reservation-summary"/);
    assert.doesNotMatch(page, /Collapse summary/);
    assert.doesNotMatch(page, /summaryOpen/);
    assert.doesNotMatch(page, /xl:w-80|xl:w-\[320px\]|flex-\[3\]/);
    assert.match(step, /CreateReservationSelectedRoom/);
    assert.doesNotMatch(page, /<aside/);
  });

  it("availability results use a summary header, filter sidebar, and room blocks", () => {
    assert.match(roomType, /data-testid="availability-header"/);
    assert.match(roomType, /AvailabilityFilterSidebar/);
    assert.match(roomType, /xl:grid-cols-\[210px_minmax\(0,1fr\)\]/);
    assert.match(
      roomType,
      /lg:grid-cols-\[minmax\(13\.5rem,17rem\)_minmax\(8\.75rem,11rem\)_minmax\(0,1fr\)\]/,
    );
    assert.match(roomType, /data-testid="availability-room-block"/);
    assert.doesNotMatch(roomType, /View Room Details/);
    assert.match(roomType, /amenityLabels\.join/);
    assert.match(rate, /w-36/);
    assert.match(filters, /data-testid="availability-filters"/);
    assert.match(filters, /Clear All/);
    assert.match(filters, /Room Type/);
    assert.match(filters, /Rate Plan/);
    assert.match(filters, /amenities\.length > 0/);
    assert.match(filters, /Amenities/);
    assert.match(roomType, /setExcludedRoomTypeIds\(\[\]\)/);
    assert.match(roomType, /setExcludedRatePlanIds\(\[\]\)/);
    assert.match(roomType, /No rooms match the selected filters\./);
    assert.match(roomType, /Current selected room\/rate is hidden by filters\./);
    assert.match(roomType, /data-testid="availability-filter-empty"/);
    assert.doesNotMatch(roomType, /ratePlanId|forcedRatePlan/);
    assert.match(rate, /role="radio"/);
    assert.match(rate, /useExcludedRatePlanIds/);
    assert.match(rate, /No rates match the selected filters\./);
    assert.match(rate, /onClick=\{\(\) => onSelect\(isSelected \? "" : row\.plan\.id\)\}/);
    assert.match(page, /ratePlanOptions=\{ratePreferenceOptions\}/);
    assert.match(page, /selectedPlanId=\{ratePlanId\}/);
    assert.match(page, /onSelect=\{selectRoomType\}/);
    assert.match(page, /selectRoomAndRate\(type, planId\)/);
  });

  it("alternative options sit under availability only when nothing is bookable", () => {
    assert.match(alternatives, /data-testid="create-reservation-alternatives"/);
    assert.match(step, /noSuitableAvailability \? <CreateReservationAlternatives \/> : null/);
    assert.match(page, /availability\.every\(\(row\) => row\.available <= 0\)/);
    const altIdx = step.indexOf("CreateReservationAlternatives");
    const roomIdx = step.indexOf("{roomsAndRates}");
    const guestIdx = step.indexOf("CreateReservationGuestSearch");
    assert.ok(guestIdx >= 0 && guestIdx < roomIdx && altIdx > roomIdx);
  });

  it("checks availability only after an explicit commit and hides stale results", () => {
    assert.equal(
      CREATE_RESERVATION_AVAILABILITY_IDLE,
      "Check availability to view rooms and rates.",
    );
    assert.equal(
      CREATE_RESERVATION_AVAILABILITY_STALE,
      "Stay details changed. Check availability again.",
    );
    assert.match(page, /data-testid="check-availability"/);
    assert.match(page, /disabled=\{!datesValid\}/);
    assert.match(page, /Check Availability/);
    const check = page.slice(
      page.indexOf('data-testid="check-availability"'),
      page.indexOf("Check Availability"),
    );
    assert.doesNotMatch(check, /guest/);
    assert.match(page, /function commitAvailabilitySearch\(\)/);
    assert.match(page, /setAvailabilitySearchCommitted\(/);
    assert.match(
      page,
      /availabilitySearchIsCurrent\(availabilitySearchCommitted, availabilityDraft\)/,
    );
    assert.match(
      page,
      /queryKey: \["room-type-availability", restaurantId, arrival, departure\],\s*queryFn:[\s\S]*?enabled: canManage && datesValid && availabilitySearchActive/,
    );
    assert.match(
      page,
      /enabled: canManage && datesValid && !!roomTypeId && availabilitySearchActive/,
    );
    assert.match(
      page,
      /const availability = availabilitySearchActive \? \(availabilityQuery\.data \?\? \[\]\) : \[\]/,
    );
    assert.match(page, /CREATE_RESERVATION_AVAILABILITY_IDLE/);
    assert.match(page, /CREATE_RESERVATION_AVAILABILITY_STALE/);
    assert.match(roomType, /data-testid="availability-status"/);
    assert.match(roomType, /CREATE_RESERVATION_CHECKING_AVAILABILITY/);
    assert.match(page, /availabilitySearchActive &&/);
    assert.match(page, /availability\.every\(\(row\) => row\.available <= 0\)/);
    assert.match(selectedRoom, /data-testid="selected-room-rate-status"/);
    assert.match(selectedRoom, /data-testid="selected-room-rate-empty"/);
    const statusIdx = selectedRoom.indexOf('data-testid="selected-room-rate-status"');
    const totalIdx = selectedRoom.indexOf('data-testid="selected-room-stay-total"');
    assert.ok(statusIdx >= 0 && totalIdx > statusIdx);
  });

  it("keeps the Step 1 continue gate", () => {
    assert.match(page, /availabilitySearchActive &&/);
    assert.match(page, /\(!searchRoomTypeFilter \|\| roomTypeId === searchRoomTypeFilter\)/);
    assert.match(page, /\(!ratePreference \|\| ratePlanId === ratePreference\)/);
    assert.match(page, /canAdvanceFromGuestStayAvailability/);
    assert.match(page, /workflowStep === 0 && !canContinueGuestStayAvailability/);
    assert.match(page, /Continue to Booking Details/);
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
});

describe("availability search commit", () => {
  const draft: AvailabilitySearchCriteria = {
    arrival: "2026-10-10",
    departure: "2026-10-12",
    rooms: 1,
    adults: 2,
    children: 0,
    infants: 0,
    roomTypePreference: "",
    ratePreference: "",
  };

  it("stays inactive until a search is committed for the current criteria", () => {
    assert.equal(availabilitySearchIsCurrent(null, draft), false);
    assert.equal(availabilitySearchIsCurrent(draft, draft), true);
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, arrival: "2026-10-11" }), false);
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, departure: "2026-10-13" }), false);
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, rooms: 2 }), false);
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, adults: 3 }), false);
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, children: 1 }), false);
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, infants: 1 }), false);
    assert.equal(
      availabilitySearchIsCurrent(draft, { ...draft, roomTypePreference: "rt-1" }),
      false,
    );
    assert.equal(availabilitySearchIsCurrent(draft, { ...draft, ratePreference: "bar" }), false);
    assert.equal(availabilitySearchIsCurrent({ ...draft, roomTypePreference: "" }, draft), true);
  });
});
