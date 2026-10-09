/**
 * Register New Travel Agency workflow APIs.
 * Agency rows stay on guest_account_masters. Catalogues stay in PMS settings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireGuestManager } from "./guests.server";
import { createGuestAccount, updateGuestAccount } from "./guest-accounts.functions";
import {
  saveTravelAgentCommissionPlan,
  saveTravelAgentContact,
} from "./guest-travel-agent-detail.functions";
import {
  draftToTravelAgentAccountInput,
  draftToTravelAgentAccountOperations,
  filled,
  nextAgencyCode,
  parseGuestTravelAgentCreateHold,
  travelAgentCommissionReady,
  type AccountCreateCatalogueOption,
  type AccountCreateContactDraft,
  type GuestTravelAgentCreateDraft,
  type GuestTravelAgentCreateStepId,
} from "./guest-travel-agent-create-workspace";
import { TA_COMMISSION_PLAN_TYPES } from "./guest-travel-agent-detail-workspace";
import { ALL_TRAVEL_AGENCY_CREATION_FIELDS } from "./guest-creation-field-definitions";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type TravelAgentCreateContext = {
  catalogues: {
    agencyTypes: AccountCreateCatalogueOption[];
    contactRoles: AccountCreateCatalogueOption[];
    marketSegments: AccountCreateCatalogueOption[];
    sourceCodes: AccountCreateCatalogueOption[];
    ratePlans: AccountCreateCatalogueOption[];
    mealPlans: AccountCreateCatalogueOption[];
    packages: AccountCreateCatalogueOption[];
    paymentMethods: AccountCreateCatalogueOption[];
    staff: AccountCreateCatalogueOption[];
    currencies: string[];
  };
  defaultCurrency: string;
  draft: { id: string; payload: GuestTravelAgentCreateDraft; step: GuestTravelAgentCreateStepId } | null;
  fields?: Array<{
    id: string;
    name: string;
    code: string;
    fieldType: string;
    required: boolean;
    active: boolean;
    displayOrder: number;
  }>;
  profileType?: {
    id: string;
    name: string;
    code: string;
    active: boolean;
    requiredFieldIds: string[];
  } | null;
  usedAgencyCodes?: string[];
};

function mapOption(row: Record<string, unknown>): AccountCreateCatalogueOption {
  return {
    id: String(row.id),
    name: String(row.name ?? row.display_name ?? row.code ?? ""),
    code: row.code == null ? null : String(row.code),
    active: row.active == null ? true : Boolean(row.active),
  };
}

async function loadOptionalOptions(
  db: { from: (table: string) => any },
  table: string,
  restaurantId: string,
  columns = "id, name, code, active",
): Promise<AccountCreateCatalogueOption[]> {
  const result = await db.from(table).select(columns).eq("restaurant_id", restaurantId).order("name");
  if (result.error && (isMissingSchemaError(result.error) || result.error.code === "42P01")) return [];
  if (result.error) return [];
  return ((result.data ?? []) as Array<Record<string, unknown>>).map(mapOption);
}

export const getTravelAgentCreateContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<TravelAgentCreateContext> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadTravelAgencyTypes } = await import("./guest-travel-agency-types");
    const db = admin(supabaseAdmin);
    const [
      taTypes,
      contactRoles,
      marketSegments,
      sourceCodes,
      ratePlans,
      mealPlans,
      packages,
      paymentMethods,
      staff,
      restaurant,
      draft,
      fieldsRes,
      profileTypeRes,
    ] = await Promise.all([
      loadTravelAgencyTypes(data.restaurantId, supabaseAdmin),
      loadOptionalOptions(db, "pms_business_contact_roles", data.restaurantId),
      loadOptionalOptions(db, "pms_market_segments", data.restaurantId),
      loadOptionalOptions(db, "pms_source_codes", data.restaurantId),
      loadOptionalOptions(db, "hotel_rate_plans", data.restaurantId),
      loadOptionalOptions(db, "pms_meal_plans", data.restaurantId),
      loadOptionalOptions(db, "pms_packages", data.restaurantId),
      loadOptionalOptions(db, "pms_payment_methods", data.restaurantId),
      db
        .from("restaurant_memberships")
        .select("id, display_name, email, role")
        .eq("restaurant_id", data.restaurantId)
        .order("display_name"),
      db.from("restaurants").select("currency_code").eq("id", data.restaurantId).maybeSingle(),
      db
        .from("pms_account_create_drafts")
        .select("id, payload")
        .eq("restaurant_id", data.restaurantId)
        .eq("created_by_membership_id", me.id)
        .eq("account_kind", "travel_agent")
        .maybeSingle(),
      db
        .from("pms_guest_fields")
        .select("id, name, code, field_type, required, active, display_order")
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
      db
        .from("pms_guest_profile_types")
        .select("id, name, code, active, required_field_ids")
        .eq("restaurant_id", data.restaurantId)
        .in("code", ["TRA", "TRAVEL_AGENCY", "TRAVEL_AGENT"])
        .maybeSingle(),
    ]);

    const agencyTypes: AccountCreateCatalogueOption[] = taTypes.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      active: row.active,
    }));

    let savedDraft: { id: string; payload: GuestTravelAgentCreateDraft; step: GuestTravelAgentCreateStepId } | null =
      null;
    if (!draft.error && draft.data) {
      const parsed = parseGuestTravelAgentCreateHold(draft.data.payload);
      if (parsed) {
        savedDraft = { id: draft.data.id, payload: parsed.draft, step: parsed.step };
      }
    }

    const defaultCurrency = String(restaurant.data?.currency_code ?? "").trim();
    const staffRows = staff.error
      ? []
      : ((staff.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          name: String(row.display_name ?? row.email ?? "Staff"),
          code: null,
          active: true,
        }));

    let resolvedFieldsData = (fieldsRes?.data ?? []) as Array<Record<string, unknown>>;
    const existingFieldCodes = new Set(
      resolvedFieldsData.map((row) => String(row.code ?? "").toUpperCase()),
    );
    const existingFieldNames = new Set(
      resolvedFieldsData.map((row) => String(row.name ?? "").trim().toLowerCase()),
    );

    const missingDefs = ALL_TRAVEL_AGENCY_CREATION_FIELDS.filter(
      (def, index, self) =>
        !existingFieldCodes.has(def.code.toUpperCase()) &&
        self.findIndex((d) => d.code.toUpperCase() === def.code.toUpperCase()) === index,
    );

    if (missingDefs.length > 0) {
      const nextOrder = resolvedFieldsData.length;
      const seedRows = missingDefs.map((def, index) => {
        let fieldName = def.name;
        if (existingFieldNames.has(fieldName.trim().toLowerCase())) {
          fieldName = `Travel Agency ${def.name}`;
        }
        existingFieldNames.add(fieldName.trim().toLowerCase());
        return {
          restaurant_id: data.restaurantId,
          name: fieldName,
          code: def.code,
          field_type: def.fieldType,
          description: def.description,
          options: [],
          required: Boolean(def.systemRequired),
          check_in: false,
          reservation: false,
          active: true,
          display_order: nextOrder + index,
          lookup_source: null,
          document_type_ids: [],
          min_value: null,
          max_value: null,
          updated_by: me.id || null,
        };
      });

      try {
        await db.from("pms_guest_fields").insert(seedRows);
        const refreshedFields = await db
          .from("pms_guest_fields")
          .select("id, name, code, field_type, required, active, display_order")
          .eq("restaurant_id", data.restaurantId)
          .order("display_order");
        if (!refreshedFields.error && refreshedFields.data) {
          resolvedFieldsData = refreshedFields.data as Array<Record<string, unknown>>;
        }
      } catch {
        // Fallback silently if insert fails
      }
    }

    const existingCodesRes = await db
      .from("guest_account_masters")
      .select("code")
      .eq("restaurant_id", data.restaurantId)
      .eq("account_type", "travel_agent")
      .not("code", "is", null);
    const usedAgencyCodes = existingCodesRes.error || !Array.isArray(existingCodesRes.data)
      ? []
      : existingCodesRes.data
          .map((row: { code?: string | null }) => String(row.code ?? "").trim().toUpperCase())
          .filter(Boolean);

    return {
      catalogues: {
        agencyTypes,
        contactRoles,
        marketSegments,
        sourceCodes,
        ratePlans,
        mealPlans,
        packages,
        paymentMethods,
        staff: staffRows,
        currencies: defaultCurrency ? [defaultCurrency] : [],
      },
      defaultCurrency,
      draft: savedDraft,
      fields: resolvedFieldsData.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        code: String(row.code ?? ""),
        fieldType: String(row.field_type ?? "text"),
        required: Boolean(row.required),
        active: row.active == null ? true : Boolean(row.active),
        displayOrder: Number(row.display_order ?? 0),
      })),
      profileType: profileTypeRes?.data
        ? {
            id: String(profileTypeRes.data.id),
            name: String(profileTypeRes.data.name ?? "Travel Agency"),
            code: String(profileTypeRes.data.code ?? "TRA"),
            active: Boolean(profileTypeRes.data.active),
            requiredFieldIds: Array.isArray(profileTypeRes.data.required_field_ids)
              ? profileTypeRes.data.required_field_ids
              : [],
          }
        : null,
      usedAgencyCodes,
    };
  });

export const saveTravelAgentCreateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, payload: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const existing = await db
      .from("pms_account_create_drafts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("created_by_membership_id", me.id)
      .eq("account_kind", "travel_agent")
      .maybeSingle();
    if (existing.error && isMissingSchemaError(existing.error)) {
      throw new Error("Travel agency drafts are unavailable until their migration is applied.");
    }
    if (existing.data) {
      const updated = await db
        .from("pms_account_create_drafts")
        .update({ payload: data.payload, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) throw new Error(updated.error.message);
      return { id: existing.data.id as string };
    }
    const inserted = await db
      .from("pms_account_create_drafts")
      .insert({
        restaurant_id: data.restaurantId,
        created_by_membership_id: me.id,
        account_kind: "travel_agent",
        payload: data.payload,
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { id: inserted.data.id as string };
  });

export const deleteTravelAgentCreateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("pms_account_create_drafts")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("created_by_membership_id", me.id)
      .eq("account_kind", "travel_agent");
    if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
    return { ok: true as const };
  });

async function persistAccountOperations(
  restaurantId: string,
  accountId: string,
  draft: GuestTravelAgentCreateDraft,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await admin(supabaseAdmin)
    .from("guest_account_masters")
    .update({ account_operations: draftToTravelAgentAccountOperations(draft) })
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId)
    .eq("account_type", "travel_agent");
  if (result.error && !isMissingSchemaError(result.error) && result.error.code !== "42703") {
    throw new Error(result.error.message);
  }
}

async function persistContacts(
  restaurantId: string,
  agencyId: string,
  contacts: AccountCreateContactDraft[],
): Promise<AccountCreateContactDraft[]> {
  const next: AccountCreateContactDraft[] = [];
  for (const contact of contacts) {
    if (!filled(contact.name)) continue;
    const saved = await saveTravelAgentContact({
      data: {
        restaurantId,
        agencyId,
        id: contact.id || undefined,
        name: contact.name,
        position: contact.position || null,
        phone: contact.phone || null,
        email: contact.email || null,
        whatsapp: contact.whatsapp || null,
        isPrimary: contact.isPrimary,
        notes: contact.notes || null,
      },
    });
    if (filled(contact.preferredMethod) || filled(contact.roleId)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const updates: Record<string, unknown> = {};
      if (filled(contact.preferredMethod)) updates.preferred_method = contact.preferredMethod;
      if (filled(contact.roleId)) updates.role_id = contact.roleId;
      const updated = await admin(supabaseAdmin)
        .from("guest_company_contacts")
        .update(updates)
        .eq("id", saved.id)
        .eq("restaurant_id", restaurantId);
      if (updated.error && updated.error.code !== "42703" && !isMissingSchemaError(updated.error)) {
        console.warn("[persistContacts] role/preferred_method update warning:", updated.error.message);
      }
    }
    next.push({ ...contact, id: saved.id });
  }
  return next;
}

export const persistTravelAgentCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draft: z.custom<GuestTravelAgentCreateDraft>(),
        mode: z.enum(["draft", "complete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const draft = data.draft;
    if (!draft.accountId) {
      const { assertListingCreateAllowed } = await import("./guest-workspace-config.functions");
      await assertListingCreateAllowed(data.restaurantId, "travel-agent");
    }
    if (data.mode === "draft" && !filled(draft.agencyType)) {
      return { id: draft.accountId, contacts: draft.contacts, created: false as const };
    }
    if (!draft.accountId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const existingCodesRes = await admin(supabaseAdmin)
        .from("guest_account_masters")
        .select("code")
        .eq("restaurant_id", data.restaurantId)
        .eq("account_type", "travel_agent")
        .not("code", "is", null);
      const used = new Set<string>();
      if (!existingCodesRes.error && Array.isArray(existingCodesRes.data)) {
        for (const row of existingCodesRes.data) {
          const code = String(row.code ?? "").trim().toUpperCase();
          if (code) used.add(code);
        }
      }
      const wanted = draft.code?.trim().toUpperCase() ?? "";
      const prefix = wanted.match(/^([A-Z0-9_]+)-\d+$/)?.[1] || "TA";
      draft.code = !wanted || used.has(wanted) ? nextAgencyCode(prefix, used) : wanted;
    }
    const account = draftToTravelAgentAccountInput(draft);
    let accountId = draft.accountId;
    if (accountId) {
      await updateGuestAccount({
        data: { restaurantId: data.restaurantId, accountId, account },
      });
    } else {
      const created = await createGuestAccount({
        data: { restaurantId: data.restaurantId, accountType: "travel_agent", account },
      });
      accountId = created.id;
    }
    const creditAmount = draft.creditLimitAmount.trim() === "" ? null : Number(draft.creditLimitAmount);
    const preferredCurrency = /^[A-Z]{3}$/.test(draft.currency.trim()) ? draft.currency.trim() : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const extras = await admin(supabaseAdmin)
      .from("guest_account_masters")
      .update({
        preferred_currency: preferredCurrency,
        market_segment_id: filled(draft.marketSegmentId) ? draft.marketSegmentId : null,
        credit_limit_amount: creditAmount != null && !Number.isNaN(creditAmount) ? creditAmount : null,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", accountId)
      .eq("account_type", "travel_agent");
    if (extras.error && extras.error.code !== "42703" && !isMissingSchemaError(extras.error)) {
      throw new Error(extras.error.message);
    }
    await persistAccountOperations(data.restaurantId, accountId, draft);
    let contacts = draft.contacts;
    let error: string | undefined;
    try {
      contacts = await persistContacts(data.restaurantId, accountId, draft.contacts);
      const { executeSaveTravelAgencyCommissionRates } = await import(
        "./guest-travel-agency-step3-commission-rates.server.ts"
      );
      const commissionCurrency = [draft.commissionCurrency, draft.currency].find((value) =>
        /^[A-Z]{3}$/.test(value.trim()),
      );

      let rulesToPersist = draft.commissionRules ?? [];
      if (draft.commissionApplicationMode === "all" || rulesToPersist.length === 0) {
        rulesToPersist = [
          {
            scopeType: "all",
            roomTypeId: null,
            ratePlanId: null,
            commissionType: (draft.allCommissionType || draft.commissionType || "percent") as "percent" | "fixed",
            commissionValue: Number(draft.allCommissionValue || draft.commissionValue || 0),
          },
        ];
      }

      await executeSaveTravelAgencyCommissionRates(admin(supabaseAdmin), {
        restaurantId: data.restaurantId,
        agencyId: accountId,
        commercialModel: draft.commercialModel || (draft.commissionEnabled ? "commissionable" : "net_rate"),
        commissionCurrency: commissionCurrency || "ETB",
        commissionEffectiveOn: draft.commissionEffectiveOn || new Date().toISOString().slice(0, 10),
        commissionExpiresOn: draft.commissionExpiresOn || null,
        commissionNotes: draft.commissionNotes || null,
        commissionRules: rulesToPersist.map((r) => ({
          ...r,
          commissionValue: Number(r.commissionValue || 0),
        })),
        agencyRateDefaults: draft.agencyRateDefaults ?? [],
        netPricingMethod: draft.netPricingMethod || null,
        netRoomTypeId: draft.netRoomTypeId || null,
        netRatePlanId: draft.netRatePlanId || null,
        netDiscountType: draft.netDiscountType || null,
        netDiscountValue: draft.netDiscountValue ? Number(draft.netDiscountValue) : null,
        netCurrencyCode: draft.netCurrencyCode || draft.currency || "ETB",
        netValidFrom: draft.netValidFrom || null,
        netValidUntil: draft.netValidUntil || null,
        contractedRates: (draft.contractedRates ?? []).map((cr) => ({
          roomTypeId: cr.roomTypeId,
          amount: Number(cr.amount || 0),
        })),
        commercialNotes: draft.commercialNotes || null,
      });

      // Step 4: Payment, Credit & Reservation Rules + Documents Persistence
      const { persistTravelAgencyStep4, travelAgencyStep4PayloadFromDraft } = await import(
        "./guest-travel-agency-step4.server.ts"
      );
      const step4Payload = travelAgencyStep4PayloadFromDraft(data.restaurantId, accountId, draft);
      await persistTravelAgencyStep4(admin(supabaseAdmin), step4Payload, {
        mode: data.mode,
        membershipId: me.id,
      });
    } catch (caught) {
      if (data.mode === "complete") {
        throw caught;
      }
      error = caught instanceof Error ? caught.message : "Some agency details could not be saved.";
    }
    return { id: accountId, contacts, code: draft.code?.trim() || null, created: true as const, error };
  });
