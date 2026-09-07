/**
 * Phase 8G2C — read-only units reference shared by every package.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BackOfficeInventoryUnits } from "@/components/workspaces/back-office/inventory-pages";

export const Route = createFileRoute("/restaurant/back-office/inventory/units")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/inventory/units" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Units — Back Office Inventory — NORU" },
      { name: "description", content: "The shared measurement reference used by items, recipes and purchasing." },
      { property: "og:title", content: "Units — Back Office Inventory — NORU" },
      { property: "og:description", content: "The shared measurement reference used by items, recipes and purchasing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="inventory" boDetailLabel="Units">
      {(m) => <BackOfficeInventoryUnits restaurantId={m.restaurant.id} />}
    </RestaurantShell>
  );
}
