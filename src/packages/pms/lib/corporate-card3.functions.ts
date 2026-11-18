import { requirePmsSetupActor } from "./pms-permissions.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  CARD3_CORPORATE_AUDIT_SECTION,
  CARD3_CORPORATE_UNAVAILABLE,
  CONTRACT_RATE_KIND_LABELS,
  CONTRACT_RATE_KINDS,
  evaluateCorporateCard3Readiness,
  type ContractRateKind,
  type ContractRateRow,
  type CorporateAgreementRow,
  type CorporateBillingRuleRef,
  type CorporateCard3Snapshot,
  type CorporateCompanyRef,
  type CorporateCurrencyRef,
  type CorporateRoomTypeRef,
} from "./corporate-card3.server";

// 0075 is intentionally not represented in generated types.ts until its approved apply.
// Keep the untyped database boundary isolated to this functions module.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

const idSchema = z.string().uuid();
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_]{1,20}$/.test(value), "Use 1–20 letters, numbers, or underscores.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const descriptionSchema = z.string().trim().max(500).optional();

const agreementSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    companyId: idSchema,
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    contractNumber: z.string().trim().min(1).max(40),
    contractTypeId: idSchema.optional().nullable(),
    validFrom: isoDate,
    validTo: isoDate,
    currencyCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code."),
    description: descriptionSchema,
    active: z.boolean(),
    autoRenew: z.boolean().optional(),
    noticePeriodDays: z.number().int().min(0).max(3650).optional().nullable(),
    signedAt: isoDate.optional().nullable(),
    signedBy: z.string().trim().max(200).optional().nullable(),
    fileStoragePath: z.string().trim().max(400).optional().nullable(),
  })
  .refine((data) => data.validTo >= data.validFrom, {
    message: "Valid to must be on or after valid from.",
    path: ["validTo"],
  });

const contractRateSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    agreementId: idSchema,
    roomTypeId: idSchema,
    rateKind: z.enum(CONTRACT_RATE_KINDS),
    amount: z.number().min(0, "Amount cannot be negative.").max(10_000_000),
    validFrom: isoDate,
    validTo: isoDate,
    active: z.boolean(),
  })
  .refine((data) => data.validTo >= data.validFrom, {
    message: "Valid to must be on or after valid from.",
    path: ["validTo"],
  });

function unavailable(error: { code?: string; message?: string } | null): never {
  if (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST204"
  ) {
    throw new Error(CARD3_CORPORATE_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_CORPORATE_UNAVAILABLE);
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        error.message?.includes("does not exist")),
  );
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function asRateKind(value: unknown): ContractRateKind {
  return (CONTRACT_RATE_KINDS as readonly string[]).includes(String(value))
    ? (value as ContractRateKind)
    : "negotiated";
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
    metadata: { section: CARD3_CORPORATE_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-corporate] audit", result.error.message);
}

function mapCompany(row: any): CorporateCompanyRef {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: String(row.account_status ?? "active") !== "inactive",
    paymentTerms: String(row.payment_terms ?? ""),
    creditLimitNote: String(row.credit_limit_note ?? ""),
    defaultBillingRuleId: row.default_billing_rule_id
      ? String(row.default_billing_rule_id)
      : null,
  };
}

function mapRoomType(row: any): CorporateRoomTypeRef {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

async function loadCompanies(db: DbClient, restaurantId: string): Promise<CorporateCompanyRef[]> {
  const withBilling = await db
    .from("guest_account_masters")
    .select(
      "id, code, name, account_type, account_status, payment_terms, credit_limit_note, default_billing_rule_id",
    )
    .eq("restaurant_id", restaurantId)
    .eq("account_type", "company")
    .order("code");
  if (withBilling.error && isMissingColumn(withBilling.error)) {
    const full = await db
      .from("guest_account_masters")
      .select("id, code, name, account_type, account_status, payment_terms, credit_limit_note")
      .eq("restaurant_id", restaurantId)
      .eq("account_type", "company")
      .order("code");
    if (full.error && isMissingColumn(full.error)) {
      const basic = await db
        .from("guest_account_masters")
        .select("id, code, name, account_type, account_status")
        .eq("restaurant_id", restaurantId)
        .eq("account_type", "company")
        .order("code");
      if (basic.error) unavailable(basic.error);
      return (basic.data ?? []).map(mapCompany);
    }
    if (full.error) unavailable(full.error);
    return (full.data ?? []).map(mapCompany);
  }
  if (withBilling.error) unavailable(withBilling.error);
  return (withBilling.data ?? []).map(mapCompany);
}

async function loadCurrencies(
  db: DbClient,
  restaurantId: string,
): Promise<CorporateCurrencyRef[]> {
  const restaurant = await db
    .from("restaurants")
    .select("currency_code")
    .eq("id", restaurantId)
    .maybeSingle();
  if (restaurant.error) unavailable(restaurant.error);
  const base = String(restaurant.data?.currency_code ?? "").toUpperCase();
  const supported = await db
    .from("pms_property_currencies")
    .select("code, active")
    .eq("restaurant_id", restaurantId)
    .order("code");
  const codes = new Map<string, CorporateCurrencyRef>();
  if (base) codes.set(base, { code: base, isBase: true });
  if (
    supported.error &&
    (supported.error.code === "42P01" ||
      supported.error.code === "42703" ||
      supported.error.code === "PGRST205" ||
      supported.error.code === "PGRST204")
  ) {
    return [...codes.values()];
  }
  if (supported.error) unavailable(supported.error);
  for (const row of supported.data ?? []) {
    if (row.active === false) continue;
    const code = String(row.code ?? "").toUpperCase();
    if (!code) continue;
    if (!codes.has(code)) codes.set(code, { code, isBase: code === base });
  }
  return [...codes.values()];
}

async function loadBillingRules(
  db: DbClient,
  restaurantId: string,
): Promise<CorporateBillingRuleRef[]> {
  const result = await db
    .from("pms_billing_rules")
    .select("id, code, name, payment_terms, active")
    .eq("restaurant_id", restaurantId)
    .order("code");
  if (
    result.error &&
    (result.error.code === "42P01" ||
      result.error.code === "PGRST205" ||
      isMissingColumn(result.error))
  ) {
    return [];
  }
  if (result.error) unavailable(result.error);
  return (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    paymentTerms: row.payment_terms ? String(row.payment_terms) : null,
    active: row.active !== false,
  }));
}

async function loadContractTypeLabels(
  db: DbClient,
  restaurantId: string,
): Promise<Map<string, string>> {
  const result = await db
    .from("pms_contract_types")
    .select("id, code, name")
    .eq("restaurant_id", restaurantId);
  if (
    result.error &&
    (result.error.code === "42P01" ||
      result.error.code === "PGRST205" ||
      isMissingColumn(result.error))
  ) {
    return new Map();
  }
  if (result.error) unavailable(result.error);
  return new Map(
    (result.data ?? []).map((row: any) => [
      String(row.id),
      `${String(row.code ?? "").toUpperCase()} — ${String(row.name ?? "")}`,
    ]),
  );
}

async function loadAgreements(db: DbClient, restaurantId: string) {
  const withType = await db
    .from("pms_corporate_agreements")
    .select(
      "id, company_id, code, name, contract_number, contract_type_id, valid_from, valid_to, currency_code, description, active, auto_renew, notice_period_days, signed_at, signed_by, file_storage_path",
    )
    .eq("restaurant_id", restaurantId)
    .order("code");
  if (withType.error && isMissingColumn(withType.error)) {
    const withRenew = await db
      .from("pms_corporate_agreements")
      .select(
        "id, company_id, code, name, contract_number, valid_from, valid_to, currency_code, description, active, auto_renew, notice_period_days, signed_at, signed_by, file_storage_path",
      )
      .eq("restaurant_id", restaurantId)
      .order("code");
    if (withRenew.error && isMissingColumn(withRenew.error)) {
      return db
        .from("pms_corporate_agreements")
        .select(
          "id, company_id, code, name, contract_number, valid_from, valid_to, currency_code, description, active",
        )
        .eq("restaurant_id", restaurantId)
        .order("code");
    }
    return withRenew;
  }
  return withType;
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<CorporateCard3Snapshot> {
  const [companies, roomTypes, currencies, billingRules, agreements, rates, contractTypeLabels] =
    await Promise.all([
      loadCompanies(db, restaurantId),
      db
        .from("room_types")
        .select("id, code, name, active")
        .eq("restaurant_id", restaurantId)
        .order("code"),
      loadCurrencies(db, restaurantId),
      loadBillingRules(db, restaurantId),
      loadAgreements(db, restaurantId),
      db
        .from("pms_contract_rates")
        .select("id, agreement_id, room_type_id, rate_kind, amount, valid_from, valid_to, active")
        .eq("restaurant_id", restaurantId)
        .order("valid_from"),
      loadContractTypeLabels(db, restaurantId),
    ]);
  if (roomTypes.error) unavailable(roomTypes.error);
  if (agreements.error) unavailable(agreements.error);
  if (rates.error) unavailable(rates.error);

  const companyRows = companies;
  const roomTypeRows = (roomTypes.data ?? []).map(mapRoomType);
  const companyById = new Map(companyRows.map((row) => [row.id, `${row.code} — ${row.name}`]));
  const roomById = new Map(roomTypeRows.map((row) => [row.id, `${row.code} — ${row.name}`]));

  const agreementRows: CorporateAgreementRow[] = (agreements.data ?? []).map((row: any) => {
    const contractTypeId = row.contract_type_id ? String(row.contract_type_id) : null;
    return {
      id: row.id,
      companyId: String(row.company_id),
      companyLabel: companyById.get(String(row.company_id)) ?? "",
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      contractNumber: String(row.contract_number ?? ""),
      contractTypeId,
      contractTypeLabel: contractTypeId ? (contractTypeLabels.get(contractTypeId) ?? "") : "",
      validFrom: String(row.valid_from ?? ""),
      validTo: String(row.valid_to ?? ""),
      currencyCode: String(row.currency_code ?? "").toUpperCase(),
      description: String(row.description ?? ""),
      active: row.active !== false,
      autoRenew: row.auto_renew === true,
      noticePeriodDays: row.notice_period_days == null ? null : Number(row.notice_period_days),
      signedAt: row.signed_at ? String(row.signed_at) : null,
      signedBy: row.signed_by ? String(row.signed_by) : null,
      fileStoragePath: row.file_storage_path ? String(row.file_storage_path) : null,
    };
  });
  const agreementById = new Map(
    agreementRows.map((row) => [row.id, `${row.code} — ${row.name}`]),
  );

  const contractRates: ContractRateRow[] = (rates.data ?? []).map((row: any) => {
    const rateKind = asRateKind(row.rate_kind);
    return {
      id: row.id,
      agreementId: String(row.agreement_id),
      agreementLabel: agreementById.get(String(row.agreement_id)) ?? "",
      roomTypeId: String(row.room_type_id),
      roomTypeLabel: roomById.get(String(row.room_type_id)) ?? "",
      rateKind,
      rateKindLabel: CONTRACT_RATE_KIND_LABELS[rateKind],
      amount: Number(row.amount ?? 0),
      validFrom: String(row.valid_from ?? ""),
      validTo: String(row.valid_to ?? ""),
      active: row.active !== false,
    };
  });

  return {
    companies: companyRows,
    roomTypes: roomTypeRows,
    currencies,
    billingRules,
    agreements: agreementRows,
    contractRates,
  };
}

export { loadSnapshot as loadCorporateCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_CORPORATE_AUDIT_SECTION })
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) return [];
  return (result.data ?? []).map((row: any) => ({
    id: row.id,
    action: String(row.action ?? ""),
    createdAt: String(row.created_at ?? ""),
    detail: typeof row.metadata?.detail === "string" ? row.metadata.detail : null,
  }));
}

async function requireOwnedRecord(
  db: DbClient,
  table: string,
  restaurantId: string,
  id: string,
  message: string,
) {
  const result = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error(message);
}

async function requireCompany(db: DbClient, restaurantId: string, companyId: string) {
  const result = await db
    .from("guest_account_masters")
    .select("id, account_type")
    .eq("id", companyId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("That company doesn't belong to this property.");
  if (String(result.data.account_type) !== "company") {
    throw new Error("Agreements must use a Guest Profile company account.");
  }
}

async function requireSupportedCurrency(
  db: DbClient,
  restaurantId: string,
  currencyCode: string,
) {
  const currencies = await loadCurrencies(db, restaurantId);
  if (!currencies.some((row) => row.code === currencyCode)) {
    throw new Error("Choose the Card 1 base currency or a Card 3 supported currency.");
  }
}

async function requireContractType(
  db: DbClient,
  restaurantId: string,
  contractTypeId: string | null | undefined,
) {
  if (!contractTypeId) return;
  await requireOwnedRecord(
    db,
    "pms_contract_types",
    restaurantId,
    contractTypeId,
    "That contract type doesn't belong to this property.",
  );
}

export const getCorporateCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsSetupActor(context as never, data.restaurantId, PMS_PERMISSIONS.CONFIG_FINANCIAL_VIEW);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCorporateCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveCorporateAgreementCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => agreementSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsSetupActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_FINANCIAL_CONFIGURE,
    );
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await requireCompany(db, data.restaurantId, data.companyId);
    await requireSupportedCurrency(db, data.restaurantId, data.currencyCode);
    await requireContractType(db, data.restaurantId, data.contractTypeId);
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_corporate_agreements",
        data.restaurantId,
        data.id,
        "That agreement doesn't belong to this property.",
      );
    }

    const basePayload = {
      restaurant_id: data.restaurantId,
      company_id: data.companyId,
      code: data.code,
      name: data.name,
      contract_number: data.contractNumber,
      valid_from: data.validFrom,
      valid_to: data.validTo,
      currency_code: data.currencyCode,
      description: data.description?.trim() ? data.description.trim() : null,
      active: data.active,
      auto_renew: data.autoRenew ?? false,
      notice_period_days: data.noticePeriodDays ?? null,
      signed_at: data.signedAt ?? null,
      signed_by: data.signedBy?.trim() ? data.signedBy.trim() : null,
      file_storage_path: data.fileStoragePath?.trim() ? data.fileStoragePath.trim() : null,
    };

    const withType = {
      ...basePayload,
      contract_type_id: data.contractTypeId ?? null,
    };

    async function write(payload: Record<string, unknown>) {
      if (data.id) {
        return db
          .from("pms_corporate_agreements")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .single();
      }
      return db.from("pms_corporate_agreements").insert(payload).select("id").single();
    }

    let result = await write(withType);
    if (result.error && isMissingColumn(result.error) && "contract_type_id" in withType) {
      result = await write(basePayload);
    }
    if (result.error && isMissingColumn(result.error)) {
      const minimal = {
        restaurant_id: data.restaurantId,
        company_id: data.companyId,
        code: data.code,
        name: data.name,
        contract_number: data.contractNumber,
        valid_from: data.validFrom,
        valid_to: data.validTo,
        currency_code: data.currencyCode,
        description: data.description?.trim() ? data.description.trim() : null,
        active: data.active,
      };
      result = await write(minimal);
    }
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That agreement code is already used.");
      unavailable(result.error);
    }

    const agreementId = String(result.data?.id ?? data.id ?? "");
    await writeAudit(db, data.restaurantId, context.userId, "card3_corporate_agreement_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      agreementId,
      snapshot,
      readiness: evaluateCorporateCard3Readiness(snapshot),
    };
  });

export const saveContractRateCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => contractRateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsSetupActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.CONFIG_FINANCIAL_CONFIGURE,
    );
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await Promise.all([
      requireOwnedRecord(
        db,
        "pms_corporate_agreements",
        data.restaurantId,
        data.agreementId,
        "That agreement doesn't belong to this property.",
      ),
      requireOwnedRecord(
        db,
        "room_types",
        data.restaurantId,
        data.roomTypeId,
        "Contract rates must use a Card 2 room type for this property.",
      ),
      data.id
        ? requireOwnedRecord(
            db,
            "pms_contract_rates",
            data.restaurantId,
            data.id,
            "That contract rate doesn't belong to this property.",
          )
        : Promise.resolve(),
    ]);
    const payload = {
      restaurant_id: data.restaurantId,
      agreement_id: data.agreementId,
      room_type_id: data.roomTypeId,
      rate_kind: data.rateKind,
      amount: data.amount,
      valid_from: data.validFrom,
      valid_to: data.validTo,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_contract_rates")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_contract_rates").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error("That room type already has a contract rate starting on this date.");
      }
      unavailable(result.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_contract_rate_saved", {
      detail: `${data.rateKind} ${data.amount}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCorporateCard3Readiness(snapshot) };
  });
