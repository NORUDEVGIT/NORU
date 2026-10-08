import { useEffect, useState, type ReactNode } from "react";
import { addDays, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CREATE_RESERVATION_MIN_NIGHTS,
  CREATE_RESERVATION_STAY_INVALID_RANGE,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_LABEL,
  PMS_OP_PLACEHOLDER,
  PMS_OP_TEXTAREA,
} from "@/packages/pms/lib/pms-operational-surface";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const stayControlClass = cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER);

export function StayCountInput({
  id,
  value,
  min,
  max,
  disabled,
  onCommit,
  "data-testid": testId,
}: {
  id: string;
  value: number;
  min: number;
  max?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
  "data-testid"?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [value]);

  function clamp(raw: string): number {
    const parsed = Number(raw);
    const next = Number.isFinite(parsed) ? Math.floor(parsed) : min;
    if (max == null) return Math.max(min, next);
    return Math.min(max, Math.max(min, next));
  }

  return (
    <Input
      id={id}
      data-testid={testId}
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      className={cn(stayControlClass, "tabular-nums")}
      value={draft ?? String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "") {
          setDraft("");
          return;
        }
        setDraft(raw);
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const next = Math.floor(parsed);
        if (next < min) return;
        if (max != null && next > max) {
          setDraft(String(max));
          onCommit(max);
          return;
        }
        onCommit(next);
      }}
      onBlur={() => {
        onCommit(clamp(draft ?? String(value)));
        setDraft(null);
      }}
    />
  );
}

function StayFieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className={PMS_OP_LABEL}>
      {children}
    </Label>
  );
}

export function CreateReservationStay({
  arrival,
  departure,
  nights,
  datesValid,
  adults,
  children,
  infants,
  specialRequests,
  notes,
  showNotes = true,
  title = "Stay",
  rooms = 1,
  onRoomsChange,
  requestExtras,
  occupancyWarn,
  onArrivalChange,
  onDepartureChange,
  onNightsChange,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onSpecialRequestsChange,
  onNotesChange,
}: {
  arrival: string;
  departure: string;
  nights: number;
  datesValid: boolean;
  adults: number;
  children: number;
  infants?: number;
  specialRequests: string;
  notes: string;
  showNotes?: boolean;
  title?: string;
  rooms?: number;
  onRoomsChange?: (rooms: number) => void;
  requestExtras?: ReactNode;
  occupancyWarn: ReactNode;
  onArrivalChange: (value: string) => void;
  onDepartureChange: (value: string) => void;
  onNightsChange: (nights: number) => void;
  onAdultsChange: (adults: number) => void;
  onChildrenChange: (children: number) => void;
  onInfantsChange?: (infants: number) => void;
  onSpecialRequestsChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const departureMin = arrival ? addDays(arrival, CREATE_RESERVATION_MIN_NIGHTS) : undefined;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      data-testid="create-reservation-stay"
    >
      <h2 className="font-display text-lg">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="min-w-0 space-y-1.5">
          <StayFieldLabel htmlFor="arrival">Arrival Date</StayFieldLabel>
          <Input
            id="arrival"
            data-testid="stay-arrival"
            type="date"
            required
            className={cn(stayControlClass, PMS_OP_DATE)}
            value={arrival}
            onChange={(e) => onArrivalChange(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <StayFieldLabel htmlFor="departure">Departure Date</StayFieldLabel>
          <Input
            id="departure"
            data-testid="stay-departure"
            type="date"
            min={departureMin}
            className={cn(stayControlClass, PMS_OP_DATE)}
            value={departure}
            onChange={(e) => onDepartureChange(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <StayFieldLabel htmlFor="nights">Nights</StayFieldLabel>
          <StayCountInput
            id="nights"
            data-testid="stay-nights"
            value={nights}
            min={CREATE_RESERVATION_MIN_NIGHTS}
            onCommit={onNightsChange}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <StayFieldLabel htmlFor="rooms-requested">Rooms</StayFieldLabel>
          <StayCountInput
            id="rooms-requested"
            value={rooms}
            min={1}
            max={20}
            disabled={!onRoomsChange}
            onCommit={(next) => onRoomsChange?.(next)}
          />
          {/* TODO: wire to Rooms & Inventory — room count is not on the create payload */}
        </div>
        <div className="min-w-0 space-y-1.5">
          <StayFieldLabel htmlFor="adults">Adults</StayFieldLabel>
          <StayCountInput
            id="adults"
            data-testid="stay-adults"
            value={adults}
            min={1}
            max={20}
            onCommit={onAdultsChange}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <StayFieldLabel htmlFor="children">Children</StayFieldLabel>
          <StayCountInput
            id="children"
            data-testid="stay-children"
            value={children}
            min={0}
            max={20}
            onCommit={onChildrenChange}
          />
        </div>
        {onInfantsChange != null && infants != null ? (
          <div className="min-w-0 space-y-1.5">
            <StayFieldLabel htmlFor="infants">Infants</StayFieldLabel>
            <StayCountInput
              id="infants"
              data-testid="stay-infants"
              value={infants}
              min={0}
              max={20}
              onCommit={onInfantsChange}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {requestExtras}
        <div className="min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1">
          <StayFieldLabel htmlFor="requests">Special Request</StayFieldLabel>
          <Input
            id="requests"
            data-testid="stay-special-requests"
            className={stayControlClass}
            placeholder="e.g. High floor, airport pickup, extra bed..."
            value={specialRequests}
            onChange={(e) => onSpecialRequestsChange(e.target.value)}
          />
        </div>
      </div>
      {datesValid ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="stay-range-summary">
          {nights} night{nights === 1 ? "" : "s"} · {formatStayDate(arrival)} →{" "}
          {formatStayDate(departure)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-destructive" data-testid="stay-invalid-range">
          {CREATE_RESERVATION_STAY_INVALID_RANGE}
        </p>
      )}

      {occupancyWarn ? <div className="mt-3">{occupancyWarn}</div> : null}

      {showNotes ? (
        <div className="mt-4 space-y-1.5">
          <StayFieldLabel htmlFor="notes">Internal notes</StayFieldLabel>
          <Textarea
            id="notes"
            data-testid="stay-notes"
            rows={3}
            className={cn(PMS_OP_TEXTAREA, PMS_OP_PLACEHOLDER)}
            placeholder="Staff-only notes for this draft"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </div>
      ) : null}
    </section>
  );
}
