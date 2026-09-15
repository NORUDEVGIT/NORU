import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  RESERVATION_TYPE_LABELS,
  RESERVATION_TYPE_MODES,
  type ContextPickOption,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";

export function CreateReservationContext({
  restaurantId,
  canCreateMaster,
  reservationType,
  onRequestTypeChange,
  bookingSource,
  onBookingSourceChange,
  sourceOptions,
  marketSegment,
  onMarketSegmentChange,
  segmentOptions,
  externalReference,
  onExternalReferenceChange,
  bookingAgentName,
  companyMaster,
  onCompanyMasterChange,
  travelAgentMaster,
  onTravelAgentMasterChange,
}: {
  restaurantId: string;
  canCreateMaster: boolean;
  reservationType: ReservationTypeMode;
  onRequestTypeChange: (next: ReservationTypeMode) => void;
  bookingSource: string;
  onBookingSourceChange: (value: string) => void;
  sourceOptions: ContextPickOption[];
  marketSegment: string;
  onMarketSegmentChange: (value: string) => void;
  segmentOptions: ContextPickOption[];
  externalReference: string;
  onExternalReferenceChange: (value: string) => void;
  bookingAgentName: string;
  companyMaster: PickedReservationMaster | null;
  onCompanyMasterChange: (master: PickedReservationMaster | null) => void;
  travelAgentMaster: PickedReservationMaster | null;
  onTravelAgentMasterChange: (master: PickedReservationMaster | null) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-context">
      <h2 className="font-display text-lg">Context</h2>
      <p className="mt-1 text-xs text-muted-foreground">Reservation type, source, and agent for this stay.</p>

      <div className="mt-3 space-y-1">
        <Label>Reservation type</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Reservation type">
          {RESERVATION_TYPE_MODES.map((mode) => {
            const selected = reservationType === mode;
            return (
              <button
                key={mode}
                type="button"
                data-testid={`reservation-type-${mode}`}
                aria-pressed={selected}
                onClick={() => onRequestTypeChange(mode)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  selected ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-accent/40",
                )}
              >
                {RESERVATION_TYPE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {reservationType === "corporate" ? (
        <CreateReservationMasterPicker
          restaurantId={restaurantId}
          kind="company"
          canCreate={canCreateMaster}
          master={companyMaster}
          onMasterChange={onCompanyMasterChange}
        />
      ) : null}
      {reservationType === "travel_agency" ? (
        <CreateReservationMasterPicker
          restaurantId={restaurantId}
          kind="travel_agent"
          canCreate={canCreateMaster}
          master={travelAgentMaster}
          onMasterChange={onTravelAgentMasterChange}
        />
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="booking-source">Booking source</Label>
          <Select value={bookingSource} onValueChange={onBookingSourceChange}>
            <SelectTrigger id="booking-source" data-testid="booking-source">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="market-segment">Market segment</Label>
          <Select value={marketSegment} onValueChange={onMarketSegmentChange}>
            <SelectTrigger id="market-segment" data-testid="market-segment">
              <SelectValue placeholder="Select segment" />
            </SelectTrigger>
            <SelectContent>
              {segmentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="external-reference">External reference</Label>
          <Input
            id="external-reference"
            data-testid="external-reference"
            value={externalReference}
            onChange={(e) => onExternalReferenceChange(e.target.value)}
            placeholder="Optional"
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="booking-agent">Booking agent</Label>
          <Input id="booking-agent" data-testid="booking-agent" value={bookingAgentName} readOnly />
        </div>
      </div>
    </section>
  );
}
