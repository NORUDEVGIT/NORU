import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_GUEST_FIELDS,
  flagsForActiveChange,
  isGuestFieldType,
  isLookupSource,
  normalizeGuestFieldCode,
  normalizeGuestFieldName,
  normalizeGuestFieldOptions,
  validateGuestFieldDraft,
  type GuestFieldLookupSource,
  type GuestFieldOption,
  type GuestFieldRecord,
  type GuestFieldSnapshot,
  type GuestFieldType,
  type NamedOption,
} from "./required-fields-card4.server";

// Generated schema predates 0078.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const optionSchema = z
  .object({
    id: z.string().max(80),
    label: z.string().max(80),
    value: z.string().max(80),
    active: z.boolean(),
    displayOrder: z.number().int().min(0).max(999),
  })
  .strict();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().max(80),
    code: z.string().max(32),
    fieldType: z.enum([
      "text",
      "phone",
      "email",
      "number",
      "date",
      "select",
      "multi_select",
      "document",
      "address",
      "lookup",
    ]),
    description: z.string().max(400).optional().default(""),
    options: z.array(optionSchema).max(80),
    required: z.boolean(),
    checkIn: z.boolean(),
    reservation: z.boolean(),
    active: z.boolean(),
    lookupSource: z.enum(["company", "travel_agent", "group"]).nullable(),
    documentTypeIds: z.array(idSchema).max(40),
    minValue: z.number().nullable(),
    maxValue: z.number().nullable(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Required fields are unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Required fields are unavailable.");
}

function mapRow(row: {
  id: string;
  name: string;
  code: string;
  field_type: string;
  description: string | null;
  options: unknown;
  required: boolean;
  check_in: boolean;
  reservation: boolean;
  active: boolean;
  display_order: number;
  lookup_source: string | null;
  document_type_ids: string[] | null;
  min_value: number | string | null;
  max_value: number | string | null;
  created_at: string;
  updated_at: string;
}): GuestFieldRecord {
  const minRaw = row.min_value;
  const maxRaw = row.max_value;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    fieldType: isGuestFieldType(row.field_type) ? row.field_type : "text",
    description: row.description,
    options: normalizeGuestFieldOptions(row.options),
    required: row.required,
    checkIn: row.check_in,
    reservation: row.reservation,
    active: row.active,
    displayOrder: row.display_order,
    lookupSource: isLookupSource(row.lookup_source) ? row.lookup_source : null,
    documentTypeIds: row.document_type_ids ?? [],
    minValue: minRaw == null || minRaw === "" ? null : Number(minRaw),
    maxValue: maxRaw == null || maxRaw === "" ? null : Number(maxRaw),
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
    metadata: { section: "card4-required-fields", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-required-fields] audit", result.error.message);
}

function seedOptionRows(options: Array<{ label: string; value: string }>): GuestFieldOption[] {
  return options.map((row, index) => ({
    id: `seed-${row.value.toLowerCase()}`,
    label: row.label,
    value: row.value,
    active: true,
    displayOrder: index,
  }));
}

async function seedDefaults(db: DbClient, restaurantId: string, userId: string) {
  const payload = DEFAULT_GUEST_FIELDS.map((row, index) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    field_type: row.fieldType,
    description: null,
    options: seedOptionRows(row.options),
    required: row.required,
    check_in: row.checkIn,
    reservation: row.reservation,
    active: true,
    display_order: index,
    lookup_source: row.lookupSource,
    document_type_ids: [],
    min_value: null,
    max_value: null,
    updated_by: userId,
  }));
  const result = await db.from("pms_guest_fields").insert(payload);
  if (result.error && result.error.code !== "23505") unavailable(result.error);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  seeded = false,
): Promise<GuestFieldSnapshot> {
  const fieldsRes = await db
    .from("pms_guest_fields")
    .select(
      "id, name, code, field_type, description, options, required, check_in, reservation, active, display_order, lookup_source, document_type_ids, min_value, max_value, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
  if (fieldsRes.error) unavailable(fieldsRes.error);

  if ((fieldsRes.data ?? []).length === 0) {
    if (seeded) throw new Error("Could not seed default guest fields.");
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

  const fields = (fieldsRes.data ?? []).map(mapRow);
  const lastUpdatedAt = fields.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);

  return { fields, documentTypes, lastUpdatedAt };
}

export const getPmsCard4RequiredFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4RequiredField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const name = normalizeGuestFieldName(data.name);
    const code = normalizeGuestFieldCode(data.code);
    const flags = flagsForActiveChange(data.active, data.required);
    const options =
      data.fieldType === "select" || data.fieldType === "multi_select"
        ? data.options.filter((row) => row.label.trim() && row.value.trim())
        : [];
    const lookupSource: GuestFieldLookupSource | null =
      data.fieldType === "lookup" && isLookupSource(data.lookupSource) ? data.lookupSource : null;
    const errors = validateGuestFieldDraft(
      {
        id: data.id ?? null,
        name,
        code,
        fieldType: data.fieldType,
        description: data.description,
        options,
        required: flags.required,
        checkIn: data.checkIn,
        reservation: data.reservation,
        active: flags.active,
        lookupSource,
        documentTypeIds: data.fieldType === "document" ? data.documentTypeIds : [],
        minValue: data.fieldType === "number" ? data.minValue : null,
        maxValue: data.fieldType === "number" ? data.maxValue : null,
      },
      snapshot.fields,
    );
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Fix the field before saving.");

    const nextOrder =
      data.id != null
        ? (snapshot.fields.find((row) => row.id === data.id)?.displayOrder ??
          snapshot.fields.length)
        : snapshot.fields.length;

    const payload = {
      restaurant_id: data.restaurantId,
      name,
      code,
      field_type: data.fieldType as GuestFieldType,
      description: data.description.trim() || null,
      options,
      required: flags.required,
      check_in: data.checkIn,
      reservation: data.reservation,
      active: flags.active,
      display_order: nextOrder,
      lookup_source: lookupSource,
      document_type_ids: data.fieldType === "document" ? data.documentTypeIds : [],
      min_value: data.fieldType === "number" ? data.minValue : null,
      max_value: data.fieldType === "number" ? data.maxValue : null,
      updated_by: context.userId,
    };

    let id = data.id;
    if (data.id) {
      const result = await db
        .from("pms_guest_fields")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505")
        throw new Error("A field with this name or code already exists.");
      if (result.error) unavailable(result.error);
      id = result.data?.id;
    } else {
      const result = await db.from("pms_guest_fields").insert(payload).select("id").maybeSingle();
      if (result.error?.code === "23505")
        throw new Error("A field with this name or code already exists.");
      if (result.error) unavailable(result.error);
      id = result.data?.id;
    }
    if (!id) throw new Error("Could not save the field.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_guest_field_saved", {
      id,
      code,
    });
    const next = await loadSnapshot(db, data.restaurantId, context.userId);
    return {
      ok: true as const,
      field: next.fields.find((row) => row.id === id) ?? null,
      snapshot: next,
    };
  });

export const setPmsCard4RequiredFieldFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        required: z.boolean().optional(),
        checkIn: z.boolean().optional(),
        reservation: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const current = await db
      .from("pms_guest_fields")
      .select("id, required, check_in, reservation, active")
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (current.error) unavailable(current.error);
    if (!current.data) throw new Error("That field no longer exists.");
    const active = data.active ?? current.data.active;
    const required = flagsForActiveChange(active, data.required ?? current.data.required).required;
    if (!active && required) throw new Error("An inactive field cannot be required.");
    const patch = {
      required,
      check_in: data.checkIn ?? current.data.check_in,
      reservation: data.reservation ?? current.data.reservation,
      active,
      updated_by: context.userId,
    };
    const result = await db
      .from("pms_guest_fields")
      .update(patch)
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_guest_field_toggled", {
      id: data.id,
      ...patch,
    });
    return { ok: true as const };
  });

export const reorderPmsCard4RequiredFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, ids: z.array(idSchema).min(1).max(80) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const unique = [...new Set(data.ids)];
    if (unique.length !== data.ids.length) throw new Error("Every field must have a unique order.");
    for (const [index, id] of data.ids.entries()) {
      const result = await supabaseAdmin
        .from("pms_guest_fields")
        .update({ display_order: index, updated_by: context.userId })
        .eq("id", id)
        .eq("restaurant_id", data.restaurantId);
      if (result.error) unavailable(result.error);
    }
    await writeAudit(
      supabaseAdmin,
      data.restaurantId,
      context.userId,
      "pms_card4_guest_fields_reordered",
      {
        ids: data.ids,
      },
    );
    return { ok: true as const };
  });

export const deletePmsCard4RequiredField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const referenced = await supabaseAdmin
      .from("pms_guest_profile_types")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .contains("required_field_ids", [data.id])
      .limit(1);
    if (referenced.error && referenced.error.code !== "42P01") unavailable(referenced.error);
    if ((referenced.data ?? []).length > 0) {
      throw new Error("This field is used by a profile type. Disable it instead of deleting.");
    }
    const result = await supabaseAdmin
      .from("pms_guest_fields")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(
      supabaseAdmin,
      data.restaurantId,
      context.userId,
      "pms_card4_guest_field_deleted",
      {
        id: data.id,
      },
    );
    return { ok: true as const };
  });
