/**
 * FX Provider Abstraction Interface.
 *
 * Decouples NORU PMS from vendor-specific FX APIs.
 */

export type FxProviderMode = "open" | "keyed";

export interface FxProviderConfig {
  mode: FxProviderMode;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface FxRateResult {
  baseCurrency: "ETB";
  quoteCurrency: string;
  rate: number;
  effectiveDate: string; // YYYY-MM-DD
  fetchedAt: string; // ISO-8601
  provider: string;
}

export interface FxFetchResponse {
  success: boolean;
  baseCurrency: string;
  rates: Record<string, number>;
  effectiveDate: string; // YYYY-MM-DD
  fetchedAt: string; // ISO-8601
  provider: string;
  raw?: unknown;
}

export interface FxProvider {
  readonly name: string;
  fetchRates(
    baseCurrency: string,
    quoteCurrencies: string[],
  ): Promise<FxFetchResponse>;
}
