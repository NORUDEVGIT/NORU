import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Baby,
  BedDouble,
  Calendar,
  CalendarDays,
  CalendarRange,
  Flag,
  Hash,
  Mail,
  Moon,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  User,
  Users,
  X,
} from "lucide-react";

import { getOverbookingControls } from "@/packages/pms/lib/overbooking.functions";
import {
  PmsFilterDateRange,
  PmsFilterPopover,
  PmsFilterSection,
  PmsFilterSelect,
} from "@/packages/pms/components/pms-filter-popover";
import {
  ReservationShellSlot,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { formatStayDate, nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import {
  WAITLIST_DISPLAY_STATUSES,
  defaultOfferExpiresAt,
  type WaitlistDetail,
  type WaitlistListRow,
  type WaitlistMatchCandidate,
  type WaitlistOfferRead,
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
import {
  CreateReservationGuest,
  CreateReservationGuestCompact,
  type PickedReservationGuest,
} from "@/packages/pms/components/bookings/create-reservation-guest";
import { getGuest } from "@/packages/pms/lib/guests.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import {
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_SELECT_TRIGGER,
} from "@/packages/pms/lib/pms-operational-surface";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Textarea } from "@/shared/components/ui/textarea";
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

/** Choices staged inside the filter popover; applied with Apply. */
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
  if (value === "open") return "Waiting";
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const STATUS_CHIP: Record<string, string> = {
  open: "bg-[#F4E9D0] text-[#8A641A]",
  offered: "bg-[#F4E9D0] text-[#8A641A]",
  accepted: "bg-[#E7F0E8] text-[#3E7A4A]",
  converted: "bg-[#E7F0E8] text-[#3E7A4A]",
  cancelled: "bg-[#F3EDE3] text-[#8A8175]",
  expired: "bg-[#F6E4E1] text-[#A45B4A]",
};

const FILTER_CONTROL = cn(PMS_OP_SELECT_TRIGGER, "!h-9");

type WaitlistFn<TIn, TOut> = (input: { data: TIn }) => Promise<TOut>;

export function WaitlistWorkspace({
  restaurantId,
  search = "",
  onSearchChange: _onSearchChange,
  rangeStart,
  rangeEnd,
  canWrite,
  onOpenReservation,
}: {
  restaurantId: string;
  /** Search text (guest, request number, notes). Owned by the parent so the header search can drive it too. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Shared Reservations week. Requests whose stay overlaps it are loaded. */
  rangeStart: string;
  rangeEnd: string;
  canWrite: boolean;
  onOpenReservation: (reservationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadList = useServerFn(listWaitlist);
  const loadDetail = useServerFn(getWaitlist);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
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

  // Filter popover: choices are staged in `menuDraft` and applied together.
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuDraft, setMenuDraft] = useState<WaitlistMenuDraft>(DEFAULT_MENU_DRAFT);

  const listQuery = useQuery({
    queryKey: ["pms-waitlist", restaurantId, status, rangeStart, rangeEnd],
    queryFn: () =>
      loadList({
        data: {
          restaurantId,
          status: status === "all" ? undefined : status,
          stayOverlapStart: rangeStart,
          stayOverlapEnd: rangeEnd,
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

  function patchMenuDraft(patch: Partial<WaitlistMenuDraft>) {
    setMenuDraft((current) => ({ ...current, ...patch }));
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
    onSuccess: () => {
      toast.success("Waitlist request created.");
      setNewOpen(false);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create waitlist request."),
  });

  return (
    <div className="space-y-3" data-testid="waitlist-workspace">
      <ReservationShellSlot name="filter">
        <PmsFilterPopover
          title="Filter Waitlist"
          activeCount={filterChips.length}
          open={filterMenuOpen}
          onOpenChange={handleFilterMenuOpenChange}
          onClear={() => applyMenuFilters(DEFAULT_MENU_DRAFT)}
          onApply={() => applyMenuFilters(menuDraft)}
          buttonTestId="waitlist-filter-button"
          menuTestId="waitlist-filter-menu"
        >
          <PmsFilterSection title="Status">
            <PmsFilterSelect
              value={menuDraft.status}
              onValueChange={(value) => patchMenuDraft({ status: value as WaitlistStatusFilter })}
              options={[
                ["all", "All statuses"],
                ...WAITLIST_DISPLAY_STATUSES.map((value) => [value, statusLabel(value)] as const),
              ]}
              ariaLabel="Status"
            />
          </PmsFilterSection>
          <PmsFilterSection title="Room Type">
            <PmsFilterSelect
              value={menuDraft.roomTypeId}
              onValueChange={(value) => patchMenuDraft({ roomTypeId: value })}
              options={[
                ["all", "All room types"],
                ...(roomTypesQuery.data ?? []).map((type) => [type.id, type.name] as const),
              ]}
              ariaLabel="Room type"
            />
          </PmsFilterSection>
          <PmsFilterSection title="Priority">
            <PmsFilterSelect
              value={menuDraft.priority}
              onValueChange={(value) => patchMenuDraft({ priority: value })}
              options={[
                ["all", "All priorities"],
                ...([1, 2, 3, 4, 5] as const).map((value) => [String(value), `Priority ${value}`] as const),
              ]}
              ariaLabel="Priority"
            />
          </PmsFilterSection>
          <PmsFilterSection title="Arrival Dates">
            <PmsFilterDateRange
              from={menuDraft.arrivalFrom}
              to={menuDraft.arrivalTo}
              onFrom={(value) => patchMenuDraft({ arrivalFrom: value })}
              onTo={(value) => patchMenuDraft({ arrivalTo: value })}
              fromLabel="From"
              toLabel="To"
            />
          </PmsFilterSection>
        </PmsFilterPopover>
      </ReservationShellSlot>

      {canWrite ? (
        <ReservationShellSlot name="primary">
          <Button
            className={SHELL_PRIMARY_BUTTON}
            data-testid="waitlist-new-request"
            onClick={() => setNewOpen(true)}
          >
            <Plus className="size-4" />
            New Request
          </Button>
        </ReservationShellSlot>
      ) : null}

      {canWrite ? (
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent
            data-testid="waitlist-new-request-form"
            className="z-[70] flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[720px] [&>button.absolute]:hidden"
          >
            <header className="relative shrink-0 bg-[#1F140A] px-4 py-2.5 pr-10 text-[#F3E9D8]">
              <DialogTitle className="font-display text-sm font-semibold">
                New Waitlist Request
              </DialogTitle>
              <p className="text-[11px] text-[#C4B6A0]">Create a new waitlist entry</p>
              <button
                type="button"
                className="absolute right-3 top-2 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                onClick={() => setNewOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              <DialogDescription className="sr-only">
                Create a new waitlist entry
              </DialogDescription>
            </header>
            <div className="h-0.5 shrink-0 bg-[#C89933]" aria-hidden />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F1] px-4 py-3">
              <WaitlistRequestForm
                formId="waitlist-new-request-fields"
                hideSubmit
                canCreateGuest={canWrite}
                roomTypes={roomTypesQuery.data ?? []}
                restaurantId={restaurantId}
                submitting={create.isPending}
                onSubmit={(values) => create.mutate({ restaurantId, ...values })}
              />
            </div>
            <footer className="shrink-0 border-t border-[#E8DFD0] bg-white px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
                  onClick={() => setNewOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="waitlist-new-request-fields"
                  className={cn(SHELL_PRIMARY_BUTTON, "disabled:opacity-70 disabled:text-[#251605]")}
                  disabled={create.isPending}
                >
                  {create.isPending ? "Saving…" : "Save Request"}
                </Button>
              </div>
            </footer>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="grid min-w-0 gap-3">
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
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <p className="text-sm font-medium text-[#251605]">No waitlist requests found.</p>
              <p className="mt-1 text-xs text-[#7A6B58]">
                {search.trim() || filterChips.length > 0
                  ? "Try changing or clearing your filters."
                  : "Create a new waitlist request to get started."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[#E8DFD0] bg-[#FAF8F4] text-[10px] font-semibold uppercase tracking-[0.11em] text-[#7A6B58]">
                  <tr>
                    <th className="px-3 py-2">Guest</th>
                    <th className="px-3 py-2">Arrival</th>
                    <th className="px-3 py-2">Departure</th>
                    <th className="px-3 py-2">Nights</th>
                    <th className="px-3 py-2">Room Type</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-b border-[#EFE7DC] hover:bg-[#F7F4EE]",
                        selectedId === row.id && "bg-[#F4E9D0]",
                      )}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#251605]">{row.guestName ?? "Guest"}</p>
                        <p className="text-[11px] text-[#7A6B58]">{row.confirmationNumber}</p>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#251605]">
                        {formatStayDate(row.arrivalDate)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#251605]">
                        {formatStayDate(row.departureDate)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#251605]">
                        {nightsBetween(row.arrivalDate, row.departureDate)}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {row.requestedRoomTypeName ?? "Any room type"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#251605]">{row.priority}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            STATUS_CHIP[row.displayStatus] ?? "bg-[#F3EDE3] text-[#8A8175]",
                          )}
                        >
                          {statusLabel(row.displayStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#7A6B58]">
                        {formatCreatedAt(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                        <WaitlistRowMenu
                          row={row}
                          canWrite={canWrite}
                          onView={() => setSelectedId(row.id)}
                          onOpenReservation={onOpenReservation}
                          onCancel={() => setCancelConfirmId(row.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          data-testid="waitlist-detail-workspace"
          className="z-[70] flex h-fit max-h-[85vh] w-[min(92vw,860px)] max-w-[860px] flex-col gap-0 overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[860px] [&>button.absolute]:hidden"
        >
          {detailQuery.data ? null : (
            <>
              <DialogTitle className="sr-only">Waitlist request</DialogTitle>
              <DialogDescription className="sr-only">Waitlist request details</DialogDescription>
            </>
          )}
          {detailQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center bg-[#F7F4EE] p-6">
              <Skeleton className="h-40 w-full max-w-xl" />
            </div>
          ) : detailQuery.isError ? (
            <div className="flex flex-1 flex-col bg-[#F7F4EE] p-6">
              <p className="text-sm text-destructive">
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "Could not load waitlist request."}
              </p>
            </div>
          ) : detailQuery.data ? (
            <WaitlistDetailWorkspace
              restaurantId={restaurantId}
              canWrite={canWrite}
              listRow={selected}
              detail={detailQuery.data}
              roomTypes={roomTypesQuery.data ?? []}
              onAmend={submitAmend}
              onMatch={submitMatch}
              onOffer={submitOffer}
              onRespond={submitRespond}
              onConvert={submitConvert}
              onCancel={submitCancel}
              onOpenReservation={onOpenReservation}
              onChanged={invalidate}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelConfirmId !== null} onOpenChange={(open) => !open && setCancelConfirmId(null)}>
        <DialogContent className="z-[80] max-w-md rounded-2xl border-[#DDD4C5] p-0">
          <header className="bg-[#1F140A] px-4 py-2.5 text-[#F3E9D8]">
            <DialogTitle className="text-sm font-semibold">Cancel Request</DialogTitle>
            <DialogDescription className="text-[11px] text-[#C4B6A0]">
              This waitlist request will be cancelled.
            </DialogDescription>
          </header>
          <div className="h-0.5 bg-[#C89933]" aria-hidden />
          <p className="px-4 py-3 text-sm text-[#251605]">
            Cancel this waitlist request? Existing pending offers will no longer be active.
          </p>
          <footer className="flex items-center justify-between border-t border-[#E8DFD0] px-4 py-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 border-[#DDD4C5]"
              onClick={() => setCancelConfirmId(null)}
            >
              Keep request
            </Button>
            <Button
              type="button"
              className="h-9 bg-[#A45B4A] text-white hover:bg-[#8E4E40]"
              onClick={() => {
                const requestId = cancelConfirmId;
                if (!requestId) return;
                void submitCancel({ data: { restaurantId, requestId } })
                  .then(() => {
                    toast.success("Waitlist request cancelled.");
                    setCancelConfirmId(null);
                    if (selectedId === requestId) setSelectedId(null);
                    invalidate();
                  })
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : "Could not cancel waitlist.",
                    ),
                  );
              }}
            >
              Cancel request
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function WaitlistRowMenu({
  row,
  canWrite,
  onView,
  onOpenReservation,
  onCancel,
}: {
  row: WaitlistListRow;
  canWrite: boolean;
  onView: () => void;
  onOpenReservation: (reservationId: string) => void;
  onCancel: () => void;
}) {
  const canCancel =
    canWrite && row.displayStatus !== "converted" && row.displayStatus !== "cancelled";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-[#4a2c1a] hover:bg-[#F7F4EE]"
          aria-label="Waitlist actions"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 border-[#DDD4C5]">
        <DropdownMenuItem onSelect={onView}>View details</DropdownMenuItem>
        {row.reservationId ? (
          <DropdownMenuItem onSelect={() => onOpenReservation(row.reservationId!)}>
            Open reservation
          </DropdownMenuItem>
        ) : null}
        {canCancel ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onCancel}>
            Cancel request
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function waitlistPickedGuest(row: WaitlistListRow | null | undefined): PickedReservationGuest | null {
  if (!row?.guestId) return null;
  return {
    id: row.guestId,
    firstName: row.guestName ?? "Guest",
    lastName: null,
    fullName: row.guestName ?? "Guest",
    phone: null,
    email: null,
    nationality: null,
    vipStatus: false,
    guestStatus: "active",
    updatedAt: row.updatedAt,
    idDocumentNumber: null,
    mergedIntoGuestId: null,
    anonymisedAt: null,
    restricted: false,
    blacklisted: false,
    lastStayAt: null,
    profileNumber: null,
  };
}

function WaitlistRequestForm({
  restaurantId,
  roomTypes,
  submitting,
  initial,
  onSubmit,
  formId,
  hideSubmit = false,
  canCreateGuest,
  onDraftChange,
}: {
  restaurantId: string;
  roomTypes: Array<{ id: string; name: string }>;
  submitting: boolean;
  initial?: WaitlistListRow | null;
  onSubmit: (values: Omit<WaitlistRequestWrite, "restaurantId">) => void;
  formId?: string;
  hideSubmit?: boolean;
  canCreateGuest: boolean;
  onDraftChange?: (state: { dirty: boolean; guestSelected: boolean }) => void;
}) {
  const [guest, setGuest] = useState<PickedReservationGuest | null>(() =>
    waitlistPickedGuest(initial),
  );
  const [guestError, setGuestError] = useState<string | null>(null);
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
  const stayField = cn(PMS_OP_INPUT, "!h-9");
  const dirty =
    (guest?.id ?? "") !== (initial?.guestId ?? "") ||
    arrivalDate !== (initial?.arrivalDate ?? "") ||
    departureDate !== (initial?.departureDate ?? "") ||
    adults !== (initial?.adults ?? 1) ||
    children !== (initial?.children ?? 0) ||
    (requestedRoomTypeId || null) !== (initial?.requestedRoomTypeId ?? null) ||
    flexibleDates !== (initial?.flexibleDates ?? false) ||
    priority !== (initial?.priority ?? 3) ||
    (notes.trim() || null) !== (initial?.notes ?? null);

  useEffect(() => {
    onDraftChange?.({ dirty, guestSelected: Boolean(guest?.id) });
  }, [dirty, guest?.id]);

  return (
    <CreateReservationGuest
      restaurantId={restaurantId}
      canCreateGuest={canCreateGuest}
      guest={guest}
      onGuestChange={(next) => {
        setGuest(next);
        setGuestError(null);
      }}
    >
      <form
        id={formId}
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!guest?.id) {
            setGuestError("Select an existing guest or create a new guest.");
            return;
          }
          setGuestError(null);
          onSubmit({
            guestId: guest.id,
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
        <div className="grid gap-1 sm:col-span-2">
          <Label className="text-[11px] text-[#7A6B58]">Guest</Label>
          <CreateReservationGuestCompact />
          {guestError ? <p className="text-[11px] text-destructive">{guestError}</p> : null}
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A6B58] sm:col-span-2">
          Stay
        </p>
        <div className="grid gap-1">
          <Label className="text-[11px] text-[#7A6B58]">Arrival Date</Label>
          <Input
            type="date"
            className={cn(stayField, PMS_OP_DATE)}
            value={arrivalDate}
            onChange={(event) => setArrivalDate(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-[#7A6B58]">Departure Date</Label>
          <Input
            type="date"
            className={cn(stayField, PMS_OP_DATE)}
            value={departureDate}
            onChange={(event) => setDepartureDate(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-[#7A6B58]">Adults</Label>
          <Input
            type="number"
            min={1}
            className={stayField}
            value={adults}
            onChange={(event) => setAdults(Number(event.target.value))}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-[#7A6B58]">Children</Label>
          <Input
            type="number"
            min={0}
            className={stayField}
            value={children}
            onChange={(event) => setChildren(Number(event.target.value))}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-[#7A6B58]">Room Type</Label>
          <Select
            value={requestedRoomTypeId || "any"}
            onValueChange={(value) => setRequestedRoomTypeId(value === "any" ? "" : value)}
          >
            <SelectTrigger className={FILTER_CONTROL}>
              <SelectValue placeholder="Any room type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any room type</SelectItem>
              {roomTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-[#7A6B58]">Priority</Label>
          <Select value={String(priority)} onValueChange={(value) => setPriority(Number(value))}>
            <SelectTrigger className={FILTER_CONTROL}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  Priority {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#251605] sm:col-span-2">
          <input
            type="checkbox"
            checked={flexibleDates}
            onChange={(event) => setFlexibleDates(event.target.checked)}
          />
          Flexible Dates
        </label>
        <div className="grid gap-1 sm:col-span-2">
          <Label className="text-[11px] text-[#7A6B58]">Notes</Label>
          <Textarea
            className="min-h-[72px] resize-y rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2 text-sm text-[#251605] shadow-none placeholder:text-[#8C7E72] focus-visible:border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933]"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes"
          />
        </div>
        {hideSubmit ? null : (
          <div className="sm:col-span-2">
            <Button type="submit" className={SHELL_PRIMARY_BUTTON} disabled={submitting}>
              Save request
            </Button>
          </div>
        )}
      </form>
    </CreateReservationGuest>
  );
}

const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "match", label: "Availability" },
  { id: "offers", label: "Offers" },
  { id: "history", label: "History" },
] as const;

type WaitlistDetailTab = (typeof DETAIL_TABS)[number]["id"];

const OFFER_CHIP: Record<string, string> = {
  pending: "bg-[#F4E9D0] text-[#8A641A]",
  accepted: "bg-[#E7F0E8] text-[#3E7A4A]",
  declined: "bg-[#F3EDE3] text-[#8A8175]",
  cancelled: "bg-[#F3EDE3] text-[#8A8175]",
  expired: "bg-[#F6E4E1] text-[#A45B4A]",
};

const WAITLIST_EVENT_LABELS: Record<string, string> = {
  request_created: "Request Created",
  request_amended: "Request Amended",
  offer_created: "Offer Created",
  offer_accepted: "Offer Accepted",
  offer_declined: "Offer Declined",
  offer_expired: "Offer Expired",
  converted: "Converted",
  request_cancelled: "Request Cancelled",
};

const WAITLIST_FIELD_LABELS: Record<string, string> = {
  arrivalDate: "Arrival",
  departureDate: "Departure",
  status: "Status",
  priority: "Priority",
  adults: "Adults",
  children: "Children",
  flexibleDates: "Flexible Dates",
  notes: "Notes",
  requestedRoomTypeName: "Room Type",
  roomTypeName: "Room Type",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWaitlistMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null) return "—";
  const code = (currency || "ETB").toUpperCase();
  return `${code} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatHistoryStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatStayDate(value);
    return value;
  }
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function staffHistoryValue(key: string, value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) || key.toLowerCase().includes("expires")) {
    return formatHistoryStamp(value);
  }
  if (key.toLowerCase().includes("date") && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatStayDate(value.slice(0, 10));
  }
  if (key === "status") return statusLabel(value);
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  return value;
}

function isInternalHistoryValue(key: string, value: string): boolean {
  if (/id$/i.test(key) || key === "offerId" || key === "response") return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function waitlistHistorySummary(
  event: {
    event_type: string;
    previous_values: string | null;
    new_values: string | null;
    notes: string | null;
  },
  roomTypes: Array<{ id: string; name: string }>,
  offers: WaitlistOfferRead[] = [],
): string {
  let previous: Record<string, unknown> | null = null;
  let next: Record<string, unknown> | null = null;
  try {
    previous = event.previous_values ? (JSON.parse(event.previous_values) as Record<string, unknown>) : null;
  } catch {
    previous = null;
  }
  try {
    next = event.new_values ? (JSON.parse(event.new_values) as Record<string, unknown>) : null;
  } catch {
    next = null;
  }
  const changes = reservationHistoryChanges(previous, next);
  const nextRecord = next ?? {};

  if (event.event_type === "request_created") {
    const arrivalRaw = typeof nextRecord.arrivalDate === "string" ? nextRecord.arrivalDate : null;
    const departureRaw = typeof nextRecord.departureDate === "string" ? nextRecord.departureDate : null;
    const stay =
      arrivalRaw && departureRaw ? `${formatStayDate(arrivalRaw)} → ${formatStayDate(departureRaw)}` : null;
    const nights = arrivalRaw && departureRaw ? nightsBetween(arrivalRaw, departureRaw) : null;
    const nightsLabel =
      nights == null ? null : `${nights} night${nights === 1 ? "" : "s"}`;
    return [stay, nightsLabel].filter(Boolean).join(" · ") || "Waitlist request created";
  }

  if (event.event_type === "offer_created") {
    const offerId = typeof nextRecord.offerId === "string" ? nextRecord.offerId : null;
    const offer = offerId ? offers.find((row) => row.id === offerId) : null;
    const typeId = typeof nextRecord.roomTypeId === "string" ? nextRecord.roomTypeId : offer?.roomTypeId;
    const typeName =
      offer?.roomTypeName ?? (typeId ? roomTypes.find((type) => type.id === typeId)?.name : null);
    const quoted =
      offer?.quotedTotal != null
        ? formatWaitlistMoney(offer.quotedTotal, offer.quotedCurrency)
        : typeof nextRecord.quotedTotal === "number"
          ? formatWaitlistMoney(nextRecord.quotedTotal, String(nextRecord.quotedCurrency ?? "ETB"))
          : null;
    const expiresRaw =
      typeof nextRecord.expiresAt === "string" ? nextRecord.expiresAt : offer?.expiresAt ?? null;
    const expires = expiresRaw ? `expires ${formatHistoryStamp(expiresRaw)}` : null;
    return [typeName, quoted, expires].filter(Boolean).join(" · ") || event.notes || "Offer created";
  }

  const friendly = changes
    .filter((change) => !isInternalHistoryValue(change.key, change.to) && !isInternalHistoryValue(change.key, change.from))
    .map((change) => {
      const label =
        WAITLIST_FIELD_LABELS[change.key] ??
        change.key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
      if (change.from === "—" || change.from === "") {
        if (change.key === "expiresAt") return `expires ${staffHistoryValue(change.key, change.to)}`;
        return `${label} ${staffHistoryValue(change.key, change.to)}`;
      }
      return `${label} ${staffHistoryValue(change.key, change.from)} → ${staffHistoryValue(change.key, change.to)}`;
    });
  return [event.notes, ...friendly].filter(Boolean).join(" · ") || "—";
}

function OverviewFact({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5">
      <dt className="flex items-center gap-1.5 text-[11px] text-[#7A6B58]">
        {icon ? <span className="shrink-0 text-[#C89933]">{icon}</span> : null}
        {label}
      </dt>
      <dd className="min-w-0 truncate text-sm text-[#251605]">{missing ? "—" : value}</dd>
    </div>
  );
}

const FACT_ICON = "size-3 shrink-0";

function WaitlistDetailWorkspace({
  restaurantId,
  canWrite,
  listRow,
  detail,
  roomTypes,
  onAmend,
  onMatch,
  onOffer,
  onRespond,
  onConvert,
  onCancel,
  onOpenReservation,
  onChanged,
  onClose,
}: {
  restaurantId: string;
  canWrite: boolean;
  listRow: WaitlistListRow | null;
  detail: WaitlistDetail;
  roomTypes: Array<{ id: string; name: string }>;
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
  onClose: () => void;
}) {
  const request = detail.request;
  const fetchGuest = useServerFn(getGuest);
  const [tab, setTab] = useState<WaitlistDetailTab>("overview");
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendDirty, setAmendDirty] = useState(false);
  const [amendGuestSelected, setAmendGuestSelected] = useState(true);
  const [amendPending, setAmendPending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [overbookReason, setOverbookReason] = useState("");
  const [needsOverbook, setNeedsOverbook] = useState(false);
  const loadOverbookingControls = useServerFn(getOverbookingControls);
  const overbookingControls = useQuery({
    queryKey: ["overbooking-controls", restaurantId],
    queryFn: () => loadOverbookingControls({ data: { restaurantId } }),
  });
  const reasonRequired = overbookingControls.data?.reasonRequired !== false;
  const [candidates, setCandidates] = useState<WaitlistMatchCandidate[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [composingRoomTypeId, setComposingRoomTypeId] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);
  const acceptedOffer = useMemo(
    () => detail.offers.find((offer) => offer.displayStatus === "accepted") ?? null,
    [detail.offers],
  );
  const mutable =
    canWrite && request.displayStatus !== "converted" && request.displayStatus !== "cancelled";
  const nights = nightsBetween(request.arrivalDate, request.departureDate);
  const guestQuery = useQuery({
    queryKey: ["pms-waitlist-detail-guest", restaurantId, request.guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: request.guestId } }),
    enabled: Boolean(request.guestId),
    retry: false,
  });
  const guest = guestQuery.data?.guest ?? null;

  useEffect(() => {
    if (tab !== "match" || candidates !== null || matching) return;
    setMatching(true);
    void onMatch({ data: { restaurantId, requestId: request.id } })
      .then((result) => setCandidates(result.candidates))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not match availability.");
        setCandidates([]);
      })
      .finally(() => setMatching(false));
  }, [tab, candidates, matching, onMatch, restaurantId, request.id]);

  function runMatch() {
    setMatching(true);
    void onMatch({ data: { restaurantId, requestId: request.id } })
      .then((result) => setCandidates(result.candidates))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not match availability."),
      )
      .finally(() => setMatching(false));
  }

  const showMatchNotes = (candidates ?? []).some(
    (row) => !row.occupancyFits || row.requested || row.alternate,
  );
  const pendingOffers = detail.offers.filter((offer) => offer.displayStatus === "pending").length;

  return (
    <div className="flex min-h-0 flex-col" data-testid="waitlist-quick-view">
      <header className="relative shrink-0 bg-[#1F140A] px-4 py-2 pr-3 text-[#F3E9D8]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-semibold">
              <span className="truncate">
                {request.confirmationNumber}
                <span className="text-[#8A7A61]"> · </span>
                {request.guestName ?? "Guest"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STATUS_CHIP[request.displayStatus] ?? "bg-white/10 text-[#F3E9D8]",
                )}
              >
                {statusLabel(request.displayStatus)}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                Priority {request.priority}
              </span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                  aria-label="Waitlist actions"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-[#DDD4C5]">
                {request.reservationId ? (
                  <DropdownMenuItem onSelect={() => onOpenReservation(request.reservationId!)}>
                    Open reservation
                  </DropdownMenuItem>
                ) : null}
                {mutable ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("overview");
                      setAmendOpen(true);
                    }}
                  >
                    Amend Request
                  </DropdownMenuItem>
                ) : null}
                {mutable ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setCancelOpen(true)}
                  >
                    Cancel Request
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <DialogTitle className="sr-only">
          {request.confirmationNumber} · {request.guestName ?? "Guest"}
        </DialogTitle>
        <DialogDescription className="sr-only">Waitlist request details</DialogDescription>
      </header>
      <div className="h-0.5 shrink-0 bg-[#C89933]" aria-hidden />
      <div className="flex min-h-0 flex-col bg-[#F7F4EE]">
        <nav className="shrink-0 overflow-x-auto border-b border-[#E8DFD0] bg-[#FBF7F1]" aria-label="Waitlist sections">
          <ul role="tablist" className="flex min-w-max items-center gap-0.5 px-3">
            {DETAIL_TABS.map((item) => {
              const active = tab === item.id;
              return (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={cn(
                      "relative whitespace-nowrap px-2.5 py-2 text-xs font-medium transition-colors",
                      "outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                      active
                        ? "text-[#251605] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#C89933]"
                        : "text-[#5C5346] hover:text-[#251605]",
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-h-0 overflow-y-auto p-3">
          {tab === "overview" ? (
            amendOpen && listRow ? (
              <WaitlistRequestForm
                formId="waitlist-amend-fields"
                hideSubmit
                canCreateGuest={canWrite}
                restaurantId={restaurantId}
                roomTypes={roomTypes}
                submitting={amendPending}
                initial={listRow}
                onDraftChange={(state) => {
                  setAmendDirty(state.dirty);
                  setAmendGuestSelected(state.guestSelected);
                }}
                onSubmit={(values) => {
                  setAmendPending(true);
                  void onAmend({ data: { restaurantId, requestId: request.id, ...values } })
                    .then(() => {
                      toast.success("Waitlist request updated. Pending offers were cleared.");
                      setAmendOpen(false);
                      setCandidates(null);
                      onChanged();
                    })
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : "Could not amend waitlist."),
                    )
                    .finally(() => setAmendPending(false));
                }}
              />
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <section className="rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7A6B58]">Guest</h2>
                    <dl className="mt-2 space-y-1">
                      <OverviewFact
                        label="Name"
                        icon={<User className={FACT_ICON} />}
                        value={guest?.fullName ?? request.guestName ?? "Guest"}
                      />
                      <OverviewFact
                        label="Guest ID"
                        icon={<Hash className={FACT_ICON} />}
                        value={guest?.profileNumber}
                      />
                      <OverviewFact
                        label="Phone"
                        icon={<Phone className={FACT_ICON} />}
                        value={guest?.phone}
                      />
                      <OverviewFact
                        label="Email"
                        icon={<Mail className={FACT_ICON} />}
                        value={guest?.email}
                      />
                    </dl>
                  </section>
                  <section className="rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7A6B58]">Request</h2>
                    <dl className="mt-2 space-y-1">
                      <OverviewFact
                        label="Arrival"
                        icon={<Calendar className={FACT_ICON} />}
                        value={formatStayDate(request.arrivalDate)}
                      />
                      <OverviewFact
                        label="Departure"
                        icon={<CalendarDays className={FACT_ICON} />}
                        value={formatStayDate(request.departureDate)}
                      />
                      <OverviewFact
                        label="Nights"
                        icon={<Moon className={FACT_ICON} />}
                        value={nights}
                      />
                      <OverviewFact
                        label="Adults"
                        icon={<Users className={FACT_ICON} />}
                        value={request.adults}
                      />
                      <OverviewFact
                        label="Children"
                        icon={<Baby className={FACT_ICON} />}
                        value={request.children}
                      />
                      <OverviewFact
                        label="Room Type"
                        icon={<BedDouble className={FACT_ICON} />}
                        value={request.requestedRoomTypeName ?? "Any room type"}
                      />
                      <OverviewFact
                        label="Priority"
                        icon={<Flag className={FACT_ICON} />}
                        value={request.priority}
                      />
                      <OverviewFact
                        label="Flexible Dates"
                        icon={<CalendarRange className={FACT_ICON} />}
                        value={request.flexibleDates ? "Yes" : "No"}
                      />
                      {request.notes ? <OverviewFact label="Notes" value={request.notes} /> : null}
                    </dl>
                  </section>
                </div>
                <p className="rounded-md bg-[#F3EDE3]/80 px-2.5 py-1.5 text-[11px] leading-4 text-[#7A6B58]">
                  {request.confirmationNumber}
                  {" · "}
                  {statusLabel(request.displayStatus)}
                  {" · Created "}
                  {formatCreatedAt(request.createdAt)}
                  {" · "}
                  {pendingOffers} active offer{pendingOffers === 1 ? "" : "s"}
                  {request.updatedAt.slice(0, 10) !== request.createdAt.slice(0, 10) ? (
                    <span>{` · Updated ${formatCreatedAt(request.updatedAt)}`}</span>
                  ) : null}
                </p>
              </div>
            )
          ) : null}

          {tab === "match" ? (
            <section className="overflow-hidden rounded-lg border border-[#DDD4C5] bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-[#EEE6D8] px-3 py-2">
                <p className="min-w-0 truncate text-xs text-[#5C5346]">
                  {formatStayDate(request.arrivalDate)} → {formatStayDate(request.departureDate)}
                  {" · "}
                  {nights} night{nights === 1 ? "" : "s"}
                  {" · "}
                  {request.adults} adult{request.adults === 1 ? "" : "s"}
                  {request.children > 0 ? ` · ${request.children} children` : ""}
                  {request.flexibleDates ? " · Flexible dates" : ""}
                </p>
                {mutable ? (
                  <button
                    type="button"
                    className="rounded-md p-1 text-[#4a2c1a] hover:bg-[#F7F4EE] disabled:opacity-50"
                    title="Refresh availability"
                    aria-label="Refresh availability"
                    disabled={matching}
                    onClick={() => {
                      setComposingRoomTypeId(null);
                      runMatch();
                    }}
                  >
                    <RefreshCw className={cn("size-3.5", matching && "animate-spin")} />
                  </button>
                ) : null}
              </div>
              {matching && candidates === null ? (
                <p className="px-3 py-4 text-sm text-[#7A6B58]">Matching availability…</p>
              ) : candidates && candidates.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[#7A6B58]">No availability matches this request.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#FAF8F4] text-[10px] font-semibold uppercase tracking-[0.11em] text-[#7A6B58]">
                      <tr>
                        <th className="px-3 py-1.5">Room Type</th>
                        <th className="px-3 py-1.5 text-right">Available</th>
                        {showMatchNotes ? <th className="px-3 py-1.5">Notes</th> : null}
                        <th className="px-3 py-1.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(candidates ?? []).map((candidate) => {
                        const selected = composingRoomTypeId === candidate.roomTypeId;
                        const rowQuote =
                          candidate.quotes.find((row) => !row.unavailableReason) ?? candidate.quotes[0] ?? null;
                        return (
                          <tr key={candidate.roomTypeId} className="border-t border-[#EEE6D8]">
                            <td className="px-3 py-1.5 font-medium text-[#251605]">{candidate.name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{candidate.available}</td>
                            {showMatchNotes ? (
                              <td className="px-3 py-1.5 text-xs text-[#7A6B58]">
                                {!candidate.occupancyFits
                                  ? "Occupancy exceeds this type"
                                  : candidate.requested
                                    ? "Requested type"
                                    : candidate.alternate
                                      ? "Alternate"
                                      : ""}
                              </td>
                            ) : null}
                            <td className="px-3 py-1.5 text-right">
                              {mutable && candidate.occupancyFits && candidate.available > 0 ? (
                                <Popover
                                  open={selected}
                                  onOpenChange={(open) =>
                                    setComposingRoomTypeId(open ? candidate.roomTypeId : null)
                                  }
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className={cn(
                                        "h-7 px-2 text-xs font-medium text-[#8A641A] hover:bg-[#F7F4EE]",
                                        selected && "bg-[#FBF4E4] font-semibold",
                                      )}
                                    >
                                      {selected ? "Selected" : "Select"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    align="end"
                                    side="left"
                                    sideOffset={8}
                                    collisionPadding={16}
                                    className="z-[80] w-[340px] rounded-lg border-[#DDD4C5] p-3 shadow-[0_8px_24px_rgba(74,44,26,0.16)]"
                                    onOpenAutoFocus={(event) => event.preventDefault()}
                                  >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A6B58]">
                                      Create Offer
                                    </p>
                                    <dl className="mt-2 space-y-1">
                                      <OverviewFact
                                        label="Room Type"
                                        icon={<BedDouble className={FACT_ICON} />}
                                        value={candidate.name}
                                      />
                                      <OverviewFact
                                        label="Amount"
                                        value={
                                          rowQuote?.subtotal != null
                                            ? formatWaitlistMoney(rowQuote.subtotal, rowQuote.currency)
                                            : "Quoted on create"
                                        }
                                      />
                                      <OverviewFact
                                        label="Valid Until"
                                        value={formatHistoryStamp(defaultOfferExpiresAt())}
                                      />
                                    </dl>
                                    <div className="mt-3 flex items-center justify-between">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => setComposingRoomTypeId(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        className={cn(SHELL_PRIMARY_BUTTON, "h-8 px-3 text-xs")}
                                        disabled={offering}
                                        onClick={() => {
                                          setOffering(true);
                                          void onOffer({
                                            data: {
                                              restaurantId,
                                              requestId: request.id,
                                              roomTypeId: candidate.roomTypeId,
                                              ratePlanId: rowQuote?.ratePlanId ?? null,
                                            },
                                          })
                                            .then(() => {
                                              toast.success("Offer created. Inventory is not held.");
                                              setComposingRoomTypeId(null);
                                              setCandidates(null);
                                              onChanged();
                                            })
                                            .catch((error: unknown) =>
                                              toast.error(
                                                error instanceof Error
                                                  ? error.message
                                                  : "Could not create offer.",
                                              ),
                                            )
                                            .finally(() => setOffering(false));
                                        }}
                                      >
                                        {offering ? "Creating…" : "Create Offer"}
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {tab === "offers" ? (
            <section className="overflow-hidden rounded-lg border border-[#DDD4C5] bg-white shadow-sm">
              {detail.offers.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-sm font-medium text-[#251605]">No offers yet.</p>
                  <p className="mt-1 text-xs text-[#7A6B58]">
                    Select a room type from Availability to create an offer.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#FAF8F4] text-[10px] font-semibold uppercase tracking-[0.11em] text-[#7A6B58]">
                      <tr>
                        <th className="px-3 py-1.5">Room Type</th>
                        <th className="px-3 py-1.5">Amount</th>
                        <th className="px-3 py-1.5">Valid Until</th>
                        <th className="px-3 py-1.5">Status</th>
                        <th className="px-3 py-1.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.offers.map((offer) => (
                        <tr key={offer.id} className="border-t border-[#EEE6D8]">
                          <td className="px-3 py-1.5 font-medium text-[#251605]">{offer.roomTypeName}</td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {formatWaitlistMoney(offer.quotedTotal, offer.quotedCurrency)}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-[#5C5346]">{formatDateTime(offer.expiresAt)}</td>
                          <td className="px-3 py-1.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                OFFER_CHIP[offer.displayStatus] ?? "bg-[#F3EDE3] text-[#8A8175]",
                              )}
                            >
                              {statusLabel(offer.displayStatus)}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {canWrite && offer.displayStatus === "pending" ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-[#4a2c1a]"
                                    aria-label="Offer actions"
                                  >
                                    <MoreHorizontal className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40 border-[#DDD4C5]">
                                  <DropdownMenuItem
                                    onSelect={() =>
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
                                            error instanceof Error
                                              ? error.message
                                              : "Could not accept offer.",
                                          ),
                                        )
                                    }
                                  >
                                    Mark Accepted
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
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
                                            error instanceof Error
                                              ? error.message
                                              : "Could not decline offer.",
                                          ),
                                        )
                                    }
                                  >
                                    Mark Declined
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canWrite && acceptedOffer && !request.reservationId ? (
                <div className="space-y-2 border-t border-[#EEE6D8] px-3 py-2">
                  <Button
                    className={cn(SHELL_PRIMARY_BUTTON, "h-8 px-3 text-xs")}
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
            </section>
          ) : null}

          {tab === "history" ? (
            <section className="overflow-hidden rounded-lg border border-[#DDD4C5] bg-white shadow-sm">
              {detail.history.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[#7A6B58]">No waitlist activity recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#FAF8F4] text-[10px] font-semibold uppercase tracking-[0.11em] text-[#7A6B58]">
                      <tr>
                        <th className="px-3 py-1.5">Date / Time</th>
                        <th className="px-3 py-1.5">Event</th>
                        <th className="px-3 py-1.5">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.map((event) => (
                        <tr key={event.id} className="border-t border-[#EEE6D8]">
                          <td className="whitespace-nowrap px-3 py-1.5 text-xs text-[#5C5346]">
                            {formatDateTime(event.created_at)}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-[#251605]">
                            {WAITLIST_EVENT_LABELS[event.event_type] ??
                              event.event_type.replaceAll("_", " ")}
                          </td>
                          <td className="px-3 py-1.5 text-sm">
                            {waitlistHistorySummary(event, roomTypes, detail.offers)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </div>
        {amendOpen && tab === "overview" ? (
          <footer className="shrink-0 border-t border-[#E8DFD0] bg-white px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[#DDD4C5]"
                onClick={() => setAmendOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="waitlist-amend-fields"
                className={cn(SHELL_PRIMARY_BUTTON, "disabled:opacity-70")}
                disabled={amendPending || !amendDirty || !amendGuestSelected}
              >
                {amendPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </footer>
        ) : null}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="z-[80] max-w-md rounded-2xl border-[#DDD4C5] p-0">
          <header className="bg-[#1F140A] px-4 py-2.5 text-[#F3E9D8]">
            <DialogTitle className="text-sm font-semibold">Cancel Request</DialogTitle>
            <DialogDescription className="text-[11px] text-[#C4B6A0]">
              This waitlist request will be cancelled.
            </DialogDescription>
          </header>
          <div className="h-0.5 bg-[#C89933]" aria-hidden />
          <p className="px-4 py-3 text-sm text-[#251605]">
            Cancel this waitlist request? Existing pending offers will no longer be active.
          </p>
          <footer className="flex items-center justify-between border-t border-[#E8DFD0] px-4 py-2">
            <Button type="button" variant="outline" className="h-9 border-[#DDD4C5]" onClick={() => setCancelOpen(false)}>
              Keep request
            </Button>
            <Button
              type="button"
              className="h-9 bg-[#A45B4A] text-white hover:bg-[#8E4E40]"
              onClick={() =>
                void onCancel({ data: { restaurantId, requestId: request.id } })
                  .then(() => {
                    toast.success("Waitlist request cancelled.");
                    setCancelOpen(false);
                    onChanged();
                    onClose();
                  })
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Could not cancel waitlist."),
                  )
              }
            >
              Cancel request
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </div>
  );
}
