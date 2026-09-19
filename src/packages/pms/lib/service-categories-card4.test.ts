import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_SERVICE_CATEGORIES,
  emptyServiceCategoryDraft,
  serviceCategoriesConfigured,
  validateServiceCategoryDraft,
} from "./service-categories-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./service-categories-card4.functions.ts", import.meta.url),
  "utf8",
);
const set5Src = readFileSync(
  new URL("./pms-set5-depts-guestsvc.functions.ts", import.meta.url),
  "utf8",
);
const opsSrc = readFileSync(
  new URL("../../../routes/restaurant/pms/guest-services.tsx", import.meta.url),
  "utf8",
);

describe("Card 4 Guest Service Types categories", () => {
  it("seeds seven setup categories and treats any list as configured", () => {
    assert.deepEqual(
      DEFAULT_SERVICE_CATEGORIES.map((row) => row.code),
      ["HK", "DIN", "TRN", "WEL", "FO", "MNT", "CON"],
    );
    assert.equal(
      serviceCategoriesConfigured([
        {
          id: "00000000-0000-4000-8000-000000000601",
          name: "Housekeeping",
          code: "HK",
          description: null,
          active: true,
          displayOrder: 1,
          createdAt: "2026-09-19T00:00:00.000Z",
          updatedAt: "2026-09-19T00:00:00.000Z",
        },
      ]),
      true,
    );
    assert.equal(serviceCategoriesConfigured([]), false);
  });

  it("rejects empty name/code and duplicate codes", () => {
    const existing = [{ id: "a", name: "Housekeeping", code: "HK" }];
    const empty = validateServiceCategoryDraft(emptyServiceCategoryDraft(), existing);
    assert.equal(
      empty.some((row) => row.field === "name"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "code"),
      true,
    );
    const duplicate = validateServiceCategoryDraft(
      { ...emptyServiceCategoryDraft(), name: "Housekeeping Extra", code: "HK", displayOrder: 2 },
      existing,
    );
    assert.equal(
      duplicate.some((row) => row.message === "This category code is already in use."),
      true,
    );
  });

  it("does not write SET5 request types or operational guest-services", () => {
    assert.match(functionsSrc, /pms_guest_service_categories/);
    assert.doesNotMatch(functionsSrc, /pms_guest_request_types/);
    assert.match(set5Src, /pms_guest_request_types/);
    assert.doesNotMatch(set5Src, /pms_guest_service_categories/);
    assert.doesNotMatch(opsSrc, /pms_guest_service_categories/);
    assert.match(opsSrc, /PmsPlaceholder/);
  });
});
