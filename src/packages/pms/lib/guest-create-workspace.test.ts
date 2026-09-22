import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_CREATE_HOLD_KEY_PREFIX,
  GUEST_CREATE_MIGRATION_FILE,
  GUEST_CREATE_START_OVER,
  GUEST_CREATE_STEPS,
  applyCreateDefaults,
  card4CreateGaps,
  createFieldRules,
  emptyGuestCreateDraft,
  guestCreateCompletion,
  guestCreateHoldKey,
  guestCreateStepErrors,
  guestDisplayName,
  inferGuestCreateStep,
  parseGuestCreateHold,
} from "./guest-create-workspace.ts";
import type { GuestFieldRecord } from "./required-fields-card4.server.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function field(partial: Partial<GuestFieldRecord> & { code: string; required: boolean }): GuestFieldRecord {
  return {
    id: partial.id ?? "00000000-0000-4000-8000-000000000001",
    name: partial.name ?? partial.code,
    code: partial.code,
    fieldType: "text",
    description: null,
    options: [],
    required: partial.required,
    checkIn: false,
    reservation: false,
    active: partial.active ?? true,
    displayOrder: 1,
    lookupSource: null,
    documentTypeIds: [],
    minValue: null,
    maxValue: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Guest create workflow helpers", () => {
  it("keeps exactly six steps and does not treat contact or address as steps", () => {
    assert.deepEqual(
      GUEST_CREATE_STEPS.map((step) => step.id),
      ["basic", "identity", "preferences", "business", "additional", "review"],
    );
    assert.equal(GUEST_CREATE_STEPS.length, 6);
  });

  it("applies profile defaults only when the user has not typed", () => {
    const draft = emptyGuestCreateDraft();
    const next = applyCreateDefaults(draft, { countryId: "ET", languageId: "am", currencyId: null, communicationChannelId: "email", guestTypeId: null }, new Set());
    assert.equal(next.country, "ET");
    assert.equal(next.language, "am");
    const touched = applyCreateDefaults({ ...draft, country: "KE" }, { countryId: "ET", languageId: "am", currencyId: null, communicationChannelId: null, guestTypeId: null }, new Set(["country"]));
    assert.equal(touched.country, "KE");
  });

  it("keeps First Name visible even when the Card 4 row is inactive", () => {
    const rules = createFieldRules(
      [field({ code: "FIRST_NAME", required: false, active: false, name: "First Name" })],
      null,
    );
    const firstName = rules.find((rule) => rule.code === "FIRST_NAME");
    assert.equal(firstName?.visible, true);
    assert.equal(firstName?.required, true);
  });

  it("computes Card 4 required gaps from real field flags", () => {
    const rules = createFieldRules(
      [field({ code: "FIRST_NAME", required: true }), field({ code: "PHONE", required: true }), field({ code: "COMPANY", required: true })],
      null,
    );
    const draft = emptyGuestCreateDraft();
    draft.firstName = "Abebe";
    const gaps = card4CreateGaps(draft, rules);
    assert.equal(gaps.some((gap) => gap.code === "PHONE"), true);
    assert.equal(gaps.some((gap) => gap.code === "COMPANY"), true);
    assert.equal(gaps.some((gap) => gap.code === "FIRST_NAME"), false);
  });

  it("does not hardcode completion at 30 percent", () => {
    const rules = createFieldRules([field({ code: "FIRST_NAME", required: true })], null);
    const empty = guestCreateCompletion(emptyGuestCreateDraft(), rules);
    assert.notEqual(empty.percent, 30);
    const filled = emptyGuestCreateDraft();
    filled.firstName = "Abebe";
    const next = guestCreateCompletion(filled, rules);
    assert.ok(next.percent > empty.percent);
    assert.equal(guestDisplayName(filled), "Abebe");
  });

  it("restores the held step and draft without requiring a refresh wipe", () => {
    const draft = emptyGuestCreateDraft();
    draft.firstName = "Abebe";
    draft.links = [{ key: "c1:employer", masterId: "c1", masterName: "Noru Hotels", role: "employer" }];
    const held = parseGuestCreateHold({ step: "business", draft });
    assert.equal(held?.step, "business");
    assert.equal(held?.draft.firstName, "Abebe");
    assert.equal(held?.draft.links[0]?.masterName, "Noru Hotels");
    const legacy = parseGuestCreateHold(draft);
    assert.equal(legacy?.draft.firstName, "Abebe");
    assert.equal(inferGuestCreateStep(draft), "business");
    assert.equal(guestCreateHoldKey("rest-1"), `${GUEST_CREATE_HOLD_KEY_PREFIX}:rest-1`);
  });

  it("blocks review when required preferences are unanswered", () => {
    const errors = guestCreateStepErrors("preferences", emptyGuestCreateDraft(), {
      rules: [],
      set3: null,
      requiredPreferenceTypeIds: ["00000000-0000-4000-8000-000000000099"],
      dataProcessingRequired: false,
    });
    assert.ok(errors.length > 0);
  });
});

describe("Guest create honesty", () => {
  it("reuses canonical guest APIs and Card 4 catalogues", () => {
    const workspace = readRel("../components/workspaces/guest-create-workspace.tsx");
    const functions = readRel("./guest-create.functions.ts");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const reservation = readRel("../components/bookings/create-reservation-guest.tsx");
    const dialog = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(workspace, /findGuestDuplicates/);
    assert.match(workspace, /createGuest/);
    assert.match(workspace, /saveGuestDocument/);
    assert.match(workspace, /saveGuestPreferenceWorkspace/);
    assert.match(workspace, /linkGuestAccount/);
    assert.match(workspace, /saveGuestConsent/);
    assert.match(workspace, /GuestFormStagedLinks/);
    assert.match(workspace, /writeGuestCreateHold/);
    assert.match(workspace, /readGuestCreateHold/);
    assert.match(workspace, /GUEST_CREATE_START_OVER/);
    assert.match(workspace, /guest-create-start-over/);
    assert.doesNotMatch(workspace, /Discard unsaved changes/);
    assert.equal(GUEST_CREATE_START_OVER, "Start Over");
    assert.match(functions, /pms_guest_fields/);
    assert.match(functions, /pms_guest_profile_types/);
    assert.match(functions, /pms_guest_preference_types/);
    assert.match(functions, /pms_guest_id_types/);
    assert.match(listing, /create: "individual"/);
    assert.match(reservation, /GuestFormDialog/);
    assert.match(dialog, /createGuest/);
    assert.doesNotMatch(workspace, /Airport Pickup|Laundry|Wake-up Call/);
  });

  it("keeps dual-lane 0093 drafts off guest_profiles", () => {
    const supabase = readRel("../../../../supabase/migrations/0093_pms_guest_create_drafts.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0093_pms_guest_create_drafts.sql");
    assert.equal(GUEST_CREATE_MIGRATION_FILE, "0093_pms_guest_create_drafts.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_guest_create_drafts/);
    assert.doesNotMatch(supabase, /CREATE TABLE.*guest_profiles/i);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });
});
