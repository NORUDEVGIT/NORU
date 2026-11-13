import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  CheckCircle2,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { GuestProfileShellSlot } from "@/packages/pms/components/guests/guest-profile-shell-slots";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import { GuestGroupCreateModal } from "@/packages/pms/components/guests/guest-group-create-modal";
import { DIRECTORY_HEAD_CLASS, DirectoryPager } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  GUEST_ACCOUNT_STATUSES,
  accountListItems,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  LISTING_DEFAULT_PAGE_SIZE,
  LISTING_PAGE_SIZES,
  displayProfileNumber,
  listingCreateAllowed,
} from "@/packages/pms/lib/guest-profile-listing";
import { guestAccountAccess } from "@/packages/pms/lib/guest-account-access";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";
import { csvEscape } from "@/packages/pms/lib/guest-companies-workspace";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { cn } from "@/shared/lib/utils";

const ALL = "all";

function GroupKpiCard({
  label,
  value,
  hint,
  loading,
  icon,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value?: number | null | undefined;
  hint?: string | undefined;
  loading?: boolean | undefined;
  icon: React.ReactNode;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-3 text-left shadow-sm transition-colors hover:bg-[#FBF7F1]",
        active ? "border-[#C89933]" : "border-[#DDD4C5]",
      )}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-14" />
        ) : (
          <p className="font-display text-xl font-bold leading-tight tracking-tight text-[#251605]">
            {value != null ? value.toLocaleString() : "—"}
          </p>
        )}
        {hint ? <p className="truncate text-[9px] text-[#8C827A]">{hint}</p> : null}
      </div>
    </button>
  );
}

export function GuestGroupDirectory({
  membership,
  returnCard,
  embedded = false,
  statusValue,
  onStatusChange,
}: {
  membership: RestaurantMembership;
  returnCard?: GuestProfileCardId | undefined;
  embedded?: boolean;
  statusValue?: "all" | (typeof GUEST_ACCOUNT_STATUSES)[number];
  onStatusChange?: (status: "all" | (typeof GUEST_ACCOUNT_STATUSES)[number]) => void;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchAccounts = useServerFn(listGuestAccounts);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusState, setStatusState] = useState<"all" | (typeof GUEST_ACCOUNT_STATUSES)[number]>(ALL);
  const status = statusValue ?? statusState;
  function setStatus(next: "all" | (typeof GUEST_ACCOUNT_STATUSES)[number]) {
    if (onStatusChange) onStatusChange(next);
    else setStatusState(next);
  }
  const [groupTypeId, setGroupTypeId] = useState<string>(ALL);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof LISTING_PAGE_SIZES)[number]>(
    LISTING_DEFAULT_PAGE_SIZE,
  );

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // 300ms search debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [status, groupTypeId, pageSize]);

  const permissions = usePmsPermissions(restaurantId);
  const accountAccess = guestAccountAccess({
    isOwner: permissions.isOwner,
    codes: permissions.permissions,
  });
  const canPrintExport =
    !permissions.isLoading &&
    (permissions.isOwner || permissions.can(PMS_PERMISSIONS.GUEST_PROFILE_PRINT));
  const offset = page * pageSize;

  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: accountAccess.canView && !permissions.isLoading,
    staleTime: 60_000,
  });

  const queryKey = [
    "guest-accounts",
    restaurantId,
    "group",
    debouncedSearch,
    status,
    pageSize,
    offset,
  ];

  const accountsQuery = useQuery({
    queryKey,
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType: "group",
          search: debouncedSearch.trim() || undefined,
          status:
            status !== ALL && GUEST_ACCOUNT_STATUSES.includes(status as never)
              ? (status as (typeof GUEST_ACCOUNT_STATUSES)[number])
              : undefined,
          limit: pageSize,
          offset,
        },
      }),
    enabled: accountAccess.canView && !permissions.isLoading,
  });

  // KPI Query
  const kpiQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, "group", "kpi-counts"],
    queryFn: async () => {
      const [allRes, draftRes, confRes, cancRes] = await Promise.all([
        fetchAccounts({ data: { restaurantId, accountType: "group", limit: 1, offset: 0 } }),
        fetchAccounts({ data: { restaurantId, accountType: "group", status: "pending", limit: 1, offset: 0 } }),
        fetchAccounts({ data: { restaurantId, accountType: "group", status: "active", limit: 1, offset: 0 } }),
        fetchAccounts({ data: { restaurantId, accountType: "group", status: "inactive", limit: 1, offset: 0 } }),
      ]);
      return {
        total: allRes.total,
        draft: draftRes.total,
        confirmed: confRes.total,
        cancelled: cancRes.total,
      };
    },
    enabled: accountAccess.canView && !permissions.isLoading,
    staleTime: 30_000,
  });

  const rawRows = accountListItems(accountsQuery.data?.items ?? []);
  const groupTypes = configQuery.data?.groupTypes ?? [];
  const groupTypeMap = new Map(groupTypes.map((gt) => [gt.id, gt.name]));

  // Filter client-side by groupTypeId if server accounts didn't filter it directly
  const rows = groupTypeId === ALL
    ? rawRows
    : rawRows.filter((r) => r.groupTypeId === groupTypeId);

  const totalCount = accountsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const canCreate =
    accountAccess.canCreate && listingCreateAllowed("group", configQuery.data);

  function openGroup(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ type: "group" }),
    });
  }

  function handleClear() {
    setSearch("");
    setDebouncedSearch("");
    setStatus(ALL);
    setGroupTypeId(ALL);
    setPage(0);
  }

  function runExport() {
    if (!canPrintExport) return;
    const header = [
      "Profile No.",
      "Group Name",
      "Group Type",
      "Primary Contact",
      "Company",
      "Travel Agency",
      "Members",
      "Status",
    ];
    const lines = [header.join(",")];
    for (const row of rows) {
      const typeName = row.groupTypeId ? groupTypeMap.get(row.groupTypeId) : null;
      lines.push(
        [
          csvEscape(displayProfileNumber(row.id, row.code)),
          csvEscape(row.name),
          csvEscape(typeName ?? ""),
          csvEscape(row.primaryContactName),
          csvEscape(row.companyMasterName ?? ""),
          csvEscape(row.travelAgentMasterName ?? ""),
          csvEscape(row.memberCount != null ? String(row.memberCount) : ""),
          csvEscape(groupStatusLabel(row.accountStatus)),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "groups.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (permissions.isLoading) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }
  if (!accountAccess.canView) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="group-directory">
        <h2 className="font-display text-xl">Groups</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to open guest accounts for this property.
        </p>
      </div>
    );
  }

  const hasActiveFilters = Boolean(search || status !== ALL || groupTypeId !== ALL);
  const groupFilterCount = (status !== ALL ? 1 : 0) + (groupTypeId !== ALL ? 1 : 0);
  const groupSearchField = (
    <div className={cn("relative min-w-0", embedded ? "w-full" : "min-w-[200px] flex-1")}>
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search group, code, contact…"
        className="h-9 border-[#DDD4C5] bg-white pl-8 pr-8 text-xs"
        aria-label="Search groups"
        data-testid="group-search-input"
      />
    </div>
  );
  const groupFilterMenu = (
    <PmsFilterMenu
      activeCount={groupFilterCount}
      onClear={() => {
        setStatus(ALL);
        setGroupTypeId(ALL);
        setPage(0);
      }}
      buttonTestId="group-filters-button"
      menuTestId="group-filters-menu"
    >
      <PmsFilterChoiceRow
        label="Status"
        value={status}
        current={status === "pending" ? "Draft" : status === "active" ? "Confirmed" : status === "inactive" ? "Cancelled" : ""}
        options={[
          [ALL, "All statuses"],
          ["pending", "Draft"],
          ["active", "Confirmed"],
          ["inactive", "Cancelled"],
        ]}
        onChange={(value) => setStatus(value as "all" | (typeof GUEST_ACCOUNT_STATUSES)[number])}
      />
      {groupTypes.length > 0 ? (
        <PmsFilterChoiceRow
          label="Group Type"
          value={groupTypeId}
          current={groupTypes.find((type) => type.id === groupTypeId)?.name ?? ""}
          options={[[ALL, "All types"], ...groupTypes.map((type) => [type.id, type.name] as const)]}
          onChange={setGroupTypeId}
        />
      ) : null}
    </PmsFilterMenu>
  );

  return (
    <div className="space-y-6" data-testid="group-directory">
      {embedded ? (
        <>
          <GuestProfileShellSlot name="search">{groupSearchField}</GuestProfileShellSlot>
          <GuestProfileShellSlot name="filter">{groupFilterMenu}</GuestProfileShellSlot>
          {canPrintExport ? (
            <GuestProfileShellSlot name="export">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(SHELL_ICON_BUTTON, "relative")}
                onClick={runExport}
                aria-label="Export"
                title="Export"
                data-testid="group-export"
              >
                <Download className="size-4" />
              </Button>
            </GuestProfileShellSlot>
          ) : null}
        </>
      ) : null}
      {embedded ? null : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[#251605]">Groups</h1>
          <p className="mt-1 text-sm text-[#756A5B]">
            Manage group accounts, stay capacity, rooming lists, and group reservations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate ? (
            <Button
              type="button"
              onClick={() =>
                void navigate({
                  to: GUEST_PROFILE_DIRECTORY_PATH,
                  search: guestProfileSearch({
                    create: "group",
                    returnCard: returnCard ?? "overview",
                  }),
                })
              }
              className="gap-2 bg-[#C89933] text-white shadow-sm hover:bg-[#8A641A]"
              data-testid="new-group-button"
            >
              <Plus className="size-4" />
              New Group
            </Button>
          ) : null}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#756A5B]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search group, code, contact…"
            className="h-9 border-[#DDD4C5] pl-9 text-xs focus-visible:ring-[#8A641A]"
            data-testid="group-search-input"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as "all" | (typeof GUEST_ACCOUNT_STATUSES)[number])}
        >
          <SelectTrigger className="h-9 w-[130px] border-[#DDD4C5] text-xs" data-testid="group-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            <SelectItem value="pending">Draft</SelectItem>
            <SelectItem value="active">Confirmed</SelectItem>
            <SelectItem value="inactive">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        {groupTypes.length > 0 ? (
          <Select value={groupTypeId} onValueChange={setGroupTypeId}>
            <SelectTrigger className="h-9 w-[150px] border-[#DDD4C5] text-xs" data-testid="group-type-filter">
              <SelectValue placeholder="Group Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Types</SelectItem>
              {groupTypes.map((gt) => (
                <SelectItem key={gt.id} value={gt.id}>
                  {gt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-9 gap-1 text-xs text-[#756A5B] hover:text-[#251605]"
            data-testid="group-clear-filters"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
      </>
      )}

      {embedded ? null : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="group-kpi-band">
        <GroupKpiCard
          label="Total Groups"
          value={kpiQuery.data?.total}
          loading={kpiQuery.isLoading}
          icon={<Users className="size-4 text-[#8A641A]" />}
          tone="bg-[#F7F4EE]"
          active={status === ALL}
          onClick={() => setStatus(ALL)}
        />
        <GroupKpiCard
          label="Draft"
          value={kpiQuery.data?.draft}
          loading={kpiQuery.isLoading}
          icon={<Users className="size-4 text-amber-700" />}
          tone="bg-amber-50"
          active={status === "pending"}
          onClick={() => setStatus(status === "pending" ? ALL : "pending")}
        />
        <GroupKpiCard
          label="Confirmed"
          value={kpiQuery.data?.confirmed}
          loading={kpiQuery.isLoading}
          icon={<CheckCircle2 className="size-4 text-emerald-700" />}
          tone="bg-emerald-50"
          active={status === "active"}
          onClick={() => setStatus(status === "active" ? ALL : "active")}
        />
        <GroupKpiCard
          label="Cancelled"
          value={kpiQuery.data?.cancelled}
          loading={kpiQuery.isLoading}
          icon={<X className="size-4 text-red-700" />}
          tone="bg-red-50"
          active={status === "inactive"}
          onClick={() => setStatus(status === "inactive" ? ALL : "inactive")}
        />
      </div>
      )}

      {/* Groups Table */}
      <div className="overflow-x-auto rounded-lg border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs" data-testid="group-directory-table">
            <thead className={DIRECTORY_HEAD_CLASS}>
              <tr>
                <th className="px-2 py-2.5">Profile No.</th>
                <th className="px-2 py-2.5">Group Name</th>
                <th className="px-2 py-2.5">Group Type</th>
                <th className="px-2 py-2.5">Primary Contact</th>
                <th className="px-2 py-2.5">Company / Travel Agency</th>
                <th className="px-2 py-2.5">Members</th>
                <th className="px-2 py-2.5">Status</th>
                <th className="px-2 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-2 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-sm text-[#756A5B]">
                    No groups found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const typeName = row.groupTypeId ? groupTypeMap.get(row.groupTypeId) : null;
                  const affiliation = [row.companyMasterName, row.travelAgentMasterName].filter(Boolean).join(" / ");
                  const statusLabel = groupStatusLabel(row.accountStatus);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openGroup(row.id)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-[#FAF7EF]"
                      data-testid={`group-row-${row.id}`}
                    >
                      <td className="px-2 py-2.5 font-mono text-[11px] text-[#7A6B58]">
                        {displayProfileNumber(row.id, row.code)}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-semibold text-[#251605]">{row.name}</div>
                      </td>
                      <td className="px-2 py-2.5 text-[#756A5B]">{typeName || "—"}</td>
                      <td className="px-2 py-2.5 text-[#251605]">{row.primaryContactName || "—"}</td>
                      <td className="px-2 py-2.5 text-[#756A5B]">{affiliation || "—"}</td>
                      <td className="px-2 py-2.5 text-[#251605]">{row.memberCount ?? "—"}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className={
                            row.accountStatus === "active"
                              ? "inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success"
                              : "inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                          }
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-[#7A6B58] hover:text-[#251605]"
                              aria-label="Actions"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem
                              onClick={() => {
                                void navigate({
                                  to: "/restaurant/pms/reservations",
                                  search: { create: "new", groupId: row.id },
                                });
                              }}
                            >
                              <CalendarPlus className="mr-2 size-3.5" />
                              Add Reservation
                            </DropdownMenuItem>
                            {accountAccess.canEdit ? (
                              <DropdownMenuItem onClick={() => setEditingGroupId(row.id)}>
                                <Pencil className="mr-2 size-3.5" />
                                Edit Group
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
      <DirectoryPager
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizes={LISTING_PAGE_SIZES}
        total={totalCount}
        offset={page * pageSize}
        noun="groups"
        disabled={accountsQuery.isFetching}
        onPage={setPage}
        onPageSize={(size) => setPageSize(size as (typeof LISTING_PAGE_SIZES)[number])}
      />

      {/* Edit Group Modal */}
      {editingGroupId ? (
        <GuestGroupCreateModal
          restaurantId={restaurantId}
          open={Boolean(editingGroupId)}
          mode="edit"
          groupId={editingGroupId}
          onOpenChange={(open) => {
            if (!open) setEditingGroupId(null);
          }}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey });
            setEditingGroupId(null);
          }}
        />
      ) : null}
    </div>
  );
}
