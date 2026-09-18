import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { COMMON_CURRENCIES } from "@/shared/lib/property-time";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { CARD1_HREF, propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
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
  type Card3CurrencyTabId,
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

function inheritedCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <div className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-[#251605]">{value || "—"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Inherited from Card 1. Read-only here.</p>
      <a
        href={href}
        className="mt-2 inline-flex text-sm font-medium text-[#C89933] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]"
      >
        Open Property & Business
      </a>
    </div>
  );
}

export function PmsPropertySetupCard3Currency({
  restaurantId,
  canEdit,
  domain,
  onBack,
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
  const [tab, setTab] = useState<Card3CurrencyTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [currencyDraft, setCurrencyDraft] = useState<PropertyCurrency | "new" | null>(null);
  const [rateDraft, setRateDraft] = useState<ExchangeRateRow | "new" | null>(null);

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
    const q = search.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter(
      (row) =>
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.symbol.toLowerCase().includes(q),
    );
  }, [currencies, search]);

  const quoteOptions = currencies.filter((row) => !row.isBase && row.active);

  const currencyMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCurrency>[0]["data"]) => saveCurrency({ data: input }),
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
    mutationFn: (input: Parameters<typeof saveSettings>[0]["data"]) => saveSettings({ data: input }),
    onSuccess: () => {
      toast.success("Financial settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["pms-card3-currency", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3CurrencyTabId)}>
    <PmsPropertySetupCard3Workspace
      domain={domain}
      onBack={onBack}
      onAuditHistory={() => setShowAudit((open) => !open)}
      tabs={
        <TabsList className="mb-1 flex h-auto flex-wrap">
          {CARD3_CURRENCY_TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} data-testid={`card3-currency-tab-${item.id}`}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      }
      search={
        tab === "currencies" ? (
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search currencies"
            aria-label="Search currencies"
            className="max-w-sm"
          />
        ) : null
      }
      drawer={
        showAudit ? (
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(query.data?.audit ?? []).length === 0 ? (
                <li className="text-muted-foreground">No currency changes recorded yet.</li>
              ) : (
                (query.data?.audit ?? []).map((row) => (
                  <li key={row.id}>
                    <p className="font-medium text-[#251605]">{row.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.detail ? `${row.detail} · ` : ""}
                      {row.createdAt}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading currency settings…</p>
      ) : query.isError || !snapshot || !inherited ? (
        <p className="text-sm text-destructive">{(query.error as Error | undefined)?.message ?? "Currency settings are unavailable."}</p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-currency">
          {tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {inheritedCard({ label: "Base currency (Card 1)", value: inherited.baseCurrency, href: CARD1_HREF })}
                {inheritedCard({ label: "Timezone (Card 1)", value: inherited.timezone, href: CARD1_HREF })}
                {inheritedCard({ label: "Business date (Card 1)", value: inherited.businessDate, href: CARD1_HREF })}
              </div>
              <p className="text-sm text-muted-foreground">
                Rate direction: {FX_DIRECTION_COPY} — stored as quote units per 1 base unit.
              </p>
              <p className="text-sm font-medium text-[#251605]">
                Domain status: {propertySetupStatusLabel(query.data?.readiness.status ?? "not_started")}
              </p>
              <p className="text-sm text-muted-foreground">
                {currencies.length} currencies · {rates.length} exchange rates
              </p>
              {(query.data?.readiness.blockers ?? []).length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {query.data?.readiness.blockers.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {tab === "currencies" ? (
            <div className="space-y-3">
              {canEdit ? (
                <Button type="button" onClick={() => setCurrencyDraft("new")} className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
                  Add currency
                </Button>
              ) : null}
              <div className="overflow-x-auto rounded-2xl border border-border bg-white">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2">Decimals</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCurrencies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-muted-foreground">
                          No currencies saved yet. The Card 1 base ({inherited.baseCurrency}) still applies.
                        </td>
                      </tr>
                    ) : (
                      filteredCurrencies.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2 font-medium">
                            {row.code}
                            {row.isBase ? (
                              <span className="ml-2 rounded-full border border-[#CCCCCC] px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                                Base
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2">{row.symbol}</td>
                          <td className="px-3 py-2">{row.decimalPlaces}</td>
                          <td className="px-3 py-2">{row.active ? "Active" : "Inactive"}</td>
                          <td className="px-3 py-2">
                            {canEdit ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => setCurrencyDraft(row)}>
                                Edit
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "exchange-rates" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{FX_DIRECTION_COPY}</p>
              {canEdit ? (
                <Button type="button" onClick={() => setRateDraft("new")} className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
                  Add exchange rate
                </Button>
              ) : null}
              <div className="overflow-x-auto rounded-2xl border border-border bg-white">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Direction</th>
                      <th className="px-3 py-2">Effective</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rates.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-muted-foreground">
                          No exchange rates yet.
                        </td>
                      </tr>
                    ) : (
                      rates.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2 font-medium">{row.directionLabel}</td>
                          <td className="px-3 py-2">{row.effectiveDate}</td>
                          <td className="px-3 py-2">{FX_LABELS[row.source]}</td>
                          <td className="px-3 py-2">
                            {canEdit ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => setRateDraft(row)}>
                                Edit
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "financial-calendar" ? (
            <form
              className="max-w-xl space-y-4 rounded-2xl border border-border bg-white p-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canEdit) return;
                settingsMut.mutate({
                  restaurantId,
                  fiscalYearStartMonth: settings.fiscalYearStartMonth,
                  fiscalYearStartDay: settings.fiscalYearStartDay,
                  defaultFxSource: settings.defaultFxSource,
                  allowMultiCurrency: settings.allowMultiCurrency,
                });
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {inheritedCard({ label: "Business date (Card 1)", value: inherited.businessDate, href: CARD1_HREF })}
                {inheritedCard({ label: "Timezone (Card 1)", value: inherited.timezone, href: CARD1_HREF })}
              </div>
              <div className="space-y-1">
                <Label htmlFor="fy-month">Fiscal year start month</Label>
                <Select
                  value={String(settings.fiscalYearStartMonth)}
                  onValueChange={(value) => {
                    void queryClient.setQueryData(["pms-card3-currency", restaurantId], (current: typeof query.data) =>
                      current
                        ? {
                            ...current,
                            snapshot: {
                              ...current.snapshot,
                              settings: { ...current.snapshot.settings, fiscalYearStartMonth: Number(value) },
                            },
                          }
                        : current,
                    );
                  }}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="fy-month">
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
              </div>
              <div className="space-y-1">
                <Label htmlFor="fy-day">Fiscal year start day</Label>
                <Input
                  id="fy-day"
                  type="number"
                  min={1}
                  max={31}
                  value={settings.fiscalYearStartDay}
                  disabled={!canEdit}
                  onChange={(event) => {
                    const fiscalYearStartDay = Number(event.target.value);
                    void queryClient.setQueryData(["pms-card3-currency", restaurantId], (current: typeof query.data) =>
                      current
                        ? {
                            ...current,
                            snapshot: {
                              ...current.snapshot,
                              settings: { ...current.snapshot.settings, fiscalYearStartDay },
                            },
                          }
                        : current,
                    );
                  }}
                />
              </div>
              {canEdit ? (
                <Button type="submit" disabled={settingsMut.isPending} className="bg-[#C89933] text-[#251605]">
                  Save calendar
                </Button>
              ) : null}
            </form>
          ) : null}

          {tab === "settings" ? (
            <form
              className="max-w-xl space-y-4 rounded-2xl border border-border bg-white p-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canEdit) return;
                settingsMut.mutate({
                  restaurantId,
                  fiscalYearStartMonth: settings.fiscalYearStartMonth,
                  fiscalYearStartDay: settings.fiscalYearStartDay,
                  defaultFxSource: settings.defaultFxSource,
                  allowMultiCurrency: settings.allowMultiCurrency,
                });
              }}
            >
              <div className="space-y-1">
                <Label>Default FX source</Label>
                <Select
                  value={settings.defaultFxSource}
                  disabled={!canEdit}
                  onValueChange={(value) => {
                    void queryClient.setQueryData(["pms-card3-currency", restaurantId], (current: typeof query.data) =>
                      current
                        ? {
                            ...current,
                            snapshot: {
                              ...current.snapshot,
                              settings: { ...current.snapshot.settings, defaultFxSource: value as CurrencyFxSource },
                            },
                          }
                        : current,
                    );
                  }}
                >
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">Bank and System are labels only. Rates are entered manually.</p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[#E6D7B8] px-3 py-2">
                <Label htmlFor="multi-currency">Allow multi-currency</Label>
                <Switch
                  id="multi-currency"
                  checked={settings.allowMultiCurrency}
                  disabled={!canEdit}
                  onCheckedChange={(allowMultiCurrency) => {
                    void queryClient.setQueryData(["pms-card3-currency", restaurantId], (current: typeof query.data) =>
                      current
                        ? {
                            ...current,
                            snapshot: {
                              ...current.snapshot,
                              settings: { ...current.snapshot.settings, allowMultiCurrency },
                            },
                          }
                        : current,
                    );
                  }}
                />
              </div>
              {canEdit ? (
                <Button type="submit" disabled={settingsMut.isPending} className="bg-[#C89933] text-[#251605]">
                  Save settings
                </Button>
              ) : null}
            </form>
          ) : null}

          <CurrencyDrawer
            key={currencyDraft === "new" ? "currency-new" : currencyDraft?.id ?? "currency-closed"}
            open={currencyDraft !== null}
            canEdit={canEdit}
            baseCurrency={inherited.baseCurrency}
            value={currencyDraft === "new" || currencyDraft === null ? null : currencyDraft}
            pending={currencyMut.isPending}
            onClose={() => setCurrencyDraft(null)}
            onSave={(payload) => currencyMut.mutate({ restaurantId, ...payload })}
          />
          <RateDrawer
            key={rateDraft === "new" ? "rate-new" : rateDraft?.id ?? "rate-closed"}
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
    </Tabs>
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

  const catalog = COMMON_CURRENCIES.find((row) => row.code === code);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit currency" : "Add currency"}</SheetTitle>
          <SheetDescription>
            {isBase ? "This is the Card 1 base currency. Code stays read-only." : "Choose from the catalog or enter an ISO code. Nothing is saved until you confirm."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({
              id: value?.id,
              code,
              name: name || catalog?.label || code,
              symbol,
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
              disabled={!canEdit || Boolean(value)}
              onValueChange={(next) => {
                setCode(next);
                const match = COMMON_CURRENCIES.find((row) => row.code === next);
                if (match && !name) setName(match.label);
              }}
            >
              <SelectTrigger id="ccy-code">
                <SelectValue placeholder="Catalog" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.code} — {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={code}
              maxLength={3}
              disabled={!canEdit || Boolean(value) || isBase}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              aria-label="ISO currency code"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ccy-name">Name</Label>
            <Input id="ccy-name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ccy-symbol">Symbol</Label>
            <Input id="ccy-symbol" value={symbol} disabled={!canEdit} onChange={(event) => setSymbol(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ccy-decimals">Decimal places</Label>
            <Input
              id="ccy-decimals"
              type="number"
              min={0}
              max={4}
              value={decimalPlaces}
              disabled={!canEdit}
              onChange={(event) => setDecimalPlaces(Number(event.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Rounding</Label>
            <Select value={rounding} disabled={!canEdit} onValueChange={(next) => setRounding(next as CurrencyRounding)}>
              <SelectTrigger>
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
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="ccy-active">Active</Label>
            <Switch id="ccy-active" checked={isBase ? true : active} disabled={!canEdit || isBase} onCheckedChange={setActive} />
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save currency
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
  onSave: (payload: { id?: string; quoteCurrencyCode: string; rate: number; effectiveDate: string; source: CurrencyFxSource }) => void;
}) {
  const [quote, setQuote] = useState(value?.quoteCurrencyCode ?? quotes[0]?.code ?? "");
  const [rate, setRate] = useState(value?.rate ?? 1);
  const [effectiveDate, setEffectiveDate] = useState(value?.effectiveDate ?? new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<CurrencyFxSource>(value?.source ?? "manual");

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit exchange rate" : "Add exchange rate"}</SheetTitle>
          <SheetDescription>{formatFxDirection(baseCurrency || "BASE", quote || "QUOTE", rate)}</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, quoteCurrencyCode: quote, rate, effectiveDate, source });
          }}
        >
          <div className="space-y-1">
            <Label>Quote currency</Label>
            <Select value={quote} disabled={!canEdit || Boolean(value)} onValueChange={setQuote}>
              <SelectTrigger>
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
            <Label htmlFor="fx-rate">Rate (quote per 1 {baseCurrency})</Label>
            <Input
              id="fx-rate"
              type="number"
              min="0"
              step="any"
              value={rate}
              disabled={!canEdit}
              onChange={(event) => setRate(Number(event.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fx-date">Effective date</Label>
            <Input
              id="fx-date"
              type="date"
              value={effectiveDate}
              disabled={!canEdit}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Source</Label>
            <Select value={source} disabled={!canEdit} onValueChange={(next) => setSource(next as CurrencyFxSource)}>
              <SelectTrigger>
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
          {canEdit ? (
            <Button type="submit" disabled={pending || !quote} className="w-full bg-[#C89933] text-[#251605]">
              Save rate
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
