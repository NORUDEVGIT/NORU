import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SET1_HUB_HREF,
  isSet1SectionHash,
  propertySetupRedirectHref,
} from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD3_BACK_LABEL,
  CARD3_DOMAIN_PLACEHOLDER,
  CARD3_DOMAINS,
  CARD3_HASH,
  CARD3_HREF,
  CARD3_PROGRAMME_ID,
  CARD3_PROGRESS_LABEL,
  CARD3_PROGRESS_PERCENT,
  CARD3_PURPOSE,
  CARD3_SUBTITLE,
  CARD3_TITLE,
  isCard3WorkspaceHash,
  resolveCard3Hash,
} from "./pms-property-setup-card3.ts";

const here = dirname(fileURLToPath(import.meta.url));
const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-workspace.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
  "utf8",
);
const lib = readFileSync(new URL("./pms-property-setup-card3.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 3 Phase 0 shell", () => {
  it("keeps Financial & Commercial title, eight domains, and financial-commercial hash", () => {
    assert.equal(CARD3_TITLE, "Financial & Commercial");
    assert.equal(CARD3_SUBTITLE, "Configure pricing, taxes, payments & billing");
    assert.equal(CARD3_PURPOSE, "Taxes, Policies & Fees, Rates & Meal Plans, Payment Methods.");
    assert.equal(CARD3_HASH, "financial-commercial");
    assert.equal(CARD3_HREF, `${SET1_HUB_HREF}#financial-commercial`);
    assert.equal(CARD3_PROGRAMME_ID, "rates-guest-rules");
    assert.equal(PROPERTY_SETUP_CARDS[2]?.id, "rates-guest-rules");
    assert.equal(PROPERTY_SETUP_CARDS[2]?.title, CARD3_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[2]?.specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[2]?.hash, CARD3_HASH);
    assert.deepEqual(
      CARD3_DOMAINS.map((row) => row.title),
      [
        "Currency & Financial Settings",
        "Taxes & Fees",
        "Rates & Pricing",
        "Meal Plans & Packages",
        "Payments & Deposits",
        "Billing & Invoicing",
        "Corporate & Contract Rates",
        "Revenue & Commercial Rules",
      ],
    );
    assert.equal(CARD3_DOMAINS.length, 8);
    assert.equal(CARD3_PROGRESS_PERCENT, 0);
    assert.equal(CARD3_PROGRESS_LABEL, "Not Started");
    assert.doesNotMatch(lib, /86%/);
    assert.doesNotMatch(section, /86%/);
  });

  it("does not collide with SET1 rates or invent live completion", () => {
    assert.equal(isCard3WorkspaceHash("#financial-commercial"), true);
    assert.equal(isCard3WorkspaceHash("#card-3"), true);
    assert.equal(isCard3WorkspaceHash("#card3"), true);
    assert.equal(isCard3WorkspaceHash("#rates"), false);
    assert.equal(isCard3WorkspaceHash("#rates-guest-rules"), false);
    assert.equal(resolveCard3Hash("#card-3"), CARD3_HASH);
    assert.equal(isSet1SectionHash("#rates"), true);
    assert.equal(isSet1SectionHash("#financial-commercial"), false);
    assert.equal(propertySetupRedirectHref("#card-3"), `${SET1_HUB_HREF}#financial-commercial`);
    assert.equal(
      propertySetupRedirectHref("#financial-commercial"),
      `${SET1_HUB_HREF}#financial-commercial`,
    );
    assert.equal(propertySetupRedirectHref("#rates"), `${SET1_HUB_HREF}#rates`);
  });

  it("opens from the hub with Card 3 chrome, landing grid, and placeholder workspaces", () => {
    assert.match(hub, /PmsPropertySetupCard3Section/);
    assert.match(hub, /card3Open/);
    assert.match(hub, /isCard3WorkspaceHash/);
    assert.match(section, /pms-card3-fullscreen/);
    assert.match(section, /PropertySetupWorkspaceShell/);
    assert.doesNotMatch(section, /pms-card3-top-nav/);
    assert.doesNotMatch(section, /CARD1_PMS_NAV/);
    assert.match(section, /CARD3_SUBTITLE/);
    assert.doesNotMatch(section, /Configuration Progress/);
    assert.match(section, /pms-card3-domain-grid/);
    assert.match(section, />\s*Open\s*</);
    assert.match(section, /CARD3_DOMAIN_PLACEHOLDER/);
    assert.equal(CARD3_DOMAIN_PLACEHOLDER, "This workspace will be implemented in Phase 1.");
    assert.equal(CARD3_BACK_LABEL, "Financial & Commercial");
    assert.match(workspace, /pms-card3-tabs-slot/);
    assert.match(workspace, /pms-card3-drawer-slot/);
    assert.match(workspace, /pms-card3-content-slot/);
    assert.match(workspace, /CARD3_AUDIT_HISTORY_LABEL/);
    assert.match(workspace, /CARD3_BACK_LABEL/);
    assert.match(workspace, /PropertySetupSectionHeader/);
    assert.match(settings, /isCard3WorkspaceHash/);
    assert.match(settings, /hidePackageRail/);
    assert.doesNotMatch(section, /PmsPropertySetupWorkspace/);
  });

  it("authors dual-lane 0070 without applying APIs, Card 1 ownership, or a currency activity table", () => {
    const drizzle = join(
      here,
      "../../../../drizzle/migrations/0070_pms_card3_currency_financial.sql",
    );
    const supabase = join(
      here,
      "../../../../supabase/migrations/0070_pms_card3_currency_financial.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_property_currencies/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_exchange_rates/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_financial_settings/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_currency_activity/);
    assert.doesNotMatch(sql, /^\s+is_base\b/m);
    assert.match(sql, /quote currency units per 1 base currency unit/);
    assert.match(sql, /quote_currency_code/);
    assert.match(sql, /pms_exchange_rates_rate_positive CHECK \(rate > 0\)/);
    assert.match(sql, /source IN \('manual', 'bank', 'system'\)/);
    assert.match(sql, /fiscal_year_start_month BETWEEN 1 AND 12/);
    assert.match(sql, /fiscal_year_start_day BETWEEN 1 AND 31/);
    assert.match(sql, /restaurant_staff_audit_log/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /UPDATE public\.restaurants/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /WITH CHECK/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.equal(existsSync(join(here, "./pms-property-setup-card3.functions.ts")), false);
    assert.equal(existsSync(join(here, "./pms-property-setup-card3.server.ts")), false);
    assert.doesNotMatch(lib, /pmsDb|createServerFn|from\("pms_/);
    assert.doesNotMatch(workspace, /pmsDb|createServerFn/);
  });

  it("authors dual-lane 0071 Taxes & Fees masters without SET1, snapshots, or applied exemptions", () => {
    const drizzle = join(here, "../../../../drizzle/migrations/0071_pms_card3_taxes_fees.sql");
    const supabase = join(here, "../../../../supabase/migrations/0071_pms_card3_taxes_fees.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_taxes/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_tax_groups/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_tax_group_taxes/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_service_charges/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_fees/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_tax_exemption_rules/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_tax_exemptions\b/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_tax_activity/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /UPDATE public\.restaurants/);
    assert.doesNotMatch(sql, /\breservation_id\b/);
    assert.doesNotMatch(sql, /\bfolio_id\b/);
    assert.match(
      sql,
      /pms_taxes_charge_type_check CHECK \(charge_type IN \('percentage', 'fixed'\)\)/,
    );
    assert.match(
      sql,
      /pms_taxes_calculation_check CHECK \(calculation IN \('inclusive', 'exclusive'\)\)/,
    );
    assert.match(sql, /pms_tax_group_taxes_mapping_unique UNIQUE \(tax_group_id, tax_id\)/);
    assert.match(sql, /REFERENCES public\.pms_tax_groups \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_taxes \(id, restaurant_id\)/);
    assert.match(sql, /documentation_required/);
    assert.match(sql, /approval_required/);
    assert.match(sql, /restaurant_staff_audit_log/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /WITH CHECK/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
  });
});
