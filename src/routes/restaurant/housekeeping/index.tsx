import { createFileRoute, redirect } from "@tanstack/react-router";
import { mapLegacyHousekeepingTab } from "@/packages/pms/lib/housekeeping-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/housekeeping/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/housekeeping" },
      });
    }

    await requireRoutePackage("pms");
    const tab = mapLegacyHousekeepingTab((search as { tab?: string }).tab);
    throw redirect({
      to: tab === "maintenance" ? "/restaurant/pms/maintenance" : "/restaurant/pms/housekeeping",
      search: { tab },
    });
  },
  head: () => ({
    meta: [
      { title: "Housekeeping — NORU PMS" },
      { name: "description", content: "Redirecting to Housekeeping Desk." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: function HousekeepingLegacyRedirect() {
    return null;
  },
});
