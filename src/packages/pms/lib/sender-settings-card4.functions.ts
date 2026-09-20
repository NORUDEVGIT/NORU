import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  COMMUNICATION_CHANNEL_TYPES,
  communicationChannelToDraft,
  isIntegrationAuthMethod,
  sanitizeCommunicationProviderConfig,
  validateCommunicationChannelDraft,
  validateConnectionTest,
  type CommunicationChannelRecord,
  type CommunicationChannelType,
  type CommunicationProviderConfig,
} from "./communication-channels-card4.server";
import { INTEGRATION_AUTH_METHODS } from "./integrations-catalog";
import { SECRET_KEY_PATTERN } from "./integrations-card6.server";
import { requireRoomManager } from "./rooms.server";
import { type SenderSettingsRecord, type SenderSettingsSnapshot } from "./sender-settings-card4.server";

// Generated schema predates 0093.
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

const SENDER_SELECT =
  "id, channel_type, provider, auth_method, sender_name, sender_email, reply_to_email, signature, provider_config, active, created_at, updated_at";

function redactSecrets(message: string): string {
  return message.replace(SECRET_KEY_PATTERN, "[redacted]");
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Sender settings are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(redactSecrets(error?.message ?? "Unable to load sender settings."));
}

function mapSetting(row: {
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
}): SenderSettingsRecord {
  if (!COMMUNICATION_CHANNEL_TYPES.includes(row.channel_type as CommunicationChannelType)) {
    throw new Error("A stored sender setting has an unsupported channel.");
  }
  if (!isIntegrationAuthMethod(row.auth_method)) {
    throw new Error("A stored sender setting has an unsupported authentication method.");
  }
  const rawConfig =
    row.provider_config &&
    typeof row.provider_config === "object" &&
    !Array.isArray(row.provider_config)
      ? (row.provider_config as Record<string, unknown>)
      : {};
  const unsanitized: CommunicationProviderConfig = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      unsanitized[key] = value;
    }
  }
  const providerConfig = sanitizeCommunicationProviderConfig(
    row.channel_type as CommunicationChannelType,
    row.provider,
    unsanitized,
  );
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
    metadata: { section: "card4-sender-settings", ...metadata } as unknown as Json,
  });
  if (result.error) {
    console.error("[card4-sender-settings] audit", redactSecrets(result.error.message));
  }
}

async function loadChannelRows(db: DbClient, restaurantId: string) {
  return db
    .from("pms_communication_channels")
    .select(SENDER_SELECT)
    .eq("restaurant_id", restaurantId)
    .order("created_at");
}

async function loadSettingRows(db: DbClient, restaurantId: string) {
  return db
    .from("pms_communication_sender_settings")
    .select(SENDER_SELECT)
    .eq("restaurant_id", restaurantId)
    .order("created_at");
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<SenderSettingsSnapshot> {
  const channelsResult = await loadChannelRows(db, restaurantId);
  if (channelsResult.error) unavailable(channelsResult.error);
  const channels = (channelsResult.data ?? []) as Array<{
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
  }>;

  let settingsResult = await loadSettingRows(db, restaurantId);
  if (settingsResult.error) unavailable(settingsResult.error);
  const existingTypes = new Set(
    (settingsResult.data ?? []).map((row: { channel_type: string }) => row.channel_type),
  );
  const missing = channels.filter((row) => !existingTypes.has(row.channel_type));
  if (missing.length > 0) {
    const inserted = await db.from("pms_communication_sender_settings").insert(
      missing.map((row) => ({
        restaurant_id: restaurantId,
        channel_type: row.channel_type,
        provider: row.provider,
        auth_method: row.auth_method,
        sender_name: row.sender_name,
        sender_email: row.sender_email,
        reply_to_email: row.reply_to_email,
        signature: row.signature,
        provider_config: sanitizeCommunicationProviderConfig(
          row.channel_type as CommunicationChannelType,
          row.provider,
          mapSetting(row).providerConfig,
        ),
        active: row.active,
      })),
    );
    if (inserted.error && inserted.error.code !== "23505") unavailable(inserted.error);
    settingsResult = await loadSettingRows(db, restaurantId);
    if (settingsResult.error) unavailable(settingsResult.error);
  }

  const settings = (settingsResult.data ?? []).map(mapSetting);
  const ordered = COMMUNICATION_CHANNEL_TYPES.flatMap((channelType) =>
    settings.filter((row) => row.channelType === channelType),
  );
  const lastUpdatedAt = ordered.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { settings: ordered, lastUpdatedAt };
}

async function requireOwnSetting(
  db: DbClient,
  restaurantId: string,
  id: string,
): Promise<SenderSettingsRecord> {
  const result = await db
    .from("pms_communication_sender_settings")
    .select(SENDER_SELECT)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("Sender settings not found.");
  return mapSetting(result.data);
}

function nonSecretPayload(data: z.infer<typeof saveSchema>, userId: string) {
  const providerConfig = sanitizeCommunicationProviderConfig(
    data.channelType,
    data.provider,
    data.providerConfig,
  );
  return {
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
    updated_by: userId,
  };
}

export const getPmsCard4SenderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4SenderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const existing = data.id ? await requireOwnSetting(db, data.restaurantId, data.id) : null;
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
    const errors = validateCommunicationChannelDraft(draft, snapshot.settings);
    if (errors.length > 0) {
      throw new Error(redactSecrets(errors[0]?.message ?? "Fix sender settings before saving."));
    }
    const payload = nonSecretPayload(data, context.userId);
    const result = existing
      ? await db
          .from("pms_communication_sender_settings")
          .update(payload)
          .eq("id", existing.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_communication_sender_settings").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("Sender settings for this channel are already configured.");
    }
    if (result.error?.code === "23514") {
      throw new Error("Sender settings contain invalid or sensitive values.");
    }
    if (result.error?.code === "23503") {
      throw new Error("Configure the matching communication channel before saving sender settings.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save sender settings.");

    const channelUpdate = await db
      .from("pms_communication_channels")
      .update({
        provider: payload.provider,
        auth_method: payload.auth_method,
        sender_name: payload.sender_name,
        sender_email: payload.sender_email,
        reply_to_email: payload.reply_to_email,
        signature: payload.signature,
        provider_config: payload.provider_config,
        active: payload.active,
        updated_by: context.userId,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("channel_type", data.channelType)
      .select("id")
      .maybeSingle();
    if (channelUpdate.error) unavailable(channelUpdate.error);
    if (!channelUpdate.data) {
      throw new Error("Configure the matching communication channel before saving sender settings.");
    }

    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_sender_settings_saved", {
      id,
      channelType: data.channelType,
      provider: data.provider,
      active: data.active,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4SenderSettingsActive = createServerFn({ method: "POST" })
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
    const existing = await requireOwnSetting(db, data.restaurantId, data.id);
    if (data.active) {
      const snapshot = await loadSnapshot(db, data.restaurantId);
      const errors = validateCommunicationChannelDraft(
        { ...communicationChannelToDraft(existing), active: true },
        snapshot.settings,
      );
      if (errors.length > 0) {
        throw new Error(
          redactSecrets(errors[0]?.message ?? "Complete sender settings before activating."),
        );
      }
    }
    const result = await db
      .from("pms_communication_sender_settings")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("Sender settings not found.");
    const channelUpdate = await db
      .from("pms_communication_channels")
      .update({ active: data.active, updated_by: context.userId })
      .eq("restaurant_id", data.restaurantId)
      .eq("channel_type", existing.channelType)
      .select("id")
      .maybeSingle();
    if (channelUpdate.error) unavailable(channelUpdate.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_sender_settings_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const testPmsCard4SenderSettings = createServerFn({ method: "POST" })
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

export { loadSnapshot as loadPmsCard4SenderSettingsSnapshot };
