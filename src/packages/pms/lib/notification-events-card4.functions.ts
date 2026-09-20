import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { COMMUNICATION_CHANNEL_TYPES } from "./communication-channels-card4.server";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  validateCommunicationTemplateDraft,
  type CommunicationTemplateCategory,
  type CommunicationTemplateRecord,
} from "./communication-templates-card4.server";
import { testPmsCard4CommunicationTemplate } from "./communication-templates-card4.functions";
import {
  NOTIFICATION_EVENT_MODULES,
  SYSTEM_NOTIFICATION_EVENTS,
  normalizeNotificationEventDraft,
  notificationEventToDraft,
  validateNotificationEventDraft,
  type NotificationEventModule,
  type NotificationEventRecord,
  type NotificationEventsSnapshot,
  type NotificationEventTemplateCompatibility,
} from "./notification-events-card4.server";
import { requireRoomManager } from "./rooms.server";

// Generated schema predates 0091.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(80),
    code: z.string().trim().max(40),
    module: z.enum(NOTIFICATION_EVENT_MODULES),
    category: z.enum(COMMUNICATION_TEMPLATE_CATEGORIES),
    description: z.string().max(500),
    defaultChannelType: z.enum(COMMUNICATION_CHANNEL_TYPES),
    defaultTemplateId: idSchema.nullable(),
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Notification events are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load notification events.");
}

function mapEvent(row: {
  id: string;
  name: string;
  code: string;
  module: string;
  category: string;
  description: string | null;
  default_channel_type: string;
  default_template_id: string | null;
  active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}): NotificationEventRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    module: row.module as NotificationEventModule,
    category: row.category as CommunicationTemplateCategory,
    description: row.description ?? "",
    defaultChannelType:
      row.default_channel_type as NotificationEventRecord["defaultChannelType"],
    defaultTemplateId: row.default_template_id,
    active: row.active,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    metadata: { section: "card4-notification-events", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-notification-events] audit", result.error.message);
}

async function loadRows(db: DbClient, restaurantId: string) {
  return db
    .from("pms_communication_notification_events")
    .select(
      "id, name, code, module, category, description, default_channel_type, default_template_id, active, is_system, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("is_system", { ascending: false })
    .order("name");
}

async function ensureSystemEvents(db: DbClient, restaurantId: string): Promise<void> {
  const result = await db.from("pms_communication_notification_events").upsert(
    SYSTEM_NOTIFICATION_EVENTS.map((row) => ({
      restaurant_id: restaurantId,
      name: row.name,
      code: row.code,
      module: row.module,
      category: row.category,
      description: "",
      default_channel_type: "email",
      default_template_id: null,
      active: false,
      is_system: true,
    })),
    { onConflict: "restaurant_id,code", ignoreDuplicates: true },
  );
  if (result.error) unavailable(result.error);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<NotificationEventsSnapshot> {
  await ensureSystemEvents(db, restaurantId);
  const result = await loadRows(db, restaurantId);
  if (result.error) unavailable(result.error);
  const events = (result.data ?? []).map(mapEvent);
  const lastUpdatedAt = events.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { events, lastUpdatedAt };
}

async function requireOwnEvent(
  db: DbClient,
  restaurantId: string,
  id: string,
): Promise<NotificationEventRecord> {
  const result = await db
    .from("pms_communication_notification_events")
    .select(
      "id, name, code, module, category, description, default_channel_type, default_template_id, active, is_system, created_at, updated_at",
    )
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Notification event not found.");
  return mapEvent(result.data);
}

async function requireOwnChannel(
  db: DbClient,
  restaurantId: string,
  channelType: string,
  requireActive: boolean,
) {
  const result = await db
    .from("pms_communication_channels")
    .select("id, active")
    .eq("restaurant_id", restaurantId)
    .eq("channel_type", channelType)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Configure this communication channel for the property first.");
  if (requireActive && !result.data.active) {
    throw new Error("Activate the selected communication channel first.");
  }
}

async function loadOwnTemplate(
  db: DbClient,
  restaurantId: string,
  id: string | null,
): Promise<{
  compatibility: NotificationEventTemplateCompatibility | null;
  record: CommunicationTemplateRecord | null;
}> {
  if (!id) return { compatibility: null, record: null };
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
  const record: CommunicationTemplateRecord = {
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
  return {
    record,
    compatibility: {
      id: record.id,
      category: record.category,
      eventTrigger: record.eventTrigger,
      channelType: record.channelType,
      active: record.active,
    },
  };
}

export const getPmsCard4NotificationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4NotificationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const existing = data.id ? await requireOwnEvent(db, data.restaurantId, data.id) : null;
    const draft = normalizeNotificationEventDraft({
      id: data.id ?? null,
      name: data.name,
      code: data.code,
      module: data.module,
      category: data.category,
      description: data.description,
      defaultChannelType: data.defaultChannelType,
      defaultTemplateId: data.defaultTemplateId,
      active: data.active,
      isSystem: existing?.isSystem ?? false,
    });
    await requireOwnChannel(db, data.restaurantId, draft.defaultChannelType, draft.active);
    const template = await loadOwnTemplate(db, data.restaurantId, draft.defaultTemplateId);
    const errors = validateNotificationEventDraft(
      draft,
      snapshot.events,
      existing,
      template.compatibility,
    );
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the notification event before saving.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      name: draft.name,
      code: draft.code,
      module: draft.module,
      category: draft.category,
      description: draft.description,
      default_channel_type: draft.defaultChannelType,
      default_template_id: draft.defaultTemplateId,
      active: draft.active,
      is_system: existing?.isSystem ?? false,
      updated_by: context.userId,
    };
    const result = existing
      ? await db
          .from("pms_communication_notification_events")
          .update(payload)
          .eq("id", existing.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db
          .from("pms_communication_notification_events")
          .insert(payload)
          .select("id")
          .single();
    if (result.error?.code === "23505") {
      throw new Error("This event code or name is already in use.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the notification event.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_notification_event_saved",
      { id, code: draft.code, active: draft.active },
    );
    return { ok: true as const, id };
  });

export const setPmsCard4NotificationEventActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnEvent(db, data.restaurantId, data.id);
    if (data.active) {
      await requireOwnChannel(db, data.restaurantId, existing.defaultChannelType, true);
      const snapshot = await loadSnapshot(db, data.restaurantId);
      const template = await loadOwnTemplate(db, data.restaurantId, existing.defaultTemplateId);
      const errors = validateNotificationEventDraft(
        { ...notificationEventToDraft(existing), active: true },
        snapshot.events,
        existing,
        template.compatibility,
      );
      if (errors.length > 0) {
        throw new Error(errors[0]?.message ?? "Complete this event before activating it.");
      }
    }
    const result = await db
      .from("pms_communication_notification_events")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Notification event not found.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_notification_event_toggled",
      { id: data.id, active: data.active },
    );
    return { ok: true as const };
  });

export const deletePmsCard4NotificationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnEvent(db, data.restaurantId, data.id);
    if (existing.isSystem) throw new Error("System notification events cannot be deleted.");
    const dependents = await db
      .from("pms_communication_templates")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("event_trigger", existing.code)
      .limit(1);
    if (dependents.error) unavailable(dependents.error);
    if ((dependents.data ?? []).length > 0) {
      throw new Error("Deactivate this event instead. A communication template still uses it.");
    }
    const result = await db
      .from("pms_communication_notification_events")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_notification_event_deleted",
      { id: data.id, code: existing.code },
    );
    return { ok: true as const };
  });

export const testPmsCard4NotificationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const event = await requireOwnEvent(db, data.restaurantId, data.id);
    await requireOwnChannel(db, data.restaurantId, event.defaultChannelType, true);
    const template = await loadOwnTemplate(db, data.restaurantId, event.defaultTemplateId);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const eventErrors = validateNotificationEventDraft(
      notificationEventToDraft(event),
      snapshot.events,
      event,
      template.compatibility,
    );
    if (eventErrors.length > 0 || !template.record) {
      return {
        result: "failed" as const,
        message:
          eventErrors[0]?.message ?? "Choose a compatible active template before testing the event.",
      };
    }
    const templateErrors = validateCommunicationTemplateDraft(
      {
        id: template.record.id,
        name: template.record.name,
        code: template.record.code,
        category: template.record.category,
        eventTrigger: template.record.eventTrigger,
        channelType: template.record.channelType,
        language: template.record.language,
        subject: template.record.subject,
        message: template.record.message,
        active: template.record.active,
        allowManualSending: template.record.allowManualSending,
        attachPdf: template.record.attachPdf,
      },
      [template.record],
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
        name: template.record.name,
        code: template.record.code,
        category: template.record.category,
        eventTrigger: template.record.eventTrigger,
        channelType: template.record.channelType,
        language: template.record.language,
        subject: template.record.subject,
        message: template.record.message,
        active: template.record.active,
        allowManualSending: template.record.allowManualSending,
        attachPdf: template.record.attachPdf,
      },
    });
  });

export { loadSnapshot as loadPmsCard4NotificationEventsSnapshot };
