/**
 * Phase 8G2D — Back Office shift administration over the one shared schedule.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { BackOfficeHrShifts } from "@/components/workspaces/back-office/hr-pages";

export const Route = createFileRoute("/restaurant/back-office/hr/shifts")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/hr/shifts" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Shifts — Back Office HR — NORU" },
      { name: "description", content: "The property's single staff schedule, shared by every package." },
      { property: "og:title", content: "Shifts — Back Office HR — NORU" },
      { property: "og:description", content: "The property's single staff schedule, shared by every package." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="hr" boDetailLabel="Shifts">
      {(m) => <BackOfficeHrShifts membership={m} />}
    </RestaurantShell>
  );
}
