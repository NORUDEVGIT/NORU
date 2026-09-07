/**
 * Phase 8F3 — canonical Restaurant Management order detail. Same guard, same
 * screen, same server logic as the legacy address; only the context differs.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { OrderDetailBody } from "@/packages/restaurant-management/components/workspaces/order-detail-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/orders/$orderId")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/restaurant-management/orders/${params.orderId}` },
      });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Order Detail — Restaurant Management — NORU" },
      {
        name: "description",
        content: "A single restaurant order: table, items ordered, historical pricing, billing and status timeline.",
      },
      { property: "og:title", content: "Order Detail — Restaurant Management — NORU" },
      { property: "og:description", content: "Restaurant order detail with items, billing and status timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { orderId } = Route.useParams();
  return (
    <RestaurantShell active="Restaurant Management" rmModule="orders" rmDetailLabel="Order">
      {(membership) => <OrderDetailBody membership={membership} orderId={orderId} />}
    </RestaurantShell>
  );
}
