/**
 * Phase 8G2E — canonical Back Office · Accounting & Finance home.
 *
 * Read-only. Source-package financial transactions are neither moved nor
 * copied: PMS Cashiering and Restaurant Management payments keep their own
 * homes, owners and permissions.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BackOfficeAccountingHome } from "@/components/workspaces/back-office/accounting-pages";

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
      {
        name: "description",
        content:
          "Back Office Accounting & Finance: property-level financial control and the finance sources behind every NORU package.",
      },
      { property: "og:title", content: "Accounting & Finance — Back Office — NORU" },
      {
        property: "og:description",
        content:
          "Back Office Accounting & Finance: property-level financial control and the finance sources behind every NORU package.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeAccountingRoute,
});

function BackOfficeAccountingRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="accounting">
      {(m) => (
        <BackOfficeAccountingHome
          restaurantId={m.restaurantId}
          timezone={m.restaurant?.timezone ?? null}
        />
      )}
    </RestaurantShell>
  );
}
