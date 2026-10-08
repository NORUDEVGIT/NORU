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
    assert.match(details, /quoteFlexibleStay/);
    assert.match(details, /listAccountRatePlanHints/);
    assert.match(functions, /commercialSalesChannel/);
    assert.match(page, /canAdvanceFromBookingDetails/);
    assert.doesNotMatch(page, /CreateReservationContext/);
    assert.match(page, /CreateReservationBookingDetails/);
    assert.match(details, /booking-details-source-classification/);
    assert.match(details, /data-testid="booking-agent"/);
    assert.match(details, /booking-details-relationships/);
    assert.doesNotMatch(page, /group block/);
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
