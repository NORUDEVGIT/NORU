import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD3_CORPORATE_AUDIT_SECTION,
  CARD3_CORPORATE_UNAVAILABLE,
  CONTRACT_RATE_KIND_LABELS,
  CONTRACT_RATE_KINDS,
  evaluateCorporateCard3Readiness,
  type ContractRateKind,
  type ContractRateRow,
  type CorporateAgreementRow,
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
    validFrom: isoDate,
    validTo: isoDate,
    currencyCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code."),
    description: descriptionSchema,
    active: z.boolean(),
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
  const full = await db
    .from("guest_account_masters")
    .select("id, code, name, account_type, account_status, payment_terms, credit_limit_note")
    .eq("restaurant_id", restaurantId)
    .eq("account_type", "company")
    .order("code");
  if (
    full.error &&
    (full.error.code === "42703" || full.error.code === "PGRST204")
  ) {
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

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<CorporateCard3Snapshot> {
  const [companies, roomTypes, currencies, agreements, rates] = await Promise.all([
    loadCompanies(db, restaurantId),
    db
      .from("room_types")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    loadCurrencies(db, restaurantId),
    db
      .from("pms_corporate_agreements")
      .select(
        "id, company_id, code, name, contract_number, valid_from, valid_to, currency_code, description, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_contract_rates")
      .select(
        "id, agreement_id, room_type_id, rate_kind, amount, valid_from, valid_to, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("valid_from"),
  ]);
  if (roomTypes.error) unavailable(roomTypes.error);
  if (agreements.error) unavailable(agreements.error);
  if (rates.error) unavailable(rates.error);

  const companyRows = companies;
  const roomTypeRows = (roomTypes.data ?? []).map(mapRoomType);
  const companyById = new Map(companyRows.map((row) => [row.id, `${row.code} — ${row.name}`]));
  const roomById = new Map(roomTypeRows.map((row) => [row.id, `${row.code} — ${row.name}`]));

  const agreementRows: CorporateAgreementRow[] = (agreements.data ?? []).map((row: any) => ({
    id: row.id,
    companyId: String(row.company_id),
    companyLabel: companyById.get(String(row.company_id)) ?? "",
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    contractNumber: String(row.contract_number ?? ""),
    validFrom: String(row.valid_from ?? ""),
    validTo: String(row.valid_to ?? ""),
    currencyCode: String(row.currency_code ?? "").toUpperCase(),
    description: String(row.description ?? ""),
    active: row.active !== false,
  }));
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

export const getCorporateCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
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
  .inputValidator((input: unknown) => agreementSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await requireCompany(db, data.restaurantId, data.companyId);
    await requireSupportedCurrency(db, data.restaurantId, data.currencyCode);
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_corporate_agreements",
        data.restaurantId,
        data.id,
        "That agreement doesn't belong to this property.",
      );
    }
    const payload = {
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
    const result = data.id
      ? await db
          .from("pms_corporate_agreements")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_corporate_agreements").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That agreement code is already used.");
      unavailable(result.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_corporate_agreement_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCorporateCard3Readiness(snapshot) };
  });

export const saveContractRateCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contractRateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
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
