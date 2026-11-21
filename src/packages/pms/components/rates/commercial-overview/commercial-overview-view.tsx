import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Clock,
  History,
  Info,
  Package,
  Percent,
  Tag,
  X,
} from "lucide-react";

import { CARD3_HREF, withReturnTo } from "@/packages/pms/lib/pms-property-setup-card3";
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
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { useRateRevenueExtras } from "../rate-revenue-shell-slots";

const PREVIEW_LIMIT = 5;

type OverviewSection = "all" | "performance" | "attention" | "activity";

const OVERVIEW_SECTIONS: ReadonlyArray<readonly [OverviewSection, string]> = [
  ["all", "All sections"],
  ["performance", "Performance"],
  ["attention", "Commercial Attention"],
  ["activity", "Recent Activity"],
];

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-3 py-2.5">
      <p className="truncate text-xs font-medium text-[#756A5B]">{label}</p>
      <p
        className={`mt-1 font-display text-lg font-semibold ${accent ? "text-[#8A641A]" : "text-[#251605]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  hint,
  linkLabel,
  onLink,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  linkLabel: string;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#EFE9DF] pb-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[#8A641A]" />
        <h3 className="text-sm font-semibold text-[#251605]">{title}</h3>
        {hint ? (
          <span title={hint} className="cursor-help">
            <Info className="size-3.5 text-[#B8A98F]" aria-label={hint} />
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onLink}
        className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A] transition-colors hover:text-[#6B4A0A]"
      >
        <span>{linkLabel}</span>
        <ArrowUpRight className="size-3.5" />
      </button>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-36 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
        <div className="h-36 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
        <div className="h-48 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      </div>
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
  const canManage = access.canApprove;
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
  const [operationId, setOperationId] = useState<string | null>(null);
  const [section, setSection] = useState<OverviewSection>("all");

  const data = query.data;
  const kpis = data?.kpis;

  useRateRevenueExtras({
    filters: [
      {
        id: "commercial-overview-section",
        label: "Show",
        value: section,
        current: section === "all" ? "" : (OVERVIEW_SECTIONS.find(([id]) => id === section)?.[1] ?? ""),
        options: OVERVIEW_SECTIONS,
        onChange: (value) => setSection(value as OverviewSection),
      },
    ],
    actions: [
      ...(canManage
        ? [{ id: "create-activation", label: "Create Activation", onSelect: () => setIntentOpen(true) }]
        : []),
      { id: "view-promotions", label: "View Promotions", onSelect: () => onNavigateView("promotions") },
      { id: "view-packages", label: "View Packages", onSelect: () => onNavigateView("packages") },
      {
        id: "view-commercial-history",
        label: "View Commercial History",
        onSelect: () => onNavigateView("commercial-history"),
      },
      {
        id: "configure-commercial",
        label: "Configure in Property Setup",
        onSelect: () =>
          window.location.assign(
            withReturnTo(CARD3_HREF, "/restaurant/pms/rates-revenue?view=commercial-overview"),
          ),
      },
    ],
    kpis: kpis
      ? [
          { label: "Active Promotions", value: String(kpis.activePromotions), icon: Tag },
          {
            label: "Upcoming Promotions",
            value: String(kpis.upcomingPromotions),
            icon: CalendarClock,
          },
          {
            label: "Expiring Soon",
            value: String(kpis.expiringSoon),
            icon: Clock,
            tone:
              kpis.expiringSoon > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-[#EFECE6] text-[#423321]",
          },
          { label: "Active Packages", value: String(kpis.activePackages), icon: Package },
        ]
      : undefined,
    onClear: () => setSection("all"),
  });

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
  if (!data) return null;

  const money = (value: number) => formatHistoryMoney(value, data.currency);
  const previewAttention = data.attention.slice(0, PREVIEW_LIMIT);
  const previewActivity = data.recentActivity.slice(0, PREVIEW_LIMIT);
  const show = (target: OverviewSection) => section === "all" || section === target;

  return (
    <div className="space-y-4" aria-label="Commercial Overview">
      {data.empty ? (
        <InventoryState state="empty" title={COMMERCIAL_EMPTY_COPY} />
      ) : (
        <>
          {show("performance") ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                <CardHeader
                  icon={Percent}
                  title="Promotion Performance"
                  hint={`${data.performance.periodLabel}: ${COMMERCIAL_ATTRIBUTION_LABEL}`}
                  linkLabel="View Promotions"
                  onLink={() => onNavigateView("promotions")}
                />
                <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Promotion Bookings" value={data.performance.bookings} />
                  <Metric label="Room Nights" value={data.performance.roomNights} />
                  <Metric
                    label="Promotion Discount"
                    value={money(data.performance.discountAmount)}
                    accent
                  />
                  <Metric
                    label="Net Room Revenue"
                    value={money(data.performance.postPromotionRoomRevenue)}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                <CardHeader
                  icon={Package}
                  title="Package Performance"
                  hint={`${data.packagePerformance.periodLabel}: ${PACKAGE_REVENUE_HELPER}`}
                  linkLabel="View Packages"
                  onLink={() => onNavigateView("packages")}
                />
                <div className="mt-3.5 grid grid-cols-2 gap-3">
                  <Metric label="Package Bookings" value={data.packagePerformance.bookings} />
                  <Metric label="Package Revenue" value={money(data.packagePerformance.revenue)} />
                </div>
              </section>
            </div>
          ) : null}

          {show("attention") || show("activity") ? (
            <div
              className={`grid gap-4 ${section === "all" ? "xl:grid-cols-2" : ""}`}
            >
              {show("attention") ? (
                <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                  <CardHeader
                    icon={AlertTriangle}
                    title={
                      data.attention.length > 0
                        ? `Commercial Attention (${data.attention.length})`
                        : "Commercial Attention"
                    }
                    linkLabel="View Promotions"
                    onLink={() => onNavigateView("promotions")}
                  />
                  {previewAttention.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-4 py-5 text-center text-sm font-medium text-[#251605]">
                      All activations healthy
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {previewAttention.map((item) => (
                        <li
                          key={`${item.kind}-${item.activationId}`}
                          className="flex items-start justify-between gap-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
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
              ) : null}

              {show("activity") ? (
                <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                  <CardHeader
                    icon={History}
                    title="Recent Commercial Activity"
                    linkLabel="View full history"
                    onLink={() => onNavigateView("commercial-history")}
                  />
                  {previewActivity.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-[#EAE4DB] bg-[#FAF8F5] px-4 py-5 text-center text-sm font-medium text-[#251605]">
                      No recent changes
                    </p>
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
              ) : null}
            </div>
          ) : null}
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
