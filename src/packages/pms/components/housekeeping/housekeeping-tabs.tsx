/**
 * Phase 6F — Housekeeping workspace tab content.
 *
 * Presentation only: every mutation goes through the tenant-scoped server
 * functions, which re-derive the caller's owner/manager membership.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import { cn } from "@/shared/lib/utils";
import {
  completeHousekeepingTask,
  createDiscrepancy,
  createHousekeepingTask,
  createMaintenanceRequest,
  getHousekeepingDashboard,
  inspectRoom,
  listHousekeepingHistory,
  listHousekeepingStaff,
  listHousekeepingTasks,
  listInspections,
  listHousekeepingExceptions,
  listMaintenanceRequests,
  listRoomRack,
  resolveDiscrepancy,
  setRoomRestriction,
  updateHousekeepingTask,
  updateMaintenanceRequest,
  type RackRoom,
} from "@/packages/pms/lib/housekeeping.functions";
import { getPmsSet4Snapshot } from "@/packages/pms/lib/pms-set4-hk-inventory.functions";
import {
  resolveCleaningTypesForCreate,
  resolveMaintenanceCategoriesForCreate,
  resolvePrioritiesForCreate,
  resolveRestrictionReasonsForCreate,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import {
  HkStatusBadge,
  PriorityBadge,
  RestrictionBadge,
  TaskStatusBadge,
  formatWhen,
  labelTaskType,
} from "./housekeeping-bits";
import type { HousekeepingScope } from "@/core/lib/module-access";
import { occupancyCaption, hkAreaPath, hkRoomQuickViewPath, HK_FIELD_ACTION_CLASS } from "@/packages/pms/lib/housekeeping-shell";
import { HkDesktopOnly, HkFieldActions, HkFieldCard, HkFieldStack } from "./housekeeping-field";
import {
  formatHousekeepingHistoryDetail,
  HK_HISTORY_FILTER_GROUP_LABELS,
  HK_HISTORY_FILTER_GROUPS,
  HK_HISTORY_EVENTS_BY_GROUP,
  suggestedCleaningType,
  type HkExceptionAction,
  type HkExceptionKind,
} from "@/packages/pms/lib/housekeeping-ops";
import { HK_HREF, INVENTORY_HREF } from "@/packages/pms/lib/front-office-room-operations";

type Props = { restaurantId: string; today: string };
type CleaningProps = Props & { scope: HousekeepingScope; membershipId: string };

function useInvalidateHousekeeping(restaurantId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "hk-dashboard",
      "hk-rack",
      "hk-tasks",
      "hk-inspections",
      "hk-discrepancies",
      "hk-exceptions",
      "hk-maintenance",
      "hk-history",
      "hk-staff",
      "hk-requests",
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

export function RoomRackTab({ restaurantId, canCreateTask = true }: Props & { canCreateTask?: boolean }) {
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

      <HkFieldStack testId="hk-dashboard-field-worklist">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rooms…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms match these filters.</p>
        ) : (
          filtered.map((r) => (
            <HkFieldCard key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">Room {r.roomNumber}</p>
                <HkStatusBadge status={r.housekeepingStatus} />
              </div>
              <p className="text-sm text-muted-foreground">
                {r.roomTypeName}
                {r.floor ? ` · Floor ${r.floor}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.guestName ?? occupancyCaption(r)} · {r.assignedAttendant ?? "Unassigned"}
              </p>
              <p className="text-xs">{r.ready ? "Ready" : "Not ready"}</p>
              {canCreateTask ? (
                <HkFieldActions>
                  <Button className={HK_FIELD_ACTION_CLASS} variant="outline" onClick={() => setTaskRoom(r)}>
                    New task
                  </Button>
                </HkFieldActions>
              ) : null}
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>

      <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
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
                    {canCreateTask ? (
                    <Button size="sm" variant="outline" onClick={() => setTaskRoom(r)}>
                      New task
                    </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </HkDesktopOnly>

      <NewTaskDialog
        restaurantId={restaurantId}
        open={taskRoom !== null}
        lockedRoom={taskRoom}
        rooms={rooms}
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

export function NewTaskDialog({
  restaurantId,
  open,
  lockedRoom,
  rooms,
  onClose,
  onDone,
}: {
  restaurantId: string;
  open: boolean;
  lockedRoom: RackRoom | null;
  rooms: RackRoom[];
  onClose: () => void;
  onDone: () => void;
}) {
  const create = useServerFn(createHousekeepingTask);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    retry: false,
    enabled: open,
  });
  const cleaningTypes = resolveCleaningTypesForCreate(set4.data?.snapshot.cleaningPosture).filter(
    (row) => row.code !== "turn_down",
  );
  const priorities = resolvePrioritiesForCreate(
    set4.data?.snapshot.cleaningPosture,
    set4.data?.snapshot.maintenancePriorities,
  );
  const [pickedRoomId, setPickedRoomId] = useState("");
  const [taskType, setTaskType] = useState("departure_cleaning");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  const selectedRoom = lockedRoom ?? rooms.find((row) => row.id === pickedRoomId) ?? null;

  useEffect(() => {
    if (!open) {
      setPickedRoomId("");
      setNotes("");
      setTaskType("departure_cleaning");
      setPriority("normal");
      return;
    }
    setPickedRoomId("");
    setNotes("");
    setPriority("normal");
    if (lockedRoom) {
      setTaskType(suggestedCleaningType(lockedRoom.demand));
    } else {
      setTaskType("departure_cleaning");
    }
  }, [open, lockedRoom?.id]);

  useEffect(() => {
    if (!open || lockedRoom || !selectedRoom) return;
    setTaskType(suggestedCleaningType(selectedRoom.demand));
  }, [open, lockedRoom, selectedRoom?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          restaurantId,
          roomId: selectedRoom!.id,
          taskType: taskType as never,
          priority: priority as never,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success("Cleaning task ready for this room.");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const roomOptions = rooms.map((row) => ({
    value: row.id,
    label: `${row.roomNumber} · ${row.roomTypeName} · ${row.housekeepingStatus.replaceAll("_", " ")}`,
  }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New housekeeping task</DialogTitle>
          <DialogDescription>
            {lockedRoom ? `Room ${lockedRoom.roomNumber}` : "Choose a room, then set type, priority, and notes."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lockedRoom ? null : (
            <div className="space-y-1.5" data-testid="hk-create-task-room">
              <Label htmlFor="hk-create-task-room-select">Room</Label>
              <SearchableSelect
                id="hk-create-task-room-select"
                value={pickedRoomId}
                options={roomOptions}
                placeholder="Select a room"
                searchPlaceholder="Search room number"
                emptyText="No rooms match."
                onChange={setPickedRoomId}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Task type</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(cleaningTypes.length
                  ? cleaningTypes
                  : ["departure_cleaning", "stayover_cleaning", "touch_up", "deep_cleaning", "re_clean"].map((code) => ({
                      code,
                      label: labelTaskType(code),
                    }))
                ).map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.label}
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
                {(priorities.length ? priorities : ["normal", "high", "urgent"].map((code) => ({ code, label: code }))).map(
                  (row) => (
                    <SelectItem key={row.code} value={row.code} className="capitalize">
                      {row.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">
            A room can only have one open cleaning task; if one already exists it stays as-is.
            Arrival, stayover, and VIP Card 2 rules may raise the saved priority.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selectedRoom}
          >
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- cleaning board */

export function CleaningBoardTab({ restaurantId, today, scope, membershipId }: CleaningProps) {
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
  const [assignNotes, setAssignNotes] = useState("");

  const isSupervisor = scope === "supervisor";
  const own = (assignedId: string | null) => assignedId === membershipId;

  const act = useMutation({
    mutationFn: (vars: {
      taskId: string;
      action: "assign" | "start" | "cancel";
      assigneeMembershipId?: string;
      notes?: string;
    }) =>
      assignFn({
        data: {
          restaurantId,
          taskId: vars.taskId,
          action: vars.action,
          assigneeMembershipId: vars.assigneeMembershipId ?? null,
          notes: vars.notes,
        },
      }),
    onSuccess: () => {
      invalidate();
      setAssignTask(null);
      setAssignNotes("");
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
  const fieldWork = all.filter(
    (t) => t.status === "pending" || t.status === "assigned" || t.status === "in_progress",
  );
  const columns: Array<[string, typeof all]> = [
    ["Pending", all.filter((t) => t.status === "pending")],
    ["Assigned", all.filter((t) => t.status === "assigned")],
    ["In progress", all.filter((t) => t.status === "in_progress")],
    [
      "Completed today",
      all.filter((t) => t.status === "completed" && (t.completedAt ?? "").slice(0, 10) === todayStr),
    ],
  ];

  function taskActions(t: (typeof all)[number], large: boolean) {
    if (t.status === "completed" || t.status === "cancelled") return null;
    const cls = large ? HK_FIELD_ACTION_CLASS : undefined;
    return (
      <HkFieldActions>
        {isSupervisor ? (
          <Button size={large ? "default" : "sm"} className={cls} variant="outline" onClick={() => setAssignTask(t.id)}>
            Assign
          </Button>
        ) : null}
        {t.status !== "in_progress" && (isSupervisor || own(t.assignedMembershipId)) ? (
          <Button
            size={large ? "default" : "sm"}
            className={cls}
            variant="outline"
            onClick={() => act.mutate({ taskId: t.id, action: "start" })}
          >
            Start
          </Button>
        ) : null}
        {isSupervisor || own(t.assignedMembershipId) ? (
          <Button
            size={large ? "default" : "sm"}
            className={cls}
            onClick={() => complete.mutate(t.id)}
            disabled={complete.isPending}
          >
            Complete
          </Button>
        ) : null}
        {isSupervisor ? (
          <Button
            size={large ? "default" : "sm"}
            className={cls}
            variant="ghost"
            onClick={() => act.mutate({ taskId: t.id, action: "cancel" })}
          >
            Cancel
          </Button>
        ) : null}
      </HkFieldActions>
    );
  }

  return (
    <div className="space-y-4" data-testid="hk-cleaning-board">
      <p className="text-sm text-muted-foreground">
        {isSupervisor
          ? "Assign, start, and complete cleaning on the open task. Completing always uses the housekeeping complete RPC."
          : "Your assignments only. Start and complete rooms assigned to you."}
      </p>
      <HkFieldStack testId="hk-cleaning-field-worklist">
        {tasks.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tasks…</p>
        ) : fieldWork.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open cleaning tasks.</p>
        ) : (
          fieldWork.map((t) => (
            <HkFieldCard key={t.id} testId={`hk-cleaning-card-${t.roomNumber}`}>
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
              {t.notes ? <p className="text-xs text-muted-foreground">Notes: {t.notes}</p> : null}
              {taskActions(t, true)}
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>
      <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
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
                <div
                  key={t.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
                  data-testid={`hk-cleaning-card-${t.roomNumber}`}
                >
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
                  {t.notes ? <p className="text-xs text-muted-foreground">Notes: {t.notes}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    Created {formatWhen(t.createdAt)}
                    {t.startedAt ? ` · Started ${formatWhen(t.startedAt)}` : ""}
                    {t.completedAt ? ` · Completed ${formatWhen(t.completedAt)}` : ""}
                  </p>
                  {taskActions(t, false)}
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
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTask(null)}>
              Cancel
            </Button>
            <Button
              disabled={!assignee || act.isPending}
              onClick={() =>
                act.mutate({
                  taskId: assignTask!,
                  action: "assign",
                  assigneeMembershipId: assignee,
                  notes: assignNotes,
                })
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

export function InspectionsTab({ restaurantId, today }: Props) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchInspections = useServerFn(listInspections);
  const inspectFn = useServerFn(inspectRoom);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
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
          ? "Inspection passed. Ready is derived from Housekeeping Setup — not a Ready status."
          : "Inspection failed — room is dirty and a re-clean task is open.",
      );
      invalidate();
      setTarget(null);
      setNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const awaiting = (rack.data ?? []).filter((r) => r.awaitingInspection);
  const history = (inspections.data ?? []).filter((i) => i.status === "passed" || i.status === "failed");
  const failNeedsNotes = target?.result === "failed" && notes.trim().length === 0;

  return (
    <div className="space-y-6" data-testid="hk-inspections">
      <p className="text-sm text-muted-foreground">
        Queue is rooms marked clean when inspection is required. Pass and fail use the existing inspection RPC.
        Fail notes only — no itemized fail list. Inspected is not sellable inventory; Ready is the Front Office outcome
        plus reason.
      </p>
      <section className="space-y-3">
        <h3 className="font-display text-lg">Awaiting inspection ({awaiting.length})</h3>
        {awaiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cleaned rooms are waiting for inspection. If inspection is off in Housekeeping Setup, clean rooms
            skip this queue.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {awaiting.map((r) => (
              <div key={r.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">Room {r.roomNumber}</p>
                  <HkStatusBadge status={r.housekeepingStatus} />
                </div>
                <p className="text-sm text-muted-foreground">{r.roomTypeName}</p>
                <p className="text-xs text-muted-foreground">{occupancyCaption(r)}</p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    r.checkInReady ? "text-teal-800" : "text-rose-800",
                  )}
                >
                  {r.checkInReady ? "Ready for check-in" : "Not ready for check-in"}
                </p>
                {r.readyReason ? (
                  <p className="text-xs text-muted-foreground">{r.readyReason}</p>
                ) : null}
                <HkFieldActions>
                  <Button className={HK_FIELD_ACTION_CLASS} onClick={() => setTarget({ room: r, result: "passed" })}>
                    Pass
                  </Button>
                  <Button
                    className={HK_FIELD_ACTION_CLASS}
                    variant="outline"
                    onClick={() => setTarget({ room: r, result: "failed" })}
                  >
                    Fail
                  </Button>
                </HkFieldActions>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg">Inspection history</h3>
        <HkFieldStack testId="hk-inspections-history-field">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections yet.</p>
          ) : (
            history.map((i) => (
              <HkFieldCard key={i.id}>
                <p className="font-medium">Room {i.roomNumber}</p>
                <p className="text-sm capitalize">{i.status}</p>
                <p className="text-xs text-muted-foreground">{i.inspectorName ?? "—"}</p>
                {i.notes ? <p className="text-xs text-muted-foreground">{i.notes}</p> : null}
                <p className="text-xs text-muted-foreground">{formatWhen(i.completedAt ?? i.createdAt)}</p>
              </HkFieldCard>
            ))
          )}
        </HkFieldStack>
        <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
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
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">
                    No inspections yet.
                  </td>
                </tr>
              ) : (
                history.map((i) => (
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
        </HkDesktopOnly>
      </section>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.result === "passed" ? "Pass inspection" : "Fail inspection"}
            </DialogTitle>
            <DialogDescription>
              Room {target?.room.roomNumber}.{" "}
              {target?.result === "passed"
                ? "Pass writes inspected (or the Card 2 transition target). Ready stays derived."
                : "Fail marks the room dirty and opens a re-clean task. Notes are required."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{target?.result === "failed" ? "Fail notes" : "Notes"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            {failNeedsNotes ? (
              <p className="text-xs text-rose-700">Describe why the room failed. There is no itemized fail list.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || failNeedsNotes}>
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
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetchRack({ data: { restaurantId } }),
  });
  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    retry: false,
  });
  const reasonOptions = resolveRestrictionReasonsForCreate(set4.data?.snapshot.restrictionReasons);

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
      <HkFieldStack testId="hk-restrictions-field-worklist">
        {(rack.data ?? []).map((r) => (
          <HkFieldCard key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">Room {r.roomNumber}</p>
              <RestrictionBadge status={r.restriction} />
            </div>
            <p className="text-xs text-muted-foreground">{r.restrictionReason ?? "No reason"}</p>
            {r.restrictionExpectedReturn ? (
              <p className="text-xs text-muted-foreground">Return {r.restrictionExpectedReturn}</p>
            ) : null}
            <HkFieldActions>
              <Button
                className={HK_FIELD_ACTION_CLASS}
                variant="outline"
                onClick={() => {
                  setTarget(r);
                  setStatus(r.restriction === "available" ? "out_of_order" : "available");
                }}
              >
                {r.restriction === "available" ? "Restrict" : "Release"}
              </Button>
            </HkFieldActions>
          </HkFieldCard>
        ))}
      </HkFieldStack>
      <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
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
      </HkDesktopOnly>

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
              {reasonOptions.length ? (
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonOptions.map((row) => (
                      <SelectItem key={row.code} value={row.label}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              )}
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

/* ------------------------------------------------------------ exceptions */

const EXCEPTION_KIND_LABEL: Record<HkExceptionKind, string> = {
  dirty_arrival: "Arrival not ready",
  inspect_failed: "Inspection failed",
  maintenance_blocker: "Maintenance",
  ooo_assigned: "OOO on stay",
  stale_task: "Stale task",
  dirty_vacant_no_task: "Dirty vacant",
  discrepancy: "Discrepancy",
};

function exceptionActionLabel(action: HkExceptionAction): string {
  if (action === "board") return "Open board";
  if (action === "cleaning") return "Open cleaning";
  if (action === "inspections") return "Open inspections";
  if (action === "maintenance") return "Open maintenance";
  if (action === "restrictions") return "Set restriction";
  return "Resolve";
}

export function ExceptionsTab({ restaurantId, today }: Props) {
  const navigate = useNavigate();
  const fetchRack = useServerFn(listRoomRack);
  const fetchList = useServerFn(listHousekeepingExceptions);
  const createFn = useServerFn(createDiscrepancy);
  const resolveFn = useServerFn(resolveDiscrepancy);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const list = useQuery({
    queryKey: ["hk-exceptions", restaurantId, today],
    queryFn: () => fetchList({ data: { restaurantId, today } }),
  });

  const [open, setOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<HkExceptionKind | "all">("all");
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

  const rows = list.data ?? [];
  const filtered = kindFilter === "all" ? rows : rows.filter((row) => row.kind === kindFilter);
  const derivedCount = rows.filter((row) => row.source === "derived").length;
  const persistedCount = rows.filter((row) => row.source === "persisted").length;
  const highCount = rows.filter((row) => row.severity === "high").length;

  function go(action: HkExceptionAction) {
    if (action === "resolve_discrepancy") return;
    const dest = hkAreaPath(action);
    void navigate({ to: dest.to, search: dest.search });
  }

  return (
    <div className="space-y-4" data-testid="hk-exceptions-workspace">
      <p className="text-sm text-muted-foreground">
        Exceptions are derived from live Housekeeping, occupancy, inspection, and maintenance state.
        Only occupancy discrepancies are stored. Do not disturb and refused service are not stored yet.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ["Derived", derivedCount, "Clear when the room state changes"],
          ["Logged discrepancies", persistedCount, "Resolve with the discrepancy writer"],
          ["High priority", highCount, "Arrival, inspection, maintenance, OOO"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-border bg-background px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{list.isLoading ? "—" : value}</p>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={kindFilter === "all" ? "secondary" : "ghost"} onClick={() => setKindFilter("all")}>
            All
          </Button>
          {(Object.keys(EXCEPTION_KIND_LABEL) as HkExceptionKind[]).map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={kindFilter === kind ? "secondary" : "ghost"}
              onClick={() => setKindFilter(kind)}
            >
              {EXCEPTION_KIND_LABEL[kind]}
            </Button>
          ))}
        </div>
        <Button onClick={() => setOpen(true)}>Report discrepancy</Button>
      </div>

      <HkFieldStack testId="hk-exceptions-field-worklist">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading exceptions…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No housekeeping exceptions.</p>
        ) : (
          filtered.map((row) => (
            <HkFieldCard key={row.key}>
              <p className="font-medium">Room {row.roomNumber}</p>
              <p className="text-sm">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
              <HkFieldActions>
                {row.action === "resolve_discrepancy" && row.discrepancyId ? (
                  <Button
                    className={HK_FIELD_ACTION_CLASS}
                    variant="outline"
                    onClick={() => resolve.mutate(row.discrepancyId!)}
                  >
                    Resolve
                  </Button>
                ) : (
                  <Button className={HK_FIELD_ACTION_CLASS} variant="outline" onClick={() => go(row.action)}>
                    {exceptionActionLabel(row.action)}
                  </Button>
                )}
              </HkFieldActions>
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>
      <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Exception</th>
              <th className="p-3">Detail</th>
              <th className="p-3">Source</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  Loading exceptions…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  No housekeeping exceptions.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="p-3 font-medium">{row.roomNumber}</td>
                  <td className="p-3">{row.title}</td>
                  <td className="p-3 text-muted-foreground">{row.detail}</td>
                  <td className="p-3 capitalize">{row.source}</td>
                  <td className="p-3 text-right">
                    {row.action === "resolve_discrepancy" && row.discrepancyId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve.mutate(row.discrepancyId!)}
                      >
                        Resolve
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => go(row.action)}>
                        {exceptionActionLabel(row.action)}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </HkDesktopOnly>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report discrepancy</DialogTitle>
            <DialogDescription>Log a mismatch between the system and the floor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hk-disc-room">Room</Label>
              <SearchableSelect
                id="hk-disc-room"
                value={roomId}
                options={(rack.data ?? []).map((r) => ({
                  value: r.id,
                  label: `${r.roomNumber} · ${r.roomTypeName}`,
                }))}
                placeholder="Select a room"
                searchPlaceholder="Search room number"
                emptyText="No rooms match."
                onChange={setRoomId}
              />
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

export const DiscrepanciesTab = ExceptionsTab;

/* -------------------------------------------------------------- maintenance */

export function MaintenanceTab({ restaurantId, today }: Props) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchList = useServerFn(listMaintenanceRequests);
  const createFn = useServerFn(createMaintenanceRequest);
  const updateFn = useServerFn(updateMaintenanceRequest);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const invalidate = useInvalidateHousekeeping(restaurantId);
  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    retry: false,
  });
  const liveCategories = ["plumbing", "electrical", "furniture", "equipment", "other"];
  const livePriorities = ["normal", "high", "urgent"];
  const savedCategories = resolveMaintenanceCategoriesForCreate(set4.data?.snapshot.maintenanceCategories).filter(
    (row) => liveCategories.includes(row.code),
  );
  const savedPriorities = resolvePrioritiesForCreate(null, set4.data?.snapshot.maintenancePriorities).filter((row) =>
    livePriorities.includes(row.code),
  );
  const categoryOptions = savedCategories.length
    ? savedCategories
    : liveCategories.map((code) => ({ code, label: code }));
  const priorityOptions = savedPriorities.length
    ? savedPriorities
    : livePriorities.map((code) => ({ code, label: code }));

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const list = useQuery({
    queryKey: ["hk-maintenance", restaurantId],
    queryFn: () => fetchList({ data: { restaurantId } }),
  });

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [workNotes, setWorkNotes] = useState("");

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
    onSuccess: (row) => {
      toast.success("Maintenance request logged.");
      setSelectedId(row.id);
      invalidate();
      setOpen(false);
      setDescription("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const update = useMutation({
    mutationFn: (vars: { requestId: string; status: "open" | "in_progress" | "resolved"; notes?: string }) =>
      updateFn({ data: { restaurantId, ...vars } }),
    onSuccess: () => {
      invalidate();
      setWorkNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const rows = list.data ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const openCount = rows.filter((row) => row.status === "open").length;
  const highCount = rows.filter((row) => row.priority === "urgent" && row.status !== "resolved").length;
  const progressCount = rows.filter((row) => row.status === "in_progress").length;
  const resolvedToday = rows.filter(
    (row) => row.status === "resolved" && (row.resolvedAt ?? "").slice(0, 10) === today,
  ).length;
  const oooCount = (rack.data ?? []).filter((r) => r.restriction === "out_of_order").length;
  const roomForSelected = selected ? (rack.data ?? []).find((r) => r.id === selected.roomId) : undefined;

  return (
    <div className="space-y-4" data-testid="hk-maintenance-workspace">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Open work orders", openCount, "Requiring attention"],
          ["High priority", highCount, "Urgent repairs"],
          ["In progress", progressCount, "Being worked on"],
          ["Completed today", resolvedToday, "Resolved today"],
          ["Rooms out of order", oooCount, "Currently unavailable"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-border bg-background px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{list.isLoading ? "—" : value}</p>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          className={cn(HK_FIELD_ACTION_CLASS, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c] sm:ml-auto")}
          onClick={() => {
            setRoomId("");
            setDescription("");
            setOpen(true);
          }}
        >
          + Create Work Order
        </Button>
      </div>

      <HkFieldStack testId="hk-maintenance-field-worklist">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No maintenance requests.</p>
        ) : (
          rows.map((m) => (
            <HkFieldCard key={m.id} selected={selected?.id === m.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">Room {m.roomNumber}</p>
                <PriorityBadge priority={m.priority} />
              </div>
              <p className="text-sm">{m.description}</p>
              <p className="text-xs capitalize text-muted-foreground">{m.status.replace("_", " ")}</p>
              {m.status !== "resolved" ? (
                <HkFieldActions>
                  {m.status === "open" ? (
                    <Button
                      className={HK_FIELD_ACTION_CLASS}
                      variant="outline"
                      onClick={() =>
                        update.mutate({ requestId: m.id, status: "in_progress", notes: workNotes })
                      }
                    >
                      Start work
                    </Button>
                  ) : null}
                  <Button
                    className={cn(HK_FIELD_ACTION_CLASS, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
                    onClick={() => update.mutate({ requestId: m.id, status: "resolved", notes: workNotes })}
                  >
                    Complete work
                  </Button>
                </HkFieldActions>
              ) : null}
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>

      <div className="hidden gap-4 md:grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border bg-background !block">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Room</th>
                <th className="p-3">Issue</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Maintenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-muted-foreground">
                    No maintenance requests.
                  </td>
                </tr>
              ) : (
                rows.map((m) => {
                  const room = (rack.data ?? []).find((r) => r.id === m.roomId);
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        "cursor-pointer border-t border-border",
                        selected?.id === m.id && "bg-[#F7F4EE]",
                      )}
                      onClick={() => setSelectedId(m.id)}
                    >
                      <td className="p-3 font-medium">{m.roomNumber}</td>
                      <td className="p-3 text-muted-foreground">{m.description}</td>
                      <td className="p-3">
                        <PriorityBadge priority={m.priority} />
                      </td>
                      <td className="p-3 capitalize">{m.status.replace("_", " ")}</td>
                      <td className="p-3">{formatWhen(m.createdAt)}</td>
                      <td className="p-3 capitalize">
                        {(room?.maintenanceStatus ?? "normal").replaceAll("_", " ")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </HkDesktopOnly>

        <aside className="rounded-2xl border border-border bg-background p-4">
          {selected ? (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {selected.id.slice(0, 8).toUpperCase()} · {selected.status.replace("_", " ")}
              </p>
              <h3 className="font-display text-xl">{selected.description}</h3>
              <p className="text-sm text-muted-foreground">
                Room {selected.roomNumber}
                {roomForSelected ? ` · ${roomForSelected.roomTypeName}` : ""}
              </p>
              <p className="text-sm">
                Category <span className="capitalize">{selected.category}</span>
              </p>
              <p className="text-sm">
                Priority <PriorityBadge priority={selected.priority} />
              </p>
              <p className="text-sm">
                Room maintenance{" "}
                <span className="capitalize">
                  {(roomForSelected?.maintenanceStatus ?? "normal").replaceAll("_", " ")}
                </span>
              </p>
              {roomForSelected?.readyReason && !roomForSelected.checkInReady ? (
                <p className="text-xs text-rose-800">{roomForSelected.readyReason}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Created {formatWhen(selected.createdAt)}</p>
              <p className="text-xs text-muted-foreground">
                Tickets stay on this table. Physical OOO/OOS is Inventory restrictions, not this column.
              </p>
              <div className="flex flex-col gap-1">
                <Link to={INVENTORY_HREF} className="text-xs text-[#C89933]">
                  Open room inventory
                </Link>
                <Link to={HK_HREF} search={{ tab: "restrictions" }} className="text-xs text-[#C89933]">
                  Set OOO / OOS restriction
                </Link>
              </div>
              {selected.status !== "resolved" ? (
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={workNotes} onChange={(e) => setWorkNotes(e.target.value)} rows={2} />
                </div>
              ) : null}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                {selected.status === "open" ? (
                  <Button
                    className={HK_FIELD_ACTION_CLASS}
                    variant="outline"
                    onClick={() =>
                      update.mutate({ requestId: selected.id, status: "in_progress", notes: workNotes })
                    }
                  >
                    Start work
                  </Button>
                ) : null}
                {selected.status !== "resolved" ? (
                  <Button
                    className={cn(HK_FIELD_ACTION_CLASS, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
                    onClick={() =>
                      update.mutate({ requestId: selected.id, status: "resolved", notes: workNotes })
                    }
                  >
                    Complete work
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a request to see details.</p>
          )}
        </aside>
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
              <Label htmlFor="hk-maint-room">Room</Label>
              <SearchableSelect
                id="hk-maint-room"
                value={roomId}
                options={(rack.data ?? []).map((r) => ({
                  value: r.id,
                  label: `${r.roomNumber} · ${r.roomTypeName}`,
                }))}
                placeholder="Select a room"
                searchPlaceholder="Search room number"
                emptyText="No rooms match."
                onChange={setRoomId}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((row) => (
                      <SelectItem key={row.code} value={row.code} className="capitalize">
                        {row.label}
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
                    {priorityOptions.map((row) => (
                      <SelectItem key={row.code} value={row.code} className="capitalize">
                        {row.label}
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

const HK_HISTORY_EVENT_TYPE_OPTIONS = Array.from(
  new Set(Object.values(HK_HISTORY_EVENTS_BY_GROUP).flatMap((types) => [...types])),
);

export function HousekeepingHistoryTab({ restaurantId, today }: Props) {
  const fetchHistory = useServerFn(listHousekeepingHistory);
  const fetchRack = useServerFn(listRoomRack);
  const fetchStaff = useServerFn(listHousekeepingStaff);
  const [roomId, setRoomId] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const staff = useQuery({
    queryKey: ["hk-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
  });

  const eventGroup = (HK_HISTORY_FILTER_GROUPS as readonly string[]).includes(eventFilter)
    ? eventFilter
    : undefined;
  const eventType = HK_HISTORY_EVENT_TYPE_OPTIONS.includes(eventFilter) ? eventFilter : undefined;

  const q = useQuery({
    queryKey: ["hk-history", restaurantId, roomId, eventFilter, actorId, dateFrom, dateTo],
    queryFn: () =>
      fetchHistory({
        data: {
          restaurantId,
          ...(roomId !== "all" ? { roomId } : {}),
          ...(eventGroup ? { eventGroup: eventGroup as (typeof HK_HISTORY_FILTER_GROUPS)[number] } : {}),
          ...(eventType ? { eventType: eventType as never } : {}),
          ...(actorId !== "all" ? { actorMembershipId: actorId as never } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
      }),
  });

  const roomOptions = (rack.data ?? [])
    .slice()
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
    .map((room) => ({ value: room.id, label: room.roomNumber }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="min-w-[10rem] space-y-1">
          <Label className="text-xs text-muted-foreground">Room</Label>
          <SearchableSelect
            id="hk-history-room"
            value={roomId}
            options={[{ value: "all", label: "All rooms" }, ...roomOptions]}
            placeholder="All rooms"
            searchPlaceholder="Search room"
            emptyText="No rooms match."
            onChange={(value) => setRoomId(value || "all")}
          />
        </div>
        <div className="min-w-[12rem] space-y-1">
          <Label className="text-xs text-muted-foreground">Event type</Label>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {HK_HISTORY_FILTER_GROUPS.map((group) => (
                <SelectItem key={group} value={group}>
                  {HK_HISTORY_FILTER_GROUP_LABELS[group]}
                </SelectItem>
              ))}
              {HK_HISTORY_EVENT_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[12rem] space-y-1">
          <Label className="text-xs text-muted-foreground">Actor</Label>
          <Select value={actorId} onValueChange={setActorId}>
            <SelectTrigger>
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              <SelectItem value="system">System</SelectItem>
              {(staff.data ?? []).map((person) => (
                <SelectItem key={person.membershipId} value={person.membershipId}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>
      <HkFieldStack testId="hk-history-field-worklist">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No housekeeping activity yet.</p>
        ) : (
          (q.data ?? []).map((h) => {
            const qv = h.roomId ? hkRoomQuickViewPath(h.roomId) : null;
            return (
              <HkFieldCard key={h.id}>
                <p className="text-xs text-muted-foreground">{formatWhen(h.createdAt)}</p>
                {qv ? (
                  <Link to={qv.to} search={qv.search} className="font-medium underline-offset-2 hover:underline">
                    {h.roomNumber ?? "Room"}
                  </Link>
                ) : (
                  <p className="font-medium">{h.roomNumber ?? "—"}</p>
                )}
                <p className="text-sm">{h.eventType.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{h.actorName ?? "System"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatHousekeepingHistoryDetail({
                    eventType: h.eventType,
                    notes: h.notes,
                    newValues: h.newValues,
                    previousValues: h.previousValues,
                  })}
                </p>
              </HkFieldCard>
            );
          })
        )}
      </HkFieldStack>
      <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
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
              (q.data ?? []).map((h) => {
                const qv = h.roomId ? hkRoomQuickViewPath(h.roomId) : null;
                return (
                  <tr key={h.id} className="border-t border-border align-top">
                    <td className="p-3 whitespace-nowrap">{formatWhen(h.createdAt)}</td>
                    <td className="p-3">
                      {qv ? (
                        <Link to={qv.to} search={qv.search} className="font-medium text-foreground underline-offset-2 hover:underline">
                          {h.roomNumber ?? "Room"}
                        </Link>
                      ) : (
                        (h.roomNumber ?? "—")
                      )}
                    </td>
                    <td className="p-3">{h.eventType.replace(/_/g, " ")}</td>
                    <td className="p-3">{h.actorName ?? "System"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatHousekeepingHistoryDetail({
                        eventType: h.eventType,
                        notes: h.notes,
                        newValues: h.newValues,
                        previousValues: h.previousValues,
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </HkDesktopOnly>
    </div>
  );
}
