import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { AccountInvoicePage } from "@/packages/pms/components/cashiering/account-invoice-page";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/cashiering/accounts/$accountId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...(typeof search.action === "string" ? { action: search.action } : {}),
    ...(typeof search.invoice === "string" ? { invoice: search.invoice } : {}),
    ...(typeof search.payment === "string" ? { payment: search.payment } : {}),
    ...(typeof search.modalTab === "string" ? { modalTab: search.modalTab } : {}),
    ...(typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {}),
    ...(typeof search.returnToLabel === "string" ? { returnToLabel: search.returnToLabel } : {}),
  }),
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
      { title: "Financial Account — NORU PMS" },
      {
        name: "description",
        content: "Company and group financial account workspace.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountInvoiceRoute,
});

function AccountInvoiceRoute() {
  const { accountId } = Route.useParams();
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
      {(membership) => (
        <AccountInvoicePage
          membership={membership}
          accountId={accountId}
          initialTab={search.tab}
          initialAction={search.action}
          invoiceId={search.invoice}
          paymentId={search.payment}
          modalTab={search.modalTab}
          returnTo={search.returnTo}
          returnToLabel={search.returnToLabel}
        />
      )}
    </RestaurantShell>
  );
}
