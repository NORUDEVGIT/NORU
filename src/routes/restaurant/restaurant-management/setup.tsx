/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { ConfigurationWorkspace } from "@/core/components/workspaces/configuration-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/setup")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/setup" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Restaurant Setup & Administration — Restaurant Management — NORU" },
      { name: "description", content: "Outlet configuration, dining areas, menu and table setup for the restaurant." },
      { property: "og:title", content: "Restaurant Setup & Administration — Restaurant Management — NORU" },
      { property: "og:description", content: "Outlet configuration, dining areas, menu and table setup for the restaurant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="setup-admin">
      {(m) => (
        <ConfigurationWorkspace
          membership={m}
          sections={["Food & Beverage"]}
          sectionLabels={{ "Food & Beverage": "Restaurant setup" }}
          heading="Restaurant Setup & Administration"
          intro="Restaurant setup and administration: menu, tables and QR codes, operating configuration, hours, taxes and service charges. Hotel property setup stays in PMS."
        />
      )}
    </RestaurantShell>
  );
}
