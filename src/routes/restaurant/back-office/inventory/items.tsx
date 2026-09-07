/**
 * Phase 8G2C — Back Office item master. Reuses the existing inventory server
 * functions, dialogs and item table; no separate data or posting path.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { BackOfficeInventoryItems } from "@/components/workspaces/back-office/inventory-pages";

export const Route = createFileRoute("/restaurant/back-office/inventory/items")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/inventory/items" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Item master — Back Office Inventory — NORU" },
      { name: "description", content: "Every stock item the property holds, with balance, minimum level and cost." },
      { property: "og:title", content: "Item master — Back Office Inventory — NORU" },
      { property: "og:description", content: "Every stock item the property holds, with balance, minimum level and cost." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="inventory" boDetailLabel="Item master">
      {(m) => <BackOfficeInventoryItems restaurantId={m.restaurant.id} />}
    </RestaurantShell>
  );
}
