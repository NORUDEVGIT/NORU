/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { WaiterOrder } from "@/packages/restaurant-management/components/workspaces/digital-ordering-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/digital-ordering")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/digital-ordering" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Digital Ordering — Restaurant Management — NORU" },
      { name: "description", content: "QR table ordering and waiter-assisted ordering for guests in the venue." },
      { property: "og:title", content: "Digital Ordering — Restaurant Management — NORU" },
      { property: "og:description", content: "QR table ordering and waiter-assisted ordering for guests in the venue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Restaurant Management" rmModule="digital-ordering">
      {(m) => <WaiterOrder restaurantId={m.restaurant.id} />}
    </RestaurantShell>
  );
}
