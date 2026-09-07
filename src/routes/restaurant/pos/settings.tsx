/**
 * Phase 8H3 — Standalone POS route: Settings.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { StandalonePosSettings } from "@/components/workspaces/standalone-pos/settings-page";

export const Route = createFileRoute("/restaurant/pos/settings")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/settings" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Settings — Standalone POS — NORU" },
      { name: "description", content: "Tax behaviour, currency and receipt numbering for the independent point of sale." },
      { property: "og:title", content: "Settings — Standalone POS — NORU" },
      { property: "og:description", content: "Tax behaviour, currency and receipt numbering for the independent point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosSettingsRoute,
});

function PosSettingsRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="settings">
      {(m) => <StandalonePosSettings membership={m} />}
    </RestaurantShell>
  );
}
