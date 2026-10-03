import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  CalendarClock,
  CircleDollarSign,
  Clock,
  History,
  Info,
  MoreHorizontal,
  Package,
  Percent,
  Sparkles,
  Tag,
  X,
} from "lucide-react";

import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { CommercialActivationWorkflow } from "../commercial-activation/commercial-activation-workflow";
import { getCommercialOperationDetail } from "@/packages/pms/lib/revenue/commercial-history.functions";
import {
  commercialHistoryActionLabel,
  commercialHistoryActorLabel,
} from "@/packages/pms/lib/revenue/commercial-history";
import { getCommercialOverviewWorkspace } from "@/packages/pms/lib/revenue/commercial-overview.functions";
import {
  COMMERCIAL_ATTRIBUTION_LABEL,
  COMMERCIAL_EMPTY_COPY,
  commercialHistoryEntityLabel,
  commercialKindLabel,
  commercialValueLabel,
  type CommercialPromotionRow,
} from "@/packages/pms/lib/revenue/commercial-overview";
import { PACKAGE_REVENUE_HELPER } from "@/packages/pms/lib/revenue/commercial-packages-ui";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import {
  COMMERCIAL_OVERVIEW_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { CommercialStatusChip } from "../commercial/commercial-status-chip";
import {
  PromotionActivationActionSheet,
  type PromotionActivationAction,
} from "../commercial/promotion-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

const PREVIEW_LIMIT = 5;

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[#5A4833]">{label}</p>
        <p className="mt-0.5 font-display text-xl font-semibold leading-tight tracking-tight text-[#251605]">
          {value}
        </p>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-20 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl border border-[#DDD4C5] bg-white"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-44 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
        <div className="h-44 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
    </div>
  );
}

export function CommercialOverviewView({
  restaurantId,
  context,
  access,
  roomTypes,
  ratePlans,
  onNavigateView,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  onNavigateView: (view: RevenueWorkspaceView) => void;
}) {
  const canManage = access.canViewCommercial;
  const fetchOverview = useServerFn(getCommercialOverviewWorkspace);
  const query = useQuery({
    queryKey: [
      "commercial-overview",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchOverview({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
        },
      }),
    retry: false,
  });
  const [intentOpen, setIntentOpen] = useState(false);
  const [action, setAction] = useState<{ id: string; action: PromotionActivationAction } | null>(
    null,
  );
  const [operationId, setOperationId] = useState<string | null>(null);

  if (query.isLoading) return <OverviewSkeleton />;
  if (query.isError) {
    return (
      <InventoryState
        state="error"
        title={COMMERCIAL_OVERVIEW_LOAD_ERROR}
        description={revenueUiError(query.error, COMMERCIAL_OVERVIEW_LOAD_ERROR)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;
  const money = (value: number) => formatHistoryMoney(value, data.currency);
  const previewPromotions = data.activePromotions.slice(0, PREVIEW_LIMIT);
  const previewAttention = data.attention.slice(0, PREVIEW_LIMIT);
  const previewActivity = data.recentActivity.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-col gap-3.5 rounded-xl border border-[#DDD4C5] bg-gradient-to-r from-white via-[#FCFBF8] to-[#F9F4EA] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">
              Commercial Overview
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E5D7B8] bg-[#FDF9F0] px-2.5 py-0.5 text-xs font-semibold text-[#6B4A0A]">
              Business Date · {data.businessDate}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#756A5B]">
            Configured promotions, packages, attributed booking performance, and operational
            attention.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={commercialOutlineButton()}
            onClick={() => onNavigateView("promotions")}
          >
            <Tag className="size-3.5 text-[#8A641A]" />
            <span>View Promotions</span>
          </button>
          <button
            type="button"
            className={commercialOutlineButton()}
            onClick={() => onNavigateView("packages")}
          >
            <Package className="size-3.5 text-[#8A641A]" />
            <span>View Packages</span>
          </button>
          <button
            type="button"
            className={commercialOutlineButton()}
            onClick={() => onNavigateView("commercial-history")}
          >
            <History className="size-3.5 text-[#8A641A]" />
            <span>View Commercial History</span>
          </button>
          <a href={CARD3_HREF} className={commercialOutlineButton()}>
            Configure in Property Setup
          </a>
          {canManage ? (
            <button
              type="button"
              className={commercialGoldButton()}
              onClick={() => setIntentOpen(true)}
            >
              <Sparkles className="size-3.5" />
              <span>Create Activation</span>
            </button>
          ) : null}
        </div>
      </div>

      {data.empty ? (
        <InventoryState
          state="empty"
          title={COMMERCIAL_EMPTY_COPY}
          description="Activate a Property Setup promotion or package, or open Property Setup to configure masters."
        />
      ) : (
        <>
          {/* Primary KPI Strip */}
          <section aria-label="Commercial Programme KPIs">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                icon={Tag}
                label="Active Promotions"
                value={data.kpis.activePromotions}
                tone="bg-[#F4E9D0] text-[#8A641A]"
              />
              <KpiCard
                icon={CalendarClock}
                label="Upcoming Promotions"
                value={data.kpis.upcomingPromotions}
                tone="bg-[#EFECE6] text-[#423321]"
              />
              <KpiCard
                icon={Clock}
                label="Expiring Soon"
                value={data.kpis.expiringSoon}
                tone={
                  data.kpis.expiringSoon > 0
                    ? "bg-amber-50 text-amber-700"
                    : "bg-[#EFECE6] text-[#423321]"
                }
              />
              <KpiCard
                icon={Package}
                label="Active Packages"
                value={data.kpis.activePackages}
                tone="bg-[#F4E9D0] text-[#8A641A]"
              />
            </div>
          </section>

          {/* Attribution Info Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F4E9D0] bg-[#FDF9F0] px-4 py-2.5 text-xs text-[#5A4833]">
            <div className="flex items-center gap-2">
              <Info className="size-4 shrink-0 text-[#8A641A]" />
              <span>
                <strong className="font-semibold text-[#251605]">
                  {data.performance.periodLabel}:
                </strong>{" "}
                {COMMERCIAL_ATTRIBUTION_LABEL}. {PACKAGE_REVENUE_HELPER}
              </span>
            </div>
          </div>

          {/* Performance Cards: Promotions + Packages */}
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-[#EFE9DF] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#F4E9D0] text-[#8A641A]">
                    <Percent className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#251605]">Promotion Performance</h3>
                    <p className="text-xs text-[#756A5B]">{data.performance.periodLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateView("promotions")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A] transition-colors hover:text-[#6B4A0A]"
                >
                  <span>Promotions</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>

              <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3 py-2.5">
                  <p className="text-xs font-medium text-[#756A5B]">Promotion Bookings</p>
                  <p className="mt-1 font-display text-lg font-semibold text-[#251605]">
                    {data.performance.bookings}
                  </p>
                </div>
                <div className="rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3 py-2.5">
                  <p className="text-xs font-medium text-[#756A5B]">Room Nights</p>
                  <p className="mt-1 font-display text-lg font-semibold text-[#251605]">
                    {data.performance.roomNights}
                  </p>
                </div>
                <div className="rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3 py-2.5">
                  <p className="text-xs font-medium text-[#756A5B]">Promotion Discount</p>
                  <p className="mt-1 font-display text-lg font-semibold text-[#8A641A]">
                    {money(data.performance.discountAmount)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3 py-2.5">
                  <p className="text-xs font-medium text-[#756A5B]">Net Room Revenue</p>
                  <p className="mt-1 font-display text-lg font-semibold text-[#251605]">
                    {money(data.performance.postPromotionRoomRevenue)}
                  </p>
                </div>
              </div>
            </section>

            <section className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-[#EFE9DF] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#EFECE6] text-[#423321]">
                    <Package className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#251605]">Package Performance</h3>
                    <p className="text-xs text-[#756A5B]">{data.packagePerformance.periodLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateView("packages")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A] transition-colors hover:text-[#6B4A0A]"
                >
                  <span>View All Packages</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>

              <div className="mt-3.5 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3.5 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#5A4833] shadow-2xs">
                    <BedDouble className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[#756A5B]">Package Bookings</p>
                    <p className="mt-0.5 font-display text-lg font-semibold text-[#251605]">
                      {data.packagePerformance.bookings}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3.5 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F4E9D0] text-[#8A641A] shadow-2xs">
                    <CircleDollarSign className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[#756A5B]">Package Revenue</p>
                    <p className="mt-0.5 font-display text-lg font-semibold text-[#251605]">
                      {money(data.packagePerformance.revenue)}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Active Promotions Preview Table */}
          <section className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE9DF] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-[#251605]">Active Promotions</h3>
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#EFECE6] px-2 py-0.5 text-xs font-bold text-[#5A4833]">
                  {data.activePromotions.length}
                </span>
              </div>
              <button
                type="button"
                className={commercialOutlineButton()}
                onClick={() => onNavigateView("promotions")}
              >
                View All Promotions
              </button>
            </div>
            {previewPromotions.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-[#251605]">
                  No promotions are active for {data.businessDate}.
                </p>
                <p className="mt-1 text-xs text-[#756A5B]">
                  Use Create Activation or open Promotions to schedule a stay window.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-max w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
                      {[
                        "Promotion",
                        "Offer",
                        "Status",
                        "Stay Window",
                        "Booking Window",
                        "Room Scope",
                        "Rate Plan Scope",
                        "Bookings",
                        "Discount",
                        "Actions",
                      ].map((label) => (
                        <th
                          key={label}
                          className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewPromotions.map((row) => (
                      <tr
                        key={row.activationId}
                        role="button"
                        tabIndex={0}
                        onClick={() => onNavigateView("promotions")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onNavigateView("promotions");
                          }
                        }}
                        className="cursor-pointer border-t border-[#E8E1D7] transition-colors hover:bg-[#FAF6F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]"
                      >
                        <td className="px-3.5 py-3 text-sm text-[#251605]">
                          <p className="font-semibold">{row.name}</p>
                          <p className="text-xs text-[#756A5B]">{row.code}</p>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-sm font-medium text-[#251605]">
                          <span>{commercialValueLabel(row.kind, row.value, money)}</span>
                          <p className="text-xs font-normal text-[#756A5B]">
                            {commercialKindLabel(row.kind)}
                          </p>
                        </td>
                        <td className="px-3.5 py-3">
                          <CommercialStatusChip
                            status={row.operationalStatus}
                            overlap={row.overlap}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[#251605]">
                          {row.validFrom} – {row.validTo}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[#251605]">
                          {row.bookingFrom} – {row.bookingTo}
                        </td>
                        <td className="px-3.5 py-3 text-xs text-[#251605]">{row.roomScopeLabel}</td>
                        <td className="px-3.5 py-3 text-xs text-[#251605]">
                          {row.ratePlanScopeLabel}
                        </td>
                        <td className="px-3.5 py-3 text-sm font-medium text-[#251605]">
                          {row.bookings}
                        </td>
                        <td className="px-3.5 py-3 text-sm font-medium text-[#8A641A]">
                          {money(row.discountAmount)}
                        </td>
                        <td
                          className="px-3.5 py-3 text-right"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <RowMenu
                            row={row}
                            canManage={canManage}
                            onView={() => onNavigateView("promotions")}
                            onAction={(next) => setAction({ id: row.activationId, action: next })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Bottom Split: Commercial Attention + Recent Commercial Activity */}
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-[#EFE9DF] pb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      previewAttention.length > 0
                        ? "bg-amber-100 text-amber-800"
                        : "bg-[#EFECE6] text-[#5A4833]"
                    }`}
                  >
                    <AlertTriangle className="size-4" />
                  </span>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#251605]">Commercial Attention</h3>
                    {data.attention.length > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        {data.attention.length}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={commercialOutlineButton()}
                  onClick={() => onNavigateView("promotions")}
                >
                  View Promotions
                </button>
              </div>
              {previewAttention.length === 0 ? (
                <div className="mt-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-4 py-6 text-center">
                  <p className="text-sm font-medium text-[#251605]">All activations healthy</p>
                  <p className="mt-0.5 text-xs text-[#756A5B]">
                    No overlapping or expiring commercial activations require attention.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {previewAttention.map((item) => (
                    <li
                      key={`${item.kind}-${item.activationId}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3.5 py-2.5 transition-colors hover:bg-amber-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#251605]">{item.title}</p>
                        <p className="mt-0.5 text-xs text-[#5A4833]">{item.detail}</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-[#8A641A] transition-colors hover:bg-[#FAF6F0]"
                        onClick={() => onNavigateView("promotions")}
                      >
                        Review
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-[#EFE9DF] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#EFECE6] text-[#423321]">
                    <History className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#251605]">
                      Recent Commercial Activity
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  className={commercialOutlineButton()}
                  onClick={() => onNavigateView("commercial-history")}
                >
                  View full history
                </button>
              </div>
              {previewActivity.length === 0 ? (
                <div className="mt-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-4 py-6 text-center">
                  <p className="text-sm font-medium text-[#251605]">No recent changes</p>
                  <p className="mt-0.5 text-xs text-[#756A5B]">
                    No commercial activation changes have been recorded yet.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {previewActivity.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3.5 py-2.5 text-left transition-colors hover:border-[#C89933] hover:bg-[#FAF6F0]"
                        onClick={() => setOperationId(row.operationId)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#251605]">
                            {commercialHistoryActionLabel(
                              row.actionType,
                              row.beforeState,
                              row.afterState,
                            )}{" "}
                            · {commercialHistoryEntityLabel(row.entityType)}
                          </p>
                          <p className="mt-0.5 text-xs text-[#756A5B]">
                            {new Date(row.createdAt).toLocaleString()} ·{" "}
                            {commercialHistoryActorLabel(row)}
                          </p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-[#8A641A]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <CommercialActivationWorkflow
        open={intentOpen}
        onOpenChange={setIntentOpen}
        restaurantId={restaurantId}
        canManage={canManage}
        source="overview"
        currency={data.currency}
        roomTypes={roomTypes}
        ratePlans={ratePlans}
      />
      {action ? (
        <PromotionActivationActionSheet
          restaurantId={restaurantId}
          activationId={action.id}
          action={action.action}
          canManage={canManage}
          roomTypes={roomTypes}
          ratePlans={ratePlans}
          onClose={() => setAction(null)}
        />
      ) : null}
      {operationId ? (
        <OperationDetailSheet
          restaurantId={restaurantId}
          operationId={operationId}
          onClose={() => setOperationId(null)}
        />
      ) : null}
    </div>
  );
}

function RowMenu({
  row,
  canManage,
  onView,
  onAction,
}: {
  row: CommercialPromotionRow;
  canManage: boolean;
  onView: () => void;
  onAction: (action: PromotionActivationAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${row.code}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-[#756A5B] transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={onView}>View Details</DropdownMenuItem>
        {canManage &&
        row.executable &&
        (row.operationalStatus === "active" || row.operationalStatus === "upcoming") ? (
          <>
            <DropdownMenuItem onClick={() => onAction("edit")}>Edit Activation</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("deactivate")}>Deactivate</DropdownMenuItem>
          </>
        ) : null}
        {canManage && row.executable && row.operationalStatus === "inactive" ? (
          <DropdownMenuItem onClick={() => onAction("reactivate")}>Reactivate</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OperationDetailSheet({
  restaurantId,
  operationId,
  onClose,
}: {
  restaurantId: string;
  operationId: string;
  onClose: () => void;
}) {
  const fetchDetail = useServerFn(getCommercialOperationDetail);
  const query = useQuery({
    queryKey: ["commercial-operation", restaurantId, operationId],
    queryFn: () => fetchDetail({ data: { restaurantId, operationId } }),
    retry: false,
  });
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-[92vw] sm:max-w-[480px] p-0">
        <div className="flex h-full flex-col bg-[#F7F4EE]">
          <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8A641A]">
                Commercial Change Detail
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
                {query.data
                  ? commercialHistoryActionLabel(query.data.actionType)
                  : "Operation Detail"}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[#756A5B] hover:bg-[#E8E1D7] hover:text-[#251605]"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 p-5">
            {query.isLoading ? (
              <p className="text-sm text-[#756A5B]">Loading…</p>
            ) : query.data ? (
              <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-4 text-sm text-[#251605]">
                <p className="font-semibold">
                  {commercialHistoryActionLabel(query.data.actionType)}
                </p>
                <p className="text-xs text-[#756A5B]">
                  {new Date(query.data.createdAt).toLocaleString()} ·{" "}
                  {commercialHistoryActorLabel(query.data)}
                </p>
                <p className="text-xs text-[#5A4833]">
                  Reason: {query.data.reason || "No reason provided"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#756A5B]">Operation not found.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
