import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePropertySetupStatus } from "./pms-property-setup-card1.ts";
import {
  INVENTORY_BLOCK_TYPES,
  INVENTORY_IMPACTS,
  OVERBOOKING_CAPACITY_NOTE,
  card2InventoryStepStatus,
  defaultInventoryRules,
  evaluateCard2InventoryReadiness,
  inventoryRulesErrors,
  mergeCard2InventoryStatus,
  normalizeInventoryRules,
} from "./inventory-rules-card2.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const functions = readFileSync(join(here, "inventory-rules.functions.ts"), "utf8");
const roomsFns = readFileSync(join(here, "rooms.functions.ts"), "utf8");

describe("Card 2 Phase 4 inventory validators", () => {
  it("requires an assignment mode and nine unique block types", () => {
    const base = defaultInventoryRules();
    assert.equal(INVENTORY_BLOCK_TYPES.length, 9);
    assert.equal(INVENTORY_IMPACTS.length, 4);
    assert.deepEqual(inventoryRulesErrors(base), []);
    assert.ok(
      inventoryRulesErrors({
        ...base,
        manualAssignmentAllowed: false,
        automaticAssignmentAllowed: false,
      }).includes("At least one assignment mode (manual or automatic) must be allowed."),
    );
    assert.ok(
      inventoryRulesErrors({ ...base, blockTypes: base.blockTypes.slice(0, 8) }).some((row) =>
        row.includes("nine supported types"),
      ),
    );
    assert.ok(
      inventoryRulesErrors({
        ...base,
        blockTypes: [...base.blockTypes, { ...base.blockTypes[0] }],
      }).includes("Duplicate block type."),
    );
    assert.ok(
      inventoryRulesErrors({
        ...base,
        blockTypes: [{ ...base.blockTypes[0], blockType: "vip_block" as never }, ...base.blockTypes.slice(1)],
      }).includes("Unknown block type."),
    );
    assert.ok(
      inventoryRulesErrors({
        ...base,
        blockTypes: [{ ...base.blockTypes[0], inventoryImpact: "none" as never }, ...base.blockTypes.slice(1)],
      }).includes("Unknown inventory impact."),
    );
  });

  it("rejects overbooking numerics outside 0–100 / negative", () => {
    const base = defaultInventoryRules();
    assert.ok(
      inventoryRulesErrors({ ...base, overbookingAllowed: true, maximumOverbooking: -1 }).some((row) =>
        row.includes("Maximum overbooking"),
      ),
    );
    assert.deepEqual(
      inventoryRulesErrors({ ...base, overbookingAllowed: true, maximumOverbooking: 0, percentageLimit: 0 }),
      [],
    );
    assert.deepEqual(
      inventoryRulesErrors({ ...base, overbookingAllowed: true, percentageLimit: 100 }),
      [],
    );
    assert.ok(
      inventoryRulesErrors({ ...base, overbookingAllowed: true, percentageLimit: -0.1 }).some((row) =>
        row.includes("Percentage limit"),
      ),
    );
    assert.ok(
      inventoryRulesErrors({ ...base, overbookingAllowed: true, percentageLimit: 100.1 }).some((row) =>
        row.includes("Percentage limit"),
      ),
    );
  });
});

describe("Card 2 Phase 4 inventory normalization", () => {
  it("turns move off and overbooking off dependents to false/null", () => {
    const moved = normalizeInventoryRules({
      ...defaultInventoryRules(),
      roomMoveAllowed: false,
      roomTypeChangeAllowed: true,
      rateRecalculationRequired: true,
      moveApprovalRequired: true,
      moveReasonRequired: true,
      inventoryRecalculationRequired: true,
      housekeepingUpdateRequired: true,
      maintenanceValidationRequired: true,
    });
    assert.equal(moved.roomTypeChangeAllowed, false);
    assert.equal(moved.rateRecalculationRequired, false);
    assert.equal(moved.moveApprovalRequired, false);
    assert.equal(moved.moveReasonRequired, false);
    assert.equal(moved.inventoryRecalculationRequired, false);
    assert.equal(moved.housekeepingUpdateRequired, false);
    assert.equal(moved.maintenanceValidationRequired, false);

    const overbook = normalizeInventoryRules({
      ...defaultInventoryRules(),
      overbookingAllowed: false,
      maximumOverbooking: 4,
      percentageLimit: 10,
      roomTypeLimitEnabled: true,
      dateBasedLimitEnabled: true,
      managerApprovalRequired: true,
      overridePermissionRequired: true,
      overbookingReasonRequired: true,
      overbookingAlertEnabled: true,
    });
    assert.equal(overbook.maximumOverbooking, null);
    assert.equal(overbook.percentageLimit, null);
    assert.equal(overbook.roomTypeLimitEnabled, false);
    assert.equal(overbook.dateBasedLimitEnabled, false);
    assert.equal(overbook.managerApprovalRequired, false);
    assert.equal(overbook.overridePermissionRequired, false);
    assert.equal(overbook.overbookingReasonRequired, false);
    assert.equal(overbook.overbookingAlertEnabled, false);
  });

  it("normalizes disabled block types", () => {
    const base = defaultInventoryRules();
    const next = normalizeInventoryRules({
      ...base,
      blockTypes: [
        {
          blockType: "vip",
          enabled: false,
          approvalRequired: true,
          inventoryImpact: "remove_from_inventory",
        },
        ...base.blockTypes.filter((row) => row.blockType !== "vip"),
      ],
    });
    const vip = next.blockTypes.find((row) => row.blockType === "vip");
    assert.equal(vip?.approvalRequired, false);
    assert.equal(vip?.inventoryImpact, "no_inventory_impact");
    assert.equal(next.blockTypes.length, 9);
  });
});

describe("Card 2 Phase 4 inventory readiness", () => {
  it("is not ready without a persisted row and ready when saved config is valid", () => {
    const missing = evaluateCard2InventoryReadiness({ persisted: false, rules: defaultInventoryRules() });
    assert.equal(missing.ready, false);
    assert.equal(card2InventoryStepStatus(false, false), "not_started");
    const ready = evaluateCard2InventoryReadiness({ persisted: true, rules: defaultInventoryRules() });
    assert.equal(ready.ready, true);
    assert.equal(ready.configuredButNotOperational, false);
    const overbook = evaluateCard2InventoryReadiness({
      persisted: true,
      rules: { ...defaultInventoryRules(), overbookingAllowed: true, maximumOverbooking: 2 },
    });
    assert.equal(overbook.ready, true);
    assert.equal(overbook.configuredButNotOperational, true);
    assert.ok(OVERBOOKING_CAPACITY_NOTE.includes("capacity enforcement remains unchanged"));
  });

  it("never marks the whole Card 2 complete from inventory-rules readiness", () => {
    const merged = mergeCard2InventoryStatus(
      { cards: { "rooms-inventory": "complete" }, card1Steps: {}, card2Steps: { "room-types": "complete", amenities: "complete" } },
      "complete",
    );
    assert.equal(merged.card2Steps?.["inventory-rules"], "complete");
    assert.equal(merged.card2Steps?.["room-types"], "complete");
    assert.equal(merged.card2Steps?.amenities, "complete");
    assert.notEqual(merged.cards["rooms-inventory"], "complete");
    const parsed = parsePropertySetupStatus({
      cards: {},
      card1Steps: {},
      card2Steps: { "inventory-rules": "complete" },
    });
    assert.equal(parsed.card2Steps?.["inventory-rules"], "complete");
  });
});

describe("Card 2 Phase 4 inventory API wiring", () => {
  it("keeps authz, tenant filters, and persist off rooms.functions", () => {
    assert.match(functions, /export const getInventoryRules/);
    assert.match(functions, /export const saveInventoryRules/);
    assert.match(functions, /export const getInventorySummary/);
    assert.match(functions, /export const evaluateCard2InventoryReadiness/);
    assert.match(functions, /requireRoomManager/);
    assert.match(functions, /requireFrontOfficeAccess/);
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(functions, /onConflict: "restaurant_id"/);
    assert.match(functions, /onConflict: "restaurant_id,block_type"/);
    assert.match(functions, /canonicalEngineSellableRoomCount/);
    assert.match(functions, /hotel_rooms\.sellable is a room-level flag/);
    assert.match(functions, /persistCard2InventoryReadiness/);
    assert.doesNotMatch(functions, /\.rpc\("count_sellable_rooms"\)/);
    assert.doesNotMatch(functions, /\.rpc\("assert_reservation_capacity"\)/);
    assert.doesNotMatch(functions, /Database\["public"\]/);
    assert.doesNotMatch(roomsFns, /persistCard2InventoryReadiness/);
  });
});
