/**
 * Shared purchase order detail. Canonical procurement address under Inventory.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { PurchaseOrderPage } from "@/components/inventory/purchase-order-page";

export const Route = createFileRoute("/restaurant/inventory/purchasing/$purchaseOrderId")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/inventory/purchasing/${params.purchaseOrderId}` },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Purchase order — NORU" },
      { name: "description", content: "Review a purchase order, track deliveries and receive goods into stock." },
      { property: "og:title", content: "Purchase order — NORU" },
      { property: "og:description", content: "Purchase order detail and goods receiving." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchaseOrderRoute,
});

function PurchaseOrderRoute() {
  const { purchaseOrderId } = Route.useParams();
  return (
    <RestaurantShell active="Inventory" module="procurement">
      {(m) => <PurchaseOrderPage membership={m} purchaseOrderId={purchaseOrderId} />}
    </RestaurantShell>
  );
}
