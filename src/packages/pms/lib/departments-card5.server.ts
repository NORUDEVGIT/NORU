/**
 * Card 5 Phase 1 — Departments (pure helpers).
 * Extends existing pms_departments. Folio routing stays on SET5.
 */

import { SELECTABLE_STAFF_ROLES, STAFF_ROLES, type StaffRole } from "@/core/lib/module-access";
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD5_DEPARTMENT_AUDIT = "pms_card5_department_updated";
export const CARD5_ROUTING_AUDIT = "pms_card5_department_routing_updated";
export const CARD5_DEPARTMENT_AUDIT_SECTION = "card5-departments";
export const CARD5_DEPARTMENTS_UNAVAILABLE =
  "Departments are unavailable until migration 0077 is applied.";

export const CARD5_DEPARTMENT_TYPES = [
  "operations",
  "commercial",
  "fnb",
  "administration",
  "custom",
] as const;
export type Card5DepartmentType = (typeof CARD5_DEPARTMENT_TYPES)[number];

export const CARD5_DEPARTMENT_TYPE_LABELS: Record<Card5DepartmentType, string> = {
  operations: "Operations",
  commercial: "Commercial",
  fnb: "F&B",
  administration: "Administration",
  custom: "Custom",
};

export const CARD5_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Card5Priority = (typeof CARD5_PRIORITIES)[number];

export const CARD5_NOTIFICATION_CHANNELS = ["email", "sms", "in_app"] as const;
export type Card5NotificationChannel = (typeof CARD5_NOTIFICATION_CHANNELS)[number];

export const CARD5_SUGGESTED_SERVICE_KEYS = [
  "guest_request",
  "room_cleaning",
  "room_repair",
  "restaurant_reservation",
  "corporate_inquiry",
  "payment_issue",
  "airport_transfer",
] as const;

export const CARD5_SERVICE_KEY_LABELS: Record<
  (typeof CARD5_SUGGESTED_SERVICE_KEYS)[number],
  string
> = {
  guest_request: "Guest request",
  room_cleaning: "Room cleaning",
  room_repair: "Room repair",
  restaurant_reservation: "Restaurant reservation",
  corporate_inquiry: "Corporate inquiry",
  payment_issue: "Payment issue",
  airport_transfer: "Airport transfer",
};

export const CARD5_STAFF_ROLES = SELECTABLE_STAFF_ROLES;
export const CARD5_ALL_STAFF_ROLES = STAFF_ROLES;

export type Card5HoursWindow = {
  open: string;
  close: string;
};

export type Card5OperatingHours = {
  is24Hours: boolean;
  daily: Card5HoursWindow | null;
  weekend: Card5HoursWindow | null;
  holiday: Card5HoursWindow | null;
  holidayNotes: string;
};

export type Card5Department = {
  id: string;
  code: string;
  name: string;
  description: string;
  parentId: string | null;
  departmentType: Card5DepartmentType;
  managerUserId: string | null;
  responsibleRole: StaffRole | null;
  costCenter: string;
  revenueCenter: string;
  operatingHours: Card5OperatingHours;
  defaultLanguage: string;
  defaultNotificationChannel: Card5NotificationChannel | null;
  defaultPriority: Card5Priority | null;
  defaultSlaMinutes: number | null;
  escalationManagerUserId: string | null;
  active: boolean;
};

export type Card5RoutingRule = {
  id: string;
  serviceKey: string;
  departmentId: string;
  defaultRole: StaffRole;
  description: string;
  active: boolean;
};

export type Card5StaffOption = {
  userId: string;
  name: string;
  role: string;
  active: boolean;
};

export type Card5DepartmentsSnapshot = {
  departments: Card5Department[];
  routing: Card5RoutingRule[];
  staff: Card5StaffOption[];
};

export type Card5DepartmentsReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function emptyOperatingHours(partial?: Partial<Card5OperatingHours>): Card5OperatingHours {
  return {
    is24Hours: partial?.is24Hours === true,
    daily: partial?.daily ?? null,
    weekend: partial?.weekend ?? null,
    holiday: partial?.holiday ?? null,
    holidayNotes: partial?.holidayNotes ?? "",
  };
}

export function parseDepartmentType(value: unknown): Card5DepartmentType {
  return (CARD5_DEPARTMENT_TYPES as readonly string[]).includes(String(value))
    ? (value as Card5DepartmentType)
    : "custom";
}

export function parseStaffRole(value: unknown): StaffRole | null {
  return (STAFF_ROLES as readonly string[]).includes(String(value)) ? (value as StaffRole) : null;
}

export function parsePriority(value: unknown): Card5Priority | null {
  return (CARD5_PRIORITIES as readonly string[]).includes(String(value))
    ? (value as Card5Priority)
    : null;
}

export function parseNotificationChannel(value: unknown): Card5NotificationChannel | null {
  return (CARD5_NOTIFICATION_CHANNELS as readonly string[]).includes(String(value))
    ? (value as Card5NotificationChannel)
    : null;
}

function parseWindow(value: unknown): Card5HoursWindow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { open?: unknown; close?: unknown };
  const open = String(row.open ?? "").trim();
  const close = String(row.close ?? "").trim();
  if (!TIME.test(open) || !TIME.test(close)) return null;
  return { open, close };
}

export function parseOperatingHours(value: unknown): Card5OperatingHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyOperatingHours();
  const row = value as Record<string, unknown>;
  return emptyOperatingHours({
    is24Hours: row.is24Hours === true || row.is_24_hours === true,
    daily: parseWindow(row.daily),
    weekend: parseWindow(row.weekend),
    holiday: parseWindow(row.holiday),
    holidayNotes: String(row.holidayNotes ?? row.holiday_notes ?? "").trim(),
  });
}

export function serializeOperatingHours(hours: Card5OperatingHours): Record<string, unknown> {
  return {
    is24Hours: hours.is24Hours,
    daily: hours.daily,
    weekend: hours.weekend,
    holiday: hours.holiday,
    holidayNotes: hours.holidayNotes.trim() || null,
  };
}

export function hoursConfigured(hours: Card5OperatingHours): boolean {
  if (hours.is24Hours) return true;
  return hours.daily != null;
}

export function wouldCreateCycle(
  departments: Array<{ id: string; parentId: string | null }>,
  id: string | null,
  parentId: string | null,
): boolean {
  if (!parentId) return false;
  if (id && parentId === id) return true;
  const byId = new Map(departments.map((row) => [row.id, row]));
  if (!byId.has(parentId)) return true;
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (id && current === id) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export type Card5DepartmentNode = Card5Department & {
  depth: number;
  children: Card5DepartmentNode[];
};

export function departmentTree(departments: Card5Department[]): Card5DepartmentNode[] {
  const byParent = new Map<string | null, Card5Department[]>();
  for (const row of departments) {
    const key =
      row.parentId && departments.some((item) => item.id === row.parentId) ? row.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  const walk = (parentId: string | null, depth: number): Card5DepartmentNode[] => {
    const rows = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return rows.map((row) => ({
      ...row,
      depth,
      children: walk(row.id, depth + 1),
    }));
  };
  return walk(null, 0);
}

export function flattenDepartmentTree(
  nodes: Card5DepartmentNode[],
): Array<Card5Department & { depth: number }> {
  const out: Array<Card5Department & { depth: number }> = [];
  const walk = (list: Card5DepartmentNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function evaluateCard5DepartmentsReadiness(
  snapshot: Card5DepartmentsSnapshot,
): Card5DepartmentsReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const codes = new Map<string, number>();
  for (const row of snapshot.departments) {
    const code = row.code.trim().toUpperCase();
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  for (const [code, count] of codes) {
    if (code && count > 1) blockers.push(`Department code ${code} is used more than once.`);
  }

  for (const row of snapshot.departments) {
    if (row.parentId) {
      if (wouldCreateCycle(snapshot.departments, row.id, row.parentId)) {
        blockers.push(`${row.name} has an invalid parent hierarchy.`);
      } else if (!snapshot.departments.some((item) => item.id === row.parentId)) {
        blockers.push(`${row.name} references a parent that is not in this property.`);
      }
    }
    if (!row.active) continue;
    if (!row.code.trim() || !row.name.trim())
      blockers.push(`${row.name || row.code || "A department"} needs a name and code.`);
    if (!hoursConfigured(row.operatingHours)) {
      blockers.push(`Configure operating hours for ${row.name}.`);
    }
  }

  const active = snapshot.departments.filter((row) => row.active);
  if (active.length === 0) blockers.push("Add at least one active department.");
  if (snapshot.routing.filter((row) => row.active).length === 0) {
    warnings.push("No task routing rules are configured yet.");
  }
  if (active.some((row) => !row.managerUserId && !row.responsibleRole)) {
    warnings.push("Some active departments have no manager or responsible role.");
  }

  for (const row of snapshot.departments) {
    const label = row.name || row.code || "A department";
    if (row.managerUserId && !snapshot.staff.some((item) => item.userId === row.managerUserId)) {
      blockers.push(`${label} manager is not on this property.`);
    }
    if (
      row.escalationManagerUserId &&
      !snapshot.staff.some((item) => item.userId === row.escalationManagerUserId)
    ) {
      blockers.push(`${label} escalation manager is not on this property.`);
    }
    if (row.responsibleRole && !(STAFF_ROLES as readonly string[]).includes(row.responsibleRole)) {
      blockers.push(`${label} has an unknown responsible role.`);
    }
    if (row.managerUserId && snapshot.staff.some((item) => item.userId === row.managerUserId && !item.active)) {
      warnings.push(`${label} manager is inactive.`);
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  const status: PropertySetupCardStatus =
    uniqueBlockers.length === 0
      ? "complete"
      : snapshot.departments.length > 0
        ? "in_progress"
        : "not_started";
  return {
    ready: uniqueBlockers.length === 0,
    status,
    blockers: uniqueBlockers,
    warnings: [...new Set(warnings)],
  };
}

export function emptyDepartmentsSnapshot(): Card5DepartmentsSnapshot {
  return { departments: [], routing: [], staff: [] };
}

export function emptyDepartmentDraft(partial?: Partial<Card5Department>): Card5Department {
  return {
    id: partial?.id ?? "",
    code: partial?.code ?? "",
    name: partial?.name ?? "",
    description: partial?.description ?? "",
    parentId: partial?.parentId ?? null,
    departmentType: partial?.departmentType ?? "custom",
    managerUserId: partial?.managerUserId ?? null,
    responsibleRole: partial?.responsibleRole ?? null,
    costCenter: partial?.costCenter ?? "",
    revenueCenter: partial?.revenueCenter ?? "",
    operatingHours: emptyOperatingHours(partial?.operatingHours),
    defaultLanguage: partial?.defaultLanguage ?? "",
    defaultNotificationChannel: partial?.defaultNotificationChannel ?? null,
    defaultPriority: partial?.defaultPriority ?? null,
    defaultSlaMinutes: partial?.defaultSlaMinutes ?? null,
    escalationManagerUserId: partial?.escalationManagerUserId ?? null,
    active: partial?.active !== false,
  };
}
