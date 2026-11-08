/**
 * Shared Inventory / Procurement workspace.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireOperationalRestaurantRoute } from "@/core/lib/route-package-guard";
import { InventoryPage } from "@/components/inventory/inventory-page";

export const Route = createFileRoute("/restaurant/inventory/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search['tab'] === "string" ? { tab: search['tab'] as string } : {},

  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/inventory" } });
    }
    await requireOperationalRestaurantRoute();
  },
  head: () => ({
    meta: [
      { title: "Inventory — NORU" },
      {
        name: "description",
        content: "Track ingredients and consumables, receive stock, record usage and waste, and watch low-stock levels.",
      },
      { property: "og:title", content: "Inventory — NORU" },
      { property: "og:description", content: "Stock control for ingredients and consumables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryRoute,
});

function InventoryRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  const procurement = searchTab === "suppliers" || searchTab === "purchasing";
  return (
    <RestaurantShell active="Inventory" module={procurement ? "procurement" : "stock"}>
      {(m) => <InventoryPage membership={m} initialTab={searchTab} />}
    </RestaurantShell>
  );
}
