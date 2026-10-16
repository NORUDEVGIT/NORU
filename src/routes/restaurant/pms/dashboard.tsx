import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/dashboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/dashboard" },
      });
    }

    await requireRoutePackage("pms");
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    throw redirect({
      to: "/restaurant/pms/room-inventory",
      search: tab ? { tab } : {},
    });
  },
  component: function DashboardRedirect() {
    return null;
  },
});
