import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { RoomPolicyValues } from "@/packages/pms/lib/create-reservation-group-step23";
import { quotedGuestTotal } from "@/packages/pms/lib/create-reservation-phase1-section5";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import type { CreateRoomUnitInput } from "@/packages/pms/lib/reservation-room-units";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

export type ExtraRoomOccupant = { guestId: string; fullName: string };

export type ExtraRoomDraft = CreateRoomUnitInput & {
  key: string;
  occupant?: ExtraRoomOccupant | null;
};

export type ExtraRoomQuote = {
  typeName: string;
  ratePlan: string;
  total: string;
  nightly?: string;
  subtotal?: number | null;
  guestTotal?: number | null;
  nightlyRates?: number[];
  policy?: RoomPolicyValues | null;
};

export function CreateReservationExtraRooms({
  restaurantId,
  arrival,
  departure,
  datesValid,
  roomTypes,
  units,
  money,
  onChange,
  onAdd,
  onRemove,
  onQuote,
}: {
  restaurantId: string;
  arrival: string;
  departure: string;
  datesValid: boolean;
  roomTypes: Array<{ roomTypeId: string; name: string }>;
  units: ExtraRoomDraft[];
  money: (value: number) => string;
  onChange: (key: string, patch: Partial<CreateRoomUnitInput>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onQuote: (key: string, quote: ExtraRoomQuote | null) => void;
}) {
  return (
    <section
      className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4"
      data-testid="extra-room-units"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base text-[#251605]">Additional rooms</h3>
          <p className="text-xs text-muted-foreground">
            These rooms share the arrival and departure above. Each one is saved as its own room.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!datesValid || roomTypes.length === 0 || units.length >= 19}
          onClick={onAdd}
        >
          Add Room
        </Button>
      </div>
      {units.map((unit, index) => (
        <ExtraRoomCard
          key={unit.key}
          restaurantId={restaurantId}
          arrival={arrival}
          departure={departure}
          datesValid={datesValid}
          roomTypes={roomTypes}
          unit={unit}
          index={index + 2}
          money={money}
          onChange={(patch) => onChange(unit.key, patch)}
          onRemove={() => onRemove(unit.key)}
          onQuote={(quote) => onQuote(unit.key, quote)}
        />
      ))}
    </section>
  );
}

function ExtraRoomCard({
  restaurantId,
  arrival,
  departure,
  datesValid,
  roomTypes,
  unit,
  index,
  money,
  onChange,
  onRemove,
  onQuote,
}: {
  restaurantId: string;
  arrival: string;
  departure: string;
  datesValid: boolean;
  roomTypes: Array<{ roomTypeId: string; name: string }>;
  unit: ExtraRoomDraft;
  index: number;
  money: (value: number) => string;
  onChange: (patch: Partial<CreateRoomUnitInput>) => void;
  onRemove: () => void;
  onQuote: (quote: ExtraRoomQuote | null) => void;
}) {
  const fetchQuotes = useServerFn(quoteStay);
  const typeName = roomTypes.find((type) => type.roomTypeId === unit.roomTypeId)?.name ?? "Room";
  const quotesQuery = useQuery({
    queryKey: [
      "extra-room-quote",
      restaurantId,
      unit.roomTypeId,
      unit.ratePlanId,
      arrival,
      departure,
      unit.adults,
      unit.children,
      unit.infants,
    ],
    queryFn: () =>
      fetchQuotes({
        data: {
          restaurantId,
          roomTypeId: unit.roomTypeId,
          arrival,
          departure,
          rooms: 1,
          adults: unit.adults,
          children: unit.children,
          infants: unit.infants,
          ...(unit.ratePlanId ? { ratePlanId: unit.ratePlanId } : {}),
        },
      }),
    enabled: datesValid && Boolean(unit.roomTypeId),
    retry: false,
  });
  const selected = (quotesQuery.data ?? []).find((row) => row.plan.id === unit.ratePlanId) ?? null;
  const plans = quotesQuery.data ?? [];

  useEffect(() => {
    if (!unit.roomTypeId) {
      onQuote(null);
      return;
    }
    onQuote({
      typeName,
      ratePlan: selected?.plan.name ?? "—",
      total: selected?.quote == null ? "—" : money(quotedGuestTotal(selected.quote)),
      subtotal: selected?.quote?.subtotal ?? null,
      guestTotal: selected?.quote ? quotedGuestTotal(selected.quote) : null,
    });
  }, [money, onQuote, selected?.plan.name, selected?.quote?.guestTotal, selected?.quote?.subtotal, typeName, unit.roomTypeId]);

  return (
    <div className="grid gap-3 rounded-lg border border-[#EEE6D8] p-3 sm:grid-cols-2 lg:grid-cols-6">
      <p className="sm:col-span-2 lg:col-span-6 text-sm font-medium text-[#251605]">Room {index}</p>
      <label className="space-y-1 text-[11px] text-muted-foreground">
        Room type
        <Select
          value={unit.roomTypeId || "none"}
          onValueChange={(value) =>
            onChange({ roomTypeId: value === "none" ? "" : value, ratePlanId: null })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select</SelectItem>
            {roomTypes.map((type) => (
              <SelectItem key={type.roomTypeId} value={type.roomTypeId}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-[11px] text-muted-foreground">
        Adults
        <Input
          className="h-8"
          type="number"
          min={1}
          value={unit.adults}
          onChange={(event) => onChange({ adults: Math.max(1, Number(event.target.value) || 1) })}
        />
      </label>
      <label className="space-y-1 text-[11px] text-muted-foreground">
        Children
        <Input
          className="h-8"
          type="number"
          min={0}
          value={unit.children}
          onChange={(event) => onChange({ children: Math.max(0, Number(event.target.value) || 0) })}
        />
      </label>
      <label className="space-y-1 text-[11px] text-muted-foreground">
        Infants
        <Input
          className="h-8"
          type="number"
          min={0}
          value={unit.infants}
          onChange={(event) => onChange({ infants: Math.max(0, Number(event.target.value) || 0) })}
        />
      </label>
      <label className="space-y-1 text-[11px] text-muted-foreground">
        Rate plan
        <Select
          value={unit.ratePlanId || "none"}
          onValueChange={(value) => onChange({ ratePlanId: value === "none" ? null : value })}
          disabled={!unit.roomTypeId}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select</SelectItem>
            {plans.map((row) => (
              <SelectItem key={row.plan.id} value={row.plan.id}>
                {row.plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="flex items-end">
        <Button type="button" size="sm" variant="outline" onClick={onRemove}>
          Remove Room
        </Button>
      </div>
      <p className="sm:col-span-2 lg:col-span-6 text-xs text-muted-foreground">
        Quoted room total {selected?.quote == null ? "—" : money(quotedGuestTotal(selected.quote))}
        . The server recalculates this on save.
      </p>
    </div>
  );
}
