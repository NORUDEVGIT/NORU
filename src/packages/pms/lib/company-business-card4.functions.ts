import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_BUSINESS_CONTACT_ROLES,
  DEFAULT_BUSINESS_FIELDS,
  DEFAULT_BUSINESS_PROFILE_TYPES,
  emptyBusinessSettings,
  normalizeBusinessTypeCode,
  normalizeBusinessTypeName,
  settingsDefaultInvalid,
  staleRequiredFieldIds,
  validateBusinessSettings,
  validateBusinessTypeDraft,
  validateContactRoleDraft,
  type BusinessContactRoleRecord,
  type BusinessFieldOption,
  type BusinessProfileSettings,
  type BusinessProfileSnapshot,
  type BusinessProfileTypeRecord,
} from "./company-business-card4.server";

// Generated schema predates 0082.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const typeSaveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().max(80),
    code: z.string().max(12),
    description: z.string().max(400).optional().default(""),
    active: z.boolean(),
    requiredFieldIds: z.array(idSchema).max(40),
    taxIdRequired: z.boolean(),
    contactRequired: z.boolean(),
    creditAccountAllowed: z.boolean(),
  })
  .strict();

const settingsSaveSchema = z
  .object({
    restaurantId: idSchema,
    enabled: z.boolean(),
    defaultBusinessTypeId: idSchema.nullable(),
    autoApproval: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Company & Business is unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Unable to load business profile settings.");
}

function mapType(
  row: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    active: boolean;
    required_field_ids: string[] | null;
    tax_id_required: boolean;
    contact_required: boolean;
    credit_account_allowed: boolean;
    created_at: string;
    updated_at: string;
  },
  fields: BusinessFieldOption[],
): BusinessProfileTypeRecord {
  const requiredFieldIds = row.required_field_ids ?? [];
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    requiredFieldIds,
    staleRequiredFieldIds: staleRequiredFieldIds(requiredFieldIds, fields),
    taxIdRequired: row.tax_id_required,
    contactRequired: row.contact_required,
    creditAccountAllowed: row.credit_account_allowed,
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
    metadata: { section: "card4-company-business", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-company-business] audit", result.error.message);
}

async function loadFields(db: DbClient, restaurantId: string): Promise<BusinessFieldOption[]> {
  const result = await db
    .from("pms_guest_fields")
    .select("id, name, code, active")
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
  if (result.error && result.error.code !== "42P01") unavailable(result.error);
  return (result.data ?? []) as BusinessFieldOption[];
}

async function ensureBusinessFields(
  db: DbClient,
  restaurantId: string,
  userId: string,
): Promise<BusinessFieldOption[]> {
  const fields = await loadFields(db, restaurantId);
  const codes = new Set(fields.map((row) => row.code));
  const names = new Set(fields.map((row) => row.name.toLowerCase()));
  const missing = DEFAULT_BUSINESS_FIELDS.filter(
    (row) => !codes.has(row.code) && !names.has(row.name.toLowerCase()),
  );
  if (missing.length === 0) return fields;
  const startOrder = fields.length;
  const payload = missing.map((row, index) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    field_type: row.fieldType,
    description: null,
    options: [],
    required: false,
    check_in: true,
    reservation: true,
    active: true,
    display_order: startOrder + index,
    lookup_source: null,
    document_type_ids: [],
    min_value: null,
    max_value: null,
    updated_by: userId,
  }));
  const result = await db.from("pms_guest_fields").insert(payload);
  if (result.error && result.error.code !== "23505" && result.error.code !== "42P01") {
    unavailable(result.error);
  }
  return loadFields(db, restaurantId);
}

async function seedTypes(
  db: DbClient,
  restaurantId: string,
  userId: string,
  fields: BusinessFieldOption[],
) {
  const seedFieldIds = DEFAULT_BUSINESS_FIELDS.map(
    (row) => fields.find((field) => field.code === row.code)?.id,
  ).filter((id): id is string => Boolean(id));
  const payload = DEFAULT_BUSINESS_PROFILE_TYPES.map((row) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    description: row.description,
    active: true,
    required_field_ids: seedFieldIds,
    tax_id_required: row.taxIdRequired,
    contact_required: row.contactRequired,
    credit_account_allowed: row.creditAccountAllowed,
    updated_by: userId,
  }));
  const result = await db.from("pms_business_profile_types").insert(payload);
  if (result.error && result.error.code !== "23505") unavailable(result.error);
}

async function upsertSettings(
  db: DbClient,
  restaurantId: string,
  userId: string,
  patch: {
    enabled: boolean;
    defaultBusinessTypeId: string | null;
    autoApproval: boolean;
  },
) {
  const payload = {
    restaurant_id: restaurantId,
    enabled: patch.enabled,
    default_business_type_id: patch.defaultBusinessTypeId,
    auto_approval: patch.autoApproval,
    updated_by: userId,
  };
  const existing = await db
    .from("pms_business_profile_settings")
    .select("restaurant_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (existing.error) unavailable(existing.error);
  const result = existing.data
    ? await db
        .from("pms_business_profile_settings")
        .update(payload)
        .eq("restaurant_id", restaurantId)
    : await db.from("pms_business_profile_settings").insert(payload);
  if (result.error) unavailable(result.error);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  seeded = false,
): Promise<BusinessProfileSnapshot> {
  const fields = await ensureBusinessFields(db, restaurantId, userId);
  const typesRes = await db
    .from("pms_business_profile_types")
    .select(
      "id, name, code, description, active, required_field_ids, tax_id_required, contact_required, credit_account_allowed, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (typesRes.error) unavailable(typesRes.error);

  if ((typesRes.data ?? []).length === 0) {
    if (seeded) throw new Error("Could not seed default business types.");
    await seedTypes(db, restaurantId, userId, fields);
    return loadSnapshot(db, restaurantId, userId, true);
  }

  const types = (typesRes.data ?? []).map((row) => mapType(row, fields));
  const settingsRes = await db
    .from("pms_business_profile_settings")
    .select("enabled, default_business_type_id, auto_approval, updated_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (settingsRes.error) unavailable(settingsRes.error);

  let settings: BusinessProfileSettings;
  let settingsUpdatedAt: string | null = null;
  if (!settingsRes.data) {
    const defaultType =
      types.find((row) => row.active && row.code === "CORP") ?? types.find((row) => row.active);
    await upsertSettings(db, restaurantId, userId, {
      enabled: true,
      defaultBusinessTypeId: defaultType?.id ?? null,
      autoApproval: false,
    });
    if (!seeded) return loadSnapshot(db, restaurantId, userId, true);
    settings = {
      enabled: true,
      defaultBusinessTypeId: defaultType?.id ?? null,
      autoApproval: false,
      defaultInvalid: settingsDefaultInvalid(defaultType?.id ?? null, types, true),
    };
  } else {
    settingsUpdatedAt = settingsRes.data.updated_at as string;
    const defaultBusinessTypeId = settingsRes.data.default_business_type_id as string | null;
    const enabled = settingsRes.data.enabled as boolean;
    settings = {
      enabled,
      defaultBusinessTypeId,
      autoApproval: settingsRes.data.auto_approval as boolean,
      defaultInvalid: settingsDefaultInvalid(defaultBusinessTypeId, types, enabled),
    };
  }

  const timestamps = [
    ...types.map((row) => row.updatedAt),
    ...(settingsUpdatedAt ? [settingsUpdatedAt] : []),
  ];
  const lastUpdatedAt = timestamps.reduce<string | null>((latest, value) => {
    if (!latest || value > latest) return value;
    return latest;
  }, null);

  const rolesRes = await db
    .from("pms_business_contact_roles")
    .select("id, name, code, active, created_at, updated_at")
    .eq("restaurant_id", restaurantId)
    .order("name");
  let roles: BusinessContactRoleRecord[] = [];
  if (!rolesRes.error) {
    if ((rolesRes.data ?? []).length === 0) {
      await db.from("pms_business_contact_roles").insert(
        DEFAULT_BUSINESS_CONTACT_ROLES.map((row) => ({
          restaurant_id: restaurantId,
          name: row.name,
          code: row.code,
          active: true,
          updated_by: userId,
        })),
      );
      const seeded = await db
        .from("pms_business_contact_roles")
        .select("id, name, code, active, created_at, updated_at")
        .eq("restaurant_id", restaurantId)
        .order("name");
      roles = ((seeded.data ?? []) as Array<{
        id: string;
        name: string;
        code: string;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } else {
      roles = (rolesRes.data as Array<{
        id: string;
        name: string;
        code: string;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    }
  }

  return { types, settings, fields, roles, lastUpdatedAt };
}

export const getPmsCard4CompanyBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4BusinessType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => typeSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const name = normalizeBusinessTypeName(data.name);
    const code = normalizeBusinessTypeCode(data.code);
    const draft = {
      id: data.id ?? null,
      name,
      code,
      description: data.description,
      active: data.active,
      requiredFieldIds: data.requiredFieldIds,
      taxIdRequired: data.taxIdRequired,
      contactRequired: data.contactRequired,
      creditAccountAllowed: data.creditAccountAllowed,
    };
    const errors = validateBusinessTypeDraft(draft, snapshot.types, snapshot.fields);
    if (errors.length > 0)
      throw new Error(errors[0]?.message ?? "Fix the business type before saving.");

    if (data.id && !data.active && snapshot.settings.defaultBusinessTypeId === data.id) {
      throw new Error(
        "This type is the default business type. Choose another active default before disabling it.",
      );
    }

    const payload = {
      restaurant_id: data.restaurantId,
      name,
      code,
      description: data.description.trim() || null,
      active: data.active,
      required_field_ids: data.requiredFieldIds,
      tax_id_required: data.taxIdRequired,
      contact_required: data.contactRequired,
      credit_account_allowed: data.creditAccountAllowed,
      updated_by: context.userId,
    };

    const result = data.id
      ? await db
          .from("pms_business_profile_types")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_business_profile_types").insert(payload).select("id").single();
    if (result.error?.code === "23505") {
      throw new Error("This code is already in use.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the business type.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_business_type_saved", {
      id,
      code,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4BusinessTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    if (!data.active && snapshot.settings.defaultBusinessTypeId === data.id) {
      throw new Error(
        "This type is the default business type. Choose another active default before disabling it.",
      );
    }
    const result = await db
      .from("pms_business_profile_types")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_business_type_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const deletePmsCard4BusinessType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    if (snapshot.settings.defaultBusinessTypeId === data.id) {
      throw new Error(
        "This type is the default business type. Choose another default before deleting it.",
      );
    }
    const result = await db
      .from("pms_business_profile_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_business_type_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });

export const savePmsCard4BusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const errors = validateBusinessSettings(
      {
        enabled: data.enabled,
        defaultBusinessTypeId: data.defaultBusinessTypeId,
      },
      snapshot.types,
    );
    if (errors.length > 0)
      throw new Error(errors[0]?.message ?? "Fix business settings before saving.");
    await upsertSettings(db, data.restaurantId, context.userId, {
      enabled: data.enabled,
      defaultBusinessTypeId: data.enabled ? data.defaultBusinessTypeId : data.defaultBusinessTypeId,
      autoApproval: data.autoApproval,
    });
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_business_settings_saved", {
      enabled: data.enabled,
      defaultBusinessTypeId: data.defaultBusinessTypeId,
      autoApproval: data.autoApproval,
    });
    return { ok: true as const };
  });

const roleSaveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().max(80),
    code: z.string().max(12),
    active: z.boolean(),
  })
  .strict();

export const savePmsCard4ContactRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const name = normalizeBusinessTypeName(data.name);
    const code = normalizeBusinessTypeCode(data.code);
    const errors = validateContactRoleDraft(
      { id: data.id ?? null, name, code, active: data.active },
      snapshot.roles,
    );
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Fix the contact role before saving.");
    const payload = {
      restaurant_id: data.restaurantId,
      name,
      code,
      active: data.active,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db.from("pms_business_contact_roles").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await db.from("pms_business_contact_roles").insert(payload).select("id").single();
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_contact_role_saved", {
      id: data.id ?? (result.data as { id?: string } | null)?.id,
      code,
    });
    return { ok: true as const };
  });

export const setPmsCard4ContactRoleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_business_contact_roles")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_contact_role_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });
