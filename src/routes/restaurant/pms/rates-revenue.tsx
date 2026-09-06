import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { RatesWorkspace } from "@/components/workspaces/rates-workspace";
import { supabase } from "@/integrations/supabase/client";

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
  },
  head: () => ({
    meta: [
      { title: "Rate & Revenue Management — NORU PMS" },
      { name: "description", content: "Rate plans, rate calendar and stay restrictions for your property." },
      { property: "og:title", content: "Rate & Revenue Management — NORU PMS" },
      { property: "og:description", content: "Rate plans, rate calendar and stay restrictions for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RatesRevenuePmsRoute,
});

function RatesRevenuePmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Rates & Revenue" module="configuration" pms>
      {(m) => <RatesWorkspace membership={m} initialTab={searchTab ?? "plans"} />}
    </RestaurantShell>
  );
}
