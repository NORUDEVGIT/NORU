import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { COMMUNICATION_CHANNEL_TYPES } from "./communication-channels-card4.server.ts";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  COMMUNICATION_TEMPLATE_EVENTS,
  communicationTemplatesConfigured,
  duplicateTemplateCode,
  emptyCommunicationTemplateDraft,
  renderTemplateText,
  sanitizeTemplateHtml,
  validateCommunicationTemplateDraft,
  variablesForCategory,
} from "./communication-templates-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./communication-templates-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-communication-templates.tsx", import.meta.url),
  "utf8",
);
const supabaseMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/0090_pms_card4_communication_templates.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzleMigration = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0090_pms_card4_communication_templates.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Card 4 Notifications communication templates", () => {
  it("reuses Phase 1 channels and SET5 event keys without duplicating those systems", () => {
    assert.deepEqual(
      [...COMMUNICATION_TEMPLATE_CATEGORIES],
      ["reservation", "pre_arrival", "stay", "departure", "internal"],
    );
    assert.equal(
      COMMUNICATION_TEMPLATE_EVENTS.some((row) => row.id === "reservation_confirmed"),
      true,
    );
    assert.deepEqual(
      [...COMMUNICATION_CHANNEL_TYPES],
      ["email", "sms", "whatsapp", "guest_portal", "pms_in_app"],
    );
    assert.doesNotMatch(functionsSrc, /pms_notification_templates/);
  });

  it("requires name, unique code, matching event, subject, and message", () => {
    const empty = validateCommunicationTemplateDraft(emptyCommunicationTemplateDraft(), []);
    assert.equal(
      empty.some((row) => row.field === "name"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "code"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "subject"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "message"),
      true,
    );
    const valid = validateCommunicationTemplateDraft(
      {
        ...emptyCommunicationTemplateDraft(),
        name: "Reservation confirmation",
        code: "RES-001",
        subject: "Your reservation at {{property.name}}",
        message: "Dear {{guest.first_name}}, reservation {{reservation.number}} is confirmed.",
      },
      [],
    );
    assert.deepEqual(valid, []);
    const duplicate = validateCommunicationTemplateDraft(
      {
        ...emptyCommunicationTemplateDraft(),
        name: "Other",
        code: "RES-001",
        subject: "Hello",
        message: "Body",
      },
      [{ id: "1", code: "RES-001" }],
    );
    assert.equal(
      duplicate.some((row) => /already in use/.test(row.message)),
      true,
    );
  });

  it("rejects unknown variables and sanitizes scripted HTML", () => {
    const errors = validateCommunicationTemplateDraft(
      {
        ...emptyCommunicationTemplateDraft(),
        name: "Stay note",
        code: "STY-001",
        category: "internal",
        eventTrigger: "night_audit_exception",
        subject: "Hello {{guest.first_name}}",
        message: "Body",
      },
      [],
    );
    assert.equal(
      errors.some((row) => /not available/.test(row.message)),
      true,
    );
    assert.equal(
      variablesForCategory("internal").some((row) => row.token === "property.name"),
      true,
    );
    assert.equal(
      sanitizeTemplateHtml('<p onclick="alert(1)">Hi<script>x()</script></p>').includes("script"),
      false,
    );
  });

  it("renders preview samples without executing template code", () => {
    assert.equal(
      renderTemplateText("Dear {{guest.first_name}} at {{property.name}}"),
      "Dear John at Sample Property",
    );
    assert.equal(duplicateTemplateCode("RES-001", [{ code: "RES-001" }]), "RES-001-COPY");
  });

  it("marks readiness from at least one valid active template", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000201",
      name: "Reservation confirmation",
      code: "RES-001",
      category: "reservation" as const,
      eventTrigger: "reservation_confirmed",
      channelType: "email" as const,
      language: "en",
      subject: "Your reservation at {{property.name}}",
      message: "Dear {{guest.first_name}}",
      active: true,
      allowManualSending: false,
      attachPdf: false,
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    };
    assert.equal(communicationTemplatesConfigured([row]), true);
    assert.equal(communicationTemplatesConfigured([{ ...row, active: false }]), false);
  });

  it("keeps persistence tenant-scoped and test sends off the guest path", () => {
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /\[TEST\]/);
    assert.doesNotMatch(functionsSrc, /sendGuestMessage/);
    assert.doesNotMatch(functionsSrc, /comms_sent/);
    assert.match(functionsSrc, /platformEmailTransportConfigured/);
  });

  it("renders the specified list, details, variables, preview, and settings", () => {
    assert.match(uiSrc, /data-testid="card4-communication-templates"/);
    assert.match(uiSrc, /Search templates/);
    assert.match(uiSrc, /Add Template/);
    assert.match(uiSrc, /Template Details/);
    assert.match(uiSrc, /Show Available Variables/);
    assert.match(uiSrc, /Send Test/);
    assert.match(uiSrc, /Allow manual sending/);
    assert.match(uiSrc, /Attach PDF/);
    assert.match(uiSrc, /contentEditable/);
  });

  it("keeps dual-lane migration text equal and enforces manager RLS", () => {
    assert.equal(supabaseMigration, drizzleMigration);
    assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabaseMigration, /UNIQUE \(restaurant_id, code\)/);
    assert.doesNotMatch(supabaseMigration, /pms_notification_templates/);
  });
});
