import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  DUAL_DIMENSION_NOTE,
  card2MaintenanceStepStatus,
  defaultMaintenanceRules,
  evaluateCard2MaintenanceReadiness as evaluateMaintenanceReadinessPure,
  isMaintenanceFrequency,
  isMaintenanceStatusRuleStatus,
  maintenanceRulesErrors,
  mergeCard2MaintenanceStatus,
  mergeStatusRules,
  normalizeMaintenanceRules,
  statusRuleIsRestrictive,
  statusRulesSaveErrors,
  type MaintenanceRulesDraft,
  type MaintenanceStatusRule,
} from "./maintenance-card2.server";

const idSchema = z.string().uuid();

type DbClient = {
  from: (table: string) => any;
};

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

const statusRuleSchema = z.object({
  maintenanceStatus: z.string(),
  preventsRoomAssignment: z.boolean(),
  preventsCheckIn: z.boolean(),
  requiresSupervisorApproval: z.boolean(),
  requiresMaintenanceClearance: z.boolean(),
  requiresInspectionBeforeRelease: z.boolean(),
  active: z.boolean(),
});

const saveMaintenanceRulesInput = z.object({
  restaurantId: idSchema,
  maintenanceManagementEnabled: z.boolean(),
  requiresSupervisorApproval: z.boolean(),
  manualStatusChangeAllowed: z.boolean(),
  maintenanceStatusChangeReasonRequired: z.boolean(),
  maintenanceStatusChangeNotesRequired: z.boolean(),
  operationalOosEnabled: z.boolean(),
  operationalOosReasonRequired: z.boolean(),
  operationalOosApprovalRequired: z.boolean(),
  operationalOosSupervisorApprovalRequired: z.boolean(),
  operationalOosAssignmentRestricted: z.boolean(),
  operationalOosMaintenanceClearanceRequired: z.boolean(),
  operationalOosReopeningInspectionRequired: z.boolean(),
  operationalOosExpectedCompletionRequired: z.boolean(),
  operationalOooEnabled: z.boolean(),
  operationalOooReasonRequired: z.boolean(),
  operationalOooMaintenanceTicketRequired: z.boolean(),
  operationalOooApprovalRequired: z.boolean(),
  operationalOooManagerApprovalRequired: z.boolean(),
  operationalOooAssignmentRestricted: z.boolean(),
  operationalOooCheckInRestricted: z.boolean(),
  operationalOooMaintenanceClearanceRequired: z.boolean(),
  operationalOooReopeningInspectionRequired: z.boolean(),
  preventiveMaintenanceEnabled: z.boolean(),
  defaultMaintenanceFrequency: z.string(),
  preventiveInspectionRequired: z.boolean(),
  preventiveReminderEnabled: z.boolean(),
  preventiveReminderLeadDays: z.number().int().nullable(),
  preventiveAssignedDepartmentId: z.string().uuid().nullable(),
  statusRules: z.array(statusRuleSchema),
});

type ParentRow = Record<string, unknown>;

function mapStatusRow(row: {
  maintenance_status?: string;
  prevents_room_assignment?: boolean;
  prevents_check_in?: boolean;
  requires_supervisor_approval?: boolean;
  requires_maintenance_clearance?: boolean;
  requires_inspection_before_release?: boolean;
  active?: boolean;
}): MaintenanceStatusRule | null {
  const maintenanceStatus = String(row.maintenance_status ?? "");
  if (!isMaintenanceStatusRuleStatus(maintenanceStatus)) return null;
  return {
    maintenanceStatus,
    preventsRoomAssignment: Boolean(row.prevents_room_assignment),
    preventsCheckIn: Boolean(row.prevents_check_in),
    requiresSupervisorApproval: Boolean(row.requires_supervisor_approval),
    requiresMaintenanceClearance: Boolean(row.requires_maintenance_clearance),
    requiresInspectionBeforeRelease: Boolean(row.requires_inspection_before_release),
    active: row.active !== false,
  };
}

function mapParent(row: ParentRow, statusRules: MaintenanceStatusRule[]): MaintenanceRulesDraft {
  const frequency = String(row.default_maintenance_frequency ?? "monthly");
  return {
    maintenanceManagementEnabled: Boolean(row.maintenance_management_enabled),
    requiresSupervisorApproval: Boolean(row.requires_supervisor_approval),
    manualStatusChangeAllowed: Boolean(row.manual_status_change_allowed),
    maintenanceStatusChangeReasonRequired: Boolean(row.maintenance_status_change_reason_required),
    maintenanceStatusChangeNotesRequired: Boolean(row.maintenance_status_change_notes_required),
    operationalOosEnabled: Boolean(row.operational_oos_enabled),
    operationalOosReasonRequired: Boolean(row.operational_oos_reason_required),
    operationalOosApprovalRequired: Boolean(row.operational_oos_approval_required),
    operationalOosSupervisorApprovalRequired: Boolean(row.operational_oos_supervisor_approval_required),
    operationalOosAssignmentRestricted: Boolean(row.operational_oos_assignment_restricted),
    operationalOosMaintenanceClearanceRequired: Boolean(row.operational_oos_maintenance_clearance_required),
    operationalOosReopeningInspectionRequired: Boolean(row.operational_oos_reopening_inspection_required),
    operationalOosExpectedCompletionRequired: Boolean(row.operational_oos_expected_completion_required),
    operationalOooEnabled: Boolean(row.operational_ooo_enabled),
    operationalOooReasonRequired: Boolean(row.operational_ooo_reason_required),
    operationalOooMaintenanceTicketRequired: Boolean(row.operational_ooo_maintenance_ticket_required),
    operationalOooApprovalRequired: Boolean(row.operational_ooo_approval_required),
    operationalOooManagerApprovalRequired: Boolean(row.operational_ooo_manager_approval_required),
    operationalOooAssignmentRestricted: Boolean(row.operational_ooo_assignment_restricted),
    operationalOooCheckInRestricted: Boolean(row.operational_ooo_check_in_restricted),
    operationalOooMaintenanceClearanceRequired: Boolean(row.operational_ooo_maintenance_clearance_required),
    operationalOooReopeningInspectionRequired: Boolean(row.operational_ooo_reopening_inspection_required),
    preventiveMaintenanceEnabled: Boolean(row.preventive_maintenance_enabled),
    defaultMaintenanceFrequency: isMaintenanceFrequency(frequency) ? frequency : "monthly",
    preventiveInspectionRequired: Boolean(row.preventive_inspection_required),
    preventiveReminderEnabled: Boolean(row.preventive_reminder_enabled),
    preventiveReminderLeadDays:
      row.preventive_reminder_lead_days == null ? null : Number(row.preventive_reminder_lead_days),
    preventiveAssignedDepartmentId:
      row.preventive_assigned_department_id == null ? null : String(row.preventive_assigned_department_id),
    statusRules: mergeStatusRules(statusRules),
  };
}

function parentPayload(restaurantId: string, rules: MaintenanceRulesDraft) {
  return {
    restaurant_id: restaurantId,
    maintenance_management_enabled: rules.maintenanceManagementEnabled,
    requires_supervisor_approval: rules.requiresSupervisorApproval,
    manual_status_change_allowed: rules.manualStatusChangeAllowed,
    maintenance_status_change_reason_required: rules.maintenanceStatusChangeReasonRequired,
    maintenance_status_change_notes_required: rules.maintenanceStatusChangeNotesRequired,
    operational_oos_enabled: rules.operationalOosEnabled,
    operational_oos_reason_required: rules.operationalOosReasonRequired,
    operational_oos_approval_required: rules.operationalOosApprovalRequired,
    operational_oos_supervisor_approval_required: rules.operationalOosSupervisorApprovalRequired,
    operational_oos_assignment_restricted: rules.operationalOosAssignmentRestricted,
    operational_oos_maintenance_clearance_required: rules.operationalOosMaintenanceClearanceRequired,
    operational_oos_reopening_inspection_required: rules.operationalOosReopeningInspectionRequired,
    operational_oos_expected_completion_required: rules.operationalOosExpectedCompletionRequired,
    operational_ooo_enabled: rules.operationalOooEnabled,
    operational_ooo_reason_required: rules.operationalOooReasonRequired,
    operational_ooo_maintenance_ticket_required: rules.operationalOooMaintenanceTicketRequired,
    operational_ooo_approval_required: rules.operationalOooApprovalRequired,
    operational_ooo_manager_approval_required: rules.operationalOooManagerApprovalRequired,
    operational_ooo_assignment_restricted: rules.operationalOooAssignmentRestricted,
    operational_ooo_check_in_restricted: rules.operationalOooCheckInRestricted,
    operational_ooo_maintenance_clearance_required: rules.operationalOooMaintenanceClearanceRequired,
    operational_ooo_reopening_inspection_required: rules.operationalOooReopeningInspectionRequired,
    preventive_maintenance_enabled: rules.preventiveMaintenanceEnabled,
    default_maintenance_frequency: rules.defaultMaintenanceFrequency,
    preventive_inspection_required: rules.preventiveInspectionRequired,
    preventive_reminder_enabled: rules.preventiveReminderEnabled,
    preventive_reminder_lead_days: rules.preventiveReminderLeadDays,
    preventive_assigned_department_id: rules.preventiveAssignedDepartmentId,
  };
}

async function loadRules(supabase: DbClient, restaurantId: string) {
  const [{ data: parent }, { data: children }] = await Promise.all([
    supabase.from("pms_maintenance_rules").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    supabase
      .from("pms_maintenance_status_rules")
      .select(
        "maintenance_status, prevents_room_assignment, prevents_check_in, requires_supervisor_approval, requires_maintenance_clearance, requires_inspection_before_release, active",
      )
      .eq("restaurant_id", restaurantId),
  ]);
  const statusRules = ((children ?? []) as Array<{
    maintenance_status?: string;
    prevents_room_assignment?: boolean;
    prevents_check_in?: boolean;
    requires_supervisor_approval?: boolean;
    requires_maintenance_clearance?: boolean;
    requires_inspection_before_release?: boolean;
    active?: boolean;
  }>)
    .map(mapStatusRow)
    .filter((row): row is MaintenanceStatusRule => row != null);
  return { parent: parent as ParentRow | null, statusRules, persistedStatusCount: statusRules.length };
}

async function departmentForRestaurant(
  supabase: DbClient,
  restaurantId: string,
  departmentId: string | null,
): Promise<{ valid: boolean; name: string | null }> {
  if (!departmentId) return { valid: true, name: null };
  const { data } = await supabase
    .from("pms_departments")
    .select("id, name")
    .eq("id", departmentId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data?.id) return { valid: false, name: null };
  return { valid: true, name: data.name == null ? null : String(data.name) };
}

export async function persistCard2MaintenanceReadiness(
  supabase: DbClient,
  restaurantId: string,
): Promise<void> {
  const loaded = await loadRules(supabase, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  const rules = loaded.parent
    ? mapParent(loaded.parent, loaded.statusRules)
    : defaultMaintenanceRules();
  const department = await departmentForRestaurant(
    supabase,
    restaurantId,
    rules.preventiveAssignedDepartmentId,
  );
  const readiness = evaluateMaintenanceReadinessPure({
    persisted: Boolean(loaded.parent),
    persistedStatusCount: loaded.persistedStatusCount,
    rules,
    departmentValid: department.valid,
  });
  const next = mergeCard2MaintenanceStatus(
    restaurant?.pms_property_setup_status,
    card2MaintenanceStepStatus(readiness.ready, Boolean(loaded.parent)),
  );
  await supabaseAdmin
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
}

export const getMaintenanceRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const loaded = await loadRules(pmsDb(context.supabase), data.restaurantId);
    if (!loaded.parent) {
      return {
        persisted: false,
        rules: defaultMaintenanceRules(),
        dualDimensionNote: DUAL_DIMENSION_NOTE,
      };
    }
    return {
      persisted: true,
      rules: mapParent(loaded.parent, loaded.statusRules),
      dualDimensionNote: DUAL_DIMENSION_NOTE,
    };
  });

export const saveMaintenanceRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveMaintenanceRulesInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (!isMaintenanceFrequency(data.defaultMaintenanceFrequency)) {
      return { ok: false as const, message: "Unknown preventive maintenance frequency." };
    }
    const mappedRules: MaintenanceStatusRule[] = [];
    for (const row of data.statusRules) {
      if (!isMaintenanceStatusRuleStatus(row.maintenanceStatus)) {
        return { ok: false as const, message: "Unknown maintenance status." };
      }
      mappedRules.push({
        maintenanceStatus: row.maintenanceStatus,
        preventsRoomAssignment: row.preventsRoomAssignment,
        preventsCheckIn: row.preventsCheckIn,
        requiresSupervisorApproval: row.requiresSupervisorApproval,
        requiresMaintenanceClearance: row.requiresMaintenanceClearance,
        requiresInspectionBeforeRelease: row.requiresInspectionBeforeRelease,
        active: row.active,
      });
    }
    const statusIssue = statusRulesSaveErrors(mappedRules)[0];
    if (statusIssue) return { ok: false as const, message: statusIssue };

    const normalized = normalizeMaintenanceRules({
      ...data,
      defaultMaintenanceFrequency: data.defaultMaintenanceFrequency,
      statusRules: mappedRules,
    });
    const issue = maintenanceRulesErrors(normalized)[0];
    if (issue) return { ok: false as const, message: issue };

    const db = pmsDb(context.supabase);
    const department = await departmentForRestaurant(
      db,
      data.restaurantId,
      normalized.preventiveAssignedDepartmentId,
    );
    if (!department.valid) {
      return { ok: false as const, message: "Preventive department must belong to this property." };
    }

    const parentResult = await db
      .from("pms_maintenance_rules")
      .upsert(parentPayload(data.restaurantId, normalized), { onConflict: "restaurant_id" })
      .select("id")
      .maybeSingle();
    if (parentResult.error) {
      return { ok: false as const, message: parentResult.error.message ?? "Could not save maintenance rules." };
    }

    const childRows = normalized.statusRules.map((row) => ({
      restaurant_id: data.restaurantId,
      maintenance_status: row.maintenanceStatus,
      prevents_room_assignment: row.preventsRoomAssignment,
      prevents_check_in: row.preventsCheckIn,
      requires_supervisor_approval: row.requiresSupervisorApproval,
      requires_maintenance_clearance: row.requiresMaintenanceClearance,
      requires_inspection_before_release: row.requiresInspectionBeforeRelease,
      active: row.active,
    }));
    const childResult = await db
      .from("pms_maintenance_status_rules")
      .upsert(childRows, { onConflict: "restaurant_id,maintenance_status" });
    if (childResult.error) {
      return { ok: false as const, message: childResult.error.message ?? "Could not save maintenance status rules." };
    }

    await persistCard2MaintenanceReadiness(db, data.restaurantId);
    return {
      ok: true as const,
      rules: normalized,
      dualDimensionNote: DUAL_DIMENSION_NOTE,
    };
  });

export const getMaintenanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb(context.supabase);
    const loaded = await loadRules(db, data.restaurantId);
    const rules = loaded.parent
      ? mapParent(loaded.parent, loaded.statusRules)
      : defaultMaintenanceRules();
    const department = await departmentForRestaurant(
      db,
      data.restaurantId,
      rules.preventiveAssignedDepartmentId,
    );
    return {
      persisted: Boolean(loaded.parent),
      maintenanceManagementEnabled: rules.maintenanceManagementEnabled,
      configuredStatusRules: loaded.persistedStatusCount,
      restrictiveStatusRules: rules.statusRules.filter(statusRuleIsRestrictive).length,
      oosPolicyConfigured: rules.operationalOosEnabled,
      oooPolicyConfigured: rules.operationalOooEnabled,
      preventiveMaintenanceEnabled: rules.preventiveMaintenanceEnabled,
      preventiveDepartmentName: department.valid ? department.name : null,
      dualDimensionNote: DUAL_DIMENSION_NOTE,
    };
  });

export const evaluateCard2MaintenanceReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb(context.supabase);
    await persistCard2MaintenanceReadiness(db, data.restaurantId);
    const loaded = await loadRules(db, data.restaurantId);
    const persisted = Boolean(loaded.parent);
    const rules = loaded.parent ? mapParent(loaded.parent, loaded.statusRules) : defaultMaintenanceRules();
    const department = await departmentForRestaurant(db, data.restaurantId, rules.preventiveAssignedDepartmentId);
    const readiness = evaluateMaintenanceReadinessPure({
      persisted,
      persistedStatusCount: loaded.persistedStatusCount,
      rules,
      departmentValid: department.valid,
    });
    return {
      ...readiness,
      persisted,
      stepStatus: card2MaintenanceStepStatus(readiness.ready, persisted),
      dualDimensionNote: DUAL_DIMENSION_NOTE,
    };
  });

export const listMaintenanceDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { data: rows, error } = await pmsDb(context.supabase)
      .from("pms_departments")
      .select("id, name, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    if (error) return { departments: [] as Array<{ id: string; name: string }> };
    return {
      departments: ((rows ?? []) as Array<{ id?: string; name?: string; active?: boolean }>)
        .filter((row) => row.id && row.active !== false)
        .map((row) => ({ id: String(row.id), name: String(row.name ?? "Department") })),
    };
  });
