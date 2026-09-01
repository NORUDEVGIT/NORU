import { useMemo } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UtensilsCrossed,
  Boxes,
  Users,
  Settings,
  BedDouble,
  CalendarCheck,
  Calculator,
  ArrowRight,
  TrendingUp,
  ReceiptText,
  PackageOpen,
} from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { getRestaurantDashboard } from "@/lib/dashboard.functions";
import { getInventoryDashboard } from "@/lib/inventory-reporting.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useMoney } from "@/state/restaurant-context";
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
        content: "Your NORU property home: jump into restaurant operations, stock, staff and settings from one place.",
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

type ModuleCard = {
  title: string;
  description: string;
  icon: typeof UtensilsCrossed;
  to?: string;
  tab?: string;
  roles?: string[];
};

const ACTIVE_MODULES: ModuleCard[] = [
  {
    title: "Restaurant",
    description: "Menu, orders, kitchen, tables and waiter ordering.",
    icon: UtensilsCrossed,
    to: "/restaurant/dashboard",
  },
  {
    title: "Stock",
    description: "Ingredients, consumables, assets, suppliers and purchasing.",
    icon: Boxes,
    to: "/restaurant/inventory",
    tab: "overview",
    roles: ["owner", "manager", "kitchen"],
  },
  {
    title: "Staff",
    description: "Team, schedules, attendance and workforce reports.",
    icon: Users,
    to: "/restaurant/staff",
    tab: "schedule",
  },
  {
    title: "Settings",
    description: "Timezone, currency and opening hours.",
    icon: Settings,
    to: "/restaurant/settings",
  },
];

const SOON_MODULES: ModuleCard[] = [
  { title: "Rooms", description: "Room inventory and housekeeping.", icon: BedDouble },
  { title: "Booking", description: "Reservations across your property.", icon: CalendarCheck },
  { title: "Accounting", description: "Revenue, costs and reporting.", icon: Calculator },
];

function PropertyHome({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const role = membership.role;
  const money = useMoney();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const fetchDashboard = useServerFn(getRestaurantDashboard);
  const fetchInventory = useServerFn(getInventoryDashboard);

  const dashboard = useQuery({
    queryKey: ["property-home-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId, tzOffsetMinutes } }),
  });

  const canSeeStock = role === "owner" || role === "manager" || role === "kitchen";
  const inventory = useQuery({
    queryKey: ["property-home-inventory", restaurantId],
    queryFn: () => fetchInventory({ data: { restaurantId, preset: "today" } }),
    enabled: canSeeStock,
  });

  const modules = ACTIVE_MODULES.filter((m) => !m.roles || m.roles.includes(role));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl">{membership.restaurant.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your property home — pick a workspace to get started.
        </p>
      </header>

      <section aria-label="Today at a glance" className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={TrendingUp}
          label="Today's order value"
          value={dashboard.data ? money(dashboard.data.today.revenue) : null}
          loading={dashboard.isLoading}
        />
        <SummaryCard
          icon={ReceiptText}
          label="Active orders"
          value={dashboard.data ? String(dashboard.data.counts.active) : null}
          loading={dashboard.isLoading}
        />
        <SummaryCard
          icon={PackageOpen}
          label="Low stock items"
          value={canSeeStock ? (inventory.data ? String(inventory.data.stock.lowStock) : null) : "—"}
          loading={canSeeStock && inventory.isLoading}
        />
      </section>

      <section aria-label="Workspaces" className="space-y-3">
        <h2 className="font-display text-xl">Workspaces</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((m) => (
            <Link
              key={m.title}
              to={m.to!}
              {...(m.tab ? { search: { tab: m.tab } } : {})}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              <m.icon className="size-6 text-primary" />
              <p className="mt-3 font-display text-lg">{m.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Coming soon" className="space-y-3">
        <h2 className="font-display text-xl">Coming soon</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SOON_MODULES.map((m) => (
            <div
              key={m.title}
              className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 opacity-80"
            >
              <div className="flex items-center justify-between">
                <m.icon className="size-6 text-muted-foreground" />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Soon
                </span>
              </div>
              <p className="mt-3 font-display text-lg text-muted-foreground">{m.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
            </div>
          ))}
        </div>
      </section>
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
      <p className={cn("mt-2 font-display text-2xl", loading && "animate-pulse text-muted-foreground")}>
        {loading ? "—" : (value ?? "—")}
      </p>
    </div>
  );
}
