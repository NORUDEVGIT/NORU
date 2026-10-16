import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { ExtraRoomDraft } from "@/packages/pms/components/bookings/create-reservation-extra-rooms";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import {
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
} from "@/packages/pms/lib/create-reservation-phase1";
import { MAX_EXTRA_ROOM_UNITS } from "@/packages/pms/lib/create-reservation-rooming";
import { getGuest, guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { PMS_OP_BTN_COMPACT, PMS_OP_INPUT } from "@/packages/pms/lib/pms-operational-surface";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

export type RoomingRateLabel = {
  roomTypeName: string;
  ratePlanName: string;
  nightlyLabel: string | null;
  roomTags?: string[];
  ratePlanTag?: string | null;
};

export function CreateReservationRoomingList({
  restaurantId,
  canCreateGuest,
  leadGuestName,
  room1Adults,
  room1Children,
  room1Infants,
  room1Rate,
  extras,
  extraRates,
  activeRoomIndex,
  onActivate,
  onAdd,
  onRemove,
  onRoom1Occupancy,
  onExtraOccupancy,
  onExtraOccupant,
}: {
  restaurantId: string;
  canCreateGuest: boolean;
  leadGuestName: string | null;
  room1Adults: number;
  room1Children: number;
  room1Infants: number;
  room1Rate: RoomingRateLabel;
  extras: ExtraRoomDraft[];
  extraRates: Record<string, RoomingRateLabel | null>;
  activeRoomIndex: number;
  onActivate: (index: number) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onRoom1Occupancy: (patch: { adults?: number; children?: number; infants?: number }) => void;
  onExtraOccupancy: (
    key: string,
    patch: { adults?: number; children?: number; infants?: number },
  ) => void;
  onExtraOccupant: (key: string, occupant: { guestId: string; fullName: string } | null) => void;
}) {
  return (
    <section
      className="space-y-2 rounded-[6px] border border-[#CCCCCC] bg-white p-3"
      data-testid="rooming-list"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Rooming List</h3>
          <p className="text-xs text-[#6B5E4E]">
            Manage room units, primary occupants and occupancy for this group reservation.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className={PMS_OP_BTN_COMPACT}
          data-testid="add-another-room"
          disabled={extras.length >= MAX_EXTRA_ROOM_UNITS}
          onClick={onAdd}
        >
          + Add Another Room
        </Button>
      </div>
      <RoomingCard
        sequence={1}
        active={activeRoomIndex === 0}
        primary
        occupantName={leadGuestName}
        occupantKind={leadGuestName ? "Lead Guest" : null}
        adults={room1Adults}
        children={room1Children}
        infants={room1Infants}
        rate={room1Rate}
        onActivate={() => onActivate(0)}
        onOccupancy={onRoom1Occupancy}
      />
      {extras.map((unit, index) => (
        <RoomingCard
          key={unit.key}
          sequence={index + 2}
          active={activeRoomIndex === index + 1}
          occupantName={unit.occupant?.fullName ?? null}
          occupantKind={unit.occupant ? "Guest Profile" : null}
          adults={unit.adults}
          children={unit.children}
          infants={unit.infants}
          rate={
            extraRates[unit.key] ?? {
              roomTypeName: "",
              ratePlanName: "",
              nightlyLabel: null,
            }
          }
          onActivate={() => onActivate(index + 1)}
          onOccupancy={(patch) => onExtraOccupancy(unit.key, patch)}
          onRemove={() => onRemove(unit.key)}
          occupantSearch={
            <RoomOccupantSearch
              restaurantId={restaurantId}
              canCreateGuest={canCreateGuest}
              occupant={unit.occupant ?? null}
              onOccupant={(occupant) => onExtraOccupant(unit.key, occupant)}
            />
          }
        />
      ))}
    </section>
  );
}

function RoomingCard({
  sequence,
  active,
  primary = false,
  occupantName,
  occupantKind,
  adults,
  children,
  infants,
  rate,
  onActivate,
  onOccupancy,
  onRemove,
  occupantSearch,
}: {
  sequence: number;
  active: boolean;
  primary?: boolean;
  occupantName: string | null;
  occupantKind: string | null;
  adults: number;
  children: number;
  infants: number;
  rate: RoomingRateLabel;
  onActivate: () => void;
  onOccupancy: (patch: { adults?: number; children?: number; infants?: number }) => void;
  onRemove?: () => void;
  occupantSearch?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "grid items-center gap-x-3 gap-y-2 rounded-[6px] border px-2.5 py-2 lg:grid-cols-[minmax(10rem,1.15fr)_auto_minmax(6.5rem,0.95fr)_minmax(7rem,1fr)_5.75rem_auto]",
        active ? "border-[#C89933] bg-[#FFFCF7]" : "border-[#E7E0D4] bg-white",
      )}
      data-testid={`rooming-room-${sequence}`}
      data-active={active ? "true" : "false"}
    >
      <div className="min-w-0" data-testid={`room-${sequence}-occupant`}>
        <div className="flex flex-wrap items-center gap-1">
          <p className="text-xs font-semibold text-[#251605]">Room {sequence}</p>
          {active ? (
            <span
              className="rounded-[6px] bg-[#F8E8C8] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A641A]"
              data-testid="room-editing-badge"
            >
              Editing
            </span>
          ) : null}
          {primary ? (
            <span
              className="rounded-[6px] border border-[#E7D7B0] bg-[#FBF6EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A641A]"
              data-testid="room-primary-badge"
            >
              Primary
            </span>
          ) : null}
        </div>
        {occupantSearch ?? <GuestIdentity name={occupantName} kind={occupantKind} />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CountField
          label="Adults"
          value={adults}
          min={1}
          testId={`room-${sequence}-adults`}
          onChange={(adults) => onOccupancy({ adults })}
        />
        <CountField
          label="Children"
          value={children}
          min={0}
          testId={`room-${sequence}-children`}
          onChange={(children) => onOccupancy({ children })}
        />
        <CountField
          label="Infants"
          value={infants}
          min={0}
          testId={`room-${sequence}-infants`}
          onChange={(infants) => onOccupancy({ infants })}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-[#6B5E4E]">Room Type</p>
        <p className="truncate text-xs font-medium text-[#251605]">
          {rate.roomTypeName || "Not selected"}
        </p>
        <TagRow labels={rate.roomTags ?? []} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-[#6B5E4E]">Rate Plan</p>
        <p className="truncate text-xs font-medium text-[#251605]">
          {rate.ratePlanName || "Not selected"}
        </p>
        {rate.ratePlanTag ? <TagRow labels={[rate.ratePlanTag]} /> : null}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-[#6B5E4E]">Rate</p>
        <p
          className="text-xs font-semibold text-[#251605]"
          data-testid={`room-${sequence}-nightly`}
        >
          {rate.nightlyLabel ? `${rate.nightlyLabel} / night` : "—"}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {active ? null : (
          <Button
            type="button"
            variant="outline"
            className={PMS_OP_BTN_COMPACT}
            data-testid={`activate-room-${sequence}`}
            onClick={onActivate}
          >
            Edit Selection
          </Button>
        )}
        {onRemove ? (
          <Button
            type="button"
            variant="outline"
            className={cn(PMS_OP_BTN_COMPACT, "!border-[#E2B4B4] !text-[#9B3A3A]")}
            data-testid={`remove-room-${sequence}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function GuestIdentity({ name, kind }: { name: string | null; kind: string | null }) {
  return (
    <div className="mt-1 flex min-w-0 items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#F3EDE3] text-[10px] font-semibold text-[#251605]">
        {guestInitials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[#251605]">
          {name ?? "Select a lead guest"}
        </span>
        {kind ? <span className="block text-[11px] text-[#6B5E4E]">{kind}</span> : null}
      </span>
    </div>
  );
}

function TagRow({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-[6px] border border-[#E7E0D4] bg-[#FAF8F4] px-1.5 py-0.5 text-[10px] text-[#6B5E4E]"
        >
          {label}
        </span>
      ))}
    </span>
  );
}

function guestInitials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "—";
}

function CountField({
  label,
  value,
  min,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="w-14 space-y-0.5 text-[10px] text-[#6B5E4E]">
      {label}
      <Input
        className={cn(PMS_OP_INPUT, "!h-7 !px-1.5 text-center text-xs")}
        type="number"
        min={min}
        max={20}
        value={value}
        data-testid={testId}
        onChange={(event) => onChange(Math.max(min, Math.floor(Number(event.target.value) || min)))}
      />
    </label>
  );
}

function RoomOccupantSearch({
  restaurantId,
  canCreateGuest,
  occupant,
  onOccupant,
}: {
  restaurantId: string;
  canCreateGuest: boolean;
  occupant: { guestId: string; fullName: string } | null;
  onOccupant: (occupant: { guestId: string; fullName: string } | null) => void;
}) {
  const fetchGuests = useServerFn(listGuests);
  const fetchGuest = useServerFn(getGuest);
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
    queryKey: ["guests", restaurantId, "room-occupant", trimmed],
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
    enabled: !occupant && trimmed.length > 0,
  });

  async function selectById(guestId: string) {
    try {
      const result = await fetchGuest({ data: { restaurantId, guestId } });
      onOccupant({ guestId: result.guest.id, fullName: result.guest.fullName });
      setSearch("");
      setDebounced("");
      setFormOpen(false);
    } catch {
      setFormOpen(false);
    }
  }

  if (occupant) {
    return (
      <div className="mt-1 flex min-w-0 items-center gap-2" data-testid="room-occupant-selected">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#F3EDE3] text-[10px] font-semibold text-[#251605]">
          {guestInitials(occupant.fullName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-[#251605]">
            {occupant.fullName}
          </span>
          <span className="block text-[11px] text-[#6B5E4E]">Guest Profile</span>
          <button
            type="button"
            className="text-[11px] font-medium text-[#6B5E4E] underline-offset-2 hover:underline"
            data-testid="change-room-occupant"
            onClick={() => onOccupant(null)}
          >
            Change
          </button>
        </span>
      </div>
    );
  }

  const rows = guestListItems(guestsQuery.data);
  return (
    <div className="mt-1 space-y-1" data-testid="room-occupant-search">
      <Input
        className={cn(PMS_OP_INPUT, "!h-8")}
        value={search}
        placeholder="Search guest profile"
        data-testid="room-occupant-query"
        onChange={(event) => setSearch(event.target.value)}
      />
      {trimmed.length > 0 ? (
        <ul className="max-h-28 overflow-y-auto rounded-[6px] border border-[#CCCCCC] bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="block w-full px-2 py-1 text-left text-xs text-[#251605] hover:bg-[#FBF6EE]"
                data-testid="room-occupant-result"
                onClick={() => onOccupant({ guestId: row.id, fullName: row.fullName })}
              >
                {row.fullName}
              </button>
            </li>
          ))}
          {rows.length === 0 && !guestsQuery.isFetching ? (
            <li className="px-2 py-1 text-xs text-[#6B5E4E]">No matching guests found.</li>
          ) : null}
        </ul>
      ) : null}
      {canCreateGuest ? (
        <button
          type="button"
          className="text-[11px] font-medium text-[#6B5E4E] underline-offset-2 hover:underline"
          onClick={() => setFormOpen(true)}
        >
          Create New Guest
        </button>
      ) : null}
      <GuestFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(guestId) => void selectById(guestId)}
        onOpenExisting={(guestId) => void selectById(guestId)}
      />
    </div>
  );
}
