import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { AccountInvoicePage } from "@/packages/pms/components/cashiering/account-invoice-page";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/cashiering/accounts/$accountId")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/pms/cashiering/accounts/${params.accountId}` },
      });
    }
    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Account Invoices — NORU PMS" },
      {
        name: "description",
        content: "Company and group financial account invoices.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountInvoiceRoute,
});

function AccountInvoiceRoute() {
  const { accountId } = Route.useParams();
  return (
    <RestaurantShell
      active="Cashiering"
      module="cashiering"
      pms
      pmsModule="cashiering"
      hidePackageRail
      hideTopHeader
    >
      {(membership) => <AccountInvoicePage membership={membership} accountId={accountId} />}
    </RestaurantShell>
  );
}
