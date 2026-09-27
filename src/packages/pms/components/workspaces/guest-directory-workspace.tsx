import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import { GuestQuickViewDrawer } from "@/packages/pms/components/guests/guest-quick-view-drawer";
import { GuestRestrictionBadges, StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
  type GuestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  DUPLICATE_PREVENTION_TIP,
  LAST_STAY_PRESET_LABELS,
  LAST_STAY_PRESETS,
  LISTING_DEFAULT_PAGE_SIZE,
  LISTING_PAGE_SIZES,
  displayProfileNumber,
  invalidateGuestWorkspaceQueries,
  type GuestListSort,
  type LastStayPreset,
} from "@/packages/pms/lib/guest-profile-listing";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  getGuest,
  getGuestDirectoryStats,
  getGuestsAccess,
  listGuests,
  setGuestStatus,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { cn } from "@/shared/lib/utils";

const ALL = "all";

function KpiCard({
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
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 shadow-sm">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-14" />
        ) : (
          <p className="font-display text-xl font-semibold leading-tight tracking-tight text-[#251605]">
            {value != null ? value.toLocaleString() : "—"}
          </p>
        )}
        {hint ? <p className="truncate text-[9px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function GuestDirectoryWorkspace({
  membership,
  compact = false,
  returnCard,
  search,
  onSearchChange,
  searchParams,
  canCreate = true,
  isTypeInactive = false,
}: {
  membership: RestaurantMembership;
  compact?: boolean;
  returnCard?: GuestProfileCardId | undefined;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchParams?: GuestProfileSearch | undefined;
  canCreate?: boolean;
  isTypeInactive?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { date } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuests = useServerFn(listGuests);
  const fetchGuest = useServerFn(getGuest);
  const fetchStats = useServerFn(getGuestDirectoryStats);
  const changeStatus = useServerFn(setGuestStatus);

  // Synchronized state with URL search params (or fallback to local state)
  const [localSearch, setLocalSearch] = useState(searchParams?.q ?? search ?? "");
  const searchValue = searchParams?.q ?? search ?? localSearch;
  const setSearch = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    setLocalSearch(value);
    updateDirectoryUrl({ q: value || undefined, page: undefined });
  };

  const status = searchParams?.status ?? ALL;
  const vip = searchParams?.vip ?? ALL;
  const lastStay = (searchParams?.lastStay as LastStayPreset) ?? ALL;
  const nationality = searchParams?.nationality ?? "";
  const sort = (searchParams?.sort as GuestListSort) ?? "updated_at";
  const page = searchParams?.page ?? 0;
  const pageSize =
    (searchParams?.pageSize as (typeof LISTING_PAGE_SIZES)[number]) ?? LISTING_DEFAULT_PAGE_SIZE;
  const previewId = searchParams?.preview ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [editGuest, setEditGuest] = useState<GuestProfile | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function updateDirectoryUrl(updates: Partial<GuestProfileSearch>) {
    const nextSearch = guestProfileSearch({
      ...searchParams,
      section: "guests",
      type: "individual",
      card: returnCard,
      ...updates,
    });
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: nextSearch,
    });
  }

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const canManage = accessQuery.data?.canManage ?? false;
  const offset = page * pageSize;

  const statsQuery = useQuery({
    queryKey: ["guest-directory-stats", restaurantId],
    queryFn: () => fetchStats({ data: { restaurantId } }),
    enabled: canManage,
    staleTime: 60_000,
  });

  const guestsQuery = useQuery({
    queryKey: [
      "guests",
      restaurantId,
      searchValue,
      status,
      vip,
      nationality,
      lastStay,
      sort,
      offset,
      pageSize,
    ],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          offset,
          limit: pageSize,
          sort,
          lastStay,
          ...(searchValue.trim() ? { search: searchValue.trim() } : {}),
          ...(status !== ALL ? { status: status as "active" | "inactive" } : {}),
          ...(vip === "vip" ? { vipOnly: true } : {}),
          ...(nationality.trim() && nationality !== ALL ? { nationality: nationality.trim() } : {}),
        },
      }),
    enabled: canManage,
  });

  function openGuest(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ card: returnCard, type: "individual" }),
    });
  }

  function handleOpenQuickView(id: string) {
    updateDirectoryUrl({ preview: id });
  }

  function handleCloseQuickView() {
    updateDirectoryUrl({ preview: undefined });
  }

  function handleEditFromDrawer(id: string) {
    void fetchGuest({ data: { restaurantId, guestId: id } }).then((res) => {
      if (res?.guest) {
        setEditGuest(res.guest);
        setFormOpen(true);
      }
    });
  }

  function refresh() {
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-directory-stats", restaurantId] });
  }

  const statusMutation = useMutation({
    mutationFn: (input: { guestId: string; status: "active" | "inactive" }) =>
      changeStatus({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      refresh();
    },
  });

  const pageData = guestsQuery.data;
  const guests = pageData?.items ?? [];
  const nationalities = useMemo(() => {
    const values = new Set<string>();
    for (const guest of pageData?.items ?? []) {
      if (guest.nationality) values.add(guest.nationality);
    }
    return [...values].sort();
  }, [pageData?.items]);

  if (accessQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="guest-profile-directory">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-6"
        data-testid="guest-profile-directory"
      >
        <h1 className="font-display text-2xl">Guest Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners, managers and receptionists can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const total = pageData?.total ?? 0;
  const lastStayAvailable = pageData?.lastStayAvailable ?? true;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Determine active filter chips
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (status !== ALL) {
    activeChips.push({
      key: "status",
      label: `Status: ${status === "active" ? "Active" : "Inactive"}`,
      onRemove: () => updateDirectoryUrl({ status: undefined, page: undefined }),
    });
  }
  if (vip !== ALL) {
    activeChips.push({
      key: "vip",
      label: `VIP: ${vip === "vip" ? "Yes" : "No"}`,
      onRemove: () => updateDirectoryUrl({ vip: undefined, page: undefined }),
    });
  }
  if (lastStay !== ALL) {
    activeChips.push({
      key: "lastStay",
      label: `Last stay: ${LAST_STAY_PRESET_LABELS[lastStay] ?? lastStay}`,
      onRemove: () => updateDirectoryUrl({ lastStay: undefined, page: undefined }),
    });
  }
  if (nationality && nationality !== ALL) {
    activeChips.push({
      key: "nationality",
      label: `Nationality: ${nationality}`,
      onRemove: () => updateDirectoryUrl({ nationality: undefined, page: undefined }),
    });
  }

  function handleClearAllFilters() {
    updateDirectoryUrl({
      q: undefined,
      status: undefined,
      vip: undefined,
      lastStay: undefined,
      nationality: undefined,
      sort: undefined,
      page: undefined,
    });
    setLocalSearch("");
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-4" data-testid="guest-profile-directory">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-56 flex-1 sm:min-w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 pr-8"
            placeholder="Search name, phone, email, profile, document, reservation or company..."
            value={searchValue}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="guest-listing-search"
          />
          {searchValue ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Status Filter */}
        <Select
          value={status}
          onValueChange={(val) =>
            updateDirectoryUrl({
              status: val === ALL ? undefined : (val as "active" | "inactive"),
              page: undefined,
            })
          }
        >
          <SelectTrigger className="w-36 text-xs" data-testid="guest-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* VIP Filter */}
        <Select
          value={vip}
          onValueChange={(val) =>
            updateDirectoryUrl({
              vip: val === ALL ? undefined : (val as "vip" | "non-vip"),
              page: undefined,
            })
          }
        >
          <SelectTrigger className="w-32 text-xs" data-testid="guest-vip-filter">
            <SelectValue placeholder="VIP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All VIP</SelectItem>
            <SelectItem value="vip">VIP Only</SelectItem>
            <SelectItem value="non-vip">Non-VIP</SelectItem>
          </SelectContent>
        </Select>

        {/* Last Stay Filter */}
        <Select
          value={lastStay}
          onValueChange={(val) =>
            updateDirectoryUrl({
              lastStay: val === ALL ? undefined : (val as LastStayPreset),
              page: undefined,
            })
          }
          disabled={!lastStayAvailable}
        >
          <SelectTrigger className="w-40 text-xs" data-testid="guest-last-stay-filter">
            <SelectValue placeholder="Last Stay" />
          </SelectTrigger>
          <SelectContent>
            {LAST_STAY_PRESETS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {LAST_STAY_PRESET_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Nationality Filter */}
        <Select
          value={nationality || ALL}
          onValueChange={(val) =>
            updateDirectoryUrl({ nationality: val === ALL ? undefined : val, page: undefined })
          }
        >
          <SelectTrigger className="w-36 text-xs" data-testid="guest-nationality-filter">
            <SelectValue placeholder="Nationality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Nationalities</SelectItem>
            {nationalities.map((val) => (
              <SelectItem key={val} value={val}>
                {val}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort Filter */}
        <Select
          value={sort}
          onValueChange={(val) => updateDirectoryUrl({ sort: val as GuestListSort })}
        >
          <SelectTrigger className="w-36 text-xs" data-testid="guest-sort-filter">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at">Last updated</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="last_stay" disabled={!lastStayAvailable}>
              Last stay
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filter Chips */}
      {activeChips.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-1.5 pt-1 text-xs"
          data-testid="guest-filter-chips"
        >
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-md border border-[#E8E4DC] bg-[#FAF8F5] px-2 py-0.5 font-medium text-[#251605]"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="text-[#7A6B58] hover:text-[#251605]"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleClearAllFilters}
            className="ml-1 text-xs font-semibold text-[#8C6D23] hover:underline"
            data-testid="guest-clear-all-filters"
          >
            Clear All
          </button>
        </div>
      ) : null}

      {/* Directory KPIs (Separated cards matching Reservation Workspace) */}
      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Guest directory KPIs"
        data-testid="guest-directory-summary-band"
      >
        <KpiCard
          label="Total Guests"
          value={stats?.totalGuests}
          hint="All guest profiles"
          loading={statsQuery.isLoading}
          icon={<Users className="size-4" />}
          tone="bg-[#F4E9D0] text-[#8A641A]"
        />
        <KpiCard
          label="Active Guests"
          value={stats?.activeGuests}
          hint="Active status"
          loading={statsQuery.isLoading}
          icon={<UserCheck className="size-4" />}
          tone="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          label="VIP Guests"
          value={stats?.vipGuests}
          hint="Flagged VIP"
          loading={statsQuery.isLoading}
          icon={<Crown className="size-4 fill-current" />}
          tone="bg-amber-50 text-amber-700"
        />
        <KpiCard
          label="Returning Guests"
          value={stats?.returningGuests}
          hint="Repeated stays"
          loading={statsQuery.isLoading}
          icon={<RotateCcw className="size-4" />}
          tone="bg-blue-50 text-blue-700"
        />
      </section>

      {/* Directory Action Header */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="font-display text-base font-semibold text-[#251605]">Guest Directory</h2>
        <Button
          type="button"
          size="sm"
          disabled={!canCreate}
          onClick={() => {
            void navigate({
              to: GUEST_PROFILE_DIRECTORY_PATH,
              search: guestProfileSearch({
                section: "guests",
                type: "individual",
                create: "individual",
              }),
            });
          }}
          className="h-8 gap-1.5 bg-[#C89933] text-white hover:bg-[#B38728] disabled:opacity-50"
          data-testid="guest-directory-new-guest-btn"
          title={
            isTypeInactive
              ? "Individual profile type is inactive in Property Setup"
              : "Create new Guest"
          }
        >
          <Plus className="size-3.5" />
          <span>New Guest</span>
        </Button>
      </div>

      {/* Dense Table */}
      {guestsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : guests.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-[#E8E4DC] bg-[#FAF8F5] p-10 text-center text-sm text-[#7A6B58]"
          data-testid="guest-directory-empty"
        >
          {searchValue ? (
            <div>
              <p className="font-medium text-[#251605]">
                No guests match &ldquo;{searchValue}&rdquo;
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch("")}
                className="mt-3 border-[#D6D0C4] text-[#251605]"
              >
                Clear search
              </Button>
            </div>
          ) : activeChips.length > 0 ? (
            <div>
              <p className="font-medium text-[#251605]">No guests match active filters</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllFilters}
                className="mt-3 border-[#D6D0C4] text-[#251605]"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div>
              <p className="font-medium text-[#251605]">No guests recorded yet</p>
              <p className="mt-1 text-xs text-[#7A6B58]">{DUPLICATE_PREVENTION_TIP}</p>
              <Button
                size="sm"
                disabled={!canCreate}
                onClick={() => {
                  void navigate({
                    to: GUEST_PROFILE_DIRECTORY_PATH,
                    search: guestProfileSearch({
                      section: "guests",
                      type: "individual",
                      create: "individual",
                    }),
                  });
                }}
                className="mt-3 bg-[#C89933] text-white hover:bg-[#B38728]"
              >
                <Plus className="mr-1.5 size-3.5" />
                New Guest
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-xs" data-testid="guest-listing-table">
            <thead className="border-b border-[#E8E4DC] bg-[#FAF8F5] text-left text-[11px] font-semibold uppercase tracking-wider text-[#7A6B58]">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={selected.length > 0 && selected.length === guests.length}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? guests.map((guest) => guest.id) : [])
                    }
                    aria-label="Select page"
                  />
                </th>
                <th className="px-3 py-2.5">Profile No.</th>
                <th className="px-3 py-2.5">Guest</th>
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Nationality</th>
                <th className="px-3 py-2.5">Last Stay</th>
                <th className="px-3 py-2.5">Upcoming</th>
                <th className="px-3 py-2.5">VIP</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-12 px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE3]">
              {guests.map((g) => {
                const isSelected = previewId === g.id;
                return (
                  <tr
                    key={g.id}
                    onClick={() => handleOpenQuickView(g.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-[#FAF8F5]",
                      isSelected && "bg-[#F5EFE6]/60",
                    )}
                    data-testid={`guest-row-${g.id}`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(g.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked === true ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                          )
                        }
                        aria-label={`Select ${g.fullName}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#7A6B58]">
                      {displayProfileNumber(g.id, g.profileNumber)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#251605]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{g.fullName}</span>
                        <GuestRestrictionBadges guest={g} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[#7A6B58]">
                      <div>{g.phone || "—"}</div>
                      <div className="text-[10px] text-[#A69B8D]">{g.email || ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[#251605]">{g.nationality ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[#7A6B58]">
                      {lastStayAvailable ? (g.lastStayAt ? date(g.lastStayAt) : "—") : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[#7A6B58]">
                      {g.upcomingStayAt ? date(g.upcomingStayAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {g.vipStatus ? (
                        <Crown
                          className="size-3.5 fill-[#8C6D23] text-[#8C6D23]"
                          title="VIP Guest"
                        />
                      ) : (
                        <span className="text-[#D6D0C4]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={g.guestStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-[#7A6B58] hover:text-[#251605]"
                            aria-label={`Actions for ${g.fullName}`}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onSelect={() => openGuest(g.id)}>
                            Open Full Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              void navigate({
                                to: "/restaurant/pms/reservations",
                                search: { create: "new", guestId: g.id },
                              });
                            }}
                          >
                            New Reservation
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              void fetchGuest({ data: { restaurantId, guestId: g.id } }).then(
                                (res) => {
                                  if (res?.guest) {
                                    setEditGuest(res.guest);
                                    setFormOpen(true);
                                  }
                                },
                              );
                            }}
                          >
                            Edit Guest
                          </DropdownMenuItem>
                          {selected.length === 2 && selected.includes(g.id) ? (
                            <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
                              Merge Selected (2)
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onSelect={() => {
                              statusMutation.mutate({
                                guestId: g.id,
                                status: g.guestStatus === "active" ? "inactive" : "active",
                              });
                            }}
                          >
                            {g.guestStatus === "active" ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#7A6B58]">
        <div>
          Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, total)} of{" "}
          <span className="font-medium text-[#251605]">{total.toLocaleString()}</span> guests
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 0 || guestsQuery.isFetching}
              onClick={() => updateDirectoryUrl({ page: Math.max(0, page - 1) })}
              className="size-7 border-[#E8E4DC] text-[#251605]"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
              let pageIdx = i;
              if (pageCount > 5 && page > 2) {
                pageIdx = Math.min(page - 2 + i, pageCount - 5 + i);
              }
              const isCurrent = page === pageIdx;
              return (
                <Button
                  key={pageIdx}
                  variant={isCurrent ? "default" : "outline"}
                  size="icon"
                  onClick={() => updateDirectoryUrl({ page: pageIdx })}
                  className={cn(
                    "size-7 text-xs",
                    isCurrent
                      ? "bg-[#C89933] font-semibold text-white hover:bg-[#B38728]"
                      : "border-[#E8E4DC] text-[#251605]",
                  )}
                >
                  {pageIdx + 1}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="icon"
              disabled={page >= pageCount - 1 || guestsQuery.isFetching}
              onClick={() => updateDirectoryUrl({ page: page + 1 })}
              className="size-7 border-[#E8E4DC] text-[#251605]"
              aria-label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <Select
            value={String(pageSize)}
            onValueChange={(val) =>
              updateDirectoryUrl({
                pageSize: parseInt(val, 10) as (typeof LISTING_PAGE_SIZES)[number],
                page: undefined,
              })
            }
          >
            <SelectTrigger className="h-7 w-28 text-xs border-[#E8E4DC]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LISTING_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Guest Quick View Drawer */}
      <GuestQuickViewDrawer
        restaurantId={restaurantId}
        previewId={previewId}
        onClose={handleCloseQuickView}
        searchParams={searchParams}
        onEditGuest={handleEditFromDrawer}
      />

      {/* Dialogs */}
      <GuestFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditGuest(null);
        }}
        guest={editGuest}
        onSaved={(id) => {
          refresh();
          if (!editGuest) openGuest(id);
        }}
        onOpenExisting={openGuest}
      />

      <GuestMergeDialog
        restaurantId={restaurantId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        initialSurvivorId={selected[0]}
        initialRetiredId={selected[1]}
        onMerged={(id) => {
          refresh();
          openGuest(id);
        }}
      />
    </div>
  );
}

export function GuestListingNewGuestMenu({
  onIndividual,
  onCompany,
  onAgency,
  onGroup,
  canCreateIndividual = true,
  canCreateCompany = true,
  canCreateAgency = true,
  canCreateGroup = true,
}: {
  onIndividual: () => void;
  onCompany: () => void;
  onAgency: () => void;
  onGroup?: () => void;
  canCreateIndividual?: boolean;
  canCreateCompany?: boolean;
  canCreateAgency?: boolean;
  canCreateGroup?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="new-guest-menu">
          New Guest
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canCreateIndividual} onSelect={onIndividual}>
          New Individual
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canCreateCompany} onSelect={onCompany}>
          New Company
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canCreateAgency} onSelect={onAgency}>
          New Agency
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canCreateGroup} onSelect={onGroup}>
          New Group
        </DropdownMenuItem>
        <DropdownMenuItem disabled>New Contact</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
