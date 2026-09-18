import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePropertySetupStatus } from "./pms-property-setup-card1.ts";
import {
  DUAL_DIMENSION_NOTE,
  MAINTENANCE_FREQUENCIES,
  MAINTENANCE_STATUS_RULE_STATUSES,
  card2MaintenanceStepStatus,
  defaultMaintenanceRules,
  evaluateCard2MaintenanceReadiness,
  maintenanceRulesErrors,
  mergeCard2MaintenanceStatus,
  normalizeMaintenanceRules,
} from "./maintenance-card2.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const functions = readFileSync(join(here, "maintenance.functions.ts"), "utf8");
const roomsFns = readFileSync(join(here, "rooms.functions.ts"), "utf8");
const roomsServer = readFileSync(join(here, "rooms.server.ts"), "utf8");
const housekeepingFns = readFileSync(join(here, "housekeeping.functions.ts"), "utf8");

describe("Card 2 Phase 5 maintenance validators", () => {
  it("requires exactly six unique canonical statuses", () => {
    const base = defaultMaintenanceRules();
    assert.equal(MAINTENANCE_STATUS_RULE_STATUSES.length, 6);
    assert.deepEqual(maintenanceRulesErrors(base), []);
    assert.ok(
      maintenanceRulesErrors({ ...base, statusRules: base.statusRules.slice(0, 5) }).some((row) =>
        row.includes("six canonical statuses"),
      ),
    );
    assert.ok(
      maintenanceRulesErrors({
        ...base,
        statusRules: [...base.statusRules, { ...base.statusRules[0] }],
      }).includes("Duplicate maintenance status."),
    );
    assert.ok(
      maintenanceRulesErrors({
        ...base,
        statusRules: [
          { ...base.statusRules[0], maintenanceStatus: "repair_complete" as never },
          ...base.statusRules.slice(1),
        ],
      }).includes("Unknown maintenance status."),
    );
    assert.ok(!MAINTENANCE_STATUS_RULE_STATUSES.includes("available" as never));
    assert.ok(!MAINTENANCE_STATUS_RULE_STATUSES.includes("reopened" as never));
  });

  it("rejects invalid frequency, reminder without lead days, and negative lead days", () => {
    const base = defaultMaintenanceRules();
    assert.ok(
      maintenanceRulesErrors({
        ...base,
        preventiveMaintenanceEnabled: true,
        defaultMaintenanceFrequency: "hourly" as never,
      }).includes("Unknown preventive maintenance frequency."),
    );
    for (const frequency of MAINTENANCE_FREQUENCIES) {
      assert.deepEqual(
        maintenanceRulesErrors({
          ...base,
          preventiveMaintenanceEnabled: true,
          defaultMaintenanceFrequency: frequency,
        }),
        [],
      );
    }
    assert.ok(
      maintenanceRulesErrors({
        ...base,
        preventiveMaintenanceEnabled: true,
        preventiveReminderEnabled: true,
        preventiveReminderLeadDays: null,
      }).includes("Preventive reminder requires lead days."),
    );
    assert.ok(
      maintenanceRulesErrors({
        ...base,
        preventiveMaintenanceEnabled: true,
        preventiveReminderEnabled: true,
        preventiveReminderLeadDays: -1,
      }).some((row) => row.includes("lead days")),
    );
    assert.deepEqual(
      maintenanceRulesErrors({
        ...base,
        preventiveMaintenanceEnabled: true,
        preventiveReminderEnabled: true,
        preventiveReminderLeadDays: 3,
      }),
      [],
    );
  });
});

describe("Card 2 Phase 5 maintenance normalization", () => {
  it("clears OOS, OOO, and preventive dependents when disabled", () => {
    const oos = normalizeMaintenanceRules({
      ...defaultMaintenanceRules(),
      operationalOosEnabled: false,
      operationalOosReasonRequired: true,
      operationalOosApprovalRequired: true,
      operationalOosSupervisorApprovalRequired: true,
      operationalOosAssignmentRestricted: true,
      operationalOosMaintenanceClearanceRequired: true,
      operationalOosReopeningInspectionRequired: true,
      operationalOosExpectedCompletionRequired: true,
    });
    assert.equal(oos.operationalOosReasonRequired, false);
    assert.equal(oos.operationalOosApprovalRequired, false);
    assert.equal(oos.operationalOosSupervisorApprovalRequired, false);
    assert.equal(oos.operationalOosAssignmentRestricted, false);
    assert.equal(oos.operationalOosMaintenanceClearanceRequired, false);
    assert.equal(oos.operationalOosReopeningInspectionRequired, false);
    assert.equal(oos.operationalOosExpectedCompletionRequired, false);

    const ooo = normalizeMaintenanceRules({
      ...defaultMaintenanceRules(),
      operationalOooEnabled: false,
      operationalOooReasonRequired: true,
      operationalOooMaintenanceTicketRequired: true,
      operationalOooApprovalRequired: true,
      operationalOooManagerApprovalRequired: true,
      operationalOooAssignmentRestricted: true,
      operationalOooCheckInRestricted: true,
      operationalOooMaintenanceClearanceRequired: true,
      operationalOooReopeningInspectionRequired: true,
    });
    assert.equal(ooo.operationalOooReasonRequired, false);
    assert.equal(ooo.operationalOooMaintenanceTicketRequired, false);
    assert.equal(ooo.operationalOooApprovalRequired, false);
    assert.equal(ooo.operationalOooManagerApprovalRequired, false);
    assert.equal(ooo.operationalOooAssignmentRestricted, false);
    assert.equal(ooo.operationalOooCheckInRestricted, false);
    assert.equal(ooo.operationalOooMaintenanceClearanceRequired, false);
    assert.equal(ooo.operationalOooReopeningInspectionRequired, false);

    const pm = normalizeMaintenanceRules({
      ...defaultMaintenanceRules(),
      preventiveMaintenanceEnabled: false,
      defaultMaintenanceFrequency: "weekly",
      preventiveInspectionRequired: true,
      preventiveReminderEnabled: true,
      preventiveReminderLeadDays: 7,
      preventiveAssignedDepartmentId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(pm.defaultMaintenanceFrequency, "weekly");
    assert.equal(pm.preventiveInspectionRequired, false);
    assert.equal(pm.preventiveReminderEnabled, false);
    assert.equal(pm.preventiveReminderLeadDays, null);
    assert.equal(pm.preventiveAssignedDepartmentId, null);
    assert.equal(pm.statusRules.length, 6);
  });
});

describe("Card 2 Phase 5 maintenance readiness", () => {
  it("is not ready without a persisted row and ready when saved config is valid", () => {
    const missing = evaluateCard2MaintenanceReadiness({
      persisted: false,
      persistedStatusCount: 0,
      rules: defaultMaintenanceRules(),
      departmentValid: true,
    });
    assert.equal(missing.ready, false);
    assert.equal(card2MaintenanceStepStatus(false, false), "not_started");
    const incomplete = evaluateCard2MaintenanceReadiness({
      persisted: true,
      persistedStatusCount: 4,
      rules: defaultMaintenanceRules(),
      departmentValid: true,
    });
    assert.equal(incomplete.ready, false);
    assert.equal(card2MaintenanceStepStatus(false, true), "in_progress");
    const ready = evaluateCard2MaintenanceReadiness({
      persisted: true,
      persistedStatusCount: 6,
      rules: defaultMaintenanceRules(),
      departmentValid: true,
    });
    assert.equal(ready.ready, true);
    assert.ok(DUAL_DIMENSION_NOTE.includes("hotel_rooms.status"));
    assert.ok(DUAL_DIMENSION_NOTE.includes("hotel_rooms.maintenance_status"));
  });

  it("never marks the whole Card 2 complete from maintenance readiness", () => {
    const merged = mergeCard2MaintenanceStatus(
      {
        cards: { "rooms-inventory": "complete" },
        card1Steps: {},
        card2Steps: { "room-types": "complete", amenities: "complete", "inventory-rules": "complete" },
      },
      "complete",
    );
    assert.equal(merged.card2Steps?.maintenance, "complete");
    assert.equal(merged.card2Steps?.["room-types"], "complete");
    assert.equal(merged.card2Steps?.amenities, "complete");
    assert.equal(merged.card2Steps?.["inventory-rules"], "complete");
    assert.notEqual(merged.cards["rooms-inventory"], "complete");
    const parsed = parsePropertySetupStatus({
      cards: {},
      card1Steps: {},
      card2Steps: { maintenance: "complete" },
    });
    assert.equal(parsed.card2Steps?.maintenance, "complete");
  });
});

describe("Card 2 Phase 5 maintenance API wiring", () => {
  it("keeps authz, tenant filters, and persist off rooms.functions and housekeeping", () => {
    assert.match(functions, /export const getMaintenanceRules/);
    assert.match(functions, /export const saveMaintenanceRules/);
    assert.match(functions, /export const getMaintenanceSummary/);
    assert.match(functions, /export const evaluateCard2MaintenanceReadiness/);
    assert.match(functions, /requireRoomManager/);
    assert.match(functions, /requireFrontOfficeAccess/);
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /\.eq\("restaurant_id"/);
    assert.match(functions, /data\.restaurantId/);
    assert.match(functions, /onConflict: "restaurant_id"/);
    assert.match(functions, /onConflict: "restaurant_id,maintenance_status"/);
    assert.match(functions, /export const listMaintenanceDepartments/);
    assert.match(functions, /persistCard2MaintenanceReadiness/);
    assert.match(functions, /statusRulesSaveErrors/);
    assert.match(functions, /pms_departments/);
    assert.match(functions, /Preventive department must belong to this property/);
    assert.doesNotMatch(functions, /\.rpc\("count_sellable_rooms"\)/);
    assert.doesNotMatch(functions, /\.rpc\("assert_reservation_capacity"\)/);
    assert.doesNotMatch(functions, /Database\["public"\]/);
    assert.doesNotMatch(functions, /pms_card2_housekeeping/);
    assert.doesNotMatch(functions, /pms_ooo_oos_posture/);
    assert.doesNotMatch(roomsFns, /persistCard2MaintenanceReadiness/);
    assert.doesNotMatch(housekeepingFns, /persistCard2MaintenanceReadiness/);
    assert.match(roomsServer, /maintenance_required/);
  });
});
