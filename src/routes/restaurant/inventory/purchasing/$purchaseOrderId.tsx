/**
 * Legacy purchase order address kept working for bookmarks and existing links.
 * Back Office owns procurement (Phase 8G2B): the canonical address is
 * /restaurant/back-office/procurement/purchase-orders/:purchaseOrderId and both
 * render the same shared body.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { PurchaseOrderPage } from "@/components/workspaces/back-office/purchase-order-page";

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
      {(m) => <PurchaseOrderPage membership={m} purchaseOrderId={purchaseOrderId} back="inventory" />}
    </RestaurantShell>
  );
}
