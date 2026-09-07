/**
 * Phase 8H3 — Standalone POS route: Dashboard.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosDashboard } from "@/packages/standalone-pos/components/dashboard-page";

export const Route = createFileRoute("/restaurant/pos/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/dashboard" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Standalone POS — NORU" },
      { name: "description", content: "Readiness and, later, trading figures for the independent point of sale." },
      { property: "og:title", content: "Dashboard — Standalone POS — NORU" },
      { property: "og:description", content: "Readiness and, later, trading figures for the independent point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosDashboardRoute,
});

function PosDashboardRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="dashboard">
      {(m) => <StandalonePosDashboard membership={m} />}
    </RestaurantShell>
  );
}
