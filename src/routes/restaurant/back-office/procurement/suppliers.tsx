/**
 * Phase 8G2B — canonical Back Office supplier register. Reuses the existing
 * suppliers workspace component and its server functions unchanged.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { SuppliersTab } from "@/components/inventory/suppliers-tab";

export const Route = createFileRoute("/restaurant/back-office/procurement/suppliers")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/procurement/suppliers" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Suppliers — Back Office Procurement — NORU" },
      { name: "description", content: "The property supplier register: contacts, tax details and purchase history." },
      { property: "og:title", content: "Suppliers — Back Office Procurement — NORU" },
      { property: "og:description", content: "The property supplier register: contacts, tax details and purchase history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuppliersRoute,
});

function SuppliersRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="procurement" boDetailLabel="Suppliers">
      {(m) => (
        <div className="space-y-5">
          <header className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Back Office · Procurement
            </p>
            <h1 className="font-display text-2xl">Suppliers</h1>
          </header>
          <SuppliersTab restaurantId={m.restaurant.id} />
        </div>
      )}
    </RestaurantShell>
  );
}
