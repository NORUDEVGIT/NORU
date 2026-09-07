/**
 * Phase 8G2B — canonical Back Office purchase orders list. Reuses the existing
 * purchasing workspace component and its server functions unchanged.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { PurchasingTab } from "@/components/inventory/purchasing-tab";

export const Route = createFileRoute("/restaurant/back-office/procurement/purchase-orders/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/procurement/purchase-orders" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Purchase orders — Back Office Procurement — NORU" },
      { name: "description", content: "Raise and track purchase orders from draft through to fully received." },
      { property: "og:title", content: "Purchase orders — Back Office Procurement — NORU" },
      { property: "og:description", content: "Raise and track purchase orders from draft through to fully received." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchaseOrdersRoute,
});

function PurchaseOrdersRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="procurement" boDetailLabel="Purchase orders">
      {(m) => (
        <div className="space-y-5">
          <header className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Back Office · Procurement
            </p>
            <h1 className="font-display text-2xl">Purchase orders</h1>
          </header>
          <PurchasingTab restaurantId={m.restaurant.id} detailRoute="back-office" />
        </div>
      )}
    </RestaurantShell>
  );
}
