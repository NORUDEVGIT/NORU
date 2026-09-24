import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  WAVE3_DASHBOARD_CONTEXT,
  WAVE3_KPI_NOT_AVAILABLE,
} from "@/packages/pms/lib/guest-profile-wave3";
import {
  OVERVIEW_BALANCE_PLACEHOLDER,
  OVERVIEW_REVENUE_PLACEHOLDER,
} from "@/packages/pms/lib/guest-profile-overview";
import { getGuestStayOverview } from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";

export function GuestDashboardCard({
  restaurantId,
  guestId,
  guestName,
  timezone,
  vipStatus,
  showQuickActions = false,
}: {
  restaurantId: string;
  guestId: string;
  guestName: string;
  timezone: string;
  vipStatus: boolean;
  showQuickActions?: boolean;
}) {
  const today = propertyToday(timezone);
  const fetchOverview = useServerFn(getGuestStayOverview);
  const overviewQuery = useQuery({
    queryKey: ["guest-stay-overview", restaurantId, guestId],
    queryFn: () => fetchOverview({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const overview = overviewQuery.data;
  const stayCount = overview?.stayCount ?? 0;
  const nightCount = overview?.nightCount ?? 0;
  const upcomingCount = overview?.upcomingCount ?? 0;

  return (
    <div className="space-y-4" data-testid="guest-dashboard">
      <h2 className="sr-only" data-testid="guest-dashboard-guest-name">
        {guestName}
      </h2>
      <p className="sr-only" data-testid="guest-dashboard-context">
        {WAVE3_DASHBOARD_CONTEXT}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="grid min-w-[720px] grid-cols-5 divide-x divide-border">
          <SummaryItem
            label="Total stays"
            value={overviewQuery.isLoading ? "…" : stayCount}
            testId="guest-dashboard-kpi-stays"
          />
          <SummaryItem
            label="Total nights"
            value={overviewQuery.isLoading ? "…" : nightCount}
            testId="guest-dashboard-kpi-nights"
          />
          <SummaryItem
            label="Upcoming stays"
            value={overviewQuery.isLoading ? "…" : upcomingCount}
            testId="guest-dashboard-kpi-upcoming"
          />
          <SummaryItem
            label="Total revenue"
            value={OVERVIEW_REVENUE_PLACEHOLDER}
            testId="guest-dashboard-kpi-revenue"
          />
          <SummaryItem
            label="Outstanding balance"
            value={OVERVIEW_BALANCE_PLACEHOLDER}
            testId="guest-dashboard-kpi-outstanding"
          />
        </div>
      </div>
      <div className="sr-only">
        <span data-testid="guest-dashboard-kpi-last-stay">
          {overview?.lastStay
            ? formatStayDate(overview.lastStay.departureDate)
            : WAVE3_KPI_NOT_AVAILABLE}
        </span>
        <span data-testid="guest-dashboard-kpi-next-stay">
          {overview?.nextStay
            ? formatStayDate(overview.nextStay.arrivalDate)
            : WAVE3_KPI_NOT_AVAILABLE}
        </span>
        <span data-testid="guest-dashboard-kpi-vip">{vipStatus ? "VIP" : "Standard"}</span>
      </div>

      {showQuickActions && overview?.featuredStay ? (
        <div
          className="rounded-2xl border border-border bg-card p-5"
          data-testid="guest-dashboard-quick-actions"
        >
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
      ) : showQuickActions && stayCount === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="guest-dashboard-quick-actions">
          Quick actions appear when this guest has an in-house or upcoming reservation.
        </p>
      ) : showQuickActions ? (
        <p className="text-sm text-muted-foreground" data-testid="guest-dashboard-quick-actions">
          No in-house or upcoming reservation to open. Stay History still lists every stored stay.
        </p>
      ) : null}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId: string;
}) {
  return (
    <div className="px-4 py-3" data-testid={testId}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-lg leading-snug break-words">{value}</p>
    </div>
  );
}
