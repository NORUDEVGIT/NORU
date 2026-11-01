import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { BedDouble, SlidersHorizontal, Users } from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
} from "@/packages/pms/lib/create-reservation-phase1";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { isGroupReservation } from "@/packages/pms/lib/reservation-detail-group";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import { nightlyBreakdownRows, stayRatePerNight } from "@/packages/pms/lib/reservation-detail-rates";
import {
  buildRoomAssignmentRows,
  buildRoomPrefDraft,
  ROOM_ASSIGNMENT_PREFS,
  ROOM_PREF_SAVE_COPY,
  specialRequestsFromPrefs,
  type RoomAssignmentPrefId,
} from "@/packages/pms/lib/reservation-detail-rooms";
import {
  ROOM_OCCUPANT_IDENTITY_NOTE,
  ROOM_PRIMARY_REMOVAL_NOTE,
  additionalRoomOccupants,
  primaryRoomOccupant,
  roomDisplayName,
  roomOccupancyText,
  roomOccupantCapacity,
  roomOccupantsMutable,
  roomOperationActions,
  roomStatusLabel,
  type RoomOperationAction,
} from "@/packages/pms/lib/reservation-room-occupants";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";
import { listRatePlans, repriceReservation } from "@/packages/pms/lib/rates.functions";
import {
  amendReservation,
  assignReservationRoom,
  manageReservationRoomGuest,
  type AssignableRoom,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { listRooms, listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

const FIELD = "h-9 w-full rounded-lg border-gray-200 bg-white text-sm";
const BTN_PRIMARY = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";
const MUTED = "text-muted-foreground";
const NONE = "__none";

/* ------------------------------------------------------------------ */
/* Shared card                                                         */
/* ------------------------------------------------------------------ */

function Card({
  icon: Icon,
  title,
  description,
  testId,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid={testId}>
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#251605]">
          {Icon ? <Icon className={cn("size-4", MUTED)} /> : null}
          {title}
        </h3>
        {description ? <p className={cn("mt-0.5 text-xs", MUTED)}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className={cn("text-[11px]", MUTED)}>{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main tab                                                            */
/* ------------------------------------------------------------------ */

export function ReservationDetailRoomsTab({
  restaurantId,
  reservation,
  assignableRooms,
  canManage,
  money,
  onBackToGuest,
  onSaved,
  onOperate,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  assignableRooms: AssignableRoom[];
  canManage: boolean;
  money: (value: number) => string;
  onBackToGuest: () => void;
  onSaved: () => void;
  onOperate?: (action: RoomOperationAction, reservationRoomId: string) => void;
  // Kept optional so existing callers don't break; the merged page doesn't need them.
  coverUrl?: string | null;
  occupancyLabel?: string | null;
  onChangeRoomType?: () => void;
  onBackToRooms?: () => void;
}) {
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchRooms = useServerFn(listRooms);
  const fetchPlans = useServerFn(listRatePlans);
  const submitAmend = useServerFn(amendReservation);
  const submitAssign = useServerFn(assignReservationRoom);
  const submitReprice = useServerFn(repriceReservation);

  const [typeId, setTypeId] = useState(reservation.roomTypeId);
  const [roomId, setRoomId] = useState(reservation.roomId ?? "");
  const [planId, setPlanId] = useState(reservation.ratePlanId ?? "");
  const [prefs, setPrefs] = useState(() => buildRoomPrefDraft(reservation.specialRequests));

  function resetDraft() {
    setTypeId(reservation.roomTypeId);
    setRoomId(reservation.roomId ?? "");
    setPlanId(reservation.ratePlanId ?? "");
    setPrefs(buildRoomPrefDraft(reservation.specialRequests));
  }

  useEffect(() => {
    resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, typeId, true, "reservation-detail-rooms"],
    queryFn: () => fetchPlans({ data: { restaurantId, roomTypeId: typeId, activeOnly: true } }),
    enabled: canManage,
    retry: false,
  });

  const types = typesQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const currentType = types.find((row) => row.id === reservation.roomTypeId) ?? null;
  const currentPlan = plans.find((row) => row.id === reservation.ratePlanId) ?? null;
  const selectedPlan = plans.find((row) => row.id === planId) ?? null;
  const selectedType = types.find((row) => row.id === typeId) ?? null;

  // Eligible rooms only exist for the current room type.
  const roomRows = useMemo(
    () =>
      buildRoomAssignmentRows({
        rooms: roomsQuery.data ?? [],
        assignable: assignableRooms,
        roomType: currentType,
      }).filter((row) => row.eligible || row.id === reservation.roomId),
    [roomsQuery.data, assignableRooms, currentType, reservation.roomId],
  );
  const selectedRoom = roomRows.find((row) => row.id === roomId) ?? null;

  const singleRoom = !isGroupReservation(reservation) && (reservation.rooms ?? []).length <= 1;
  const editable =
    canManage && ["pending", "confirmed"].includes(reservation.status) && singleRoom;

  const typeChanged = typeId !== reservation.roomTypeId;
  const roomChanged = !typeChanged && roomId !== (reservation.roomId ?? "");
  const planChanged = planId !== (reservation.ratePlanId ?? "");
  const newRequests = specialRequestsFromPrefs(reservation.specialRequests, prefs);
  const prefsChanged = newRequests !== (reservation.specialRequests ?? "");

  const changes: string[] = [];
  if (typeChanged) changes.push(`Room type → ${selectedType?.name ?? "new type"}`);
  if (roomChanged) changes.push(`Room → ${selectedRoom?.roomNumber ?? "Unassigned"}`);
  if (planChanged && planId) changes.push(`Rate plan → ${selectedPlan?.name ?? "new plan"}`);
  if (prefsChanged) changes.push("Room preferences");

  const perNight = stayRatePerNight(reservation);
  const nightly = useMemo(
    () => nightlyBreakdownRows(reservation, currentPlan),
    [reservation, currentPlan],
  );
  const currency = reservation.currency?.trim() || "ETB";

  const save = useMutation({
    mutationFn: async () => {
      if (typeChanged && !planId) {
        throw new Error("Choose a rate plan for the new room type.");
      }
      // 1. Room type and preferences go through amend. A new type clears the room number.
      if (typeChanged || prefsChanged) {
        await submitAmend({
          data: {
            restaurantId,
            reservationId: reservation.id,
            guestId: reservation.guestId,
            roomTypeId: typeId,
            roomId: typeChanged ? null : reservation.roomId,
            arrival: reservation.arrivalDate,
            departure: reservation.departureDate,
            adults: reservation.adults,
            children: reservation.children,
            notes: reservation.notes,
            specialRequests: newRequests,
            ratePlanId: typeChanged ? planId : reservation.ratePlanId,
          },
        });
      }
      // 2. Room number.
      if (roomChanged) {
        await submitAssign({
          data: { restaurantId, reservationId: reservation.id, roomId: roomId || null },
        });
      }
      // 3. Rates are recalculated on the server from the chosen plan.
      if (planId && (planChanged || typeChanged)) {
        const result = await submitReprice({
          data: { restaurantId, reservationId: reservation.id, ratePlanId: planId },
        });
        if (!result.ok) throw new Error(result.message);
      }
    },
    onSuccess: () => {
      toast.success("Room details updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function onTypeChange(next: string) {
    setTypeId(next);
    setRoomId("");
    setPlanId(next === reservation.roomTypeId ? (reservation.ratePlanId ?? "") : "");
  }

  const roomLabel = reservation.roomNumber ?? "Unassigned";

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-rooms">
      <div className="min-h-0 flex-1 space-y-4">
        {/* 1. Current stay + one simple editor */}
        <Card
          icon={BedDouble}
          title="Room & Rate"
          description="Change room type, room number or rate plan, then press Save Changes."
          testId="rooms-summary"
        >
          <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
            <Summary label="Room type" value={reviewDash(reservation.roomTypeName)} />
            <Summary label="Room number" value={roomLabel} />
            <Summary label="Rate plan" value={reviewDash(reservation.ratePlanName)} />
            <Summary
              label="Per night"
              value={perNight == null ? DETAIL_DASH : money(perNight)}
            />
            <Summary label="Nights" value={String(reservation.nights)} />
            <Summary
              label="Room total"
              value={reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
              strong
            />
          </dl>

          {singleRoom ? (
            <div className="space-y-3 rounded-lg bg-gray-50 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Room type">
                  <Select value={typeId} disabled={!editable} onValueChange={onTypeChange}>
                    <SelectTrigger className={FIELD} data-testid="change-room-type">
                      <SelectValue placeholder="Select room type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {types.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Room number">
                  <Select
                    value={roomId || NONE}
                    disabled={!editable || typeChanged}
                    onValueChange={(value) => setRoomId(value === NONE ? "" : value)}
                  >
                    <SelectTrigger className={FIELD} data-testid="change-room-number">
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {roomRows.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.roomNumber}
                          {row.floor ? ` · Floor ${row.floor}` : ""}
                          {row.statusLabel ? ` · ${row.statusLabel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Rate plan">
                  <Select value={planId} disabled={!editable} onValueChange={setPlanId}>
                    <SelectTrigger className={FIELD} data-testid="change-rate-plan">
                      <SelectValue placeholder="Select rate plan" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {plans.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.code} — {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {typeChanged ? (
                <p className="text-[11px] text-amber-800">
                  The room number is cleared when the room type changes. Pick a rate plan for the
                  new type, save, then assign a room number.
                </p>
              ) : null}
              {changes.length > 0 ? (
                <p className="text-xs font-medium text-[#251605]" data-testid="pending-changes">
                  Will change: {changes.join(" · ")}
                </p>
              ) : (
                <p className={cn("text-xs", MUTED)}>No changes yet.</p>
              )}
            </div>
          ) : (
            <p className={cn("rounded-lg bg-gray-50 p-3 text-xs", MUTED)}>
              This reservation has more than one room. Use the buttons on each room below to assign
              or change it.
            </p>
          )}
        </Card>

        {/* 2. Rooms and occupants */}
        <RoomsAndOccupants
          restaurantId={restaurantId}
          reservation={reservation}
          canManage={canManage}
          onChanged={onSaved}
          onOperate={onOperate}
        />

        {/* 3. Nightly rates (read only, follows the saved plan) */}
        {singleRoom && nightly.length > 0 ? (
          <Card title="Nightly Rates" testId="daily-rate-breakdown">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm text-[#251605]">
                <thead className={cn("border-b border-gray-200 text-[11px] uppercase", MUTED)}>
                  <tr>
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Day</th>
                    <th className="py-2 text-right">Rate ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {nightly.map((row) => (
                    <tr key={row.date} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 pr-2">{formatStayDate(row.date)}</td>
                      <td className="py-1.5 pr-2">{row.weekday}</td>
                      <td className="py-1.5 text-right">{money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {/* 4. Room preferences */}
        {singleRoom ? (
          <Card
            icon={SlidersHorizontal}
            title="Room Preferences"
            description="Saved with the other changes."
            testId="room-preferences"
          >
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {ROOM_ASSIGNMENT_PREFS.map((pref) => (
                <label
                  key={pref.id}
                  className={cn("flex items-center gap-2", !editable && "opacity-60")}
                >
                  <Checkbox
                    checked={prefs[pref.id]}
                    disabled={!editable}
                    onCheckedChange={(value) =>
                      setPrefs((current) => ({
                        ...current,
                        [pref.id as RoomAssignmentPrefId]: value === true,
                      }))
                    }
                  />
                  {pref.label}
                </label>
              ))}
            </div>
            <p className={cn("mt-3 text-[11px]", MUTED)}>{ROOM_PREF_SAVE_COPY}</p>
          </Card>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToGuest}>
          Back to Guest
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className={BTN_PRIMARY}
            disabled={!editable || changes.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetDraft}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className={cn("text-xs", MUTED)}>{label}</dt>
      <dd className={cn("text-[#251605]", strong ? "font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rooms and occupants                                                 */
/* ------------------------------------------------------------------ */

function RoomsAndOccupants({
  restaurantId,
  reservation,
  canManage,
  onChanged,
  onOperate,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  onChanged: () => void;
  onOperate?: (action: RoomOperationAction, reservationRoomId: string) => void;
}) {
  const units = reservation.rooms ?? [];
  const [addingRoomId, setAddingRoomId] = useState<string | null>(null);
  const manage = useServerFn(manageReservationRoomGuest);
  const mutation = useMutation({
    mutationFn: (input: {
      reservationRoomId: string;
      guestId: string;
      action: "add" | "remove" | "set_primary";
    }) =>
      manage({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: input.reservationRoomId,
          guestId: input.guestId,
          action: input.action,
        },
      }),
    onSuccess: () => {
      setAddingRoomId(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (units.length === 0) return null;
  const multi = units.length > 1;

  return (
    <Card
      icon={Users}
      title={multi ? "Rooms & Occupants" : "Room Occupants"}
      description={ROOM_OCCUPANT_IDENTITY_NOTE}
      testId="reservation-room-occupants"
    >
      <div className="space-y-4">
        {units.map((unit) => (
          <RoomOccupantBlock
            key={unit.id}
            restaurantId={restaurantId}
            reservation={reservation}
            unit={unit}
            multi={multi}
            canManage={canManage}
            adding={addingRoomId === unit.id}
            pending={mutation.isPending}
            onAdd={() => setAddingRoomId(unit.id)}
            onCancelAdd={() => setAddingRoomId(null)}
            onChoose={(guestId, action) =>
              mutation.mutate({ reservationRoomId: unit.id, guestId, action })
            }
            onOperate={onOperate}
          />
        ))}
      </div>
    </Card>
  );
}

function RoomOccupantBlock({
  restaurantId,
  reservation,
  unit,
  multi,
  canManage,
  adding,
  pending,
  onAdd,
  onCancelAdd,
  onChoose,
  onOperate,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  unit: ReservationRoomUnit;
  multi: boolean;
  canManage: boolean;
  adding: boolean;
  pending: boolean;
  onAdd: () => void;
  onCancelAdd: () => void;
  onChoose: (guestId: string, action: "add" | "remove" | "set_primary") => void;
  onOperate?: (action: RoomOperationAction, reservationRoomId: string) => void;
}) {
  const mutable = canManage && roomOccupantsMutable(unit.status);
  const primary = primaryRoomOccupant(unit.occupants);
  const additional = additionalRoomOccupants(unit.occupants);
  const capacity = roomOccupantCapacity(unit.adults, unit.children);
  const atCapacity = unit.occupants.length >= capacity;
  const roomType = roomDisplayName(unit, reservation.roomTypeId, reservation.roomTypeName);
  const roomNumber =
    unit.roomNumber ?? (unit.unitSequence === 1 ? reservation.roomNumber : null) ?? "Unassigned";
  const operations = roomOperationActions(unit.status);

  return (
    <article
      className="border-b border-[#e9dfd0] pb-4 last:border-b-0 last:pb-0"
      data-testid={`room-unit-${unit.unitSequence}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#251605]">
          Room {unit.unitSequence}
          {multi ? (
            <span className={cn("ml-2 text-xs font-normal", MUTED)}>
              {roomNumber} · {roomType} · {roomOccupancyText(unit.adults, unit.children, unit.infants)}
            </span>
          ) : null}
        </p>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#4a2c1a]">
          {roomStatusLabel(unit.status)}
        </span>
      </div>

      <div
        className="mt-3 space-y-1.5"
        data-testid={`room-occupants-${unit.unitSequence}`}
      >
        <OccupantRow
          sequence={unit.unitSequence}
          name={primary?.name ?? "No primary occupant"}
          guestId={primary?.guestId ?? null}
          primary
          canRemove={mutable && Boolean(primary) && additional.length === 0}
          pending={pending}
          onRemove={primary ? () => onChoose(primary.guestId, "remove") : undefined}
        />
        {additional.map((occupant) => (
          <OccupantRow
            key={occupant.guestId}
            sequence={unit.unitSequence}
            name={occupant.name}
            guestId={occupant.guestId}
            primary={false}
            canRemove={mutable}
            pending={pending}
            onMakePrimary={mutable ? () => onChoose(occupant.guestId, "set_primary") : undefined}
            onRemove={() => onChoose(occupant.guestId, "remove")}
          />
        ))}
      </div>
      {mutable && additional.length > 0 && primary ? (
        <p className={cn("mt-1 text-[11px]", MUTED)}>{ROOM_PRIMARY_REMOVAL_NOTE}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {mutable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-testid={`add-guest-${unit.unitSequence}`}
            disabled={atCapacity || pending}
            onClick={onAdd}
          >
            Add Guest
          </Button>
        ) : null}
        {canManage && onOperate
          ? operations.map((action) => (
              <Button
                key={action}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                data-testid={`room-action-${action}-${unit.unitSequence}`}
                onClick={() => onOperate(action, unit.id)}
              >
                {action === "assign_room"
                  ? "Assign Room"
                  : action === "change_room"
                    ? "Change Room"
                    : action === "check_in"
                      ? "Check In"
                      : "Check Out"}
              </Button>
            ))
          : null}
      </div>
      {mutable && atCapacity ? (
        <p className={cn("mt-1 text-[11px]", MUTED)}>
          Every booked adult and child already has a name.
        </p>
      ) : null}
      {!roomOccupantsMutable(unit.status) ? (
        <p
          className={cn("mt-1 text-[11px]", MUTED)}
          data-testid={`room-occupants-locked-${unit.unitSequence}`}
        >
          Occupants on this room are kept for history.
        </p>
      ) : null}
      {adding ? (
        <AddGuestSearch
          restaurantId={restaurantId}
          sequence={unit.unitSequence}
          takenGuestIds={unit.occupants.map((occupant) => occupant.guestId)}
          pending={pending}
          onCancel={onCancelAdd}
          onSelect={(guestId) => onChoose(guestId, "add")}
        />
      ) : null}
    </article>
  );
}

function OccupantRow({
  sequence,
  name,
  guestId,
  primary,
  canRemove,
  pending,
  onMakePrimary,
  onRemove,
}: {
  sequence: number;
  name: string;
  guestId: string | null;
  primary: boolean;
  canRemove: boolean;
  pending: boolean;
  onMakePrimary?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-sm font-semibold text-[#251605]">{name}</span>
      {primary && guestId ? (
        <span
          className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-[#4a2c1a]"
          data-testid={`primary-occupant-${sequence}`}
        >
          Primary
        </span>
      ) : null}
      {!primary && guestId ? (
        <span className={cn("text-[10px]", MUTED)} data-testid={`additional-occupant-${sequence}`}>
          Additional
        </span>
      ) : null}
      {guestId ? (
        <Link
          to="/restaurant/pms/guests/$guestId"
          params={{ guestId }}
          className="text-[11px] font-medium text-[#8a641a] underline-offset-2 hover:underline"
        >
          View Guest
        </Link>
      ) : null}
      {onMakePrimary ? (
        <button
          type="button"
          className="text-[11px] font-medium text-[#251605] underline-offset-2 hover:underline disabled:opacity-50"
          data-testid={`change-primary-${sequence}`}
          disabled={pending}
          onClick={onMakePrimary}
        >
          Change Primary
        </button>
      ) : null}
      {canRemove && onRemove ? (
        <button
          type="button"
          className="text-[11px] font-medium text-destructive underline-offset-2 hover:underline disabled:opacity-50"
          data-testid={`remove-guest-${sequence}`}
          disabled={pending}
          onClick={onRemove}
        >
          Remove Guest
        </button>
      ) : null}
    </div>
  );
}

function AddGuestSearch({
  restaurantId,
  sequence,
  takenGuestIds,
  pending,
  onCancel,
  onSelect,
}: {
  restaurantId: string;
  sequence: number;
  takenGuestIds: string[];
  pending: boolean;
  onCancel: () => void;
  onSelect: (guestId: string) => void;
}) {
  const fetchGuests = useServerFn(listGuests);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebounced(search),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const trimmed = debounced.trim();
  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, "detail-room-guest", sequence, trimmed],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
          offset: 0,
          search: trimmed,
        },
      }),
    enabled: trimmed.length > 0,
  });
  const matches = guestListItems(guestsQuery.data).filter(
    (guest) => !takenGuestIds.includes(guest.id),
  );

  return (
    <div className="mt-3 space-y-2" data-testid={`add-guest-search-${sequence}`}>
      <Input
        value={search}
        className={cn(FIELD, "text-xs")}
        placeholder="Search guest profile"
        onChange={(event) => setSearch(event.target.value)}
      />
      {matches.length > 0 ? (
        <ul className="max-h-32 overflow-auto rounded-lg border border-[#e9dfd0] bg-white">
          {matches.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-[#251605] hover:bg-gray-50 disabled:opacity-50"
                disabled={pending}
                onClick={() => onSelect(guest.id)}
              >
                {guest.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setFormOpen(true)}
        >
          Create Guest
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <GuestFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(guestId) => {
          setFormOpen(false);
          onSelect(guestId);
        }}
      />
    </div>
  );
}