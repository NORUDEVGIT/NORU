import {
  CREATE_RESERVATION_ASSIGN_LATER,
  CREATE_RESERVATION_ROOM_CHECKING,
  CREATE_RESERVATION_ROOM_EMPTY,
  CREATE_RESERVATION_ROOM_NEEDS_TYPE,
  formatAssignedRoomLabel,
  type AssignedRoomView,
} from "@/packages/pms/lib/create-reservation-phase1-section6";
import { PMS_OP_SELECT_TRIGGER } from "@/packages/pms/lib/pms-operational-surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  compact = false,
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
  compact?: boolean;
}) {
  const ready = datesValid && !!roomTypeId;
  const showEmpty = ready && !loading && rooms.length === 0;

  return (
    <section
      className={cn(
        compact
          ? "rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2"
          : "rounded-2xl border border-border bg-card p-4",
      )}
      data-testid="create-reservation-room-assignment"
    >
      <h2
        className={cn(
          compact
            ? "text-[11px] font-medium uppercase tracking-wide text-[#6B5E4E]"
            : "font-display text-lg",
        )}
      >
        {title}
      </h2>
      {/* CREATE_RESERVATION_SECTION6_SCOPE */}

      {!ready ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="room-assignment-needs-type">
          {CREATE_RESERVATION_ROOM_NEEDS_TYPE}
        </p>
      ) : loading ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="room-assignment-loading">
          {CREATE_RESERVATION_ROOM_CHECKING}
        </p>
      ) : (
        <div className="mt-1" data-testid="room-assignment-list">
          <Select value={roomId || unassignedValue} onValueChange={onSelect}>
            <SelectTrigger className={cn(PMS_OP_SELECT_TRIGGER, "!h-8 px-2 text-xs")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={unassignedValue} data-testid="room-assignment-unassigned">
                {CREATE_RESERVATION_ASSIGN_LATER}
              </SelectItem>
              {rooms.map((room) => (
                <SelectItem
                  key={room.id}
                  value={room.id}
                  data-testid={`room-assignment-${room.id}`}
                >
                  {formatAssignedRoomLabel(room)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showEmpty ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="room-assignment-empty">
          {emptyCopy}
        </p>
      ) : null}
    </section>
  );
}
