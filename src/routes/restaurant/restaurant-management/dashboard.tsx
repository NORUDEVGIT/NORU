/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { DashboardBody } from "@/packages/restaurant-management/components/workspaces/dashboard-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/dashboard" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Restaurant Management — NORU" },
      { name: "description", content: "Today's restaurant trading: order value, active orders and service load." },
      { property: "og:title", content: "Dashboard — Restaurant Management — NORU" },
      { property: "og:description", content: "Today's restaurant trading: order value, active orders and service load." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="dashboard">
      {(m) => <DashboardBody membership={m} />}
    </RestaurantShell>
  );
}
