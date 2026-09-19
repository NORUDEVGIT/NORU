/**
 * Card 4 Guest Service Types — Department Assignment.
 *
 * One assignment row links a configured service type to an existing PMS department.
 * The same service type may have multiple departments via additional rows.
 * SLA, availability, SET5 request types, and Card 5 routing stay separate.
 */

import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

export type AssignmentDepartment = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type ServiceDepartmentAssignmentRecord = {
  id: string;
  serviceTypeId: string;
  departmentId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServiceDepartmentAssignmentDraft = {
  id: string | null;
  serviceTypeId: string;
  departmentId: string;
  active: boolean;
};

export type ServiceDepartmentAssignmentSnapshot = {
  categories: ServiceCategoryRecord[];
  serviceTypes: ServiceTypeRecord[];
  departments: AssignmentDepartment[];
  assignments: ServiceDepartmentAssignmentRecord[];
  lastUpdatedAt: string | null;
};

export type ServiceDepartmentAssignmentError = { field: string; message: string };

export function emptyServiceDepartmentAssignmentDraft(
  serviceTypeId = "",
  departmentId = "",
): ServiceDepartmentAssignmentDraft {
  return {
    id: null,
    serviceTypeId,
    departmentId,
    active: true,
  };
}

export function serviceDepartmentAssignmentsConfigured(
  assignments: readonly ServiceDepartmentAssignmentRecord[],
  serviceTypes: readonly ServiceTypeRecord[],
  departments: readonly AssignmentDepartment[],
): boolean {
  return assignments.some(
    (row) =>
      row.active &&
      serviceTypes.some(
        (serviceType) => serviceType.id === row.serviceTypeId && serviceType.active,
      ) &&
      departments.some((department) => department.id === row.departmentId && department.active),
  );
}

export function selectableAssignmentServiceTypes(
  serviceTypes: readonly ServiceTypeRecord[],
  currentServiceTypeId?: string | null,
): ServiceTypeRecord[] {
  return serviceTypes.filter((row) => row.active || row.id === currentServiceTypeId);
}

export function selectableAssignmentDepartments(
  departments: readonly AssignmentDepartment[],
  currentDepartmentId?: string | null,
): AssignmentDepartment[] {
  return departments.filter((row) => row.active || row.id === currentDepartmentId);
}

export function validateServiceDepartmentAssignmentDraft(
  draft: ServiceDepartmentAssignmentDraft,
  existing: readonly Pick<
    ServiceDepartmentAssignmentRecord,
    "id" | "serviceTypeId" | "departmentId"
  >[],
  serviceTypes: readonly Pick<ServiceTypeRecord, "id" | "active">[],
  departments: readonly Pick<AssignmentDepartment, "id" | "active">[],
): ServiceDepartmentAssignmentError[] {
  const errors: ServiceDepartmentAssignmentError[] = [];
  const serviceType = serviceTypes.find((row) => row.id === draft.serviceTypeId);
  const department = departments.find((row) => row.id === draft.departmentId);
  const current = existing.find((row) => row.id === draft.id);

  if (!draft.serviceTypeId || !serviceType) {
    errors.push({ field: "serviceTypeId", message: "Please select a valid service type." });
  } else if (!serviceType.active && current?.serviceTypeId !== draft.serviceTypeId) {
    errors.push({
      field: "serviceTypeId",
      message: "Only active service types can receive new department assignments.",
    });
  }

  if (!draft.departmentId || !department) {
    errors.push({ field: "departmentId", message: "Please select a valid department." });
  } else if (!department.active && current?.departmentId !== draft.departmentId) {
    errors.push({
      field: "departmentId",
      message: "Only active departments can receive new assignments.",
    });
  }

  if (
    existing.some(
      (row) =>
        row.id !== draft.id &&
        row.serviceTypeId === draft.serviceTypeId &&
        row.departmentId === draft.departmentId,
    )
  ) {
    errors.push({
      field: "departmentId",
      message: "This service type is already assigned to this department.",
    });
  }

  return errors;
}
