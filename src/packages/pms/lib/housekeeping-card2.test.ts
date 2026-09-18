import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CORE_HOUSEKEEPING_STATUSES,
  HOUSEKEEPING_PRIORITY_EVENTS,
  emptyHousekeepingCard2Settings,
  evaluateCard2HousekeepingReadiness,
  evaluateRoomReadinessWithPolicy,
  mergeCard2HousekeepingStatus,
  type HousekeepingCard2Snapshot,
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
      evaluateRoomReadinessWithPolicy({ status: "available", housekeepingStatus: "dirty" }).ready,
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
