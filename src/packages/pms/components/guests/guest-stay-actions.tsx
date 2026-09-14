import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import {
  folioHref,
  frontOfficeHref,
  frontOfficeTabForStay,
  reservationHref,
  stayQuickActions,
  type GuestStay,
  type GuestStayAccess,
} from "@/packages/pms/lib/guest-profile-wave3";

export function GuestStayActions({
  stay,
  access,
  today,
  size = "default",
}: {
  stay: GuestStay;
  access: GuestStayAccess;
  today: string;
  size?: "default" | "sm";
}) {
  const actions = stayQuickActions(stay, access, today);
  const buttonSize = size === "sm" ? "sm" : "default";

  return (
    <div className="flex flex-wrap gap-2" data-testid={`guest-stay-actions-${stay.id}`}>
      {actions.reservation === "hidden" ? null : (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/reservations/$reservationId"
            params={{ reservationId: stay.id }}
            data-testid="guest-stay-action-reservation"
            title={reservationHref(stay.id)}
          >
            Reservation
          </Link>
        </Button>
      )}
      {actions.frontOffice === "hidden" ? null : actions.frontOffice === "enabled" ? (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/front-office"
            search={{ tab: frontOfficeTabForStay(stay) }}
            data-testid="guest-stay-action-front-office"
            title={frontOfficeHref(frontOfficeTabForStay(stay))}
          >
            Front Office
          </Link>
        </Button>
      ) : (
        <Button size={buttonSize} variant="outline" disabled data-testid="guest-stay-action-front-office">
          Front Office
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
