/**
 * Phase 8H6 — Standalone POS route: Transactions.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StandalonePosTransactions } from "@/packages/standalone-pos/components/transactions-page";

export const Route = createFileRoute("/restaurant/pos/transactions/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/transactions" } });
    }
    await requireRoutePackage("pos");
  },
  head: () => ({
    meta: [
      { title: "Transactions — Standalone POS — NORU" },
      { name: "description", content: "Completed sales, refunds and receipts for the independent point of sale." },
      { property: "og:title", content: "Transactions — Standalone POS — NORU" },
      { property: "og:description", content: "Completed sales, refunds and receipts for the independent point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PosTransactionsRoute,
});

function PosTransactionsRoute() {
  return (
    <RestaurantShell active="Standalone POS" posModule="transactions">
      {(m) => <StandalonePosTransactions membership={m} />}
    </RestaurantShell>
  );
}
