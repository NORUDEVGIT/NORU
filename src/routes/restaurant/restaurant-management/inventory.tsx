/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { InventoryPage } from "@/components/workspaces/restaurant/inventory-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/inventory")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/inventory" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Inventory & Stock Management — Restaurant Management — NORU" },
      { name: "description", content: "Stock items, movements and low-stock control for the restaurant." },
      { property: "og:title", content: "Inventory & Stock Management — Restaurant Management — NORU" },
      { property: "og:description", content: "Stock items, movements and low-stock control for the restaurant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Restaurant Management" rmModule="inventory">
      {(m) => <InventoryPage membership={m} initialTab={searchTab} />}
    </RestaurantShell>
  );
}
