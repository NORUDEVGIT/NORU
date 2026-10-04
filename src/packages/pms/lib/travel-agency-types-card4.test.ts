import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_TRAVEL_AGENCY_TYPES,
  emptyTravelAgencyTypeDraft,
  normalizeTravelAgencyTypeCode,
  travelAgencyTypesConfigured,
  validateTravelAgencyTypeDraft,
} from "./travel-agency-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./travel-agency-types-card4.functions.ts", import.meta.url),
  "utf8",
);
const loadSrc = readFileSync(
  new URL("./guest-travel-agency-types.ts", import.meta.url),
  "utf8",
);
const profileTypesSrc = readFileSync(
  new URL("./profile-types-card4.server.ts", import.meta.url),
  "utf8",
);
const listingSrc = readFileSync(
  new URL("./guest-profile-listing.ts", import.meta.url),
  "utf8",
);
const sectionSrc = readFileSync(
  new URL("../components/settings/pms-property-setup-card4-section.tsx", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-travel-agency-types.tsx", import.meta.url),
  "utf8",
);

describe("Card 4 Travel Agency Types catalogue", () => {
  it("seeds hospitality defaults and keeps them dynamic off hardcodes", () => {
    assert.deepEqual(
      DEFAULT_TRAVEL_AGENCY_TYPES.map((row) => row.code),
      [
        "OTA",
        "TRAD",
        "CORP",
        "LEIS",
        "BIZ",
        "TOUR",
        "WHSL",
        "TMC",
        "DMC",
        "INBD",
        "OTBD",
        "DOM",
        "CONS",
        "IND",
        "GOVT",
        "SPEC",
        "OTHR",
      ],
    );
    assert.equal(travelAgencyTypesConfigured(DEFAULT_TRAVEL_AGENCY_TYPES), true);
    assert.match(loadSrc, /DEFAULT_TRAVEL_AGENCY_TYPES/);
    assert.match(loadSrc, /ensureDefaultTravelAgencyTypes/);
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /pms_travel_agency_types/);
    assert.doesNotMatch(uiSrc, /Online Travel Agency|Tour Operator|Consortium/);
    assert.match(uiSrc, /DEFAULT_TRAVEL_AGENCY_TYPES/);
  });

  it("rejects duplicate name and code excluding self", () => {
    const existing = [
      { id: "a", name: "Online Travel Agency (OTA)", code: "OTA" },
      { id: "b", name: "Corporate Travel Agency", code: "CORP_TA" },
    ];
    const clashName = validateTravelAgencyTypeDraft(
      { ...emptyTravelAgencyTypeDraft(), name: "online travel agency (ota)", code: "NEW" },
      existing,
    );
    assert.ok(clashName.some((row) => row.field === "name"));
    const clashCode = validateTravelAgencyTypeDraft(
      { ...emptyTravelAgencyTypeDraft(), name: "Other Agency", code: "ota" },
      existing,
    );
    assert.ok(clashCode.some((row) => row.field === "code"));
    const selfOk = validateTravelAgencyTypeDraft(
      {
        ...emptyTravelAgencyTypeDraft(),
        id: "a",
        name: "Online Travel Agency (OTA)",
        code: "OTA",
        sortOrder: 10,
      },
      existing,
    );
    assert.deepEqual(selfOk, []);
    assert.equal(normalizeTravelAgencyTypeCode(" ota "), "OTA");
  });

  it("wires Travel Agency on profile types and Card 4 settings", () => {
    assert.match(profileTypesSrc, /code: "TRA"/);
    assert.match(listingSrc, /TRA: "travel-agent"/);
    assert.match(sectionSrc, /PmsCard4TravelAgencyTypes/);
    assert.match(sectionSrc, /getPmsCard4TravelAgencyTypes/);
    assert.match(sectionSrc, /travel-agency-types/);
  });
});
