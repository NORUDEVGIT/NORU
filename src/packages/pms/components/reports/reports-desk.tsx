import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { StatCard } from "@/packages/pms/components/bookings/reservation-bits";
import { FoundationPanel } from "@/packages/pms/components/pms/foundation-panel";
import { getCashieringDashboard } from "@/packages/pms/lib/cashiering.functions";
import { getHousekeepingDashboard } from "@/packages/pms/lib/housekeeping.functions";
import { listNightAuditRuns } from "@/packages/pms/lib/nightaudit.functions";
import { getBookingsDashboard } from "@/packages/pms/lib/reservations.functions";
import {
  filterReports,
  REPORTS_NIGHT_AUDIT_DISPLAY_LIMIT,
  REPORTS_NIGHT_AUDIT_SERVER_LIMIT,
  reportByCode,
  reportsReaderDate,
  type ReportCategory,
  type ReportCode,
  type ReportDefinition,
} from "@/packages/pms/lib/reports-shell";
import { useMoney } from "@/core/state/property-format";

export function ReportsDesk({
  restaurantId,
  businessDate,
  report,
  category,
  catalogueQuery,
  onOpenReport,
}: {
  restaurantId: string;
  businessDate: string;
  report: ReportCode | null;
  category: ReportCategory | null;
  catalogueQuery: string;
  onOpenReport: (code: ReportCode) => void;
}) {
  const readerDate = reportsReaderDate(businessDate);
  if (!report) {
    const rows = filterReports(catalogueQuery, category);
    return (
      <div className="space-y-3" data-testid="reports-center">
        <p className="text-sm text-muted-foreground">
          {category ? `${categoryLabel(category)} reports with a live reader.` : "Reports with a live reader."}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No report matches that search.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {rows.map((row) => (
              <li key={row.code}>
                <button
                  type="button"
                  data-testid={`reports-open-${row.code}`}
                  onClick={() => onOpenReport(row.code)}
                  className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="text-sm font-medium">{row.name}</span>
                  <span className="text-xs text-muted-foreground">{row.reader}</span>
                  <span className="text-xs text-muted-foreground">{row.caption}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const definition = reportByCode(report);
  if (!definition) return null;

  return (
    <div className="space-y-4" data-testid={`reports-report-${definition.code}`}>
      <p className="text-sm text-muted-foreground" data-testid={`reports-caption-${definition.code}`}>
        {definition.caption}
      </p>
      <OwnerLink definition={definition} />
      {definition.code === "operational" ? (
        <OperationalReport restaurantId={restaurantId} readerDate={readerDate} />
      ) : null}
      {definition.code === "financial" ? (
        <FinancialReport restaurantId={restaurantId} readerDate={readerDate} />
      ) : null}
      {definition.code === "rooms" ? (
        <RoomsReport restaurantId={restaurantId} readerDate={readerDate} />
      ) : null}
      {definition.code === "management" ? <ManagementReport restaurantId={restaurantId} /> : null}
    </div>
  );
}

function categoryLabel(category: ReportCategory): string {
  if (category === "operational") return "Operational";
  if (category === "financial") return "Financial";
  if (category === "rooms") return "Rooms";
  if (category === "revenue") return "Revenue";
  return "Management";
}

function OwnerLink({ definition }: { definition: ReportDefinition }) {
  if (definition.code === "financial") {
    return (
      <Link
        to="/restaurant/pms/cashiering"
        search={{ tab: "overview" }}
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        {definition.ownerLabel}
      </Link>
    );
  }
  if (definition.code === "management") {
    return (
      <Link
        to="/restaurant/pms/night-audit"
        search={{ tab: "history" }}
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        {definition.ownerLabel}
      </Link>
    );
  }
  return (
    <Link
      to={definition.ownerTo}
      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      {definition.ownerLabel}
    </Link>
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

function OperationalReport({ restaurantId, readerDate }: { restaurantId: string; readerDate: string }) {
  const fetchBookings = useServerFn(getBookingsDashboard);
  const bookings = useQuery({
    queryKey: ["pms-reports-bookings", restaurantId, readerDate],
    queryFn: () => fetchBookings({ data: { restaurantId, today: readerDate } }),
    retry: false,
  });
  if (bookings.isLoading) return <p className="text-sm text-muted-foreground">Loading reservation counts…</p>;
  if (bookings.isError) return <NoAccess what="reservation reporting" />;
  if (!bookings.data) return null;
  const data = bookings.data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Arrivals" value={data.arrivalsToday} hint="Pending and confirmed arriving on the house date" />
      <StatCard label="Departures" value={data.departuresToday} hint="Confirmed and checked-in departing on the house date" />
      <StatCard label="Staying" value={data.stayingToday} hint="Pending, confirmed, and checked-in overlapping the house date" />
      <StatCard label="Pending" value={data.pending} />
      <StatCard label="Upcoming" value={data.upcoming} />
      <StatCard
        label="Cancelled this month"
        value={data.cancelledThisMonth}
        hint="Cancelled stays whose arrival is on or after the first day of the house-date month. Not a no-show list."
      />
      <StatCard label="Sellable rooms" value={data.sellableRooms} hint="Active rooms with status available" />
      <StatCard
        label="Staying occupancy"
        value={`${data.occupancyPercent}%`}
        hint="Bookings dashboard percent. Not booked occupancy, ADR, or RevPAR."
      />
    </div>
  );
}

function FinancialReport({ restaurantId, readerDate }: { restaurantId: string; readerDate: string }) {
  const money = useMoney();
  const fetchCashiering = useServerFn(getCashieringDashboard);
  const cashiering = useQuery({
    queryKey: ["pms-reports-cashiering", restaurantId, readerDate],
    queryFn: () => fetchCashiering({ data: { restaurantId, today: readerDate } }),
    retry: false,
  });
  if (cashiering.isLoading) return <p className="text-sm text-muted-foreground">Loading folio activity…</p>;
  if (cashiering.isError) return <NoAccess what="cashiering reporting" />;
  if (!cashiering.data) return null;
  const data = cashiering.data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Open folios" value={data.openFolios} />
      <StatCard label="Outstanding balance" value={money(data.outstandingBalance)} hint="Sum of open folio amounts, all dates" />
      <StatCard label="Charges" value={money(data.todayCharges)} hint={`Property-timezone day of hotel business date ${data.businessDate}`} />
      <StatCard label="Payments" value={money(data.todayPayments)} hint={`Guest payments only, business date ${data.businessDate}`} />
      <StatCard label="Deposits" value={money(data.todayDeposits)} hint={`Guest deposits only, business date ${data.businessDate}`} />
      <StatCard label="Refunds" value={money(data.todayRefunds)} hint={`Property-timezone day of hotel business date ${data.businessDate}`} />
      <StatCard label="Open hotel drawers" value={data.openShifts} />
    </div>
  );
}

function RoomsReport({ restaurantId, readerDate }: { restaurantId: string; readerDate: string }) {
  const fetchHk = useServerFn(getHousekeepingDashboard);
  const hk = useQuery({
    queryKey: ["pms-reports-housekeeping", restaurantId, readerDate],
    queryFn: () => fetchHk({ data: { restaurantId, today: readerDate } }),
    retry: false,
  });
  if (hk.isLoading) return <p className="text-sm text-muted-foreground">Loading room status…</p>;
  if (hk.isError) return <NoAccess what="housekeeping reporting" />;
  if (!hk.data) return null;
  const data = hk.data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total rooms" value={data.totalRooms} />
      <StatCard label="Occupied" value={data.occupied} />
      <StatCard label="Vacant" value={data.vacant} />
      <StatCard label="Clean" value={data.clean} />
      <StatCard label="Inspected" value={data.inspected} />
      <StatCard label="Dirty" value={data.dirty} />
      <StatCard label="Open cleaning tasks" value={data.pendingCleaning} />
      <StatCard label="Out of order" value={data.outOfOrder} />
      <StatCard label="Out of service" value={data.outOfService} />
    </div>
  );
}

function ManagementReport({ restaurantId }: { restaurantId: string }) {
  const fetchRuns = useServerFn(listNightAuditRuns);
  const runs = useQuery({
    queryKey: ["pms-reports-night-audit", restaurantId],
    queryFn: () => fetchRuns({ data: { restaurantId } }),
    retry: false,
  });
  if (runs.isLoading) return <p className="text-sm text-muted-foreground">Loading night audit history…</p>;
  if (runs.isError) return <NoAccess what="night audit reporting" />;
  const rows = runs.data ?? [];
  if (rows.length === 0) {
    return (
      <FoundationPanel
        title="No night audit has been run yet"
        description="Once a business date is closed, its audit row will appear here."
      />
    );
  }
  const shown = rows.slice(0, REPORTS_NIGHT_AUDIT_DISPLAY_LIMIT);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Showing {shown.length} of {rows.length} loaded runs. The server returns at most {REPORTS_NIGHT_AUDIT_SERVER_LIMIT}.
      </p>
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
            {shown.map((run) => (
              <tr key={run.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">
                  <Link
                    to="/restaurant/pms/night-audit"
                    search={{ tab: "history", run: run.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {run.businessDate}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{run.status}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {run.closedAt ? new Date(run.closedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
