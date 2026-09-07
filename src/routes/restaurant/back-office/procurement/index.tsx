/**
 * Phase 8G1 — Back Office foundation route. Presentation only: no business
 * data, no ownership migration, no new entitlement logic.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getBoModule } from "@/packages/back-office/lib/back-office-modules";
import { BackOfficeFoundation } from "@/packages/back-office/components/foundation-page";

const MODULE = getBoModule("procurement")!;

export const Route = createFileRoute("/restaurant/back-office/procurement/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/procurement" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Procurement — Back Office — NORU" },
      { name: "description", content: "Back Office Procurement: property-wide suppliers, purchasing and receiving." },
      { property: "og:title", content: "Procurement — Back Office — NORU" },
      { property: "og:description", content: "Back Office Procurement: property-wide suppliers, purchasing and receiving." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeModuleRoute,
});

function BackOfficeModuleRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="procurement">
      {(m) => <BackOfficeFoundation module={MODULE} restaurantId={m.restaurantId} />}
    </RestaurantShell>
  );
}
