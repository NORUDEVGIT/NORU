import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { RoomsWorkspace } from "@/packages/pms/components/workspaces/rooms-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/dashboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/dashboard" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "PMS Dashboard — NORU PMS" },
      { name: "description", content: "Live occupancy, arrivals, departures and in-house snapshot for your property." },
      { property: "og:title", content: "PMS Dashboard — NORU PMS" },
      { property: "og:description", content: "Live occupancy, arrivals, departures and in-house snapshot for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPmsRoute,
});

function DashboardPmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Rooms" module="rooms" pms pmsModule="dashboard">
      {(m) => <RoomsWorkspace membership={m} initialTab={searchTab ?? "dashboard"} />}
    </RestaurantShell>
  );
}
