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

const MODULE = getBoModule("audit")!;

export const Route = createFileRoute("/restaurant/back-office/audit")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/audit" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Audit & Compliance — Back Office — NORU" },
      { name: "description", content: "Back Office Audit: property-level oversight and compliance." },
      { property: "og:title", content: "Audit & Compliance — Back Office — NORU" },
      { property: "og:description", content: "Back Office Audit: property-level oversight and compliance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeModuleRoute,
});

function BackOfficeModuleRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="audit">
      {(m) => <BackOfficeFoundation module={MODULE} restaurantId={m.restaurantId} />}
    </RestaurantShell>
  );
}
