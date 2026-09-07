/**
 * Phase 8H3 — Standalone POS route: Reports.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosReports } from "@/packages/standalone-pos/components/reports-page";

export const Route = createFileRoute("/restaurant/pos/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/reports" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Reports — Standalone POS — NORU" },
      { name: "description", content: "Sales, product, payment and shift reporting for the independent point of sale." },
      { property: "og:title", content: "Reports — Standalone POS — NORU" },
      { property: "og:description", content: "Sales, product, payment and shift reporting for the independent point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosReportsRoute,
});

function PosReportsRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="reports">
      {(m) => <StandalonePosReports membership={m} />}
    </RestaurantShell>
  );
}
