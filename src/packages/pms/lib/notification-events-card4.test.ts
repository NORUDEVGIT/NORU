import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  NOTIFICATION_EVENT_MODULES,
  SYSTEM_NOTIFICATION_EVENTS,
  emptyNotificationEventDraft,
  normalizeNotificationEventDraft,
  notificationEventsConfigured,
  validateNotificationEventDraft,
  validateNotificationEventTemplate,
  type NotificationEventRecord,
} from "./notification-events-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./notification-events-card4.functions.ts", import.meta.url),
  "utf8",
);
const supabaseMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/0091_pms_card4_notification_events.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzleMigration = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0091_pms_card4_notification_events.sql",
    import.meta.url,
  ),
  "utf8",
);

const systemEvent: NotificationEventRecord = {
  id: "00000000-0000-4000-8000-000000000301",
  name: "Reservation Confirmed",
  code: "reservation_confirmed",
  module: "reservations",
  category: "reservation",
  description: "",
  defaultChannelType: "email",
  defaultTemplateId: null,
  active: false,
  isSystem: true,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

describe("Card 4 notification events", () => {
  it("defines the closed module set and exactly twelve stable system events", () => {
    assert.deepEqual(
      [...NOTIFICATION_EVENT_MODULES],
      [
        "reservations",
        "front_office",
        "guest_services",
        "housekeeping",
        "payments",
        "feedback",
      ],
    );
    assert.equal(SYSTEM_NOTIFICATION_EVENTS.length, 12);
    assert.equal(new Set(SYSTEM_NOTIFICATION_EVENTS.map((row) => row.code)).size, 12);
    assert.deepEqual(SYSTEM_NOTIFICATION_EVENTS[0], {
      name: "Reservation Confirmed",
      code: "reservation_confirmed",
      module: "reservations",
      category: "reservation",
    });
  });

  it("normalizes generated custom codes and rejects duplicate names and codes", () => {
    const normalized = normalizeNotificationEventDraft({
      ...emptyNotificationEventDraft(),
      name: " Late Guest Request! ",
    });
    assert.equal(normalized.code, "late_guest_request");
    const errors = validateNotificationEventDraft(
      { ...normalized, name: " reservation confirmed ", code: "reservation_confirmed" },
      [systemEvent],
    );
    assert.equal(
      errors.some((row) => row.field === "name" && /already in use/.test(row.message)),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "code" && /already in use/.test(row.message)),
      true,
    );
    const invalid = validateNotificationEventDraft(
      { ...emptyNotificationEventDraft(), name: "Bad", code: "Bad-Code" },
      [],
    );
    assert.equal(
      invalid.some((row) => row.field === "code"),
      true,
    );
  });

  it("protects system identity while allowing editable presentation fields", () => {
    const allowed = validateNotificationEventDraft(
      {
        ...systemEvent,
        name: "Reservation confirmation",
        description: "Sent when a reservation is confirmed.",
      },
      [systemEvent],
      systemEvent,
    );
    assert.deepEqual(allowed, []);
    const protectedErrors = validateNotificationEventDraft(
      { ...systemEvent, code: "changed", module: "feedback" },
      [systemEvent],
      systemEvent,
    );
    assert.equal(
      protectedErrors.some((row) => /cannot be changed/.test(row.message)),
      true,
    );
    assert.match(functionsSrc, /System notification events cannot be deleted/);
    assert.match(functionsSrc, /A communication template still uses it/);
    assert.match(supabaseMigration, /protect_pms_card4_system_notification_event/);
  });

  it("requires active, channel/category/trigger-compatible templates", () => {
    const draft = {
      ...emptyNotificationEventDraft(),
      name: "Reservation reminder",
      code: "reservation_reminder",
      defaultTemplateId: "00000000-0000-4000-8000-000000000302",
    };
    const compatible = {
      id: draft.defaultTemplateId,
      category: "reservation" as const,
      eventTrigger: "reservation_reminder",
      channelType: "email" as const,
      active: true,
    };
    assert.deepEqual(validateNotificationEventTemplate(draft, compatible), []);
    assert.match(
      validateNotificationEventTemplate(draft, { ...compatible, active: false })[0]?.message ?? "",
      /must be active/,
    );
    assert.match(
      validateNotificationEventTemplate(draft, {
        ...compatible,
        channelType: "sms",
      })[0]?.message ?? "",
      /channel must match/,
    );
    assert.match(
      validateNotificationEventTemplate(draft, {
        ...compatible,
        eventTrigger: "other_event",
      })[0]?.message ?? "",
      /trigger must match/,
    );
  });

  it("marks readiness only when an active event has a template", () => {
    assert.equal(notificationEventsConfigured([systemEvent]), false);
    assert.equal(
      notificationEventsConfigured([
        {
          ...systemEvent,
          active: true,
          defaultTemplateId: "00000000-0000-4000-8000-000000000302",
        },
      ]),
      true,
    );
  });

  it("keeps dual-lane SQL equal with RLS, tenant integrity, and idempotent seeds", () => {
    assert.equal(supabaseMigration, drizzleMigration);
    assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabaseMigration, /is_restaurant_member\(restaurant_id\)/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'manager'\)/);
    assert.match(supabaseMigration, /UNIQUE \(restaurant_id, code\)/);
    assert.match(
      supabaseMigration,
      /FOREIGN KEY \(default_template_id, restaurant_id\)[\s\S]*REFERENCES public\.pms_communication_templates\(id, restaurant_id\)/,
    );
    assert.match(supabaseMigration, /ON CONFLICT \(restaurant_id, code\) DO NOTHING/);
    for (const event of SYSTEM_NOTIFICATION_EVENTS) {
      assert.match(supabaseMigration, new RegExp(`'${event.code}'`));
    }
    assert.doesNotMatch(supabaseMigration, /pms_notification_templates/i);
  });

  it("scopes every ownership lookup and mutation and uses the real template test path", () => {
    assert.match(functionsSrc, /requireSupabaseAuth/);
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(functionsSrc, /testPmsCard4CommunicationTemplate/);
    assert.match(functionsSrc, /validateCommunicationTemplateDraft/);
    assert.doesNotMatch(functionsSrc, /result:\s*"sent"[\s\S]*No production notification/);
  });
});
