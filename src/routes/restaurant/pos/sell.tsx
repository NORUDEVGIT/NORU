/**
 * Phase 8H5 — Standalone POS route: Sell.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosSell } from "@/components/workspaces/standalone-pos/sell-page";

export const Route = createFileRoute("/restaurant/pos/sell")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/sell" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Sell — Standalone POS — NORU" },
      { name: "description", content: "Ring up a sale, take payment and finish at the independent till." },
      { property: "og:title", content: "Sell — Standalone POS — NORU" },
      { property: "og:description", content: "Ring up a sale, take payment and finish at the independent till." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosSellRoute,
});

function PosSellRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="sell">
      {(m) => <StandalonePosSell membership={m} />}
    </RestaurantShell>
  );
}
