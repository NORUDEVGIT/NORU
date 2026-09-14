/**
 * PMS-SET5 — load / save departments, request types, notifications, admin, security.
 *
 * 0051 tables are optional at runtime: missing relations never crash the hub.
 * Audit insert failure does not roll back the save.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import type { Json } from "@/integrations/supabase/types";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  SET5_AUDIT_ADMIN,
  SET5_AUDIT_CHANNELS,
  SET5_AUDIT_DEPARTMENT,
  SET5_AUDIT_EVENT_RULES,
  SET5_AUDIT_REQUEST_TYPE,
  SET5_AUDIT_RETENTION,
  SET5_AUDIT_ROUTING,
  SET5_AUDIT_SESSION,
  SET5_AUDIT_TEMPLATE,
  SET5_AUDIT_WORK_CENTER,
  activateInputFromSet5Snapshot,
  emptyAdminControls,
  emptyAuditRetention,
  emptyNotificationChannels,
  emptyNotificationEventRules,
  emptyRoutingDefaults,
  emptySessionAccess,
  emptySet5Snapshot,
  parseAdminControls,
  parseAuditRetention,
  parseNotificationChannel,
  parseNotificationChannels,
  parseNotificationEventRules,
  parseRoutingDefaults,
  parseSessionAccess,
  type AdminControls,
  type AuditRetentionPosture,
  type NotificationChannels,
  type NotificationEventRules,
  type PmsDepartment,
  type PmsGuestRequestType,
  type PmsNotificationTemplate,
  type PmsWorkCenter,
  type RoutingDefaults,
  type SessionAccessPosture,
  type Set5Snapshot,
} from "./pms-set5-depts-guestsvc";

const idSchema = z.string().uuid();
const SET5_UNAVAILABLE_DEPTS = "Those department catalogues are unavailable until migration 0051 is applied.";
const SET5_UNAVAILABLE_REQUESTS = "Guest request types are unavailable until migration 0051 is applied.";
const SET5_UNAVAILABLE_NOTIFY = "Notification settings are unavailable until migration 0051 is applied.";
const SET5_UNAVAILABLE_ADMIN = "Administration controls are unavailable until migration 0051 is applied.";
const SET5_UNAVAILABLE_SECURITY = "Session and audit-retention posture is unavailable until migration 0051 is applied.";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function writeAudit(
  supabaseAdmin: Admin,
  params: {
    restaurantId: string;
    actorUserId: string;
    action: string;
    before: unknown;
    after: unknown;
    section?: string;
  },
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: params.action,
    metadata: {
      section: params.section ?? null,
      before: params.before as Json,
      after: params.after as Json,
      when: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[pms-set5] audit", error.message);
    return false;
  }
  return true;
}

export async function loadSet5Snapshot(supabaseAdmin: Admin, restaurantId: string): Promise<Set5Snapshot> {
  const snapshot = emptySet5Snapshot();

  const columnsRes = await supabaseAdmin
    .from("restaurants")
    .select(
      "pms_routing_defaults, pms_notification_channels, pms_notification_event_rules, pms_admin_controls, pms_session_access_posture, pms_audit_retention_posture",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (columnsRes.error && isMissingSchemaError(columnsRes.error)) {
    snapshot.adminAvailable = false;
    snapshot.securityAvailable = false;
    snapshot.notificationsAvailable = false;
    snapshot.routingDefaults = emptyRoutingDefaults();
    snapshot.channels = emptyNotificationChannels();
    snapshot.eventRules = emptyNotificationEventRules();
    snapshot.adminControls = emptyAdminControls();
    snapshot.sessionAccess = emptySessionAccess();
    snapshot.auditRetention = emptyAuditRetention();
  } else if (columnsRes.error) {
    throw new Error(columnsRes.error.message);
  } else {
    snapshot.adminAvailable = true;
    snapshot.securityAvailable = true;
    snapshot.routingDefaults = parseRoutingDefaults(columnsRes.data?.pms_routing_defaults);
    snapshot.channels = parseNotificationChannels(columnsRes.data?.pms_notification_channels);
    snapshot.eventRules = parseNotificationEventRules(columnsRes.data?.pms_notification_event_rules);
    snapshot.adminControls = parseAdminControls(columnsRes.data?.pms_admin_controls);
    snapshot.sessionAccess = parseSessionAccess(columnsRes.data?.pms_session_access_posture);
    snapshot.auditRetention = parseAuditRetention(columnsRes.data?.pms_audit_retention_posture);
  }

  const departmentsRes = await supabaseAdmin
    .from("pms_departments")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (departmentsRes.error && isMissingSchemaError(departmentsRes.error)) {
    snapshot.departmentsAvailable = false;
  } else if (departmentsRes.error) {
    throw new Error(departmentsRes.error.message);
  } else {
    snapshot.departmentsAvailable = true;
    snapshot.departments = ((departmentsRes.data ?? []) as PmsDepartment[]).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
    }));
  }

  const workRes = await supabaseAdmin
    .from("pms_work_centers")
    .select("id, code, name, active, department_id")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (workRes.error && isMissingSchemaError(workRes.error)) {
    snapshot.workCentersAvailable = false;
  } else if (workRes.error) {
    throw new Error(workRes.error.message);
  } else {
    snapshot.workCentersAvailable = true;
    snapshot.workCenters = ((workRes.data ?? []) as Array<PmsWorkCenter & { department_id: string }>).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
      departmentId: row.department_id,
    }));
  }

  const requestRes = await supabaseAdmin
    .from("pms_guest_request_types")
    .select("id, code, name, active, department_id")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (requestRes.error && isMissingSchemaError(requestRes.error)) {
    snapshot.requestTypesAvailable = false;
  } else if (requestRes.error) {
    throw new Error(requestRes.error.message);
  } else {
    snapshot.requestTypesAvailable = true;
    snapshot.requestTypes = ((requestRes.data ?? []) as Array<PmsGuestRequestType & { department_id: string | null }>).map(
      (row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
        departmentId: row.department_id,
      }),
    );
  }

  const templateRes = await supabaseAdmin
    .from("pms_notification_templates")
    .select("id, code, name, channel, body, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (templateRes.error && isMissingSchemaError(templateRes.error)) {
    snapshot.notificationsAvailable = false;
  } else if (templateRes.error) {
    throw new Error(templateRes.error.message);
  } else {
    snapshot.notificationsAvailable = columnsRes.error ? snapshot.notificationsAvailable : true;
    snapshot.templates = ((templateRes.data ?? []) as PmsNotificationTemplate[])
      .map((row) => {
        const channel = parseNotificationChannel(row.channel);
        if (!channel) return null;
        return { id: row.id, code: row.code, name: row.name, channel, body: row.body, active: row.active };
      })
      .filter((row): row is PmsNotificationTemplate => row !== null);
  }

  return snapshot;
}

export const getPmsSet5Snapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    return {
      snapshot,
      activate: activateInputFromSet5Snapshot(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

const catalogueItemSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
});

async function requireEditor(restaurantId: string, context: { userId: string }) {
  const me = await withPmsPackage(restaurantId, callerMembership(context as never, restaurantId));
  if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
  return me;
}

export const savePmsDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.departmentsAvailable) throw new Error(SET5_UNAVAILABLE_DEPTS);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_departments").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_departments").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That department code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET5_UNAVAILABLE_DEPTS);
      throw new Error(result.error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_DEPARTMENT,
      section: "departments",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const workCenterSchema = catalogueItemSchema.extend({ departmentId: idSchema });

export const savePmsWorkCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workCenterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.workCentersAvailable || !before.departmentsAvailable) throw new Error(SET5_UNAVAILABLE_DEPTS);
    if (!before.departments.some((row) => row.id === data.departmentId)) {
      throw new Error("Choose an existing department for this work centre.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      department_id: data.departmentId,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_work_centers").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_work_centers").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That work-centre code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET5_UNAVAILABLE_DEPTS);
      throw new Error(result.error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_WORK_CENTER,
      section: "departments",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsRoutingDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        defaultDepartmentId: idSchema.nullable().optional(),
        folioPostingUsesDepartment: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const routing: RoutingDefaults = {
      defaultDepartmentId: data.defaultDepartmentId ?? null,
      folioPostingUsesDepartment: data.folioPostingUsesDepartment,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.departmentsAvailable) throw new Error(SET5_UNAVAILABLE_DEPTS);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_routing_defaults: routing as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET5_UNAVAILABLE_DEPTS);
      throw new Error(error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_ROUTING,
      section: "departments",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const requestTypeSchema = catalogueItemSchema.extend({ departmentId: idSchema.nullable().optional() });

export const savePmsGuestRequestType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestTypeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.requestTypesAvailable) throw new Error(SET5_UNAVAILABLE_REQUESTS);
    const payload = {
      restaurant_id: data.restaurantId,
      department_id: data.departmentId ?? null,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin
          .from("pms_guest_request_types")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_guest_request_types").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That request-type code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET5_UNAVAILABLE_REQUESTS);
      throw new Error(result.error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_REQUEST_TYPE,
      section: "guest-services-types",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsNotificationChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        email: z.boolean(),
        sms: z.boolean(),
        inApp: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const channels: NotificationChannels = {
      email: data.email,
      sms: data.sms,
      inApp: data.inApp,
      whatsapp: false,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.notificationsAvailable && !before.adminAvailable) throw new Error(SET5_UNAVAILABLE_NOTIFY);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_notification_channels: channels as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET5_UNAVAILABLE_NOTIFY);
      throw new Error(error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_CHANNELS,
      section: "notifications",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const templateSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  channel: z.enum(["email", "sms", "in_app"]),
  body: z.string().trim().max(2000),
  active: z.boolean(),
});

export const savePmsNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => templateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.notificationsAvailable) throw new Error(SET5_UNAVAILABLE_NOTIFY);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      channel: data.channel,
      body: data.body,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin
          .from("pms_notification_templates")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_notification_templates").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That template code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET5_UNAVAILABLE_NOTIFY);
      throw new Error(result.error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_TEMPLATE,
      section: "notifications",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsNotificationEventRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        rules: z.array(
          z.object({
            eventKey: z.enum(["reservation_confirmed", "pre_arrival", "guest_request_created", "night_audit_exception"]),
            channel: z.enum(["email", "sms", "in_app"]),
            enabled: z.boolean(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const eventRules: NotificationEventRules = {
      rules: data.rules,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_notification_event_rules: eventRules as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET5_UNAVAILABLE_NOTIFY);
      throw new Error(error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_EVENT_RULES,
      section: "notifications",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsAdminControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationPrefix: z.string().trim().max(12),
        folioPrefix: z.string().trim().max(12),
        rateOverrideNeedsApproval: z.boolean(),
        lateCheckoutNeedsApproval: z.boolean(),
        managerOverrideEnabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const adminControls: AdminControls = {
      reservationPrefix: data.reservationPrefix,
      folioPrefix: data.folioPrefix,
      rateOverrideNeedsApproval: data.rateOverrideNeedsApproval,
      lateCheckoutNeedsApproval: data.lateCheckoutNeedsApproval,
      managerOverrideEnabled: data.managerOverrideEnabled,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.adminAvailable) throw new Error(SET5_UNAVAILABLE_ADMIN);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_admin_controls: adminControls as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET5_UNAVAILABLE_ADMIN);
      throw new Error(error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_ADMIN,
      section: "administration",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsSessionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        idleTimeoutMinutes: z.number().int().positive().max(1440).nullable(),
        reauthForSensitive: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const sessionAccess: SessionAccessPosture = {
      idleTimeoutMinutes: data.idleTimeoutMinutes,
      reauthForSensitive: data.reauthForSensitive,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.securityAvailable) throw new Error(SET5_UNAVAILABLE_SECURITY);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_session_access_posture: sessionAccess as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET5_UNAVAILABLE_SECURITY);
      throw new Error(error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_SESSION,
      section: "security-audit",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsAuditRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        retentionDays: z.number().int().positive().max(3650).nullable(),
        maskIdNumbers: z.boolean(),
        restrictGuestExport: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const auditRetention: AuditRetentionPosture = {
      retentionDays: data.retentionDays,
      maskIdNumbers: data.maskIdNumbers,
      restrictGuestExport: data.restrictGuestExport,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.securityAvailable) throw new Error(SET5_UNAVAILABLE_SECURITY);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_audit_retention_posture: auditRetention as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET5_UNAVAILABLE_SECURITY);
      throw new Error(error.message);
    }
    const after = await loadSet5Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET5_AUDIT_RETENTION,
      section: "security-audit",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export type { Set5Snapshot };
