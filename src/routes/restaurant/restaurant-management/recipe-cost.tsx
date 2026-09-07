/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { MenuWorkspace } from "@/components/workspaces/restaurant/menu-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/recipe-cost/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/recipe-cost" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Recipe & Cost Management — Restaurant Management — NORU" },
      { name: "description", content: "Dish recipes, ingredient mapping and plate cost, managed from the menu items themselves." },
      { property: "og:title", content: "Recipe & Cost Management — Restaurant Management — NORU" },
      { property: "og:description", content: "Dish recipes, ingredient mapping and plate cost, managed from the menu items themselves." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }}),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="recipe-cost">
      {(m) => <MenuWorkspace membership={m} />}
    </RestaurantShell>
  );
}
