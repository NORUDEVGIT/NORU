import { Check } from "lucide-react";

import {
  CREATE_RESERVATION_ASSIGN_LATER,
  CREATE_RESERVATION_ROOM_CHECKING,
  CREATE_RESERVATION_ROOM_EMPTY,
  CREATE_RESERVATION_ROOM_NEEDS_TYPE,
  CREATE_RESERVATION_SECTION6_SCOPE,
  formatAssignedRoomLabel,
  type AssignedRoomView,
} from "@/packages/pms/lib/create-reservation-phase1-section6";
import { cn } from "@/shared/lib/utils";

export function CreateReservationRoomAssignment({
  title = "Room assignment (optional)",
  emptyCopy = CREATE_RESERVATION_ROOM_EMPTY,
  datesValid,
  roomTypeId,
  loading,
  rooms,
  roomId,
  unassignedValue,
  onSelect,
}: {
  title?: string;
  emptyCopy?: string;
  datesValid: boolean;
  roomTypeId: string;
  loading: boolean;
  rooms: AssignedRoomView[];
  roomId: string;
  unassignedValue: string;
  onSelect: (roomId: string) => void;
}) {
  const ready = datesValid && !!roomTypeId;
  const showEmpty = ready && !loading && rooms.length === 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-room-assignment">
      <h2 className="font-display text-lg">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION6_SCOPE}</p>

      {!ready ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="room-assignment-needs-type">
          {CREATE_RESERVATION_ROOM_NEEDS_TYPE}
        </p>
      ) : loading ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="room-assignment-loading">
          {CREATE_RESERVATION_ROOM_CHECKING}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2" data-testid="room-assignment-list">
          <li>
            <button
              type="button"
              data-testid="room-assignment-unassigned"
              onClick={() => onSelect(unassignedValue)}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-colors",
                roomId === unassignedValue ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{CREATE_RESERVATION_ASSIGN_LATER}</span>
                {roomId === unassignedValue ? <Check className="ml-auto size-4 text-primary" /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Unassigned — bind a room later.</p>
            </button>
          </li>
          {rooms.map((room) => {
            const selected = room.id === roomId;
            return (
              <li key={room.id}>
                <button
                  type="button"
                  data-testid={`room-assignment-${room.id}`}
                  onClick={() => onSelect(room.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatAssignedRoomLabel(room)}</span>
                    {selected ? <Check className="ml-auto size-4 text-primary" /> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showEmpty ? (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="room-assignment-empty">
          {emptyCopy}
        </p>
      ) : null}
    </section>
  );
}
