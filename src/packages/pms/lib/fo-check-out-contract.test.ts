import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildCheckOutCompletion,
  checkOutAccountingBadge,
  checkOutDocumentCapabilities,
  checkOutDocumentSnapshot,
  checkOutDueLabel,
  checkOutEligibility,
  checkOutFingerprint,
  checkOutHousekeepingConsequence,
  checkOutSharedFolioWarning,
  projectCheckOutCharges,
  projectCheckOutPayments,
  resolveCheckOutUnit,
  type CheckOutFolioFacts,
  type CheckOutLedgerSource,
  type CheckOutOverrideFacts,
  type CheckOutUnitRow,
} from "./fo-check-out-contract.ts";

const server = readFileSync(new URL("./fo-check-out.functions.ts", import.meta.url), "utf8");
const workspace = readFileSync(
  new URL("../components/frontoffice/fo-check-out-workspace.tsx", import.meta.url),
  "utf8",
);
const dialogs = readFileSync(
  new URL("../components/frontoffice/front-office-dialogs.tsx", import.meta.url),
  "utf8",
);

function unit(id: string, sequence: number, overrides: Partial<CheckOutUnitRow> = {}) {
  return {
    id,
    unitSequence: sequence,
    roomId: `room-${id}`,
    roomNumber: `10${sequence}`,
    roomTypeId: "type-1",
    roomTypeName: "Double",
    arrivalDate: "2026-10-24",
    departureDate: "2026-10-27",
    adults: 2,
    children: 0,
    status: "checked_in",
    ...overrides,
  } satisfies CheckOutUnitRow;
}

function folio(overrides: Partial<CheckOutFolioFacts> = {}): CheckOutFolioFacts {
  return {
    folioId: "folio-1",
    folioNumber: "F-0001",
    status: "open",
    invoiced: false,
    invoiceNumbers: [],
    currency: "GBP",
    charges: 300,
    credits: 300,
    balance: 0,
    depositsReceived: 0,
    transactionCount: 3,
    lastTransactionId: "t3",
    ...overrides,
  };
}

const NO_OVERRIDE: CheckOutOverrideFacts = { recorded: false, kind: null, reason: null };
const A = unit("unit-a", 1);
const B = unit("unit-b", 2);

function eligibility(
  input: Partial<Parameters<typeof checkOutEligibility>[0]> = {},
): ReturnType<typeof checkOutEligibility> {
  return checkOutEligibility({
    resolution: { kind: "unit", unit: A },
    stayStatus: "checked_in",
    folio: folio({ status: "closed" }),
    override: NO_OVERRIDE,
    canOverride: false,
    ...input,
  });
}

const ledger: CheckOutLedgerSource[] = [
  {
    id: "t1",
    type: "charge",
    category: "room",
    description: "Room night",
    amount: 120,
    postedAt: "2026-10-25T02:00:00Z",
    quantity: 1,
    paymentMethod: null,
    referenceType: "night_audit",
    postedBy: null,
    chargeSource: "night_audit",
    roomUnitLabel: "Room 1",
  },
  {
    id: "t2",
    type: "charge",
    category: "minibar",
    description: "Minibar",
    amount: 18.5,
    postedAt: "2026-10-26T10:00:00Z",
    quantity: 2,
    paymentMethod: null,
    referenceType: null,
    postedBy: "Ana Desk",
  },
  {
    id: "t3",
    type: "payment",
    category: "payment",
    description: "Check-out payment (card)",
    amount: -100,
    postedAt: "2026-10-27T09:00:00Z",
    paymentMethod: "card",
    referenceType: "terminal",
    referenceId: "AUTH-77",
    postedBy: "Ana Desk",
  },
  {
    id: "t4",
    type: "deposit",
    category: "deposit",
    description: "Deposit",
    amount: -38.5,
    postedAt: "2026-10-20T09:00:00Z",
    paymentMethod: "bank_transfer",
    referenceType: null,
    postedBy: null,
  },
];

describe("FO-10R1 settlement eligibility", () => {
  it("1. zero balance on a closed folio is financially clear and allowed", () => {
    const e = eligibility();
    assert.equal(e.financiallyClear, true);
    assert.equal(e.isZero, true);
    assert.equal(e.checkoutAllowed, true);
    assert.equal(e.blockingReason, null);
  });

  it("2. outstanding balance blocks with the amount owed", () => {
    const e = eligibility({ folio: folio({ balance: 42.1 }) });
    assert.equal(e.checkoutAllowed, false);
    assert.equal(e.blockingReason, "outstanding_balance");
    assert.equal(e.outstanding, 42.1);
    assert.equal(e.financiallyClear, false);
  });

  it("3. a payment that clears the balance leaves only the Cashiering close step", () => {
    const e = eligibility({ folio: folio({ balance: 0, status: "open" }) });
    assert.equal(e.financiallyClear, true);
    assert.equal(e.closeFolioRequired, true);
    assert.equal(e.blockingReason, "folio_close_required");
  });

  it("4. a credit blocks without any refund path in FO", () => {
    const e = eligibility({ folio: folio({ balance: -25 }) });
    assert.equal(e.blockingReason, "credit_balance");
    assert.equal(e.credit, 25);
    assert.equal(e.overrideKind, "credit");
    assert.doesNotMatch(server, /transaction_type:\s*"refund"|type:\s*"refund"/);
  });

  it("5. a missing folio blocks", () => {
    const e = eligibility({ folio: null });
    assert.equal(e.folioMissing, true);
    assert.equal(e.blockingReason, "folio_missing");
    assert.equal(e.financiallyClear, false);
  });

  it("6. a closed folio at zero is clear; closed is reported", () => {
    const e = eligibility({ folio: folio({ status: "closed" }) });
    assert.equal(e.folioClosed, true);
    assert.equal(e.closeFolioRequired, false);
    assert.equal(e.checkoutAllowed, true);
  });

  it("7. an invoiced folio is surfaced and keeps the existing gate", () => {
    const e = eligibility({
      folio: folio({ status: "closed", invoiced: true, invoiceNumbers: ["INV-9"] }),
    });
    assert.equal(e.folioInvoiced, true);
    assert.equal(e.checkoutAllowed, true);
  });

  it("8. a recorded supervisor override lets an unpaid folio check out, open", () => {
    const before = eligibility({ folio: folio({ balance: 50 }), canOverride: true });
    assert.equal(before.overrideAvailable, true);
    assert.equal(before.overrideReasonRequired, true);
    const after = eligibility({
      folio: folio({ balance: 50 }),
      override: { recorded: true, kind: "unpaid", reason: "Company pays" },
      canOverride: true,
    });
    assert.equal(after.checkoutAllowed, true);
    assert.equal(after.closeFolioRequired, false);
    assert.equal(after.overrideAvailable, false);
  });

  it("9. an unauthorized role cannot override", () => {
    const e = eligibility({ folio: folio({ balance: 50 }), canOverride: false });
    assert.equal(e.overrideAllowedForRole, false);
    assert.equal(e.overrideAvailable, false);
    assert.equal(e.checkoutAllowed, false);
    assert.match(server, /requireSupervisor\(me\.role\)/);
    assert.match(server, /reason: z\.string\(\)\.trim\(\)\.min\(1\)/);
  });
});

describe("FO-10R1 folio projections", () => {
  it("10. itemizes debit lines with category, qty, source and poster — no tax split", () => {
    const charges = projectCheckOutCharges(ledger);
    assert.deepEqual(
      charges.map((c) => c.transactionId),
      ["t1", "t2"],
    );
    assert.deepEqual(charges[1], {
      transactionId: "t2",
      postedAt: "2026-10-26T10:00:00Z",
      type: "charge",
      category: "minibar",
      description: "Minibar",
      quantity: 2,
      amount: 18.5,
      postedBy: "Ana Desk",
      source: null,
      roomUnitLabel: null,
    });
    assert.equal(charges[0]!.source, "night_audit");
    assert.ok(!charges.some((c) => "tax" in c));
  });

  it("11. projects payments and credits with method, reference and cashier", () => {
    const payments = projectCheckOutPayments(ledger);
    assert.deepEqual(
      payments.map((p) => [p.transactionId, p.method, p.amount]),
      [
        ["t3", "card", 100],
        ["t4", "bank_transfer", 38.5],
      ],
    );
    assert.equal(payments[0]!.reference, "AUTH-77");
    assert.equal(payments[0]!.cashier, "Ana Desk");
    assert.equal(payments[0]!.channel, "terminal");
  });

  it("reads money from the Cashiering folio read, not a second total", () => {
    assert.match(server, /loadGuestFolio\(supabaseAdmin, restaurantId/);
    assert.match(server, /summarizeFolioLedger\(detail\.transactions\)/);
    assert.match(server, /balance: detail\.balance/);
  });
});

describe("FO-10R1 unit scope", () => {
  it("12. resolves the exact reservationRoomId and rejects a foreign one", () => {
    assert.deepEqual(resolveCheckOutUnit([A, B], "unit-b"), { kind: "unit", unit: B });
    assert.deepEqual(resolveCheckOutUnit([A, B], "unit-x"), {
      kind: "error",
      code: "ROOM_UNIT_NOT_FOUND",
    });
    assert.deepEqual(resolveCheckOutUnit([A], null), { kind: "unit", unit: A });
    assert.deepEqual(resolveCheckOutUnit([], null), { kind: "header" });
  });

  it("13. never picks the first sibling on a multi-room reservation", () => {
    assert.deepEqual(resolveCheckOutUnit([A, B], null), {
      kind: "error",
      code: "ROOM_UNIT_REQUIRED",
    });
    const e = eligibility({ resolution: { kind: "error", code: "ROOM_UNIT_REQUIRED" } });
    assert.equal(e.blockingReason, "unit_required");
    assert.equal(e.checkoutAllowed, false);
    const siblingOut = eligibility({
      resolution: { kind: "unit", unit: B },
      stayStatus: unit("unit-b", 2, { status: "checked_out" }).status,
    });
    assert.equal(siblingOut.blockingReason, "stay_not_in_house");
    assert.match(server, /throw reservationError\(resolution\.code\)/);
    assert.match(server, /_reservation_room_id: before\.reservationRoomId/);
  });
});

describe("FO-GR01B unit guest identity on checkout", () => {
  it("8. the checkout contract reads the resolved unit's own occupant, not the reservation header guest", () => {
    assert.match(server, /function loadUnitOccupant/);
    assert.match(server, /\.from\("hotel_reservation_room_guests"\)/);
    assert.match(server, /\.eq\("reservation_room_id", reservationRoomId\)/);
    assert.match(server, /\.eq\("is_primary", true\)/);
    assert.match(
      server,
      /unit \? loadUnitOccupant\(supabaseAdmin, input\.restaurantId, unit\.id\) : Promise\.resolve\(null\)/,
    );
    assert.match(server, /guestId: unitOccupant\?\.guestId \?\? stay\.guestId/);
    assert.match(server, /guestName: unitOccupant\?\.guestName \?\? stay\.guestName/);
    // Never a bare, unqualified use of the header stay's guest for the contract output.
    assert.doesNotMatch(server, /guestId: stay\.guestId,\s*\n\s*guestName: stay\.guestName,/);
  });

  it("8b. checking out one unit's contract never reads a sibling's occupant (sibling isolation)", () => {
    assert.match(
      server,
      /unit \? loadUnitOccupant\(supabaseAdmin, input\.restaurantId, unit\.id\) : Promise\.resolve\(null\)/,
    );
    // The occupant lookup is scoped to the resolved unit's own id, not any sibling's.
    assert.doesNotMatch(server, /loadUnitOccupant\(supabaseAdmin, input\.restaurantId, units\[0\]/);
  });

  it("7. the checkout folio read stays one row per reservation; no per-unit or per-guest folio", () => {
    assert.match(
      server,
      /\.from\("guest_folios"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("restaurant_id", restaurantId\)\s*\n\s*\.eq\("reservation_id", reservationId\)/,
    );
    assert.match(workspace, /checkOutSharedFolioWarning/);
  });
});

describe("FO-10R1 confirmation and orchestration", () => {
  const base = {
    reservationId: "res-1",
    reservationRoomId: "unit-a",
    stayStatus: "checked_in",
    roomId: "room-unit-a",
    folio: folio(),
    overrideRecorded: false,
  };

  it("14. the confirmation fingerprint changes on any post-review posting or state change", () => {
    const reviewed = checkOutFingerprint(base);
    assert.equal(checkOutFingerprint({ ...base }), reviewed);
    const variants = [
      { ...base, folio: folio({ transactionCount: 4, lastTransactionId: "t4" }) },
      { ...base, folio: folio({ balance: 12 }) },
      { ...base, folio: folio({ status: "closed" }) },
      { ...base, folio: folio({ invoiceNumbers: ["INV-1"], invoiced: true }) },
      { ...base, overrideRecorded: true },
      { ...base, stayStatus: "checked_out" },
      { ...base, roomId: "room-other" },
    ];
    for (const v of variants) assert.notEqual(checkOutFingerprint(v), reviewed);
    assert.match(
      server,
      /getCheckOutConfirmation[\s\S]*?loadCheckOutContract[\s\S]*?expectedFingerprint !== contract\.fingerprint/,
    );
  });

  it("15. completes through the existing writer only after the fresh gate", () => {
    const body = server.slice(server.indexOf("export const completeFoCheckOut"));
    const read = body.indexOf("loadCheckOutContract(");
    const stale = body.indexOf("CHECKOUT_STALE_MESSAGE");
    const gate = body.indexOf("gate.checkoutAllowed");
    const rpc = body.indexOf('rpc("check_out_hotel_reservation"');
    const after = body.indexOf("loadCheckOutCompletion(");
    assert.ok(read > 0 && read < stale && stale < gate && gate < rpc && rpc < after);
    assert.doesNotMatch(
      body,
      /\.from\("folio_transactions"\)\.insert|\.from\("hotel_rooms"\)\.update/,
    );
    assert.doesNotMatch(body, /\.from\("hotel_reservations"\)\.update/);
  });

  it("16. reports the housekeeping consequence the RPC actually applies", () => {
    assert.deepEqual(
      checkOutHousekeepingConsequence({
        roomId: "r1",
        roomNumber: "101",
        currentStatus: "occupied",
        targetStatus: "dirty",
      }),
      {
        roomId: "r1",
        roomNumber: "101",
        currentStatus: "occupied",
        targetStatus: "dirty",
        statusChange: "to_target",
        departureCleaningTask: "ensured",
      },
    );
    assert.equal(
      checkOutHousekeepingConsequence({
        roomId: "r1",
        roomNumber: "101",
        currentStatus: "occupied",
        targetStatus: null,
      }).statusChange,
      "automatic_disabled",
    );
    assert.equal(
      checkOutHousekeepingConsequence({
        roomId: null,
        roomNumber: null,
        currentStatus: null,
        targetStatus: "dirty",
      }).departureCleaningTask,
      "no_room",
    );
    assert.match(
      server,
      /pms_housekeeping_transition_target[\s\S]*?"guest_check_out"[\s\S]*?"dirty"/,
    );
  });

  it("17. a stale or already-checked-out unit cannot complete", () => {
    const e = eligibility({ stayStatus: "checked_out" });
    assert.equal(e.checkoutAllowed, false);
    assert.equal(e.blockingReason, "stay_not_in_house");
    assert.match(
      server,
      /expectedFingerprint !== before\.fingerprint[\s\S]*?CHECKOUT_STALE_MESSAGE/,
    );
  });

  it("18. builds the departure-complete snapshot from post-checkout reads", () => {
    const completion = buildCheckOutCompletion({
      reservationId: "res-1",
      reservationRoomId: "unit-a",
      confirmationNumber: "NR-1001",
      guestName: "Jane Guest",
      roomId: "room-unit-a",
      roomNumber: "101",
      unitStatus: "checked_out",
      reservationStatus: "checked_in",
      folio: folio({ status: "closed" }),
      override: NO_OVERRIDE,
      roomHousekeepingStatus: "dirty",
      housekeepingTarget: "dirty",
      departureTaskId: "task-1",
      checkedOutAt: "2026-10-27T11:00:00Z",
    });
    assert.equal(completion.roomVacated, true);
    assert.equal(completion.reservationStatus, "checked_in");
    assert.equal(completion.folioSettled, true);
    assert.equal(completion.settlement, "settled");
    assert.deepEqual(completion.housekeeping, {
      roomStatus: "dirty",
      targetStatus: "dirty",
      statusApplied: true,
      departureTaskId: "task-1",
    });
    assert.deepEqual(completion.documents, {
      printFolio: true,
      finalFolioReceipt: true,
      bookingVoucher: false,
    });

    const overridden = buildCheckOutCompletion({
      ...{
        reservationId: "res-1",
        reservationRoomId: null,
        confirmationNumber: "NR-1001",
        guestName: "Jane Guest",
        roomId: null,
        roomNumber: null,
        unitStatus: "checked_out",
        reservationStatus: "checked_out",
        roomHousekeepingStatus: null,
        housekeepingTarget: "dirty",
        departureTaskId: null,
        checkedOutAt: null,
      },
      folio: folio({ balance: 40 }),
      override: { recorded: true, kind: "unpaid", reason: "Company pays" },
    });
    assert.equal(overridden.settlement, "override_unpaid");
    assert.equal(overridden.folioSettled, false);
    assert.equal(overridden.folioStatus, "open");
  });

  it("documents: no receipt before settlement, print folio needs a folio", () => {
    assert.deepEqual(checkOutDocumentCapabilities({ folio: null, override: NO_OVERRIDE }), {
      printFolio: false,
      finalFolioReceipt: false,
      bookingVoucher: false,
    });
    assert.equal(
      checkOutDocumentCapabilities({ folio: folio({ status: "open" }), override: NO_OVERRIDE })
        .finalFolioReceipt,
      false,
    );
  });
});

describe("FO-10R2 — checkout workspace pure helpers", () => {
  it("checkOutSharedFolioWarning: single-unit reservations are never shared", () => {
    assert.deepEqual(checkOutSharedFolioWarning({ reservationRoomId: "unit-a", units: [] }), {
      shared: false,
      siblingsInHouse: [],
    });
    assert.deepEqual(
      checkOutSharedFolioWarning({
        reservationRoomId: "unit-a",
        units: [{ id: "unit-a", roomNumber: "101", status: "checked_in" }],
      }),
      { shared: false, siblingsInHouse: [] },
    );
  });

  it("checkOutSharedFolioWarning: multi-room reservation flags in-house siblings only", () => {
    const result = checkOutSharedFolioWarning({
      reservationRoomId: "unit-a",
      units: [
        { id: "unit-a", roomNumber: "101", status: "checked_in" },
        { id: "unit-b", roomNumber: "102", status: "checked_in" },
        { id: "unit-c", roomNumber: "103", status: "checked_out" },
      ],
    });
    assert.equal(result.shared, true);
    assert.deepEqual(result.siblingsInHouse, [
      { id: "unit-b", roomNumber: "102", status: "checked_in" },
    ]);
  });

  it("checkOutSharedFolioWarning: no siblings in-house when every other unit already departed", () => {
    const result = checkOutSharedFolioWarning({
      reservationRoomId: "unit-a",
      units: [
        { id: "unit-a", roomNumber: "101", status: "checked_in" },
        { id: "unit-b", roomNumber: "102", status: "checked_out" },
      ],
    });
    assert.equal(result.shared, true);
    assert.deepEqual(result.siblingsInHouse, []);
  });

  it("checkOutDueLabel: due out today only when scheduled date equals business date", () => {
    assert.equal(checkOutDueLabel("2026-10-27", "2026-10-27"), "due_out_today");
    assert.equal(checkOutDueLabel("2026-10-28", "2026-10-27"), "in_house");
    assert.equal(checkOutDueLabel("2026-10-27", null), "in_house");
  });

  it("checkOutAccountingBadge: reflects override, folio-missing, credit, balance-due, and paid states", () => {
    assert.equal(checkOutAccountingBadge({ folio: null, override: NO_OVERRIDE }), "no_folio");
    assert.equal(
      checkOutAccountingBadge({ folio: folio({ balance: 0 }), override: NO_OVERRIDE }),
      "paid_in_full",
    );
    assert.equal(
      checkOutAccountingBadge({ folio: folio({ balance: 50 }), override: NO_OVERRIDE }),
      "balance_due",
    );
    assert.equal(
      checkOutAccountingBadge({ folio: folio({ balance: -20 }), override: NO_OVERRIDE }),
      "credit",
    );
    assert.equal(
      checkOutAccountingBadge({
        folio: folio({ balance: 50 }),
        override: { recorded: true, kind: "unpaid", reason: "Manager approved" },
      }),
      "override_open",
    );
  });

  it("checkOutDocumentSnapshot: merges charges and payments, sorted by posted date, signs credits negative", () => {
    const snapshot = checkOutDocumentSnapshot({
      propertyName: "Noru House",
      guestName: "Jane Guest",
      confirmationNumber: "NR-1001",
      roomNumber: "101",
      arrivalDate: "2026-10-24",
      departureDate: "2026-10-27",
      folio: folio({ charges: 300, credits: 300, balance: 0, folioNumber: "F-0001" }),
      charges: [
        {
          transactionId: "t1",
          postedAt: "2026-10-24T10:00:00Z",
          type: "room_charge",
          category: "Room",
          description: "Room charge",
          quantity: 1,
          amount: 200,
          postedBy: "front-desk",
          source: "night-audit",
          roomUnitLabel: "101",
        },
        {
          transactionId: "t2",
          postedAt: "2026-10-26T10:00:00Z",
          type: "incidental",
          category: "Restaurant",
          description: "Dinner",
          quantity: 1,
          amount: 100,
          postedBy: "cashier-1",
          source: "pos",
          roomUnitLabel: "101",
        },
      ],
      payments: [
        {
          transactionId: "p1",
          postedAt: "2026-10-25T10:00:00Z",
          type: "payment",
          method: "card",
          reference: "AUTH123",
          cashier: "cashier-1",
          channel: "front-desk",
          amount: 300,
        },
      ],
      overrideOpen: false,
    });

    assert.equal(snapshot.folioNumber, "F-0001");
    assert.equal(snapshot.lines.length, 3);
    assert.deepEqual(
      snapshot.lines.map((line) => line.description),
      ["Room charge", "Payment (card)", "Dinner"],
    );
    assert.equal(snapshot.lines[1]?.amount, -300);
    assert.equal(snapshot.balance, 0);
    assert.equal(snapshot.overrideOpen, false);
  });

  it("checkOutDocumentSnapshot: falls back to a placeholder folio number and open status with no folio", () => {
    const snapshot = checkOutDocumentSnapshot({
      propertyName: "Noru House",
      guestName: "Jane Guest",
      confirmationNumber: "NR-1001",
      roomNumber: "101",
      arrivalDate: "2026-10-24",
      departureDate: "2026-10-27",
      folio: null,
      charges: [],
      payments: [],
      overrideOpen: false,
    });
    assert.equal(snapshot.folioNumber, "—");
    assert.equal(snapshot.folioStatus, "open");
    assert.equal(snapshot.lines.length, 0);
  });
});

describe("FO-10R2 — workspace wiring (source-text)", () => {
  it("renders exactly three stages, not the old A-E stepper", () => {
    assert.match(workspace, /Folio Review & Settlement/);
    assert.match(workspace, /Final Confirmation/);
    assert.match(workspace, /Departure Complete/);
    assert.doesNotMatch(workspace, /FoCheckOutStepper/);
  });

  it("Stage 2 always re-reads the fresh confirmation contract, never reuses Stage 1 values", () => {
    assert.match(workspace, /getCheckOutConfirmation/);
    const confirmEffect = workspace.slice(
      workspace.indexOf("confirmationQuery.data"),
      workspace.indexOf("confirmationQuery.data") + 800,
    );
    assert.match(confirmEffect, /\.stale/);
    assert.match(confirmEffect, /CHECKOUT_STALE_MESSAGE/);
    assert.match(confirmEffect, /setStage\(\s*"folio"\s*\)/);
  });

  it("Stage 2 confirm calls the existing hardened completeFoCheckOut with the exact unit id and fingerprint", () => {
    assert.match(workspace, /const complete = useServerFn\(\s*completeFoCheckOut\s*\)/);
    const mutationSection = workspace.slice(
      workspace.indexOf("completeMut"),
      workspace.indexOf("completeMut") + 1600,
    );
    assert.match(mutationSection, /mutationFn: \(\) =>\s*\n\s*complete\(/);
    assert.match(mutationSection, /reservationRoomId/);
    assert.match(mutationSection, /expectedFingerprint: confirmContract\.fingerprint/);
  });

  it("only one checkout writer is reused for completion — no second writer is invoked", () => {
    const completeCalls = workspace.match(/useServerFn\(\s*completeFoCheckOut\s*\)/g) ?? [];
    assert.equal(completeCalls.length, 1);
  });

  it("the shared multi-room folio warning text is present and gates auto-close on acknowledgement", () => {
    assert.match(workspace, /This folio is shared with other active rooms on this reservation/);
    assert.match(workspace, /checkOutSharedFolioWarning/);
    assert.match(workspace, /sharedCloseAck/);
    assert.match(workspace, /sharedBlocksAutoClose/);
  });

  it("Post Incidental/Minibar is not offered — no safe existing writer exists for it", () => {
    assert.doesNotMatch(workspace, /Post Incidental/);
    assert.doesNotMatch(workspace, /Minibar/);
  });

  it("Stage 3 reuses the existing checkout/folio document renderer and never shows a Booking Voucher", () => {
    assert.match(workspace, /Print Final Folio Receipt/);
    assert.match(workspace, /renderCheckoutDocumentHtml/);
    assert.doesNotMatch(workspace, /Booking Voucher/);
  });

  it("the reservationRoomId is chosen once and never changes for the rest of the flow", () => {
    assert.match(workspace, /reservationRoomId is chosen once and never changes for the rest of/);
    assert.match(workspace, /const \[reservationRoomId, setReservationRoomId\] = useState/);
  });
});

describe("FO-10R2 — old wizard retired from the live checkout dialog", () => {
  it("CheckOutDialog mounts the new workspace, not the old A-E stepper", () => {
    const start = dialogs.indexOf("function CheckOutDialog");
    const end = dialogs.indexOf("export function", start + 1);
    const body = dialogs.slice(start, end === -1 ? start + 2000 : end);
    assert.match(body, /<FoCheckOutWorkspace/);
    // The old stepper's name may appear in a retirement comment, but it must
    // never be rendered as JSX inside this dialog.
    assert.doesNotMatch(body, /<FoCheckOutStepper/);
  });

  it("does not import the old stepper at all", () => {
    assert.doesNotMatch(dialogs, /fo-check-out-stepper/);
  });
});
