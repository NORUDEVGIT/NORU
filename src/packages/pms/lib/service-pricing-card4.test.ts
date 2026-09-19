import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  SERVICE_PRICING_UNITS,
  emptyServicePricingDraft,
  formatServicePricingAmount,
  normalizeServicePricingAmount,
  selectablePricingServiceTypes,
  servicePricingConfigured,
  validateServicePricingDraft,
  type ServicePricingRecord,
} from "./service-pricing-card4.server.ts";
import type { ServiceTypeRecord } from "./service-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./service-pricing-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-service-pricing.tsx", import.meta.url),
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

const serviceType: ServiceTypeRecord = {
  id: "00000000-0000-4000-8000-000000000901",
  categoryId: "00000000-0000-4000-8000-000000000701",
  name: "Extra Towels",
  code: "HK_TOWELS",
  description: null,
  active: true,
  displayOrder: 1,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

const price: ServicePricingRecord = {
  id: "00000000-0000-4000-8000-000000001001",
  serviceTypeId: serviceType.id,
  amount: "25.00",
  currencyCode: "ETB",
  pricingUnit: "per_service",
  active: true,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("Card 4 Guest Service Types pricing", () => {
  it("uses the approved units and decimal normalization without formatted storage", () => {
    assert.deepEqual(SERVICE_PRICING_UNITS, [
      "per_service",
      "per_person",
      "per_room",
      "per_night",
      "per_item",
    ]);
    assert.equal(normalizeServicePricingAmount("25"), "25.00");
    assert.equal(normalizeServicePricingAmount("25.5"), "25.50");
    assert.equal(normalizeServicePricingAmount("-1"), null);
    assert.equal(normalizeServicePricingAmount("1.234"), null);
    assert.match(formatServicePricingAmount("25.00", "ETB"), /ETB/);
  });

  it("requires a valid service type, amount, and unique one-price relationship", () => {
    const emptyErrors = validateServicePricingDraft(emptyServicePricingDraft(), [], [serviceType]);
    assert.equal(
      emptyErrors.some((row) => row.field === "serviceTypeId"),
      true,
    );
    assert.equal(
      emptyErrors.some((row) => row.field === "amount"),
      true,
    );

    const duplicateErrors = validateServicePricingDraft(
      {
        ...emptyServicePricingDraft(serviceType.id),
        amount: "25.00",
      },
      [price],
      [serviceType],
    );
    assert.equal(
      duplicateErrors.some(
        (row) => row.message === "This service type already has pricing configured.",
      ),
      true,
    );
  });

  it("keeps an inactive assigned type editable but excludes it from new pricing", () => {
    const inactiveType = { ...serviceType, active: false };
    assert.equal(selectablePricingServiceTypes([inactiveType]).length, 0);
    assert.equal(selectablePricingServiceTypes([inactiveType], inactiveType.id).length, 1);
    const editErrors = validateServicePricingDraft(
      {
        id: price.id,
        serviceTypeId: inactiveType.id,
        amount: "25.00",
        pricingUnit: "per_service",
        active: true,
      },
      [price],
      [inactiveType],
    );
    assert.equal(
      editErrors.some((row) => row.field === "serviceTypeId"),
      false,
    );
  });

  it("is configured only with active pricing on an active service type", () => {
    assert.equal(servicePricingConfigured([price], [serviceType]), true);
    assert.equal(servicePricingConfigured([{ ...price, active: false }], [serviceType]), false);
    assert.equal(servicePricingConfigured([price], [{ ...serviceType, active: false }]), false);
  });

  it("inherits property currency and stays isolated from SET5 and operations", () => {
    assert.match(functionsSrc, /restaurants.*currency_code|currency_code/s);
    assert.match(functionsSrc, /pms_guest_service_pricing/);
    assert.doesNotMatch(functionsSrc, /pms_guest_request_types/);
    assert.match(uiSrc, /data-testid="card4-service-pricing"/);
    assert.match(uiSrc, /Property currency/);
    assert.match(set5Src, /pms_guest_request_types/);
    assert.doesNotMatch(set5Src, /pms_guest_service_pricing/);
    assert.doesNotMatch(opsSrc, /pms_guest_service_pricing/);
  });
});
