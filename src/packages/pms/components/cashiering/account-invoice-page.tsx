import { useNavigate } from "@tanstack/react-router";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { AccountInvoiceWorkspace } from "@/packages/pms/components/cashiering/account-invoice-builder";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import { cashieringTabSearch, type CashieringTabId } from "@/packages/pms/lib/cashiering-shell";

export function AccountInvoicePage({
  membership,
  accountId,
}: {
  membership: RestaurantMembership;
  accountId: string;
}) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const navigate = useNavigate();
  function go(tab: CashieringTabId) {
    void navigate({ to: "/restaurant/pms/cashiering", search: cashieringTabSearch(tab) });
  }
  return (
    <CashieringChrome
      membership={membership}
      active="folios"
      onNavigate={go}
      onSearch={() => go("folios")}
      onPostPayment={() => go("payments")}
    >
      <header>
        <h1 className="font-display text-2xl">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Company and group invoices use the charges already on the financial account.
        </p>
      </header>
      <AccountInvoiceWorkspace
        restaurantId={restaurantId}
        accountId={accountId}
        money={money}
        dateTime={dateTime}
      />
    </CashieringChrome>
  );
}
