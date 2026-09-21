import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { COMMON_CURRENCIES } from "@/shared/lib/property-time";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3Section,
  Card3StatusDot,
  card3CurrencyCatalogMeta,
  card3CurrencyFlag,
  useCard3DraftSave,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import {
  PropertySetupField,
  PropertySetupFormGrid,
} from "@/packages/pms/components/settings/setup-kit";
import { CARD1_HREF } from "@/packages/pms/lib/pms-property-setup-card1";
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import {
  getCurrencyCard3,
  saveCurrencyCard3,
  saveExchangeRateCard3,
  saveFinancialSettingsCard3,
} from "@/packages/pms/lib/currency-card3.functions";
import {
  CARD3_CURRENCY_TABS,
  CURRENCY_FX_SOURCES,
  CURRENCY_ROUNDING,
  FX_DIRECTION_COPY,
  emptyFinancialSettings,
  formatFxDirection,
  type CurrencyCard3Snapshot,
  type CurrencyFxSource,
  type CurrencyRounding,
  type ExchangeRateRow,
  type PropertyCurrency,
} from "@/packages/pms/lib/currency-card3.server";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const FX_LABELS: Record<CurrencyFxSource, string> = {
  manual: "Manual",
  bank: "Bank",
  system: "System",
};

const ROUNDING_LABELS: Record<CurrencyRounding, string> = {
  half_up: "Half up",
  half_even: "Half even",
  down: "Down",
  up: "Up",
};

void CARD3_CURRENCY_TABS;

export function PmsPropertySetupCard3Currency({
  restaurantId,
  canEdit,
  domain,
}: {
  restaurantId: string;
  canEdit: boolean;
  domain: Card3Domain;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCurrencyCard3);
  const saveCurrency = useServerFn(saveCurrencyCard3);
  const saveRate = useServerFn(saveExchangeRateCard3);
  const saveSettings = useServerFn(saveFinancialSettingsCard3);
  const [currencySearch, setCurrencySearch] = useState("");
  const [rateSearch, setRateSearch] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState<PropertyCurrency | "new" | null>(null);
  const [rateDraft, setRateDraft] = useState<ExchangeRateRow | "new" | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const query = useQuery({
    queryKey: ["pms-card3-currency", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const snapshot: CurrencyCard3Snapshot | undefined = query.data?.snapshot;
  const inherited = snapshot?.inherited;
  const currencies = snapshot?.currencies ?? [];
  const rates = snapshot?.rates ?? [];
  const settings = snapshot?.settings ?? emptyFinancialSettings();

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter(
      (row) =>
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.symbol.toLowerCase().includes(q),
    );
  }, [currencies, currencySearch]);

  const filteredRates = useMemo(() => {
    const q = rateSearch.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter(
      (row) =>
        row.directionLabel.toLowerCase().includes(q) ||
        row.quoteCurrencyCode.toLowerCase().includes(q) ||
        row.effectiveDate.toLowerCase().includes(q) ||
        FX_LABELS[row.source].toLowerCase().includes(q),
    );
  }, [rates, rateSearch]);

  const quoteOptions = currencies.filter((row) => !row.isBase && row.active);
  const baseRow =
    currencies.find((row) => row.isBase || row.code === inherited?.baseCurrency) ?? null;
  const baseMeta = inherited ? card3CurrencyCatalogMeta(inherited.baseCurrency) : null;

  const currencyMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCurrency>[0]["data"]) =>
      saveCurrency({ data: input }),
    onSuccess: () => {
      toast.success("Currency saved.");
      setCurrencyDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["pms-card3-currency", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const rateMut = useMutation({
    mutationFn: (input: Parameters<typeof saveRate>[0]["data"]) => saveRate({ data: input }),
    onSuccess: () => {
      toast.success("Exchange rate saved.");
      setRateDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["pms-card3-currency", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const settingsMut = useMutation({
    mutationFn: (input: Parameters<typeof saveSettings>[0]["data"]) =>
      saveSettings({ data: input }),
    onSuccess: () => {
      toast.success("Financial settings saved.");
      setSettingsDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["pms-card3-currency", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useCard3DraftSave(
    canEdit
      ? {
          dirty: settingsDirty,
          pending: settingsMut.isPending,
          save: async () => {
            await settingsMut.mutateAsync({
              restaurantId,
              fiscalYearStartMonth: settings.fiscalYearStartMonth,
              fiscalYearStartDay: settings.fiscalYearStartDay,
              defaultFxSource: settings.defaultFxSource,
              allowMultiCurrency: settings.allowMultiCurrency,
            });
          },
        }
      : null,
  );

  function patchSettings(patch: Partial<typeof settings>) {
    setSettingsDirty(true);
    void queryClient.setQueryData(
      ["pms-card3-currency", restaurantId],
      (current: typeof query.data) =>
        current
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                settings: { ...current.snapshot.settings, ...patch },
              },
            }
          : current,
    );
  }

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading currency settings…</p>
      ) : query.isError || !snapshot || !inherited ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Currency settings are unavailable."}
        </p>
      ) : (
        <div className="space-y-5" data-testid="pms-card3-currency">
          <Card3InheritedStrip testId="card3-base-currency-strip">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {card3CurrencyFlag(inherited.baseCurrency)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[#6B6458]">
                  Primary Currency · Card 1
                </p>
                <p className="font-semibold text-[#251605]">
                  {inherited.baseCurrency} ·{" "}
                  {baseRow?.name || baseMeta?.name || inherited.baseCurrency} ·{" "}
                  {baseRow?.symbol || baseMeta?.symbol || inherited.baseCurrency}
                </p>
              </div>
              <Card3StatusDot active />
              <span className="rounded-full border border-[#436436] bg-[#436436]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#436436]">
                Base Currency
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Inherited from Card 1. Card 3 cannot create, delete, deactivate, or replace this row.{" "}
              <a href={CARD1_HREF} className="font-medium text-[#C89933]">
                Open Property & Business
              </a>
            </p>
          </Card3InheritedStrip>

          <Card3ListSection
            icon="money"
            title="Currencies"
            search={currencySearch}
            onSearch={setCurrencySearch}
            placeholder="Search currencies"
            addLabel="Add currency"
            onAdd={() => setCurrencyDraft("new")}
            canEdit={canEdit}
            columns={["Flag", "Code", "Name", "Symbol", "Decimals", "Status"]}
            empty={`No currencies saved yet. The Card 1 base (${inherited.baseCurrency}) still applies.`}
            rows={filteredCurrencies.map((row) => {
              const inheritedBase = row.isBase || row.code === inherited.baseCurrency;
              return {
                id: row.id,
                actionsLocked: inheritedBase,
                onEdit: inheritedBase ? undefined : () => setCurrencyDraft(row),
                cells: [
                  card3CurrencyFlag(row.code),
                  <>
                    {row.code}
                    {inheritedBase ? (
                      <span className="ml-2 rounded-full border border-[#CCCCCC] px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        Base
                      </span>
                    ) : null}
                  </>,
                  row.name,
                  row.symbol,
                  String(row.decimalPlaces),
                  <Card3StatusDot active={inheritedBase ? true : row.active} />,
                ],
              };
            })}
          />

          <Card3ListSection
            icon="money"
            title="Exchange Rates"
            helper={FX_DIRECTION_COPY}
            search={rateSearch}
            onSearch={setRateSearch}
            placeholder="Search exchange rates"
            addLabel="Add exchange rate"
            onAdd={() => setRateDraft("new")}
            canEdit={canEdit}
            columns={["Direction", "Effective", "Source"]}
            empty="No exchange rates yet."
            rows={filteredRates.map((row) => ({
              id: row.id,
              onEdit: () => setRateDraft(row),
              cells: [row.directionLabel, row.effectiveDate, FX_LABELS[row.source]],
            }))}
          />

          <Card3Section icon="date" title="Financial Calendar">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card3InheritedStrip>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Business date (Card 1)
                </p>
                <p className="mt-1 font-medium">{inherited.businessDate || "—"}</p>
              </Card3InheritedStrip>
              <Card3InheritedStrip>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Timezone (Card 1)
                </p>
                <p className="mt-1 font-medium">{inherited.timezone || "—"}</p>
              </Card3InheritedStrip>
            </div>
            <PropertySetupFormGrid>
              <PropertySetupField id="fy-month" label="Fiscal year start month" icon="date">
                <Select
                  value={String(settings.fiscalYearStartMonth)}
                  onValueChange={(value) => patchSettings({ fiscalYearStartMonth: Number(value) })}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="fy-month" className={PROPERTY_SETUP_CONTROL_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((name, index) => (
                      <SelectItem key={name} value={String(index + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField id="fy-day" label="Fiscal year start day" icon="date">
                <Input
                  id="fy-day"
                  type="number"
                  min={1}
                  max={31}
                  className={PROPERTY_SETUP_CONTROL_CLASS}
                  value={settings.fiscalYearStartDay}
                  disabled={!canEdit}
                  onChange={(event) =>
                    patchSettings({ fiscalYearStartDay: Number(event.target.value) })
                  }
                />
              </PropertySetupField>
            </PropertySetupFormGrid>
          </Card3Section>

          <Card3Section icon="service" title="Settings">
            <PropertySetupFormGrid>
              <PropertySetupField
                label="Default FX source"
                icon="money"
                helper="Bank and System are labels only. Rates are entered manually."
              >
                <Select
                  value={settings.defaultFxSource}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    patchSettings({ defaultFxSource: value as CurrencyFxSource })
                  }
                >
                  <SelectTrigger className={PROPERTY_SETUP_CONTROL_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_FX_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {FX_LABELS[source]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
            </PropertySetupFormGrid>
            <div className="flex items-center justify-between rounded-[8px] border border-[#E6D7B8] px-3 py-2">
              <Label htmlFor="multi-currency">Allow multi-currency</Label>
              <Switch
                id="multi-currency"
                checked={settings.allowMultiCurrency}
                disabled={!canEdit}
                onCheckedChange={(allowMultiCurrency) => patchSettings({ allowMultiCurrency })}
              />
            </div>
          </Card3Section>

          <CurrencyDrawer
            key={
              currencyDraft === "new" ? "currency-new" : (currencyDraft?.id ?? "currency-closed")
            }
            open={currencyDraft !== null}
            canEdit={canEdit}
            baseCurrency={inherited.baseCurrency}
            value={currencyDraft === "new" || currencyDraft === null ? null : currencyDraft}
            pending={currencyMut.isPending}
            onClose={() => setCurrencyDraft(null)}
            onSave={(payload) => currencyMut.mutate({ restaurantId, ...payload })}
          />
          <RateDrawer
            key={rateDraft === "new" ? "rate-new" : (rateDraft?.id ?? "rate-closed")}
            open={rateDraft !== null}
            canEdit={canEdit}
            baseCurrency={inherited.baseCurrency}
            quotes={quoteOptions}
            value={rateDraft === "new" || rateDraft === null ? null : rateDraft}
            pending={rateMut.isPending}
            onClose={() => setRateDraft(null)}
            onSave={(payload) => rateMut.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function CurrencyDrawer({
  open,
  canEdit,
  baseCurrency,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  baseCurrency: string;
  value: PropertyCurrency | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    symbol: string;
    decimalPlaces: number;
    rounding: CurrencyRounding;
    active: boolean;
  }) => void;
}) {
  const isBase = (value?.code ?? "") === baseCurrency;
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [symbol, setSymbol] = useState(value?.symbol ?? "");
  const [decimalPlaces, setDecimalPlaces] = useState(value?.decimalPlaces ?? 2);
  const [rounding, setRounding] = useState<CurrencyRounding>(value?.rounding ?? "half_up");
  const [active, setActive] = useState(value?.active ?? true);

  function applyCatalog(next: string) {
    setCode(next);
    const meta = card3CurrencyCatalogMeta(next);
    if (meta) {
      setName(meta.name);
      setSymbol(meta.symbol);
      setDecimalPlaces(meta.decimalPlaces);
    }
  }

  return (
    <Card3OverlapSheet
      open={open}
      title={value ? "Edit currency" : "Add currency"}
      description={
        isBase
          ? "This is the Card 1 base currency. It cannot be changed here."
          : "Flag, name, symbol, and decimals come from the shared catalogue. Flags are presentation only."
      }
      onClose={onClose}
      canEdit={canEdit && !isBase}
      pending={pending}
      submitLabel="Save currency"
      onSubmit={() => {
        const meta = card3CurrencyCatalogMeta(code);
        onSave({
          id: value?.id,
          code,
          name: name || meta?.name || code,
          symbol: symbol || meta?.symbol || code,
          decimalPlaces,
          rounding,
          active: isBase ? true : active,
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="ccy-code">Code</Label>
        <Select
          value={COMMON_CURRENCIES.some((row) => row.code === code) ? code : ""}
          disabled={!canEdit || Boolean(value) || isBase}
          onValueChange={applyCatalog}
        >
          <SelectTrigger id="ccy-code" className={PROPERTY_SETUP_CONTROL_CLASS}>
            <SelectValue placeholder="Catalog" />
          </SelectTrigger>
          <SelectContent>
            {COMMON_CURRENCIES.map((row) => (
              <SelectItem key={row.code} value={row.code}>
                {card3CurrencyFlag(row.code)} {row.code} — {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={code}
          maxLength={3}
          className={PROPERTY_SETUP_CONTROL_CLASS}
          disabled={!canEdit || Boolean(value) || isBase}
          onChange={(event) => applyCatalog(event.target.value.toUpperCase())}
          aria-label="ISO currency code"
        />
      </div>
      <div className="space-y-1">
        <Label>Flag</Label>
        <p className="text-2xl">{card3CurrencyFlag(code)}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ccy-name">Name</Label>
        <Input
          id="ccy-name"
          className={PROPERTY_SETUP_CONTROL_CLASS}
          value={name}
          disabled
          readOnly
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ccy-symbol">Symbol</Label>
        <Input
          id="ccy-symbol"
          className={PROPERTY_SETUP_CONTROL_CLASS}
          value={symbol}
          disabled
          readOnly
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ccy-decimals">Decimal places</Label>
        <Input
          id="ccy-decimals"
          type="number"
          className={PROPERTY_SETUP_CONTROL_CLASS}
          value={decimalPlaces}
          disabled
          readOnly
        />
      </div>
      <div className="space-y-1">
        <Label>Rounding</Label>
        <Select
          value={rounding}
          disabled={!canEdit || isBase}
          onValueChange={(next) => setRounding(next as CurrencyRounding)}
        >
          <SelectTrigger className={PROPERTY_SETUP_CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_ROUNDING.map((row) => (
              <SelectItem key={row} value={row}>
                {ROUNDING_LABELS[row]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-[8px] border px-3 py-2">
        <Label htmlFor="ccy-active">Active</Label>
        <Switch
          id="ccy-active"
          checked={isBase ? true : active}
          disabled={!canEdit || isBase}
          onCheckedChange={setActive}
        />
      </div>
    </Card3OverlapSheet>
  );
}

function RateDrawer({
  open,
  canEdit,
  baseCurrency,
  quotes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  baseCurrency: string;
  quotes: PropertyCurrency[];
  value: ExchangeRateRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    quoteCurrencyCode: string;
    rate: number;
    effectiveDate: string;
    source: CurrencyFxSource;
  }) => void;
}) {
  const [quote, setQuote] = useState(value?.quoteCurrencyCode ?? quotes[0]?.code ?? "");
  const [rate, setRate] = useState(value?.rate ?? 1);
  const [effectiveDate, setEffectiveDate] = useState(
    value?.effectiveDate ?? new Date().toISOString().slice(0, 10),
  );
  const [source, setSource] = useState<CurrencyFxSource>(value?.source ?? "manual");

  return (
    <Card3OverlapSheet
      open={open}
      title={value ? "Edit exchange rate" : "Add exchange rate"}
      description={formatFxDirection(baseCurrency || "BASE", quote || "QUOTE", rate)}
      onClose={onClose}
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save Rate"
      onSubmit={() => {
        onSave({ id: value?.id, quoteCurrencyCode: quote, rate, effectiveDate, source });
      }}
    >
      <div className="space-y-1">
        <Label>Base Currency</Label>
        <Input className={PROPERTY_SETUP_CONTROL_CLASS} value={baseCurrency} disabled readOnly />
      </div>
      <div className="space-y-1">
        <Label>Currency</Label>
        <Select value={quote} disabled={!canEdit || Boolean(value)} onValueChange={setQuote}>
          <SelectTrigger className={PROPERTY_SETUP_CONTROL_CLASS}>
            <SelectValue placeholder="Select a non-base currency" />
          </SelectTrigger>
          <SelectContent>
            {quotes.map((row) => (
              <SelectItem key={row.code} value={row.code}>
                {row.code} — {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="fx-rate">Exchange Rate</Label>
        <Input
          id="fx-rate"
          type="number"
          min="0"
          step="any"
          className={PROPERTY_SETUP_CONTROL_CLASS}
          value={rate}
          disabled={!canEdit}
          onChange={(event) => setRate(Number(event.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="fx-date">Effective Date</Label>
        <Input
          id="fx-date"
          type="date"
          className={PROPERTY_SETUP_CONTROL_CLASS}
          value={effectiveDate}
          disabled={!canEdit}
          onChange={(event) => setEffectiveDate(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Source</Label>
        <Select
          value={source}
          disabled={!canEdit}
          onValueChange={(next) => setSource(next as CurrencyFxSource)}
        >
          <SelectTrigger className={PROPERTY_SETUP_CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_FX_SOURCES.map((row) => (
              <SelectItem key={row} value={row}>
                {FX_LABELS[row]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card3OverlapSheet>
  );
}
