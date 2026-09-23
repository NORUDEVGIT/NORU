/**
 * Card 4 Guest Service Types — Service Availability.
 *
 * Weekly windows are property-local HH:mm clock values. Pricing, department
 * routing, SLA targets, notifications, and operational requests stay separate.
 */

import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

export const SERVICE_AVAILABILITY_DAYS = [
  { id: "mon", label: "Monday", shortLabel: "Mon" },
  { id: "tue", label: "Tuesday", shortLabel: "Tue" },
  { id: "wed", label: "Wednesday", shortLabel: "Wed" },
  { id: "thu", label: "Thursday", shortLabel: "Thu" },
  { id: "fri", label: "Friday", shortLabel: "Fri" },
  { id: "sat", label: "Saturday", shortLabel: "Sat" },
  { id: "sun", label: "Sunday", shortLabel: "Sun" },
] as const;

export type ServiceAvailabilityDay = (typeof SERVICE_AVAILABILITY_DAYS)[number]["id"];
export type ServiceAvailabilityWindow = { start: string; end: string };
export type ServiceWeeklySchedule = Record<ServiceAvailabilityDay, ServiceAvailabilityWindow[]>;

export type ServiceAvailabilityRecord = {
  id: string;
  serviceTypeId: string;
  weeklySchedule: ServiceWeeklySchedule;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServiceAvailabilityDraft = {
  id: string | null;
  serviceTypeId: string;
  weeklySchedule: ServiceWeeklySchedule;
  active: boolean;
};

export type ServiceAvailabilitySnapshot = {
  categories: ServiceCategoryRecord[];
  serviceTypes: ServiceTypeRecord[];
  availability: ServiceAvailabilityRecord[];
  timezone: string;
  lastUpdatedAt: string | null;
};

export type ServiceAvailabilityError = { field: string; message: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function emptyWeeklySchedule(): ServiceWeeklySchedule {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
}

export function emptyServiceAvailabilityDraft(serviceTypeId = ""): ServiceAvailabilityDraft {
  return {
    id: null,
    serviceTypeId,
    weeklySchedule: emptyWeeklySchedule(),
    active: true,
  };
}

export function parseClockTime(value: unknown): string | null {
  const time = String(value ?? "").trim();
  return TIME.test(time) ? time : null;
}

export function parseWeeklySchedule(value: unknown): ServiceWeeklySchedule {
  const schedule = emptyWeeklySchedule();
  if (!value || typeof value !== "object" || Array.isArray(value)) return schedule;
  const input = value as Record<string, unknown>;
  for (const day of SERVICE_AVAILABILITY_DAYS) {
    const windows = Array.isArray(input[day.id]) ? input[day.id] : [];
    schedule[day.id] = windows.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      return [
        {
          start: String(row.start ?? "").trim(),
          end: String(row.end ?? "").trim(),
        },
      ];
    });
  }
  return schedule;
}

export function normalizeWeeklySchedule(value: ServiceWeeklySchedule): ServiceWeeklySchedule {
  const schedule = emptyWeeklySchedule();
  for (const day of SERVICE_AVAILABILITY_DAYS) {
    schedule[day.id] = [...value[day.id]]
      .map((window) => ({
        start: String(window.start).trim(),
        end: String(window.end).trim(),
      }))
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  }
  return schedule;
}

export function scheduleWindowCount(schedule: ServiceWeeklySchedule): number {
  return SERVICE_AVAILABILITY_DAYS.reduce((count, day) => count + schedule[day.id].length, 0);
}

export function formatAvailabilitySummary(schedule: ServiceWeeklySchedule): string {
  const activeDays = SERVICE_AVAILABILITY_DAYS.filter((day) => schedule[day.id].length > 0);
  if (activeDays.length === 0) return "No schedule";
  if (
    activeDays.length === 7 &&
    activeDays.every(
      (day) =>
        schedule[day.id].length === 1 &&
        schedule[day.id][0]?.start === "00:00" &&
        schedule[day.id][0]?.end === "23:59",
    )
  ) {
    return "Daily · All day";
  }
  const dayNames = activeDays.map((day) => day.shortLabel).join(", ");
  const windows = scheduleWindowCount(schedule);
  return `${dayNames} · ${windows} ${windows === 1 ? "window" : "windows"}`;
}

export function serviceAvailabilityConfigured(
  availability: readonly ServiceAvailabilityRecord[],
  serviceTypes: readonly ServiceTypeRecord[],
): boolean {
  return availability.some(
    (row) =>
      row.active &&
      scheduleWindowCount(row.weeklySchedule) > 0 &&
      serviceTypes.some(
        (serviceType) => serviceType.id === row.serviceTypeId && serviceType.active,
      ),
  );
}

export function selectableAvailabilityServiceTypes(
  serviceTypes: readonly ServiceTypeRecord[],
  currentServiceTypeId?: string | null,
): ServiceTypeRecord[] {
  return serviceTypes.filter((row) => row.active || row.id === currentServiceTypeId);
}

export function validateServiceAvailabilityDraft(
  draft: ServiceAvailabilityDraft,
  existing: readonly Pick<ServiceAvailabilityRecord, "id" | "serviceTypeId">[],
  serviceTypes: readonly Pick<ServiceTypeRecord, "id" | "active">[],
): ServiceAvailabilityError[] {
  const errors: ServiceAvailabilityError[] = [];
  const serviceType = serviceTypes.find((row) => row.id === draft.serviceTypeId);
  const current = existing.find((row) => row.id === draft.id);

  if (!draft.serviceTypeId || !serviceType) {
    errors.push({ field: "serviceTypeId", message: "Please select a valid service type." });
  } else if (!serviceType.active && current?.serviceTypeId !== draft.serviceTypeId) {
    errors.push({
      field: "serviceTypeId",
      message: "Only active service types can receive new availability.",
    });
  }
  if (existing.some((row) => row.id !== draft.id && row.serviceTypeId === draft.serviceTypeId)) {
    errors.push({
      field: "serviceTypeId",
      message: "This service type already has availability configured.",
    });
  }

  if (scheduleWindowCount(draft.weeklySchedule) === 0) {
    errors.push({
      field: "weeklySchedule",
      message: "Select at least one day and add a valid time window.",
    });
  }

  for (const day of SERVICE_AVAILABILITY_DAYS) {
    const sorted = [...draft.weeklySchedule[day.id]].sort((a, b) => a.start.localeCompare(b.start));
    const seen = new Set<string>();
    for (let index = 0; index < sorted.length; index += 1) {
      const window = sorted[index];
      if (!window || !parseClockTime(window.start) || !parseClockTime(window.end)) {
        errors.push({
          field: day.id,
          message: `${day.label} has an invalid time.`,
        });
        continue;
      }
      if (window.start >= window.end) {
        errors.push({
          field: day.id,
          message: `${day.label} start time must be before end time.`,
        });
      }
      const key = `${window.start}-${window.end}`;
      if (seen.has(key)) {
        errors.push({
          field: day.id,
          message: `${day.label} contains a duplicate time window.`,
        });
      }
      seen.add(key);
      const previous = sorted[index - 1];
      if (previous && window.start < previous.end) {
        errors.push({
          field: day.id,
          message: `${day.label} time windows cannot overlap.`,
        });
      }
    }
  }

  return errors;
}
