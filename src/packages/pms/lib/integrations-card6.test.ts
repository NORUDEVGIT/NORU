import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  INTEGRATION_CATALOG,
  buildPersistedConfig,
  defaultAuthMethod,
  defaultIntegrationValues,
  persistableFieldIds,
  simulateIntegrationTest,
  validateIntegrationDraft,
  visibleIntegrationFields,
  type IntegrationDraft,
} from "./integrations-catalog.ts";
import {
  SECRET_KEY_PATTERN,
  statusAfterSave,
  statusAfterSimulatedTest,
  statusAfterToggle,
  summarizeIntegrations,
  type IntegrationRecord,
} from "./integrations-card6.server.ts";
import { CARD6_HASH, CARD6_TABS, isCard6WorkspaceHash } from "./pms-property-setup-card6.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";

function draftFor(category: string, provider: string, overrides: Partial<IntegrationDraft> = {}) {
  const authMethod = defaultAuthMethod(category, provider);
  return {
    name: "Test integration",
    category,
    provider,
    environment: "sandbox",
    authMethod,
    description: "",
    events: [],
    values: defaultIntegrationValues(category, provider),
    ...overrides,
  } satisfies IntegrationDraft;
}

function record(partial: Partial<IntegrationRecord>): IntegrationRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Sample",
    category: "payments",
    provider: "stripe",
    environment: "sandbox",
    status: "pending",
    enabled: true,
    description: null,
    authMethod: "api_key",
    config: {},
    events: [],
    webhookPath: null,
    lastTestAt: null,
    lastTestResult: null,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...partial,
  };
}

describe("Card 6 integration catalog", () => {
  it("gives every category providers and every provider usable fields", () => {
    assert.ok(INTEGRATION_CATALOG.length >= 7);
    for (const category of INTEGRATION_CATALOG) {
      assert.ok(category.providers.length > 0, `${category.id} has no providers`);
      for (const provider of category.providers) {
        assert.ok(provider.authMethods.length > 0, `${provider.id} has no auth method`);
        assert.ok(provider.fields.length > 0, `${provider.id} has no fields`);
        const ids = provider.fields.map((row) => row.id);
        assert.equal(new Set(ids).size, ids.length, `${provider.id} repeats a field id`);
        for (const field of provider.fields) {
          if (field.type === "select") {
            assert.ok(
              (field.options ?? []).length > 0,
              `${provider.id}.${field.id} has no options`,
            );
          }
          if (SECRET_KEY_PATTERN.test(field.id)) {
            assert.equal(field.secret, true, `${provider.id}.${field.id} is not flagged secret`);
          }
        }
      }
    }
  });

  it("varies the provider list and the fields by category", () => {
    const payments = visibleIntegrationFields("payments", "stripe", "api_key", {});
    const email = visibleIntegrationFields("email", "smtp", "basic", {});
    assert.ok(payments.some((row) => row.id === "captureMode"));
    assert.ok(!payments.some((row) => row.id === "fromEmail"));
    assert.ok(email.some((row) => row.id === "fromEmail"));
    assert.ok(!email.some((row) => row.id === "captureMode"));
  });

  it("omits fields that do not apply to the selected auth method or toggle", () => {
    const basic = visibleIntegrationFields("payments", "generic_gateway", "basic", {});
    assert.ok(basic.some((row) => row.id === "username"));
    assert.ok(!basic.some((row) => row.id === "apiKey"));

    const apiKey = visibleIntegrationFields("payments", "generic_gateway", "api_key", {});
    assert.ok(apiKey.some((row) => row.id === "apiKey"));
    assert.ok(!apiKey.some((row) => row.id === "username"));

    const unsigned = visibleIntegrationFields("payments", "stripe", "api_key", {
      verifySignatures: false,
    });
    assert.ok(!unsigned.some((row) => row.id === "signingSecret"));
    const signed = visibleIntegrationFields("payments", "stripe", "api_key", {
      verifySignatures: true,
    });
    assert.ok(signed.some((row) => row.id === "signingSecret"));
  });
});

describe("Card 6 validation", () => {
  it("blocks an empty draft with per-field messages", () => {
    const errors = validateIntegrationDraft(draftFor("payments", "stripe", { name: "  " }));
    assert.equal(errors["name"], "Give this integration a name.");
    assert.equal(errors["publishableKey"], "Publishable key is required.");
    assert.equal(errors["secretKey"], "Secret key is required.");
  });

  it("checks URL, email and numeric formats", () => {
    const smtp = draftFor("email", "smtp");
    smtp.values["host"] = "not a host";
    smtp.values["port"] = 99999;
    smtp.values["fromEmail"] = "nope";
    const errors = validateIntegrationDraft(smtp);
    assert.equal(errors["host"], "Enter a valid hostname.");
    assert.equal(errors["port"], "Enter 65535 or less.");
    assert.equal(errors["fromEmail"], "Enter a valid email address.");
  });

  it("does not demand credentials for an auth method that is not selected", () => {
    const noAuth = draftFor("payments", "generic_gateway", { authMethod: "none" });
    noAuth.values["baseUrl"] = "https://pay.example.com";
    const errors = validateIntegrationDraft(noAuth);
    assert.equal(errors["apiKey"], undefined);
    assert.equal(errors["password"], undefined);
  });
});

describe("Card 6 credential isolation", () => {
  it("drops every secret field from the persisted config, for every provider", () => {
    for (const category of INTEGRATION_CATALOG) {
      for (const provider of category.providers) {
        for (const authMethod of provider.authMethods) {
          const draft = draftFor(category.id, provider.id, { authMethod });
          for (const field of provider.fields) {
            draft.values[field.id] = field.type === "toggle" ? true : "filled-value";
          }
          const config = buildPersistedConfig(draft);
          for (const field of provider.fields) {
            if (!field.secret) continue;
            assert.equal(
              field.id in config,
              false,
              `${provider.id}.${field.id} leaked into the persisted config`,
            );
          }
          for (const key of Object.keys(config)) {
            assert.equal(
              SECRET_KEY_PATTERN.test(key),
              false,
              `${provider.id} persisted a credential-shaped key: ${key}`,
            );
          }
        }
      }
    }
  });

  it("excludes secret fields from the server-side allowlist", () => {
    const allowed = persistableFieldIds("payments", "stripe");
    assert.ok(allowed.includes("publishableKey"));
    assert.equal(allowed.includes("secretKey"), false);
    assert.equal(allowed.includes("signingSecret"), false);
  });

  it("ignores values left over from a provider the operator moved away from", () => {
    const draft = draftFor("payments", "stripe");
    draft.values["publishableKey"] = "pk_test_123";
    draft.values["database"] = "odoo-leftover";
    const config = buildPersistedConfig(draft);
    assert.equal(config["publishableKey"], "pk_test_123");
    assert.equal("database" in config, false);
  });
});

describe("Card 6 honesty locks", () => {
  it("never promotes an integration to connected", () => {
    assert.equal(statusAfterSave(true), "pending");
    assert.equal(statusAfterSave(false), "disabled");
    assert.equal(statusAfterSimulatedTest("passed", true), "pending");
    assert.equal(statusAfterSimulatedTest("failed", true), "error");
    assert.equal(statusAfterSimulatedTest("passed", false), "disabled");
    assert.equal(statusAfterToggle(true, "not_configured"), "pending");
    assert.equal(statusAfterToggle(false, "pending"), "disabled");
  });

  it("only preserves connected when a previous phase already set it", () => {
    assert.equal(statusAfterSave(true, "connected"), "connected");
    assert.equal(statusAfterSave(true, "error"), "pending");
  });

  it("passes the simulated test only when the draft is genuinely complete", () => {
    const incomplete = simulateIntegrationTest(draftFor("payments", "stripe"));
    assert.equal(incomplete.result, "failed");
    assert.ok(incomplete.checks.some((check) => check.id === "credentials" && !check.passed));

    const complete = draftFor("payments", "stripe");
    complete.values["publishableKey"] = "pk_test_123";
    complete.values["secretKey"] = "sk_test_123";
    const outcome = simulateIntegrationTest(complete);
    assert.equal(outcome.result, "passed");
  });

  it("fails the simulated test on a malformed endpoint", () => {
    const draft = draftFor("payments", "cbe_birr");
    draft.values["merchantCode"] = "M-1";
    draft.values["apiUsername"] = "noru";
    draft.values["apiPassword"] = "secret";
    draft.values["endpointUrl"] = "pay.cbe.local";
    const outcome = simulateIntegrationTest(draft);
    assert.equal(outcome.result, "failed");
    assert.ok(outcome.checks.some((check) => check.id === "endpoints" && !check.passed));
  });
});

describe("Card 6 summary", () => {
  it("separates enabled, awaiting setup and failing integrations", () => {
    const summary = summarizeIntegrations([
      record({ id: "1", status: "pending", enabled: true }),
      record({ id: "2", status: "not_configured", enabled: true }),
      record({ id: "3", status: "error", enabled: true }),
      record({ id: "4", status: "disabled", enabled: false }),
    ]);
    assert.deepEqual(summary, { total: 4, enabled: 3, awaitingSetup: 2, errors: 1 });
  });
});

describe("Card 6 wiring and phase isolation", () => {
  it("promotes Card 6 and routes the legacy integrations alias to it", () => {
    const card = PROPERTY_SETUP_CARDS.find((row) => row.number === 6);
    assert.equal(card?.specced, true);
    assert.equal(card?.hash, CARD6_HASH);
    assert.equal(isCard6WorkspaceHash("#card6"), true);
    assert.equal(isCard6WorkspaceHash("#rooms-inventory"), false);

    const hub = readFileSync(
      new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
      "utf8",
    );
    assert.match(hub, /PmsPropertySetupCard6Section/);
    // Card 6's id and hash differ, so the card link must follow the hash.
    assert.match(hub, /SET1_HUB_HREF\}#\$\{card\.hash\}/);

    const set5 = readFileSync(new URL("./pms-set5-depts-guestsvc.ts", import.meta.url), "utf8");
    assert.match(
      set5,
      /SET5_INTEGRATIONS_HREF = "\/restaurant\/settings#connectivity-distribution"/,
    );
  });

  it("keeps Distribution inactive and out of the Phase 1 implementation", () => {
    assert.deepEqual(
      CARD6_TABS.map((tab) => [tab.id, tab.available]),
      [
        ["integrations", true],
        ["distribution", false],
      ],
    );
    const sources = [
      "./integrations-catalog.ts",
      "./integrations-card6.server.ts",
      "./integrations-card6.functions.ts",
      "../components/settings/pms-card6-integrations-tab.tsx",
      "../components/settings/pms-card6-integration-drawer.tsx",
    ];
    for (const path of sources) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      assert.doesNotMatch(source, /distribution_channels/, `${path} touches distribution_channels`);
      assert.doesNotMatch(source, /distribution_room_mappings|distribution_rate_mappings/, path);
      assert.doesNotMatch(source, /saveRoomMapping|saveRateMapping|setChannelStatus/, path);
    }
  });

  it("ships dual-lane 0069 with tenant RLS and a credential-shaped key guard", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0069_pms_card6_integrations.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0069_pms_card6_integrations.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_integrations/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_integration_activity/);
    assert.match(sql, /ALTER TABLE public\.pms_integrations ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /ALTER TABLE public\.pms_integration_activity ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /pms_integrations_config_no_secret_check/);
    assert.match(sql, /pms_integration_config_is_safe/);
    // The header names the distribution tables to explain the split; nothing may read or write them.
    assert.doesNotMatch(sql, /(FROM|JOIN|REFERENCES|INTO|UPDATE|TABLE)\s+(public\.)?distribution_/);
  });

  it("re-derives the config allowlist on the server rather than trusting the browser", () => {
    const functions = readFileSync(
      new URL("./integrations-card6.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(functions, /requireRoomManager/);
    assert.match(functions, /persistableFieldIds/);
    assert.match(functions, /SECRET_KEY_PATTERN/);
    assert.match(functions, /statusAfterSimulatedTest/);
    assert.doesNotMatch(functions, /status: "connected"/);
  });
});
