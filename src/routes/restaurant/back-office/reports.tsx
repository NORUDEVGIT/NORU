/**
 * Phase 8G2A — canonical Back Office Reports & Intelligence route.
 * Read-only cross-package reporting landing page; package reports stay put.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BackOfficeReportsPage } from "@/components/workspaces/back-office/reports-page";


export const Route = createFileRoute("/restaurant/back-office/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/reports" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Reports & Intelligence — Back Office — NORU" },
      { name: "description", content: "Back Office Reports: cross-package property intelligence." },
      { property: "og:title", content: "Reports & Intelligence — Back Office — NORU" },
      { property: "og:description", content: "Back Office Reports: cross-package property intelligence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeModuleRoute,
});

function BackOfficeModuleRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="reports">
      {(m) => <BackOfficeReportsPage membership={m} />}
    </RestaurantShell>
  );
}
