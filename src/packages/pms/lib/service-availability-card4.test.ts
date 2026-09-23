import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyServiceAvailabilityDraft,
  emptyWeeklySchedule,
  formatAvailabilitySummary,
  normalizeWeeklySchedule,
  parseClockTime,
  parseWeeklySchedule,
  selectableAvailabilityServiceTypes,
  serviceAvailabilityConfigured,
  validateServiceAvailabilityDraft,
  type ServiceAvailabilityRecord,
} from "./service-availability-card4.server.ts";
import type { ServiceTypeRecord } from "./service-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./service-availability-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-service-availability.tsx", import.meta.url),
  "utf8",
);
const serviceType: ServiceTypeRecord = {
  id: "00000000-0000-4000-8000-000000000901",
  categoryId: "00000000-0000-4000-8000-000000000701",
  name: "Room Service",
  code: "ROOM_SERVICE",
  description: null,
  active: true,
  displayOrder: 1,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};
const schedule = {
  ...emptyWeeklySchedule(),
  mon: [
    { start: "14:00", end: "22:00" },
    { start: "08:00", end: "12:00" },
  ],
};
const availability: ServiceAvailabilityRecord = {
  id: "00000000-0000-4000-8000-000000001301",
  serviceTypeId: serviceType.id,
  weeklySchedule: normalizeWeeklySchedule(schedule),
  active: true,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("Card 4 Guest Service Types service availability", () => {
  it("uses canonical property-local clock values and deterministic window ordering", () => {
    assert.equal(parseClockTime("08:00"), "08:00");
    assert.equal(parseClockTime("8:00"), null);
    assert.equal(parseClockTime("24:00"), null);
    assert.deepEqual(normalizeWeeklySchedule(schedule).mon, [
      { start: "08:00", end: "12:00" },
      { start: "14:00", end: "22:00" },
    ]);
    assert.deepEqual(parseWeeklySchedule({ mon: [{ start: "08:00", end: "12:00" }] }).mon, [
      { start: "08:00", end: "12:00" },
    ]);
  });

  it("requires a service type and at least one valid window", () => {
    const errors = validateServiceAvailabilityDraft(
      emptyServiceAvailabilityDraft(),
      [],
      [serviceType],
    );
    assert.equal(
      errors.some((row) => row.field === "serviceTypeId"),
      true,
    );
    assert.equal(
      errors.some((row) => row.field === "weeklySchedule"),
      true,
    );
  });

  it("rejects invalid, duplicate, overlapping, and reversed windows", () => {
    const invalid = {
      ...emptyWeeklySchedule(),
      mon: [
        { start: "10:00", end: "09:00" },
        { start: "10:00", end: "11:00" },
      ],
      tue: [
        { start: "08:00", end: "12:00" },
        { start: "11:00", end: "13:00" },
      ],
      wed: [
        { start: "08:00", end: "12:00" },
        { start: "08:00", end: "12:00" },
      ],
      thu: [{ start: "bad", end: "17:00" }],
    };
    const errors = validateServiceAvailabilityDraft(
      {
        ...emptyServiceAvailabilityDraft(serviceType.id),
        weeklySchedule: invalid,
      },
      [],
      [serviceType],
    );
    assert.equal(
      errors.some((row) => /before end/.test(row.message)),
      true,
    );
    assert.equal(
      errors.some((row) => /overlap/.test(row.message)),
      true,
    );
    assert.equal(
      errors.some((row) => /duplicate/.test(row.message)),
      true,
    );
    assert.equal(
      errors.some((row) => /invalid time/.test(row.message)),
      true,
    );
  });

  it("prevents duplicate configurations and preserves an inactive current type", () => {
    const duplicate = validateServiceAvailabilityDraft(
      {
        ...emptyServiceAvailabilityDraft(serviceType.id),
        weeklySchedule: availability.weeklySchedule,
      },
      [availability],
      [serviceType],
    );
    assert.equal(
      duplicate.some((row) => /already has availability/.test(row.message)),
      true,
    );
    const inactive = { ...serviceType, active: false };
    assert.equal(selectableAvailabilityServiceTypes([inactive]).length, 0);
    assert.equal(selectableAvailabilityServiceTypes([inactive], inactive.id).length, 1);
  });

  it("marks readiness only for active schedules on active service types", () => {
    assert.equal(serviceAvailabilityConfigured([availability], [serviceType]), true);
    assert.equal(
      serviceAvailabilityConfigured([{ ...availability, active: false }], [serviceType]),
      false,
    );
    assert.equal(
      serviceAvailabilityConfigured([availability], [{ ...serviceType, active: false }]),
      false,
    );
    assert.equal(formatAvailabilitySummary(availability.weeklySchedule), "Mon · 2 windows");
  });

  it("keeps availability tenant-scoped and isolated from other service concerns", () => {
    assert.match(functionsSrc, /requireRoomManager/);
    assert.match(functionsSrc, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functionsSrc, /pms_guest_service_availability/);
    assert.doesNotMatch(functionsSrc, /pms_guest_service_pricing/);
    assert.doesNotMatch(functionsSrc, /pms_guest_service_sla_rules/);
    assert.doesNotMatch(functionsSrc, /pms_guest_service_department_assignments/);
    assert.match(uiSrc, /data-testid="card4-service-availability"/);
    assert.match(uiSrc, /type="time"/);
    assert.match(uiSrc, /Add Window/);
  });
});
