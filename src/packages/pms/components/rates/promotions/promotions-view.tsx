import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";

import { CARD3_PROMOTIONS_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
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
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { COMMERCIAL_PROMOTIONS_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { CommercialStatusChip } from "../commercial/commercial-status-chip";
import { PromotionActivationActionSheet, type PromotionActivationAction } from "../commercial/promotion-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { PromotionDetailDrawer } from "./promotion-detail-drawer";

export function PromotionsView({
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
  onNavigateView?: (view: RevenueWorkspaceView) => void;
}) {
  const canManage = access.canViewCommercial;
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PromotionDisplayStatus | "all">("all");
  const [kind, setKind] = useState<CommercialPromoKind | "all">("all");
  const [intentOpen, setIntentOpen] = useState(false);
  const [pendingPromotionId, setPendingPromotionId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; action: PromotionActivationAction } | null>(null);

  const rows = useMemo(
    () => filterPromotionRows(query.data?.rows ?? [], { search, status, kind }),
    [query.data?.rows, search, status, kind],
  );
  const selected =
    rows.find((row) => row.rowKey === selectedKey) ??
    query.data?.rows.find((row) => row.rowKey === selectedKey) ??
    null;

  function openActivate(promotionId?: string) {
    setPendingPromotionId(promotionId ?? null);
    setIntentOpen(true);
  }

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
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-[#251605]">Promotions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage where and when configured promotions are active.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <button type="button" className={commercialGoldButton()} onClick={() => openActivate()}>
                  Activate Promotion
                </button>
              ) : null}
              <a href={CARD3_PROMOTIONS_HREF} className={commercialOutlineButton()}>
                View Property Setup
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl border border-[#E8E1D7] bg-card p-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or code"
              aria-label="Search promotions"
              className="h-8 min-w-40 flex-1 rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as PromotionDisplayStatus | "all")}
              aria-label="Status"
              className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
              <option value="not_activated">Not Activated</option>
            </select>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as CommercialPromoKind | "all")}
              aria-label="Promotion kind"
              className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
            >
              <option value="all">All kinds</option>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed Amount</option>
              <option value="free_night">Free Night</option>
            </select>
          </div>

          {data.rows.length === 0 ? (
            <InventoryState
              state="empty"
              title={COMMERCIAL_EMPTY_COPY}
              description="Activate a configured promotion from Property Setup using Activate Promotion."
            />
          ) : rows.length === 0 ? (
            <InventoryState state="empty" title="No promotions match these filters." />
          ) : (
            <>
              <div className="hidden overflow-auto rounded-xl border border-[#E8E1D7] bg-card md:block">
                <table className="min-w-max w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
                      {["Promotion", "Kind", "Value", "Status", "Stay Window", "Booking Window", "Room Scope", "Rate Plan Scope", "Priority", "Bookings", "Discount", "Updated", "Actions"].map((label) => (
                        <th key={label} className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.rowKey}
                        className={selectedKey === row.rowKey ? "border-t border-[#E8E1D7] bg-[#F8F1E5]" : "border-t border-[#E8E1D7]"}
                      >
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                          <button type="button" className="text-left" onClick={() => setSelectedKey(row.rowKey)}>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-muted-foreground">{row.code}</p>
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                          {commercialKindLabel(row.kind)}
                          {!row.executable ? (
                            <p className="text-[9px] text-[#6B4A0A]">Unsupported for activation</p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{commercialValueLabel(row.kind, row.value, money)}</td>
                        <td className="px-2 py-1.5">
                          {row.displayStatus === "not_activated" ? (
                            <span className="inline-flex rounded-full border border-[#DED7CD] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6B4A0A]">
                              {commercialStatusLabel(row.displayStatus)}
                            </span>
                          ) : (
                            <CommercialStatusChip status={row.operationalStatus} overlap={row.overlap} />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                          {row.rowKind === "master" ? `${row.validFrom} – ${row.validTo}` : `${row.validFrom} – ${row.validTo}`}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                          {row.rowKind === "master" ? "—" : `${row.bookingFrom} – ${row.bookingTo}`}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.roomScopeLabel}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.ratePlanScopeLabel}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.rowKind === "master" ? "—" : row.priority}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.bookings}</td>
                        <td className="px-2 py-1.5 text-[10px] text-[#251605]">{money(row.discountAmount)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <PromotionRowMenu
                            row={row}
                            canManage={canManage}
                            onView={() => setSelectedKey(row.rowKey)}
                            onAction={(next) => row.activationId && setAction({ id: row.activationId, action: next })}
                            onActivate={() => openActivate(row.promotionId)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <article key={row.rowKey} className="rounded-xl border border-[#E8E1D7] bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" className="text-left" onClick={() => setSelectedKey(row.rowKey)}>
                        <p className="text-sm font-semibold text-[#251605]">{row.name}</p>
                        <p className="text-[10px] text-muted-foreground">{row.code}</p>
                      </button>
                      <PromotionRowMenu
                        row={row}
                        canManage={canManage}
                        onView={() => setSelectedKey(row.rowKey)}
                        onAction={(next) => row.activationId && setAction({ id: row.activationId, action: next })}
                        onActivate={() => openActivate(row.promotionId)}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.displayStatus === "not_activated" ? (
                        <span className="inline-flex rounded-full border border-[#DED7CD] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6B4A0A]">
                          {commercialStatusLabel(row.displayStatus)}
                        </span>
                      ) : (
                        <CommercialStatusChip status={row.operationalStatus} overlap={row.overlap} />
                      )}
                      {!row.executable ? (
                        <span className="rounded-full border border-[#DED7CD] px-2 py-0.5 text-[10px] text-[#6B4A0A]">
                          Not available in V1
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[10px] text-[#251605]">
                      {commercialKindLabel(row.kind)} · {commercialValueLabel(row.kind, row.value, money)} · {row.validFrom} – {row.validTo}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
        <PromotionDetailDrawer
          restaurantId={restaurantId}
          row={selected}
          context={context}
          canManage={canManage}
          currency={data.currency}
          onClose={() => setSelectedKey(null)}
          onAction={(next) => selected?.activationId && setAction({ id: selected.activationId, action: next })}
          onActivate={() => selected && openActivate(selected.promotionId)}
          onNavigateView={onNavigateView}
        />
      </div>

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
}: {
  row: PromotionWorkspaceRow;
  canManage: boolean;
  onView: () => void;
  onAction: (action: PromotionActivationAction) => void;
  onActivate: () => void;
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
        <DropdownMenuItem asChild>
          <a href={CARD3_PROMOTIONS_HREF}>View in Property Setup</a>
        </DropdownMenuItem>
        {canManage && row.rowKind === "master" ? (
          <DropdownMenuItem onClick={onActivate}>Activate</DropdownMenuItem>
        ) : null}
        {canManage && row.rowKind === "activation" && row.executable && (row.operationalStatus === "active" || row.operationalStatus === "upcoming") ? (
          <>
            <DropdownMenuItem onClick={() => onAction("edit")}>Edit Activation</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("deactivate")}>Deactivate</DropdownMenuItem>
          </>
        ) : null}
        {canManage && row.rowKind === "activation" && row.executable && row.operationalStatus === "inactive" ? (
          <DropdownMenuItem onClick={() => onAction("reactivate")}>Reactivate</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
