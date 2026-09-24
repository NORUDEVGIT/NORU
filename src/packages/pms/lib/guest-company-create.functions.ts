/**
 * Register New Company workflow APIs.
 * Company rows stay on guest_account_masters. Catalogues stay in PMS settings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireGuestManager } from "./guests.server";
import { createStatusFromAutoApproval } from "./guest-companies-workspace";
import { loadBusinessSnapshot } from "./guest-companies.functions";
import { createGuestAccount, updateGuestAccount } from "./guest-accounts.functions";
import { saveCompanyContact } from "./guest-company-detail.functions";
import {
  draftToAccountOperations,
  draftToCompanyAccountInput,
  filled,
  parseGuestCompanyCreateHold,
  type AccountCreateCatalogueOption,
  type AccountCreateContactDraft,
  type GuestCompanyCreateDraft,
  type GuestCompanyCreateStepId,
} from "./guest-company-create-workspace";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type CompanyCreateContext = {
  catalogues: {
    businessTypes: AccountCreateCatalogueOption[];
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
  draft: { id: string; payload: GuestCompanyCreateDraft; step: GuestCompanyCreateStepId } | null;
};

function mapOption(row: Record<string, unknown>): AccountCreateCatalogueOption {
  return {
    id: String(row.id),
    name: String(row.name ?? row.display_name ?? row.code ?? ""),
    code: row.code == null ? null : String(row.code),
    active: row.active == null ? true : Boolean(row.active),
    creditAccountAllowed:
      row.credit_account_allowed == null ? undefined : Boolean(row.credit_account_allowed),
    contactRequired: row.contact_required == null ? undefined : Boolean(row.contact_required),
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

export const getCompanyCreateContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<CompanyCreateContext> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const [
      businessTypes,
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
      loadOptionalOptions(
        db,
        "pms_business_profile_types",
        data.restaurantId,
        "id, name, code, active, credit_account_allowed, contact_required",
      ),
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
        .eq("account_kind", "company")
        .maybeSingle(),
    ]);

    let savedDraft: { id: string; payload: GuestCompanyCreateDraft; step: GuestCompanyCreateStepId } | null = null;
    if (!draft.error && draft.data) {
      const parsed = parseGuestCompanyCreateHold(draft.data.payload);
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
        businessTypes,
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

export const saveCompanyCreateDraft = createServerFn({ method: "POST" })
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
      .eq("account_kind", "company")
      .maybeSingle();
    if (existing.error && isMissingSchemaError(existing.error)) {
      throw new Error("Company drafts are unavailable until their migration is applied.");
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
        account_kind: "company",
        payload: data.payload,
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { id: inserted.data.id as string };
  });

export const deleteCompanyCreateDraft = createServerFn({ method: "POST" })
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
      .eq("account_kind", "company");
    if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
    return { ok: true as const };
  });

async function persistAccountOperations(
  restaurantId: string,
  accountId: string,
  draft: GuestCompanyCreateDraft,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await admin(supabaseAdmin)
    .from("guest_account_masters")
    .update({ account_operations: draftToAccountOperations(draft) })
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId)
    .eq("account_type", "company");
  if (result.error && !isMissingSchemaError(result.error) && result.error.code !== "42703") {
    throw new Error(result.error.message);
  }
}

async function persistContacts(
  restaurantId: string,
  companyId: string,
  contacts: AccountCreateContactDraft[],
): Promise<AccountCreateContactDraft[]> {
  const next: AccountCreateContactDraft[] = [];
  for (const contact of contacts) {
    if (!filled(contact.name)) continue;
    const saved = await saveCompanyContact({
      data: {
        restaurantId,
        companyId,
        id: contact.id || undefined,
        name: contact.name,
        position: contact.position || null,
        phone: contact.phone || null,
        email: contact.email || null,
        whatsapp: contact.whatsapp || null,
        isPrimary: contact.isPrimary,
        notes: contact.notes || null,
        roleIds: contact.roleIds,
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

async function forcePending(restaurantId: string, accountId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await admin(supabaseAdmin)
    .from("guest_account_masters")
    .update({ account_status: "pending" })
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId)
    .eq("account_type", "company");
  if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
}

export const persistCompanyCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draft: z.custom<GuestCompanyCreateDraft>(),
        mode: z.enum(["draft", "complete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { assertListingCreateAllowed } = await import("./guest-workspace-config.functions");
    await assertListingCreateAllowed(data.restaurantId, "company");
    const draft = data.draft;
    if (data.mode === "draft" && !filled(draft.businessProfileTypeId)) {
      return { id: draft.accountId, contacts: draft.contacts, created: false as const };
    }
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const completeStatus = createStatusFromAutoApproval(Boolean(snapshot?.settings.autoApproval));
    const account = {
      ...draftToCompanyAccountInput(draft),
      accountStatus: data.mode === "draft" ? ("pending" as const) : completeStatus,
    };
    let accountId = draft.accountId;
    if (accountId) {
      await updateGuestAccount({
        data: { restaurantId: data.restaurantId, accountId, account },
      });
    } else {
      const created = await createGuestAccount({
        data: { restaurantId: data.restaurantId, accountType: "company", account },
      });
      accountId = created.id;
      if (data.mode === "draft") {
        await forcePending(data.restaurantId, accountId);
      }
    }
    await persistAccountOperations(data.restaurantId, accountId, draft);
    let contacts = draft.contacts;
    let error: string | undefined;
    try {
      contacts = await persistContacts(data.restaurantId, accountId, draft.contacts);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Contacts could not be saved.";
    }
    return { id: accountId, contacts, created: true as const, error };
  });
