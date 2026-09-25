import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";

import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
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
  type CommercialPromotionRow,
} from "@/packages/pms/lib/revenue/commercial-overview";
import { PACKAGE_REVENUE_HELPER } from "@/packages/pms/lib/revenue/commercial-packages-ui";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { COMMERCIAL_OVERVIEW_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { InventoryMetric, InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { CommercialActivationIntentSheet } from "../commercial/commercial-activation-intent-sheet";
import { CommercialStatusChip } from "../commercial/commercial-status-chip";
import { PromotionActivationActionSheet, type PromotionActivationAction } from "../commercial/promotion-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

function OverviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
      <div className="grid gap-2 xl:grid-cols-2">
        <div className="h-40 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
        <div className="h-40 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
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
  const [action, setAction] = useState<{ id: string; action: PromotionActivationAction } | null>(null);
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

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#251605]">Commercial</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Monitor active promotions, packages, commercial scope, and post-launch performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <button type="button" className={commercialGoldButton()} onClick={() => setIntentOpen(true)}>
              Create Activation
            </button>
          ) : null}
          <a href={CARD3_HREF} className={commercialOutlineButton()}>
            View Property Setup
          </a>
        </div>
      </div>

      {data.empty ? (
        <InventoryState
          state="empty"
          title={COMMERCIAL_EMPTY_COPY}
          description="Activate a Property Setup promotion when the activation workflow is ready, or open Property Setup to configure masters."
        />
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#251605]">Operational counts</h3>
            <p className="text-[10px] text-muted-foreground">As of business date {data.businessDate}.</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <InventoryMetric label="Active Promotions" value={data.kpis.activePromotions} detail="Valid today" />
              <InventoryMetric label="Upcoming Promotions" value={data.kpis.upcomingPromotions} detail="Starts after today" />
              <InventoryMetric label="Expiring Soon" value={data.kpis.expiringSoon} detail="Ends within 7 days" />
              <InventoryMetric label="Active Packages" value={data.kpis.activePackages} detail="Valid today" />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#251605]">Promotion Performance</h3>
            <p className="text-[10px] text-muted-foreground">
              {data.performance.periodLabel}. {data.performance.note}. {COMMERCIAL_ATTRIBUTION_LABEL}.
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <InventoryMetric label="Promotion Bookings" value={data.performance.bookings} detail={COMMERCIAL_ATTRIBUTION_LABEL} />
              <InventoryMetric label="Promotion Room Nights" value={data.performance.roomNights} detail="Stay nights in range" />
              <InventoryMetric label="Promotion Discount" value={money(data.performance.discountAmount)} detail="Sum of discount_amount" />
              <InventoryMetric
                label="Post-Promotion Room Revenue"
                value={money(data.performance.postPromotionRoomRevenue)}
                detail="room_subtotal_after_promotion"
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#251605]">Package Performance</h3>
            <p className="text-[10px] text-muted-foreground">
              {data.packagePerformance.periodLabel}. {data.packagePerformance.note} {PACKAGE_REVENUE_HELPER}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <InventoryMetric label="Package Bookings" value={data.packagePerformance.bookings} detail={COMMERCIAL_ATTRIBUTION_LABEL} />
              <InventoryMetric label="Package Revenue" value={money(data.packagePerformance.revenue)} detail={PACKAGE_REVENUE_HELPER} />
            </div>
          </section>

          <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-[#251605]">Active Promotions</h3>
            {data.activePromotions.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No promotions are active for the current business date.</p>
            ) : (
              <div className="mt-2 overflow-auto">
                <table className="min-w-max w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
                      {["Promotion", "Status", "Stay Window", "Booking Window", "Room Scope", "Rate Plan Scope", "Priority", "Bookings", "Discount", "Actions"].map((label) => (
                        <th key={label} className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.activePromotions.map((row) => (
                      <tr key={row.activationId} className="border-t border-[#E8E1D7]">
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-muted-foreground">{row.code}</p>
                        </td>
                        <td className="px-2 py-1.5"><CommercialStatusChip status={row.operationalStatus} overlap={row.overlap} /></td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">{row.validFrom} – {row.validTo}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">{row.bookingFrom} – {row.bookingTo}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.roomScopeLabel}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.ratePlanScopeLabel}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.priority}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.bookings}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{money(row.discountAmount)}</td>
                        <td className="px-2 py-1.5">
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

          {data.attention.length > 0 ? (
            <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-[#251605]">Commercial Attention</h3>
              <ul className="mt-2 space-y-2">
                {data.attention.map((item) => (
                  <li key={`${item.kind}-${item.activationId}`} className="rounded-lg border border-[#EAE4DB] bg-white px-3 py-2">
                    <p className="text-[11px] font-medium text-[#251605]">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground">{item.detail}</p>
                    <button
                      type="button"
                      className="mt-1 text-[10px] font-medium text-[#8B651D] underline-offset-2 hover:underline"
                      onClick={() => onNavigateView("promotions")}
                    >
                      Review Promotion
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-[#251605]">Recent Commercial Activity</h3>
            <p className="text-[10px] text-muted-foreground">Preview of hotel_commercial_change_events. Full history comes later.</p>
            {data.recentActivity.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No commercial activation changes have been recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.recentActivity.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-[#EAE4DB] bg-white px-3 py-2 text-left"
                      onClick={() => setOperationId(row.operationId)}
                    >
                      <p className="text-[11px] font-medium text-[#251605]">
                        {commercialHistoryActionLabel(row.actionType)} · {commercialHistoryEntityLabel(row.entityType)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()} · {commercialHistoryActorLabel(row)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="flex flex-wrap gap-2">
        <button type="button" className={commercialOutlineButton()} onClick={() => onNavigateView("promotions")}>
          View Promotions
        </button>
        <button type="button" className={commercialOutlineButton()} onClick={() => onNavigateView("packages")}>
          View Packages
        </button>
        {canManage ? (
          <button type="button" className={commercialGoldButton()} onClick={() => setIntentOpen(true)}>
            Create Activation
          </button>
        ) : null}
        <a href={CARD3_HREF} className={commercialOutlineButton()}>
          View Property Setup
        </a>
      </section>

      <CommercialActivationIntentSheet
        open={intentOpen}
        title="Create Activation"
        entity="chooser"
        canManage={canManage}
        onClose={() => setIntentOpen(false)}
        onChoosePromotion={() => {
          setIntentOpen(false);
          onNavigateView("promotions");
        }}
        onChoosePackage={() => {
          setIntentOpen(false);
          onNavigateView("packages");
        }}
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
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={onView}>View Details</DropdownMenuItem>
        {canManage && row.executable && (row.operationalStatus === "active" || row.operationalStatus === "upcoming") ? (
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
      <SheetContent side="right" className="w-[92vw] max-w-md p-0">
        <div className="bg-[#F7F4EE] p-4">
          <h3 className="font-display text-lg font-semibold text-[#251605]">Operation detail</h3>
          {query.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
          ) : query.data ? (
            <div className="mt-3 space-y-2 text-xs text-[#251605]">
              <p>{commercialHistoryActionLabel(query.data.actionType)}</p>
              <p className="text-muted-foreground">
                {new Date(query.data.createdAt).toLocaleString()} · {commercialHistoryActorLabel(query.data)}
              </p>
              <p className="text-muted-foreground">{query.data.reason || "No reason provided"}</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Operation not found.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
