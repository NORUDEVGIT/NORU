import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyFacilityDraft,
  evaluateCard5FacilitiesReadiness,
  validCapacityOrder,
  type Card5FacilitiesSnapshot,
} from "./outlets-card5.server.ts";
import { emptyOperatingHours } from "./departments-card5.server.ts";

const snapshot = (facilities: Card5FacilitiesSnapshot["facilities"]): Card5FacilitiesSnapshot => ({
  facilities,
  buildings: [],
  floors: [],
  wings: [],
  departments: [],
  staff: [],
  taxGroups: [],
  currencies: [],
});

describe("Card 5 facility capacity", () => {
  it("accepts partial capacity and enforces minimum ≤ standard ≤ maximum", () => {
    assert.equal(validCapacityOrder(null, null, null), true);
    assert.equal(validCapacityOrder(10, 20, 30), true);
    assert.equal(validCapacityOrder(10, null, 30), true);
    assert.equal(validCapacityOrder(30, 20, 10), false);
    assert.equal(validCapacityOrder(-1, null, null), false);
  });
});

describe("Card 5 Outlets & Facilities readiness", () => {
  it("scores only this domain and validates classification, code, capacity, and references", () => {
    assert.equal(evaluateCard5FacilitiesReadiness(snapshot([])).status, "not_started");
    const ready = emptyFacilityDraft({
      id: "one",
      code: "CONF",
      name: "Conference Hall",
      facilityCategory: "events",
      facilityTypeCode: "conference_hall",
      availabilityMode: "scheduled",
      operatingHours: emptyOperatingHours({
        daily: { open: "08:00", close: "18:00" },
      }),
    });
    assert.equal(evaluateCard5FacilitiesReadiness(snapshot([ready])).ready, true);

    const invalid = {
      ...ready,
      minimumCapacity: 100,
      standardCapacity: 50,
      maximumCapacity: 20,
      buildingId: "missing",
    };
    const result = evaluateCard5FacilitiesReadiness(snapshot([invalid]));
    assert.equal(result.ready, false);
    assert.ok(result.blockers.some((row) => /capacity/i.test(row)));
    assert.ok(result.blockers.some((row) => /building/i.test(row)));

    const floorMismatch = evaluateCard5FacilitiesReadiness({
      ...snapshot([
        {
          ...ready,
          buildingId: "b1",
          floorId: "f1",
        },
      ]),
      buildings: [{ id: "b1", name: "Main", active: true }],
      floors: [{ id: "f1", name: "L2", active: true, buildingId: "b2" }],
    });
    assert.ok(floorMismatch.blockers.some((row) => /floor does not belong/i.test(row)));
    const negativeLead = evaluateCard5FacilitiesReadiness(
      snapshot([{ ...ready, minimumLeadMinutes: -5 }]),
    );
    assert.ok(negativeLead.blockers.some((row) => /lead time/i.test(row)));
  });
});

describe("Card 5 Outlets & Facilities ownership", () => {
  it("writes only pms_outlets and reuses SET2 audit without operational domains", () => {
    const functions = readFileSync(
      new URL("./outlets-card5.functions.ts", import.meta.url),
      "utf8",
    );
    const tab = readFileSync(
      new URL("../components/settings/pms-card5-outlets-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(functions, /from\("pms_outlets"\)/);
    assert.match(functions, /SET2_AUDIT_OUTLET/);
    assert.match(functions, /restaurant_staff_audit_log/);
    assert.match(functions, /canEditSet1/);
    assert.doesNotMatch(functions, /from\("pms_facilities"\)/);
    for (const source of [functions, tab]) {
      assert.doesNotMatch(source, /event_bookings|maintenance_events|closure_records/);
      assert.doesNotMatch(source, /pms_property_setup_status/);
    }
  });
});
