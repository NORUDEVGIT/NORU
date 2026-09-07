/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { RestaurantKitchen } from "@/components/workspaces/restaurant/kitchen-workspace";

export const Route = createFileRoute("/restaurant/kitchen")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/kitchen" } });

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Kitchen Orders — NORU" },
      { name: "description", content: "Live kitchen display for your restaurant: incoming orders, table numbers and preparation status in real time." },
      { property: "og:title", content: "Kitchen Orders — NORU" },
      { property: "og:description", content: "Live kitchen display for your restaurant's incoming orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantKitchen,
});


