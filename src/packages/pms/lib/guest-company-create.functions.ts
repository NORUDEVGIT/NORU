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
  type CompanyContractDraft,
  type GuestCompanyCreateDraft,
  type GuestCompanyCreateStepId,
} from "./guest-company-create-workspace";
import { validateCorporateAgreementPayload } from "./corporate-contracts.server";
import {
  CANONICAL_BILLING_RULES,
  isBillingRuleApplicableToProfile,
  type CanonicalBillingRuleCode,
} from "./billing-card3.server";
import { ensureMissingBillingRuleDefaults } from "./billing-card3.functions";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

import {
  DEFAULT_BUSINESS_CONTACT_ROLES,
  DEFAULT_BUSINESS_PROFILE_TYPES,
} from "./company-business-card4.server";

export type CompanyCreateContext = {
  catalogues: {
    businessTypes: AccountCreateCatalogueOption[];
    contactRoles: AccountCreateCatalogueOption[];
    marketSegments: AccountCreateCatalogueOption[];
    sourceCodes: AccountCreateCatalogueOption[];
    ratePlans: AccountCreateCatalogueOption[];
    roomTypes?: AccountCreateCatalogueOption[];
    mealPlans: AccountCreateCatalogueOption[];
    packages: AccountCreateCatalogueOption[];
    paymentMethods: AccountCreateCatalogueOption[];
    billingRules?: AccountCreateCatalogueOption[];
    taxExemptionRules?: AccountCreateCatalogueOption[];
    staff: AccountCreateCatalogueOption[];
    currencies: string[];
  };
  defaultCurrency: string;
  defaultBusinessTypeId?: string | null;
  autoApproval?: boolean;
  nextCompanyCode: string;
  draft: { id: string; payload: GuestCompanyCreateDraft; step: GuestCompanyCreateStepId } | null;
  fields?: Array<{ id: string; name: string; code: string; fieldType: string; required: boolean; active: boolean; displayOrder: number }>;
  profileType?: { id: string; name: string; code: string; active: boolean; requiredFieldIds: string[] } | null;
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
      roomTypes,
      mealPlans,
      packages,
      paymentMethods,
      billingRules,
      taxExemptionRules,
      staff,
      restaurant,
      draft,
      businessSettingsRes,
      existingCodesRes,
      fieldsRes,
      profileTypeRes,
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
      loadOptionalOptions(db, "room_types", data.restaurantId),
      loadOptionalOptions(db, "pms_meal_plans", data.restaurantId),
      loadOptionalOptions(db, "pms_packages", data.restaurantId),
      loadOptionalOptions(db, "pms_payment_methods", data.restaurantId),
      loadOptionalOptions(db, "pms_billing_rules", data.restaurantId, "id, name, code, active"),
      loadOptionalOptions(db, "pms_tax_exemption_rules", data.restaurantId, "id, name, code, active"),
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
      db
        .from("pms_business_profile_settings")
        .select("default_business_type_id, auto_approval")
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      db
        .from("guest_account_masters")
        .select("code")
        .eq("restaurant_id", data.restaurantId)
        .eq("account_type", "company")
        .not("code", "is", null),
      db
        .from("pms_guest_fields")
        .select("id, name, code, field_type, required, active, display_order")
        .eq("restaurant_id", data.restaurantId)
        .order("display_order"),
      db
        .from("pms_guest_profile_types")
        .select("id, name, code, active, required_field_ids")
        .eq("restaurant_id", data.restaurantId)
        .in("code", ["COM", "COMPANY"])
        .maybeSingle(),
    ]);

    let maxSeq = 0;
    const existingCompanyCodes = existingCodesRes.data as Array<{ code?: string | null }> | null;
    if (Array.isArray(existingCompanyCodes)) {
      for (const row of existingCompanyCodes) {
        const match = String(row.code ?? "").trim().match(/^COM-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!Number.isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }
    const nextCompanyCode = `COM-${String(maxSeq + 1).padStart(4, "0")}`;

    let savedDraft: { id: string; payload: GuestCompanyCreateDraft; step: GuestCompanyCreateStepId } | null = null;
    if (!draft.error && draft.data) {
      const parsed = parseGuestCompanyCreateHold(draft.data.payload);
      if (parsed) {
        savedDraft = { id: draft.data.id, payload: parsed.draft, step: parsed.step };
      }
    }

    const defaultCurrency = String(restaurant.data?.currency_code ?? "").trim();
    const currencies = Array.from(
      new Set([defaultCurrency, "USD", "EUR", "GBP", "ETB"].filter(Boolean)),
    );

    const businessSettings =
      businessSettingsRes.error &&
      (isMissingSchemaError(businessSettingsRes.error) || businessSettingsRes.error.code === "42P01")
        ? null
        : businessSettingsRes.data;

    const defaultBusinessTypeId = businessSettings?.default_business_type_id
      ? String(businessSettings.default_business_type_id)
      : null;
    const autoApproval =
      businessSettings?.auto_approval != null ? Boolean(businessSettings.auto_approval) : true;

    let resolvedContactRoles = contactRoles;
    if (resolvedContactRoles.length === 0) {
      try {
        const seeded = await db
          .from("pms_business_contact_roles")
          .insert(
            DEFAULT_BUSINESS_CONTACT_ROLES.map((row) => ({
              restaurant_id: data.restaurantId,
              name: row.name,
              code: row.code,
              active: true,
              updated_by: me.id,
            })),
          )
          .select("id, name, code, active");
        if (!seeded.error && seeded.data && seeded.data.length > 0) {
          resolvedContactRoles = (seeded.data as Array<Record<string, unknown>>).map(mapOption);
        }
      } catch {
        // Fallback silently if table not available
      }
    }

    let resolvedBusinessTypes = businessTypes;
    if (resolvedBusinessTypes.length === 0) {
      try {
        const seededTypes = await db
          .from("pms_business_profile_types")
          .insert(
            DEFAULT_BUSINESS_PROFILE_TYPES.map((row) => ({
              restaurant_id: data.restaurantId,
              name: row.name,
              code: row.code,
              description: row.description,
              active: true,
              required_field_ids: [],
              tax_id_required: row.taxIdRequired,
              contact_required: row.contactRequired,
              credit_account_allowed: row.creditAccountAllowed,
              updated_by: me.id,
            })),
          )
          .select("id, name, code, active, credit_account_allowed, contact_required");
        if (!seededTypes.error && seededTypes.data && seededTypes.data.length > 0) {
          resolvedBusinessTypes = (seededTypes.data as Array<Record<string, unknown>>).map(mapOption);
        }
      } catch {
        // Fallback silently if table not available
      }
    }

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
        businessTypes: resolvedBusinessTypes,
        contactRoles: resolvedContactRoles,
        marketSegments,
        sourceCodes,
        ratePlans,
        roomTypes,
        mealPlans,
        packages,
        paymentMethods,
        billingRules,
        taxExemptionRules,
        staff: staffRows,
        currencies,
      },
      defaultCurrency,
      defaultBusinessTypeId,
      autoApproval,
      nextCompanyCode,
      draft: savedDraft,
      fields: ((fieldsRes?.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
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
            name: String(profileTypeRes.data.name ?? "Company"),
            code: String(profileTypeRes.data.code ?? "COM"),
            active: Boolean(profileTypeRes.data.active),
            requiredFieldIds: Array.isArray(profileTypeRes.data.required_field_ids)
              ? profileTypeRes.data.required_field_ids
              : [],
          }
        : null,
    };
  });

export interface CompanyBillingCreditCreateConfig {
  billingRules: Array<{
    id: string;
    code: string;
    systemCode?: string | null;
    name: string;
    description: string | null;
    payerKind: string;
    splitGuestPercent: number | null;
    paymentTerms: string | null;
    isDefault: boolean;
    active: boolean;
    operationalStatus?: string;
    operationalStatusNote?: string | null;
    applicableProfileTypes?: string[];
  }>;
  paymentMethods: Array<{
    id: string;
    code: string;
    name: string;
    typeClass: string;
    active: boolean;
  }>;
  taxExemptionRules: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    reasonCategory: string;
    documentationRequired: boolean;
    approvalRequired: boolean;
    active: boolean;
  }>;
  currencies: Array<{
    code: string;
    isBase: boolean;
  }>;
  baseCurrency: string;
}

export const getCompanyBillingCreditCreateConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<CompanyBillingCreditCreateConfig> => {
    await requireGuestManager(context as never, data.restaurantId);
    let db: any = context.supabase;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (supabaseAdmin) db = supabaseAdmin;
    } catch {
      // Fallback
    }

    // Ensure property has canonical billing rules catalogue provisioned
    await ensureMissingBillingRuleDefaults(db, data.restaurantId);

    const [billingRulesRes, paymentMethodsRes, taxExemptionRulesRes, restRes, propCurrenciesRes] =
      await Promise.all([
        db
          .from("pms_billing_rules")
          .select("id, code, system_code, name, description, payer_kind, split_guest_percent, payment_terms, is_default, active, operational_status, applicable_profile_types")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .order("is_default", { ascending: false })
          .order("name", { ascending: true }),
        db
          .from("pms_payment_methods")
          .select("id, code, name, type_class, active")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .order("name", { ascending: true }),
        db
          .from("pms_tax_exemption_rules")
          .select("id, code, name, description, reason_category, documentation_required, approval_required, active")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .order("name", { ascending: true }),
        db
          .from("restaurants")
          .select("currency_code")
          .eq("id", data.restaurantId)
          .maybeSingle(),
        db
          .from("pms_property_currencies")
          .select("code, active")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true),
      ]);

    const baseCurrency = String((restRes.data as any)?.currency_code ?? "").trim().toUpperCase() || "USD";

    const configuredCurrencyCodes = Array.isArray(propCurrenciesRes?.data)
      ? propCurrenciesRes.data.map((c: any) => String(c.code ?? "").trim().toUpperCase()).filter(Boolean)
      : [];

    const currencyCodeSet = new Set([baseCurrency, ...configuredCurrencyCodes, "USD", "EUR", "GBP", "ETB"].filter(Boolean));
    const currencies = Array.from(currencyCodeSet).map((code) => ({
      code,
      isBase: code === baseCurrency,
    }));

    const allBillingRules = (billingRulesRes?.data ?? []).map((r: any) => {
      const matchingCanonical = CANONICAL_BILLING_RULES.find(
        (c) =>
          (r.system_code && c.systemCode === r.system_code) ||
          c.code.toLowerCase() === String(r.code ?? "").toLowerCase(),
      );
      const systemCode = (r.system_code as CanonicalBillingRuleCode) || matchingCanonical?.systemCode || null;
      return {
        id: String(r.id),
        code: String(r.code ?? "").toUpperCase(),
        systemCode,
        name: String(r.name ?? ""),
        description: r.description ? String(r.description) : (matchingCanonical?.description ?? null),
        payerKind: String(r.payer_kind ?? matchingCanonical?.payerKind ?? "company"),
        splitGuestPercent: r.split_guest_percent != null ? Number(r.split_guest_percent) : null,
        paymentTerms: r.payment_terms ? String(r.payment_terms) : null,
        isDefault: Boolean(r.is_default),
        active: Boolean(r.active),
        operationalStatus: String(r.operational_status || matchingCanonical?.operationalStatus || "active"),
        operationalStatusNote: matchingCanonical?.operationalStatusNote ?? null,
        applicableProfileTypes: Array.isArray(r.applicable_profile_types)
          ? r.applicable_profile_types
          : matchingCanonical
          ? [...matchingCanonical.applicableProfileTypes]
          : ["company", "travel_agent", "group", "individual"],
      };
    });

    // Profile applicability: For COMPANY registration, filter to sensible rules
    // (excludes travel_agency and tour_operator which belong to travel agent flows)
    const billingRules = allBillingRules.filter((r: any) =>
      isBillingRuleApplicableToProfile(r, "company"),
    );

    const paymentMethods = (paymentMethodsRes?.data ?? []).map((r: any) => ({
      id: String(r.id),
      code: String(r.code ?? "").toUpperCase(),
      name: String(r.name ?? ""),
      typeClass: String(r.type_class ?? ""),
      active: Boolean(r.active),
    }));

    const taxExemptionRules = (taxExemptionRulesRes?.data ?? []).map((r: any) => ({
      id: String(r.id),
      code: String(r.code ?? "").toUpperCase(),
      name: String(r.name ?? ""),
      description: r.description ? String(r.description) : null,
      reasonCategory: String(r.reason_category ?? "other"),
      documentationRequired: Boolean(r.documentation_required),
      approvalRequired: Boolean(r.approval_required),
      active: Boolean(r.active),
    }));

    return {
      billingRules,
      paymentMethods,
      taxExemptionRules,
      currencies,
      baseCurrency,
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
    const draft = { ...data.draft };
    if (!draft.accountId && !draft.code?.trim()) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const existingCodesRes = await admin(supabaseAdmin)
          .from("guest_account_masters")
          .select("code")
          .eq("restaurant_id", data.restaurantId)
          .eq("account_type", "company")
          .not("code", "is", null);
        let maxSeq = 0;
        if (Array.isArray(existingCodesRes.data)) {
          for (const row of existingCodesRes.data) {
            const match = String(row.code ?? "").trim().match(/^COM-(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!Number.isNaN(num) && num > maxSeq) {
                maxSeq = num;
              }
            }
          }
        }
        draft.code = `COM-${String(maxSeq + 1).padStart(4, "0")}`;
      } catch {
        draft.code = "COM-0001";
      }
    }
    if (!draft.accountId) {
      const { assertListingCreateAllowed } = await import("./guest-workspace-config.functions");
      await assertListingCreateAllowed(data.restaurantId, "company");
    }
    if (data.mode === "draft" && !filled(draft.businessProfileTypeId)) {
      return { id: draft.accountId, contacts: draft.contacts, created: false as const };
    }
    // Authoritative Server Validation for Step 3 in complete mode
    if (data.mode === "complete") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = admin(supabaseAdmin);

      // Validate default billing rule belongs to property
      if (!draft.defaultBillingRuleId) {
        throw new Error("Default billing rule is required.");
      }
      const billingRuleCheck = await db
        .from("pms_billing_rules")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", draft.defaultBillingRuleId)
        .maybeSingle();
      if (!billingRuleCheck.data) {
        throw new Error("Selected billing rule does not belong to this property.");
      }

      // Validate payment method belongs to property if provided
      if (draft.defaultPaymentMethodId) {
        const pmCheck = await db
          .from("pms_payment_methods")
          .select("id")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", draft.defaultPaymentMethodId)
          .maybeSingle();
        if (!pmCheck.data) {
          throw new Error("Selected payment method does not belong to this property.");
        }
      }

      // Validate payment timing
      if (!draft.paymentTiming) {
        throw new Error("Payment timing is required.");
      }
      if (!["due_on_arrival", "due_on_departure", "prepaid", "credit_terms"].includes(draft.paymentTiming)) {
        throw new Error("Invalid payment timing.");
      }
      if (draft.paymentTiming === "credit_terms") {
        if (!draft.creditAccountEnabled) {
          throw new Error("Enable Credit Facility to use Credit Terms.");
        }
        if (draft.creditDays === null || draft.creditDays === undefined || draft.creditDays <= 0) {
          throw new Error("Credit days are required when credit terms are selected.");
        }
      }

      // Validate credit facility
      if (draft.creditAccountEnabled) {
        if (draft.businessProfileTypeId) {
          const typeCheck = await db
            .from("pms_business_profile_types")
            .select("credit_account_allowed")
            .eq("restaurant_id", data.restaurantId)
            .eq("id", draft.businessProfileTypeId)
            .maybeSingle();
          if (typeCheck.data && typeCheck.data.credit_account_allowed === false) {
            throw new Error("This company type does not allow a credit account.");
          }
        }
        if (!draft.creditStatus) {
          throw new Error("Credit status is required when credit is enabled.");
        }
        if (!["pending_approval", "approved", "suspended"].includes(draft.creditStatus)) {
          throw new Error("Invalid credit status.");
        }
        if (draft.creditLimitAmount !== null && draft.creditLimitAmount !== undefined && draft.creditLimitAmount < 0) {
          throw new Error("Credit limit must be 0 or greater.");
        }
        if (draft.creditDays !== null && draft.creditDays !== undefined && draft.creditDays < 0) {
          throw new Error("Credit days must be 0 or greater.");
        }
      }

      // Validate tax exemption
      if (draft.taxExempt) {
        if (!draft.taxExemptionRuleId) {
          throw new Error("Tax exemption rule is required when tax exempt is enabled.");
        }
        const taxRuleCheck = await db
          .from("pms_tax_exemption_rules")
          .select("id, documentation_required")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", draft.taxExemptionRuleId)
          .maybeSingle();
        if (!taxRuleCheck.data) {
          throw new Error("Selected tax exemption rule does not belong to this property.");
        }
        if (taxRuleCheck.data.documentation_required && !draft.taxExemptionCertificateNumber?.trim()) {
          throw new Error("Certificate or reference number is required for this exemption rule.");
        }
      }
    }

    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const completeStatus = createStatusFromAutoApproval(Boolean(snapshot?.settings.autoApproval));
    const account = {
      ...draftToCompanyAccountInput(draft),
      ...(draft.accountId ? {} : { accountStatus: data.mode === "draft" ? ("pending" as const) : completeStatus }),
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

    // Persist structured Step 3 fields directly to guest_account_masters
    const structuredBilling = {
      default_billing_rule_id: draft.defaultBillingRuleId || null,
      default_payment_method_id: draft.defaultPaymentMethodId || draft.paymentMethodId || null,
      billing_currency_code: draft.billingCurrencyCode || draft.currency || null,
      payment_timing: draft.paymentTiming || null,
      credit_account_enabled: Boolean(draft.creditAccountEnabled),
      credit_limit_amount:
        draft.creditAccountEnabled && draft.creditLimitAmount !== null && draft.creditLimitAmount !== undefined
          ? Number(draft.creditLimitAmount)
          : null,
      credit_days:
        draft.creditAccountEnabled && draft.creditDays !== null && draft.creditDays !== undefined
          ? Number(draft.creditDays)
          : null,
      credit_status: draft.creditAccountEnabled ? (draft.creditStatus || "pending_approval") : null,
      tax_exempt: Boolean(draft.taxExempt),
      tax_exemption_rule_id: draft.taxExempt ? (draft.taxExemptionRuleId || null) : null,
      tax_exemption_certificate_number: draft.taxExempt ? (draft.taxExemptionCertificateNumber?.trim() || null) : null,
      tax_exemption_valid_to: draft.taxExempt ? (draft.taxExemptionValidTo || null) : null,
      billing_instruction: draft.billingInstruction?.trim() || null,
    };

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const updateResult = await admin(supabaseAdmin)
        .from("guest_account_masters")
        .update(structuredBilling)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", accountId)
        .eq("account_type", "company");
      if (updateResult.error && !isMissingSchemaError(updateResult.error) && updateResult.error.code !== "42703") {
        throw new Error(updateResult.error.message);
      }
    } catch (caught) {
      if (data.mode === "complete") {
        const msg = caught instanceof Error ? caught.message : "Failed to persist billing and credit defaults.";
        throw new Error(msg);
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

    let agreementId: string | null = null;
    if (draft.contract && (filled(draft.contract.name) || filled(draft.contract.contractTypeId))) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        agreementId = await persistCompanyContract(
          admin(supabaseAdmin),
          data.restaurantId,
          accountId,
          draft.contract,
          me.id,
        );
      } catch (caught) {
        const contractErr = caught instanceof Error ? caught.message : "Contract could not be saved.";
        if (data.mode === "complete") {
          throw new Error(contractErr);
        } else {
          error = error ? `${error} ${contractErr}` : contractErr;
        }
      }
    }

    return { id: accountId, contacts, agreementId, created: true as const, error };
  });

export const getNextCorporateContractCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const existingCodesRes = await db
      .from("pms_corporate_agreements")
      .select("code")
      .eq("restaurant_id", data.restaurantId)
      .not("code", "is", null);

    let maxSeq = 0;
    const year = new Date().getFullYear();
    for (const row of existingCodesRes.data ?? []) {
      const match = String(row.code ?? "").match(/^CORP-\d{4}-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    return { code: `CORP-${year}-${String(maxSeq + 1).padStart(3, "0")}` };
  });

export async function persistCompanyContract(
  db: { from: (table: string) => any },
  restaurantId: string,
  companyId: string,
  contract: CompanyContractDraft,
  membershipId: string,
): Promise<string | null> {
  if (!contract || !filled(contract.name) || !filled(contract.contractTypeId)) {
    return null;
  }

  // Check code
  let code = contract.code?.trim().toUpperCase();
  if (!code) {
    const existingCodesRes = await db
      .from("pms_corporate_agreements")
      .select("code")
      .eq("restaurant_id", restaurantId)
      .not("code", "is", null);
    let maxSeq = 0;
    const year = new Date().getFullYear();
    for (const row of existingCodesRes.data ?? []) {
      const match = String(row.code ?? "").match(/^CORP-\d{4}-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    code = `CORP-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
  }

  // Resolve currency from contract or property setting
  let currencyCode = contract.currencyCode?.trim().toUpperCase();
  if (!currencyCode) {
    const propRes = await db
      .from("restaurants")
      .select("currency_code")
      .eq("id", restaurantId)
      .maybeSingle();
    currencyCode = String(propRes.data?.currency_code ?? "").trim().toUpperCase() || "USD";
  }

  // 1. Validate boundary & payload
  const primaryRatePlanId =
    contract.pricingMethod !== "contracted_rates"
      ? (contract.ratePlanScope === "all" ? null : (contract.ratePlanId || contract.ratePlanIds?.[0] || null))
      : null;
  const primaryDiscountType =
    contract.pricingMethod === "rate_plan_discount"
      ? (contract.discountApplication === "custom"
          ? (contract.ratePlanDiscounts?.[0]?.discountType ?? "percent")
          : (contract.discountType || "percent"))
      : null;
  const primaryDiscountValue =
    contract.pricingMethod === "rate_plan_discount"
      ? (contract.discountApplication === "custom"
          ? (contract.ratePlanDiscounts?.[0]?.discountValue ?? 0)
          : (contract.discountValue ?? 0))
      : null;

  const validation = validateCorporateAgreementPayload({
    companyId,
    code,
    name: contract.name,
    contractNumber: contract.contractNumber || code,
    validFrom: contract.validFrom,
    validTo: contract.validTo,
    currencyCode,
    contractTypeId: contract.contractTypeId,
    status: contract.status,
    pricingMethod: contract.pricingMethod,
    ratePlanScope: contract.ratePlanScope,
    ratePlanIds: contract.ratePlanIds,
    ratePlanId: primaryRatePlanId,
    discountApplication: contract.discountApplication,
    discountType: contract.discountType,
    discountValue: contract.discountValue,
    ratePlanDiscounts: (contract.ratePlanDiscounts ?? []).map((d) => ({
      ratePlanId: d.ratePlanId,
      discountType: d.discountType,
      discountValue: Number(d.discountValue ?? 0),
    })),
    depositPolicyId: contract.depositPolicyId,
    cancellationPolicyId: contract.cancellationPolicyId,
    noShowPolicyId: contract.noShowPolicyId,
    contractRates: (contract.contractRates ?? []).map((cr) => ({
      roomTypeId: cr.roomTypeId,
      amount: Number(cr.amount ?? 0),
      rateKind: "fixed",
    })),
  });

  if (contract.status === "active" && !validation.valid) {
    throw new Error(validation.errors.join(". "));
  }

  // 2. Validate contract type belongs to property
  const typeRes = await db
    .from("pms_contract_types")
    .select("id, active")
    .eq("restaurant_id", restaurantId)
    .eq("id", contract.contractTypeId)
    .maybeSingle();

  if (!typeRes.data) {
    throw new Error("Selected contract type does not belong to this property.");
  }

  // 3. Insert real pms_corporate_agreements row
  const agreementPayload: Record<string, any> = {
    restaurant_id: restaurantId,
    company_id: companyId,
    contract_type_id: contract.contractTypeId,
    name: contract.name.trim(),
    code,
    contract_number: (contract.contractNumber || code).trim(),
    valid_from: contract.validFrom,
    valid_to: contract.validTo,
    currency_code: currencyCode,
    status: contract.status || "active",
    active: contract.status === "active",
    pricing_method: contract.pricingMethod,
    rate_plan_id: primaryRatePlanId,
    rate_plan_scope: contract.ratePlanScope || (primaryRatePlanId ? "selected" : "all"),
    rate_plan_ids: contract.ratePlanIds || (primaryRatePlanId ? [primaryRatePlanId] : []),
    discount_application: contract.discountApplication || "uniform",
    discount_type: primaryDiscountType,
    discount_value: primaryDiscountValue,
    rate_plan_discounts: contract.ratePlanDiscounts || [],
    deposit_policy_id: contract.depositPolicyId || null,
    cancellation_policy_id: contract.cancellationPolicyId || null,
    no_show_policy_id: contract.noShowPolicyId || null,
    description: contract.notes?.trim() || null,
  };

  let agreementInsert = await db
    .from("pms_corporate_agreements")
    .insert(agreementPayload)
    .select("id")
    .single();

  if (agreementInsert.error) {
    // If the live database does not have the extended columns yet, fallback seamlessly
    const fallbackPayload = {
      restaurant_id: restaurantId,
      company_id: companyId,
      contract_type_id: contract.contractTypeId,
      name: contract.name.trim(),
      code,
      contract_number: (contract.contractNumber || code).trim(),
      valid_from: contract.validFrom,
      valid_to: contract.validTo,
      currency_code: currencyCode,
      status: contract.status || "active",
      active: contract.status === "active",
      pricing_method: contract.pricingMethod,
      rate_plan_id: primaryRatePlanId,
      discount_type: primaryDiscountType,
      discount_value: primaryDiscountValue,
      deposit_policy_id: contract.depositPolicyId || null,
      cancellation_policy_id: contract.cancellationPolicyId || null,
      no_show_policy_id: contract.noShowPolicyId || null,
      description: contract.notes?.trim() || null,
    };
    agreementInsert = await db
      .from("pms_corporate_agreements")
      .insert(fallbackPayload)
      .select("id")
      .single();
  }

  if (agreementInsert.error) {
    throw new Error(`Failed to create contract agreement: ${agreementInsert.error.message}`);
  }

  const agreementId = agreementInsert.data.id as string;

  // 4. Method C: Persist pms_contract_rates
  if (contract.pricingMethod === "contracted_rates" && contract.contractRates?.length > 0) {
    const rateRows = contract.contractRates.map((cr) => ({
      restaurant_id: restaurantId,
      agreement_id: agreementId,
      room_type_id: cr.roomTypeId,
      rate_kind: "fixed",
      amount: Number(cr.amount ?? 0),
      valid_from: contract.validFrom,
      valid_to: contract.validTo,
      active: true,
    }));
    const rateInsert = await db.from("pms_contract_rates").insert(rateRows);
    if (rateInsert.error) {
      throw new Error(`Failed to persist contracted room rates: ${rateInsert.error.message}`);
    }
  }

  // 5. Link contract documents
  if (contract.documents && contract.documents.length > 0) {
    const docRows = contract.documents.map((doc) => ({
      restaurant_id: restaurantId,
      company_master_id: companyId,
      agreement_id: agreementId,
      document_type_id: doc.documentTypeId,
      name: doc.fileName,
      storage_path: doc.fileStoragePath,
      uploaded_by_membership_id: membershipId,
      review_status: "verified",
    }));
    const docInsert = await db.from("guest_company_documents").insert(docRows);
    if (docInsert.error && !isMissingSchemaError(docInsert.error)) {
      console.error("Failed to link company contract documents:", docInsert.error.message);
    }
  }

  return agreementId;
}
