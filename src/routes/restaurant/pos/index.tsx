/**
 * Phase 8H3 — Standalone POS route: Standalone POS.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { StandalonePosHome } from "@/components/workspaces/standalone-pos/pos-home";

export const Route = createFileRoute("/restaurant/pos/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Standalone POS — Standalone POS — NORU" },
      { name: "description", content: "An independent point of sale for this property, with its own catalog, tills and receipts." },
      { property: "og:title", content: "Standalone POS — Standalone POS — NORU" },
      { property: "og:description", content: "An independent point of sale for this property, with its own catalog, tills and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StandalonePosHomeRoute,
});

function StandalonePosHomeRoute() {
  return (
    <RestaurantShell active="Standalone POS">
      {(m) => <StandalonePosHome membership={m} />}
    </RestaurantShell>
  );
}
