/**
 * Phase 8H3 — Standalone POS route: Registers & Shifts.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { PosFoundationPage } from "@/components/workspaces/standalone-pos/foundation-page";

export const Route = createFileRoute("/restaurant/pos/shifts")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/shifts" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Registers & Shifts — Standalone POS — NORU" },
      { name: "description", content: "Tills and cashier shifts for the independent point of sale." },
      { property: "og:title", content: "Registers & Shifts — Standalone POS — NORU" },
      { property: "og:description", content: "Tills and cashier shifts for the independent point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosShiftsRoute,
});

function PosShiftsRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="shifts">
      {(m) => (
        <PosFoundationPage
          moduleKey="shifts"
          propertyName={m.restaurant.name}
          what={[
            "Add and name the tills in this property", "Open a shift with a starting cash amount", "Close a shift and count the drawer",
          ]}
        />
      )}
    </RestaurantShell>
  );
}
