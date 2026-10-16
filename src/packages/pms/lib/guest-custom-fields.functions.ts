import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordGuestEvent, requireGuestManager } from "./guests.server";
import { loadRequiredFieldsCard4Snapshot } from "./required-fields-card4.functions";
import { CANONICAL_FIELD_CODE_MAP } from "./guest-field-rules";
import {
  isCompanyFieldCode,
  isTravelAgencyFieldCode,
  isGroupFieldCode,
  isIndividualGuestFieldCode,
} from "./guest-creation-field-definitions";
import {
  formatCustomFieldValueForDisplay,
  normalizeCustomFieldValue,
  validateCustomFieldValue,
  type ResolvedCustomFieldValue,
  type StoredCustomFieldValue,
} from "./guest-custom-fields.server";

const idSchema = z.string().uuid();

export const listGuestCustomFieldValues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ResolvedCustomFieldValue[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load active & configured fields catalogue
    const snapshot = await loadRequiredFieldsCard4Snapshot(supabaseAdmin, data.restaurantId, context.userId);
    const fields = snapshot.fields;

    // Load values for this guest
    const res = await supabaseAdmin
      .from("guest_custom_field_values")
      .select("field_id, value_json")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId);

    const valuesByFieldId = new Map<string, StoredCustomFieldValue>();
    if (!res.error && res.data) {
      for (const row of res.data as Array<{ field_id: string; value_json: unknown }>) {
        valuesByFieldId.set(row.field_id, row.value_json as StoredCustomFieldValue);
      }
    }

    const resolved: ResolvedCustomFieldValue[] = [];
    for (const field of fields) {
      const codeUpper = field.code.toUpperCase();
      // Skip core mapped fields (FIRST_NAME, EMAIL, etc.) and lookup/document types,
      // as well as Company, Travel Agency, and Group specific fields.
      if (
        CANONICAL_FIELD_CODE_MAP[codeUpper] ||
        field.fieldType === "document" ||
        field.fieldType === "lookup" ||
        isCompanyFieldCode(codeUpper) ||
        isTravelAgencyFieldCode(codeUpper) ||
        isGroupFieldCode(codeUpper) ||
        !isIndividualGuestFieldCode(codeUpper)
      ) {
        continue;
      }

      const stored = valuesByFieldId.get(field.id) ?? null;
      // Show active fields, OR inactive fields if they have a stored historical value
      if (field.active || (stored !== null && !(Array.isArray(stored) && stored.length === 0))) {
        resolved.push({
          fieldId: field.id,
          code: field.code,
          name: field.name,
          fieldType: field.fieldType,
          value: stored,
          formattedValue: formatCustomFieldValueForDisplay(field, stored),
          active: field.active,
        });
      }
    }

    return resolved;
  });

export async function persistGuestCustomFieldValues(
  supabaseAdmin: SupabaseClient,
  restaurantId: string,
  guestId: string,
  userId: string,
  values: Record<string, unknown>,
  actorMembershipId?: string,
): Promise<{ ok: true; savedCount: number }> {
  // Verify guest belongs to this property
  const { data: guest } = await supabaseAdmin
    .from("guest_profiles")
    .select("id, anonymised_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", guestId)
    .maybeSingle();

  if (!guest) throw new Error("That guest could not be found.");
  if (guest.anonymised_at) {
    throw new Error("This profile has been anonymised and cannot be modified.");
  }

  // Load fields definition catalogue
  const snapshot = await loadRequiredFieldsCard4Snapshot(supabaseAdmin, restaurantId, userId);
  const fields = snapshot.fields;
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const fieldByCode = new Map(fields.map((f) => [f.code.toUpperCase(), f]));

  // Load existing values to distinguish new vs updating entries
  const existingRes = await supabaseAdmin
    .from("guest_custom_field_values")
    .select("field_id, value_json")
    .eq("restaurant_id", restaurantId)
    .eq("guest_id", guestId);

  const existingMap = new Map<string, StoredCustomFieldValue>();
  if (!existingRes.error && existingRes.data) {
    for (const row of existingRes.data as Array<{ field_id: string; value_json: unknown }>) {
      existingMap.set(row.field_id, row.value_json as StoredCustomFieldValue);
    }
  }

  let savedCount = 0;
  const changes: Record<string, { previous: StoredCustomFieldValue; next: StoredCustomFieldValue }> = {};

  for (const [key, rawValue] of Object.entries(values)) {
    // Find field by ID or by Code
    const field = fieldMap.get(key) ?? fieldByCode.get(key.toUpperCase());
    if (!field) continue;

    // Reject attempts to duplicate core, document, or lookup fields in custom store
    const codeUpper = field.code.toUpperCase();
    if (CANONICAL_FIELD_CODE_MAP[codeUpper]) {
      throw new Error(`Core mapped guest field ${field.code} cannot be stored in custom field values.`);
    }
    if (isCompanyFieldCode(codeUpper) || isTravelAgencyFieldCode(codeUpper) || isGroupFieldCode(codeUpper)) {
      throw new Error(`Field ${field.code} is not an individual guest custom field.`);
    }
    if (field.fieldType === "document") {
      throw new Error("Document fields must be managed via guest identity documents.");
    }
    if (field.fieldType === "lookup") {
      throw new Error("Lookup fields must be managed via guest account links.");
    }

    const normalized = normalizeCustomFieldValue(field.fieldType, rawValue);
    const previousValue = existingMap.get(field.id) ?? null;
    const isNewEntry = previousValue === null;

    const error = validateCustomFieldValue(field, normalized, isNewEntry);
    if (error) throw new Error(error);

    if (normalized === null || (Array.isArray(normalized) && normalized.length === 0)) {
      // If value is cleared, delete from table
      if (previousValue !== null) {
        await supabaseAdmin
          .from("guest_custom_field_values")
          .delete()
          .eq("restaurant_id", restaurantId)
          .eq("guest_id", guestId)
          .eq("field_id", field.id);
        changes[field.code] = { previous: previousValue, next: null };
        savedCount++;
      }
    } else {
      // Upsert normalized value
      const { error: upsertErr } = await supabaseAdmin
        .from("guest_custom_field_values")
        .upsert(
          {
            restaurant_id: restaurantId,
            guest_id: guestId,
            field_id: field.id,
            value_json: normalized as Json,
            updated_by: userId,
          } as never,
          { onConflict: "guest_id,field_id" },
        );
      if (upsertErr) throw new Error(upsertErr.message);
      changes[field.code] = { previous: previousValue, next: normalized };
      savedCount++;
    }
  }

  if (Object.keys(changes).length > 0 && actorMembershipId) {
    await recordGuestEvent({
      restaurantId,
      guestId,
      eventType: "profile_updated",
      previousValues: Object.fromEntries(
        Object.entries(changes).map(([k, v]) => [k, v.previous]),
      ),
      newValues: Object.fromEntries(
        Object.entries(changes).map(([k, v]) => [k, v.next]),
      ),
      notes: "Guest additional custom fields updated.",
      actorMembershipId,
    });
  }

  return { ok: true as const, savedCount };
}

export const saveGuestCustomFieldValues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        values: z.record(z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; savedCount: number }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return persistGuestCustomFieldValues(
      supabaseAdmin,
      data.restaurantId,
      data.guestId,
      context.userId,
      data.values,
      me.id,
    );
  });

export const hasOperationalFieldValues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, fieldId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ hasValues: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const res = await supabaseAdmin
      .from("guest_custom_field_values")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("field_id", data.fieldId)
      .limit(1);

    return { hasValues: Boolean(res.data && res.data.length > 0) };
  });
