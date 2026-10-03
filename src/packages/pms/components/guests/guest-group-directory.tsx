import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { GuestGroupQuickViewDrawer } from "@/packages/pms/components/guests/guest-group-quick-view-drawer";
import { GuestGroupCreateModal } from "@/packages/pms/components/guests/guest-group-create-modal";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  GUEST_ACCOUNT_STATUSES,
  accountListItems,
  accountTypeToProfileType,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  LISTING_DEFAULT_PAGE_SIZE,
  LISTING_PAGE_SIZES,
  listingCreateAllowed,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { listGroupTemplates } from "@/packages/pms/lib/guest-group-templates";
import { groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
}: {
  label: string;
  value?: number | null | undefined;
  hint?: string | undefined;
  loading?: boolean | undefined;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 shadow-sm text-left"
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
    </div>
  );
}

export function GuestGroupDirectory({
  membership,
  returnCard,
}: {
  membership: RestaurantMembership;
  returnCard?: GuestProfileCardId | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);
  const fetchTemplates = useServerFn(listGroupTemplates);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [groupTypeId, setGroupTypeId] = useState<string>(ALL);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof LISTING_PAGE_SIZES)[number]>(
    LISTING_DEFAULT_PAGE_SIZE,
  );

  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);

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
  }, [status, groupTypeId]);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;
  const offset = page * pageSize;

  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canManage,
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
    enabled: canManage,
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
    enabled: canManage,
    staleTime: 30_000,
  });

  const templatesQuery = useQuery({
    queryKey: ["group-templates", restaurantId],
    queryFn: () => fetchTemplates({ data: { restaurantId } }),
    enabled: templatesDialogOpen,
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
  const canCreate = listingCreateAllowed(canManage, accountTypeToProfileType("group"));

  function handleClear() {
    setSearch("");
    setDebouncedSearch("");
    setStatus(ALL);
    setGroupTypeId(ALL);
    setPage(0);
  }

  const hasActiveFilters = Boolean(search || status !== ALL || groupTypeId !== ALL);

  return (
    <div className="space-y-6" data-testid="group-directory">
      {/* Directory Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[#251605]">Groups</h1>
          <p className="mt-1 text-sm text-[#756A5B]">
            Manage group accounts, stay capacity, rooming lists, and group reservations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setTemplatesDialogOpen(true)}
            className="gap-2 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
            data-testid="group-templates-button"
          >
            <FileSpreadsheet className="size-4 text-[#8A641A]" />
            Group Templates
          </Button>
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

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="group-kpi-band">
        <GroupKpiCard
          label="Total Groups"
          value={kpiQuery.data?.total}
          loading={kpiQuery.isLoading}
          icon={<Users className="size-4 text-[#8A641A]" />}
          tone="bg-[#F7F4EE]"
        />
        <GroupKpiCard
          label="Draft"
          value={kpiQuery.data?.draft}
          loading={kpiQuery.isLoading}
          icon={<Users className="size-4 text-amber-700" />}
          tone="bg-amber-50"
        />
        <GroupKpiCard
          label="Confirmed"
          value={kpiQuery.data?.confirmed}
          loading={kpiQuery.isLoading}
          icon={<CheckCircle2 className="size-4 text-emerald-700" />}
          tone="bg-emerald-50"
        />
        <GroupKpiCard
          label="Cancelled"
          value={kpiQuery.data?.cancelled}
          loading={kpiQuery.isLoading}
          icon={<X className="size-4 text-red-700" />}
          tone="bg-red-50"
        />
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

        <Select value={status} onValueChange={setStatus}>
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

      {/* Groups Table */}
      <div className="overflow-hidden rounded-2xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="group-directory-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#F7F4EE] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Group Type</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Expected Pax</th>
                <th className="px-4 py-3">Expected Rooms</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD4C5]/60">
              {accountsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[#756A5B]">
                    No groups found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const typeName = row.groupTypeId ? groupTypeMap.get(row.groupTypeId) : null;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setQuickViewId(row.id)}
                      className="cursor-pointer transition-colors hover:bg-[#F7F4EE]/60"
                      data-testid={`group-row-${row.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#251605]">{row.name}</div>
                        {row.primaryContactName ? (
                          <div className="text-[11px] text-[#756A5B]">
                            Contact: {row.primaryContactName}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#756A5B]">
                        {row.code ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[#756A5B]">
                        {typeName ? (
                          <span className="rounded-md bg-[#F7F4EE] px-2 py-0.5 text-[11px] font-medium text-[#251605]">
                            {typeName}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#756A5B]">
                        {row.arrivalDate && row.departureDate
                          ? `${row.arrivalDate} → ${row.departureDate}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#756A5B]">{row.expectedPax ?? "—"}</td>
                      <td className="px-4 py-3 text-[#756A5B]">{row.expectedRooms ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-[#756A5B] hover:text-[#251605]"
                              aria-label="Actions"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                void navigate({
                                  to: GUEST_PROFILE_DETAIL_PATH,
                                  params: { guestId: row.id },
                                  search: guestProfileSearch({ type: "group" }),
                                });
                              }}
                            >
                              <ExternalLink className="mr-2 size-3.5" />
                              Open Workspace
                            </DropdownMenuItem>
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
                            <DropdownMenuItem onClick={() => setEditingGroupId(row.id)}>
                              <Pencil className="mr-2 size-3.5" />
                              Edit Group
                            </DropdownMenuItem>
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

        {/* Pagination Bar */}
        {totalCount > pageSize ? (
          <div className="flex items-center justify-between border-t border-[#DDD4C5] bg-[#F7F4EE]/50 px-4 py-2.5 text-xs text-[#756A5B]">
            <span>
              Showing {rows.length} of {totalCount} groups
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="h-7 border-[#DDD4C5] text-xs"
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 border-[#DDD4C5] text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Quick View Drawer */}
      <GuestGroupQuickViewDrawer
        restaurantId={restaurantId}
        groupId={quickViewId}
        onClose={() => setQuickViewId(null)}
        onEditGroup={(id) => setEditingGroupId(id)}
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

      {/* Group Templates Dialog */}
      <Dialog open={templatesDialogOpen} onOpenChange={setTemplatesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Group Templates</DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Reusable creation templates stored in property configuration. Applying a template copies values into a new group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {templatesQuery.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (templatesQuery.data ?? []).length === 0 ? (
              <p className="text-center text-xs text-[#756A5B]">No group templates configured yet.</p>
            ) : (
              <div className="divide-y divide-[#DDD4C5]/60 rounded-xl border border-[#DDD4C5] bg-white">
                {(templatesQuery.data ?? []).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <p className="font-medium text-[#251605]">{t.name}</p>
                      {t.description ? <p className="text-[11px] text-[#756A5B]">{t.description}</p> : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTemplatesDialogOpen(false);
                        void navigate({
                          to: GUEST_PROFILE_DIRECTORY_PATH,
                          search: guestProfileSearch({
                            create: "group",
                            templateId: t.id,
                            returnCard: returnCard ?? "overview",
                          }),
                        });
                      }}
                      className="h-7 text-xs border-[#DDD4C5] text-[#251605]"
                    >
                      Use Template
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
