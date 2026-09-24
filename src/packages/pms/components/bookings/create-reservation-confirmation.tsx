import { Link } from "@tanstack/react-router";
import { Button } from "@/shared/components/ui/button";
import {
  CREATE_RESERVATION_OPEN_RESERVATION_LABEL,
  CREATE_RESERVATION_PRINT_LABEL,
  type CreatedReservationConfirmation,
} from "@/packages/pms/lib/create-reservation-phase1-section7";

export function CreateReservationConfirmation({
  view,
  onOpenReservation,
  onReturnToDesk,
  onCreateAnother,
}: {
  view: CreatedReservationConfirmation;
  onOpenReservation?: (reservationId: string) => void;
  onReturnToDesk?: () => void;
  onCreateAnother?: () => void;
}) {
  return (
    <section
      className="create-reservation-confirmation rounded-2xl border border-border bg-card p-6"
      data-testid="create-reservation-confirmation"
    >
      <h1 className="font-display text-2xl">Reservation created</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirmation {view.confirmationNumber}. Print this page for the guest —{" "}
        {"email and SMS are not sent from create."}
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Confirmation</dt>
          <dd data-testid="confirmation-number">{view.confirmationNumber}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt>
          <dd data-testid="confirmation-status">
            {view.status === "confirmed" ? "Confirmed" : "Pending"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guest</dt>
          <dd data-testid="confirmation-guest">{view.guestName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay</dt>
          <dd data-testid="confirmation-stay">{view.stayDates}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Occupancy</dt>
          <dd>{view.occupancy}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room type</dt>
          <dd data-testid="confirmation-room-type">{view.roomType}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room</dt>
          <dd data-testid="confirmation-room">{view.room}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rate</dt>
          <dd data-testid="confirmation-rate">
            {view.unpriced ? "Unpriced — no stay total" : (view.rate ?? "—")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay total</dt>
          <dd data-testid="confirmation-stay-total">
            {view.unpriced || !view.stayTotal
              ? "No stay total — a server quote is required before a total can appear."
              : view.stayTotal}
          </dd>
        </div>
        {view.guaranteeMethod ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guarantee</dt>
            <dd data-testid="confirmation-guarantee">{view.guaranteeMethod}</dd>
          </div>
        ) : null}
        {view.paymentTerms ? (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Payment terms</dt>
            <dd data-testid="confirmation-payment-terms">{view.paymentTerms}</dd>
          </div>
        ) : null}
        {view.bookingSource ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Booking source
            </dt>
            <dd>{view.bookingSource}</dd>
          </div>
        ) : null}
        {view.marketSegment ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Market segment
            </dt>
            <dd>{view.marketSegment}</dd>
          </div>
        ) : null}
        {view.externalReference ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              External reference
            </dt>
            <dd>{view.externalReference}</dd>
          </div>
        ) : null}
      </dl>

      <div className="create-reservation-confirmation-actions mt-6 flex flex-wrap gap-3">
        <Button type="button" data-testid="create-reservation-print" onClick={() => window.print()}>
          {CREATE_RESERVATION_PRINT_LABEL}
        </Button>
        {onOpenReservation ? (
          <Button
            type="button"
            variant="outline"
            data-testid="open-reservation"
            onClick={() => onOpenReservation(view.id)}
          >
            {CREATE_RESERVATION_OPEN_RESERVATION_LABEL}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link
              to="/restaurant/pms/reservations/$reservationId"
              params={{ reservationId: view.id }}
              data-testid="open-reservation"
            >
              {CREATE_RESERVATION_OPEN_RESERVATION_LABEL}
            </Link>
          </Button>
        )}
        {onReturnToDesk ? (
          <Button type="button" variant="outline" onClick={onReturnToDesk}>
            Return to Reservation Desk
          </Button>
        ) : null}
        {onCreateAnother ? (
          <Button type="button" variant="outline" onClick={onCreateAnother}>
            New Reservation
          </Button>
        ) : null}
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .create-reservation-confirmation, .create-reservation-confirmation * { visibility: visible; }
          .create-reservation-confirmation {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none;
            border: none;
          }
          .create-reservation-confirmation-actions { display: none !important; }
        }
      `}</style>
    </section>
  );
}
