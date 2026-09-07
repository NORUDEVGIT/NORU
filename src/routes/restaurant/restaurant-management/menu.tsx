/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { MenuWorkspace } from "@/components/workspaces/restaurant/menu-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/menu")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/menu" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Menu & Product Management — Restaurant Management — NORU" },
      { name: "description", content: "Categories, dishes, prices, availability and menu images." },
      { property: "og:title", content: "Menu & Product Management — Restaurant Management — NORU" },
      { property: "og:description", content: "Categories, dishes, prices, availability and menu images." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="menu">
      {(m) => <MenuWorkspace membership={m} />}
    </RestaurantShell>
  );
}
