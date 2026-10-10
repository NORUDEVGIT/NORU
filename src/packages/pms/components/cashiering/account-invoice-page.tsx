import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { AccountInvoiceWorkspace } from "@/packages/pms/components/cashiering/account-invoice-builder";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import { TransactionHistoryPanel } from "@/packages/pms/components/cashiering/transaction-history-panel";
import { Button } from "@/shared/components/ui/button";
import { getFinancialAccountLedger } from "@/packages/pms/lib/cashiering-transaction-history.functions";
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
  const [view, setView] = useState<"invoices" | "history">("invoices");
  const fetchLedger = useServerFn(getFinancialAccountLedger);
  const ledger = useQuery({
    queryKey: ["financial-account-ledger", restaurantId, accountId],
    queryFn: () => fetchLedger({ data: { restaurantId, accountId } }),
    enabled: view === "history",
  });
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{view === "history" ? "History" : "Invoices"}</h1>
          <p className="text-sm text-muted-foreground">
            {view === "history"
              ? "Company and group accounts use the same ledger history as a guest folio."
              : "Company and group invoices use the charges already on the financial account."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === "invoices" ? "default" : "outline"}
            onClick={() => setView("invoices")}
          >
            Invoices
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "history" ? "default" : "outline"}
            onClick={() => setView("history")}
          >
            History
          </Button>
        </div>
      </header>
      {view === "invoices" ? (
        <AccountInvoiceWorkspace
          restaurantId={restaurantId}
          accountId={accountId}
          money={money}
          dateTime={dateTime}
        />
      ) : ledger.data ? (
        <TransactionHistoryPanel
          restaurantId={restaurantId}
          ownerType="financial_account"
          ownerId={accountId}
          rows={ledger.data.rows}
          allocations={ledger.data.allocations}
          counterparts={ledger.data.counterparts}
          coverage={ledger.data.coverage}
          access={{ canManage: ledger.data.canManage, open: ledger.data.open }}
          searchExtras={[ledger.data.accountName, ledger.data.accountNumber]}
          money={money}
          dateTime={dateTime}
          onViewDocuments={() => setView("invoices")}
          onOpenFolio={(folioId) =>
            void navigate({
              to: "/restaurant/pms/cashiering/folios/$folioId",
              params: { folioId },
            })
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {ledger.isLoading ? "Loading history…" : "This account could not be loaded."}
        </p>
      )}
    </CashieringChrome>
  );
}
