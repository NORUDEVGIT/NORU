import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { RatesWorkspace } from "@/packages/pms/components/workspaces/rates-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/rates-revenue")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/rates-revenue" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Rate & Revenue — NORU PMS" },
      { name: "description", content: "Daily pricing, revenue control and commercial operations for your property." },
      { property: "og:title", content: "Rate & Revenue — NORU PMS" },
      { property: "og:description", content: "Daily pricing, revenue control and commercial operations for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RatesRevenuePmsRoute,
});

function RatesRevenuePmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  // module="configuration" still selects the existing left-rail registry. User-facing
  // copy is operational; Prompt 3 owns any shell/moduleKey restructure.
  return (
    <RestaurantShell active="Rates & Revenue" module="configuration" pms pmsModule="rates-revenue">
      {(m) => <RatesWorkspace membership={m} initialTab={searchTab ?? "overview"} />}
    </RestaurantShell>
  );
}
