import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { planExceptionSync } from "./night-audit-exceptions.ts";
import {
  NIGHT_AUDIT_OPERATIONAL_BLOCKER_CODES,
  matchesOperationalFilter,
  nightAuditAllowsClose,
  nightAuditOverallStatus,
  operationalAllowsClose,
  operationalCategoryForException,
  operationalFocusFilter,
  operationalIssuesToExceptions,
  operationalSectionLabel,
  presentNightAuditOperations,
  reconcileNightAuditOperations,
  withoutOperationalOwnedTypes,
  type NightAuditOperationalFacts,
  type OperationalReservationFact,
  type OperationalRoomFact,
  type OperationalUnitFact,
} from "./night-audit-operational.ts";
import { financialAllowsClose } from "./night-audit-financial.ts";
import { nightAuditSearch } from "./night-audit-shell.ts";

const DATE = "2026-10-21";
const TOMORROW = "2026-10-22";
const NOW = "2026-10-21T21:00:00.000Z";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const pure = read("./night-audit-operational.ts");
const server = read("./night-audit-operational.server.ts");
const functions = read("./nightaudit.functions.ts");
const panel = read("../components/nightaudit/night-audit-operational-panel.tsx");
const desk = read("../components/nightaudit/night-audit-desk.tsx");
const closePanel = read("../components/nightaudit/na1-panels.tsx");
const workspace = read("../components/workspaces/night-audit-workspace.tsx");

let seq = 0;
const uuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

function reservation(input: Partial<OperationalReservationFact> = {}): OperationalReservationFact {
  return {
    id: uuid(),
    confirmationNumber: `R-${seq}`,
    status: "confirmed",
    arrivalDate: DATE,
    departureDate: TOMORROW,
    roomId: null,
    roomTypeId: "rt-std",
    guestName: "Abebe Kebede",
    lateCheckoutGranted: false,
    lateCheckoutUntil: null,
    ...input,
  };
}

function unit(res: OperationalReservationFact, input: Partial<OperationalUnitFact> = {}): OperationalUnitFact {
  return {
    id: uuid(),
    reservationId: res.id,
    unitSequence: 1,
    roomId: null,
    roomTypeId: res.roomTypeId,
    status: null,
    arrivalDate: res.arrivalDate,
    departureDate: res.departureDate,
    ratePlanId: null,
    nightlyDates: [],
    ...input,
  };
}

function room(input: Partial<OperationalRoomFact> = {}): OperationalRoomFact {
  return {
    id: uuid(),
    roomNumber: `1${String(seq).padStart(2, "0")}`,
    roomTypeId: "rt-std",
    status: "available",
    housekeepingStatus: "clean",
    maintenanceStatus: "normal",
    sellable: true,
    active: true,
    restrictionReason: null,
    ...input,
  };
}

function facts(input: Partial<NightAuditOperationalFacts> = {}): NightAuditOperationalFacts {
  return {
    businessDate: DATE,
    checkedAt: NOW,
    reservations: [],
    units: [],
    rooms: [],
    roomTypeNames: { "rt-std": "Standard", "rt-dlx": "Deluxe" },
    openTaskRoomIds: [],
    discrepancies: [],
    maintenance: { state: "ok", requests: [] },
    overbooking: { state: "ok", nights: [], approvals: [] },
    waitlist: { state: "ok", requests: [] },
    distribution: { state: "ok", connections: [], failedEvents: [] },
    revenue: { state: "ok", approvals: [], restrictions: [] },
    services: { state: "ok", entitlements: [] },
    ...input,
  };
}

const codes = (result: ReturnType<typeof reconcileNightAuditOperations>) => result.issues.map((row) => row.code);
const ofCode = (result: ReturnType<typeof reconcileNightAuditOperations>, code: string) =>
  result.issues.filter((row) => row.code === code);

describe("NA-P3 arrivals", () => {
  it("1. confirmed arrival on the business date is a blocker", () => {
    const result = reconcileNightAuditOperations(facts({ reservations: [reservation()] }));
    const [issue] = ofCode(result, "arrival_not_processed");
    assert.equal(issue?.severity, "blocking");
    assert.equal(result.summary.unresolvedArrivalCount, 1);
    assert.equal(result.status, "blocked");
  });

  it("2. pending arrival on the business date is a blocker", () => {
    const result = reconcileNightAuditOperations(facts({ reservations: [reservation({ status: "pending" })] }));
    assert.equal(ofCode(result, "arrival_not_processed")[0]?.severity, "blocking");
  });

  it("3. confirmed arrival before the business date is a blocker", () => {
    const result = reconcileNightAuditOperations(
      facts({ reservations: [reservation({ arrivalDate: "2026-10-19", departureDate: "2026-10-23" })] }),
    );
    assert.equal(ofCode(result, "arrival_not_processed")[0]?.dueDate, "2026-10-19");
  });

  it("4. checked-in arrival passes", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({ reservations: [reservation({ status: "checked_in", roomId: r.id })], rooms: [r] }),
    );
    assert.equal(result.summary.unresolvedArrivalCount, 0);
  });

  it("5–7. cancelled, no-show, and checked-out stays are excluded", () => {
    for (const status of ["cancelled", "no_show", "checked_out"]) {
      const result = reconcileNightAuditOperations(facts({ reservations: [reservation({ status })] }));
      assert.equal(result.summary.unresolvedArrivalCount, 0, status);
      assert.equal(result.summary.inHouseCount, 0, status);
    }
  });

  it("8. a checked-in walk-in passes and counts in-house", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({ reservations: [reservation({ status: "checked_in", roomId: r.id, arrivalDate: DATE })], rooms: [r] }),
    );
    assert.equal(result.summary.unresolvedArrivalCount, 0);
    assert.equal(result.summary.inHouseCount, 1);
  });

  it("9. a group with two unresolved room units gives two unit-aware issues", () => {
    const res = reservation();
    const units = [unit(res, { unitSequence: 1 }), unit(res, { unitSequence: 2 })];
    const result = reconcileNightAuditOperations(facts({ reservations: [res], units }));
    const issues = ofCode(result, "arrival_not_processed");
    assert.equal(issues.length, 2);
    assert.deepEqual(
      issues.map((row) => row.referenceId).sort(),
      units.map((row) => row.id).sort(),
    );
    assert.ok(issues.every((row) => row.referenceType === "reservation_room"));
    assert.equal(new Set(operationalIssuesToExceptions(issues).map((row) => row.referenceId)).size, 2);
  });

  it("10. arrival links keep the audit business date", () => {
    const result = reconcileNightAuditOperations(facts({ reservations: [reservation()] }));
    const issue = ofCode(result, "arrival_not_processed")[0]!;
    assert.equal(issue.route, "/restaurant/pms/front-office");
    assert.deepEqual(issue.search, { tab: "arrivals", date: DATE });
    assert.deepEqual(result.arrivals[0]?.search, { tab: "arrivals", date: DATE });
  });

  it("does not invent a no-show row without a persisted workflow", () => {
    const result = reconcileNightAuditOperations(facts({ reservations: [reservation()] }));
    assert.equal(result.noShowWorkflow, "not_tracked");
    assert.ok(!codes(result).some((code) => /no_show|noshow/.test(code)));
    assert.doesNotMatch(pure, /cancel_noshow_pending/);
  });
});

describe("NA-P3 departures", () => {
  it("11. checked-in past departure is an overstay blocker", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [reservation({ status: "checked_in", arrivalDate: "2026-10-18", departureDate: "2026-10-20", roomId: r.id })],
        rooms: [r],
      }),
    );
    assert.equal(ofCode(result, "overstay")[0]?.severity, "blocking");
    assert.equal(result.summary.overstayCount, 1);
  });

  it("12. checked-in departing today is a warning", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [reservation({ status: "checked_in", arrivalDate: "2026-10-19", departureDate: DATE, roomId: r.id })],
        rooms: [r],
      }),
    );
    assert.equal(ofCode(result, "departure_due_today")[0]?.severity, "warning");
    assert.equal(result.status, "warning");
  });

  it("13–14. checked-out and future departures pass", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [
          reservation({ status: "checked_out", departureDate: "2026-10-20" }),
          reservation({ status: "checked_in", arrivalDate: "2026-10-20", departureDate: "2026-10-25", roomId: r.id }),
        ],
        rooms: [r],
      }),
    );
    assert.equal(result.summary.overstayCount, 0);
    assert.equal(result.summary.dueTodayCount, 0);
  });

  it("15. group room units are evaluated separately", () => {
    const [a, b] = [room(), room()];
    const res = reservation({ status: "checked_in", arrivalDate: "2026-10-18", departureDate: "2026-10-23" });
    const units = [
      unit(res, { unitSequence: 1, roomId: a.id, status: "checked_in", departureDate: "2026-10-20" }),
      unit(res, { unitSequence: 2, roomId: b.id, status: "checked_in", departureDate: "2026-10-23" }),
    ];
    const result = reconcileNightAuditOperations(facts({ reservations: [res], units, rooms: [a, b] }));
    assert.equal(ofCode(result, "overstay").length, 1);
    assert.equal(ofCode(result, "overstay")[0]?.referenceId, units[0]!.id);
    assert.equal(result.summary.inHouseCount, 2);
  });

  it("16. canonical late-checkout metadata is shown, not inferred", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [
          reservation({
            status: "checked_in",
            departureDate: DATE,
            arrivalDate: "2026-10-19",
            roomId: r.id,
            lateCheckoutGranted: true,
            lateCheckoutUntil: "2026-10-21T14:00:00Z",
          }),
        ],
        rooms: [r],
      }),
    );
    const issue = ofCode(result, "departure_due_today")[0]!;
    assert.equal(issue.severity, "warning");
    assert.match(issue.description, /late checkout until/);
    assert.equal(result.departures[0]?.lateCheckoutUntil, "2026-10-21T14:00:00Z");
    assert.doesNotMatch(server, /late_checkout_note/);
  });
});

describe("NA-P3 room assignment", () => {
  it("17. checked-in unit without a room is a blocker", () => {
    const res = reservation({ status: "checked_in" });
    const result = reconcileNightAuditOperations(
      facts({ reservations: [res], units: [unit(res, { status: "checked_in" })] }),
    );
    assert.equal(ofCode(result, "checked_in_without_room")[0]?.severity, "blocking");
  });

  it("18. a sibling unit missing a room blocks even when the header has one", () => {
    const r = room();
    const res = reservation({ status: "checked_in", roomId: r.id });
    const units = [
      unit(res, { unitSequence: 1, roomId: r.id, status: "checked_in" }),
      unit(res, { unitSequence: 2, roomId: null, status: "checked_in" }),
    ];
    const result = reconcileNightAuditOperations(facts({ reservations: [res], units, rooms: [r] }));
    const issues = ofCode(result, "checked_in_without_room");
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.referenceId, units[1]!.id);
    assert.equal(ofCode(result, "room_double_occupancy").length, 0);
  });

  it("19. a valid assigned unit passes", () => {
    const r = room();
    const res = reservation({ status: "checked_in" });
    const result = reconcileNightAuditOperations(
      facts({ reservations: [res], units: [unit(res, { roomId: r.id, status: "checked_in" })], rooms: [r] }),
    );
    assert.equal(result.summary.roomConflictCount, 0);
  });

  it("20–21. cancelled and no-show units are excluded", () => {
    const res = reservation({ status: "checked_in" });
    const r = room();
    const units = [
      unit(res, { unitSequence: 1, roomId: r.id, status: "checked_in" }),
      unit(res, { unitSequence: 2, status: "cancelled" }),
      unit(res, { unitSequence: 3, status: "no_show" }),
    ];
    const result = reconcileNightAuditOperations(facts({ reservations: [res], units, rooms: [r] }));
    assert.equal(ofCode(result, "checked_in_without_room").length, 0);
    assert.equal(result.summary.inHouseCount, 1);
  });
});

describe("NA-P3 occupancy", () => {
  it("22. two checked-in units in one room is a blocker", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [
          reservation({ status: "checked_in", roomId: r.id }),
          reservation({ status: "checked_in", roomId: r.id }),
        ],
        rooms: [r],
      }),
    );
    const issue = ofCode(result, "room_double_occupancy")[0]!;
    assert.equal(issue.severity, "blocking");
    assert.equal(issue.referenceId, r.id);
  });

  it("23. historical occupancy is not counted", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [
          reservation({ status: "checked_out", roomId: r.id }),
          reservation({ status: "checked_in", roomId: r.id }),
        ],
        rooms: [r],
      }),
    );
    assert.equal(ofCode(result, "room_double_occupancy").length, 0);
  });

  it("24–25. separate group rooms are valid at unit grain", () => {
    const [a, b] = [room(), room()];
    const res = reservation({ status: "checked_in", roomId: a.id });
    const units = [
      unit(res, { unitSequence: 1, roomId: a.id, status: "checked_in" }),
      unit(res, { unitSequence: 2, roomId: b.id, status: "checked_in" }),
    ];
    const result = reconcileNightAuditOperations(facts({ reservations: [res], units, rooms: [a, b] }));
    assert.equal(result.summary.roomConflictCount, 0);
    assert.equal(result.inHouse.length, 2);
    assert.deepEqual(result.inHouse.map((row) => row.unit), ["Room 1", "Room 2"]);
  });
});

describe("NA-P3 room state", () => {
  for (const status of ["out_of_order", "out_of_service"]) {
    it(`26–27. occupied ${status} is a blocker`, () => {
      const r = room({ status, restrictionReason: "leak" });
      const result = reconcileNightAuditOperations(
        facts({ reservations: [reservation({ status: "checked_in", roomId: r.id })], rooms: [r] }),
      );
      assert.equal(ofCode(result, "occupied_restricted_room")[0]?.severity, "blocking");
    });
  }

  it("28. occupied available room passes", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({ reservations: [reservation({ status: "checked_in", roomId: r.id })], rooms: [r] }),
    );
    assert.equal(result.summary.blockerCount, 0);
  });

  it("29. occupied room unavailable for maintenance is a blocker", () => {
    const r = room({ maintenanceStatus: "out_of_order" });
    const result = reconcileNightAuditOperations(
      facts({ reservations: [reservation({ status: "checked_in", roomId: r.id })], rooms: [r] }),
    );
    assert.equal(ofCode(result, "occupied_maintenance_unavailable")[0]?.severity, "blocking");
  });

  it("30. non-critical maintenance is a warning or info", () => {
    const r = room({ maintenanceStatus: "maintenance_required" });
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [reservation({ status: "checked_in", roomId: r.id })],
        rooms: [r],
        maintenance: {
          state: "ok",
          requests: [{ id: uuid(), roomId: r.id, priority: "normal", status: "open", category: "plumbing" }],
        },
      }),
    );
    assert.equal(ofCode(result, "occupied_maintenance_attention")[0]?.severity, "warning");
    assert.equal(ofCode(result, "maintenance_request_open")[0]?.severity, "info");
    assert.equal(result.summary.blockerCount, 0);
  });
});

describe("NA-P3 housekeeping", () => {
  it("31. open discrepancy on an occupied room is a blocker", () => {
    const r = room();
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [reservation({ status: "checked_in", roomId: r.id })],
        rooms: [r],
        discrepancies: [{ id: uuid(), roomId: r.id, status: "open" }],
      }),
    );
    assert.equal(ofCode(result, "hk_conflict")[0]?.severity, "blocking");
  });

  it("32. vacant dirty room without a task is a warning", () => {
    const r = room({ housekeepingStatus: "dirty" });
    const result = reconcileNightAuditOperations(facts({ rooms: [r] }));
    assert.equal(ofCode(result, "dirty_room_without_task")[0]?.severity, "warning");
    assert.equal(result.status, "warning");
  });

  it("33. an open cleaning task does not block", () => {
    const r = room({ housekeepingStatus: "dirty" });
    const result = reconcileNightAuditOperations(facts({ rooms: [r], openTaskRoomIds: [r.id] }));
    assert.equal(result.summary.blockerCount, 0);
    assert.equal(ofCode(result, "dirty_room_without_task").length, 0);
  });

  it("34. the existing readiness evaluator is reused", () => {
    assert.match(pure, /evaluateRoomReadinessWithPolicy/);
    assert.match(pure, /housekeepingNightAuditExceptions/);
    const r = room({ housekeepingStatus: "dirty" });
    const result = reconcileNightAuditOperations(facts({ rooms: [r], openTaskRoomIds: [r.id] }));
    assert.match(result.rooms[0]?.readiness ?? "", /clean or inspected/);
  });

  it("35. Night Audit does not create or change a task", () => {
    assert.doesNotMatch(server, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    assert.doesNotMatch(server, /rpc\("(?!pms_property_overbooking_board)/);
  });
});

function nights(input: {
  tonight?: Partial<Parameters<typeof overbookingType>[0]>[];
  tomorrow?: Partial<Parameters<typeof overbookingType>[0]>[];
}) {
  return [
    { night: DATE, roomTypes: (input.tonight ?? []).map(overbookingType) },
    { night: TOMORROW, roomTypes: (input.tomorrow ?? []).map(overbookingType) },
  ];
}

function overbookingType(input: {
  roomTypeId?: string;
  roomTypeName?: string;
  physicalCapacity?: number;
  demand?: number;
  shortage?: number;
  overbookingAllowance?: number;
  configurationInvalid?: boolean;
}) {
  const physical = input.physicalCapacity ?? 10;
  const demand = input.demand ?? 10;
  return {
    roomTypeId: input.roomTypeId ?? "rt-std",
    roomTypeName: input.roomTypeName ?? "Standard",
    physicalCapacity: physical,
    demand,
    shortage: input.shortage ?? Math.max(0, demand - physical),
    overbookingAllowance: input.overbookingAllowance ?? 0,
    configurationInvalid: input.configurationInvalid ?? false,
  };
}

describe("NA-P3 overbooking", () => {
  it("36. within physical capacity passes", () => {
    const result = reconcileNightAuditOperations(
      facts({ overbooking: { state: "ok", nights: nights({ tonight: [{ demand: 9 }] }), approvals: [] } }),
    );
    assert.equal(result.overbooking.length, 0);
    assert.equal(result.summary.overbookingIssueCount, 0);
  });

  it("37. over physical but inside the allowance with an approval is info", () => {
    const result = reconcileNightAuditOperations(
      facts({
        overbooking: {
          state: "ok",
          nights: nights({ tonight: [{ demand: 11, overbookingAllowance: 2 }] }),
          approvals: [{ id: uuid(), reservationId: uuid(), reservationActive: true, nights: [{ date: DATE, roomTypeId: "rt-std", shortageApproved: 1 }] }],
        },
      }),
    );
    assert.equal(ofCode(result, "overbooking_approved")[0]?.severity, "info");
    assert.equal(result.overbooking[0]?.approval, "approved");
  });

  it("38. over the effective limit without an approval is a blocker tonight", () => {
    const result = reconcileNightAuditOperations(
      facts({ overbooking: { state: "ok", nights: nights({ tonight: [{ demand: 13, overbookingAllowance: 1 }] }), approvals: [] } }),
    );
    const issue = ofCode(result, "overbooking_unapproved")[0]!;
    assert.equal(issue.severity, "blocking");
    assert.equal(result.overbooking[0]?.excess, 2);
    assert.equal(issue.route, "/restaurant/pms/room-inventory");
    assert.deepEqual(issue.search, { tab: "overbooking" });
  });

  it("39. a valid approval prevents a false blocker", () => {
    const result = reconcileNightAuditOperations(
      facts({
        overbooking: {
          state: "ok",
          nights: nights({ tonight: [{ demand: 12, overbookingAllowance: 1 }] }),
          approvals: [{ id: uuid(), reservationId: uuid(), reservationActive: true, nights: [{ date: DATE, roomTypeId: "rt-std", shortageApproved: 2 }] }],
        },
      }),
    );
    assert.equal(ofCode(result, "overbooking_unapproved").length, 0);
    assert.equal(result.summary.blockerCount, 0);
  });

  it("40. an approval for a cancelled stay or another night does not count", () => {
    const result = reconcileNightAuditOperations(
      facts({
        overbooking: {
          state: "ok",
          nights: nights({ tonight: [{ demand: 12, overbookingAllowance: 1 }] }),
          approvals: [
            { id: uuid(), reservationId: uuid(), reservationActive: false, nights: [{ date: DATE, roomTypeId: "rt-std", shortageApproved: 2 }] },
            { id: uuid(), reservationId: uuid(), reservationActive: true, nights: [{ date: TOMORROW, roomTypeId: "rt-std", shortageApproved: 2 }] },
          ],
        },
      }),
    );
    assert.equal(ofCode(result, "overbooking_unapproved")[0]?.severity, "blocking");
  });

  it("41–42. rules are room-type specific with no shared property pool", () => {
    const result = reconcileNightAuditOperations(
      facts({
        overbooking: {
          state: "ok",
          nights: nights({
            tonight: [
              { roomTypeId: "rt-std", roomTypeName: "Standard", demand: 12, overbookingAllowance: 0 },
              { roomTypeId: "rt-dlx", roomTypeName: "Deluxe", demand: 5, physicalCapacity: 10, overbookingAllowance: 5 },
            ],
          }),
          approvals: [{ id: uuid(), reservationId: uuid(), reservationActive: true, nights: [{ date: DATE, roomTypeId: "rt-dlx", shortageApproved: 5 }] }],
        },
      }),
    );
    const blocked = ofCode(result, "overbooking_unapproved");
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0]?.roomType, "Standard");
    assert.doesNotMatch(pure, /maximum_overbooking|percentage_limit|propertyPool|sharedPool/);
  });

  it("43. a next-date concern is a warning", () => {
    const result = reconcileNightAuditOperations(
      facts({ overbooking: { state: "ok", nights: nights({ tomorrow: [{ demand: 14, overbookingAllowance: 1 }] }), approvals: [] } }),
    );
    assert.equal(ofCode(result, "overbooking_next_date")[0]?.severity, "warning");
    assert.equal(result.summary.blockerCount, 0);
  });

  it("44. derived consumption from the board is used, not a stored counter", () => {
    assert.match(server, /pms_property_overbooking_board/);
    assert.match(server, /parseOverbookingNights/);
    assert.doesNotMatch(server, /overbooking_consumed|consumption_counter/);
  });
});

describe("NA-P3 waitlist", () => {
  it("45–46. open waitlist does not block or consume inventory", () => {
    const result = reconcileNightAuditOperations(
      facts({
        waitlist: {
          state: "ok",
          requests: [{ id: uuid(), confirmationNumber: "W-1", status: "open", arrivalDate: DATE, reservationId: null, reservationExists: false }],
        },
      }),
    );
    assert.equal(result.summary.blockerCount, 0);
    assert.equal(result.summary.warningCount, 0);
    assert.equal(result.waitlist.pendingCount, 1);
    assert.equal(result.overbooking.length, 0);
  });

  it("47. a converted entry without its reservation is a warning only", () => {
    const result = reconcileNightAuditOperations(
      facts({
        waitlist: {
          state: "ok",
          requests: [{ id: uuid(), confirmationNumber: "W-2", status: "converted", arrivalDate: DATE, reservationId: uuid(), reservationExists: false }],
        },
      }),
    );
    assert.equal(ofCode(result, "waitlist_conversion_missing_reservation")[0]?.severity, "warning");
    assert.equal(result.summary.blockerCount, 0);
  });
});

const connection = (lastError: string | null = null) => ({
  id: uuid(),
  environment: "production",
  enabled: true,
  lastError,
  lastValidatedAt: NOW,
});

describe("NA-P3 distribution", () => {
  it("48. a failed sync on the business date is a warning", () => {
    const result = reconcileNightAuditOperations(
      facts({
        distribution: {
          state: "ok",
          connections: [connection()],
          failedEvents: [{ id: uuid(), operation: "ari_push", direction: "outbound", channel: "booking.com", message: "timeout", createdAt: NOW }],
        },
      }),
    );
    const issue = ofCode(result, "channel_sync_failed")[0]!;
    assert.equal(issue.severity, "warning");
    assert.equal(operationalIssuesToExceptions([issue])[0]?.referenceId, null);
  });

  it("49. a connection last_error is a warning", () => {
    const result = reconcileNightAuditOperations(
      facts({ distribution: { state: "ok", connections: [connection("auth failed")], failedEvents: [] } }),
    );
    assert.equal(ofCode(result, "channel_connection_error")[0]?.severity, "warning");
  });

  it("50. no errors says No known failures, never fully synchronized", () => {
    const result = reconcileNightAuditOperations(facts({ distribution: { state: "ok", connections: [connection()], failedEvents: [] } }));
    assert.equal(ofCode(result, "distribution_no_known_failures")[0]?.title, "No known failures");
    assert.doesNotMatch(pure + panel, /[Ff]ully synchroni[sz]ed/);
  });

  it("51. no connection is N/A", () => {
    const result = reconcileNightAuditOperations(facts());
    assert.equal(result.sections.distribution, "na");
    assert.equal(operationalSectionLabel("na"), "N/A");
    assert.equal(operationalSectionLabel("not_configured"), "NOT CONFIGURED");
    assert.equal(operationalSectionLabel("unavailable"), "UNAVAILABLE");
  });

  it("52. a channel warning does not block", () => {
    const result = reconcileNightAuditOperations(
      facts({ distribution: { state: "ok", connections: [connection("x")], failedEvents: [] } }),
    );
    assert.equal(result.status, "warning");
    assert.equal(operationalAllowsClose(result.status), true);
    const unavailable = reconcileNightAuditOperations(facts({ distribution: { state: "unavailable" } }));
    assert.equal(unavailable.status, "warning");
  });
});

describe("NA-P3 rate & revenue", () => {
  const approval = (dateFrom: string | null, dateTo: string | null = dateFrom) => ({
    id: uuid(),
    domain: "rate",
    summary: "Set Standard rate for 1 date",
    dateFrom,
    dateTo,
    requestedAt: NOW,
  });

  it("53–54. pending approvals effective today or tomorrow warn", () => {
    const result = reconcileNightAuditOperations(
      facts({ revenue: { state: "ok", approvals: [approval(DATE), approval(TOMORROW)], restrictions: [] } }),
    );
    const issues = ofCode(result, "revenue_approval_pending");
    assert.equal(issues.length, 2);
    assert.ok(issues.every((row) => row.severity === "warning" && row.route === "/restaurant/pms/rates-revenue"));
  });

  it("55. an unrelated future approval is excluded", () => {
    const result = reconcileNightAuditOperations(
      facts({ revenue: { state: "ok", approvals: [approval("2026-11-10"), approval(null)], restrictions: [] } }),
    );
    assert.equal(ofCode(result, "revenue_approval_pending").length, 0);
  });

  it("56. stop sell tomorrow is info", () => {
    const result = reconcileNightAuditOperations(
      facts({
        revenue: {
          state: "ok",
          approvals: [],
          restrictions: [{ id: uuid(), ratePlanId: uuid(), ratePlanName: "BAR", date: TOMORROW, stopSell: true, closedToArrival: false, closedToDeparture: false }],
        },
      }),
    );
    assert.equal(ofCode(result, "next_date_restriction")[0]?.severity, "info");
  });

  it("57. a sold stay without its frozen nightly rate warns", () => {
    const r = room();
    const res = reservation({ status: "checked_in", arrivalDate: "2026-10-20", departureDate: "2026-10-23" });
    const result = reconcileNightAuditOperations(
      facts({
        reservations: [res],
        units: [unit(res, { roomId: r.id, status: "checked_in", ratePlanId: uuid(), nightlyDates: ["2026-10-20", "2026-10-22"] })],
        rooms: [r],
      }),
    );
    assert.equal(ofCode(result, "missing_nightly_snapshot")[0]?.severity, "warning");
    const ok = reconcileNightAuditOperations(
      facts({
        reservations: [res],
        units: [unit(res, { roomId: r.id, status: "checked_in", ratePlanId: uuid(), nightlyDates: ["2026-10-20", DATE] })],
        rooms: [r],
      }),
    );
    assert.equal(ofCode(ok, "missing_nightly_snapshot").length, 0);
  });

  it("58. Night Audit does not write rates or restrictions", () => {
    assert.doesNotMatch(server, /approve_hotel_revenue|apply_rate|hotel_rate_restrictions"\)\s*\.(insert|update|upsert)/);
  });
});

describe("NA-P3 services", () => {
  const entitlement = (serviceKind: string, status = "PENDING") => ({
    id: uuid(),
    reservationId: uuid(),
    reservationRoomId: uuid(),
    serviceKind,
    serviceName: serviceKind === "meal" ? "Breakfast" : "Spa",
    serviceDate: DATE,
    status,
    roomNumber: "101",
  });

  it("59–61. pending meal and package services are info and never block", () => {
    const result = reconcileNightAuditOperations(
      facts({ services: { state: "ok", entitlements: [entitlement("meal"), entitlement("package_service")] } }),
    );
    assert.equal(ofCode(result, "service_entitlement_pending")[0]?.severity, "info");
    assert.equal(result.serviceOperations.pendingCount, 2);
    assert.equal(result.summary.blockerCount, 0);
    assert.equal(result.summary.warningCount, 0);
  });

  it("62–63. missing service charges are not inferred without canonical linkage", () => {
    const result = reconcileNightAuditOperations(
      facts({ services: { state: "ok", entitlements: [entitlement("meal", "COMPLETED")] } }),
    );
    assert.equal(result.serviceOperations.chargeLinkage, "not_tracked");
    assert.equal(result.issues.filter((row) => row.category === "services").length, 0);
    assert.doesNotMatch(pure, /service_name_snapshot\.includes|serviceName\.includes/);
  });

  it("64. Night Audit does not generate entitlements", () => {
    assert.doesNotMatch(server, /reconcileServiceEntitlements|generation_key|pms_reservation_service_entitlements"\)\s*\.(insert|upsert)/);
  });
});

describe("NA-P3 UI", () => {
  it("65–69. Operations shows loading, ready, warning, blocked, and unavailable", () => {
    assert.match(panel, /night-audit-operations-loading/);
    assert.match(panel, /night-audit-operations-unavailable/);
    assert.match(panel, /Operational Status: UNAVAILABLE/);
    assert.match(panel, /result\.status\.toUpperCase\(\)/);
    assert.equal(reconcileNightAuditOperations(facts()).status, "ready");
    assert.equal(reconcileNightAuditOperations(facts({ rooms: [room({ housekeepingStatus: "dirty" })] })).status, "warning");
    assert.equal(reconcileNightAuditOperations(facts({ reservations: [reservation()] })).status, "blocked");
  });

  it("70–72. severity, category, and search filters", () => {
    const filter = { severity: "blocker" as const, category: "arrivals" as const, search: "r-1" };
    assert.equal(matchesOperationalFilter({ status: "blocker", category: "arrivals", text: "R-1 arrival" }, filter), true);
    assert.equal(matchesOperationalFilter({ status: "warning", category: "arrivals", text: "R-1" }, filter), false);
    assert.equal(matchesOperationalFilter({ status: "blocker", category: "rooms", text: "R-1" }, filter), false);
    assert.equal(matchesOperationalFilter({ status: "blocker", category: "arrivals", text: "R-9" }, filter), false);
    assert.match(panel, /night-audit-operations-severity/);
    assert.match(panel, /night-audit-operations-category/);
    assert.match(panel, /night-audit-operations-search/);
  });

  it("73–74. detail drawer opens the owner module and has no fix button", () => {
    assert.match(panel, /night-audit-operations-detail/);
    for (const label of ["Severity", "Reservation / room / guest", "Audit date", "Detected", "Source status", "Owner module", "Recommended action", "Last checked"]) {
      assert.match(panel, new RegExp(label));
    }
    assert.match(panel, /Open \{selected\.ownerModule\}/);
    assert.doesNotMatch(panel, />\s*Fix\b|Mark resolved|Ignore|Waive|Override/);
  });

  it("75. Control Center counts come from the same operational query and filter Operations", () => {
    assert.match(workspace, /getNightAuditOperations/);
    assert.match(workspace, /operationsQuery\.data\.summary\.blockerCount/);
    assert.match(desk, /night-audit-operations-kpis/);
    assert.match(desk, /onOpenOperations\?\.\(focus\)/);
    assert.deepEqual(nightAuditSearch("operations", null, "arrivals"), { tab: "operations", focus: "arrivals" });
    assert.deepEqual(operationalFocusFilter("overstays"), { category: "departures", severity: "blocker" });
  });

  it("76. Run & Close shows Operations state", () => {
    assert.match(desk, /night-audit-close-readiness/);
    assert.match(desk, /label="Operations"/);
    assert.match(closePanel, /operationalGate/);
  });

  it("sorts blockers first, earliest arrival first", () => {
    const result = reconcileNightAuditOperations(
      facts({
        rooms: [room({ housekeepingStatus: "dirty" })],
        reservations: [reservation({ arrivalDate: DATE }), reservation({ arrivalDate: "2026-10-19", departureDate: TOMORROW })],
      }),
    );
    assert.equal(result.issues[0]?.dueDate, "2026-10-19");
    assert.equal(result.issues.at(-1)?.severity, "warning");
  });

  it("keeps cashier and accountant to counts without guest detail", () => {
    const full = reconcileNightAuditOperations(facts({ reservations: [reservation()] }));
    for (const role of ["cashier", "accountant"]) {
      const shaped = presentNightAuditOperations(full, role);
      assert.equal(shaped.access, "summary");
      assert.equal(shaped.arrivals.length, 0);
      assert.equal(shaped.summary.unresolvedArrivalCount, 1);
      assert.ok(shaped.issues.every((row) => !row.guestName && !row.confirmationNumber));
    }
    assert.equal(presentNightAuditOperations(full, "receptionist").access, "detail");
    assert.equal(presentNightAuditOperations(full, "receptionist").arrivals[0]?.guest, "Abebe Kebede");
    assert.doesNotMatch(server, /passport|national_id|id_document/);
  });
});

describe("NA-P3 close gate", () => {
  const base = {
    closed: false,
    boardBlockers: 0,
    boardUnavailable: false,
    openBlockingExceptions: 0,
    financial: "ready" as const,
    operational: "ready" as const,
    warnings: 0,
  };

  it("77. an operational blocker disables close", () => {
    assert.equal(nightAuditOverallStatus({ ...base, operational: "blocked" }), "blocked");
    assert.equal(nightAuditAllowsClose("blocked"), false);
  });

  it("78. a warning alone does not block", () => {
    const status = nightAuditOverallStatus({ ...base, operational: "warning", warnings: 3 });
    assert.equal(status, "warning");
    assert.equal(nightAuditAllowsClose(status), true);
  });

  it("79. operational unavailable disables close", () => {
    assert.equal(nightAuditOverallStatus({ ...base, operational: "unavailable" }), "unavailable");
    assert.equal(operationalAllowsClose("unavailable"), false);
  });

  it("80–81. a fixed source clears the issue and its exception auto-resolves", () => {
    const res = reservation();
    const blocked = reconcileNightAuditOperations(facts({ reservations: [res] }));
    const derived = operationalIssuesToExceptions(blocked.issues);
    assert.equal(derived[0]?.referenceId, res.id);
    const fixed = reconcileNightAuditOperations(facts({ reservations: [{ ...res, status: "checked_in", roomId: null }] }));
    assert.equal(ofCode(fixed, "arrival_not_processed").length, 0);
    const plan = planExceptionSync(
      [{ id: "ex-1", exceptionType: "arrival_not_processed", severity: "blocking", referenceId: res.id, message: "m", status: "open" }],
      operationalIssuesToExceptions(fixed.issues),
    );
    assert.deepEqual(plan.resolveIds, ["ex-1"]);
  });

  it("82. close re-evaluates operational truth before the close RPC", () => {
    const body = functions.slice(functions.indexOf("export const closeBusinessDate"));
    const readAt = body.indexOf("readOperationalReconciliation");
    const gateAt = body.indexOf("operationalAllowsClose");
    const overallAt = body.indexOf("nightAuditOverallStatus");
    const rpcAt = body.indexOf('rpc("close_business_date"');
    assert.ok(readAt > 0 && gateAt > readAt && overallAt > gateAt && rpcAt > overallAt);
    assert.match(body, /OPERATIONAL_UNAVAILABLE_MESSAGE/);
    assert.match(body, /financialAllowsClose/);
  });

  it("83–85. both domains must allow close", () => {
    assert.equal(nightAuditOverallStatus({ ...base, operational: "blocked" }), "blocked");
    assert.equal(nightAuditOverallStatus({ ...base, financial: "blocked" }), "blocked");
    assert.equal(nightAuditOverallStatus(base), "ready");
    assert.equal(financialAllowsClose("ready") && operationalAllowsClose("ready"), true);
    assert.equal(nightAuditOverallStatus({ ...base, boardUnavailable: true }), "unavailable");
    assert.equal(nightAuditOverallStatus({ ...base, openBlockingExceptions: 1 }), "blocked");
  });

  it("runNightAudit uses the same overall status for canClose", () => {
    const body = functions.slice(functions.indexOf("export const runNightAudit"), functions.indexOf("export const updateException"));
    assert.match(body, /canClose: run\.status !== "closed" && nightAuditAllowsClose\(overallStatus\)/);
    assert.match(body, /financial\.ok && operational\.ok/);
  });

  it("replaces older reservation-level rows for owned findings and keeps others", () => {
    const rows = withoutOperationalOwnedTypes([
      { exceptionType: "arrival_not_processed" },
      { exceptionType: "hk_conflict" },
      { exceptionType: "cancelled_holding_room" },
      { exceptionType: "open_cashier_shift" },
    ]);
    assert.deepEqual(rows.map((row) => row.exceptionType), ["cancelled_holding_room", "open_cashier_shift"]);
    assert.equal(operationalCategoryForException("overbooking_unapproved:2026-10-21:x"), "overbooking");
    assert.equal(operationalCategoryForException("open_cashier_shift"), null);
  });

  it("lists the hard blocker codes and keeps non-UUID references out of reference_id", () => {
    assert.deepEqual([...NIGHT_AUDIT_OPERATIONAL_BLOCKER_CODES].sort(), [
      "arrival_not_processed",
      "checked_in_without_room",
      "hk_conflict",
      "occupied_maintenance_unavailable",
      "occupied_restricted_room",
      "overbooking_unapproved",
      "overstay",
      "room_double_occupancy",
    ]);
    const result = reconcileNightAuditOperations(
      facts({ overbooking: { state: "ok", nights: nights({ tonight: [{ demand: 12 }] }), approvals: [] } }),
    );
    const [row] = operationalIssuesToExceptions(ofCode(result, "overbooking_unapproved"));
    assert.equal(row?.referenceId, null);
    assert.match(row?.exceptionType ?? "", /^overbooking_unapproved:2026-10-21:rt-std$/);
  });

  it("uses restaurants.business_date, not browser or UTC today", () => {
    assert.doesNotMatch(pure, /Date\.now|new Date\(\)|toLocaleDateString/);
    assert.match(functions, /loadNightAuditOperationalReconciliation\(\s*supabaseAdmin,\s*data\.restaurantId,\s*property\.businessDate/);
    assert.match(server, /propertyDayBounds\(businessDate, timezone\)/);
  });
});

describe("NA-P3 run summary", () => {
  const body = functions.slice(functions.indexOf("export const closeBusinessDate"));
  for (const [n, field] of [
    [86, "operationalBlockerCount"],
    [87, "operationalWarningCount"],
    [88, "unresolvedArrivalCount"],
    [89, "overstayCount"],
    [90, "roomConflictCount"],
    [91, "overbookingIssueCount"],
  ] as const) {
    it(`${n}. saves ${field}`, () => {
      assert.match(body, new RegExp(`${field}: operational\\.result\\.summary\\.${field === "operationalBlockerCount" ? "blockerCount" : field === "operationalWarningCount" ? "warningCount" : field}`));
      assert.match(functions, new RegExp(`${field}\\?: number`));
    });
  }

  it("92. an old run without operational fields still renders", () => {
    assert.match(closePanel, /typeof run\?\.summary\?\.operationalBlockerCount === "number"/);
  });
});
