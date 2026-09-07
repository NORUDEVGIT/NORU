/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { TablesManager } from "@/components/workspaces/restaurant/tables-workspace";

export const Route = createFileRoute("/restaurant/tables")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/tables" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Tables & QR Codes — NORU" },
      {
        name: "description",
        content: "Create your dining tables, print their QR codes and let guests order straight from their seat.",
      },
      { property: "og:title", content: "Tables & QR Codes — NORU" },
      { property: "og:description", content: "Manage tables and printable ordering QR codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TablesPage,
});

function TablesPage() {
  return <RestaurantShell active="Tables & QR">{(m) => <TablesManager membership={m} />}</RestaurantShell>;
}
