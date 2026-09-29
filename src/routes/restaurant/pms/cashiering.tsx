import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { CashieringWorkspace } from "@/packages/pms/components/workspaces/cashiering-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

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
      {
        name: "description",
        content: "Manage guest folios, recorded payments and settlement activity.",
      },
      { property: "og:title", content: "Cashiering — NORU PMS" },
      {
        property: "og:description",
        content: "Manage guest folios, recorded payments and settlement activity.",
      },
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
    <RestaurantShell
      active="Cashiering"
      module="cashiering"
      pms
      pmsModule="cashiering"
      hidePackageRail
      hideTopHeader
    >
      {(m) => (
        <CashieringWorkspace
          membership={m}
          initialTab={search.tab}
          {...(search.folio ? { initialFolioSearch: search.folio } : {})}
        />
      )}
    </RestaurantShell>
  );
}
