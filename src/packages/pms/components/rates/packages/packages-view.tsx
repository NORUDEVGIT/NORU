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
  MoreHorizontal,
  Package,
} from "lucide-react";

import { CARD3_PACKAGES_HREF, withReturnTo } from "@/packages/pms/lib/pms-property-setup-card3";
import { CommercialActivationWorkflow } from "../commercial-activation/commercial-activation-workflow";
import { PACKAGE_TYPES, PACKAGE_TYPE_LABELS } from "@/packages/pms/lib/pms-set3-rates-guest";
import { getPackagesWorkspace } from "@/packages/pms/lib/revenue/commercial-packages.functions";
import {
  filterPackageRows,
  PACKAGE_EMPTY_ACTIVATIONS,
  PACKAGE_EMPTY_MASTERS,
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
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import { useRateRevenueExtras } from "../rate-revenue-shell-slots";
import { PackageDetailDrawer } from "./package-detail-drawer";
import { PackageStatusChip } from "./package-status-chip";

const PACKAGE_PAGE_SIZES = [10, 25, 50] as const;

const PACKAGE_STATUS_OPTIONS: ReadonlyArray<readonly [PackageDisplayStatus | "all", string]> = [
  ["all", "All statuses"],
  ["active", "Active"],
  ["upcoming", "Upcoming"],
  ["expired", "Expired"],
  ["inactive", "Inactive"],
  ["not_activated", "Not Activated"],
];

export function PackagesView({
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
  const search = searchQuery;
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

  function openActivate(packageId?: string) {
    setPendingPackageId(packageId ?? null);
    setIntentOpen(true);
  }

  const packageKpis = query.data?.kpis;
  const kpiMoney = (value: number) => formatHistoryMoney(value, query.data?.currency ?? "");

  useRateRevenueExtras({
    searchPlaceholder: "Search name or code",
    filters: [
      {
        id: "packages-status",
        label: "Status",
        value: status,
        current: PACKAGE_STATUS_OPTIONS.find(([id]) => id === status && id !== "all")?.[1] ?? "",
        options: PACKAGE_STATUS_OPTIONS,
        onChange: (value) => setStatus(value as PackageDisplayStatus | "all"),
      },
      {
        id: "packages-type",
        label: "Package Type",
        value: packageType,
        current:
          packageType === "all"
            ? ""
            : (PACKAGE_TYPE_LABELS[packageType as (typeof PACKAGE_TYPES)[number]] ?? packageType),
        options: [
          ["all", "All types"] as const,
          ...PACKAGE_TYPES.map((type) => [type, PACKAGE_TYPE_LABELS[type]] as const),
        ],
        onChange: (value) => setPackageType(value),
      },
    ],
    actions: [
      ...(canManage
        ? [{ id: "activate-package", label: "Activate Package", onSelect: () => openActivate() }]
        : []),
      ...(onNavigateView
        ? [
            {
              id: "packages-history",
              label: "View History",
              onSelect: () => onNavigateView("commercial-history"),
            },
          ]
        : []),
      {
        id: "packages-configure",
        label: "Configure in Property Setup",
        onSelect: () =>
          window.location.assign(
            withReturnTo(CARD3_PACKAGES_HREF, "/restaurant/pms/rates-revenue?view=packages"),
          ),
      },
    ],
    kpis: packageKpis
      ? [
          { label: "Active Packages", value: String(packageKpis.activePackages), icon: Package },
          {
            label: "Upcoming Packages",
            value: String(packageKpis.upcomingPackages),
            icon: CalendarClock,
          },
          {
            label: "Expiring Soon",
            value: String(packageKpis.expiringSoon),
            icon: Clock,
            tone:
              packageKpis.expiringSoon > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-[#EFECE6] text-[#423321]",
          },
          {
            label: "Package Bookings",
            value: String(packageKpis.packageBookings),
            icon: BedDouble,
          },
          {
            label: "Package Revenue",
            value: kpiMoney(packageKpis.packageRevenue),
            icon: CircleDollarSign,
          },
        ]
      : undefined,
    onClear: () => {
      setStatus("all");
      setPackageType("all");
      setPage(1);
    },
  });

  if (query.isLoading) {
    return (
      <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
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

  return (
    <div className="space-y-3">
      {!data.hasMasters ? (
        <InventoryState state="empty" title={PACKAGE_EMPTY_MASTERS} />
      ) : (
        <>
          {rows.length === 0 ? (
            <InventoryState
              state="empty"
              title={
                data.hasActivations ? "No packages match these filters." : PACKAGE_EMPTY_ACTIVATIONS
              }
            />
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
          <a href={withReturnTo(CARD3_PACKAGES_HREF, "/restaurant/pms/rates-revenue?view=packages")}>
            Configure in Property Setup
          </a>
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
