import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { displayedBusinessDate } from "./pms-set1-foundation";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD3_CURRENCY_AUDIT_SECTION,
  CARD3_CURRENCY_UNAVAILABLE,
  CURRENCY_FX_SOURCES,
  CURRENCY_ROUNDING,
  emptyFinancialSettings,
  evaluateCurrencyCard3Readiness,
  formatFxDirection,
  type CurrencyCard3AuditRow,
  type CurrencyCard3Snapshot,
  type CurrencyFxSource,
  type CurrencyRounding,
  type ExchangeRateRow,
  type FinancialSettings,
  type PropertyCurrency,
} from "./currency-card3.server";

type DbClient = any;

const idSchema = z.string().uuid();
const isoCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), "Enter a 3-letter ISO currency code.");

const currencySchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: isoCode,
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(12),
  decimalPlaces: z.number().int().min(0).max(4),
  rounding: z.enum(CURRENCY_ROUNDING),
  active: z.boolean(),
});

const rateSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  quoteCurrencyCode: isoCode,
  rate: z.number().positive("Exchange rate must be greater than zero."),
  effectiveDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an effective date."),
  source: z.enum(CURRENCY_FX_SOURCES),
});

const settingsSchema = z.object({
  restaurantId: idSchema,
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  fiscalYearStartDay: z.number().int().min(1).max(31),
  defaultFxSource: z.enum(CURRENCY_FX_SOURCES),
  allowMultiCurrency: z.boolean(),
});

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    throw new Error(CARD3_CURRENCY_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_CURRENCY_UNAVAILABLE);
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
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
    metadata: { section: CARD3_CURRENCY_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-currency] audit", result.error.message);
}

async function loadBase(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurants")
    .select("currency_code, timezone, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const baseCurrency = String(result.data?.currency_code ?? "").trim().toUpperCase();
  const timezone = String(result.data?.timezone ?? "").trim();
  return {
    baseCurrency,
    timezone,
    businessDate: displayedBusinessDate(result.data?.business_date ?? null, timezone),
  };
}

function mapCurrency(row: any, baseCurrency: string): PropertyCurrency {
  const code = String(row.code ?? "").toUpperCase();
  return {
    id: row.id,
    code,
    name: String(row.name ?? ""),
    symbol: String(row.symbol ?? ""),
    decimalPlaces: Number(row.decimal_places ?? 2),
    rounding: ((CURRENCY_ROUNDING as readonly string[]).includes(row.rounding) ? row.rounding : "half_up") as CurrencyRounding,
    active: row.active !== false,
    isBase: code === baseCurrency,
  };
}

function mapRate(row: any, baseCurrency: string): ExchangeRateRow {
  const quote = String(row.quote_currency_code ?? "").toUpperCase();
  const rate = Number(row.rate);
  return {
    id: row.id,
    quoteCurrencyCode: quote,
    rate,
    effectiveDate: String(row.effective_date ?? ""),
    source: ((CURRENCY_FX_SOURCES as readonly string[]).includes(row.source) ? row.source : "manual") as CurrencyFxSource,
    directionLabel: formatFxDirection(baseCurrency, quote, rate),
  };
}

function mapSettings(row: any | null): FinancialSettings {
  if (!row) return emptyFinancialSettings();
  return {
    fiscalYearStartMonth: Number(row.fiscal_year_start_month ?? 1),
    fiscalYearStartDay: Number(row.fiscal_year_start_day ?? 1),
    defaultFxSource: ((CURRENCY_FX_SOURCES as readonly string[]).includes(row.default_fx_source)
      ? row.default_fx_source
      : "manual") as CurrencyFxSource,
    allowMultiCurrency: row.allow_multi_currency === true,
    saved: true,
  };
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<CurrencyCard3Snapshot> {
  const inherited = await loadBase(db, restaurantId);
  const [currencies, rates, settings] = await Promise.all([
    db
      .from("pms_property_currencies")
      .select("id, code, name, symbol, decimal_places, rounding, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_exchange_rates")
      .select("id, quote_currency_code, rate, effective_date, source")
      .eq("restaurant_id", restaurantId)
      .order("effective_date", { ascending: false }),
    db.from("pms_financial_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
  ]);
  for (const result of [currencies, rates, settings]) {
    if (result.error) unavailable(result.error);
  }
  return {
    inherited,
    currencies: (currencies.data ?? []).map((row: any) => mapCurrency(row, inherited.baseCurrency)),
    rates: (rates.data ?? []).map((row: any) => mapRate(row, inherited.baseCurrency)),
    settings: mapSettings(settings.data),
    settingsRowExists: Boolean(settings.data),
  };
}

export { loadSnapshot as loadCurrencyCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string): Promise<CurrencyCard3AuditRow[]> {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_CURRENCY_AUDIT_SECTION })
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

export const getCurrencyCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCurrencyCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveCurrencyCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => currencySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const inherited = await loadBase(db, data.restaurantId);
    const isBase = data.code === inherited.baseCurrency;
    let active = data.active;
    if (isBase) active = true;

    if (data.id) {
      const existing = await db
        .from("pms_property_currencies")
        .select("id, code, active")
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (existing.error) unavailable(existing.error);
      if (!existing.data) throw new Error("Currency was not found.");
      if (String(existing.data.code).toUpperCase() !== data.code) {
        throw new Error("Currency code cannot be changed after it is saved.");
      }
      if (String(existing.data.code).toUpperCase() === inherited.baseCurrency && data.active === false) {
        throw new Error("The Card 1 base currency cannot be deactivated.");
      }
      const updated = await db
        .from("pms_property_currencies")
        .update({
          name: data.name,
          symbol: data.symbol,
          decimal_places: data.decimalPlaces,
          rounding: data.rounding,
          active,
        })
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_property_currencies").insert({
        restaurant_id: data.restaurantId,
        code: data.code,
        name: data.name,
        symbol: data.symbol,
        decimal_places: data.decimalPlaces,
        rounding: data.rounding,
        active,
      });
      if (inserted.error) unavailable(inserted.error);
    }

    await writeAudit(db, data.restaurantId, context.userId, "card3_currency_saved", {
      detail: `${data.code} ${data.name}`,
      code: data.code,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCurrencyCard3Readiness(snapshot) };
  });

export const saveExchangeRateCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const inherited = await loadBase(db, data.restaurantId);
    if (!inherited.baseCurrency) throw new Error("Set the primary currency in Property & Business first.");
    if (data.quoteCurrencyCode === inherited.baseCurrency) {
      throw new Error("Quote currency cannot be the Card 1 base currency.");
    }
    if (!(data.rate > 0)) throw new Error("Exchange rate must be greater than zero.");

    const payload = {
      restaurant_id: data.restaurantId,
      quote_currency_code: data.quoteCurrencyCode,
      rate: data.rate,
      effective_date: data.effectiveDate,
      source: data.source,
    };
    const result = data.id
      ? await db
          .from("pms_exchange_rates")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_exchange_rates").insert(payload);
    if (result.error) unavailable(result.error);

    await writeAudit(db, data.restaurantId, context.userId, "card3_rate_saved", {
      detail: formatFxDirection(inherited.baseCurrency, data.quoteCurrencyCode, data.rate),
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCurrencyCard3Readiness(snapshot) };
  });

export const saveFinancialSettingsCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const result = await db.from("pms_financial_settings").upsert(
      {
        restaurant_id: data.restaurantId,
        fiscal_year_start_month: data.fiscalYearStartMonth,
        fiscal_year_start_day: data.fiscalYearStartDay,
        default_fx_source: data.defaultFxSource,
        allow_multi_currency: data.allowMultiCurrency,
      },
      { onConflict: "restaurant_id" },
    );
    if (result.error) unavailable(result.error);

    await writeAudit(db, data.restaurantId, context.userId, "card3_financial_settings_saved", {
      detail: `FY ${data.fiscalYearStartMonth}/${data.fiscalYearStartDay}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCurrencyCard3Readiness(snapshot) };
  });
