import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_STEP3_FORBIDDEN_PAYLOAD_KEYS,
  canAdvanceFromBookingDetails,
  payloadHasForbiddenStep3Keys,
  quoteIdentityMatches,
  agencyRateDisplayLabel,
  companyContactOptionLabel,
  formatCompanyContractRate,
  formatCompanyAgreementRateLabel,
  selectCompanyBookingDefaults,
} from "./create-reservation-step3.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const identity = {
  roomTypeId: "rt-1",
  arrival: "2026-10-10",
  departure: "2026-10-12",
  rooms: 1,
  adults: 2,
  children: 0,
  infants: 0,
  quoteCurrency: "GBP",
  ratePlanId: "plan-1",
};

describe("Create reservation Step 3 identity and payload", () => {
  it("matches quote identity when stay args are unchanged", () => {
    assert.equal(quoteIdentityMatches(identity, { ...identity }), true);
    assert.equal(quoteIdentityMatches(identity, { ...identity, adults: 3 }), false);
  });

  it("blocks Continue while quotes are fetching or priced identity diverges", () => {
    assert.equal(
      canAdvanceFromBookingDetails({
        quotesFetching: true,
        roomTypeId: "rt-1",
        occupancyOk: true,
        priced: true,
        canCreateUnpriced: false,
        submitted: identity,
        quoted: identity,
      }),
      false,
    );
    assert.equal(
      canAdvanceFromBookingDetails({
        quotesFetching: false,
        roomTypeId: "rt-1",
        occupancyOk: true,
        priced: true,
        canCreateUnpriced: false,
        submitted: identity,
        quoted: { ...identity, departure: "2026-10-13" },
      }),
      false,
    );
    assert.equal(
      canAdvanceFromBookingDetails({
        quotesFetching: false,
        roomTypeId: "rt-1",
        occupancyOk: true,
        priced: true,
        canCreateUnpriced: false,
        submitted: identity,
        quoted: identity,
      }),
      true,
    );
  });

  it("keeps Step 3 stubs off the createReservation payload", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    const details = readRel("../components/bookings/create-reservation-booking-details.tsx");
    const functions = readRel("./reservations.functions.ts");
    const createCall = page.slice(page.indexOf("submitReservation({"), page.indexOf("onSuccess:"));
    for (const key of CREATE_RESERVATION_STEP3_FORBIDDEN_PAYLOAD_KEYS) {
      assert.equal(payloadHasForbiddenStep3Keys({ [key]: 1 }).includes(key), true);
      assert.doesNotMatch(createCall, new RegExp(`\\b${key}\\b`));
    }
    assert.match(createCall, /commercialSalesChannel/);
    assert.match(createCall, /purposeOfStay/);
    assert.match(createCall, /billingRuleId/);
    assert.match(createCall, /companyContactId/);
    assert.match(createCall, /travelAgentContactId/);
    assert.match(createCall, /bookerGuestId/);
    assert.match(details, /listCompanyContacts/);
    assert.match(details, /listTravelAgentContacts/);
    assert.match(details, /listGroups/);
    assert.match(details, /getGuestReservationPreferenceDefaults/);
    assert.doesNotMatch(details, /quoteFlexibleStay/);
    assert.match(details, /listAccountRatePlanHints/);
    assert.match(functions, /commercialSalesChannel/);
    assert.match(page, /canAdvanceFromBookingDetails/);
    assert.doesNotMatch(page, /CreateReservationContext/);
    assert.match(page, /CreateReservationBookingDetails/);
    assert.match(details, /booking-details-source-channel/);
    assert.match(details, /data-testid="booking-agent"/);
    assert.match(details, /booking-details-company-agent-group/);
    assert.doesNotMatch(page, /group block/);
  });

  it("prefills a reservation from the company's saved agreement and billing rule", () => {
    const selected = selectCompanyBookingDefaults({
      arrival: "2026-10-12",
      defaultBillingRuleId: "rule-1",
      negotiatedReference: null,
      accountCode: "COM-0001",
      plans: [
        { id: "plan-bar", code: "BAR", name: "Best Available" },
        { id: "plan-corp", code: "CORP", name: "Corporate" },
      ],
      agreements: [
        {
          id: "agr-old",
          name: "Expired",
          code: "OLD",
          active: true,
          status: "active",
          validFrom: "2025-01-01",
          validTo: "2025-12-31",
          ratePlanId: "plan-bar",
          ratePlanIds: [],
        },
        {
          id: "agr-live",
          name: "Annual Corporate Agreement",
          code: "ACA",
          active: true,
          status: "active",
          validFrom: "2026-01-01",
          validTo: "2026-12-31",
          ratePlanId: "plan-corp",
          ratePlanIds: ["plan-bar"],
        },
      ],
    });
    assert.equal(selected.defaultBillingRuleId, "rule-1");
    assert.equal(selected.agreementLabel, "Annual Corporate Agreement (ACA)");
    assert.equal(selected.hints[0]?.planId, "plan-corp");
    assert.match(selected.hints[0]?.label ?? "", /Annual Corporate Agreement/);
    assert.equal(selected.hints[1]?.planId, "plan-bar");
    assert.equal(
      companyContactOptionLabel({
        name: "abebe",
        phone: "+25199999999",
        email: "ererer@gmail.com",
        whatsapp: "+251999999999",
      }),
      "abebe · +25199999999 · +251999999999 · ererer@gmail.com",
    );
    assert.equal(
      formatCompanyContractRate({
        roomTypeId: "rt",
        roomTypeName: "Delux",
        amount: 1999.79,
        currency: "ETB",
      }),
      "Delux · 1,999.79 ETB",
    );
    assert.equal(
      formatCompanyAgreementRateLabel({
        name: "Annual Corporate Agreement",
        pricingMethod: "rate_plan",
        ratePlanScope: "all",
      }),
      "Annual Corporate Agreement · All rate plans",
    );
    assert.equal(
      formatCompanyAgreementRateLabel({
        name: "Annual Corporate Agreement",
        pricingMethod: "rate_plan_discount",
        ratePlanScope: "all",
        discountType: "percent",
        discountValue: 10,
      }),
      "Annual Corporate Agreement · All rate plans · 10% off",
    );
    const allPlans = selectCompanyBookingDefaults({
      defaultBillingRuleId: null,
      plans: [],
      agreements: [
        {
          id: "agr-all",
          name: "Annual Corporate Agreement",
          code: "ACA",
          active: true,
          status: "active",
          validFrom: "2026-01-01",
          validTo: "2026-12-31",
          ratePlanId: null,
          ratePlanIds: [],
          pricingMethod: "rate_plan_discount",
          ratePlanScope: "all",
          discountType: "percent",
          discountValue: 10,
        },
      ],
    });
    assert.equal(allPlans.hints[0]?.label, "Annual Corporate Agreement · All rate plans · 10% off");
  });

  it("shows Applies to all when an agency commission covers every rate plan", () => {
    assert.equal(
      agencyRateDisplayLabel({ appliesToAll: true }),
      "Applies to all",
    );
    assert.equal(
      agencyRateDisplayLabel({
        appliesToAll: true,
        contractLabel: "Delux · 1,999.79 ETB",
      }),
      "Delux · 1,999.79 ETB",
    );
    assert.equal(agencyRateDisplayLabel({ appliesToAll: false }), "—");
  });

  it("wires purpose catalogue, flexible reader, and cashiering hint without create posting", () => {
    const set6 = readRel("../components/settings/pms-set6-section.tsx");
    const rates = readRel("./rates.functions.ts");
    const hint = readRel("./cashiering-billing-hint.ts");
    assert.match(set6, /listPurposeOfStay/);
    assert.match(set6, /savePurposeOfStay/);
    assert.match(rates, /export const quoteFlexibleStay/);
    assert.match(rates, /export const listAccountRatePlanHints/);
    assert.match(hint, /postsFromCreate: false/);
  });
});
