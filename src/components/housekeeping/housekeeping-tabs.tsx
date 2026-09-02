/**
 * Phase 6F — Housekeeping workspace tab content.
 *
 * Presentation only: every mutation goes through the tenant-scoped server
 * functions, which re-derive the caller's owner/manager membership.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  completeHousekeepingTask,
  createDiscrepancy,
  createHousekeepingTask,
  createMaintenanceRequest,
  getHousekeepingDashboard,
  inspectRoom,
  listDiscrepancies,
  listHousekeepingHistory,
  listHousekeepingStaff,
  listHousekeepingTasks,
  listInspections,
  listMaintenanceRequests,
  listRoomRack,
  resolveDiscrepancy,
  setRoomRestriction,
  updateHousekeepingTask,
  updateMaintenanceRequest,
  type RackRoom,
} from "@/lib/housekeeping.functions";
import {
  HkStatusBadge,
  PriorityBadge,
  RestrictionBadge,
  TaskStatusBadge,
  formatWhen,
  labelTaskType,
} from "./housekeeping-bits";

type Props = { restaurantId: string; today: string };

function useInvalidateHousekeeping(restaurantId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "hk-dashboard",
      "hk-rack",
      "hk-tasks",
      "hk-inspections",
      "hk-discrepancies",
      "hk-maintenance",
      "hk-history",
    ]) {
      void qc.invalidateQueries({ queryKey: [key, restaurantId] });
    }
  };
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/* --------------------------------------------------------------- dashboard */

export function HousekeepingDashboardTab({ restaurantId, today }: Props) {
  const fetch = useServerFn(getHousekeepingDashboard);
  const q = useQuery({
    queryKey: ["hk-dashboard", restaurantId, today],
    queryFn: () => fetch({ data: { restaurantId, today } }),
  });

  const stats: Array<[string, number | undefined]> = [
    ["Total rooms", q.data?.totalRooms],
    ["Occupied", q.data?.occupied],
    ["Vacant", q.data?.vacant],
    ["Dirty", q.data?.dirty],
    ["Clean", q.data?.clean],
    ["Inspected", q.data?.inspected],
    ["Out of order", q.data?.outOfOrder],
    ["Out of service", q.data?.outOfService],
    ["Pending cleaning", q.data?.pendingCleaning],
    ["Pending inspection", q.data?.pendingInspection],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Business date {today}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl">{q.isLoading ? "—" : (value ?? 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- room rack */

export function RoomRackTab({ restaurantId }: Props) {
  const fetch = useServerFn(listRoomRack);
  const q = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetch({ data: { restaurantId } }),
  });
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [occ, setOcc] = useState("all");
  const [hk, setHk] = useState("all");
  const [restriction, setRestriction] = useState("all");
  const [taskRoom, setTaskRoom] = useState<RackRoom | null>(null);

  const rooms = q.data ?? [];
  const floors = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor).filter(Boolean) as string[])).sort(),
    [rooms],
  );
  const types = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.roomTypeName))).sort(),
    [rooms],
  );

  const filtered = rooms.filter(
    (r) =>
      (floor === "all" || r.floor === floor) &&
      (type === "all" || r.roomTypeName === type) &&
      (occ === "all" || r.occupancy === occ) &&
      (hk === "all" || r.housekeepingStatus === hk) &&
      (restriction === "all" || r.restriction === restriction),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect value={floor} onChange={setFloor} placeholder="Floor" options={floors} allLabel="All floors" />
        <FilterSelect value={type} onChange={setType} placeholder="Room type" options={types} allLabel="All types" />
        <FilterSelect
          value={occ}
          onChange={setOcc}
          placeholder="Occupancy"
          options={["vacant", "occupied"]}
          allLabel="All occupancy"
        />
        <FilterSelect
          value={hk}
          onChange={setHk}
          placeholder="HK status"
          options={["dirty", "clean", "inspected", "pickup"]}
          allLabel="All HK statuses"
        />
        <FilterSelect
          value={restriction}
          onChange={setRestriction}
          placeholder="Restriction"
          options={["available", "out_of_order", "out_of_service"]}
          allLabel="All restrictions"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Type</th>
              <th className="p-3">Floor</th>
              <th className="p-3">Guest</th>
              <th className="p-3">Occupancy</th>
              <th className="p-3">HK status</th>
              <th className="p-3">Restriction</th>
              <th className="p-3">Attendant</th>
              <th className="p-3">Ready</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td colSpan={10} className="p-4 text-muted-foreground">
                  Loading rooms…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-muted-foreground">
                  No rooms match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-medium">{r.roomNumber}</td>
                  <td className="p-3">{r.roomTypeName}</td>
                  <td className="p-3">{r.floor ?? "—"}</td>
                  <td className="p-3">{r.guestName ?? "—"}</td>
                  <td className="p-3 capitalize">{r.occupancy}</td>
                  <td className="p-3">
                    <HkStatusBadge status={r.housekeepingStatus} />
                  </td>
                  <td className="p-3">
                    <RestrictionBadge status={r.restriction} />
                  </td>
                  <td className="p-3">{r.assignedAttendant ?? "—"}</td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        r.ready
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.ready ? "Ready" : "Not ready"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setTaskRoom(r)}>
                      New task
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewTaskDialog
        restaurantId={restaurantId}
        room={taskRoom}
        onClose={() => setTaskRoom(null)}
        onDone={invalidate}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="capitalize">
            {o.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NewTaskDialog({
  restaurantId,
  room,
  onClose,
  onDone,
}: {
  restaurantId: string;
  room: RackRoom | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const create = useServerFn(createHousekeepingTask);
  const [taskType, setTaskType] = useState("departure_cleaning");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          restaurantId,
          roomId: room!.id,
          taskType: taskType as never,
          priority: priority as never,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success("Cleaning task ready for this room.");
      onDone();
      onClose();
      setNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <Dialog open={room !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New housekeeping task</DialogTitle>
          <DialogDescription>Room {room?.roomNumber}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Task type</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["departure_cleaning", "stayover_cleaning", "touch_up", "deep_cleaning", "re_clean"].map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {labelTaskType(t)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["normal", "high", "urgent"].map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">
            A room can only have one open cleaning task; if one already exists it stays as-is.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- cleaning board */

export function CleaningBoardTab({ restaurantId, today }: Props) {
  const fetchTasks = useServerFn(listHousekeepingTasks);
  const fetchStaff = useServerFn(listHousekeepingStaff);
  const assignFn = useServerFn(updateHousekeepingTask);
  const completeFn = useServerFn(completeHousekeepingTask);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const tasks = useQuery({
    queryKey: ["hk-tasks", restaurantId, today],
    queryFn: () => fetchTasks({ data: { restaurantId, today } }),
  });
  const staff = useQuery({
    queryKey: ["hk-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
  });

  const [assignTask, setAssignTask] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");

  const act = useMutation({
    mutationFn: (vars: { taskId: string; action: "assign" | "start" | "cancel"; assigneeMembershipId?: string }) =>
      assignFn({
        data: {
          restaurantId,
          taskId: vars.taskId,
          action: vars.action,
          assigneeMembershipId: vars.assigneeMembershipId ?? null,
        },
      }),
    onSuccess: () => {
      invalidate();
      setAssignTask(null);
    },
    onError: (e) => toast.error(errText(e)),
  });

  const complete = useMutation({
    mutationFn: (taskId: string) => completeFn({ data: { restaurantId, taskId } }),
    onSuccess: () => {
      toast.success("Cleaning completed — room is now clean and awaiting inspection.");
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const all = tasks.data ?? [];
  const todayStr = today;
  const columns: Array<[string, typeof all]> = [
    ["Pending", all.filter((t) => t.status === "pending")],
    ["Assigned", all.filter((t) => t.status === "assigned")],
    ["In progress", all.filter((t) => t.status === "in_progress")],
    [
      "Completed today",
      all.filter((t) => t.status === "completed" && (t.completedAt ?? "").slice(0, 10) === todayStr),
    ],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        {columns.map(([title, list]) => (
          <div key={title} className="space-y-3">
            <h3 className="font-display text-lg">
              {title} <span className="text-sm text-muted-foreground">({list.length})</span>
            </h3>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                Nothing here.
              </p>
            ) : (
              list.map((t) => (
                <div key={t.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">Room {t.roomNumber}</p>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {labelTaskType(t.taskType)} · {t.roomTypeName}
                  </p>
                  <div className="flex items-center gap-2">
                    <TaskStatusBadge status={t.status} />
                    <span className="text-xs text-muted-foreground">{t.assignedName ?? "Unassigned"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {formatWhen(t.createdAt)}
                    {t.startedAt ? ` · Started ${formatWhen(t.startedAt)}` : ""}
                    {t.completedAt ? ` · Completed ${formatWhen(t.completedAt)}` : ""}
                  </p>
                  {t.status !== "completed" && t.status !== "cancelled" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setAssignTask(t.id)}>
                        Assign
                      </Button>
                      {t.status !== "in_progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act.mutate({ taskId: t.id, action: "start" })}
                        >
                          Start
                        </Button>
                      )}
                      <Button size="sm" onClick={() => complete.mutate(t.id)} disabled={complete.isPending}>
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act.mutate({ taskId: t.id, action: "cancel" })}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <Dialog open={assignTask !== null} onOpenChange={(open) => !open && setAssignTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign task</DialogTitle>
            <DialogDescription>Pick an active staff member for this cleaning task.</DialogDescription>
          </DialogHeader>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff member" />
            </SelectTrigger>
            <SelectContent>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.membershipId} value={s.membershipId}>
                  {s.name} · {s.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTask(null)}>
              Cancel
            </Button>
            <Button
              disabled={!assignee || act.isPending}
              onClick={() =>
                act.mutate({ taskId: assignTask!, action: "assign", assigneeMembershipId: assignee })
              }
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------- inspections */

export function InspectionsTab({ restaurantId }: Props) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchInspections = useServerFn(listInspections);
  const inspectFn = useServerFn(inspectRoom);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetchRack({ data: { restaurantId } }),
  });
  const inspections = useQuery({
    queryKey: ["hk-inspections", restaurantId],
    queryFn: () => fetchInspections({ data: { restaurantId } }),
  });

  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<{ room: RackRoom; result: "passed" | "failed" } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      inspectFn({
        data: {
          restaurantId,
          roomId: target!.room.id,
          taskId: null,
          result: target!.result,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success(
        target?.result === "passed"
          ? "Inspection passed — room is inspected."
          : "Inspection failed — room is dirty and a re-clean task is open.",
      );
      invalidate();
      setTarget(null);
      setNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const awaiting = (rack.data ?? []).filter((r) => r.housekeepingStatus === "clean");

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-lg">Awaiting inspection ({awaiting.length})</h3>
        {awaiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cleaned rooms are waiting for inspection.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {awaiting.map((r) => (
              <div key={r.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <p className="font-medium">Room {r.roomNumber}</p>
                <p className="text-sm text-muted-foreground">{r.roomTypeName}</p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => setTarget({ room: r, result: "passed" })}>
                    Pass
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTarget({ room: r, result: "failed" })}>
                    Fail
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg">Recent inspections</h3>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Room</th>
                <th className="p-3">Result</th>
                <th className="p-3">Inspector</th>
                <th className="p-3">Notes</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {(inspections.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">
                    No inspections yet.
                  </td>
                </tr>
              ) : (
                (inspections.data ?? []).map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="p-3 font-medium">{i.roomNumber}</td>
                    <td className="p-3 capitalize">{i.status}</td>
                    <td className="p-3">{i.inspectorName ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{i.notes ?? "—"}</td>
                    <td className="p-3">{formatWhen(i.completedAt ?? i.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.result === "passed" ? "Pass inspection" : "Fail inspection"}
            </DialogTitle>
            <DialogDescription>Room {target?.room.roomNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------- restrictions */

export function RestrictionsTab({ restaurantId }: Props) {
  const fetchRack = useServerFn(listRoomRack);
  const setFn = useServerFn(setRoomRestriction);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetchRack({ data: { restaurantId } }),
  });

  const [target, setTarget] = useState<RackRoom | null>(null);
  const [status, setStatus] = useState("out_of_order");
  const [reason, setReason] = useState("");
  const [expected, setExpected] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          restaurantId,
          roomId: target!.id,
          status: status as never,
          reason,
          expectedReturn: expected === "" ? null : expected,
        },
      }),
    onSuccess: () => {
      toast.success("Room restriction updated.");
      invalidate();
      setTarget(null);
      setReason("");
      setExpected("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Restriction</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Expected return</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rack.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.roomNumber}</td>
                <td className="p-3">
                  <RestrictionBadge status={r.restriction} />
                </td>
                <td className="p-3 text-muted-foreground">{r.restrictionReason ?? "—"}</td>
                <td className="p-3">{r.restrictionExpectedReturn ?? "—"}</td>
                <td className="p-3 text-right">
                  {r.restriction === "available" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget(r);
                        setStatus("out_of_order");
                      }}
                    >
                      Restrict
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget(r);
                        setStatus("available");
                      }}
                    >
                      Release
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room restriction</DialogTitle>
            <DialogDescription>Room {target?.roomNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available (release)</SelectItem>
                  <SelectItem value="out_of_order">Out of order</SelectItem>
                  <SelectItem value="out_of_service">Out of service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason {status !== "available" && <span className="text-destructive">*</span>}</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
            {status !== "available" && (
              <div className="space-y-1.5">
                <Label>Expected return (optional)</Label>
                <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------ discrepancies */

export function DiscrepanciesTab({ restaurantId }: Props) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchList = useServerFn(listDiscrepancies);
  const createFn = useServerFn(createDiscrepancy);
  const resolveFn = useServerFn(resolveDiscrepancy);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetchRack({ data: { restaurantId } }),
  });
  const list = useQuery({
    queryKey: ["hk-discrepancies", restaurantId],
    queryFn: () => fetchList({ data: { restaurantId } }),
  });

  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [reportedOcc, setReportedOcc] = useState("vacant");
  const [actualOcc, setActualOcc] = useState("occupied");
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          restaurantId,
          roomId,
          reportedOccupancy: reportedOcc as never,
          actualOccupancy: actualOcc as never,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Discrepancy logged.");
      invalidate();
      setOpen(false);
      setReason("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const resolve = useMutation({
    mutationFn: (discrepancyId: string) => resolveFn({ data: { restaurantId, discrepancyId } }),
    onSuccess: () => {
      toast.success("Discrepancy resolved.");
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Report discrepancy</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Reported</th>
              <th className="p-3">Actual</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-muted-foreground">
                  No discrepancies logged.
                </td>
              </tr>
            ) : (
              (list.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-3 font-medium">{d.roomNumber}</td>
                  <td className="p-3 capitalize">{d.reportedOccupancy ?? d.reportedHkStatus ?? "—"}</td>
                  <td className="p-3 capitalize">{d.actualOccupancy ?? d.actualHkStatus ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{d.reason ?? "—"}</td>
                  <td className="p-3 capitalize">{d.status}</td>
                  <td className="p-3">{formatWhen(d.createdAt)}</td>
                  <td className="p-3 text-right">
                    {d.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => resolve.mutate(d.id)}>
                        Resolve
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report discrepancy</DialogTitle>
            <DialogDescription>Log a mismatch between the system and the floor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {(rack.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.roomNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>System says</Label>
                <Select value={reportedOcc} onValueChange={setReportedOcc}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Housekeeping found</Label>
                <Select value={actualOcc} onValueChange={setActualOcc}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!roomId || create.isPending}>
              Log discrepancy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------- maintenance */

export function MaintenanceTab({ restaurantId }: Props) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchList = useServerFn(listMaintenanceRequests);
  const createFn = useServerFn(createMaintenanceRequest);
  const updateFn = useServerFn(updateMaintenanceRequest);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetchRack({ data: { restaurantId } }),
  });
  const list = useQuery({
    queryKey: ["hk-maintenance", restaurantId],
    queryFn: () => fetchList({ data: { restaurantId } }),
  });

  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          restaurantId,
          roomId,
          category: category as never,
          priority: priority as never,
          description,
        },
      }),
    onSuccess: () => {
      toast.success("Maintenance request logged.");
      invalidate();
      setOpen(false);
      setDescription("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const update = useMutation({
    mutationFn: (vars: { requestId: string; status: "open" | "in_progress" | "resolved" }) =>
      updateFn({ data: { restaurantId, ...vars } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Log maintenance</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Category</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Description</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-muted-foreground">
                  No maintenance requests.
                </td>
              </tr>
            ) : (
              (list.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-3 font-medium">{m.roomNumber}</td>
                  <td className="p-3 capitalize">{m.category}</td>
                  <td className="p-3">
                    <PriorityBadge priority={m.priority} />
                  </td>
                  <td className="p-3 text-muted-foreground">{m.description}</td>
                  <td className="p-3 capitalize">{m.status.replace("_", " ")}</td>
                  <td className="p-3">{formatWhen(m.createdAt)}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      {m.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => update.mutate({ requestId: m.id, status: "in_progress" })}
                        >
                          Start
                        </Button>
                      )}
                      {m.status !== "resolved" && (
                        <Button
                          size="sm"
                          onClick={() => update.mutate({ requestId: m.id, status: "resolved" })}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log maintenance request</DialogTitle>
            <DialogDescription>
              To take the room out of inventory, set a restriction separately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {(rack.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.roomNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["plumbing", "electrical", "furniture", "equipment", "other"].map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["normal", "high", "urgent"].map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!roomId || description.trim() === "" || create.isPending}
            >
              Log request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------------------------------------- history */

export function HousekeepingHistoryTab({ restaurantId }: Props) {
  const fetchHistory = useServerFn(listHousekeepingHistory);
  const q = useQuery({
    queryKey: ["hk-history", restaurantId],
    queryFn: () => fetchHistory({ data: { restaurantId } }),
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-3">When</th>
            <th className="p-3">Room</th>
            <th className="p-3">Event</th>
            <th className="p-3">Actor</th>
            <th className="p-3">Detail</th>
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? (
            <tr>
              <td colSpan={5} className="p-4 text-muted-foreground">
                Loading history…
              </td>
            </tr>
          ) : (q.data ?? []).length === 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-muted-foreground">
                No housekeeping activity yet.
              </td>
            </tr>
          ) : (
            (q.data ?? []).map((h) => (
              <tr key={h.id} className="border-t border-border align-top">
                <td className="p-3 whitespace-nowrap">{formatWhen(h.createdAt)}</td>
                <td className="p-3">{h.roomNumber ?? "—"}</td>
                <td className="p-3">{h.eventType.replace(/_/g, " ")}</td>
                <td className="p-3">{h.actorName ?? "System"}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {h.notes ?? h.newValues ?? "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
