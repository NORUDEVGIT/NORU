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
  type CashieringSearchParams,
  type CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";

export function CashieringWorkspace({
  membership,
  search,
}: {
  membership: RestaurantMembership;
  search: CashieringSearchParams;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const tab = resolveCashieringTab(search.tab);
  const [moduleSearch, setModuleSearch] = useState(search.q ?? "");

  useEffect(() => {
    if (search.tab === tab || (!search.tab && tab === "overview")) return;
    const { tab: _tab, folio, ...rest } = search;
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: cashieringTabSearch(tab, folio, rest),
      replace: true,
    });
  }, [navigate, search, tab]);

  const fetchAccess = useServerFn(getCashieringAccess);
  const accessQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  function go(next: CashieringTabId, folio?: string | null, extra?: Partial<CashieringSearchParams>) {
    const { tab: _tab, folio: _currentFolio, ...rest } = search;
    const nextFolio = folio === null ? null : folio !== undefined ? folio : null;
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: cashieringTabSearch(next, nextFolio, { ...rest, ...extra }),
    });
  }

  function setSearchParams(next: CashieringSearchParams) {
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: next,
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
      onNavigate={(id) => go(id, null)}
      onSearch={(value) => {
        setModuleSearch(value);
        go("folios", null, { q: value, tab: "folios" });
      }}
      onPostPayment={() => go("payments", null)}
    >
      <CashieringDesk
        restaurantId={restaurantId}
        timezone={membership.restaurant.timezone}
        tab={tab}
        searchParams={search}
        onSearchParams={setSearchParams}
        folioQuery={search.folio ?? ""}
        moduleSearch={moduleSearch}
        canOperate={accessQuery.data.canOperate}
        canManage={accessQuery.data.canManage}
        onTab={go}
      />
    </CashieringChrome>
  );
}
