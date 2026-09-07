/**
 * Phase 8G2D — Back Office workforce directory. Reuses the shared staff
 * manager; no separate people, memberships or login identities.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BackOfficeHrStaff } from "@/components/workspaces/back-office/hr-pages";

export const Route = createFileRoute("/restaurant/back-office/hr/staff")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/hr/staff" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Workforce directory — Back Office HR — NORU" },
      { name: "description", content: "Everyone with access to this property, with their role and status." },
      { property: "og:title", content: "Workforce directory — Back Office HR — NORU" },
      { property: "og:description", content: "Everyone with access to this property, with their role and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="hr" boDetailLabel="Workforce directory">
      {(m) => <BackOfficeHrStaff membership={m} />}
    </RestaurantShell>
  );
}
