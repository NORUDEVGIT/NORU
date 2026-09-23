import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_GROUP_CREATE_HOLD_KEY_PREFIX,
  GUEST_GROUP_CREATE_MIGRATION_FILE,
  GUEST_GROUP_CREATE_START_OVER,
  GUEST_GROUP_CREATE_STEPS,
  GROUP_CREATE_PRICING_UNAVAILABLE,
  emptyGuestGroupCreateDraft,
  estimateGroupCreationCharges,
  guestGroupCreateCompletion,
  guestGroupCreateHoldKey,
  groupCreateDraftErrors,
  groupCreateDraftErrorsForSave,
  groupCreateMemberCounts,
  groupCreateNights,
  groupCreateStepErrors,
  inferGuestGroupCreateStep,
  parseGuestGroupCreateHold,
  stageGroupMemberImport,
} from "./guest-group-create-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function filledDraft() {
  const draft = emptyGuestGroupCreateDraft();
  draft.name = "Europe Heritage Tour";
  draft.groupTypeId = "11111111-1111-4111-8111-111111111111";
  draft.arrivalDate = "2026-09-01";
  draft.departureDate = "2026-09-04";
  draft.expectedPax = "24";
  draft.billingArrangement = "group_master";
  return draft;
}

describe("Group create workflow helpers", () => {
  it("keeps exactly five dedicated steps", () => {
    assert.deepEqual(
      GUEST_GROUP_CREATE_STEPS.map((step) => step.id),
      ["details", "stay", "guests", "billing", "review"],
    );
    assert.equal(GUEST_GROUP_CREATE_STEPS.length, 5);
  });

  it("validates each step independently and preserves later fields", () => {
    const draft = emptyGuestGroupCreateDraft();
    draft.expectedPax = "12";
    draft.arrivalDate = "2026-09-01";
    draft.departureDate = "2026-09-03";
    assert.match(groupCreateStepErrors("details", draft)[0] ?? "", /Group name/);
    assert.equal(groupCreateStepErrors("stay", draft).length, 0);
    draft.name = "Tour";
    draft.groupTypeId = "11111111-1111-4111-8111-111111111111";
    assert.equal(groupCreateStepErrors("details", draft).length, 0);
    assert.equal(draft.expectedPax, "12");
  });

  it("blocks departure before arrival and non-positive pax", () => {
    const draft = filledDraft();
    draft.departureDate = "2026-08-01";
    assert.match(groupCreateStepErrors("stay", draft).join(" "), /after arrival/);
    draft.departureDate = "2026-09-04";
    draft.expectedPax = "0";
    assert.match(groupCreateStepErrors("stay", draft).join(" "), /greater than 0/);
    assert.equal(groupCreateNights("2026-09-01", "2026-09-04"), 3);
  });

  it("does not require registered members to match expected pax", () => {
    const draft = filledDraft();
    assert.equal(groupCreateStepErrors("guests", draft).length, 0);
    const counts = groupCreateMemberCounts(draft);
    assert.equal(counts.expected, 24);
    assert.equal(counts.registered, 0);
    assert.equal(counts.remaining, 24);
  });

  it("prevents duplicate guest membership in the draft", () => {
    const draft = filledDraft();
    draft.members = [
      {
        key: "a",
        guestId: "22222222-2222-4222-8222-222222222222",
        guestName: "Abebe",
        firstName: "Abebe",
        lastName: "",
        email: "",
        phone: "",
        status: "expected",
        roomTypeId: "",
        bedPreference: "",
        specialRequests: "",
      },
      {
        key: "b",
        guestId: "22222222-2222-4222-8222-222222222222",
        guestName: "Abebe",
        firstName: "Abebe",
        lastName: "",
        email: "",
        phone: "",
        status: "expected",
        roomTypeId: "",
        bedPreference: "",
        specialRequests: "",
      },
    ];
    assert.match(groupCreateStepErrors("guests", draft).join(" "), /only be added/);
  });

  it("requires billing arrangement and deposit when enabled", () => {
    const draft = filledDraft();
    draft.billingArrangement = "";
    assert.match(groupCreateStepErrors("billing", draft).join(" "), /Billing arrangement/);
    draft.billingArrangement = "group_master";
    draft.depositRequired = true;
    assert.match(groupCreateStepErrors("billing", draft).join(" "), /deposit/);
    draft.depositAmount = "500";
    assert.equal(groupCreateStepErrors("billing", draft).length, 0);
  });

  it("lets Save Draft persist with only a name", () => {
    const draft = emptyGuestGroupCreateDraft();
    assert.match(groupCreateDraftErrorsForSave(draft)[0] ?? "", /name/);
    draft.name = "Heritage";
    assert.equal(groupCreateDraftErrorsForSave(draft).length, 0);
    assert.ok(groupCreateDraftErrors(draft).length > 0);
  });

  it("restores the held step and draft without wiping later steps", () => {
    const draft = filledDraft();
    draft.members = [
      {
        key: "m1",
        guestId: "33333333-3333-4333-8333-333333333333",
        guestName: "Makeda",
        firstName: "Makeda",
        lastName: "",
        email: "",
        phone: "",
        status: "expected",
        roomTypeId: "",
        bedPreference: "",
        specialRequests: "",
      },
    ];
    const held = parseGuestGroupCreateHold({ step: "billing", draft });
    assert.equal(held?.step, "billing");
    assert.equal(held?.draft.name, "Europe Heritage Tour");
    assert.equal(held?.draft.members[0]?.guestName, "Makeda");
    assert.equal(inferGuestGroupCreateStep(draft), "billing");
    assert.equal(guestGroupCreateHoldKey("rest-1"), `${GUEST_GROUP_CREATE_HOLD_KEY_PREFIX}:rest-1`);
  });

  it("stages CSV members without faking a successful import", () => {
    const result = stageGroupMemberImport(
      "first_name,last_name,email,phone\nAbebe,Bekele,abebe@example.com,0911\n,Missing,x@y.com,0912",
      [],
    );
    assert.equal(result.staged, 1);
    assert.equal(result.members[0]?.firstName, "Abebe");
    assert.ok(result.errors.some((error) => /first name/i.test(error)));
  });

  it("never invents estimated totals", () => {
    const estimate = estimateGroupCreationCharges();
    assert.equal(estimate.available, false);
    assert.equal(estimate.total, null);
    assert.equal(estimate.copy, GROUP_CREATE_PRICING_UNAVAILABLE);
    const empty = guestGroupCreateCompletion(emptyGuestGroupCreateDraft());
    const filled = guestGroupCreateCompletion(filledDraft());
    assert.ok(filled.percent > empty.percent);
  });
});

describe("Group create honesty", () => {
  it("is a dedicated workspace, not a New Group modal", () => {
    const workspace = readRel("../components/workspaces/guest-group-create-workspace.tsx");
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const wave1 = readRel("./guest-profile-wave1.ts");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    assert.match(workspace, /group-create-workspace/);
    assert.match(workspace, /GUEST_GROUP_CREATE_STEPS/);
    assert.match(workspace, /writeGuestGroupCreateHold/);
    assert.match(workspace, /persistGroupCreate/);
    assert.match(workspace, /Complete Registration/);
    assert.match(workspace, /Save as Draft/);
    assert.match(workspace, /nav: "overview"/);
    assert.doesNotMatch(workspace, /<Dialog/);
    assert.match(workspace, /onClick=\{\(\) => go\(item\.id\)\}/);
    assert.doesNotMatch(workspace, /disabled=\{!reachable\}/);
    assert.match(directory, /create: "group"/);
    assert.match(shell, /create === "group"/);
    assert.match(shell, /GuestGroupCreateWorkspace/);
    assert.match(wave1, /"individual" \| "group" \| "company" \| "travel-agent"/);
    assert.match(listing, /create: "group"/);
    assert.equal(GUEST_GROUP_CREATE_START_OVER, "Start Over");
  });

  it("reuses group master, guests, catalogues and does not invent rooms or invoices", () => {
    const workspace = readRel("../components/workspaces/guest-group-create-workspace.tsx");
    const functions = readRel("./guest-group-create.functions.ts");
    assert.match(functions, /saveGroupMaster/);
    assert.match(functions, /addGroupMember/);
    assert.match(functions, /createGroupMemberGuest/);
    assert.match(functions, /pms_group_types|loadGroupTypes/);
    assert.match(functions, /assertListingCreateAllowed/);
    assert.match(functions, /room_types/);
    assert.match(functions, /hotel_rate_plans/);
    assert.match(functions, /pms_source_codes/);
    assert.match(functions, /distribution_channels/);
    assert.match(functions, /pms_payment_methods/);
    assert.match(functions, /group_operations/);
    assert.doesNotMatch(functions, /assignReservationRoom|listAssignableRooms/);
    assert.doesNotMatch(workspace, /Invoice created|Payment posted|Room assigned/);
    assert.match(workspace, /GROUP_CREATE_PRICING_UNAVAILABLE/);
    assert.match(workspace, /GROUP_CREATE_NO_PHYSICAL_ROOMS/);
  });

  it("keeps dual-lane 0097 drafts off guest_account_masters until persist", () => {
    const supabase = readRel("../../../../supabase/migrations/0097_pms_group_create_drafts.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0097_pms_group_create_drafts.sql");
    assert.equal(GUEST_GROUP_CREATE_MIGRATION_FILE, "0097_pms_group_create_drafts.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_group_create_drafts/);
    assert.match(supabase, /group_operations/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.pms_groups\b/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });
});
