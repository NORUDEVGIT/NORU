import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getCashieringAccess } from "@/lib/cashiering.functions";
import {
  CashierShiftsTab,
  CashieringDashboardTab,
  FoliosTab,
} from "@/components/cashiering/cashiering-tabs";
import { propertyToday } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

const TABS = ["dashboard", "folios", "payments", "shifts"] as const;
type CashieringTabKey = (typeof TABS)[number];

export const Route = createFileRoute("/restaurant/cashiering/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/cashiering" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Cashiering & Folios — NORU" },
      {
        name: "description",
        content: "Guest folios, charges, payments, refunds and cashier shifts for your NORU property.",
      },
      { property: "og:title", content: "Cashiering & Folios — NORU" },
      { property: "og:description", content: "Guest folios, payments and cashier shifts in NORU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashieringRoute,
});

function CashieringRoute() {
  return <RestaurantShell active="Cashiering">{(m) => <CashieringPage membership={m} />}</RestaurantShell>;
}

function CashieringPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const today = propertyToday(membership.restaurant.timezone);
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  const [tab, setTab] = useState<CashieringTabKey>("dashboard");

  useEffect(() => {
    if (searchTab && (TABS as readonly string[]).includes(searchTab)) setTab(searchTab as CashieringTabKey);
  }, [searchTab]);

  const fetchAccess = useServerFn(getCashieringAccess);
  const accessQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading cashiering…</p>;
  if (!accessQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Cashiering & Folios</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Accounting &amp; Finance for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Cashiering &amp; Folios</h1>
        <p className="text-sm text-muted-foreground">
          Guest folios, charges, payments and cashier shifts for {membership.restaurant.name}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as CashieringTabKey)}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="folios">Folios</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="shifts">Cashier Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <CashieringDashboardTab restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="folios" className="mt-4">
          <FoliosTab restaurantId={restaurantId} status="all" />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <FoliosTab restaurantId={restaurantId} status="open" />
        </TabsContent>
        <TabsContent value="shifts" className="mt-4">
          <CashierShiftsTab restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
