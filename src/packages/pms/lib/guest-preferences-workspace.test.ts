import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PREFERENCE_VALUE_TYPES,
  validatePreferenceTypeDraft,
  emptyPreferenceTypeDraft,
} from "./preferences-card4.server.ts";
import {
  PREFERENCES_WORKSPACE_MIGRATION_FILE,
  contactDefaultChips,
  normalizePreferenceAnswers,
  preferenceNeedsOptions,
  reservationDefaultsFromWorkspace,
  validatePreferenceAnswer,
} from "./guest-preferences-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest preference workspace helpers", () => {
  it("extends Card 4 value types without requiring options for text/yes_no", () => {
    assert.deepEqual([...PREFERENCE_VALUE_TYPES], ["single", "multi", "yes_no", "text", "number"]);
    assert.equal(preferenceNeedsOptions("single"), true);
    assert.equal(preferenceNeedsOptions("text"), false);
    const textDraft = {
      ...emptyPreferenceTypeDraft("cat"),
      name: "Notes",
      code: "NOTES",
      valueType: "text" as const,
    };
    assert.equal(
      validatePreferenceTypeDraft(textDraft, [], ["cat"]).some((error) => error.field === "options"),
      false,
    );
  });

  it("validates required, multi, and yes/no answers", () => {
    const type = {
      name: "Bed Type",
      valueType: "single" as const,
      required: true,
      active: true,
      options: [{ id: "1", label: "King", value: "king", active: true, displayOrder: 0 }],
    };
    assert.equal(validatePreferenceAnswer(type, []), "Bed Type is required.");
    assert.equal(validatePreferenceAnswer(type, ["king"]), null);
    assert.deepEqual(normalizePreferenceAnswers("multi", ["a", "a", "b"]), ["a", "b"]);
    assert.deepEqual(normalizePreferenceAnswers("yes_no", ["true"]), ["yes"]);
  });

  it("does not apply reservation defaults unless the guest flag is on", () => {
    const rooms = [{ id: "rt-1", code: "DLX", label: "Deluxe" }];
    assert.deepEqual(
      reservationDefaultsFromWorkspace({
        applyToFutureReservations: false,
        answers: [{ code: "ROOM_TYPE", valueType: "single", values: ["rt-1"] }],
        specialRequests: "High floor",
        roomTypes: rooms,
      }),
      { specialRequests: null, roomTypeId: null },
    );
    const on = reservationDefaultsFromWorkspace({
      applyToFutureReservations: true,
      answers: [
        { code: "ROOM_TYPE", valueType: "single", values: ["rt-1"] },
        { code: "NOTES", valueType: "text", values: ["Quiet please"] },
      ],
      specialRequests: "High floor",
      roomTypes: rooms,
    });
    assert.equal(on.roomTypeId, "rt-1");
    assert.match(on.specialRequests ?? "", /Quiet please/);
  });

  it("keeps contact defaults off the catalogue chips source", () => {
    const chips = contactDefaultChips({
      language: "English",
      preferredContactMethod: "email",
      preferredContactTime: "morning",
    });
    assert.equal(chips.every((chip) => chip.source === "contact"), true);
    assert.equal(chips.some((chip) => chip.code === "PROFILE_LANGUAGE"), true);
  });
});

describe("Guest preference workspace lock", () => {
  it("extends the existing Card 4 / guest_preference_values architecture", () => {
    const supabaseSql = readRel(`../../../../supabase/migrations/${PREFERENCES_WORKSPACE_MIGRATION_FILE}`);
    const drizzleSql = readRel(`../../../../drizzle/migrations/${PREFERENCES_WORKSPACE_MIGRATION_FILE}`);
    for (const sql of [supabaseSql, drizzleSql]) {
      assert.match(sql, /yes_no', 'text', 'number/);
      assert.match(sql, /apply_to_future_reservations/);
      assert.match(sql, /Front office update guest preferences/);
      assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.guest_pref/);
    }
    assert.equal(supabaseSql, drizzleSql);
  });

  it("saves catalogue values and profile contact defaults separately", () => {
    const functions = readRel("./guests.functions.ts");
    const card = readRel("../components/guests/guest-preferences-card.tsx");
    const booking = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(functions, /export const listGuestPreferenceWorkspace/);
    assert.match(functions, /export const saveGuestPreferenceWorkspace/);
    assert.match(functions, /from\("guest_preference_values"\)/);
    assert.match(functions, /preferred_contact_method/);
    assert.match(functions, /getGuestReservationPreferenceDefaults/);
    assert.doesNotMatch(functions, /PROFILE_LANGUAGE.*guest_preference_values/);
    assert.match(card, /CONTACT_DEFAULTS_TITLE/);
    assert.match(card, /Save Preferences/);
    assert.match(card, /Apply to Future Reservations/);
    assert.doesNotMatch(card, /Recent Activity/);
    assert.doesNotMatch(card, /CATALOGUE_FIELDS/);
    assert.match(booking, /applyPreferenceDefaults/);
    assert.match(booking, /getGuestReservationPreferenceDefaults/);
  });
});
