import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { breakfastLabelFromMealPlan, deriveCancellationDisplay } from "./cancellation-deadline.ts";

describe("cancellation deadline merchandising", () => {
  it("derives 1 day before arrival at 18:00 on 4 Oct as 3 Oct 18:00", () => {
    const display = deriveCancellationDisplay({
      policyName: "Free 1 day",
      policyKind: "free_cancellation",
      windowValue: 1,
      windowUnit: "days_before_arrival",
      cutoffTime: "18:00",
      arrivalDate: "2026-10-04",
      timeZone: "UTC",
    });
    assert.equal(display.kind, "free_until");
    assert.match(display.label, /Free cancellation until 3 Oct 18:00/);
    assert.equal(display.untilAt, "2026-10-03T18:00:00.000Z");
  });

  it("uses non-refundable and named fallback when the window is missing", () => {
    assert.equal(
      deriveCancellationDisplay({
        policyName: "NR",
        policyKind: "non_refundable",
        arrivalDate: "2026-10-04",
        timeZone: "UTC",
      }).label,
      "Non-refundable",
    );
    assert.equal(
      deriveCancellationDisplay({
        policyName: "Flexible BAR",
        policyKind: "flexible",
        arrivalDate: "2026-10-04",
        timeZone: "UTC",
      }).label,
      "Flexible BAR",
    );
  });

  it("maps legacy deadline_hours onto hours_before_arrival", () => {
    const display = deriveCancellationDisplay({
      policyName: "24h",
      policyKind: "flexible",
      deadlineHours: 24,
      arrivalDate: "2026-10-04",
      timeZone: "UTC",
    });
    assert.equal(display.kind, "free_until");
    assert.equal(display.untilAt, "2026-10-03T00:00:00.000Z");
  });

  it("labels breakfast from the meal plan, not packages", () => {
    assert.equal(breakfastLabelFromMealPlan({ mealPlanId: null, breakfastIncluded: true }), "—");
    assert.equal(breakfastLabelFromMealPlan({ mealPlanId: "m1", breakfastIncluded: true }), "Included");
    assert.equal(breakfastLabelFromMealPlan({ mealPlanId: "m1", breakfastIncluded: false }), "Not included");
  });

  it("stays out of price_hotel_stay arguments", () => {
    const quoteStay = readFileSync(new URL("./rates.functions.ts", import.meta.url), "utf8");
    const start = quoteStay.indexOf("export const quoteStay");
    const body = quoteStay.slice(start, quoteStay.indexOf("export const repriceReservation"));
    assert.match(body, /deriveCancellationDisplay/);
    assert.match(body, /price_hotel_stay/);
    assert.doesNotMatch(body, /_deadline|_policy_kind|_cutoff_time/);
  });
});
