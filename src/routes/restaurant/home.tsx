import { useMemo } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UtensilsCrossed,
  Boxes,
  Users,
  Settings,
  Wallet,
  BarChart3,
  Hotel,
  Truck,
  SlidersHorizontal,
  TrendingUp,
  ReceiptText,
  PackageOpen,
  UserCheck,
  BedDouble,
  Briefcase,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { NoruLogo } from "@/components/noru-logo";
import { supabase } from "@/integrations/supabase/client";
import { getRestaurantDashboard } from "@/lib/dashboard.functions";
import { getInventoryDashboard } from "@/lib/inventory-reporting.functions";
import { listShifts } from "@/lib/workforce.functions";
import { getFrontOfficeDashboard } from "@/lib/frontoffice.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useMoney, useRestaurantTimezone } from "@/state/restaurant-context";
import { localDateInZone } from "@/lib/restaurant-time";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import type { ModuleKey } from "@/lib/module-access";
import { usePackageEntitlements } from "@/lib/use-package-entitlements";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/restaurant/home")({
  ssr: false,
  // Phase 8D1 — a guarded route sends the user back here with the package it
  // blocked. Property Home is Core and is never package-gated, so no loop.
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["blocked"] === "string" ? { blocked: search["blocked"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/home" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Property Home — NORU" },
      {
        name: "description",
        content:
          "Your NORU property home: the packages this property uses, with today's key numbers at a glance.",
      },
      { property: "og:title", content: "Property Home — NORU" },
      { property: "og:description", content: "One home for every NORU hospitality package." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertyHomeRoute,
});

function PropertyHomeRoute() {
  return <RestaurantShell active="Home">{(m) => <PropertyHome membership={m} />}</RestaurantShell>;
}

/** Module keys that make the PMS package meaningful for this user. */
const PMS_MODULE_KEYS: ModuleKey[] = [
  "pms",
  "front_office",
  "housekeeping",
  "reports_analytics",
  "configuration",
];

/** Shared services that Back Office will own; they stay where they are today. */
const BACK_OFFICE_LINKS: {
  moduleKey: ModuleKey;
  title: string;
  note: string;
  to: string;
  tab?: string;
  icon: LucideIcon;
}[] = [
  {
    moduleKey: "inventory",
    title: "Inventory / Warehouse",
    note: "Property-wide stock, assets and equipment.",
    to: "/restaurant/inventory",
    tab: "overview",
    icon: Boxes,
  },
  {
    moduleKey: "procurement",
    title: "Procurement",
    note: "Suppliers, purchase orders and goods receiving.",
    to: "/restaurant/inventory",
    tab: "suppliers",
    icon: Truck,
  },
  {
    moduleKey: "human_resources",
    title: "Human Resources",
    note: "One property-wide workforce: staff, schedule and attendance.",
    to: "/restaurant/staff",
    tab: "schedule",
    icon: Users,
  },
  {
    moduleKey: "accounting_finance",
    title: "Accounting & Finance",
    note: "Property-wide folios, payments and night audit.",
    to: "/restaurant/cashiering",
    tab: "dashboard",
    icon: Wallet,
  },
  {
    moduleKey: "reports_analytics",
    title: "Reports & Analytics",
    note: "Cross-domain property reporting.",
    to: "/restaurant/reports",
    icon: BarChart3,
  },
];

/** Core property links — never gated by a package. */
const SETUP_LINKS: { title: string; moduleKey: ModuleKey; to: string; icon: LucideIcon }[] = [
  { title: "Configuration", moduleKey: "configuration", to: "/restaurant/configuration", icon: SlidersHorizontal },
  {
    title: "Property Settings & Integrations",
    moduleKey: "property_settings",
    to: "/restaurant/settings",
    icon: Settings,
  },
];

const PMS_SUBMODULES = [
  "Front Office",
  "Reservations",
  "Housekeeping",
  "Cashiering",
  "Rooms & Rates",
  "Distribution",
  "Night Audit",
];

function PropertyHome({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const timezone = useRestaurantTimezone();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const fetchDashboard = useServerFn(getRestaurantDashboard);
  const fetchInventory = useServerFn(getInventoryDashboard);
  const fetchShifts = useServerFn(listShifts);
  const fetchFrontOffice = useServerFn(getFrontOfficeDashboard);
  const fetchModules = useServerFn(getMyModuleAccess);

  const moduleAccess = useQuery({
    queryKey: ["property-home-modules", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
  });
  const allowed = moduleAccess.data?.modules ?? [];
  const packages = usePackageEntitlements(restaurantId);

  const canManageStaff = allowed.includes("front_office");
  const canSeeStock = allowed.includes("inventory");
  const canSeeFnB = allowed.includes("food_and_beverage");
  const today = useMemo(() => localDateInZone(timezone), [timezone]);

  const dashboard = useQuery({
    queryKey: ["property-home-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId, tzOffsetMinutes } }),
    enabled: canSeeFnB,
    retry: false,
  });

  const inventory = useQuery({
    queryKey: ["property-home-inventory", restaurantId],
    queryFn: () => fetchInventory({ data: { restaurantId, preset: "today" } }),
    enabled: canSeeStock,
  });

  const shifts = useQuery({
    queryKey: ["property-home-shifts", restaurantId, today],
    queryFn: () => fetchShifts({ data: { restaurantId, from: today, to: today } }),
    enabled: allowed.includes("human_resources"),
    retry: false,
  });

  const frontOffice = useQuery({
    queryKey: ["property-home-front-office", restaurantId, today],
    queryFn: () => fetchFrontOffice({ data: { restaurantId, today } }),
    enabled: canManageStaff,
    retry: false,
  });

  const onShift = shifts.data
    ? shifts.data.shifts.filter((s) => s.attendanceStatus === "checked_in").length
    : null;

  const occupancy = frontOffice.data
    ? (() => {
        const total = frontOffice.data.occupiedRooms + frontOffice.data.availableRooms;
        return total > 0 ? `${Math.round((frontOffice.data.occupiedRooms / total) * 100)}%` : "0%";
      })()
    : null;

  // Package tile = package entitlement AND existing module access.
  const showRestaurant = packages.has("restaurant_management") && canSeeFnB;
  const showPms = packages.has("pms") && PMS_MODULE_KEYS.some((k) => allowed.includes(k));
  const backOfficeLinks = packages.has("back_office")
    ? BACK_OFFICE_LINKS.filter((l) => allowed.includes(l.moduleKey))
    : [];
  const setupLinks = SETUP_LINKS.filter((l) => allowed.includes(l.moduleKey));
  const nothingVisible =
    !showRestaurant && !showPms && backOfficeLinks.length === 0 && !packages.loading;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <NoruLogo size="sm" />
          <span className="text-muted-foreground">·</span>
          <h1 className="font-display text-2xl sm:text-3xl">{membership.restaurant.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your unified hospitality workspace — the packages this property uses, in one place.
        </p>
      </header>

      <section aria-label="Today at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon={TrendingUp}
          label="Today's F&B order value"
          value={canSeeFnB ? (dashboard.data ? money(dashboard.data.today.revenue) : null) : "—"}
          loading={canSeeFnB && dashboard.isLoading}
        />
        <SummaryCard
          icon={ReceiptText}
          label="Active orders"
          value={canSeeFnB ? (dashboard.data ? String(dashboard.data.counts.active) : null) : "—"}
          loading={canSeeFnB && dashboard.isLoading}
        />
        <SummaryCard
          icon={BedDouble}
          label="Occupancy"
          value={canManageStaff ? occupancy : "—"}
          loading={canManageStaff && frontOffice.isLoading}
        />
        <SummaryCard
          icon={Hotel}
          label="In-house guests"
          value={
            canManageStaff ? (frontOffice.data ? String(frontOffice.data.inHouse) : null) : "—"
          }
          loading={canManageStaff && frontOffice.isLoading}
        />
        <SummaryCard
          icon={UserCheck}
          label="Staff on shift"
          value={
            allowed.includes("human_resources") ? (onShift === null ? null : String(onShift)) : "—"
          }
          loading={allowed.includes("human_resources") && shifts.isLoading}
        />
        <SummaryCard
          icon={PackageOpen}
          label="Low stock items"
          value={
            canSeeStock ? (inventory.data ? String(inventory.data.stock.lowStock) : null) : "—"
          }
          loading={canSeeStock && inventory.isLoading}
        />
      </section>

      <section aria-label="Available packages" className="space-y-4">
        <h2 className="font-display text-xl">Available packages</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          {showRestaurant ? (
            <PackageTile
              icon={UtensilsCrossed}
              title="Restaurant Management"
              description="Food & beverage service, kitchen, orders, menu, tables and the restaurant POS."
              detail="Dashboard · Kitchen · Orders · Take Order · Menu · Tables & QR · POS"
              to="/restaurant/dashboard"
            />
          ) : null}

          {showPms ? (
            <PackageTile
              icon={Hotel}
              title="PMS"
              description="Hotel operating system — the home for every rooms-side operation."
              detail={`${PMS_SUBMODULES.join(" · ")} and more`}
              to="/restaurant/pms"
            />
          ) : null}
        </div>

        {backOfficeLinks.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Briefcase className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-lg leading-snug">Back Office</p>
                <p className="text-sm text-muted-foreground">
                  Property-wide support services shared by every other package.
                </p>
              </div>
              <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Foundation
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {backOfficeLinks.map((l) => (
                <Link
                  key={l.title}
                  to={l.to}
                  {...(l.tab ? { search: { tab: l.tab } } : {})}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <l.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-medium">
                      {l.title}
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{l.note}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {nothingVisible ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="font-medium">No packages available for you here</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ask the property owner to give you access, or get in touch with NORU about adding a
              package to this property.
            </p>
          </div>
        ) : null}

        {setupLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Property setup
            </span>
            {setupLinks.map((l) => (
              <Link
                key={l.title}
                to={l.to}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <l.icon className="size-4" /> {l.title}
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PackageTile({
  icon: Icon,
  title,
  description,
  detail,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-4 rounded-2xl border border-primary/40 bg-card p-6 transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center"
    >
      <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
        <Icon className="size-7" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-display text-2xl leading-snug">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-2xl",
          loading && "animate-pulse text-muted-foreground",
        )}
      >
        {loading ? "—" : (value ?? "—")}
      </p>
    </div>
  );
}
