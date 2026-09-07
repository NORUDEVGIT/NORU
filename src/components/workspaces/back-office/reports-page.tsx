/**
 * Phase 8G2A — Back Office Reports & Intelligence landing page.
 *
 * Back Office is the canonical home for CROSS-PACKAGE, property-wide reporting.
 * Restaurant Management keeps restaurant operational reporting and PMS keeps
 * hotel operational reporting; neither is copied, forked or changed here.
 *
 * Rules this file obeys:
 *  - Read-only. No mutation, no new table, no new report engine.
 *  - Every figure comes from an EXISTING package-owned server query.
 *  - A source is only queried when its package is enabled for the property AND
 *    the person already holds the existing module access. Back Office being on
 *    never grants a source it doesn't already have.
 *  - Nothing is invented, estimated or averaged. A category with no real data
 *    renders a clean foundation state instead of a number.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  Hotel,
  LineChart,
  UtensilsCrossed,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getMyModuleAccess } from "@/core/lib/module-access.functions";
import { getBackOfficePosSummary } from "@/lib/back-office-pos.functions";
import { getRestaurantDashboard } from "@/packages/restaurant-management/lib/dashboard.functions";
import { getFrontOfficeDashboard } from "@/lib/frontoffice.functions";
import { usePackageEntitlements } from "@/core/lib/use-package-entitlements";
import { useMoney, useRestaurantTimezone } from "@/core/state/restaurant-context";
import { localDateInZone } from "@/core/lib/restaurant-time";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { cn } from "@/shared/lib/utils";
import { useMemo } from "react";

/* ------------------------------------------------------------------ config */

type SourceState = "available" | "unavailable" | "planned";

const CATEGORIES: {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sources: string;
  state: string;
}[] = [
  {
    key: "revenue",
    title: "Revenue & Sales",
    description:
      "Trading performance side by side: restaurant sales, room revenue and standalone till sales.",
    icon: LineChart,
    sources: "Restaurant Management · PMS · Standalone POS",
    state:
      "Standalone POS reports here as a live source. A single combined sales total is still not shown — these are different source systems.",

  },
  {
    key: "operations",
    title: "Operations",
    description:
      "Service, kitchen, front office and housekeeping activity compared across the property.",
    icon: Building2,
    sources: "Restaurant Management · PMS",
    state: "Consolidated view planned. Operational detail stays in each package.",
  },
  {
    key: "workforce",
    title: "Workforce",
    description: "Scheduled against worked hours and attendance for the whole property.",
    icon: Users,
    sources: "Shared workforce service",
    state: "Consolidated view planned. Workforce reporting stays on the current staff screen.",
  },
  {
    key: "supply",
    title: "Inventory & Procurement",
    description: "Stock value, movement, waste and purchasing totals for the whole property.",
    icon: Boxes,
    sources: "Shared inventory and procurement services",
    state: "Consolidated view planned. Stock and purchasing reporting stays where it is today.",
  },
  {
    key: "finance",
    title: "Finance",
    description:
      "Money summarised across packages: payments, refunds and revenue by source. This is financial intelligence, not accounting.",
    icon: Wallet,
    sources: "Restaurant Management · PMS · Procurement",
    state:
      "Consolidated view planned. There is no ledger, journal, trial balance, AP or AR in NORU.",
  },
  {
    key: "cross",
    title: "Cross-Package Performance",
    description:
      "Comparisons and trends no single package can produce alone — how the packages perform against each other.",
    icon: BarChart3,
    sources: "Every enabled package",
    state: "Planned. Needs a consolidated read model before any figure can be trusted.",
  },
];

/* -------------------------------------------------------------------- page */

export function BackOfficeReportsPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const timezone = useRestaurantTimezone();
  const today = useMemo(() => localDateInZone(timezone), [timezone]);
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const packages = usePackageEntitlements(restaurantId);

  const fetchModules = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
    retry: false,
  });
  const allowed = access.data?.modules ?? [];

  // A source is usable only when the package is on AND the existing module
  // access already permits it. Both conditions gate the query itself.
  const rmOn = packages.has("restaurant_management");
  const pmsOn = packages.has("pms");
  const rmFigures = rmOn && allowed.includes("food_and_beverage");
  const pmsFigures = pmsOn && allowed.includes("front_office");
  const canSeeReports = allowed.includes("reports_analytics");
  // Phase 8H8 — Standalone POS is a real source here. It is queried only when
  // the POS package is on and the reader already holds Reports & Analytics.
  const posOn = packages.has("pos");
  const posFigures = posOn && canSeeReports;

  const fetchRestaurant = useServerFn(getRestaurantDashboard);
  const restaurant = useQuery({
    queryKey: ["bo-reports-restaurant", restaurantId],
    queryFn: () => fetchRestaurant({ data: { restaurantId, tzOffsetMinutes } }),
    enabled: rmFigures,
    retry: false,
  });

  const fetchFrontOffice = useServerFn(getFrontOfficeDashboard);
  const frontOffice = useQuery({
    queryKey: ["bo-reports-front-office", restaurantId, today],
    queryFn: () => fetchFrontOffice({ data: { restaurantId, today } }),
    enabled: pmsFigures,
    retry: false,
  });

  const fetchPos = useServerFn(getBackOfficePosSummary);
  const pos = useQuery({
    queryKey: ["bo-reports-pos", restaurantId, today],
    queryFn: () => fetchPos({ data: { restaurantId, surface: "reports" as const } }),
    enabled: posFigures,
    retry: false,
  });
  const posData = pos.data?.state === "available" ? pos.data : null;


  const occupancy = frontOffice.data
    ? (() => {
        const total = frontOffice.data.occupiedRooms + frontOffice.data.availableRooms;
        return total > 0
          ? `${Math.round((frontOffice.data.occupiedRooms / total) * 100)}%`
          : "0%";
      })()
    : null;

  const noSources =
    !rmFigures && !pmsFigures && !posFigures && !packages.loading && !access.isLoading;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="size-5" />
          </span>
          <h1 className="font-display text-2xl sm:text-3xl">Reports &amp; Intelligence</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          This is the property-wide reporting home for {membership.restaurant.name} — consolidated
          and cross-package views. Operational reports stay in the package that owns them:
          restaurant reporting in Restaurant Management, hotel reporting in PMS.
        </p>
      </header>

      {/* ----------------------------------------------- executive overview */}
      <section aria-label="Executive overview" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl">Executive Overview</h2>
          <p className="text-xs text-muted-foreground">
            Live figures, each labelled with the package it comes from. Only sources available to
            you are shown.
          </p>
        </div>

        {noSources ? (
          <FoundationBox
            title="No reporting sources available here"
            body="No source package that you have access to is enabled for this property, so there is nothing to consolidate. Nothing is estimated in its place."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {rmFigures ? (
              <>
                <Figure
                  icon={UtensilsCrossed}
                  source="Restaurant Management"
                  label="Today's order value"
                  value={restaurant.data ? money(restaurant.data.today.revenue) : null}
                  loading={restaurant.isLoading}
                />
                <Figure
                  icon={CreditCard}
                  source="Restaurant Management"
                  label="Active orders"
                  value={restaurant.data ? String(restaurant.data.counts.active) : null}
                  loading={restaurant.isLoading}
                />
              </>
            ) : null}
            {pmsFigures ? (
              <>
                <Figure
                  icon={Hotel}
                  source="PMS"
                  label="Occupancy"
                  value={occupancy}
                  loading={frontOffice.isLoading}
                />
                <Figure
                  icon={Hotel}
                  source="PMS"
                  label="In-house guests"
                  value={frontOffice.data ? String(frontOffice.data.inHouse) : null}
                  loading={frontOffice.isLoading}
                />
              </>
            ) : null}
            {posFigures ? (
              <>
                <Figure
                  icon={CreditCard}
                  source="Standalone POS"
                  label="Till gross today"
                  value={posData ? money(posData.gross) : null}
                  loading={pos.isLoading}
                />
                <Figure
                  icon={CreditCard}
                  source="Standalone POS"
                  label="Till net today"
                  value={posData ? money(posData.net) : null}
                  loading={pos.isLoading}
                />
                <Figure
                  icon={CreditCard}
                  source="Standalone POS"
                  label="Till receipts today"
                  value={posData ? String(posData.sales) : null}
                  loading={pos.isLoading}
                />
                <Figure
                  icon={CreditCard}
                  source="Standalone POS"
                  label="Till refunds today"
                  value={posData ? money(posData.refunds) : null}
                  loading={pos.isLoading}
                />
              </>
            ) : null}
          </div>
        )}

        {noSources ? null : (
          <p className="text-xs text-muted-foreground">
            Each figure belongs to the source system that recorded it. Restaurant Management order
            value, PMS activity and Standalone POS till sales are different source systems and are
            never added together.
          </p>
        )}

      </section>

      {/* ------------------------------------------------- source packages */}
      <section aria-label="Reporting sources" className="space-y-3">
        <h2 className="font-display text-xl">Reporting sources</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SourceCard
            icon={UtensilsCrossed}
            title="Restaurant Management"
            body="Restaurant sales, orders, menu and service performance."
            state={rmOn ? "available" : "unavailable"}
            link={
              rmOn && canSeeReports
                ? { to: "/restaurant/restaurant-management/reports", label: "Open Restaurant Reports" }
                : null
            }
          />
          <SourceCard
            icon={Hotel}
            title="PMS"
            body="Rooms, reservations, folios and night audit reporting."
            state={pmsOn ? "available" : "unavailable"}
            link={
              pmsOn && canSeeReports
                ? { to: "/restaurant/pms/reports", label: "Open PMS Reports" }
                : null
            }
          />
          <SourceCard
            icon={CreditCard}
            title="Standalone POS"
            body="Independent checkout sales, tenders, refunds and cashier shifts. Standalone POS owns these records; Back Office only reads them."
            state={posOn ? "available" : "unavailable"}
            link={
              posOn && posData?.operationalAccess
                ? { to: "/restaurant/pos/reports", label: "Open Standalone POS Reports" }
                : null
            }
          />

          <SourceCard
            icon={Boxes}
            title="Shared services"
            body="Inventory, procurement and the property workforce."
            state="available"
            link={
              canSeeReports ? { to: "/restaurant/reports", label: "Open shared Reports" } : null
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          A source link appears only when that package is enabled for this property and your
          existing access already allows it. Back Office grants nothing extra.
        </p>
      </section>

      {/* ------------------------------------------------------- categories */}
      <section aria-label="Report categories" className="space-y-3">
        <h2 className="font-display text-xl">Report categories</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <c.icon className="size-4" />
                </span>
                <p className="font-display text-lg">{c.title}</p>
                <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Foundation
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">{c.state}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sources: {c.sources}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- bits */

function Figure({
  icon: Icon,
  source,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  source: string;
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className={cn("mt-2 font-display text-2xl", loading && "animate-pulse text-muted-foreground")}>
        {loading ? "—" : (value ?? "—")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">From {source}</p>
    </div>
  );
}

function SourceCard({
  icon: Icon,
  title,
  body,
  state,
  link,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  state: SourceState;
  link: { to: string; label: string } | null;
}) {
  const stateLabel =
    state === "available"
      ? "Available"
      : state === "planned"
        ? "Planned"
        : "Not enabled for this property";
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="font-display text-lg">{title}</p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{stateLabel}</p>
      {link ? (
        <Link
          to={link.to}
          className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {link.label}
          <ArrowUpRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

function FoundationBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
