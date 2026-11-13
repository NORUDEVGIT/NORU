import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANCEL_ALL_UNITS_RPC,
  DIRECT_CANCEL_FAILED,
  DIRECT_CANCEL_NOT_ONLINE,
  DIRECT_CANCEL_REASON,
  cancelDirectBookingUnits,
  type CancelRpcClient,
} from "./direct-booking-cancel";
import { rollupReservationStatus, type ReservationUnitStatus } from "./reservation-room-units";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/0203_cancel_hotel_reservation_all_units.sql");
const handlerSource = read("src/packages/pms/lib/public-booking.functions.ts");

/**
 * In-memory model of the database contract of cancel_hotel_reservation_all_units:
 * one transaction, units cancelled through the unit step, header derived by rollup.
 * The SQL itself was exercised against the deployed schema in a rolled-back
 * transaction; this model pins the contract the application relies on.
 */
type World = {
  header: ReservationUnitStatus;
  units: Array<{ seq: number; status: ReservationUnitStatus; roomId: string | null }>;
  history: Array<{ event: string; unit: number }>;
};

function world(statuses: ReservationUnitStatus[], header?: ReservationUnitStatus): World {
  return {
    header: header ?? rollupReservationStatus(statuses),
    units: statuses.map((status, i) => ({ seq: i + 1, status, roomId: `room-${i + 1}` })),
    history: [],
  };
}

const clone = (w: World): World => structuredClone(w);

/** Mirrors the SQL. `failOnUnit` simulates a failing unit transition. */
function cancelAll(state: { w: World }, failOnUnit?: number): void {
  const tx = clone(state.w);
  if (tx.units.length === 0) throw new Error("ROOM_UNIT_REQUIRED");
  if (tx.units.some((u) => !["pending", "confirmed", "cancelled"].includes(u.status))) {
    throw new Error("INVALID_TRANSITION");
  }
  for (const unit of tx.units.filter((u) => u.status === "pending" || u.status === "confirmed")) {
    if (failOnUnit === unit.seq) throw new Error("unit transition failed");
    unit.status = "cancelled";
    unit.roomId = null;
    tx.header = rollupReservationStatus(tx.units.map((u) => u.status)); // only the rollup writes the header
    tx.history.push({ event: "cancelled", unit: unit.seq });
  }
  tx.header = rollupReservationStatus(tx.units.map((u) => u.status));
  if (tx.units.some((u) => u.status !== "cancelled") || tx.header !== "cancelled") {
    throw new Error("CANCELLATION_INCONSISTENT");
  }
  state.w = tx; // commit
}

function clientFor(state: { w: World }, failOnUnit?: number) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: CancelRpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      try {
        cancelAll(state, failOnUnit);
        return { error: null };
      } catch (e) {
        return { error: { message: (e as Error).message } };
      }
    },
  };
  return { client, calls };
}

const live = (w: World) => w.units.filter((u) => u.status !== "cancelled");

describe("direct booking cancellation — single room", () => {
  it("cancels the unit, resolves the header to cancelled and leaves no live unit", async () => {
    const state = { w: world(["confirmed"]) };
    const { client, calls } = clientFor(state);
    const result = await cancelDirectBookingUnits(client, "rest-1", "res-1");
    expect(result).toEqual({ ok: true });
    expect(state.w.units.map((u) => u.status)).toEqual(["cancelled"]);
    expect(state.w.units[0].roomId).toBeNull();
    expect(state.w.header).toBe("cancelled");
    expect(live(state.w)).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe(CANCEL_ALL_UNITS_RPC);
    expect(calls[0].args).toEqual({
      _restaurant_id: "rest-1",
      _reservation_id: "res-1",
      _reason: DIRECT_CANCEL_REASON,
      _membership_id: null,
    });
  });

  it("is idempotent for an already cancelled booking", async () => {
    const state = { w: world(["confirmed"]) };
    await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
    const before = clone(state.w);
    const again = await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
    expect(again).toEqual({ ok: true });
    expect(state.w).toEqual(before);
  });
});

describe("direct booking cancellation — multiple rooms", () => {
  it.each([[["confirmed", "confirmed"]], [["pending", "confirmed", "pending"]]] as Array<
    [ReservationUnitStatus[]]
  >)("cancels every unit for %j", async (statuses) => {
    const state = { w: world(statuses) };
    const result = await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
    expect(result.ok).toBe(true);
    expect(state.w.units.every((u) => u.status === "cancelled")).toBe(true);
    expect(state.w.header).toBe("cancelled");
    expect(state.w.history).toHaveLength(statuses.length); // one canonical event per unit
  });

  it("keeps already cancelled units and cancels the rest", async () => {
    const state = { w: world(["cancelled", "confirmed"]) };
    await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
    expect(state.w.units.map((u) => u.status)).toEqual(["cancelled", "cancelled"]);
    expect(state.w.history).toEqual([{ event: "cancelled", unit: 2 }]);
    expect(state.w.header).toBe("cancelled");
  });
});

describe("direct booking cancellation — no reactivation", () => {
  it("a later rollup keeps a cancelled booking cancelled", async () => {
    const state = { w: world(["confirmed", "confirmed"]) };
    await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
    // Any later unit-level operation re-runs the rollup.
    for (let i = 0; i < 3; i += 1) {
      state.w.header = rollupReservationStatus(state.w.units.map((u) => u.status));
    }
    expect(state.w.header).toBe("cancelled");
  });

  it("documents the old defect: a header-only cancel is revived by the rollup", () => {
    const w = world(["confirmed"]);
    w.header = "cancelled"; // what the old header-only update produced
    expect(rollupReservationStatus(w.units.map((u) => u.status))).toBe("confirmed");
  });
});

describe("direct booking cancellation — atomicity", () => {
  it("a failed unit transition commits nothing", async () => {
    const state = { w: world(["confirmed", "confirmed"]) };
    const before = clone(state.w);
    const result = await cancelDirectBookingUnits(clientFor(state, 2).client, "r", "x");
    expect(result).toEqual({ ok: false, reason: "failed", message: DIRECT_CANCEL_FAILED });
    expect(state.w).toEqual(before);
    expect(state.w.header).toBe("confirmed");
    expect(live(state.w)).toHaveLength(2);
  });

  it("the handler never updates the reservation header or inserts its own history row", () => {
    const start = handlerSource.indexOf("export const cancelDirectBooking");
    const end = handlerSource.indexOf("export const", start + 10);
    const body = handlerSource.slice(start, end === -1 ? undefined : end);
    expect(body).toContain("cancelDirectBookingUnits(");
    expect(body).not.toMatch(/\.from\("hotel_reservations"\)\s*\.update/);
    expect(body).not.toContain('.from("hotel_reservation_history")');
    expect(body).not.toMatch(/status:\s*"cancelled"\s*}\s*\)\s*\.eq/);
    expect(body).toContain("resyncGroupBlockInventoryForReservation");
    expect(body).toContain("direct_booking_cancelled");
  });
});

describe("direct booking cancellation — terminal room units", () => {
  it.each([
    [["checked_out", "confirmed"]],
    [["checked_in", "confirmed"]],
    [["no_show", "confirmed"]],
    [["checked_in"]],
  ] as Array<[ReservationUnitStatus[]]>)(
    "rejects the whole booking and changes nothing for %j",
    async (statuses) => {
      const state = { w: world(statuses, "confirmed") };
      const before = clone(state.w);
      const result = await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
      expect(result).toEqual({
        ok: false,
        reason: "not_cancellable",
        message: DIRECT_CANCEL_NOT_ONLINE,
      });
      expect(state.w).toEqual(before);
    },
  );

  it("maps a booking without units to not cancellable", async () => {
    const state = { w: world([], "confirmed") };
    const result = await cancelDirectBookingUnits(clientFor(state).client, "r", "x");
    expect(result).toMatchObject({ ok: false, reason: "not_cancellable" });
  });
});

describe("migration 0203 contract", () => {
  const sql = migration.replace(/--.*$/gm, "");

  it("is mirrored byte-for-byte in drizzle/migrations", () => {
    expect(read("drizzle/migrations/0203_cancel_hotel_reservation_all_units.sql")).toBe(migration);
  });

  it("cancels through the canonical unit function and rollup, never writing the header status", () => {
    expect(sql).toContain("public.cancel_hotel_reservation_unit(");
    expect(sql).toContain("public.rollup_hotel_reservation_status(");
    expect(sql).not.toMatch(/UPDATE\s+public\.hotel_reservations/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.hotel_reservation_rooms/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("applies the documented transition set with existing status values only", () => {
    expect(sql).toContain("status IN ('pending', 'confirmed')");
    expect(sql).toContain("status NOT IN ('pending', 'confirmed', 'cancelled')");
    expect(sql).toContain("RAISE EXCEPTION 'INVALID_TRANSITION'");
    expect(sql).toContain("RAISE EXCEPTION 'CANCELLATION_INCONSISTENT'");
    const vocabulary = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const allowed = new Set(["pending", "confirmed", "cancelled", "public", "INVALID_TRANSITION"]);
    const statusLike = vocabulary.filter((v) =>
      /^(pending|confirmed|cancelled|checked_in|checked_out|no_show|reserved|in_house|active|void|cancel)$/.test(
        v,
      ),
    );
    expect(statusLike.every((v) => allowed.has(v))).toBe(true);
  });

  it("is service-role only and takes row locks", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.cancel_hotel_reservation_all_units\(uuid, uuid, text, uuid\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.cancel_hotel_reservation_all_units\(uuid, uuid, text, uuid\)\s+TO service_role/,
    );
    expect(sql).toMatch(/FOR UPDATE/);
  });
});
