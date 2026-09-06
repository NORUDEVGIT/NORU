import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UtensilsCrossed,
  Boxes,
  Users,
  Settings,
  Sparkles,
  Wallet,
  BarChart3,
  Hotel,
  Truck,
  SlidersHorizontal,
  Monitor,
  TrendingUp,
  ReceiptText,
  PackageOpen,
  UserCheck,
  BedDouble,
} from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { NoruLogo } from "@/components/noru-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/restaurant/home")({
  ssr: false,
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
          "Your NORU property home: food & beverage, front office, housekeeping, inventory, procurement, people, finance, reporting and configuration in one place.",
      },
      { property: "og:title", content: "Property Home — NORU" },
      { property: "og:description", content: "One home for every NORU hospitality module." },
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

type ModuleTile = {
  title: string;
  subtitle: string;
  icon: typeof UtensilsCrossed;
  status: "active" | "soon";
  to?: string;
  tab?: string;
  /** Module key used by the access resolver. */
  moduleKey: ModuleKey;
};

const HOTEL_KEYS: ModuleKey[] = [
  "front_office",
  "housekeeping",
  "reports_analytics",
  "configuration",
];

/** Top-level property domains. Hotel functions live inside PMS. */
const MODULES: ModuleTile[] = [
  {
    title: "Food & Beverage",
    moduleKey: "food_and_beverage",
    subtitle: "Service, kitchen and orders",
    icon: UtensilsCrossed,
    status: "active",
    to: "/restaurant/dashboard",
  },
  {
    title: "POS",
    moduleKey: "pos",
    subtitle: "Counter and takeaway sales, payments and receipts",
    icon: Monitor,
    status: "active",
    to: "/restaurant/pos/new",
  },
  {
    title: "Inventory / Warehouse",
    moduleKey: "inventory",
    subtitle: "Shared stock, assets and equipment across the property",
    icon: Boxes,
    status: "active",
    to: "/restaurant/inventory",
    tab: "overview",
  },
  {
    title: "Procurement",
    moduleKey: "procurement",
    subtitle: "Suppliers and purchasing for hotel and restaurant",
    icon: Truck,
    status: "active",
    to: "/restaurant/inventory",
    tab: "suppliers",
  },
  {
    title: "Human Resources",
    moduleKey: "human_resources",
    subtitle: "One property-wide workforce: staff, schedule and attendance",
    icon: Users,
    status: "active",
    to: "/restaurant/staff",
    tab: "schedule",
  },
  {
    title: "Accounting & Finance",
    moduleKey: "accounting_finance",
    subtitle: "Property-wide folios, payments and night audit",
    icon: Wallet,
    status: "active",
    to: "/restaurant/cashiering",
    tab: "dashboard",
  },
];

/** Secondary links — these move under PMS in a later phase. */
const SETUP_LINKS: { title: string; moduleKey: ModuleKey; to: string; icon: typeof Settings }[] = [
  { title: "Reports & Analytics", moduleKey: "reports_analytics", to: "/restaurant/reports", icon: BarChart3 },
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
  const [soon, setSoon] = useState<ModuleTile | null>(null);

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

  const modules = MODULES.filter((m) => allowed.includes(m.moduleKey));
  const showPms = HOTEL_KEYS.some((k) => allowed.includes(k));
  const setupLinks = SETUP_LINKS.filter((l) => allowed.includes(l.moduleKey));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <NoruLogo size="sm" />
          <span className="text-muted-foreground">·</span>
          <h1 className="font-display text-2xl sm:text-3xl">{membership.restaurant.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your unified hospitality workspace — every part of the property in one place.
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

      <section aria-label="Property domains" className="space-y-4">
        <h2 className="font-display text-xl">Property domains</h2>

        {showPms ? (
          <Link
            to="/restaurant/rooms"
            search={{ tab: "dashboard" }}
            className="group flex flex-col gap-4 rounded-2xl border border-primary/40 bg-card p-6 transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center"
          >
            <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              <Hotel className="size-7" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-display text-2xl leading-snug">PMS</p>
              <p className="text-sm text-muted-foreground">
                Hotel operating system — the home for every rooms-side operation.
              </p>
              <p className="text-xs text-muted-foreground">
                {PMS_SUBMODULES.join(" · ")} and more
              </p>
            </div>
          </Link>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {modules.map((m) =>
            m.status === "active" ? (
              <Link
                key={m.title}
                to={m.to!}
                {...(m.tab ? { search: { tab: m.tab } } : {})}
                className="group flex min-h-40 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-secondary"
              >
                <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <m.icon className="size-6" />
                </span>
                <p className="mt-4 font-display text-lg leading-snug">{m.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{m.subtitle}</p>
              </Link>
            ) : (
              <button
                key={m.title}
                type="button"
                onClick={() => setSoon(m)}
                className="flex min-h-40 flex-col rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="inline-flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <m.icon className="size-6" />
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Coming soon
                  </span>
                </div>
                <p className="mt-4 font-display text-lg leading-snug text-muted-foreground">
                  {m.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{m.subtitle}</p>
              </button>
            ),
          )}
        </div>

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


      <Dialog open={soon !== null} onOpenChange={(open) => !open && setSoon(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{soon?.title}</DialogTitle>
            <DialogDescription>{soon?.subtitle}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This workspace is part of the NORU roadmap and isn't available yet. Nothing here is live
            in your property today.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof TrendingUp;
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
