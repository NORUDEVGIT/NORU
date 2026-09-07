/**
 * Phase 8G2C — canonical Back Office Inventory / Warehouse home.
 * Central governance of stock; operational restaurant stock stays in
 * Restaurant Management. Same items, same single movement ledger.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { BackOfficeInventoryHome } from "@/packages/back-office/components/inventory-pages";

export const Route = createFileRoute("/restaurant/back-office/inventory/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/inventory" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Inventory / Warehouse — Back Office — NORU" },
      { name: "description", content: "Central stock control for the property: item master, movement ledger and units." },
      { property: "og:title", content: "Inventory / Warehouse — Back Office — NORU" },
      { property: "og:description", content: "Central stock control for the property: item master, movement ledger and units." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="inventory">
      {(m) => <BackOfficeInventoryHome restaurantId={m.restaurant.id} />}
    </RestaurantShell>
  );
}
