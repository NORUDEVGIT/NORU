import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listStaff } from "@/lib/staff.functions";
import {
  cancelShift,
  createShift,
  listShiftTableAssignments,
  listShifts,
  type ShiftRecord,
} from "@/lib/workforce.functions";
import { addDaysIso, formatShiftTime, todayIso, wasLate } from "@/lib/workforce-rules";
import { cn } from "@/lib/utils";
import { AssignTablesDialog } from "./assign-tables-dialog";

/**
 * Schedule tab. Owners/managers get the full controls; kitchen/waiter get a
 * read-only "My schedule" — listShifts already re-scopes non-managers server-side.
 */
export function ScheduleTab({ restaurantId, canManage }: { restaurantId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const fetchShifts = useServerFn(listShifts);
  const fetchStaff = useServerFn(listStaff);
  const createFn = useServerFn(createShift);
  const cancelFn = useServerFn(cancelShift);

  const [date, setDate] = useState(todayIso());
  const [rangeDays, setRangeDays] = useState("0");
  const [staffMembershipId, setStaffMembershipId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [assignShift, setAssignShift] = useState<ShiftRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShiftRecord | null>(null);

  const from = date;
  const to = addDaysIso(date, Number(rangeDays));

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["workforce-shifts", restaurantId, from, to],
    queryFn: () => fetchShifts({ data: { restaurantId, from, to } }),
  });

  const { data: staffData } = useQuery({
    queryKey: ["restaurant-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["workforce-shifts", restaurantId] });

  const createMutation = useMutation({
    mutationFn: () => createFn({ data: { restaurantId, staffMembershipId, shiftDate: date, startTime, endTime } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Shift added.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (shiftId: string) => cancelFn({ data: { restaurantId, shiftId } }),
    onSuccess: (result) => {
      if (!("ok" in result) || !result.ok) {
        toast.error("message" in result ? result.message : "We couldn't cancel that shift.");
        return;
      }
      toast.success("Shift cancelled.");
      setCancelTarget(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignableStaff = (staffData?.staff ?? []).filter((s) => s.active);
  const shifts = data?.shifts ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-xl">{canManage ? "Schedule" : "My schedule"}</h2>
          <p className="text-sm text-muted-foreground">
            {canManage ? "Plan shifts and assign tables." : "Your upcoming shifts and assigned tables."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("mr-2 size-4", isFetching && "animate-spin")} /> Refresh
        </Button>
      </header>

      {canManage ? (
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="shift-date">Date</Label>
            <Input id="shift-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Staff member</Label>
            <Select value={staffMembershipId} onValueChange={setStaffMembershipId}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {assignableStaff.map((s) => (
                  <SelectItem key={s.membershipId} value={s.membershipId}>
                    {s.name ?? s.email ?? "Staff"} · {s.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-start">Start</Label>
            <Input id="shift-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-end">End</Label>
            <Input id="shift-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!staffMembershipId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Plus className="mr-2 size-4" /> Add shift
            </Button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
        {!canManage ? (
          <div className="space-y-1.5">
            <Label htmlFor="my-date" className="text-xs">
              From
            </Label>
            <Input id="my-date" type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        ) : null}
        <div className="flex gap-1">
          {[
            { value: "0", label: "This day" },
            { value: "6", label: "7 days" },
            { value: "29", label: "30 days" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRangeDays(option.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                rangeDays === option.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          {from} → {to}
        </p>
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the schedule…</p>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-destructive">We couldn't load the schedule.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : shifts.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No shifts scheduled for this date.
        </p>
      ) : (
        <ul className="space-y-3">
          {shifts.map((shift) => (
            <ShiftRow
              key={shift.id}
              restaurantId={restaurantId}
              shift={shift}
              canManage={canManage}
              onAssign={() => setAssignShift(shift)}
              onCancel={() => setCancelTarget(shift)}
            />
          ))}
        </ul>
      )}

      <AssignTablesDialog restaurantId={restaurantId} shift={assignShift} onClose={() => setAssignShift(null)} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `${cancelTarget.staffName ?? "Staff"} · ${cancelTarget.shiftDate} · ${formatShiftTime(cancelTarget.startTime)}–${formatShiftTime(cancelTarget.endTime)}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep shift</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}>
              Cancel shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShiftRow({
  restaurantId,
  shift,
  canManage,
  onAssign,
  onCancel,
}: {
  restaurantId: string;
  shift: ShiftRecord;
  canManage: boolean;
  onAssign: () => void;
  onCancel: () => void;
}) {
  const fetchAssignments = useServerFn(listShiftTableAssignments);
  const { data: assignments } = useQuery({
    queryKey: ["workforce-shift-tables", restaurantId, shift.id],
    queryFn: () => fetchAssignments({ data: { restaurantId, shiftId: shift.id } }),
  });

  const tables = (assignments ?? []).map((a) => a.tableLabel).join(", ");
  const late = wasLate(shift.shiftDate, shift.startTime, shift.checkInAt);

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {shift.staffName ?? "Staff"}{" "}
            <span className="text-xs capitalize text-muted-foreground">· {shift.role}</span>
            {shift.isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {shift.shiftDate} · {formatShiftTime(shift.startTime)}–{formatShiftTime(shift.endTime)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{tables ? `Tables ${tables}` : "No tables assigned"}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {late ? (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
              Late
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
              shift.status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
            )}
          >
            {shift.status}
          </span>
        </div>
      </div>

      {canManage && shift.status !== "cancelled" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onAssign}>
            Assign tables
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onCancel}>
            Cancel shift
          </Button>
        </div>
      ) : null}
    </li>
  );
}
