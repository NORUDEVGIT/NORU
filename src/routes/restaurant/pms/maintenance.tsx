import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { HousekeepingWorkspace } from "@/components/workspaces/housekeeping-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/maintenance")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/maintenance" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Maintenance & Engineering — NORU PMS" },
      { name: "description", content: "Maintenance requests and room engineering follow-up for your property." },
      { property: "og:title", content: "Maintenance & Engineering — NORU PMS" },
      { property: "og:description", content: "Maintenance requests and room engineering follow-up for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenancePmsRoute,
});

function MaintenancePmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Housekeeping" module="housekeeping" pms pmsModule="maintenance">
      {(m) => <HousekeepingWorkspace membership={m} initialTab={searchTab ?? "maintenance"} />}
    </RestaurantShell>
  );
}
