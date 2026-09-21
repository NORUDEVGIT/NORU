import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, MoreHorizontal, Search } from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import {
  GuestRestrictionBadges,
  StatusBadge,
} from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
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
  getGuestsAccess,
  listGuests,
  setGuestStatus,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

const ALL = "all";

export function GuestDirectoryWorkspace({
  membership,
  compact = false,
  returnCard,
  search,
  onSearchChange,
}: {
  membership: RestaurantMembership;
  compact?: boolean;
  returnCard?: GuestProfileCardId | undefined;
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { date } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuests = useServerFn(listGuests);
  const fetchGuest = useServerFn(getGuest);
  const changeStatus = useServerFn(setGuestStatus);

  const [localSearch, setLocalSearch] = useState("");
  const searchValue = search ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;
  const [status, setStatus] = useState<string>(ALL);
  const [nationality, setNationality] = useState("");
  const [lastStay, setLastStay] = useState<LastStayPreset>("all");
  const [sort, setSort] = useState<GuestListSort>("updated_at");
  const [vipOnly, setVipOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof LISTING_PAGE_SIZES)[number]>(
    LISTING_DEFAULT_PAGE_SIZE,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editGuest, setEditGuest] = useState<GuestProfile | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setPage(0);
  }, [searchValue]);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const canManage = accessQuery.data?.canManage ?? false;
  const offset = page * pageSize;

  const guestsQuery = useQuery({
    queryKey: [
      "guests",
      restaurantId,
      searchValue,
      status,
      vipOnly,
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
          ...(vipOnly ? { vipOnly: true } : {}),
          ...(nationality.trim() ? { nationality: nationality.trim() } : {}),
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

  function refresh() {
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId] });
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
    for (const guest of guests) {
      if (guest.nationality) values.add(guest.nationality);
    }
    return [...values].sort();
  }, [guests]);

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading guests…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
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

  return (
    <div className="space-y-4" data-testid="guest-profile-directory">
      {compact ? null : (
        <div>
          <h1 className="font-display text-2xl">Guest Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Search, manage and open guest profiles for {membership.restaurant.name}.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, phone, email, passport or profile number"
            value={searchValue}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            data-testid="guest-listing-search"
          />
        </div>
        <Input
          className="w-40"
          placeholder="Nationality"
          value={nationality}
          onChange={(e) => {
            setNationality(e.target.value);
            setPage(0);
          }}
          list="guest-nationality-options"
          data-testid="guest-nationality-filter"
        />
        <datalist id="guest-nationality-options">
          {nationalities.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Guest Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={lastStay}
          onValueChange={(value) => {
            setLastStay(value as LastStayPreset);
            setPage(0);
          }}
          disabled={!lastStayAvailable}
        >
          <SelectTrigger className="w-44" data-testid="guest-last-stay-filter">
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
        <Button variant={moreOpen || vipOnly ? "default" : "outline"} onClick={() => setMoreOpen((v) => !v)}>
          More Filters
        </Button>
        <Select value={sort} onValueChange={(value) => setSort(value as GuestListSort)}>
          <SelectTrigger className="w-40">
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

      {moreOpen ? (
        <div className="flex flex-wrap gap-2">
          <Button variant={vipOnly ? "default" : "outline"} onClick={() => { setVipOnly((v) => !v); setPage(0); }}>
            VIP only
          </Button>
        </div>
      ) : null}

      {!lastStayAvailable ? (
        <p className="text-xs text-muted-foreground">Last stay is unavailable until reservation access is readable.</p>
      ) : null}

      {guestsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading guests…</p>
      ) : guests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No guests match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[880px] text-sm" data-testid="guest-listing-table">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">
                  <Checkbox
                    checked={selected.length > 0 && selected.length === guests.length}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? guests.map((guest) => guest.id) : [])
                    }
                    aria-label="Select page"
                  />
                </th>
                <th className="px-3 py-3">Profile No.</th>
                <th className="px-3 py-3">Guest Name</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Nationality</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Last Stay</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-3 py-3">
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
                  <td className="px-3 py-3 font-mono text-xs">{displayProfileNumber(g.id)}</td>
                  <td className="px-3 py-3 font-medium">
                    <button type="button" className="text-left hover:underline" onClick={() => openGuest(g.id)}>
                      <span className="flex flex-wrap items-center gap-2">
                        {g.fullName}
                        <GuestRestrictionBadges guest={g} />
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">Individual</td>
                  <td className="px-3 py-3 text-muted-foreground">{g.nationality ?? "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {[g.phone, g.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {lastStayAvailable ? (g.lastStayAt ? date(g.lastStayAt) : "—") : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={g.guestStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label={`Actions for ${g.fullName}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openGuest(g.id)}>View</DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void fetchGuest({ data: { restaurantId, guestId: g.id } }).then((result) => {
                              setEditGuest(result.guest);
                              setFormOpen(true);
                            });
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            statusMutation.mutate({
                              guestId: g.id,
                              status: g.guestStatus === "active" ? "inactive" : "active",
                            })
                          }
                        >
                          {g.guestStatus === "active" ? "Deactivate" : "Reactivate"}
                        </DropdownMenuItem>
                        {g.mergedIntoGuestId ? null : (
                          <DropdownMenuItem
                            onSelect={() => {
                              setSelected([g.id]);
                              setMergeOpen(true);
                            }}
                          >
                            Merge
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {total} profile{total === 1 ? "" : "s"} · page {Math.min(page + 1, pageCount)} of {pageCount}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value) as (typeof LISTING_PAGE_SIZES)[number]);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LISTING_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
          {selected.length === 2 ? (
            <Button variant="outline" onClick={() => setMergeOpen(true)}>
              Merge selected
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{DUPLICATE_PREVENTION_TIP}</p>

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
  canCreateIndividual = true,
  canCreateCompany = true,
  canCreateAgency = true,
}: {
  onIndividual: () => void;
  onCompany: () => void;
  onAgency: () => void;
  canCreateIndividual?: boolean;
  canCreateCompany?: boolean;
  canCreateAgency?: boolean;
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
        <DropdownMenuItem disabled>New Contact</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
