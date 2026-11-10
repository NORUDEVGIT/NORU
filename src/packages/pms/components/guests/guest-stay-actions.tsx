import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
  presentation = "buttons",
  omitView = false,
}: {
  stay: GuestStay;
  access: GuestStayAccess;
  today: string;
  size?: "default" | "sm";
  presentation?: "buttons" | "menu";
  omitView?: boolean;
}) {
  const actions = bookingRowActions(stay, access);
  const buttonSize = size === "sm" ? "sm" : "default";
  const showView = actions.view !== "hidden" && !omitView;
  const showModify = actions.modify !== "hidden";
  const showCheckIn = actions.checkIn !== "hidden";
  const showCheckOut = actions.checkOut !== "hidden";
  const showCancel = actions.cancel !== "hidden";
  const showFolio = actions.folio !== "hidden";
  const folioEnabled = actions.folio === "enabled" && Boolean(stay.folioNumber);
  const menuEmpty =
    !showView && !showModify && !showCheckIn && !showCheckOut && !showCancel && !showFolio;

  if (presentation === "menu") {
    if (menuEmpty) return null;
    return (
      <div data-testid={`guest-stay-actions-${stay.id}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size={buttonSize}
              variant="outline"
              className="h-7 border-[#DDD4C5] px-2 text-[#251605]"
              aria-label="Stay actions"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 border-[#DDD4C5]">
            {showView ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/restaurant/pms/reservations/$reservationId"
                  params={{ reservationId: stay.id }}
                  data-testid="guest-stay-action-reservation"
                  title={reservationHref(stay.id)}
                >
                  View reservation
                </Link>
              </DropdownMenuItem>
            ) : null}
            {showModify ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/restaurant/pms/reservations/$reservationId"
                  params={{ reservationId: stay.id }}
                  data-testid="guest-stay-action-modify"
                  title={reservationHref(stay.id)}
                >
                  Modify reservation
                </Link>
              </DropdownMenuItem>
            ) : null}
            {showCheckIn ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/restaurant/pms/front-office"
                  search={{ tab: "arrivals" }}
                  data-testid="guest-stay-action-front-office"
                  title={frontOfficeHref("arrivals")}
                >
                  Check-in
                </Link>
              </DropdownMenuItem>
            ) : null}
            {showCheckOut ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/restaurant/pms/front-office"
                  search={{ tab: "departures" }}
                  data-testid="guest-stay-action-check-out"
                  title={frontOfficeHref("departures")}
                >
                  Check-out
                </Link>
              </DropdownMenuItem>
            ) : null}
            {showCancel ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/restaurant/pms/front-office"
                  search={{ tab: "cancellations" }}
                  data-testid="guest-stay-action-cancel"
                  title={frontOfficeHref("cancellations")}
                >
                  Cancel
                </Link>
              </DropdownMenuItem>
            ) : null}
            {showFolio && folioEnabled ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/restaurant/pms/cashiering"
                  search={{ tab: "folios", folio: stay.folioNumber ?? undefined }}
                  data-testid="guest-stay-action-folio"
                  title={folioHref(stay.folioNumber)}
                >
                  Open Folio
                </Link>
              </DropdownMenuItem>
            ) : showFolio ? (
              <DropdownMenuItem disabled data-testid="guest-stay-action-folio">
                Open Folio
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid={`guest-stay-actions-${stay.id}`}>
      {showView ? (
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
      ) : null}
      {showModify ? (
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
      ) : null}
      {showCheckIn ? (
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
      ) : null}
      {showCheckOut ? (
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
      ) : null}
      {showCancel ? (
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
      ) : null}
      {showFolio && folioEnabled ? (
        <Button asChild size={buttonSize} variant="outline">
          <Link
            to="/restaurant/pms/cashiering"
            search={{ tab: "folios", folio: stay.folioNumber ?? undefined }}
            data-testid="guest-stay-action-folio"
            title={folioHref(stay.folioNumber)}
          >
            Folio
          </Link>
        </Button>
      ) : showFolio ? (
        <Button size={buttonSize} variant="outline" disabled data-testid="guest-stay-action-folio">
          Folio
        </Button>
      ) : null}
    </div>
  );
}
