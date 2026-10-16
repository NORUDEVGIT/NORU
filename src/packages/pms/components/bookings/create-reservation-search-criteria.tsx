import { useState } from "react";
import { Search } from "lucide-react";

import { StayCountInput } from "@/packages/pms/components/bookings/create-reservation-stay";
import { addDays } from "@/packages/pms/components/bookings/reservation-bits";
import { CREATE_RESERVATION_MIN_NIGHTS } from "@/packages/pms/lib/create-reservation-phase1";
import type { RoomTypeAvailability } from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export function CreateReservationSearchCriteria({
  arrival,
  departure,
  nights,
  rooms,
  adults,
  children,
  infants,
  roomTypeFilter,
  roomTypes,
  onArrivalChange,
  onDepartureChange,
  onNightsChange,
  onRoomsChange,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onRoomTypeFilterChange,
  onModifySearch,
}: {
  arrival: string;
  departure: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  roomTypeFilter: string;
  roomTypes: RoomTypeAvailability[];
  onArrivalChange: (value: string) => void;
  onDepartureChange: (value: string) => void;
  onNightsChange: (nights: number) => void;
  onRoomsChange: (rooms: number) => void;
  onAdultsChange: (adults: number) => void;
  onChildrenChange: (children: number) => void;
  onInfantsChange: (infants: number) => void;
  onRoomTypeFilterChange: (roomTypeId: string) => void;
  onModifySearch: () => void;
}) {
  const departureMin = arrival ? addDays(arrival, CREATE_RESERVATION_MIN_NIGHTS) : undefined;
  const [flexibleDates, setFlexibleDates] = useState(false);

  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="create-reservation-search-criteria"
    >
      <div>
        <h2 className="font-display text-lg text-[#251605]">Search Criteria</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Modify your search to see different availability options.
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-arrival" className="text-[11px] text-muted-foreground">
            Arrival Date
          </Label>
          <Input
            id="search-arrival"
            type="date"
            className="h-9"
            value={arrival}
            onChange={(event) => onArrivalChange(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-departure" className="text-[11px] text-muted-foreground">
            Departure Date
          </Label>
          <Input
            id="search-departure"
            type="date"
            min={departureMin}
            className="h-9"
            value={departure}
            onChange={(event) => onDepartureChange(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-nights" className="text-[11px] text-muted-foreground">
            Nights
          </Label>
          <StayCountInput id="search-nights" value={nights} min={CREATE_RESERVATION_MIN_NIGHTS} onCommit={onNightsChange} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-rooms" className="text-[11px] text-muted-foreground">
            Rooms
          </Label>
          <StayCountInput id="search-rooms" value={rooms} min={1} max={20} onCommit={onRoomsChange} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-adults" className="text-[11px] text-muted-foreground">
            Adults
          </Label>
          <StayCountInput id="search-adults" value={adults} min={1} max={20} onCommit={onAdultsChange} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-children" className="text-[11px] text-muted-foreground">
            Children
          </Label>
          <StayCountInput id="search-children" value={children} min={0} max={20} onCommit={onChildrenChange} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-infants" className="text-[11px] text-muted-foreground">
            Infants
          </Label>
          <StayCountInput
            id="search-infants"
            value={infants}
            min={0}
            max={20}
            onCommit={onInfantsChange}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="search-room-type" className="text-[11px] text-muted-foreground">
            Room Type
          </Label>
          <select
            id="search-room-type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={roomTypeFilter}
            onChange={(event) => onRoomTypeFilterChange(event.target.value)}
          >
            <option value="">All Room Types</option>
            {roomTypes.map((row) => (
              <option key={row.roomTypeId} value={row.roomTypeId}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-[#251605]">
          <input
            type="checkbox"
            className="size-4 rounded border-[#DDD4C5]"
            checked={flexibleDates}
            onChange={(event) => setFlexibleDates(event.target.checked)}
          />
          Flexible Dates
        </label>
        <Button
          type="button"
          className="h-9 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
          onClick={onModifySearch}
        >
          <Search className="size-4" />
          Modify Search
        </Button>
      </div>
    </section>
  );
}
