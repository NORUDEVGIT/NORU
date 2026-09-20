import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  isSet1SectionHash,
  propertySetupRedirectHref,
  SET1_HUB_HREF,
} from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD5_HASH,
  CARD5_HREF,
  CARD5_PHASE0_PLACEHOLDER,
  CARD5_PURPOSE,
  CARD5_TABS,
  CARD5_TITLE,
  isCard5WorkspaceHash,
  resolveCard5Hash,
  CARD5_PROGRAMME_CARD_ID,
  card5FinishActivatesProperty,
} from "./pms-property-setup-card5.ts";

const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card5-section.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/settings/pms-property-setup-card5-workspace.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
  "utf8",
);
const lib = readFileSync(new URL("./pms-property-setup-card5.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 5 Phase 0 shell", () => {
  it("promotes Organization & Facilities with exactly three setup tabs", () => {
    const card = PROPERTY_SETUP_CARDS.find((row) => row.number === 5);
    assert.equal(CARD5_TITLE, "Organization & Facilities");
    assert.equal(CARD5_PURPOSE, "Departments, Outlets & Facilities, Sales & Events.");
    assert.equal(CARD5_HASH, "organization-facilities");
    assert.equal(CARD5_HREF, `${SET1_HUB_HREF}#organization-facilities`);
    assert.equal(card?.specced, true);
    assert.equal(card?.hash, CARD5_HASH);
    assert.deepEqual(
      CARD5_TABS.map((tab) => tab.label),
      ["Departments", "Outlets & Facilities", "Sales & Events"],
    );
    assert.equal(CARD5_TABS.length, 3);
  });

  it("uses a canonical hash without colliding with live Settings sections", () => {
    assert.equal(isCard5WorkspaceHash("#organization-facilities"), true);
    assert.equal(isCard5WorkspaceHash("#card-5"), true);
    assert.equal(isCard5WorkspaceHash("#card5"), true);
    assert.equal(isCard5WorkspaceHash("#departments"), false);
    assert.equal(isCard5WorkspaceHash("#outlets"), false);
    assert.equal(isCard5WorkspaceHash("#sales-events"), false);
    assert.equal(resolveCard5Hash("#card5"), CARD5_HASH);
    assert.equal(isSet1SectionHash("#organization-facilities"), false);
    assert.equal(isSet1SectionHash("#departments"), true);
    assert.equal(isSet1SectionHash("#outlets"), true);
    assert.equal(isSet1SectionHash("#sales-events"), true);
    assert.equal(propertySetupRedirectHref("#card-5"), `${SET1_HUB_HREF}#organization-facilities`);
  });

  it("wires full-screen navigation and every future workspace slot", () => {
    assert.match(hub, /PmsPropertySetupCard5Section/);
    assert.match(hub, /card5Open/);
    assert.match(hub, /isCard5WorkspaceHash/);
    assert.match(settings, /isCard5WorkspaceHash/);
    assert.match(settings, /hidePackageRail/);
    assert.match(section, /pms-card5-fullscreen/);
    assert.match(section, /pms-card5-top-nav/);
    assert.match(section, /pms-card5-tabs-slot/);
    assert.match(section, /Card5DepartmentsTab/);
    assert.match(section, /Card5OutletsTab/);
    assert.match(section, /Card5SalesEventsTab/);
    assert.match(lib, /CARD5_PHASE0_PLACEHOLDER/);
    assert.equal(
      CARD5_PHASE0_PLACEHOLDER,
      "Configuration for this workspace will be implemented in a later phase.",
    );
    for (const slot of ["search", "content", "drawer", "status", "actions", "validate"]) {
      assert.match(workspace, new RegExp(`pms-card5-${slot}-slot`));
    }
  });

  it("keeps the Card 5 shell free of persistence while wiring the three domain tabs", () => {
    const sources = [lib, workspace];
    for (const source of sources) {
      assert.doesNotMatch(source, /useQuery|useServerFn|useMutation|createServerFn|pmsDb/);
    }
    assert.doesNotMatch(section, /Card5Placeholder/);
    assert.match(section, /getCard5Validation/);
    assert.match(section, /pms-card5-overall-validate/);
    assert.match(section, /pms-card5-validation-report/);
    const fnsPath = join(process.cwd(), "src/packages/pms/lib/pms-property-setup-card5.functions.ts");
    assert.equal(existsSync(fnsPath), true);
    const fns = readFileSync(fnsPath, "utf8");
    assert.match(fns, /getCard5Validation/);
    assert.doesNotMatch(fns, /\.update\(/);
    assert.doesNotMatch(fns, /\.insert\(/);
    assert.equal(CARD5_PROGRAMME_CARD_ID, "departments-services");
    assert.equal(card5FinishActivatesProperty(), false);
  });
});

describe("PMS Property Setup Card 5 migration 0077 dual-lane", () => {
  it("authors identical additive SQL without a second department master or SET5/Card 2 edits", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0077_pms_card5_departments.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0077_pms_card5_departments.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /ALTER TABLE public\.pms_departments/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS parent_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS default_language text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS default_notification_channel text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS default_priority text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS default_sla_minutes integer/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS escalation_manager_user_id uuid/);
    assert.match(sql, /FOREIGN KEY \(parent_id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_departments \(id, restaurant_id\)/);
    assert.match(sql, /FOREIGN KEY \(restaurant_id, manager_user_id\)/);
    assert.match(sql, /REFERENCES public\.restaurant_users \(restaurant_id, user_id\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_department_routing_rules/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /restaurant_staff_audit_log/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_departments/);
    assert.doesNotMatch(sql, /defaults jsonb/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_departments/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_departments/);
    assert.doesNotMatch(sql, /CREATE FUNCTION/i);
    assert.doesNotMatch(sql, /SECURITY DEFINER/i);
    assert.match(sql, /do not apply to production from an agent/i);
  });
});

describe("PMS Property Setup Card 5 migration 0078 dual-lane", () => {
  it("authors identical additive SQL without a second facility master or SET2 column edits", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0078_pms_card5_outlets_facilities.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0078_pms_card5_outlets_facilities.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /ALTER TABLE public\.pms_outlets/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS facility_category text NOT NULL DEFAULT 'other'/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS facility_type_code text NOT NULL DEFAULT 'custom'/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS building_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS floor_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS wing_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS department_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS manager_user_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS minimum_capacity integer/);
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS operating_hours jsonb NOT NULL DEFAULT '\{\}'::jsonb/,
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS tax_group_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS currency_code text/);
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'always_available'/,
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /REFERENCES public\.hotel_buildings \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_departments \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.restaurant_users \(restaurant_id, user_id\)/);
    assert.match(sql, /REFERENCES public\.pms_tax_groups \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_property_currencies \(restaurant_id, code\)/);
    assert.match(sql, /restaurant_staff_audit_log/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_facilities/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_outlets/);
    assert.doesNotMatch(sql, /DROP COLUMN IF EXISTS type/);
    assert.doesNotMatch(sql, /DROP COLUMN IF EXISTS is_default_rooms/);
    assert.doesNotMatch(sql, /DROP COLUMN IF EXISTS department_text/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_outlets/);
    assert.doesNotMatch(sql, /CREATE FUNCTION/i);
    assert.doesNotMatch(sql, /SECURITY DEFINER/i);
    assert.match(sql, /do not apply to production from an agent/i);
  });
});

describe("PMS Property Setup Card 5 migration 0079 dual-lane", () => {
  it("authors identical additive SQL without duplicating SET6 or Card 3 masters", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0079_pms_card5_sales_events_setup.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0079_pms_card5_sales_events_setup.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_function_space_outlets/);
    assert.match(sql, /REFERENCES public\.pms_function_space_labels \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_outlets \(id, restaurant_id\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_lead_types/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_event_statuses/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_sales_pipeline_stages/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_event_package_templates/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_event_package_template_outlets/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_event_package_template_services/);
    assert.match(sql, /REFERENCES public\.pms_event_types \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_tax_groups \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_property_currencies \(restaurant_id, code\)/);
    assert.match(sql, /REFERENCES public\.fo_service_catalogue \(id, restaurant_id\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_event_contract_defaults/);
    assert.match(sql, /REFERENCES public\.pms_deposit_policies \(id, restaurant_id\)/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /restaurant_staff_audit_log/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_market_segments/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_source_codes/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_event_types/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_function_space_labels/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_packages/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_corporate_agreements/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_leads/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /CREATE FUNCTION/i);
    assert.doesNotMatch(sql, /SECURITY DEFINER/i);
    assert.match(sql, /do not apply to production from an agent/i);
  });
});
