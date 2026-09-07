import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { PmsAdministrationWorkspace } from "@/components/workspaces/pms-administration-workspace";
import { supabase } from "@/integrations/supabase/client";
import { SharedModuleLinks } from "@/components/pms/shared-module-links";

export const Route = createFileRoute("/restaurant/pms/administration")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/administration" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Administration — NORU PMS" },
      { name: "description", content: "Staff, roles and module access for your property." },
      { property: "og:title", content: "Administration — NORU PMS" },
      { property: "og:description", content: "Staff, roles and module access for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdministrationPmsRoute,
});

function AdministrationPmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Staff" module="staff" pms pmsModule="administration">
      {(m) => <div className="space-y-8">
          <PmsAdministrationWorkspace membership={m} />
          <SharedModuleLinks restaurantId={m.restaurantId} modules={["human_resources"]} />
        </div>}
    </RestaurantShell>
  );
}
