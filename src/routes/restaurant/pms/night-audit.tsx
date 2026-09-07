import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { NightAuditWorkspace } from "@/components/workspaces/night-audit-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { SharedModuleLinks } from "@/components/pms/shared-module-links";

export const Route = createFileRoute("/restaurant/pms/night-audit")({
  ssr: false,
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
  return (
    <RestaurantShell active="Night Audit" module="cashiering" pms pmsModule="night-audit">
      {(m) => <div className="space-y-8">
          <NightAuditWorkspace membership={m} />
          <SharedModuleLinks restaurantId={m.restaurantId} modules={["accounting_finance"]} />
        </div>}
    </RestaurantShell>
  );
}
