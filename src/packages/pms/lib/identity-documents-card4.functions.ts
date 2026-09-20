import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import {
  DEFAULT_IDENTITY_DOCUMENT_TYPES,
  identityDocumentFlagsForActiveChange,
  normalizeIdentityDocumentCode,
  normalizeIdentityDocumentName,
  validateIdentityDocumentTypeDraft,
  type IdentityDocumentProfileTypeOption,
  type IdentityDocumentTypeRecord,
  type IdentityDocumentTypeSnapshot,
} from "./identity-documents-card4.server";

// Generated database types predate migration 0079.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    name: z.string().max(80),
    code: z.string().max(20),
    description: z.string().max(400).optional().default(""),
    issuingCountryRequired: z.boolean(),
    expiryDateRequired: z.boolean(),
    documentNumberRequired: z.boolean(),
    scanImageAllowed: z.boolean(),
    requiredAtCheckIn: z.boolean(),
    active: z.boolean(),
    validForProfileTypeIds: z.array(idSchema).max(80),
    displayOrder: z.number().int().min(1).max(999),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Identity document types are unavailable until their approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Identity document types are unavailable.");
}

function mapRow(row: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  issuing_country_required: boolean;
  expiry_date_required: boolean;
  document_number_required: boolean;
  scan_image_allowed: boolean;
  required_at_check_in: boolean;
  active: boolean;
  valid_for_profile_type_ids: string[] | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}): IdentityDocumentTypeRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    issuingCountryRequired: row.issuing_country_required,
    expiryDateRequired: row.expiry_date_required,
    documentNumberRequired: row.document_number_required,
    scanImageAllowed: row.scan_image_allowed,
    requiredAtCheckIn: row.required_at_check_in,
    active: row.active,
    validForProfileTypeIds: row.valid_for_profile_type_ids ?? [],
    displayOrder: row.display_order,
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
    metadata: { section: "card4-identity-documents", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-identity-documents] audit", result.error.message);
}

async function loadProfileTypes(
  db: DbClient,
  restaurantId: string,
): Promise<IdentityDocumentProfileTypeOption[]> {
  const result = await db
    .from("pms_guest_profile_types")
    .select("id, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (result.error) unavailable(result.error);
  return result.data ?? [];
}

async function seedDefaults(
  db: DbClient,
  restaurantId: string,
  userId: string,
  profileTypes: IdentityDocumentProfileTypeOption[],
) {
  const profileTypeIds = profileTypes.filter((row) => row.active).map((row) => row.id);
  const payload = DEFAULT_IDENTITY_DOCUMENT_TYPES.map((row, index) => ({
    restaurant_id: restaurantId,
    name: row.name,
    code: row.code,
    description: row.description,
    issuing_country_required: row.issuingCountryRequired,
    expiry_date_required: row.expiryDateRequired,
    document_number_required: row.documentNumberRequired,
    scan_image_allowed: row.scanImageAllowed,
    required_at_check_in: row.requiredAtCheckIn,
    active: true,
    valid_for_profile_type_ids: profileTypeIds,
    display_order: index + 1,
    updated_by: userId,
  }));
  const result = await db.from("pms_guest_id_types").insert(payload).select("id");
  if (result.error && result.error.code !== "23505") unavailable(result.error);

  const ids = (result.data ?? []).map((row: { id: string }) => row.id);
  if (ids.length > 0) {
    const fieldResult = await db
      .from("pms_guest_fields")
      .update({ document_type_ids: ids, updated_by: userId })
      .eq("restaurant_id", restaurantId)
      .eq("code", "IDENTITY_DOCUMENT")
      .eq("document_type_ids", []);
    if (fieldResult.error && fieldResult.error.code !== "42P01") {
      console.error("[card4-identity-documents] link required field", fieldResult.error.message);
    }
  }
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  seeded = false,
  seedMissing = true,
): Promise<IdentityDocumentTypeSnapshot> {
  const profileTypes = await loadProfileTypes(db, restaurantId);
  const result = await db
    .from("pms_guest_id_types")
    .select(
      "id, name, code, description, issuing_country_required, expiry_date_required, document_number_required, scan_image_allowed, required_at_check_in, active, valid_for_profile_type_ids, display_order, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("name");
  if (result.error) unavailable(result.error);

  if ((result.data ?? []).length === 0) {
    if (!seedMissing) return { documentTypes: [], profileTypes, lastUpdatedAt: null };
    if (seeded) throw new Error("Could not seed default identity document types.");
    await seedDefaults(db, restaurantId, userId, profileTypes);
    return loadSnapshot(db, restaurantId, userId, true, seedMissing);
  }

  const documentTypes = (result.data ?? []).map(mapRow);
  const lastUpdatedAt = documentTypes.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { documentTypes, profileTypes, lastUpdatedAt };
}

export { loadSnapshot as loadIdentityDocumentsCard4Snapshot };

export const getPmsCard4IdentityDocumentTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId, context.userId);
  });

export const savePmsCard4IdentityDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId, context.userId);
    const draft = {
      id: data.id ?? null,
      name: data.name,
      code: data.code,
      description: data.description,
      issuingCountryRequired: data.issuingCountryRequired,
      expiryDateRequired: data.expiryDateRequired,
      documentNumberRequired: data.documentNumberRequired,
      scanImageAllowed: data.scanImageAllowed,
      requiredAtCheckIn: data.requiredAtCheckIn,
      active: data.active,
      validForProfileTypeIds: data.validForProfileTypeIds,
      displayOrder: data.displayOrder,
    };
    const errors = validateIdentityDocumentTypeDraft(
      draft,
      snapshot.documentTypes,
      snapshot.profileTypes,
    );
    if (errors.length > 0) throw new Error(errors[0]?.message ?? "Invalid document type.");

    const payload = {
      restaurant_id: data.restaurantId,
      name: normalizeIdentityDocumentName(data.name),
      code: normalizeIdentityDocumentCode(data.code),
      description: data.description.trim() || null,
      issuing_country_required: data.issuingCountryRequired,
      expiry_date_required: data.expiryDateRequired,
      document_number_required: data.documentNumberRequired,
      scan_image_allowed: data.scanImageAllowed,
      required_at_check_in: data.requiredAtCheckIn,
      active: data.active,
      valid_for_profile_type_ids: data.validForProfileTypeIds,
      display_order: data.displayOrder,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_id_types")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db.from("pms_guest_id_types").insert(payload).select("id").single();
    if (result.error) {
      if (result.error.code === "23505")
        throw new Error("A document type with this name or code already exists.");
      unavailable(result.error);
    }
    const id = result.data?.id;
    if (!id) throw new Error("Could not save the document type.");
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_document_type_saved", {
      id,
      code: payload.code,
    });
    return { ok: true as const, id };
  });

export const setPmsCard4IdentityDocumentTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const current = await db
      .from("pms_guest_id_types")
      .select("required_at_check_in")
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (current.error) unavailable(current.error);
    if (!current.data) throw new Error("That document type no longer exists.");
    const flags = identityDocumentFlagsForActiveChange(
      data.active,
      current.data.required_at_check_in,
    );
    const result = await db
      .from("pms_guest_id_types")
      .update({
        active: flags.active,
        required_at_check_in: flags.requiredAtCheckIn,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_document_type_toggled", {
      id: data.id,
      active: data.active,
    });
    return { ok: true as const };
  });

export const reorderPmsCard4IdentityDocumentTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, ids: z.array(idSchema).min(1).max(80) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (new Set(data.ids).size !== data.ids.length)
      throw new Error("Document order must be unique.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    for (const [index, id] of data.ids.entries()) {
      const result = await db
        .from("pms_guest_id_types")
        .update({ display_order: index + 1, updated_by: context.userId })
        .eq("id", id)
        .eq("restaurant_id", data.restaurantId);
      if (result.error) unavailable(result.error);
    }
    return { ok: true as const };
  });

const OPERATIONAL_CODE_BY_CONFIG_CODE: Record<string, string> = {
  PAS: "passport",
  NID: "national_id",
  DL: "driving_licence",
  OID: "other",
};

export const deletePmsCard4IdentityDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const current = await db
      .from("pms_guest_id_types")
      .select("id, code")
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (current.error) unavailable(current.error);
    if (!current.data) throw new Error("That document type no longer exists.");

    const [profileRefs, fieldRefs] = await Promise.all([
      db
        .from("pms_guest_profile_types")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .contains("document_type_ids", [data.id])
        .limit(1),
      db
        .from("pms_guest_fields")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .contains("document_type_ids", [data.id])
        .limit(1),
    ]);
    if (profileRefs.error && profileRefs.error.code !== "42P01") unavailable(profileRefs.error);
    if (fieldRefs.error && fieldRefs.error.code !== "42P01") unavailable(fieldRefs.error);

    let hasGuestReference = false;
    const operationalCode = OPERATIONAL_CODE_BY_CONFIG_CODE[current.data.code];
    if (operationalCode) {
      const guests = await db
        .from("guest_profiles")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId)
        .eq("id_document_type", operationalCode);
      if (guests.error && guests.error.code !== "42P01") unavailable(guests.error);
      hasGuestReference = (guests.count ?? 0) > 0;
    }
    if (
      (profileRefs.data ?? []).length > 0 ||
      (fieldRefs.data ?? []).length > 0 ||
      hasGuestReference
    ) {
      throw new Error("This document type is in use. Disable it instead of deleting it.");
    }

    const result = await db
      .from("pms_guest_id_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card4_document_type_deleted", {
      id: data.id,
    });
    return { ok: true as const };
  });
