/**
 * Phase 8G2B — canonical Back Office purchase order detail (including goods
 * receiving). Renders the same shared body as the legacy inventory address.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { PurchaseOrderPage } from "@/components/workspaces/back-office/purchase-order-page";

export const Route = createFileRoute(
  "/restaurant/back-office/procurement/purchase-orders/$purchaseOrderId",
)({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: {
          redirect: `/restaurant/back-office/procurement/purchase-orders/${params.purchaseOrderId}`,
        },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Purchase order — Back Office Procurement — NORU" },
      { name: "description", content: "Review a purchase order, track deliveries and receive goods into stock." },
      { property: "og:title", content: "Purchase order — Back Office Procurement — NORU" },
      { property: "og:description", content: "Review a purchase order, track deliveries and receive goods into stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchaseOrderDetailRoute,
});

function PurchaseOrderDetailRoute() {
  const { purchaseOrderId } = Route.useParams();
  return (
    <RestaurantShell active="Back Office" boModule="procurement" boDetailLabel="Purchase order">
      {(m) => <PurchaseOrderPage membership={m} purchaseOrderId={purchaseOrderId} back="back-office" />}
    </RestaurantShell>
  );
}
