import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import { bookingRowActions } from "@/packages/pms/lib/guest-bookings-workspace";
import {
  folioHref,
  frontOfficeHref,
  reservationHref,
  type GuestStay,
  type GuestStayAccess,
} from "@/packages/pms/lib/guest-profile-wave3";

export function GuestStayActions({
  stay,
  access,
  today: _today,
  size = "default",
}: {
  stay: GuestStay;
  access: GuestStayAccess;
  today: string;
  size?: "default" | "sm";
}) {
  const actions = bookingRowActions(stay, access);
  const buttonSize = size === "sm" ? "sm" : "default";

  return (
    <div className="flex flex-wrap gap-2" data-testid={`guest-stay-actions-${stay.id}`}>
      {actions.view === "hidden" ? null : (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/reservations/$reservationId"
            params={{ reservationId: stay.id }}
            data-testid="guest-stay-action-reservation"
            title={reservationHref(stay.id)}
          >
            View
          </Link>
        </Button>
      )}
      {actions.modify === "hidden" ? null : (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/reservations/$reservationId"
            params={{ reservationId: stay.id }}
            data-testid="guest-stay-action-modify"
            title={reservationHref(stay.id)}
          >
            Modify
          </Link>
        </Button>
      )}
      {actions.checkIn === "hidden" ? null : (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/front-office"
            search={{ tab: "arrivals" }}
            data-testid="guest-stay-action-front-office"
            title={frontOfficeHref("arrivals")}
          >
            Check-in
          </Link>
        </Button>
      )}
      {actions.checkOut === "hidden" ? null : (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/front-office"
            search={{ tab: "departures" }}
            data-testid="guest-stay-action-check-out"
            title={frontOfficeHref("departures")}
          >
            Check-out
          </Link>
        </Button>
      )}
      {actions.cancel === "hidden" ? null : (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/front-office"
            search={{ tab: "cancellations" }}
            data-testid="guest-stay-action-cancel"
            title={frontOfficeHref("cancellations")}
          >
            Cancel
          </Link>
        </Button>
      )}
      {actions.folio === "hidden" ? null : actions.folio === "enabled" && stay.folioNumber ? (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/cashiering"
            search={{ tab: "folios", folio: stay.folioNumber }}
            data-testid="guest-stay-action-folio"
            title={folioHref(stay.folioNumber)}
          >
            Folio
          </Link>
        </Button>
      ) : (
        <Button size={buttonSize} variant="outline" disabled data-testid="guest-stay-action-folio">
          Folio
        </Button>
      )}
    </div>
  );
}
