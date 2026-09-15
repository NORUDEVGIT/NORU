import { AlertTriangle, Check } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import type { RoomTypeAvailability } from "@/packages/pms/lib/reservations.functions";
import {
  CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES,
  CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY,
  CREATE_RESERVATION_CHECKING_AVAILABILITY,
  CREATE_RESERVATION_EMPTY_CATALOGUE,
  CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE,
  CREATE_RESERVATION_SECTION4_SCOPE,
  ROOM_TYPE_AVAILABILITY_LABELS,
  isRoomTypeSelectable,
  occupancySoftWarn,
  roomTypeAvailabilityCopy,
  roomTypeAvailabilityState,
  roomTypeCapacityDisplay,
  type RoomTypeAvailabilityState,
} from "@/packages/pms/lib/create-reservation-phase1-section4";

function AvailabilityBadge({ state }: { state: RoomTypeAvailabilityState }) {
  return (
    <span
      data-testid={`availability-state-${state}`}
      data-availability-state={state}
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        state === "available" && "bg-success/15 text-success",
        state === "limited" && "bg-amber-500/15 text-amber-800",
        state === "none" && "bg-muted text-muted-foreground",
      )}
    >
      {ROOM_TYPE_AVAILABILITY_LABELS[state]}
    </span>
  );
}

export function OccupancySoftWarn({
  adults,
  childCount,
  maxOccupancy,
  testId = "occupancy-warn",
}: {
  adults: number;
  childCount: number;
  maxOccupancy: number | undefined;
  testId?: string;
}) {
  const message = occupancySoftWarn(adults, childCount, maxOccupancy);
  if (!message) return null;
  return (
    <div
      data-testid={testId}
      className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE}</p>
      </div>
    </div>
  );
}

export function CreateReservationRoomType({
  datesValid,
  loading,
  availability,
  roomTypeId,
  adults,
  childCount,
  selectedMaxOccupancy,
  onSelect,
}: {
  datesValid: boolean;
  loading: boolean;
  availability: RoomTypeAvailability[];
  roomTypeId: string;
  adults: number;
  childCount: number;
  selectedMaxOccupancy: number | undefined;
  onSelect: (type: RoomTypeAvailability) => void;
}) {
  const selected = availability.find((row) => row.roomTypeId === roomTypeId);
  const occupancyCeiling = selected?.maxOccupancy ?? selectedMaxOccupancy;

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-room-type">
      <h2 className="font-display text-lg">Room type</h2>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION4_SCOPE}</p>

      {!datesValid ? (
        <p className="mt-3 text-sm text-muted-foreground">{CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES}</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-muted-foreground">{CREATE_RESERVATION_CHECKING_AVAILABILITY}</p>
      ) : availability.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{CREATE_RESERVATION_EMPTY_CATALOGUE}</p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {availability.map((row) => {
            const state = roomTypeAvailabilityState(row.available);
            const disabled = !isRoomTypeSelectable(row.available);
            const selectedCard = row.roomTypeId === roomTypeId;
            return (
              <li key={row.roomTypeId}>
                <button
                  type="button"
                  data-testid={`room-type-${row.roomTypeId}`}
                  data-availability={row.available}
                  disabled={disabled}
                  onClick={() => onSelect(row)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    selectedCard ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{row.code}</span>
                    <AvailabilityBadge state={state} />
                    {selectedCard ? <Check className="ml-auto size-4 text-primary" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sleeps {row.maxOccupancy} · {roomTypeAvailabilityCopy(row.available, row.totalRooms)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{roomTypeCapacityDisplay(row.adultCapacity, row.childCapacity)}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {roomTypeId ? (
        <div className="mt-3 space-y-2">
          <OccupancySoftWarn adults={adults} childCount={childCount} maxOccupancy={occupancyCeiling} />
          <p className="text-xs text-muted-foreground">{CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY}</p>
        </div>
      ) : null}
    </section>
  );
}
