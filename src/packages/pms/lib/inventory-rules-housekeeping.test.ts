import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ruleStateLabel } from "@/packages/pms/components/rooms/room-inventory-rule-catalog";
import {
  canonicalHousekeepingReadiness,
  defaultInventoryRules,
  housekeepingAssignmentColumns,
  normalizeInventoryRules,
} from "./inventory-rules-card2.server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");

/** What the single toggle shows for a stored (legacy A, canonical B) pair. */
function shown(affectsAssignment: boolean, requireReadiness: boolean): boolean {
  return canonicalHousekeepingReadiness(requireReadiness, affectsAssignment);
}

describe("canonical housekeeping readiness", () => {
  it("shows OFF and saves both columns false when both stored flags are off", () => {
    expect(shown(false, false)).toBe(false);
    expect(housekeepingAssignmentColumns(false)).toEqual({
      housekeeping_affects_assignment: false,
      require_housekeeping_readiness: false,
    });
  });

  it("shows ON and saves both columns true when only the legacy flag is on", () => {
    expect(shown(true, false)).toBe(true);
    const loaded = normalizeInventoryRules({
      ...defaultInventoryRules(),
      housekeepingAffectsAssignment: true,
      requireHousekeepingReadiness: shown(true, false),
    });
    expect(loaded.requireHousekeepingReadiness).toBe(true);
    expect(housekeepingAssignmentColumns(loaded.requireHousekeepingReadiness)).toEqual({
      housekeeping_affects_assignment: true,
      require_housekeeping_readiness: true,
    });
  });

  it("shows ON and saves both columns true when only the canonical flag is on", () => {
    expect(shown(false, true)).toBe(true);
    const loaded = normalizeInventoryRules({
      ...defaultInventoryRules(),
      housekeepingAffectsAssignment: false,
      requireHousekeepingReadiness: shown(false, true),
    });
    expect(loaded.requireHousekeepingReadiness).toBe(true);
    expect(housekeepingAssignmentColumns(loaded.requireHousekeepingReadiness)).toEqual({
      housekeeping_affects_assignment: true,
      require_housekeeping_readiness: true,
    });
  });

  it("shows ON when both stored flags are on", () => {
    expect(shown(true, true)).toBe(true);
  });

  it("writes both columns false when the canonical toggle is turned off", () => {
    const turnedOff = normalizeInventoryRules({
      ...defaultInventoryRules(),
      housekeepingAffectsAssignment: true,
      requireHousekeepingReadiness: false,
      requireOccupancyMatch: true,
      maintenanceAffectsAvailability: true,
      requireBedTypeMatch: true,
    });
    expect(turnedOff.requireHousekeepingReadiness).toBe(false);
    expect(turnedOff.housekeepingAffectsAssignment).toBe(false);
    expect(housekeepingAssignmentColumns(turnedOff.requireHousekeepingReadiness)).toEqual({
      housekeeping_affects_assignment: false,
      require_housekeeping_readiness: false,
    });
    expect(turnedOff.requireOccupancyMatch).toBe(true);
    expect(turnedOff.maintenanceAffectsAvailability).toBe(true);
    expect(turnedOff.requireBedTypeMatch).toBe(true);
  });

  it("keeps assignment eligibility on the existing either-flag check and adds no migration", () => {
    const eligibility = readFileSync(
      join(root, "supabase/migrations/0168_room_assignment_eligibility_qualification.sql"),
      "utf8",
    );
    const helper = readFileSync(
      join(root, "supabase/migrations/0205_room_assignment_hard_rule_consistency.sql"),
      "utf8",
    );
    const functions = readFileSync(join(here, "inventory-rules.functions.ts"), "utf8");
    const setup = readFileSync(
      join(root, "src/packages/pms/components/settings/pms-property-setup-card2-inventory.tsx"),
      "utf8",
    );
    const catalog = readFileSync(
      join(root, "src/packages/pms/components/rooms/room-inventory-rule-catalog.ts"),
      "utf8",
    );
    const migrations = readdirSync(join(root, "supabase/migrations"));

    expect(eligibility).toContain(
      "IF _for_check_in OR rule_require_housekeeping OR rule_housekeeping_affects THEN",
    );
    expect(helper).toContain(
      "COALESCE(rules.require_housekeeping_readiness, false)\n      OR COALESCE(rules.housekeeping_affects_assignment, false)",
    );
    expect(functions).toContain("canonicalHousekeepingReadiness(");
    expect(functions).toContain("housekeepingAssignmentColumns(rules.requireHousekeepingReadiness)");
    expect(functions).not.toContain(
      "housekeeping_affects_assignment: rules.housekeepingAffectsAssignment",
    );
    expect(setup).not.toContain("housekeepingAffectsAssignment");
    expect(setup).not.toContain("Housekeeping Affects Assignment");
    expect(setup.indexOf('label="Require housekeeping readiness"')).toBeGreaterThan(
      setup.indexOf('title="Operational Readiness"'),
    );
    expect(catalog).not.toContain("housekeepingAffectsAssignment");
    expect(
      migrations.some((name) => /housekeeping_(readiness|assignment)_consolidat/i.test(name)),
    ).toBe(false);
    expect(ruleStateLabel("blocking", true)).toBe("Blocking");
    expect(ruleStateLabel("blocking", false)).toBe("Disabled");
  });
});
