import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BarChart3, Boxes, ReceiptText, Sparkles, Users, Wallet } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { RevenueOverviewTab } from "@/components/rates/rates-tabs";
import { supabase } from "@/integrations/supabase/client";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import { propertyToday } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/reports" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Reports & Analytics — NORU" },
      {
        name: "description",
        content:
          "Property performance in NORU: occupancy, ADR, RevPAR and room revenue, plus shortcuts to your operational reports.",
      },
      { property: "og:title", content: "Reports & Analytics — NORU" },
      { property: "og:description", content: "Occupancy, ADR, RevPAR and room revenue for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsRoute,
});

function ReportsRoute() {
  return <RestaurantShell active="Reports">{(m) => <ReportsPage membership={m} />}</RestaurantShell>;
}

type ReportLink = {
  title: string;
  description: string;
  icon: typeof BarChart3;
  to: string;
  tab?: string;
};

const REPORT_LINKS: ReportLink[] = [
  {
    title: "Food & Beverage",
    description: "Order volume, revenue trends and service performance.",
    icon: ReceiptText,
    to: "/restaurant/dashboard",
  },
  {
    title: "Inventory",
    description: "Stock value, low stock, usage and waste reporting.",
    icon: Boxes,
    to: "/restaurant/inventory",
    tab: "overview",
  },
  {
    title: "Human Resources",
    description: "Scheduled versus worked hours and attendance reporting.",
    icon: Users,
    to: "/restaurant/staff",
    tab: "reports",
  },
  {
    title: "Financial",
    description: "Folio balances, payments and cashier shift totals.",
    icon: Wallet,
    to: "/restaurant/cashiering",
    tab: "dashboard",
  },
  {
    title: "Housekeeping",
    description: "Task history, inspections and room status activity.",
    icon: Sparkles,
    to: "/restaurant/housekeeping",
    tab: "history",
  },
];

function ReportsPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const today = propertyToday(membership.restaurant.timezone);
  const fetchAccess = useServerFn(getMyModuleAccess);

  const accessQuery = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Reports & Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Property performance for {membership.restaurant.name}, using your existing operational data.
        </p>
      </div>

      {accessQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      ) : accessQuery.data?.modules.includes("reports_analytics") ? (
        <RevenueOverviewTab restaurantId={restaurantId} today={today} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            You don't have access to Reports & Analytics for this property.
          </p>
        </div>
      )}

      <section aria-label="Operational reports" className="space-y-3">
        <h2 className="font-display text-xl">Operational reports</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_LINKS.map((r) => (
            <Link
              key={r.title}
              to={r.to}
              {...(r.tab ? { search: { tab: r.tab } } : {})}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              <r.icon className="size-5 text-primary" />
              <p className="mt-3 font-display text-lg">{r.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary">
                Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
