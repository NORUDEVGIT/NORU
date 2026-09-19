import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  evaluateCard5DepartmentsReadiness,
  hoursConfigured,
  parseOperatingHours,
  wouldCreateCycle,
  type Card5Department,
  type Card5DepartmentsSnapshot,
} from "./departments-card5.server.ts";
import { emptyDepartmentDraft, emptyOperatingHours } from "./departments-card5.server.ts";

function dept(
  partial: Partial<Card5Department> & Pick<Card5Department, "id" | "code" | "name">,
): Card5Department {
  return emptyDepartmentDraft({
    ...partial,
    operatingHours: partial.operatingHours ?? emptyOperatingHours({ is24Hours: true }),
    active: partial.active !== false,
  });
}

describe("Card 5 department hierarchy", () => {
  it("blocks self-parent and multi-level cycles", () => {
    const rows = [
      dept({ id: "a", code: "A", name: "Ops", parentId: null }),
      dept({ id: "b", code: "B", name: "HK", parentId: "a" }),
      dept({ id: "c", code: "C", name: "Laundry", parentId: "b" }),
    ];
    assert.equal(wouldCreateCycle(rows, "a", "a"), true);
    assert.equal(wouldCreateCycle(rows, "a", "c"), true);
    assert.equal(wouldCreateCycle(rows, "c", "a"), false);
    assert.equal(wouldCreateCycle(rows, null, "missing"), true);
  });
});

describe("Card 5 operating hours", () => {
  it("treats 24-hour or a daily window as configured", () => {
    assert.equal(hoursConfigured(emptyOperatingHours()), false);
    assert.equal(hoursConfigured(emptyOperatingHours({ is24Hours: true })), true);
    assert.equal(
      hoursConfigured(
        parseOperatingHours({ is24Hours: false, daily: { open: "06:00", close: "22:00" } }),
      ),
      true,
    );
    assert.equal(
      hoursConfigured(parseOperatingHours({ daily: { open: "bad", close: "22:00" } })),
      false,
    );
  });
});

describe("Card 5 department readiness", () => {
  it("does not complete Card 5 as a whole and only scores the departments domain", () => {
    const empty: Card5DepartmentsSnapshot = { departments: [], routing: [], staff: [] };
    assert.equal(evaluateCard5DepartmentsReadiness(empty).status, "not_started");
    const ready = evaluateCard5DepartmentsReadiness({
      departments: [dept({ id: "a", code: "HK", name: "Housekeeping" })],
      routing: [
        {
          id: "r1",
          serviceKey: "room_cleaning",
          departmentId: "a",
          defaultRole: "housekeeper",
          description: "",
          active: true,
        },
      ],
      staff: [],
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.status, "complete");
    const cyclic = evaluateCard5DepartmentsReadiness({
      departments: [
        dept({ id: "a", code: "A", name: "A", parentId: "b" }),
        dept({ id: "b", code: "B", name: "B", parentId: "a" }),
      ],
      routing: [],
      staff: [],
    });
    assert.equal(cyclic.ready, false);
    assert.ok(cyclic.blockers.some((row) => /hierarchy/i.test(row)));
    const missingManager = evaluateCard5DepartmentsReadiness({
      departments: [dept({ id: "a", code: "HK", name: "Housekeeping", managerUserId: "missing" })],
      routing: [],
      staff: [{ userId: "staff-1", name: "Ada", role: "manager", active: true }],
    });
    assert.equal(missingManager.ready, false);
    assert.ok(missingManager.blockers.some((row) => /manager is not on this property/i.test(row)));
  });
});

describe("Card 5 department isolation", () => {
  it("does not write SET5 folio routing, Card 2, Card 3, or types.ts", () => {
    const functions = readFileSync(
      new URL("./departments-card5.functions.ts", import.meta.url),
      "utf8",
    );
    const tab = readFileSync(
      new URL("../components/settings/pms-card5-departments-tab.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [functions, tab]) {
      assert.doesNotMatch(source, /pms_routing_defaults/);
      assert.doesNotMatch(source, /pms_property_setup_status/);
      assert.doesNotMatch(source, /preventive_assigned_department_id/);
      assert.doesNotMatch(source, /fo_guest_requests/);
    }
    assert.match(functions, /pms_departments/);
    assert.match(functions, /pms_department_routing_rules/);
    assert.match(functions, /restaurant_staff_audit_log/);
    assert.match(functions, /canEditSet1/);
    assert.doesNotMatch(functions, /from\("pms_work_centers"\)/);
  });
});
