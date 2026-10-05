import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import type { GuestHistoryEntry, GuestProfile } from "@/packages/pms/lib/guests.functions";
import type { HousekeepingTask } from "@/packages/pms/lib/housekeeping.functions";
import type { TaskStatus } from "@/packages/pms/lib/housekeeping.server";
import {
  HK_CLEANING_TYPE_LABELS,
  type HkCleaningType,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import type {
  ReservationDetail,
  ReservationHistoryEntry,
} from "@/packages/pms/lib/reservations.functions";

export const NOTE_MAX = 2000;

export const NOTE_PIN_GAP_COPY =
  "Pinned notes are not stored on this reservation. Important notes appear only when a real pin exists.";

export const TRACE_ROOM_GAP_COPY =
  "Reservation traces are not stored. Housekeeping tasks for the assigned room can be managed here.";

export const TRACE_NO_ROOM_COPY =
  "Assign a room before creating a housekeeping task from this reservation.";

export const NOTE_TABS = [
  { id: "all", label: "All" },
  { id: "internal", label: "Internal Notes" },
  { id: "guest", label: "Guest Notes" },
] as const;

export type NoteTabId = (typeof NOTE_TABS)[number]["id"];

export const TRACE_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
] as const;

export type TraceTabId = (typeof TRACE_TABS)[number]["id"];

export type StayNoteRow = {
  id: string;
  source: "reservation" | "guest_profile" | "guest_history";
  at: string;
  type: "Internal" | "Guest";
  category: "Internal" | "Guest";
  note: string;
  user: string | null;
  visibility: "Internal" | "Guest profile";
  editable: boolean;
};

export type NotesActivityRow = {
  id: string;
  at: string;
  user: string | null;
  action: string;
  details: string;
};

export function lastNotesActor(
  history: ReservationHistoryEntry[],
): { at: string; user: string | null } | null {
  const matches = history.filter((entry) =>
    reservationHistoryChanges(entry.previousValues, entry.newValues).some(
      (change) => change.key === "notes" || change.key === "_notes",
    ),
  );
  const latest = matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return null;
  return { at: latest.createdAt, user: latest.actorName };
}

export function buildStayNoteRows(input: {
  reservation: Pick<ReservationDetail, "id" | "notes" | "updatedAt">;
  reservationHistory: ReservationHistoryEntry[];
  guest: GuestProfile | null;
  guestHistory: GuestHistoryEntry[];
}): StayNoteRow[] {
  const rows: StayNoteRow[] = [];
  const internal = input.reservation.notes?.trim();
  if (internal) {
    const actor = lastNotesActor(input.reservationHistory);
    rows.push({
      id: `reservation-notes-${input.reservation.id}`,
      source: "reservation",
      at: actor?.at ?? input.reservation.updatedAt,
      type: "Internal",
      category: "Internal",
      note: internal,
      user: actor?.user ?? null,
      visibility: "Internal",
      editable: true,
    });
  }
  const profileNote = input.guest?.notes?.trim();
  const historyTexts = new Set(
    input.guestHistory
      .filter((entry) => entry.eventType === "note_added")
      .map((entry) => entry.notes?.trim())
      .filter(Boolean) as string[],
  );
  if (profileNote && !historyTexts.has(profileNote)) {
    rows.push({
      id: `guest-notes-${input.guest!.id}`,
      source: "guest_profile",
      at: input.guest!.updatedAt ?? input.guest!.createdAt,
      type: "Guest",
      category: "Guest",
      note: profileNote,
      user: null,
      visibility: "Guest profile",
      editable: false,
    });
  }
  for (const entry of input.guestHistory) {
    if (entry.eventType !== "note_added") continue;
    const text = entry.notes?.trim();
    if (!text) continue;
    rows.push({
      id: entry.id,
      source: "guest_history",
      at: entry.createdAt,
      type: "Guest",
      category: "Guest",
      note: text,
      user: entry.actorName,
      visibility: "Guest profile",
      editable: false,
    });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export function filterStayNotes(rows: StayNoteRow[], tab: NoteTabId): StayNoteRow[] {
  if (tab === "internal") return rows.filter((row) => row.type === "Internal");
  if (tab === "guest") return rows.filter((row) => row.type === "Guest");
  return rows;
}

export function importantStayNotes(_rows: StayNoteRow[]): StayNoteRow[] {
  return [];
}

export function roomHousekeepingTasks(
  tasks: HousekeepingTask[],
  roomId: string | null,
): HousekeepingTask[] {
  if (!roomId) return [];
  return tasks.filter((task) => task.roomId === roomId);
}

export function filterHousekeepingTasks(
  tasks: HousekeepingTask[],
  tab: TraceTabId,
  search: string,
): HousekeepingTask[] {
  const term = search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (tab === "pending" && task.status !== "pending" && task.status !== "assigned") return false;
    if (tab === "in_progress" && task.status !== "in_progress") return false;
    if (tab === "completed" && task.status !== "completed") return false;
    if (!term) return true;
    const hay = [task.taskType, task.notes, task.assignedName, task.roomNumber, task.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(term);
  });
}

export function housekeepingTaskLabel(taskType: string): string {
  if (taskType in HK_CLEANING_TYPE_LABELS) {
    return HK_CLEANING_TYPE_LABELS[taskType as HkCleaningType];
  }
  return taskType.replace(/_/g, " ");
}

export function housekeepingStatusLabel(status: TaskStatus | string): string {
  if (status === "in_progress") return "In Progress";
  return String(status)
    .replace(/_/g, " ")
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

export function buildNotesActivity(input: {
  reservationHistory: ReservationHistoryEntry[];
  guestHistory: GuestHistoryEntry[];
  tasks: HousekeepingTask[];
}): NotesActivityRow[] {
  const rows: NotesActivityRow[] = [];
  for (const entry of input.reservationHistory) {
    const changes = reservationHistoryChanges(entry.previousValues, entry.newValues).filter(
      (change) => change.key === "notes" || change.key === "_notes",
    );
    if (changes.length === 0) continue;
    rows.push({
      id: entry.id,
      at: entry.createdAt,
      user: entry.actorName,
      action: "Updated internal note",
      details: changes.map((change) => change.to).join(" · ") || entry.notes?.trim() || "—",
    });
  }
  for (const entry of input.guestHistory) {
    if (entry.eventType !== "note_added") continue;
    const text = entry.notes?.trim();
    if (!text) continue;
    rows.push({
      id: entry.id,
      at: entry.createdAt,
      user: entry.actorName,
      action: "Added guest note",
      details: text,
    });
  }
  for (const task of input.tasks) {
    rows.push({
      id: `${task.id}-created`,
      at: task.createdAt,
      user: task.assignedName,
      action: "Created housekeeping task",
      details: housekeepingTaskLabel(task.taskType),
    });
    if (task.completedAt) {
      rows.push({
        id: `${task.id}-completed`,
        at: task.completedAt,
        user: task.assignedName,
        action: "Completed housekeeping task",
        details: housekeepingTaskLabel(task.taskType),
      });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}
