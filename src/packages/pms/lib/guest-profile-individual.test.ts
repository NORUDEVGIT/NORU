import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_GENDERS,
  GUEST_TITLES,
  INDIVIDUAL_ACCEPTANCE_CRITERIA,
  INDIVIDUAL_EMERGENCY_COPY,
  INDIVIDUAL_EMERGENCY_NAME_REQUIRED,
  INDIVIDUAL_ENRICHMENT_MIGRATION_FILE,
  INDIVIDUAL_ENRICHMENT_UNAVAILABLE,
  INDIVIDUAL_HARD_BLOCK_FINDING,
  INDIVIDUAL_IDENTITY_AFTER_SAVE_COPY,
  INDIVIDUAL_IDENTITY_UPLOAD_COPY,
  INDIVIDUAL_LINKING_AFTER_SAVE_COPY,
  INDIVIDUAL_LINKING_COPY,
  INDIVIDUAL_PARTIAL_CREATE_COPY,
  INDIVIDUAL_STAGED_CREATE_COPY,
  INDIVIDUAL_STAGED_IDENTITY_COPY,
  INDIVIDUAL_STAGED_LINKING_COPY,
  INDIVIDUAL_LINK_ROLES,
  INDIVIDUAL_LIFT_REASON_REQUIRED,
  INDIVIDUAL_RESTRICTION_REASON_REQUIRED,
  INDIVIDUAL_RESTRICTION_WARN_COPY,
  INDIVIDUAL_SPEC_AC_IDS,
  INDIVIDUAL_TIP_AC_MAP,
  RESTRICTION_SEVERITIES,
  countNamedEmergencyContacts,
  guestRestrictionActive,
  guestRestrictionWarning,
  isIndividualLinkRole,
  validateEmergencyContacts,
  validateLiftReason,
  validateRestrictionReason,
} from "./guest-profile-individual.ts";
import { STAFF_VERIFY_COPY } from "./guest-profile-wave2.ts";
import { GUEST_RELATIONSHIP_ROLES, ROLE_ACCOUNT_TYPE } from "./guest-profile-wave4.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const GE2 = Array.from({ length: 34 }, (_, i) => `AC-GE2-${i + 1}`);

describe("Guest Profile Individual enrichment lock — AC-GE2-1…34", () => {
  it("locks AC-GE2-1…34 (Spec #110; plan seeds remapped)", () => {
    assert.deepEqual([...INDIVIDUAL_ACCEPTANCE_CRITERIA], GE2);
    assert.deepEqual([...INDIVIDUAL_SPEC_AC_IDS], GE2);
    assert.deepEqual(INDIVIDUAL_TIP_AC_MAP["plan-linking"], [
      "AC-GE2-9",
      "AC-GE2-10",
      "AC-GE2-11",
      "AC-GE2-12",
      "AC-GE2-13",
    ]);
    assert.deepEqual(INDIVIDUAL_TIP_AC_MAP["plan-identity-upload"], [
      "AC-GE2-6",
      "AC-GE2-7",
      "AC-GE2-8",
      "AC-GE2-14",
      "AC-GE2-15",
    ]);
  });

  it("AC-GE2-1 sectioned Individual form; Basic open; Linking staged on create", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(form, /individual-form-sections/);
    assert.match(form, /individual-section-\$\{id\}/);
    assert.match(form, /<Section id="basic" title="Basic" defaultOpen>/);
    assert.match(form, /<Section id="contact" title="Contact">/);
    assert.match(form, /<Section id="address" title="Address">/);
    assert.match(form, /<Section id="identity" title="Identity">/);
    assert.match(form, /<Section id="employment" title="Employment">/);
    assert.match(form, /<Section id="emergency" title="Emergency">/);
    assert.match(form, /<Section id="notes" title="Notes">/);
    assert.match(form, /<Section id="linking" title="Linking">/);
    assert.match(form, /defaultOpen = false/);
    assert.match(form, /GuestFormStagedLinks/);
    assert.doesNotMatch(form, /GuestIndividualLinks/);
  });

  it("AC-GE2-2 first name remains required; first-name-only create still works", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /First name is required/);
    assert.match(form, /individual-first-name/);
    assert.match(functions, /firstName: z\.string\(\)\.trim\(\)\.min\(1, "First name is required\."\)/);
    assert.equal(validateEmergencyContacts([{ name: "" }]), null);
    assert.match(functions, /namedEmergencyContacts\(data\.guest\.emergencyContacts\)\.length/);
  });

  it("AC-GE2-3 Basic fields persist (title, middle, last, preferred, gender, DOB, nationality, language, VIP, status)", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /individual-first-name/);
    assert.match(form, /title/);
    assert.match(form, /middleName/);
    assert.match(form, /preferredName/);
    assert.match(form, /gender/);
    assert.match(form, /dateOfBirth/);
    assert.match(form, /nationality/);
    assert.match(form, /language/);
    assert.match(form, /vipStatus/);
    assert.match(form, /guestStatus/);
    assert.match(functions, /title:/);
    assert.match(functions, /middle_name:/);
    assert.match(functions, /preferred_name:/);
    assert.match(functions, /gender:/);
    assert.deepEqual([...GUEST_TITLES], ["mr", "mrs", "ms", "miss", "dr", "prof", "mx"]);
    assert.deepEqual([...GUEST_GENDERS], ["female", "male", "other", "unspecified"]);
  });

  it("AC-GE2-4 Contact primary + alternate phone/email persist; invalid alt email rejected", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /individual-phone-alt/);
    assert.match(form, /individual-email-alt/);
    assert.match(functions, /phone_alt:/);
    assert.match(functions, /email_alt:/);
    assert.match(functions, /assertEmail\(blankToNull\(input\.emailAlt\), "alternate email"\)/);
  });

  it("AC-GE2-5 Address stays in Address section and persists", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /<Section id="address" title="Address">/);
    assert.match(form, /individual-address-line1/);
    assert.match(functions, /address_line1:/);
    assert.match(functions, /address_line2:/);
    assert.match(functions, /postal_code:/);
  });

  it("AC-GE2-6 Identity text type/number/expiry persist; Directory/Information mask", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(form, /idDocumentType/);
    assert.match(form, /idDocumentNumber/);
    assert.match(form, /idDocumentExpiry/);
    assert.match(detail, /MaskedIdNumber/);
    assert.match(directory, /MaskedIdNumber/);
  });

  it("AC-GE2-7 Identity file upload collocated on form via guest_documents (no second store)", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const upload = readRel("../components/guests/guest-form-identity-upload.tsx");
    const staged = readRel("../components/guests/guest-form-staged-identity.tsx");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /GuestFormIdentityUpload/);
    assert.match(form, /GuestFormStagedIdentity/);
    assert.match(upload, /createGuestDocumentUpload/);
    assert.match(upload, /registerGuestDocument/);
    assert.match(upload, /listGuestDocuments/);
    assert.match(upload, /attachGuestDocumentFile/);
    assert.match(staged, /INDIVIDUAL_STAGED_IDENTITY_COPY/);
    assert.match(INDIVIDUAL_IDENTITY_UPLOAD_COPY, /guest_documents/);
    assert.match(functions, /from\("guest_documents"\)/);
    assert.doesNotMatch(form, /from\("guest_identity_files"|kyc_documents/);
    assert.match(identity, /createGuestDocumentUpload/);
  });

  it("AC-GE2-8 upload also works from Information Identity section", () => {
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    assert.match(detail, /individual-information-identity-upload/);
    assert.match(detail, /GuestFormIdentityUpload/);
    assert.doesNotMatch(detail, /Staff verify on Identity &/);
    assert.match(identity, /createGuestDocumentUpload/);
    assert.match(identity, /STAFF_VERIFY_COPY/);
  });

  it("AC-GE2-9 New Guest can search + pick masters before submit; write waits for guest id", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const staged = readRel("../components/guests/guest-form-staged-links.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const links = readRel("../components/guests/guest-individual-links.tsx");
    assert.match(form, /GuestFormStagedLinks/);
    assert.match(staged, /individual-link-master-search/);
    assert.match(staged, /listGuestAccounts/);
    assert.doesNotMatch(staged, /linkGuestAccount/);
    assert.match(form, /linkGuestAccount/);
    assert.doesNotMatch(form, /GuestIndividualLinks/);
    assert.match(detail, /GuestIndividualLinks/);
    assert.match(links, /individual-link-master-search/);
    assert.match(INDIVIDUAL_STAGED_LINKING_COPY, /held until Create/);
    assert.match(INDIVIDUAL_LINKING_AFTER_SAVE_COPY, /After save/);
  });

  it("AC-GE2-10 confirm writes guest_account_links with Wave 4 roles", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const links = readRel("../components/guests/guest-individual-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    assert.match(form, /submitLink/);
    assert.match(form, /linkGuestAccount/);
    assert.deepEqual([...INDIVIDUAL_LINK_ROLES], [
      "employer",
      "bill_to",
      "booker_ta",
      "group_member",
    ]);
    assert.deepEqual([...GUEST_RELATIONSHIP_ROLES], [...INDIVIDUAL_LINK_ROLES]);
    assert.equal(ROLE_ACCOUNT_TYPE.employer, "company");
    assert.equal(ROLE_ACCOUNT_TYPE.booker_ta, "travel_agent");
    assert.equal(ROLE_ACCOUNT_TYPE.group_member, "group");
    assert.equal(isIndividualLinkRole("employer"), true);
    assert.match(links, /linkGuestAccount/);
    assert.match(links, /individual-link-confirm/);
    assert.match(links, /individual-link-role/);
    assert.match(functions, /from\("guest_account_links"\)/);
    assert.match(INDIVIDUAL_LINKING_COPY, /guest_account_links/);
  });

  it("AC-GE2-11 list linked masters + unlink without deleting parties", () => {
    const links = readRel("../components/guests/guest-individual-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
    const unlink = functions.slice(functions.indexOf("export const unlinkGuestAccount"));
    assert.match(links, /individual-linked-master-row/);
    assert.match(links, /individual-unlink-master/);
    assert.match(links, /unlinkGuestAccount/);
    assert.match(unlink, /from\("guest_account_links"\)/);
    assert.match(unlink, /\.delete\(\)/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_profiles"\)[\s\S]{0,200}\.delete\(/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_account_masters"\)[\s\S]{0,200}\.delete\(/);
  });

  it("AC-GE2-12 Relationships card stays on the same store", () => {
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const links = readRel("../components/guests/guest-individual-links.tsx");
    assert.match(card, /listGuestAccountLinks/);
    assert.match(card, /linkGuestAccount/);
    assert.match(card, /guest-relationship-link/);
    assert.match(shell, /GuestRelationshipsCard/);
    assert.match(links, /listGuestAccountLinks/);
    assert.match(links, /invalidateQueries\(\{ queryKey: \["guest-account-links", restaurantId\] \}\)/);
  });

  it("AC-GE2-13 no guest↔guest family graph; no folio routing; no AC-W4-5 boil-in", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const links = readRel("../components/guests/guest-individual-links.tsx");
    const functions = readRel("./guests.functions.ts");
    const cashiering = readRel("./cashiering.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    assert.match(helpers, /no second link table/i);
    assert.doesNotMatch(links, /family graph|folio routed|create_hotel_reservation_priced/i);
    assert.doesNotMatch(functions, /from\("guest_family_links"|from\("guest_to_guest"/);
    assert.doesNotMatch(migration, /CREATE TABLE.*guest_account_links|folio_routing/);
    assert.match(cashiering, /transfersSupported: false/);
    assert.match(migration, /No folio routing/);
    assert.match(migration, /No guest↔guest family graph/);
  });

  it("AC-GE2-14 create-path Identity upload is honest (staged until Create)", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const staged = readRel("../components/guests/guest-form-staged-identity.tsx");
    assert.match(form, /GuestFormStagedIdentity/);
    assert.match(form, /applyStagedFollowups/);
    assert.match(form, /attachGuestDocumentFile/);
    assert.match(form, /createGuestDocumentUpload/);
    assert.match(form, /individual-create-partial-failure/);
    assert.match(form, /INDIVIDUAL_PARTIAL_CREATE_COPY/);
    assert.match(staged, /INDIVIDUAL_STAGED_IDENTITY_COPY/);
    assert.match(INDIVIDUAL_STAGED_IDENTITY_COPY, /held until Create/);
    assert.match(INDIVIDUAL_STAGED_IDENTITY_COPY, /guest_documents/);
    assert.match(INDIVIDUAL_STAGED_CREATE_COPY, /One Create/);
    assert.match(INDIVIDUAL_PARTIAL_CREATE_COPY, /not a full success/);
    assert.match(INDIVIDUAL_IDENTITY_AFTER_SAVE_COPY, /On Edit/);
  });

  it("AC-GE2-15 staff verify is not KYC", () => {
    const upload = readRel("../components/guests/guest-form-identity-upload.tsx");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    assert.match(STAFF_VERIFY_COPY, /not government verification or KYC/);
    assert.match(upload, /STAFF_VERIFY_COPY/);
    assert.match(identity, /STAFF_VERIFY_COPY/);
    assert.match(detail, /STAFF_VERIFY_COPY/);
    assert.doesNotMatch(upload, /government verified|police check/i);
    assert.match(INDIVIDUAL_IDENTITY_UPLOAD_COPY, /not government verification or KYC/);
  });

  it("AC-GE2-16 Employment Position and Department persist on the individual, not Company", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const company = readRel("../components/guests/guest-company-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /individual-position/);
    assert.match(form, /individual-department/);
    assert.match(functions, /employment_position:/);
    assert.doesNotMatch(company, /employment_position|individual-position|individual-department/);
  });

  it("AC-GE2-17 emergency contacts add/remove; empty first-name-only create succeeds", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    assert.equal(countNamedEmergencyContacts([{ name: "" }, { name: "Pat" }]), 1);
    assert.equal(validateEmergencyContacts([{ name: "" }]), null);
    assert.equal(validateEmergencyContacts([{ name: "Pat" }]), null);
    assert.equal(
      validateEmergencyContacts([{ name: "", phone: "0911" }]),
      INDIVIDUAL_EMERGENCY_NAME_REQUIRED,
    );
    assert.match(INDIVIDUAL_EMERGENCY_COPY, /First-name-only create can save with none/);
    assert.match(form, /validateEmergencyContacts/);
    assert.match(form, /individual-emergency-add/);
    assert.match(form, /individual-emergency-remove/);
    assert.match(form, /individual-emergency-name/);
    assert.match(functions, /replaceEmergencyContacts/);
    assert.match(functions, /guest_emergency_contacts/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public.guest_emergency_contacts/);
  });

  it("AC-GE2-18 Notes and optional source of business persist", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /individual-notes/);
    assert.match(form, /individual-source-of-business/);
    assert.match(functions, /source_of_business:/);
    assert.doesNotMatch(form, /rate-plan picker|source applied/i);
  });

  it("AC-GE2-19 set restricted/blacklisted only with reason; server records by + at", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.equal(validateRestrictionReason(true, false, ""), INDIVIDUAL_RESTRICTION_REASON_REQUIRED);
    assert.equal(validateRestrictionReason(true, false, "Chargeback"), null);
    assert.match(form, /individual-restricted/);
    assert.match(form, /individual-blacklisted/);
    assert.match(form, /individual-restriction-reason/);
    assert.match(functions, /restriction_set_by_membership_id: me\.id/);
    assert.match(functions, /restriction_set_at: new Date\(\)\.toISOString\(\)/);
    assert.deepEqual([...RESTRICTION_SEVERITIES], ["watch", "elevated", "severe"]);
  });

  it("AC-GE2-20 restriction visible on Directory, Information, Identity, header", () => {
    const bits = readRel("../components/guests/guest-bits.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(bits, /guest-restricted-badge/);
    assert.match(bits, /guest-blacklisted-badge/);
    assert.match(directory, /GuestRestrictionBadges/);
    assert.match(detail, /GuestRestrictionBadges/);
    assert.match(detail, /GuestRestrictionWarn/);
    assert.match(detail, /guest\.restrictionReason/);
    assert.match(bits, /guest-restriction-warn-reason/);
    assert.match(identity, /GuestRestrictionBadges/);
    assert.match(shell, /GuestRestrictionBadges/);
  });

  it("AC-GE2-21 History records restriction set and clear", () => {
    const functions = readRel("./guests.functions.ts");
    const server = readRel("./guests.server.ts");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    assert.match(functions, /recordRestrictionChange/);
    assert.match(functions, /restriction_set/);
    assert.match(server, /"restriction_set"/);
    assert.match(server, /"restriction_cleared"/);
    assert.match(server, /"restriction_lifted"/);
    assert.match(detail, /restriction_set: "Restriction set"/);
    assert.match(detail, /restriction_cleared: "Restriction cleared"/);
  });

  it("AC-GE2-22 lift with confirm + reason", () => {
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.equal(validateLiftReason(""), INDIVIDUAL_LIFT_REASON_REQUIRED);
    assert.equal(validateLiftReason("Cleared after review"), null);
    assert.match(detail, /individual-restriction-lift/);
    assert.match(detail, /individual-restriction-lift-confirm/);
    assert.match(detail, /individual-restriction-lift-reason/);
    assert.match(functions, /export const liftGuestRestriction/);
    assert.match(functions, /lifted: true/);
    assert.match(functions, /restriction_lifted/);
  });

  it("AC-GE2-23 stay paths that already touch this guest warn", () => {
    const walkIn = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const amend = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    const booking = readRel("../../../routes/restaurant/bookings/new.tsx");
    const reservation = readRel("../components/workspaces/reservation-detail-workspace.tsx");
    assert.equal(
      guestRestrictionWarning({ restricted: true, blacklisted: false }),
      INDIVIDUAL_RESTRICTION_WARN_COPY,
    );
    assert.equal(guestRestrictionActive({ restricted: false, blacklisted: false }), false);
    assert.match(walkIn, /GuestRestrictionWarn/);
    assert.match(amend, /GuestRestrictionWarn/);
    assert.match(booking, /GuestRestrictionWarn/);
    assert.match(reservation, /GuestRestrictionWarn/);
  });

  it("AC-GE2-24 no hard block unless Abel + Spec agree; warn-first", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const functions = readRel("./guests.functions.ts");
    assert.match(INDIVIDUAL_RESTRICTION_WARN_COPY, /not hard-blocked/);
    assert.match(INDIVIDUAL_HARD_BLOCK_FINDING, /OUT-OF-SCOPE FINDING/);
    assert.match(helpers, /Stay paths warn; they do not hard-block/);
    assert.doesNotMatch(functions, /hard.?block stay|throw new Error\("Guest is blacklisted"\)/i);
  });

  it("AC-GE2-25 no Import, Folio tab, loyalty points, rich Comms, police export, or KYC claim", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const links = readRel("../components/guests/guest-individual-links.tsx");
    assert.match(helpers, /No Import\/Folio\/loyalty/i);
    assert.doesNotMatch(form, /import wizard|police-export|government verified|loyalty points/i);
    assert.doesNotMatch(links, /folio routed|marketing send/i);
  });

  it("AC-GE2-26 denied staff cannot read or write enrichment / restriction / links", () => {
    const functions = readRel("./guests.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /requireGuestManager/);
    assert.match(accounts, /requireGuestManager/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
  });

  it("AC-GE2-27 Individual data, emergency contacts, documents, restriction, and links stay tenant-scoped", () => {
    const functions = readRel("./guests.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(accounts, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(migration, /restaurant_id uuid NOT NULL REFERENCES public\.restaurants\(id\)/);
  });

  it("AC-GE2-28 no entitlement / RLS model change unless Abel-flagged", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const migration = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    assert.match(helpers, /Additive RLS matching guest tables OK/);
    assert.match(migration, /Additive RLS/);
    assert.match(migration, /Entitlement model is/);
    assert.match(migration, /not changed/);
    assert.doesNotMatch(migration, /SECURITY DEFINER/i);
    assert.doesNotMatch(migration, /CREATE FUNCTION/i);
  });

  it("AC-GE2-29 Waves 1–5 LIVE surfaces remain; Gap-edit 1 is not reopened", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const company = readRel("./guest-profile-company.ts");
    assert.match(helpers, /Waves 1–5 stay closed/);
    assert.match(helpers, /Company gap-edit #1/);
    assert.match(company, /Waves 1–5 stay closed/);
  });

  it("AC-GE2-30 production schema apply is not claimed; 0056 collision uses 0057 APPLY HELD", () => {
    const supabase = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0057_pms_individual_form_enrichment.sql");
    const functions = readRel("./guests.functions.ts");
    const polish = readRel("../../../../supabase/migrations/0056_pms_polish1_payment_methods_admin_fee_presets.sql");
    assert.equal(INDIVIDUAL_ENRICHMENT_MIGRATION_FILE, "0057_pms_individual_form_enrichment.sql");
    assert.match(INDIVIDUAL_ENRICHMENT_UNAVAILABLE, /0057/);
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(drizzle, /APPLY HELD/);
    assert.match(functions, /INDIVIDUAL_ENRICHMENT_UNAVAILABLE/);
    assert.match(supabase, /0056/);
    assert.match(polish, /pms_payment_methods|admin_fee|preset/i);
  });

  it("AC-GE2-31 this gap-edit does not claim the module COMPLETE", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const docs = readRel("../../../../docs/pms/guests.md");
    assert.doesNotMatch(helpers, /module COMPLETE|MODULE COMPLETE/);
    assert.match(docs, /Do \*\*not\*\* claim implemented \/ PASS \/ LIVE \/ COMPLETE/);
  });

  it("AC-GE2-32 Wave 5 export / anonymise extend to new Individual PII", () => {
    const privacy = readRel("./guest-privacy.functions.ts");
    assert.match(privacy, /from\("guest_emergency_contacts"\)/);
    assert.match(privacy, /emergencyContacts:/);
    assert.match(privacy, /restriction_reason: null/);
    assert.match(privacy, /employment_position: null/);
    assert.match(privacy, /phone_alt: null/);
    assert.match(privacy, /email_alt: null/);
    assert.match(privacy, /title: null/);
    assert.match(privacy, /middle_name: null/);
  });

  it("AC-GE2-33 Preferences stay on the Preferences card; consent on Information; Identity card remains", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.doesNotMatch(form, /GuestPreferencesCard|saveGuestPreferences/);
    assert.match(detail, /GuestConsentPanel/);
    assert.match(shell, /GuestIdentityCard/);
    assert.match(shell, /GuestPreferencesCard|preferences/);
  });

  it("AC-GE2-34 Wave 1 duplicate warn remains; Compare is not required", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(form, /findGuestDuplicates/);
    assert.match(form, /onMergeRequested/);
    assert.doesNotMatch(form, /Compare product|guest-compare-/);
  });
});
