import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  COMMUNICATION_CHANNEL_TYPES,
  DEFAULT_COMMUNICATION_CHANNELS,
  communicationChannelToDraft,
  isIntegrationAuthMethod,
  sanitizeCommunicationProviderConfig,
  validateCommunicationChannelDraft,
  validateConnectionTest,
  type CommunicationChannelRecord,
  type CommunicationChannelsSnapshot,
  type CommunicationChannelType,
  type CommunicationProviderConfig,
} from "./communication-channels-card4.server";
import { INTEGRATION_AUTH_METHODS } from "./integrations-catalog";
import { requireRoomManager } from "./rooms.server";

// Generated schema predates 0089.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const providerValueSchema = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);
const providerConfigSchema = z.record(z.string().max(80), providerValueSchema);
const channelSchema = z.enum(COMMUNICATION_CHANNEL_TYPES);
const authMethodSchema = z.enum(INTEGRATION_AUTH_METHODS);

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    channelType: channelSchema,
    provider: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/),
    authMethod: authMethodSchema,
    senderName: z.string().trim().min(1).max(80),
    senderEmail: z.string().trim().max(254),
    replyToEmail: z.string().trim().max(254),
    signature: z.string().max(4000),
    providerConfig: providerConfigSchema,
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Communication channels are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load communication channels.");
}

function mapChannel(row: {
  id: string;
  channel_type: string;
  provider: string;
  auth_method: string;
  sender_name: string;
  sender_email: string | null;
  reply_to_email: string | null;
  signature: string | null;
  provider_config: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
}): CommunicationChannelRecord {
  if (!COMMUNICATION_CHANNEL_TYPES.includes(row.channel_type as CommunicationChannelType)) {
    throw new Error("A stored communication channel has an unsupported type.");
  }
  if (!isIntegrationAuthMethod(row.auth_method)) {
    throw new Error("A stored communication channel has an unsupported authentication method.");
  }
  const rawConfig =
    row.provider_config &&
    typeof row.provider_config === "object" &&
    !Array.isArray(row.provider_config)
      ? (row.provider_config as Record<string, unknown>)
      : {};
  const providerConfig: CommunicationProviderConfig = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      providerConfig[key] = value;
    }
  }
  return {
    id: row.id,
    channelType: row.channel_type as CommunicationChannelType,
    provider: row.provider,
    authMethod: row.auth_method,
    senderName: row.sender_name,
    senderEmail: row.sender_email ?? "",
    replyToEmail: row.reply_to_email ?? "",
    signature: row.signature ?? "",
    providerConfig,
    active: row.active,
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
    metadata: { section: "card4-communication-channels", ...metadata } as unknown as Json,
  });
  if (result.error) {
    console.error("[card4-communication-channels] audit", result.error.message);
  }
}

async function loadPropertyName(db: DbClient, restaurantId: string): Promise<string> {
  const result = await db.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Property not found.");
  return String(result.data.name ?? "").trim() || "Noru PMS";
}

async function loadRows(db: DbClient, restaurantId: string) {
  return db
    .from("pms_communication_channels")
    .select(
      "id, channel_type, provider, auth_method, sender_name, sender_email, reply_to_email, signature, provider_config, active, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at");
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<CommunicationChannelsSnapshot> {
  const propertyName = await loadPropertyName(db, restaurantId);
  let result = await loadRows(db, restaurantId);
  if (result.error) unavailable(result.error);
  const existingTypes = new Set(
    (result.data ?? []).map((row: { channel_type: string }) => row.channel_type),
  );
  const missing = DEFAULT_COMMUNICATION_CHANNELS.filter(
    (row) => !existingTypes.has(row.channelType),
  );
  if (missing.length > 0) {
    const inserted = await db.from("pms_communication_channels").insert(
      missing.map((row) => ({
        restaurant_id: restaurantId,
        channel_type: row.channelType,
        provider: row.provider,
        auth_method: row.authMethod,
        sender_name: propertyName,
        active: false,
      })),
    );
    if (inserted.error && inserted.error.code !== "23505") unavailable(inserted.error);
    result = await loadRows(db, restaurantId);
    if (result.error) unavailable(result.error);
  }
  const channels = (result.data ?? []).map(mapChannel);
  const ordered = COMMUNICATION_CHANNEL_TYPES.flatMap((channelType) =>
    channels.filter((row) => row.channelType === channelType),
  );
  const lastUpdatedAt = ordered.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { channels: ordered, lastUpdatedAt };
}

async function requireOwnChannel(
  db: DbClient,
  restaurantId: string,
  id: string,
): Promise<CommunicationChannelRecord> {
  const result = await db
    .from("pms_communication_channels")
    .select(
      "id, channel_type, provider, auth_method, sender_name, sender_email, reply_to_email, signature, provider_config, active, created_at, updated_at",
    )
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Communication channel not found.");
  return mapChannel(result.data);
}

export const getPmsCard4CommunicationChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4CommunicationChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const existing = data.id ? await requireOwnChannel(db, data.restaurantId, data.id) : null;
    if (existing && existing.channelType !== data.channelType) {
      throw new Error("The channel type cannot be changed after it is created.");
    }
    const providerConfig = sanitizeCommunicationProviderConfig(
      data.channelType,
      data.provider,
      data.providerConfig,
    );
    const draft = {
      id: data.id ?? null,
      channelType: data.channelType,
      provider: data.provider,
      authMethod: data.authMethod,
      senderName: data.senderName,
      senderEmail: data.channelType === "email" ? data.senderEmail : "",
      replyToEmail: data.channelType === "email" ? data.replyToEmail : "",
      signature: data.signature,
      providerValues: providerConfig,
      active: data.active,
    };
    const errors = validateCommunicationChannelDraft(draft, snapshot.channels);
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the communication channel before saving.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      channel_type: data.channelType,
      provider: data.provider,
      auth_method: data.authMethod,
      sender_name: data.senderName.trim(),
      sender_email: data.channelType === "email" ? data.senderEmail.trim() || null : null,
      reply_to_email: data.channelType === "email" ? data.replyToEmail.trim() || null : null,
      signature: data.signature.trim() || null,
      provider_config: providerConfig as unknown as Json,
      active: data.active,
      updated_by: context.userId,
    };
    const result = existing
      ? await db
          .from("pms_communication_channels")
          .update(payload)
          .eq("id", existing.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_communication_channels").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This communication channel is already configured.");
    }
    if (result.error?.code === "23514") {
      throw new Error("The communication channel contains invalid or sensitive settings.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the communication channel.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_communication_channel_saved",
      {
        id,
        channelType: data.channelType,
        provider: data.provider,
        active: data.active,
      },
    );
    return { ok: true as const, id };
  });

export const setPmsCard4CommunicationChannelActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        active: z.boolean(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnChannel(db, data.restaurantId, data.id);
    if (data.active) {
      const snapshot = await loadSnapshot(db, data.restaurantId);
      const errors = validateCommunicationChannelDraft(
        { ...communicationChannelToDraft(existing), active: true },
        snapshot.channels,
      );
      if (errors.length > 0) {
        throw new Error(
          errors[0]?.message ?? "Complete this communication channel before activating it.",
        );
      }
    }
    const result = await db
      .from("pms_communication_channels")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Communication channel not found.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_communication_channel_toggled",
      { id: data.id, active: data.active },
    );
    return { ok: true as const };
  });

export const testPmsCard4CommunicationChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    saveSchema
      .omit({ id: true, active: true, providerConfig: true })
      .extend({ sessionValues: providerConfigSchema })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const outcome = validateConnectionTest({
      id: null,
      channelType: data.channelType,
      provider: data.provider,
      authMethod: data.authMethod,
      senderName: data.senderName,
      senderEmail: data.senderEmail,
      replyToEmail: data.replyToEmail,
      signature: data.signature,
      providerValues: data.sessionValues,
      active: true,
    });
    return outcome;
  });

export { loadSnapshot as loadPmsCard4CommunicationChannelsSnapshot };
