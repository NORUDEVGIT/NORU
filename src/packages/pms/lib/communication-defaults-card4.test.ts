import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CARD1_LANGUAGES } from "./pms-property-setup-card1.ts";
import { COMMUNICATION_TEMPLATE_CATEGORIES } from "./communication-templates-card4.server.ts";
import { COMMON_CURRENCIES, COMMON_TIMEZONES } from "../../../shared/lib/property-time.ts";
import {
  SYSTEM_COMMUNICATION_DEFAULTS,
  buildSystemDefaultsDraft,
  communicationDefaultsConfigured,
  validateCommunicationDefaultsDraft,
  type CommunicationDefaultsDraft,
  type CommunicationDefaultsLookupChannel,
  type CommunicationDefaultsLookupSender,
} from "./communication-defaults-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./communication-defaults-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-communication-defaults.tsx", import.meta.url),
  "utf8",
);
const supabaseMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/0094_pms_card4_communication_defaults.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzleMigration = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0094_pms_card4_communication_defaults.sql",
    import.meta.url,
  ),
  "utf8",
);

const channels: CommunicationDefaultsLookupChannel[] = [
  { id: "00000000-0000-4000-8000-000000000601", channelType: "email", active: true },
  { id: "00000000-0000-4000-8000-000000000602", channelType: "sms", active: false },
  { id: "00000000-0000-4000-8000-000000000603", channelType: "pms_in_app", active: true },
];
const senders: CommunicationDefaultsLookupSender[] = [
  {
    id: "00000000-0000-4000-8000-000000000611",
    channelType: "email",
    senderName: "Noru Hotel",
    active: true,
  },
];

function completeDraft(): CommunicationDefaultsDraft {
  return {
    id: "00000000-0000-4000-8000-000000000699",
    defaultGuestChannelId: channels[0]!.id,
    defaultInternalChannelId: channels[2]!.id,
    defaultMarketingChannelId: channels[0]!.id,
    defaultLanguage: "en",
    timezone: "Africa/Addis_Ababa",
    dateFormat: "yyyy-mm-dd",
    timeFormat: "24h",
    defaultSenderId: senders[0]!.id,
    replyToEmail: "",
    signature: "",
    guestNotificationsEnabled: true,
    internalNotificationsEnabled: true,
    marketingCommunicationsEnabled: false,
    useGuestLanguage: true,
    attachBranding: false,
    currencyCode: "ETB",
    templateCategory: "reservation",
    deliveryTime: "09:00",
  };
}

describe("Card 4 Notifications communication defaults", () => {
  it("seeds system defaults from property catalogues and Phase 1/5 ids", () => {
    const draft = buildSystemDefaultsDraft(
      {
        timezone: "Africa/Addis_Ababa",
        currencyCode: "ETB",
        language: "am",
        hasLogo: true,
      },
      channels,
      senders,
    );
    assert.equal(draft.defaultGuestChannelId, channels[0]!.id);
    assert.equal(draft.defaultInternalChannelId, channels[2]!.id);
    assert.equal(draft.defaultMarketingChannelId, channels[0]!.id);
    assert.equal(draft.defaultSenderId, senders[0]!.id);
    assert.equal(draft.defaultLanguage, "am");
    assert.equal(draft.timezone, "Africa/Addis_Ababa");
    assert.equal(draft.currencyCode, "ETB");
    assert.equal(draft.dateFormat, SYSTEM_COMMUNICATION_DEFAULTS.dateFormat);
    assert.equal(draft.deliveryTime, "09:00");
    assert.equal(draft.marketingCommunicationsEnabled, false);
    assert.equal(
      CARD1_LANGUAGES.some((row) => row.id === "am"),
      true,
    );
    assert.equal(COMMON_TIMEZONES.includes("Africa/Addis_Ababa"), true);
    assert.equal(
      COMMON_CURRENCIES.some((row) => row.code === "ETB"),
      true,
    );
    assert.equal(COMMUNICATION_TEMPLATE_CATEGORIES.includes("reservation"), true);
  });

  it("keeps an inactive saved channel and rejects deleted ids", () => {
    const inactive = completeDraft();
    inactive.defaultGuestChannelId = channels[1]!.id;
    assert.equal(validateCommunicationDefaultsDraft(inactive, channels, senders).length, 0);
    const missing = completeDraft();
    missing.defaultGuestChannelId = "00000000-0000-4000-8000-000000000699";
    assert.equal(
      validateCommunicationDefaultsDraft(missing, channels, senders).some(
        (row) => row.field === "defaultGuestChannelId",
      ),
      true,
    );
    assert.equal(validateCommunicationDefaultsDraft(completeDraft(), channels, senders).length, 0);
    assert.equal(communicationDefaultsConfigured(completeDraft(), channels, senders), true);
    assert.equal(communicationDefaultsConfigured(null, channels, senders), false);
  });

  it("validates optional reply-to, delivery time, and language", () => {
    const invalid = completeDraft();
    invalid.replyToEmail = "not-an-email";
    invalid.deliveryTime = "9am";
    invalid.defaultLanguage = "xx-not-real";
    const errors = validateCommunicationDefaultsDraft(invalid, channels, senders);
    assert.equal(
      errors.some((row) => row.field === "replyToEmail"),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "deliveryTime"),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "defaultLanguage"),
      true,
    );
    const emptyReply = completeDraft();
    emptyReply.replyToEmail = "  ";
    assert.equal(validateCommunicationDefaultsDraft(emptyReply, channels, senders).length, 0);
  });

  it("keeps GET tenant-scoped and never writes restaurants, senders, or SET5", () => {
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /requireSupabaseAuth/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /\.from\("restaurants"\)\s*\.select\(/);
    assert.doesNotMatch(functionsSrc, /\.from\("restaurants"\)\s*\.update\(/);
    assert.doesNotMatch(functionsSrc, /\.from\("pms_communication_sender_settings"\)\s*\.update\(/);
    assert.doesNotMatch(functionsSrc, /\.from\("pms_communication_channels"\)\s*\.update\(/);
    assert.doesNotMatch(functionsSrc, /pms_notification_templates|pms_set5/);
    assert.doesNotMatch(functionsSrc, /\.from\("pms_communication_defaults"\)\s*\.delete\(/);
  });

  it("renders the specified sections, reset, and summary", () => {
    assert.match(uiSrc, /data-testid="card4-communication-defaults"/);
    assert.match(uiSrc, /Default Guest Channel/);
    assert.match(uiSrc, /Default Internal Channel/);
    assert.match(uiSrc, /Default Marketing Channel/);
    assert.match(uiSrc, /Default Language/);
    assert.match(uiSrc, /Default Time Zone/);
    assert.match(uiSrc, /Date Format/);
    assert.match(uiSrc, /Time Format/);
    assert.match(uiSrc, /Default Sender/);
    assert.match(uiSrc, /Default Reply-To Email/);
    assert.match(uiSrc, /Default Signature/);
    assert.match(uiSrc, /Enable guest notifications by default/);
    assert.match(uiSrc, /Enable internal notifications by default/);
    assert.match(uiSrc, /Enable marketing communications by default/);
    assert.match(uiSrc, /Use guest language for communications/);
    assert.match(uiSrc, /Attach hotel branding\/logo in messages/);
    assert.match(uiSrc, /Default Currency for Communication/);
    assert.match(uiSrc, /Default Template Category/);
    assert.match(uiSrc, /Default Notification Delivery Time/);
    assert.match(uiSrc, /Reset to System Defaults/);
    assert.match(uiSrc, /Current Settings Summary/);
    assert.match(uiSrc, /AlertDialog/);
  });

  it("keeps dual-lane 0094 SQL equal with RLS, FKs, and no secret vault", () => {
    assert.equal(supabaseMigration, drizzleMigration);
    assert.match(
      supabaseMigration,
      /CREATE TABLE IF NOT EXISTS public\.pms_communication_defaults/,
    );
    assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabaseMigration, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(supabaseMigration, /UNIQUE \(restaurant_id\)/);
    assert.match(supabaseMigration, /pms_communication_channels\(id, restaurant_id\)/);
    assert.match(supabaseMigration, /pms_communication_sender_settings\(id, restaurant_id\)/);
    assert.match(supabaseMigration, /ON DELETE SET NULL/);
    assert.doesNotMatch(supabaseMigration, /encrypted_|password text|secret_vault|vault/i);
    assert.doesNotMatch(supabaseMigration, /pms_notification_templates|pms_set5/);
  });
});
