import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";

import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { PACKAGE_TYPES, PACKAGE_TYPE_LABELS } from "@/packages/pms/lib/pms-set3-rates-guest";
import { getPackagesWorkspace } from "@/packages/pms/lib/revenue/commercial-packages.functions";
import {
  filterPackageRows,
  PACKAGE_EMPTY_ACTIVATIONS,
  PACKAGE_EMPTY_MASTERS,
  PACKAGE_PERFORMANCE_NOTE,
  PACKAGE_REVENUE_HELPER,
  packageTypeLabel,
  type PackageDisplayStatus,
  type PackageWorkspaceRow,
} from "@/packages/pms/lib/revenue/commercial-packages-ui";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { COMMERCIAL_PACKAGES_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { InventoryMetric, InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { CommercialActivationIntentSheet } from "../commercial/commercial-activation-intent-sheet";
import { PackageActivationActionSheet, type PackageActivationAction } from "../commercial/package-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import { PackageDetailDrawer } from "./package-detail-drawer";
import { PackageStatusChip } from "./package-status-chip";

export function PackagesView({
  restaurantId,
  context,
  access,
  roomTypes,
  ratePlans,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
}) {
  const canManage = access.canViewCommercial;
  const fetchPackages = useServerFn(getPackagesWorkspace);
  const query = useQuery({
    queryKey: [
      "commercial-packages",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchPackages({
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
  const [status, setStatus] = useState<PackageDisplayStatus | "all">("all");
  const [packageType, setPackageType] = useState<string | "all">("all");
  const [intentOpen, setIntentOpen] = useState(false);
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; action: PackageActivationAction } | null>(null);

  const rows = useMemo(
    () => filterPackageRows(query.data?.rows ?? [], { search, status, packageType }),
    [query.data?.rows, search, status, packageType],
  );
  const selected =
    rows.find((row) => row.rowKey === selectedKey) ??
    query.data?.rows.find((row) => row.rowKey === selectedKey) ??
    null;

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
          ))}
        </div>
        <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
        <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <InventoryState
        state="error"
        title={COMMERCIAL_PACKAGES_LOAD_ERROR}
        description={revenueUiError(query.error, COMMERCIAL_PACKAGES_LOAD_ERROR)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;
  const money = (value: number) => formatHistoryMoney(value, data.currency);

  function openActivate(packageId?: string) {
    setPendingPackageId(packageId ?? null);
    setIntentOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-[#251605]">Packages</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage where and when configured packages are available.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <button type="button" className={commercialGoldButton()} onClick={() => openActivate()}>
                  Activate Package
                </button>
              ) : null}
              <a href={CARD3_HREF} className={commercialOutlineButton()}>
                View Property Setup
              </a>
            </div>
          </div>

          {!data.hasMasters ? (
            <InventoryState
              state="empty"
              title={PACKAGE_EMPTY_MASTERS}
              description="Open Property Setup to configure a package master before activating it here."
            />
          ) : (
            <>
              <section className="space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <InventoryMetric label="Active Packages" value={data.kpis.activePackages} detail="Valid today" />
                  <InventoryMetric label="Upcoming Packages" value={data.kpis.upcomingPackages} detail="Starts after today" />
                  <InventoryMetric label="Expiring Soon" value={data.kpis.expiringSoon} detail="Ends within 7 days" />
                  <InventoryMetric label="Package Bookings" value={data.kpis.packageBookings} detail={PACKAGE_PERFORMANCE_NOTE} />
                  <InventoryMetric label="Package Revenue" value={money(data.kpis.packageRevenue)} detail={PACKAGE_REVENUE_HELPER} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {PACKAGE_PERFORMANCE_NOTE} {PACKAGE_REVENUE_HELPER}
                </p>
              </section>

              {!data.hasActivations ? (
                <InventoryState
                  state="empty"
                  title={PACKAGE_EMPTY_ACTIVATIONS}
                  description="Activate a configured package from Property Setup when the activation workflow is ready."
                />
              ) : null}

              <div className="flex flex-wrap gap-2 rounded-xl border border-[#E8E1D7] bg-card p-3">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or code"
                  aria-label="Search packages"
                  className="h-8 min-w-40 flex-1 rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
                />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as PackageDisplayStatus | "all")}
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
                  value={packageType}
                  onChange={(event) => setPackageType(event.target.value)}
                  aria-label="Package type"
                  className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
                >
                  <option value="all">All types</option>
                  {PACKAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PACKAGE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              {rows.length === 0 ? (
                <InventoryState state="empty" title="No packages match these filters." />
              ) : (
                <>
                  <div className="hidden overflow-auto rounded-xl border border-[#E8E1D7] bg-card md:block">
                    <table className="min-w-max w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
                          {[
                            "Package",
                            "Type",
                            "Configured Price",
                            "Status",
                            "Stay Window",
                            "Room Scope",
                            "Rate Plan Scope",
                            "Components",
                            "Bookings",
                            "Revenue",
                            "Updated",
                            "Actions",
                          ].map((label) => (
                            <th
                              key={label}
                              className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.rowKey}
                            className={
                              selectedKey === row.rowKey
                                ? "border-t border-[#E8E1D7] bg-[#F8F1E5]"
                                : "border-t border-[#E8E1D7]"
                            }
                          >
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                              <button type="button" className="text-left" onClick={() => setSelectedKey(row.rowKey)}>
                                <p className="font-medium">{row.name}</p>
                                <p className="text-muted-foreground">{row.code}</p>
                                {row.validFrom && row.validTo ? (
                                  <p className="text-muted-foreground">
                                    {row.validFrom} – {row.validTo}
                                  </p>
                                ) : null}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{packageTypeLabel(row.type)}</td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{money(row.configuredPrice)}</td>
                            <td className="px-2 py-1.5">
                              <PackageStatusChip status={row.displayStatus} />
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                              {row.validFrom && row.validTo ? `${row.validFrom} – ${row.validTo}` : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.roomScopeLabel}</td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.ratePlanScopeLabel}</td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.componentCount} components</td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.bookings}</td>
                            <td className="px-2 py-1.5 text-[10px] text-[#251605]">{money(row.revenue)}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                              {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              <PackageRowMenu
                                row={row}
                                canManage={canManage}
                                onView={() => setSelectedKey(row.rowKey)}
                                onAction={(next) => row.activationId && setAction({ id: row.activationId, action: next })}
                                onActivate={() => openActivate(row.packageId)}
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
                            {row.validFrom && row.validTo ? (
                              <p className="text-[10px] text-muted-foreground">
                                {row.validFrom} – {row.validTo}
                              </p>
                            ) : null}
                          </button>
                          <PackageRowMenu
                            row={row}
                            canManage={canManage}
                            onView={() => setSelectedKey(row.rowKey)}
                            onAction={(next) => row.activationId && setAction({ id: row.activationId, action: next })}
                            onActivate={() => openActivate(row.packageId)}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <PackageStatusChip status={row.displayStatus} />
                        </div>
                        <p className="mt-2 text-[10px] text-[#251605]">
                          {packageTypeLabel(row.type)} · {money(row.configuredPrice)} · {row.componentCount} components
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <PackageDetailDrawer
          restaurantId={restaurantId}
          row={selected}
          context={context}
          canManage={canManage}
          currency={data.currency}
          onClose={() => setSelectedKey(null)}
          onAction={(next) => selected?.activationId && setAction({ id: selected.activationId, action: next })}
          onActivate={() => selected && openActivate(selected.packageId)}
        />
      </div>

      <CommercialActivationIntentSheet
        open={intentOpen}
        title="Activate Package"
        entity="package"
        canManage={canManage}
        masters={data.masters}
        currency={data.currency}
        selectedPackageId={pendingPackageId}
        onSelectPackage={setPendingPackageId}
        onClose={() => {
          setIntentOpen(false);
          setPendingPackageId(null);
        }}
        onChoosePromotion={() => setIntentOpen(false)}
      />
      {action ? (
        <PackageActivationActionSheet
          restaurantId={restaurantId}
          activationId={action.id}
          action={action.action}
          canManage={canManage}
          currency={data.currency}
          roomTypes={roomTypes}
          ratePlans={ratePlans}
          onClose={() => setAction(null)}
        />
      ) : null}
    </div>
  );
}

function PackageRowMenu({
  row,
  canManage,
  onView,
  onAction,
  onActivate,
}: {
  row: PackageWorkspaceRow;
  canManage: boolean;
  onView: () => void;
  onAction: (action: PackageActivationAction) => void;
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
          <a href={CARD3_HREF}>View in Property Setup</a>
        </DropdownMenuItem>
        {canManage && row.kind === "master" ? (
          <DropdownMenuItem onClick={onActivate}>Activate</DropdownMenuItem>
        ) : null}
        {canManage && row.kind === "activation" && (row.displayStatus === "active" || row.displayStatus === "upcoming") ? (
          <>
            <DropdownMenuItem onClick={() => onAction("edit")}>Edit Activation</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("deactivate")}>Deactivate</DropdownMenuItem>
          </>
        ) : null}
        {canManage && row.kind === "activation" && row.displayStatus === "inactive" ? (
          <DropdownMenuItem onClick={() => onAction("reactivate")}>Reactivate</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
