import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseGuestProfileSearch } from "./guest-profile-wave1.ts";
import {
  GUEST_COMPANY_CREATE_HOLD_KEY_PREFIX,
  GUEST_COMPANY_CREATE_MIGRATION_FILE,
  GUEST_COMPANY_CREATE_STEPS,
  companyCreateDraftErrors,
  companyCreateDraftErrorsForSave,
  companyCreateStepErrors,
  emptyGuestCompanyCreateDraft,
  guestCompanyCreateHoldKey,
  inferGuestCompanyCreateStep,
  parseGuestCompanyCreateHold,
} from "./guest-company-create-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function filledDraft() {
  const draft = emptyGuestCompanyCreateDraft();
  draft.name = "Noru Holdings";
  draft.businessProfileTypeId = "11111111-1111-4111-8111-111111111111";
  return draft;
}

describe("Company create workflow helpers", () => {
  it("keeps exactly five dedicated steps", () => {
    assert.deepEqual(
      GUEST_COMPANY_CREATE_STEPS.map((step) => step.id),
      ["details", "contacts", "business", "billing", "review"],
    );
    assert.equal(GUEST_COMPANY_CREATE_STEPS.length, 5);
  });

  it("requires name and company type, and keeps later fields", () => {
    const draft = emptyGuestCompanyCreateDraft();
    draft.addressLine1 = "Bole Road";
    assert.match(companyCreateStepErrors("details", draft)[0] ?? "", /Company name/);
    draft.name = "Noru Holdings";
    assert.match(companyCreateStepErrors("details", draft).join(" "), /Company type/);
    draft.businessProfileTypeId = "11111111-1111-4111-8111-111111111111";
    assert.equal(companyCreateStepErrors("details", draft).length, 0);
    assert.equal(draft.addressLine1, "Bole Road");
  });

  it("blocks inverted contract dates", () => {
    const draft = filledDraft();
    draft.contractStartDate = "2026-09-10";
    draft.contractEndDate = "2026-09-01";
    assert.match(companyCreateStepErrors("business", draft).join(" "), /start must be/);
    draft.contractEndDate = "2026-09-20";
    assert.equal(companyCreateStepErrors("business", draft).length, 0);
  });

  it("lets Save Draft persist with only a name", () => {
    const draft = emptyGuestCompanyCreateDraft();
    assert.match(companyCreateDraftErrorsForSave(draft)[0] ?? "", /name/);
    draft.name = "Noru Holdings";
    assert.equal(companyCreateDraftErrorsForSave(draft).length, 0);
    assert.ok(companyCreateDraftErrors(draft).length > 0);
  });

  it("restores the held step and draft", () => {
    const draft = filledDraft();
    draft.billingArrangement = "company_master";
    const held = parseGuestCompanyCreateHold({ step: "billing", draft });
    assert.equal(held?.step, "billing");
    assert.equal(held?.draft.name, "Noru Holdings");
    assert.equal(inferGuestCompanyCreateStep(draft), "billing");
    assert.equal(guestCompanyCreateHoldKey("rest-1"), `${GUEST_COMPANY_CREATE_HOLD_KEY_PREFIX}:rest-1`);
  });
});

describe("Company create honesty", () => {
  it("is a dedicated workspace, not a New Company modal", () => {
    const workspace = readRel("../components/workspaces/guest-company-create-workspace.tsx");
    const directory = readRel("../components/guests/guest-company-directory.tsx");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const accounts = readRel("../components/guests/guest-account-directory.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const wave1 = readRel("./guest-profile-wave1.ts");
    assert.match(workspace, /company-create-workspace/);
    assert.match(workspace, /GUEST_COMPANY_CREATE_STEPS/);
    assert.match(workspace, /writeGuestCompanyCreateHold/);
    assert.match(workspace, /persistCompanyCreate/);
    assert.match(workspace, /Create Company/);
    assert.match(workspace, /Save as Draft/);
    assert.match(workspace, /nav: "overview"/);
    assert.match(workspace, /company-create-success/);
    assert.match(workspace, /View Company/);
    assert.match(workspace, /Add Another Company/);
    assert.match(workspace, /companyMasterId: created.id/);
    assert.doesNotMatch(workspace, /<Dialog/);
    assert.match(workspace, /onClick=\{\(\) => go\(item\.id\)\}/);
    assert.doesNotMatch(workspace, /disabled=\{!reachable\}/);
    assert.match(directory, /create: "company"/);
    assert.match(listing, /create: "company"/);
    assert.match(accounts, /create: "travel-agent"/);
    assert.match(shell, /create === "company"/);
    assert.match(shell, /GuestCompanyCreateWorkspace/);
    assert.match(wave1, /"company" \| "travel-agent"/);
    assert.deepEqual(parseGuestProfileSearch({ create: "company" }), { type: "company", create: "company" });
  });

  it("reuses company master, contacts, catalogues and does not invent credit or invoices", () => {
    const workspace = readRel("../components/workspaces/guest-company-create-workspace.tsx");
    const functions = readRel("./guest-company-create.functions.ts");
    assert.match(functions, /createGuestAccount/);
    assert.match(functions, /saveCompanyContact/);
    assert.match(functions, /account_operations/);
    assert.match(functions, /assertListingCreateAllowed/);
    assert.match(functions, /pms_business_profile_types/);
    assert.match(functions, /pms_business_contact_roles/);
    assert.doesNotMatch(functions, /postFolioEntry/);
    assert.doesNotMatch(functions, /pms_corporate_agreements/);
    assert.doesNotMatch(workspace, /Invoice created|Payment posted|Credit settled/);
    assert.match(workspace, /COMPANY_CREATE_CREDIT_COPY/);
    assert.match(workspace, /COMPANY_CREATE_TAX_COPY/);
    assert.match(readRel("./guest-company-create-workspace.ts"), /COMPANY_CREATE_TAX_COPY/);
  });

  it("keeps dual-lane 0099 drafts off guest_account_masters until persist", () => {
    const supabase = readRel("../../../../supabase/migrations/0099_pms_account_create_drafts.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0099_pms_account_create_drafts.sql");
    assert.equal(GUEST_COMPANY_CREATE_MIGRATION_FILE, "0099_pms_account_create_drafts.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_account_create_drafts/);
    assert.match(supabase, /account_kind/);
    assert.match(supabase, /account_operations/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.company_contacts\b/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.agency_billing\b/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });
});
