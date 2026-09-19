/**
 * Card 4 Guest Service Types — SLA Rules.
 *
 * One response/resolution target belongs to one configured service type.
 * Durations are positive integer minutes. Availability and escalation stay separate.
 */

import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

export type ServiceSlaRuleRecord = {
  id: string;
  serviceTypeId: string;
  responseMinutes: number;
  resolutionMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServiceSlaRuleDraft = {
  id: string | null;
  serviceTypeId: string;
  responseMinutes: string;
  resolutionMinutes: string;
  active: boolean;
};

export type ServiceSlaRuleSnapshot = {
  categories: ServiceCategoryRecord[];
  serviceTypes: ServiceTypeRecord[];
  rules: ServiceSlaRuleRecord[];
  lastUpdatedAt: string | null;
};

export type ServiceSlaRuleError = { field: string; message: string };

export function emptyServiceSlaRuleDraft(serviceTypeId = ""): ServiceSlaRuleDraft {
  return {
    id: null,
    serviceTypeId,
    responseMinutes: "",
    resolutionMinutes: "",
    active: true,
  };
}

export function parsePositiveMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return Number.isSafeInteger(minutes) && minutes >= 1 ? minutes : null;
}

export function formatDurationMinutes(minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes < 1) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? `${hours} ${hours === 1 ? "hr" : "hrs"}`
    : `${hours} ${hours === 1 ? "hr" : "hrs"} ${remainder} min`;
}

export function serviceSlaRulesConfigured(
  rules: readonly ServiceSlaRuleRecord[],
  serviceTypes: readonly ServiceTypeRecord[],
): boolean {
  return rules.some(
    (row) =>
      row.active &&
      serviceTypes.some(
        (serviceType) => serviceType.id === row.serviceTypeId && serviceType.active,
      ),
  );
}

export function selectableSlaServiceTypes(
  serviceTypes: readonly ServiceTypeRecord[],
  currentServiceTypeId?: string | null,
): ServiceTypeRecord[] {
  return serviceTypes.filter((row) => row.active || row.id === currentServiceTypeId);
}

export function validateServiceSlaRuleDraft(
  draft: ServiceSlaRuleDraft,
  existing: readonly Pick<ServiceSlaRuleRecord, "id" | "serviceTypeId">[],
  serviceTypes: readonly Pick<ServiceTypeRecord, "id" | "active">[],
): ServiceSlaRuleError[] {
  const errors: ServiceSlaRuleError[] = [];
  const serviceType = serviceTypes.find((row) => row.id === draft.serviceTypeId);
  const current = existing.find((row) => row.id === draft.id);

  if (!draft.serviceTypeId || !serviceType) {
    errors.push({ field: "serviceTypeId", message: "Please select a valid service type." });
  } else if (!serviceType.active && current?.serviceTypeId !== draft.serviceTypeId) {
    errors.push({
      field: "serviceTypeId",
      message: "Only active service types can receive new SLA rules.",
    });
  }

  if (!draft.responseMinutes.trim()) {
    errors.push({ field: "responseMinutes", message: "Response time is required." });
  } else if (parsePositiveMinutes(draft.responseMinutes) === null) {
    errors.push({
      field: "responseMinutes",
      message: "Enter response time as a positive whole number of minutes.",
    });
  }

  if (!draft.resolutionMinutes.trim()) {
    errors.push({ field: "resolutionMinutes", message: "Resolution time is required." });
  } else if (parsePositiveMinutes(draft.resolutionMinutes) === null) {
    errors.push({
      field: "resolutionMinutes",
      message: "Enter resolution time as a positive whole number of minutes.",
    });
  }

  if (existing.some((row) => row.id !== draft.id && row.serviceTypeId === draft.serviceTypeId)) {
    errors.push({
      field: "serviceTypeId",
      message: "This service type already has an SLA rule.",
    });
  }

  return errors;
}
