import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { ReportsWorkspace } from "@/core/components/workspaces/reports-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireOperationalRestaurantRoute } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/reports" } });
    }
    await requireOperationalRestaurantRoute();
  },
  head: () => ({
    meta: [
      { title: "Reports & Analytics — NORU" },
      {
        name: "description",
        content:
          "Property performance in NORU: occupancy, ADR, RevPAR and room revenue, plus shortcuts to your operational reports.",
      },
      { property: "og:title", content: "Reports & Analytics — NORU" },
      { property: "og:description", content: "Occupancy, ADR, RevPAR and room revenue for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsRoute,
});

function ReportsRoute() {
  return (
    <RestaurantShell active="Reports">
      {(m) => <ReportsWorkspace membership={m} />}
    </RestaurantShell>
  );
}
