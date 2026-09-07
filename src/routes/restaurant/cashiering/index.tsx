import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { CashieringWorkspace } from "@/components/workspaces/cashiering-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/cashiering/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/cashiering" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Cashiering & Folios — NORU" },
      {
        name: "description",
        content: "Guest folios, charges, payments, refunds and cashier shifts for your NORU property.",
      },
      { property: "og:title", content: "Cashiering & Folios — NORU" },
      { property: "og:description", content: "Guest folios, payments and cashier shifts in NORU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashieringRoute,
});

function CashieringRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Cashiering">
      {(m) => <CashieringWorkspace membership={m} initialTab={searchTab ?? undefined} />}
    </RestaurantShell>
  );
}
