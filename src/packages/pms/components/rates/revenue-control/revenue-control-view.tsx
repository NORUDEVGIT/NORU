import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { getRevenueControlWorkspace } from "@/packages/pms/lib/revenue/revenue-control.functions";
import {
  REVENUE_CONTROL_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { useMoney } from "@/core/state/property-format";
import { RateInventoryControl } from "./rate-inventory-control";
import { RecentRateActivity } from "./recent-rate-activity";
import { RestrictionAttention } from "./restriction-attention";
import { RevenueAttention } from "./revenue-attention";
import { RevenueControlKpis } from "./revenue-control-kpis";
import { RevenueControlRoomTypes } from "./revenue-control-room-types";
import { RevenueControlTrend } from "./revenue-control-trend";

type InsightTab = "focus" | "room-types" | "restrictions" | "activity";

function RevenueControlSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {/* Primary KPI skeleton */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl border border-[#DDD4C5] bg-white"
          />
        ))}
      </div>
      {/* Secondary KPI skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl border border-[#DDD4C5] bg-white"
          />
        ))}
      </div>
      {/* Snapshot strip skeleton */}
      <div className="h-10 animate-pulse rounded-lg border border-[#F4E9D0] bg-[#FDF9F0]" />
      {/* Trend + Insights skeleton */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="h-72 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
        <div className="h-72 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      </div>
      {/* Main Table skeleton */}
      <div className="h-72 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
    </div>
  );
}

export function RevenueControlView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
}) {
  const money = useMoney();
  const [insightTab, setInsightTab] = useState<InsightTab>("focus");
  const fetchWorkspace = useServerFn(getRevenueControlWorkspace);
  const query = useQuery({
    queryKey: [
      "revenue-control",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
      context.marketSegmentId,
      context.commercialSourceId,
      context.salesChannelId,
    ],
    queryFn: () =>
      fetchWorkspace({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
          marketSegmentId: context.marketSegmentId,
          commercialSourceId: context.commercialSourceId,
          salesChannelId: context.salesChannelId,
        },
      }),
    retry: false,
  });

  const alertCount = query.data?.alerts.length ?? 0;
  const roomTypeCount = Math.min(query.data?.roomTypes.length ?? 0, 5);
  const restrictionCount = query.data?.restrictionAttention.length ?? 0;
  const activityCount = Math.min(query.data?.recentActivity.rows?.length ?? 0, 4);

  const tabs: Array<{ id: InsightTab; label: string; count: number; alert?: boolean }> = [
    { id: "focus", label: "Today’s Focus", count: alertCount, alert: alertCount > 0 },
    { id: "room-types", label: "Top Rooms", count: roomTypeCount },
    {
      id: "restrictions",
      label: "Restrictions",
      count: restrictionCount,
      alert: restrictionCount > 0,
    },
    { id: "activity", label: "Rate Activity", count: activityCount },
  ];

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <RevenueControlSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={REVENUE_CONTROL_LOAD_ERROR}
          description={revenueUiError(query.error, REVENUE_CONTROL_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          {/* Primary operational action accessible reference */}
          <span className="sr-only">Open Rate Calendar</span>

          {/* Layers 4, 5, 6: Primary KPIs, Secondary KPIs, Snapshot Banner */}
          <RevenueControlKpis data={query.data} money={money} />

          {/* Layer 7: Trend Chart + Unified Operational Insights Card */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <RevenueControlTrend nightly={query.data.nightly} money={money} />

            <section className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div
                className="grid w-full grid-cols-2 gap-1.5 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-1 sm:grid-cols-4"
                role="tablist"
                aria-label="Operational Insights"
              >
                {tabs.map((tab) => {
                  const active = insightTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setInsightTab(tab.id)}
                      className={`inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors ${
                        active
                          ? "bg-white text-[#251605] shadow-sm"
                          : "text-[#756A5B] hover:text-[#251605]"
                      }`}
                    >
                      <span className="truncate">{tab.label}</span>
                      {tab.count > 0 ? (
                        <span
                          className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
                            tab.alert
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[#EFECE6] text-[#5A4833]"
                          }`}
                        >
                          {tab.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {insightTab === "focus" ? (
                <RevenueAttention alerts={query.data.alerts} embedded />
              ) : insightTab === "room-types" ? (
                <RevenueControlRoomTypes rows={query.data.roomTypes} money={money} embedded />
              ) : insightTab === "restrictions" ? (
                <RestrictionAttention
                  rows={query.data.restrictionAttention}
                  error={query.data.restrictionsError}
                  context={context}
                  embedded
                />
              ) : (
                <RecentRateActivity
                  activity={query.data.recentActivity}
                  error={query.data.historyError}
                  context={context}
                  embedded
                />
              )}
            </section>
          </div>

          {/* Layer 8: Rate & Inventory Control Main Table (Paginated) */}
          <RateInventoryControl rows={query.data.controlRows} context={context} money={money} />
        </>
      ) : null}
    </div>
  );
}
