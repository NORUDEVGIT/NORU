/**
 * Card 2 Phase 5 — Maintenance Rules validators (pure).
 * Configuration only. Does not change assignment, check-in, or capacity engines.
 * Parent OOS/OOO applies to hotel_rooms.status.
 * Child status rules apply to hotel_rooms.maintenance_status.
 */
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";

export const MAINTENANCE_STATUS_RULE_STATUSES = [
  "normal",
  "maintenance_required",
  "in_progress",
  "out_of_service",
  "out_of_order",
  "inspection",
] as const;
export type MaintenanceStatusRuleStatus = (typeof MAINTENANCE_STATUS_RULE_STATUSES)[number];

export const MAINTENANCE_FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "annual"] as const;
export type MaintenanceFrequency = (typeof MAINTENANCE_FREQUENCIES)[number];

export const OPERATIONAL_OOS_DEPENDENT_KEYS = [
  "operationalOosReasonRequired",
  "operationalOosApprovalRequired",
  "operationalOosSupervisorApprovalRequired",
  "operationalOosAssignmentRestricted",
  "operationalOosMaintenanceClearanceRequired",
  "operationalOosReopeningInspectionRequired",
  "operationalOosExpectedCompletionRequired",
] as const;

export const OPERATIONAL_OOO_DEPENDENT_KEYS = [
  "operationalOooReasonRequired",
  "operationalOooMaintenanceTicketRequired",
  "operationalOooApprovalRequired",
  "operationalOooManagerApprovalRequired",
  "operationalOooAssignmentRestricted",
  "operationalOooCheckInRestricted",
  "operationalOooMaintenanceClearanceRequired",
  "operationalOooReopeningInspectionRequired",
] as const;

export const DUAL_DIMENSION_NOTE =
  "Operational OOS/OOO policy applies to hotel_rooms.status. Status rules apply to hotel_rooms.maintenance_status. The two dimensions are independent.";

export type MaintenanceStatusRule = {
  maintenanceStatus: MaintenanceStatusRuleStatus;
  preventsRoomAssignment: boolean;
  preventsCheckIn: boolean;
  requiresSupervisorApproval: boolean;
  requiresMaintenanceClearance: boolean;
  requiresInspectionBeforeRelease: boolean;
  active: boolean;
};

export type MaintenanceRulesDraft = {
  maintenanceManagementEnabled: boolean;
  requiresSupervisorApproval: boolean;
  manualStatusChangeAllowed: boolean;
  maintenanceStatusChangeReasonRequired: boolean;
  maintenanceStatusChangeNotesRequired: boolean;
  operationalOosEnabled: boolean;
  operationalOosReasonRequired: boolean;
  operationalOosApprovalRequired: boolean;
  operationalOosSupervisorApprovalRequired: boolean;
  operationalOosAssignmentRestricted: boolean;
  operationalOosMaintenanceClearanceRequired: boolean;
  operationalOosReopeningInspectionRequired: boolean;
  operationalOosExpectedCompletionRequired: boolean;
  operationalOooEnabled: boolean;
  operationalOooReasonRequired: boolean;
  operationalOooMaintenanceTicketRequired: boolean;
  operationalOooApprovalRequired: boolean;
  operationalOooManagerApprovalRequired: boolean;
  operationalOooAssignmentRestricted: boolean;
  operationalOooCheckInRestricted: boolean;
  operationalOooMaintenanceClearanceRequired: boolean;
  operationalOooReopeningInspectionRequired: boolean;
  preventiveMaintenanceEnabled: boolean;
  defaultMaintenanceFrequency: MaintenanceFrequency;
  preventiveInspectionRequired: boolean;
  preventiveReminderEnabled: boolean;
  preventiveReminderLeadDays: number | null;
  preventiveAssignedDepartmentId: string | null;
  statusRules: MaintenanceStatusRule[];
};

function isBool(value: unknown): value is boolean {
  return value === true || value === false;
}

export function isMaintenanceStatusRuleStatus(value: string): value is MaintenanceStatusRuleStatus {
  return (MAINTENANCE_STATUS_RULE_STATUSES as readonly string[]).includes(value);
}

export function isMaintenanceFrequency(value: string): value is MaintenanceFrequency {
  return (MAINTENANCE_FREQUENCIES as readonly string[]).includes(value);
}

export function defaultStatusRules(): MaintenanceStatusRule[] {
  return MAINTENANCE_STATUS_RULE_STATUSES.map((maintenanceStatus) => ({
    maintenanceStatus,
    preventsRoomAssignment: false,
    preventsCheckIn: false,
    requiresSupervisorApproval: false,
    requiresMaintenanceClearance: false,
    requiresInspectionBeforeRelease: false,
    active: true,
  }));
}

export function defaultMaintenanceRules(): MaintenanceRulesDraft {
  return {
    maintenanceManagementEnabled: true,
    requiresSupervisorApproval: false,
    manualStatusChangeAllowed: true,
    maintenanceStatusChangeReasonRequired: true,
    maintenanceStatusChangeNotesRequired: false,
    operationalOosEnabled: true,
    operationalOosReasonRequired: true,
    operationalOosApprovalRequired: false,
    operationalOosSupervisorApprovalRequired: false,
    operationalOosAssignmentRestricted: true,
    operationalOosMaintenanceClearanceRequired: false,
    operationalOosReopeningInspectionRequired: false,
    operationalOosExpectedCompletionRequired: false,
    operationalOooEnabled: true,
    operationalOooReasonRequired: true,
    operationalOooMaintenanceTicketRequired: false,
    operationalOooApprovalRequired: false,
    operationalOooManagerApprovalRequired: false,
    operationalOooAssignmentRestricted: true,
    operationalOooCheckInRestricted: true,
    operationalOooMaintenanceClearanceRequired: false,
    operationalOooReopeningInspectionRequired: false,
    preventiveMaintenanceEnabled: false,
    defaultMaintenanceFrequency: "monthly",
    preventiveInspectionRequired: false,
    preventiveReminderEnabled: false,
    preventiveReminderLeadDays: null,
    preventiveAssignedDepartmentId: null,
    statusRules: defaultStatusRules(),
  };
}

export function mergeStatusRules(rows: MaintenanceStatusRule[]): MaintenanceStatusRule[] {
  const byStatus = new Map(rows.map((row) => [row.maintenanceStatus, row]));
  return MAINTENANCE_STATUS_RULE_STATUSES.map((maintenanceStatus) => {
    const existing = byStatus.get(maintenanceStatus);
    return existing
      ? { ...existing, maintenanceStatus }
      : {
          maintenanceStatus,
          preventsRoomAssignment: false,
          preventsCheckIn: false,
          requiresSupervisorApproval: false,
          requiresMaintenanceClearance: false,
          requiresInspectionBeforeRelease: false,
          active: true,
        };
  });
}

export function normalizeMaintenanceRules(draft: MaintenanceRulesDraft): MaintenanceRulesDraft {
  const next: MaintenanceRulesDraft = {
    ...draft,
    statusRules: mergeStatusRules(draft.statusRules ?? []),
  };
  if (!isMaintenanceFrequency(next.defaultMaintenanceFrequency)) {
    next.defaultMaintenanceFrequency = "monthly";
  }
  if (!next.operationalOosEnabled) {
    next.operationalOosReasonRequired = false;
    next.operationalOosApprovalRequired = false;
    next.operationalOosSupervisorApprovalRequired = false;
    next.operationalOosAssignmentRestricted = false;
    next.operationalOosMaintenanceClearanceRequired = false;
    next.operationalOosReopeningInspectionRequired = false;
    next.operationalOosExpectedCompletionRequired = false;
  }
  if (!next.operationalOooEnabled) {
    next.operationalOooReasonRequired = false;
    next.operationalOooMaintenanceTicketRequired = false;
    next.operationalOooApprovalRequired = false;
    next.operationalOooManagerApprovalRequired = false;
    next.operationalOooAssignmentRestricted = false;
    next.operationalOooCheckInRestricted = false;
    next.operationalOooMaintenanceClearanceRequired = false;
    next.operationalOooReopeningInspectionRequired = false;
  }
  if (!next.preventiveMaintenanceEnabled) {
    next.preventiveInspectionRequired = false;
    next.preventiveReminderEnabled = false;
    next.preventiveReminderLeadDays = null;
    next.preventiveAssignedDepartmentId = null;
  }
  if (!next.preventiveReminderEnabled) {
    next.preventiveReminderLeadDays = null;
  }
  return next;
}

export function maintenanceRulesErrors(draft: MaintenanceRulesDraft): string[] {
  const errors: string[] = [];
  const boolFields: Array<keyof MaintenanceRulesDraft> = [
    "maintenanceManagementEnabled",
    "requiresSupervisorApproval",
    "manualStatusChangeAllowed",
    "maintenanceStatusChangeReasonRequired",
    "maintenanceStatusChangeNotesRequired",
    "operationalOosEnabled",
    "operationalOosReasonRequired",
    "operationalOosApprovalRequired",
    "operationalOosSupervisorApprovalRequired",
    "operationalOosAssignmentRestricted",
    "operationalOosMaintenanceClearanceRequired",
    "operationalOosReopeningInspectionRequired",
    "operationalOosExpectedCompletionRequired",
    "operationalOooEnabled",
    "operationalOooReasonRequired",
    "operationalOooMaintenanceTicketRequired",
    "operationalOooApprovalRequired",
    "operationalOooManagerApprovalRequired",
    "operationalOooAssignmentRestricted",
    "operationalOooCheckInRestricted",
    "operationalOooMaintenanceClearanceRequired",
    "operationalOooReopeningInspectionRequired",
    "preventiveMaintenanceEnabled",
    "preventiveInspectionRequired",
    "preventiveReminderEnabled",
  ];
  for (const key of boolFields) {
    if (!isBool(draft[key])) errors.push("Maintenance policy flags must be true or false.");
  }
  if (errors.length > 0) return Array.from(new Set(errors));

  if (!isMaintenanceFrequency(draft.defaultMaintenanceFrequency)) {
    errors.push("Unknown preventive maintenance frequency.");
  }

  if (draft.preventiveReminderEnabled) {
    if (!draft.preventiveMaintenanceEnabled) {
      errors.push("Preventive reminder requires preventive maintenance to be enabled.");
    }
    if (draft.preventiveReminderLeadDays == null) {
      errors.push("Preventive reminder requires lead days.");
    } else if (!Number.isInteger(draft.preventiveReminderLeadDays) || draft.preventiveReminderLeadDays < 0) {
      errors.push("Preventive reminder lead days must be an integer of 0 or more.");
    }
  } else if (draft.preventiveReminderLeadDays != null) {
    if (!Number.isInteger(draft.preventiveReminderLeadDays) || draft.preventiveReminderLeadDays < 0) {
      errors.push("Preventive reminder lead days must be empty or an integer of 0 or more.");
    }
  }

  if (draft.preventiveAssignedDepartmentId != null && draft.preventiveAssignedDepartmentId !== "") {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(draft.preventiveAssignedDepartmentId)) {
      errors.push("Preventive department must be a valid department id.");
    }
  }

  errors.push(...statusRulesSaveErrors(draft.statusRules));
  return Array.from(new Set(errors));
}

export function statusRulesSaveErrors(rows: MaintenanceStatusRule[] | undefined): string[] {
  const errors: string[] = [];
  if (!Array.isArray(rows)) {
    errors.push("Maintenance status rules must include all six canonical statuses.");
    return errors;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isMaintenanceStatusRuleStatus(row.maintenanceStatus)) {
      errors.push("Unknown maintenance status.");
      continue;
    }
    if (seen.has(row.maintenanceStatus)) errors.push("Duplicate maintenance status.");
    seen.add(row.maintenanceStatus);
    if (
      !isBool(row.preventsRoomAssignment) ||
      !isBool(row.preventsCheckIn) ||
      !isBool(row.requiresSupervisorApproval) ||
      !isBool(row.requiresMaintenanceClearance) ||
      !isBool(row.requiresInspectionBeforeRelease) ||
      !isBool(row.active)
    ) {
      errors.push("Maintenance status-rule flags must be true or false.");
    }
  }
  for (const expected of MAINTENANCE_STATUS_RULE_STATUSES) {
    if (!seen.has(expected)) errors.push("Maintenance status rules must include all six canonical statuses.");
  }
  return Array.from(new Set(errors));
}

export type MaintenanceReadiness = {
  ready: boolean;
  blockers: string[];
};

export function evaluateCard2MaintenanceReadiness(input: {
  persisted: boolean;
  persistedStatusCount: number;
  rules: MaintenanceRulesDraft;
  departmentValid: boolean;
}): MaintenanceReadiness {
  if (!input.persisted) {
    return {
      ready: false,
      blockers: ["Save Maintenance Rules to create the property configuration."],
    };
  }
  const normalized = normalizeMaintenanceRules(input.rules);
  const blockers = maintenanceRulesErrors(normalized);
  if (input.persistedStatusCount !== MAINTENANCE_STATUS_RULE_STATUSES.length) {
    blockers.push("Maintenance status rules must include all six canonical statuses.");
  }
  if (normalized.preventiveAssignedDepartmentId && !input.departmentValid) {
    blockers.push("Preventive department must belong to this property.");
  }
  return {
    ready: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
  };
}

export function card2MaintenanceStepStatus(ready: boolean, hasStarted: boolean): PropertySetupCardStatus {
  if (ready) return "complete";
  if (hasStarted) return "in_progress";
  return "not_started";
}

export function mergeCard2MaintenanceStatus(
  stored: unknown,
  stepStatus: PropertySetupCardStatus,
): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  const cards = { ...parsed.cards };
  if (cards["rooms-inventory"] === "complete") {
    cards["rooms-inventory"] = "in_progress";
  } else if (stepStatus !== "not_started" && cards["rooms-inventory"] !== "in_progress") {
    cards["rooms-inventory"] = "in_progress";
  }
  return {
    ...parsed,
    cards,
    card2Steps: { ...parsed.card2Steps, maintenance: stepStatus },
  };
}

export function statusRuleIsRestrictive(row: MaintenanceStatusRule): boolean {
  return (
    row.preventsRoomAssignment ||
    row.preventsCheckIn ||
    row.requiresSupervisorApproval ||
    row.requiresMaintenanceClearance ||
    row.requiresInspectionBeforeRelease
  );
}
