import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { FrontOfficeWorkspace } from "@/packages/pms/components/workspaces/front-office-workspace";
import { foSearchFromUnknown } from "@/packages/pms/lib/front-office-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/front-office")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => foSearchFromUnknown(search),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/front-office" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Front Office — NORU PMS" },
      { name: "description", content: "Room Rack + Calendar and Front Office operations for today at your property." },
      { property: "og:title", content: "Front Office — NORU PMS" },
      { property: "og:description", content: "Room Rack + Calendar and Front Office operations for today at your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FrontOfficePmsRoute,
});

function FrontOfficePmsRoute() {
  const search = Route.useSearch();
  return (
    <RestaurantShell
      active="Arrivals"
      module="rooms"
      pms
      pmsModule="front-office"
      hidePackageRail
      hideTopHeader
    >
      {(m) => <FrontOfficeWorkspace membership={m} search={search} />}
    </RestaurantShell>
  );
}
