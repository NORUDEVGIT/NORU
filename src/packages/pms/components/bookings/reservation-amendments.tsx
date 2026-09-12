import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listReservationAmendments } from "@/packages/pms/lib/reservations.functions";
import { amendmentEventLabel, beforeAfterFromHistory } from "@/packages/pms/lib/fo-amendments";
import { formatFoDateTime } from "@/packages/pms/lib/fo-cancel-noshow";

/**
 * Reservation change feed from hotel_reservation_history.
 * FO-FS4: type, who, when (en-GB), reason, before/after snapshots.
 */
export function ReservationAmendmentsTab({ restaurantId }: { restaurantId: string }) {
  const fetchAmendments = useServerFn(listReservationAmendments);
  const query = useQuery({
    queryKey: ["reservation-amendments", restaurantId],
    queryFn: () => fetchAmendments({ data: { restaurantId, limit: 100 } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading amendments…</p>;

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No reservation changes recorded yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const snapshots = beforeAfterFromHistory(row.previousValues, row.newValues);
        return (
          <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: row.reservationId }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.confirmationNumber}
                  </Link>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                    {amendmentEventLabel(row.eventType)}
                  </span>
                </div>
                <p className="mt-1 text-sm">{row.guestName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.actorName ?? "—"} · {formatFoDateTime(row.createdAt)}
                </p>
                {row.notes ? <p className="mt-1 text-xs text-muted-foreground">Reason: {row.notes}</p> : null}
                {snapshots.length > 0 ? (
                  <dl className="mt-2 grid gap-1 text-xs">
                    {snapshots.map((pair) => (
                      <div key={`${row.id}-${pair.label}`} className="flex flex-wrap gap-x-2">
                        <dt className="capitalize text-muted-foreground">{pair.label}</dt>
                        <dd>
                          {pair.previous} → {pair.next}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
