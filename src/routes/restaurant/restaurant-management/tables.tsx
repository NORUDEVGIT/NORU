/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { TablesManager } from "@/components/workspaces/restaurant/tables-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/tables")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/tables" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Table & Floor Management — Restaurant Management — NORU" },
      { name: "description", content: "Tables, table codes and the printable QR cards guests scan." },
      { property: "og:title", content: "Table & Floor Management — Restaurant Management — NORU" },
      { property: "og:description", content: "Tables, table codes and the printable QR cards guests scan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="tables-floor">
      {(m) => <TablesManager membership={m} />}
    </RestaurantShell>
  );
}
