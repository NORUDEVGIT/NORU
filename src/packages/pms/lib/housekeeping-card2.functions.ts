import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireRoomManager } from "./rooms.server";
import { withPmsPackage } from "./pms-package.server";
import {
  CORE_HOUSEKEEPING_STATUSES,
  HOUSEKEEPING_OPERATIONAL_STATUSES,
  HOUSEKEEPING_OVERRIDE_PERMISSIONS,
  HOUSEKEEPING_PRIORITY_CODES,
  HOUSEKEEPING_PRIORITY_EVENTS,
  HOUSEKEEPING_RELEASE_RULES,
  HOUSEKEEPING_STATUS_DOMAINS,
  HOUSEKEEPING_TRANSITION_EVENTS,
  emptyHousekeepingCard2Settings,
  evaluateCard2HousekeepingReadiness,
  mergeCard2HousekeepingStatus,
  type HousekeepingCard2Priority,
  type HousekeepingCard2Settings,
  type HousekeepingCard2Snapshot,
  type HousekeepingCard2Status,
  type HousekeepingCard2Transition,
} from "./housekeeping-card2.server";

type DbClient = any;

const idSchema = z.string().uuid();
const settingsSchema = z.object({
  enabled: z.boolean(),
  defaultStatus: z.enum(HOUSEKEEPING_OPERATIONAL_STATUSES),
  cleanRequired: z.boolean(),
  inspectionRequired: z.boolean(),
  maintenanceClearRequired: z.boolean(),
  roomReleaseRule: z.enum(HOUSEKEEPING_RELEASE_RULES),
  supervisorApprovalRequired: z.boolean(),
  automaticStatusChangeEnabled: z.boolean(),
  manualStatusChangeAllowed: z.boolean(),
  assignmentOverrideAllowed: z.boolean(),
  overridePermission: z.enum(HOUSEKEEPING_OVERRIDE_PERMISSIONS).nullable(),
  overrideReasonRequired: z.boolean(),
});
const transitionSchema = z.object({
  event: z.enum(HOUSEKEEPING_TRANSITION_EVENTS),
  fromStatus: z.string().trim().min(1).max(40),
  toStatus: z.string().trim().min(1).max(40),
  enabled: z.boolean(),
  approvalRequired: z.boolean(),
});
const prioritySchema = z.object({
  event: z.enum(HOUSEKEEPING_PRIORITY_EVENTS),
  priority: z.enum(HOUSEKEEPING_PRIORITY_CODES),
  enabled: z.boolean(),
  rank: z.number().int().min(1).max(99),
});
const saveSchema = z.object({
  restaurantId: idSchema,
  settings: settingsSchema,
  transitions: z.array(transitionSchema).length(HOUSEKEEPING_TRANSITION_EVENTS.length),
  priorities: z.array(prioritySchema).length(HOUSEKEEPING_PRIORITY_EVENTS.length),
});

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    throw new Error("Housekeeping Setup is unavailable until its approved migration is applied.");
  }
  throw new Error(error?.message ?? "Housekeeping Setup is unavailable.");
}

async function writeHousekeepingAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: "card2-housekeeping", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card2-housekeeping] audit", result.error.message);
}

function mapSettings(row: any): HousekeepingCard2Settings {
  if (!row) return emptyHousekeepingCard2Settings();
  return {
    enabled: row.enabled !== false,
    defaultStatus: row.default_housekeeping_status ?? "dirty",
    cleanRequired: row.clean_required !== false,
    inspectionRequired: row.inspection_required !== false,
    maintenanceClearRequired: row.maintenance_clear_required !== false,
    roomReleaseRule: row.room_release_rule ?? "after_inspection",
    supervisorApprovalRequired: row.supervisor_approval_required !== false,
    automaticStatusChangeEnabled: row.automatic_status_change_enabled !== false,
    manualStatusChangeAllowed: row.manual_status_change_allowed !== false,
    assignmentOverrideAllowed: row.assignment_override_allowed === true,
    overridePermission: row.override_permission ?? null,
    overrideReasonRequired: row.override_reason_required !== false,
    savedAt: row.saved_at ?? null,
  };
}

function mapStatus(row: any): HousekeepingCard2Status {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    domain: row.domain,
    isCore: row.is_core,
    operational: row.operational,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

function mapTransition(row: any): HousekeepingCard2Transition {
  return {
    id: row.id,
    event: row.event_code,
    fromStatus: row.from_status_code,
    toStatus: row.to_status_code,
    enabled: row.enabled,
    approvalRequired: row.approval_required,
  };
}

function mapPriority(row: any): HousekeepingCard2Priority {
  return {
    id: row.id,
    event: row.event_code,
    priority: row.priority_code,
    enabled: row.enabled,
    rank: row.rank,
  };
}

async function ensureCard2HousekeepingDefaults(db: DbClient, restaurantId: string) {
  const statusWrite = await db.from("pms_housekeeping_status_catalog").upsert(
    CORE_HOUSEKEEPING_STATUSES.map((status) => ({
      restaurant_id: restaurantId,
      code: status.code,
      name: status.name,
      domain: status.domain,
      is_core: true,
      operational: status.operational,
      active: true,
      sort_order: status.sortOrder,
    })),
    { onConflict: "restaurant_id,code", ignoreDuplicates: true },
  );
  if (statusWrite.error) unavailable(statusWrite.error);

  const settingsWrite = await db.from("pms_housekeeping_settings").upsert(
    {
      restaurant_id: restaurantId,
      enabled: true,
      default_housekeeping_status: "dirty",
      clean_required: true,
      inspection_required: true,
      maintenance_clear_required: true,
      room_release_rule: "after_inspection",
      supervisor_approval_required: true,
      automatic_status_change_enabled: true,
      manual_status_change_allowed: true,
      assignment_override_allowed: false,
      override_permission: null,
      override_reason_required: false,
    },
    { onConflict: "restaurant_id", ignoreDuplicates: true },
  );
  if (settingsWrite.error) unavailable(settingsWrite.error);

  const transitionDefaults = [
    ["guest_check_in", "ready", "occupied", false],
    ["guest_check_out", "occupied", "dirty", false],
    ["housekeeping_complete", "dirty", "clean", false],
    ["inspection_complete", "clean", "inspected", true],
  ] as const;
  const transitionWrite = await db.from("pms_housekeeping_transition_rules").upsert(
    transitionDefaults.map(([event, from, to, approval]) => ({
      restaurant_id: restaurantId,
      event_code: event,
      from_status_code: from,
      to_status_code: to,
      enabled: true,
      approval_required: approval,
    })),
    { onConflict: "restaurant_id,event_code", ignoreDuplicates: true },
  );
  if (transitionWrite.error) unavailable(transitionWrite.error);

  const priorityDefaults = [
    ["vip", "urgent", 1],
    ["early_arrival", "urgent", 2],
    ["arrival", "high", 3],
    ["room_move", "high", 4],
    ["special_request", "high", 5],
    ["departure", "normal", 6],
    ["stayover", "normal", 7],
  ] as const;
  const priorityWrite = await db.from("pms_housekeeping_priority_rules").upsert(
    priorityDefaults.map(([event, priority, rank]) => ({
      restaurant_id: restaurantId,
      event_code: event,
      priority_code: priority,
      enabled: true,
      rank,
    })),
    { onConflict: "restaurant_id,event_code", ignoreDuplicates: true },
  );
  if (priorityWrite.error) unavailable(priorityWrite.error);
}

export async function loadCard2HousekeepingSnapshot(
  db: DbClient,
  restaurantId: string,
  ensureDefaults = true,
): Promise<HousekeepingCard2Snapshot> {
  if (ensureDefaults) await ensureCard2HousekeepingDefaults(db, restaurantId);
  const [settings, statuses, transitions, priorities] = await Promise.all([
    db.from("pms_housekeeping_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    db
      .from("pms_housekeeping_status_catalog")
      .select("id, code, name, domain, is_core, operational, active, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    db
      .from("pms_housekeeping_transition_rules")
      .select("id, event_code, from_status_code, to_status_code, enabled, approval_required")
      .eq("restaurant_id", restaurantId)
      .order("event_code"),
    db
      .from("pms_housekeeping_priority_rules")
      .select("id, event_code, priority_code, enabled, rank")
      .eq("restaurant_id", restaurantId)
      .order("rank"),
  ]);
  for (const result of [settings, statuses, transitions, priorities]) {
    if (result.error) unavailable(result.error);
  }
  return {
    settings: mapSettings(settings.data),
    statuses: (statuses.data ?? []).map(mapStatus),
    transitions: (transitions.data ?? []).map(mapTransition),
    priorities: (priorities.data ?? []).map(mapPriority),
  };
}

async function persistHousekeepingStepStatus(
  db: DbClient,
  restaurantId: string,
  snapshot: HousekeepingCard2Snapshot,
) {
  const readiness = evaluateCard2HousekeepingReadiness(snapshot);
  const current = await db
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const next = mergeCard2HousekeepingStatus(current.data?.pms_property_setup_status, readiness.stepStatus);
  const saved = await db
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
  if (saved.error) throw new Error(saved.error.message);
  return readiness;
}

async function syncSet4Compatibility(db: DbClient, restaurantId: string, snapshot: HousekeepingCard2Snapshot) {
  const current = await db
    .from("restaurants")
    .select("pms_hk_cleaning_posture")
    .eq("id", restaurantId)
    .maybeSingle();
  const previous =
    current.data?.pms_hk_cleaning_posture && typeof current.data.pms_hk_cleaning_posture === "object"
      ? current.data.pms_hk_cleaning_posture
      : {};
  const core = snapshot.statuses.filter(
    (status) =>
      status.domain === "housekeeping" &&
      (HOUSEKEEPING_OPERATIONAL_STATUSES as readonly string[]).includes(status.code),
  );
  const statusRules = {
    statuses: HOUSEKEEPING_OPERATIONAL_STATUSES.map((code) => {
      const row = core.find((status) => status.code === code);
      return { code, label: row?.name ?? code, active: row?.active ?? true };
    }),
    savedAt: snapshot.settings.savedAt,
  };
  const cleaningPosture = {
    ...previous,
    inspectionGate: snapshot.settings.inspectionRequired,
    priorities: HOUSEKEEPING_PRIORITY_CODES.map((code) => ({
      code,
      label: `${code.charAt(0).toUpperCase()}${code.slice(1)}`,
      active: snapshot.priorities.some((rule) => rule.enabled && rule.priority === code),
    })),
    savedAt: snapshot.settings.savedAt,
  };
  const result = await db
    .from("restaurants")
    .update({
      pms_hk_status_rules: statusRules as unknown as Json,
      pms_hk_cleaning_posture: cleaningPosture as unknown as Json,
    })
    .eq("id", restaurantId);
  if (result.error) throw new Error(result.error.message);
}

export const getPmsCard2Housekeeping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId);
    return { snapshot, readiness: evaluateCard2HousekeepingReadiness(snapshot) };
  });

export const savePmsCard2Housekeeping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const now = new Date().toISOString();

    const settingWrite = await db.from("pms_housekeeping_settings").upsert(
      {
        restaurant_id: data.restaurantId,
        enabled: data.settings.enabled,
        default_housekeeping_status: data.settings.defaultStatus,
        clean_required: data.settings.cleanRequired,
        inspection_required: data.settings.inspectionRequired,
        maintenance_clear_required: data.settings.maintenanceClearRequired,
        room_release_rule: data.settings.roomReleaseRule,
        supervisor_approval_required: data.settings.supervisorApprovalRequired,
        automatic_status_change_enabled: data.settings.automaticStatusChangeEnabled,
        manual_status_change_allowed: data.settings.manualStatusChangeAllowed,
        assignment_override_allowed: data.settings.assignmentOverrideAllowed,
        override_permission: data.settings.assignmentOverrideAllowed ? data.settings.overridePermission : null,
        override_reason_required:
          data.settings.assignmentOverrideAllowed && data.settings.overrideReasonRequired,
        saved_at: now,
      },
      { onConflict: "restaurant_id" },
    );
    if (settingWrite.error) unavailable(settingWrite.error);

    const transitionWrite = await db.from("pms_housekeeping_transition_rules").upsert(
      data.transitions.map((rule) => ({
        restaurant_id: data.restaurantId,
        event_code: rule.event,
        from_status_code: rule.fromStatus,
        to_status_code: rule.toStatus,
        enabled: rule.enabled,
        approval_required: rule.approvalRequired,
      })),
      { onConflict: "restaurant_id,event_code" },
    );
    if (transitionWrite.error) unavailable(transitionWrite.error);

    const priorityWrite = await db.from("pms_housekeeping_priority_rules").upsert(
      data.priorities.map((rule) => ({
        restaurant_id: data.restaurantId,
        event_code: rule.event,
        priority_code: rule.priority,
        enabled: rule.enabled,
        rank: rule.rank,
      })),
      { onConflict: "restaurant_id,event_code" },
    );
    if (priorityWrite.error) unavailable(priorityWrite.error);

    const snapshot = await loadCard2HousekeepingSnapshot(db, data.restaurantId);
    await syncSet4Compatibility(db, data.restaurantId, snapshot);
    const readiness = await persistHousekeepingStepStatus(db, data.restaurantId, snapshot);
    await writeHousekeepingAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card2_housekeeping_saved",
      { stepStatus: readiness.stepStatus, blockers: readiness.blockers },
    );
    return { ok: true as const, snapshot, readiness };
  });

export const evaluatePmsCard2HousekeepingReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId);
    return persistHousekeepingStepStatus(supabaseAdmin, data.restaurantId, snapshot);
  });

const customStatusSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores."),
  name: z.string().trim().min(1).max(60),
  active: z.boolean(),
});

export const savePmsCard2CustomStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => customStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (CORE_HOUSEKEEPING_STATUSES.some((status) => status.code === data.code)) {
      throw new Error("Core status codes cannot be reused.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      domain: "custom" satisfies (typeof HOUSEKEEPING_STATUS_DOMAINS)[number],
      is_core: false,
      operational: false,
      active: data.active,
      sort_order: 1000,
    };
    const result = data.id
      ? await db
          .from("pms_housekeeping_status_catalog")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .eq("is_core", false)
      : await db.from("pms_housekeeping_status_catalog").insert(payload);
    if (result.error?.code === "23505") throw new Error("That status code is already used.");
    if (result.error) unavailable(result.error);
    const snapshot = await loadCard2HousekeepingSnapshot(db, data.restaurantId);
    const readiness = await persistHousekeepingStepStatus(db, data.restaurantId, snapshot);
    await writeHousekeepingAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card2_housekeeping_custom_status_saved",
      { code: data.code, active: data.active },
    );
    return { ok: true as const, snapshot, readiness };
  });
