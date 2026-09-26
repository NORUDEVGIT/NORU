/**
 * Phase 7D.2F1 — shared Front Office stay lists.
 *
 * The in-house and departures bodies used to live inside their own legacy
 * routes. They are extracted here unchanged so the canonical Front Office
 * workspace can present them as tabs. No new data or write paths.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { CheckOutDialog } from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { StayMoneyStrip } from "@/packages/pms/components/frontoffice/fo-stay-money-cells";
import { listFoStaySignals } from "@/packages/pms/lib/fo-exceptions.functions";
import { listDepartures, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";

function ConfirmationLink({ stay }: { stay: FrontOfficeStay }) {
  return (
    <Link
      to="/restaurant/pms/reservations/$reservationId"
      params={{ reservationId: stay.id }}
      className="font-medium underline-offset-4 hover:underline"
    >
      {stay.confirmationNumber}
    </Link>
  );
}

export function DeparturesList({ restaurantId }: { restaurantId: string }) {
  const timezone = useRestaurantTimezone();
  const today = usePropertyBusinessDate(restaurantId, timezone);

  const [date, setDate] = useState(today);
  useEffect(() => {
    setDate(today);
  }, [today]);
  const [checkOut, setCheckOut] = useState<FrontOfficeStay | null>(null);

  const fetchDepartures = useServerFn(listDepartures);
  const fetchSignals = useServerFn(listFoStaySignals);
  const departuresQuery = useQuery({
    queryKey: ["front-office", "departures", restaurantId, date],
    queryFn: () => fetchDepartures({ data: { restaurantId, date } }),
    retry: false,
  });

  const rows = departuresQuery.data ?? [];
  const signalsQuery = useQuery({
    queryKey: ["front-office", "stay-signals", restaurantId, rows.map((r) => r.id).join(",")],
    queryFn: () => fetchSignals({ data: { restaurantId, reservationIds: rows.map((r) => r.id) } }),
    enabled: rows.length > 0,
    retry: false,
  });
  const folioLane = signalsQuery.data?.folioLane ?? "coming_soon";
  const signals = Object.values(signalsQuery.data?.byStay ?? {});

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stays due to depart on {formatStayDate(date)}, plus any overstays.
      </p>

      <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />

      {departuresQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading departures…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No departures for this date.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ConfirmationLink stay={row} />
                    <ReservationStatusBadge status={row.status} />
                    {row.overstay ? (
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                        Overstay
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm">
                    {row.guestName} · Room {row.roomNumber ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatStayDate(row.arrivalDate)} → {formatStayDate(row.departureDate)}
                  </p>
                  <StayMoneyStrip
                    folioLane={folioLane}
                    signal={signalsQuery.data?.byStay?.[row.id]}
                    signals={signals}
                  />
                </div>
                {row.status === "checked_in" ? (
                  <Button size="sm" onClick={() => setCheckOut(row)}>
                    Check out
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {checkOut ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={checkOut}
          open
          onOpenChange={(v) => !v && setCheckOut(null)}
        />
      ) : null}
    </div>
  );
}
