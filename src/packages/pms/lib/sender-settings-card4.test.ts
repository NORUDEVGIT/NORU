import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  COMMUNICATION_CHANNEL_TYPES,
  DEFAULT_COMMUNICATION_CHANNELS,
  emptyCommunicationChannelDraft,
  providerFields,
  sanitizeCommunicationProviderConfig,
  validateConnectionTest,
} from "./communication-channels-card4.server.ts";
import {
  sanitizeSenderSettingsConfig,
  senderSettingsConfigured,
  validateSenderSettingsDraft,
} from "./sender-settings-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./sender-settings-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-sender-settings.tsx", import.meta.url),
  "utf8",
);
const supabaseMigration = readFileSync(
  new URL("../../../../supabase/migrations/0093_pms_card4_sender_settings.sql", import.meta.url),
  "utf8",
);
const drizzleMigration = readFileSync(
  new URL("../../../../drizzle/migrations/0093_pms_card4_sender_settings.sql", import.meta.url),
  "utf8",
);

describe("Card 4 Notifications sender settings", () => {
  it("marks readiness from email sender name, valid email, and a matching channel", () => {
    assert.equal(senderSettingsConfigured([]), false);
    assert.equal(
      senderSettingsConfigured([
        { channelType: "email", senderName: "Noru Hotel", senderEmail: "not-an-email" },
      ]),
      false,
    );
    assert.equal(
      senderSettingsConfigured(
        [{ channelType: "email", senderName: "Noru Hotel", senderEmail: "guest@example.com" }],
        [{ channelType: "sms" }],
      ),
      false,
    );
    assert.equal(
      senderSettingsConfigured(
        [{ channelType: "email", senderName: "Noru Hotel", senderEmail: "guest@example.com" }],
        [{ channelType: "email" }],
      ),
      true,
    );
  });

  it("reuses Phase 1 validation and drops password and api_key from persisted config", () => {
    const draft = {
      ...emptyCommunicationChannelDraft("email", "Noru Hotel"),
      active: true,
    };
    assert.equal(
      validateSenderSettingsDraft(draft, []).some((row) => row.field === "senderEmail"),
      true,
    );
    assert.deepEqual(
      sanitizeSenderSettingsConfig("email", "smtp", {
        host: "smtp.example.com",
        port: 587,
        username: "mailer",
        password: "do-not-store",
        api_key: "do-not-store",
        apiKey: "do-not-store",
        useTls: true,
      }),
      {
        host: "smtp.example.com",
        port: 587,
        username: "mailer",
        useTls: true,
      },
    );
    assert.deepEqual(
      sanitizeCommunicationProviderConfig("email", "smtp", {
        password: "do-not-store",
      }),
      {},
    );
  });

  it("lets Guest Portal and PMS In-App skip SMTP and external secrets", () => {
    for (const channelType of ["guest_portal", "pms_in_app"] as const) {
      const draft = emptyCommunicationChannelDraft(channelType, "Noru Hotel");
      assert.equal(providerFields(draft).length, 0);
      const outcome = validateConnectionTest({ ...draft, active: true });
      assert.equal(outcome.result, "verified");
      assert.match(outcome.message, /built-in/i);
      assert.doesNotMatch(outcome.message, /smtp/i);
    }
    const defaults = DEFAULT_COMMUNICATION_CHANNELS.filter(
      (row) => row.channelType === "guest_portal" || row.channelType === "pms_in_app",
    );
    assert.equal(
      defaults.every((row) => row.provider === "noru_pms"),
      true,
    );
  });

  it("tests session values only and never claims a live guest send", () => {
    const outcome = validateConnectionTest({
      ...emptyCommunicationChannelDraft("email", "Noru Hotel"),
      senderEmail: "guest@example.com",
      active: true,
      providerValues: {
        host: "smtp.example.com",
        port: 587,
        username: "mailer",
        password: "session-only",
      },
    });
    assert.equal(outcome.result, "unsupported");
    assert.match(outcome.message, /no live adapter/i);
    assert.doesNotMatch(functionsSrc, /provider_config:\s*data\.sessionValues/);
    assert.doesNotMatch(functionsSrc, /console\.(?:log|info|warn)\([^)]*sessionValues/);
    assert.match(functionsSrc, /sessionValues/);
    assert.match(functionsSrc, /validateConnectionTest/);
  });

  it("keeps GET tenant-scoped without selecting secret columns", () => {
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /requireSupabaseAuth/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /sanitizeCommunicationProviderConfig/);
    assert.match(
      functionsSrc,
      /"id, channel_type, provider, auth_method, sender_name, sender_email, reply_to_email, signature, provider_config, active, created_at, updated_at"/,
    );
    assert.doesNotMatch(functionsSrc, /password|api_key|bearer_token|encrypted/);
    assert.doesNotMatch(functionsSrc, /pms_notification_templates|pms_set5/);
  });

  it("renders channel tabs, SecretInput, and Test Connection", () => {
    assert.match(uiSrc, /data-testid="card4-sender-settings"/);
    assert.match(uiSrc, /COMMUNICATION_CHANNEL_TYPES\.map/);
    assert.match(uiSrc, /COMMUNICATION_CHANNEL_LABELS\[type\]/);
    assert.match(uiSrc, /SecretInput/);
    assert.match(uiSrc, /Test Connection/);
    assert.match(uiSrc, /never saved/);
    assert.match(uiSrc, /AlertDialog/);
    assert.match(uiSrc, /built-in Noru PMS/);
    assert.match(uiSrc, /guest_portal/);
    assert.match(uiSrc, /pms_in_app/);
    assert.match(uiSrc, /Sender Email/);
  });

  it("keeps dual-lane 0093 SQL equal with RLS, FK, and no secret vault", () => {
    assert.equal(supabaseMigration, drizzleMigration);
    assert.match(
      supabaseMigration,
      /CREATE TABLE IF NOT EXISTS public\.pms_communication_sender_settings/,
    );
    assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'manager'\)/);
    assert.match(supabaseMigration, /UNIQUE \(restaurant_id, channel_type\)/);
    assert.match(supabaseMigration, /UNIQUE \(id, restaurant_id\)/);
    assert.match(
      supabaseMigration,
      /FOREIGN KEY \(restaurant_id, channel_type\)[\s\S]*pms_communication_channels/,
    );
    assert.match(supabaseMigration, /ON DELETE CASCADE/);
    assert.match(supabaseMigration, /pms_integration_config_is_safe\(provider_config\)/);
    assert.match(supabaseMigration, /FROM public\.pms_communication_channels/);
    assert.doesNotMatch(supabaseMigration, /encrypted_|password text|secret_vault|vault/i);
    assert.doesNotMatch(supabaseMigration, /pms_notification_templates|pms_set5/);
    assert.equal(COMMUNICATION_CHANNEL_TYPES.length, 5);
  });
});
