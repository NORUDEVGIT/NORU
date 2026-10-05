import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
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
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  ASSIGNMENT_NOTES_GAP_COPY,
  ASSIGNMENT_NOTES_MAX,
  assignmentLabel,
  buildRoomAssignmentRows,
  buildRoomPrefDraft,
  emptyRoomFilters,
  filterRoomAssignmentRows,
  ROOM_ASSIGNMENT_PREFS,
  ROOM_PREF_SAVE_COPY,
  specialRequestsFromPrefs,
  uniqueFilterOptions,
  type RoomAssignmentFilters,
  type RoomAssignmentPrefId,
} from "@/packages/pms/lib/reservation-detail-rooms";
import {
  amendReservation,
  assignReservationRoom,
  type AssignableRoom,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { listRooms, listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { storedRatePerNight } from "@/packages/pms/lib/reservation-detail-overview";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";
const ALL = "__all";

export function ReservationDetailRoomsTab({
  restaurantId,
  reservation,
  assignableRooms,
  canManage,
  money,
  coverUrl,
  occupancyLabel,
  onBackToGuest,
  onChangeRoomType,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  assignableRooms: AssignableRoom[];
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  occupancyLabel: string | null;
  onBackToGuest: () => void;
  onChangeRoomType: () => void;
  onSaved: () => void;
}) {
  const fetchRooms = useServerFn(listRooms);
  const fetchTypes = useServerFn(listRoomTypes);
  const submitAssign = useServerFn(assignReservationRoom);
  const submitAmend = useServerFn(amendReservation);
  const [filters, setFilters] = useState<RoomAssignmentFilters>(emptyRoomFilters);
  const [selectedId, setSelectedId] = useState(reservation.roomId ?? "");
  const [prefs, setPrefs] = useState(() => buildRoomPrefDraft(reservation.specialRequests));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setSelectedId(reservation.roomId ?? "");
    setPrefs(buildRoomPrefDraft(reservation.specialRequests));
  }, [reservation]);

  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId, "reservation-detail-rooms"],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });
  const roomsQuery = useQuery({
    queryKey: ["hotel-rooms", restaurantId, reservation.roomTypeId, "reservation-detail-rooms"],
    queryFn: () => fetchRooms({ data: { restaurantId, roomTypeId: reservation.roomTypeId } }),
    retry: false,
  });

  const roomType = (typesQuery.data ?? []).find((row) => row.id === reservation.roomTypeId) ?? null;
  const allRows = useMemo(
    () =>
      buildRoomAssignmentRows({
        rooms: roomsQuery.data ?? [],
        assignable: assignableRooms,
        roomType,
      }),
    [roomsQuery.data, assignableRooms, roomType],
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
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled && ["pending", "confirmed"].includes(reservation.status);

  const assign = useMutation({
    mutationFn: (roomId: string | null) =>
      submitAssign({ data: { restaurantId, reservationId: reservation.id, roomId } }),
    onSuccess: () => {
      toast.success("Room assignment updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePrefs = useMutation({
    mutationFn: () =>
      submitAmend({
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
      }),
    onSuccess: () => {
      toast.success("Room preferences saved for this stay.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function assignSelected() {
    const target = selectedId || reservation.roomId;
    if (!target) {
      toast.error("Select an eligible room first.");
      return;
    }
    const row = allRows.find((item) => item.id === target);
    if (row && !row.eligible) {
      toast.error("That room is not assignable for these dates.");
      return;
    }
    assign.mutate(target);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-rooms">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <RoomSummaryCard
            reservation={reservation}
            assigned={assigned}
            coverUrl={coverUrl}
            occupancyLabel={occupancyLabel}
            roomSize={roomType?.roomSize ?? null}
            view={roomType?.roomView ?? null}
            bedType={roomType?.beds?.[0]?.bedType ?? roomType?.bedType ?? null}
            perNight={perNight}
            money={money}
            editable={editable}
            onAssign={assignSelected}
            onChangeRoomType={onChangeRoomType}
            assigning={assign.isPending}
          />
          <AvailableRoomsCard
            rows={rows}
            filters={filters}
            options={options}
            selectedId={selectedId}
            editable={editable}
            assigning={assign.isPending}
            onFilters={setFilters}
            onSelect={setSelectedId}
            onAssign={(id) => {
              setSelectedId(id);
              assign.mutate(id);
            }}
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
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToGuest}>
          Back to Guest
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || savePrefs.isPending}
            onClick={() => savePrefs.mutate()}
          >
            {savePrefs.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPrefs(buildRoomPrefDraft(reservation.specialRequests));
              setNotes("");
              setFilters(emptyRoomFilters());
              setSelectedId(reservation.roomId ?? "");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoomSummaryCard({
  reservation,
  assigned,
  coverUrl,
  occupancyLabel,
  roomSize,
  view,
  bedType,
  perNight,
  money,
  editable,
  onAssign,
  onChangeRoomType,
  assigning,
}: {
  reservation: ReservationDetail;
  assigned: string;
  coverUrl: string | null;
  occupancyLabel: string | null;
  roomSize: string | null;
  view: string | null;
  bedType: string | null;
  perNight: number | null;
  money: (value: number) => string;
  editable: boolean;
  onAssign: () => void;
  onChangeRoomType: () => void;
  assigning: boolean;
}) {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={!editable}>
              Room Assignment Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[80]">
            <DropdownMenuItem disabled={assigning} onClick={onAssign}>
              Assign Room
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onChangeRoomType}>Change Room Type</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
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
            <p className="font-medium text-[#251605]">{reviewDash(reservation.roomTypeName)}</p>
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
          <dd>
            {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
          </dd>
        </dl>
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" disabled={!editable || assigning} onClick={onAssign}>
            {assigning ? "Assigning…" : "Assign Room"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable}
            onClick={onChangeRoomType}
          >
            Change Room Type
          </Button>
        </div>
      </div>
    </section>
  );
}

function AvailableRoomsCard({
  rows,
  filters,
  options,
  selectedId,
  editable,
  assigning,
  onFilters,
  onSelect,
  onAssign,
}: {
  rows: ReturnType<typeof filterRoomAssignmentRows>;
  filters: RoomAssignmentFilters;
  options: ReturnType<typeof uniqueFilterOptions>;
  selectedId: string;
  editable: boolean;
  assigning: boolean;
  onFilters: (next: RoomAssignmentFilters) => void;
  onSelect: (id: string) => void;
  onAssign: (id: string) => void;
}) {
  function patch(next: Partial<RoomAssignmentFilters>) {
    onFilters({ ...filters, ...next });
  }
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="available-rooms"
    >
      <h2 className="font-display text-base text-[#251605]">Available Rooms</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Select a room to assign to this reservation. Only eligible rooms can be assigned.
      </p>
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
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="reservation-room-select"
                        checked={selectedId === row.id}
                        disabled={!editable || !row.eligible}
                        onChange={() => onSelect(row.id)}
                      />
                      {row.roomNumber}
                    </label>
                  </td>
                  <td className="py-2 pr-2">{reviewDash(row.roomTypeName)}</td>
                  <td className="py-2 pr-2">{reviewDash(row.floor)}</td>
                  <td className="py-2 pr-2">{reviewDash(row.view)}</td>
                  <td className="py-2 pr-2">{reviewDash(row.bedType)}</td>
                  <td className="py-2 pr-2">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        row.statusTone === "ready" && "text-emerald-700",
                        row.statusTone === "warn" && "text-amber-700",
                        row.statusTone === "blocked" && "text-red-700",
                      )}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-xs">{row.features.join(" · ") || DETAIL_DASH}</td>
                  <td className="py-2">
                    {row.eligible ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!editable || assigning}
                        onClick={() => onAssign(row.id)}
                      >
                        Select
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      <p className="mt-1 text-[11px] text-muted-foreground">{ASSIGNMENT_NOTES_GAP_COPY}</p>
    </section>
  );
}

function RoomsSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);

  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-rooms-summary"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock
        icon={<CalendarDays className="size-3.5 text-[#B8954F]" />}
        title="Stay Information"
      >
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title="Room Information"
      >
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Guarantee & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
