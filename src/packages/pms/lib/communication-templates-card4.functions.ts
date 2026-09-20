import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { COMMUNICATION_CHANNEL_TYPES } from "./communication-channels-card4.server";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  TEMPLATE_CODE_PATTERN,
  TEMPLATE_MESSAGE_MAX,
  communicationTemplateToDraft,
  renderTemplateText,
  sanitizeTemplateHtml,
  stripTemplateHtml,
  validateCommunicationTemplateDraft,
  type CommunicationTemplateRecord,
  type CommunicationTemplatesSnapshot,
  type CommunicationTemplateCategory,
} from "./communication-templates-card4.server";
import { platformEmailTransportConfigured } from "./guest-profile-wave5";
import { requireRoomManager } from "./rooms.server";

// Generated schema predates 0090.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(80),
    code: z.string().trim().min(1).max(20),
    category: z.enum(COMMUNICATION_TEMPLATE_CATEGORIES),
    eventTrigger: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/),
    channelType: z.enum(COMMUNICATION_CHANNEL_TYPES),
    language: z.string().trim().min(2).max(8),
    subject: z.string().trim().min(1).max(200),
    message: z.string().min(1).max(TEMPLATE_MESSAGE_MAX),
    active: z.boolean(),
    allowManualSending: z.boolean(),
    attachPdf: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Communication templates are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load communication templates.");
}

function mapTemplate(row: {
  id: string;
  name: string;
  code: string;
  category: string;
  event_trigger: string;
  channel_type: string;
  language: string;
  subject: string;
  message: string;
  active: boolean;
  allow_manual_sending: boolean;
  attach_pdf: boolean;
  created_at: string;
  updated_at: string;
}): CommunicationTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category as CommunicationTemplateCategory,
    eventTrigger: row.event_trigger,
    channelType: row.channel_type as CommunicationTemplateRecord["channelType"],
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
    metadata: { section: "card4-communication-templates", ...metadata } as unknown as Json,
  });
  if (result.error) {
    console.error("[card4-communication-templates] audit", result.error.message);
  }
}

async function loadRows(db: DbClient, restaurantId: string) {
  return db
    .from("pms_communication_templates")
    .select(
      "id, name, code, category, event_trigger, channel_type, language, subject, message, active, allow_manual_sending, attach_pdf, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("updated_at", { ascending: false });
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<CommunicationTemplatesSnapshot> {
  const result = await loadRows(db, restaurantId);
  if (result.error) unavailable(result.error);
  const templates = (result.data ?? []).map(mapTemplate);
  const lastUpdatedAt = templates.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { templates, lastUpdatedAt };
}

async function requireOwnTemplate(
  db: DbClient,
  restaurantId: string,
  id: string,
): Promise<CommunicationTemplateRecord> {
  const result = await db
    .from("pms_communication_templates")
    .select(
      "id, name, code, category, event_trigger, channel_type, language, subject, message, active, allow_manual_sending, attach_pdf, created_at, updated_at",
    )
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Communication template not found.");
  return mapTemplate(result.data);
}

function normalizeDraft(data: z.infer<typeof saveSchema>) {
  return {
    id: data.id ?? null,
    name: data.name.trim(),
    code: data.code.trim().toUpperCase(),
    category: data.category,
    eventTrigger: data.eventTrigger,
    channelType: data.channelType,
    language: data.language,
    subject: data.subject.trim(),
    message: sanitizeTemplateHtml(data.message),
    active: data.active,
    allowManualSending: data.allowManualSending,
    attachPdf: data.attachPdf,
  };
}

async function sendTestEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["GUEST_EMAIL_FROM"]?.trim() || process.env["RECEIPT_EMAIL_FROM"]?.trim();
  if (!apiKey || !from) throw new Error("Email is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: `[TEST] ${subject}`, text }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[card4-communication-templates] test email", response.status, body);
    throw new Error("The test email could not be sent.");
  }
}

export const getPmsCard4CommunicationTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4CommunicationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const draft = normalizeDraft(data);
    if (!TEMPLATE_CODE_PATTERN.test(draft.code)) {
      throw new Error("Use 1–20 characters: letters, numbers, hyphens, or underscores.");
    }
    const errors = validateCommunicationTemplateDraft(draft, snapshot.templates);
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the communication template before saving.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      name: draft.name,
      code: draft.code,
      category: draft.category,
      event_trigger: draft.eventTrigger,
      channel_type: draft.channelType,
      language: draft.language,
      subject: draft.subject,
      message: draft.message,
      active: draft.active,
      allow_manual_sending: draft.allowManualSending,
      attach_pdf: draft.attachPdf,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_communication_templates")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_communication_templates").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This template code is already in use.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the communication template.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_communication_template_saved",
      {
        id,
        code: draft.code,
        channelType: draft.channelType,
        active: draft.active,
      },
    );
    return { ok: true as const, id };
  });

export const setPmsCard4CommunicationTemplateActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnTemplate(db, data.restaurantId, data.id);
    if (data.active) {
      const snapshot = await loadSnapshot(db, data.restaurantId);
      const errors = validateCommunicationTemplateDraft(
        { ...communicationTemplateToDraft(existing), active: true },
        snapshot.templates,
      );
      if (errors.length > 0) {
        throw new Error(errors[0]?.message ?? "Complete this template before activating it.");
      }
    }
    const result = await db
      .from("pms_communication_templates")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_communication_template_toggled",
      { id: data.id, active: data.active },
    );
    return { ok: true as const };
  });

export const deletePmsCard4CommunicationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    await requireOwnTemplate(db, data.restaurantId, data.id);
    const result = await db
      .from("pms_communication_templates")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_communication_template_deleted",
      { id: data.id },
    );
    return { ok: true as const };
  });

export const previewPmsCard4CommunicationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    saveSchema
      .omit({ id: true, active: true, allowManualSending: true, attachPdf: true })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const draft = normalizeDraft({
      ...data,
      active: false,
      allowManualSending: false,
      attachPdf: false,
    });
    const errors = validateCommunicationTemplateDraft(draft, []);
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the template before previewing.");
    }
    return {
      subject: renderTemplateText(draft.subject),
      message: renderTemplateText(draft.message),
      plainText: renderTemplateText(stripTemplateHtml(draft.message)),
    };
  });

export const testPmsCard4CommunicationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.omit({ id: true }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const draft = normalizeDraft(data);
    const errors = validateCommunicationTemplateDraft(draft, []);
    if (errors.length > 0) {
      return {
        result: "failed" as const,
        message: errors[0]?.message ?? "Fix the template before sending a test.",
      };
    }
    if (draft.channelType !== "email") {
      return {
        result: "unsupported" as const,
        message:
          "Configuration is valid, but this channel has no live test adapter. No production notification was sent.",
      };
    }
    if (!platformEmailTransportConfigured()) {
      return {
        result: "unsupported" as const,
        message:
          "Email test sending uses the platform transport. It is not configured, and property SMTP was not used.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const user = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const to = user.data.user?.email?.trim();
    if (!to) {
      return {
        result: "failed" as const,
        message: "Your account has no email address for a test send.",
      };
    }
    await sendTestEmail(
      to,
      renderTemplateText(draft.subject),
      renderTemplateText(stripTemplateHtml(draft.message)),
    );
    return {
      result: "sent" as const,
      message: `Test email sent to ${to}. This was not a guest or production notification.`,
    };
  });
