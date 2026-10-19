import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
} from "@/packages/pms/lib/create-reservation-phase1";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { manageReservationRoomGuest } from "@/packages/pms/lib/reservations.functions";
import { roomMenuLabel, type RoomMenuAction } from "@/packages/pms/lib/reservation-lifecycle";
import {
  ROOM_OCCUPANT_IDENTITY_NOTE,
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
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

export function ReservationRoomOccupants({
  restaurantId,
  reservation,
  canManage,
  onChanged,
  onOperate,
  selectedUnitId,
  onSelectUnit,
  money,
  roomActionsFor,
  onRoomAction,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  onChanged: () => void;
  onOperate?: (action: RoomOperationAction, reservationRoomId: string) => void;
  selectedUnitId?: string;
  onSelectUnit?: (reservationRoomId: string) => void;
  money?: (value: number) => string;
  roomActionsFor?: (unit: ReservationRoomUnit) => RoomMenuAction[];
  onRoomAction?: (action: RoomMenuAction, unit: ReservationRoomUnit) => void;
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
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-room-occupants"
    >
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-[#251605]">
          {multi ? "Rooms & Occupants" : "Room Occupants"}
        </h2>
        <p className="text-xs text-[#6B5E4E]">{ROOM_OCCUPANT_IDENTITY_NOTE}</p>
      </div>
      <div className="space-y-2">
        {units.map((unit) => (
          <RoomOccupantCard
            key={unit.id}
            restaurantId={restaurantId}
            reservation={reservation}
            unit={unit}
            canManage={canManage}
            adding={addingRoomId === unit.id}
            pending={mutation.isPending}
            onAdd={() => setAddingRoomId(unit.id)}
            onCancelAdd={() => setAddingRoomId(null)}
            onChoose={(guestId, action) =>
              mutation.mutate({ reservationRoomId: unit.id, guestId, action })
            }
            onOperate={onOperate}
            selected={selectedUnitId === unit.id}
            onSelect={onSelectUnit ? () => onSelectUnit(unit.id) : undefined}
            subtotalLabel={
              unit.roomSubtotal == null
                ? "—"
                : (money?.(unit.roomSubtotal) ?? String(unit.roomSubtotal))
            }
            roomActions={roomActionsFor?.(unit) ?? []}
            onRoomAction={onRoomAction ? (action) => onRoomAction(action, unit) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function RoomOccupantCard({
  restaurantId,
  reservation,
  unit,
  canManage,
  adding,
  pending,
  onAdd,
  onCancelAdd,
  onChoose,
  onOperate,
  selected = false,
  onSelect,
  subtotalLabel = "—",
  roomActions = [],
  onRoomAction,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  unit: ReservationRoomUnit;
  canManage: boolean;
  adding: boolean;
  pending: boolean;
  onAdd: () => void;
  onCancelAdd: () => void;
  onChoose: (guestId: string, action: "add" | "remove" | "set_primary") => void;
  onOperate?: (action: RoomOperationAction, reservationRoomId: string) => void;
  selected?: boolean;
  onSelect?: () => void;
  subtotalLabel?: string;
  roomActions?: RoomMenuAction[];
  onRoomAction?: (action: RoomMenuAction) => void;
}) {
  const mutable = canManage && roomOccupantsMutable(unit.status);
  const primary = primaryRoomOccupant(unit.occupants);
  const additional = additionalRoomOccupants(unit.occupants);
  const capacity = roomOccupantCapacity(unit.adults, unit.children);
  const atCapacity = unit.occupants.length >= capacity;
  const roomType = roomDisplayName(unit, reservation.roomTypeId, reservation.roomTypeName);
  const roomNumber =
    unit.roomNumber ?? (unit.unitSequence === 1 ? reservation.roomNumber : null) ?? "Unassigned";
  const ratePlan =
    unit.ratePlanName ??
    (unit.ratePlanId && unit.ratePlanId === reservation.ratePlanId
      ? reservation.ratePlanName
      : null);
  const operations = roomOperationActions(unit.status);

  return (
    <article
      className={`rounded-xl border bg-[#FBF8F2] p-3 ${selected ? "border-[#251605]" : "border-[#E8DFD0]"}`}
      data-testid={`room-unit-${unit.unitSequence}`}
      data-room-unit-operation={unit.id}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold text-[#251605]">Room {unit.unitSequence}</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#251605]">
          {roomStatusLabel(unit.status)}
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-[#6B5E4E]">Physical Room</dt>
          <dd className="text-[#251605]">
            {roomNumber === "Unassigned" ? "Unassigned" : roomNumber}
          </dd>
        </div>
        <div>
          <dt className="text-[#6B5E4E]">Room Type</dt>
          <dd className="text-[#251605]">{roomType}</dd>
        </div>
        <div>
          <dt className="text-[#6B5E4E]">Occupancy</dt>
          <dd className="text-[#251605]">
            {roomOccupancyText(unit.adults, unit.children, unit.infants)}
          </dd>
        </div>
        <div>
          <dt className="text-[#6B5E4E]">Rate Plan</dt>
          <dd className="text-[#251605]">{ratePlan || "—"}</dd>
        </div>
        <div>
          <dt className="text-[#6B5E4E]">Subtotal</dt>
          <dd className="text-[#251605]" data-testid={`room-subtotal-${unit.unitSequence}`}>
            {subtotalLabel}
          </dd>
        </div>
      </dl>
      <div className="mt-2 space-y-1" data-testid={`room-occupants-${unit.unitSequence}`}>
        <OccupantRow
          sequence={unit.unitSequence}
          name={primary?.name ?? "No primary occupant"}
          guestId={primary?.guestId ?? null}
          primary
          pending={pending}
          onRemove={
            mutable && primary?.guestId ? () => onChoose(primary.guestId, "remove") : undefined
          }
        />
        {additional.map((occupant) => (
          <OccupantRow
            key={occupant.guestId}
            sequence={unit.unitSequence}
            name={occupant.name}
            guestId={occupant.guestId}
            primary={false}
            pending={pending}
            onMakePrimary={mutable ? () => onChoose(occupant.guestId, "set_primary") : undefined}
            onRemove={mutable ? () => onChoose(occupant.guestId, "remove") : undefined}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {mutable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid={`add-guest-${unit.unitSequence}`}
            disabled={atCapacity || pending}
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            Add Guest
          </Button>
        ) : null}
        {canManage && onOperate
          ? operations
              .filter((action) => action === "check_in")
              .map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  data-testid={`room-action-${action}-${unit.unitSequence}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOperate(action, unit.id);
                  }}
                >
                  Check In
                </Button>
              ))
          : null}
        {onRoomAction
          ? roomActions.map((action) => (
              <Button
                key={action}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                data-testid={`room-menu-${action}-${unit.unitSequence}`}
                disabled={pending}
                onClick={(event) => {
                  event.stopPropagation();
                  onRoomAction(action);
                }}
              >
                {roomMenuLabel(action)}
              </Button>
            ))
          : null}
      </div>
      {mutable && atCapacity ? (
        <p className="mt-1 text-[11px] text-[#6B5E4E]">
          Every booked adult and child already has a name.
        </p>
      ) : null}
      {!roomOccupantsMutable(unit.status) ? (
        <p
          className="mt-1 text-[11px] text-[#6B5E4E]"
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
  pending,
  onMakePrimary,
  onRemove,
}: {
  sequence: number;
  name: string;
  guestId: string | null;
  primary: boolean;
  pending: boolean;
  onMakePrimary?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-[#251605]">{name}</span>
      {primary && guestId ? (
        <span
          className="rounded-full bg-[#C89933]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#251605]"
          data-testid={`primary-occupant-${sequence}`}
        >
          Primary
        </span>
      ) : null}
      {!primary && guestId ? (
        <span
          className="text-[10px] text-[#6B5E4E]"
          data-testid={`additional-occupant-${sequence}`}
        >
          Additional
        </span>
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
      {onRemove && guestId ? (
        <button
          type="button"
          className="text-[11px] font-medium text-[#251605] underline-offset-2 hover:underline disabled:opacity-50"
          data-testid={`remove-guest-${sequence}-${guestId}`}
          disabled={pending}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          Remove
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
    <div className="mt-2 space-y-1" data-testid={`add-guest-search-${sequence}`}>
      <Input
        value={search}
        className="h-8 border-[#CCC] bg-white text-xs"
        placeholder="Search guest profile"
        onChange={(event) => setSearch(event.target.value)}
      />
      {matches.length > 0 ? (
        <ul className="max-h-28 overflow-auto rounded-[6px] border border-[#CCC] bg-white">
          {matches.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                className="block w-full px-2 py-1 text-left text-xs text-[#251605] hover:bg-[#FBF7F1] disabled:opacity-50"
                disabled={pending}
                onClick={() => onSelect(guest.id)}
              >
                {guest.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
