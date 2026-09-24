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
  CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE,
  assertCreateReservationPricing,
  canSubmitCreateReservation,
} from "./create-reservation-phase1-section5.ts";
import { CREATE_RESERVATION_FO_WALKIN_ROOM_REQUIRED } from "./create-reservation-phase1-section6.ts";
import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION7,
  CREATE_RESERVATION_CHANNEL_ORIGIN_RESIDUAL,
  CREATE_RESERVATION_CONFIRM_LABEL,
  CREATE_RESERVATION_CONFIRM_MASTER_REQUIRED,
  CREATE_RESERVATION_FO_WALKIN_GUARANTEE_REQUIRED,
  CREATE_RESERVATION_GUARANTEE_REQUIRED,
  CREATE_RESERVATION_OPEN_RESERVATION_LABEL,
  CREATE_RESERVATION_PENDING_LABEL,
  CREATE_RESERVATION_PERSIST_HELD_COPY,
  CREATE_RESERVATION_PRINT_LABEL,
  CREATE_RESERVATION_SECTION7_APPLY,
  CREATE_RESERVATION_SECTION7_NONPROD_DB,
  CREATE_RESERVATION_SECTION7_PROD_DB,
  CREATE_RESERVATION_SECTION7_ISSUE,
  CREATE_RESERVATION_SECTION7_LOCKED_NON_GOALS,
  CREATE_RESERVATION_SECTION7_MIGRATION,
  CREATE_RESERVATION_SECTION7_MIGRATION_REASON,
  CREATE_RESERVATION_SECTION7_PENDING_PERSIST,
  CREATE_RESERVATION_SECTION7_PERMISSION_DOC,
  CREATE_RESERVATION_SECTION7_PROGRAMME_RULE,
  CREATE_RESERVATION_SECTION7_SCOPE,
  CREATE_RESERVATION_SECTION7_SPEC_PR,
  CREATE_RESERVATION_SECTION7_SUCCESS_CHROME,
  CREATE_RESERVATION_SECTION7_TIP_AC_MAP,
  CREATE_RESERVATION_SOURCE_SEGMENT_REQUIRED,
  assertCreateReservationSection7,
  canSubmitConfirmReservation,
  canSubmitPendingReservation,
  createConfirmBlockCopy,
  guaranteeCatalogueWarning,
  paymentTermsReviewCopy,
  requiredMasterForConfirm,
  resolveGuaranteeMethodOptions,
  section7PersistApplied,
} from "./create-reservation-phase1-section7.ts";
import { FALLBACK_CASHIERING_TENDERS } from "./pms-polish1-payment-admin.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR7 = Array.from({ length: 24 }, (_, i) => `AC-CR7-${i + 1}`);

describe("Create Reservation Phase 1 Section 7 lock — AC-CR7-1…24", () => {
  it("locks AC-CR7-1…24 (Spec #150 / issue #153)", () => {
    assert.deepEqual([...CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION7], CR7);
    assert.equal(CREATE_RESERVATION_SECTION7_ISSUE, 153);
    assert.equal(CREATE_RESERVATION_SECTION7_SPEC_PR, 150);
    assert.deepEqual(CREATE_RESERVATION_SECTION7_TIP_AC_MAP["plan-review-sticky"], [
      "AC-CR7-1",
      "AC-CR7-17",
      "AC-CR7-22",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION7_TIP_AC_MAP["plan-guarantee-confirm"], [
      "AC-CR7-2",
      "AC-CR7-3",
      "AC-CR7-4",
      "AC-CR7-5",
      "AC-CR7-7",
      "AC-CR7-23",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION7_TIP_AC_MAP["plan-persist-fail-closed"], [
      "AC-CR7-8",
      "AC-CR7-19",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION7_TIP_AC_MAP["plan-success-print"], [
      "AC-CR7-9",
      "AC-CR7-10",
      "AC-CR7-24",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION7_TIP_AC_MAP["plan-no-second-writer"], [
      "AC-CR7-11",
      "AC-CR7-12",
      "AC-CR7-16",
    ]);
    assert.equal(CREATE_RESERVATION_FO_WALKIN_GUARANTEE_REQUIRED, false);
    assert.equal(CREATE_RESERVATION_SECTION7_PENDING_PERSIST, "every-successful-create");
    assert.equal(CREATE_RESERVATION_SECTION7_SUCCESS_CHROME, "in-place-panel-print");
    assert.equal(CREATE_RESERVATION_SECTION7_APPLY, "APPLIED");
    assert.equal(CREATE_RESERVATION_SECTION7_NONPROD_DB, "APPLIED");
    assert.equal(CREATE_RESERVATION_SECTION7_PROD_DB, "APPLIED");
    assert.equal(section7PersistApplied(), true);
  });

  it("AC-CR7-1 Review / sticky shows guest, associations, stay, room type, room/Unassigned, rate, server total", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /data-testid="create-reservation-summary"/);
    assert.match(page, /guest\?\.fullName/);
    assert.match(page, /data-testid="summary-associations"/);
    assert.match(page, /data-testid="summary-stay"/);
    assert.match(page, /data-testid="summary-room-type"/);
    assert.match(page, /data-testid="summary-room"/);
    assert.match(page, /stickyRoomAssignmentLabel/);
    assert.match(page, /data-testid="summary-rate"/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /data-testid="summary-no-fake-total"/);
    assert.match(page, /money\(pricingState\.quote\.subtotal\)/);
    assert.doesNotMatch(page, /fake 0\.00|stay total 0\.00/);
  });

  it("AC-CR7-2 Guarantee required on Confirm; Pending does not; values from pms_payment_methods else PAYMENT_METHODS", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const guarantee = readRel("../components/bookings/create-reservation-guarantee.tsx");
    const nightaudit = readRel("./nightaudit.server.ts");
    const polish = readRel("./pms-polish1-payment-admin.functions.ts");
    assert.match(page, /CreateReservationGuarantee/);
    assert.match(page, /getPmsPolish1Snapshot/);
    assert.match(page, /resolveGuaranteeMethodOptions/);
    assert.match(guarantee, /data-testid="guarantee-method"/);
    assert.match(guarantee, /Guarantee method/);
    assert.match(polish, /getPmsPolish1Snapshot/);
    assert.match(
      nightaudit,
      /export const PAYMENT_METHODS = \["cash", "card", "bank_transfer", "mobile_money", "other"\]/,
    );
    assert.deepEqual(
      FALLBACK_CASHIERING_TENDERS.map((row) => row.code),
      ["cash", "card", "bank_transfer", "mobile_money", "other"],
    );
    const setup = resolveGuaranteeMethodOptions({
      paymentMethodsAvailable: true,
      paymentMethods: [
        { code: "CASH", name: "Cash desk", active: true },
        { code: "OFF", name: "Off", active: false },
      ],
    });
    assert.deepEqual(setup, [{ value: "CASH", label: "Cash desk", origin: "setup" }]);
    const fallback = resolveGuaranteeMethodOptions({
      paymentMethodsAvailable: true,
      paymentMethods: [],
    });
    assert.equal(fallback[0]?.origin, "cashier");
    assert.match(
      guaranteeCatalogueWarning({ paymentMethodsAvailable: false, paymentMethods: [] }) ?? "",
      /warning/,
    );
    assert.equal(
      canSubmitConfirmReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt",
        available: 2,
        priced: true,
        canCreateUnpriced: true,
        hasGuarantee: false,
        hasSource: true,
        hasSegment: true,
        hasRequiredMaster: true,
        persistApplied: true,
      }),
      false,
    );
    assert.equal(
      canSubmitPendingReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt",
        available: 2,
        status: "pending",
        priced: true,
        canCreateUnpriced: false,
      }),
      true,
    );
    assert.doesNotMatch(guarantee, /gateway|3-D Secure|folio post|createDeposit/i);
  });

  it("AC-CR7-3 Payment terms display read-only from linked Company/TA; no credit engine", () => {
    const guarantee = readRel("../components/bookings/create-reservation-guarantee.tsx");
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    assert.match(guarantee, /guarantee-payment-terms/);
    assert.match(guarantee, /CREATE_RESERVATION_PAYMENT_TERMS_COPY/);
    assert.match(picker, /company-payment-terms/);
    assert.match(CREATE_RESERVATION_CONFIRM_MASTER_REQUIRED, /Company/);
    assert.equal(
      paymentTermsReviewCopy({
        companyName: "Acme",
        companyTerms: "Net 30",
        travelAgentName: null,
        travelAgentTerms: null,
      }),
      "Company · Net 30",
    );
    assert.match(
      paymentTermsReviewCopy({
        companyName: "Acme",
        companyTerms: null,
        travelAgentName: null,
        travelAgentTerms: null,
      }) ?? "",
      /No payment terms/,
    );
    assert.doesNotMatch(guarantee, /credit approval|city-ledger|credit limit hard/i);
  });

  it("AC-CR7-4 Confirm writes confirmed + guarantee; Pending writes pending; no cancel/no-show at create", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /CREATE_RESERVATION_CONFIRM_LABEL/);
    assert.match(page, /CREATE_RESERVATION_PENDING_LABEL/);
    assert.equal(CREATE_RESERVATION_CONFIRM_LABEL, "Confirm / Guarantee");
    assert.equal(CREATE_RESERVATION_PENDING_LABEL, "Save as Pending");
    assert.match(page, /requireGuarantee: nextStatus === "confirmed"/);
    assert.match(page, /status: nextStatus/);
    assert.match(page, /guaranteeMethod: guaranteeMethod.trim\(\) \|\| null/);
    assert.match(functions, /status: z.enum\(\["pending", "confirmed"\]\)/);
    assert.doesNotMatch(
      page,
      /SelectItem value="cancelled"|SelectItem value="no_show"|checked_in|checked_out/,
    );
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(
      createStart,
      functions.indexOf("export const amendReservation"),
    );
    assert.match(createFn, /assertCreateReservationSection7/);
    assert.doesNotMatch(createFn, /setReservationStatus/);
  });

  it("AC-CR7-5 Draft is pending incomplete; Guaranteed is confirmed + guarantee method — not new DB statuses", () => {
    const helpers = readRel("./create-reservation-phase1-section7.ts");
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /useState<"pending" \| "confirmed">\("pending"\)/);
    assert.match(helpers, /CreateReservationStatus/);
    assert.doesNotMatch(helpers, /status = "draft"|status = "guaranteed"/);
    assert.doesNotMatch(page, /"draft"|"guaranteed"/);
  });

  it("AC-CR7-6 Unpriced remains Pending + permission; confirmed without rate blocked; assertCreateReservationPricing not weakened", () => {
    const functions = readRel("./reservations.functions.ts");
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(
      createStart,
      functions.indexOf("export const amendReservation"),
    );
    assert.match(createFn, /assertCreateReservationPricing/);
    assert.match(createFn, /assertCreateReservationSection7/);
    const pricingIdx = createFn.indexOf("assertCreateReservationPricing");
    const section7Idx = createFn.indexOf("assertCreateReservationSection7");
    assert.ok(pricingIdx > 0 && section7Idx > pricingIdx);
    assert.throws(
      () =>
        assertCreateReservationPricing({ role: "owner", status: "confirmed", ratePlanId: null }),
      /quoted rate plan is required/,
    );
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt",
        available: 1,
        status: "confirmed",
        priced: false,
        canCreateUnpriced: true,
      }),
      false,
    );
    assert.equal(
      createConfirmBlockCopy({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt",
        available: 1,
        priced: false,
        canCreateUnpriced: true,
        hasGuarantee: true,
        hasSource: true,
        hasSegment: true,
        hasRequiredMaster: true,
        persistApplied: true,
      }),
      CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE,
    );
  });

  it("AC-CR7-7 Source and market segment required on Confirm; external ref optional; not channel origin", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const helpers = readRel("./create-reservation-phase1-section7.ts");
    assert.match(page, /hasSource: !!bookingSource/);
    assert.match(page, /hasSegment: !!marketSegment/);
    assert.match(page, /commercialBookingSource: bookingSource.trim\(\) \|\| null/);
    assert.match(CREATE_RESERVATION_SOURCE_SEGMENT_REQUIRED, /Booking source and market segment/);
    assert.match(CREATE_RESERVATION_CHANNEL_ORIGIN_RESIDUAL, /source = 'staff'/);
    assert.match(helpers, /Do not overload hotel_reservations.source/);
    assert.throws(
      () =>
        assertCreateReservationSection7({
          status: "confirmed",
          requireGuarantee: true,
          guaranteeMethod: "cash",
          commercialBookingSource: null,
          marketSegment: "leisure",
          persistApplied: true,
        }),
      /Booking source and market segment/,
    );
  });

  it("AC-CR7-8 Persist only via 0061; APPLY on; Confirm still fail-closes if persist is off", () => {
    const functions = readRel("./reservations.functions.ts");
    const supabase = readRel(
      "../../../../supabase/migrations/0061_pms_create_reservation_guarantee_confirm.sql",
    );
    const drizzle = readRel(
      "../../../../drizzle/migrations/0061_pms_create_reservation_guarantee_confirm.sql",
    );
    assert.equal(CREATE_RESERVATION_SECTION7_APPLY, "APPLIED");
    assert.equal(section7PersistApplied(), true);
    assert.match(functions, /section7PersistApplied/);
    assert.match(functions, /persistApplied/);
    assert.match(CREATE_RESERVATION_PERSIST_HELD_COPY, /fails closed/);
    assert.throws(
      () =>
        assertCreateReservationSection7({
          status: "confirmed",
          requireGuarantee: true,
          guaranteeMethod: "cash",
          commercialBookingSource: "phone",
          marketSegment: "leisure",
          persistApplied: false,
        }),
      /fails closed/,
    );
    assert.doesNotThrow(() =>
      assertCreateReservationSection7({
        status: "confirmed",
        requireGuarantee: true,
        guaranteeMethod: "cash",
        commercialBookingSource: "phone",
        marketSegment: "leisure",
        persistApplied: true,
      }),
    );
    assert.match(supabase, /APPLY HELD/);
    assert.match(drizzle, /APPLY HELD/);
    assert.match(supabase, /commercial_booking_source/);
    assert.match(supabase, /Do NOT overload hotel_reservations.source/);
    assert.equal(
      createConfirmBlockCopy({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt",
        available: 2,
        priced: true,
        canCreateUnpriced: true,
        hasGuarantee: true,
        hasSource: true,
        hasSegment: true,
        hasRequiredMaster: true,
        persistApplied: true,
      }),
      null,
    );
  });

  it("AC-CR7-9 Successful create shows on-screen confirmation with print", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const confirmation = readRel("../components/bookings/create-reservation-confirmation.tsx");
    assert.match(page, /CreateReservationConfirmation/);
    assert.match(page, /setCreatedView/);
    assert.doesNotMatch(page, /void navigate\(\{/);
    assert.match(confirmation, /data-testid="create-reservation-confirmation"/);
    assert.match(confirmation, /data-testid="confirmation-number"/);
    assert.match(confirmation, /window.print/);
    assert.match(confirmation, /data-testid="create-reservation-print"/);
    assert.equal(CREATE_RESERVATION_PRINT_LABEL, "Print");
    assert.equal(CREATE_RESERVATION_OPEN_RESERVATION_LABEL, "Open reservation");
    assert.match(confirmation, /data-testid="open-reservation"/);
    assert.match(confirmation, /\/restaurant\/pms\/reservations\/\$reservationId/);
  });

  it("AC-CR7-10 No email and no SMS send on this writer", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const confirmation = readRel("../components/bookings/create-reservation-confirmation.tsx");
    const functions = readRel("./reservations.functions.ts");
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(
      createStart,
      functions.indexOf("export const amendReservation"),
    );
    assert.doesNotMatch(page, /Send confirmation|sendConfirmation|smsConfirmation/);
    assert.doesNotMatch(confirmation, /Send confirmation|Resend|Twilio/);
    assert.doesNotMatch(createFn, /sendConfirmation|createDeposit/);
    assert.match(confirmation, /email and SMS are not sent/);
  });

  it("AC-CR7-11 No create-time deposit cashiering", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(
      createStart,
      functions.indexOf("export const amendReservation"),
    );
    assert.doesNotMatch(page, /createDeposit|postDeposit|openFolio|payment capture/i);
    assert.doesNotMatch(createFn, /createDeposit|folio_post|captureCard/);
    const checkin = readRel("./fo-check-in.ts");
    assert.match(checkin, /deposit|Policy A|check-in/i);
  });

  it("AC-CR7-12 No second writer; walk-in remains createReservation → create_hotel_reservation_priced", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    assert.match(page, /createReservation/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(
      createStart,
      functions.indexOf("export const amendReservation"),
    );
    assert.match(createFn, /create_hotel_reservation_priced/);
    assert.doesNotMatch(createFn, /setReservationStatus/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.match(dialogs, /createReservation/);
    assert.doesNotMatch(dialogs, /createWalkInReservation|create_walk_in_reservation/);
    assert.doesNotMatch(functions, /insert\("hotel_reservations"\)/);
  });

  it("AC-CR7-13 Existing permission gates preserved; no new entitlement / RLS model", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const migration = readRel(
      "../../../../supabase/migrations/0061_pms_create_reservation_guarantee_confirm.sql",
    );
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(functions, /requireReservationManager/);
    assert.match(CREATE_RESERVATION_SECTION7_PERMISSION_DOC, /no RLS/);
    assert.match(migration, /RLS model: UNCHANGED/);
    assert.match(migration, /Flag Abel: NOT required/);
    assert.doesNotMatch(migration, /CREATE POLICY/);
    assert.doesNotMatch(page, /new entitlement|requirePackage\("create-reservation"\)/);
  });

  it("AC-CR7-14 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1-section7.ts");
    const section1 = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(section1, /Waves 1–5 \+ GE1–GE3 stay closed/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
  });

  it("AC-CR7-15 Section 7 does not claim Phase 1 or Create Reservation DONE", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(CREATE_RESERVATION_SECTION7_SCOPE, /Packages remain Section 8/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
    assert.match(page, /CREATE_RESERVATION_SECTION7_SCOPE/);
  });

  it("AC-CR7-16 Walk-in honesty: FO requires room + rate; create Unassigned OK; FO no guarantee required", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const walkInStart = dialogs.indexOf("export function WalkInDialog");
    const walkIn = dialogs.slice(walkInStart);
    assert.equal(CREATE_RESERVATION_FO_WALKIN_ROOM_REQUIRED, true);
    assert.equal(CREATE_RESERVATION_FO_WALKIN_GUARANTEE_REQUIRED, false);
    assert.match(walkIn, /disabled=\{!guest \|\| !roomTypeId \|\| !roomId \|\| !ratePlanId/);
    assert.match(walkIn, /status: "confirmed"/);
    assert.doesNotMatch(walkIn, /requireGuarantee: true/);
    assert.match(walkIn, /without guarantee/);
    assert.doesNotMatch(walkIn, /Assign later|unassigned/);
    assert.match(page, /Room assignment \(optional\)/);
    assert.doesNotMatch(page, /bookingSource === ["']walk_in["'][\s\S]{0,120}roomId/);
  });

  it("AC-CR7-17 Sticky / Confirm total is Section 5 server quote; browser math ignored", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /money\(pricingState\.quote\.subtotal\)/);
    assert.match(page, /quoteStay/);
    assert.doesNotMatch(page, /nights \* nightly|clientTotal|browserTotal/);
    const roomIdx = page.indexOf('data-testid="summary-room"');
    const rateIdx = page.indexOf('data-testid="summary-rate"');
    const totalIdx = page.indexOf('data-testid="summary-stay-total"');
    const guaranteeIdx = page.indexOf('data-testid="summary-guarantee"');
    assert.ok(roomIdx > 0 && rateIdx > roomIdx && totalIdx > rateIdx && guaranteeIdx > totalIdx);
  });

  it("AC-CR7-18 Locked non-goals in §4 are absent", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const helpers = readRel("./create-reservation-phase1-section7.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION7_LOCKED_NON_GOALS.length, 12);
    assert.match(helpers, /email\/SMS send confirmation/);
    assert.match(helpers, /Phase 1 \/ Create Reservation DONE claim/);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|channel manager/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
  });

  it("AC-CR7-19 Migration 0061 dual-lane APPLY HELD; next free after 0060; no overload of source", () => {
    const helpers = readRel("./create-reservation-phase1-section7.ts");
    const supabase = readRel(
      "../../../../supabase/migrations/0061_pms_create_reservation_guarantee_confirm.sql",
    );
    const drizzle = readRel(
      "../../../../drizzle/migrations/0061_pms_create_reservation_guarantee_confirm.sql",
    );
    assert.equal(
      CREATE_RESERVATION_SECTION7_MIGRATION,
      "0061_pms_create_reservation_guarantee_confirm.sql",
    );
    assert.equal(CREATE_RESERVATION_SECTION7_APPLY, "APPLIED");
    assert.match(CREATE_RESERVATION_SECTION7_MIGRATION_REASON, /APPLIED/);
    assert.match(helpers, /0060 taken/);
    assert.match(supabase, /do not apply to non-prod or production from this agent/);
    assert.match(supabase, /_commercial_booking_source text DEFAULT NULL/);
    assert.match(supabase, /_market_segment text DEFAULT NULL/);
    assert.match(supabase, /_external_reference text DEFAULT NULL/);
    assert.match(supabase, /_guarantee_method text DEFAULT NULL/);
    assert.match(supabase, /_status, 'staff'/);
    assert.match(supabase, /status, source,/);
    assert.match(drizzle, /APPLY HELD/);
    assert.equal(
      supabase.includes("CREATE OR REPLACE FUNCTION public.create_hotel_reservation("),
      true,
    );
    const drizzleDir = join(here, "../../../../drizzle/migrations");
    assert.equal(
      existsSync(join(drizzleDir, "0060_pms_create_reservation_individual_associations.sql")),
      true,
    );
    assert.equal(existsSync(join(drizzleDir, CREATE_RESERVATION_SECTION7_MIGRATION)), true);
    for (const file of readdirSync(join(here, "../../../../supabase/migrations"))) {
      if (file.startsWith("0061_") && file !== CREATE_RESERVATION_SECTION7_MIGRATION) {
        assert.fail(`unexpected 0061 twin ${file}`);
      }
    }
  });

  it("AC-CR7-20 Additive expansion of existing /restaurant/bookings/new — no second product", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.match(page, /CreateReservationGuarantee/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/pms\/reservations\/new"\)/);
    assert.doesNotMatch(page, /legacy chrome|Fixed Rate LIVE/i);
  });

  it("AC-CR7-21 Programme rule honoured: NORU UI; CR-100 OUT", () => {
    const guarantee = readRel("../components/bookings/create-reservation-guarantee.tsx");
    assert.match(CREATE_RESERVATION_SECTION7_PROGRAMME_RULE, /modern NORU UI/);
    assert.match(CREATE_RESERVATION_SECTION7_PROGRAMME_RULE, /Do not clone legacy chrome/);
    assert.match(CREATE_RESERVATION_SECTION7_PROGRAMME_RULE, /CR-100 OUT/);
    assert.match(guarantee, /data-testid="create-reservation-guarantee"/);
    assert.match(guarantee, /rounded-2xl border/);
    assert.doesNotMatch(guarantee, /legacy PMS chrome/);
  });

  it("AC-CR7-22 Sticky room/Unassigned composes with §5 rate/total — not a second calculator", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /data-testid="summary-room"/);
    assert.match(page, /data-testid="summary-rate"/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /data-testid="summary-guarantee"/);
    assert.match(page, /data-testid="summary-source"/);
    assert.doesNotMatch(page, /secondCalculator|replacePricingLines|clientStayTotal/);
    const totalIdx = page.indexOf('data-testid="summary-stay-total"');
    const sourceIdx = page.indexOf('data-testid="summary-source"');
    assert.ok(totalIdx > 0 && sourceIdx > totalIdx);
  });

  it("AC-CR7-23 Corporate/TA type requires master for Confirm; Individual Associations remain optional", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /requiredMasterForConfirm/);
    assert.equal(requiredMasterForConfirm("corporate", null, null), false);
    assert.equal(requiredMasterForConfirm("corporate", "c1", null), true);
    assert.equal(requiredMasterForConfirm("travel_agency", null, null), false);
    assert.equal(requiredMasterForConfirm("travel_agency", null, "t1"), true);
    assert.equal(requiredMasterForConfirm("individual", null, null), true);
    assert.throws(
      () =>
        assertCreateReservationSection7({
          status: "confirmed",
          requireGuarantee: true,
          guaranteeMethod: "cash",
          commercialBookingSource: "phone",
          marketSegment: "leisure",
          persistApplied: true,
          reservationType: "corporate",
          companyMasterId: null,
        }),
      /Company is required/,
    );
  });

  it("AC-CR7-24 Public stay confirmation and SET5 messaging are not this staff product", () => {
    const page =
      readRel("../components/bookings/create-reservation-page.tsx") +
      readRel("../../../routes/restaurant/bookings/new.tsx");
    const confirmation = readRel("../components/bookings/create-reservation-confirmation.tsx");
    assert.doesNotMatch(page, /\/stay\/\$propertySlug\/confirmation/);
    assert.doesNotMatch(confirmation, /\/stay\/\$propertySlug\/confirmation/);
    assert.match(confirmation, /window.print/);
    const set5 = readRel("./pms-set5-depts-guestsvc.ts");
    assert.match(set5, /SET5/);
    assert.doesNotMatch(page, /pms-set5-depts-guestsvc/);
  });
});
