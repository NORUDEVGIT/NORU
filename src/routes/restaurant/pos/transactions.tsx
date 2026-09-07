/**
 * Phase 8H3 — Standalone POS route: Transactions.
 *
 * Guarded by sign-in plus the `pos` package. Server functions keep their own
 * membership / package / module / role checks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { PosFoundationPage } from "@/components/workspaces/standalone-pos/foundation-page";

export const Route = createFileRoute("/restaurant/pos/transactions")({
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
      {(m) => (
        <PosFoundationPage
          moduleKey="transactions"
          propertyName={m.restaurant.name}
          what={[
            "Every completed sale with its receipt number", "Reprint or re-send a receipt", "Issue a refund against a sale",
          ]}
        />
      )}
    </RestaurantShell>
  );
}
