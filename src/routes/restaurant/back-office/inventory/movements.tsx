/**
 * Phase 8G2C — property-wide stock movement history. Reads the single
 * authoritative ledger; nothing is copied or recalculated here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { BackOfficeInventoryMovements } from "@/components/workspaces/back-office/inventory-pages";

export const Route = createFileRoute("/restaurant/back-office/inventory/movements")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/inventory/movements" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Movement history — Back Office Inventory — NORU" },
      { name: "description", content: "The property stock ledger: receipts, usage, waste, loss and corrections." },
      { property: "og:title", content: "Movement history — Back Office Inventory — NORU" },
      { property: "og:description", content: "The property stock ledger: receipts, usage, waste, loss and corrections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="inventory" boDetailLabel="Movement history">
      {(m) => <BackOfficeInventoryMovements restaurantId={m.restaurant.id} />}
    </RestaurantShell>
  );
}
