import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANY_ACCEPTANCE_CRITERIA,
  COMPANY_DEFAULT_TA_COPY,
  COMPANY_ENRICHMENT_MIGRATION_FILE,
  COMPANY_ENRICHMENT_UNAVAILABLE,
  COMPANY_LINK_ROLES,
  COMPANY_MULTI_LINK_COPY,
  COMPANY_RATE_REFERENCE_COPY,
  COMPANY_TIP_AC_MAP,
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

const GE1 = Array.from({ length: 24 }, (_, i) => `AC-GE1-${i + 1}`);

describe("Guest Profile Company enrichment lock — AC-GE1-1…24", () => {
  it("locks AC-GE1-1…24 (Spec #104; TIP AC-CO-1…7 map onto these)", () => {
    assert.deepEqual([...COMPANY_ACCEPTANCE_CRITERIA], GE1);
    assert.deepEqual(COMPANY_TIP_AC_MAP["AC-CO-1"], ["AC-GE1-1"]);
    assert.deepEqual(COMPANY_TIP_AC_MAP["AC-CO-4"], ["AC-GE1-9"]);
  });

  it("AC-GE1-1 sectioned Company modal; Basic open; other sections collapsed", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const wrapper = readRel("../components/guests/guest-account-form-dialog.tsx");
    assert.match(wrapper, /accountType === "company"/);
    assert.match(wrapper, /GuestCompanyFormDialog/);
    assert.match(form, /company-form-sections/);
    assert.match(form, /company-section-\$\{id\}/);
    assert.match(form, /<Section id="basic" title="Basic" defaultOpen>/);
    assert.match(form, /<Section id="tax" title="Tax & registration">/);
    assert.match(form, /<Section id="contact" title="Contact">/);
    assert.match(form, /<Section id="address" title="Address">/);
    assert.match(form, /<Section id="commercial" title="Commercial">/);
    assert.match(form, /<Section id="notes" title="Notes">/);
    assert.match(form, /defaultOpen = false/);
    assert.match(wrapper, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.doesNotMatch(wrapper, /company-section-\$\{id\}/);
  });

  it("AC-GE1-2 legal name and company type are required", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.equal(companyLegalName("  Acme Ltd  "), "Acme Ltd");
    assert.equal(validateCompanyType(null, null), "Company type is required.");
    assert.match(form, /Legal \/ company name is required/);
    assert.match(form, /validateCompanyType/);
    assert.match(functions, /validateCompanyType/);
    assert.match(functions, /name: companyLegalName\(input\.name\)/);
    assert.match(form, /guest-account-name/);
    assert.match(form, /company-type/);
  });

  it("AC-GE1-3 trade name and code persist; search includes trade name", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    assert.match(form, /company-trade-name/);
    assert.match(form, /guest-account-code/);
    assert.match(functions, /trade_name:/);
    assert.match(functions, /trade_name\.ilike\.\$\{like\}/);
    assert.match(functions, /trade_name\.ilike/);
    assert.match(directory, /companyDirectorySecondary/);
  });

  it("AC-GE1-4 other requires other_text; other types do not", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
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
    assert.equal(COMPANY_TYPE_LABELS.plc, "PLC");
    assert.equal(isCompanyType("plc"), true);
    assert.equal(validateCompanyType("other", ""), "Describe the company type when Other is selected.");
    assert.equal(validateCompanyType("other", "Co-op"), null);
    assert.equal(validateCompanyType("ngo", null), null);
    assert.match(form, /company-type-other/);
    assert.match(form, /companyTypeOther: value === "other" \? prev\.companyTypeOther : ""/);
    assert.match(migration, /company_type_other/);
  });

  it("AC-GE1-5 Tax & registration fields persist", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(form, /company-tax-id/);
    assert.match(form, /company-business-reg/);
    assert.match(functions, /tax_id:/);
    assert.match(functions, /business_registration_number:/);
  });

  it("AC-GE1-6 Contact fields persist with email validation", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(form, /company-phone/);
    assert.match(form, /company-phone-alt/);
    assert.match(form, /company-email/);
    assert.match(form, /company-email-alt/);
    assert.match(form, /company-contact-name/);
    assert.match(functions, /phone_alt:/);
    assert.match(functions, /email_alt:/);
    assert.match(functions, /primary_contact_name:/);
    assert.match(functions, /assertEmail\(normalizeEmail\(input\.email\)/);
    assert.match(functions, /assertEmail\(normalizeEmail\(input\.emailAlt\)/);
  });

  it("AC-GE1-7 Address fields persist", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    assert.match(form, /company-address-line1/);
    assert.match(form, /company-address-line2/);
    assert.match(form, /guest-account-city/);
    assert.match(form, /company-region/);
    assert.match(form, /guest-account-country/);
    assert.match(form, /company-postal/);
    assert.match(functions, /address_line2:/);
    assert.match(functions, /postal_code:/);
    assert.match(detail, /Address line 2/);
  });

  it("AC-GE1-8 Commercial text fields persist without a rate engine", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(form, /company-corporate-ref/);
    assert.match(form, /company-negotiated-rate-ref/);
    assert.match(form, /company-source-of-business/);
    assert.match(form, /COMPANY_RATE_REFERENCE_COPY/);
    assert.match(COMPANY_RATE_REFERENCE_COPY, /not a rate engine/i);
    assert.match(functions, /corporate_account_reference:/);
    assert.match(functions, /negotiated_rate_reference:/);
    assert.match(functions, /source_of_business:/);
    assert.doesNotMatch(form, /rate-plan picker|rate applied|live price/i);
    assert.doesNotMatch(functions, /from\("rate_engine"|from\("negotiated_rates"/);
  });

  it("AC-GE1-9 default TA is an existing TA master FK, not a link row", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    const assertTa = functions.slice(functions.indexOf("async function assertDefaultTravelAgent"));
    assert.match(COMPANY_DEFAULT_TA_COPY, /existing Travel Agent master/);
    assert.match(form, /company-default-ta/);
    assert.match(form, /accountType: "travel_agent"/);
    assert.match(functions, /default_travel_agent_master_id/);
    assert.match(assertTa.slice(0, 1800), /account_type !== "travel_agent"/);
    assert.doesNotMatch(assertTa.slice(0, 1800), /from\("guest_account_links"\)/);
    assert.match(migration, /guest_account_masters_default_ta_same_property/);
  });

  it("AC-GE1-10 Notes persist on the Company Notes section", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(form, /<Section id="notes" title="Notes">/);
    assert.match(form, /company-notes/);
    assert.match(functions, /notes: blankToNull\(input\.notes\)/);
  });

  it("AC-GE1-11 Link guests is on saved Company detail only", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    assert.doesNotMatch(form, /GuestCompanyGuestLinks|company-link-guests/);
    assert.match(detail, /GuestCompanyGuestLinks/);
    assert.match(detail, /account.accountType === "company"/);
    assert.match(links, /company-link-guests/);
  });

  it("AC-GE1-12 multi-select Directory guests as employer or bill-to", () => {
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.deepEqual([...COMPANY_LINK_ROLES], ["employer", "bill_to"]);
    assert.equal(ROLE_ACCOUNT_TYPE.employer, "company");
    assert.equal(ROLE_ACCOUNT_TYPE.bill_to, "company");
    assert.match(links, /company-link-guest-search/);
    assert.match(links, /company-link-guest-checkbox/);
    assert.match(links, /company-link-role/);
    assert.match(links, /company-link-confirm/);
    assert.match(links, /useState<CompanyLinkRole>\("employer"\)/);
    assert.match(links, /listGuests/);
    assert.match(functions, /export const linkGuestAccountsBulk/);
  });

  it("AC-GE1-13 confirm reuses guest_account_links — no second store", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    const bulk = functions.slice(functions.indexOf("export const linkGuestAccountsBulk"));
    assert.match(links, /linkGuestAccountsBulk/);
    assert.match(bulk, /from\("guest_account_links"\)/);
    assert.match(bulk, /relationship_linked/);
    assert.match(bulk, /error\?\.code === "23505"/);
    assert.match(COMPANY_MULTI_LINK_COPY, /guest_account_links/);
    assert.doesNotMatch(functions, /from\("company_guest_links"|from\("company_members"/);
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.doesNotMatch(migration, /CREATE TABLE/);
  });

  it("AC-GE1-14 list + unlink without deleting parties", () => {
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const unlink = functions.slice(functions.indexOf("export const unlinkGuestAccount"));
    assert.match(links, /company-linked-guest-row/);
    assert.match(links, /company-unlink-guest/);
    assert.match(links, /unlinkGuestAccount/);
    assert.match(unlink, /from\("guest_account_links"\)/);
    assert.match(unlink, /\.delete\(\)/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_profiles"\)[\s\S]{0,200}\.delete\(/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_account_masters"\)[\s\S]{0,200}\.delete\(/);
  });

  it("AC-GE1-15 Individual Relationships card remains", () => {
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
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

  it("AC-GE1-16 Position / Department are not on the Company form", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.doesNotMatch(form, /Position|Department/);
    assert.doesNotMatch(detail, /Position|Department/);
    assert.match(migration, /No Position\/Department/);
    assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS (position|department)/i);
  });

  it("AC-GE1-17 no rate engine, folio routing, Import, or loyalty points", () => {
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const links = readRel("../components/guests/guest-company-guest-links.tsx");
    const cashiering = readRel("./cashiering.functions.ts");
    assert.doesNotMatch(form, /import wizard|loyalty points|folio routed/i);
    assert.doesNotMatch(links, /folio routed|import guests|points widget/i);
    assert.match(cashiering, /transfersSupported: false/);
  });

  it("AC-GE1-18 Group / TA forms stay thin", () => {
    const form = readRel("../components/guests/guest-account-form-dialog.tsx");
    assert.match(form, /guest-account-name/);
    assert.match(form, /guest-account-save/);
    assert.match(form, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.doesNotMatch(form, /company-type-other/);
    assert.doesNotMatch(form, /Tax & registration/);
    assert.equal(companyTypeAppliesTo("company"), true);
    assert.equal(companyTypeAppliesTo("group"), false);
    assert.equal(companyTypeAppliesTo("travel_agent"), false);
  });

  it("AC-GE1-19 denied staff cannot mutate enriched Company fields or multi-links", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /requireGuestManager/);
    assert.doesNotMatch(functions, /createServerFn\(\{ method: "GET" \}\)/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.match(routes, /\/restaurant\/login/);
  });

  it("AC-GE1-20 Company data and links stay tenant-scoped", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(functions, /requireGuestManager\(context as never, data\.restaurantId\)/);
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(functions, /assertDefaultTravelAgent/);
  });

  it("AC-GE1-21 no entitlement / RLS model change", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    assert.doesNotMatch(functions, /requirePackage\("guest-accounts"|newGuestRole/);
    assert.match(migration, /RLS unchanged/);
    assert.match(migration, /Entitlement model is not changed/);
    assert.doesNotMatch(migration, /SECURITY DEFINER/i);
    assert.doesNotMatch(migration, /CREATE POLICY|CREATE FUNCTION/i);
  });

  it("AC-GE1-22 Waves 1–5 are not reopened; AC-W4-5 is not boiled in", () => {
    const helpers = readRel("./guest-profile-company.ts");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(helpers, /Waves 1–5 stay closed/);
    assert.doesNotMatch(functions, /create_hotel_reservation_priced/);
  });

  it("AC-GE1-23 0055 is dual-lane APPLY HELD and degrades honestly", () => {
    const supabase = readRel("../../../../supabase/migrations/0055_pms_company_registration_enrichment.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0055_pms_company_registration_enrichment.sql");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.equal(COMPANY_ENRICHMENT_MIGRATION_FILE, "0055_pms_company_registration_enrichment.sql");
    assert.match(COMPANY_ENRICHMENT_UNAVAILABLE, /0055/);
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(drizzle, /APPLY HELD/);
    assert.match(functions, /COMPANY_ENRICHMENT_UNAVAILABLE/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });

  it("AC-GE1-24 does not claim the module COMPLETE", () => {
    const helpers = readRel("./guest-profile-company.ts");
    assert.match(helpers, /Waves 1–5 stay closed/);
    assert.doesNotMatch(helpers, /module COMPLETE|MODULE COMPLETE/);
    assert.equal(
      companyDirectorySecondary("Acme Trading", "private_limited"),
      "Acme Trading · Private limited",
    );
  });
});
