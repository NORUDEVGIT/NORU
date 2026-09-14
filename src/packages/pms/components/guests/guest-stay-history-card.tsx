import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  WAVE3_STAY_HISTORY_CONTEXT,
  stayRoomNumberLabel,
  wave3StayHistoryEmpty,
} from "@/packages/pms/lib/guest-profile-wave3";
import { listGuestStays } from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";

export function GuestStayHistoryCard({
  restaurantId,
  guestId,
  guestName,
  timezone,
}: {
  restaurantId: string;
  guestId: string;
  guestName: string;
  timezone: string;
}) {
  const fetchStays = useServerFn(listGuestStays);
  const today = propertyToday(timezone);
  const staysQuery = useQuery({
    queryKey: ["guest-stays", restaurantId, guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId } }),
    retry: false,
  });

  if (staysQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading stay history…</p>;
  }
  if (staysQuery.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-stay-history">
        <h2 className="font-display text-xl" data-testid="guest-stay-history-guest-name">
          {guestName}
        </h2>
        <p className="mt-1 text-sm font-medium">Stay History</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {staysQuery.error instanceof Error ? staysQuery.error.message : "Stay history could not be loaded."}
        </p>
      </div>
    );
  }

  const stays = staysQuery.data?.stays ?? [];
  const access = staysQuery.data?.access ?? { reservation: false, frontOffice: false, folio: false };

  return (
    <div className="space-y-4" data-testid="guest-stay-history">
      <div>
        <h2 className="font-display text-xl" data-testid="guest-stay-history-guest-name">
          {guestName}
        </h2>
        <p className="mt-1 text-sm font-medium">Stay History</p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="guest-stay-history-context">
          {WAVE3_STAY_HISTORY_CONTEXT}. Real reservations for {guestName}. Confirmation numbers and
          dates match Reservations.
        </p>
      </div>

      {stays.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border bg-card p-6"
          data-testid="guest-stay-history-empty"
        >
          <p className="text-sm text-muted-foreground">{wave3StayHistoryEmpty(guestName)}</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Confirmation</th>
                  <th className="px-4 py-3">Stay</th>
                  <th className="px-4 py-3">Nights</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stays.map((stay) => (
                  <tr key={stay.id} className="border-t border-border" data-testid="guest-stay-row">
                    <td className="px-4 py-3 font-medium">{stay.confirmationNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{stay.nights}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {stay.roomTypeName} · {stayRoomNumberLabel(stay)}
                    </td>
                    <td className="px-4 py-3">
                      <ReservationStatusBadge status={stay.status} />
                    </td>
                    <td className="px-4 py-3">
                      <GuestStayActions stay={stay} access={access} today={today} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {stays.map((stay) => (
              <li
                key={stay.id}
                className="rounded-2xl border border-border bg-card p-4"
                data-testid="guest-stay-row"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{stay.confirmationNumber}</span>
                  <ReservationStatusBadge status={stay.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)} · {stay.nights} night
                  {stay.nights === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stay.roomTypeName} · {stayRoomNumberLabel(stay)}
                </p>
                <div className="mt-3">
                  <GuestStayActions stay={stay} access={access} today={today} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
