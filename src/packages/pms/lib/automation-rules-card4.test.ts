import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AUTOMATION_RECIPIENT_ROLES,
  automationRulesConfigured,
  emptyAutomationRuleDraft,
  parseAutomationSchedule,
  summarizeAutomationCondition,
  validateAutomationRuleDraft,
  type AutomationRuleLookup,
  type AutomationRuleRecord,
} from "./automation-rules-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./automation-rules-card4.functions.ts", import.meta.url),
  "utf8",
);
const supabaseMigration = readFileSync(
  new URL("../../../../supabase/migrations/0092_pms_card4_automation_rules.sql", import.meta.url),
  "utf8",
);
const drizzleMigration = readFileSync(
  new URL("../../../../drizzle/migrations/0092_pms_card4_automation_rules.sql", import.meta.url),
  "utf8",
);

const event: AutomationRuleLookup = {
  id: "00000000-0000-4000-8000-000000000401",
  name: "Reservation Confirmed",
  code: "reservation_confirmed",
  active: true,
};
const profileType: AutomationRuleLookup = {
  id: "00000000-0000-4000-8000-000000000402",
  name: "Individual Guest",
  code: "IND",
  active: true,
};
const department: AutomationRuleLookup = {
  id: "00000000-0000-4000-8000-000000000403",
  name: "Front Office",
  code: "FO",
  active: true,
};
const catalogues = {
  events: [event],
  channels: [{ channelType: "email" as const, active: true }],
  templates: [
    {
      id: "00000000-0000-4000-8000-000000000404",
      channelType: "email" as const,
      eventTrigger: "reservation_confirmed",
      active: true,
    },
  ],
  departments: [department],
  profileTypes: [profileType],
};

function completeDraft() {
  return {
    ...emptyAutomationRuleDraft(),
    name: "Confirm VIP email",
    eventId: event.id,
    conditions: [
      { field: "guest_profile_type" as const, operator: "eq" as const, value: profileType.id },
    ],
    recipients: [{ kind: "department" as const, id: department.id }],
    templateId: catalogues.templates[0]!.id,
    active: true,
  };
}

describe("Card 4 automation rules", () => {
  it("requires name and event even for drafts and full config to activate", () => {
    const empty = validateAutomationRuleDraft(emptyAutomationRuleDraft(), catalogues);
    assert.equal(empty.some((row) => row.field === "name"), true);
    assert.equal(empty.some((row) => row.field === "eventId"), true);
    assert.equal(empty.some((row) => row.field === "recipients"), false);
    const incomplete = validateAutomationRuleDraft(
      { ...emptyAutomationRuleDraft(), name: "Draft", eventId: event.id, active: true },
      catalogues,
    );
    assert.equal(incomplete.some((row) => row.field === "recipients"), true);
    assert.equal(incomplete.some((row) => row.field === "templateId"), true);
    assert.deepEqual(validateAutomationRuleDraft(completeDraft(), catalogues), []);
  });

  it("rejects mismatched templates, inactive channels, and unknown recipients", () => {
    assert.match(
      validateAutomationRuleDraft(
        { ...completeDraft(), templateId: catalogues.templates[0]!.id, channelType: "sms" },
        catalogues,
      )[0]?.message ?? "",
      /channel/,
    );
    assert.match(
      validateAutomationRuleDraft(
        {
          ...completeDraft(),
          templateId: catalogues.templates[0]!.id,
        },
        {
          ...catalogues,
          templates: [{ ...catalogues.templates[0]!, eventTrigger: "other_event" }],
        },
      )[0]?.message ?? "",
      /trigger must match/,
    );
    assert.match(
      validateAutomationRuleDraft(
        { ...completeDraft(), recipients: [{ kind: "department", id: event.id }] },
        catalogues,
      )[0]?.message ?? "",
      /department/,
    );
    assert.deepEqual([...AUTOMATION_RECIPIENT_ROLES], ["owner", "manager", "staff"]);
  });

  it("parses schedules and summarizes guest-type conditions", () => {
    assert.deepEqual(parseAutomationSchedule({ mode: "immediate" }), { mode: "immediate" });
    assert.equal(parseAutomationSchedule({ mode: "delay", delayMinutes: 30 }).mode, "delay");
    assert.match(
      validateAutomationRuleDraft(
        { ...completeDraft(), schedule: { mode: "delay", delayMinutes: 0 } },
        catalogues,
      )[0]?.message ?? "",
      /Delay/,
    );
    assert.equal(
      summarizeAutomationCondition(
        { field: "guest_profile_type", operator: "eq", value: profileType.id },
        [profileType],
      ),
      "Guest Type equals Individual Guest",
    );
  });

  it("marks readiness only when an active rule has a template and recipients", () => {
    const rule: AutomationRuleRecord = {
      id: event.id,
      name: "Rule",
      eventId: event.id,
      conditions: [],
      recipients: [{ kind: "role", id: "manager" }],
      channelType: "email",
      templateId: catalogues.templates[0]!.id,
      schedule: { mode: "immediate" },
      active: true,
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    };
    assert.equal(automationRulesConfigured([{ ...rule, active: false }]), false);
    assert.equal(automationRulesConfigured([rule]), true);
  });

  it("keeps dual-lane SQL equal with RLS and tenant-safe event/template FKs", () => {
    assert.equal(supabaseMigration, drizzleMigration);
    assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabaseMigration, /is_restaurant_member\(restaurant_id\)/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'manager'\)/);
    assert.match(
      supabaseMigration,
      /FOREIGN KEY \(event_id, restaurant_id\)[\s\S]*pms_communication_notification_events/,
    );
    assert.match(
      supabaseMigration,
      /FOREIGN KEY \(template_id, restaurant_id\)[\s\S]*pms_communication_templates/,
    );
    assert.match(supabaseMigration, /ON DELETE RESTRICT/);
    assert.doesNotMatch(supabaseMigration, /pms_notification_templates/i);
    assert.doesNotMatch(supabaseMigration, /pms_department_routing_rules/);
  });

  it("scopes every lookup and mutation and uses the real template test path", () => {
    assert.match(functionsSrc, /requireSupabaseAuth/);
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(functionsSrc, /pms_departments/);
    assert.match(functionsSrc, /pms_guest_profile_types/);
    assert.match(functionsSrc, /testPmsCard4CommunicationTemplate/);
    assert.doesNotMatch(functionsSrc, /pms_department_routing_rules/);
  });
});
