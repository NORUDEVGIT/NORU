/**
 * Phase 8G2D — canonical Back Office Human Resources home.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BackOfficeHrHome } from "@/components/workspaces/back-office/hr-pages";

export const Route = createFileRoute("/restaurant/back-office/hr/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/hr" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Human Resources — Back Office — NORU" },
      { name: "description", content: "Workforce administration for the property: directory, shifts and attendance." },
      { property: "og:title", content: "Human Resources — Back Office — NORU" },
      { property: "og:description", content: "Workforce administration for the property: directory, shifts and attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="hr">
      {(m) => <BackOfficeHrHome restaurantId={m.restaurantId} />}
    </RestaurantShell>
  );
}
