/**
 * Phase 8G1 — Back Office foundation route. Presentation only: no business
 * data, no ownership migration, no new entitlement logic.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { getBoModule } from "@/lib/back-office-modules";
import { BackOfficeFoundation } from "@/components/workspaces/back-office/foundation-page";

const MODULE = getBoModule("inventory")!;

export const Route = createFileRoute("/restaurant/back-office/inventory")({
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
      { name: "description", content: "Back Office Inventory: the central warehouse layer for the property." },
      { property: "og:title", content: "Inventory / Warehouse — Back Office — NORU" },
      { property: "og:description", content: "Back Office Inventory: the central warehouse layer for the property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeModuleRoute,
});

function BackOfficeModuleRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="inventory">
      {(m) => <BackOfficeFoundation module={MODULE} restaurantId={m.restaurantId} />}
    </RestaurantShell>
  );
}
