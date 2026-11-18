import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_COMMERCIAL_AUDIT_SECTION,
  CARD3_COMMERCIAL_TABS,
  evaluateCommercialCard3Readiness,
  type CommercialCard3Snapshot,
} from "./commercial-card3.server.ts";
import {
  CARD2_RATES_HREF,
  card2StepHref,
} from "./pms-property-setup-card2.ts";
import {
  CARD3_INVENTORY_RULES_HREF,
  CARD3_PROMOTIONS_HREF,
  card3LegacyCommercialRedirectHref,
} from "./pms-property-setup-card3.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./commercial-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./commercial-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-commercial.tsx", import.meta.url),
  "utf8",
);
const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);

function snapshot(partial?: Partial<CommercialCard3Snapshot>): CommercialCard3Snapshot {
  return {
    roomTypes: [{ id: "rt1", code: "C2SM", name: "Small", active: true }],
    restrictions: [],
    promotions: [],
    seasons: [],
    overbooking: null,
    ...partial,
  };
}

const activePromotion = {
  id: "pr1",
  code: "SPRING",
  name: "Spring percent",
  promoKind: "percent" as const,
  promoKindLabel: "Percent",
  promoValue: 10,
  validFrom: "2026-03-01",
  validTo: "2026-04-30",
  conditions: "",
  description: "",
  active: true,
  roomTypeIds: [],
};

const activeSeason = {
  id: "sn1",
  code: "HIGH",
  name: "High season",
  seasonType: "high" as const,
  seasonTypeLabel: "High",
  validFrom: "2026-06-01",
  validTo: "2026-08-31",
  rateAdjustmentPercent: 15,
  description: "",
  active: true,
  roomTypeIds: [],
};

describe("Card 3 Phase 8 revenue and commercial rules", () => {
  it("treats empty promotions and pricing seasons as optional and activation-ready", () => {
    const empty = evaluateCommercialCard3Readiness(snapshot());
    assert.equal(empty.status, "complete");
    assert.equal(empty.ready, true);
    assert.deepEqual(empty.blockers, []);

    const withPromo = evaluateCommercialCard3Readiness(
      snapshot({ promotions: [activePromotion] }),
    );
    assert.equal(withPromo.status, "complete");
    assert.equal(withPromo.ready, true);
    assert.deepEqual(withPromo.blockers, []);

    const complete = evaluateCommercialCard3Readiness(
      snapshot({
        promotions: [activePromotion],
        seasons: [activeSeason],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);

    const invalid = evaluateCommercialCard3Readiness(
      snapshot({
        promotions: [{ ...activePromotion, validTo: "2020-01-01" }],
      }),
    );
    assert.equal(invalid.ready, true);
    assert.equal(invalid.blockers.length, 0);
    assert.ok(invalid.warnings.length > 0);
  });

  it("exposes Promotions and Pricing Seasons tabs and keeps restriction APIs", () => {
    assert.deepEqual(
      CARD3_COMMERCIAL_TABS.map((tab) => tab.label),
      ["Promotions", "Pricing Seasons"],
    );
    assert.equal(existsSync(join(here, "commercial-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "commercial-card3.functions.ts")), true);
    assert.match(fns, /export const getCommercialCard3/);
    assert.match(fns, /export const saveCommercialRestrictionCard3/);
    assert.match(fns, /export const saveCommercialPromotionCard3/);
    assert.match(fns, /export const saveCommercialSeasonCard3/);
  });

  it("wires promotions and pricing seasons only on the consolidated workspace", () => {
    assert.match(section, /getCommercialCard3/);
    assert.match(section, /PmsPropertySetupCard3Commercial/);
    assert.match(section, /domain\?\.id === "revenue-commercial-rules"/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_COMMERCIAL_TABS/);
    assert.match(ui, /Optional/);
    assert.match(ui, /not required for activation/);
    assert.match(ui, /Pricing Seasons/);
    assert.match(ui, /Search promotions/);
    assert.match(ui, /Search pricing seasons/);
    assert.match(ui, /No promotions configured/);
    assert.match(ui, /No pricing seasons configured/);
    assert.match(ui, /New Promotion/);
    assert.match(ui, /New Pricing Season/);
    assert.match(ui, /PromotionWizard/);
    assert.match(ui, /PricingSeasonWizard/);
    assert.match(ui, /Rate & Pricing owns actual price/);
    assert.doesNotMatch(ui, /title="Restrictions"/);
    assert.doesNotMatch(ui, /title="Overbooking"/);
    assert.doesNotMatch(ui, /saveCommercialRestrictionCard3/);
    assert.doesNotMatch(ui, /Add restriction/);
    assert.match(ui, /saveCommercialPromotionCard3/);
    assert.match(ui, /saveCommercialSeasonCard3/);
    assert.match(hub, /card3LegacyCommercialRedirectHref/);
  });

  it("redirects legacy restriction and overbooking focuses to owning domains", () => {
    assert.equal(
      card3LegacyCommercialRedirectHref(
        "?card3Domain=revenue-commercial-rules&card3Focus=restrictions",
      ),
      CARD2_RATES_HREF,
    );
    assert.equal(
      card3LegacyCommercialRedirectHref(
        "?card3Domain=revenue-commercial-rules&card3Focus=overbooking",
      ),
      CARD3_INVENTORY_RULES_HREF,
    );
    assert.equal(CARD3_INVENTORY_RULES_HREF, card2StepHref("inventory-rules"));
    assert.equal(
      card3LegacyCommercialRedirectHref(
        "?card3Domain=revenue-commercial-rules&card3Focus=promotions",
      ),
      CARD3_PROMOTIONS_HREF,
    );
    assert.equal(card3LegacyCommercialRedirectHref("?card3Domain=revenue-commercial-rules"), null);
  });

  it("requires setup actor, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requirePmsSetupActor/);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.equal(CARD3_COMMERCIAL_AUDIT_SECTION, "card3-commercial");
    assert.match(fns, /card3_commercial_restriction_saved/);
    assert.match(fns, /card3_promotion_saved/);
    assert.match(fns, /card3_season_saved/);
    assert.match(fns, /42P01/);
    assert.match(fns, /42703/);
    assert.match(fns, /PGRST205/);
    assert.match(fns, /PGRST204/);
    assert.doesNotMatch(server, /\bany\b/);
    assert.doesNotMatch(server, /pmsDb/);
    assert.doesNotMatch(fns, /Database\[/);
  });

  it("keeps restriction storage and does not load inventory overbooking for display", () => {
    assert.match(fns, /from\("pms_commercial_restrictions"\)/);
    assert.match(fns, /from\("pms_promotions"\)/);
    assert.match(fns, /from\("pms_seasons"\)/);
    assert.match(fns, /from\("room_types"\)/);
    assert.doesNotMatch(fns, /from\("pms_inventory_rules"\)/);
    assert.doesNotMatch(fns, /from\("room_types"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_restrictions"\)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_calendar"\)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_plans"\)/);
    assert.doesNotMatch(fns, /from\("price_hotel_stay"\)/);
    assert.doesNotMatch(fns, /pms_distribution_channel_posture/);
    assert.doesNotMatch(fns, /pms_property_setup_status|programme/);
    assert.match(fns, /overbooking: null/);
  });

  it("keeps the approved 0076 migration byte-identical and tenant-safe", () => {
    const drizzle = join(
      here,
      "../../../../drizzle/migrations/0076_pms_card3_revenue_commercial_rules.sql",
    );
    const supabase = join(
      here,
      "../../../../supabase/migrations/0076_pms_card3_revenue_commercial_rules.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_commercial_restrictions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_promotions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_seasons/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_commercial_restriction_room_types/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_promotion_room_types/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_season_room_types/);
    assert.match(sql, /restriction_kind IN \('min_stay', 'stop_sell', 'closed_to_arrival', 'closed_to_departure'\)/);
    assert.match(sql, /promo_kind IN \('percent', 'fixed', 'free_night'\)/);
    assert.match(sql, /season_type IN \('high', 'shoulder', 'low', 'custom'\)/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_commercial_restrictions/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_promotions/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_seasons/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.hotel_rate_restrictions/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_inventory_rules/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.hotel_rate_restrictions/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.pms_inventory_rules/);
  });
});
