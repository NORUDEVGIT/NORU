import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_GENDERS,
  GUEST_TITLES,
  INDIVIDUAL_ACCEPTANCE_CRITERIA,
  INDIVIDUAL_EMERGENCY_REQUIRED,
  INDIVIDUAL_ENRICHMENT_MIGRATION_FILE,
  INDIVIDUAL_ENRICHMENT_UNAVAILABLE,
  INDIVIDUAL_HARD_BLOCK_FINDING,
  INDIVIDUAL_IDENTITY_AFTER_SAVE_COPY,
  INDIVIDUAL_IDENTITY_UPLOAD_COPY,
  INDIVIDUAL_LINKING_AFTER_SAVE_COPY,
  INDIVIDUAL_LINKING_COPY,
  INDIVIDUAL_LINK_ROLES,
  INDIVIDUAL_LIFT_REASON_REQUIRED,
  INDIVIDUAL_RESTRICTION_REASON_REQUIRED,
  INDIVIDUAL_RESTRICTION_WARN_COPY,
  INDIVIDUAL_SPEC_AC_IDS,
  RESTRICTION_SEVERITIES,
  countNamedEmergencyContacts,
  guestRestrictionActive,
  guestRestrictionWarning,
  isIndividualLinkRole,
  validateEmergencyContacts,
  validateLiftReason,
  validateRestrictionReason,
} from "./guest-profile-individual.ts";
import { GUEST_RELATIONSHIP_ROLES, ROLE_ACCOUNT_TYPE } from "./guest-profile-wave4.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const GE2 = Array.from({ length: 13 }, (_, i) => `AC-GE2-${i + 1}`);

describe("Guest Profile Individual enrichment lock — AC-GE2-1…13", () => {
  it("locks AC-GE2-1…13 (plan IDs; Eng-ready Spec had not landed)", () => {
    assert.deepEqual([...INDIVIDUAL_ACCEPTANCE_CRITERIA], GE2);
    assert.deepEqual([...INDIVIDUAL_SPEC_AC_IDS], GE2);
  });

  it("AC-GE2-1 sectioned Individual form; Basic open; other sections collapsed", () => {
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
    assert.match(form, /defaultOpen = false/);
  });

  it("AC-GE2-2 required first name; Contact/Address/Employment/Notes persist", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /First name is required/);
    assert.match(form, /individual-first-name/);
    assert.match(form, /individual-phone-alt/);
    assert.match(form, /individual-email-alt/);
    assert.match(form, /individual-address-line1/);
    assert.match(form, /individual-position/);
    assert.match(form, /individual-department/);
    assert.match(form, /individual-notes/);
    assert.match(form, /individual-source-of-business/);
    assert.match(functions, /phone_alt:/);
    assert.match(functions, /email_alt:/);
    assert.match(functions, /employment_position:/);
    assert.match(functions, /source_of_business:/);
    assert.match(functions, /firstName: z\.string\(\)\.trim\(\)\.min\(1, "First name is required\."\)/);
  });

  it("AC-GE2-3 Identity type/number/expiry + upload via guest_documents (no second store)", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const upload = readRel("../components/guests/guest-form-identity-upload.tsx");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(form, /idDocumentType/);
    assert.match(form, /idDocumentNumber/);
    assert.match(form, /idDocumentExpiry/);
    assert.match(form, /GuestFormIdentityUpload/);
    assert.match(form, /INDIVIDUAL_IDENTITY_AFTER_SAVE_COPY/);
    assert.match(upload, /createGuestDocumentUpload/);
    assert.match(upload, /registerGuestDocument/);
    assert.match(upload, /listGuestDocuments/);
    assert.match(INDIVIDUAL_IDENTITY_UPLOAD_COPY, /guest_documents/);
    assert.match(INDIVIDUAL_IDENTITY_AFTER_SAVE_COPY, /no second store/);
    assert.match(functions, /from\("guest_documents"\)/);
    assert.doesNotMatch(form, /from\("guest_identity_files"|kyc_documents/);
    assert.doesNotMatch(upload, /government verified|KYC/i);
    assert.match(identity, /createGuestDocumentUpload/);
    assert.match(STAFF_VERIFY_FROM_IDENTITY(identity), /Staff verify/);
  });

  it("AC-GE2-4 at least one emergency contact; add/remove", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    assert.equal(countNamedEmergencyContacts([{ name: "" }, { name: "Pat" }]), 1);
    assert.equal(validateEmergencyContacts([{ name: "" }]), INDIVIDUAL_EMERGENCY_REQUIRED);
    assert.equal(validateEmergencyContacts([{ name: "Pat" }]), null);
    assert.match(form, /validateEmergencyContacts/);
    assert.match(form, /individual-emergency-add/);
    assert.match(form, /individual-emergency-remove/);
    assert.match(form, /individual-emergency-name/);
    assert.match(functions, /replaceEmergencyContacts/);
    assert.match(functions, /guest_emergency_contacts/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public.guest_emergency_contacts/);
  });

  it("AC-GE2-5 set restricted/blacklisted with reason; badges; history", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const bits = readRel("../components/guests/guest-bits.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    const functions = readRel("./guests.functions.ts");
    const server = readRel("./guests.server.ts");
    assert.equal(validateRestrictionReason(true, false, ""), INDIVIDUAL_RESTRICTION_REASON_REQUIRED);
    assert.equal(validateRestrictionReason(true, false, "Chargeback"), null);
    assert.match(form, /individual-restricted/);
    assert.match(form, /individual-blacklisted/);
    assert.match(form, /individual-restriction-reason/);
    assert.match(bits, /guest-restricted-badge/);
    assert.match(bits, /guest-blacklisted-badge/);
    assert.match(directory, /GuestRestrictionBadges/);
    assert.match(detail, /GuestRestrictionBadges/);
    assert.match(identity, /GuestRestrictionBadges/);
    assert.match(functions, /export const setGuestRestriction/);
    assert.match(functions, /recordRestrictionChange/);
    assert.match(functions, /restriction_set/);
    assert.match(server, /"restriction_set"/);
    assert.match(server, /"restriction_cleared"/);
    assert.match(server, /"restriction_lifted"/);
    assert.deepEqual([...RESTRICTION_SEVERITIES], ["watch", "elevated", "severe"]);
  });

  it("AC-GE2-6 lift with confirm + reason", () => {
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

  it("AC-GE2-7 warn on stay paths; no hard-block product without Abel", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const walkIn = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const amend = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    const booking = readRel("../../../routes/restaurant/bookings/new.tsx");
    const reservation = readRel("../components/workspaces/reservation-detail-workspace.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.equal(
      guestRestrictionWarning({ restricted: true, blacklisted: false }),
      INDIVIDUAL_RESTRICTION_WARN_COPY,
    );
    assert.equal(guestRestrictionActive({ restricted: false, blacklisted: false }), false);
    assert.match(walkIn, /GuestRestrictionWarn/);
    assert.match(amend, /GuestRestrictionWarn/);
    assert.match(booking, /GuestRestrictionWarn/);
    assert.match(reservation, /GuestRestrictionWarn/);
    assert.match(INDIVIDUAL_RESTRICTION_WARN_COPY, /not hard-blocked/);
    assert.match(INDIVIDUAL_HARD_BLOCK_FINDING, /OUT-OF-SCOPE FINDING/);
    assert.match(helpers, /Stay paths warn; they do not hard-block/);
    assert.doesNotMatch(functions, /hard.?block stay|throw new Error\("Guest is blacklisted"\)/i);
  });

  it("AC-GE2-8 Waves 1–5 + Company gap-edit #1 are not reopened", () => {
    const helpers = readRel("./guest-profile-individual.ts");
    const company = readRel("./guest-profile-company.ts");
    assert.match(helpers, /Waves 1–5 stay closed/);
    assert.match(helpers, /Company gap-edit #1/);
    assert.match(company, /Waves 1–5 stay closed/);
    assert.doesNotMatch(helpers, /module COMPLETE|MODULE COMPLETE/);
    assert.deepEqual([...GUEST_TITLES], ["mr", "mrs", "ms", "miss", "dr", "prof", "mx"]);
    assert.deepEqual([...GUEST_GENDERS], ["female", "male", "other", "unspecified"]);
  });

  it("AC-GE2-9 after save, Linking searches Company/Group/TA masters", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const links = readRel("../components/guests/guest-individual-links.tsx");
    assert.match(form, /INDIVIDUAL_LINKING_AFTER_SAVE_COPY/);
    assert.doesNotMatch(form, /GuestIndividualLinks/);
    assert.match(detail, /GuestIndividualLinks/);
    assert.match(links, /individual-link-master-search/);
    assert.match(links, /listGuestAccounts/);
    assert.match(INDIVIDUAL_LINKING_AFTER_SAVE_COPY, /after this guest is saved/);
  });

  it("AC-GE2-10 confirm writes guest_account_links with Wave 4 roles", () => {
    const links = readRel("../components/guests/guest-individual-links.tsx");
    const functions = readRel("./guest-accounts.functions.ts");
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

  it("0057 is dual-lane APPLY HELD and degrades honestly", () => {
    const supabase = readRel("../../../../supabase/migrations/0057_pms_individual_form_enrichment.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0057_pms_individual_form_enrichment.sql");
    const functions = readRel("./guests.functions.ts");
    assert.equal(INDIVIDUAL_ENRICHMENT_MIGRATION_FILE, "0057_pms_individual_form_enrichment.sql");
    assert.match(INDIVIDUAL_ENRICHMENT_UNAVAILABLE, /0057/);
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(drizzle, /APPLY HELD/);
    assert.match(functions, /INDIVIDUAL_ENRICHMENT_UNAVAILABLE/);
    assert.match(supabase, /Additive RLS/);
    assert.match(supabase, /Entitlement model is/);
    assert.match(supabase, /not changed/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.doesNotMatch(supabase, /CREATE FUNCTION/i);
    assert.match(supabase, /0056/);
  });

  it("preserves pms + guest manage gate", () => {
    const functions = readRel("./guests.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /requireGuestManager/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
  });
});

function STAFF_VERIFY_FROM_IDENTITY(identity: string) {
  return identity;
}
