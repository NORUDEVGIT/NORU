import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { HousekeepingTask } from "@/packages/pms/lib/housekeeping.functions";
import {
  buildNotesActivity,
  buildStayNoteRows,
  filterHousekeepingTasks,
  filterStayNotes,
  importantStayNotes,
  roomHousekeepingTasks,
} from "@/packages/pms/lib/reservation-detail-notes";
import type { ReservationHistoryEntry } from "@/packages/pms/lib/reservations.functions";

const notesUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-notes.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);

const history: ReservationHistoryEntry[] = [
  {
    id: "h1",
    eventType: "amended",
    previousValues: { notes: "" },
    newValues: { notes: "VIP Guest. Ensure special attention during stay." },
    notes: null,
    createdAt: "2026-09-20T14:20:00Z",
    actorName: "Abebaw Demeke",
  },
];

describe("Reservation Detail Notes & Traces tab", () => {
  it("wires the Notes workspace and does not keep the notes-only editor on this tab", () => {
    expect(workspace).toContain("<ReservationDetailNotesTab");
    expect(workspace).toContain('detailTab === "notes"');
    expect(workspace).toContain('onBackToRequests={() => setDetailTab("requests")}');
    expect(workspace).not.toContain('detailTab === "notes" ? (\n                <NotesEditor');
    expect(notesUi).toContain("amendReservation");
    expect(notesUi).toContain("addGuestNote");
    expect(notesUi).toContain("listHousekeepingTasks");
    expect(notesUi).toContain("createHousekeepingTask");
    expect(notesUi).toContain("Back to Requests & Preferences");
    expect(notesUi).not.toContain("createGuestServiceRequest");
  });

  it("uses reservation notes and guest history without inventing typed categories or pins", () => {
    const rows = buildStayNoteRows({
      reservation: {
        id: "res-1",
        notes: "VIP Guest. Ensure special attention during stay.",
        updatedAt: "2026-09-20T14:20:00Z",
      },
      reservationHistory: history,
      guest: null,
      guestHistory: [
        {
          id: "g1",
          eventType: "note_added",
          previousValues: null,
          newValues: null,
          notes: "Anniversary celebration.",
          actorName: "Maria (TA)",
          createdAt: "2026-09-19T16:45:00Z",
        },
      ],
    });
    expect(rows.map((row) => row.type).sort()).toEqual(["Guest", "Internal"]);
    expect(filterStayNotes(rows, "internal")).toHaveLength(1);
    expect(importantStayNotes(rows)).toEqual([]);
    expect(notesUi).toContain("NOTE_PIN_GAP_COPY");
    expect(notesUi).not.toContain("Billing Notes");
    expect(notesUi).not.toContain("Issue / Complaint");
  });

  it("scopes housekeeping tasks to the assigned room and records real activity only", () => {
    const tasks: HousekeepingTask[] = [
      {
        id: "t1",
        roomId: "room-1",
        roomNumber: "12",
        roomTypeName: "Deluxe",
        taskType: "stayover_cleaning",
        status: "pending",
        priority: "high",
        assignedMembershipId: null,
        assignedName: "Dawit",
        notes: "Call guest",
        createdAt: "2026-09-21T09:00:00Z",
        startedAt: null,
        completedAt: null,
      },
      {
        id: "t2",
        roomId: "room-2",
        roomNumber: "13",
        roomTypeName: "Deluxe",
        taskType: "departure_cleaning",
        status: "completed",
        priority: "normal",
        assignedMembershipId: null,
        assignedName: null,
        notes: null,
        createdAt: "2026-09-20T09:00:00Z",
        startedAt: null,
        completedAt: "2026-09-20T11:00:00Z",
      },
    ];
    expect(roomHousekeepingTasks(tasks, "room-1")).toHaveLength(1);
    expect(filterHousekeepingTasks(tasks, "pending", "")).toHaveLength(1);
    const activity = buildNotesActivity({
      reservationHistory: history,
      guestHistory: [],
      tasks: roomHousekeepingTasks(tasks, "room-1"),
    });
    expect(activity.some((row) => row.action === "Updated internal note")).toBe(true);
    expect(activity.some((row) => row.action === "Created housekeeping task")).toBe(true);
    expect(activity.every((row) => row.at)).toBe(true);
  });
});
