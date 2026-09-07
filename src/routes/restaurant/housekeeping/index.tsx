import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { HousekeepingWorkspace } from "@/components/workspaces/housekeeping-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/housekeeping/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/housekeeping" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Housekeeping — NORU" },
      {
        name: "description",
        content:
          "Room rack, cleaning board, inspections, room restrictions, discrepancies and maintenance for your property.",
      },
      { property: "og:title", content: "Housekeeping — NORU" },
      { property: "og:description", content: "Daily housekeeping operations for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HousekeepingRoute,
});

function HousekeepingRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Housekeeping">
      {(m) => <HousekeepingWorkspace membership={m} initialTab={searchTab ?? undefined} />}
    </RestaurantShell>
  );
}
