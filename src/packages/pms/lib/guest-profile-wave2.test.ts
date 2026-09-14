import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { GUEST_PROFILE_CARDS } from "./guest-profile-wave1.ts";
import {
  PREFERENCE_OPTION_CATEGORIES,
  STAFF_VERIFY_COPY,
  encodePreferenceValue,
  maskIdNumber,
  resolvePreferenceSelection,
} from "./guest-profile-wave2.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest Profile Wave 2 mask and preference encoding", () => {
  it("masks ordinary ID numbers to last four", () => {
    assert.equal(maskIdNumber(null), null);
    assert.equal(maskIdNumber(""), null);
    assert.equal(maskIdNumber("AB12"), "••••");
    assert.equal(maskIdNumber("AB123456"), "•••• 3456");
  });

  it("encodes Setup ids and Other without inventing a second prefs store", () => {
    assert.equal(encodePreferenceValue({ kind: "empty" }), null);
    assert.equal(encodePreferenceValue({ kind: "id", id: "opt-1" }), "id:opt-1");
    assert.equal(
      encodePreferenceValue({ kind: "other", otherText: "foam topper" }),
      "other:foam topper",
    );
    const options = [
      { id: "bed-king", label: "King" },
      { id: "bed-twin", label: "Twin" },
    ];
    assert.deepEqual(resolvePreferenceSelection("id:bed-king", options), {
      kind: "id",
      id: "bed-king",
    });
    assert.deepEqual(resolvePreferenceSelection("King", options), { kind: "id", id: "bed-king" });
    assert.deepEqual(resolvePreferenceSelection("memory foam", options), {
      kind: "other",
      otherText: "memory foam",
    });
    assert.deepEqual(resolvePreferenceSelection("other:near lift", options), {
      kind: "other",
      otherText: "near lift",
    });
  });
});

describe("Guest Profile Wave 2 lock", () => {
  it("activates Identity and Preferences cards and keeps Wave 5 Coming", () => {
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("identity")?.live, true);
    assert.equal(byId.get("preferences")?.live, true);
    assert.equal(byId.get("stay-history")?.live, true);
    assert.equal(byId.get("dashboard")?.live, true);
    assert.equal(byId.get("loyalty")?.live, true);
    assert.equal(byId.get("relationships")?.live, true);
    assert.equal(byId.get("notes-comms")?.live, false);
    assert.equal(byId.get("admin-privacy")?.live, false);
    assert.match(byId.get("admin-privacy")?.copy ?? "", /Coming in Wave 5/);
  });

  it("reuses saveGuestPreferences and guest_preferences with no second prefs table", () => {
    const functions = readRel("./guests.functions.ts");
    const prefsCard = readRel("../components/guests/guest-preferences-card.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    assert.match(functions, /export const saveGuestPreferences/);
    assert.match(functions, /from\("guest_preferences"\)/);
    assert.doesNotMatch(functions, /guest_preferences_wave|guest_pref_v2/);
    assert.match(prefsCard, /saveGuestPreferences/);
    assert.match(prefsCard, /guest-wave2-accessibility/);
    assert.match(prefsCard, /guest-wave2-special/);
    assert.match(prefsCard, /Open Property Setup/);
    assert.match(detail, /GuestPreferencesCard/);
    assert.match(detail, /guest-detail-preferences-panel/);
    assert.doesNotMatch(detail, /guest-preferences-tab-demoted/);
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(shell, /onSectionChange/);
    assert.match(shell, /section=\{detailSection\}/);
    assert.doesNotMatch(prefsCard, /pms_meal_plans/);
  });

  it("ships identity upload/mask/verify without government KYC copy", () => {
    const functions = readRel("./guests.functions.ts");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    assert.match(functions, /createGuestDocumentUpload/);
    assert.match(functions, /registerGuestDocument/);
    assert.match(functions, /listGuestDocuments/);
    assert.match(functions, /reviewGuestDocument/);
    assert.match(functions, /\/guests\/\$\{data\.guestId\}\//);
    assert.match(identity, /Staff verify/);
    assert.match(identity, /STAFF_VERIFY_COPY/);
    assert.doesNotMatch(identity, /government verified|KYC|police-cleared/i);
    assert.match(directory, /MaskedIdNumber/);
    assert.match(detail, /MaskedIdNumber/);
    assert.doesNotMatch(directory, /government verified/i);
  });

  it("keeps Wave 1 duplicate warn and requires explicit merge confirm", () => {
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const functions = readRel("./guests.functions.ts");
    const merge = readRel("../components/guests/guest-merge-dialog.tsx");
    assert.match(form, /Open existing guest/);
    assert.match(form, /Create anyway/);
    assert.match(form, /Nothing is merged\s+automatically/);
    assert.match(functions, /export const mergeGuests/);
    assert.match(functions, /merged_into_guest_id/);
    assert.match(functions, /hotel_reservations/);
    assert.match(merge, /guest-merge-confirm/);
    assert.match(merge, /Cancel leaves both profiles unchanged/);
    assert.doesNotMatch(functions, /hard delete|DELETE FROM guest_profiles/i);
  });

  it("records consent separately from SET3 defaults and Setup-owned options", () => {
    const functions = readRel("./guests.functions.ts");
    const consent = readRel("../components/guests/guest-consent-panel.tsx");
    const setup = readRel("../components/settings/pms-preference-options-editor.tsx");
    const migration = readRel("../../../../supabase/migrations/0051_pms_guest_profile_wave2.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0051_pms_guest_profile_wave2.sql");
    assert.match(functions, /export const saveGuestConsent/);
    assert.match(functions, /consent_updated/);
    assert.match(consent, /not recorded consent/);
    assert.match(setup, /Meal plans are not food preferences/);
    assert.deepEqual([...PREFERENCE_OPTION_CATEGORIES], ["bed", "view", "food", "communication"]);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public.guest_documents/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public.pms_preference_options/);
    assert.match(migration, /APPLY HELD/);
    assert.match(drizzle, /CREATE TABLE IF NOT EXISTS public.guest_documents/);
    assert.match(functions, /WAVE2_MIGRATION_UNAVAILABLE/);
  });
});
