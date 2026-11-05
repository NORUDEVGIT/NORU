import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { getOverbookingControls } from "@/packages/pms/lib/overbooking.functions";
import {
  FilterGroup,
  FilterOption,
  MoreFiltersMenu,
} from "@/packages/pms/components/more-filters-menu";
import {
  ReservationShellSlot,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import {
  WAITLIST_DISPLAY_STATUSES,
  type WaitlistDetail,
  type WaitlistListRow,
  type WaitlistMatchCandidate,
} from "@/packages/pms/lib/waitlist";
import {
  amendWaitlistRequest,
  cancelWaitlistRequest,
  convertWaitlist,
  createWaitlistOffer,
  createWaitlistRequest,
  getWaitlist,
  listWaitlist,
  matchWaitlist,
  respondWaitlistOffer,
} from "@/packages/pms/lib/waitlist.functions";
import { listGuests } from "@/packages/pms/lib/guests.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

type WaitlistRequestWrite = {
  restaurantId: string;
  guestId: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  requestedRoomTypeId?: string | null;
  flexibleDates?: boolean;
  priority?: number;
  notes?: string | null;
};

type WaitlistStatusFilter = (typeof WAITLIST_DISPLAY_STATUSES)[number] | "all";

/** Choices staged inside the More filters menu; applied with "Apply filters". */
type WaitlistMenuDraft = {
  status: WaitlistStatusFilter;
  roomTypeId: string;
  priority: string;
  arrivalFrom: string;
  arrivalTo: string;
};

const DEFAULT_MENU_DRAFT: WaitlistMenuDraft = {
  status: "all",
  roomTypeId: "all",
  priority: "all",
  arrivalFrom: "",
  arrivalTo: "",
};

function statusLabel(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type WaitlistFn<TIn, TOut> = (input: { data: TIn }) => Promise<TOut>;

export function WaitlistWorkspace({
  restaurantId,
  search = "",
  onSearchChange,
  canWrite,
  onOpenReservation,
}: {
  restaurantId: string;
  /** Search text (guest, request number, notes). Owned by the parent so the header search can drive it too. */
  search?: string;
  onSearchChange?: (value: string) => void;
  canWrite: boolean;
  onOpenReservation: (reservationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadList = useServerFn(listWaitlist);
  const loadDetail = useServerFn(getWaitlist);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const loadGuests = useServerFn(listGuests);
  const submitCreate = useServerFn(createWaitlistRequest);
  const submitAmend = useServerFn(amendWaitlistRequest);
  const submitMatch = useServerFn(matchWaitlist);
  const submitOffer = useServerFn(createWaitlistOffer);
  const submitRespond = useServerFn(respondWaitlistOffer);
  const submitConvert = useServerFn(convertWaitlist);
  const submitCancel = useServerFn(cancelWaitlistRequest);

  const [status, setStatus] = useState<(typeof WAITLIST_DISPLAY_STATUSES)[number] | "all">("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [arrivalFrom, setArrivalFrom] = useState("");
  const [arrivalTo, setArrivalTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // More filters menu: choices are staged in `menuDraft` and applied together.
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [menuDraft, setMenuDraft] = useState<WaitlistMenuDraft>(DEFAULT_MENU_DRAFT);

  const listQuery = useQuery({
    queryKey: ["pms-waitlist", restaurantId, status],
    queryFn: () =>
      loadList({
        data: {
          restaurantId,
          status: status === "all" ? undefined : status,
        },
      }) as Promise<{ requests: WaitlistListRow[] }>,
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: ["pms-waitlist-detail", restaurantId, selectedId],
    queryFn: () =>
      loadDetail({ data: { restaurantId, requestId: selectedId! } }) as Promise<WaitlistDetail>,
    enabled: selectedId !== null,
  });

  const roomTypesQuery = useQuery({
    queryKey: ["pms-waitlist-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 5 * 60_000,
  });

  const allRequests = listQuery.data?.requests ?? [];
  const selected = allRequests.find((row) => row.id === selectedId) ?? null;

  // Search + filters run on the rows already loaded.
  const requests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRequests.filter(
      (row) =>
        (!q ||
          [row.guestName, row.confirmationNumber, row.notes].some((field) =>
            field?.toLowerCase().includes(q),
          )) &&
        (roomTypeFilter === "all" || row.requestedRoomTypeId === roomTypeFilter) &&
        (priorityFilter === "all" || String(row.priority) === priorityFilter) &&
        (!arrivalFrom || row.arrivalDate >= arrivalFrom) &&
        (!arrivalTo || row.arrivalDate <= arrivalTo),
    );
  }, [allRequests, search, roomTypeFilter, priorityFilter, arrivalFrom, arrivalTo]);

  function clearFilters() {
    setStatus("all");
    setRoomTypeFilter("all");
    setPriorityFilter("all");
    setArrivalFrom("");
    setArrivalTo("");
  }

  function patchMenuDraft(patch: Partial<WaitlistMenuDraft>) {
    setMenuDraft((current) => ({ ...current, ...patch }));
  }

  function toggleFilterGroup(id: string) {
    setOpenGroups((current) =>
      current.includes(id) ? current.filter((group) => group !== id) : [...current, id],
    );
  }

  function applyMenuFilters(next: WaitlistMenuDraft) {
    setStatus(next.status);
    setRoomTypeFilter(next.roomTypeId);
    setPriorityFilter(next.priority);
    setArrivalFrom(next.arrivalFrom);
    setArrivalTo(next.arrivalTo);
    setFilterMenuOpen(false);
  }

  function handleFilterMenuOpenChange(open: boolean) {
    setFilterMenuOpen(open);
    if (open) {
      setMenuDraft({
        status,
        roomTypeId: roomTypeFilter,
        priority: priorityFilter,
        arrivalFrom,
        arrivalTo,
      });
    }
  }

  const filterChips: Array<{ id: string; label: string; remove: () => void }> = [];
  if (status !== "all") {
    filterChips.push({ id: "status", label: statusLabel(status), remove: () => setStatus("all") });
  }
  if (roomTypeFilter !== "all") {
    filterChips.push({
      id: "room-type",
      label:
        (roomTypesQuery.data ?? []).find((type) => type.id === roomTypeFilter)?.name ?? "Room type",
      remove: () => setRoomTypeFilter("all"),
    });
  }
  if (priorityFilter !== "all") {
    filterChips.push({
      id: "priority",
      label: `Priority ${priorityFilter}`,
      remove: () => setPriorityFilter("all"),
    });
  }
  if (arrivalFrom || arrivalTo) {
    filterChips.push({
      id: "arrival",
      label: `Arrival ${arrivalFrom || "…"} – ${arrivalTo || "…"}`,
      remove: () => {
        setArrivalFrom("");
        setArrivalTo("");
      },
    });
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-waitlist", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-waitlist-detail", restaurantId] });
  }

  const create = useMutation({
    mutationFn: (input: WaitlistRequestWrite) =>
      submitCreate({ data: input }) as Promise<{ id: string; confirmationNumber: string }>,
    onSuccess: (row) => {
      toast.success(`Waitlist ${row.confirmationNumber} created.`);
      setNewOpen(false);
      setSelectedId(row.id);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create waitlist request."),
  });

  return (
    <div className="space-y-3" data-testid="waitlist-workspace">
      <ReservationShellSlot name="filter">
          <MoreFiltersMenu
            iconOnly
            open={filterMenuOpen}
            onOpenChange={handleFilterMenuOpenChange}
            activeCount={filterChips.length}
            title="Filter waitlist"
            onApply={() => applyMenuFilters(menuDraft)}
            onClear={() => applyMenuFilters(DEFAULT_MENU_DRAFT)}
          >
            <FilterGroup
              id="status"
              title="Status"
              count={menuDraft.status !== "all" ? 1 : 0}
              open={openGroups.includes("status")}
              onToggle={toggleFilterGroup}
            >
              <FilterOption
                type="radio"
                name="waitlist-filter-status"
                label="All statuses"
                checked={menuDraft.status === "all"}
                onChange={() => patchMenuDraft({ status: "all" })}
              />
              {WAITLIST_DISPLAY_STATUSES.map((value) => (
                <FilterOption
                  key={value}
                  type="radio"
                  name="waitlist-filter-status"
                  label={statusLabel(value)}
                  checked={menuDraft.status === value}
                  onChange={() => patchMenuDraft({ status: value })}
                />
              ))}
            </FilterGroup>

            <FilterGroup
              id="room-type"
              title="Room type"
              count={menuDraft.roomTypeId !== "all" ? 1 : 0}
              open={openGroups.includes("room-type")}
              onToggle={toggleFilterGroup}
            >
              <FilterOption
                type="radio"
                name="waitlist-filter-room-type"
                label="All room types"
                checked={menuDraft.roomTypeId === "all"}
                onChange={() => patchMenuDraft({ roomTypeId: "all" })}
              />
              {(roomTypesQuery.data ?? []).map((type) => (
                <FilterOption
                  key={type.id}
                  type="radio"
                  name="waitlist-filter-room-type"
                  label={type.name}
                  checked={menuDraft.roomTypeId === type.id}
                  onChange={() => patchMenuDraft({ roomTypeId: type.id })}
                />
              ))}
            </FilterGroup>

            <FilterGroup
              id="priority"
              title="Priority"
              count={menuDraft.priority !== "all" ? 1 : 0}
              open={openGroups.includes("priority")}
              onToggle={toggleFilterGroup}
            >
              <FilterOption
                type="radio"
                name="waitlist-filter-priority"
                label="All priorities"
                checked={menuDraft.priority === "all"}
                onChange={() => patchMenuDraft({ priority: "all" })}
              />
              {[1, 2, 3, 4, 5].map((value) => (
                <FilterOption
                  key={value}
                  type="radio"
                  name="waitlist-filter-priority"
                  label={`Priority ${value}`}
                  checked={menuDraft.priority === String(value)}
                  onChange={() => patchMenuDraft({ priority: String(value) })}
                />
              ))}
            </FilterGroup>

            <FilterGroup
              id="arrival"
              title="Arrival dates"
              count={menuDraft.arrivalFrom || menuDraft.arrivalTo ? 1 : 0}
              open={openGroups.includes("arrival")}
              onToggle={toggleFilterGroup}
            >
              <div className="grid gap-2 py-1">
                <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
                  From
                  <Input
                    type="date"
                    className="h-9"
                    value={menuDraft.arrivalFrom}
                    onChange={(event) => patchMenuDraft({ arrivalFrom: event.target.value })}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                </label>
                <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
                  To
                  <Input
                    type="date"
                    className="h-9"
                    value={menuDraft.arrivalTo}
                    onChange={(event) => patchMenuDraft({ arrivalTo: event.target.value })}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                </label>
              </div>
            </FilterGroup>
          </MoreFiltersMenu>
      </ReservationShellSlot>

      {canWrite ? (
        <ReservationShellSlot name="primary">
          <Button
            className={SHELL_PRIMARY_BUTTON}
            data-testid="waitlist-new-request"
            onClick={() => setNewOpen((open) => !open)}
          >
            <Plus className="size-4" />
            New Request
          </Button>
        </ReservationShellSlot>
      ) : null}

      {filterChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ul className="flex flex-wrap gap-2" data-testid="waitlist-filter-chips">
            {filterChips.map((chip) => (
              <li key={chip.id}>
                <button
                  type="button"
                  aria-label={`Remove filter ${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a] bg-[#f5ead0] py-0.5 pl-3 pr-2 text-xs font-bold text-[#4a2c1a]"
                  onClick={chip.remove}
                >
                  {chip.label}
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              clearFilters();
              onSearchChange?.("");
            }}
          >
            Clear all
          </Button>
        </div>
      ) : null}

      {newOpen && canWrite ? (
        <section
          className="rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm"
          data-testid="waitlist-new-request-form"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#251605]">New waitlist request</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Close new request"
              onClick={() => setNewOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <WaitlistRequestForm
            roomTypes={roomTypesQuery.data ?? []}
            loadGuests={loadGuests}
            restaurantId={restaurantId}
            submitting={create.isPending}
            onSubmit={(values) => create.mutate({ restaurantId, ...values })}
          />
        </section>
      ) : null}

      <div
        className={cn(
          "grid min-w-0 gap-3",
          selectedId && "xl:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          {listQuery.isError ? (
            <p className="p-4 text-sm text-destructive">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Could not load waitlist."}
            </p>
          ) : listQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {search.trim()
                ? "No waitlist requests match your search."
                : "No waitlist requests for these filters."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Guest</th>
                  <th className="px-3 py-2">Stay</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer border-b border-border/70 hover:bg-[#F7F4EE]",
                      selectedId === row.id && "bg-[#F4E9D0]",
                    )}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.guestName ?? "Guest"}</p>
                      <p className="text-[11px] text-muted-foreground">{row.confirmationNumber}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.arrivalDate} → {row.departureDate}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.displayStatus}</td>
                    <td className="px-3 py-2 tabular-nums">{row.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {selectedId ? (
        <aside
          className="relative rounded-xl border border-[#DDD4C5] bg-white p-4 pt-10 shadow-sm"
          data-testid="waitlist-quick-view"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-7"
            aria-label="Close waitlist quick view"
            onClick={() => setSelectedId(null)}
          >
            <X className="size-4" />
          </Button>
          {detailQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : detailQuery.isError ? (
            <p className="text-sm text-destructive">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Could not load waitlist request."}
            </p>
          ) : detailQuery.data ? (
            <WaitlistQuickView
              restaurantId={restaurantId}
              canWrite={canWrite}
              listRow={selected}
              detail={detailQuery.data}
              roomTypes={roomTypesQuery.data ?? []}
              loadGuests={loadGuests}
              onAmend={submitAmend}
              onMatch={submitMatch}
              onOffer={submitOffer}
              onRespond={submitRespond}
              onConvert={submitConvert}
              onCancel={submitCancel}
              onOpenReservation={onOpenReservation}
              onChanged={invalidate}
            />
          ) : null}
        </aside>
        ) : null}
      </div>
    </div>
  );
}

function WaitlistRequestForm({
  restaurantId,
  roomTypes,
  loadGuests,
  submitting,
  initial,
  onSubmit,
}: {
  restaurantId: string;
  roomTypes: Array<{ id: string; name: string }>;
  loadGuests: WaitlistFn<
    { restaurantId: string; search?: string; limit?: number },
    Array<{ id: string; fullName: string }>
  >;
  submitting: boolean;
  initial?: WaitlistListRow | null;
  onSubmit: (values: Omit<WaitlistRequestWrite, "restaurantId">) => void;
}) {
  const [guestName, setGuestName] = useState(initial?.guestName ?? "");
  const [guestId, setGuestId] = useState(initial?.guestId ?? "");
  const [arrivalDate, setArrivalDate] = useState(initial?.arrivalDate ?? "");
  const [departureDate, setDepartureDate] = useState(initial?.departureDate ?? "");
  const [adults, setAdults] = useState(initial?.adults ?? 1);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [requestedRoomTypeId, setRequestedRoomTypeId] = useState(
    initial?.requestedRoomTypeId ?? "",
  );
  const [flexibleDates, setFlexibleDates] = useState(initial?.flexibleDates ?? false);
  const [priority, setPriority] = useState(initial?.priority ?? 3);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const guestsQuery = useQuery({
    queryKey: ["pms-waitlist-guests", restaurantId, guestName],
    queryFn: () => loadGuests({ data: { restaurantId, search: guestName.trim(), limit: 8 } }),
    enabled: guestName.trim().length >= 2 && guestId === "",
  });

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!guestId) {
          toast.error("Select a guest profile before creating a waitlist request.");
          return;
        }
        onSubmit({
          guestId,
          arrivalDate,
          departureDate,
          adults,
          children,
          requestedRoomTypeId: requestedRoomTypeId || null,
          flexibleDates,
          priority,
          notes: notes.trim() || null,
        });
      }}
    >
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground sm:col-span-2">
        Guest
        <Input
          value={guestName}
          onChange={(event) => {
            setGuestName(event.target.value);
            setGuestId("");
          }}
          placeholder="Search guest"
          required
        />
      </label>
      {guestsQuery.data && guestsQuery.data.length > 0 && !guestId ? (
        <ul className="rounded-md border border-border bg-background sm:col-span-2">
          {guestsQuery.data.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  setGuestId(guest.id);
                  setGuestName(guest.fullName);
                }}
              >
                {guest.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        type="date"
        value={arrivalDate}
        onChange={(event) => setArrivalDate(event.target.value)}
        required
      />
      <Input
        type="date"
        value={departureDate}
        onChange={(event) => setDepartureDate(event.target.value)}
        required
      />
      <Input
        type="number"
        min={1}
        value={adults}
        onChange={(event) => setAdults(Number(event.target.value))}
      />
      <Input
        type="number"
        min={0}
        value={children}
        onChange={(event) => setChildren(Number(event.target.value))}
      />
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={requestedRoomTypeId}
        onChange={(event) => setRequestedRoomTypeId(event.target.value)}
      >
        <option value="">Any room type</option>
        {roomTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={priority}
        onChange={(event) => setPriority(Number(event.target.value))}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            Priority {value}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={flexibleDates}
          onChange={(event) => setFlexibleDates(event.target.checked)}
        />
        Flexible dates
      </label>
      <Input
        className="sm:col-span-2"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
      />
      <Button type="submit" className="sm:col-span-2" disabled={submitting}>
        Save request
      </Button>
    </form>
  );
}

function WaitlistQuickView({
  restaurantId,
  canWrite,
  listRow,
  detail,
  roomTypes,
  loadGuests,
  onAmend,
  onMatch,
  onOffer,
  onRespond,
  onConvert,
  onCancel,
  onOpenReservation,
  onChanged,
}: {
  restaurantId: string;
  canWrite: boolean;
  listRow: WaitlistListRow | null;
  detail: WaitlistDetail;
  roomTypes: Array<{ id: string; name: string }>;
  loadGuests: WaitlistFn<
    { restaurantId: string; search?: string; limit?: number },
    Array<{ id: string; fullName: string }>
  >;
  onAmend: WaitlistFn<WaitlistRequestWrite & { requestId: string }, unknown>;
  onMatch: WaitlistFn<
    { restaurantId: string; requestId: string },
    { candidates: WaitlistMatchCandidate[] }
  >;
  onOffer: WaitlistFn<
    {
      restaurantId: string;
      requestId: string;
      roomTypeId: string;
      ratePlanId?: string | null;
    },
    unknown
  >;
  onRespond: WaitlistFn<
    {
      restaurantId: string;
      requestId: string;
      offerId: string;
      response: "accepted" | "declined";
    },
    unknown
  >;
  onConvert: WaitlistFn<
    {
      restaurantId: string;
      requestId: string;
      offerId?: string;
      overbookingRequested?: boolean;
      overbookingReason?: string;
    },
    { reservationId: string; confirmationNumber?: string }
  >;
  onCancel: WaitlistFn<{ restaurantId: string; requestId: string }, unknown>;
  onOpenReservation: (reservationId: string) => void;
  onChanged: () => void;
}) {
  const request = detail.request;
  const [amendOpen, setAmendOpen] = useState(false);
  const [overbookReason, setOverbookReason] = useState("");
  const [needsOverbook, setNeedsOverbook] = useState(false);
  const loadOverbookingControls = useServerFn(getOverbookingControls);
  const overbookingControls = useQuery({
    queryKey: ["overbooking-controls", restaurantId],
    queryFn: () => loadOverbookingControls({ data: { restaurantId } }),
  });
  const reasonRequired = overbookingControls.data?.reasonRequired !== false;
  const [candidates, setCandidates] = useState<WaitlistMatchCandidate[] | null>(null);
  const liveOffer = useMemo(
    () => detail.offers.find((offer) => offer.displayStatus === "pending") ?? null,
    [detail.offers],
  );
  const acceptedOffer = useMemo(
    () => detail.offers.find((offer) => offer.displayStatus === "accepted") ?? null,
    [detail.offers],
  );

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {request.confirmationNumber}
        </p>
        <h2 className="text-lg font-semibold">{request.guestName ?? "Guest"}</h2>
        <p className="capitalize text-muted-foreground">
          {request.displayStatus} · priority {request.priority}
        </p>
        <p className="tabular-nums">
          {request.arrivalDate} → {request.departureDate} · {request.adults} adults
        </p>
        <p>{request.requestedRoomTypeName ?? "Any room type"}</p>
      </div>

      {request.reservationId ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenReservation(request.reservationId!)}
        >
          Open reservation
        </Button>
      ) : null}

      {canWrite &&
      request.displayStatus !== "converted" &&
      request.displayStatus !== "cancelled" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAmendOpen((open) => !open)}>
            Amend
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void onMatch({ data: { restaurantId, requestId: request.id } })
                .then((result) => setCandidates(result.candidates))
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not match availability.",
                  ),
                )
            }
          >
            Match availability
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              void onCancel({ data: { restaurantId, requestId: request.id } })
                .then(() => {
                  toast.success("Waitlist request cancelled.");
                  onChanged();
                })
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not cancel waitlist.",
                  ),
                )
            }
          >
            Cancel request
          </Button>
        </div>
      ) : null}

      {amendOpen && canWrite && listRow ? (
        <WaitlistRequestForm
          restaurantId={restaurantId}
          roomTypes={roomTypes}
          loadGuests={loadGuests}
          submitting={false}
          initial={listRow}
          onSubmit={(values) =>
            void onAmend({ data: { restaurantId, requestId: request.id, ...values } })
              .then(() => {
                toast.success("Waitlist request updated. Pending offers were cleared.");
                setAmendOpen(false);
                onChanged();
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Could not amend waitlist."),
              )
          }
        />
      ) : null}

      {candidates ? (
        <div>
          <h3 className="mb-2 font-medium">Matches</h3>
          {candidates.length === 0 ? (
            <p className="text-muted-foreground">No sellable availability for these dates.</p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.roomTypeId} className="rounded-md border border-border p-2">
                  <p className="font-medium">
                    {candidate.name} · {candidate.available} available
                    {candidate.requested
                      ? " · requested"
                      : candidate.alternate
                        ? " · alternate"
                        : ""}
                  </p>
                  {!candidate.occupancyFits ? (
                    <p className="text-xs text-destructive">Occupancy exceeds this type.</p>
                  ) : null}
                  {canWrite && candidate.occupancyFits && candidate.available > 0 ? (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        void onOffer({
                          data: {
                            restaurantId,
                            requestId: request.id,
                            roomTypeId: candidate.roomTypeId,
                            ratePlanId:
                              candidate.quotes.find((quote) => !quote.unavailableReason)
                                ?.ratePlanId ?? null,
                          },
                        })
                          .then(() => {
                            toast.success("Offer created. Inventory is not held.");
                            setCandidates(null);
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not create offer.",
                            ),
                          )
                      }
                    >
                      Create offer
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 font-medium">Offers</h3>
        {detail.offers.length === 0 ? (
          <p className="text-muted-foreground">No offers yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.offers.map((offer) => (
              <li key={offer.id} className="rounded-md border border-border p-2">
                <p>
                  {offer.roomTypeName} · {offer.arrivalDate} → {offer.departureDate}
                </p>
                <p className="capitalize text-muted-foreground">
                  {offer.displayStatus}
                  {offer.quotedTotal != null
                    ? ` · ${offer.quotedTotal} ${offer.quotedCurrency ?? ""}`
                    : ""}
                </p>
                {canWrite && offer.displayStatus === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void onRespond({
                          data: {
                            restaurantId,
                            requestId: request.id,
                            offerId: offer.id,
                            response: "accepted",
                          },
                        })
                          .then(() => {
                            toast.success("Offer accepted.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not accept offer.",
                            ),
                          )
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void onRespond({
                          data: {
                            restaurantId,
                            requestId: request.id,
                            offerId: offer.id,
                            response: "declined",
                          },
                        })
                          .then(() => {
                            toast.success("Offer declined.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not decline offer.",
                            ),
                          )
                      }
                    >
                      Decline
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && acceptedOffer && !request.reservationId ? (
        <div className="space-y-2">
          <Button
            onClick={() =>
              void onConvert({
                data: { restaurantId, requestId: request.id, offerId: acceptedOffer.id },
              })
                .then((result) => {
                  toast.success(`Reservation ${result.confirmationNumber ?? ""} created.`);
                  onChanged();
                  onOpenReservation(result.reservationId);
                })
                .catch((error: unknown) => {
                  const message =
                    error instanceof Error ? error.message : "Could not convert waitlist.";
                  if (message.includes("No rooms of that type are available")) {
                    setNeedsOverbook(true);
                    return;
                  }
                  toast.error(message);
                })
            }
          >
            Convert to reservation
          </Button>
          {needsOverbook ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-[#251605]">
              <p>
                No physical availability. Converting now overbooks
                {reasonRequired ? " and requires a reason." : "."}
              </p>
              <label className="mt-2 block text-xs">
                Reason{reasonRequired ? " *" : ""}
                <textarea
                  className="mt-1 w-full rounded-md border border-[#E5DED4] bg-white p-2"
                  value={overbookReason}
                  onChange={(event) => setOverbookReason(event.target.value)}
                />
              </label>
              <Button
                className="mt-2"
                disabled={reasonRequired && overbookReason.trim().length === 0}
                onClick={() =>
                  void onConvert({
                    data: {
                      restaurantId,
                      requestId: request.id,
                      offerId: acceptedOffer.id,
                      overbookingRequested: true,
                      overbookingReason: overbookReason.trim(),
                    },
                  })
                    .then((result) => {
                      toast.success(`Reservation ${result.confirmationNumber ?? ""} created.`);
                      onChanged();
                      onOpenReservation(result.reservationId);
                    })
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error ? error.message : "Could not convert waitlist.",
                      ),
                    )
                }
              >
                Confirm overbooking
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {liveOffer ? (
        <p className="text-xs text-muted-foreground">Live offer expires {liveOffer.expiresAt}.</p>
      ) : null}

      <div>
        <h3 className="mb-2 font-medium">History</h3>
        <ul className="space-y-2">
          {detail.history.map((event) => {
            const changes = reservationHistoryChanges(
              event.previous_values
                ? (JSON.parse(event.previous_values) as Record<string, unknown>)
                : null,
              event.new_values ? (JSON.parse(event.new_values) as Record<string, unknown>) : null,
            );
            return (
              <li key={event.id}>
                <p className="font-medium">{event.event_type.replaceAll("_", " ")}</p>
                {changes.map((change) => (
                  <p key={change.key} className="text-xs text-muted-foreground">
                    {change.key}: {change.from} → {change.to}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
