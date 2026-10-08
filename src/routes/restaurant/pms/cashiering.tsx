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
    ...(typeof search["account"] === "string" ? { account: search["account"] as string } : {}),
    ...(typeof search["q"] === "string" ? { q: search["q"] as string } : {}),
    ...(typeof search["page"] === "number"
      ? { page: search["page"] as number }
      : typeof search["page"] === "string" && /^\d+$/.test(search["page"])
        ? { page: Number(search["page"]) }
        : {}),
    ...(typeof search["pageSize"] === "number"
      ? { pageSize: search["pageSize"] as number }
      : typeof search["pageSize"] === "string" && /^\d+$/.test(search["pageSize"])
        ? { pageSize: Number(search["pageSize"]) }
        : {}),
    ...(typeof search["folioStatus"] === "string"
      ? { folioStatus: search["folioStatus"] as string }
      : {}),
    ...(typeof search["stayStatus"] === "string" ? { stayStatus: search["stayStatus"] as string } : {}),
    ...(typeof search["stayFrom"] === "string" ? { stayFrom: search["stayFrom"] as string } : {}),
    ...(typeof search["stayTo"] === "string" ? { stayTo: search["stayTo"] as string } : {}),
    ...(typeof search["paymentState"] === "string"
      ? { paymentState: search["paymentState"] as string }
      : {}),
    ...(typeof search["sort"] === "string" ? { sort: search["sort"] as string } : {}),
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
  const search = Route.useSearch();
  return (
    <RestaurantShell
      active="Cashiering"
      module="cashiering"
      pms
      pmsModule="cashiering"
      hidePackageRail
      hideTopHeader
    >
      {(m) => <CashieringWorkspace membership={m} search={search} />}
    </RestaurantShell>
  );
}
