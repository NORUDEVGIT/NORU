import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PREFERENCE_OPTION_CATEGORIES } from "./guest-profile-wave2.ts";
import { GUEST_PROFILE_TYPES } from "./guest-profile-wave1.ts";
import {
  DEFAULT_PROFILE_TYPES,
  PROFILE_TYPE_PREFERENCE_TYPES,
  emptyProfileTypeDraft,
  normalizeProfileTypeCode,
  validateProfileTypeDraft,
} from "./profile-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./profile-types-card4.functions.ts", import.meta.url),
  "utf8",
);
const wave1Src = readFileSync(new URL("./guest-profile-wave1.ts", import.meta.url), "utf8");

describe("Card 4 Profile Types catalogue", () => {
  it("seeds six default codes and keeps SET3-plus required field ids", () => {
    assert.deepEqual(
      DEFAULT_PROFILE_TYPES.map((row) => row.code),
      ["IND", "COM", "TRA", "TOU", "ORG", "CON"],
    );
    assert.deepEqual(
      PROFILE_TYPE_PREFERENCE_TYPES.map((row) => row.id),
      [...PREFERENCE_OPTION_CATEGORIES],
    );
  });

  it("rejects duplicate name and code excluding self", () => {
    const existing = [
      { id: "a", name: "Individual Guest", code: "IND" },
      { id: "b", name: "Company", code: "COM" },
    ];
    const clashName = validateProfileTypeDraft(
      { ...emptyProfileTypeDraft(), name: "individual guest", code: "NEW" },
      existing,
    );
    assert.ok(clashName.some((row) => row.field === "name"));
    const clashCode = validateProfileTypeDraft(
      { ...emptyProfileTypeDraft(), name: "Other", code: "ind" },
      existing,
    );
    assert.ok(clashCode.some((row) => row.field === "code"));
    const selfOk = validateProfileTypeDraft(
      { ...emptyProfileTypeDraft(), id: "a", name: "Individual Guest", code: "IND" },
      existing,
    );
    assert.deepEqual(selfOk, []);
    assert.equal(normalizeProfileTypeCode(" ind "), "IND");
  });

  it("does not write operational GUEST_PROFILE_TYPES from Card 4 save", () => {
    assert.doesNotMatch(functionsSrc, /GUEST_PROFILE_TYPES/);
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /seedDefaults/);
    assert.match(functionsSrc, /DEFAULT_PROFILE_TYPES/);
    assert.doesNotMatch(functionsSrc, /guest_profiles/);
    assert.equal(GUEST_PROFILE_TYPES.length, 4);
    assert.doesNotMatch(wave1Src, /savePmsCard4ProfileType/);
  });
});
