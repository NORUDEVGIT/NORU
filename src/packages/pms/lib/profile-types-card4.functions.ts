import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_PROFILE_TYPES,
  EMPTY_PROFILE_TYPE_DEFAULTS,
  PROFILE_TYPE_ICONS,
  isProfileTypeIcon,
  normalizeProfileTypeCode,
  normalizeProfileTypeDefaults,
  normalizeProfileTypeName,
  validateProfileTypeDraft,
  type NamedOption,
  type ProfileTypeRecord,
  type ProfileTypeSnapshot,
} from "./profile-types-card4.server";

// Generated schema predates 0077.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const defaultsSchema = z
  .object({
    countryId: z.string().trim().max(8).nullable(),
    languageId: z.string().trim().max(16).nullable(),
    currencyId: z.string().trim().max(8).nullable(),
    communicationChannelId: z.string().trim().max(24).nullable(),
    guestTypeId: z.string().trim().max(16).nullable(),
  })
  .strict();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().max(80),
    code: z.string().max(12),
    description: z.string().max(400).optional().default(""),
    icon: z.enum(PROFILE_TYPE_ICONS),
    active: z.boolean(),
    requiredFieldIds: z.array(z.string().max(40)).max(40),
    documentTypeIds: z.array(idSchema).max(40),
    preferenceTypeIds: z.array(z.string().max(40)).max(40),
    defaults: defaultsSchema,
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Profile types are unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Profile types are unavailable.");
}

function mapRow(row: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  icon: string;
  active: boolean;
  required_field_ids: string[] | null;
  document_type_ids: string[] | null;
  preference_type_ids: string[] | null;
  defaults: unknown;
  created_at: string;
  updated_at: string;
}): ProfileTypeRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    icon: isProfileTypeIcon(row.icon) ? row.icon : "user",
    active: row.active,
    requiredFieldIds: row.required_field_ids ?? [],
    documentTypeIds: row.document_type_ids ?? [],
    preferenceTypeIds: row.preference_type_ids ?? [],
    defaults: normalizeProfileTypeDefaults(row.defaults),
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
    metadata: { section: "card4-profile-types", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-profile-types] audit", result.error.message);
}

async function seedDefaults(db: DbClient, restaurantId: string, userId: string) {
  const payload = DEFAULT_PROFILE_TYPES.map((row) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    description: row.description,
    icon: row.icon,
    active: true,
    required_field_ids: [],
    document_type_ids: [],
    preference_type_ids: [],
    defaults: EMPTY_PROFILE_TYPE_DEFAULTS,
    updated_by: userId,
  }));
  const result = await db.from("pms_guest_profile_types").insert(payload);
  if (result.error && result.error.code !== "23505") unavailable(result.error);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  seeded = false,
): Promise<ProfileTypeSnapshot> {
  const typesRes = await db
    .from("pms_guest_profile_types")
    .select(
      "id, name, code, description, icon, active, required_field_ids, document_type_ids, preference_type_ids, defaults, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (typesRes.error) unavailable(typesRes.error);

  if ((typesRes.data ?? []).length === 0) {
    if (seeded) throw new Error("Could not seed default profile types.");
    await seedDefaults(db, restaurantId, userId);
    return loadSnapshot(db, restaurantId, userId, true);
  }

  const docsRes = await db
    .from("pms_guest_id_types")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("name");
  const documentTypes: NamedOption[] = docsRes.error ? [] : (docsRes.data ?? []);

  const types = (typesRes.data ?? []).map(mapRow);
  const lastUpdatedAt = types.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);

  return { types, documentTypes, lastUpdatedAt };
}

export const getPmsCard4ProfileTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4ProfileType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const name = normalizeProfileTypeName(data.name);
    const code = normalizeProfileTypeCode(data.code);
    const errors = validateProfileTypeDraft(
      {
        id: data.id ?? null,
        name,
        code,
        description: data.description,
        icon: data.icon,
        active: data.active,
        requiredFieldIds: data.requiredFieldIds,
        documentTypeIds: data.documentTypeIds,
        preferenceTypeIds: data.preferenceTypeIds,
        defaults: data.defaults,
      },
      snapshot.types,
    );
    if (errors.length > 0)
      throw new Error(errors[0]?.message ?? "Fix the profile type before saving.");

    const payload = {
      restaurant_id: data.restaurantId,
      name,
      code,
      description: data.description.trim() || null,
      icon: data.icon,
      active: data.active,
      required_field_ids: data.requiredFieldIds,
      document_type_ids: data.documentTypeIds,
      preference_type_ids: data.preferenceTypeIds,
      defaults: data.defaults,
      updated_by: context.userId,
    };

    let id = data.id;
    if (data.id) {
      const result = await db
        .from("pms_guest_profile_types")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505")
        throw new Error("A profile type with this name or code already exists.");
      if (result.error) unavailable(result.error);
      id = result.data?.id;
    } else {
      const result = await db
        .from("pms_guest_profile_types")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505")
        throw new Error("A profile type with this name or code already exists.");
      if (result.error) unavailable(result.error);
      id = result.data?.id;
    }
    if (!id) throw new Error("Could not save the profile type.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_profile_type_saved", {
      id,
      code,
    });
    const next = await loadSnapshot(db, data.restaurantId, context.userId);
    return {
      ok: true as const,
      type: next.types.find((row) => row.id === id) ?? null,
      snapshot: next,
    };
  });

export const setPmsCard4ProfileTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("pms_guest_profile_types")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    if (!result.data) throw new Error("That profile type no longer exists.");
    await writeAudit(
      supabaseAdmin,
      data.restaurantId,
      context.userId,
      "pms_card4_profile_type_toggled",
      {
        id: data.id,
        active: data.active,
      },
    );
    return { ok: true as const };
  });

export const deletePmsCard4ProfileType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("pms_guest_profile_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(
      supabaseAdmin,
      data.restaurantId,
      context.userId,
      "pms_card4_profile_type_deleted",
      {
        id: data.id,
      },
    );
    return { ok: true as const };
  });
