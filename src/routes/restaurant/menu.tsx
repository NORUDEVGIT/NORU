/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { MenuWorkspace } from "@/components/workspaces/restaurant/menu-workspace";

export const Route = createFileRoute("/restaurant/menu")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/menu" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Menu Management — NORU" },
      {
        name: "description",
        content:
          "Create categories, add dishes, set prices and mark items out of stock for your restaurant menu.",
      },
      { property: "og:title", content: "Menu Management — NORU" },
      { property: "og:description", content: "Manage your restaurant's categories, dishes and availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MenuManagementPage,
});

function MenuManagementPage() {
  return (
    <RestaurantShell active="Menu">
      {(membership) => <MenuWorkspace membership={membership} />}
    </RestaurantShell>
  );
}
