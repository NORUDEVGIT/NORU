import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  OVERVIEW_SERVICE_EMPTY,
  OVERVIEW_SERVICE_UNAVAILABLE,
} from "@/packages/pms/lib/guest-profile-overview";
import { listGuestServiceHistory } from "@/packages/pms/lib/guests.functions";

export function GuestServiceHistoryCard({
  restaurantId,
  guestId,
}: {
  restaurantId: string;
  guestId: string;
}) {
  const fetchServices = useServerFn(listGuestServiceHistory);
  const query = useQuery({
    queryKey: ["guest-service-history", restaurantId, guestId, "page"],
    queryFn: () => fetchServices({ data: { restaurantId, guestId, limit: 50 } }),
    retry: false,
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading service history…</p>;
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Service history could not be loaded.</p>
      </div>
    );
  }
  if (!query.data?.available) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border bg-card p-6"
        data-testid="guest-services-page"
      >
        <h2 className="font-display text-xl">Services</h2>
        <p className="mt-2 text-sm text-muted-foreground">{OVERVIEW_SERVICE_UNAVAILABLE}</p>
      </div>
    );
  }
  if (query.data.items.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border bg-card p-6"
        data-testid="guest-services-page"
      >
        <h2 className="font-display text-xl">Services</h2>
        <p className="mt-2 text-sm text-muted-foreground">{OVERVIEW_SERVICE_EMPTY}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-services-page">
      <h2 className="font-display text-xl">Services</h2>
      <p className="text-sm text-muted-foreground">
        Recorded guest services for this property. Names come from Guest &amp; Services Settings.
      </p>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requested</th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{item.serviceName}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.status}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatStayDate(item.requestedAt.slice(0, 10))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
