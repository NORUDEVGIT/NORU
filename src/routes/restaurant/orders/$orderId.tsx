/**
 * Legacy Restaurant Management order-detail address. Kept working for
 * bookmarks; the screen itself is the shared workspace component (Phase 8F3).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { OrderDetailBody } from "@/components/workspaces/restaurant/order-detail-workspace";

export const Route = createFileRoute("/restaurant/orders/$orderId")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Order Detail — NORU" },
      {
        name: "description",
        content: "Review a single restaurant order: table, items ordered, historical pricing and status timeline.",
      },
      { property: "og:title", content: "Order Detail — NORU" },
      { property: "og:description", content: "Restaurant order detail with items and status timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { orderId } = Route.useParams();
  return (
    <RestaurantShell active="Orders">
      {(membership) => <OrderDetailBody membership={membership} orderId={orderId} />}
    </RestaurantShell>
  );
}
