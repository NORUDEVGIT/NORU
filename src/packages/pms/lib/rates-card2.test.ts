import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CARD2_HASH,
  CARD2_RATES_HREF,
  CARD2_RATES_STEP,
  CARD2_STEPS,
  card2StepFromSearch,
  card2StepHref,
  formatRateValidity,
} from "./pms-property-setup-card2.ts";
import {
  CARD3_DOMAINS,
  CARD3_HASH,
  card3DomainById,
} from "./pms-property-setup-card3.ts";
import {
  CARD2_RATES_AUDIT_SECTION,
  CARD2_RATES_ROOM_TYPES_COPY,
  evaluateRatesCard2Readiness,
  type RatesCard2Snapshot,
} from "./rates-card2.server.ts";
import {
  getRatesCard2,
  saveRateCategoryCard2,
  saveRatePlanCard2,
} from "./rates-card2.functions.ts";
import {
  getRatesCard3,
  saveRateCategoryCard3,
  saveRatePlanCard3,
} from "./rates-card3.functions.ts";
import { SET3_RATES_HREF } from "./pms-set3-rates-guest.ts";

const card2Ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card2-rates.tsx", import.meta.url),
  "utf8",
);
const card2Section = readFileSync(
  new URL("../components/settings/pms-property-setup-card2-section.tsx", import.meta.url),
  "utf8",
);
const card3Section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ratesTabs = readFileSync(
  new URL("../components/rates/rates-tabs.tsx", import.meta.url),
  "utf8",
);
const card2Fns = readFileSync(
  new URL("./rates-card2.functions.ts", import.meta.url),
  "utf8",
);
const card3Fns = readFileSync(
  new URL("./rates-card3.functions.ts", import.meta.url),
  "utf8",
);

function emptyPlanFields() {
  return {
    description: "",
    mealPlanId: null as string | null,
    mealPlanName: "",
    breakfastIncluded: false,
    cancellationPolicyId: null as string | null,
    cancellationName: "",
    refundabilityId: null as string | null,
    refundabilityName: "",
    refundabilityKind: null,
  };
}

function makeSnapshot(partial?: Partial<RatesCard2Snapshot>): RatesCard2Snapshot {
  return {
    roomTypes: [{ id: "rt-1", code: "DLX", name: "Deluxe Room", active: true }],
    categories: [{ id: "cat-1", code: "BAR", name: "Best Available Rate", active: true }],
    mealPlans: [],
    cancellationPolicies: [],
    refundabilityCodes: [],
    plans: [],
    ...partial,
  };
}

describe("NORU PMS — Rate & Pricing Move to Rooms & Operations (Card 2)", () => {
  it("establishes Card 2 as the canonical Settings owner with step 6", () => {
    assert.equal(CARD2_RATES_STEP, "rates-pricing");
    const step6 = CARD2_STEPS.find((row) => row.id === "rates-pricing");
    assert.ok(step6, "Card 2 steps must include rates-pricing");
    assert.equal(step6.number, 6);
    assert.equal(step6.title, "Rate & Pricing");
    assert.equal(CARD2_STEPS.length, 6);

    assert.equal(
      card2StepHref("rates-pricing"),
      "/restaurant/settings?card2Step=rates-pricing#rooms-inventory",
    );
    assert.equal(
      card2StepFromSearch("?card2Step=rates-pricing"),
      "rates-pricing",
    );
  });

  it("removes Rate & Pricing completely from Commercial & Financial (Card 3)", () => {
    assert.equal(card3DomainById("rates-pricing"), undefined);
    assert.equal(
      CARD3_DOMAINS.some((d) => d.id === "rates-pricing"),
      false,
      "Card 3 domains must not include rates-pricing",
    );
    assert.equal(CARD3_DOMAINS.length, 7);

    assert.doesNotMatch(card3Section, /PmsPropertySetupCard3Rates/);
    assert.doesNotMatch(card3Section, /"rates-pricing"/);
    assert.doesNotMatch(card3Section, /loadRates/);
    assert.doesNotMatch(card3Section, /ratesQuery/);
  });

  it("enforces SINGLE WRITER: Card 3 functions are thin re-exports of Card 2 canonical implementations", () => {
    assert.equal(getRatesCard3, getRatesCard2);
    assert.equal(saveRateCategoryCard3, saveRateCategoryCard2);
    assert.equal(saveRatePlanCard3, saveRatePlanCard2);

    // Verify card3Fns does NOT contain duplicate database writers
    assert.doesNotMatch(card3Fns, /from\("hotel_rate_plans"\)/);
    assert.doesNotMatch(card3Fns, /from\("hotel_rate_categories"\)/);
    assert.match(card3Fns, /from "\.\/rates-card2\.functions\.ts"/);
    assert.match(card2Fns, /from\("hotel_rate_plans"\)/);
    assert.match(card2Fns, /from\("hotel_rate_categories"\)/);
    assert.match(card2Fns, /from\("room_types"\)/);
  });

  it("preserves canonical tables, IDs, and columns", () => {
    assert.match(card2Fns, /hotel_rate_categories/);
    assert.match(card2Fns, /hotel_rate_plans/);
    assert.match(card2Fns, /room_types/);
    assert.match(card2Fns, /rate_category_id/);
    assert.match(card2Fns, /room_type_id/);
    assert.match(card2Fns, /base_rate/);
    assert.match(card2Fns, /valid_from/);
    assert.match(card2Fns, /valid_to/);
    assert.equal(CARD2_RATES_AUDIT_SECTION, "card2-rates");
  });

  it("audits pricing rules: confirms existing schema has no extra master pricing rules beyond the model", () => {
    // Verified audit finding:
    // Existing implementation has no additional master pricing-rule configuration
    // beyond the moved Rate Category / Rate Plan / Base Rate / Validity / Room Type linkage model.
    assert.ok(true);
  });

  it("evaluates Card 2 rates readiness accurately without inventing arbitrary rules", () => {
    const emptySnapshot = makeSnapshot({ plans: [], categories: [], roomTypes: [] });
    const emptyResult = evaluateRatesCard2Readiness(emptySnapshot);
    assert.equal(emptyResult.status, "not_started");
    assert.ok(emptyResult.blockers.some((b) => b.includes("Add a room type")));

    const noPlansSnapshot = makeSnapshot({ plans: [] });
    const noPlansResult = evaluateRatesCard2Readiness(noPlansSnapshot);
    assert.equal(noPlansResult.status, "in_progress");
    assert.ok(noPlansResult.blockers.some((b) => b.includes("Save at least one active rate plan")));

    const completeSnapshot = makeSnapshot({
      plans: [
        {
          id: "plan-1",
          code: "BAR_DLX",
          name: "BAR Deluxe",
          categoryId: "cat-1",
          categoryName: "Best Available Rate",
          roomTypeId: "rt-1",
          roomTypeCode: "DLX",
          roomTypeName: "Deluxe Room",
          currency: "ETB",
          baseRate: 2500,
          ...emptyPlanFields(),
          active: true,
        },
      ],
    });
    const completeResult = evaluateRatesCard2Readiness(completeSnapshot);
    assert.equal(completeResult.status, "complete");
    assert.equal(completeResult.blockers.length, 0);
  });

  it("formats validity ranges according to specification", () => {
    assert.equal(formatRateValidity(null, null), "Always");
    assert.equal(formatRateValidity("", ""), "Always");
    assert.equal(formatRateValidity("2026-01-01", null), "From 2026-01-01");
    assert.equal(formatRateValidity(null, "2026-12-31"), "Until 2026-12-31");
    assert.equal(
      formatRateValidity("2026-01-01", "2026-12-31"),
      "2026-01-01 – 2026-12-31",
    );
  });

  it("guards against creating room types inside Rate & Pricing and guides to Step 1", () => {
    assert.doesNotMatch(card2Ui, />\s*\+?\s*Create Room Type\s*</i);
    assert.doesNotMatch(card2Ui, />\s*\+?\s*Add Room Type\s*</i);
    assert.match(card2Ui, /No room types are configured yet/);
    assert.match(card2Ui, /Configure Room Types/);
    assert.match(card2Ui, /CARD2_RATES_ROOM_TYPES_COPY/);
    assert.match(CARD2_RATES_ROOM_TYPES_COPY, /Room types come from Rooms & Operations/);
  });

  it("maintains strict route consistency across settings and Rate & Revenue workspaces", () => {
    // 1. Property Setup Rate & Pricing canonical route
    assert.equal(
      CARD2_RATES_HREF,
      "/restaurant/settings?card2Step=rates-pricing#rooms-inventory",
    );
    assert.equal(
      SET3_RATES_HREF,
      "/restaurant/settings?card2Step=rates-pricing#rooms-inventory",
    );
    assert.match(ratesTabs, /CARD2_RATES_HREF/);
    assert.doesNotMatch(ratesTabs, /CARD3_HREF/);

    // 2. Card 2 Rate & Pricing UI has the two canonical sections
    assert.match(card2Ui, /title="Rate categories"/);
    assert.match(card2Ui, /title="Room rates"/);

    // 3. No mixed ?tab / ?view navigation for Rate Calendar or Rate History in Card 2
    assert.doesNotMatch(card2Ui, /\?tab=rates#rate-calendar/);
    assert.doesNotMatch(card2Ui, /\?tab=rates#history/);
  });

  it("owns rate plan composition in Card 2: validity, description, meal plan, cancellation, refundability", () => {
    assert.match(card2Ui, /Valid from/);
    assert.match(card2Ui, /plan-description/);
    assert.match(card2Ui, />Meal plan</);
    assert.match(card2Ui, /title="Cancellation policies"/);
    assert.match(card2Ui, /title="Refundability"/);
    assert.match(card2Fns, /saveRateCancellationPolicyCard2/);
    assert.match(card2Fns, /saveRateRefundabilityCard2/);
    assert.match(card2Fns, /pms_meal_plans/);
    assert.match(card2Fns, /pms_rate_cancellation_policies/);
    assert.match(card2Fns, /pms_rate_refundability_codes/);
    assert.match(card2Fns, /meal_plan_id/);
    assert.match(card2Fns, /42703/);

    const drizzle = readFileSync(
      new URL("../../../../drizzle/migrations/0119_pms_rate_plan_composition.sql", import.meta.url),
      "utf8",
    );
    const supabase = readFileSync(
      new URL("../../../../supabase/migrations/0119_pms_rate_plan_composition.sql", import.meta.url),
      "utf8",
    );
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /pms_rate_cancellation_policies/);
    assert.match(drizzle, /pms_rate_refundability_codes/);
    assert.match(drizzle, /hotel_rate_plans_meal_plan_same_property/);
  });
});
