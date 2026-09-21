/**
 * Guest Profile Wave 4 — Company / Group / Travel Agent masters and
 * relationship links. Guest-owned tables only. Reservations consume master IDs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blankToNull, normalizeEmail, recordGuestAccountEvent, recordGuestEvent, requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { propertyToday, requireReservationManager } from "./reservations.server";
import { deriveStayOverview } from "./guest-profile-wave3";
import { guestStayAccessForRole, loadGuestStaysForProfile } from "./guests.functions";
import {
  WAVE5_ANONYMISED_MASTER_LABELS,
} from "./guest-profile-wave5";
import {
  COMPANY_ENRICHMENT_UNAVAILABLE,
  companyLegalName,
  validateCompanyType,
} from "./guest-profile-company";
import {
  TA_ENRICHMENT_UNAVAILABLE,
  hasPaymentTermsInput,
  validateAgencyType,
} from "./guest-profile-travel-agency";
import {
  GUEST_ACCOUNT_STATUSES,
  GUEST_ACCOUNT_TYPES,
  GUEST_RELATIONSHIP_ROLES,
  WAVE4_MIGRATION_UNAVAILABLE,
  assertRoleMatchesType,
  loyaltyFromStayOverview,
  type GuestAccountLink,
  type GuestAccountListPage,
  type GuestAccountProfile,
  type GuestAccountStatus,
  type GuestAccountSummary,
  type GuestAccountType,
  type GuestLoyaltyValue,
  type GuestRelationshipRole,
} from "./guest-profile-wave4";
import { isUuid, uuidFirstSegment } from "./guest-profile-listing";

const idSchema = z.string().uuid();

/** Wave 4 tables are not in generated types until 0053 is applied. */
function db(context: { supabase: { from: (table: string) => unknown } }) {
  return context.supabase as unknown as { from: (table: string) => any };
}

const MASTER_COLUMNS_BASE =
  "id, account_type, name, code, email, phone, address_line1, city, country, notes, account_status, created_at, updated_at";
const MASTER_COLUMNS = `${MASTER_COLUMNS_BASE}, anonymised_at`;
const MASTER_COLUMNS_COMPANY = `${MASTER_COLUMNS}, trade_name, company_type, company_type_other, tax_id, business_registration_number, phone_alt, email_alt, primary_contact_name, address_line2, region, postal_code, corporate_account_reference, negotiated_rate_reference, default_travel_agent_master_id, source_of_business`;
const MASTER_COLUMNS_TA = `${MASTER_COLUMNS_COMPANY}, agency_type, agency_type_other, website, billing_contact_name, iata_license_number, license_expiry_date, commission_label, commission_type, commission_currency_note, contract_reference, contract_start_date, contract_end_date, contract_status, contract_signed_with, payment_terms, credit_limit_note, billing_instruction`;

type MasterRow = {
  id: string;
  account_type: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  account_status: string;
  created_at: string;
  updated_at: string;
  anonymised_at?: string | null;
  trade_name?: string | null;
  company_type?: string | null;
  company_type_other?: string | null;
  tax_id?: string | null;
  business_registration_number?: string | null;
  phone_alt?: string | null;
  email_alt?: string | null;
  primary_contact_name?: string | null;
  address_line2?: string | null;
  region?: string | null;
  postal_code?: string | null;
  corporate_account_reference?: string | null;
  negotiated_rate_reference?: string | null;
  default_travel_agent_master_id?: string | null;
  source_of_business?: string | null;
  agency_type?: string | null;
  agency_type_other?: string | null;
  website?: string | null;
  billing_contact_name?: string | null;
  iata_license_number?: string | null;
  license_expiry_date?: string | null;
  commission_label?: string | null;
  commission_type?: string | null;
  commission_currency_note?: string | null;
  contract_reference?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  contract_status?: string | null;
  contract_signed_with?: string | null;
  payment_terms?: string | null;
  credit_limit_note?: string | null;
  billing_instruction?: string | null;
};

function emptyCompanyFields() {
  return {
    companyTypeOther: null as string | null,
    taxId: null as string | null,
    businessRegistrationNumber: null as string | null,
    phoneAlt: null as string | null,
    emailAlt: null as string | null,
    primaryContactName: null as string | null,
    addressLine2: null as string | null,
    region: null as string | null,
    postalCode: null as string | null,
    corporateAccountReference: null as string | null,
    negotiatedRateReference: null as string | null,
    defaultTravelAgentMasterId: null as string | null,
    defaultTravelAgentMasterName: null as string | null,
    sourceOfBusiness: null as string | null,
    agencyTypeOther: null as string | null,
    website: null as string | null,
    billingContactName: null as string | null,
    iataLicenseNumber: null as string | null,
    licenseExpiryDate: null as string | null,
    commissionLabel: null as string | null,
    commissionType: null as string | null,
    commissionCurrencyNote: null as string | null,
    contractReference: null as string | null,
    contractStartDate: null as string | null,
    contractEndDate: null as string | null,
    contractStatus: null as string | null,
    contractSignedWith: null as string | null,
    paymentTerms: null as string | null,
    creditLimitNote: null as string | null,
    billingInstruction: null as string | null,
  };
}

function toSummary(row: MasterRow): GuestAccountSummary {
  const anonymisedAt = row.anonymised_at ?? null;
  const accountType = row.account_type as GuestAccountType;
  return {
    id: row.id,
    accountType,
    name: anonymisedAt ? WAVE5_ANONYMISED_MASTER_LABELS[accountType] : row.name,
    code: anonymisedAt ? null : row.code,
    phone: anonymisedAt ? null : row.phone,
    email: anonymisedAt ? null : row.email,
    accountStatus: row.account_status as GuestAccountStatus,
    updatedAt: row.updated_at,
    anonymisedAt,
    tradeName: anonymisedAt ? null : (row.trade_name ?? null),
    companyType: row.company_type ?? null,
    agencyType: row.agency_type ?? null,
  };
}

function toProfile(row: MasterRow, defaultTravelAgentMasterName: string | null = null): GuestAccountProfile {
  const summary = toSummary(row);
  const anonymised = Boolean(row.anonymised_at);
  const empty = emptyCompanyFields();
  return {
    ...summary,
    addressLine1: anonymised ? null : row.address_line1,
    city: anonymised ? null : row.city,
    country: anonymised ? null : row.country,
    notes: anonymised ? null : row.notes,
    createdAt: row.created_at,
    ...empty,
    ...(anonymised
      ? {}
      : {
          companyTypeOther: row.company_type_other ?? null,
          taxId: row.tax_id ?? null,
          businessRegistrationNumber: row.business_registration_number ?? null,
          phoneAlt: row.phone_alt ?? null,
          emailAlt: row.email_alt ?? null,
          primaryContactName: row.primary_contact_name ?? null,
          addressLine2: row.address_line2 ?? null,
          region: row.region ?? null,
          postalCode: row.postal_code ?? null,
          corporateAccountReference: row.corporate_account_reference ?? null,
          negotiatedRateReference: row.negotiated_rate_reference ?? null,
          defaultTravelAgentMasterId: row.default_travel_agent_master_id ?? null,
          defaultTravelAgentMasterName,
          sourceOfBusiness: row.source_of_business ?? null,
          agencyTypeOther: row.agency_type_other ?? null,
          website: row.website ?? null,
          billingContactName: row.billing_contact_name ?? null,
          iataLicenseNumber: row.iata_license_number ?? null,
          licenseExpiryDate: row.license_expiry_date ?? null,
          commissionLabel: row.commission_label ?? null,
          commissionType: row.commission_type ?? null,
          commissionCurrencyNote: row.commission_currency_note ?? null,
          contractReference: row.contract_reference ?? null,
          contractStartDate: row.contract_start_date ?? null,
          contractEndDate: row.contract_end_date ?? null,
          contractStatus: row.contract_status ?? null,
          contractSignedWith: row.contract_signed_with ?? null,
          paymentTerms: row.payment_terms ?? null,
          creditLimitNote: row.credit_limit_note ?? null,
          billingInstruction: row.billing_instruction ?? null,
        }),
  };
}

async function selectMaster(
  context: { supabase: { from: (table: string) => unknown } },
  restaurantId: string,
  extra: (query: any) => any,
) {
  let result = await extra(
    db(context).from("guest_account_masters").select(MASTER_COLUMNS_TA).eq("restaurant_id", restaurantId),
  );
  if (result.error && isMissingSchemaError(result.error)) {
    result = await extra(
      db(context).from("guest_account_masters").select(MASTER_COLUMNS_COMPANY).eq("restaurant_id", restaurantId),
    );
  }
  if (result.error && isMissingSchemaError(result.error)) {
    result = await extra(
      db(context).from("guest_account_masters").select(MASTER_COLUMNS).eq("restaurant_id", restaurantId),
    );
  }
  if (result.error && isMissingSchemaError(result.error)) {
    result = await extra(
      db(context).from("guest_account_masters").select(MASTER_COLUMNS_BASE).eq("restaurant_id", restaurantId),
    );
  }
  return result;
}

function wave4Unavailable(error: { message?: string; code?: string } | null | undefined): boolean {
  return Boolean(error && isMissingSchemaError(error));
}

const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  code: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  accountStatus: z.enum(GUEST_ACCOUNT_STATUSES).optional(),
  tradeName: z.string().max(200).optional().nullable(),
  companyType: z.string().max(40).optional().nullable(),
  companyTypeOther: z.string().max(200).optional().nullable(),
  taxId: z.string().max(80).optional().nullable(),
  businessRegistrationNumber: z.string().max(80).optional().nullable(),
  phoneAlt: z.string().max(60).optional().nullable(),
  emailAlt: z.string().max(200).optional().nullable(),
  primaryContactName: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
  corporateAccountReference: z.string().max(120).optional().nullable(),
  negotiatedRateReference: z.string().max(120).optional().nullable(),
  defaultTravelAgentMasterId: z.string().uuid().optional().nullable(),
  sourceOfBusiness: z.string().max(200).optional().nullable(),
  agencyType: z.string().max(40).optional().nullable(),
  agencyTypeOther: z.string().max(200).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  billingContactName: z.string().max(200).optional().nullable(),
  iataLicenseNumber: z.string().max(80).optional().nullable(),
  licenseExpiryDate: z.string().max(20).optional().nullable(),
  commissionLabel: z.string().max(120).optional().nullable(),
  commissionType: z.string().max(40).optional().nullable(),
  commissionCurrencyNote: z.string().max(80).optional().nullable(),
  contractReference: z.string().max(120).optional().nullable(),
  contractStartDate: z.string().max(20).optional().nullable(),
  contractEndDate: z.string().max(20).optional().nullable(),
  contractStatus: z.string().max(40).optional().nullable(),
  contractSignedWith: z.string().max(200).optional().nullable(),
  paymentTerms: z.string().max(120).optional().nullable(),
  creditLimitNote: z.string().max(200).optional().nullable(),
  billingInstruction: z.string().max(4000).optional().nullable(),
});

function assertEmail(email: string | null, label: string) {
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return email;
}

function paymentTermsColumns(input: z.infer<typeof accountInputSchema>) {
  return {
    payment_terms: blankToNull(input.paymentTerms),
    credit_limit_note: blankToNull(input.creditLimitNote),
    billing_instruction: blankToNull(input.billingInstruction),
  };
}

function toMasterColumns(
  input: z.infer<typeof accountInputSchema>,
  options?: { includeCompany?: boolean; includeTravelAgent?: boolean; includePaymentTerms?: boolean },
) {
  const email = assertEmail(normalizeEmail(input.email), "email address");
  const emailAlt = assertEmail(normalizeEmail(input.emailAlt), "alternate email address");
  const base = {
    name: companyLegalName(input.name),
    code: blankToNull(input.code),
    email,
    phone: blankToNull(input.phone),
    address_line1: blankToNull(input.addressLine1),
    city: blankToNull(input.city),
    country: blankToNull(input.country),
    notes: blankToNull(input.notes),
    account_status: input.accountStatus ?? "active",
  };
  const shared = {
    trade_name: blankToNull(input.tradeName),
    phone_alt: blankToNull(input.phoneAlt),
    email_alt: emailAlt,
    primary_contact_name: blankToNull(input.primaryContactName),
    address_line2: blankToNull(input.addressLine2),
    region: blankToNull(input.region),
    postal_code: blankToNull(input.postalCode),
    tax_id: blankToNull(input.taxId),
    business_registration_number: blankToNull(input.businessRegistrationNumber),
    negotiated_rate_reference: blankToNull(input.negotiatedRateReference),
  };
  if (options?.includeTravelAgent) {
    return {
      ...base,
      ...shared,
      ...paymentTermsColumns(input),
      agency_type: blankToNull(input.agencyType),
      agency_type_other:
        input.agencyType === "other" ? blankToNull(input.agencyTypeOther) : null,
      website: blankToNull(input.website),
      billing_contact_name: blankToNull(input.billingContactName),
      iata_license_number: blankToNull(input.iataLicenseNumber),
      license_expiry_date: blankToNull(input.licenseExpiryDate),
      commission_label: blankToNull(input.commissionLabel),
      commission_type: blankToNull(input.commissionType),
      commission_currency_note: blankToNull(input.commissionCurrencyNote),
      contract_reference: blankToNull(input.contractReference),
      contract_start_date: blankToNull(input.contractStartDate),
      contract_end_date: blankToNull(input.contractEndDate),
      contract_status: blankToNull(input.contractStatus),
      contract_signed_with: blankToNull(input.contractSignedWith),
    };
  }
  if (!options?.includeCompany) return base;
  return {
    ...base,
    ...shared,
    company_type: blankToNull(input.companyType),
    company_type_other:
      input.companyType === "other" ? blankToNull(input.companyTypeOther) : null,
    corporate_account_reference: blankToNull(input.corporateAccountReference),
    default_travel_agent_master_id: input.defaultTravelAgentMasterId || null,
    source_of_business: blankToNull(input.sourceOfBusiness),
    ...(options.includePaymentTerms ? paymentTermsColumns(input) : {}),
  };
}

async function assertDefaultTravelAgent(
  context: { supabase: { from: (table: string) => unknown } },
  restaurantId: string,
  masterId: string | null | undefined,
  companyId?: string,
) {
  if (!masterId) return;
  if (companyId && masterId === companyId) {
    throw new Error("Default travel agent must be a Travel Agent master, not this Company.");
  }
  const result = await db(context)
    .from("guest_account_masters")
    .select("id, account_type")
    .eq("restaurant_id", restaurantId)
    .eq("id", masterId)
    .maybeSingle();
  if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("That travel agent master could not be found.");
  if (result.data.account_type !== "travel_agent") {
    throw new Error("Default travel agent must be an existing Travel Agent master.");
  }
}

export const listGuestAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(GUEST_ACCOUNT_TYPES),
        search: z.string().max(120).optional(),
        status: z.enum(GUEST_ACCOUNT_STATUSES).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).max(20_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountListPage> => {
    await requireGuestManager(context as never, data.restaurantId);
    const term = (data.search ?? "").trim();
    const like = term ? `%${term.replace(/[%,]/g, "")}%` : "";
    const offset = data.offset ?? 0;
    const limit = data.limit ?? 100;
    function applyFilters(query: any, includeTrade: boolean) {
      let next = query.eq("account_type", data.accountType).order("updated_at", { ascending: false });
      if (data.status) next = next.eq("account_status", data.status);
      if (term) {
        const parts = includeTrade
          ? [`name.ilike.${like}`, `code.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`, `trade_name.ilike.${like}`]
          : [`name.ilike.${like}`, `code.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`];
        if (isUuid(term)) parts.push(`id.eq.${term}`);
        const segment = uuidFirstSegment(term);
        if (segment && !isUuid(term)) {
          parts.push(
            `and(id.gte.${segment}-0000-0000-0000-000000000000,id.lte.${segment}-ffff-ffff-ffff-ffffffffffff)`,
          );
        }
        next = next.or(parts.join(","));
      }
      return next.range(offset, offset + limit - 1);
    }
    let result = await applyFilters(
      db(context)
        .from("guest_account_masters")
        .select(MASTER_COLUMNS_TA, { count: "exact" })
        .eq("restaurant_id", data.restaurantId),
      true,
    );
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(
        db(context)
          .from("guest_account_masters")
          .select(MASTER_COLUMNS_COMPANY, { count: "exact" })
          .eq("restaurant_id", data.restaurantId),
        true,
      );
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(
        db(context)
          .from("guest_account_masters")
          .select(MASTER_COLUMNS, { count: "exact" })
          .eq("restaurant_id", data.restaurantId),
        false,
      );
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(
        db(context)
          .from("guest_account_masters")
          .select(MASTER_COLUMNS_BASE, { count: "exact" })
          .eq("restaurant_id", data.restaurantId),
        false,
      );
    }
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    const items = ((result.data ?? []) as MasterRow[]).map(toSummary);
    return { items, total: result.count ?? items.length, offset, limit };
  });

export const getGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountProfile> => {
    await requireGuestManager(context as never, data.restaurantId);
    const result = await selectMaster(context, data.restaurantId, (query) =>
      query.eq("id", data.accountId).maybeSingle(),
    );
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("That account master could not be found.");
    const row = result.data as MasterRow;
    let defaultTravelAgentMasterName: string | null = null;
    if (row.default_travel_agent_master_id) {
      const ta = await db(context)
        .from("guest_account_masters")
        .select("name, account_type, anonymised_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", row.default_travel_agent_master_id)
        .maybeSingle();
      if (ta.data) {
        const accountType = ta.data.account_type as GuestAccountType;
        defaultTravelAgentMasterName = ta.data.anonymised_at
          ? WAVE5_ANONYMISED_MASTER_LABELS[accountType]
          : ta.data.name;
      }
    }
    return toProfile(row, defaultTravelAgentMasterName);
  });

export type GuestAccountHistoryEntry = {
  id: string;
  eventType: string;
  notes: string | null;
  createdAt: string;
};

export const listGuestAccountHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountHistoryEntry[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const result = await db(context)
      .from("guest_account_history")
      .select("id, event_type, notes, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.accountId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as Array<{
      id: string;
      event_type: string;
      notes: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  });

export const createGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(GUEST_ACCOUNT_TYPES),
        account: accountInputSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const isCompany = data.accountType === "company";
    const isTravelAgent = data.accountType === "travel_agent";
    if (isCompany || isTravelAgent) {
      const { assertListingCreateAllowed } = await import("./guest-workspace-config.functions");
      await assertListingCreateAllowed(data.restaurantId, isCompany ? "company" : "travel-agent");
    }
    if (isCompany) {
      const typeError = validateCompanyType(data.account.companyType, data.account.companyTypeOther);
      if (typeError) throw new Error(typeError);
      await assertDefaultTravelAgent(
        context,
        data.restaurantId,
        data.account.defaultTravelAgentMasterId,
      );
    }
    if (isTravelAgent) {
      const typeError = validateAgencyType(data.account.agencyType, data.account.agencyTypeOther);
      if (typeError) throw new Error(typeError);
    }
    const columns = toMasterColumns(data.account, {
      includeCompany: isCompany,
      includeTravelAgent: isTravelAgent,
      includePaymentTerms: isCompany || isTravelAgent,
    });
    let inserted: { id: string } | null = null;
    let error: { message?: string; code?: string } | null = null;
    const first = await db(context)
      .from("guest_account_masters")
      .insert({
        ...columns,
        restaurant_id: data.restaurantId,
        account_type: data.accountType,
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .single();
    inserted = first.data as { id: string } | null;
    error = first.error;
    if (error && isMissingSchemaError(error) && isTravelAgent) {
      throw new Error(TA_ENRICHMENT_UNAVAILABLE);
    }
    if (error && isMissingSchemaError(error) && isCompany) {
      if (
        hasPaymentTermsInput(
          data.account.paymentTerms,
          data.account.creditLimitNote,
          data.account.billingInstruction,
        )
      ) {
        throw new Error(TA_ENRICHMENT_UNAVAILABLE);
      }
      const retryCompany = await db(context)
        .from("guest_account_masters")
        .insert({
          ...toMasterColumns(data.account, { includeCompany: true, includePaymentTerms: false }),
          restaurant_id: data.restaurantId,
          account_type: data.accountType,
          created_by_staff_membership_id: me.id,
        })
        .select("id")
        .single();
      inserted = retryCompany.data as { id: string } | null;
      error = retryCompany.error;
      if (error && isMissingSchemaError(error) && isCompany) {
        throw new Error(COMPANY_ENRICHMENT_UNAVAILABLE);
      }
    }
    if (error && isMissingSchemaError(error) && !isCompany && !isTravelAgent) {
      const retry = await db(context)
        .from("guest_account_masters")
        .insert({
          ...toMasterColumns(data.account),
          restaurant_id: data.restaurantId,
          account_type: data.accountType,
          created_by_staff_membership_id: me.id,
        })
        .select("id")
        .single();
      inserted = retry.data as { id: string } | null;
      error = retry.error;
    }
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error || !inserted) throw new Error(error?.message ?? "Could not create this account master.");
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: inserted.id,
      eventType: "created",
      newValues: { name: columns.name, accountType: data.accountType },
      notes: `Created ${data.accountType} master ${columns.name}`,
      actorMembershipId: me.id,
    });
    return { id: inserted.id };
  });

export const updateGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        account: accountInputSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const existing = await selectMaster(context, data.restaurantId, (query) =>
      query.eq("id", data.accountId).maybeSingle(),
    );
    if (wave4Unavailable(existing.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data) throw new Error("That account master could not be found.");
    if ((existing.data as MasterRow).anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }
    const before = existing.data as MasterRow;
    const isCompany = before.account_type === "company";
    const isTravelAgent = before.account_type === "travel_agent";
    if (isCompany) {
      const typeError = validateCompanyType(data.account.companyType, data.account.companyTypeOther);
      if (typeError) throw new Error(typeError);
      await assertDefaultTravelAgent(
        context,
        data.restaurantId,
        data.account.defaultTravelAgentMasterId,
        data.accountId,
      );
    }
    if (isTravelAgent) {
      const typeError = validateAgencyType(data.account.agencyType, data.account.agencyTypeOther);
      if (typeError) throw new Error(typeError);
    }
    const columns = toMasterColumns(data.account, {
      includeCompany: isCompany,
      includeTravelAgent: isTravelAgent,
      includePaymentTerms: isCompany || isTravelAgent,
    });
    let { error } = await db(context)
      .from("guest_account_masters")
      .update(columns)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId);
    if (error && isMissingSchemaError(error) && isTravelAgent) {
      throw new Error(TA_ENRICHMENT_UNAVAILABLE);
    }
    if (error && isMissingSchemaError(error) && isCompany) {
      if (
        hasPaymentTermsInput(
          data.account.paymentTerms,
          data.account.creditLimitNote,
          data.account.billingInstruction,
        )
      ) {
        throw new Error(TA_ENRICHMENT_UNAVAILABLE);
      }
      const retryCompany = await db(context)
        .from("guest_account_masters")
        .update(toMasterColumns(data.account, { includeCompany: true, includePaymentTerms: false }))
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.accountId);
      error = retryCompany.error;
      if (error && isMissingSchemaError(error) && isCompany) {
        throw new Error(COMPANY_ENRICHMENT_UNAVAILABLE);
      }
    }
    if (error && isMissingSchemaError(error) && !isCompany && !isTravelAgent) {
      const retry = await db(context)
        .from("guest_account_masters")
        .update(toMasterColumns(data.account))
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.accountId);
      error = retry.error;
    }
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error) throw new Error(error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.accountId,
      eventType: "profile_updated",
      previousValues: { name: before.name, email: before.email, phone: before.phone },
      newValues: { name: columns.name, email: columns.email, phone: columns.phone },
      notes: `Updated ${before.name}`,
      actorMembershipId: me.id,
    });
    return { id: data.accountId };
  });

type LinkRow = {
  id: string;
  guest_id: string;
  master_id: string;
  role: string;
  created_at: string;
  guest_profiles: { first_name: string; last_name: string | null } | null;
  guest_account_masters: { name: string; account_type: string } | null;
};

const LINK_SELECT = `
  id, guest_id, master_id, role, created_at,
  guest_profiles!guest_account_links_guest_same_property ( first_name, last_name ),
  guest_account_masters!guest_account_links_master_same_property ( name, account_type )
`;

function toLink(row: LinkRow): GuestAccountLink {
  const guest = row.guest_profiles;
  const master = row.guest_account_masters;
  return {
    id: row.id,
    guestId: row.guest_id,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    masterId: row.master_id,
    masterName: master?.name ?? "Account",
    masterType: (master?.account_type ?? "company") as GuestAccountType,
    role: row.role as GuestRelationshipRole,
    createdAt: row.created_at,
  };
}

export const listGuestAccountLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema.optional(),
        accountId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountLink[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    if (!data.guestId && !data.accountId) {
      throw new Error("Choose a guest or an account master to list relationships.");
    }
    let query = db(context)
      .from("guest_account_links")
      .select(LINK_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false });
    if (data.guestId) query = query.eq("guest_id", data.guestId);
    if (data.accountId) query = query.eq("master_id", data.accountId);
    const result = await query;
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as unknown as LinkRow[]).map(toLink);
  });

export const linkGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        accountId: idSchema,
        role: z.enum(GUEST_RELATIONSHIP_ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);

    const { data: master, error: masterError } = await db(context)
      .from("guest_account_masters")
      .select("id, name, account_type")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (wave4Unavailable(masterError)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (masterError) throw new Error(masterError.message);
    if (!master) throw new Error("That account master could not be found.");
    const typeMismatch = assertRoleMatchesType(data.role, master.account_type as GuestAccountType);
    if (typeMismatch) throw new Error(typeMismatch);

    const { data: guest, error: guestError } = await db(context)
      .from("guest_profiles")
      .select("id, first_name, last_name")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guestError) throw new Error(guestError.message);
    if (!guest) throw new Error("That guest could not be found.");

    const { data: inserted, error } = await db(context)
      .from("guest_account_links")
      .insert({
        restaurant_id: data.restaurantId,
        guest_id: data.guestId,
        master_id: data.accountId,
        role: data.role,
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .single();
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error) {
      if (error.code === "23505") throw new Error("That relationship is already linked.");
      throw new Error(error.message);
    }
    if (!inserted) throw new Error("Could not link this relationship.");

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "relationship_linked",
      newValues: { masterId: data.accountId, role: data.role, masterName: master.name },
      notes: `Linked as ${data.role} to ${master.name}`,
      actorMembershipId: me.id,
    });
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.accountId,
      eventType: "relationship_linked",
      newValues: { guestId: data.guestId, role: data.role, guestName: [guest.first_name, guest.last_name].filter(Boolean).join(" ") },
      notes: `Linked ${data.role}`,
      actorMembershipId: me.id,
    });

    return { id: inserted.id };
  });

export const linkGuestAccountsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        guestIds: z.array(idSchema).min(1).max(50),
        role: z.enum(GUEST_RELATIONSHIP_ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ linked: number; skipped: number }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { data: master, error: masterError } = await db(context)
      .from("guest_account_masters")
      .select("id, name, account_type")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (wave4Unavailable(masterError)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (masterError) throw new Error(masterError.message);
    if (!master) throw new Error("That account master could not be found.");
    if (master.account_type !== "company" && master.account_type !== "travel_agent") {
      throw new Error("Multi-guest link is available on Company and Travel Agent masters.");
    }
    const typeMismatch = assertRoleMatchesType(data.role, master.account_type as GuestAccountType);
    if (typeMismatch) throw new Error(typeMismatch);

    const uniqueGuestIds = [...new Set(data.guestIds)];
    let linked = 0;
    let skipped = 0;
    for (const guestId of uniqueGuestIds) {
      const { data: guest, error: guestError } = await db(context)
        .from("guest_profiles")
        .select("id, first_name, last_name")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", guestId)
        .maybeSingle();
      if (guestError) throw new Error(guestError.message);
      if (!guest) throw new Error("That guest could not be found.");

      const { data: inserted, error } = await db(context)
        .from("guest_account_links")
        .insert({
          restaurant_id: data.restaurantId,
          guest_id: guestId,
          master_id: data.accountId,
          role: data.role,
          created_by_staff_membership_id: me.id,
        })
        .select("id")
        .single();
      if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
      if (error?.code === "23505") {
        skipped += 1;
        continue;
      }
      if (error || !inserted) throw new Error(error?.message ?? "Could not link this relationship.");

      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId,
        eventType: "relationship_linked",
        newValues: { masterId: data.accountId, role: data.role, masterName: master.name },
        notes: `Linked as ${data.role} to ${master.name}`,
        actorMembershipId: me.id,
      });
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.accountId,
        eventType: "relationship_linked",
        newValues: {
          guestId,
          role: data.role,
          guestName: [guest.first_name, guest.last_name].filter(Boolean).join(" "),
        },
        notes: `Linked ${data.role}`,
        actorMembershipId: me.id,
      });
      linked += 1;
    }
    return { linked, skipped };
  });

export const unlinkGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        linkId: idSchema,
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ guestRemaining: boolean; masterRemaining: boolean }> => {
      const me = await requireGuestManager(context as never, data.restaurantId);
      const { data: link, error: readError } = await db(context)
        .from("guest_account_links")
        .select("id, guest_id, master_id, role")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.linkId)
        .maybeSingle();
      if (wave4Unavailable(readError)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
      if (readError) throw new Error(readError.message);
      if (!link) throw new Error("That relationship could not be found.");

      const { error: deleteError } = await db(context)
        .from("guest_account_links")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.linkId);
      if (deleteError) throw new Error(deleteError.message);

      const [{ data: guest }, { data: master }] = await Promise.all([
        db(context)
          .from("guest_profiles")
          .select("id")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", link.guest_id)
          .maybeSingle(),
        db(context)
          .from("guest_account_masters")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", link.master_id)
          .maybeSingle(),
      ]);

      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: link.guest_id,
        eventType: "relationship_unlinked",
        previousValues: { masterId: link.master_id, role: link.role },
        notes: `Unlinked ${link.role}. The individual and the master were not deleted.`,
        actorMembershipId: me.id,
      });
      if (master) {
        await recordGuestAccountEvent({
          restaurantId: data.restaurantId,
          masterId: link.master_id,
          eventType: "relationship_unlinked",
          previousValues: { guestId: link.guest_id, role: link.role },
          notes: `Unlinked ${link.role}. The individual and the master were not deleted.`,
          actorMembershipId: me.id,
        });
      }

      return { guestRemaining: Boolean(guest), masterRemaining: Boolean(master) };
    },
  );

export const getAccountLoyaltyValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestLoyaltyValue> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const access = guestStayAccessForRole(me.role);
    const links = await db(context)
      .from("guest_account_links")
      .select("guest_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.accountId);
    if (wave4Unavailable(links.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (links.error) throw new Error(links.error.message);
    const guestIds = [
      ...new Set(((links.data ?? []) as Array<{ guest_id: string }>).map((row) => row.guest_id)),
    ];
    const stays = (
      await Promise.all(
        guestIds.map((guestId) =>
          loadGuestStaysForProfile(context as never, data.restaurantId, guestId, access),
        ),
      )
    ).flat();
    const { data: restaurant } = await db(context)
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const today = propertyToday((restaurant as { timezone?: string } | null)?.timezone ?? "UTC");
    const overview = deriveStayOverview(stays, today, access);
    return {
      ...loyaltyFromStayOverview(overview, false),
      memberCount: guestIds.length,
    };
  });

export type ReservationGuestMasters = {
  companyMasterId: string | null;
  companyMasterName: string | null;
  groupAccountMasterId: string | null;
  groupAccountMasterName: string | null;
  travelAgentMasterId: string | null;
  travelAgentMasterName: string | null;
  available: boolean;
};

async function resolveMasterName(
  supabase: { from: (table: string) => any },
  restaurantId: string,
  masterId: string | null,
): Promise<string | null> {
  if (!masterId) return null;
  const result = await supabase
    .from("guest_account_masters")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("id", masterId)
    .maybeSingle();
  return (result.data as { name: string } | null)?.name ?? null;
}

export const getReservationGuestMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationGuestMasters> => {
    await requireReservationManager(context as never, data.restaurantId);
    const empty: ReservationGuestMasters = {
      companyMasterId: null,
      companyMasterName: null,
      groupAccountMasterId: null,
      groupAccountMasterName: null,
      travelAgentMasterId: null,
      travelAgentMasterName: null,
      available: true,
    };
    const result = await db(context)
      .from("hotel_reservations")
      .select("company_master_id, group_account_master_id, travel_agent_master_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (wave4Unavailable(result.error)) return { ...empty, available: false };
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Reservation not found for this property.");
    const row = result.data as {
      company_master_id: string | null;
      group_account_master_id: string | null;
      travel_agent_master_id: string | null;
    };
    const [companyName, groupName, taName] = await Promise.all([
      resolveMasterName(db(context) as never, data.restaurantId, row.company_master_id),
      resolveMasterName(db(context) as never, data.restaurantId, row.group_account_master_id),
      resolveMasterName(db(context) as never, data.restaurantId, row.travel_agent_master_id),
    ]);
    return {
      companyMasterId: row.company_master_id,
      companyMasterName: companyName,
      groupAccountMasterId: row.group_account_master_id,
      groupAccountMasterName: groupName,
      travelAgentMasterId: row.travel_agent_master_id,
      travelAgentMasterName: taName,
      available: true,
    };
  });

export const setReservationGuestMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        companyMasterId: idSchema.nullable().optional(),
        groupAccountMasterId: idSchema.nullable().optional(),
        travelAgentMasterId: idSchema.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireReservationManager(context as never, data.restaurantId);

    async function assertType(id: string | null | undefined, type: GuestAccountType) {
      if (!id) return;
      const result = await db(context)
        .from("guest_account_masters")
        .select("id, account_type")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", id)
        .maybeSingle();
      if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new Error("That account master could not be found.");
      if (result.data.account_type !== type) {
        throw new Error("That master is the wrong account type for this stay field.");
      }
    }

    await assertType(data.companyMasterId, "company");
    await assertType(data.groupAccountMasterId, "group");
    await assertType(data.travelAgentMasterId, "travel_agent");

    const patch: Record<string, string | null> = {};
    if (data.companyMasterId !== undefined) patch["company_master_id"] = data.companyMasterId;
    if (data.groupAccountMasterId !== undefined) {
      patch["group_account_master_id"] = data.groupAccountMasterId;
    }
    if (data.travelAgentMasterId !== undefined) {
      patch["travel_agent_master_id"] = data.travelAgentMasterId;
    }

    const { error } = await db(context)
      .from("hotel_reservations")
      .update(patch)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId);
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error) throw new Error(error.message);
    return { id: data.reservationId };
  });

export const listReservationsForGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(GUEST_ACCOUNT_TYPES),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; rows: Array<{ id: string; confirmationNumber: string; guestName: string; masterName: string | null }> }> => {
      await requireReservationManager(context as never, data.restaurantId);
      const column =
        data.accountType === "company"
          ? "company_master_id"
          : data.accountType === "group"
            ? "group_account_master_id"
            : "travel_agent_master_id";
      const result = await db(context)
        .from("hotel_reservations")
        .select(
          `id, confirmation_number, ${column}, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )`,
        )
        .eq("restaurant_id", data.restaurantId)
        .not(column, "is", null)
        .order("arrival_date", { ascending: false })
        .limit(data.limit ?? 50);
      if (wave4Unavailable(result.error)) return { available: false, rows: [] };
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data ?? []) as Array<{
        id: string;
        confirmation_number: string;
        company_master_id?: string | null;
        group_account_master_id?: string | null;
        travel_agent_master_id?: string | null;
        guest_profiles: { first_name: string; last_name: string | null } | null;
      }>;
      const masterIds = [
        ...new Set(
          rows
            .map((row) => row.company_master_id ?? row.group_account_master_id ?? row.travel_agent_master_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const names = new Map<string, string>();
      if (masterIds.length > 0) {
        const masters = await db(context)
          .from("guest_account_masters")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .in("id", masterIds);
        for (const master of (masters.data ?? []) as Array<{ id: string; name: string }>) {
          names.set(master.id, master.name);
        }
      }
      return {
        available: true,
        rows: rows.map((row) => {
          const masterId = row.company_master_id ?? row.group_account_master_id ?? row.travel_agent_master_id ?? null;
          const guest = row.guest_profiles;
          return {
            id: row.id,
            confirmationNumber: row.confirmation_number,
            guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
            masterName: masterId ? (names.get(masterId) ?? null) : null,
          };
        }),
      };
    },
  );
