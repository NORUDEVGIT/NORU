/**
 * Phase 8H4 — Standalone POS route: Registers & Shifts.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosShifts } from "@/components/workspaces/standalone-pos/shifts-page";


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
      {(m) => <StandalonePosShifts membership={m} />}
    </RestaurantShell>
  );
}

