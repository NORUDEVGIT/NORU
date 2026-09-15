import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_MODULE_DONE,
  CREATE_RESERVATION_PHASE1_COMPLETE,
} from "./create-reservation-phase1.ts";
import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION5,
  CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE,
  CREATE_RESERVATION_EMPTY_RATE_MANAGER,
  CREATE_RESERVATION_EMPTY_RATE_RECEPTIONIST,
  CREATE_RESERVATION_QUOTE_GATE_DOC,
  CREATE_RESERVATION_QUOTE_SERVER_COPY,
  CREATE_RESERVATION_SECTION5_ISSUE,
  CREATE_RESERVATION_SECTION5_LOCKED_NON_GOALS,
  CREATE_RESERVATION_SECTION5_MIGRATION,
  CREATE_RESERVATION_SECTION5_MIGRATION_REASON,
  CREATE_RESERVATION_SECTION5_SCOPE,
  CREATE_RESERVATION_SECTION5_TIP_AC_MAP,
  CREATE_RESERVATION_STALE_RATE_RULE,
  CREATE_RESERVATION_SUMMARY_UNPRICED,
  CREATE_RESERVATION_UNPRICED_BADGE,
  CREATE_RESERVATION_UNPRICED_PERMISSION_DOC,
  CREATE_RESERVATION_UNPRICED_REQUIRES_MANAGER,
  UNPRICED_PENDING_ROLES,
  assertCreateReservationPricing,
  canCreateUnpricedPending,
  canSubmitCreateReservation,
  createSubmitBlockCopy,
  fromNightlyRate,
  rateCatalogueCopy,
  resolveCreatePricingState,
  shouldClearStaleRatePlan,
  stickyPricingCopy,
  type CreateStayQuoteView,
} from "./create-reservation-phase1-section5.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR5 = Array.from({ length: 21 }, (_, i) => `AC-CR5-${i + 1}`);

const sampleQuote: CreateStayQuoteView = {
  ratePlanId: "plan-1",
  ratePlanCode: "BAR",
  ratePlanName: "Best Available",
  currency: "GBP",
  nights: 2,
  subtotal: 240,
  nightly: [
    { date: "2026-09-16", rate: 110 },
    { date: "2026-09-17", rate: 130 },
  ],
};

describe("Create Reservation Phase 1 Section 5 lock — AC-CR5-1…21", () => {
  it("locks AC-CR5-1…21 (Spec #140 / issue #141)", () => {
    assert.deepEqual([...CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION5], CR5);
    assert.equal(CREATE_RESERVATION_SECTION5_ISSUE, 141);
    assert.deepEqual(CREATE_RESERVATION_SECTION5_TIP_AC_MAP["plan-list-bind-sticky"], [
      "AC-CR5-1",
      "AC-CR5-2",
      "AC-CR5-3",
      "AC-CR5-4",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION5_TIP_AC_MAP["plan-unpriced-confirm"], [
      "AC-CR5-5",
      "AC-CR5-6",
      "AC-CR5-7",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION5_TIP_AC_MAP["plan-no-second-writer"], [
      "AC-CR5-8",
      "AC-CR5-9",
      "AC-CR5-10",
      "AC-CR5-11",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION5_TIP_AC_MAP["plan-revalidate-gates"], [
      "AC-CR5-12",
      "AC-CR5-13",
      "AC-CR5-14",
      "AC-CR5-15",
      "AC-CR5-16",
      "AC-CR5-17",
      "AC-CR5-18",
      "AC-CR5-19",
      "AC-CR5-20",
      "AC-CR5-21",
    ]);
  });

  it("AC-CR5-1 Rate list uses quoteStay for stay + room type on /restaurant/bookings/new", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    const functions = readRel("./rates.functions.ts");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /quoteStay/);
    assert.match(page, /\["stay-quotes", restaurantId, roomTypeId, arrival, departure\]/);
    assert.match(page, /CreateReservationRate/);
    assert.match(rate, /data-testid="create-reservation-rate"/);
    assert.match(rate, /data-testid="rate-plan-list"/);
    assert.match(functions, /export const quoteStay/);
    assert.match(functions, /price_hotel_stay/);
    assert.match(functions, /\.eq\("active", true\)/);
    assert.match(functions, /\.eq\("room_type_id", data\.roomTypeId\)/);
  });

  it("AC-CR5-2 Selected plan binds ratePlanId → _rate_plan_id on the same writer", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /createReservation/);
    assert.match(page, /ratePlanId: ratePlanId \|\| null/);
    assert.match(functions, /export const createReservation/);
    assert.match(functions, /ratePlanId: idSchema\.nullable\(\)\.optional\(\)/);
    assert.match(functions, /browser totals are ignored/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(functions, /_rate_plan_id: \(data\.ratePlanId \?\? null\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(functions, /insert\("hotel_reservations"\)/);
  });

  it("AC-CR5-3 Sticky shows honest server nightly/total from the same quoteStay object", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    assert.match(page, /data-testid="create-reservation-summary"/);
    assert.match(page, /data-testid="summary-rate"/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /selectedQuote/);
    assert.match(page, /pricingState\.quote\.subtotal/);
    assert.match(page, /selectedQuote\.quote/);
    assert.match(rate, /row\.quote\.subtotal/);
    assert.match(rate, /selected\.quote\.subtotal/);
    assert.equal(fromNightlyRate(sampleQuote), 110);
    const priced = resolveCreatePricingState({
      datesValid: true,
      roomTypeId: "rt-1",
      loading: false,
      error: false,
      selectedQuote: { quote: sampleQuote },
    });
    assert.equal(priced.kind, "priced");
    if (priced.kind === "priced") assert.equal(priced.quote.subtotal, 240);
  });

  it("AC-CR5-4 Browser totals are ignored as authority — no second calculator", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    assert.match(functions, /browser totals are ignored/);
    assert.match(rate, /CREATE_RESERVATION_QUOTE_SERVER_COPY/);
    assert.match(CREATE_RESERVATION_QUOTE_SERVER_COPY, /Browser totals are ignored/);
    assert.doesNotMatch(page, /stickySummaryTotal|fakeTotal|inventedTotal|clientSubtotal/);
    assert.doesNotMatch(page, /quote\.nightly\.reduce|sumNightly|adr \*/);
    assert.doesNotMatch(rate, /quote\.nightly\.reduce|sumNightly/);
  });

  it("AC-CR5-5 Unpriced is Pending + owner|manager only, with UI honesty", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.deepEqual([...UNPRICED_PENDING_ROLES], ["owner", "manager"]);
    assert.equal(canCreateUnpricedPending("owner"), true);
    assert.equal(canCreateUnpricedPending("manager"), true);
    assert.equal(canCreateUnpricedPending("receptionist"), false);
    assert.match(CREATE_RESERVATION_UNPRICED_PERMISSION_DOC, /owner\|manager/);
    assert.match(CREATE_RESERVATION_UNPRICED_PERMISSION_DOC, /Receptionist must select a quoted plan/);
    assert.match(rate, /CREATE_RESERVATION_UNPRICED_BADGE/);
    assert.equal(CREATE_RESERVATION_UNPRICED_BADGE, "Unpriced");
    assert.match(page, /canCreateUnpricedPending/);
    assert.match(page, /summary-no-fake-total|summary-pricing-state/);
    assert.match(functions, /assertCreateReservationPricing/);
    assert.throws(
      () => assertCreateReservationPricing({ role: "receptionist", status: "pending", ratePlanId: null }),
      /quoted rate plan is required/,
    );
    assert.doesNotThrow(() =>
      assertCreateReservationPricing({ role: "manager", status: "pending", ratePlanId: null }),
    );
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "pending",
        priced: false,
        canCreateUnpriced: true,
      }),
      true,
    );
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "pending",
        priced: false,
        canCreateUnpriced: false,
      }),
      false,
    );
  });

  it("AC-CR5-6 Confirmed without a successful quote is blocked", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "confirmed",
        priced: false,
        canCreateUnpriced: true,
      }),
      false,
    );
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "confirmed",
        priced: true,
        canCreateUnpriced: false,
      }),
      true,
    );
    assert.equal(
      createSubmitBlockCopy({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "confirmed",
        priced: false,
        canCreateUnpriced: true,
      }),
      CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE,
    );
    assert.throws(
      () => assertCreateReservationPricing({ role: "owner", status: "confirmed", ratePlanId: null }),
      /quoted rate plan is required to create a confirmed stay/,
    );
    assert.doesNotThrow(() =>
      assertCreateReservationPricing({ role: "receptionist", status: "confirmed", ratePlanId: "plan-1" }),
    );
    assert.match(page, /canSubmitCreateReservation/);
    assert.match(page, /create-as-status/);
    assert.doesNotMatch(page, /Guarantee and confirm|Send confirmation/);
    assert.match(functions, /assertCreateReservationPricing/);
  });

  it("AC-CR5-7 Unpriced sticky must not show 0.00 as a real stay total", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const unpriced = resolveCreatePricingState({
      datesValid: true,
      roomTypeId: "rt-1",
      loading: false,
      error: false,
      selectedQuote: null,
    });
    assert.equal(unpriced.kind, "unpriced");
    assert.match(stickyPricingCopy(unpriced), /unpriced/i);
    assert.doesNotMatch(stickyPricingCopy(unpriced), /0\.00/);
    assert.match(CREATE_RESERVATION_SUMMARY_UNPRICED, /No stay total is shown/);
    assert.doesNotMatch(CREATE_RESERVATION_SUMMARY_UNPRICED, /0\.00/);
    const loading = resolveCreatePricingState({
      datesValid: true,
      roomTypeId: "rt-1",
      loading: true,
      error: false,
      selectedQuote: null,
    });
    assert.equal(loading.kind, "loading");
    assert.doesNotMatch(stickyPricingCopy(loading), /0\.00/);
    assert.match(page, /summary-no-fake-total/);
    assert.doesNotMatch(page, /money\(0\)|stay total 0\.00|fake 0\.00/i);
  });

  it("AC-CR5-8 No second pricing writer — walk-in remains a mode of the same writer", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const shell = readRel("./front-office-shell.ts");
    assert.match(page, /createReservation/);
    assert.match(functions, /export const createReservation/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(dialogs, /createReservation/);
    assert.match(shell, /walk_in[\s\S]*createReservation/);
    assert.doesNotMatch(page, /createPricedReservation|create_rate_reservation|quoteAndCreate/);
    assert.doesNotMatch(dialogs, /createWalkInReservation|create_walk_in_reservation/);
    assert.doesNotMatch(functions, /create_hotel_reservation_walk_in|price_hotel_stay_browser/);
  });

  it("AC-CR5-9 Fixed Rate is OUT — no fake Fixed Rate control", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    const helpers = readRel("./create-reservation-phase1-section5.ts");
    assert.match(helpers, /Fixed Rate \/ create adjustment \/ RTC = OUT/);
    assert.doesNotMatch(page, /Fixed Rate|fixedRate|manualRateOverride|overrideAmount/);
    assert.doesNotMatch(rate, /Fixed Rate|fixedRate|manualAmount/);
  });

  it("AC-CR5-10 No create-time rate adjustment amount/% and no RTC invented", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    const functions = readRel("./reservations.functions.ts");
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.doesNotMatch(page, /adjustmentPercent|rateAdjustment|roomTypeCharged|rtcRoomType/);
    assert.doesNotMatch(rate, /adjustmentPercent|rtc /i);
    assert.doesNotMatch(createFn, /_adjustment|_rtc|room_type_charged/);
  });

  it("AC-CR5-11 No invented LIVE RMS / OTA / commission / yield engine", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    const helpers = readRel("./create-reservation-phase1-section5.ts");
    const functions = readRel("./rates.functions.ts");
    assert.match(helpers, /LIVE RMS \/ OTA \/ commission \/ yield engine/);
    assert.match(page, /quoteStay/);
    assert.match(functions, /price_hotel_stay/);
    assert.doesNotMatch(page, /channel manager|rms yield|commission settlement|ota rate/i);
    assert.doesNotMatch(rate, /listOtaRates|getRmsYield|inventCommission/);
    assert.doesNotMatch(functions, /rms_yield|ota_commission|yield_engine/);
  });

  it("AC-CR5-12 Date or room-type change revalidates; stale priced selection is not kept", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_STALE_RATE_RULE, "clear-on-type-and-invalid-stay");
    assert.match(page, /setRatePlanId\(""\)/);
    assert.match(page, /shouldClearStaleRatePlan/);
    assert.match(page, /handleArrivalChange/);
    assert.match(page, /selectRoomType/);
    assert.equal(
      shouldClearStaleRatePlan({
        ratePlanId: "plan-1",
        quotesReady: true,
        quotes: [{ planId: "plan-1", hasQuote: false }],
      }),
      true,
    );
    assert.equal(
      shouldClearStaleRatePlan({
        ratePlanId: "plan-1",
        quotesReady: true,
        quotes: [{ planId: "plan-1", hasQuote: true }],
      }),
      false,
    );
    assert.equal(
      shouldClearStaleRatePlan({
        ratePlanId: "plan-1",
        quotesReady: false,
        quotes: [],
      }),
      false,
    );
  });

  it("AC-CR5-13 Empty catalogue and restriction-unavailable plans are honest", () => {
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    assert.equal(
      rateCatalogueCopy({
        datesValid: false,
        roomTypeId: "",
        loading: false,
        error: false,
        quoteCount: 0,
        canCreateUnpriced: true,
      }),
      "Pick dates and a room type to see rates.",
    );
    assert.equal(
      rateCatalogueCopy({
        datesValid: true,
        roomTypeId: "rt-1",
        loading: false,
        error: false,
        quoteCount: 0,
        canCreateUnpriced: true,
      }),
      CREATE_RESERVATION_EMPTY_RATE_MANAGER,
    );
    assert.equal(
      rateCatalogueCopy({
        datesValid: true,
        roomTypeId: "rt-1",
        loading: false,
        error: false,
        quoteCount: 0,
        canCreateUnpriced: false,
      }),
      CREATE_RESERVATION_EMPTY_RATE_RECEPTIONIST,
    );
    assert.match(rate, /data-rate-available=\{row\.quote \? "priced" : "unavailable"\}/);
    assert.match(rate, /disabled=\{disabled\}/);
    assert.match(rate, /row\.unavailableReason/);
    assert.doesNotMatch(rate, /the stay can be booked without pricing/);
  });

  it("AC-CR5-14 Existing create gates preserved; quoteStay allows reservation managers", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const rates = readRel("./rates.functions.ts");
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(functions, /requireReservationManager/);
    const quoteStart = rates.indexOf("export const quoteStay");
    const quoteFn = rates.slice(quoteStart, rates.indexOf("export const repriceReservation"));
    assert.match(quoteFn, /requireReservationManager/);
    assert.doesNotMatch(quoteFn, /requireRateManager/);
    assert.match(CREATE_RESERVATION_QUOTE_GATE_DOC, /requireReservationManager/);
    assert.match(CREATE_RESERVATION_QUOTE_GATE_DOC, /receptionist/);
    assert.doesNotMatch(page, /new entitlement|requirePackage\("create-reservation"\)/);
    assert.doesNotMatch(functions, /unpriced_entitlement|rate_create_rls/);
  });

  it("AC-CR5-15 Room assign / Guarantee product / packages / email are not expanded", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /Room assignment \(optional\)/);
    assert.match(page, /const UNASSIGNED = "unassigned"/);
    assert.match(page, /the stay can still be booked and assigned later/);
    assert.doesNotMatch(page, /forceRoomAssign|requiredRoomId|Guarantee method|Send confirmation email/);
    assert.doesNotMatch(page, /packagePicker|addPackage|emailConfirmation|smsConfirmation/);
    assert.match(CREATE_RESERVATION_SECTION5_SCOPE, /later sections/);
  });

  it("AC-CR5-16 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1-section5.ts");
    const section1 = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(section1, /Waves 1–5 \+ GE1–GE3 stay closed/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
  });

  it("AC-CR5-17 Section 5 does not claim Phase 1 or Create Reservation DONE", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(CREATE_RESERVATION_SECTION5_SCOPE, /Section 5 is Rate \+ sticky pricing/);
    assert.match(CREATE_RESERVATION_SECTION5_SCOPE, /later sections/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
    assert.match(page, /CREATE_RESERVATION_SECTION5_SCOPE/);
  });

  it("AC-CR5-18 Locked non-goals in §4 are absent", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const rate = readRel("../components/bookings/create-reservation-rate.tsx");
    const helpers = readRel("./create-reservation-phase1-section5.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION5_LOCKED_NON_GOALS.length, 12);
    assert.match(helpers, /Fixed Rate \/ manual create override/);
    assert.match(helpers, /fake sticky totals \/ browser math as SoT/);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|Fixed Rate/i);
    assert.doesNotMatch(rate, /channel manager|yield engine|manual override/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
  });

  it("AC-CR5-19 Migration is NONE; capability-only; no RLS model change", () => {
    const helpers = readRel("./create-reservation-phase1-section5.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION5_MIGRATION, "NONE");
    assert.match(CREATE_RESERVATION_SECTION5_MIGRATION_REASON, /already exist/);
    assert.match(CREATE_RESERVATION_SECTION5_MIGRATION_REASON, /Flag Abel: NOT required/);
    assert.match(helpers, /Migration for this section: NONE/);
    assert.match(CREATE_RESERVATION_UNPRICED_PERMISSION_DOC, /no RLS/);
    const drizzleDir = join(here, "../../../../drizzle/migrations");
    const supabaseDir = join(here, "../../../../supabase/migrations");
    for (const file of readdirSync(drizzleDir)) {
      assert.doesNotMatch(file, /create.reservation.phase1.section5|cr5.section5|unpriced_permission/i);
    }
    if (existsSync(supabaseDir)) {
      for (const file of readdirSync(supabaseDir)) {
        assert.doesNotMatch(file, /create.reservation.phase1.section5|cr5.section5|unpriced_permission/i);
      }
    }
    assert.doesNotMatch(functions, /create policy|alter policy|enable row level security/i);
  });

  it("AC-CR5-20 Additive expansion of existing /restaurant/bookings/new — no second product", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.match(page, /CreateReservationRate/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/pms\/reservations\/new"\)/);
    assert.doesNotMatch(page, /legacy chrome|Fixed Rate LIVE/i);
  });

  it("AC-CR5-21 Modern sticky may show Rate Code / Rate & Total — no Fixed Rate LIVE claim", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /data-testid="summary-rate"/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /Rate & Total|Stay total/);
    assert.doesNotMatch(page, /Fixed Rate LIVE|legacy Individual create chrome/i);
  });
});
