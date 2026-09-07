import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, LogIn, LogOut } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  checkIn as checkInFn,
  checkOut as checkOutFn,
  listShiftTableAssignments,
  listShifts,
  type ShiftRecord,
} from "@/lib/workforce.functions";
import { formatClock, formatShiftTime, todayIso, wasLate } from "@/lib/workforce-rules";

/**
 * "My Shift" — visible to any active staff member (all roles) with a shift today.
 * Uses only the existing checkIn/checkOut server functions.
 */
export function MyShiftCard({ restaurantId, timezone }: { restaurantId: string; timezone: string }) {
  const today = todayIso(timezone);
  const queryClient = useQueryClient();
  const fetchShifts = useServerFn(listShifts);
  const fetchAssignments = useServerFn(listShiftTableAssignments);
  const doCheckIn = useServerFn(checkInFn);
  const doCheckOut = useServerFn(checkOutFn);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workforce-my-shift", restaurantId, today],
    queryFn: () => fetchShifts({ data: { restaurantId, from: today, to: today } }),
  });

  const shift: ShiftRecord | undefined = (data?.shifts ?? []).find((s) => s.isSelf && s.status === "scheduled");

  const { data: assignments } = useQuery({
    queryKey: ["workforce-shift-tables", restaurantId, shift?.id],
    queryFn: () => fetchAssignments({ data: { restaurantId, shiftId: shift!.id } }),
    enabled: !!shift,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["workforce-my-shift", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["workforce-shifts", restaurantId] });
  };

  const checkInMutation = useMutation({
    mutationFn: () => doCheckIn({ data: { restaurantId, shiftId: shift!.id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Checked in.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => doCheckOut({ data: { restaurantId, shiftId: shift!.id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Checked out — ${result.workedHours}h worked.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading your shift…</div>;
  }
  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-destructive">We couldn't load your shift.</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!shift) return null;

  const late = wasLate(shift.shiftDate, shift.startTime, shift.checkInAt, timezone);
  const tables = (assignments ?? []).map((a) => a.tableLabel).join(", ");

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">My shift today</p>
          <p className="mt-1 font-display text-xl">
            {shift.staffName ?? "You"} <span className="text-sm capitalize text-muted-foreground">· {shift.role}</span>
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" />
            {formatShiftTime(shift.startTime)}–{formatShiftTime(shift.endTime)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{tables ? `Tables ${tables}` : "No tables assigned"}</p>
        </div>
        {late ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            Late
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {!shift.checkInAt ? (
          <Button
            className="h-12 w-full text-base sm:w-auto sm:px-8"
            disabled={checkInMutation.isPending}
            onClick={() => checkInMutation.mutate()}
          >
            <LogIn className="mr-2 size-5" /> Check in
          </Button>
        ) : !shift.checkOutAt ? (
          <>
            <p className="text-sm">Checked in at {formatClock(shift.checkInAt, timezone)}</p>
            <Button
              variant="outline"
              className="h-12 w-full text-base sm:w-auto sm:px-8"
              disabled={checkOutMutation.isPending}
              onClick={() => checkOutMutation.mutate()}
            >
              <LogOut className="mr-2 size-5" /> Check out
            </Button>
          </>
        ) : (
          <p className="text-sm font-medium">
            Completed · {formatClock(shift.checkInAt, timezone)}–{formatClock(shift.checkOutAt, timezone)}
          </p>
        )}
      </div>
    </section>
  );
}
