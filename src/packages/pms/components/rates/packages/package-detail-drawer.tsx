import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { getCommercialOperationDetail, listCommercialChangeHistory } from "@/packages/pms/lib/revenue/commercial-history.functions";
import {
  commercialHistoryActionLabel,
  commercialHistoryActorLabel,
  commercialHistoryReasonLabel,
} from "@/packages/pms/lib/revenue/commercial-history";
import { getPackagePerformanceSummary } from "@/packages/pms/lib/revenue/commercial-packages.functions";
import {
  PACKAGE_CHARGE_BASIS_LABEL,
  PACKAGE_PERFORMANCE_NOTE,
  PACKAGE_REVENUE_HELPER,
  packageComponentLabel,
  packageComponentTypeLabel,
  packageTypeLabel,
  type PackageWorkspaceRow,
} from "@/packages/pms/lib/revenue/commercial-packages-ui";
import { getPackageActivationDetail } from "@/packages/pms/lib/revenue/commercial-package-activation.functions";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import type { PackageActivationAction } from "../commercial/package-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import { PackageStatusChip } from "./package-status-chip";

type DrawerTab = "overview" | "scope" | "performance" | "activity";

export function PackageDetailDrawer({
  restaurantId,
  row,
  context,
  canManage,
  currency,
  onClose,
  onAction,
  onActivate,
}: {
  restaurantId: string;
  row: PackageWorkspaceRow | null;
  context: RevenueContext;
  canManage: boolean;
  currency: string;
  onClose: () => void;
  onAction: (action: PackageActivationAction) => void;
  onActivate: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const body = (
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
    />
  );

  return (
    <>
      <aside className="hidden min-h-[32rem] overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] xl:block">
        {body}
      </aside>
      <Sheet open={Boolean(row)} onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 xl:hidden">
          {body}
        </SheetContent>
      </Sheet>
    </>
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
}: {
  restaurantId: string;
  row: PackageWorkspaceRow | null;
  context: RevenueContext;
  canManage: boolean;
  currency: string;
  tab: DrawerTab;
  setTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onAction: (action: PackageActivationAction) => void;
  onActivate: () => void;
}) {
  const fetchDetail = useServerFn(getPackageActivationDetail);
  const fetchPerformance = useServerFn(getPackagePerformanceSummary);
  const fetchHistory = useServerFn(listCommercialChangeHistory);
  const fetchOperation = useServerFn(getCommercialOperationDetail);
  const [operationId, setOperationId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["package-activation-detail", restaurantId, row?.activationId ?? null],
    queryFn: () => fetchDetail({ data: { restaurantId, activationId: row!.activationId! } }),
    enabled: Boolean(row?.activationId),
    retry: false,
  });
  const performanceQuery = useQuery({
    queryKey: [
      "package-performance",
      restaurantId,
      row?.activationId ?? null,
      row?.packageId ?? null,
      context.fromDate,
      context.toDate,
    ],
    queryFn: () =>
      fetchPerformance({
        data: {
          restaurantId,
          activationId: row?.activationId ?? undefined,
          packageId: row?.kind === "master" ? row.packageId : undefined,
          fromDate: context.fromDate,
          toDate: context.toDate,
        },
      }),
    enabled: Boolean(row),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["commercial-activation-history", restaurantId, row?.activationId ?? null],
    queryFn: () =>
      fetchHistory({
        data: {
          restaurantId,
          entityType: "package_activation",
          entityId: row!.activationId!,
          page: 1,
          pageSize: 8,
        },
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
      <div className="flex h-full min-h-[20rem] items-center justify-center px-4 text-center text-xs text-muted-foreground">
        Select a package activation to review details.
      </div>
    );
  }

  const money = (value: number) => formatHistoryMoney(value, currency);
  const tabs: Array<{ id: DrawerTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "scope", label: "Scope & Components" },
    { id: "performance", label: "Performance" },
    { id: "activity", label: "Activity" },
  ];
  const snapshotPrice = row.configuredPrice;
  const showMasterPrice = row.kind === "activation" && row.masterPrice !== row.configuredPrice;
  const components = detailQuery.data?.components ?? row.components;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Package Detail
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{row.name}</h3>
          <p className="text-xs text-muted-foreground">{row.code}</p>
          {row.validFrom && row.validTo ? (
            <p className="text-[10px] text-muted-foreground">
              {row.validFrom} – {row.validTo}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-[#E8E1D7]" aria-label="Close">
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
              "h-9 px-2 text-[11px] font-medium",
              tab === item.id ? "border-b-2 border-[#C89933] text-[#6B4A0A]" : "text-muted-foreground hover:text-[#251605]",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "overview" ? (
          <div className="space-y-3">
            <PackageStatusChip status={row.displayStatus} />
            <Row label="Type" value={packageTypeLabel(row.type)} />
            <Row label="Configured Price" value={money(snapshotPrice)} />
            {showMasterPrice ? <Row label="Current master price" value={money(row.masterPrice)} /> : null}
            <Row label="Charge basis" value={PACKAGE_CHARGE_BASIS_LABEL} />
            <Row label="Master status" value={row.masterActive ? "Active" : "Inactive"} />
            <Row label="Stay window" value={row.validFrom && row.validTo ? `${row.validFrom} – ${row.validTo}` : "—"} />
            <Row label="Created" value={row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"} />
            <Row label="Updated" value={row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"} />
            <div className="flex flex-wrap gap-2 pt-2">
              {row.kind === "master" && canManage ? (
                <button type="button" className={commercialGoldButton()} onClick={onActivate}>
                  Activate
                </button>
              ) : null}
              {canManage && row.kind === "activation" && (row.displayStatus === "active" || row.displayStatus === "upcoming") ? (
                <>
                  <button type="button" className={commercialGoldButton()} onClick={() => onAction("edit")}>
                    Edit Activation
                  </button>
                  <button type="button" className={commercialOutlineButton()} onClick={() => onAction("deactivate")}>
                    Deactivate
                  </button>
                </>
              ) : null}
              {canManage && row.kind === "activation" && row.displayStatus === "inactive" ? (
                <button type="button" className={commercialGoldButton()} onClick={() => onAction("reactivate")}>
                  Reactivate
                </button>
              ) : null}
              <a href={CARD3_HREF} className={commercialOutlineButton()}>
                View in Property Setup
              </a>
            </div>
          </div>
        ) : null}
        {tab === "scope" ? (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Master defines identity and components. Activation sets the stay window and may narrow scope.
            </p>
            <Row label="Room types" value={row.roomScopeLabel} />
            <Row label="Rate plans" value={row.ratePlanScopeLabel} />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Included Components
              </p>
              {components.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.kind === "master" ? `${row.componentCount} configured on the master.` : "No components on this activation snapshot."}
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {components.map((component, index) => (
                    <li key={`${component.componentId ?? component.label}-${index}`} className="text-xs text-[#251605]">
                      {packageComponentLabel(component)}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {packageComponentTypeLabel(component.componentType)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
        {tab === "performance" ? (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              {performanceQuery.data?.periodLabel ?? PACKAGE_PERFORMANCE_NOTE} {PACKAGE_REVENUE_HELPER}
            </p>
            <Row label="Package Bookings" value={String(performanceQuery.data?.bookings ?? row.bookings)} />
            <Row label="Package Revenue" value={money(performanceQuery.data?.revenue ?? row.revenue)} />
            <Row
              label="Average Applied Amount"
              value={money(performanceQuery.data?.averageAppliedAmount ?? row.averageAppliedAmount)}
            />
          </div>
        ) : null}
        {tab === "activity" ? (
          <div className="space-y-2">
            {row.kind === "master" || (historyQuery.data?.rows ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No activation changes recorded for this package yet.</p>
            ) : (
              historyQuery.data?.rows.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="w-full rounded-lg border border-[#E8E1D7] bg-white px-3 py-2 text-left"
                  onClick={() => setOperationId(event.operationId)}
                >
                  <p className="text-[11px] font-medium text-[#251605]">{commercialHistoryActionLabel(event.actionType)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()} · {commercialHistoryActorLabel(event)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{commercialHistoryReasonLabel(event.reason)}</p>
                </button>
              ))
            )}
            {operationId && operationQuery.data ? (
              <div className="rounded-lg border border-[#E8E1D7] bg-white p-3">
                <p className="text-[11px] font-semibold text-[#251605]">Operation detail</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{commercialHistoryActionLabel(operationQuery.data.actionType)}</p>
                <p className="text-[10px] text-muted-foreground">{operationQuery.data.reason || "No reason provided"}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs text-[#251605]">{value}</p>
    </div>
  );
}
