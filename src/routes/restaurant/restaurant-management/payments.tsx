/**
 * Phase 8F2 — canonical Restaurant Management route. Full-screen operating
 * surface: it renders the same shared workspace as the legacy address.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { RmContextBar } from "@/components/rm-context-bar";
import { RestaurantPaymentsFoundation } from "@/components/workspaces/restaurant/payments-foundation";

export const Route = createFileRoute("/restaurant/restaurant-management/payments")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/payments" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Payments & Cashiering — Restaurant Management — NORU" },
      { name: "description", content: "Restaurant payments, cashier settlement and till reconciliation. Hotel folios stay in PMS Cashiering." },
      { property: "og:title", content: "Payments & Cashiering — Restaurant Management — NORU" },
      { property: "og:description", content: "Restaurant payments, cashier settlement and till reconciliation. Hotel folios stay in PMS Cashiering." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-dvh">
      <RmContextBar moduleKey="payments-cashiering" note="Restaurant payments, cashier shifts and till reconciliation. Hotel folios stay in PMS Cashiering." />
      <RestaurantPaymentsFoundation />
    </div>
  );
}
