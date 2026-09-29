import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import { CashieringDesk } from "@/packages/pms/components/cashiering/cashiering-desk";
import { getCashieringAccess } from "@/packages/pms/lib/cashiering.functions";
import {
  cashieringTabSearch,
  resolveCashieringTab,
  type CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";

export function CashieringWorkspace({
  membership,
  initialTab,
  initialFolioSearch,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialFolioSearch?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const tab = resolveCashieringTab(initialTab);
  const [moduleSearch, setModuleSearch] = useState("");

  useEffect(() => {
    if (initialTab === tab) return;
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: cashieringTabSearch(tab, initialFolioSearch),
      replace: true,
    });
  }, [initialFolioSearch, initialTab, navigate, tab]);

  const fetchAccess = useServerFn(getCashieringAccess);
  const accessQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  function go(next: CashieringTabId, folio?: string | null) {
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: cashieringTabSearch(next, folio ?? initialFolioSearch),
    });
  }

  if (accessQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading cashiering…</p>;
  }
  if (!accessQuery.data) {
    return (
      <div className="m-4 rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Cashiering Desk</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Accounting &amp; Finance for this property.
        </p>
      </div>
    );
  }

  return (
    <CashieringChrome
      membership={membership}
      active={tab}
      onNavigate={(id) => go(id)}
      onSearch={(value) => {
        setModuleSearch(value);
        if (tab !== "overview" && tab !== "folios") go("folios");
      }}
      onPostPayment={() => go("payments")}
    >
      <CashieringDesk
        restaurantId={restaurantId}
        timezone={membership.restaurant.timezone}
        tab={tab}
        folioQuery={initialFolioSearch ?? ""}
        moduleSearch={moduleSearch}
        canOperate={accessQuery.data.canOperate}
        canManage={accessQuery.data.canManage}
        onTab={go}
      />
    </CashieringChrome>
  );
}
