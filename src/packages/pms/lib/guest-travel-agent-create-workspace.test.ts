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
