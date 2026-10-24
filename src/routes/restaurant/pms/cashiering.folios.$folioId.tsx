import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { GuestFolioPage } from "@/packages/pms/components/cashiering/guest-folio-page";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/cashiering/folios/$folioId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.action === "string" ? { action: search.action } : {}),
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...(typeof search.payment === "string" ? { payment: search.payment } : {}),
    ...(typeof search.invoice === "string" ? { invoice: search.invoice } : {}),
    ...(typeof search.modalTab === "string" ? { modalTab: search.modalTab } : {}),
    ...(typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {}),
    ...(typeof search.returnToLabel === "string" ? { returnToLabel: search.returnToLabel } : {}),
  }),
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/pms/cashiering/folios/${params.folioId}` },
      });
    }
    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Guest Folio — NORU PMS" },
      {
        name: "description",
        content: "Guest folio workspace: charges, payments, deposits, invoices and settlement.",
      },
      { property: "og:title", content: "Guest Folio — NORU PMS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestFolioRoute,
});

function GuestFolioRoute() {
  const { folioId } = Route.useParams();
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
        <GuestFolioPage
          membership={membership}
          folioId={folioId}
          initialAction={search.action}
          initialTab={search.tab}
          initialPaymentId={search.payment}
          initialInvoiceId={search.invoice}
          initialModalTab={search.modalTab}
          returnTo={search.returnTo}
          returnToLabel={search.returnToLabel}
        />
      )}
    </RestaurantShell>
  );
}
