/**
 * Phase 8H3 — Standalone POS route: Catalog.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosCatalog } from "@/components/workspaces/standalone-pos/catalog-page";

export const Route = createFileRoute("/restaurant/pos/catalog")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/catalog" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Catalog — Standalone POS — NORU" },
      { name: "description", content: "Products and categories sold by the independent point of sale." },
      { property: "og:title", content: "Catalog — Standalone POS — NORU" },
      { property: "og:description", content: "Products and categories sold by the independent point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosCatalogRoute,
});

function PosCatalogRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="catalog">
      {(m) => <StandalonePosCatalog membership={m} />}
    </RestaurantShell>
  );
}
