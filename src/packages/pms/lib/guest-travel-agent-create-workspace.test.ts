import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseGuestProfileSearch } from "./guest-profile-wave1.ts";
import {
  GUEST_TRAVEL_AGENT_CREATE_HOLD_KEY_PREFIX,
  GUEST_TRAVEL_AGENT_CREATE_MIGRATION_FILE,
  GUEST_TRAVEL_AGENT_CREATE_STEPS,
  emptyGuestTravelAgentCreateDraft,
  guestTravelAgentCreateHoldKey,
  inferGuestTravelAgentCreateStep,
  parseGuestTravelAgentCreateHold,
  travelAgentCommissionReady,
  travelAgentCreateDraftErrors,
  travelAgentCreateDraftErrorsForSave,
  travelAgentCreateFieldIssues,
  travelAgentCreateStepErrors,
} from "./guest-travel-agent-create-workspace.ts";
import { formatCreateIssuesByStep, issuesBeforeStep } from "./guest-create-step-issues.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function filledDraft() {
  const draft = emptyGuestTravelAgentCreateDraft();
  draft.name = "Blue Nile Travel";
  draft.agencyType = "local";
  return draft;
}

describe("Travel agency create workflow helpers", () => {
  it("defines the canonical 5-step Travel Agency registration wizard", () => {
    assert.deepEqual(
      GUEST_TRAVEL_AGENT_CREATE_STEPS.map((step) => step.id),
      ["basic_info", "contacts", "commission_rates", "payment_rules", "review"],
    );
    assert.equal(GUEST_TRAVEL_AGENT_CREATE_STEPS.length, 5);
  });

  it("requires name and agency type", () => {
    const draft = emptyGuestTravelAgentCreateDraft();
    assert.match(travelAgentCreateStepErrors("basic_info", draft)[0] ?? "", /Agency name/);
    draft.name = "Blue Nile Travel";
    assert.match(travelAgentCreateStepErrors("basic_info", draft).join(" "), /Agency type/);
    draft.agencyType = "local";
    assert.equal(travelAgentCreateStepErrors("basic_info", draft).length, 0);
  });

  it("lets Save Draft persist with only a name", () => {
    const draft = emptyGuestTravelAgentCreateDraft();
    assert.match(travelAgentCreateDraftErrorsForSave(draft)[0] ?? "", /name/);
    draft.name = "Blue Nile Travel";
    assert.equal(travelAgentCreateDraftErrorsForSave(draft).length, 0);
    assert.ok(travelAgentCreateDraftErrors(draft).length > 0);
  });

  it("names the missing field and the step that holds it", () => {
    const issues = travelAgentCreateFieldIssues(emptyGuestTravelAgentCreateDraft());
    assert.ok(issues.some((issue) => issue.key === "name" && issue.step === "basic_info"));
    assert.match(
      formatCreateIssuesByStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS),
      /Basic Information — Agency name is required/,
    );
    assert.equal(issuesBeforeStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "basic_info").length, 0);
    assert.ok(
      issuesBeforeStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "commission_rates").some(
        (issue) => issue.key === "name",
      ),
    );
  });

  it("evaluates commission readiness for commissionable and net rate models", () => {
    const draft = filledDraft();
    draft.commercialModel = "commissionable";
    draft.commissionEnabled = true;
    draft.commissionValue = "10";
    assert.equal(travelAgentCommissionReady(draft), true);

    // Net rate model should have commission disabled
    draft.commercialModel = "net_rate";
    assert.equal(travelAgentCommissionReady(draft), false);
  });

  it("restores the held step and draft with legacy step mapping", () => {
    const draft = filledDraft();
    draft.creditLimitAmount = "5000";
    const held = parseGuestTravelAgentCreateHold({ step: "commission_rates", draft });
    assert.equal(held?.step, "commission_rates");
    assert.equal(held?.draft.name, "Blue Nile Travel");

    // Legacy "billing" step maps safely to commission_rates
    const legacyHeld = parseGuestTravelAgentCreateHold({ step: "billing", draft });
    assert.equal(legacyHeld?.step, "commission_rates");

    assert.equal(
      guestTravelAgentCreateHoldKey("rest-1"),
      `${GUEST_TRAVEL_AGENT_CREATE_HOLD_KEY_PREFIX}:rest-1`,
    );
  });
});

describe("Travel agency create honesty", () => {
  it("is a dedicated workspace, not a New Agency modal", () => {
    const workspace = readRel("../components/workspaces/guest-travel-agent-create-workspace.tsx");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const accounts = readRel("../components/guests/guest-account-directory.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(workspace, /travel-agent-create-workspace/);
    assert.match(workspace, /GUEST_TRAVEL_AGENT_CREATE_STEPS/);
    assert.match(workspace, /writeGuestTravelAgentCreateHold/);
    assert.match(workspace, /persistTravelAgentCreate/);
    assert.match(workspace, /Create Travel Agency/);
    assert.match(workspace, /Save as Draft/);
    assert.match(workspace, /nav: "overview"/);
    assert.match(workspace, /travel-agent-create-success/);
    assert.match(workspace, /View Travel Agency/);
    assert.match(workspace, /Add Another Travel Agency/);
    assert.match(workspace, /travelAgentMasterId: created.id/);
    assert.doesNotMatch(workspace, /<Dialog/);
    assert.match(workspace, /onClick=\{\(\) => go\(item\.id\)\}/);
    assert.match(workspace, /issuesBeforeStep/);
    assert.match(workspace, /formatCreateIssuesByStep/);
    assert.match(workspace, /Go to step/);
    assert.match(workspace, /border-destructive/);
    assert.match(shell, /create: "travel-agent"/);
    assert.match(accounts, /create: "travel-agent"/);
    assert.match(shell, /create === "travel-agent"/);
    assert.match(shell, /GuestTravelAgentCreateWorkspace/);
    assert.deepEqual(parseGuestProfileSearch({ create: "travel-agent" }), {
      type: "travel-agent",
      create: "travel-agent",
    });
  });

  it("persists commission only through the existing plan API", () => {
    const workspace = readRel("../components/workspaces/guest-travel-agent-create-workspace.tsx");
    const functions = readRel("./guest-travel-agent-create.functions.ts");
    assert.match(functions, /createGuestAccount/);
    assert.match(functions, /saveTravelAgentContact/);
    assert.match(functions, /preferred_currency/);
    assert.match(functions, /credit_limit_amount/);
    assert.match(functions, /saveTravelAgentCommissionPlan/);
    assert.match(functions, /travelAgentCommissionReady/);
    assert.doesNotMatch(functions, /postFolioEntry/);
    assert.match(workspace, /TA_COMMISSION_REFERENCE_COPY/);
    assert.doesNotMatch(workspace, /Commission settled|Payment posted/);
  });

  it("keeps dual-lane 0099 drafts and does not add agency billing tables", () => {
    const supabase = readRel("../../../../supabase/migrations/0099_pms_account_create_drafts.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0099_pms_account_create_drafts.sql");
    assert.equal(GUEST_TRAVEL_AGENT_CREATE_MIGRATION_FILE, "0099_pms_account_create_drafts.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /travel_agent/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.agency_billing\b/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.company_contacts\b/);
  });
});

describe("Card 4 Settings field requirement control for Travel Agency creation", () => {
  it("resolves rules from pms_guest_fields and pms_guest_profile_types", async () => {
    const fields = [
      { id: "f-1", code: "TA_NAME", name: "Agency Name", required: true, active: true },
      { id: "f-2", code: "TA_TAX_ID", name: "Tax ID / TIN", required: false, active: true },
      { id: "f-3", code: "TA_CONTACT_EMAIL", name: "Contact Email", required: false, active: true },
    ];
    const profileType = {
      id: "pt-tra",
      requiredFieldIds: ["f-2"], // TA_TAX_ID made required in Card 4 profile type
    };

    const { createTravelAgencyFieldRules, isTravelAgencyRuleRequired } = await import(
      "./guest-travel-agent-create-workspace.ts"
    );

    const rules = createTravelAgencyFieldRules(fields, profileType);
    assert.equal(isTravelAgencyRuleRequired(rules, "TA_NAME"), true); // System required
    assert.equal(isTravelAgencyRuleRequired(rules, "TA_TAX_ID"), true); // Card 4 required
    assert.equal(isTravelAgencyRuleRequired(rules, "TA_CONTACT_EMAIL"), false); // Not required
  });

  it("strictly blocks advancing past Step 1 when Step 1 fields are configured required in Card 4", async () => {
    const { createTravelAgencyFieldRules, travelAgentCreateFieldIssues } = await import(
      "./guest-travel-agent-create-workspace.ts"
    );

    const fields = [
      { id: "f-1", code: "TA_NAME", name: "Agency Name", required: true, active: true },
      { id: "f-2", code: "TA_AGENCY_TYPE", name: "Agency Type", required: true, active: true },
      { id: "f-3", code: "TA_TAX_ID", name: "Tax ID / TIN", required: true, active: true },
      { id: "f-4", code: "TA_CITY", name: "City", required: true, active: true },
    ];
    const rules = createTravelAgencyFieldRules(fields, null);

    const draft = emptyGuestTravelAgentCreateDraft();
    draft.name = "Ethiopian Travel";
    draft.agencyType = "local";
    draft.city = ""; // empty city
    // draft.taxId and draft.city are empty!

    const issues = travelAgentCreateFieldIssues(draft, { rules });
    assert.ok(issues.some((i) => i.key === "taxId" && i.step === "basic_info"));
    assert.ok(issues.some((i) => i.key === "city" && i.step === "basic_info"));

    // Moving from basic_info to contacts MUST be blocked!
    const step1Blockers = issuesBeforeStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "contacts");
    assert.ok(step1Blockers.length >= 2);
    assert.ok(step1Blockers.some((b) => b.key === "taxId"));
    assert.ok(step1Blockers.some((b) => b.key === "city"));

    // Now fill the required Step 1 fields
    draft.taxId = "TIN-987654";
    draft.city = "Addis Ababa";

    const updatedIssues = travelAgentCreateFieldIssues(draft, { rules });
    const clearedBlockers = issuesBeforeStep(updatedIssues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "contacts");
    assert.equal(clearedBlockers.length, 0); // Unblocked!
  });

  it("strictly blocks advancing past Step 2 when Step 2 contact fields are configured required in Card 4", async () => {
    const { createTravelAgencyFieldRules, travelAgentCreateFieldIssues } = await import(
      "./guest-travel-agent-create-workspace.ts"
    );

    const fields = [
      { id: "f-1", code: "TA_NAME", name: "Agency Name", required: true, active: true },
      { id: "f-2", code: "TA_AGENCY_TYPE", name: "Agency Type", required: true, active: true },
      { id: "f-3", code: "TA_CONTACT_EMAIL", name: "Contact Email", required: true, active: true },
      { id: "f-4", code: "TA_CONTACT_PHONE", name: "Contact Phone", required: true, active: true },
    ];
    const rules = createTravelAgencyFieldRules(fields, null);

    const draft = emptyGuestTravelAgentCreateDraft();
    draft.name = "Ethiopian Travel";
    draft.agencyType = "local";
    // Step 1 is valid, but Step 2 has an empty contact without email or phone!
    draft.contacts = [{
      key: "c-1",
      id: null,
      name: "Abebe Bikila",
      roleId: null,
      position: "Manager",
      email: "",
      phone: "",
      whatsapp: "",
      isPrimary: true,
      preferredMethod: "",
      notes: "",
    }];

    const issues = travelAgentCreateFieldIssues(draft, { rules });
    assert.ok(issues.some((i) => i.key === "contactEmail" && i.step === "contacts"));
    assert.ok(issues.some((i) => i.key === "contactPhone" && i.step === "contacts"));

    // Moving from contacts to commission_rates (Step 3) MUST be blocked!
    const step2Blockers = issuesBeforeStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "commission_rates");
    assert.ok(step2Blockers.length >= 2);
    assert.ok(step2Blockers.some((b) => b.key === "contactEmail"));
    assert.ok(step2Blockers.some((b) => b.key === "contactPhone"));

    // Now fill the required contact fields
    draft.contacts[0].email = "abebe@agency.com";
    draft.contacts[0].phone = "+251911223344";

    const updatedIssues = travelAgentCreateFieldIssues(draft, { rules });
    const clearedBlockers = issuesBeforeStep(updatedIssues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "commission_rates");
    assert.equal(clearedBlockers.length, 0); // Unblocked!
  });

  it("strictly blocks advancing past Step 3 when Step 3 fields are configured required in Card 4", async () => {
    const { createTravelAgencyFieldRules, travelAgentCreateFieldIssues } = await import(
      "./guest-travel-agent-create-workspace.ts"
    );

    const fields = [
      { id: "f-1", code: "TA_NAME", name: "Agency Name", required: true, active: true },
      { id: "f-2", code: "TA_AGENCY_TYPE", name: "Agency Type", required: true, active: true },
      { id: "f-3", code: "TA_COMMISSION_NOTES", name: "Commission Notes", required: true, active: true },
      { id: "f-4", code: "TA_COMMISSION_EXPIRES_ON", name: "Commission Expiry Date", required: true, active: true },
    ];
    const rules = createTravelAgencyFieldRules(fields, null);

    const draft = emptyGuestTravelAgentCreateDraft();
    draft.name = "Skyline Holidays";
    draft.agencyType = "corporate";
    draft.commissionCurrency = "USD";
    draft.commissionEffectiveOn = "2026-01-01";
    // commissionNotes and commissionExpiresOn are empty!

    const issues = travelAgentCreateFieldIssues(draft, { rules });
    assert.ok(issues.some((i) => i.key === "commissionNotes" && i.step === "commission_rates"));
    assert.ok(issues.some((i) => i.key === "commissionExpiresOn" && i.step === "commission_rates"));

    // Moving from commission_rates to payment_rules (Step 4) MUST be blocked!
    const step3Blockers = issuesBeforeStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "payment_rules");
    assert.ok(step3Blockers.length >= 2);
    assert.ok(step3Blockers.some((b) => b.key === "commissionNotes"));
    assert.ok(step3Blockers.some((b) => b.key === "commissionExpiresOn"));

    // Now fill the required Step 3 fields
    draft.commissionNotes = "Commission contract signed for 2026.";
    draft.commissionExpiresOn = "2026-12-31";

    const updatedIssues = travelAgentCreateFieldIssues(draft, { rules });
    const clearedBlockers = issuesBeforeStep(updatedIssues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "payment_rules");
    assert.equal(clearedBlockers.length, 0); // Unblocked!
  });

  it("strictly blocks advancing past Step 4 or completing registration when Step 4 fields are configured required in Card 4", async () => {
    const { createTravelAgencyFieldRules, travelAgentCreateFieldIssues } = await import(
      "./guest-travel-agent-create-workspace.ts"
    );

    const fields = [
      { id: "f-1", code: "TA_NAME", name: "Agency Name", required: true, active: true },
      { id: "f-2", code: "TA_AGENCY_TYPE", name: "Agency Type", required: true, active: true },
      { id: "f-3", code: "TA_BILLING_INSTRUCTION", name: "Billing Instruction", required: true, active: true },
      { id: "f-4", code: "TA_BOOKING_NOTES", name: "Booking Notes", required: true, active: true },
    ];
    const rules = createTravelAgencyFieldRules(fields, null);

    const draft = emptyGuestTravelAgentCreateDraft();
    draft.name = "Skyline Holidays";
    draft.agencyType = "corporate";
    draft.billingCurrencyCode = "USD";
    draft.defaultBillingRuleId = "rule-1";
    draft.commissionCurrency = "USD";
    draft.commissionEffectiveOn = "2026-01-01";
    // billingInstruction and bookingNotes are empty!

    const issues = travelAgentCreateFieldIssues(draft, { rules });
    assert.ok(issues.some((i) => i.key === "billingInstruction" && i.step === "payment_rules"));
    assert.ok(issues.some((i) => i.key === "bookingNotes" && i.step === "payment_rules"));

    // Moving from payment_rules to review (Step 5) MUST be blocked!
    const step4Blockers = issuesBeforeStep(issues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "review");
    assert.ok(step4Blockers.length >= 2);
    assert.ok(step4Blockers.some((b) => b.key === "billingInstruction"));
    assert.ok(step4Blockers.some((b) => b.key === "bookingNotes"));

    // Now fill the required Step 4 fields
    draft.billingInstruction = "Bill to corporate folio upon presentation of company voucher.";
    draft.bookingNotes = "Check voucher code on arrival.";

    const updatedIssues = travelAgentCreateFieldIssues(draft, { rules });
    const clearedBlockers = issuesBeforeStep(updatedIssues, GUEST_TRAVEL_AGENT_CREATE_STEPS, "review");
    assert.equal(clearedBlockers.length, 0); // Unblocked!
  });

  it("exports TRAVEL_AGENCY_COMMISSION_FIELDS and TRAVEL_AGENCY_PAYMENT_RULES_FIELDS correctly in definitions", async () => {
    const {
      TRAVEL_AGENCY_COMMISSION_FIELDS,
      TRAVEL_AGENCY_PAYMENT_RULES_FIELDS,
      ALL_TRAVEL_AGENCY_CREATION_FIELDS,
    } = await import("./guest-creation-field-definitions.ts");

    assert.ok(TRAVEL_AGENCY_COMMISSION_FIELDS.length >= 10);
    assert.ok(TRAVEL_AGENCY_PAYMENT_RULES_FIELDS.length >= 10);

    const allCodes = new Set(ALL_TRAVEL_AGENCY_CREATION_FIELDS.map((f) => f.code));
    assert.ok(allCodes.has("TA_COMMERCIAL_MODEL"));
    assert.ok(allCodes.has("TA_COMMISSION_CURRENCY"));
    assert.ok(allCodes.has("TA_COMMISSION_NOTES"));
    assert.ok(allCodes.has("TA_BILLING_CURRENCY"));
    assert.ok(allCodes.has("TA_PAYMENT_TIMING"));
    assert.ok(allCodes.has("TA_BILLING_RULE"));
    assert.ok(allCodes.has("TA_BOOKING_NOTES"));
  });

  it("verifies Card 4 Settings UI template includes Commission & Rates and Payment Rules tabs for Travel Agency without Identity Documents", () => {
    const card4File = readRel("../components/settings/pms-card4-profile-types.tsx");
    assert.match(card4File, /TRAVEL_AGENCY_COMMISSION_FIELDS/);
    assert.match(card4File, /TRAVEL_AGENCY_PAYMENT_RULES_FIELDS/);
    assert.match(card4File, /tab-content-commission/);
    assert.match(card4File, /tab-content-payment-rules/);
    assert.match(card4File, /TabsTrigger value="commission"/);
    assert.match(card4File, /TabsTrigger value="payment_rules"/);
    // Ensure Identity Documents is NOT in the Travel Agency tabs branch
    assert.ok(!card4File.includes('<TabsTrigger value="payment_rules">Payment, Credit & Reservation Rules</TabsTrigger>\r\n                <TabsTrigger value="documents">Identity Documents</TabsTrigger>'));
    assert.ok(!card4File.includes('<TabsTrigger value="payment_rules">Payment, Credit & Reservation Rules</TabsTrigger>\n                <TabsTrigger value="documents">Identity Documents</TabsTrigger>'));
  });
});
