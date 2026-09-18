import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  DIRECT_CHANNEL_CODE,
  DEFAULT_DISTRIBUTION_SYNC_CONFIG,
  mappingStatusAfterSave,
  mappingStatusAfterToggle,
  summarizeDistribution,
  type DistributionDraft,
} from "./distribution-card6.server.ts";
import {
  channelSupports,
  distributionChannel,
  distributionProvider,
  draftHasBlockingErrors,
  distributionSyncCapabilities,
  isEligibleDistributionIntegration,
  validateDistributionDraft,
  validateDistributionSyncConfig,
} from "./distribution-catalog.ts";
import { CARD6_TABS } from "./pms-property-setup-card6.ts";

const rooms = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Deluxe" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Twin" },
];
const rates = [{ id: "33333333-3333-3333-3333-333333333333", name: "BAR" }];
const meals = [{ id: "44444444-4444-4444-4444-444444444444", name: "BB" }];

const aiosell = {
  id: "55555555-5555-5555-5555-555555555555",
  name: "Aiosell",
  provider: "aiosell",
  enabled: true,
  status: "pending",
};

function draft(overrides: Partial<DistributionDraft> = {}): DistributionDraft {
  return {
    integrationId: aiosell.id,
    channel: "booking_com",
    environment: "sandbox",
    rooms: [],
    rates: [],
    meals: [],
    ...overrides,
  };
}

describe("Card 6 distribution catalog", () => {
  it("varies channels and mapping kinds by provider", () => {
    const aiosellDef = distributionProvider("aiosell");
    const ota = distributionProvider("generic_ota");
    assert.ok(aiosellDef);
    assert.ok(ota);
    assert.ok(aiosellDef.channels.some((row) => row.id === "expedia"));
    assert.ok(!ota.channels.some((row) => row.id === "expedia"));
    assert.equal(channelSupports("aiosell", "agoda", "meals"), false);
    assert.equal(channelSupports("aiosell", "booking_com", "meals"), true);
    assert.ok(distributionChannel("aiosell", "booking_com")?.rooms.length);
  });

  it("does not invent a policy mapping kind", () => {
    const catalog = readFileSync(new URL("./distribution-catalog.ts", import.meta.url), "utf8");
    assert.doesNotMatch(catalog, /policyMappings|policy_type/);
    const drawer = readFileSync(
      new URL("../components/settings/pms-card6-distribution-drawer.tsx", import.meta.url),
      "utf8",
    );
    assert.match(drawer, /POLICY_MAPPING_NOTICE/);
    assert.doesNotMatch(drawer, /Noru Policy/);
  });
});

describe("Card 6 distribution eligibility and honesty", () => {
  it("accepts enabled pending integrations and rejects disabled or error", () => {
    assert.equal(isEligibleDistributionIntegration(aiosell), true);
    assert.equal(isEligibleDistributionIntegration({ ...aiosell, status: "connected" }), true);
    assert.equal(isEligibleDistributionIntegration({ ...aiosell, enabled: false }), false);
    assert.equal(isEligibleDistributionIntegration({ ...aiosell, status: "error" }), false);
    assert.equal(isEligibleDistributionIntegration({ ...aiosell, status: "disabled" }), false);
    assert.equal(isEligibleDistributionIntegration({ ...aiosell, provider: "stripe" }), false);
  });

  it("never promotes a save to connected", () => {
    assert.equal(mappingStatusAfterSave(true, false), "pending");
    assert.equal(mappingStatusAfterSave(true, true), "attention");
    assert.equal(mappingStatusAfterSave(false, false), "disabled");
    assert.equal(mappingStatusAfterToggle(false, "pending"), "disabled");
    assert.equal(mappingStatusAfterToggle(true, "disabled"), "pending");
    const functions = readFileSync(
      new URL("./distribution-card6.functions.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(functions, /mapping_status:\s*"connected"/);
    assert.match(functions, /status: "not_connected"/);
  });

  it("keeps external Sync Now disabled and does not invent results", () => {
    const tab = readFileSync(
      new URL("../components/settings/pms-card6-distribution-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(tab, /external sync service is not connected/i);
    assert.match(tab, /Sync now/);
    assert.match(tab, /disabled title=\{SYNC_SERVICE_NOTICE\}/);
    assert.doesNotMatch(tab, /Today 10:24/);
    assert.doesNotMatch(tab, /records processed:\s*128/i);
  });
});

describe("Card 6 distribution validation", () => {
  it("blocks a missing integration or channel and allows a partial mapping save", () => {
    const missing = validateDistributionDraft(draft({ integrationId: "" }), {
      integration: null,
      roomTypes: rooms,
      ratePlans: rates,
      mealPlans: meals,
      takenChannels: [],
      excludeId: null,
    });
    assert.equal(draftHasBlockingErrors(missing), true);

    const partial = validateDistributionDraft(draft(), {
      integration: aiosell,
      roomTypes: rooms,
      ratePlans: rates,
      mealPlans: meals,
      takenChannels: [],
      excludeId: null,
    });
    assert.equal(draftHasBlockingErrors(partial), false);
    assert.ok(partial.some((row) => row.id === "rooms_complete" && row.warning));
  });

  it("rejects duplicate Noru or external mappings and inactive PMS ids", () => {
    const duplicate = validateDistributionDraft(
      draft({
        rooms: [
          { noruId: rooms[0]!.id, externalId: "bcom_deluxe_double" },
          { noruId: rooms[0]!.id, externalId: "bcom_suite" },
        ],
      }),
      {
        integration: aiosell,
        roomTypes: rooms,
        ratePlans: rates,
        mealPlans: meals,
        takenChannels: [],
        excludeId: null,
      },
    );
    assert.equal(duplicate.find((row) => row.id === "rooms_valid")?.passed, false);

    const ghost = validateDistributionDraft(
      draft({
        rooms: [
          { noruId: "99999999-9999-9999-9999-999999999999", externalId: "bcom_deluxe_double" },
        ],
      }),
      {
        integration: aiosell,
        roomTypes: rooms,
        ratePlans: rates,
        mealPlans: meals,
        takenChannels: [],
        excludeId: null,
      },
    );
    assert.equal(ghost.find((row) => row.id === "rooms_valid")?.passed, false);
  });

  it("hides meal completeness when the channel does not support meals", () => {
    const checks = validateDistributionDraft(draft({ channel: "agoda" }), {
      integration: aiosell,
      roomTypes: rooms,
      ratePlans: rates,
      mealPlans: meals,
      takenChannels: [],
      excludeId: null,
    });
    assert.ok(!checks.some((row) => row.id === "meals_complete"));
  });
});

describe("Card 6 distribution wiring", () => {
  it("enables the Distribution tab and excludes DIRECT", () => {
    assert.deepEqual(
      CARD6_TABS.map((tab) => [tab.id, tab.available]),
      [
        ["integrations", true],
        ["distribution", true],
      ],
    );
    const functions = readFileSync(
      new URL("./distribution-card6.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(functions, /requireDistributionManager/);
    assert.match(functions, new RegExp(DIRECT_CHANNEL_CODE));
    assert.match(functions, /NORU Direct Booking is not configured from this tab/);
    assert.match(functions, /rejectSecrets/);
    assert.match(functions, /\.strict\(\)/);
  });

  it("does not ask for credentials in the distribution drawer", () => {
    const drawer = readFileSync(
      new URL("../components/settings/pms-card6-distribution-drawer.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(drawer, /apiKey|clientSecret|merchantId|webhookSecret|SecretInput/);
    const tab = readFileSync(
      new URL("../components/settings/pms-card6-distribution-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(tab, /Go to Integrations/);
  });

  it("ships dual-lane 0070 that extends distribution tables without touching DIRECT seed", () => {
    const drizzle = join(
      process.cwd(),
      "drizzle/migrations/0070_pms_card6_distribution_mapping.sql",
    );
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0070_pms_card6_distribution_mapping.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /integration_id/);
    assert.match(sql, /mapping_status/);
    assert.match(sql, /distribution_meal_mappings/);
    assert.match(sql, /external_entity_id/);
    assert.match(sql, /'distribution'/);
    assert.doesNotMatch(sql, /INSERT INTO public\.distribution_channels/);
    assert.doesNotMatch(sql, /DROP TABLE/);
  });

  it("hides the package rail for Card 6", () => {
    const settings = readFileSync(
      new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
      "utf8",
    );
    assert.match(settings, /isCard6WorkspaceHash/);
  });
});

describe("Card 6 distribution summary", () => {
  it("counts operationally active, pending and attention configurations", () => {
    assert.deepEqual(
      summarizeDistribution([
        { mappingStatus: "pending", activationStatus: "active" },
        { mappingStatus: "pending", activationStatus: "inactive" },
        { mappingStatus: "attention", activationStatus: "inactive" },
        { mappingStatus: "disabled", activationStatus: "inactive" },
      ]),
      { total: 4, connected: 1, pending: 1, attention: 1 },
    );
  });
});

describe("Card 6 Phase 3 sync configuration", () => {
  it("uses channel capabilities and blocks activation with no enabled sync type", () => {
    const capabilities = distributionSyncCapabilities("aiosell", "booking_com");
    assert.ok(capabilities);
    assert.equal(capabilities.manualSync, false);
    assert.equal(capabilities.retry, false);
    assert.equal(capabilities.restrictions.supported, false);
    assert.equal(
      draftHasBlockingErrors(
        validateDistributionSyncConfig(DEFAULT_DISTRIBUTION_SYNC_CONFIG, capabilities),
      ),
      true,
    );
    assert.equal(
      draftHasBlockingErrors(
        validateDistributionSyncConfig(
          {
            ...DEFAULT_DISTRIBUTION_SYNC_CONFIG,
            inventory: { ...DEFAULT_DISTRIBUTION_SYNC_CONFIG.inventory, enabled: true },
          },
          capabilities,
        ),
      ),
      false,
    );
  });

  it("ships byte-identical dual-lane 0071 without fake history tables", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0071_pms_card6_distribution_sync.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0071_pms_card6_distribution_sync.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /sync_config/);
    assert.match(sql, /sync_active/);
    assert.match(sql, /activated_at/);
    assert.doesNotMatch(sql, /sync_runs|sync_errors|INSERT INTO/);
  });
});
