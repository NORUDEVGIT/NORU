/**
 * Card 4 Guest Service Types — Service Pricing.
 *
 * One property-currency price belongs to one configured service type.
 * Operational charges, taxes, departments, SLAs and availability stay separate.
 */

import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

export const SERVICE_PRICING_UNITS = [
  "per_service",
  "per_person",
  "per_room",
  "per_night",
  "per_item",
] as const;

export type ServicePricingUnit = (typeof SERVICE_PRICING_UNITS)[number];

export const SERVICE_PRICING_UNIT_LABELS: Record<ServicePricingUnit, string> = {
  per_service: "Per Service",
  per_person: "Per Person",
  per_room: "Per Room",
  per_night: "Per Night",
  per_item: "Per Item",
};

export type ServicePricingRecord = {
  id: string;
  serviceTypeId: string;
  amount: string;
  currencyCode: string;
  pricingUnit: ServicePricingUnit;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServicePricingDraft = {
  id: string | null;
  serviceTypeId: string;
  amount: string;
  pricingUnit: ServicePricingUnit;
  active: boolean;
};

export type ServicePricingSnapshot = {
  currencyCode: string;
  categories: ServiceCategoryRecord[];
  serviceTypes: ServiceTypeRecord[];
  pricing: ServicePricingRecord[];
  lastUpdatedAt: string | null;
};

export type ServicePricingError = { field: string; message: string };

export function emptyServicePricingDraft(
  serviceTypeId = "",
  pricingUnit: ServicePricingUnit = "per_service",
): ServicePricingDraft {
  return {
    id: null,
    serviceTypeId,
    amount: "",
    pricingUnit,
    active: true,
  };
}

export function normalizeServicePricingAmount(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, decimal = ""] = trimmed.split(".");
  return `${whole}.${decimal.padEnd(2, "0")}`;
}

export function formatServicePricingAmount(amount: string, currencyCode: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currencyCode} 0.00`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

export function servicePricingConfigured(
  pricing: readonly ServicePricingRecord[],
  serviceTypes: readonly ServiceTypeRecord[],
): boolean {
  return pricing.some(
    (row) =>
      row.active &&
      serviceTypes.some(
        (serviceType) => serviceType.id === row.serviceTypeId && serviceType.active,
      ),
  );
}

export function selectablePricingServiceTypes(
  serviceTypes: readonly ServiceTypeRecord[],
  currentServiceTypeId?: string | null,
): ServiceTypeRecord[] {
  return serviceTypes.filter((row) => row.active || row.id === currentServiceTypeId);
}

export function validateServicePricingDraft(
  draft: ServicePricingDraft,
  existing: readonly Pick<ServicePricingRecord, "id" | "serviceTypeId">[],
  serviceTypes: readonly Pick<ServiceTypeRecord, "id" | "active">[],
): ServicePricingError[] {
  const errors: ServicePricingError[] = [];
  const serviceType = serviceTypes.find((row) => row.id === draft.serviceTypeId);
  const current = existing.find((row) => row.id === draft.id);

  if (!draft.serviceTypeId || !serviceType) {
    errors.push({ field: "serviceTypeId", message: "Please select a valid service type." });
  } else if (!serviceType.active && current?.serviceTypeId !== draft.serviceTypeId) {
    errors.push({
      field: "serviceTypeId",
      message: "Only active service types can receive new pricing.",
    });
  }

  if (!draft.amount.trim()) {
    errors.push({ field: "amount", message: "Amount is required." });
  } else if (normalizeServicePricingAmount(draft.amount) === null) {
    errors.push({
      field: "amount",
      message: "Enter a non-negative amount with no more than 2 decimal places.",
    });
  }

  if (!SERVICE_PRICING_UNITS.includes(draft.pricingUnit)) {
    errors.push({ field: "pricingUnit", message: "Please select a valid pricing unit." });
  }

  if (existing.some((row) => row.id !== draft.id && row.serviceTypeId === draft.serviceTypeId)) {
    errors.push({
      field: "serviceTypeId",
      message: "This service type already has pricing configured.",
    });
  }

  return errors;
}
