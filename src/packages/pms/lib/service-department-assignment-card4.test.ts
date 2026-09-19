import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyServiceDepartmentAssignmentDraft,
  selectableAssignmentDepartments,
  selectableAssignmentServiceTypes,
  serviceDepartmentAssignmentsConfigured,
  validateServiceDepartmentAssignmentDraft,
  type AssignmentDepartment,
  type ServiceDepartmentAssignmentRecord,
} from "./service-department-assignment-card4.server.ts";
import type { ServiceTypeRecord } from "./service-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./service-department-assignment-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-service-department-assignment.tsx", import.meta.url),
  "utf8",
);
const set5Src = readFileSync(
  new URL("./pms-set5-depts-guestsvc.functions.ts", import.meta.url),
  "utf8",
);
const card5Src = readFileSync(new URL("./departments-card5.functions.ts", import.meta.url), "utf8");
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

const department: AssignmentDepartment = {
  id: "00000000-0000-4000-8000-000000000601",
  code: "HK",
  name: "Housekeeping",
  active: true,
};

const assignment: ServiceDepartmentAssignmentRecord = {
  id: "00000000-0000-4000-8000-000000001101",
  serviceTypeId: serviceType.id,
  departmentId: department.id,
  active: true,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("Card 4 Guest Service Types department assignment", () => {
  it("requires a valid service type and department and blocks the same pair", () => {
    const emptyErrors = validateServiceDepartmentAssignmentDraft(
      emptyServiceDepartmentAssignmentDraft(),
      [],
      [serviceType],
      [department],
    );
    assert.equal(
      emptyErrors.some((row) => row.field === "serviceTypeId"),
      true,
    );
    assert.equal(
      emptyErrors.some((row) => row.field === "departmentId"),
      true,
    );

    const duplicateErrors = validateServiceDepartmentAssignmentDraft(
      emptyServiceDepartmentAssignmentDraft(serviceType.id, department.id),
      [assignment],
      [serviceType],
      [department],
    );
    assert.equal(
      duplicateErrors.some(
        (row) => row.message === "This service type is already assigned to this department.",
      ),
      true,
    );

    const secondDepartment: AssignmentDepartment = {
      id: "00000000-0000-4000-8000-000000000602",
      code: "FO",
      name: "Front Office",
      active: true,
    };
    const extra = validateServiceDepartmentAssignmentDraft(
      emptyServiceDepartmentAssignmentDraft(serviceType.id, secondDepartment.id),
      [assignment],
      [serviceType],
      [department, secondDepartment],
    );
    assert.equal(extra.length, 0);
  });

  it("keeps inactive current rows editable but excludes them from new assignments", () => {
    const inactiveType = { ...serviceType, active: false };
    const inactiveDept = { ...department, active: false };
    assert.equal(selectableAssignmentServiceTypes([inactiveType]).length, 0);
    assert.equal(selectableAssignmentServiceTypes([inactiveType], inactiveType.id).length, 1);
    assert.equal(selectableAssignmentDepartments([inactiveDept]).length, 0);
    assert.equal(selectableAssignmentDepartments([inactiveDept], inactiveDept.id).length, 1);
    const editErrors = validateServiceDepartmentAssignmentDraft(
      {
        id: assignment.id,
        serviceTypeId: inactiveType.id,
        departmentId: inactiveDept.id,
        active: true,
      },
      [assignment],
      [inactiveType],
      [inactiveDept],
    );
    assert.equal(editErrors.length, 0);
  });

  it("is configured only with an active assignment on an active type and department", () => {
    assert.equal(
      serviceDepartmentAssignmentsConfigured([assignment], [serviceType], [department]),
      true,
    );
    assert.equal(
      serviceDepartmentAssignmentsConfigured(
        [{ ...assignment, active: false }],
        [serviceType],
        [department],
      ),
      false,
    );
    assert.equal(
      serviceDepartmentAssignmentsConfigured(
        [assignment],
        [{ ...serviceType, active: false }],
        [department],
      ),
      false,
    );
    assert.equal(
      serviceDepartmentAssignmentsConfigured(
        [assignment],
        [serviceType],
        [{ ...department, active: false }],
      ),
      false,
    );
  });

  it("reuses pms_departments and stays isolated from SET5 request types and operations", () => {
    assert.match(functionsSrc, /pms_guest_service_department_assignments/);
    assert.match(functionsSrc, /pms_departments/);
    assert.doesNotMatch(functionsSrc, /pms_guest_request_types/);
    assert.doesNotMatch(functionsSrc, /pms_department_routing_rules/);
    assert.doesNotMatch(functionsSrc, /from\("pms_departments"\)\.insert/);
    assert.match(uiSrc, /data-testid="card4-department-assignment"/);
    assert.match(set5Src, /pms_guest_request_types/);
    assert.doesNotMatch(set5Src, /pms_guest_service_department_assignments/);
    assert.doesNotMatch(card5Src, /pms_guest_service_department_assignments/);
    assert.doesNotMatch(opsSrc, /pms_guest_service_department_assignments/);
  });
});
