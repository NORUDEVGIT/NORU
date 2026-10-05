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
  companyCreateFieldIssues,
  companyCreateStepErrors,
  createCompanyFieldRules,
  emptyGuestCompanyCreateDraft,
  guestCompanyCreateCompletion,
  guestCompanyCreateHoldKey,
  inferGuestCompanyCreateStep,
  matchCompanyFieldIssue,
  parseGuestCompanyCreateHold,
} from "./guest-company-create-workspace.ts";
import { formatCreateIssuesByStep, issuesBeforeStep } from "./guest-create-step-issues.ts";

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
      ["details", "contacts", "billing", "contracts", "review"],
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

  it("validates phone formats indicator +251, 09, 07", () => {
    const draft = filledDraft();
    draft.contacts[0].phone = "not-a-phone";
    assert.match(companyCreateStepErrors("contacts", draft).join(" "), /valid phone number/);
    draft.contacts[0].phone = "+251911234567";
    assert.equal(companyCreateStepErrors("contacts", draft).length, 0);
    draft.contacts[0].phone = "0911234567";
    assert.equal(companyCreateStepErrors("contacts", draft).length, 0);
    draft.contacts[0].phone = "0711234567";
    assert.equal(companyCreateStepErrors("contacts", draft).length, 0);
  });

  it("blocks inverted contract dates", () => {
    const draft = filledDraft();
    draft.contract.validFrom = "2026-09-10";
    draft.contract.validTo = "2026-09-01";
    assert.match(companyCreateStepErrors("contracts", draft).join(" "), /Valid-until must be on or after/);
    draft.contract.validTo = "2026-09-20";
    assert.equal(companyCreateStepErrors("contracts", draft).filter((e) => e.includes("Valid-until")).length, 0);
  });

  it("lets Save Draft persist with only a name", () => {
    const draft = emptyGuestCompanyCreateDraft();
    assert.match(companyCreateDraftErrorsForSave(draft)[0] ?? "", /name/);
    draft.name = "Noru Holdings";
    assert.equal(companyCreateDraftErrorsForSave(draft).length, 0);
    assert.ok(companyCreateDraftErrors(draft).length > 0);
  });

  it("names the missing field and the step that holds it", () => {
    const issues = companyCreateFieldIssues(emptyGuestCompanyCreateDraft());
    assert.ok(issues.some((issue) => issue.key === "name" && issue.step === "details"));
    assert.match(
      formatCreateIssuesByStep(issues, GUEST_COMPANY_CREATE_STEPS),
      /Company Information — Company name is required/,
    );
    assert.equal(issuesBeforeStep(issues, GUEST_COMPANY_CREATE_STEPS, "details").length, 0);
    assert.ok(
      issuesBeforeStep(issues, GUEST_COMPANY_CREATE_STEPS, "contracts").some(
        (issue) => issue.key === "name",
      ),
    );
  });

  it("restores the held step and draft, normalizing legacy steps", () => {
    const draft = filledDraft();
    draft.billingArrangement = "company_master";
    const held = parseGuestCompanyCreateHold({ step: "billing", draft });
    assert.equal(held?.step, "billing");
    assert.equal(held?.draft.name, "Noru Holdings");
    assert.equal(inferGuestCompanyCreateStep(draft), "billing");

    // Legacy basic maps to details, business maps to contracts
    const legacyBasic = parseGuestCompanyCreateHold({ step: "basic", draft });
    assert.equal(legacyBasic?.step, "details");
    const legacyBusiness = parseGuestCompanyCreateHold({ step: "business", draft });
    assert.equal(legacyBusiness?.step, "contracts");

    assert.equal(
      guestCompanyCreateHoldKey("rest-1"),
      `${GUEST_COMPANY_CREATE_HOLD_KEY_PREFIX}:rest-1`,
    );
  });
});

describe("Card 4 Settings field controls for Company creation", () => {
  it("creates rules where system required fields are always visible and required", () => {
    const rules = createCompanyFieldRules([], null, null);
    const nameRule = rules.find((r) => r.code === "COMPANY_NAME");
    const typeRule = rules.find((r) => r.code === "COMPANY_TYPE");
    assert.equal(nameRule?.visible, true);
    assert.equal(nameRule?.required, true);
    assert.equal(typeRule?.visible, true);
    assert.equal(typeRule?.required, true);
  });

  it("marks fields required when included in profileType requiredFieldIds", () => {
    const fields = [
      { id: "f-tax", code: "TAX_ID", active: true },
      { id: "f-city", code: "CITY", active: true },
      { id: "f-phone", code: "CONTACT_PHONE", active: true },
    ];
    const profileType = {
      id: "pt-company",
      requiredFieldIds: ["f-tax", "f-city"],
    };

    const rules = createCompanyFieldRules(fields, profileType, null);
    const taxRule = rules.find((r) => r.code === "TAX_ID");
    const cityRule = rules.find((r) => r.code === "CITY");
    const phoneRule = rules.find((r) => r.code === "CONTACT_PHONE");

    assert.equal(taxRule?.required, true);
    assert.equal(cityRule?.required, true);
    assert.equal(phoneRule?.required, false);
  });

  it("allows Contact Full Name and Contact Phone to be controllable (optional or required) via profileType even if businessProfileType has contactRequired: true", () => {
    const fields = [
      { id: "f-cname", code: "COMPANY_CONTACT_NAME", active: true, required: false },
      { id: "f-cphone", code: "COMPANY_CONTACT_PHONE", active: true, required: false },
    ];
    const businessProfileType = { contactRequired: true, taxIdRequired: false };

    // When profileType has NOT marked them required: both must be required: false
    const optionalProfileType = {
      id: "pt-company",
      requiredFieldIds: [],
    };
    const optionalRules = createCompanyFieldRules(fields, optionalProfileType, businessProfileType);
    const optionalNameRule = optionalRules.find((r) => r.code === "COMPANY_CONTACT_NAME");
    const optionalPhoneRule = optionalRules.find((r) => r.code === "COMPANY_CONTACT_PHONE");
    assert.equal(optionalNameRule?.required, false, "Contact name must be controllable and optional");
    assert.equal(optionalPhoneRule?.required, false, "Contact phone must be controllable and optional");

    // When profileType has marked them required: both must be required: true
    const requiredProfileType = {
      id: "pt-company",
      requiredFieldIds: ["f-cname", "f-cphone"],
    };
    const requiredRules = createCompanyFieldRules(fields, requiredProfileType, businessProfileType);
    const requiredNameRule = requiredRules.find((r) => r.code === "COMPANY_CONTACT_NAME");
    const requiredPhoneRule = requiredRules.find((r) => r.code === "COMPANY_CONTACT_PHONE");
    assert.equal(requiredNameRule?.required, true, "Contact name must be required when configured");
    assert.equal(requiredPhoneRule?.required, true, "Contact phone must be required when configured");

    // When profileType is null (fallback mode): businessProfileType.contactRequired defaults them to true
    const fallbackRules = createCompanyFieldRules(fields, null, businessProfileType);
    const fallbackNameRule = fallbackRules.find((r) => r.code === "COMPANY_CONTACT_NAME");
    const fallbackPhoneRule = fallbackRules.find((r) => r.code === "COMPANY_CONTACT_PHONE");
    assert.equal(fallbackNameRule?.required, true, "Fallback without profileType respects businessProfileType");
    assert.equal(fallbackPhoneRule?.required, true, "Fallback without profileType respects businessProfileType");
  });

  it("makes inactive fields invisible and non-required even if marked required", () => {
    const fields = [
      { id: "f-tax", code: "TAX_ID", active: false, required: true },
      { id: "f-notes", code: "NOTES", active: false },
    ];
    const profileType = {
      id: "pt-company",
      requiredFieldIds: ["f-tax"],
    };

    const rules = createCompanyFieldRules(fields, profileType, null);
    const taxRule = rules.find((r) => r.code === "TAX_ID");
    const notesRule = rules.find((r) => r.code === "NOTES");

    assert.equal(taxRule?.visible, false);
    assert.equal(taxRule?.required, false);
    assert.equal(notesRule?.visible, false);
    assert.equal(notesRule?.required, false);
  });

  it("generates gaps and blocks forward step navigation for missing Card 4 required fields", () => {
    const fields = [
      { id: "f-tax", code: "TAX_ID", active: true },
      { id: "f-city", code: "CITY", active: true },
      { id: "f-phone", code: "CONTACT_PHONE", active: true },
    ];
    const profileType = {
      id: "pt-company",
      requiredFieldIds: ["f-tax", "f-city", "f-phone"],
    };
    const rules = createCompanyFieldRules(fields, profileType, null);

    const draft = filledDraft();
    draft.taxId = "";
    draft.city = "";
    draft.contacts[0].phone = "";

    const issues = companyCreateFieldIssues(draft, { rules });

    // Step 1: details issues
    const taxIssue = issues.find((i) => i.key === "TAX_ID" && i.step === "details");
    const cityIssue = issues.find((i) => i.key === "CITY" && i.step === "details");
    assert.ok(taxIssue, "TAX_ID must produce a details issue");
    assert.ok(cityIssue, "CITY must produce a details issue");

    // Step 2: contacts issue
    const phoneIssue = issues.find((i) => i.key === "CONTACT_PHONE" && i.step === "contacts");
    assert.ok(phoneIssue, "CONTACT_PHONE must produce a contacts issue");

    // Red highlight / error matching must resolve both camelCase and uppercase keys
    assert.equal(matchCompanyFieldIssue(issues, "taxId")?.message, taxIssue.message);
    assert.equal(matchCompanyFieldIssue(issues, "TAX_ID")?.message, taxIssue.message);
    assert.equal(matchCompanyFieldIssue(issues, "city")?.message, cityIssue.message);
    assert.equal(matchCompanyFieldIssue(issues, "CITY")?.message, cityIssue.message);
    assert.equal(matchCompanyFieldIssue(issues, "phone")?.message, phoneIssue.message);
    assert.equal(matchCompanyFieldIssue(issues, "CONTACT_PHONE")?.message, phoneIssue.message);

    // Issues before contacts step blocks entering contacts if details has gaps
    const blockingContacts = issuesBeforeStep(issues, GUEST_COMPANY_CREATE_STEPS, "contacts");
    assert.ok(blockingContacts.some((i) => i.key === "TAX_ID"));
    assert.ok(blockingContacts.some((i) => i.key === "CITY"));

    // Filling details clears details gaps
    draft.taxId = "1234567890";
    draft.city = "Addis Ababa";
    const issuesAfterDetailsFilled = companyCreateFieldIssues(draft, { rules });
    const blockingContactsNow = issuesBeforeStep(issuesAfterDetailsFilled, GUEST_COMPANY_CREATE_STEPS, "contacts");
    assert.equal(blockingContactsNow.length, 0);

    // But entering billing (step 3) is blocked by Step 2 (contacts)
    const blockingBilling = issuesBeforeStep(issuesAfterDetailsFilled, GUEST_COMPANY_CREATE_STEPS, "billing");
    assert.ok(blockingBilling.some((i) => i.key === "CONTACT_PHONE"));

    // Filling phone clears contact issue
    draft.contacts[0].phone = "+251911223344";
    const issuesAllFilled = companyCreateFieldIssues(draft, { rules });
    const blockingBillingNow = issuesBeforeStep(issuesAllFilled, GUEST_COMPANY_CREATE_STEPS, "billing");
    assert.equal(blockingBillingNow.length, 0);
  });

  it("inactive fields do NOT block step navigation", () => {
    const fields = [
      { id: "f-tax", code: "TAX_ID", active: false, required: true },
      { id: "f-city", code: "CITY", active: false, required: true },
    ];
    const profileType = {
      id: "pt-company",
      requiredFieldIds: ["f-tax", "f-city"],
    };
    const rules = createCompanyFieldRules(fields, profileType, null);

    const draft = filledDraft();
    draft.taxId = "";
    draft.city = "";

    const issues = companyCreateFieldIssues(draft, { rules });
    const blockingContacts = issuesBeforeStep(issues, GUEST_COMPANY_CREATE_STEPS, "contacts");
    assert.equal(blockingContacts.length, 0, "Inactive fields must never block navigation");
  });

  it("accurately computes guestCompanyCreateCompletion based on Card 4 rules", () => {
    const fields = [
      { id: "f-tax", code: "TAX_ID", active: true },
      { id: "f-city", code: "CITY", active: true },
      { id: "f-phone", code: "CONTACT_PHONE", active: true },
    ];
    const profileType = {
      id: "pt-company",
      requiredFieldIds: ["f-tax", "f-city", "f-phone"],
    };
    const rules = createCompanyFieldRules(fields, profileType, null);

    const draft = filledDraft();
    draft.taxId = "";
    draft.city = "";
    draft.contacts[0].phone = "";

    const completionIncomplete = guestCompanyCreateCompletion(draft, { rules });
    const detailsItem = completionIncomplete.items.find((i) => i.id === "identity");
    const contactsItem = completionIncomplete.items.find((i) => i.id === "contacts");

    assert.equal(detailsItem?.requiredRemaining, true);
    assert.equal(contactsItem?.requiredRemaining, true);

    // Fill all required fields
    draft.taxId = "1234567890";
    draft.city = "Addis Ababa";
    draft.contacts[0].phone = "+251911223344";

    const completionComplete = guestCompanyCreateCompletion(draft, { rules });
    const detailsItemDone = completionComplete.items.find((i) => i.id === "identity");
    const contactsItemDone = completionComplete.items.find((i) => i.id === "contacts");

    assert.equal(detailsItemDone?.requiredRemaining, false);
    assert.equal(contactsItemDone?.requiredRemaining, false);
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
    assert.match(workspace, /GUEST_COMPANY_CREATE_STEPS/);
    assert.match(workspace, /writeGuestCompanyCreateHold/);
    assert.match(workspace, /persistCompanyCreate/);
    assert.match(workspace, /Add Another Company/);
    assert.doesNotMatch(workspace, /<Dialog/);
    assert.match(workspace, /onClick=\{\(\) => go\(item\.id\)\}/);
    assert.match(workspace, /issuesBeforeStep/);
    assert.match(workspace, /formatCreateIssuesByStep/);
    assert.match(workspace, /Go to step/);
    assert.match(workspace, /border-destructive/);
    assert.doesNotMatch(workspace, /disabled=\{!reachable\}/);
    assert.match(directory, /create: "company"/);
    assert.match(shell, /create: "company"/);
    assert.match(accounts, /create: "travel-agent"/);
    assert.match(shell, /create === "company"/);
    assert.match(shell, /GuestCompanyCreateWorkspace/);
    assert.match(wave1, /"company" \| "travel-agent"/);
    assert.deepEqual(parseGuestProfileSearch({ create: "company" }), {
      type: "company",
      create: "company",
    });
  });

  it("reuses company master, contacts, catalogues and persists real agreement", () => {
    const workspace = readRel("../components/workspaces/guest-company-create-workspace.tsx");
    const functions = readRel("./guest-company-create.functions.ts");
    assert.match(functions, /createGuestAccount/);
    assert.match(functions, /saveCompanyContact/);
    assert.match(functions, /account_operations/);
    assert.match(functions, /assertListingCreateAllowed/);
    assert.match(functions, /pms_business_profile_types/);
    assert.match(functions, /pms_business_contact_roles/);
    assert.doesNotMatch(functions, /postFolioEntry/);
    assert.match(functions, /pms_corporate_agreements/);
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
