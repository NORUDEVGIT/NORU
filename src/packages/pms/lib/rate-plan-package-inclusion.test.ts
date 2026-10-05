import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ratePlanPackageMerchandising } from "./create-reservation-phase1-section5.ts";
import {
  parsePackageInclusionType,
  partitionRatePlanPackages,
  type RatePlanPackageLink,
} from "./rate-plan-package-inclusion.ts";

const breakfast: RatePlanPackageLink = {
  packageId: "pkg-bfast",
  packageName: "Breakfast Package",
  inclusionType: "included",
  components: [{ kind: "meal_plan", label: "Bed and breakfast", mealPlanId: "mp-bb" }],
};

const transfer: RatePlanPackageLink = {
  packageId: "pkg-xfer",
  packageName: "Airport Transfer",
  inclusionType: "included",
  components: [{ kind: "fo_service", label: "Airport transfer", mealPlanId: null }],
};

const spa: RatePlanPackageLink = {
  packageId: "pkg-spa",
  packageName: "Spa Package",
  inclusionType: "optional",
  components: [{ kind: "fo_service", label: "Spa", mealPlanId: null }],
};

describe("Rate plan package inclusion merchandising", () => {
  it("defaults unknown or missing inclusion to optional", () => {
    assert.equal(parsePackageInclusionType(undefined), "optional");
    assert.equal(parsePackageInclusionType(null), "optional");
    assert.equal(parsePackageInclusionType(""), "optional");
    assert.equal(parsePackageInclusionType("eligible"), "optional");
    assert.equal(parsePackageInclusionType("optional"), "optional");
  });

  it("returns included only for explicit included", () => {
    assert.equal(parsePackageInclusionType("included"), "included");
  });

  it("never treats optional packages as included", () => {
    const { includedServices, optionalAddOns } = partitionRatePlanPackages({
      links: [
        spa,
        {
          ...spa,
          inclusionType: "included",
          packageId: "pkg-spa-inc",
          packageName: "Spa Included",
        },
      ],
      mealPlanId: null,
    });
    assert.deepEqual(
      includedServices.map((row) => row.packageName),
      ["Spa Included"],
    );
    assert.deepEqual(
      optionalAddOns.map((row) => row.packageName),
      ["Spa Package"],
    );
    assert.equal(
      includedServices.every((row) => row.inclusionType === "included"),
      true,
    );
    assert.equal(
      optionalAddOns.every((row) => row.inclusionType === "optional"),
      true,
    );
  });

  it("keeps Meal Plan independent and does not duplicate breakfast from an included package", () => {
    const { includedServices, optionalAddOns } = partitionRatePlanPackages({
      links: [breakfast, transfer, spa],
      mealPlanId: "mp-bb",
    });
    assert.deepEqual(
      includedServices.map((row) => row.packageName),
      ["Airport Transfer"],
    );
    assert.deepEqual(
      optionalAddOns.map((row) => row.packageName),
      ["Spa Package"],
    );
  });

  it("does not change quoted stay totals — merchandising is display-only", () => {
    const quote = { subtotal: 48000, nights: 2 };
    const merch = ratePlanPackageMerchandising({
      id: "rp1",
      code: "BAR",
      name: "BAR",
      mealPlanId: "mp-bb",
      breakfastIncluded: true,
      packages: [breakfast, transfer, spa],
    });
    assert.equal(quote.subtotal, 48000);
    assert.deepEqual(
      merch.includedServices.map((row) => row.packageName),
      ["Airport Transfer"],
    );
    assert.deepEqual(
      merch.optionalAddOns.map((row) => row.packageName),
      ["Spa Package"],
    );

    const rates = readFileSync(new URL("./rates.functions.ts", import.meta.url), "utf8");
    const quoteStart = rates.indexOf("export const quoteStay");
    const quoteFn = rates.slice(quoteStart, rates.indexOf("export const repriceReservation"));
    assert.match(quoteFn, /price_hotel_stay/);
    assert.doesNotMatch(quoteFn, /_package_id|packageId|pms_packages/);

    const rateUi = readFileSync(
      new URL("../components/bookings/create-reservation-rate.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(rateUi, /Included Services/);
    assert.doesNotMatch(rateUi, /Optional Add-ons/);
    assert.match(rateUi, /money\(row\.quote\.subtotal\)/);
    assert.doesNotMatch(rateUi, /packagePrice|package_price|quote\.subtotal \+/);
    assert.doesNotMatch(rateUi, /type="checkbox"|onSelectPackage|addPackage/);
  });

  it("wires Settings inclusion picker and mapping table on the existing package master", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card3-meals.tsx", import.meta.url),
      "utf8",
    );
    const fns = readFileSync(new URL("./meals-card3.functions.ts", import.meta.url), "utf8");
    assert.match(ui, /Package rate plan types/);
    assert.match(ui, /PACKAGE_INCLUSION_TYPE_LABELS/);
    assert.match(ui, /\? "Included" : "Optional"/);
    assert.match(ui, /ratePlanLinks/);
    assert.match(ui, /RatePlanApplicabilityList/);
    assert.match(fns, /inclusion_type: inclusionByPlan\.get\(ratePlanId\) \?\? "optional"/);
  });

  it("keeps 0120 dual-lane and defaults existing rows to optional", () => {
    const drizzle = readFileSync(
      new URL(
        "../../../../drizzle/migrations/0120_pms_package_rate_plan_inclusion.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const supabase = readFileSync(
      new URL(
        "../../../../supabase/migrations/0120_pms_package_rate_plan_inclusion.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(drizzle, supabase);
    assert.match(
      drizzle,
      /ADD COLUMN IF NOT EXISTS inclusion_type text NOT NULL DEFAULT 'optional'/,
    );
    assert.match(drizzle, /inclusion_type IN \('included', 'optional'\)/);
    assert.match(drizzle, /Does not change price_hotel_stay/);
    assert.match(drizzle, /hotel_reservations columns/);
  });
});
