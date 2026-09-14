import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import { StatCard, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  WAVE3_KPI_NOT_AVAILABLE,
  WAVE3_POSTED_FOLIO_LABEL,
  WAVE3_QUOTED_ROOM_TOTAL_LABEL,
} from "@/packages/pms/lib/guest-profile-wave3";
import { getGuestStayOverview } from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";

export function GuestDashboardCard({
  restaurantId,
  guestId,
  timezone,
}: {
  restaurantId: string;
  guestId: string;
  timezone: string;
}) {
  const money = useMoney();
  const today = propertyToday(timezone);
  const fetchOverview = useServerFn(getGuestStayOverview);
  const overviewQuery = useQuery({
    queryKey: ["guest-stay-overview", restaurantId, guestId],
    queryFn: () => fetchOverview({ data: { restaurantId, guestId } }),
    retry: false,
  });

  if (overviewQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  }
  if (overviewQuery.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-dashboard">
        <p className="font-display text-lg">Dashboard Overview</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Dashboard figures could not be loaded."}
        </p>
      </div>
    );
  }

  const overview = overviewQuery.data;
  if (!overview) return null;

  return (
    <div className="space-y-4" data-testid="guest-dashboard">
      <div>
        <h2 className="font-display text-lg">Dashboard Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures are derived from this guest&apos;s reservations. Amounts appear only when they
          are stored — missing revenue is not shown as zero.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div data-testid="guest-dashboard-kpi-stays">
          <StatCard label="Stays" value={overview.stayCount} hint="Reservation records for this guest" />
        </div>
        <div data-testid="guest-dashboard-kpi-nights">
          <StatCard
            label="Nights"
            value={overview.nightCount}
            hint="Sum of arrival to departure nights (same nightsBetween rule as Reservations)"
          />
        </div>
        <div data-testid="guest-dashboard-kpi-in-house">
          <StatCard label="In-house" value={overview.inHouseCount} />
        </div>
        <div data-testid="guest-dashboard-kpi-upcoming">
          <StatCard label="Upcoming" value={overview.upcomingCount} />
        </div>
        {overview.lastStay ? (
          <div data-testid="guest-dashboard-kpi-last-stay">
            <StatCard
              label="Last stay"
              value={overview.lastStay.confirmationNumber}
              hint={`${formatStayDate(overview.lastStay.arrivalDate)} → ${formatStayDate(overview.lastStay.departureDate)}`}
            />
          </div>
        ) : (
          <div data-testid="guest-dashboard-kpi-last-stay">
            <StatCard label="Last stay" value={WAVE3_KPI_NOT_AVAILABLE} hint="No checked-out reservation yet" />
          </div>
        )}
        {overview.roomTotal ? (
          <div data-testid="guest-dashboard-kpi-revenue">
            <StatCard
              label={WAVE3_QUOTED_ROOM_TOTAL_LABEL}
              value={money(overview.roomTotal.amount)}
              hint={
                overview.roomTotal.fromCount === overview.stayCount
                  ? "Quoted / priced room_subtotal — not posted revenue"
                  : `Quoted / priced room_subtotal from ${overview.roomTotal.fromCount} of ${overview.stayCount} stays — not posted revenue`
              }
            />
          </div>
        ) : (
          <div data-testid="guest-dashboard-kpi-revenue">
            <StatCard
              label={WAVE3_QUOTED_ROOM_TOTAL_LABEL}
              value={WAVE3_KPI_NOT_AVAILABLE}
              hint="No stored room_subtotal — not shown as 0.00"
            />
          </div>
        )}
        {overview.access.folio ? (
          overview.folioOutstanding ? (
            <div data-testid="guest-dashboard-kpi-folio">
              <StatCard
                label={WAVE3_POSTED_FOLIO_LABEL}
                value={money(overview.folioOutstanding.amount)}
                hint={`Posted folio totals from ${overview.folioOutstanding.fromCount} folio${overview.folioOutstanding.fromCount === 1 ? "" : "s"}`}
              />
            </div>
          ) : (
            <div data-testid="guest-dashboard-kpi-folio">
              <StatCard
                label={WAVE3_POSTED_FOLIO_LABEL}
                value={WAVE3_KPI_NOT_AVAILABLE}
                hint="No folio has been opened — not shown as 0.00 settled"
              />
            </div>
          )
        ) : (
          <div data-testid="guest-dashboard-kpi-folio">
            <StatCard
              label={WAVE3_POSTED_FOLIO_LABEL}
              value={WAVE3_KPI_NOT_AVAILABLE}
              hint="Folio amounts require cashiering access"
            />
          </div>
        )}
      </div>

      {overview.featuredStay ? (
        <div className="rounded-2xl border border-border bg-card p-5" data-testid="guest-dashboard-quick-actions">
          <p className="text-sm font-medium">
            {overview.featuredStay.status === "checked_in" ? "In-house stay" : "Upcoming stay"}{" "}
            {overview.featuredStay.confirmationNumber}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatStayDate(overview.featuredStay.arrivalDate)} →{" "}
            {formatStayDate(overview.featuredStay.departureDate)}
          </p>
          <div className="mt-3">
            <GuestStayActions stay={overview.featuredStay} access={overview.access} today={today} />
          </div>
        </div>
      ) : overview.stayCount === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="guest-dashboard-quick-actions">
          Quick actions appear when this guest has an in-house or upcoming reservation.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="guest-dashboard-quick-actions">
          No in-house or upcoming reservation to open. Stay History still lists every stored stay.
        </p>
      )}
    </div>
  );
}
