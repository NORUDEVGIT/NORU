import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { ReportsWorkspace } from "@/components/workspaces/reports-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/reports" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Reports & Analytics — NORU PMS" },
      { name: "description", content: "Occupancy, ADR, RevPAR and room revenue reporting for your property." },
      { property: "og:title", content: "Reports & Analytics — NORU PMS" },
      { property: "og:description", content: "Occupancy, ADR, RevPAR and room revenue reporting for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPmsRoute,
});

function ReportsPmsRoute() {
  return (
    <RestaurantShell active="Reports" module="reports" pms pmsModule="reports">
      {(m) => <ReportsWorkspace membership={m} />}
    </RestaurantShell>
  );
}
