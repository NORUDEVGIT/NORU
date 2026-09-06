import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCashieringAccess } from "@/lib/cashiering.functions";
import {
  CashierShiftsTab,
  CashieringDashboardTab,
  FoliosTab,
} from "@/components/cashiering/cashiering-tabs";
import { propertyToday } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { PageHeading, NonPmsOnly } from "@/state/pms-context";

const TABS = ["dashboard", "folios", "payments", "shifts"] as const;
type CashieringTabKey = (typeof TABS)[number];

export function CashieringWorkspace({ membership, initialTab }: { membership: RestaurantMembership; initialTab?: string | undefined }) {
  const restaurantId = membership.restaurant.id;
  const today = propertyToday(membership.restaurant.timezone);
  const searchTab = initialTab;
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
        <h1 className="font-display text-2xl"><PageHeading fallback="Cashiering & Folios" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Accounting &amp; Finance for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl"><PageHeading fallback="Cashiering &amp; Folios" /></h1>
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
