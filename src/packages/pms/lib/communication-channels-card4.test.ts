import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  COMMUNICATION_CHANNEL_TYPES,
  DEFAULT_COMMUNICATION_CHANNELS,
  communicationChannelsConfigured,
  communicationProvider,
  communicationProviders,
  emptyCommunicationChannelDraft,
  sanitizeCommunicationProviderConfig,
  validateCommunicationChannelDraft,
  validateConnectionTest,
  type CommunicationChannelRecord,
} from "./communication-channels-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./communication-channels-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-communication-channels.tsx", import.meta.url),
  "utf8",
);
const supabaseMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/0089_pms_card4_communication_channels.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzleMigration = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0089_pms_card4_communication_channels.sql",
    import.meta.url,
  ),
  "utf8",
);

function record(
  channelType: CommunicationChannelRecord["channelType"],
): CommunicationChannelRecord {
  const defaults = DEFAULT_COMMUNICATION_CHANNELS.find((row) => row.channelType === channelType);
  if (!defaults) throw new Error(`Missing defaults for ${channelType}`);
  return {
    id: `00000000-0000-4000-8000-00000000000${COMMUNICATION_CHANNEL_TYPES.indexOf(channelType)}`,
    channelType,
    provider: defaults.provider,
    authMethod: defaults.authMethod,
    senderName: "Noru Hotel",
    senderEmail: "",
    replyToEmail: "",
    signature: "",
    providerConfig: {},
    active: false,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
}

describe("Card 4 Notifications communication channels", () => {
  it("defines the five canonical channels and compatible default providers", () => {
    assert.deepEqual(COMMUNICATION_CHANNEL_TYPES, [
      "email",
      "sms",
      "whatsapp",
      "guest_portal",
      "pms_in_app",
    ]);
    assert.equal(DEFAULT_COMMUNICATION_CHANNELS.length, 5);
    for (const row of DEFAULT_COMMUNICATION_CHANNELS) {
      assert.ok(communicationProvider(row.channelType, row.provider));
    }
    assert.equal(
      communicationProviders("whatsapp").some((provider) => provider.id === "dialog_360"),
      true,
    );
    assert.equal(communicationProviders("guest_portal")[0]?.id, "noru_pms");
  });

  it("validates active channel-specific sender and provider settings", () => {
    const draft = {
      ...emptyCommunicationChannelDraft("email", "Noru Hotel"),
      active: true,
    };
    const errors = validateCommunicationChannelDraft(draft, []);
    assert.equal(
      errors.some((row) => row.field === "senderEmail"),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "host"),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "port"),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "username"),
      true,
    );
    assert.equal(
      validateCommunicationChannelDraft(
        {
          ...draft,
          senderEmail: "guest@example.com",
          providerValues: {
            host: "smtp.example.com",
            port: 587,
            username: "mailer",
            useTls: true,
          },
        },
        [],
      ).length,
      0,
    );
  });

  it("never persists credential-shaped provider keys", () => {
    assert.deepEqual(
      sanitizeCommunicationProviderConfig("email", "smtp", {
        host: "smtp.example.com",
        port: 587,
        username: "mailer",
        password: "do-not-store",
        apiKey: "do-not-store",
        bearerToken: "do-not-store",
        useTls: true,
      }),
      {
        host: "smtp.example.com",
        port: 587,
        username: "mailer",
        useTls: true,
      },
    );
    assert.match(supabaseMigration, /pms_integration_config_is_safe\(provider_config\)/);
  });

  it("reports honest session-only test outcomes", () => {
    const external = validateConnectionTest({
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
    assert.equal(external.result, "unsupported");
    assert.match(external.message, /no live adapter/i);
    assert.doesNotMatch(external.message, /connected successfully/i);

    const internal = validateConnectionTest({
      ...emptyCommunicationChannelDraft("guest_portal", "Noru Hotel"),
      active: true,
    });
    assert.equal(internal.result, "verified");
    assert.match(internal.message, /built-in/i);
  });

  it("marks readiness from one valid row per fixed channel", () => {
    const channels = COMMUNICATION_CHANNEL_TYPES.map(record);
    assert.equal(communicationChannelsConfigured(channels), true);
    assert.equal(communicationChannelsConfigured(channels.slice(1)), false);
  });

  it("keeps persistence tenant-scoped and test credentials out of storage", () => {
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /sanitizeCommunicationProviderConfig/);
    assert.match(functionsSrc, /sessionValues/);
    assert.doesNotMatch(functionsSrc, /provider_config:\s*data\.sessionValues/);
    assert.doesNotMatch(functionsSrc, /console\.(?:log|info|warn)\([^)]*sessionValues/);
  });

  it("renders the specified table, filters, details tabs, and session notice", () => {
    assert.match(uiSrc, /data-testid="card4-communication-channels"/);
    assert.match(uiSrc, /Search channel/);
    assert.match(uiSrc, /Filter/);
    assert.match(uiSrc, /Add Channel/);
    assert.match(uiSrc, /value="general"/);
    assert.match(uiSrc, /value="provider"/);
    assert.match(uiSrc, /value="message"/);
    assert.match(uiSrc, /value="signature"/);
    assert.match(uiSrc, /value="advanced"/);
    assert.match(uiSrc, /never saved/);
    assert.match(uiSrc, /statusFilter/);
  });

  it("keeps dual-lane migration text equal and enforces manager RLS", () => {
    assert.equal(supabaseMigration, drizzleMigration);
    assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'manager'\)/);
    assert.match(supabaseMigration, /UNIQUE \(restaurant_id, channel_type\)/);
    assert.match(supabaseMigration, /'email', 'sms', 'whatsapp', 'guest_portal', 'pms_in_app'/);
  });
});
