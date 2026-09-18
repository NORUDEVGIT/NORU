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

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./rates-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./rates-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-rates.tsx", import.meta.url),
  "utf8",
);

function snapshot(partial?: Partial<RatesCard3Snapshot>): RatesCard3Snapshot {
  return {
    roomTypes: [{ id: "rt1", code: "DLX", name: "Deluxe", active: true }],
    categories: [],
    plans: [],
    calendar: [],
    ...partial,
  };
}

describe("Card 3 Phase 3 rates readiness", () => {
  it("stays not started until a plan exists and never completes the Card 3 programme", () => {
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
    assert.doesNotMatch(fns, /rates-guest-rules/);
    assert.doesNotMatch(fns, /pms_property_setup_status/);
  });

  it("reads Card 2 room types and never writes types, inventory, or reservation snapshots", () => {
    assert.match(fns, /from\("room_types"\)/);
    assert.match(fns, /from\("hotel_rate_plans"\)/);
    assert.match(fns, /from\("hotel_rate_calendar"\)/);
    assert.doesNotMatch(fns, /from\("pms_rate/);
    assert.doesNotMatch(fns, /insert\(\{[^}]*room_types/);
    assert.doesNotMatch(fns, /from\("pms_inventory_rules"\)/);
    assert.doesNotMatch(fns, /from\("hotel_reservations"\)/);
    assert.doesNotMatch(fns, /repriceReservation/);
    assert.doesNotMatch(fns, /nightly_rate_snapshot/);
    assert.match(fns, /That room type doesn't belong to this property/);
    assert.match(server, /Derived and corporate-style pricing is not in this schema/);
  });

  it("reads as a member, writes as owner/manager, and audits on the shared staff log", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.match(fns, /requireRoomManager/);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.match(fns, /card3_rate_category_saved/);
    assert.match(fns, /card3_rate_plan_saved/);
    assert.match(fns, /card3_rate_override_saved/);
    assert.equal(CARD3_RATES_AUDIT_SECTION, "card3-rates");
    assert.doesNotMatch(fns, /Database\[/);
  });

  it("keeps four rates tabs while Meal Plans owns its Phase 4 workspace", () => {
    assert.deepEqual(
      CARD3_RATES_TABS.map((tab) => tab.label),
      ["Overview", "Rate Plans", "Room Rates", "Rate Calendar"],
    );
    assert.match(section, /PmsPropertySetupCard3Rates/);
    assert.match(ui, /CARD3_RATES_DERIVED_COPY/);
    assert.match(ui, /CARD3_RATES_CARD2_COPY/);
    assert.match(section, /CARD3_DOMAIN_PLACEHOLDER/);
    assert.equal(
      existsSync(join(here, "../components/settings/pms-property-setup-card3-meals.tsx")),
      true,
    );
    assert.match(section, /PmsPropertySetupCard3Meals/);
    assert.doesNotMatch(ui, /Meal Plans & Packages/);
  });
});
