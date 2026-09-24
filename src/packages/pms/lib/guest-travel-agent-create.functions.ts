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
  parseGuestTravelAgentCreateHold,
  travelAgentCommissionReady,
  type AccountCreateCatalogueOption,
  type AccountCreateContactDraft,
  type GuestTravelAgentCreateDraft,
  type GuestTravelAgentCreateStepId,
} from "./guest-travel-agent-create-workspace";
import { TA_COMMISSION_PLAN_TYPES } from "./guest-travel-agent-detail-workspace";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type TravelAgentCreateContext = {
  catalogues: {
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
    const db = admin(supabaseAdmin);
    const [
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
    ] = await Promise.all([
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
    ]);

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

    return {
      catalogues: {
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
    if (filled(contact.preferredMethod)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const updated = await admin(supabaseAdmin)
        .from("guest_company_contacts")
        .update({ preferred_method: contact.preferredMethod })
        .eq("id", saved.id)
        .eq("restaurant_id", restaurantId);
      if (updated.error && updated.error.code !== "42703" && !isMissingSchemaError(updated.error)) {
        throw new Error(updated.error.message);
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
    await requireGuestManager(context as never, data.restaurantId);
    const { assertListingCreateAllowed } = await import("./guest-workspace-config.functions");
    await assertListingCreateAllowed(data.restaurantId, "travel-agent");
    const draft = data.draft;
    if (data.mode === "draft" && !filled(draft.agencyType)) {
      return { id: draft.accountId, contacts: draft.contacts, created: false as const };
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
      const commissionCurrency = [draft.commissionCurrency, draft.currency].find((value) =>
        /^[A-Z]{3}$/.test(value.trim()),
      );
      if (travelAgentCommissionReady(draft) && commissionCurrency) {
        const today = new Date().toISOString().slice(0, 10);
        await saveTravelAgentCommissionPlan({
          data: {
            restaurantId: data.restaurantId,
            agencyId: accountId,
            commissionType: draft.commissionType as (typeof TA_COMMISSION_PLAN_TYPES)[number],
            rateValue: Number(draft.commissionValue),
            currency: commissionCurrency.trim(),
            effectiveOn: filled(draft.commissionEffectiveOn) ? draft.commissionEffectiveOn : today,
            expiresOn: filled(draft.commissionExpiresOn) ? draft.commissionExpiresOn : null,
            notes: draft.commissionNotes || null,
          },
        });
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Some agency details could not be saved.";
    }
    return { id: accountId, contacts, created: true as const, error };
  });
