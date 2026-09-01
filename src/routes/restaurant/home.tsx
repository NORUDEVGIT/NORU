import { useMemo, useState } from "react";
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
  Wallet,
  BarChart3,
  ArrowRight,
  TrendingUp,
  ReceiptText,
  PackageOpen,
  UserCheck,
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
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useMoney, useRestaurantTimezone } from "@/state/restaurant-context";
import { localDateInZone } from "@/lib/restaurant-time";
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
          "Your NORU property home: restaurant, rooms, booking, stock, staff, finance and reporting workspaces in one place.",
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
  status: "active" | "soon";
  to?: string;
  tab?: string;
  /** When set, only these membership roles see the card. */
  roles?: string[];
};

const MODULES: ModuleCard[] = [
  {
    title: "Restaurant Management",
    description:
      "Manage restaurant performance, menu, kitchen, orders, tables, QR ordering and waiter-assisted service.",
    icon: UtensilsCrossed,
    status: "active",
    to: "/restaurant/dashboard",
  },
  {
    title: "Rooms & Front Office",
    description:
      "Room types, rooms, amenities and room imagery. Availability, arrivals and housekeeping follow in a later phase.",
    icon: BedDouble,
    status: "active",
    to: "/restaurant/rooms",
    tab: "dashboard",
    roles: ["owner", "manager"],
  },
  {
    title: "Booking & Guest Management",
    description:
      "Reservations, availability, guest profiles, companies, groups, rates, loyalty and booking channels.",
    icon: CalendarCheck,
    status: "soon",
  },
  {
    title: "Stock & Procurement",
    description:
      "Ingredients, consumables, assets, equipment, suppliers, purchasing, recipes, waste and inventory reporting.",
    icon: Boxes,
    status: "active",
    to: "/restaurant/inventory",
    tab: "overview",
    roles: ["owner", "manager", "kitchen"],
  },
  {
    title: "Staff Management",
    description: "Staff, schedules, attendance, assignments and workforce reporting.",
    icon: Users,
    status: "active",
    to: "/restaurant/staff",
    tab: "schedule",
  },
  {
    title: "Accounting & Finance",
    description:
      "Guest folios, restaurant and room revenue, payments, expenses, invoices, reconciliation and night audit.",
    icon: Wallet,
    status: "soon",
  },
  {
    title: "Reports & Analytics",
    description:
      "Property-wide operational, restaurant, booking, occupancy, stock, staff and financial analytics.",
    icon: BarChart3,
    status: "soon",
  },
  {
    title: "Property Settings & Integrations",
    description:
      "Property information, timezone, currency, branding, operational rules and future integrations.",
    icon: Settings,
    status: "active",
    to: "/restaurant/settings",
  },
];

function PropertyHome({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const role = membership.role;
  const money = useMoney();
  const timezone = useRestaurantTimezone();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);
  const [soon, setSoon] = useState<ModuleCard | null>(null);

  const fetchDashboard = useServerFn(getRestaurantDashboard);
  const fetchInventory = useServerFn(getInventoryDashboard);
  const fetchShifts = useServerFn(listShifts);

  const canManageStaff = role === "owner" || role === "manager";
  const canSeeStock = role === "owner" || role === "manager" || role === "kitchen";
  const today = useMemo(() => localDateInZone(timezone), [timezone]);

  const dashboard = useQuery({
    queryKey: ["property-home-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId, tzOffsetMinutes } }),
  });

  const inventory = useQuery({
    queryKey: ["property-home-inventory", restaurantId],
    queryFn: () => fetchInventory({ data: { restaurantId, preset: "today" } }),
    enabled: canSeeStock,
  });

  const shifts = useQuery({
    queryKey: ["property-home-shifts", restaurantId, today],
    queryFn: () => fetchShifts({ data: { restaurantId, from: today, to: today } }),
    enabled: canManageStaff,
  });

  const onShift = shifts.data
    ? shifts.data.shifts.filter((s) => s.attendanceStatus === "checked_in").length
    : null;

  const modules = MODULES.filter((m) => !m.roles || m.roles.includes(role));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <NoruLogo size="sm" />
          <span className="text-muted-foreground">·</span>
          <h1 className="font-display text-2xl sm:text-3xl">{membership.restaurant.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage every part of your hospitality operation from one place.
        </p>
      </header>

      <section aria-label="Today at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          icon={UserCheck}
          label="Staff on shift"
          value={canManageStaff ? (onShift === null ? null : String(onShift)) : "—"}
          loading={canManageStaff && shifts.isLoading}
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) =>
            m.status === "active" ? (
              <Link
                key={m.title}
                to={m.to!}
                {...(m.tab ? { search: { tab: m.tab } } : {})}
                className="group flex min-h-36 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <m.icon className="size-6 text-primary" />
                <p className="mt-3 font-display text-lg">{m.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary">
                  Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ) : (
              <button
                key={m.title}
                type="button"
                onClick={() => setSoon(m)}
                className="flex min-h-36 flex-col rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <m.icon className="size-6 text-muted-foreground" />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Coming soon
                  </span>
                </div>
                <p className="mt-3 font-display text-lg text-muted-foreground">{m.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
              </button>
            ),
          )}
        </div>
      </section>

      <Dialog open={soon !== null} onOpenChange={(open) => !open && setSoon(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{soon?.title}</DialogTitle>
            <DialogDescription>{soon?.description}</DialogDescription>
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
      <p className={cn("mt-2 font-display text-2xl", loading && "animate-pulse text-muted-foreground")}>
        {loading ? "—" : (value ?? "—")}
      </p>
    </div>
  );
}
