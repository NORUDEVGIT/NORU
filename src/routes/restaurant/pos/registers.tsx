/**
 * Phase 8H4 — Standalone POS route: Registers.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosRegisters } from "@/components/workspaces/standalone-pos/registers-page";

export const Route = createFileRoute("/restaurant/pos/registers")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/registers" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Registers — Standalone POS — NORU" },
      { name: "description", content: "Tills set up for the independent point of sale in this property." },
      { property: "og:title", content: "Registers — Standalone POS — NORU" },
      { property: "og:description", content: "Tills set up for the independent point of sale in this property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosRegistersRoute,
});

function PosRegistersRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="registers">
      {(m) => <StandalonePosRegisters membership={m} />}
    </RestaurantShell>
  );
}
