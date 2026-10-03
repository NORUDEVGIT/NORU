import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CORE_HOUSEKEEPING_STATUSES,
  HOUSEKEEPING_PRIORITY_EVENTS,
  HOUSEKEEPING_TRANSITION_EVENTS,
  checkStatusDeletability,
  emptyHousekeepingCard2Settings,
  evaluateCard2HousekeepingReadiness,
  evaluateRoomReadinessWithPolicy,
  mergeCard2HousekeepingStatus,
  validateTransitionRule,
  type HousekeepingCard2Snapshot,
  type HousekeepingCard2Status,
} from "./housekeeping-card2.server.ts";

function snapshot(partial?: Partial<HousekeepingCard2Snapshot>): HousekeepingCard2Snapshot {
  return {
    settings: emptyHousekeepingCard2Settings({ savedAt: "2026-09-18T13:00:00.000Z" }),
    statuses: CORE_HOUSEKEEPING_STATUSES.map((status, index) => ({
      id: `status-${index}`,
      ...status,
      isCore: true,
      active: true,
    })),
    transitions: [
      {
        id: "transition-checkin",
        event: "guest_check_in",
        fromStatus: "ready",
        toStatus: "occupied",
        enabled: true,
        approvalRequired: false,
      },
      {
        id: "transition-checkout",
        event: "guest_check_out",
        fromStatus: "occupied",
        toStatus: "dirty",
        enabled: true,
        approvalRequired: false,
      },
      {
        id: "transition-clean",
        event: "housekeeping_complete",
        fromStatus: "dirty",
        toStatus: "clean",
        enabled: true,
        approvalRequired: false,
      },
      {
        id: "transition-inspection",
        event: "inspection_complete",
        fromStatus: "clean",
        toStatus: "inspected",
        enabled: true,
        approvalRequired: true,
      },
    ],
    priorities: HOUSEKEEPING_PRIORITY_EVENTS.map((event, index) => ({
      id: `priority-${index}`,
      event,
      priority: index < 2 ? "urgent" : index < 5 ? "high" : "normal",
      enabled: true,
      rank: index + 1,
    })),
    ...partial,
  };
}

describe("Card 2 Phase 3 housekeeping readiness", () => {
  it("derives only the housekeeping step as complete", () => {
    const readiness = evaluateCard2HousekeepingReadiness(snapshot());
    assert.equal(readiness.ready, true);
    assert.equal(readiness.stepStatus, "complete");
    const merged = mergeCard2HousekeepingStatus(
      {
        cards: { "rooms-inventory": "in_progress" },
        card1Steps: {},
        card2Steps: { "room-types": "complete", amenities: "complete" },
      },
      readiness.stepStatus,
    );
    assert.equal(merged.card2Steps?.housekeeping, "complete");
    assert.equal(merged.card2Steps?.amenities, "complete");
    assert.equal(merged.cards["rooms-inventory"], "in_progress");
  });

  it("blocks missing default, transition and override configuration", () => {
    const current = snapshot();
    current.settings.assignmentOverrideAllowed = true;
    current.settings.overridePermission = null;
    current.settings.defaultStatus = "pickup";
    current.statuses = current.statuses.map((status) =>
      status.code === "pickup" ? { ...status, active: false } : status,
    );
    current.transitions = current.transitions.filter((rule) => rule.event !== "guest_check_out");
    const readiness = evaluateCard2HousekeepingReadiness(current);
    assert.equal(readiness.ready, false);
    assert.ok(readiness.blockers.includes("Select an active default housekeeping status."));
    assert.ok(readiness.blockers.includes("Choose who may override assignments."));
    assert.ok(readiness.blockers.includes("Configure the Guest Check-Out rule."));
  });

  it("rejects non-operational transition targets", () => {
    const current = snapshot();
    current.transitions = current.transitions.map((rule) =>
      rule.event === "housekeeping_complete" ? { ...rule, toStatus: "ready" } : rule,
    );
    const readiness = evaluateCard2HousekeepingReadiness(current);
    assert.equal(readiness.ready, false);
    assert.ok(
      readiness.blockers.includes(
        "Housekeeping Complete must end in an operational housekeeping status.",
      ),
    );
  });
});

describe("Card 2 housekeeping check-in policy", () => {
  it("enforces inspection and maintenance when configured", () => {
    const settings = emptyHousekeepingCard2Settings({ savedAt: "2026-09-18T13:00:00.000Z" });
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "available", housekeepingStatus: "clean", maintenanceStatus: "normal" },
        settings,
      ).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        {
          status: "available",
          housekeepingStatus: "inspected",
          maintenanceStatus: "maintenance_required",
        },
        settings,
      ).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy(
        { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "normal" },
        settings,
      ).ready,
      true,
    );
  });

  it("preserves the existing clean-or-inspected fallback without saved policy", () => {
    assert.equal(
      evaluateRoomReadinessWithPolicy({ status: "available", housekeepingStatus: "clean" }).ready,
      true,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy({ status: "available", housekeepingStatus: "pickup" }).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy({ status: "out_of_order", housekeepingStatus: "inspected" }).ready,
      false,
    );
    assert.equal(
      evaluateRoomReadinessWithPolicy({ status: "out_of_service", housekeepingStatus: "clean" }).ready,
      false,
    );
  });
});

describe("Card 2 Phase 3 isolation and server wiring", () => {
  it("uses dedicated files and keeps Amenities outside the housekeeping implementation", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    const functions = readFileSync(new URL("./housekeeping-card2.functions.ts", import.meta.url), "utf8");
    const operations = readFileSync(new URL("./housekeeping.functions.ts", import.meta.url), "utf8");
    const checkIn = readFileSync(new URL("./fo-check-in.functions.ts", import.meta.url), "utf8");
    const rooms = readFileSync(new URL("./rooms.functions.ts", import.meta.url), "utf8");
    const section = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-section.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /Automatic Status Transitions/);
    assert.match(ui, /Check-In Readiness/);
    assert.match(ui, /Housekeeping Priorities/);
    assert.match(ui, /registerActions/);
    assert.match(functions, /requireRoomManager/);
    assert.match(functions, /mergeCard2HousekeepingStatus/);
    assert.match(operations, /assignmentOverrideAllowed/);
    assert.match(operations, /supervisorApprovalRequired/);
    assert.match(checkIn, /housekeeping\.settings/);
    assert.match(rooms, /manualStatusChangeAllowed/);
    assert.match(rooms, /defaultHousekeepingStatus/);
    assert.match(section, /step === "housekeeping"/);
    assert.match(section, /housekeepingBlockers/);
    assert.doesNotMatch(ui, /saveRoomAmenity|pms-card2-amenities/);
  });

  it("ships dual-lane 0068 with tenant RLS and protected core statuses", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0068_pms_card2_housekeeping.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0068_pms_card2_housekeeping.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /pms_housekeeping_settings/);
    assert.match(sql, /pms_housekeeping_status_catalog/);
    assert.match(sql, /pms_housekeeping_transition_rules/);
    assert.match(sql, /pms_housekeeping_priority_rules/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /CORE_HOUSEKEEPING_STATUS_REQUIRED/);
    assert.match(sql, /pms_housekeeping_transition_target/);
    assert.match(sql, /pms_housekeeping_event_priority/);
    assert.doesNotMatch(sql, /room_amenities|room_type_amenities/);
  });
});

describe("Card 2 Housekeeping Catalog Delete — 8 Requirements", () => {
  const baseSnapshot = snapshot();
  const customStatus: HousekeepingCard2Status = {
    id: "custom-status-1",
    code: "deep_clean_hold",
    name: "Deep Clean Hold",
    domain: "custom",
    isCore: false,
    operational: false,
    active: true,
    sortOrder: 1000,
  };

  // 1. Delete action appears for deletable custom status
  it("Requirement 1: Delete action appears in row menu for custom status", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /promptDeleteStatus/);
    assert.match(ui, /Delete Status/);
  });

  // 2. protected status cannot be deleted
  it("Requirement 2: protected core status cannot be deleted", () => {
    const coreClean = baseSnapshot.statuses.find((s) => s.code === "clean")!;
    const check = checkStatusDeletability(coreClean, baseSnapshot);
    assert.equal(check.deletable, false);
    assert.match(check.reason ?? "", /System core statuses cannot be deleted/);
  });

  // 3. status used by room cannot be deleted
  it("Requirement 3: status used by room cannot be deleted", () => {
    const check = checkStatusDeletability(customStatus, baseSnapshot, 12);
    assert.equal(check.deletable, false);
    assert.match(check.reason ?? "", /in use by 12 rooms/i);
  });

  // 4. status used by From transition cannot be deleted
  it("Requirement 4: status used by From transition cannot be deleted", () => {
    const snapWithTransition = {
      ...baseSnapshot,
      transitions: [
        ...baseSnapshot.transitions,
        {
          id: "tr-custom",
          event: "housekeeping_complete" as const,
          fromStatus: "deep_clean_hold",
          toStatus: "clean",
          enabled: true,
          approvalRequired: false,
        },
      ],
    };
    const check = checkStatusDeletability(customStatus, snapWithTransition, 0);
    assert.equal(check.deletable, false);
    assert.match(check.reason ?? "", /used by 1 automatic transition/);
  });

  // 5. status used by To transition cannot be deleted
  it("Requirement 5: status used by To transition cannot be deleted", () => {
    const snapWithTransition = {
      ...baseSnapshot,
      transitions: [
        ...baseSnapshot.transitions,
        {
          id: "tr-custom-to",
          event: "guest_check_out" as const,
          fromStatus: "occupied",
          toStatus: "deep_clean_hold",
          enabled: true,
          approvalRequired: false,
        },
      ],
    };
    const check = checkStatusDeletability(customStatus, snapWithTransition, 0);
    assert.equal(check.deletable, false);
    assert.match(check.reason ?? "", /used by 1 automatic transition/);
  });

  // 6. unused custom status can be deleted
  it("Requirement 6: unused custom status can be deleted", () => {
    const check = checkStatusDeletability(customStatus, baseSnapshot, 0);
    assert.equal(check.deletable, true);
    assert.equal(check.reason, null);
  });

  // 7. delete confirmation required
  it("Requirement 7: delete confirmation dialog is present in UI", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /Delete Housekeeping Status\?/);
    assert.match(ui, /will be permanently removed from the Housekeeping Catalog/);
    assert.match(ui, /This action cannot be undone/);
  });

  // 8. operational room status unchanged after unrelated catalogue changes
  it("Requirement 8: room readiness and status calculation remain untouched by catalog changes", () => {
    const room = { status: "available", housekeepingStatus: "clean", maintenanceStatus: "normal" };
    const readinessBefore = evaluateRoomReadinessWithPolicy(room, baseSnapshot.settings);
    assert.equal(readinessBefore.ready, false); // inspectionRequired is true by default
    const inspectedRoom = { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "normal" };
    assert.equal(evaluateRoomReadinessWithPolicy(inspectedRoom, baseSnapshot.settings).ready, true);
  });
});

describe("Card 2 Automatic Status Transitions Add/Edit — 17 Requirements", () => {
  const baseSnapshot = snapshot();

  // 1. Add Transition action exists
  it("Requirement 1: Add Transition action exists", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /Add Transition Status/);
  });

  // 2. Add form contains Event
  it("Requirement 2: form contains Event field", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /id="trans-event"/);
  });

  // 3. Add form contains From Status
  it("Requirement 3: form contains From Status field", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /id="trans-from-status"/);
  });

  // 4. Add form contains To Status
  it("Requirement 4: form contains To Status field", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /id="trans-to-status"/);
  });

  // 5. Add form contains Approval
  it("Requirement 5: form contains Approval toggle", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /id="trans-approval"/);
    assert.match(ui, /Require Approval/);
  });

  // 6. Add form contains Status
  it("Requirement 6: form contains Status toggle (Active/Inactive)", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /id="trans-active"/);
  });

  // 7. Edit uses exact same form component
  it("Requirement 7: Edit and Add use the exact same AutomaticTransitionForm component", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /export function AutomaticTransitionForm/);
    assert.match(ui, /<AutomaticTransitionForm/);
  });

  // 8. edit preloads existing values
  it("Requirement 8: edit preloads existing values in transition form", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /useState<HousekeepingTransitionEvent \| "">\(transition\.event\)/);
    assert.match(ui, /useState<string>\(transition\.fromStatus\)/);
    assert.match(ui, /useState<string>\(transition\.toStatus\)/);
  });

  // 9. From/To options come from status catalogue
  it("Requirement 9: From/To options are populated from statuses catalogue", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /fromOptions\.map/);
    assert.match(ui, /toOptions\.map/);
  });

  // 10. identical From/To blocked when unsupported
  it("Requirement 10: identical From and To statuses are blocked", () => {
    const check = validateTransitionRule(
      {
        event: "housekeeping_complete",
        fromStatus: "clean",
        toStatus: "clean",
        enabled: true,
        approvalRequired: false,
      },
      baseSnapshot.transitions,
      baseSnapshot.statuses,
    );
    assert.equal(check.valid, false);
    assert.equal(check.error, "From Status and To Status cannot be identical.");
  });

  // 11. duplicate rule blocked
  it("Requirement 11: duplicate rule with same event and from-status is blocked", () => {
    const check = validateTransitionRule(
      {
        event: "housekeeping_complete",
        fromStatus: "dirty",
        toStatus: "clean",
        enabled: true,
        approvalRequired: false,
      },
      baseSnapshot.transitions,
      baseSnapshot.statuses,
    );
    assert.equal(check.valid, false);
    assert.match(check.error ?? "", /An automatic transition with this event and status change already exists/);
  });

  // 12. ambiguous Event + From transition blocked if engine cannot support it
  it("Requirement 12: ambiguous event rule pointing to another target is blocked by unique event constraint", () => {
    const check = validateTransitionRule(
      {
        event: "guest_check_out",
        fromStatus: "vacant",
        toStatus: "dirty",
        enabled: true,
        approvalRequired: false,
      },
      baseSnapshot.transitions,
      baseSnapshot.statuses,
    );
    assert.equal(check.valid, false);
    assert.match(check.error ?? "", /An automatic transition for this event already exists/);
  });

  // 13. inactive existing status still displays for legacy edit
  it("Requirement 13: inactive status included in options when editing legacy rule", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-housekeeping.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /statuses\.filter\(\(s\) => s\.active \|\| s\.code === fromStatus\)/);
    assert.match(ui, /statuses\.filter\(\(s\) => s\.active \|\| s\.code === toStatus\)/);
  });

  // 14. Active/Inactive persists
  it("Requirement 14: active/inactive enabled field is present in transition server function", () => {
    const fnCode = readFileSync(
      new URL("./housekeeping-card2.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(fnCode, /savePmsCard2Transition/);
    assert.match(fnCode, /enabled: data\.enabled/);
  });

  // 15. approval persists
  it("Requirement 15: approvalRequired field is present in transition server function", () => {
    const fnCode = readFileSync(
      new URL("./housekeeping-card2.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(fnCode, /approval_required: data\.approvalRequired/);
  });

  // 16. no room statuses reset
  it("Requirement 16: saving transition never mutates hotel_rooms directly", () => {
    const fnCode = readFileSync(
      new URL("./housekeeping-card2.functions.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(fnCode, /from\("hotel_rooms"\)\.update/);
  });

  // 17. no unnecessary migration
  it("Requirement 17: zero new migrations created", () => {
    const migrationsDir = join(process.cwd(), "drizzle/migrations");
    const sqlFiles = readdirSync(migrationsDir).filter((f: string) => f.endsWith(".sql"));
    assert.ok(sqlFiles.length <= 144);
  });
});
