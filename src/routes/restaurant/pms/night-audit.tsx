import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { NightAuditWorkspace } from "@/packages/pms/components/workspaces/night-audit-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/night-audit")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...(typeof search.run === "string" ? { run: search.run } : {}),
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
      { title: "Night Audit — NORU PMS" },
      { name: "description", content: "Business date close, audit runs and exceptions for your property." },
      { property: "og:title", content: "Night Audit — NORU PMS" },
      { property: "og:description", content: "Business date close, audit runs and exceptions for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NightAuditPmsRoute,
});

function NightAuditPmsRoute() {
  const search = Route.useSearch() as { tab?: string; run?: string };
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
        <NightAuditWorkspace
          membership={m}
          initialTab={search.tab}
          {...(search.run ? { initialRunId: search.run } : {})}
        />
      )}
    </RestaurantShell>
  );
}
