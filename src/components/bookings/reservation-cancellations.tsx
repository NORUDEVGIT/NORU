import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listReservations } from "@/lib/reservations.functions";
import { formatStayDate } from "@/components/bookings/reservation-bits";

/**
 * Phase 7D.2F1 patch — cancelled reservations as a lifecycle category.
 * Read-only view over the existing reservation records; no new writes.
 */
export function ReservationCancellationsTab({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const fetchReservations = useServerFn(listReservations);
  const query = useQuery({
    queryKey: ["reservations-cancelled", restaurantId],
    queryFn: () =>
      fetchReservations({ data: { restaurantId, status: "cancelled" as const, page: 1, pageSize: 100 } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading cancellations…</p>;

  const rows = query.data?.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No cancelled reservations yet.
      </div>
    );
  }

  function open(id: string) {
    void navigate({ to: "/restaurant/bookings/$reservationId", params: { reservationId: id } });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Confirmation</th>
            <th className="px-4 py-3">Guest</th>
            <th className="px-4 py-3">Stay</th>
            <th className="px-4 py-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              onClick={() => open(r.id)}
              onKeyDown={(e) => e.key === "Enter" && open(r.id)}
              className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
            >
              <td className="px-4 py-3 font-medium">{r.confirmationNumber}</td>
              <td className="px-4 py-3">{r.guestName}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatStayDate(r.arrivalDate)} → {formatStayDate(r.departureDate)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.cancellationReason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
