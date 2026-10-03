import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  summarizeBreakfast,
  summarizeIncludedServices,
  summarizeStayRestrictions,
} from "./rate-quote-read-model.server.ts";

describe("quote merchandising read model", () => {
  it("does not invent breakfast when no meal plan is linked", () => {
    assert.equal(summarizeBreakfast([]), "—");
    assert.equal(summarizeBreakfast([{ name: "Room only", includesBreakfast: false }]), "Not included");
    assert.equal(summarizeBreakfast([{ name: "BB", includesBreakfast: true }]), "Included");
  });

  it("lists linked inclusion labels without duplicating package price", () => {
    assert.equal(summarizeIncludedServices([]), "—");
    assert.equal(
      summarizeIncludedServices([
        { packageName: "BB", kind: "meal_plan", label: "Bed & Breakfast" },
        { packageName: "BB", kind: "room_amenity", label: "Wifi" },
      ]),
      "Bed & Breakfast · Wifi",
    );
  });

  it("summarizes dated restrictions for the stay window", () => {
    assert.equal(summarizeStayRestrictions([], "2026-10-03", "2026-10-05"), null);
    assert.equal(
      summarizeStayRestrictions(
        [
          {
            date: "2026-10-03",
            minStay: 2,
            maxStay: 7,
            closedToArrival: true,
            closedToDeparture: false,
            stopSell: false,
          },
        ],
        "2026-10-03",
        "2026-10-05",
      ),
      "Min stay 2 · Max stay 7 · Closed to arrival",
    );
  });

  it("joins packages and restrictions from quoteStay without duplicating plan columns", () => {
    const rates = readFileSync(new URL("./rates.functions.ts", import.meta.url), "utf8");
    const helper = readFileSync(new URL("./rate-quote-read-model.server.ts", import.meta.url), "utf8");
    const sql = readFileSync(
      new URL("../../../../supabase/migrations/0116_pms_rate_plan_policies_quote.sql", import.meta.url),
      "utf8",
    );
    const drizzle = readFileSync(
      new URL("../../../../drizzle/migrations/0116_pms_rate_plan_policies_quote.sql", import.meta.url),
      "utf8",
    );
    const quoteStart = rates.indexOf("export const quoteStay");
    const quoteFn = rates.slice(quoteStart, rates.indexOf("export const repriceReservation"));
    assert.match(quoteFn, /loadQuoteMerchandising/);
    assert.match(quoteFn, /pms_rate_refundability_codes/);
    assert.match(quoteFn, /select\("id, name, kind"\)/);
    assert.match(helper, /pms_package_rate_plans/);
    assert.match(helper, /hotel_rate_restrictions/);
    assert.doesNotMatch(helper, /meal_plan_id.*hotel_rate_plans/);
    assert.match(sql, /pms_rate_cancellation_policies/);
    assert.match(sql, /min_advance_days/);
    assert.match(sql, /_quote_currency/);
    assert.equal(sql, drizzle);
  });
});
