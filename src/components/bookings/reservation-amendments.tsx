import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listReservationAmendments } from "@/lib/reservations.functions";

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Modified",
  status_changed: "Status changed",
  cancelled: "Cancelled",
  room_assigned: "Room assigned",
  room_changed: "Room moved",
  checked_in: "Checked in",
  checked_out: "Checked out",
  no_show: "No-show",
  dates_changed: "Dates changed",
  priced: "Repriced",
};

function label(eventType: string) {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

/**
 * Phase 7D.2F1 — read-only amendment feed built from the reservation history
 * that the reservation write paths already record. No new writes here.
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
      {rows.map((row) => (
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
                  {label(row.eventType)}
                </span>
              </div>
              <p className="mt-1 text-sm">{row.guestName}</p>
              {row.notes ? <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
