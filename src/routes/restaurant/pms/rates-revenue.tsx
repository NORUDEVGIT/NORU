import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { RatesWorkspace } from "@/packages/pms/components/workspaces/rates-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import type { RevenueSearchParams } from "@/packages/pms/lib/revenue/revenue-context";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute("/restaurant/pms/rates-revenue")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): RevenueSearchParams => ({
    ...(optionalString(search["view"]) ? { view: optionalString(search["view"]) } : {}),
    ...(optionalString(search["tab"]) ? { tab: optionalString(search["tab"]) } : {}),
    ...(optionalString(search["from"]) ? { from: optionalString(search["from"]) } : {}),
    ...(optionalString(search["to"]) ? { to: optionalString(search["to"]) } : {}),
    ...(optionalString(search["roomType"]) ? { roomType: optionalString(search["roomType"]) } : {}),
    ...(optionalString(search["ratePlan"]) ? { ratePlan: optionalString(search["ratePlan"]) } : {}),
    ...(optionalString(search["segment"]) ? { segment: optionalString(search["segment"]) } : {}),
    ...(optionalString(search["source"]) ? { source: optionalString(search["source"]) } : {}),
    ...(optionalString(search["channel"]) ? { channel: optionalString(search["channel"]) } : {}),
  }),
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
  const search = Route.useSearch();
  return (
    <RestaurantShell
      active="Rates & Revenue"
      module="configuration"
      pms
      pmsModule="rates-revenue"
      hidePackageRail
      hideTopHeader
    >
      {(m) => <RatesWorkspace membership={m} search={search} />}
    </RestaurantShell>
  );
}
