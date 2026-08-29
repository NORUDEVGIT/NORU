import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listShifts, type ShiftRecord } from "@/lib/workforce.functions";
import { formatClock, formatShiftTime, todayIso, wasLate } from "@/lib/workforce-rules";
import { cn } from "@/lib/utils";

/** Read-only attendance for today. No manual correction in this batch. */
export function AttendanceTab({ restaurantId, timezone }: { restaurantId: string; timezone: string }) {
  const today = todayIso(timezone);
  const fetchShifts = useServerFn(listShifts);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["workforce-shifts", restaurantId, today, today],
    queryFn: () => fetchShifts({ data: { restaurantId, from: today, to: today } }),
  });

  const shifts = (data?.shifts ?? []).filter((s) => s.status === "scheduled");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-xl">Attendance today</h2>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 size-4", isFetching && "animate-spin")} /> Refresh
        </Button>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading attendance…</p>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-destructive">We couldn't load attendance.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : shifts.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No attendance records yet.
        </p>
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Shift</th>
                  <th className="px-4 py-3 font-semibold">Check-in</th>
                  <th className="px-4 py-3 font-semibold">Check-out</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{shift.staffName ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{shift.role}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatShiftTime(shift.startTime)}–{formatShiftTime(shift.endTime)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatClock(shift.checkInAt, timezone)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatClock(shift.checkOutAt, timezone)}</td>
                    <td className="px-4 py-3">
                      <AttendanceState shift={shift} timezone={timezone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-3 lg:hidden">
            {shifts.map((shift) => (
              <div key={shift.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{shift.staffName ?? "—"}</p>
                    <p className="text-xs capitalize text-muted-foreground">{shift.role}</p>
                  </div>
                  <div className="ml-auto">
                    <AttendanceState shift={shift} timezone={timezone} />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Shift {formatShiftTime(shift.startTime)}–{formatShiftTime(shift.endTime)}
                </p>
                <p className="text-sm text-muted-foreground">
                  In {formatClock(shift.checkInAt, timezone)} · Out {formatClock(shift.checkOutAt, timezone)}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function AttendanceState({ shift, timezone }: { shift: ShiftRecord; timezone: string }) {
  const late = wasLate(shift.shiftDate, shift.startTime, shift.checkInAt, timezone);
  const label = !shift.checkInAt
    ? "Not checked in"
    : shift.checkOutAt
      ? "Completed"
      : "Checked in";

  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-xs font-semibold",
          !shift.checkInAt
            ? "bg-muted text-muted-foreground"
            : shift.checkOutAt
              ? "bg-primary/10 text-primary"
              : "bg-sky-500/15 text-sky-700 dark:text-sky-400",
        )}
      >
        {label}
      </span>
      {late ? (
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          Late
        </span>
      ) : null}
    </span>
  );
}
