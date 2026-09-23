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

const activeRestriction = {
  id: "rs1",
  code: "MIN2",
  name: "Two night stay",
  restrictionKind: "min_stay" as const,
  restrictionKindLabel: "Minimum stay",
  minStayNights: 2,
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  description: "",
  active: true,
  roomTypeIds: [],
};

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
  it("uses only not_started, in_progress, and complete for this domain", () => {
    const empty = evaluateCommercialCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);

    const started = evaluateCommercialCard3Readiness(
      snapshot({ restrictions: [activeRestriction] }),
    );
    assert.equal(started.status, "in_progress");
    assert.equal(started.ready, false);

    const complete = evaluateCommercialCard3Readiness(
      snapshot({
        restrictions: [activeRestriction],
        promotions: [activePromotion],
        seasons: [activeSeason],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);
  });

  it("exposes exactly the five Phase 8 tabs and the isolated API files", () => {
    assert.deepEqual(
      CARD3_COMMERCIAL_TABS.map((tab) => tab.label),
      ["Overview", "Restrictions", "Promotions", "Seasons", "Overbooking"],
    );
    assert.equal(existsSync(join(here, "commercial-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "commercial-card3.functions.ts")), true);
    assert.match(fns, /export const getCommercialCard3/);
    assert.match(fns, /export const saveCommercialRestrictionCard3/);
    assert.match(fns, /export const saveCommercialPromotionCard3/);
    assert.match(fns, /export const saveCommercialSeasonCard3/);
  });

  it("wires the Phase 8 workspace, inherited catalogues, editing, search, audit, and loading state", () => {
    assert.match(section, /getCommercialCard3/);
    assert.match(section, /PmsPropertySetupCard3Commercial/);
    assert.match(section, /domain\?\.id === "revenue-commercial-rules"/);
    assert.match(section, /commercialQuery\.isLoading/);
    assert.match(section, /commercialStatus/);
    assert.match(section, /Loading configuration readiness/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_COMMERCIAL_TABS/);
    assert.doesNotMatch(ui, /onAuditHistory/);
    assert.match(ui, /Card3ListSection/);
    assert.match(ui, /Card3OverlapSheet/);
    assert.match(ui, /Search restrictions/);
    assert.match(ui, /Search promotions/);
    assert.match(ui, /Search seasons/);
    assert.match(
      ui,
      /Overbooking policy is inherited from Card 2 Inventory Rules\.\s+This tab does not save\s+overbooking\./,
    );
    assert.match(
      ui,
      /Empty room-type mapping means all types as a setup hint, not an\s+availability engine\./,
    );
    assert.match(
      ui,
      /This configuration does not write hotel_rate_restrictions or\s+price_hotel_stay\./,
    );
    assert.match(ui, /SET6 channel stop-sell stays out of this workspace./);
    assert.match(ui, /saveCommercialRestrictionCard3/);
    assert.match(ui, /saveCommercialPromotionCard3/);
    assert.match(ui, /saveCommercialSeasonCard3/);
    assert.match(ui, /focus-visible:ring-\[#C89933\]/);
  });

  it("requires member reads, manager writes, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.ok((fns.match(/requireRoomManager/g) ?? []).length >= 3);
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

  it("reuses room types and inventory overlay without writing engines", () => {
    assert.match(fns, /from\("pms_commercial_restrictions"\)/);
    assert.match(fns, /from\("pms_promotions"\)/);
    assert.match(fns, /from\("pms_seasons"\)/);
    assert.match(fns, /from\("room_types"\)/);
    assert.match(fns, /from\("pms_inventory_rules"\)/);
    assert.doesNotMatch(fns, /from\("room_types"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("pms_inventory_rules"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_restrictions"\)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_calendar"\)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_plans"\)/);
    assert.doesNotMatch(fns, /from\("price_hotel_stay"\)/);
    assert.doesNotMatch(fns, /pms_distribution_channel_posture/);
    assert.doesNotMatch(fns, /pms_property_setup_status|programme/);
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
