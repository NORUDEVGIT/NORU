import type { ReactNode } from "react";
import { addDays, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CREATE_RESERVATION_MIN_NIGHTS,
  CREATE_RESERVATION_STAY_INVALID_RANGE,
} from "@/packages/pms/lib/create-reservation-phase1";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";

export function CreateReservationStay({
  arrival,
  departure,
  nights,
  datesValid,
  adults,
  children,
  specialRequests,
  notes,
  occupancyWarn,
  onArrivalChange,
  onDepartureChange,
  onNightsChange,
  onAdultsChange,
  onChildrenChange,
  onSpecialRequestsChange,
  onNotesChange,
}: {
  arrival: string;
  departure: string;
  nights: number;
  datesValid: boolean;
  adults: number;
  children: number;
  specialRequests: string;
  notes: string;
  occupancyWarn: ReactNode;
  onArrivalChange: (value: string) => void;
  onDepartureChange: (value: string) => void;
  onNightsChange: (nights: number) => void;
  onAdultsChange: (adults: number) => void;
  onChildrenChange: (children: number) => void;
  onSpecialRequestsChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const departureMin = arrival ? addDays(arrival, CREATE_RESERVATION_MIN_NIGHTS) : undefined;

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-stay">
      <h2 className="font-display text-lg">Stay</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="arrival">Arrival</Label>
          <Input
            id="arrival"
            data-testid="stay-arrival"
            type="date"
            required
            value={arrival}
            onChange={(e) => onArrivalChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="nights">Nights</Label>
          <Input
            id="nights"
            data-testid="stay-nights"
            type="number"
            min={CREATE_RESERVATION_MIN_NIGHTS}
            value={nights}
            onChange={(e) => onNightsChange(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="departure">Departure</Label>
          <Input
            id="departure"
            data-testid="stay-departure"
            type="date"
            min={departureMin}
            value={departure}
            onChange={(e) => onDepartureChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adults">Adults</Label>
          <Input
            id="adults"
            data-testid="stay-adults"
            type="number"
            min={1}
            max={20}
            value={adults}
            onChange={(e) => onAdultsChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="children">Children</Label>
          <Input
            id="children"
            data-testid="stay-children"
            type="number"
            min={0}
            max={20}
            value={children}
            onChange={(e) => onChildrenChange(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>
      {datesValid ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="stay-range-summary">
          {nights} night{nights === 1 ? "" : "s"} · {formatStayDate(arrival)} → {formatStayDate(departure)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-destructive" data-testid="stay-invalid-range">
          {CREATE_RESERVATION_STAY_INVALID_RANGE}
        </p>
      )}

      {occupancyWarn ? <div className="mt-3">{occupancyWarn}</div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="requests">Special requests</Label>
          <Textarea
            id="requests"
            data-testid="stay-special-requests"
            rows={3}
            value={specialRequests}
            onChange={(e) => onSpecialRequestsChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            data-testid="stay-notes"
            rows={3}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
