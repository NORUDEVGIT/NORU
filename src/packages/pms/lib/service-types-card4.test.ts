import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_SERVICE_TYPES,
  emptyServiceTypeDraft,
  selectableServiceCategories,
  serviceTypesConfigured,
  validateServiceTypeDraft,
} from "./service-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./service-types-card4.functions.ts", import.meta.url),
  "utf8",
);
const categoryFunctionsSrc = readFileSync(
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
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-service-types.tsx", import.meta.url),
  "utf8",
);

const hk = {
  id: "00000000-0000-4000-8000-000000000701",
  name: "Housekeeping",
  code: "HK",
  description: null,
  active: true,
  displayOrder: 1,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};
const towels = {
  id: "00000000-0000-4000-8000-000000000801",
  categoryId: hk.id,
  name: "Extra Towels",
  code: "HK_TOWELS",
  description: null,
  active: true,
  displayOrder: 1,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("Card 4 Guest Service Types types", () => {
  it("seeds types under the seven category codes", () => {
    assert.deepEqual(
      [...new Set(DEFAULT_SERVICE_TYPES.map((row) => row.categoryCode))],
      ["HK", "DIN", "TRN", "WEL", "FO", "MNT", "CON"],
    );
    assert.equal(
      DEFAULT_SERVICE_TYPES.every((row) => /^[A-Z][A-Z0-9_]{1,19}$/.test(row.code)),
      true,
    );
  });

  it("is configured when an active type belongs to an active category", () => {
    assert.equal(serviceTypesConfigured([hk], [towels]), true);
    assert.equal(serviceTypesConfigured([{ ...hk, active: false }], [towels]), false);
    assert.equal(serviceTypesConfigured([hk], [{ ...towels, active: false }]), false);
    assert.equal(serviceTypesConfigured([hk], []), false);
  });

  it("rejects empty name/code, duplicate codes, and inactive categories for new types", () => {
    const empty = validateServiceTypeDraft(emptyServiceTypeDraft(), [], [hk]);
    assert.equal(
      empty.some((row) => row.field === "categoryId"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "name"),
      true,
    );
    const duplicate = validateServiceTypeDraft(
      {
        ...emptyServiceTypeDraft(hk.id, 2),
        name: "Room Cleaning",
        code: "HK_TOWELS",
      },
      [towels],
      [hk],
    );
    assert.equal(
      duplicate.some((row) => row.message === "This service type code is already in use."),
      true,
    );
    const inactive = validateServiceTypeDraft(
      { ...emptyServiceTypeDraft("inactive", 1), name: "Spa", code: "WEL_SPA" },
      [],
      [{ id: "inactive", name: "Wellness", active: false }],
    );
    assert.equal(
      inactive.some((row) =>
        row.message.includes("Only active categories can be used for new service types."),
      ),
      true,
    );
    const keepInactive = validateServiceTypeDraft(
      {
        id: towels.id,
        categoryId: hk.id,
        name: "Extra Towels",
        code: "HK_TOWELS",
        description: "",
        active: true,
        displayOrder: 1,
      },
      [towels],
      [{ ...hk, active: false }],
    );
    assert.equal(
      keepInactive.some((row) => row.field === "categoryId"),
      false,
    );
  });

  it("keeps inactive categories selectable only for the current type", () => {
    const inactive = { ...hk, active: false };
    assert.equal(selectableServiceCategories([inactive]).length, 0);
    assert.equal(selectableServiceCategories([inactive], hk.id).length, 1);
  });

  it("does not write SET5 request types or operational guest-services", () => {
    assert.match(functionsSrc, /pms_guest_service_types/);
    assert.match(functionsSrc, /category_id/);
    assert.match(functionsSrc, /pms_guest_service_pricing/);
    assert.match(functionsSrc, /pricing is configured/);
    assert.match(functionsSrc, /pms_guest_service_department_assignments/);
    assert.match(functionsSrc, /department is assigned/);
    assert.match(functionsSrc, /pms_guest_service_sla_rules/);
    assert.match(functionsSrc, /SLA rule is configured/);
    assert.match(functionsSrc, /pms_guest_service_availability/);
    assert.match(functionsSrc, /availability is configured/);
    assert.doesNotMatch(functionsSrc, /pms_guest_request_types/);
    assert.match(categoryFunctionsSrc, /contains service types/);
    assert.match(set5Src, /pms_guest_request_types/);
    assert.doesNotMatch(set5Src, /pms_guest_service_types/);
    assert.doesNotMatch(opsSrc, /pms_guest_service_types/);
    assert.match(opsSrc, /PmsPlaceholder/);
    assert.match(uiSrc, /data-testid="card4-service-types"/);
    assert.match(uiSrc, /Unable to load service types/);
  });
});
