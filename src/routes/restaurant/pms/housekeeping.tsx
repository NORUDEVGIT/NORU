import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { HousekeepingWorkspace } from "@/packages/pms/components/workspaces/housekeeping-workspace";
import { HK_LANDING_TAB } from "@/packages/pms/lib/housekeeping-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/housekeeping")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {}),
    ...(typeof search["room"] === "string" ? { room: search["room"] as string } : {}),
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/housekeeping" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Housekeeping — NORU PMS" },
      { name: "description", content: "Housekeeping Desk — board, cleaning, inspections and maintenance." },
      { property: "og:title", content: "Housekeeping — NORU PMS" },
      { property: "og:description", content: "Housekeeping Desk — board, cleaning, inspections and maintenance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HousekeepingPmsRoute,
});

function HousekeepingPmsRoute() {
  const search = Route.useSearch() as { tab?: string; room?: string };
  return (
    <RestaurantShell
      active="Housekeeping"
      module="housekeeping"
      pms
      pmsModule="housekeeping"
      hidePackageRail
      hideTopHeader
    >
      {(m) => (
        <HousekeepingWorkspace
          membership={m}
          initialTab={search.tab ?? HK_LANDING_TAB}
          initialRoomId={search.room}
        />
      )}
    </RestaurantShell>
  );
}
