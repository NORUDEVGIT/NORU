import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

import { CARD3_PROMOTIONS_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import {
  getCommercialOperationDetail,
  listCommercialChangeHistory,
} from "@/packages/pms/lib/revenue/commercial-history.functions";
import {
  commercialHistoryActionLabel,
  commercialHistoryActorLabel,
  commercialHistoryReasonLabel,
} from "@/packages/pms/lib/revenue/commercial-history";
import { getPromotionPerformanceSummary } from "@/packages/pms/lib/revenue/commercial-overview.functions";
import {
  COMMERCIAL_ATTRIBUTION_LABEL,
  COMMERCIAL_CONDITIONS_NOTE,
  commercialKindLabel,
  commercialValueLabel,
  commercialStatusLabel,
  type PromotionWorkspaceRow,
} from "@/packages/pms/lib/revenue/commercial-overview";
import { getPromotionActivationDetail } from "@/packages/pms/lib/revenue/commercial-promotion-activation.functions";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { CommercialStatusChip } from "../commercial/commercial-status-chip";
import type { PromotionActivationAction } from "../commercial/promotion-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

type DrawerTab = "overview" | "scope" | "performance" | "activity";

export function PromotionDetailDrawer({
  restaurantId,
  row,
  context,
  canManage,
  currency,
  onClose,
  onAction,
  onActivate,
  onNavigateView,
}: {
  restaurantId: string;
  row: PromotionWorkspaceRow | null;
  context: RevenueContext;
  canManage: boolean;
  currency: string;
  onClose: () => void;
  onAction: (action: PromotionActivationAction) => void;
  onActivate: () => void;
  onNavigateView?: ((view: RevenueWorkspaceView) => void) | undefined;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");

  return (
    <Sheet open={Boolean(row)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-[92vw] sm:max-w-[480px] p-0">
        <DrawerBody
          restaurantId={restaurantId}
          row={row}
          context={context}
          canManage={canManage}
          currency={currency}
          tab={tab}
          setTab={setTab}
          onClose={onClose}
          onAction={onAction}
          onActivate={onActivate}
          onNavigateView={onNavigateView}
        />
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  restaurantId,
  row,
  context,
  canManage,
  currency,
  tab,
  setTab,
  onClose,
  onAction,
  onActivate,
  onNavigateView,
}: {
  restaurantId: string;
  row: PromotionWorkspaceRow | null;
  context: RevenueContext;
  canManage: boolean;
  currency: string;
  tab: DrawerTab;
  setTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onAction: (action: PromotionActivationAction) => void;
  onActivate: () => void;
  onNavigateView?: ((view: RevenueWorkspaceView) => void) | undefined;
}) {
  const fetchDetail = useServerFn(getPromotionActivationDetail);
  const fetchPerformance = useServerFn(getPromotionPerformanceSummary);
  const fetchHistory = useServerFn(listCommercialChangeHistory);
  const fetchOperation = useServerFn(getCommercialOperationDetail);
  const [operationId, setOperationId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["promotion-activation-detail", restaurantId, row?.activationId ?? null],
    queryFn: () => fetchDetail({ data: { restaurantId, activationId: row!.activationId } }),
    enabled: Boolean(row?.activationId),
    retry: false,
  });
  const performanceQuery = useQuery({
    queryKey: [
      "promotion-performance",
      restaurantId,
      row?.activationId ?? null,
      context.fromDate,
      context.toDate,
    ],
    queryFn: () =>
      fetchPerformance({
        data: {
          restaurantId,
          activationId: row!.activationId,
          fromDate: context.fromDate,
          toDate: context.toDate,
        },
      }),
    enabled: Boolean(row?.activationId),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["commercial-activation-history", restaurantId, row?.activationId ?? null],
    queryFn: () =>
      fetchHistory({
        data: { restaurantId, entityId: row!.activationId, page: 1, pageSize: 8 },
      }),
    enabled: Boolean(row?.activationId),
    retry: false,
  });
  const operationQuery = useQuery({
    queryKey: ["commercial-operation", restaurantId, operationId],
    queryFn: () => fetchOperation({ data: { restaurantId, operationId: operationId! } }),
    enabled: Boolean(operationId),
    retry: false,
  });

  if (!row) {
    return (
      <div className="flex h-full min-h-[20rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Select a promotion activation to review details.
      </div>
    );
  }

  const money = (value: number) => formatHistoryMoney(value, currency);
  const tabs: Array<{ id: DrawerTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "scope", label: "Scope & Eligibility" },
    { id: "performance", label: "Performance" },
    { id: "activity", label: "Activity" },
  ];
  const conditions = detailQuery.data?.master?.conditions ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Promotion Details
          </p>
          <p className="mt-1 text-xs font-semibold text-[#6B4A0A]">{row.code}</p>
          <h3 className="font-display text-lg font-semibold text-[#251605]">{row.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-[#E8E1D7]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1 border-b border-[#E8E1D7] px-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={[
              "h-10 px-2.5 text-xs font-semibold",
              tab === item.id
                ? "border-b-2 border-[#C89933] text-[#6B4A0A]"
                : "text-muted-foreground hover:text-[#251605]",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "overview" ? (
          <div className="space-y-3">
            {row.displayStatus === "not_activated" ? (
              <span className="inline-flex rounded-full border border-[#DED7CD] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#6B4A0A]">
                {commercialStatusLabel(row.displayStatus)}
              </span>
            ) : (
              <CommercialStatusChip status={row.operationalStatus} overlap={row.overlap} />
            )}
            <div className="space-y-2.5 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <Row label="Kind" value={commercialKindLabel(row.kind)} />
              <Row label="Value" value={commercialValueLabel(row.kind, row.value, money)} />
              <Row label="Master status" value={row.masterActive ? "Active" : "Inactive"} />
              <Row
                label="Stay window"
                value={row.validFrom && row.validTo ? `${row.validFrom} – ${row.validTo}` : "—"}
              />
              <Row
                label="Booking window"
                value={row.rowKind === "master" ? "—" : `${row.bookingFrom} – ${row.bookingTo}`}
              />
              <Row label="Priority" value={row.rowKind === "master" ? "—" : String(row.priority)} />
              <Row
                label="Created"
                value={row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
              />
              <Row
                label="Updated"
                value={row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {row.rowKind === "master" && canManage ? (
                <button type="button" className={commercialGoldButton()} onClick={onActivate}>
                  Activate
                </button>
              ) : null}
              {canManage &&
              row.rowKind === "activation" &&
              row.executable &&
              (row.operationalStatus === "active" || row.operationalStatus === "upcoming") ? (
                <>
                  <button
                    type="button"
                    className={commercialGoldButton()}
                    onClick={() => onAction("edit")}
                  >
                    Edit Activation
                  </button>
                  <button
                    type="button"
                    className={commercialOutlineButton()}
                    onClick={() => onAction("deactivate")}
                  >
                    Deactivate
                  </button>
                </>
              ) : null}
              {canManage &&
              row.rowKind === "activation" &&
              row.executable &&
              row.operationalStatus === "inactive" ? (
                <button
                  type="button"
                  className={commercialGoldButton()}
                  onClick={() => onAction("reactivate")}
                >
                  Reactivate
                </button>
              ) : null}
              <a href={CARD3_PROMOTIONS_HREF} className={commercialOutlineButton()}>
                Configure in Property Setup
              </a>
              {onNavigateView ? (
                <button
                  type="button"
                  className={commercialOutlineButton()}
                  onClick={() => onNavigateView("commercial-history")}
                >
                  View History
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {tab === "scope" ? (
          <div className="space-y-3">
            <div className="space-y-2.5 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <Row label="Room types" value={row.roomScopeLabel} />
              <Row label="Rate plans" value={row.ratePlanScopeLabel} />
              <Row label="Full-stay required" value="Yes" />
              <Row
                label="Booking window"
                value={row.rowKind === "master" ? "—" : `${row.bookingFrom} – ${row.bookingTo}`}
              />
              <Row label="No stacking" value="Yes" />
              <Row label="Selection" value="Explicit" />
            </div>
            <p className="text-xs text-muted-foreground">
              Activation scope may narrow master scope.
            </p>
            {conditions ? (
              <div className="rounded-lg border border-[#E8E1D7] bg-white p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Property Setup Conditions
                </p>
                <p className="mt-1 text-sm text-[#251605]">{conditions}</p>
                <p className="mt-1 text-xs text-muted-foreground">{COMMERCIAL_CONDITIONS_NOTE}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {tab === "performance" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {performanceQuery.data?.periodLabel}. {COMMERCIAL_ATTRIBUTION_LABEL}.
            </p>
            <div className="space-y-2.5 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <Row
                label="Bookings"
                value={String(performanceQuery.data?.bookings ?? row.bookings)}
              />
              <Row
                label="Room nights"
                value={String(performanceQuery.data?.roomNights ?? row.roomNights)}
              />
              <Row
                label="Discount amount"
                value={money(performanceQuery.data?.discountAmount ?? row.discountAmount)}
              />
              <Row
                label="Post-promotion room revenue"
                value={money(
                  performanceQuery.data?.postPromotionRoomRevenue ?? row.postPromotionRoomRevenue,
                )}
              />
            </div>
          </div>
        ) : null}
        {tab === "activity" ? (
          <div className="space-y-2.5">
            {(historyQuery.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activation changes recorded for this promotion yet.
              </p>
            ) : (
              historyQuery.data?.rows.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="w-full rounded-lg border border-[#E8E1D7] bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-[#FBF8F3]"
                  onClick={() => setOperationId(event.operationId)}
                >
                  <p className="text-sm font-semibold text-[#251605]">
                    {commercialHistoryActionLabel(
                      event.actionType,
                      event.beforeState,
                      event.afterState,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()} ·{" "}
                    {commercialHistoryActorLabel(event)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {commercialHistoryReasonLabel(event.reason)}
                  </p>
                </button>
              ))
            )}
            {operationId && operationQuery.data ? (
              <div className="rounded-lg border border-[#E8E1D7] bg-white p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Operation detail
                </p>
                <p className="mt-1 text-sm font-medium text-[#251605]">
                  {commercialHistoryActionLabel(
                    operationQuery.data.actionType,
                    operationQuery.data.events[0]?.beforeState,
                    operationQuery.data.events[0]?.afterState,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {operationQuery.data.reason || "No reason provided"}
                </p>
              </div>
            ) : null}
            {onNavigateView ? (
              <button
                type="button"
                className={commercialOutlineButton()}
                onClick={() => onNavigateView("commercial-history")}
              >
                View full history
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-right text-sm font-medium text-[#251605]">{value}</p>
    </div>
  );
}
