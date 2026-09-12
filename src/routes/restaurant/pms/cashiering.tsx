import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { CashieringWorkspace } from "@/packages/pms/components/workspaces/cashiering-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { SharedModuleLinks } from "@/packages/pms/components/pms/shared-module-links";

export const Route = createFileRoute("/restaurant/pms/cashiering")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {}),
    ...(typeof search["folio"] === "string" ? { folio: search["folio"] as string } : {}),
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/cashiering" },
      });
    }

    await requireRoutePackage("pms");
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
  const search = Route.useSearch() as { tab?: string; folio?: string };
  return (
    <RestaurantShell active="Cashiering" module="cashiering" pms pmsModule="cashiering">
      {(m) => <div className="space-y-8">
          <CashieringWorkspace
            membership={m}
            initialTab={search.tab ?? "dashboard"}
            {...(search.folio ? { initialFolioSearch: search.folio } : {})}
          />
          <SharedModuleLinks restaurantId={m.restaurantId} modules={["accounting_finance"]} />
        </div>}
    </RestaurantShell>
  );
}
