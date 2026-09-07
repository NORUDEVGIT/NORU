/**
 * Phase 8H6 — Standalone POS route: one completed transaction.
 *
 * Guarded by sign-in plus the `pos` package. Reads and refunds keep their own
 * membership / package / module / role checks on the server.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { StandalonePosTransactionDetail } from "@/components/workspaces/standalone-pos/transaction-detail-page";

export const Route = createFileRoute("/restaurant/pos/transactions/$saleId")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/pos/transactions/${params.saleId}` },
      });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Sale receipt — Standalone POS — NORU" },
      { name: "description", content: "One completed sale: items as sold, payments, refunds and receipt reprint." },
      { property: "og:title", content: "Sale receipt — Standalone POS — NORU" },
      { property: "og:description", content: "One completed sale: items as sold, payments, refunds and receipt reprint." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosTransactionRoute,
});

function PosTransactionRoute() {
  const { saleId } = Route.useParams();
  return (
    <RestaurantShell active="Standalone POS" posModule="transactions">
      {(m) => <StandalonePosTransactionDetail membership={m} saleId={saleId} />}
    </RestaurantShell>
  );
}
