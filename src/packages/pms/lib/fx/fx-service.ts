/**
 * FX Service — Server-side orchestration for exchange rate synchronization.
 *
 * Enforces:
 * - ETB as base currency (1 ETB = 1 ETB, no external ETB->ETB row)
 * - Persisting source = 'system' to comply with DB check constraint
 * - Same-day manual vs system precedence (preserves manual entries)
 * - Safe failure handling (preserves previous valid rates)
 * - Auditing provider metadata on restaurant_staff_audit_log
 */

import { ExchangeRateApiProvider } from "./providers/exchange-rate-api-provider";
import type { FxProvider } from "./fx-provider";

export interface FxRefreshResult {
  success: boolean;
  provider: string;
  effectiveDate: string;
  updatedCount: number;
  preservedManualCount: number;
  persistedCount: number;
  manualPreservedCount: number;
  baseCurrency: string;
  rates: Record<string, number>;
  error?: string;
}


export interface FxPropertyStatus {
  lastRefreshAt: string | null;
  providerName: string;
  status: "current" | "stale" | "failed" | "not_configured";
  lastError: string | null;
}

export class FxService {
  constructor(private readonly provider: FxProvider = new ExchangeRateApiProvider()) {}

  async refreshRatesForProperty(
    db: any,
    restaurantId: string,
    userId?: string,
  ): Promise<FxRefreshResult> {
    // 1. Load active currencies for this property (excluding base ETB)
    const currenciesResult = await db
      .from("pms_property_currencies")
      .select("code, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true);

    if (currenciesResult.error) {
      throw new Error(`Failed to load property currencies: ${currenciesResult.error.message}`);
    }

    const quoteCodes: string[] = (currenciesResult.data ?? [])
      .map((row: { code: string }) => row.code.toUpperCase())
      .filter((code: string) => code && code !== "ETB");

    if (quoteCodes.length === 0) {
      return {
        success: true,
        provider: this.provider.name,
        effectiveDate: new Date().toISOString().slice(0, 10),
        updatedCount: 0,
        preservedManualCount: 0,
        persistedCount: 0,
        manualPreservedCount: 0,
        baseCurrency: "ETB",
        rates: {},
      };
    }

    // 2. Fetch rates from external provider
    let response;
    try {
      response = await this.provider.fetchRates("ETB", quoteCodes);
    } catch (err: unknown) {
      const errorMessage = (err as Error)?.message || "Failed to fetch rates from FX provider.";
      console.error("[fx-service] provider error:", errorMessage);

      // Record failure audit log event without corrupting previous rates
      if (userId) {
        await db.from("restaurant_staff_audit_log").insert({
          restaurant_id: restaurantId,
          actor_user_id: userId,
          target_user_id: userId,
          action: "card3_fx_refresh_failed",
          metadata: {
            section: "card3-currency",
            provider: this.provider.name,
            error: errorMessage,
            attemptedAt: new Date().toISOString(),
          },
        });
      }

      return {
        success: false,
        provider: this.provider.name,
        effectiveDate: new Date().toISOString().slice(0, 10),
        updatedCount: 0,
        preservedManualCount: 0,
        persistedCount: 0,
        manualPreservedCount: 0,
        baseCurrency: "ETB",
        rates: {},
        error: errorMessage,
      };
    }


    const { effectiveDate, rates, fetchedAt } = response;

    // 3. Query existing rows for that effective date to respect manual precedence
    const existingResult = await db
      .from("pms_exchange_rates")
      .select("id, quote_currency_code, source")
      .eq("restaurant_id", restaurantId)
      .eq("effective_date", effectiveDate);

    const existingByQuote = new Map<string, { id: string; source: string }>();
    if (!existingResult.error && existingResult.data) {
      for (const row of existingResult.data) {
        existingByQuote.set(row.quote_currency_code.toUpperCase(), row);
      }
    }

    let updatedCount = 0;
    let preservedManualCount = 0;

    for (const [quote, rate] of Object.entries(rates)) {
      if (quote === "ETB") continue; // Never persist ETB -> ETB

      const existing = existingByQuote.get(quote);

      // Same-day precedence: preserve manual entry
      if (existing?.source === "manual") {
        preservedManualCount++;
        continue;
      }

      const payload = {
        restaurant_id: restaurantId,
        quote_currency_code: quote,
        rate,
        effective_date: effectiveDate,
        source: "system", // Satisfies CHECK constraint: manual | bank | system
      };

      if (existing) {
        await db
          .from("pms_exchange_rates")
          .update(payload)
          .eq("id", existing.id)
          .eq("restaurant_id", restaurantId);
      } else {
        await db.from("pms_exchange_rates").insert(payload);
      }
      updatedCount++;
    }

    // 4. Record successful audit event
    if (userId) {
      await db.from("restaurant_staff_audit_log").insert({
        restaurant_id: restaurantId,
        actor_user_id: userId,
        target_user_id: userId,
        action: "card3_fx_refreshed",
        metadata: {
          section: "card3-currency",
          provider: this.provider.name,
          effectiveDate,
          fetchedAt,
          updatedCount,
          preservedManualCount,
          ratesCount: Object.keys(rates).length,
        },
      });
    }

    return {
      success: true,
      provider: this.provider.name,
      effectiveDate,
      updatedCount,
      preservedManualCount,
      persistedCount: updatedCount,
      manualPreservedCount: preservedManualCount,
      baseCurrency: "ETB",
      rates,
    };
  }


  async getLatestFxStatus(db: any, restaurantId: string): Promise<FxPropertyStatus> {
    const result = await db
      .from("restaurant_staff_audit_log")
      .select("action, created_at, metadata")
      .eq("restaurant_id", restaurantId)
      .in("action", ["card3_fx_refreshed", "card3_fx_refresh_failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!result.data) {
      return {
        lastRefreshAt: null,
        providerName: this.provider.name,
        status: "not_configured",
        lastError: null,
      };
    }

    const { action, created_at, metadata } = result.data;
    const providerName = String(metadata?.provider ?? this.provider.name);
    const lastError = action === "card3_fx_refresh_failed" ? String(metadata?.error ?? "Provider refresh failed") : null;

    if (action === "card3_fx_refresh_failed") {
      return {
        lastRefreshAt: created_at,
        providerName,
        status: "failed",
        lastError,
      };
    }

    // Evaluate freshness: <= 48h is current, > 48h is stale
    const refreshTime = new Date(created_at).getTime();
    const now = Date.now();
    const hoursSince = (now - refreshTime) / (1000 * 60 * 60);

    return {
      lastRefreshAt: created_at,
      providerName,
      status: hoursSince <= 48 ? "current" : "stale",
      lastError: null,
    };
  }
}

export const defaultFxService = new FxService();
