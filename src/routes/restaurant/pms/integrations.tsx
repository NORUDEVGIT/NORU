import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { PmsIntegrationsWorkspace } from "@/components/workspaces/pms-integrations-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/integrations")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/integrations" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Integrations — NORU PMS" },
      { name: "description", content: "Property settings and connected services for your property." },
      { property: "og:title", content: "Integrations — NORU PMS" },
      { property: "og:description", content: "Property settings and connected services for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrationsPmsRoute,
});

function IntegrationsPmsRoute() {
  return (
    <RestaurantShell active="Settings" module="settings" pms pmsModule="integrations">
      {(m) => <PmsIntegrationsWorkspace membership={m} />}
    </RestaurantShell>
  );
}
