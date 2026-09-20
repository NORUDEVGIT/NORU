import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { AUTOMATION_TIME_OF_DAY_PATTERN } from "./automation-rules-card4.server";
import {
  COMMUNICATION_CHANNEL_TYPES,
  type CommunicationChannelType,
} from "./communication-channels-card4.server";
import { COMMUNICATION_TEMPLATE_CATEGORIES } from "./communication-templates-card4.server";
import {
  COMMUNICATION_DATE_FORMATS,
  COMMUNICATION_TIME_FORMATS,
  buildSystemDefaultsDraft,
  communicationDefaultsToDraft,
  validateCommunicationDefaultsDraft,
  type CommunicationDefaultsDraft,
  type CommunicationDefaultsInherited,
  type CommunicationDefaultsLookupChannel,
  type CommunicationDefaultsLookupSender,
  type CommunicationDefaultsRecord,
  type CommunicationDefaultsSnapshot,
  type CommunicationDateFormat,
  type CommunicationTimeFormat,
} from "./communication-defaults-card4.server";
import { requireRoomManager } from "./rooms.server";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "../../../shared/lib/property-time";

// Generated schema predates 0094.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const nullableId = idSchema.nullable();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema,
    defaultGuestChannelId: nullableId,
    defaultInternalChannelId: nullableId,
    defaultMarketingChannelId: nullableId,
    defaultLanguage: z
      .string()
      .trim()
      .regex(/^[a-z]{2,8}$/),
    timezone: z.string().trim().min(1).max(64),
    dateFormat: z.enum(COMMUNICATION_DATE_FORMATS),
    timeFormat: z.enum(COMMUNICATION_TIME_FORMATS),
    defaultSenderId: nullableId,
    replyToEmail: z.string().trim().max(254),
    signature: z.string().max(4000),
    guestNotificationsEnabled: z.boolean(),
    internalNotificationsEnabled: z.boolean(),
    marketingCommunicationsEnabled: z.boolean(),
    useGuestLanguage: z.boolean(),
    attachBranding: z.boolean(),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/),
    templateCategory: z.enum(COMMUNICATION_TEMPLATE_CATEGORIES),
    deliveryTime: z.string().regex(AUTOMATION_TIME_OF_DAY_PATTERN),
  })
  .strict();

const DEFAULTS_SELECT =
  "id, default_guest_channel_id, default_internal_channel_id, default_marketing_channel_id, default_language, timezone, date_format, time_format, default_sender_id, reply_to_email, signature, guest_notifications_enabled, internal_notifications_enabled, marketing_communications_enabled, use_guest_language, attach_branding, currency_code, template_category, delivery_time, created_at, updated_at";

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Communication defaults are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load communication defaults.");
}

function isChannelType(value: string): value is CommunicationChannelType {
  return COMMUNICATION_CHANNEL_TYPES.includes(value as CommunicationChannelType);
}

function isDateFormat(value: string): value is CommunicationDateFormat {
  return COMMUNICATION_DATE_FORMATS.includes(value as CommunicationDateFormat);
}

function isTimeFormat(value: string): value is CommunicationTimeFormat {
  return COMMUNICATION_TIME_FORMATS.includes(value as CommunicationTimeFormat);
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
    metadata: { section: "card4-communication-defaults", ...metadata } as unknown as Json,
  });
  if (result.error) {
    console.error("[card4-communication-defaults] audit", result.error.message);
  }
}

function mapDefaults(row: {
  id: string;
  default_guest_channel_id: string | null;
  default_internal_channel_id: string | null;
  default_marketing_channel_id: string | null;
  default_language: string;
  timezone: string;
  date_format: string;
  time_format: string;
  default_sender_id: string | null;
  reply_to_email: string | null;
  signature: string | null;
  guest_notifications_enabled: boolean;
  internal_notifications_enabled: boolean;
  marketing_communications_enabled: boolean;
  use_guest_language: boolean;
  attach_branding: boolean;
  currency_code: string;
  template_category: string;
  delivery_time: string;
  created_at: string;
  updated_at: string;
}): CommunicationDefaultsRecord {
  const category = COMMUNICATION_TEMPLATE_CATEGORIES.includes(
    row.template_category as (typeof COMMUNICATION_TEMPLATE_CATEGORIES)[number],
  )
    ? (row.template_category as (typeof COMMUNICATION_TEMPLATE_CATEGORIES)[number])
    : "reservation";
  return {
    id: row.id,
    defaultGuestChannelId: row.default_guest_channel_id,
    defaultInternalChannelId: row.default_internal_channel_id,
    defaultMarketingChannelId: row.default_marketing_channel_id,
    defaultLanguage: row.default_language,
    timezone: row.timezone,
    dateFormat: isDateFormat(row.date_format) ? row.date_format : "yyyy-mm-dd",
    timeFormat: isTimeFormat(row.time_format) ? row.time_format : "24h",
    defaultSenderId: row.default_sender_id,
    replyToEmail: row.reply_to_email ?? "",
    signature: row.signature ?? "",
    guestNotificationsEnabled: row.guest_notifications_enabled,
    internalNotificationsEnabled: row.internal_notifications_enabled,
    marketingCommunicationsEnabled: row.marketing_communications_enabled,
    useGuestLanguage: row.use_guest_language,
    attachBranding: row.attach_branding,
    currencyCode: row.currency_code,
    templateCategory: category,
    deliveryTime: row.delivery_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadLookups(db: DbClient, restaurantId: string) {
  const [propertyRes, channelsRes, sendersRes] = await Promise.all([
    db
      .from("restaurants")
      .select("timezone, currency_code, default_language, logo_url")
      .eq("id", restaurantId)
      .maybeSingle(),
    db
      .from("pms_communication_channels")
      .select("id, channel_type, active")
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
    db
      .from("pms_communication_sender_settings")
      .select("id, channel_type, sender_name, active")
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
  ]);
  if (propertyRes.error) unavailable(propertyRes.error);
  if (!propertyRes.data) throw new Error("Property not found.");
  if (channelsRes.error) unavailable(channelsRes.error);
  if (sendersRes.error) unavailable(sendersRes.error);

  const inherited: CommunicationDefaultsInherited = {
    timezone: String(propertyRes.data.timezone ?? "").trim() || DEFAULT_TIMEZONE,
    currencyCode:
      String(propertyRes.data.currency_code ?? "")
        .trim()
        .toUpperCase() || DEFAULT_CURRENCY,
    language: String(propertyRes.data.default_language ?? "").trim() || "en",
    hasLogo: Boolean(String(propertyRes.data.logo_url ?? "").trim()),
  };
  const channels: CommunicationDefaultsLookupChannel[] = (channelsRes.data ?? [])
    .filter((row: { channel_type: string }) => isChannelType(row.channel_type))
    .map((row: { id: string; channel_type: CommunicationChannelType; active: boolean }) => ({
      id: row.id,
      channelType: row.channel_type,
      active: row.active,
    }));
  const senders: CommunicationDefaultsLookupSender[] = (sendersRes.data ?? [])
    .filter((row: { channel_type: string }) => isChannelType(row.channel_type))
    .map(
      (row: {
        id: string;
        channel_type: CommunicationChannelType;
        sender_name: string;
        active: boolean;
      }) => ({
        id: row.id,
        channelType: row.channel_type,
        senderName: row.sender_name,
        active: row.active,
      }),
    );
  return { inherited, channels, senders };
}

function payloadFromDraft(restaurantId: string, userId: string, draft: CommunicationDefaultsDraft) {
  return {
    restaurant_id: restaurantId,
    default_guest_channel_id: draft.defaultGuestChannelId,
    default_internal_channel_id: draft.defaultInternalChannelId,
    default_marketing_channel_id: draft.defaultMarketingChannelId,
    default_language: draft.defaultLanguage,
    timezone: draft.timezone.trim(),
    date_format: draft.dateFormat,
    time_format: draft.timeFormat,
    default_sender_id: draft.defaultSenderId,
    reply_to_email: draft.replyToEmail.trim() || null,
    signature: draft.signature.trim() || null,
    guest_notifications_enabled: draft.guestNotificationsEnabled,
    internal_notifications_enabled: draft.internalNotificationsEnabled,
    marketing_communications_enabled: draft.marketingCommunicationsEnabled,
    use_guest_language: draft.useGuestLanguage,
    attach_branding: draft.attachBranding,
    currency_code: draft.currencyCode,
    template_category: draft.templateCategory,
    delivery_time: draft.deliveryTime,
    updated_by: userId,
  };
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string | null,
): Promise<CommunicationDefaultsSnapshot> {
  const lookups = await loadLookups(db, restaurantId);
  const systemDefaults = buildSystemDefaultsDraft(
    lookups.inherited,
    lookups.channels,
    lookups.senders,
  );
  let result = await db
    .from("pms_communication_defaults")
    .select(DEFAULTS_SELECT)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) {
    const inserted = await db
      .from("pms_communication_defaults")
      .insert(payloadFromDraft(restaurantId, userId ?? "", systemDefaults))
      .select(DEFAULTS_SELECT)
      .single();
    if (inserted.error && inserted.error.code !== "23505") unavailable(inserted.error);
    result = await db
      .from("pms_communication_defaults")
      .select(DEFAULTS_SELECT)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (result.error) unavailable(result.error);
  }
  if (!result.data) throw new Error("Could not load communication defaults.");
  const defaults = mapDefaults(result.data);
  return {
    defaults,
    systemDefaults: { ...systemDefaults, id: defaults.id },
    channels: lookups.channels,
    senders: lookups.senders,
    inherited: lookups.inherited,
    lastUpdatedAt: defaults.updatedAt,
  };
}

export const getPmsCard4CommunicationDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4CommunicationDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const draft: CommunicationDefaultsDraft = {
      id: data.id,
      defaultGuestChannelId: data.defaultGuestChannelId,
      defaultInternalChannelId: data.defaultInternalChannelId,
      defaultMarketingChannelId: data.defaultMarketingChannelId,
      defaultLanguage: data.defaultLanguage,
      timezone: data.timezone,
      dateFormat: data.dateFormat,
      timeFormat: data.timeFormat,
      defaultSenderId: data.defaultSenderId,
      replyToEmail: data.replyToEmail,
      signature: data.signature,
      guestNotificationsEnabled: data.guestNotificationsEnabled,
      internalNotificationsEnabled: data.internalNotificationsEnabled,
      marketingCommunicationsEnabled: data.marketingCommunicationsEnabled,
      useGuestLanguage: data.useGuestLanguage,
      attachBranding: data.attachBranding,
      currencyCode: data.currencyCode,
      templateCategory: data.templateCategory,
      deliveryTime: data.deliveryTime,
    };
    const errors = validateCommunicationDefaultsDraft(draft, snapshot.channels, snapshot.senders);
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix communication defaults before saving.");
    }
    const result = await db
      .from("pms_communication_defaults")
      .update(payloadFromDraft(data.restaurantId, context.userId, draft))
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error?.code === "23503") {
      throw new Error("Choose channels and a sender that belong to this property.");
    }
    if (result.error?.code === "23514") {
      throw new Error("Communication defaults contain invalid values.");
    }
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Communication defaults not found.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_communication_defaults_saved",
      {
        id: data.id,
      },
    );
    return { ok: true as const, id: data.id };
  });

export { loadSnapshot as loadPmsCard4CommunicationDefaultsSnapshot };
export { communicationDefaultsToDraft };
