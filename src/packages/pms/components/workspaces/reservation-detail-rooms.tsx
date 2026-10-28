import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  Info,
  MoreHorizontal,
  Search,
  Shield,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import {
  ASSIGNMENT_NOTES_MAX,
  assignmentAvailabilityMessage,
  assignmentLabel,
  buildRoomAssignmentRows,
  buildRoomPrefDraft,
  emptyRoomFilters,
  filterRoomAssignmentRows,
  ROOM_ASSIGNMENT_PREFS,
  ROOM_PREF_SAVE_COPY,
  roomCanBeSelected,
  roomSelectionNotice,
  roomHoldReason,
  roomsDraftDirty,
  specialRequestsFromPrefs,
  uniqueFilterOptions,
  type RoomAssignmentFilters,
  type RoomAssignmentPrefId,
  type RoomAssignmentSelection,
} from "@/packages/pms/lib/reservation-detail-rooms";
import { saveAssignmentNotes } from "@/packages/pms/lib/reservation-detail-controls.functions";
import { listReservationRoomDisplay } from "@/packages/pms/lib/reservation-room-display.functions";
import {
  amendReservation,
  assignReservationRoom,
  listAssignableRooms,
  type AssignableRoom,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { unitAssignmentSnapshot } from "@/packages/pms/lib/room-assignment-snapshot";
import { listRooms, listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { storedRatePerNight } from "@/packages/pms/lib/reservation-detail-overview";
import { ReservationRoomOccupants } from "@/packages/pms/components/workspaces/reservation-detail-room-occupants";
import { RoomTypeChangeDialog } from "@/packages/pms/components/workspaces/reservation-room-type-change";
import {
  isClosedReservation,
  isUnarrivedPastStay,
  reservationDetailEditable,
  roomMenuActions,
  roomMenuLabel,
  type RoomMenuAction,
} from "@/packages/pms/lib/reservation-lifecycle";
import type { RoomOperationAction } from "@/packages/pms/lib/reservation-room-occupants";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";
const ALL = "__all";

export function ReservationDetailRoomsTab({
  restaurantId,
  reservation,
  assignableRooms,
  canManage,
  businessDate,
  money,
  paymentReceived = null,
  paymentRefunded = null,
  guestDeposit = null,
  totalAmount,
  coverUrl,
  occupancyLabel,
  onBackToGuest,
  onSaved,
  onOperate,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  assignableRooms: AssignableRoom[];
  canManage: boolean;
  businessDate: string;
  money: (value: number) => string;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  coverUrl: string | null;
  occupancyLabel: string | null;
  onBackToGuest: () => void;
  onSaved: () => void;
  onOperate?: (action: RoomOperationAction, reservationRoomId: string) => void;
}) {
  const fetchRooms = useServerFn(listRooms);
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchAssignable = useServerFn(listAssignableRooms);
  const fetchRoomDisplay = useServerFn(listReservationRoomDisplay);
  const submitAssign = useServerFn(assignReservationRoom);
  const submitAmend = useServerFn(amendReservation);
  const submitNotes = useServerFn(saveAssignmentNotes);
  const units = reservation.rooms ?? [];
  const [filters, setFilters] = useState<RoomAssignmentFilters>(emptyRoomFilters);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [assignmentMode, setAssignmentMode] = useState<RoomAssignmentSelection | null>(null);
  const [roomTypeOpen, setRoomTypeOpen] = useState(false);
  const [candidateRoomId, setCandidateRoomId] = useState("");
  const [prefs, setPrefs] = useState(() => buildRoomPrefDraft(reservation.specialRequests));
  const [notes, setNotes] = useState(
    units.find((unit) => unit.id === (units[0]?.id ?? ""))?.assignmentNotes ?? "",
  );

  useEffect(() => {
    setAssignmentMode(null);
    setCandidateRoomId("");
    setPrefs(buildRoomPrefDraft(reservation.specialRequests));
    const nextUnit = reservation.rooms?.[0]?.id ?? "";
    setUnitId((current) =>
      reservation.rooms?.some((unit) => unit.id === current) ? current : nextUnit,
    );
  }, [reservation]);

  useEffect(() => {
    const unit = (reservation.rooms ?? []).find((row) => row.id === unitId);
    setNotes(unit?.assignmentNotes ?? "");
  }, [reservation, unitId]);

  const activeUnit =
    units.find((unit) => unit.id === unitId) ?? (units.length === 1 ? units[0] : null) ?? null;
  const activeRoomTypeId = activeUnit?.roomTypeId ?? reservation.roomTypeId;
  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId, "reservation-detail-rooms"],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });
  const unitArrival = activeUnit?.arrivalDate ?? reservation.arrivalDate;
  const unitDeparture = activeUnit?.departureDate ?? reservation.departureDate;
  const roomsQuery = useQuery({
    queryKey: ["hotel-rooms", restaurantId, activeRoomTypeId, "reservation-detail-rooms"],
    queryFn: () => fetchRooms({ data: { restaurantId, roomTypeId: activeRoomTypeId } }),
    retry: false,
  });
  const assignableQuery = useQuery({
    queryKey: [
      "assignable-rooms",
      restaurantId,
      activeRoomTypeId,
      unitArrival,
      unitDeparture,
      reservation.id,
      activeUnit?.id,
    ],
    queryFn: () =>
      fetchAssignable({
        data: {
          restaurantId,
          roomTypeId: activeRoomTypeId,
          arrival: unitArrival,
          departure: unitDeparture,
          excludeReservationId: reservation.id,
        },
      }),
    enabled: Boolean(activeRoomTypeId),
    retry: false,
  });
  const displayQuery = useQuery({
    queryKey: [
      "reservation-room-display",
      restaurantId,
      reservation.id,
      activeUnit?.id,
      activeUnit?.roomTypeId,
      activeUnit?.arrivalDate,
      activeUnit?.departureDate,
    ],
    queryFn: () =>
      fetchRoomDisplay({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: activeUnit?.id ?? "",
        },
      }),
    enabled: Boolean(activeUnit?.id),
    retry: false,
  });

  const roomType = (typesQuery.data ?? []).find((row) => row.id === activeRoomTypeId) ?? null;
  const allRows = useMemo(
    () =>
      buildRoomAssignmentRows({
        rooms: roomsQuery.data ?? [],
        assignable: assignableQuery.data ?? (activeUnit ? [] : assignableRooms),
        roomType,
        ...(displayQuery.data ? { display: displayQuery.data } : {}),
      }),
    [
      roomsQuery.data,
      assignableQuery.data,
      assignableRooms,
      activeUnit,
      roomType,
      displayQuery.data,
    ],
  );
  const options = uniqueFilterOptions(allRows);
  const rows = filterRoomAssignmentRows(allRows, filters);
  const assigned = assignmentLabel(reservation);
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const perNight = storedRatePerNight(
    reservation.nightlyRates,
    reservation.roomSubtotal,
    reservation.nights,
  );
  const activeRoomId = activeUnit
    ? activeUnit.roomId
    : units.length === 0
      ? reservation.roomId
      : null;
  const activeStatus = activeUnit?.status ?? reservation.status;
  const lifecycle = {
    status: reservation.status,
    arrivalDate: reservation.arrivalDate,
    businessDate,
    canManage,
  };
  const editable = reservationDetailEditable(lifecycle);
  const menuActions = roomMenuActions({
    status: activeStatus,
    arrivalDate: reservation.arrivalDate,
    businessDate,
    canManage,
    roomId: activeRoomId,
  });
  const savedPrefs = useMemo(
    () => buildRoomPrefDraft(reservation.specialRequests),
    [reservation.specialRequests],
  );
  const savedNotes = activeUnit?.assignmentNotes ?? "";
  const isDirty = roomsDraftDirty({ prefs, savedPrefs, notes, savedNotes });

  const assign = useMutation({
    mutationFn: (input: { roomId: string | null; reservationRoomId: string }) =>
      submitAssign({
        data: {
          restaurantId,
          reservationId: reservation.id,
          roomId: input.roomId,
          ...(input.reservationRoomId ? { reservationRoomId: input.reservationRoomId } : {}),
          ...unitAssignmentSnapshot({
            units,
            reservationRoomId: input.reservationRoomId,
            headerRoomId: reservation.roomId,
            updatedAt: reservation.updatedAt,
          }),
        },
      }),
    onSuccess: () => {
      setAssignmentMode(null);
      setCandidateRoomId("");
      toast.success("Room assignment updated.");
      onSaved();
    },
    onError: (error: Error, input) => {
      void assignableQuery.refetch();
      void displayQuery.refetch();
      if (input.roomId) {
        const controlled = assignmentAvailabilityMessage(error.message);
        if (controlled) {
          setCandidateRoomId("");
          toast.error(controlled);
          return;
        }
      }
      toast.error(error.message);
    },
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      let saved = false;
      if (roomsDraftDirty({ prefs, savedPrefs, notes: savedNotes, savedNotes })) {
        await submitAmend({
          data: {
            restaurantId,
            reservationId: reservation.id,
            guestId: reservation.guestId,
            roomTypeId: reservation.roomTypeId,
            roomId: reservation.roomId,
            arrival: reservation.arrivalDate,
            departure: reservation.departureDate,
            adults: reservation.adults,
            children: reservation.children,
            notes: reservation.notes,
            specialRequests: specialRequestsFromPrefs(reservation.specialRequests, prefs),
            ratePlanId: reservation.ratePlanId,
          },
        });
        saved = true;
      }
      if (notes.trim() !== savedNotes.trim()) {
        if (!unitId) throw new Error("This stay has no room unit for assignment notes.");
        await submitNotes({
          data: {
            restaurantId,
            reservationId: reservation.id,
            reservationRoomId: unitId,
            notes: notes.trim() || null,
          },
        });
        saved = true;
      }
      return saved;
    },
    onSuccess: (saved) => {
      if (!saved) return;
      toast.success("Room changes saved.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function beginSelection(
    intent: RoomAssignmentSelection["intent"],
    unit: ReservationRoomUnit | null = activeUnit,
  ) {
    const nextId = unit?.id ?? unitId;
    if (nextId) setUnitId(nextId);
    setCandidateRoomId("");
    setAssignmentMode({
      intent,
      reservationRoomId: nextId,
      unitSequence: unit?.unitSequence ?? activeUnit?.unitSequence ?? 1,
      currentRoomId: unit?.roomId ?? (unit ? null : activeRoomId),
    });
  }

  function cancelSelection() {
    setAssignmentMode(null);
    setCandidateRoomId("");
  }

  function commitSelection() {
    if (!assignmentMode || !candidateRoomId) return;
    const row = allRows.find((item) => item.id === candidateRoomId);
    if (!row?.eligible || candidateRoomId === assignmentMode.currentRoomId) return;
    assign.mutate({
      roomId: candidateRoomId,
      reservationRoomId: assignmentMode.reservationRoomId,
    });
  }

  function runRoomAction(action: RoomMenuAction, unit: ReservationRoomUnit | null = activeUnit) {
    const targetId = unit?.id ?? unitId;
    if ((reservation.rooms ?? []).length > 1 && !targetId) {
      toast.error("Choose which room this action applies to.");
      return;
    }
    if (targetId && targetId !== unitId) {
      setUnitId(targetId);
      cancelSelection();
    }
    if (action === "change_room_type") {
      setRoomTypeOpen(true);
      return;
    }
    if (action === "unassign") {
      assign.mutate({ roomId: null, reservationRoomId: targetId });
      return;
    }
    const targetStatus = unit?.status ?? activeStatus;
    if (action === "change_room" && targetStatus === "checked_in") {
      if (!targetId) return;
      onOperate?.("change_room", targetId);
      return;
    }
    if (action === "assign" || action === "change_room") beginSelection(action, unit);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-rooms">
      <RoomTypeChangeDialog
        open={roomTypeOpen}
        onOpenChange={setRoomTypeOpen}
        restaurantId={restaurantId}
        reservation={reservation}
        unit={activeUnit ?? null}
        money={money}
        onSaved={onSaved}
      />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <p
            className="flex items-start gap-2 rounded-xl border border-[#D7E4F5] bg-[#F3F7FD] px-3 py-2 text-xs text-[#1E3A5F]"
            data-testid="rooms-action-notice"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {isClosedReservation(reservation.status) ||
              isUnarrivedPastStay({
                status: reservation.status,
                arrivalDate: reservation.arrivalDate,
                businessDate,
              })
                ? "This reservation is closed. Room assignment cannot be changed."
                : activeStatus === "checked_in"
                  ? "This room is in house. A room change uses the Front Office room move."
                  : "Room actions are available only for upcoming stays that have not yet been checked in. After check-in, room assignment, unassignment, and room type changes will no longer be available."}
            </span>
          </p>
          <ReservationRoomOccupants
            restaurantId={restaurantId}
            reservation={reservation}
            canManage={canManage}
            onChanged={onSaved}
            onOperate={onOperate}
            money={money}
            {...(units.length > 1
              ? {
                  selectedUnitId: unitId,
                  onSelectUnit: (id: string) => {
                    setUnitId(id);
                    cancelSelection();
                    setRoomTypeOpen(false);
                  },
                  roomActionsFor: (unit: ReservationRoomUnit) =>
                    roomMenuActions({
                      status: unit.status ?? reservation.status,
                      arrivalDate: unit.arrivalDate,
                      businessDate,
                      canManage,
                      roomId: unit.roomId,
                    }),
                  onRoomAction: runRoomAction,
                }
              : {})}
          />
          {units.length > 1 ? null : (
            <RoomSummaryCard
              reservation={reservation}
              roomNumber={activeUnit?.roomNumber ?? reservation.roomNumber}
              assigned={activeRoomId ? "Assigned" : assigned}
              coverUrl={coverUrl}
              occupancyLabel={occupancyLabel}
              roomSize={roomType?.roomSize ?? null}
              view={roomType?.roomView ?? null}
              bedType={roomType?.beds?.[0]?.bedType ?? roomType?.bedType ?? null}
              perNight={perNight}
              money={money}
              totalAmount={totalAmount}
              actions={menuActions}
              assigning={assign.isPending}
              onAction={(action) => runRoomAction(action)}
            />
          )}
          <AvailableRoomsCard
            rows={rows}
            filters={filters}
            options={options}
            selection={assignmentMode}
            candidateRoomId={candidateRoomId}
            candidateEligible={roomCanBeSelected({
              selecting: assignmentMode != null,
              eligible: allRows.some((row) => row.id === candidateRoomId && row.eligible),
              current:
                (assignmentMode?.currentRoomId ?? activeRoomId) != null &&
                candidateRoomId === (assignmentMode?.currentRoomId ?? activeRoomId),
            })}
            assignedRoomId={assignmentMode?.currentRoomId ?? activeRoomId}
            assigning={assign.isPending}
            onFilters={setFilters}
            onSelect={setCandidateRoomId}
            onCancel={cancelSelection}
            onCommit={commitSelection}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <RoomPreferencesCard
              prefs={prefs}
              editable={editable}
              onToggle={(id, checked) => setPrefs((current) => ({ ...current, [id]: checked }))}
            />
            <AssignmentNotesCard value={notes} editable={editable} onChange={setNotes} />
          </div>
        </div>
        <RoomsSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          paymentReceived={paymentReceived}
          paymentRefunded={paymentRefunded}
          guestDeposit={guestDeposit}
          totalAmount={totalAmount}
          nights={nights}
        />
      </div>
      <div
        className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-[#FAF8F5]/95 px-4 py-3 backdrop-blur-xs sm:px-6"
        data-testid="rooms-footer"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F2EA]"
          onClick={onBackToGuest}
        >
          <ArrowLeft className="size-3.5" />
          Back to Guest
        </Button>
        <div className="flex items-center gap-3">
          {isDirty ? (
            <span className="flex items-center text-xs font-medium text-[#E06D14]">
              <span className="mr-1.5 size-2 rounded-full bg-[#E06D14]" />
              Unsaved changes
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F2EA]"
            disabled={!editable || !isDirty}
            onClick={() => {
              setPrefs(buildRoomPrefDraft(reservation.specialRequests));
              setNotes(savedNotes);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-[#251605] px-4 text-xs font-medium text-white hover:bg-[#3D2810]"
            disabled={!editable || saveDraft.isPending}
            onClick={() => saveDraft.mutate()}
          >
            {saveDraft.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoomSummaryCard({
  reservation,
  roomNumber,
  assigned,
  coverUrl,
  occupancyLabel,
  roomSize,
  view,
  bedType,
  perNight,
  money,
  totalAmount,
  actions,
  assigning,
  onAction,
}: {
  reservation: ReservationDetail;
  roomNumber: string | null;
  assigned: string;
  coverUrl: string | null;
  occupancyLabel: string | null;
  roomSize: string | null;
  view: string | null;
  bedType: string | null;
  perNight: number | null;
  money: (value: number) => string;
  totalAmount?: number | null;
  actions: RoomMenuAction[];
  assigning: boolean;
  onAction: (action: RoomMenuAction) => void;
}) {
  const stayTotal = totalAmount !== undefined ? totalAmount : reservation.roomSubtotal;
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rooms-summary"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">Room(s) for this Reservation</h2>
          <p className="text-xs text-muted-foreground">
            View and manage room assignment, room details and room preferences.
          </p>
        </div>
        {actions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Room actions"
                data-testid="room-actions-menu"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[80]">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action}
                  disabled={assigning}
                  data-testid={`room-menu-${action}`}
                  onClick={() => onAction(action)}
                >
                  {roomMenuLabel(action)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex gap-3">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-24 w-32 rounded-md object-cover" />
          ) : (
            <div className="flex h-24 w-32 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-8" />
            </div>
          )}
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Room 1
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  assigned === "Assigned"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800",
                )}
              >
                {assigned}
              </span>
            </p>
            <p className="font-medium text-[#251605]">
              {roomNumber ? `Room ${roomNumber}` : "Unassigned"}
            </p>
            <p className="text-xs text-muted-foreground">{reviewDash(reservation.roomTypeName)}</p>
            <p className="text-xs text-muted-foreground">
              {reservation.adults} Adults
              {occupancyLabel ? ` · ${occupancyLabel}` : bedType ? ` · ${bedType}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {roomSize ? `${roomSize}` : ""}
              {view ? `${roomSize ? " · " : ""}${view}` : occupancyLabel ? "" : ""}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Rate Plan</dt>
          <dd>{reviewDash(reservation.ratePlanName)}</dd>
          <dt className="text-muted-foreground">Rate per Night</dt>
          <dd>{perNight == null ? DETAIL_DASH : money(perNight)}</dd>
          <dt className="text-muted-foreground">Nights</dt>
          <dd>{reservation.nights}</dd>
          <dt className="text-muted-foreground">Total Amount</dt>
          <dd data-testid="rooms-total-amount">
            {stayTotal == null ? DETAIL_DASH : money(stayTotal)}
          </dd>
        </dl>
      </div>
    </section>
  );
}

function AvailableRoomsCard({
  rows,
  filters,
  options,
  selection,
  candidateRoomId,
  candidateEligible,
  assignedRoomId,
  assigning,
  onFilters,
  onSelect,
  onCancel,
  onCommit,
}: {
  rows: ReturnType<typeof filterRoomAssignmentRows>;
  filters: RoomAssignmentFilters;
  options: ReturnType<typeof uniqueFilterOptions>;
  selection: RoomAssignmentSelection | null;
  candidateRoomId: string;
  candidateEligible: boolean;
  assignedRoomId: string | null;
  assigning: boolean;
  onFilters: (next: RoomAssignmentFilters) => void;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  function patch(next: Partial<RoomAssignmentFilters>) {
    onFilters({ ...filters, ...next });
  }
  const selecting = selection != null;
  return (
    <section
      className={cn(
        "rounded-xl border bg-white p-4 shadow-sm",
        selecting ? "border-[#C4A574] ring-1 ring-[#C4A574]/40" : "border-[#DDD4C5]",
      )}
      data-testid="available-rooms"
      data-assignment-mode={selection ? selection.intent : "idle"}
    >
      <h2 className="font-display text-base text-[#251605]">Available Rooms</h2>
      {selection ? (
        <p
          className="mb-3 mt-2 rounded-lg border border-[#E8DFD0] bg-[#FBF8F2] px-3 py-2 text-xs text-[#251605]"
          data-testid="assignment-selection-notice"
        >
          {roomSelectionNotice(selection)}
        </p>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          Room actions from the room card open selection here. Only eligible rooms can be assigned.
        </p>
      )}
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label="Floor"
          value={filters.floor}
          options={options.floors}
          onChange={(floor) => patch({ floor })}
        />
        <FilterSelect
          label="View"
          value={filters.view}
          options={options.views}
          onChange={(view) => patch({ view })}
        />
        <FilterSelect
          label="Room Status"
          value={filters.status}
          options={options.statuses}
          onChange={(status) => patch({ status })}
        />
        <FilterSelect
          label="Features"
          value={filters.feature}
          options={options.features}
          onChange={(feature) => patch({ feature })}
        />
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Search room number</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <Input
              className={`${FIELD} pl-7`}
              value={filters.search}
              placeholder="Search room number…"
              onChange={(e) => patch({ search: e.target.value })}
            />
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground"
          data-testid="available-rooms-empty"
        >
          No eligible rooms match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Room No.</th>
                <th className="py-2 pr-2">Room Type</th>
                <th className="py-2 pr-2">Floor</th>
                <th className="py-2 pr-2">View</th>
                <th className="py-2 pr-2">Bed Type</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Features</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isCurrent = assignedRoomId != null && row.id === assignedRoomId;
                const selectable = roomCanBeSelected({
                  selecting,
                  eligible: row.eligible,
                  current: isCurrent,
                });
                const chosen = selecting && candidateRoomId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-[#F4EEE4]",
                      isCurrent && "bg-[#F4F7FB]",
                      chosen && !isCurrent && "bg-[#FBF8F2]",
                    )}
                    data-current-room={isCurrent ? "true" : undefined}
                    data-selectable={selectable ? "true" : "false"}
                  >
                    <td className="py-2 pr-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="reservation-room-select"
                          checked={chosen}
                          disabled={!selectable}
                          onChange={() => onSelect(row.id)}
                        />
                        {row.roomNumber}
                        {isCurrent ? (
                          <span className="rounded-full bg-[#E8EEF8] px-2 py-0.5 text-[10px] font-semibold text-[#1D4ED8]">
                            Assigned
                          </span>
                        ) : null}
                      </label>
                    </td>
                    <td className="py-2 pr-2">{reviewDash(row.roomTypeName)}</td>
                    <td className="py-2 pr-2">{reviewDash(row.floor)}</td>
                    <td className="py-2 pr-2">{reviewDash(row.view)}</td>
                    <td className="py-2 pr-2">{reviewDash(row.bedType)}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          row.statusTone === "ready" && "bg-emerald-50 text-emerald-700",
                          row.statusTone === "warn" && "bg-amber-50 text-amber-700",
                          row.statusTone === "blocked" && "bg-red-50 text-red-700",
                        )}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-xs">{row.features.join(" · ") || DETAIL_DASH}</td>
                    <td className="py-2 text-xs text-[#6B5E4E]">
                      {roomHoldReason({
                        eligible: row.eligible,
                        current: isCurrent,
                        occupiedUntil: row.occupiedUntil,
                        statusLabel: row.statusLabel,
                        blockerCode: row.blockerCode,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selection ? (
        <div className="mt-3 flex justify-end gap-2" data-testid="assignment-selection-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[#DDD4C5] bg-white text-[#251605]"
            onClick={onCancel}
          >
            Cancel Assignment
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-[#251605] px-4 text-xs font-medium text-white hover:bg-[#3D2810]"
            disabled={!candidateEligible || assigning}
            onClick={onCommit}
          >
            {assigning
              ? "Assigning…"
              : selection.intent === "change_room"
                ? "Confirm Replacement"
                : "Assign Selected Room"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
        <SelectTrigger className={FIELD}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RoomPreferencesCard({
  prefs,
  editable,
  onToggle,
}: {
  prefs: Record<RoomAssignmentPrefId, boolean>;
  editable: boolean;
  onToggle: (id: RoomAssignmentPrefId, checked: boolean) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="room-preferences"
    >
      <h2 className="font-display text-base text-[#251605]">Room Preferences for this Room</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Specific preferences for the assigned room.
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {ROOM_ASSIGNMENT_PREFS.map((pref) => (
          <label key={pref.id} className={cn("flex items-center gap-2", !editable && "opacity-60")}>
            <Checkbox
              checked={prefs[pref.id]}
              disabled={!editable}
              onCheckedChange={(value) => onToggle(pref.id, value === true)}
            />
            {pref.label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{ROOM_PREF_SAVE_COPY}</p>
    </section>
  );
}

function AssignmentNotesCard({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="assignment-notes"
    >
      <h2 className="font-display text-base text-[#251605]">Assignment Notes</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Internal notes about room assignment (visible to hotel staff only).
      </p>
      <Textarea
        id="assignment-notes"
        maxLength={ASSIGNMENT_NOTES_MAX}
        disabled={!editable}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, ASSIGNMENT_NOTES_MAX))}
        placeholder="Add assignment notes here…"
        className="min-h-24"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {value.length}/{ASSIGNMENT_NOTES_MAX}
      </p>
    </section>
  );
}

function RoomsSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
  paymentReceived,
  paymentRefunded,
  guestDeposit,
  totalAmount,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  paymentReceived: number | null;
  paymentRefunded: number | null;
  guestDeposit: number | null;
  totalAmount?: number | null;
}) {
  return (
    <ReservationDetailSummary
      testId="reservation-rooms-summary"
      reservation={reservation}
      money={money}
      coverUrl={coverUrl}
      nights={nights}
      paymentReceived={paymentReceived}
      paymentRefunded={paymentRefunded}
      guestDeposit={guestDeposit}
      totalAmount={totalAmount}
    />
  );
}
