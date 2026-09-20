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
  CARD7_HASH,
  CARD7_HREF,
  CARD7_PHASE0_PLACEHOLDER,
  CARD7_PROGRAMME_CARD_ID,
  CARD7_PURPOSE,
  CARD7_TABS,
  CARD7_TITLE,
  card7FinishActivatesProperty,
  isCard7WorkspaceHash,
  resolveCard7Hash,
} from "./pms-property-setup-card7.ts";

const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card7-section.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/settings/pms-property-setup-card7-workspace.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
  "utf8",
);
const lib = readFileSync(new URL("./pms-property-setup-card7.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 7 Phase 0 shell", () => {
  it("promotes Security, Data & Reports with exactly four setup tabs", () => {
    const card = PROPERTY_SETUP_CARDS.find((row) => row.number === 7);
    assert.equal(CARD7_TITLE, "Security, Data & Reports");
    assert.equal(
      CARD7_PURPOSE,
      "Security & Roles, Audit, Reports & Analytics, Data Import & Migration.",
    );
    assert.equal(CARD7_HASH, "security-data-reports");
    assert.equal(CARD7_HREF, `${SET1_HUB_HREF}#security-data-reports`);
    assert.equal(CARD7_PROGRAMME_CARD_ID, "sales-distribution");
    assert.equal(card?.id, "sales-distribution");
    assert.equal(card?.specced, true);
    assert.equal(card?.hash, CARD7_HASH);
    assert.deepEqual(
      CARD7_TABS.map((tab) => tab.label),
      ["Security & Roles", "Audit", "Reports & Analytics", "Data Import & Migration"],
    );
    assert.equal(CARD7_TABS.length, 4);
    assert.equal(card7FinishActivatesProperty(), false);
  });

  it("uses a canonical hash without colliding with live Settings sections", () => {
    assert.equal(isCard7WorkspaceHash("#security-data-reports"), true);
    assert.equal(isCard7WorkspaceHash("#card-7"), true);
    assert.equal(isCard7WorkspaceHash("#card7"), true);
    assert.equal(isCard7WorkspaceHash("#security-audit"), false);
    assert.equal(isCard7WorkspaceHash("#reports"), false);
    assert.equal(isCard7WorkspaceHash("#administration"), false);
    assert.equal(isCard7WorkspaceHash("#notifications"), false);
    assert.equal(resolveCard7Hash("#card7"), CARD7_HASH);
    assert.equal(isSet1SectionHash("#security-data-reports"), false);
    assert.equal(isSet1SectionHash("#security-audit"), true);
    assert.equal(isSet1SectionHash("#reports"), true);
    assert.equal(isSet1SectionHash("#administration"), true);
    assert.equal(
      propertySetupRedirectHref("#card-7"),
      `${SET1_HUB_HREF}#security-data-reports`,
    );
  });

  it("wires full-screen navigation and every future workspace slot", () => {
    assert.match(hub, /PmsPropertySetupCard7Section/);
    assert.match(hub, /card7Open/);
    assert.match(hub, /isCard7WorkspaceHash/);
    assert.match(settings, /isCard7WorkspaceHash/);
    assert.match(settings, /hidePackageRail/);
    assert.match(section, /pms-card7-fullscreen/);
    assert.match(section, /pms-card7-top-nav/);
    assert.match(section, /pms-card7-tabs-slot/);
    assert.match(section, /CARD7_PHASE0_PLACEHOLDER/);
    assert.match(lib, /CARD7_PHASE0_PLACEHOLDER/);
    assert.equal(
      CARD7_PHASE0_PLACEHOLDER,
      "Configuration for this workspace will be implemented in a later phase.",
    );
    for (const slot of ["search", "content", "drawer", "status", "actions", "validate"]) {
      assert.match(workspace, new RegExp(`pms-card7-${slot}-slot`));
    }
  });

  it("implements all four Card 7 domains with Validate on the workspace", () => {
    assert.match(section, /getCard7Validation/);
    assert.match(section, /pms-card7-overall-validate/);
    const tab = readFileSync(
      new URL("../components/settings/pms-card7-security-roles-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(tab, /Add Role/);
    assert.match(tab, /CARD7_EMPTY_CATALOGUE_COPY/);
    const auditTab = readFileSync(
      new URL("../components/settings/pms-card7-audit-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(section, /Card7AuditTab/);
    assert.match(auditTab, /Save audit policy/);
    assert.match(auditTab, /CARD7_AUDIT_VIEWER_LIMITATIONS/);
    assert.match(auditTab, /unused folio writers/);
    assert.doesNotMatch(auditTab, /from\("folio_history"\)\.insert/);
    assert.doesNotMatch(auditTab, /signInWithPassword/);
    const reportsTab = readFileSync(
      new URL("../components/settings/pms-card7-reports-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(section, /Card7ReportsTab/);
    assert.match(reportsTab, /Save report catalogue/);
    assert.match(reportsTab, /Save metric settings/);
    assert.match(reportsTab, /Save report permissions/);
    assert.match(reportsTab, /Save export & schedule defaults/);
    assert.doesNotMatch(reportsTab, /Data Import|Migration/);
    assert.doesNotMatch(reportsTab, /getRevenueOverview|from\("hotel_reservations"\)/);
    const importTab = readFileSync(
      new URL("../components/settings/pms-card7-import-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(section, /Card7ImportTab/);
    assert.match(importTab, /Save import policy/);
    assert.match(importTab, /Save mapping templates/);
    assert.match(importTab, /Save duplicate policy/);
    assert.match(importTab, /Migration History/);
    assert.doesNotMatch(importTab, /papaparse|exceljs|mergeGuests|createReservation/);
    assert.doesNotMatch(importTab, /from\("hotel_reservations"\)/);
    assert.doesNotMatch(tab, /organization/);
    assert.doesNotMatch(tab, /hard delete|from\("pms_hotel_roles"\)\.delete/i);
    assert.doesNotMatch(tab, /staff_module_access/);
    assert.equal(
      existsSync(join(process.cwd(), "src/packages/pms/lib/pms-property-setup-card7.functions.ts")),
      true,
    );
    assert.doesNotMatch(workspace, /useQuery|useServerFn|useMutation|createServerFn|pmsDb/);
    assert.doesNotMatch(lib, /useQuery|useServerFn|useMutation|createServerFn|pmsDb/);
  });
});

describe("Card 7 dual-lane 0084", () => {
  it("ships identical Security & Roles SQL without a live authz resolver", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0084_pms_card7_security_roles.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0084_pms_card7_security_roles.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_permissions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_hotel_roles/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_role_permissions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_approval_rules/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS hotel_role_id uuid/);
    assert.match(sql, /data_scope IN \('property', 'department', 'own', 'assigned'\)/);
    assert.doesNotMatch(sql, /parent_department_id uuid/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_membership_hotel_roles/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_approval_requests/);
    assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS restaurant_users_role_check/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.staff_module_access/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_permissions/);
    assert.match(sql, /public\.has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /public\.is_restaurant_member\(restaurant_id\)/);
  });
});

describe("Card 7 dual-lane 0085", () => {
  it("seeds 88 global permissions with edit not update and 23 sensitive flags", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0085_pms_card7_permission_catalogue.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0085_pms_card7_permission_catalogue.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(
      sql,
      /action IN \(\s*'view',\s*'create',\s*'edit',\s*'delete',\s*'cancel',\s*'approve',\s*'post',\s*'refund',\s*'export',\s*'print',\s*'configure',\s*'activate',\s*'override',\s*'authorize'\s*\)/,
    );
    const rows = sql.split("\n").filter((line) => /^\s+\('[a-z]/.test(line));
    assert.equal(rows.length, 88);
    assert.equal(rows.filter((line) => /', true, true\)/.test(line)).length, 23);
    assert.equal(rows.filter((line) => /', 'approve',/.test(line)).length, 0);
    assert.equal(rows.filter((line) => /', 'update',/.test(line)).length, 0);
    assert.equal(rows.filter((line) => /', 'edit',/.test(line)).length > 0, true);
    assert.doesNotMatch(sql, /guest_services|pms_inventory|procurement\./);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.staff_module_access/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_permissions \([^;]*restaurant_id/s);
    assert.match(sql, /INSERT INTO public\.pms_permissions/);
    assert.match(sql, /ON CONFLICT \(code\) DO UPDATE SET/);
  });
});

describe("Card 7 dual-lane 0086", () => {
  it("adds audit policy tables without a second event log or ops writers", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0086_pms_card7_audit_policy.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0086_pms_card7_audit_policy.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_audit_policies/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_audit_categories/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_audit_category_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_audit_sensitive_coverage/);
    assert.match(sql, /coverage IN \('required', 'deferred', 'noted'\)/);
    assert.match(sql, /default_severity IN \('info', 'warning', 'critical'\)/);
    assert.match(sql, /retention_days IS NULL OR \(retention_days BETWEEN 1 AND 3650\)/);
    const categoryRows = sql.split("\n").filter((line) => /^\s+\('[a-z_]+', '/.test(line));
    assert.equal(categoryRows.length, 8);
    assert.match(sql, /pms_audit_retention_posture/);
    assert.match(sql, /not dropped/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_audit_events/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurant_staff_audit_log/);
    assert.doesNotMatch(sql, /INSERT INTO public\.folio_history/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.staff_module_access/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.\w*login/);
    assert.match(sql, /public\.has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /public\.is_restaurant_member\(restaurant_id\)/);
  });
});

describe("Card 7 dual-lane 0087", () => {
  it("adds reports setup tables without a query engine or scheduler", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0087_pms_card7_reports_setup.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0087_pms_card7_reports_setup.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_report_categories/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_report_definitions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_report_definition_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_metric_definitions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_metric_definition_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_report_permissions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_report_policies/);
    assert.match(sql, /'occupancy_range'/);
    assert.match(sql, /'occupancy_in_house'/);
    assert.match(sql, /'adr'/);
    assert.match(sql, /'revpar'/);
    assert.match(sql, /getRevenueOverview/);
    assert.match(sql, /getBookingsDashboard/);
    assert.match(sql, /reports\.pms\.export/);
    assert.match(sql, /configuration\.reports\.configure/);
    assert.match(sql, /pms_reports_catalogue_posture/);
    assert.match(sql, /pms_reports_schedule_access_posture/);
    assert.match(sql, /not dropped/);
    assert.match(sql, /period_basis IN \('business_date', 'fiscal_year'\)/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_report_runs/);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule/);
    assert.doesNotMatch(sql, /ADD COLUMN.*fiscal_year_start_month/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.getRevenueOverview/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.staff_module_access/);
    assert.match(sql, /public\.has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /public\.is_restaurant_member\(restaurant_id\)/);
  });
});

describe("Card 7 dual-lane 0088", () => {
  it("adds import setup tables without a parser, worker or generic writer", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0088_pms_card7_data_import.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0088_pms_card7_data_import.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_types/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_field_definitions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_policies/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_type_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_mapping_templates/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_mapping_template_fields/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_validation_rules/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_duplicate_policies/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_jobs/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_job_issues/);
    assert.match(sql, /'guest'/);
    assert.match(sql, /'room'/);
    assert.match(sql, /'room_type'/);
    assert.match(sql, /'rate_category'/);
    assert.match(sql, /'rate_plan'/);
    assert.match(sql, /createGuest/);
    assert.match(sql, /saveRoom/);
    assert.match(sql, /saveRatePlan/);
    assert.match(sql, /configuration\.import\.configure/);
    assert.match(sql, /data\.import_preview\.view/);
    assert.match(sql, /data\.import\.create/);
    assert.doesNotMatch(sql, /'preview'/);
    assert.doesNotMatch(sql, /'execute'/);
    assert.match(sql, /action IN \('warn', 'skip', 'block'\)/);
    assert.match(sql, /allowed_format = 'csv'/);
    assert.match(sql, /email,phone/);
    assert.match(sql, /This table does not enqueue work/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_import_rows/);
    assert.doesNotMatch(sql, /'createReservation'/);
    assert.doesNotMatch(sql, /action IN \('warn', 'skip', 'block', 'merge'\)/);
    assert.doesNotMatch(sql, /papaparse|exceljs/);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.staff_module_access/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.guest_merge_ledger/);
    assert.doesNotMatch(sql, /storage\.buckets/);
    assert.match(sql, /public\.has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /public\.is_restaurant_member\(restaurant_id\)/);
  });
});
