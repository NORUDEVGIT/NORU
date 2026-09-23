import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_GROUP_TYPES,
  emptyGroupTypeDraft,
  groupTypesConfigured,
  normalizeGroupTypeCode,
  validateGroupTypeDraft,
} from "./group-types-card4.server.ts";

const functionsSrc = readFileSync(new URL("./group-types-card4.functions.ts", import.meta.url), "utf8");
const loadSrc = readFileSync(new URL("./guest-group-types.ts", import.meta.url), "utf8");
const profileTypesSrc = readFileSync(new URL("./profile-types-card4.server.ts", import.meta.url), "utf8");
const listingSrc = readFileSync(new URL("./guest-profile-listing.ts", import.meta.url), "utf8");
const sectionSrc = readFileSync(
  new URL("../components/settings/pms-property-setup-card4-section.tsx", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-group-types.tsx", import.meta.url),
  "utf8",
);

describe("Card 4 Group Types catalogue", () => {
  it("seeds hospitality defaults and keeps them off Group UI hardcodes", () => {
    assert.deepEqual(
      DEFAULT_GROUP_TYPES.map((row) => row.code),
      ["CORP", "TOUR", "WEDD", "CONF", "CREW", "GOVT", "OTHR"],
    );
    assert.equal(groupTypesConfigured(DEFAULT_GROUP_TYPES), true);
    assert.match(loadSrc, /DEFAULT_GROUP_TYPES/);
    assert.match(loadSrc, /ensureDefaultGroupTypes/);
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /pms_group_types/);
    assert.doesNotMatch(uiSrc, /Corporate|Wedding|Conference/);
    assert.match(uiSrc, /DEFAULT_GROUP_TYPES/);
  });

  it("rejects duplicate name and code excluding self", () => {
    const existing = [
      { id: "a", name: "Corporate", code: "CORP" },
      { id: "b", name: "Tour", code: "TOUR" },
    ];
    const clashName = validateGroupTypeDraft(
      { ...emptyGroupTypeDraft(), name: "corporate", code: "NEW" },
      existing,
    );
    assert.ok(clashName.some((row) => row.field === "name"));
    const clashCode = validateGroupTypeDraft(
      { ...emptyGroupTypeDraft(), name: "Other", code: "corp" },
      existing,
    );
    assert.ok(clashCode.some((row) => row.field === "code"));
    const selfOk = validateGroupTypeDraft(
      { ...emptyGroupTypeDraft(), id: "a", name: "Corporate", code: "CORP", sortOrder: 10 },
      existing,
    );
    assert.deepEqual(selfOk, []);
    assert.equal(normalizeGroupTypeCode(" corp "), "CORP");
  });

  it("wires Group on profile types and Card 4 settings without a second group table", () => {
    assert.match(profileTypesSrc, /code: "GRP"/);
    assert.match(listingSrc, /GRP: "group"/);
    assert.match(sectionSrc, /PmsCard4GroupTypes/);
    assert.match(sectionSrc, /getPmsCard4GroupTypes/);
    assert.doesNotMatch(functionsSrc, /CREATE TABLE/);
    assert.doesNotMatch(functionsSrc, /guest_account_masters/);
  });
});
