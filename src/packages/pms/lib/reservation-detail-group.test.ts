import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import {
  labeledHousekeepingTasks,
  roomHousekeepingTasks,
} from "@/packages/pms/lib/reservation-detail-notes";
import type { HousekeepingTask } from "@/packages/pms/lib/housekeeping.functions";
import {
  GROUP_AMEND_UNAVAILABLE,
  GROUP_COPY_UNAVAILABLE,
  GROUP_RATE_CHANGE_PER_ROOM,
  groupActionGate,
  groupAssignmentSummary,
  groupCombinedSubtotal,
  groupOccupancyTotals,
  groupPoliciesNote,
  groupRoomRateSections,
  groupRoomSummaryLines,
  historyContextLine,
  isGroupReservation,
  reservationHeaderGuestLabel,
  reservationHeaderRoomKpi,
  resolveHistoryField,
  traceRoomTargets,
  type GroupReservationSlice,
  type GroupRoomSlice,
} from "@/packages/pms/lib/reservation-detail-group";

const ROOM_1 = "dc775fe6-6eb7-46b4-876b-4a8bd900bf95";
const ROOM_2 = "3593de8a-e9ec-4021-8a5c-5030d11bde0d";
const ABEL = "61bfc8ad-b5d1-4726-b213-778de691621e";
const ABEBAW = "d6434023-7b2d-4ec3-a377-316c9c8dd223";
const PHYSICAL_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function unit(
  overrides: Partial<GroupRoomSlice> & Pick<GroupRoomSlice, "id" | "unitSequence">,
): GroupRoomSlice {
  return {
    roomId: null,
    roomTypeName: "Twin",
    ratePlanId: "plan-1",
    ratePlanName: "BAR",
    adults: 1,
    children: 0,
    infants: 0,
    status: "confirmed",
    roomSubtotal: 1500,
    nightlyRates: [{ date: "2026-10-18", rate: 1500 }],
    occupants: [{ guestId: ABEL, name: "Abel Abraha", isPrimary: true }],
    ...overrides,
  };
}

const single: GroupReservationSlice = {
  reservationMode: "single",
  guestId: ABEL,
  guestName: "Abel Abraha",
  roomId: PHYSICAL_1,
  roomNumber: "101",
  roomTypeName: "Twin",
  roomSubtotal: 1500,
  rooms: [unit({ id: ROOM_1, unitSequence: 1, roomId: PHYSICAL_1, roomNumber: "101" })],
};

const group: GroupReservationSlice = {
  reservationMode: "group",
  guestId: ABEL,
  guestName: "Abel Abraha",
  roomId: null,
  roomNumber: null,
  roomSubtotal: 31500,
  rooms: [
    unit({
      id: ROOM_1,
      unitSequence: 1,
      roomTypeName: "Card2 Smoke Twin",
      ratePlanId: "bar",
      ratePlanName: "BAR",
      adults: 1,
      children: 1,
      infants: 0,
      roomSubtotal: 13500,
      nightlyRates: [
        { date: "2026-10-18", rate: 1500 },
        { date: "2026-10-19", rate: 1500 },
      ],
      occupants: [{ guestId: ABEL, name: "Abel Abraha", isPrimary: true }],
    }),
    unit({
      id: ROOM_2,
      unitSequence: 2,
      roomId: PHYSICAL_1,
      roomNumber: "204",
      roomTypeName: "Deluxe-King",
      ratePlanId: "deluxe",
      ratePlanName: "Deluxe-king J",
      adults: 2,
      children: 0,
      infants: 1,
      roomSubtotal: 18000,
      nightlyRates: [
        { date: "2026-10-18", rate: 2000 },
        { date: "2026-10-19", rate: 2500 },
      ],
      occupants: [{ guestId: ABEBAW, name: "Abebaw Demeke", isPrimary: true }],
    }),
  ],
};

const summary = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-summary.tsx"),
  "utf8",
);
const stay = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-stay.tsx"),
  "utf8",
);
const guest = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-guest.tsx"),
  "utf8",
);
const rooms = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-rooms.tsx"),
  "utf8",
);
const rates = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-rates.tsx"),
  "utf8",
);
const notes = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-notes.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const overview = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-overview.tsx"),
  "utf8",
);
const packages = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-packages.tsx"),
  "utf8",
);
const folio = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-folio.tsx"),
  "utf8",
);
const requests = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-requests.tsx"),
  "utf8",
);

describe("reservation detail group projection", () => {
  it("keeps a one-room reservation on the single summary path", () => {
    expect(isGroupReservation(single)).toBe(false);
    expect(summary).toContain("This reservation has one room.");
    expect(summary).toContain('data-reservation-summary={group ? "group" : "single"}');
    expect(groupRoomSummaryLines(single)).toHaveLength(1);
  });

  it("projects two group rooms, occupants, occupancy, and the combined total", () => {
    expect(isGroupReservation(group)).toBe(true);
    expect(groupRoomSummaryLines(group)).toEqual([
      "Room 1 · Abel Abraha · Card2 Smoke Twin",
      "Room 2 · Abebaw Demeke · Deluxe-King",
    ]);
    expect(groupOccupancyTotals(group)).toEqual({ rooms: 2, adults: 3, children: 1, infants: 1 });
    expect(groupCombinedSubtotal(group)).toBe(31500);
    expect(groupAssignmentSummary(group).label).toBe("1 of 2 rooms assigned");
    expect(summary).toContain("Primary Guest / Booker");
    expect(summary).toContain("Group Reservation");
    expect(summary).toContain("groupRoomSummaryLines(reservation)");
    expect(summary).not.toContain("rooms_requested");
  });

  it("makes the header room KPI and guest label group-aware without changing single", () => {
    expect(reservationHeaderRoomKpi(single)).toEqual({
      label: "Room",
      value: "Room 101",
      hint: "Twin",
    });
    expect(reservationHeaderGuestLabel(single)).toBeNull();
    expect(reservationHeaderRoomKpi(group)).toEqual({
      label: "Rooms",
      value: "2 rooms",
      hint: "1 assigned",
    });
    expect(reservationHeaderGuestLabel(group)).toBe("Primary Guest / Booker");
    expect(workspace).toContain("reservationHeaderRoomKpi(reservation)");
    expect(workspace).toContain("reservationHeaderGuestLabel(reservation)");
  });

  it("keeps group stay occupancy aggregate and gates one-room amend", () => {
    expect(stay).toContain("groupStay ? groupOccupancy.adults : draft.adults");
    expect(stay).toContain("GROUP_OCCUPANCY_NOTE");
    expect(stay).toContain("stay-group-amend-unavailable");
    expect(stay).toContain("GROUP_AMEND_UNAVAILABLE");
    expect(stay).toContain("Amend dates");
    expect(stay).toContain("Extend Stay");
    expect(groupActionGate("amend", false)).toBeNull();
    expect(groupActionGate("amend", true)).toBe(GROUP_AMEND_UNAVAILABLE);
  });

  it("shows the booker and both room occupants without calling room 2 accompanying", () => {
    const occupants = guest.slice(
      guest.indexOf("function RoomOccupantsCard"),
      guest.indexOf("function PrimaryGuestCard"),
    );
    expect(guest).toContain('groupGuest ? "Primary Guest / Booker" : "Primary Guest Information"');
    expect(occupants).toContain("Room Guests / Occupants");
    expect(occupants).toContain("Primary Occupant");
    expect(occupants.toLowerCase()).not.toContain("accompanying");
    expect(guest).toContain("AccompanyingGuestsCard");
    expect(guest).toContain("GROUP_PROFILE_PREFERENCE_NOTE");
    expect(requests).toContain("Primary Guest / Booker Preferences");
    expect(requests).toContain("GROUP_PROFILE_PREFERENCE_NOTE");
  });

  it("keeps one operational card per room and the available-room list", () => {
    expect(rooms).toContain("units.length > 1 ? null : (");
    expect(rooms).toContain("Room(s) for this Reservation");
    expect(rooms).toContain("Available Rooms");
    expect(rooms).toContain("<ReservationRoomOccupants");
    expect(rooms).toContain("roomActionsFor");
    expect(rooms).not.toContain("isGroupReservation(reservation) ? null");
  });

  it("keeps the single rate grid and renders one priced section per group room", () => {
    const sections = groupRoomRateSections(group);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.ratePlanName).toBe("BAR");
    expect(sections[1]?.ratePlanName).toBe("Deluxe-king J");
    expect(sections[0]?.nights.map((night) => night.rate)).toEqual([1500, 1500]);
    expect(sections[1]?.nights.map((night) => night.rate)).toEqual([2000, 2500]);
    expect(sections[0]?.uniformRate).toBe(1500);
    expect(sections[1]?.uniformRate).toBeNull();
    expect(sections[0]?.subtotal).toBe(13500);
    expect(sections[1]?.subtotal).toBe(18000);
    expect(groupCombinedSubtotal(group)).toBe(31500);
    expect(rates).toContain("nightlyBreakdownRows(read.unit, plan)");
    expect(rates).toContain("<GroupRoomRates");
    expect(rates).toContain("GROUP_RATE_CHANGE_PER_ROOM");
    expect(rates).toContain("repriceReservation");
    expect(groupActionGate("rate", true)).toBeNull();
    expect(GROUP_RATE_CHANGE_PER_ROOM).toContain("selected room");
    expect(groupActionGate("rate", false)).toBeNull();
    expect(overview).toContain('data-testid="overview-group-rates"');
    expect(overview).toContain("Room-specific nightly rates");
    expect(overview).toContain('data-testid="overview-group-rooms"');
    expect(groupPoliciesNote(group)).toBe("Policies vary by room");
  });

  it("loads traces for every assigned group room and keeps the single room filter", () => {
    const task = (roomId: string): HousekeepingTask =>
      ({
        id: roomId,
        roomId,
        roomNumber: "204",
        roomTypeName: "Deluxe-King",
        taskType: "stayover_cleaning",
        status: "pending",
        priority: "normal",
        assignedMembershipId: null,
        assignedName: null,
        notes: null,
        createdAt: "2026-10-18T00:00:00.000Z",
        startedAt: null,
        completedAt: null,
      }) as HousekeepingTask;
    expect(traceRoomTargets(single)).toEqual([{ roomId: PHYSICAL_1, label: "Room" }]);
    expect(roomHousekeepingTasks([task(PHYSICAL_1), task("other")], PHYSICAL_1)).toHaveLength(1);
    expect(traceRoomTargets(group)).toEqual([{ roomId: PHYSICAL_1, label: "Room 2 · 204" }]);
    const labeled = labeledHousekeepingTasks([task(PHYSICAL_1)], traceRoomTargets(group));
    expect(labeled.map((row) => row.roomContext)).toEqual(["Room 2 · 204"]);
    expect(JSON.stringify(labeled)).not.toContain(ROOM_2);
    expect(notes).toContain("labeledHousekeepingTasks");
    expect(notes).toContain("roomHousekeepingTasks(tasksQuery.data ?? [], reservation.roomId)");
  });

  it("resolves history room and guest ids without rendering raw UUIDs", () => {
    const payload = {
      reservation_room_id: ROOM_2,
      unit_sequence: 2,
      guest_id: ABEBAW,
      room_id: PHYSICAL_1,
    };
    const changes = reservationHistoryChanges(null, payload, (key, value) =>
      resolveHistoryField(key, value, group),
    );
    const rendered = JSON.stringify(changes);
    expect(rendered).not.toContain(ROOM_2);
    expect(rendered).not.toContain(ABEBAW);
    expect(rendered).not.toContain(PHYSICAL_1);
    expect(historyContextLine(null, payload, group)).toBe("Room 2 · 204 · Abebaw Demeke");
    expect(changes.find((change) => change.key === "guest_id")?.to).toBe("Abebaw Demeke");
    expect(changes.find((change) => change.key === "reservation_room_id")?.to).toBe("Room 2 · 204");
    expect(workspace).toContain("resolveHistoryField");
  });

  it("gates group copy and amend and leaves front office, print, folio, and deferred tabs", () => {
    expect(groupActionGate("copy", false)).toBeNull();
    expect(groupActionGate("copy", true)).toBe(GROUP_COPY_UNAVAILABLE);
    expect(workspace).toContain('groupActionGate("copy", groupReservation)');
    expect(workspace).toContain('groupActionGate("amend", groupReservation)');
    expect(workspace).toContain("if (isGroupReservation(reservation)) return;");
    expect(workspace).toContain("<CheckInDialog");
    expect(workspace).toContain("initialReservationRoomId");
    expect(workspace).toContain('reservationKind: persistedGroup ? "group" : "single"');
    expect(packages).toContain("getReservationUnitPackages");
    expect(packages).not.toContain("reservation.roomTypeId");
    expect(packages).not.toContain("reservation.ratePlanId");
    expect(packages).toContain("GROUP_PACKAGE_NOTE");
    expect(folio).toContain("reservationId: reservation.id");
    expect(folio).not.toContain("one folio per room");
    expect(workspace).toContain('deferredPanel("Communication", COMMUNICATION_DEFERRED_COPY)');
    expect(workspace).toContain('deferredPanel("Linked Reservations", LINKED_DEFERRED_COPY)');
    expect(workspace).not.toContain("linked room unit");
  });
});
