/**
 * Card 7 Phase 1 — Security & Roles (pure helpers).
 * Setup/configuration only. Live authz remains restaurant_users.role / STAFF_ROLES.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD7_SECURITY_AUDIT = "pms_card7_hotel_role_updated";
export const CARD7_MAPPING_AUDIT = "pms_card7_role_permissions_updated";
export const CARD7_APPROVAL_AUDIT = "pms_card7_approval_rule_updated";
export const CARD7_ASSIGNMENT_AUDIT = "pms_card7_membership_hotel_role_updated";
export const CARD7_SECURITY_AUDIT_SECTION = "card7-security-roles";
export const CARD7_SECURITY_UNAVAILABLE =
  "Security & Roles are unavailable until migration 0084 is applied.";
export const CARD7_LIVE_AUTHZ_COPY =
  "Live access still uses the staff role (STAFF_ROLES). Hotel roles are setup configuration only.";
export const CARD7_EMPTY_CATALOGUE_COPY =
  "No permission catalogue rows. Product seed is required. This property cannot add custom permission keys.";

export const CARD7_DATA_SCOPES = ["property", "department", "own", "assigned"] as const;
export type Card7DataScope = (typeof CARD7_DATA_SCOPES)[number];

export const CARD7_DATA_SCOPE_LABELS: Record<Card7DataScope, string> = {
  property: "Property",
  department: "Department",
  own: "Own records",
  assigned: "Assigned records",
};

export const CARD7_THRESHOLD_UNITS = ["amount", "percent"] as const;
export type Card7ThresholdUnit = (typeof CARD7_THRESHOLD_UNITS)[number];

export const CARD7_PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "cancel",
  "approve",
  "post",
  "refund",
  "export",
  "print",
  "configure",
  "activate",
  "override",
  "authorize",
] as const;
export type Card7PermissionAction = (typeof CARD7_PERMISSION_ACTIONS)[number];

export type Card7HotelRole = {
  id: string;
  code: string;
  name: string;
  description: string;
  departmentId: string | null;
  active: boolean;
};

export type Card7Permission = {
  id: string;
  code: string;
  module: string;
  functionKey: string;
  action: Card7PermissionAction;
  name: string;
  description: string;
  sensitive: boolean;
  active: boolean;
};

export type Card7RolePermission = {
  id: string;
  roleId: string;
  permissionId: string;
  allowed: boolean;
  dataScope: Card7DataScope;
};

export type Card7ApprovalRule = {
  id: string;
  permissionId: string;
  approverRoleId: string;
  thresholdAmount: number | null;
  thresholdUnit: Card7ThresholdUnit | null;
  active: boolean;
};

export type Card7DepartmentOption = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export type Card7Membership = {
  membershipId: string;
  userId: string;
  name: string;
  staffRole: string;
  hotelRoleId: string | null;
  active: boolean;
};

export type Card7SecuritySnapshot = {
  roles: Card7HotelRole[];
  permissions: Card7Permission[];
  mappings: Card7RolePermission[];
  approvalRules: Card7ApprovalRule[];
  departments: Card7DepartmentOption[];
  memberships: Card7Membership[];
};

export type Card7SecurityReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export function parseDataScope(value: unknown): Card7DataScope {
  return (CARD7_DATA_SCOPES as readonly string[]).includes(String(value))
    ? (value as Card7DataScope)
    : "property";
}

export function parseThresholdUnit(value: unknown): Card7ThresholdUnit | null {
  return (CARD7_THRESHOLD_UNITS as readonly string[]).includes(String(value))
    ? (value as Card7ThresholdUnit)
    : null;
}

export function parsePermissionAction(value: unknown): Card7PermissionAction {
  return (CARD7_PERMISSION_ACTIONS as readonly string[]).includes(String(value))
    ? (value as Card7PermissionAction)
    : "view";
}

export function emptyHotelRoleDraft(partial?: Partial<Card7HotelRole>): Card7HotelRole {
  return {
    id: partial?.id ?? "",
    code: partial?.code ?? "",
    name: partial?.name ?? "",
    description: partial?.description ?? "",
    departmentId: partial?.departmentId ?? null,
    active: partial?.active !== false,
  };
}

export function emptyApprovalRuleDraft(partial?: Partial<Card7ApprovalRule>): Card7ApprovalRule {
  return {
    id: partial?.id ?? "",
    permissionId: partial?.permissionId ?? "",
    approverRoleId: partial?.approverRoleId ?? "",
    thresholdAmount: partial?.thresholdAmount ?? null,
    thresholdUnit: partial?.thresholdUnit ?? null,
    active: partial?.active !== false,
  };
}

export function emptySecuritySnapshot(): Card7SecuritySnapshot {
  return {
    roles: [],
    permissions: [],
    mappings: [],
    approvalRules: [],
    departments: [],
    memberships: [],
  };
}

export type Card7PermissionGroup = {
  module: string;
  functions: Array<{ functionKey: string; permissions: Card7Permission[] }>;
};

export function groupPermissionsByModule(permissions: Card7Permission[]): Card7PermissionGroup[] {
  const modules = new Map<string, Map<string, Card7Permission[]>>();
  const ordered = [...permissions].sort((a, b) =>
    `${a.module}.${a.functionKey}.${a.action}`.localeCompare(`${b.module}.${b.functionKey}.${b.action}`),
  );
  for (const row of ordered) {
    const functions = modules.get(row.module) ?? new Map<string, Card7Permission[]>();
    const list = functions.get(row.functionKey) ?? [];
    list.push(row);
    functions.set(row.functionKey, list);
    modules.set(row.module, functions);
  }
  return [...modules.entries()].map(([module, functions]) => ({
    module,
    functions: [...functions.entries()].map(([functionKey, rows]) => ({
      functionKey,
      permissions: rows,
    })),
  }));
}

export function mappingFor(
  snapshot: Card7SecuritySnapshot,
  roleId: string,
  permissionId: string,
): Card7RolePermission | null {
  return (
    snapshot.mappings.find((row) => row.roleId === roleId && row.permissionId === permissionId) ??
    null
  );
}

export function evaluateCard7SecurityReadiness(
  snapshot: Card7SecuritySnapshot,
): Card7SecurityReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [CARD7_LIVE_AUTHZ_COPY];
  const departmentIds = new Set(snapshot.departments.map((row) => row.id));
  const roleIds = new Set(snapshot.roles.map((row) => row.id));
  const permissionById = new Map(snapshot.permissions.map((row) => [row.id, row]));
  const activePermissions = snapshot.permissions.filter((row) => row.active);
  const activeRoles = snapshot.roles.filter((row) => row.active);

  const codes = new Map<string, number>();
  for (const row of snapshot.roles) {
    const code = row.code.trim().toUpperCase();
    if (code) codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  for (const [code, count] of codes) {
    if (count > 1) blockers.push(`Hotel role code ${code} is used more than once.`);
  }

  if (activeRoles.length === 0) blockers.push("Add at least one active hotel role.");
  if (activePermissions.length === 0) {
    blockers.push(
      "Permission catalogue is empty. Mappings cannot be completed until the product catalogue is seeded.",
    );
  }

  for (const role of activeRoles) {
    if (!role.code.trim() || !role.name.trim()) {
      blockers.push(`${role.name || role.code || "A hotel role"} needs a name and code.`);
    }
    if (role.departmentId && !departmentIds.has(role.departmentId)) {
      blockers.push(`${role.name || role.code} department is not a Card 5 department.`);
    }
    const allowed = snapshot.mappings.filter(
      (row) => row.roleId === role.id && row.allowed && permissionById.get(row.permissionId)?.active,
    );
    if (activePermissions.length > 0 && allowed.length === 0) {
      blockers.push(`${role.name || role.code} needs at least one allowed permission.`);
    }
  }

  for (const row of snapshot.mappings) {
    const role = snapshot.roles.find((item) => item.id === row.roleId);
    const permission = permissionById.get(row.permissionId);
    if (!role || !roleIds.has(row.roleId)) {
      blockers.push("A role-permission mapping points at an unknown hotel role.");
      continue;
    }
    if (!permission) {
      blockers.push(`${role.name} has a mapping to an unknown permission.`);
      continue;
    }
    if (!(CARD7_DATA_SCOPES as readonly string[]).includes(row.dataScope)) {
      blockers.push(`${role.name} has an invalid data scope on ${permission.code}.`);
    }
    if (row.dataScope === "department" && row.allowed && role.active) {
      if (!role.departmentId) {
        blockers.push(`${role.name} uses department scope but has no department.`);
      } else if (!departmentIds.has(role.departmentId)) {
        blockers.push(`${role.name} department scope does not match a Card 5 department.`);
      }
    }
  }

  for (const row of snapshot.approvalRules) {
    const permission = permissionById.get(row.permissionId);
    const approver = snapshot.roles.find((item) => item.id === row.approverRoleId);
    if (!permission) blockers.push("An approval rule references an unknown permission.");
    if (!approver) blockers.push("An approval rule references an unknown approver role.");
    if (row.active && approver && !approver.active) {
      warnings.push(`${approver.name} is the approver on an active rule but the role is inactive.`);
    }
    const hasAmount = row.thresholdAmount != null;
    const hasUnit = row.thresholdUnit != null;
    if (hasAmount !== hasUnit) {
      blockers.push("An approval-rule threshold needs both an amount and a unit, or neither.");
    }
    if (hasAmount && row.thresholdAmount != null && row.thresholdAmount <= 0) {
      blockers.push("An approval-rule threshold must be greater than zero.");
    }
  }

  if (snapshot.memberships.some((row) => row.hotelRoleId && !roleIds.has(row.hotelRoleId))) {
    blockers.push("A staff membership is assigned to a hotel role that is not in this property.");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const status: PropertySetupCardStatus =
    uniqueBlockers.length === 0
      ? "complete"
      : snapshot.roles.length > 0
        ? "in_progress"
        : "not_started";
  return {
    ready: uniqueBlockers.length === 0,
    status,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
}
