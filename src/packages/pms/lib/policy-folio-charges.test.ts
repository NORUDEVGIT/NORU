import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { computeEarlyDeparturePenalty } from "./early-departure-policy.ts";
import {
  earlyDeparturePolicyLine,
  stayDateFolioImpact,
} from "./fo-stay-date-finance.ts";
import { computeCancellationPenalty } from "./reservation-cancel-workspace.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("frozen policy folio charges", () => {
  it("charges a cancellation only after the free window", () => {
    const within = computeCancellationPenalty({
      snapshot: {
        name: "BAR Flexible",
        policy_kind: "free_cancellation",
        window_value: 2,
        window_unit: "days_before_arrival",
        cutoff_time: "18:00",
        penalty_type: "percentage",
        penalty_value: 50,
      },
      arrivalDate: "2026-09-22",
      timeZone: "Africa/Addis_Ababa",
      now: new Date("2026-09-19T10:00:00.000Z"),
      roomSubtotal: 1000,
      nightlyRates: [{ date: "2026-09-22", rate: 500 }],
      currency: "ETB",
    });
    assert.equal(within.basis, "within_free");
    assert.equal(within.amount, 0);
    assert.equal(within.required, false);

    const late = computeCancellationPenalty({
      snapshot: {
        policy_kind: "free_cancellation",
        deadline_hours: 24,
        penalty_type: "first_night",
      },
      arrivalDate: "2026-09-22",
      timeZone: "UTC",
      now: new Date("2026-09-22T10:00:00.000Z"),
      roomSubtotal: 1000,
      nightlyRates: [{ date: "2026-09-22", rate: 500 }],
      currency: "ETB",
    });
    assert.equal(late.amount, 500);
    assert.equal(late.required, true);

    const missing = computeCancellationPenalty({
      snapshot: null,
      arrivalDate: "2026-09-22",
      timeZone: "UTC",
      now: new Date(),
      roomSubtotal: 1000,
      nightlyRates: [],
      currency: "ETB",
    });
    assert.equal(missing.basis, "not_evaluated");
    assert.equal(missing.calculable, false);
  });

  it("charges the unused room amount for early departure", () => {
    const quote = computeEarlyDeparturePenalty({
      snapshot: { penalty_type: "percent_stay", penalty_value: 50 },
      roomSubtotal: 3000,
      quotedSubtotal: 1000,
      nightlyRates: [{ rate: 1000 }],
      currency: "ETB",
    });
    assert.equal(quote.amount, 1000);
    assert.match(
      earlyDeparturePolicyLine({ name: "Flexible departure", penalty_type: "first_night" }, 120),
      /posted to the folio/,
    );
    assert.match(stayDateFolioImpact("early_departure", "first_night").join(" "), /own folio charge/);
  });

  it("posts the early-departure penalty from the stay-date writer", () => {
    const writer = read("./frontoffice.functions.ts");
    const change = writer.slice(
      writer.indexOf("export const changeStayDates"),
      writer.indexOf("export const markNoShow"),
    );
    assert.match(change, /Early departure penalty/);
    assert.match(change, /reservation_early_departure/);
    assert.match(change, /price_hotel_stay/);
    const quote = writer.slice(writer.indexOf("export const quoteInHouseStayChange"));
    assert.match(quote, /penaltyAmount:/);
    const sql = read("../../../../supabase/migrations/0182_inhouse_stay_date_finance.sql");
    assert.match(sql, /early_departure_penalty_posted', false/);
    assert.doesNotMatch(sql, /INSERT INTO public\.folio_transactions/);
  });
});
