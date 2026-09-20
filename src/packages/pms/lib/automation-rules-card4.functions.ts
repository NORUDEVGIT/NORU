import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { COMMUNICATION_CHANNEL_TYPES } from "./communication-channels-card4.server";
import {
  validateCommunicationTemplateDraft,
  type CommunicationTemplateRecord,
} from "./communication-templates-card4.server";
import { testPmsCard4CommunicationTemplate } from "./communication-templates-card4.functions";
import {
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_CONDITION_OPERATORS,
  AUTOMATION_RECIPIENT_KINDS,
  AUTOMATION_RECIPIENT_ROLES,
  AUTOMATION_RECIPIENT_ROLE_LABELS,
  AUTOMATION_SCHEDULE_MODES,
  normalizeAutomationRuleDraft,
  parseAutomationConditions,
  parseAutomationRecipients,
  parseAutomationSchedule,
  validateAutomationRuleDraft,
  type AutomationRuleDraft,
  type AutomationRuleLookup,
  type AutomationRuleRecord,
  type AutomationRulesSnapshot,
} from "./automation-rules-card4.server";
import { requireRoomManager } from "./rooms.server";

// Generated schema predates 0092.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(80),
    eventId: idSchema,
    conditions: z.array(
      z
        .object({
          field: z.enum(AUTOMATION_CONDITION_FIELDS),
          operator: z.enum(AUTOMATION_CONDITION_OPERATORS),
          value: z.string().trim().min(1).max(80),
        })
        .strict(),
    ),
    recipients: z.array(
      z
        .object({
          kind: z.enum(AUTOMATION_RECIPIENT_KINDS),
          id: z.string().trim().min(1).max(80),
        })
        .strict(),
    ),
    channelType: z.enum(COMMUNICATION_CHANNEL_TYPES),
    templateId: idSchema.nullable(),
    schedule: z.object({
      mode: z.enum(AUTOMATION_SCHEDULE_MODES),
      delayMinutes: z.number().int().optional(),
      timeOfDay: z.string().optional(),
    }),
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Automation rules are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load automation rules.");
}

function mapRule(row: {
  id: string;
  name: string;
  event_id: string;
  conditions: unknown;
  recipients: unknown;
  channel_type: string;
  template_id: string | null;
  schedule: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
}): AutomationRuleRecord {
  return {
    id: row.id,
    name: row.name,
    eventId: row.event_id,
    conditions: parseAutomationConditions(row.conditions),
    recipients: parseAutomationRecipients(row.recipients),
    channelType: row.channel_type as AutomationRuleRecord["channelType"],
    templateId: row.template_id,
    schedule: parseAutomationSchedule(row.schedule),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDraft(data: z.infer<typeof saveSchema>): AutomationRuleDraft {
  return normalizeAutomationRuleDraft({
    id: data.id ?? null,
    name: data.name,
    eventId: data.eventId,
    conditions: data.conditions,
    recipients: data.recipients,
    channelType: data.channelType,
    templateId: data.templateId,
    schedule: parseAutomationSchedule(data.schedule),
    active: data.active,
  });
}

async function writeAudit(
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
    metadata: { section: "card4-automation-rules", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-automation-rules] audit", result.error.message);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<AutomationRulesSnapshot> {
  const [
    rulesRes,
    eventsRes,
    channelsRes,
    templatesRes,
    departmentsRes,
    profileTypesRes,
    restaurantRes,
  ] = await Promise.all([
    db
      .from("pms_communication_automation_rules")
      .select(
        "id, name, event_id, conditions, recipients, channel_type, template_id, schedule, active, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("updated_at", { ascending: false }),
    db
      .from("pms_communication_notification_events")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_communication_channels")
      .select("channel_type, active")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_communication_templates")
      .select("id, name, channel_type, event_trigger, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_departments")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_guest_profile_types")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db.from("restaurants").select("timezone").eq("id", restaurantId).maybeSingle(),
  ]);
  if (rulesRes.error) unavailable(rulesRes.error);
  if (eventsRes.error) unavailable(eventsRes.error);
  if (channelsRes.error) unavailable(channelsRes.error);
  if (templatesRes.error) unavailable(templatesRes.error);
  if (departmentsRes.error) unavailable(departmentsRes.error);
  if (profileTypesRes.error) unavailable(profileTypesRes.error);
  if (restaurantRes.error) unavailable(restaurantRes.error);
  const rules = (rulesRes.data ?? []).map(mapRule);
  const lastUpdatedAt = rules.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return {
    rules,
    events: (eventsRes.data ?? []).map(
      (row: { id: string; name: string; code: string; active: boolean }): AutomationRuleLookup => ({
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
      }),
    ),
    channels: (channelsRes.data ?? []).map(
      (row: { channel_type: string; active: boolean }) => ({
        channelType: row.channel_type as AutomationRuleRecord["channelType"],
        active: row.active,
      }),
    ),
    templates: (templatesRes.data ?? []).map(
      (row: {
        id: string;
        name: string;
        channel_type: string;
        event_trigger: string;
        active: boolean;
      }) => ({
        id: row.id,
        name: row.name,
        channelType: row.channel_type as AutomationRuleRecord["channelType"],
        eventTrigger: row.event_trigger,
        active: row.active,
      }),
    ),
    departments: (departmentsRes.data ?? []).map(
      (row: { id: string; name: string; code: string; active: boolean }): AutomationRuleLookup => ({
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
      }),
    ),
    profileTypes: (profileTypesRes.data ?? []).map(
      (row: { id: string; name: string; code: string; active: boolean }): AutomationRuleLookup => ({
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
      }),
    ),
    roles: AUTOMATION_RECIPIENT_ROLES.map((id) => ({
      id,
      name: AUTOMATION_RECIPIENT_ROLE_LABELS[id],
    })),
    timezone: String(restaurantRes.data?.timezone ?? "UTC"),
    lastUpdatedAt,
  };
}

async function requireOwnRule(
  db: DbClient,
  restaurantId: string,
  id: string,
): Promise<AutomationRuleRecord> {
  const result = await db
    .from("pms_communication_automation_rules")
    .select(
      "id, name, event_id, conditions, recipients, channel_type, template_id, schedule, active, created_at, updated_at",
    )
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Automation rule not found.");
  return mapRule(result.data);
}

async function loadOwnTemplate(
  db: DbClient,
  restaurantId: string,
  id: string | null,
): Promise<CommunicationTemplateRecord | null> {
  if (!id) return null;
  const result = await db
    .from("pms_communication_templates")
    .select(
      "id, name, code, category, event_trigger, channel_type, language, subject, message, active, allow_manual_sending, attach_pdf, created_at, updated_at",
    )
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Choose a template from this property.");
  const row = result.data;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category,
    eventTrigger: row.event_trigger,
    channelType: row.channel_type,
    language: row.language,
    subject: row.subject,
    message: row.message,
    active: row.active,
    allowManualSending: row.allow_manual_sending,
    attachPdf: row.attach_pdf,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cataloguesFrom(snapshot: AutomationRulesSnapshot) {
  return {
    events: snapshot.events,
    channels: snapshot.channels,
    templates: snapshot.templates,
    departments: snapshot.departments,
    profileTypes: snapshot.profileTypes,
  };
}

export const getPmsCard4AutomationRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4AutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const draft = toDraft(data);
    const errors = validateAutomationRuleDraft(draft, cataloguesFrom(snapshot), draft.active);
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the automation rule before saving.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      name: draft.name,
      event_id: draft.eventId,
      conditions: draft.conditions,
      recipients: draft.recipients,
      channel_type: draft.channelType,
      template_id: draft.templateId,
      schedule: draft.schedule,
      active: draft.active,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_communication_automation_rules")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db
          .from("pms_communication_automation_rules")
          .insert(payload)
          .select("id")
          .single();
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the automation rule.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_automation_rule_saved", {
      id,
      eventId: draft.eventId,
      active: draft.active,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4AutomationRuleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnRule(db, data.restaurantId, data.id);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    if (data.active) {
      const errors = validateAutomationRuleDraft(
        { ...existing, active: true, id: existing.id },
        cataloguesFrom(snapshot),
        true,
      );
      if (errors.length > 0) {
        throw new Error(errors[0]?.message ?? "Complete this rule before activating it.");
      }
    }
    const result = await db
      .from("pms_communication_automation_rules")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Automation rule not found.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_automation_rule_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4AutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    await requireOwnRule(db, data.restaurantId, data.id);
    const result = await db
      .from("pms_communication_automation_rules")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_automation_rule_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });

export const testPmsCard4AutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const rule = await requireOwnRule(db, data.restaurantId, data.id);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const errors = validateAutomationRuleDraft(
      { ...rule, id: rule.id, active: true },
      cataloguesFrom(snapshot),
      true,
    );
    if (errors.length > 0) {
      return {
        result: "failed" as const,
        message: errors[0]?.message ?? "Complete this rule before testing it.",
      };
    }
    const template = await loadOwnTemplate(db, data.restaurantId, rule.templateId);
    if (!template) {
      return {
        result: "failed" as const,
        message: "Choose a compatible active template before testing the rule.",
      };
    }
    const templateErrors = validateCommunicationTemplateDraft(
      {
        id: template.id,
        name: template.name,
        code: template.code,
        category: template.category,
        eventTrigger: template.eventTrigger,
        channelType: template.channelType,
        language: template.language,
        subject: template.subject,
        message: template.message,
        active: template.active,
        allowManualSending: template.allowManualSending,
        attachPdf: template.attachPdf,
      },
      [template],
    );
    if (templateErrors.length > 0) {
      return {
        result: "failed" as const,
        message: templateErrors[0]?.message ?? "The selected template is invalid.",
      };
    }
    return testPmsCard4CommunicationTemplate({
      data: {
        restaurantId: data.restaurantId,
        name: template.name,
        code: template.code,
        category: template.category,
        eventTrigger: template.eventTrigger,
        channelType: template.channelType,
        language: template.language,
        subject: template.subject,
        message: template.message,
        active: template.active,
        allowManualSending: template.allowManualSending,
        attachPdf: template.attachPdf,
      },
    });
  });
