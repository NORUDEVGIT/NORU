/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { OrdersBody, validateOrdersSearch } from "@/components/workspaces/restaurant/orders-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/orders")({
  ssr: false,
  validateSearch: validateOrdersSearch,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/orders" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Order Management — Restaurant Management — NORU" },
      { name: "description", content: "Every restaurant order, its lines, its status and where it came from." },
      { property: "og:title", content: "Order Management — Restaurant Management — NORU" },
      { property: "og:description", content: "Every restaurant order, its lines, its status and where it came from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  return (
    <RestaurantShell active="Restaurant Management" rmModule="orders">
      {(m) => (
        <OrdersBody
          membership={m}
          search={search}
          basePath="/restaurant/restaurant-management/orders"
        />
      )}
    </RestaurantShell>
  );
}
