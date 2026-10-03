import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Filter,
  Info,
  MoreHorizontal,
  Package,
  RotateCcw,
} from "lucide-react";

import { CARD3_PACKAGES_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { CommercialActivationWorkflow } from "../commercial-activation/commercial-activation-workflow";
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
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import {
  COMMERCIAL_PACKAGES_LOAD_ERROR,
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
import {
  PackageActivationActionSheet,
  type PackageActivationAction,
} from "../commercial/package-activation-action-sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { PackageDetailDrawer } from "./package-detail-drawer";
import { PackageStatusChip } from "./package-status-chip";

const PACKAGE_PAGE_SIZES = [10, 25, 50] as const;

function PackageKpiCard({
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
    <div className="flex min-w-0 items-center gap-3.5 rounded-xl border border-[#DDD4C5] bg-white px-3.5 py-3.5 shadow-sm">
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

export function PackagesView({
  restaurantId,
  context,
  access,
  roomTypes,
  ratePlans,
  onContextChange,
  onNavigateView,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  onContextChange?: ((patch: Partial<RevenueContext>) => void) | undefined;
  onNavigateView?: ((view: RevenueWorkspaceView) => void) | undefined;
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [intentOpen, setIntentOpen] = useState(false);
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; action: PackageActivationAction } | null>(
    null,
  );

  const visiblePlans = context.roomTypeId
    ? ratePlans.filter((plan) => plan.roomTypeId === context.roomTypeId)
    : ratePlans;

  const rows = useMemo(
    () => filterPackageRows(query.data?.rows ?? [], { search, status, packageType }),
    [query.data?.rows, search, status, packageType],
  );

  useEffect(() => {
    setPage(1);
  }, [
    search,
    status,
    packageType,
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

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]"
            />
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
  const hasActiveFilters =
    Boolean(search.trim()) ||
    status !== "all" ||
    packageType !== "all" ||
    Boolean(context.roomTypeId) ||
    Boolean(context.ratePlanId);

  function openActivate(packageId?: string) {
    setPendingPackageId(packageId ?? null);
    setIntentOpen(true);
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setPackageType("all");
    onContextChange?.({ roomTypeId: null, ratePlanId: null });
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#251605]">Packages</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Package masters and inclusions are owned in Property Setup; activations and stay windows
            are managed here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <button type="button" className={commercialGoldButton()} onClick={() => openActivate()}>
              Activate Package
            </button>
          ) : null}
          <a href={CARD3_PACKAGES_HREF} className={commercialOutlineButton()}>
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

      {!data.hasMasters ? (
        <InventoryState
          state="empty"
          title={PACKAGE_EMPTY_MASTERS}
          description="Open Property Setup to configure a package master before activating it here."
        />
      ) : (
        <>
          <section className="space-y-3" aria-label="Package performance summary">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <PackageKpiCard
                icon={Package}
                label="Active Packages"
                value={data.kpis.activePackages}
                tone="bg-[#EFECE6] text-[#423321]"
              />
              <PackageKpiCard
                icon={CalendarClock}
                label="Upcoming Packages"
                value={data.kpis.upcomingPackages}
                tone="bg-[#EFECE6] text-[#423321]"
              />
              <PackageKpiCard
                icon={Clock}
                label="Expiring Soon"
                value={data.kpis.expiringSoon}
                tone={
                  data.kpis.expiringSoon > 0
                    ? "bg-amber-50 text-amber-700"
                    : "bg-[#EFECE6] text-[#423321]"
                }
              />
              <PackageKpiCard
                icon={BedDouble}
                label="Package Bookings"
                value={data.kpis.packageBookings}
                tone="bg-[#EFECE6] text-[#423321]"
              />
              <PackageKpiCard
                icon={CircleDollarSign}
                label="Package Revenue"
                value={money(data.kpis.packageRevenue)}
                tone="bg-[#F4E9D0] text-[#8A641A]"
              />
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-[#F4E9D0] bg-[#FDF9F0] px-4 py-2.5 text-xs text-[#5A4833]">
              <Info className="size-4 shrink-0 text-[#C89933]" />
              <p className="leading-relaxed">
                {PACKAGE_PERFORMANCE_NOTE} · {PACKAGE_REVENUE_HELPER}
              </p>
            </div>
          </section>

          {!data.hasActivations ? (
            <InventoryState
              state="empty"
              title={PACKAGE_EMPTY_ACTIVATIONS}
              description="Activate a configured package from Property Setup using Activate Package."
            />
          ) : null}

          <div className="flex flex-wrap items-end gap-2.5 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3.5 shadow-sm">
            {onContextChange ? (
              <>
                <div className="min-w-36">
                  <label htmlFor="packages-from" className="text-xs font-semibold text-[#5A4833]">
                    From
                  </label>
                  <input
                    id="packages-from"
                    type="date"
                    value={context.fromDate}
                    onChange={(event) => onContextChange({ fromDate: event.target.value })}
                    className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
                  />
                </div>
                <div className="min-w-36">
                  <label htmlFor="packages-to" className="text-xs font-semibold text-[#5A4833]">
                    To
                  </label>
                  <input
                    id="packages-to"
                    type="date"
                    value={context.toDate}
                    onChange={(event) => onContextChange({ toDate: event.target.value })}
                    className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
                  />
                </div>
                <div className="min-w-40">
                  <label
                    htmlFor="packages-room-type"
                    className="text-xs font-semibold text-[#5A4833]"
                  >
                    Room Type
                  </label>
                  <select
                    id="packages-room-type"
                    value={context.roomTypeId ?? ""}
                    onChange={(event) =>
                      onContextChange({ roomTypeId: event.target.value || null })
                    }
                    aria-label="Room type"
                    className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
                  >
                    <option value="">All room types</option>
                    {roomTypes.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.active ? room.name : `${room.name} (inactive)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-44">
                  <label
                    htmlFor="packages-rate-plan"
                    className="text-xs font-semibold text-[#5A4833]"
                  >
                    Rate Plan
                  </label>
                  <select
                    id="packages-rate-plan"
                    value={context.ratePlanId ?? ""}
                    onChange={(event) =>
                      onContextChange({ ratePlanId: event.target.value || null })
                    }
                    aria-label="Rate plan"
                    className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
                  >
                    <option value="">All rate plans</option>
                    {visiblePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.active
                          ? `${plan.code} — ${plan.name}`
                          : `${plan.code} — ${plan.name} (inactive)`}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            <div className="min-w-36">
              <label htmlFor="packages-status" className="text-xs font-semibold text-[#5A4833]">
                Status
              </label>
              <select
                id="packages-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as PackageDisplayStatus | "all")}
                aria-label="Status"
                className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="expired">Expired</option>
                <option value="inactive">Inactive</option>
                <option value="not_activated">Not Activated</option>
              </select>
            </div>
            <div className="min-w-40">
              <label htmlFor="packages-type" className="text-xs font-semibold text-[#5A4833]">
                Package Type
              </label>
              <select
                id="packages-type"
                value={packageType}
                onChange={(event) => setPackageType(event.target.value)}
                aria-label="Package type"
                className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
              >
                <option value="all">All types</option>
                {PACKAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PACKAGE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-52 flex-1">
              <label htmlFor="packages-search" className="text-xs font-semibold text-[#5A4833]">
                Search packages
              </label>
              <input
                id="packages-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or code"
                aria-label="Search packages"
                className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-3 text-sm text-[#251605]"
              />
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#F7F4EE]"
                >
                  <RotateCcw className="size-3.5" />
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPage(1)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] shadow-xs transition-colors hover:bg-[#C89933]"
              >
                <Filter className="size-3.5" />
                Filter
              </button>
            </div>
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
                          {packageTypeLabel(row.type)}
                        </td>
                        <td className="px-3 py-2.5 text-sm font-medium text-[#251605]">
                          {money(row.configuredPrice)}
                        </td>
                        <td className="px-3 py-2.5">
                          <PackageStatusChip status={row.displayStatus} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#251605]">
                          {row.validFrom && row.validTo ? `${row.validFrom} – ${row.validTo}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[#251605]">{row.roomScopeLabel}</td>
                        <td className="px-3 py-2.5 text-xs text-[#251605]">
                          {row.ratePlanScopeLabel}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[#251605]">
                          {row.componentCount} components
                        </td>
                        <td className="px-3 py-2.5 text-sm text-[#251605]">{row.bookings}</td>
                        <td className="px-3 py-2.5 text-sm text-[#251605]">{money(row.revenue)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <PackageRowMenu
                            row={row}
                            canManage={canManage}
                            onView={() => setSelectedKey(row.rowKey)}
                            onAction={(next) =>
                              row.activationId && setAction({ id: row.activationId, action: next })
                            }
                            onActivate={() => openActivate(row.packageId)}
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
                        {row.validFrom && row.validTo ? (
                          <p className="text-xs text-muted-foreground">
                            {row.validFrom} – {row.validTo}
                          </p>
                        ) : null}
                      </div>
                      <div
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <PackageRowMenu
                          row={row}
                          canManage={canManage}
                          onView={() => setSelectedKey(row.rowKey)}
                          onAction={(next) =>
                            row.activationId && setAction({ id: row.activationId, action: next })
                          }
                          onActivate={() => openActivate(row.packageId)}
                          onNavigateView={onNavigateView}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <PackageStatusChip status={row.displayStatus} />
                    </div>
                    <p className="mt-2 text-xs text-[#251605]">
                      {packageTypeLabel(row.type)} · {money(row.configuredPrice)} ·{" "}
                      {row.componentCount} components
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
                    {PACKAGE_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} / page
                      </option>
                    ))}
                  </select>
                </div>
              </footer>
            </>
          )}
        </>
      )}

      <PackageDetailDrawer
        restaurantId={restaurantId}
        row={selected}
        context={context}
        canManage={canManage}
        currency={data.currency}
        onClose={() => setSelectedKey(null)}
        onAction={(next) =>
          selected?.activationId && setAction({ id: selected.activationId, action: next })
        }
        onActivate={() => selected && openActivate(selected.packageId)}
        onNavigateView={onNavigateView}
      />

      <CommercialActivationWorkflow
        open={intentOpen}
        onOpenChange={(next) => {
          setIntentOpen(next);
          if (!next) setPendingPackageId(null);
        }}
        restaurantId={restaurantId}
        canManage={canManage}
        source="packages"
        currency={data.currency}
        roomTypes={roomTypes}
        ratePlans={ratePlans}
        initialKind="package"
        initialPackageId={pendingPackageId}
        packageMasters={data.masters}
        onActivated={(result) => setSelectedKey(`activation:${result.activationId}`)}
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
  onNavigateView,
}: {
  row: PackageWorkspaceRow;
  canManage: boolean;
  onView: () => void;
  onAction: (action: PackageActivationAction) => void;
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
          <a href={CARD3_PACKAGES_HREF}>Configure in Property Setup</a>
        </DropdownMenuItem>
        {onNavigateView ? (
          <DropdownMenuItem onClick={() => onNavigateView("commercial-history")}>
            View History
          </DropdownMenuItem>
        ) : null}
        {canManage && row.kind === "master" ? (
          <DropdownMenuItem onClick={onActivate}>Activate</DropdownMenuItem>
        ) : null}
        {canManage &&
        row.kind === "activation" &&
        (row.displayStatus === "active" || row.displayStatus === "upcoming") ? (
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
