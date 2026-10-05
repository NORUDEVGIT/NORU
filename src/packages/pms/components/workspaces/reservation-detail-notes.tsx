import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Shield,
  StickyNote,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  addGuestNote,
  type GuestHistoryEntry,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import {
  completeHousekeepingTask,
  createHousekeepingTask,
  listHousekeepingTasks,
  updateHousekeepingTask,
} from "@/packages/pms/lib/housekeeping.functions";
import { TASK_TYPES, type TaskType } from "@/packages/pms/lib/housekeeping.server";
import {
  HK_CLEANING_TYPE_LABELS,
  HK_PRIORITY_LABELS,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import { nightsBetween, propertyToday } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  buildNotesActivity,
  buildStayNoteRows,
  filterHousekeepingTasks,
  filterStayNotes,
  housekeepingStatusLabel,
  housekeepingTaskLabel,
  importantStayNotes,
  NOTE_MAX,
  NOTE_PIN_GAP_COPY,
  NOTE_TABS,
  roomHousekeepingTasks,
  TRACE_NO_ROOM_COPY,
  TRACE_ROOM_GAP_COPY,
  TRACE_TABS,
  type NoteTabId,
  type TraceTabId,
} from "@/packages/pms/lib/reservation-detail-notes";
import {
  amendReservation,
  type ReservationDetail,
  type ReservationHistoryEntry,
} from "@/packages/pms/lib/reservations.functions";
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";

export function ReservationDetailNotesTab({
  restaurantId,
  reservation,
  guest,
  guestHistory,
  history,
  canManage,
  money,
  coverUrl,
  onBackToRequests,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  guestHistory: GuestHistoryEntry[];
  history: ReservationHistoryEntry[];
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  onBackToRequests: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { dateTime, timezone } = useRestaurantTime();
  const fetchTasks = useServerFn(listHousekeepingTasks);
  const createTask = useServerFn(createHousekeepingTask);
  const updateTask = useServerFn(updateHousekeepingTask);
  const completeTask = useServerFn(completeHousekeepingTask);
  const submitAmend = useServerFn(amendReservation);
  const submitGuestNote = useServerFn(addGuestNote);
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const today = propertyToday(timezone);

  const [noteTab, setNoteTab] = useState<NoteTabId>("all");
  const [traceTab, setTraceTab] = useState<TraceTabId>("all");
  const [traceSearch, setTraceSearch] = useState("");
  const [internalDraft, setInternalDraft] = useState(reservation.notes ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteKind, setNoteKind] = useState<"internal" | "guest">("internal");
  const [noteText, setNoteText] = useState("");
  const [traceOpen, setTraceOpen] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>("stayover_cleaning");
  const [taskNotes, setTaskNotes] = useState("");
  const [activityAll, setActivityAll] = useState(false);

  useEffect(() => {
    setInternalDraft(reservation.notes ?? "");
  }, [reservation.id, reservation.notes]);

  const tasksQuery = useQuery({
    queryKey: ["housekeeping-tasks", restaurantId, today, "reservation-notes"],
    queryFn: () => fetchTasks({ data: { restaurantId, today } }),
    enabled: Boolean(reservation.roomId),
    retry: false,
  });

  const noteRows = buildStayNoteRows({
    reservation,
    reservationHistory: history,
    guest,
    guestHistory,
  });
  const visibleNotes = filterStayNotes(noteRows, noteTab);
  const important = importantStayNotes(noteRows);
  const roomTasks = roomHousekeepingTasks(tasksQuery.data ?? [], reservation.roomId);
  const visibleTasks = filterHousekeepingTasks(roomTasks, traceTab, traceSearch);
  const activity = buildNotesActivity({
    reservationHistory: history,
    guestHistory,
    tasks: roomTasks,
  });
  const visibleActivity = activityAll ? activity : activity.slice(0, 8);

  const saveInternal = useMutation({
    mutationFn: (notes: string) =>
      submitAmend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: reservation.arrivalDate,
          departure: reservation.departureDate,
          adults: reservation.adults,
          children: reservation.children,
          notes,
          specialRequests: reservation.specialRequests,
          ratePlanId: reservation.ratePlanId,
        },
      }),
    onSuccess: () => {
      toast.success("Internal note updated.");
      setNoteOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addProfileNote = useMutation({
    mutationFn: () =>
      submitGuestNote({
        data: { restaurantId, guestId: reservation.guestId, note: noteText.trim() },
      }),
    onSuccess: () => {
      toast.success("Guest note added.");
      setNoteOpen(false);
      setNoteText("");
      void queryClient.invalidateQueries({
        queryKey: ["guest", restaurantId, reservation.guestId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createTrace = useMutation({
    mutationFn: () => {
      if (!reservation.roomId) throw new Error(TRACE_NO_ROOM_COPY);
      return createTask({
        data: {
          restaurantId,
          roomId: reservation.roomId,
          taskType,
          notes: taskNotes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Housekeeping task created.");
      setTraceOpen(false);
      setTaskNotes("");
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutateTask = useMutation({
    mutationFn: (input: { taskId: string; action: "start" | "cancel" | "complete" }) => {
      if (input.action === "complete") {
        return completeTask({ data: { restaurantId, taskId: input.taskId } });
      }
      return updateTask({
        data: { restaurantId, taskId: input.taskId, action: input.action },
      });
    },
    onSuccess: () => {
      toast.success("Housekeeping task updated.");
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openAddNote() {
    setNoteKind("internal");
    setNoteText(internalDraft);
    setNoteOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-notes">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 font-display text-base text-[#251605]">
                  <StickyNote className="size-4 text-[#B8954F]" />
                  Notes & Traces
                </h2>
                <p className="text-xs text-muted-foreground">
                  Manage reservation notes, operational instructions and follow-up tasks.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={!editable} onClick={openAddNote}>
                  <Plus className="mr-1 size-3.5" />
                  Add Note
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!editable}
                  onClick={() => {
                    if (!reservation.roomId) {
                      toast.message(TRACE_NO_ROOM_COPY);
                      return;
                    }
                    setTraceOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-3.5" />
                  Add Trace
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-[#251605]">Important Notes</p>
              </div>
              {important.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#E4D6B8] px-3 py-4 text-xs text-muted-foreground">
                  {NOTE_PIN_GAP_COPY}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {important.map((row) => (
                    <article
                      key={row.id}
                      className="rounded-lg border border-[#EEE6D8] bg-[#FFFcf7] p-3 text-xs"
                    >
                      <p className="font-semibold text-[#251605]">{row.type}</p>
                      <p className="mt-1 text-[#251605]">{row.note}</p>
                      <p className="mt-2 text-muted-foreground">
                        {reviewDash(row.user)} · {dateTime(row.at)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
            data-testid="notes-table"
          >
            <div className="mb-3 flex flex-wrap gap-1">
              {NOTE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    noteTab === tab.id ? "bg-[#251605] text-white" : "bg-[#F7F2EA] text-[#251605]",
                  )}
                  onClick={() => setNoteTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {visibleNotes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground">
                No notes recorded for this filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Date & Time</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Category</th>
                      <th className="py-2 pr-2">Note</th>
                      <th className="py-2 pr-2">User</th>
                      <th className="py-2 pr-2">Visibility</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNotes.map((row, index) => (
                      <tr key={row.id} className="border-b border-[#F4EEE4]">
                        <td className="py-2 pr-2">{index + 1}</td>
                        <td className="py-2 pr-2 text-muted-foreground">{dateTime(row.at)}</td>
                        <td className="py-2 pr-2">{row.type}</td>
                        <td className="py-2 pr-2">{row.category}</td>
                        <td className="py-2 pr-2">{row.note}</td>
                        <td className="py-2 pr-2">{reviewDash(row.user)}</td>
                        <td className="py-2 pr-2">{row.visibility}</td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            {row.editable ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={!editable}
                                aria-label="Edit note"
                                onClick={() => {
                                  setNoteKind("internal");
                                  setNoteText(internalDraft);
                                  setNoteOpen(true);
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Pin note"
                              onClick={() => toast.message(NOTE_PIN_GAP_COPY)}
                            >
                              <Pin className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
            data-testid="traces-table"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base text-[#251605]">Traces / Tasks</h2>
                <p className="text-xs text-muted-foreground">{TRACE_ROOM_GAP_COPY}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {TRACE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium",
                      traceTab === tab.id
                        ? "bg-[#251605] text-white"
                        : "bg-[#F7F2EA] text-[#251605]",
                    )}
                    onClick={() => setTraceTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
                <div className="relative">
                  <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
                  <Input
                    className={`${FIELD} w-44 pl-7`}
                    placeholder="Search traces…"
                    value={traceSearch}
                    onChange={(e) => setTraceSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {tasksQuery.error instanceof Error ? (
              <p className="mb-2 text-sm text-destructive">{tasksQuery.error.message}</p>
            ) : null}
            {!reservation.roomId ? (
              <p className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground">
                {TRACE_NO_ROOM_COPY}
              </p>
            ) : visibleTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground">
                No housekeeping tasks for this room.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Task / Trace</th>
                      <th className="py-2 pr-2">Assigned To</th>
                      <th className="py-2 pr-2">Department</th>
                      <th className="py-2 pr-2">Priority</th>
                      <th className="py-2 pr-2">Due Date & Time</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Completed On</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task, index) => (
                      <tr key={task.id} className="border-b border-[#F4EEE4]">
                        <td className="py-2 pr-2">{index + 1}</td>
                        <td className="py-2 pr-2">
                          {housekeepingTaskLabel(task.taskType)}
                          {task.notes ? (
                            <span className="block text-xs text-muted-foreground">
                              {task.notes}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-2">{reviewDash(task.assignedName)}</td>
                        <td className="py-2 pr-2">Housekeeping</td>
                        <td className="py-2 pr-2">
                          {HK_PRIORITY_LABELS[task.priority] ?? task.priority}
                        </td>
                        <td className="py-2 pr-2">{DETAIL_DASH}</td>
                        <td className="py-2 pr-2">{housekeepingStatusLabel(task.status)}</td>
                        <td className="py-2 pr-2">
                          {task.completedAt ? dateTime(task.completedAt) : DETAIL_DASH}
                        </td>
                        <td className="py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label="Task actions"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {task.status === "pending" || task.status === "assigned" ? (
                                <DropdownMenuItem
                                  disabled={!editable || mutateTask.isPending}
                                  onClick={() =>
                                    mutateTask.mutate({ taskId: task.id, action: "start" })
                                  }
                                >
                                  Start
                                </DropdownMenuItem>
                              ) : null}
                              {task.status === "in_progress" ? (
                                <DropdownMenuItem
                                  disabled={!editable || mutateTask.isPending}
                                  onClick={() =>
                                    mutateTask.mutate({ taskId: task.id, action: "complete" })
                                  }
                                >
                                  Complete
                                </DropdownMenuItem>
                              ) : null}
                              {task.status !== "completed" && task.status !== "cancelled" ? (
                                <DropdownMenuItem
                                  disabled={!editable || mutateTask.isPending}
                                  onClick={() =>
                                    mutateTask.mutate({ taskId: task.id, action: "cancel" })
                                  }
                                >
                                  Cancel
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
            data-testid="notes-activity"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base text-[#251605]">Activity History</h2>
              <Button type="button" size="sm" variant="ghost" onClick={() => setActivityAll(true)}>
                View All
              </Button>
            </div>
            {visibleActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No note or housekeeping-task activity yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2">Date & Time</th>
                      <th className="py-2 pr-2">User</th>
                      <th className="py-2 pr-2">Action</th>
                      <th className="py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleActivity.map((row) => (
                      <tr key={row.id} className="border-b border-[#F4EEE4]">
                        <td className="py-2 pr-2 text-muted-foreground">{dateTime(row.at)}</td>
                        <td className="py-2 pr-2">{reviewDash(row.user)}</td>
                        <td className="py-2 pr-2">{row.action}</td>
                        <td className="py-2">{row.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <NotesSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToRequests}>
          Back to Requests & Preferences
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || saveInternal.isPending}
            onClick={() => saveInternal.mutate(internalDraft)}
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setInternalDraft(reservation.notes ?? "")}
          >
            Cancel
          </Button>
        </div>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Store</Label>
              <Select
                value={noteKind}
                onValueChange={(value) => setNoteKind(value as "internal" | "guest")}
              >
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Reservation internal note</SelectItem>
                  <SelectItem value="guest">Guest profile note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {noteKind === "internal" ? (
              <p className="text-xs text-muted-foreground">
                This reservation has one internal notes field. Saving replaces the current value.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Guest notes are stored on the guest profile history, not as typed reservation notes.
              </p>
            )}
            <Textarea
              maxLength={NOTE_MAX}
              value={noteKind === "internal" ? noteText : noteText}
              onChange={(e) => setNoteText(e.target.value.slice(0, NOTE_MAX))}
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveInternal.isPending || addProfileNote.isPending || !noteText.trim()}
              onClick={() => {
                if (noteKind === "internal") {
                  setInternalDraft(noteText);
                  saveInternal.mutate(noteText);
                } else {
                  addProfileNote.mutate();
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={traceOpen} onOpenChange={setTraceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add housekeeping task</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{TRACE_ROOM_GAP_COPY}</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Task type</Label>
              <Select value={taskType} onValueChange={(value) => setTaskType(value as TaskType)}>
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {HK_CLEANING_TYPE_LABELS[type] ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                maxLength={500}
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTraceOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createTrace.isPending}
              onClick={() => createTrace.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotesSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);
  return (
    <aside className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock
        icon={<CalendarDays className="size-3.5 text-[#B8954F]" />}
        title="Stay Information"
      >
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title="Room Information"
      >
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Guarantee & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
