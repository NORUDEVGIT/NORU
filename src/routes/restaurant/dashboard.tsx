/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { DashboardBody } from "@/components/workspaces/restaurant/dashboard-workspace";

export const Route = createFileRoute("/restaurant/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Restaurant Dashboard — NORU" },
      { name: "description", content: "Live restaurant operations overview: today's orders, revenue, kitchen status, tables and menu availability." },
      { property: "og:title", content: "Restaurant Dashboard — NORU" },
      { property: "og:description", content: "Live restaurant operations overview for your venue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantDashboardRoute,
});

function RestaurantDashboardRoute() {
  return (
    <RestaurantShell active="Dashboard">
      {(membership) => <DashboardBody membership={membership} />}
    </RestaurantShell>
  );
}
