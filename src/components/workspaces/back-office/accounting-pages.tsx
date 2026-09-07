/**
 * Phase 8G2E — Back Office · Accounting & Finance.
 *
 * Back Office is the canonical home for FINANCE ADMINISTRATION: watching the
 * property's financial sources and holding the future accounting engine. It is
 * NOT where money is posted. PMS keeps folios, hotel payments, deposits,
 * refunds, cashier shifts and night audit. Restaurant Management keeps
 * restaurant orders, payments, till shifts and the Charge to Room bridge.
 * Procurement keeps purchase orders and receiving. Inventory keeps stock and
 * cost inputs.
 *
 * This screen is read-only. Every figure is labelled with the source that owns
 * it, and figures from different sources are never added together: there is no
 * general ledger in NORU, so there is no consolidated total to show.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, BarChart3, Boxes, Building2, Calculator, Truck, UtensilsCrossed } from "lucide-react";

import { getMyModuleAccess } from "@/lib/module-access.functions";
import { usePackageEntitlements } from "@/lib/use-package-entitlements";
import {
  getBackOfficeFinanceOverview,
  type FinanceSource,
  type SourceMetric,
} from "@/lib/back-office-finance.functions";
import { formatMoney } from "@/lib/restaurant-time";
import { propertyToday } from "@/lib/reservation-dates";

/* ---------------------------------------------------------------- header */

export function AccountingHeader({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Back Office · Accounting &amp; Finance
      </p>
      <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{blurb}</p>
    </header>
  );
}

/**
 * The Back Office package on its own grants nothing here: the person still
 * needs the existing Accounting & Finance module access for this property, and
 * the server function re-checks it independently.
 */
function AccountingGate({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: ReactNode;
}) {
  const fetchModuleAccess = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModuleAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (access.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!access.data?.modules.includes("accounting_finance")) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You don&apos;t have Accounting &amp; Finance access for this property. Ask an owner or
        manager to give you access.
      </div>
    );
  }
  return <>{children}</>;
}

/* ----------------------------------------------------------- source cards */

const SOURCE_ICON: Record<FinanceSource["key"], typeof Calculator> = {
  restaurant_management: UtensilsCrossed,
  pms: Building2,
  procurement: Truck,
  inventory: Boxes,
  pos: Calculator,
};

const STATE_LABEL: Record<FinanceSource["state"], string> = {
  available: "Live source",
  unavailable: "Not enabled for this property",
  no_access: "You don't have access to this source",
  planned: "Planned",
};

function Metric({ metric, currency }: { metric: SourceMetric; currency: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className="mt-1 font-display text-xl">
        {metric.kind === "money" ? formatMoney(metric.value, currency) : metric.value}
      </p>
      {metric.note ? <p className="mt-1 text-[11px] text-muted-foreground">{metric.note}</p> : null}
    </div>
  );
}

/** Deep links into a source package. Shown only when the reader may already open it. */
function SourceLink({
  source,
  modules,
  packages,
}: {
  source: FinanceSource;
  modules: string[];
  packages: { has: (k: "restaurant_management" | "pms" | "pos" | "back_office") => boolean };
}) {
  if (source.state !== "available") return null;

  const cls =
    "mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline";

  if (source.key === "restaurant_management" && packages.has("restaurant_management")) {
    return (
      <Link to="/restaurant/restaurant-management/dashboard" className={cls}>
        Open Restaurant Management <ArrowUpRight className="size-4" />
      </Link>
    );
  }
  if (source.key === "pms" && packages.has("pms") && modules.includes("accounting_finance")) {
    return (
      <Link to="/restaurant/cashiering" search={{ tab: "dashboard" }} className={cls}>
        Open PMS Cashiering <ArrowUpRight className="size-4" />
      </Link>
    );
  }
  if (source.key === "procurement" && modules.includes("procurement")) {
    return (
      <Link to="/restaurant/back-office/procurement" className={cls}>
        Open Procurement <ArrowUpRight className="size-4" />
      </Link>
    );
  }
  if (source.key === "inventory" && modules.includes("inventory")) {
    return (
      <Link to="/restaurant/back-office/inventory" className={cls}>
        Open Inventory / Warehouse <ArrowUpRight className="size-4" />
      </Link>
    );
  }
  return null;
}

function SourceCard({
  source,
  currency,
  modules,
  packages,
}: {
  source: FinanceSource;
  currency: string;
  modules: string[];
  packages: { has: (k: "restaurant_management" | "pms" | "pos" | "back_office") => boolean };
}) {
  const Icon = SOURCE_ICON[source.key];
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="font-display text-lg">{source.name}</h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {STATE_LABEL[source.state]}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{source.role}</p>
      {source.metrics.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {source.metrics.map((m) => (
            <Metric key={m.label} metric={m} currency={currency} />
          ))}
        </div>
      ) : null}
      <SourceLink source={source} modules={modules} packages={packages} />
    </article>
  );
}

/* --------------------------------------------------------- future domains */

const FUTURE: { title: string; body: string }[] = [
  {
    title: "General Ledger",
    body: "No ledger exists in NORU. A chart of accounts and a posting engine must come first, together with a mapping from each source event to an accounting entry.",
  },
  {
    title: "Chart of Accounts",
    body: "Not built. Menu categories, payment methods and inventory categories are operational lists, not accounting accounts.",
  },
  {
    title: "Journals",
    body: "Not built. Operational events are not turned into journal postings in this phase.",
  },
  {
    title: "Accounts Payable",
    body: "Not built. Purchase orders are commitments; there is no supplier invoice, due date, payable balance or payment allocation.",
  },
  {
    title: "Accounts Receivable",
    body: "Not built. Open folio balances and orders are guest billing, not a debtor ledger.",
  },
  {
    title: "Bank Reconciliation",
    body: "Not built. There is no bank feed or statement import, and a card payment status is not a bank settlement.",
  },
  {
    title: "Tax Accounting",
    body: "Not built. Tax that restaurant and hotel screens calculate stays operational source logic.",
  },
  {
    title: "Financial Statements",
    body: "Not built. Profit and loss, balance sheet, cash flow and trial balance all depend on the ledger above.",
  },
];

/* ------------------------------------------------------------------- home */

export function BackOfficeAccountingHome({
  restaurantId,
  timezone,
}: {
  restaurantId: string;
  timezone: string | null | undefined;
}) {
  return (
    <div className="space-y-6">
      <AccountingHeader
        title="Accounting &amp; Finance"
        blurb="Property-level financial control: what each package is producing financially, where the money is actually recorded, and what the accounting engine still needs. Nothing is posted here."
      />
      <AccountingGate restaurantId={restaurantId}>
        <AccountingBody restaurantId={restaurantId} timezone={timezone} />
      </AccountingGate>
    </div>
  );
}

function AccountingBody({
  restaurantId,
  timezone,
}: {
  restaurantId: string;
  timezone: string | null | undefined;
}) {
  const today = propertyToday(timezone ?? "Europe/London");
  const packages = usePackageEntitlements(restaurantId);
  const fetchOverview = useServerFn(getBackOfficeFinanceOverview);
  const fetchModuleAccess = useServerFn(getMyModuleAccess);

  const overview = useQuery({
    queryKey: ["bo-finance-overview", restaurantId, today],
    queryFn: () => fetchOverview({ data: { restaurantId, today } }),
    retry: false,
  });
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModuleAccess({ data: { restaurantId } }),
    retry: false,
  });
  const modules = access.data?.modules ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg">Finance overview</h2>
          <p className="text-sm text-muted-foreground">
            Each figure comes from the package that owns it and keeps that package&apos;s meaning.
            They are deliberately not added together — no general ledger exists, so there is no
            consolidated revenue, profit or net position to report.
          </p>
        </div>

        {overview.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading finance sources…</p>
        ) : overview.error ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {(overview.error as Error).message}
          </div>
        ) : (
          <div className="space-y-4">
            {overview.data?.sources.map((s) => (
              <SourceCard
                key={s.key}
                source={s}
                currency={overview.data!.currency}
                modules={modules}
                packages={packages}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 sm:p-6">
        <h2 className="font-display text-lg">Accounting foundations — not built yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the pieces of a real accounting system. None of them exists in NORU today, and
          nothing on this page should be read as ledger truth.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FUTURE.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-background p-4">
              <p className="font-medium">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg">Accounting is not reporting</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Management analytics and operational comparison live in Back Office Reports &amp;
          Intelligence. This page is financial control: which sources produce money, where it is
          recorded, and what accounting still needs.
        </p>
        {modules.includes("reports_analytics") ? (
          <Link
            to="/restaurant/back-office/reports"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <BarChart3 className="size-4" /> Open Reports &amp; Intelligence
          </Link>
        ) : null}
      </section>
    </div>
  );
}
