/**
 * ExchangeRate-API Provider Implementation.
 *
 * Supports two distinct modes:
 * - open: https://open.er-api.com/v6/latest/ETB (free, rate-limited, no key)
 * - keyed: https://v6.exchangerate-api.com/v6/{API_KEY}/latest/ETB (commercial, key-authenticated)
 */

import type { FxFetchResponse, FxProvider, FxProviderConfig } from "../fx-provider";

export const DEFAULT_OPEN_URL = "https://open.er-api.com/v6/latest";
export const DEFAULT_KEYED_URL = "https://v6.exchangerate-api.com/v6";
export const DEFAULT_TIMEOUT_MS = 10_000;

export function resolveProviderConfig(): FxProviderConfig {
  const mode = (process.env.FX_PROVIDER_MODE?.toLowerCase() === "keyed" ? "keyed" : "open") as "open" | "keyed";
  const apiKey = process.env.FX_PROVIDER_API_KEY?.trim();
  const baseUrl = process.env.FX_PROVIDER_BASE_URL?.trim();

  return {
    mode,
    baseUrl: baseUrl || (mode === "keyed" ? DEFAULT_KEYED_URL : DEFAULT_OPEN_URL),
    apiKey,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

export class ExchangeRateApiProvider implements FxProvider {
  readonly name = "ExchangeRate-API";
  private readonly config: FxProviderConfig;

  constructor(config?: Partial<FxProviderConfig>) {
    const resolved = resolveProviderConfig();
    const effectiveMode = config?.mode ?? resolved.mode;
    const defaultBaseUrl = effectiveMode === "keyed" ? DEFAULT_KEYED_URL : DEFAULT_OPEN_URL;
    const effectiveBaseUrl = config?.baseUrl ?? (resolved.mode === effectiveMode ? resolved.baseUrl : defaultBaseUrl);

    this.config = {
      mode: effectiveMode,
      baseUrl: effectiveBaseUrl || defaultBaseUrl,
      apiKey: config?.apiKey !== undefined ? config.apiKey : resolved.apiKey,
      timeoutMs: config?.timeoutMs ?? resolved.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    if (this.config.mode === "keyed" && !this.config.apiKey) {
      throw new Error(
        "FX_PROVIDER_API_KEY is required when FX_PROVIDER_MODE is set to 'keyed'.",
      );
    }
  }

  buildUrl(baseCurrency: string): string {
    const base = baseCurrency.toUpperCase();
    if (this.config.mode === "keyed") {
      const baseApiUrl = (this.config.baseUrl || DEFAULT_KEYED_URL).replace(/\/+$/, "");
      return `${baseApiUrl}/${this.config.apiKey}/latest/${base}`;
    }

    const baseApiUrl = (this.config.baseUrl || DEFAULT_OPEN_URL).replace(/\/+$/, "");
    return `${baseApiUrl}/${base}`;
  }

  async fetchRates(
    baseCurrency: string,
    quoteCurrencies: string[],
  ): Promise<FxFetchResponse> {
    const normalizedBase = baseCurrency.trim().toUpperCase();
    if (normalizedBase !== "ETB") {
      throw new Error(
        `ExchangeRateApiProvider requires base currency 'ETB' for property setup, received '${baseCurrency}'.`,
      );
    }

    const normalizedQuotes = quoteCurrencies
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code && code !== "ETB");

    if (normalizedQuotes.length === 0) {
      return {
        success: true,
        baseCurrency: normalizedBase,
        rates: {},
        effectiveDate: new Date().toISOString().slice(0, 10),
        fetchedAt: new Date().toISOString(),
        provider: this.name,
      };
    }

    const url = this.buildUrl(normalizedBase);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `ExchangeRate-API request failed with HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const payload = (await response.json()) as Record<string, unknown>;

      if (payload.result !== "success") {
        const errorType = String(payload["error-type"] ?? "unknown_error");
        throw new Error(`ExchangeRate-API responded with error: ${errorType}`);
      }

      const returnedBase = String(payload.base_code ?? "").toUpperCase();
      if (returnedBase !== normalizedBase) {
        throw new Error(
          `ExchangeRate-API returned base currency '${returnedBase}', expected '${normalizedBase}'.`,
        );
      }

      const rawRates = payload.rates as Record<string, unknown> | undefined;
      if (!rawRates || typeof rawRates !== "object") {
        throw new Error("ExchangeRate-API response missing valid 'rates' object.");
      }

      const validatedRates: Record<string, number> = {};
      for (const quote of normalizedQuotes) {
        const val = rawRates[quote];
        if (typeof val === "number" && Number.isFinite(val) && val > 0) {
          validatedRates[quote] = val;
        }
      }

      let effectiveDate = new Date().toISOString().slice(0, 10);
      if (typeof payload.time_last_update_utc === "string") {
        const parsed = new Date(payload.time_last_update_utc);
        if (!Number.isNaN(parsed.getTime())) {
          effectiveDate = parsed.toISOString().slice(0, 10);
        }
      } else if (typeof payload.time_last_update_unix === "number") {
        const parsed = new Date(payload.time_last_update_unix * 1000);
        if (!Number.isNaN(parsed.getTime())) {
          effectiveDate = parsed.toISOString().slice(0, 10);
        }
      }

      return {
        success: true,
        baseCurrency: normalizedBase,
        rates: validatedRates,
        effectiveDate,
        fetchedAt: new Date().toISOString(),
        provider: this.name,
        raw: payload,
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        throw new Error(
          `ExchangeRate-API request timed out after ${this.config.timeoutMs}ms.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
