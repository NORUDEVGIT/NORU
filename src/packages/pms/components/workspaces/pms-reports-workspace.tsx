/**
 * Phase 7D.2F2 — PMS Reports & Analytics.
 *
 * Hotel/PMS reporting only. No Food & Beverage, warehouse, procurement or
 * workforce reporting is presented here; those domains own their own reports
 * and can later feed shared executive reporting. Every figure comes from an
 * existing PMS query — nothing is invented and no reporting tables are added.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { StatCard } from "@/packages/pms/components/bookings/reservation-bits";
import { RevenueOverviewTab } from "@/packages/pms/components/rates/rates-tabs";
import { FoundationPanel } from "@/packages/pms/components/pms/foundation-panel";
import { getBookingsDashboard } from "@/packages/pms/lib/reservations.functions";
import { getHousekeepingDashboard } from "@/packages/pms/lib/housekeeping.functions";
import { getCashieringDashboard } from "@/packages/pms/lib/cashiering.functions";
import { listNightAuditRuns } from "@/packages/pms/lib/nightaudit.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney } from "@/core/state/restaurant-context";
import { PageHeading } from "@/core/state/pms-context";

export function PmsReportsWorkspace({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const today = propertyToday(membership.restaurant.timezone);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Reports & Analytics" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Hotel reporting for {membership.restaurant.name}: rooms, reservations, housekeeping and
          PMS-generated finance. Restaurant, stock, purchasing and workforce reporting stay in their
          own modules.
        </p>
      </div>

      <Tabs defaultValue="operational">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="operational">Operational</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="operational" className="mt-6">
          <OperationalReports restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="financial" className="mt-6">
          <FinancialReports restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="occupancy" className="mt-6">
          <OccupancyReports restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="revenue" className="mt-6">
          <RevenueOverviewTab restaurantId={restaurantId} today={today} />
        </TabsContent>
        <TabsContent value="management" className="mt-6">
          <ManagementReports restaurantId={restaurantId} today={today} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------------------------------------------- helpers */

function useBookings(restaurantId: string, today: string) {
  const fetchBookings = useServerFn(getBookingsDashboard);
  return useQuery({
    queryKey: ["pms-reports-bookings", restaurantId, today],
    queryFn: () => fetchBookings({ data: { restaurantId, today } }),
    retry: false,
  });
}

function useHousekeeping(restaurantId: string, today: string) {
  const fetchHk = useServerFn(getHousekeepingDashboard);
  return useQuery({
    queryKey: ["pms-reports-housekeeping", restaurantId, today],
    queryFn: () => fetchHk({ data: { restaurantId, today } }),
    retry: false,
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NoAccess({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        You don't have access to {what} for this property, so these figures aren't shown.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- operational */

function OperationalReports({ restaurantId, today }: { restaurantId: string; today: string }) {
  const bookings = useBookings(restaurantId, today);
  const hk = useHousekeeping(restaurantId, today);

  return (
    <div className="space-y-6">
      <Section title="Arrivals, departures and in-house">
        {bookings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading front office activity…</p>
        ) : bookings.isError ? (
          <NoAccess what="reservation reporting" />
        ) : bookings.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Arrivals today" value={bookings.data.arrivalsToday} />
            <StatCard label="Departures today" value={bookings.data.departuresToday} />
            <StatCard label="In house" value={bookings.data.stayingToday} />
            <StatCard label="Pending reservations" value={bookings.data.pending} />
          </div>
        ) : null}
      </Section>

      <Section title="Room readiness and housekeeping">
        {hk.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading room readiness…</p>
        ) : hk.isError ? (
          <NoAccess what="housekeeping reporting" />
        ) : hk.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Clean" value={hk.data.clean} />
            <StatCard label="Inspected" value={hk.data.inspected} />
            <StatCard label="Dirty" value={hk.data.dirty} />
            <StatCard label="Open cleaning tasks" value={hk.data.pendingCleaning} />
            <StatCard label="Out of order" value={hk.data.outOfOrder} />
            <StatCard label="Out of service" value={hk.data.outOfService} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}

/* --------------------------------------------------------------- financial */

function FinancialReports({ restaurantId, today }: { restaurantId: string; today: string }) {
  const money = useMoney();
  const fetchCashiering = useServerFn(getCashieringDashboard);
  const cashiering = useQuery({
    queryKey: ["pms-reports-cashiering", restaurantId, today],
    queryFn: () => fetchCashiering({ data: { restaurantId, today } }),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Finance generated by hotel operations: guest folios, payments, deposits, refunds and cashier
        shifts. Property-wide accounting is a separate back-office domain.
      </p>

      <Section title="Folios and payments">
        {cashiering.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading folio activity…</p>
        ) : cashiering.isError ? (
          <NoAccess what="cashiering reporting" />
        ) : cashiering.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Open folios" value={cashiering.data.openFolios} />
            <StatCard
              label="Outstanding balance"
              value={money(cashiering.data.outstandingBalance)}
              hint="Across open folios"
            />
            <StatCard label="Charges today" value={money(cashiering.data.todayCharges)} />
            <StatCard label="Payments today" value={money(cashiering.data.todayPayments)} />
            <StatCard label="Deposits today" value={money(cashiering.data.todayDeposits)} />
            <StatCard label="Refunds today" value={money(cashiering.data.todayRefunds)} />
          </div>
        ) : null}
      </Section>

      <Section title="Cashier shifts">
        {cashiering.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Open shifts" value={cashiering.data.openShifts} />
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Shift-by-shift totals are available in{" "}
          <Link
            to="/restaurant/pms/cashiering"
            search={{ tab: "shifts" }}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Cashiering
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

/* --------------------------------------------------------------- occupancy */

function OccupancyReports({ restaurantId, today }: { restaurantId: string; today: string }) {
  const bookings = useBookings(restaurantId, today);
  const hk = useHousekeeping(restaurantId, today);

  return (
    <div className="space-y-6">
      <Section title="Today">
        {bookings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading occupancy…</p>
        ) : bookings.isError ? (
          <NoAccess what="reservation reporting" />
        ) : bookings.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Occupancy"
              value={`${bookings.data.occupancyPercent}%`}
              hint="In-house stays ÷ sellable rooms"
            />
            <StatCard label="Rooms sellable" value={bookings.data.sellableRooms} />
            <StatCard label="In house" value={bookings.data.stayingToday} />
          </div>
        ) : null}
      </Section>

      <Section title="Room status">
        {hk.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total rooms" value={hk.data.totalRooms} />
            <StatCard label="Occupied" value={hk.data.occupied} />
            <StatCard label="Vacant" value={hk.data.vacant} />
            <StatCard label="Unavailable" value={hk.data.outOfOrder + hk.data.outOfService} />
          </div>
        ) : hk.isError ? (
          <NoAccess what="housekeeping reporting" />
        ) : (
          <p className="text-sm text-muted-foreground">Loading room status…</p>
        )}
      </Section>

      <p className="text-sm text-muted-foreground">
        Occupancy over a date range, with ADR and RevPAR, is on the Revenue tab.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- management */

function ManagementReports({ restaurantId, today }: { restaurantId: string; today: string }) {
  const bookings = useBookings(restaurantId, today);
  const fetchRuns = useServerFn(listNightAuditRuns);
  const runs = useQuery({
    queryKey: ["pms-reports-night-audit", restaurantId],
    queryFn: () => fetchRuns({ data: { restaurantId } }),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <Section title="Reservation activity">
        {bookings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading reservation activity…</p>
        ) : bookings.isError ? (
          <NoAccess what="reservation reporting" />
        ) : bookings.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pending" value={bookings.data.pending} />
            <StatCard label="Upcoming" value={bookings.data.upcoming} />
            <StatCard label="Cancelled this month" value={bookings.data.cancelledThisMonth} />
            <StatCard
              label="Occupancy today"
              value={`${bookings.data.occupancyPercent}%`}
            />
          </div>
        ) : null}
      </Section>

      <Section title="Recent night audits">
        {runs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading night audit history…</p>
        ) : runs.isError ? (
          <NoAccess what="night audit reporting" />
        ) : (runs.data?.length ?? 0) === 0 ? (
          <FoundationPanel
            title="No night audit has been run yet"
            description="Once a business date is closed, its audit summary will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Business date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Closed</th>
                </tr>
              </thead>
              <tbody>
                {(runs.data ?? []).slice(0, 10).map((run) => (
                  <tr key={run.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{run.businessDate}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{run.status}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {run.closedAt ? new Date(run.closedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
