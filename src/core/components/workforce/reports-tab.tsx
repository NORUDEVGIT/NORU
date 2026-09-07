import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { getStaffAttendanceSummary } from "@/core/lib/workforce.functions";
import { addDaysIso, todayIso } from "@/core/lib/workforce-rules";
import { cn } from "@/shared/lib/utils";

type Preset = "today" | "7" | "30" | "custom";

/** Owner/manager attendance summary. No charts, no payroll. */
export function ReportsTab({ restaurantId, timezone }: { restaurantId: string; timezone: string }) {
  const today = todayIso(timezone);
  const [preset, setPreset] = useState<Preset>("7");
  const [customFrom, setCustomFrom] = useState(addDaysIso(today, -6));
  const [customTo, setCustomTo] = useState(today);

  const from =
    preset === "today" ? today : preset === "custom" ? customFrom : addDaysIso(today, preset === "7" ? -6 : -29);
  const to = preset === "custom" ? customTo : today;

  const fetchSummary = useServerFn(getStaffAttendanceSummary);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["workforce-summary", restaurantId, from, to],
    queryFn: () => fetchSummary({ data: { restaurantId, from, to } }),
  });

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-xl">Attendance reports</h2>
          <p className="text-sm text-muted-foreground">
            {from} → {to}
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 size-4", isFetching && "animate-spin")} /> Refresh
        </Button>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex gap-1">
          {(
            [
              { value: "today", label: "Today" },
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "custom", label: "Custom" },
            ] as { value: Preset; label: string }[]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreset(option.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                preset === option.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="report-from" className="text-xs">
                From
              </Label>
              <Input
                id="report-from"
                type="date"
                className="h-9"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to" className="text-xs">
                To
              </Label>
              <Input
                id="report-to"
                type="date"
                className="h-9"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Building the report…</p>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-destructive">We couldn't build the report.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No staff activity for this period.
        </p>
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Staff</th>
                  <th className="px-4 py-3 font-semibold">Scheduled</th>
                  <th className="px-4 py-3 font-semibold">Completed</th>
                  <th className="px-4 py-3 font-semibold">Late</th>
                  <th className="px-4 py-3 font-semibold">Missed</th>
                  <th className="px-4 py-3 font-semibold">Missing checkout</th>
                  <th className="px-4 py-3 font-semibold">Scheduled hrs</th>
                  <th className="px-4 py-3 font-semibold">Worked hrs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.staffMembershipId} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      {row.staffName ?? "—"}
                      <span className="ml-2 text-xs capitalize text-muted-foreground">{row.role}</span>
                    </td>
                    <td className="px-4 py-3">{row.scheduledShifts}</td>
                    <td className="px-4 py-3">{row.completedShifts}</td>
                    <td className="px-4 py-3">{row.lateShifts}</td>
                    <td className="px-4 py-3">{row.missedShifts}</td>
                    <td className="px-4 py-3">{row.missingCheckout}</td>
                    <td className="px-4 py-3">{row.scheduledHours}</td>
                    <td className="px-4 py-3">{row.workedHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <div key={row.staffMembershipId} className="rounded-2xl border border-border bg-card p-4">
                <p className="font-medium">
                  {row.staffName ?? "—"} <span className="text-xs capitalize text-muted-foreground">· {row.role}</span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Scheduled" value={row.scheduledShifts} />
                  <Stat label="Completed" value={row.completedShifts} />
                  <Stat label="Late" value={row.lateShifts} />
                  <Stat label="Missed" value={row.missedShifts} />
                  <Stat label="Missing checkout" value={row.missingCheckout} />
                  <Stat label="Scheduled hrs" value={row.scheduledHours} />
                  <Stat label="Worked hrs" value={row.workedHours} />
                </dl>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
