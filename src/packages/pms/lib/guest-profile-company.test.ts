import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANY_ACCEPTANCE_CRITERIA,
  COMPANY_DEFAULT_TA_COPY,
  COMPANY_ENRICHMENT_MIGRATION_FILE,
  COMPANY_LINK_ROLES,
  COMPANY_MULTI_LINK_COPY,
  COMPANY_RATE_REFERENCE_COPY,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  companyDirectorySecondary,
  companyLegalName,
  companyTypeAppliesTo,
  isCompanyType,
  validateCompanyType,
} from "./guest-profile-company.ts";
import { GUEST_RELATIONSHIP_ROLES, ROLE_ACCOUNT_TYPE } from "./guest-profile-wave4.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest Profile Company enrichment lock — AC-CO-1…7", () => {
  it("locks AC-CO-1…7", () => {
    assert.deepEqual([...COMPANY_ACCEPTANCE_CRITERIA], [
      "AC-CO-1",
      "AC-CO-2",
      "AC-CO-3",
      "AC-CO-4",
      "AC-CO-5",
      "AC-CO-6",
      "AC-CO-7",
    ]);
  });

  it("AC-CO-1 sectioned Company form create/edit with Basic open by default", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const wrapper = readRel("../components/guests/guest-account-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(wrapper, /accountType === "company"/);
    assert.match(wrapper, /GuestCompanyFormDialog/);
    assert.match(form, /company-form-sections/);
    assert.match(form, /company-section-\$\{id\}/);
    assert.match(form, /<Section id="basic" title="Basic" defaultOpen>/);
    assert.match(form, /<Section id="tax" title="Tax">/);
    assert.match(form, /<Section id="contact" title="Contact">/);
    assert.match(form, /<Section id="address" title="Address">/);
    assert.match(form, /<Section id="commercial" title="Commercial">/);
    assert.match(form, /<Section id="notes" title="Notes">/);
    assert.match(form, /guest-account-name/);
    assert.match(form, /Legal \/ company name/);
    assert.match(form, /createGuestAccount/);
    assert.match(form, /updateGuestAccount/);
    assert.match(functions, /export const createGuestAccount/);
    assert.match(functions, /export const updateGuestAccount/);
    assert.match(functions, /export const getGuestAccount/);
  });

  it("AC-CO-2 company type enum + other_text when other", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.deepEqual([...COMPANY_TYPES], [
      "private_limited",
      "plc",
      "sole_proprietorship",
      "partnership",
      "ngo",
      "government",
      "other",
    ]);
    assert.equal(COMPANY_TYPE_LABELS.private_limited, "Private limited");
    assert.equal(isCompanyType("plc"), true);
    assert.equal(isCompanyType("llc"), false);
    assert.equal(validateCompanyType(null, null), "Company type is required.");
    assert.equal(validateCompanyType("other", ""), "Describe the company type when Other is selected.");
    assert.equal(validateCompanyType("other", "Co-op"), null);
    assert.equal(validateCompanyType("ngo", null), null);
    assert.match(form, /company-type/);
    assert.match(form, /company-type-other/);
    assert.match(form, /validateCompanyType/);
    assert.match(functions, /validateCompanyType/);
    assert.match(migration, /'private_limited'/);
    assert.match(migration, /company_type_other/);
  });

  it("AC-CO-3 Tax / Contact / Address / Commercial / Notes persist", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    const wave4 = readRel("./guest-profile-wave4.ts");
    assert.equal(companyLegalName("  Acme Ltd  "), "Acme Ltd");
    assert.match(wave4, /legal name maps to existing `guest_account_masters.name`|tradeName/);
    assert.match(functions, /name: companyLegalName\(input\.name\)/);
    assert.match(functions, /trade_name:/);
    assert.match(functions, /tax_id:/);
    assert.match(functions, /business_registration_number:/);
    assert.match(functions, /phone_alt:/);
    assert.match(functions, /email_alt:/);
    assert.match(functions, /primary_contact_name:/);
    assert.match(functions, /address_line2:/);
    assert.match(functions, /region:/);
    assert.match(functions, /postal_code:/);
    assert.match(functions, /corporate_account_reference:/);
    assert.match(functions, /negotiated_rate_reference:/);
    assert.match(functions, /source_of_business:/);
    assert.match(form, /company-tax-id/);
    assert.match(form, /company-business-reg/);
    assert.match(form, /company-phone-alt/);
    assert.match(form, /company-email-alt/);
    assert.match(form, /company-contact-name/);
    assert.match(form, /company-address-line2/);
    assert.match(form, /company-region/);
    assert.match(form, /company-postal/);
    assert.match(form, /company-corporate-ref/);
    assert.match(form, /company-negotiated-rate-ref/);
    assert.match(form, /company-source-of-business/);
    assert.match(form, /company-notes/);
    assert.match(detail, /company-profile-fields/);
    assert.doesNotMatch(form, /Position|Department/);
    assert.doesNotMatch(detail, /Position|Department/);
  });

  it("AC-CO-4 default TA is an existing TA master link, not typed-only fake", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.match(COMPANY_DEFAULT_TA_COPY, /existing Travel Agent master/);
    assert.match(form, /company-default-ta/);
    assert.match(form, /accountType: "travel_agent"/);
    assert.match(form, /COMPANY_DEFAULT_TA_COPY/);
    assert.match(functions, /default_travel_agent_master_id/);
    assert.match(functions, /assertDefaultTravelAgent/);
    assert.match(functions, /account_type !== "travel_agent"/);
    assert.match(migration, /default_travel_agent_master_id/);
    assert.match(migration, /guest_account_masters_default_ta_same_property/);
    assert.doesNotMatch(form, /type a travel agent name|typed-only default TA/i);
  });

  it("AC-CO-5 after save, multi-select link guests as employer/bill-to via guest_account_links", () => {
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    assert.deepEqual([...COMPANY_LINK_ROLES], ["employer", "bill_to"]);
    assert.equal(ROLE_ACCOUNT_TYPE.employer, "company");
    assert.equal(ROLE_ACCOUNT_TYPE.bill_to, "company");
    assert.match(detail, /GuestCompanyGuestLinks/);
    assert.match(detail, /account.accountType === "company"/);
    assert.match(links, /company-link-guests/);
    assert.match(links, /company-link-guest-search/);
    assert.match(links, /company-link-guest-checkbox/);
    assert.match(links, /company-link-role/);
    assert.match(links, /company-link-confirm/);
    assert.match(links, /listGuests/);
    assert.match(links, /linkGuestAccountsBulk/);
    assert.match(functions, /export const linkGuestAccountsBulk/);
    assert.match(functions, /from\("guest_account_links"\)/);
    assert.match(functions, /relationship_linked/);
    assert.match(COMPANY_MULTI_LINK_COPY, /guest_account_links/);
    assert.doesNotMatch(functions, /from\("company_guest_links"|from\("company_members"/);
  });

  it("AC-CO-6 list + unlink; Individual Relationships still shows links", () => {
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(links, /company-linked-guest-row/);
    assert.match(links, /company-unlink-guest/);
    assert.match(links, /unlinkGuestAccount/);
    assert.match(functions, /export const unlinkGuestAccount/);
    assert.match(card, /guest-relationship-link/);
    assert.match(card, /guest-relationship-unlink/);
    assert.match(card, /visible from both/);
    assert.match(shell, /GuestRelationshipsCard/);
    assert.match(shell, /guestId=\{isAccount \? undefined : guestId\}/);
    assert.deepEqual([...GUEST_RELATIONSHIP_ROLES], [
      "employer",
      "bill_to",
      "booker_ta",
      "group_member",
    ]);
  });

  it("AC-CO-7 no second link system; no rate engine; Group/TA forms unchanged", () => {
    const form = readRel("../components/guests/guest-account-form-dialog.tsx");
    const companyForm = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.match(form, /guest-account-name/);
    assert.match(form, /guest-account-save/);
    assert.match(form, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.doesNotMatch(form, /company-section-basic/);
    assert.doesNotMatch(form, /company-type-other/);
    assert.match(companyForm, /COMPANY_RATE_REFERENCE_COPY/);
    assert.match(COMPANY_RATE_REFERENCE_COPY, /not a rate engine/i);
    assert.doesNotMatch(companyForm, /rate engine product|live rate plan|price the stay/i);
    assert.doesNotMatch(functions, /from\("rate_engine"|from\("negotiated_rates"/);
    assert.match(functions, /from\("guest_account_links"\)/);
    assert.doesNotMatch(functions, /CREATE TABLE|company_guest_links/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
    assert.equal(companyTypeAppliesTo("company"), true);
    assert.equal(companyTypeAppliesTo("group"), false);
    assert.equal(companyTypeAppliesTo("travel_agent"), false);
    assert.equal(
      companyDirectorySecondary("Acme Trading", "private_limited"),
      "Acme Trading · Private limited",
    );
  });
});

describe("Company enrichment catalogue, honesty and gates", () => {
  it("maps legal name to existing name and keeps Group/TA thin", () => {
    const helpers = readRel("./guest-profile-company.ts");
    const form = readRel("../components/guests/guest-account-form-dialog.tsx");
    assert.match(helpers, /Legal \/ company name maps to existing `guest_account_masters.name`/);
    assert.match(form, /accountType === "company"/);
    assert.match(form, /Name is required/);
    assert.doesNotMatch(form, /legal_name:/);
  });

  it("preserves pms + guest manage gate without an entitlement model change", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.match(functions, /requireGuestManager/);
    assert.match(functions, /requireSupabaseAuth/);
    assert.doesNotMatch(functions, /requirePackage\("guest-accounts"|newGuestRole/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.match(migration, /RLS unchanged/);
    assert.match(migration, /Entitlement model is not changed/);
    assert.doesNotMatch(migration, /SECURITY DEFINER/i);
    assert.doesNotMatch(migration, /CREATE POLICY|CREATE FUNCTION/i);
  });

  it("ships dual-lane 0055 APPLY HELD without applying and without a rate engine", () => {
    const supabase = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0055_pms_company_registration_enrichment.sql");
    assert.equal(COMPANY_ENRICHMENT_MIGRATION_FILE, "0055_pms_company_registration_enrichment.sql");
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(supabase, /default_travel_agent_master_id/);
    assert.match(supabase, /negotiated_rate_reference/);
    assert.match(supabase, /Not a rate engine/);
    assert.match(drizzle, /ADD COLUMN IF NOT EXISTS trade_name/);
    assert.match(drizzle, /APPLY HELD/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.doesNotMatch(supabase, /CREATE TABLE/);
  });

  it("does not reopen Waves 1–5 or invent Folio / reservation-create boil-in", () => {
    const helpers = readRel("./guest-profile-company.ts");
    const functions = readRel("./guest-accounts.functions.ts");
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    assert.match(helpers, /Waves 1–5 stay closed/);
    assert.doesNotMatch(functions, /create_hotel_reservation_priced/);
    assert.doesNotMatch(form, /Folio tab|loyalty points|import guests/i);
    assert.doesNotMatch(helpers, /reopen Wave/);
  });
});
