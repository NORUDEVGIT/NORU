/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { ReportsWorkspace } from "@/core/components/workspaces/reports-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/reports" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Reports & Analytics — Restaurant Management — NORU" },
      { name: "description", content: "Restaurant sales, product performance and restaurant KPIs." },
      { property: "og:title", content: "Reports & Analytics — Restaurant Management — NORU" },
      { property: "og:description", content: "Restaurant sales, product performance and restaurant KPIs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="reports">
      {(m) => <ReportsWorkspace membership={m} />}
    </RestaurantShell>
  );
}
