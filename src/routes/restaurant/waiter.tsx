/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { WaiterOrder } from "@/components/workspaces/restaurant/digital-ordering-workspace";

export const Route = createFileRoute("/restaurant/waiter")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/waiter" } });
    }
    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Take an Order | NORU Restaurant Portal" },
      {
        name: "description",
        content:
          "Waiter-assisted ordering for your assigned tables: pick items, add notes and send straight to the kitchen.",
      },
      { property: "og:title", content: "Take an Order | Restaurant Portal" },
      {
        property: "og:description",
        content: "Place an order for a guest at one of your assigned tables in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WaiterOrderPage,
});

function WaiterOrderPage() {
  return (
    <RestaurantShell active="Take Order">
      {(membership) => <WaiterOrder restaurantId={membership.restaurant.id} />}
    </RestaurantShell>
  );
}
