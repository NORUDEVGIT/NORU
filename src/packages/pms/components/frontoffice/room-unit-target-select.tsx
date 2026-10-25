import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  additionalRoomOccupants,
  primaryRoomOccupant,
  roomOccupancyText,
  shouldShowRoomOccupantContext,
} from "@/packages/pms/lib/reservation-room-occupants";
import type { FrontOfficeRoomTarget } from "@/packages/pms/lib/reservation-room-units";

/** Shown only when a reservation has more than one room unit. */
export function RoomUnitTargetSelect({
  units,
  value,
  onChange,
  locked = false,
}: {
  units: FrontOfficeRoomTarget[] | undefined;
  value: string;
  onChange: (id: string) => void;
  /** The desk row already selected this room. */
  locked?: boolean;
}) {
  if (locked || !units || units.length < 2) return null;
  return (
    <div className="space-y-2">
      <Label>Room on this reservation</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a room" />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              Room {unit.unitSequence}
              {unit.status ? ` · ${unit.status.replaceAll("_", " ")}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Occupants of the selected room unit. Sibling rooms stay off this panel. */
export function RoomUnitOccupantContext({
  stayGuestId,
  units,
  selectedId,
}: {
  stayGuestId: string;
  units: FrontOfficeRoomTarget[] | undefined;
  selectedId: string;
}) {
  const list = units ?? [];
  const multi = list.length > 1;
  const unit = multi ? list.find((row) => row.id === selectedId) : list[0];
  const occupants = unit?.occupants ?? [];
  if (
    !unit ||
    !shouldShowRoomOccupantContext({
      unitCount: list.length,
      selected: !multi || Boolean(selectedId),
      occupants,
      bookerGuestId: stayGuestId,
    })
  ) {
    return null;
  }
  const primary = primaryRoomOccupant(occupants);
  const additional = additionalRoomOccupants(occupants);
  return (
    <div
      className="rounded-[6px] border border-[#CCC] bg-white px-3 py-2 text-sm"
      data-testid="fo-room-occupants"
    >
      <p className="text-xs font-semibold text-[#251605]">
        Room {unit.unitSequence}
        {unit.roomTypeName ? ` · ${unit.roomTypeName}` : ""}
        {unit.roomNumber ? ` · ${unit.roomNumber}` : ""}
      </p>
      <p className="mt-1 text-xs text-[#6B5E4E]">
        {roomOccupancyText(unit.adults, unit.children ?? 0, unit.infants ?? 0)}
        {unit.ratePlanName ? ` · ${unit.ratePlanName}` : ""}
      </p>
      <p className="mt-2 text-xs text-[#6B5E4E]">Primary Occupant</p>
      <p className="text-sm text-[#251605]">{primary?.name ?? "No primary occupant"}</p>
      {additional.length > 0 ? (
        <>
          <p className="mt-2 text-xs text-[#6B5E4E]">Additional Occupants</p>
          <ul>
            {additional.map((occupant) => (
              <li key={occupant.guestId} className="text-sm text-[#251605]">
                {occupant.name}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
