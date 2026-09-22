/**
 * Create New Guest workflow APIs.
 * Guest rows stay on guest_profiles. Catalogues stay Card 4 / SET3.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireGuestManager } from "./guests.server";
import { loadGuestProfileRules } from "./pms-set3-rates-guest.functions";
import { emptyGuestProfileRules, type GuestProfileRules } from "./pms-set3-rates-guest";
import {
  EMPTY_PROFILE_TYPE_DEFAULTS,
  normalizeProfileTypeDefaults,
  type ProfileTypeRecord,
} from "./profile-types-card4.server";
import type { GuestFieldRecord } from "./required-fields-card4.server";
import type { PreferenceCategoryRecord, PreferenceTypeRecord } from "./preferences-card4.server";
import { isPreferenceValueType, normalizePreferenceOptions } from "./preferences-card4.server";
import { parseGuestCreateHold, type GuestCreateDraft, type GuestCreateStepId } from "./guest-create-workspace";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type GuestCreateContext = {
  profileType: ProfileTypeRecord | null;
  fields: GuestFieldRecord[];
  documentTypes: Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
    issuingCountryRequired: boolean;
    expiryDateRequired: boolean;
    documentNumberRequired: boolean;
    scanImageAllowed: boolean;
    validForProfileTypeIds: string[];
  }>;
  preferenceCategories: PreferenceCategoryRecord[];
  preferenceTypes: PreferenceTypeRecord[];
  businessTypes: Array<{ id: string; name: string; code: string; active: boolean }>;
  set3Saved: boolean;
  dataProcessingRequired: boolean;
  companyRelationshipEnabled: boolean;
  set3: GuestProfileRules;
  draft: { id: string; payload: GuestCreateDraft; step: GuestCreateStepId } | null;
};

function mapField(row: Record<string, unknown>): GuestFieldRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    fieldType: (row.field_type as GuestFieldRecord["fieldType"]) ?? "text",
    description: (row.description as string | null) ?? null,
    options: Array.isArray(row.options) ? (row.options as GuestFieldRecord["options"]) : [],
    required: Boolean(row.required),
    checkIn: Boolean(row.check_in),
    reservation: Boolean(row.reservation),
    active: Boolean(row.active),
    displayOrder: Number(row.display_order ?? 1),
    lookupSource: (row.lookup_source as GuestFieldRecord["lookupSource"]) ?? null,
    documentTypeIds: Array.isArray(row.document_type_ids) ? (row.document_type_ids as string[]) : [],
    minValue: row.min_value == null ? null : Number(row.min_value),
    maxValue: row.max_value == null ? null : Number(row.max_value),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export const getGuestCreateContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestCreateContext> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const [typesRes, fieldsRes, prefsCat, prefsType, business, rules, docsRes, draft] = await Promise.all([
      db
        .from("pms_guest_profile_types")
        .select(
          "id, name, code, description, icon, active, required_field_ids, document_type_ids, preference_type_ids, defaults, created_at, updated_at",
        )
        .eq("restaurant_id", data.restaurantId)
        .order("name"),
      db
        .from("pms_guest_fields")
        .select("*")
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
      db
        .from("pms_guest_preference_categories")
        .select("id, name, code, description, active, display_order, created_at, updated_at")
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
      db
        .from("pms_guest_preference_types")
        .select(
          "id, category_id, name, code, value_type, options, required, active, display_order, created_at, updated_at",
        )
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
      db
        .from("pms_business_profile_types")
        .select("id, name, code, active")
        .eq("restaurant_id", data.restaurantId)
        .order("name"),
      loadGuestProfileRules(supabaseAdmin, data.restaurantId),
      db
        .from("pms_guest_id_types")
        .select(
          "id, name, code, active, issuing_country_required, expiry_date_required, document_number_required, scan_image_allowed, valid_for_profile_type_ids",
        )
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
      db
        .from("pms_guest_create_drafts")
        .select("id, payload")
        .eq("restaurant_id", data.restaurantId)
        .eq("created_by_membership_id", me.id)
        .maybeSingle(),
    ]);

    const types = ((typesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      code: String(row.code),
      description: (row.description as string | null) ?? null,
      icon: (row.icon as ProfileTypeRecord["icon"]) ?? "user",
      active: Boolean(row.active),
      requiredFieldIds: Array.isArray(row.required_field_ids) ? (row.required_field_ids as string[]) : [],
      documentTypeIds: Array.isArray(row.document_type_ids) ? (row.document_type_ids as string[]) : [],
      preferenceTypeIds: Array.isArray(row.preference_type_ids) ? (row.preference_type_ids as string[]) : [],
      defaults: normalizeProfileTypeDefaults(row.defaults) ?? EMPTY_PROFILE_TYPE_DEFAULTS,
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    })) as ProfileTypeRecord[];
    const profileType =
      types.find((row) => row.active && row.code === "IND") ??
      types.find((row) => row.active && /individual/i.test(row.name)) ??
      null;

    const fields = fieldsRes.error && isMissingSchemaError(fieldsRes.error)
      ? []
      : ((fieldsRes.data ?? []) as Array<Record<string, unknown>>).map(mapField);

    const preferenceCategories =
      prefsCat.error && isMissingSchemaError(prefsCat.error)
        ? []
        : ((prefsCat.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            name: String(row.name),
            code: String(row.code),
            description: (row.description as string | null) ?? null,
            active: Boolean(row.active),
            displayOrder: Number(row.display_order ?? 1),
            createdAt: String(row.created_at ?? ""),
            updatedAt: String(row.updated_at ?? ""),
          }));
    const preferenceTypes =
      prefsType.error && isMissingSchemaError(prefsType.error)
        ? []
        : ((prefsType.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            categoryId: String(row.category_id),
            name: String(row.name),
            code: String(row.code),
            valueType: isPreferenceValueType(String(row.value_type)) ? row.value_type : "single",
            options: normalizePreferenceOptions(row.options),
            required: Boolean(row.required),
            active: Boolean(row.active),
            displayOrder: Number(row.display_order ?? 1),
            createdAt: String(row.created_at ?? ""),
            updatedAt: String(row.updated_at ?? ""),
          })) as PreferenceTypeRecord[];

    const businessTypes = business.error && isMissingSchemaError(business.error)
      ? []
      : ((business.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>);

    let savedDraft: { id: string; payload: GuestCreateDraft; step: GuestCreateStepId } | null = null;
    if (!draft.error && draft.data) {
      const parsed = parseGuestCreateHold(draft.data.payload);
      if (parsed) {
        savedDraft = {
          id: draft.data.id,
          payload: parsed.draft,
          step: parsed.step,
        };
      }
    }

    return {
      profileType,
      fields,
      documentTypes:
        docsRes.error && isMissingSchemaError(docsRes.error)
          ? []
          : ((docsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
              id: String(row.id),
              name: String(row.name),
              code: String(row.code),
              active: Boolean(row.active),
              issuingCountryRequired: Boolean(row.issuing_country_required),
              expiryDateRequired: Boolean(row.expiry_date_required),
              documentNumberRequired: Boolean(row.document_number_required),
              scanImageAllowed: Boolean(row.scan_image_allowed),
              validForProfileTypeIds: Array.isArray(row.valid_for_profile_type_ids)
                ? (row.valid_for_profile_type_ids as string[])
                : [],
            })),
      preferenceCategories,
      preferenceTypes,
      businessTypes,
      set3Saved: Boolean(rules?.savedAt),
      dataProcessingRequired: Boolean(rules?.savedAt && rules.consentDefaults.dataProcessing),
      companyRelationshipEnabled: Boolean(rules?.companyRelationshipEnabled),
      set3: rules ?? emptyGuestProfileRules(),
      draft: savedDraft,
    };
  });

export const saveGuestCreateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, payload: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const existing = await db
      .from("pms_guest_create_drafts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("created_by_membership_id", me.id)
      .maybeSingle();
    if (existing.error && isMissingSchemaError(existing.error)) {
      throw new Error("Guest drafts are unavailable until their migration is applied.");
    }
    if (existing.data) {
      const updated = await db
        .from("pms_guest_create_drafts")
        .update({ payload: data.payload, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) throw new Error(updated.error.message);
      return { id: existing.data.id as string };
    }
    const inserted = await db
      .from("pms_guest_create_drafts")
      .insert({
        restaurant_id: data.restaurantId,
        created_by_membership_id: me.id,
        payload: data.payload,
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { id: inserted.data.id as string };
  });

export const deleteGuestCreateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("pms_guest_create_drafts")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("created_by_membership_id", me.id);
    if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
    return { ok: true as const };
  });
