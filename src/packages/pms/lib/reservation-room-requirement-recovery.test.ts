import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  REQUIREMENTS_CONTINUE_LABEL,
  REQUIREMENTS_INCOMPLETE_BODY,
  REQUIREMENTS_INCOMPLETE_TITLE,
  REQUIREMENTS_LEAVE_LABEL,
  REQUIREMENTS_LEAVE_TITLE,
  REQUIREMENTS_LEAVE_WARNING,
  REQUIREMENTS_RETRY_FAILED,
  REQUIREMENTS_RETRY_LABEL,
  SAVE_ROOM_REQUIREMENTS_RPC,
  assertCreateAllowed,
  pendingRequirementSave,
  requirementUnitsToSave,
  resolveCreateUnitRequirements,
  retryPendingRequirementSave,
  saveRoomRequirementsAtomic,
  type RoomRequirementRpcDb,
  type RoomRequirementSaveFn,
  type RoomRequirements,
} from "@/packages/pms/lib/reservation-room-requirements";
import { createReservationRoomUnitPayload } from "@/packages/pms/lib/reservation-room-units";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

const req = (accessible: boolean, connecting: boolean): RoomRequirements => ({
  accessibleRoomRequired: accessible,
  connectingRoomRequired: connecting,
});

type RpcReply = { data: unknown; error: { message: string } | null };

/** A service-role client that only answers the requirements RPC. */
function rpcDb(reply: RpcReply | ((args: { _units: unknown }) => RpcReply) | Error) {
  const rpc = vi.fn(async (_fn: string, args: { _units: unknown }) => {
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(args) : reply;
  });
  return { db: { rpc } as unknown as RoomRequirementRpcDb, rpc };
}

const ok = (count: number, reservationId = "r1"): RpcReply => ({
  data: { reservation_id: reservationId, units_updated: count },
  error: null,
});

const input = (list: Array<[number, RoomRequirements]>, reservationId = "r1") => ({
  restaurantId: "p1",
  reservationId,
  units: list.map(([unitSequence, requirements]) => ({ unitSequence, requirements })),
});

describe("server save delegates to the atomic RPC", () => {
  it("sends one call with every unit and both values, and treats success as authoritative", async () => {
    const { db, rpc } = rpcDb(ok(2));
    const result = await saveRoomRequirementsAtomic(
      db,
      input([
        [1, req(true, false)],
        [2, req(false, false)],
      ]),
    );
    expect(result).toEqual({ complete: true, errorMessage: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(SAVE_ROOM_REQUIREMENTS_RPC, {
      _restaurant_id: "p1",
      _reservation_id: "r1",
      _units: [
        { unit_sequence: 1, accessible_room_required: true, connecting_room_required: false },
        { unit_sequence: 2, accessible_room_required: false, connecting_room_required: false },
      ],
    });
    expect(SAVE_ROOM_REQUIREMENTS_RPC).toBe("save_hotel_reservation_room_requirements");
  });

  it("is not complete when the RPC raises, keeping the message for the log only", async () => {
    const { db } = rpcDb({ data: null, error: { message: "ROOM_UNIT_NOT_FOUND" } });
    const result = await saveRoomRequirementsAtomic(db, input([[1, req(true, true)]]));
    expect(result).toEqual({ complete: false, errorMessage: "ROOM_UNIT_NOT_FOUND" });
  });

  it("is not complete when the request throws", async () => {
    const { db } = rpcDb(new Error("network down"));
    const result = await saveRoomRequirementsAtomic(db, input([[1, req(true, true)]]));
    expect(result.complete).toBe(false);
  });

  it("is not complete when the result does not match the request", async () => {
    for (const reply of [ok(1), ok(2, "other"), { data: null, error: null }]) {
      const { db } = rpcDb(reply);
      const result = await saveRoomRequirementsAtomic(
        db,
        input([
          [1, req(true, false)],
          [2, req(false, true)],
        ]),
      );
      expect(result.complete).toBe(false);
    }
  });

  it("does not call the RPC with a missing value or no units", async () => {
    const { db, rpc } = rpcDb(ok(1));
    const missing = await saveRoomRequirementsAtomic(db, {
      restaurantId: "p1",
      reservationId: "r1",
      units: [
        { unitSequence: 1, requirements: { accessibleRoomRequired: true } as RoomRequirements },
      ],
    });
    const empty = await saveRoomRequirementsAtomic(db, input([]));
    expect(missing.complete).toBe(false);
    expect(empty.complete).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("recovery after the reservation exists", () => {
  const created = (complete: boolean) => ({
    id: "reservation-id",
    confirmationNumber: "NR-000245",
    roomRequirements: { complete },
  });
  const intended = [req(true, false), req(false, true)];
  const allUnits = [
    { unitSequence: 1, accessibleRoomRequired: true, connectingRoomRequired: false },
    { unitSequence: 2, accessibleRoomRequired: false, connectingRoomRequired: true },
  ];

  it("is not pending when the save succeeded", () => {
    expect(pendingRequirementSave(created(true), intended)).toBeNull();
  });

  it("holds the reservation reference and the chosen values, with no per-room state", () => {
    expect(pendingRequirementSave(created(false), intended)).toEqual({
      reservationId: "reservation-id",
      confirmationNumber: "NR-000245",
      intended,
    });
  });

  it("blocks a second create while the first waits on its requirements", () => {
    const pending = pendingRequirementSave(created(false), intended);
    expect(() => assertCreateAllowed(pending)).toThrow(/already created/);
    expect(() => assertCreateAllowed(null)).not.toThrow();
  });

  it("retries every unit on the existing reservation and never calls create", async () => {
    const createRpc = vi.fn();
    const save = vi.fn<RoomRequirementSaveFn>(async () => ({ complete: true }));
    const next = await retryPendingRequirementSave(
      pendingRequirementSave(created(false), intended)!,
      save,
    );
    expect(next).toBeNull();
    expect(createRpc).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ reservationId: "reservation-id", units: allUnits });
  });

  it("keeps the intended values when a retry fails or throws, until one succeeds", async () => {
    const pending = pendingRequirementSave(created(false), intended)!;
    const stillFailing = await retryPendingRequirementSave(pending, async () => ({
      complete: false,
    }));
    expect(stillFailing).toBe(pending);
    const thrown = await retryPendingRequirementSave(pending, async () => {
      throw new Error("network down");
    });
    expect(thrown).toBe(pending);
    expect(thrown!.intended).toEqual(intended);
    const done = await retryPendingRequirementSave(pending, async () => ({ complete: true }));
    expect(done).toBeNull();
  });

  it("sends the same payload on every retry, so retrying is idempotent", async () => {
    const save = vi.fn<RoomRequirementSaveFn>(async () => ({ complete: false }));
    const pending = pendingRequirementSave(created(false), intended)!;
    await retryPendingRequirementSave(pending, save);
    await retryPendingRequirementSave(pending, save);
    expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  });

  it("retries end to end through the RPC helper after a failed first save", async () => {
    let calls = 0;
    const { db, rpc } = rpcDb(() => {
      calls += 1;
      return calls === 1
        ? { data: null, error: { message: "ROOM_UNIT_NOT_EDITABLE" } }
        : ok(2, "reservation-id");
    });
    const first = await saveRoomRequirementsAtomic(
      db,
      input(
        intended.map(
          (requirements, index) => [index + 1, requirements] as [number, RoomRequirements],
        ),
        "reservation-id",
      ),
    );
    const pending = pendingRequirementSave(
      { ...created(false), roomRequirements: first },
      intended,
    )!;
    const next = await retryPendingRequirementSave(pending, async ({ reservationId, units }) =>
      saveRoomRequirementsAtomic(db, {
        restaurantId: "p1",
        reservationId,
        units: units.map((unit) => ({
          unitSequence: unit.unitSequence,
          requirements: req(unit.accessibleRoomRequired, unit.connectingRoomRequired),
        })),
      }),
    );
    expect(next).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it("builds the unit payload from the intended values", () => {
    expect(requirementUnitsToSave(intended)).toEqual(allUnits);
  });
});

describe("create payload keeps per-unit values", () => {
  it("carries room 1 and the extra room separately into the saved units", () => {
    const payload = createReservationRoomUnitPayload({
      roomTypeId: "type-1",
      adults: 2,
      children: 0,
      infants: 0,
      ratePlanId: null,
      roomsRequested: 1,
      room1Requirements: req(true, false),
      extraUnits: [
        {
          roomTypeId: "type-1",
          adults: 1,
          children: 0,
          infants: 0,
          ratePlanId: null,
          accessibleRoomRequired: false,
          connectingRoomRequired: true,
        },
      ],
    });
    const resolved = resolveCreateUnitRequirements({
      unitCount: payload.roomUnits!.length,
      room1: req(true, false),
      roomUnits: payload.roomUnits,
    });
    expect(resolved).toEqual([req(true, false), req(false, true)]);
  });
});

describe("wiring and copy", () => {
  const page = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const server = read("src/packages/pms/lib/reservations.functions.ts");
  const lib = read("src/packages/pms/lib/reservation-room-requirements.ts");

  it("uses the agreed staff-facing copy without ids or database wording", () => {
    expect(REQUIREMENTS_INCOMPLETE_TITLE).toBe(
      "Reservation created, but room requirements could not be saved.",
    );
    expect(REQUIREMENTS_RETRY_LABEL).toBe("Retry saving requirements");
    expect(REQUIREMENTS_LEAVE_WARNING).toBe(
      "The reservation has been created, but its room requirements are not saved. Leaving now may allow staff to assign a room without those requirements.",
    );
    expect(REQUIREMENTS_CONTINUE_LABEL).toBe("Continue editing");
    expect(REQUIREMENTS_LEAVE_LABEL).toBe("Leave without requirements");
    const strings = [
      REQUIREMENTS_INCOMPLETE_TITLE,
      REQUIREMENTS_INCOMPLETE_BODY,
      REQUIREMENTS_RETRY_LABEL,
      REQUIREMENTS_RETRY_FAILED,
      REQUIREMENTS_LEAVE_LABEL,
      REQUIREMENTS_LEAVE_TITLE,
      REQUIREMENTS_LEAVE_WARNING,
      REQUIREMENTS_CONTINUE_LABEL,
    ].join(" ");
    expect(strings).not.toMatch(/uuid|sql|hotel_|constraint|violates|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(strings).not.toMatch(/preferred|if available|try to match/i);
  });

  it("guards create, holds the notice, and retries on the existing reservation", () => {
    expect(page).toContain("assertCreateAllowed(pendingRequirementsRef.current)");
    expect(page).toContain("pendingRequirementSave(result, intendedRoomRequirements())");
    expect(page).toContain("retryPendingRequirementSave(current");
    expect(page).toContain("submitRequirementRetry");
    expect(page).toContain('data-testid="retry-room-requirements"');
    expect(page).toContain("pendingRequirements != null");
    expect(page).toContain("Reservation ${pendingRequirements.confirmationNumber}.");
    // The create mutation is only called from the confirm button.
    expect(page.match(/create\.mutate\(/g)?.length).toBe(1);
  });

  it("drops per-room partial-save wording", () => {
    expect(page).not.toMatch(/Not saved:|failedUnitSequences|unsavedRoomsLabel/);
    expect(lib).not.toMatch(/failedUnitSequences|unsavedRoomsLabel|savedUnitSequences/);
    expect(server).not.toContain("failedUnitSequences");
  });

  it("asks before leaving, with continue and leave actions", () => {
    expect(page).not.toContain("window.confirm(");
    expect(page).toContain(
      "<AlertDialogDescription>{REQUIREMENTS_LEAVE_WARNING}</AlertDialogDescription>",
    );
    expect(page).toContain('data-testid="continue-editing-requirements"');
    expect(page).toContain('data-testid="confirm-leave-without-requirements"');
    expect(page).toContain("{REQUIREMENTS_CONTINUE_LABEL}");
  });

  it("finishes the create flow only after the requirements are saved or knowingly left", () => {
    const success = page.slice(
      page.indexOf("onSuccess: async (result)"),
      page.indexOf(
        "onError: (error: Error) => toast.error(error.message),\n  });\n\n  /** Requirements",
      ),
    );
    expect(success).toContain("return;");
    expect(success).not.toContain("onCreated?.(");
    expect(success).not.toContain("startWalkIn(");
  });

  it("persists only through the RPC, with no direct unit writes on the create path", () => {
    const start = lib.indexOf("export async function saveRoomRequirementsAtomic");
    const helper = lib.slice(start, lib.indexOf("/** Edit: write one room unit."));
    expect(helper).toContain("db.rpc(SAVE_ROOM_REQUIREMENTS_RPC");
    expect(helper).not.toMatch(/\.from\(|\.update\(/);
    expect(lib).not.toContain("saveRoomRequirementsIdempotent");
  });

  it("exposes a retry action that never creates a reservation", () => {
    const start = server.indexOf("export const saveReservationRoomRequirements");
    const block = server.slice(start, server.indexOf("export const copyReservation"));
    expect(block).toContain("requirePmsActorAny");
    expect(block).toContain("saveRoomRequirementsAtomic");
    expect(block).not.toMatch(/create_hotel_reservation|insert\(|\.update\(/);
  });

  it("leaves eligibility, check-in, move and the schema alone", () => {
    expect(lib).not.toMatch(
      /pms_evaluate_room_assignment|assign_hotel_reservation_room|hotel_room_links/,
    );
  });
});
