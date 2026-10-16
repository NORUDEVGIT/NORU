import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyHousekeepingEventPriority,
  EMPTY_HK_DEMAND,
  hkDemandFromStay,
  housekeeperMayMutateTask,
  mergeHkDemand,
  priorityEventsForHousekeepingTask,
  suggestedCleaningType,
} from "./housekeeping-ops.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const DEFAULT_PRIORITY_RULES = [
  { event: "vip" as const, priority: "urgent" as const, enabled: true },
  { event: "early_arrival" as const, priority: "urgent" as const, enabled: true },
  { event: "arrival" as const, priority: "high" as const, enabled: true },
  { event: "room_move" as const, priority: "high" as const, enabled: true },
  { event: "special_request" as const, priority: "high" as const, enabled: true },
  { event: "departure" as const, priority: "normal" as const, enabled: true },
  { event: "stayover" as const, priority: "normal" as const, enabled: true },
];

describe("HK Phase 2 — FO demand overlay", () => {
  it("flags arrivals, departures, stayovers, VIP, early arrival, and room moves from stay reads", () => {
    const today = "2026-09-27";
    const arrival = hkDemandFromStay(
      {
        roomId: "r1",
        status: "confirmed",
        arrivalDate: today,
        departureDate: "2026-09-29",
        expectedArrivalAt: "2026-09-27T08:00:00Z",
        guestVip: true,
      },
      today,
      { checkInTime: "15:00", timezone: "UTC" },
    );
    assert.equal(arrival.arrival, true);
    assert.equal(arrival.vip, true);
    assert.equal(arrival.earlyArrival, true);
    assert.equal(arrival.stayover, false);

    const stayover = hkDemandFromStay(
      {
        roomId: "r1",
        status: "checked_in",
        arrivalDate: "2026-09-25",
        departureDate: "2026-09-29",
        guestVip: false,
      },
      today,
    );
    assert.equal(stayover.stayover, true);
    assert.equal(stayover.arrival, false);
    assert.equal(stayover.departure, false);

    const departure = hkDemandFromStay(
      {
        roomId: "r1",
        status: "checked_in",
        arrivalDate: "2026-09-25",
        departureDate: today,
      },
      today,
    );
    assert.equal(departure.departure, true);
    assert.equal(departure.stayover, false);

    const moved = mergeHkDemand(stayover, { ...EMPTY_HK_DEMAND, roomChange: true });
    assert.equal(moved.roomChange, true);
    assert.equal(moved.stayover, true);
    assert.equal(suggestedCleaningType(stayover), "stayover_cleaning");
    assert.equal(suggestedCleaningType(departure), "departure_cleaning");
  });
});

describe("HK Phase 2 — Card 2 event priority", () => {
  it("raises create priority from VIP/arrival/stayover rules without a new engine", () => {
    const vip = applyHousekeepingEventPriority(
      DEFAULT_PRIORITY_RULES,
      priorityEventsForHousekeepingTask("departure_cleaning", { ...EMPTY_HK_DEMAND, vip: true, arrival: true }),
      "normal",
    );
    assert.equal(vip, "urgent");

    const stayover = applyHousekeepingEventPriority(
      DEFAULT_PRIORITY_RULES,
      priorityEventsForHousekeepingTask("stayover_cleaning", { ...EMPTY_HK_DEMAND, stayover: true }),
      "normal",
    );
    assert.equal(stayover, "normal");

    const reclean = applyHousekeepingEventPriority(
      DEFAULT_PRIORITY_RULES,
      priorityEventsForHousekeepingTask("re_clean", EMPTY_HK_DEMAND),
      "normal",
    );
    assert.equal(reclean, "high");

    const functions = readRel("./housekeeping.functions.ts");
    assert.match(functions, /applyHousekeepingEventPriority/);
    assert.match(functions, /priorityEventsForHousekeepingTask/);
    assert.match(functions, /loadHkDemandOverlay/);
  });

  it("keeps checkout auto-create on pms_housekeeping_event_priority departure", () => {
    const sql = readRel("../../../../drizzle/migrations/0068_pms_card2_housekeeping.sql");
    const checkout = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation"),
      sql.indexOf("REVOKE ALL ON FUNCTION public.pms_housekeeping_event_priority"),
    );
    assert.match(checkout, /pms_housekeeping_event_priority\(_restaurant_id, 'departure', 'normal'\)/);
    assert.match(checkout, /housekeeping_create_task/);
    assert.match(checkout, /departure_cleaning/);
  });
});

describe("HK Phase 2 — task lifecycle writers", () => {
  it("lets housekeepers start and complete only their own assignments", () => {
    assert.equal(
      housekeeperMayMutateTask({
        scope: "housekeeper",
        action: "start",
        assignedMembershipId: "me",
        actorMembershipId: "me",
      }),
      true,
    );
    assert.equal(
      housekeeperMayMutateTask({
        scope: "housekeeper",
        action: "start",
        assignedMembershipId: "other",
        actorMembershipId: "me",
      }),
      false,
    );
    assert.equal(
      housekeeperMayMutateTask({
        scope: "housekeeper",
        action: "assign",
        assignedMembershipId: "me",
        actorMembershipId: "me",
      }),
      false,
    );
    assert.equal(
      housekeeperMayMutateTask({
        scope: "supervisor",
        action: "assign",
        assignedMembershipId: null,
        actorMembershipId: "boss",
      }),
      true,
    );

    const functions = readRel("./housekeeping.functions.ts");
    assert.match(functions, /housekeeperMayMutateTask/);
    const update = functions.slice(
      functions.indexOf("export const updateHousekeepingTask"),
      functions.indexOf("export const completeHousekeepingTask"),
    );
    assert.match(update, /action: z\.enum\(\["assign", "start", "cancel"\]\)/);
    assert.doesNotMatch(update, /from\("hotel_rooms"\)/);

    const complete = functions.slice(
      functions.indexOf("export const completeHousekeepingTask"),
      functions.indexOf("export const listInspections"),
    );
    assert.match(complete, /housekeeping_complete_task/);
    assert.doesNotMatch(complete, /from\("hotel_rooms"\)/);
  });

  it("keeps one-open-per-room on the create RPC and does not add turndown create", () => {
    const sql = readRel("../../../../drizzle/migrations/0015_housekeeping_operations.sql");
    const create = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.housekeeping_create_task("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.housekeeping_complete_task("),
    );
    assert.match(create, /status IN \('pending','assigned','in_progress'\)/);
    assert.match(create, /RETURN existing_id/);

    const tabs = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    assert.match(tabs, /row\.code !== "turn_down"/);
    assert.match(tabs, /hk-cleaning-board/);
    assert.match(tabs, /hk-create-task-room/);
    assert.match(tabs, /createHousekeepingTask/);
    const dialog = tabs.slice(tabs.indexOf("export function NewTaskDialog"), tabs.indexOf("export function CleaningBoardTab"));
    assert.match(dialog, /lockedRoom/);
    assert.match(dialog, /Select a room/);
    assert.match(dialog, /disabled=\{mutation\.isPending \|\| !selectedRoom\}/);
    assert.doesNotMatch(dialog, /101A/);
  });
});

describe("HK Phase 2 — board is a read model", () => {
  it("does not let the Board UPDATE hotel_rooms housekeeping_status except via complete RPC", () => {
    const board = readRel("../components/housekeeping/housekeeping-board.tsx");
    assert.match(board, /completeHousekeepingTask/);
    assert.match(board, /updateHousekeepingTask/);
    assert.match(board, /checkInReady/);
    assert.match(board, /readyReason/);
    assert.doesNotMatch(board, /from\("hotel_rooms"\)/);
    assert.doesNotMatch(board, /housekeeping_status:/);

    const rack = readRel("./housekeeping.functions.ts");
    const listStart = rack.indexOf("export const listRoomRack");
    const listEnd = rack.indexOf("export const listHousekeepingTasks");
    const list = rack.slice(listStart, listEnd);
    assert.match(list, /evaluateRoomReadinessWithPolicy/);
    assert.match(list, /loadHkDemandOverlay/);
    assert.doesNotMatch(list, /\.update\(/);
  });

  it("does not default global Create Task to the first rack room", () => {
    const board = readRel("../components/housekeeping/housekeeping-board.tsx");
    assert.doesNotMatch(board, /filtered\[0\] \?\? rooms\[0\]/);
    assert.match(board, /setLockedTaskRoom\(null\)/);
    assert.match(board, /setCreateTaskOpen\(true\)/);
  });
});
