import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { CashieringWorkspace } from "@/components/workspaces/cashiering-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/cashiering")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/cashiering" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Cashiering — NORU PMS" },
      { name: "description", content: "Guest folios, charges, payments and cashier shifts for your property." },
      { property: "og:title", content: "Cashiering — NORU PMS" },
      { property: "og:description", content: "Guest folios, charges, payments and cashier shifts for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashieringPmsRoute,
});

function CashieringPmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Cashiering" module="cashiering" pms pmsModule="cashiering">
      {(m) => <CashieringWorkspace membership={m} initialTab={searchTab ?? "dashboard"} />}
    </RestaurantShell>
  );
}
