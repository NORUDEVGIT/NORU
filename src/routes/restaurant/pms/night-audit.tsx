import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { PmsRouteGate } from "@/packages/pms/components/pms/pms-route-gate";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { NightAuditWorkspace } from "@/packages/pms/components/workspaces/night-audit-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/night-audit")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] } : {}),
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
    ...(typeof search["step"] === "string" ? { step: search["step"] } : {}),
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/night-audit" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "End of Day — NORU PMS" },
      {
        name: "description",
        content: "End of Day checks and business date close for your property.",
      },
      { property: "og:title", content: "End of Day — NORU PMS" },
      {
        property: "og:description",
        content: "End of Day checks and business date close for your property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NightAuditPmsRoute,
});

function NightAuditPmsRoute() {
  const search = Route.useSearch() as { tab?: string; run?: string; step?: string };
  return (
    <RestaurantShell
      active="Night Audit"
      module="cashiering"
      pms
      pmsModule="night-audit"
      hidePackageRail
      hideTopHeader
    >
      {(m) => (
        <PmsRouteGate restaurantId={m.restaurantId} allow={PMS_PERMISSIONS.NIGHT_AUDIT_VIEW}>
          <NightAuditWorkspace
            membership={m}
            initialTab={search.tab}
            {...(search.run ? { initialRunId: search.run } : {})}
            {...(search.step ? { initialStep: search.step } : {})}
          />
        </PmsRouteGate>
      )}
    </RestaurantShell>
  );
}
