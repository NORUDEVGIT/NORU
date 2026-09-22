import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AGENCY_TYPE_LABELS,
  AGENCY_TYPES,
  COMMISSION_TYPES,
  CONTRACT_STATUSES,
  PAYMENT_TERMS_REFERENCE_COPY,
  TA_ACCEPTANCE_CRITERIA,
  TA_COMMISSION_REFERENCE_COPY,
  TA_CONTRACT_COPY,
  TA_ENRICHMENT_MIGRATION_FILE,
  TA_ENRICHMENT_UNAVAILABLE,
  TA_LICENSE_COPY,
  TA_LINK_ROLES,
  TA_MULTI_LINK_COPY,
  TA_PARTIAL_CREATE_COPY,
  TA_RATE_REFERENCE_COPY,
  TA_STAGED_CREATE_COPY,
  TA_STAGED_LINKING_COPY,
  agencyTypeAppliesTo,
  hasPaymentTermsInput,
  isAgencyType,
  taDirectorySecondary,
  taLegalName,
  validateAgencyType,
} from "./guest-profile-travel-agency.ts";
import { GUEST_RELATIONSHIP_ROLES, ROLE_ACCOUNT_TYPE } from "./guest-profile-wave4.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const GE3 = Array.from({ length: 18 }, (_, i) => `AC-GE3-${i + 1}`);

describe("Guest Profile Travel Agency enrichment lock — AC-GE3-1…18", () => {
  it("locks AC-GE3-1…18 (Spec #114; Spec IDs win)", () => {
    assert.deepEqual([...TA_ACCEPTANCE_CRITERIA], GE3);
  });

  it("AC-GE3-1 sectioned TA create/edit; Agency Information open; Group stays thin", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const wrapper = readRel("../components/guests/guest-account-form-dialog.tsx");
    assert.match(wrapper, /accountType === "travel_agent"/);
    assert.match(wrapper, /GuestTravelAgentFormDialog/);
    assert.match(wrapper, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.match(form, /ta-form-sections/);
    assert.match(form, /ta-section-\$\{id\}/);
    assert.match(form, /<Section id="agency" title="Agency Information" defaultOpen>/);
    assert.match(form, /<Section id="contacts" title="Contacts">/);
    assert.match(form, /<Section id="address" title="Address">/);
    assert.match(form, /<Section id="license" title="License \/ Registration">/);
    assert.match(form, /<Section id="operations" title="Operational settings">/);
    assert.doesNotMatch(form, /<Section id="commission" title="Commission">/);
    assert.doesNotMatch(form, /<Section id="contract" title="Contract">/);
    assert.doesNotMatch(form, /<Section id="rates" title="Rates">/);
    assert.doesNotMatch(form, /<Section id="payment-terms" title="Payment Terms">/);
    assert.match(form, /<Section id="notes" title="Notes">/);
    assert.match(form, /defaultOpen = false/);
    assert.doesNotMatch(wrapper, /ta-section-\$\{id\}/);
    assert.equal(agencyTypeAppliesTo("travel_agent"), true);
    assert.equal(agencyTypeAppliesTo("group"), false);
    assert.equal(agencyTypeAppliesTo("company"), false);
  });

  it("AC-GE3-2 legal name + agency type required; other requires other_text", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0058_pms_travel_agency_enrichment.sql");
    assert.equal(taLegalName("  Northwind Travel  "), "Northwind Travel");
    assert.equal(validateAgencyType(null, null), "Agency type is required.");
    assert.equal(validateAgencyType("other", ""), "Describe the agency type when Other is selected.");
    assert.equal(validateAgencyType("other", "Consortium"), null);
    assert.equal(validateAgencyType("ota", null), null);
    assert.deepEqual([...AGENCY_TYPES], ["ota", "local", "online", "other"]);
    assert.equal(AGENCY_TYPE_LABELS.ota, "OTA");
    assert.equal(isAgencyType("local"), true);
    assert.match(form, /Legal \/ agency name is required/);
    assert.match(form, /validateAgencyType/);
    assert.match(form, /ta-agency-type/);
    assert.match(form, /ta-agency-type-other/);
    assert.match(form, /agencyTypeOther: value === "other" \? prev\.agencyTypeOther : ""/);
    assert.match(functions, /validateAgencyType/);
    assert.match(migration, /agency_type_other/);
  });

  it("AC-GE3-3 Contacts (primary+alt) + Address (line2/region/postal) persist", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    assert.match(form, /ta-phone/);
    assert.match(form, /ta-phone-alt/);
    assert.match(form, /ta-email/);
    assert.match(form, /ta-email-alt/);
    assert.match(form, /ta-contact-name/);
    assert.match(form, /ta-billing-contact/);
    assert.match(form, /ta-address-line1/);
    assert.match(form, /ta-address-line2/);
    assert.match(form, /ta-city/);
    assert.match(form, /ta-region/);
    assert.match(form, /ta-country/);
    assert.match(form, /ta-postal/);
    assert.match(functions, /phone_alt:/);
    assert.match(functions, /email_alt:/);
    assert.match(functions, /billing_contact_name:/);
    assert.match(functions, /address_line2:/);
    assert.match(functions, /postal_code:/);
    assert.match(functions, /assertEmail\(normalizeEmail\(input\.emailAlt\)/);
    assert.match(detail, /Address line 2/);
    assert.match(detail, /Billing contact/);
  });

  it("AC-GE3-4 License/registration fields persist; no KYC claim", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    assert.match(TA_LICENSE_COPY, /not government KYC/i);
    assert.match(form, /TA_LICENSE_COPY/);
    assert.match(form, /ta-iata/);
    assert.match(form, /ta-business-reg/);
    assert.match(form, /ta-tax-id/);
    assert.match(form, /ta-license-expiry/);
    assert.match(functions, /iata_license_number:/);
    assert.match(functions, /license_expiry_date:/);
    assert.match(functions, /tax_id:/);
    assert.match(functions, /business_registration_number:/);
    assert.doesNotMatch(form, /government verified|police check|KYC verified/i);
    assert.match(detail, /TA_LICENSE_COPY/);
  });

  it("AC-GE3-5 Commission master columns persist; form no longer live-edits them", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const settings = readRel("../components/guests/guest-travel-agent-settings.tsx");
    assert.deepEqual([...COMMISSION_TYPES], ["percent", "fixed_note"]);
    assert.match(TA_COMMISSION_REFERENCE_COPY, /does not post, settle, or pay commission/i);
    assert.match(form, /TA_FORM_OPERATIONAL_COPY/);
    assert.doesNotMatch(form, /ta-commission-label/);
    assert.doesNotMatch(form, /ta-commission-type/);
    assert.doesNotMatch(form, /ta-commission-currency/);
    assert.match(functions, /commission_label:/);
    assert.match(functions, /commission_type:/);
    assert.match(functions, /commission_currency_note:/);
    assert.match(settings, /Commission/);
    assert.doesNotMatch(form, /commission due|gateway settlement|post commission|settle commission/i);
    assert.doesNotMatch(functions, /from\("commission_settlements"|from\("commission_postings"/);
  });

  it("AC-GE3-6 Contract fields persist; no e-sign product; form no longer live-edits them", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const agreements = readRel("../components/guests/guest-travel-agent-agreements.tsx");
    assert.deepEqual([...CONTRACT_STATUSES], ["draft", "active", "expired"]);
    assert.match(TA_CONTRACT_COPY, /no e-sign product/i);
    assert.match(form, /TA_FORM_OPERATIONAL_COPY/);
    assert.doesNotMatch(form, /ta-contract-ref/);
    assert.doesNotMatch(form, /ta-contract-start/);
    assert.doesNotMatch(form, /ta-contract-end/);
    assert.doesNotMatch(form, /ta-contract-status/);
    assert.doesNotMatch(form, /ta-contract-signed-with/);
    assert.match(functions, /contract_reference:/);
    assert.match(functions, /contract_start_date:/);
    assert.match(functions, /contract_end_date:/);
    assert.match(functions, /contract_status:/);
    assert.match(functions, /contract_signed_with:/);
    assert.match(agreements, /saveTravelAgentAgreement|listTravelAgentAgreements/);
    assert.doesNotMatch(form, /e-sign|docusign|sign now/i);
  });

  it("AC-GE3-7 Rates field remains stored; form no longer live-edits it", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(TA_RATE_REFERENCE_COPY, /not a rate engine/i);
    assert.match(form, /TA_FORM_OPERATIONAL_COPY/);
    assert.doesNotMatch(form, /ta-rate-ref/);
    assert.match(functions, /negotiated_rate_reference:/);
    assert.doesNotMatch(form, /rate-plan picker|rate applied|live price/i);
    assert.doesNotMatch(functions, /from\("rate_engine"|from\("negotiated_rates"/);
  });

  it("AC-GE3-8 TA Payment Terms persist; Settings is the live editor", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const settings = readRel("../components/guests/guest-travel-agent-settings.tsx");
    assert.match(PAYMENT_TERMS_REFERENCE_COPY, /not accounts payable/i);
    assert.match(form, /TA_FORM_OPERATIONAL_COPY/);
    assert.doesNotMatch(form, /ta-payment-terms/);
    assert.doesNotMatch(form, /ta-credit-limit/);
    assert.doesNotMatch(form, /ta-billing-instruction/);
    assert.match(functions, /payment_terms:/);
    assert.match(functions, /credit_limit_note:/);
    assert.match(functions, /billing_instruction:/);
    assert.match(settings, /paymentTerms|creditLimit|billingInstruction/);
  });

  it("AC-GE3-9 Notes persist", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(form, /<Section id="notes" title="Notes">/);
    assert.match(form, /ta-notes/);
    assert.match(functions, /notes: blankToNull\(input\.notes\)/);
  });

  it("AC-GE3-10 after save or staged Create, Linking writes guest_account_links with booker_ta default", () => {
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const staged = readRel("../components/guests/guest-form-staged-guest-links.tsx");
    const links = readRel("../components/guests/guest-travel-agent-guest-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    assert.match(form, /GuestFormStagedGuestLinks/);
    assert.match(form, /applyStagedFollowups/);
    assert.match(form, /linkGuestAccount/);
    assert.match(form, /ta-create-partial-failure/);
    assert.match(form, /ta-create-retry/);
    assert.match(form, /TA_PARTIAL_CREATE_COPY/);
    assert.match(TA_STAGED_CREATE_COPY, /guest_account_links/);
    assert.match(TA_STAGED_LINKING_COPY, /held until Create/);
    assert.match(TA_PARTIAL_CREATE_COPY, /not a full success/);
    assert.match(staged, /useState<TaLinkRole>\("booker_ta"\)/);
    assert.match(links, /useState<TaLinkRole>\("booker_ta"\)/);
    assert.match(links, /linkGuestAccountsBulk/);
    assert.match(detail, /GuestTravelAgentGuestLinks/);
    assert.deepEqual([...TA_LINK_ROLES], ["booker_ta", "employer", "bill_to", "group_member"]);
    assert.equal(ROLE_ACCOUNT_TYPE.booker_ta, "travel_agent");
    assert.deepEqual([...GUEST_RELATIONSHIP_ROLES], [
      "employer",
      "bill_to",
      "booker_ta",
      "group_member",
    ]);
    assert.match(functions, /from\("guest_account_links"\)/);
    assert.match(TA_MULTI_LINK_COPY, /guest_account_links/);
    assert.doesNotMatch(form, /guest_pending_links|pre-id link/);
  });

  it("AC-GE3-11 list + unlink without deleting guest or TA master", () => {
    const links = readRel("../components/guests/guest-travel-agent-guest-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const unlink = functions.slice(functions.indexOf("export const unlinkGuestAccount"));
    assert.match(links, /ta-linked-guest-row/);
    assert.match(links, /ta-unlink-guest/);
    assert.match(links, /unlinkGuestAccount/);
    assert.match(unlink, /from\("guest_account_links"\)/);
    assert.match(unlink, /\.delete\(\)/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_profiles"\)[\s\S]{0,200}\.delete\(/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_account_masters"\)[\s\S]{0,200}\.delete\(/);
  });

  it("AC-GE3-12 Individual Relationships shows the same links (same store)", () => {
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const links = readRel("../components/guests/guest-travel-agent-guest-links.tsx");
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    assert.match(card, /listGuestAccountLinks/);
    assert.match(card, /guest-relationship-link/);
    assert.match(card, /guest-relationship-unlink/);
    assert.match(shell, /GuestRelationshipsCard/);
    assert.match(links, /invalidateQueries\(\{ queryKey: \["guest-account-links", restaurantId\] \}\)/);
    assert.match(form, /invalidateQueries\(\{ queryKey: \["guest-account-links", restaurantId\] \}\)/);
    assert.doesNotMatch(links, /from\("ta_guest_links"|from\("travel_agent_members"/);
  });

  it("AC-GE3-13 Company form gains Payment Terms; values persist; no AP/AR invent", () => {
    const company = readRel("../components/guests/guest-company-form-dialog.tsx");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(company, /<Section id="payment-terms"/);
    assert.match(company, /company-payment-terms/);
    assert.match(company, /company-credit-limit/);
    assert.match(company, /company-billing-instruction/);
    assert.match(company, /PAYMENT_TERMS_REFERENCE_COPY/);
    assert.match(detail, /company-payment-terms|Payment terms/);
    assert.match(functions, /includePaymentTerms/);
    assert.equal(hasPaymentTermsInput("NET30", "", ""), true);
    assert.equal(hasPaymentTermsInput("", "", ""), false);
    assert.doesNotMatch(company, /folio routed to company|AP\/AR engine|city ledger engine/i);
  });

  it("AC-GE3-14 pms + guest manage gate preserved; tenant-scoped", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /requireGuestManager/);
    assert.match(functions, /requireGuestManager\(context as never, data\.restaurantId\)/);
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.doesNotMatch(functions, /createServerFn\(\{ method: "GET" \}\)/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.match(routes, /\/restaurant\/login/);
  });

  it("AC-GE3-15 no entitlement / RLS model change; additive RLS OK", () => {
    const helpers = readRel("./guest-profile-travel-agency.ts");
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0058_pms_travel_agency_enrichment.sql");
    assert.match(helpers, /Additive RLS matching existing account-master policies is OK/);
    assert.match(helpers, /Entitlement model is not changed/);
    assert.doesNotMatch(functions, /requirePackage\("guest-accounts"|newGuestRole/);
    assert.match(migration, /Additive RLS matching existing guest_account_masters/);
    assert.match(migration, /Entitlement model is not changed/);
    assert.match(migration, /RLS unchanged/);
    assert.doesNotMatch(migration, /SECURITY DEFINER/i);
    assert.doesNotMatch(migration, /CREATE POLICY|CREATE FUNCTION/i);
  });

  it("AC-GE3-16 migration 0058 dual-lane APPLY HELD; honest degrade until apply", () => {
    const supabase = readRel("../../../../supabase/migrations/0058_pms_travel_agency_enrichment.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0058_pms_travel_agency_enrichment.sql");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.equal(TA_ENRICHMENT_MIGRATION_FILE, "0058_pms_travel_agency_enrichment.sql");
    assert.match(TA_ENRICHMENT_UNAVAILABLE, /0058/);
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /DATABASE IMPACT: YES/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(supabase, /Rollback:/);
    assert.match(drizzle, /APPLY HELD/);
    assert.match(drizzle, /DATABASE IMPACT: YES/);
    assert.match(functions, /TA_ENRICHMENT_UNAVAILABLE/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.doesNotMatch(supabase, /CREATE TABLE/i);
  });

  it("AC-GE3-17 Waves 1–5 + GE1 + GE2 not reopened; module not claimed COMPLETE", () => {
    const helpers = readRel("./guest-profile-travel-agency.ts");
    const company = readRel("./guest-profile-company.ts");
    const individual = readRel("./guest-profile-individual.ts");
    assert.match(helpers, /Waves 1–5 stay closed/);
    assert.match(helpers, /Gap-edit 1 \(#103\/#105\) and Gap-edit 2 \(#109\/#111\/#112\) stay closed/);
    assert.match(company, /Waves 1–5 stay closed/);
    assert.match(individual, /Waves 1–5 stay closed/);
    assert.doesNotMatch(helpers, /module COMPLETE|MODULE COMPLETE/);
  });

  it("AC-GE3-18 out-of-scope locked items absent", () => {
    const helpers = readRel("./guest-profile-travel-agency.ts");
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const wrapper = readRel("../components/guests/guest-account-form-dialog.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const cashiering = readRel("./cashiering.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0058_pms_travel_agency_enrichment.sql");
    assert.match(helpers, /no settlement/);
    assert.match(helpers, /Group form stays thin/);
    assert.match(wrapper, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.doesNotMatch(wrapper, /agency-type-other|License \/ Registration/);
    assert.doesNotMatch(form, /import wizard|loyalty points|folio routed|police export|family graph/i);
    assert.doesNotMatch(functions, /from\("guest_family_links"|from\("ta_commission_ledger"/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
    assert.match(migration, /No commission settlement engine/);
    assert.match(cashiering, /transfersSupported: false/);
    assert.equal(
      taDirectorySecondary("Northwind", "ota"),
      "Northwind · OTA",
    );
  });
});
