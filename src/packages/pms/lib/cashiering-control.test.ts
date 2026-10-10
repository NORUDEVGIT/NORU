import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  belongsToBusinessDate,
  departuresRequiringSettlement,
  otherOpenShifts,
  previousClosedShift,
  propertyDayBounds,
  selectOwnOpenShift,
  splitStampedCash,
  summarizeBusinessDateActivity,
  variancePresentation,
  visibleShiftHistory,
  type BusinessActivityRow,
} from "./cashiering-control.ts";

function drawerExpected(input: {
  opening: number;
  cashIn: number;
  cashOut: number;
  hotelCash: number;
}): number {
  return Math.round((input.opening + input.cashIn - input.cashOut + input.hotelCash) * 100) / 100;
}

const TZ = "Africa/Addis_Ababa";
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const activityFn = readFileSync(
  new URL("./cashiering-control.functions.ts", import.meta.url),
  "utf8",
);
const panel = readFileSync(
  new URL("../components/cashiering/cashier-control-panel.tsx", import.meta.url),
  "utf8",
);
const stamp = readFileSync(
  new URL(
    "../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql",
    import.meta.url,
  ),
  "utf8",
);
const accounts = readFileSync(
  new URL(
    "../../../../supabase/migrations/0128_cashiering_phase8_financial_accounts.sql",
    import.meta.url,
  ),
  "utf8",
);
const closeDate = readFileSync(
  new URL(
    "../../../../supabase/migrations/0115_night_audit_phase0_close_guard.sql",
    import.meta.url,
  ),
  "utf8",
);
const server = readFileSync(new URL("./cashiering.server.ts", import.meta.url), "utf8");
const drawer = readFileSync(
  new URL(
    "../../../../supabase/migrations/0114_cashiering_phase6_hotel_drawer.sql",
    import.meta.url,
  ),
  "utf8",
);

function row(
  partial: Partial<BusinessActivityRow> &
    Pick<BusinessActivityRow, "id" | "type" | "amount" | "postedAt">,
): BusinessActivityRow {
  return {
    category: partial.type,
    description: partial.id,
    createdAt: partial.postedAt,
    paymentMethod: null,
    originalTransactionId: null,
    referenceType: null,
    referenceId: null,
    transferId: null,
    postedBy: "Ada",
    ownerLabel: "Guest",
    ...partial,
  };
}

describe("cashier control business date", () => {
  it("uses the property timezone, not UTC midnight", () => {
    const bounds = propertyDayBounds("2026-10-10", TZ);
    assert.equal(bounds.startIso, "2026-10-09T21:00:00.000Z");
    assert.equal(bounds.endIso, "2026-10-10T21:00:00.000Z");
    const lateUtc = "2026-10-10T22:00:00.000Z";
    assert.equal(belongsToBusinessDate(lateUtc, "2026-10-10", TZ), false);
    assert.equal(belongsToBusinessDate(lateUtc, "2026-10-11", TZ), true);
    assert.equal(belongsToBusinessDate("2026-10-10T20:30:00.000Z", "2026-10-10", TZ), true);
  });

  it("keeps payments, deposits, and refunds apart and groups tax into one event", () => {
    const summary = summarizeBusinessDateActivity({
      businessDate: "2026-10-10",
      timezone: TZ,
      rows: [
        row({
          id: "pay",
          type: "payment",
          amount: -400,
          postedAt: "2026-10-10T09:00:00.000Z",
          paymentMethod: "card",
        }),
        row({
          id: "dep",
          type: "deposit",
          amount: -100,
          postedAt: "2026-10-10T10:00:00.000Z",
          paymentMethod: "cash",
        }),
        row({
          id: "ref",
          type: "refund",
          amount: 25,
          postedAt: "2026-10-10T11:00:00.000Z",
          paymentMethod: "cash",
        }),
        row({
          id: "mystery",
          type: "refund",
          amount: 10,
          postedAt: "2026-10-10T11:30:00.000Z",
          paymentMethod: null,
        }),
        row({
          id: "room",
          type: "charge",
          category: "room",
          amount: 500,
          postedAt: "2026-10-10T08:00:00.000Z",
          description: "Room",
        }),
        row({
          id: "tax",
          type: "charge",
          category: "tax",
          amount: 75,
          postedAt: "2026-10-10T08:00:00.000Z",
          originalTransactionId: "room",
          description: "Tax",
        }),
        row({
          id: "next-day",
          type: "payment",
          amount: -999,
          postedAt: "2026-10-10T22:30:00.000Z",
          paymentMethod: "cash",
        }),
      ],
    });
    assert.equal(summary.payments.amount, 400);
    assert.equal(summary.payments.count, 1);
    assert.equal(summary.deposits.amount, 100);
    assert.equal(summary.deposits.count, 1);
    assert.equal(summary.refunds.amount, 35);
    assert.equal(summary.transactions, 5);
    const cash = summary.paymentMethods.find((method) => method.method === "cash");
    assert.equal(cash?.depositAmount, 100);
    assert.equal(cash?.refundAmount, 25);
    assert.equal(cash?.net, 75);
    const card = summary.paymentMethods.find((method) => method.method === "card");
    assert.equal(card?.paymentAmount, 400);
    assert.equal(summary.recent[0]?.id === "next-day", false);
    assert.equal(
      summary.recent.some((event) => event.id === "room" && event.amount === 575),
      true,
    );
  });

  it("queues only in-house departures on the business date with a balance", () => {
    const rows = departuresRequiringSettlement(
      [
        {
          folioId: "due",
          folioNumber: "F-1",
          room: "101",
          guest: "Ada",
          departure: "2026-10-10",
          reservationStatus: "checked_in",
          folioStatus: "open",
          balance: 40,
        },
        {
          folioId: "zero",
          folioNumber: "F-2",
          room: "102",
          guest: "Bea",
          departure: "2026-10-10",
          reservationStatus: "checked_in",
          folioStatus: "open",
          balance: 0,
        },
        {
          folioId: "tomorrow",
          folioNumber: "F-3",
          room: "103",
          guest: "Cam",
          departure: "2026-10-11",
          reservationStatus: "checked_in",
          folioStatus: "open",
          balance: 80,
        },
      ],
      "2026-10-10",
    );
    assert.deepEqual(
      rows.map((row) => row.folioId),
      ["due"],
    );
  });
});

describe("cashier control shift ownership", () => {
  const shifts = [
    { id: "newer", membershipId: "other", status: "open", closedAt: null },
    { id: "mine", membershipId: "me", status: "open", closedAt: null },
    { id: "old", membershipId: "me", status: "closed", closedAt: "2026-10-09T18:00:00.000Z" },
  ];

  it("selects the current membership even when another cashier opened later", () => {
    assert.equal(selectOwnOpenShift(shifts, "me")?.id, "mine");
    assert.equal(selectOwnOpenShift(shifts, "missing"), null);
    assert.deepEqual(
      otherOpenShifts(shifts, "me").map((shift) => shift.id),
      ["newer"],
    );
    assert.equal(previousClosedShift(shifts, "me")?.id, "old");
    assert.deepEqual(
      visibleShiftHistory(shifts, "me", "cashier").map((shift) => shift.id),
      ["mine", "old"],
    );
    assert.equal(visibleShiftHistory(shifts, "me", "accountant").length, 3);
    assert.equal(visibleShiftHistory(shifts, "me", "manager").length, 3);
  });
});

describe("cashier drawer expected cash", () => {
  it("locks opening, cash movement, and stamped guest cash", () => {
    const hotelCash = 500 + 200 - 50;
    assert.equal(drawerExpected({ opening: 1000, cashIn: 100, cashOut: 25, hotelCash }), 1725);
    const stamped = splitStampedCash([
      { type: "payment", amount: -500, paymentMethod: "cash" },
      { type: "deposit", amount: -200, paymentMethod: "cash" },
      { type: "refund", amount: 50, paymentMethod: "cash" },
      { type: "payment", amount: -900, paymentMethod: "card" },
      { type: "payment", amount: -800, paymentMethod: "bank_transfer" },
      { type: "payment", amount: -700, paymentMethod: "mobile_money" },
      { type: "charge", amount: 300, paymentMethod: null },
      { type: "adjustment", amount: -40, paymentMethod: null },
    ]);
    assert.deepEqual(stamped, { cashPayments: 500, cashDeposits: 200, cashRefunds: 50 });
    assert.equal(variancePresentation(26400, 26500).difference, -100);
    assert.equal(variancePresentation(26400, 26500).label, "Variance");
    assert.equal(variancePresentation(26500, 26500).label, "Matched");
    assert.equal(variancePresentation(26400, 26500).difference, -100);
  });

  it("keeps both cash posts on one shift across a business-date rollover", () => {
    const shiftId = "shift-1";
    const before = "2026-10-10T20:00:00.000Z";
    const after = "2026-10-10T22:30:00.000Z";
    const stamped = [
      { shiftId, type: "payment", amount: -500, paymentMethod: "cash", postedAt: before },
      { shiftId, type: "payment", amount: -200, paymentMethod: "cash", postedAt: after },
    ];
    assert.equal(new Set(stamped.map((row) => row.shiftId)).size, 1);
    assert.equal(
      drawerExpected({
        opening: 0,
        cashIn: 0,
        cashOut: 0,
        hotelCash: splitStampedCash(stamped).cashPayments,
      }),
      700,
    );
    const firstDay = summarizeBusinessDateActivity({
      businessDate: "2026-10-10",
      timezone: TZ,
      rows: stamped.map((item) =>
        row({
          id: item.postedAt,
          type: "payment",
          amount: item.amount,
          postedAt: item.postedAt,
          paymentMethod: "cash",
        }),
      ),
    });
    const secondDay = summarizeBusinessDateActivity({
      businessDate: "2026-10-11",
      timezone: TZ,
      rows: stamped.map((item) =>
        row({
          id: item.postedAt,
          type: "payment",
          amount: item.amount,
          postedAt: item.postedAt,
          paymentMethod: "cash",
        }),
      ),
    });
    assert.equal(firstDay.payments.amount, 500);
    assert.equal(secondDay.payments.amount, 200);
    assert.doesNotMatch(closeDate, /hotel_cashier_shifts/);
    assert.match(stamp, /clean_method = 'cash' AND _type IN \('payment','deposit','refund'\)/);
    const accountPost = accounts.slice(accounts.indexOf("post_financial_account_transaction"));
    const insert = accountPost.slice(
      accountPost.indexOf("INSERT INTO public.folio_transactions"),
      accountPost.indexOf("RETURNING"),
    );
    assert.doesNotMatch(insert, /hotel_cashier_shift_id/);
  });
});

describe("cashier control writers stay authoritative", () => {
  it("does not let cashiering edit the business date or invent shift controls", () => {
    const dashboard = poster.slice(poster.indexOf("export const getCashieringDashboard"));
    assert.match(dashboard, /propertyDayBounds/);
    assert.doesNotMatch(
      dashboard.slice(0, dashboard.indexOf("export const initializeFolio")),
      /T00:00:00Z/,
    );
    assert.match(dashboard, /transaction_type === "payment"\) todayPayments/);
    assert.doesNotMatch(dashboard, /payment" \|\| t\.transaction_type === "deposit"/);
    assert.doesNotMatch(activityFn, /close_business_date/);
    assert.doesNotMatch(activityFn, /\.update\(/);
    assert.match(activityFn, /viewDate \?\? property\.businessDate/);
    assert.match(activityFn, /Company and group cash/);
    assert.match(drawer, /SHIFT_ALREADY_OPEN/);
    assert.match(drawer, /opening_cash >= 0/);
    const closeFn = drawer.slice(
      drawer.indexOf("FUNCTION public.close_hotel_cashier_shift"),
      drawer.indexOf("FUNCTION public.list_hotel_drawers"),
    );
    assert.doesNotMatch(closeFn, /variance/);
    assert.match(drawer, /opening \+ cash_in - cash_out \+ hotel_cash/);
    assert.match(server, /input\.opening \+ input\.cashIn - input\.cashOut \+ input\.hotelCash/);
    assert.match(poster, /You can only close your own cashier shift/);
    assert.match(poster, /_membership_id: me\.id/);
    const openUi = panel.slice(panel.indexOf("function OpenShiftForm"));
    assert.match(openUi, /openingCash: amount, notes/);
    assert.doesNotMatch(openUi, /business_date/);
    assert.doesNotMatch(
      panel,
      /Shift Type|Workstation|Create Guarantee|Enable receipt|cash drawer hardware|Hand over|card float/i,
    );
    assert.match(panel, /selectOwnOpenShift/);
    assert.match(panel, /canOperate \?/);
    assert.match(panel, /canManage \?/);
    assert.match(poster, /Do not wire this into the hotel/);
  });
});
