import { useEffect, useState } from "react";
import { isGroupReservation, traceRoomTargets } from "@/packages/pms/lib/reservation-detail-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Pin, Plus, Search, StickyNote } from "lucide-react";

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
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
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
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
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
  labeledHousekeepingTasks,
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

// Simple white card theme
const FIELD =
  "h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-gray-50";
const AREA = "border-gray-200 bg-white text-[#251605]";
const CARD = "rounded-xl border border-gray-200 bg-white p-4";
const BTN_PRIMARY = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";
const BTN_OUTLINE = "border-gray-200 bg-white text-[#4A2C0F] hover:bg-gray-50";
const BTN_GHOST = "text-[#4A2C0F] hover:bg-gray-50";
const MUTED = "text-muted-foreground";
const TH = "border-b border-gray-200 text-[11px] uppercase tracking-wide";
const ROW = "border-b border-gray-100";
const EMPTY = "rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm";
const MENU_ITEM = "text-[#251605] focus:bg-gray-100 focus:text-[#251605]";

function pill(active: boolean) {
  return cn(
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active
      ? "border-[#4A2C0F] bg-[#4A2C0F] text-white"
      : "border-gray-200 bg-white text-[#4A2C0F] hover:bg-gray-50",
  );
}

export function ReservationDetailNotesTab({
  restaurantId,
  reservation,
  guest,
  guestHistory,
  history,
  canManage,
  onBackToRequests,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  guestHistory: GuestHistoryEntry[];
  history: ReservationHistoryEntry[];
  canManage: boolean;
  // Kept optional so existing callers don't break; the summary panel no longer uses them.
  money?: (value: number) => string;
  coverUrl?: string | null;
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

  const groupNotes = isGroupReservation(reservation);
  const traceTargets = traceRoomTargets(reservation);
  const tasksQuery = useQuery({
    queryKey: ["housekeeping-tasks", restaurantId, today, "reservation-notes"],
    queryFn: () => fetchTasks({ data: { restaurantId, today } }),
    enabled: groupNotes ? traceTargets.length > 0 : Boolean(reservation.roomId),
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
  const roomTasks = groupNotes
    ? labeledHousekeepingTasks(tasksQuery.data ?? [], traceTargets)
    : roomHousekeepingTasks(tasksQuery.data ?? [], reservation.roomId).map((task) => ({
        ...task,
        roomContext: "",
      }));
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
      <div className="min-h-0 flex-1 space-y-4">
        <section className={CARD}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 font-display text-base text-[#251605]">
                <StickyNote className="size-4 text-muted-foreground" />
                Notes & Traces
              </h2>
              <p className={cn("text-xs", MUTED)}>
                Manage reservation notes, operational instructions and follow-up tasks.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={BTN_PRIMARY}
                disabled={!editable}
                onClick={openAddNote}
              >
                <Plus className="mr-1 size-3.5" />
                Add Note
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={BTN_OUTLINE}
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
            <p className="mb-2 text-sm font-medium text-[#4A2C0F]">Important Notes</p>
            {important.length === 0 ? (
              <p
                className={cn(
                  "rounded-lg border border-dashed border-gray-200 px-3 py-4 text-xs",
                  MUTED,
                )}
              >
                {NOTE_PIN_GAP_COPY}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {important.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs"
                  >
                    <p className="font-semibold text-[#4A2C0F]">{row.type}</p>
                    <p className="mt-1 text-[#251605]">{row.note}</p>
                    <p className={cn("mt-2", MUTED)}>
                      {reviewDash(row.user)} · {dateTime(row.at)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={CARD} data-testid="notes-table">
          <div className="mb-3 flex flex-wrap gap-1">
            {NOTE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={pill(noteTab === tab.id)}
                onClick={() => setNoteTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {visibleNotes.length === 0 ? (
            <p className={cn(EMPTY, MUTED)}>No notes recorded for this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm text-[#251605]">
                <thead className={cn(TH, MUTED)}>
                  <tr>
                    <th className="px-2 py-2">#</th>
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
                    <tr key={row.id} className={ROW}>
                      <td className="px-2 py-2">{index + 1}</td>
                      <td className={cn("py-2 pr-2", MUTED)}>{dateTime(row.at)}</td>
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
                              className={BTN_GHOST}
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
                            className={BTN_GHOST}
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

        <section className={CARD} data-testid="traces-table">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base text-[#251605]">Traces / Tasks</h2>
              <p className={cn("text-xs", MUTED)}>{TRACE_ROOM_GAP_COPY}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TRACE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={pill(traceTab === tab.id)}
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
          {!(groupNotes ? traceTargets.length > 0 : reservation.roomId) ? (
            <p className={cn(EMPTY, MUTED)}>{TRACE_NO_ROOM_COPY}</p>
          ) : visibleTasks.length === 0 ? (
            <p className={cn(EMPTY, MUTED)}>No housekeeping tasks for this room.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm text-[#251605]">
                <thead className={cn(TH, MUTED)}>
                  <tr>
                    <th className="px-2 py-2">#</th>
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
                    <tr key={task.id} className={ROW}>
                      <td className="px-2 py-2">{index + 1}</td>
                      <td className="py-2 pr-2">
                        {groupNotes && task.roomContext ? (
                          <span className="block text-xs text-[#4A2C0F]">{task.roomContext}</span>
                        ) : null}
                        {housekeepingTaskLabel(task.taskType)}
                        {task.notes ? (
                          <span className={cn("block text-xs", MUTED)}>{task.notes}</span>
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
                              className={BTN_GHOST}
                              aria-label="Task actions"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white">
                            {task.status === "pending" || task.status === "assigned" ? (
                              <DropdownMenuItem
                                className={MENU_ITEM}
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
                                className={MENU_ITEM}
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
                                className={MENU_ITEM}
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

        <section className={CARD} data-testid="notes-activity">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base text-[#251605]">Activity History</h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={BTN_GHOST}
              onClick={() => setActivityAll(true)}
            >
              View All
            </Button>
          </div>
          {visibleActivity.length === 0 ? (
            <p className={cn("text-sm", MUTED)}>No note or housekeeping-task activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#251605]">
                <thead className={cn(TH, MUTED)}>
                  <tr>
                    <th className="px-2 py-2">Date & Time</th>
                    <th className="py-2 pr-2">User</th>
                    <th className="py-2 pr-2">Action</th>
                    <th className="py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActivity.map((row) => (
                    <tr key={row.id} className={ROW}>
                      <td className={cn("px-2 py-2", MUTED)}>{dateTime(row.at)}</td>
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={BTN_OUTLINE}
          onClick={onBackToRequests}
        >
          Back to Requests & Preferences
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className={BTN_PRIMARY}
            disabled={!editable || saveInternal.isPending}
            onClick={() => saveInternal.mutate(internalDraft)}
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={BTN_OUTLINE}
            onClick={() => setInternalDraft(reservation.notes ?? "")}
          >
            Cancel
          </Button>
        </div>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#251605]">Add note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[#4A2C0F]">Store</Label>
              <Select
                value={noteKind}
                onValueChange={(value) => setNoteKind(value as "internal" | "guest")}
              >
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="internal">Reservation internal note</SelectItem>
                  <SelectItem value="guest">Guest profile note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {noteKind === "internal" ? (
              <p className={cn("text-xs", MUTED)}>
                This reservation has one internal notes field. Saving replaces the current value.
              </p>
            ) : (
              <p className={cn("text-xs", MUTED)}>
                Guest notes are stored on the guest profile history, not as typed reservation notes.
              </p>
            )}
            <Textarea
              maxLength={NOTE_MAX}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value.slice(0, NOTE_MAX))}
              className={cn("min-h-28", AREA)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={BTN_OUTLINE}
              onClick={() => setNoteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={BTN_PRIMARY}
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
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#251605]">Add housekeeping task</DialogTitle>
          </DialogHeader>
          <p className={cn("text-xs", MUTED)}>{TRACE_ROOM_GAP_COPY}</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[#4A2C0F]">Task type</Label>
              <Select value={taskType} onValueChange={(value) => setTaskType(value as TaskType)}>
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {HK_CLEANING_TYPE_LABELS[type] ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-notes" className="text-[#4A2C0F]">
                Notes
              </Label>
              <Textarea
                id="task-notes"
                maxLength={500}
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                className={AREA}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={BTN_OUTLINE}
              onClick={() => setTraceOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={BTN_PRIMARY}
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