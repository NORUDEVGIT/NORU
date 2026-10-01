import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_RATES_AUDIT_SECTION,
  CARD3_RATES_TABS,
  evaluateRatesCard3Readiness,
  type RatesCard3Snapshot,
} from "./rates-card3.server.ts";
import {
  getRatesCard3,
  saveRateCategoryCard3,
  saveRatePlanCard3,
  loadRatesCard3Snapshot,
} from "./rates-card3.functions.ts";
import {
  getRatesCard2,
  saveRateCategoryCard2,
  saveRatePlanCard2,
  loadRatesCard2Snapshot,
} from "./rates-card2.functions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./rates-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./rates-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const card2Fns = readFileSync(new URL("./rates-card2.functions.ts", import.meta.url), "utf8");

function snapshot(partial?: Partial<RatesCard3Snapshot>): RatesCard3Snapshot {
  return {
    roomTypes: [{ id: "rt1", code: "DLX", name: "Deluxe", active: true }],
    categories: [],
    plans: [],
    ...partial,
  };
}

describe("Card 3 rates compatibility aliases", () => {
  it("delegates readiness to Card 2 evaluator without completing Card 3 programme", () => {
    const empty = evaluateRatesCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    const started = evaluateRatesCard3Readiness(
      snapshot({
        plans: [
          {
            id: "p1",
            code: "BAR",
            name: "BAR Deluxe",
            categoryId: "c1",
            categoryName: "BAR",
            roomTypeId: "rt1",
            roomTypeCode: "DLX",
            roomTypeName: "Deluxe",
            currency: "ETB",
            baseRate: 0,
            active: true,
          },
        ],
      }),
    );
    assert.equal(started.status, "in_progress");
    const complete = evaluateRatesCard3Readiness(
      snapshot({
        plans: [
          {
            id: "p1",
            code: "BAR",
            name: "BAR Deluxe",
            categoryId: "c1",
            categoryName: "BAR",
            roomTypeId: "rt1",
            roomTypeCode: "DLX",
            roomTypeName: "Deluxe",
            currency: "ETB",
            baseRate: 2500,
            active: true,
          },
        ],
      }),
    );
    assert.equal(complete.status, "complete");
  });

  it("re-exports canonical Card 2 functions as thin aliases with zero duplicate logic", () => {
    assert.equal(getRatesCard3, getRatesCard2);
    assert.equal(saveRateCategoryCard3, saveRateCategoryCard2);
    assert.equal(saveRatePlanCard3, saveRatePlanCard2);
    assert.equal(loadRatesCard3Snapshot, loadRatesCard2Snapshot);

    assert.match(fns, /from "\.\/rates-card2\.functions\.ts"/);
    assert.doesNotMatch(fns, /from\("hotel_rate_plans"\)/);
    assert.match(card2Fns, /from\("room_types"\)/);
    assert.match(card2Fns, /from\("hotel_rate_plans"\)/);
    assert.match(card2Fns, /That room type doesn't belong to this property/);
  });

  it("proves Card 3 no longer renders Rate & Pricing after the move to Card 2", () => {
    assert.doesNotMatch(section, /PmsPropertySetupCard3Rates/);
    assert.doesNotMatch(section, /"rates-pricing"/);
    assert.doesNotMatch(section, /loadRates/);
    assert.doesNotMatch(section, /ratesQuery/);
    assert.equal(
      existsSync(join(here, "../components/settings/pms-property-setup-card3-meals.tsx")),
      true,
    );
    assert.match(section, /PmsPropertySetupCard3Meals/);
  });
});
