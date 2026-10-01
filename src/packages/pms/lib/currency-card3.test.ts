import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_BASE_CURRENCY,
  CARD3_CURRENCY_AUDIT_SECTION,
  CARD3_CURRENCY_TABS,
  calculateRateFreshness,
  emptyFinancialSettings,
  evaluateCurrencyCard3Readiness,
  formatFxDirection,
  type CurrencyCard3Snapshot,
} from "./currency-card3.server.ts";
import { FxService } from "./fx/fx-service.ts";
import type { FxProvider, FxFetchResponse } from "./fx/fx-provider.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./currency-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./currency-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-currency.tsx", import.meta.url),
  "utf8",
);

function snapshot(partial?: Partial<CurrencyCard3Snapshot>): CurrencyCard3Snapshot {
  return {
    inherited: { baseCurrency: "ETB", timezone: "Africa/Addis_Ababa", businessDate: "2026-09-18" },
    currencies: [],
    rates: [],
    settings: emptyFinancialSettings(),
    settingsRowExists: false,
    fxStatus: {
      providerName: "ExchangeRate-API",
      lastRefreshedAt: null,
      status: "never",
    },
    ...partial,
  };
}

describe("Card 3 Phase 1 currency readiness", () => {
  it("stays not started until anything is saved and never completes the Card 3 programme", () => {
    const empty = evaluateCurrencyCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);
    const started = evaluateCurrencyCard3Readiness(
      snapshot({
        settingsRowExists: true,
        settings: { ...emptyFinancialSettings(), saved: true },
      }),
    );
    assert.equal(started.status, "complete");
    const multi = evaluateCurrencyCard3Readiness(
      snapshot({
        settingsRowExists: true,
        settings: { ...emptyFinancialSettings(), saved: true, allowMultiCurrency: true },
        currencies: [
          {
            id: "1",
            code: "ETB",
            name: "Birr",
            symbol: "Br",
            decimalPlaces: 2,
            rounding: "half_up",
            active: true,
            isBase: true,
          },
        ],
      }),
    );
    assert.equal(multi.status, "in_progress");
    assert.ok(multi.blockers.some((row) => /non-base/i.test(row)));
    assert.doesNotMatch(fns, /rates-guest-rules/);
    assert.doesNotMatch(fns, /pms_property_setup_status/);
  });

  it("formats FX as one base unit to quote and rejects quote = base in the API", () => {
    assert.equal(formatFxDirection("ETB", "USD", 0.017), "1 ETB = 0.017 USD");
    assert.match(fns, /Quote currency cannot be the Card 1 base currency/);
    assert.match(fns, /rate > 0/);
    assert.match(fns, /z\.number\(\)\.positive/);
    assert.doesNotMatch(fns, /is_base/);
    assert.doesNotMatch(server, /is_base/);
  });

  it("reads as a member, writes as owner/manager, and audits on the shared staff log", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.match(fns, /requireRoomManager/);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.match(fns, /card3_currency_saved/);
    assert.match(fns, /card3_rate_saved/);
    assert.match(fns, /card3_financial_settings_saved/);
    assert.equal(CARD3_CURRENCY_AUDIT_SECTION, "card3-currency");
    assert.doesNotMatch(fns, /https?:\/\/|fetch\(/);
    assert.doesNotMatch(fns, /pms_currency_activity/);
    assert.equal(existsSync(join(here, "../../../../src/integrations/supabase/types.ts")), true);
    const types = readFileSync(join(here, "../../../../src/integrations/supabase/types.ts"), "utf8");
    assert.match(types, /pms_property_currencies/);
  });

  it("keeps five currency tabs and leaves remaining Card 3 domains as placeholders", () => {
    assert.deepEqual(
      CARD3_CURRENCY_TABS.map((tab) => tab.label),
      ["Overview", "Currencies", "Exchange Rates", "Financial Calendar", "Settings"],
    );
    assert.match(section, /PmsPropertySetupCard3Currency/);
    assert.match(ui, /CARD1_HREF/);
    assert.match(ui, /FX_DIRECTION_COPY/);
    assert.match(ui, /Card3ListSection/);
    assert.match(ui, /Save Rate/);
    assert.match(ui, /Base Currency/);
    assert.match(ui, /Refresh Rates/);
    assert.match(ui, /refreshExchangeRatesCard3/);
    assert.doesNotMatch(section, /CARD3_DOMAIN_PLACEHOLDER/);
    assert.doesNotMatch(ui, /Taxes & Fees configuration will/);
  });

  it("enforces ETB as canonical base currency and computes rate freshness accurately", () => {
    assert.equal(CANONICAL_BASE_CURRENCY, "ETB");
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(calculateRateFreshness(today), "current");
    assert.equal(calculateRateFreshness("2020-01-01"), "stale");
    assert.equal(calculateRateFreshness(""), "stale");
  });

  it("preserves same-day manual rates when automatic refresh executes", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const mockDb: any = {
      from(table: string) {
        if (table === "pms_property_currencies") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [
                    { code: "USD" },
                    { code: "EUR" },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "pms_exchange_rates") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [
                    {
                      id: "rate-1",
                      quote_currency_code: "USD",
                      rate: 0.008,
                      effective_date: today,
                      source: "manual",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            insert: (payload: any) => {
              assert.equal(payload.source, "system");
              return Promise.resolve({ error: null });
            },
            update: (payload: any) => {
              assert.equal(payload.source, "system");
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "restaurant_staff_audit_log") {
          return {
            insert: () => Promise.resolve({ error: null }),
            select: () => ({
              eq: () => ({
                contains: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    const mockProvider: FxProvider = {
      name: "MockProvider",
      fetchRates: async () => ({
        success: true,
        baseCurrency: "ETB",
        effectiveDate: today,
        fetchedAt: new Date().toISOString(),
        provider: "MockProvider",
        rates: { USD: 0.0075, EUR: 0.0069 },
      }),
    };

    const fxService = new FxService(mockProvider);
    const result = await fxService.refreshRatesForProperty(mockDb, "rest-123", "user-123");

    // USD had a same-day manual rate so it was preserved
    assert.equal(result.manualPreservedCount, 1);
    // EUR was updated
    assert.equal(result.persistedCount, 1);
    assert.equal(result.baseCurrency, "ETB");
  });
});


