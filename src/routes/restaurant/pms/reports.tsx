import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { PmsReportsWorkspace } from "@/packages/pms/components/workspaces/pms-reports-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { SharedModuleLinks } from "@/packages/pms/components/pms/shared-module-links";
import { parseReportsRouteSearch } from "@/packages/pms/lib/reports-shell";

export const Route = createFileRoute("/restaurant/pms/reports")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => parseReportsRouteSearch(search),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/reports" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Reports & Analytics — NORU PMS" },
      {
        name: "description",
        content: "Occupancy, ADR, RevPAR and room revenue reporting for your property.",
      },
      { property: "og:title", content: "Reports & Analytics — NORU PMS" },
      {
        property: "og:description",
        content: "Occupancy, ADR, RevPAR and room revenue reporting for your property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPmsRoute,
});

function ReportsPmsRoute() {
  const search = Route.useSearch();
  return (
    <RestaurantShell
      active="Reports"
      module="reports"
      pms
      pmsModule="reports"
      hidePackageRail
      hideTopHeader
    >
      {(m) => (
        <div className="space-y-8">
          <PmsReportsWorkspace membership={m} search={search} />
          <div className="print:hidden">
            <SharedModuleLinks restaurantId={m.restaurantId} modules={["reports_analytics"]} />
          </div>
        </div>
      )}
    </RestaurantShell>
  );
}
