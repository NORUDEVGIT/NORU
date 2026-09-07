/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { OrdersBody, validateOrdersSearch } from "@/components/workspaces/restaurant/orders-workspace";

export const Route = createFileRoute("/restaurant/orders/")({
  ssr: false,
  validateSearch: validateOrdersSearch,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Orders — NORU" },
      {
        name: "description",
        content: "Search, review and manage your restaurant's order history with status, date and table filters.",
      },
      { property: "og:title", content: "Orders — NORU" },
      { property: "og:description", content: "Searchable restaurant order history and order detail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantOrdersRoute,
});

function RestaurantOrdersRoute() {
  const search = Route.useSearch();
  return (
    <RestaurantShell active="Orders">
      {(membership) => (
        <OrdersBody membership={membership} search={search} basePath="/restaurant/orders" />
      )}
    </RestaurantShell>
  );
}
