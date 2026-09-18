/**
 * Card 3 Phase 1 — Currency & Financial Settings (pure helpers).
 * Base currency, timezone and business date stay on restaurants (Card 1).
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CURRENCY_FX_SOURCES = ["manual", "bank", "system"] as const;
export type CurrencyFxSource = (typeof CURRENCY_FX_SOURCES)[number];

export const CURRENCY_ROUNDING = ["half_up", "half_even", "down", "up"] as const;
export type CurrencyRounding = (typeof CURRENCY_ROUNDING)[number];

export const CARD3_CURRENCY_TABS = [
  { id: "overview", label: "Overview" },
  { id: "currencies", label: "Currencies" },
  { id: "exchange-rates", label: "Exchange Rates" },
  { id: "financial-calendar", label: "Financial Calendar" },
  { id: "settings", label: "Settings" },
] as const;
export type Card3CurrencyTabId = (typeof CARD3_CURRENCY_TABS)[number]["id"];

export const FX_DIRECTION_COPY = "1 BASE = X QUOTE";
export const CARD3_CURRENCY_AUDIT_SECTION = "card3-currency";
export const CARD3_CURRENCY_UNAVAILABLE =
  "Currency & Financial Settings are unavailable until their approved migration is applied.";

export type PropertyCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  rounding: CurrencyRounding;
  active: boolean;
  isBase: boolean;
};

export type ExchangeRateRow = {
  id: string;
  quoteCurrencyCode: string;
  rate: number;
  effectiveDate: string;
  source: CurrencyFxSource;
  directionLabel: string;
};

export type FinancialSettings = {
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  defaultFxSource: CurrencyFxSource;
  allowMultiCurrency: boolean;
  saved: boolean;
};

export type CurrencyCard3AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  detail: string | null;
};

export type CurrencyCard3Inherited = {
  baseCurrency: string;
  timezone: string;
  businessDate: string;
};

export type CurrencyCard3Snapshot = {
  inherited: CurrencyCard3Inherited;
  currencies: PropertyCurrency[];
  rates: ExchangeRateRow[];
  settings: FinancialSettings;
  settingsRowExists: boolean;
};

export type CurrencyCard3Readiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
};

export function emptyFinancialSettings(): FinancialSettings {
  return {
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    defaultFxSource: "manual",
    allowMultiCurrency: false,
    saved: false,
  };
}

export function formatFxDirection(baseCurrency: string, quoteCurrency: string, rate: number): string {
  return `1 ${baseCurrency} = ${rate} ${quoteCurrency}`;
}

export function isIsoCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

export function evaluateCurrencyCard3Readiness(snapshot: CurrencyCard3Snapshot): CurrencyCard3Readiness {
  const blockers: string[] = [];
  const { inherited, currencies, rates, settings, settingsRowExists } = snapshot;
  const hasRows = settingsRowExists || currencies.length > 0 || rates.length > 0;

  if (!inherited.baseCurrency.trim()) blockers.push("Set the primary currency in Property & Business.");
  if (!settingsRowExists) blockers.push("Save financial settings.");
  if (settings.fiscalYearStartMonth < 1 || settings.fiscalYearStartMonth > 12) {
    blockers.push("Fiscal year start month must be 1–12.");
  }
  if (settings.fiscalYearStartDay < 1 || settings.fiscalYearStartDay > 31) {
    blockers.push("Fiscal year start day must be 1–31.");
  }
  if (!(CURRENCY_FX_SOURCES as readonly string[]).includes(settings.defaultFxSource)) {
    blockers.push("Choose a default FX source.");
  }
  if (settings.allowMultiCurrency) {
    const extras = currencies.filter((row) => row.active && !row.isBase);
    if (extras.length === 0) blockers.push("Add at least one active currency besides the Card 1 base.");
    const validRate = rates.some(
      (row) =>
        row.rate > 0 &&
        row.quoteCurrencyCode !== inherited.baseCurrency &&
        extras.some((currency) => currency.code === row.quoteCurrencyCode),
    );
    if (!validRate) blockers.push("Save a positive exchange rate for a non-base currency.");
  }

  if (!hasRows) {
    return { ready: false, status: "not_started", blockers };
  }
  if (blockers.length === 0) {
    return { ready: true, status: "complete", blockers };
  }
  return { ready: false, status: "in_progress", blockers };
}
