import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  SET1_HUB_HREF,
  isSet1SectionHash,
  propertySetupRedirectHref,
} from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD4_GST_STEPS,
  CARD4_HASH,
  CARD4_HREF,
  CARD4_MAIN_SECTIONS,
  CARD4_STEPS,
  CARD4_TITLE,
  evaluateCard4StepStatus,
  evaluateGstStepStatus,
  isCard4WorkspaceHash,
  nextCard4GstStep,
  nextCard4Step,
  resolveCard4Hash,
} from "./pms-property-setup-card4.ts";

const lib = readFileSync(new URL("./pms-property-setup-card4.ts", import.meta.url), "utf8");
const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card4-section.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
  "utf8",
);
const wave1 = readFileSync(new URL("./guest-profile-wave1.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 4 Phase 1 shell", () => {
  it("promotes Guest & Services with guest-services hash and six Guest Profile Rules steps", () => {
    assert.equal(CARD4_TITLE, "Guest & Services");
    assert.equal(CARD4_HASH, "guest-services");
    assert.equal(CARD4_HREF, `${SET1_HUB_HREF}#guest-services`);
    assert.equal(PROPERTY_SETUP_CARDS[3]?.id, "housekeeping-maintenance");
    assert.equal(PROPERTY_SETUP_CARDS[3]?.title, CARD4_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[3]?.specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[3]?.hash, CARD4_HASH);
    assert.equal(CARD4_STEPS.length, 6);
    assert.deepEqual(
      CARD4_STEPS.map((row) => [row.number, row.id, row.title]),
      [
        [1, "profile-types", "Profile Types"],
        [2, "required-fields", "Required Fields"],
        [3, "identity-documents", "Identity Documents"],
        [4, "preferences", "Preferences"],
        [5, "company-business", "Company & Business"],
        [6, "group-types", "Group Types"],
      ],
    );
    assert.equal(
      CARD4_STEPS.some(
        (row) =>
          /matching|privacy|defaults/i.test(row.id) ||
          /matching|privacy|^defaults$/i.test(row.title),
      ),
      false,
    );
    assert.equal(nextCard4Step("profile-types"), "required-fields");
    assert.equal(evaluateCard4StepStatus("profile-types", undefined, true), "complete");
    assert.equal(evaluateCard4StepStatus("required-fields", undefined, true), "not_started");
    assert.equal(evaluateCard4StepStatus("required-fields", undefined, true, true), "complete");
    assert.equal(
      evaluateCard4StepStatus("identity-documents", undefined, true, true, true),
      "complete",
    );
    assert.equal(
      evaluateCard4StepStatus("preferences", undefined, true, true, true, true),
      "complete",
    );
    assert.equal(nextCard4Step("required-fields"), "identity-documents");
    assert.equal(nextCard4Step("identity-documents"), "preferences");
    assert.equal(nextCard4Step("preferences"), "company-business");
    assert.equal(nextCard4Step("company-business"), "group-types");
    assert.equal(nextCard4Step("group-types"), null);
    assert.equal(
      evaluateCard4StepStatus("company-business", undefined, true, true, true, true, true),
      "complete",
    );
    assert.equal(
      evaluateCard4StepStatus("group-types", undefined, true, true, true, true, true, true),
      "complete",
    );
    assert.deepEqual(
      CARD4_MAIN_SECTIONS.map((row) => row.id),
      ["profile-rules", "guest-service-types", "notifications"],
    );
    assert.deepEqual(
      CARD4_GST_STEPS.map((row) => [row.number, row.id]),
      [
        [1, "service-categories"],
        [2, "service-types"],
        [3, "service-pricing"],
        [4, "department-assignment"],
        [5, "sla-rules"],
        [6, "service-availability"],
      ],
    );
    assert.equal(nextCard4GstStep("service-categories"), "service-types");
    assert.equal(nextCard4GstStep("service-availability"), null);
    assert.equal(evaluateGstStepStatus("service-categories", true), "complete");
    assert.equal(evaluateGstStepStatus("service-types", true), "not_started");
    assert.equal(evaluateGstStepStatus("service-types", true, true), "complete");
    assert.equal(evaluateGstStepStatus("service-pricing", true, true), "not_started");
    assert.equal(evaluateGstStepStatus("service-pricing", true, true, true), "complete");
  });

  it("opens from hub Configure and hides the package rail", () => {
    assert.equal(isCard4WorkspaceHash("#guest-services"), true);
    assert.equal(isCard4WorkspaceHash("#card-4"), true);
    assert.equal(isCard4WorkspaceHash("#card4"), true);
    assert.equal(isCard4WorkspaceHash("#guest-profile"), false);
    assert.equal(isCard4WorkspaceHash("#guest-services-types"), false);
    assert.equal(resolveCard4Hash("#card-4"), CARD4_HASH);
    assert.equal(isSet1SectionHash("#guest-services"), false);
    assert.equal(propertySetupRedirectHref("#card-4"), `${SET1_HUB_HREF}#guest-services`);
    assert.match(hub, /PmsPropertySetupCard4Section/);
    assert.match(hub, /CARD4_HASH/);
    assert.match(settings, /isCard4WorkspaceHash/);
    assert.match(settings, /hidePackageRail=\{workspaceOpen\}/);
    assert.match(section, /PmsCard4RequiredFields/);
    assert.match(section, /PmsCard4IdentityDocuments/);
    assert.match(section, /PmsCard4Preferences/);
    assert.match(section, /PmsCard4CompanyBusiness/);
    assert.match(section, /PmsCard4GroupTypes/);
    assert.match(section, /PmsCard4ServiceCategories/);
    assert.match(section, /PmsCard4ServiceTypes/);
    assert.match(section, /PmsCard4ServicePricing/);
    assert.match(section, /identity-documents/);
    assert.match(section, /company-business/);
    assert.match(section, /group-types/);
    assert.match(section, /guest-service-types/);
    assert.match(lib, /CARD4_GST_STEPS/);
    assert.match(section, /cardStatusLabel=\{propertySetupStatusLabel\(cardStatus\)\}/);
    assert.match(section, /allGprComplete/);
  });

  it("does not rewrite operational Guest Profile types", () => {
    assert.match(wave1, /id: "individual"/);
    assert.match(wave1, /id: "company"/);
    assert.match(wave1, /id: "group"/);
    assert.match(wave1, /id: "travel-agent"/);
    assert.doesNotMatch(wave1, /\bIND\b/);
    assert.doesNotMatch(wave1, /pms_guest_profile_types/);
  });
});

describe("Card 4 dual-lane 0079", () => {
  it("extends the shared document catalogue without storing guest identity data", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0079_pms_card4_identity_documents.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0079_pms_card4_identity_documents.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /ALTER TABLE public\.pms_guest_id_types/);
    assert.match(sql, /valid_for_profile_type_ids uuid\[\]/);
    assert.match(sql, /pms_guest_id_types_inactive_not_required/);
    assert.doesNotMatch(sql, /passport_number|document_image|ocr|guest_profiles/);
  });

  it("keeps SET3 deactivation compatible through identical 0080 trigger SQL", () => {
    const drizzle = join(
      process.cwd(),
      "drizzle/migrations/0080_pms_card4_identity_documents_active_compat.sql",
    );
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0080_pms_card4_identity_documents_active_compat.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /normalize_pms_guest_id_type_flags/);
    assert.match(sql, /NEW\.required_at_check_in := false/);
  });
});

describe("Card 4 dual-lane 0081", () => {
  it("ships identical category and type SQL without guest preference values", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0081_pms_card4_preferences.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0081_pms_card4_preferences.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_preference_categories/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_preference_types/);
    assert.match(sql, /pms_guest_pref_types_inactive_not_required/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.guest_preferences/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.pms_preference_options/);
  });
});

describe("Card 4 dual-lane 0078", () => {
  it("ships identical supabase and drizzle SQL with tenant RLS and no guest_profiles FK", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0078_pms_card4_required_fields.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0078_pms_card4_required_fields.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_fields/);
    assert.match(sql, /ALTER TABLE public\.pms_guest_fields ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /pms_guest_fields_inactive_not_required/);
    assert.doesNotMatch(sql, /REFERENCES public\.guest_profiles/);
  });
});

describe("Card 4 dual-lane 0077", () => {
  it("ships identical supabase and drizzle SQL with tenant RLS and no guest_profiles FK", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0077_pms_card4_profile_types.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0077_pms_card4_profile_types.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_profile_types/);
    assert.match(sql, /ALTER TABLE public\.pms_guest_profile_types ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.doesNotMatch(sql, /REFERENCES public\.guest_profiles/);
    assert.doesNotMatch(sql, /ON DELETE CASCADE REFERENCES public\.guest_/);
  });
});

describe("Card 4 dual-lane 0082", () => {
  it("ships identical business type and settings SQL without operational company FKs", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0082_pms_card4_company_business.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0082_pms_card4_company_business.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_business_profile_types/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_business_profile_settings/);
    assert.match(sql, /ALTER TABLE public\.pms_business_profile_types ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /guest_profiles/);
    assert.doesNotMatch(sql, /REFERENCES public\.guest_/);
  });
});

describe("Card 4 dual-lane 0083", () => {
  it("ships identical service category SQL without request-type or guest FKs", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0083_pms_card4_service_categories.sql");
    const supabase = join(
      process.cwd(),
      "supabase/migrations/0083_pms_card4_service_categories.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_service_categories/);
    assert.match(sql, /ALTER TABLE public\.pms_guest_service_categories ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /pms_guest_request_types/);
    assert.doesNotMatch(sql, /guest_profiles/);
    assert.doesNotMatch(sql, /REFERENCES public\.guest_/);
  });
});

describe("Card 4 dual-lane 0084", () => {
  it("ships identical service type SQL with category restrict and no operational FKs", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0084_pms_card4_service_types.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0084_pms_card4_service_types.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_service_types/);
    assert.match(sql, /ALTER TABLE public\.pms_guest_service_types ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REFERENCES public\.pms_guest_service_categories\(id\) ON DELETE RESTRICT/);
    assert.doesNotMatch(sql, /pms_guest_request_types/);
    assert.doesNotMatch(sql, /guest_profiles/);
    assert.doesNotMatch(sql, /REFERENCES public\.guest_/);
  });
});

describe("Card 4 dual-lane 0085", () => {
  it("ships one tenant-safe numeric price per service type without operational charges", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0085_pms_card4_service_pricing.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0085_pms_card4_service_pricing.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_service_pricing/);
    assert.match(sql, /amount numeric\(12,2\) NOT NULL/);
    assert.match(sql, /UNIQUE \(service_type_id\)/);
    assert.match(
      sql,
      /FOREIGN KEY \(service_type_id, restaurant_id\)[\s\S]*pms_guest_service_types/,
    );
    assert.match(sql, /ALTER TABLE public\.pms_guest_service_pricing ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /pms_guest_request_types/);
    assert.doesNotMatch(
      sql,
      /CREATE TABLE IF NOT EXISTS public\.(guest_service_requests|invoices|folio_transactions)/,
    );
  });
});
