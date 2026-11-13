import { describe, expect, it } from "vitest";

import {
  defaultInventoryRules,
  normalizeInventoryRules,
} from "@/packages/pms/lib/inventory-rules-card2.server";

import {
  ASSIGNMENT_RULES,
  AVAILABILITY_RULES,
  GUEST_MATCHING_RULES,
  OPERATIONAL_REQUIREMENT_RULES,
  highImpactConsequences,
  ruleStateLabel,
  rulesChanged,
} from "./room-inventory-rule-catalog";

describe("inventory rule catalog", () => {
  it("lists every visible rule flag exactly once", () => {
    const keys = [...AVAILABILITY_RULES, ...ASSIGNMENT_RULES].map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(13);
    expect(OPERATIONAL_REQUIREMENT_RULES).toHaveLength(5);
    expect(GUEST_MATCHING_RULES).toHaveLength(6);
  });

  it("labels on and off states without calling an off rule enforced", () => {
    expect(ruleStateLabel("blocking", true)).toBe("Blocking");
    expect(ruleStateLabel("preference", true)).toBe("Preference");
    expect(ruleStateLabel("blocking", false)).toBe("Disabled");
    expect(ruleStateLabel("preference", false)).toBe("Disabled");
    const preferenceKeys = ASSIGNMENT_RULES.filter((rule) => rule.kind === "preference").map(
      (rule) => rule.key,
    );
    expect(preferenceKeys).toEqual([
      "useBuildingPreference",
      "useFloorPreference",
      "useGuestPreference",
    ]);
  });

  it("detects unsaved changes against the saved rules", () => {
    const saved = normalizeInventoryRules(defaultInventoryRules());
    expect(rulesChanged(saved, saved)).toBe(false);
    expect(rulesChanged(saved, { ...saved, requireOccupancyMatch: true })).toBe(true);
    expect(rulesChanged(null, saved)).toBe(false);
  });

  it("explains high-impact changes before save", () => {
    const saved = normalizeInventoryRules({
      ...defaultInventoryRules(),
      requireOccupancyMatch: true,
      blockTypes: defaultInventoryRules().blockTypes.map((row) =>
        row.blockType === "maintenance"
          ? { ...row, enabled: true, inventoryImpact: "remove_from_inventory" }
          : row,
      ),
    });
    const draft = normalizeInventoryRules({
      ...saved,
      sellableStatusRequired: false,
      requireRoomTypeMatch: false,
      requireOccupancyMatch: false,
      blockTypes: saved.blockTypes.map((row) =>
        row.blockType === "maintenance" ? { ...row, enabled: false } : row,
      ),
    });
    const lines = highImpactConsequences(saved, draft);
    expect(lines).toHaveLength(4);
    expect(lines.join(" ")).toContain("not sellable");
    expect(lines.join(" ")).toContain("different room type");
    expect(lines.join(" ")).toContain("maximum occupancy");
    expect(lines.join(" ")).toContain("Maintenance blocks can no longer be created");
    expect(highImpactConsequences(saved, { ...saved, useFloorPreference: true })).toEqual([]);
  });
});
