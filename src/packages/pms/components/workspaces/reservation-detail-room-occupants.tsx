import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import {
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
} from "@/packages/pms/lib/create-reservation-phase1";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { manageReservationRoomGuest } from "@/packages/pms/lib/reservations.functions";
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
    <section
      className="rounded-[6px] border border-[#CCC] bg-white p-3"
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
      className="rounded-[6px] border border-[#CCC] bg-[#FBF7F1] p-2"
      data-testid={`room-unit-${unit.unitSequence}`}
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
      </dl>
      <div className="mt-2 space-y-1" data-testid={`room-occupants-${unit.unitSequence}`}>
        <OccupantRow
          sequence={unit.unitSequence}
          name={primary?.name ?? "No primary occupant"}
          guestId={primary?.guestId ?? null}
          primary
          mutable={mutable && Boolean(primary)}
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
            mutable={mutable}
            canRemove={mutable}
            pending={pending}
            onMakePrimary={() => onChoose(occupant.guestId, "set_primary")}
            onRemove={() => onChoose(occupant.guestId, "remove")}
          />
        ))}
      </div>
      {mutable && additional.length > 0 && primary ? (
        <p className="mt-1 text-[11px] text-[#6B5E4E]">{ROOM_PRIMARY_REMOVAL_NOTE}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {mutable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
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
                className="h-7 text-xs"
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
  mutable,
  canRemove,
  pending,
  onMakePrimary,
  onRemove,
}: {
  sequence: number;
  name: string;
  guestId: string | null;
  primary: boolean;
  mutable: boolean;
  canRemove: boolean;
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
      {guestId ? (
        <Link
          to="/restaurant/pms/guests/$guestId"
          params={{ guestId }}
          className="text-[11px] font-medium text-[#6B5E4E] underline-offset-2 hover:underline"
        >
          View Guest
        </Link>
      ) : null}
      {mutable && onMakePrimary ? (
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
          className="text-[11px] font-medium text-[#251605] underline-offset-2 hover:underline disabled:opacity-50"
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
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFormOpen(true)}
        >
          Create Guest
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
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
