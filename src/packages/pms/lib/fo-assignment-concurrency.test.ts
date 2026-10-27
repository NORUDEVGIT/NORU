import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const drizzle = read("drizzle/migrations/0183_room_assignment_concurrency.sql");
const supabase = read("supabase/migrations/0183_room_assignment_concurrency.sql");
const reservations = read("src/packages/pms/lib/reservations.functions.ts");
const dialogs = read("src/packages/pms/components/frontoffice/front-office-dialogs.tsx");
const rooms = read("src/packages/pms/components/workspaces/reservation-detail-rooms.tsx");

const assignFn = reservations.slice(
  reservations.indexOf("export const assignReservationRoom"),
  reservations.indexOf("export const applyReservationRoomPackage"),
);

describe("FO-06 assignment concurrency", () => {
  it("keeps the two migration lanes identical and atomically rejects a stale unit snapshot", () => {
    expect(drizzle).toBe(supabase);
    expect(drizzle).toContain(
      "DROP FUNCTION IF EXISTS public.assign_hotel_reservation_room_unit(uuid, uuid, uuid, uuid, uuid)",
    );
    expect(drizzle).toContain("_expected_room_id uuid DEFAULT NULL");
    expect(drizzle).toContain("_expected_updated_at timestamptz DEFAULT NULL");
    expect(drizzle).toContain("FOR UPDATE");
    expect(drizzle).toContain("RAISE EXCEPTION 'ASSIGNMENT_STALE'");
    expect(drizzle).toContain("PERFORM public.assert_reservation_room_unit_room");
    expect(drizzle).toContain("assert_room_assignable locks the");
  });

  it("passes the opened assignment snapshot to the existing writer and exposes a stable conflict", () => {
    expect(assignFn).toContain("expectedRoomId: idSchema.nullable().optional()");
    expect(assignFn).toContain("expectedUpdatedAt: z.string().min(1).nullable().optional()");
    expect(assignFn).toContain("_expected_room_id: data.expectedRoomId");
    expect(assignFn).toContain("_expected_updated_at: data.expectedUpdatedAt");
    expect(reservations).toContain("export const ROOM_ASSIGNMENT_STALE");
    expect(reservations).toContain("ASSIGNMENT_STALE");
    expect(assignFn).not.toContain(".update({ room_id: data.roomId })");
  });

  it("refreshes candidates after a conflict while retaining the active assignment workspace", () => {
    expect(dialogs).toContain('queryKey: ["assignable-rooms"]');
    expect(dialogs).toContain("expectedRoomId: targetStay.roomId");
    expect(dialogs).toContain("expectedUpdatedAt: stay.updatedAt ?? null");
    expect(dialogs).toContain("onError: (error) => {\n      refresh();");
    expect(rooms).toContain("...unitAssignmentSnapshot({");
    expect(rooms).toContain("reservationRoomId: input.reservationRoomId,");
    expect(rooms).toContain("updatedAt: reservation.updatedAt,");
    expect(rooms).not.toContain("?.roomId ?? reservation.roomId");
    expect(rooms).toContain("void assignableQuery.refetch()");
    expect(rooms).toContain("void displayQuery.refetch()");
    expect(rooms).toContain("setAssignmentMode(null);");
  });
});
