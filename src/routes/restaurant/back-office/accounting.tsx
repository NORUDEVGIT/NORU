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

const MODULE = getBoModule("accounting")!;

export const Route = createFileRoute("/restaurant/back-office/accounting")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/accounting" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Accounting & Finance — Back Office — NORU" },
      { name: "description", content: "Back Office Accounting: consolidated financial events from every NORU package." },
      { property: "og:title", content: "Accounting & Finance — Back Office — NORU" },
      { property: "og:description", content: "Back Office Accounting: consolidated financial events from every NORU package." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeModuleRoute,
});

function BackOfficeModuleRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="accounting">
      {(m) => <BackOfficeFoundation module={MODULE} restaurantId={m.restaurantId} />}
    </RestaurantShell>
  );
}
