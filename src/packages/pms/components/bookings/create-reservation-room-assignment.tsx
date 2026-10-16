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
          ? "mt-3 border-t border-[#CCCCCC] pt-3"
          : "rounded-2xl border border-border bg-card p-4",
      )}
      data-testid="create-reservation-room-assignment"
    >
      <div className={cn(compact && ready && !loading && "flex flex-wrap items-center gap-2")}>
        <h2
          className={cn(
            compact ? "shrink-0 text-xs font-medium text-[#6B5E4E]" : "font-display text-lg",
          )}
        >
          {title}
        </h2>
        {/* CREATE_RESERVATION_SECTION6_SCOPE */}

        {ready && !loading ? (
          <div
            className={cn("mt-1", compact && "mt-0 min-w-[12rem] flex-1")}
            data-testid="room-assignment-list"
          >
            <Select value={roomId || unassignedValue} onValueChange={onSelect}>
              <SelectTrigger className={cn(PMS_OP_SELECT_TRIGGER, !compact && "!h-8 px-2 text-xs")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[80] max-h-60 rounded-[6px] border-[#CCCCCC] bg-white text-sm text-[#251605]">
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
        ) : null}
      </div>

      {!ready ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="room-assignment-needs-type">
          {CREATE_RESERVATION_ROOM_NEEDS_TYPE}
        </p>
      ) : loading ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="room-assignment-loading">
          {CREATE_RESERVATION_ROOM_CHECKING}
        </p>
      ) : null}

      {showEmpty ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="room-assignment-empty">
          {emptyCopy}
        </p>
      ) : null}
    </section>
  );
}
