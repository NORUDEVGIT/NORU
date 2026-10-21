import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  BedDouble,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  DoorClosed,
  DoorOpen,
  FileCheck2,
  KeyRound,
  Percent,
  Plus,
  Receipt,
  Sparkles,
  Undo2,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { FoundationPanel } from "@/packages/pms/components/pms/foundation-panel";
import { getCashieringDashboard } from "@/packages/pms/lib/cashiering.functions";
import { getHousekeepingDashboard } from "@/packages/pms/lib/housekeeping.functions";
import { listNightAuditRuns } from "@/packages/pms/lib/nightaudit.functions";
import { getBookingsDashboard } from "@/packages/pms/lib/reservations.functions";
import {
  isAnalyticsReport,
  REPORTS_NIGHT_AUDIT_DISPLAY_LIMIT,
  REPORTS_NIGHT_AUDIT_SERVER_LIMIT,
  reportByCode,
  reportsReaderDate,
  type AnalyticsReportDefinition,
  type AnalyticsReportId,
} from "@/packages/pms/lib/reports-shell";
import { useMoney } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

type MetricTone = "blue" | "green" | "amber" | "gold" | "rose" | "teal" | "violet";

const METRIC_TONE_STYLES: Record<MetricTone, { card: string; icon: string; label: string }> = {
  blue: {
    card: "border-[#DDD4C5] bg-white hover:border-sky-300 hover:bg-sky-50/20",
    icon: "border-sky-200 bg-sky-50 text-sky-700",
    label: "text-sky-900",
  },
  green: {
    card: "border-[#DDD4C5] bg-white hover:border-emerald-300 hover:bg-emerald-50/20",
    icon: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "text-emerald-900",
  },
  amber: {
    card: "border-[#DDD4C5] bg-white hover:border-amber-300 hover:bg-amber-50/20",
    icon: "border-amber-200 bg-amber-50 text-amber-800",
    label: "text-amber-900",
  },
  gold: {
    card: "border-[#DDD4C5] bg-white hover:border-[#C89933] hover:bg-[#FAF6EE]",
    icon: "border-[#E5D7B7] bg-[#FAF3E3] text-[#8A6A24]",
    label: "text-[#8A6A24]",
  },
  rose: {
    card: "border-[#DDD4C5] bg-white hover:border-rose-300 hover:bg-rose-50/20",
    icon: "border-rose-200 bg-rose-50 text-rose-700",
    label: "text-rose-900",
  },
  teal: {
    card: "border-[#DDD4C5] bg-white hover:border-teal-300 hover:bg-teal-50/20",
    icon: "border-teal-200 bg-teal-50 text-teal-700",
    label: "text-teal-900",
  },
  violet: {
    card: "border-[#DDD4C5] bg-white hover:border-violet-300 hover:bg-violet-50/20",
    icon: "border-violet-200 bg-violet-50 text-violet-700",
    label: "text-violet-900",
  },
};

function ReportMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "gold",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
}) {
  const styles = METRIC_TONE_STYLES[tone];
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
        styles.card,
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-[10px] font-semibold uppercase tracking-wider", styles.label)}>
            {label}
          </p>
          {Icon ? (
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg border shadow-2xs transition-transform duration-200 group-hover:scale-105",
                styles.icon,
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
          ) : null}
        </div>
        <p className="mt-2 font-display text-2xl font-bold tracking-tight text-[#251605]">
          {value}
        </p>
      </div>
      {hint ? (
        <p className="mt-2.5 text-[11px] leading-tight text-[#7A7167]">{hint}</p>
      ) : null}
    </div>
  );
}

export function ReportsDesk({
  restaurantId,
  businessDate,
  report,
}: {
  restaurantId: string;
  businessDate: string;
  report: AnalyticsReportId;
}) {
  const readerDate = reportsReaderDate(businessDate);
  const definition = reportByCode(report);
  if (!definition || !isAnalyticsReport(definition)) return null;

  return (
    <div className="space-y-4" data-testid={`reports-report-${definition.code}`}>
      {/* Overview Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-2xs">
        <p
          className="text-xs text-[#7A7167]"
          data-testid={`reports-caption-${definition.code}`}
        >
          {definition.caption}
        </p>
        <OwnerLink definition={definition} />
      </div>

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

function OwnerLink({ definition }: { definition: AnalyticsReportDefinition }) {
  const className =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-[#FAF8F4] px-2.5 py-1 text-xs font-semibold text-[#8A6A24] transition-colors hover:border-[#C89933] hover:bg-[#FAF3E3]";

  if (definition.code === "financial") {
    return (
      <Link to="/restaurant/pms/cashiering" search={{ tab: "overview" }} className={className}>
        <span>{definition.ownerLabel}</span>
        <ArrowUpRight className="size-3.5" />
      </Link>
    );
  }
  if (definition.code === "management") {
    return (
      <Link to="/restaurant/pms/night-audit" search={{ tab: "history" }} className={className}>
        <span>{definition.ownerLabel}</span>
        <ArrowUpRight className="size-3.5" />
      </Link>
    );
  }
  return (
    <Link to={definition.ownerTo} className={className}>
      <span>{definition.ownerLabel}</span>
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

function NoAccess({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-700">
          <AlertCircle className="size-5" />
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold text-[#251605]">Access Restricted</h4>
          <p className="mt-0.5 text-xs text-[#7A7167]">
            You don't have permission to access {what} for this property. Contact your administrator if
            you need this reporting entitlement.
          </p>
        </div>
      </div>
    </div>
  );
}

function OperationalReport({
  restaurantId,
  readerDate,
}: {
  restaurantId: string;
  readerDate: string;
}) {
  const fetchBookings = useServerFn(getBookingsDashboard);
  const bookings = useQuery({
    queryKey: ["pms-reports-bookings", restaurantId, readerDate],
    queryFn: () => fetchBookings({ data: { restaurantId, today: readerDate } }),
    retry: false,
  });

  if (bookings.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#DDD4C5] bg-white p-8">
        <p className="text-sm text-[#7A7167]">Loading reservation operational counts…</p>
      </div>
    );
  }
  if (bookings.isError) return <NoAccess what="reservation reporting" />;
  if (!bookings.data) return null;
  const data = bookings.data;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <ReportMetricCard
        label="Arrivals"
        value={data.arrivalsToday}
        hint="Pending and confirmed arriving on the house date"
        icon={DoorOpen}
        tone="blue"
      />
      <ReportMetricCard
        label="Departures"
        value={data.departuresToday}
        hint="Confirmed and checked-in departing on the house date"
        icon={DoorClosed}
        tone="amber"
      />
      <ReportMetricCard
        label="Staying"
        value={data.stayingToday}
        hint="Pending, confirmed, and checked-in overlapping the house date"
        icon={BedDouble}
        tone="green"
      />
      <ReportMetricCard
        label="Staying Occupancy"
        value={`${data.occupancyPercent}%`}
        hint="Staying count divided by available sellable rooms"
        icon={Percent}
        tone="gold"
      />
      <ReportMetricCard
        label="Pending Confirmation"
        value={data.pending}
        hint="Reservations awaiting front office confirmation"
        icon={Clock}
        tone="teal"
      />
      <ReportMetricCard
        label="Upcoming"
        value={data.upcoming}
        hint="Future arrivals scheduled on the reservation calendar"
        icon={CalendarDays}
        tone="blue"
      />
      <ReportMetricCard
        label="Sellable Rooms"
        value={data.sellableRooms}
        hint="Active rooms with status available"
        icon={KeyRound}
        tone="green"
      />
      <ReportMetricCard
        label="Cancelled This Month"
        value={data.cancelledThisMonth}
        hint="Cancelled stays whose arrival is on or after the first day of the house-date month. Not a no-show list."
        icon={Calendar}
        tone="rose"
      />
    </div>
  );
}

function FinancialReport({
  restaurantId,
  readerDate,
}: {
  restaurantId: string;
  readerDate: string;
}) {
  const money = useMoney();
  const fetchCashiering = useServerFn(getCashieringDashboard);
  const cashiering = useQuery({
    queryKey: ["pms-reports-cashiering", restaurantId, readerDate],
    queryFn: () => fetchCashiering({ data: { restaurantId, today: readerDate } }),
    retry: false,
  });

  if (cashiering.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#DDD4C5] bg-white p-8">
        <p className="text-sm text-[#7A7167]">Loading folio and payment activity…</p>
      </div>
    );
  }
  if (cashiering.isError) return <NoAccess what="cashiering reporting" />;
  if (!cashiering.data) return null;
  const data = cashiering.data;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ReportMetricCard
        label="Open Folios"
        value={data.openFolios}
        hint="Active unclosed folios currently on the cashier desk"
        icon={Wallet}
        tone="blue"
      />
      <ReportMetricCard
        label="Outstanding Balance"
        value={money(data.outstandingBalance)}
        hint="Sum of open folio amounts, all dates"
        icon={Receipt}
        tone="amber"
      />
      <ReportMetricCard
        label="Charges"
        value={money(data.todayCharges)}
        hint={`Property-timezone day of hotel business date ${data.businessDate}`}
        icon={Plus}
        tone="gold"
      />
      <ReportMetricCard
        label="Payments"
        value={money(data.todayPayments)}
        hint={`Guest payments only, business date ${data.businessDate}`}
        icon={Banknote}
        tone="green"
      />
      <ReportMetricCard
        label="Deposits"
        value={money(data.todayDeposits)}
        hint={`Guest deposits only, business date ${data.businessDate}`}
        icon={Coins}
        tone="teal"
      />
      <ReportMetricCard
        label="Refunds"
        value={money(data.todayRefunds)}
        hint={`Property-timezone day of hotel business date ${data.businessDate}`}
        icon={Undo2}
        tone="rose"
      />
      <ReportMetricCard
        label="Open Hotel Drawers"
        value={data.openShifts}
        hint="Active cashier shifts and drawer sessions currently open"
        icon={Sparkles}
        tone="violet"
      />
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

  if (hk.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#DDD4C5] bg-white p-8">
        <p className="text-sm text-[#7A7167]">Loading housekeeping inventory status…</p>
      </div>
    );
  }
  if (hk.isError) return <NoAccess what="housekeeping reporting" />;
  if (!hk.data) return null;
  const data = hk.data;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <ReportMetricCard
        label="Total Rooms"
        value={data.totalRooms}
        hint="Configured guest rooms across all floors and wings"
        icon={BedDouble}
        tone="blue"
      />
      <ReportMetricCard
        label="Occupied"
        value={data.occupied}
        hint="Rooms currently occupied by checked-in guests"
        icon={Users}
        tone="gold"
      />
      <ReportMetricCard
        label="Vacant"
        value={data.vacant}
        hint="Rooms ready for assignment and check-in"
        icon={CheckCircle2}
        tone="green"
      />
      <ReportMetricCard
        label="Clean"
        value={data.clean}
        hint="Housekeeping cleaned, awaiting final inspection"
        icon={Sparkles}
        tone="teal"
      />
      <ReportMetricCard
        label="Inspected"
        value={data.inspected}
        hint="Supervised and cleared for immediate guest check-in"
        icon={FileCheck2}
        tone="green"
      />
      <ReportMetricCard
        label="Dirty"
        value={data.dirty}
        hint="Rooms requiring housekeeping service or turnover"
        icon={Clock}
        tone="amber"
      />
      <ReportMetricCard
        label="Open Cleaning Tasks"
        value={data.pendingCleaning}
        hint="Active cleaning dispatches assigned to housekeeping staff"
        icon={CalendarCheck}
        tone="violet"
      />
      <ReportMetricCard
        label="Out of Order"
        value={data.outOfOrder}
        hint="Removed from inventory for maintenance or repair"
        icon={Wrench}
        tone="rose"
      />
      <ReportMetricCard
        label="Out of Service"
        value={data.outOfService}
        hint="Temporarily withheld for non-mechanical reasons"
        icon={AlertCircle}
        tone="rose"
      />
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

  if (runs.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#DDD4C5] bg-white p-8">
        <p className="text-sm text-[#7A7167]">Loading night audit history…</p>
      </div>
    );
  }
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#7A7167]">
          Showing {shown.length} of {rows.length} loaded runs. The server returns at most{" "}
          {REPORTS_NIGHT_AUDIT_SERVER_LIMIT}.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-2xs">
        <table className="w-full text-sm">
          <thead className="border-b border-[#DDD4C5] bg-[#FAF8F4] text-left text-xs font-semibold uppercase tracking-wider text-[#7A7167]">
            <tr>
              <th className="px-5 py-3.5">Business Date</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Closed At</th>
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2ECE3]">
            {shown.map((run) => (
              <tr key={run.id} className="transition-colors hover:bg-[#FAF8F4]">
                <td className="px-5 py-3.5 font-medium text-[#251605]">
                  <Link
                    to="/restaurant/pms/night-audit"
                    search={{ tab: "history", run: run.id }}
                    className="font-semibold text-[#8A6A24] transition-colors hover:text-[#5F4512] hover:underline"
                  >
                    {run.businessDate}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      run.status === "completed"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-amber-200 bg-amber-50 text-amber-700",
                    )}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-[#7A7167]">
                  {run.closedAt ? new Date(run.closedAt).toLocaleString() : "—"}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    to="/restaurant/pms/night-audit"
                    search={{ tab: "history", run: run.id }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A6A24] hover:underline"
                  >
                    <span>View Audit</span>
                    <ArrowUpRight className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
