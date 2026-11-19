import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Percent,
  Tag,
} from "lucide-react";

import { CARD3_PROMOTIONS_HREF, withReturnTo } from "@/packages/pms/lib/pms-property-setup-card3";
import { getPromotionsWorkspace } from "@/packages/pms/lib/revenue/commercial-overview.functions";
import {
  COMMERCIAL_EMPTY_COPY,
  commercialKindLabel,
  commercialStatusLabel,
  commercialValueLabel,
  filterPromotionRows,
  type PromotionDisplayStatus,
  type PromotionWorkspaceRow,
} from "@/packages/pms/lib/revenue/commercial-overview";
import { CommercialActivationWorkflow } from "../commercial-activation/commercial-activation-workflow";
import type { CommercialPromoKind } from "@/packages/pms/lib/revenue/commercial-engine";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import {
  COMMERCIAL_PROMOTIONS_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { CommercialStatusChip } from "../commercial/commercial-status-chip";
import {
  PromotionActivationActionSheet,
  type PromotionActivationAction,
} from "../commercial/promotion-activation-action-sheet";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { useRateRevenueExtras } from "../rate-revenue-shell-slots";
import { PromotionDetailDrawer } from "./promotion-detail-drawer";

const PROMOTION_PAGE_SIZES = [10, 25, 50] as const;

const PROMOTION_STATUS_OPTIONS: ReadonlyArray<readonly [PromotionDisplayStatus | "all", string]> = [
  ["all", "All statuses"],
  ["active", "Active"],
  ["upcoming", "Upcoming"],
  ["expired", "Expired"],
  ["inactive", "Inactive"],
  ["not_activated", "Not Activated"],
];

const PROMOTION_KIND_OPTIONS: ReadonlyArray<readonly [CommercialPromoKind | "all", string]> = [
  ["all", "All kinds"],
  ["percent", "Percentage"],
  ["fixed", "Fixed Amount"],
  ["free_night", "Free Night"],
];

export function PromotionsView({
  restaurantId,
  context,
  access,
  roomTypes,
  ratePlans,
  searchQuery = "",
  onNavigateView,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  searchQuery?: string;
  onContextChange?: ((patch: Partial<RevenueContext>) => void) | undefined;
  onNavigateView?: ((view: RevenueWorkspaceView) => void) | undefined;
}) {
  const canManage = access.canApprove;
  const fetchPromotions = useServerFn(getPromotionsWorkspace);
  const query = useQuery({
    queryKey: [
      "commercial-promotions",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchPromotions({
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
  const search = searchQuery;
  const [status, setStatus] = useState<PromotionDisplayStatus | "all">("all");
  const [kind, setKind] = useState<CommercialPromoKind | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [intentOpen, setIntentOpen] = useState(false);
  const [pendingPromotionId, setPendingPromotionId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; action: PromotionActivationAction } | null>(
    null,
  );

  const rows = useMemo(
    () => filterPromotionRows(query.data?.rows ?? [], { search, status, kind }),
    [query.data?.rows, search, status, kind],
  );

  useEffect(() => {
    setPage(1);
  }, [
    search,
    status,
    kind,
    pageSize,
    context.fromDate,
    context.toDate,
    context.roomTypeId,
    context.ratePlanId,
  ]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginatedRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );
  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(rows.length, safePage * pageSize);

  const selected =
    rows.find((row) => row.rowKey === selectedKey) ??
    query.data?.rows.find((row) => row.rowKey === selectedKey) ??
    null;

  function openActivate(promotionId?: string) {
    setPendingPromotionId(promotionId ?? null);
    setIntentOpen(true);
  }

  const allRows = query.data?.rows ?? [];
  const activationRows = allRows.filter((row) => row.rowKind === "activation");
  const kpiMoney = (value: number) => formatHistoryMoney(value, query.data?.currency ?? "");

  useRateRevenueExtras({
    searchPlaceholder: "Search name or code",
    filters: [
      {
        id: "promotions-status",
        label: "Status",
        value: status,
        current: status === "all" ? "" : commercialStatusLabel(status),
        options: PROMOTION_STATUS_OPTIONS,
        onChange: (value) => setStatus(value as PromotionDisplayStatus | "all"),
      },
      {
        id: "promotions-kind",
        label: "Promotion Type",
        value: kind,
        current: PROMOTION_KIND_OPTIONS.find(([id]) => id === kind && id !== "all")?.[1] ?? "",
        options: PROMOTION_KIND_OPTIONS,
        onChange: (value) => setKind(value as CommercialPromoKind | "all"),
      },
    ],
    actions: [
      ...(canManage
        ? [{ id: "activate-promotion", label: "Activate Promotion", onSelect: () => openActivate() }]
        : []),
      ...(onNavigateView
        ? [
            {
              id: "promotions-history",
              label: "View History",
              onSelect: () => onNavigateView("commercial-history"),
            },
          ]
        : []),
      {
        id: "promotions-configure",
        label: "Configure in Property Setup",
        onSelect: () =>
          window.location.assign(
            withReturnTo(CARD3_PROMOTIONS_HREF, "/restaurant/pms/rates-revenue?view=promotions"),
          ),
      },
    ],
    kpis: query.data
      ? [
          {
            label: "Active Promotions",
            value: String(allRows.filter((row) => row.displayStatus === "active").length),
            icon: Tag,
          },
          {
            label: "Upcoming Promotions",
            value: String(allRows.filter((row) => row.displayStatus === "upcoming").length),
            icon: CalendarClock,
          },
          {
            label: "Promotion Bookings",
            value: String(activationRows.reduce((sum, row) => sum + row.bookings, 0)),
            icon: BedDouble,
          },
          {
            label: "Promotion Discount",
            value: kpiMoney(activationRows.reduce((sum, row) => sum + row.discountAmount, 0)),
            icon: Percent,
          },
        ]
      : undefined,
    onClear: () => {
      setStatus("all");
      setKind("all");
      setPage(1);
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
        <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <InventoryState
        state="error"
        title={COMMERCIAL_PROMOTIONS_LOAD_ERROR}
        description={revenueUiError(query.error, COMMERCIAL_PROMOTIONS_LOAD_ERROR)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;
  const money = (value: number) => formatHistoryMoney(value, data.currency);

  return (
    <div className="space-y-3">
      {data.rows.length === 0 ? (
        <InventoryState state="empty" title={COMMERCIAL_EMPTY_COPY} />
      ) : rows.length === 0 ? (
        <InventoryState state="empty" title="No promotions match these filters." />
      ) : (
        <>
          <div className="hidden overflow-auto rounded-xl border border-[#E8E1D7] bg-card md:block">
            <table className="min-w-max w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
                  {[
                    "Promotion",
                    "Kind",
                    "Value",
                    "Status",
                    "Stay Window",
                    "Booking Window",
                    "Room Scope",
                    "Rate Plan Scope",
                    "Priority",
                    "Bookings",
                    "Discount",
                    "Updated",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr
                    key={row.rowKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedKey(row.rowKey)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedKey(row.rowKey);
                      }
                    }}
                    className={[
                      "cursor-pointer border-t border-[#E8E1D7] transition-colors hover:bg-[#FBF8F3] focus-visible:bg-[#FBF8F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]/40",
                      selectedKey === row.rowKey ? "bg-[#F8F1E5]" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2.5 text-sm text-[#251605]">
                      <p className="font-semibold">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.code}</p>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-[#251605]">
                      {commercialKindLabel(row.kind)}
                      {!row.executable ? (
                        <p className="text-xs text-[#6B4A0A]">Unsupported for activation</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-medium text-[#251605]">
                      {commercialValueLabel(row.kind, row.value, money)}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.displayStatus === "not_activated" ? (
                        <span className="inline-flex rounded-full border border-[#DED7CD] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#6B4A0A]">
                          {commercialStatusLabel(row.displayStatus)}
                        </span>
                      ) : (
                        <CommercialStatusChip
                          status={row.operationalStatus}
                          overlap={row.overlap}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#251605]">
                      {row.rowKind === "master"
                        ? `${row.validFrom} – ${row.validTo}`
                        : `${row.validFrom} – ${row.validTo}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#251605]">
                      {row.rowKind === "master" ? "—" : `${row.bookingFrom} – ${row.bookingTo}`}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#251605]">{row.roomScopeLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-[#251605]">{row.ratePlanScopeLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-[#251605]">
                      {row.rowKind === "master" ? "—" : row.priority}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-[#251605]">{row.bookings}</td>
                    <td className="px-3 py-2.5 text-sm text-[#251605]">
                      {money(row.discountAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <PromotionRowMenu
                        row={row}
                        canManage={canManage}
                        onView={() => setSelectedKey(row.rowKey)}
                        onAction={(next) =>
                          row.activationId && setAction({ id: row.activationId, action: next })
                        }
                        onActivate={() => openActivate(row.promotionId)}
                        onNavigateView={onNavigateView}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {paginatedRows.map((row) => (
              <article
                key={row.rowKey}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedKey(row.rowKey)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedKey(row.rowKey);
                  }
                }}
                className="cursor-pointer rounded-xl border border-[#E8E1D7] bg-card p-3.5 transition-colors hover:bg-[#FBF8F3]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#251605]">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.code}</p>
                  </div>
                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <PromotionRowMenu
                      row={row}
                      canManage={canManage}
                      onView={() => setSelectedKey(row.rowKey)}
                      onAction={(next) =>
                        row.activationId && setAction({ id: row.activationId, action: next })
                      }
                      onActivate={() => openActivate(row.promotionId)}
                      onNavigateView={onNavigateView}
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.displayStatus === "not_activated" ? (
                    <span className="inline-flex rounded-full border border-[#DED7CD] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#6B4A0A]">
                      {commercialStatusLabel(row.displayStatus)}
                    </span>
                  ) : (
                    <CommercialStatusChip status={row.operationalStatus} overlap={row.overlap} />
                  )}
                  {!row.executable ? (
                    <span className="rounded-full border border-[#DED7CD] px-2.5 py-0.5 text-xs text-[#6B4A0A]">
                      Not available in V1
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-[#251605]">
                  {commercialKindLabel(row.kind)} ·{" "}
                  {commercialValueLabel(row.kind, row.value, money)} · {row.validFrom} –{" "}
                  {row.validTo}
                </p>
              </article>
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3.5 py-2.5">
            <p className="text-xs text-muted-foreground">
              Showing {rangeStart}–{rangeEnd} of {rows.length}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Previous
              </button>
              <span className="grid size-8 place-items-center rounded-md bg-[#C89933] text-xs font-semibold text-[#251605]">
                {safePage}
              </span>
              <span className="px-1 text-xs text-muted-foreground">of {pageCount}</span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] disabled:opacity-50"
              >
                Next
                <ChevronRight className="ml-1 size-3.5" />
              </button>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="ml-2 h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-xs text-[#251605]"
                aria-label="Rows per page"
              >
                {PROMOTION_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            </div>
          </footer>
        </>
      )}

      <PromotionDetailDrawer
        restaurantId={restaurantId}
        row={selected}
        context={context}
        canManage={canManage}
        currency={data.currency}
        onClose={() => setSelectedKey(null)}
        onAction={(next) =>
          selected?.activationId && setAction({ id: selected.activationId, action: next })
        }
        onActivate={() => selected && openActivate(selected.promotionId)}
        onNavigateView={onNavigateView}
      />

      <CommercialActivationWorkflow
        open={intentOpen}
        onOpenChange={(next) => {
          setIntentOpen(next);
          if (!next) setPendingPromotionId(null);
        }}
        restaurantId={restaurantId}
        canManage={canManage}
        source="promotions"
        currency={data.currency}
        roomTypes={roomTypes}
        ratePlans={ratePlans}
        initialKind="promotion"
        initialPromotionId={pendingPromotionId}
        promotionMasters={data.masters}
        onActivated={(result) => setSelectedKey(`activation:${result.activationId}`)}
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
    </div>
  );
}

function PromotionRowMenu({
  row,
  canManage,
  onView,
  onAction,
  onActivate,
  onNavigateView,
}: {
  row: PromotionWorkspaceRow;
  canManage: boolean;
  onView: () => void;
  onAction: (action: PromotionActivationAction) => void;
  onActivate: () => void;
  onNavigateView?: ((view: RevenueWorkspaceView) => void) | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${row.code}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={onView}>View Details</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={withReturnTo(CARD3_PROMOTIONS_HREF, "/restaurant/pms/rates-revenue?view=promotions")}>
            Configure in Property Setup
          </a>
        </DropdownMenuItem>
        {onNavigateView ? (
          <DropdownMenuItem onClick={() => onNavigateView("commercial-history")}>
            View History
          </DropdownMenuItem>
        ) : null}
        {canManage && row.rowKind === "master" ? (
          <DropdownMenuItem onClick={onActivate}>Activate</DropdownMenuItem>
        ) : null}
        {canManage &&
        row.rowKind === "activation" &&
        row.executable &&
        (row.operationalStatus === "active" || row.operationalStatus === "upcoming") ? (
          <>
            <DropdownMenuItem onClick={() => onAction("edit")}>Edit Activation</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("deactivate")}>Deactivate</DropdownMenuItem>
          </>
        ) : null}
        {canManage &&
        row.rowKind === "activation" &&
        row.executable &&
        row.operationalStatus === "inactive" ? (
          <DropdownMenuItem onClick={() => onAction("reactivate")}>Reactivate</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
