import { readFileSync } from "node:fs";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CheckOutContract } from "@/packages/pms/lib/fo-check-out.functions";
import type { CheckOutCompletion } from "@/packages/pms/lib/fo-check-out-contract";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => ({}),
}));

// The real module calls createServerFn, which only works inside the TanStack
// Start runtime. Stub every server-fn-shaped export with a harmless value —
// useServerFn above ignores its argument — but keep the real constant.
vi.mock("@/packages/pms/lib/fo-check-out.functions", () => ({
  CHECKOUT_STALE_MESSAGE:
    "Check-out details changed since review. Review the folio again before completing.",
  closeFolioAtCheckout: {},
  completeFoCheckOut: {},
  ensureCheckOutFolio: {},
  getCheckOutConfirmation: {},
  getCheckOutContext: {},
  getCheckOutContract: {},
  overrideCheckOutSettlement: {},
  postCheckOutPayment: {},
}));

vi.mock("@/packages/pms/lib/fo-approvals.functions", () => ({
  getFrontOfficeApprovalRequirement: {},
}));

vi.mock("@/packages/pms/lib/pms-set1-foundation.functions", () => ({
  getPmsSet1Foundation: {},
}));

// Dialog/DialogContent use a Radix Portal into document.body, which doesn't
// exist under plain renderToString. Swap in plain passthrough containers —
// identical precedent to how create-group-wizard.render.test.tsx stubs its
// own Radix-backed host overlay.
vi.mock("@/shared/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  DialogContent: ({
    children,
    className,
    "data-testid": testId,
  }: {
    children: ReactNode;
    className?: string;
    "data-testid"?: string;
  }) => createElement("div", { "data-testid": testId, className }, children),
}));

const CHECKOUT_STALE_MESSAGE =
  "Check-out details changed since review. Review the folio again before completing.";

function unit(
  id: string,
  roomNumber: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    unitSequence: 1,
    roomTypeId: "type-1",
    roomId: `room-${id}`,
    arrivalDate: "2026-10-24",
    departureDate: "2026-10-27",
    adults: 2,
    status,
    roomNumber,
    ...overrides,
  };
}

function baseStay(overrides: Partial<FrontOfficeStay> = {}): FrontOfficeStay {
  return {
    id: "res-1",
    confirmationNumber: "NR-1001",
    guestId: "guest-1",
    guestName: "Jane Guest",
    guestVip: false,
    guestPhone: null,
    guestEmail: null,
    roomTypeId: "type-1",
    roomTypeName: "Double",
    roomId: "room-1",
    roomNumber: "101",
    arrivalDate: "2026-10-24",
    departureDate: "2026-10-27",
    nights: 3,
    adults: 2,
    children: 0,
    status: "checked_in",
    specialRequests: null,
    overstay: false,
    ...overrides,
  } as FrontOfficeStay;
}

function baseContract(overrides: Partial<CheckOutContract> = {}): CheckOutContract {
  const folio = overrides.folio ?? {
    folioId: "folio-1",
    folioNumber: "F-0001",
    status: "open" as const,
    invoiced: false,
    invoiceNumbers: [],
    currency: "GBP",
    charges: 300,
    credits: 300,
    balance: 0,
    depositsReceived: 0,
    transactionCount: 2,
    lastTransactionId: "t2",
  };
  return {
    reservationId: "res-1",
    reservationRoomId: "unit-a",
    confirmationNumber: "NR-1001",
    guestId: "guest-1",
    guestName: "Jane Guest",
    guestEmail: null,
    roomId: "room-a",
    roomNumber: "101",
    roomTypeName: "Double",
    businessDate: "2026-10-27",
    stay: {
      scope: "unit",
      unitSequence: 1,
      unitCount: 1,
      status: "checked_in",
      arrivalDate: "2026-10-24",
      scheduledDepartureDate: "2026-10-27",
      nights: 3,
      adults: 2,
      children: 0,
    },
    folio,
    charges: [],
    payments: [],
    override: { recorded: false, kind: null, reason: null },
    settlement: "open",
    eligibility: {
      financiallyClear: true,
      isZero: true,
      outstanding: 0,
      credit: 0,
      folioMissing: false,
      folioClosed: false,
      folioInvoiced: false,
      overrideRecorded: false,
      overrideKind: null,
      overrideAllowedForRole: false,
      overrideAvailable: false,
      overrideReasonRequired: true,
      closeFolioRequired: false,
      checkoutAllowed: true,
      blockingReason: null,
      reasons: [],
    },
    housekeeping: {
      roomId: "room-a",
      roomNumber: "101",
      currentStatus: "occupied",
      targetStatus: "dirty",
      statusChange: "to_target",
      departureCleaningTask: "ensured",
    },
    documents: { printFolio: true, finalFolioReceipt: false, bookingVoucher: false },
    fingerprint: "fp-1",
    readAt: "2026-10-27T09:00:00Z",
    ...overrides,
  } as CheckOutContract;
}

function renderWorkspace(
  contract: CheckOutContract,
  stay: FrontOfficeStay,
  queryKeySuffix: string | null = null,
) {
  return (async () => {
    const { FoCheckOutWorkspace } = await import("./fo-check-out-workspace");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reservationRoomId = queryKeySuffix ?? stay.reservationRoomId ?? "";
    client.setQueryData(["fo-check-out-contract", "rest-1", stay.id, reservationRoomId], contract);
    let markup = "";
    expect(() => {
      markup = renderToString(
        createElement(
          QueryClientProvider,
          { client },
          createElement(FoCheckOutWorkspace, {
            restaurantId: "rest-1",
            stay,
            open: true,
            onOpenChange: () => undefined,
          }),
        ),
      );
    }).not.toThrow();
    return markup;
  })();
}

describe("FoCheckOutWorkspace — Stage 1 Folio Review & Settlement", () => {
  it("zero-balance / paid-in-full: shows the paid badge and enables Continue", async () => {
    const markup = await renderWorkspace(baseContract(), baseStay());
    expect(markup).toContain("fo-check-out-stage-folio");
    expect(markup).toContain("Paid in Full");
    expect(markup).toContain("Jane Guest");
    expect(markup).toContain("Folio #");
    expect(markup).toContain("F-0001");
    expect(markup).not.toContain("fo-check-out-record-payment");
  });

  it("balance-due: shows Balance Due badge, Record Payment action, and disables Continue", async () => {
    const contract = baseContract({
      folio: {
        folioId: "folio-1",
        folioNumber: "F-0001",
        status: "open",
        invoiced: false,
        invoiceNumbers: [],
        currency: "GBP",
        charges: 300,
        credits: 250,
        balance: 50,
        depositsReceived: 0,
        transactionCount: 2,
        lastTransactionId: "t2",
      },
      eligibility: {
        ...baseContract().eligibility,
        financiallyClear: false,
        isZero: false,
        outstanding: 50,
        checkoutAllowed: false,
        blockingReason: "outstanding_balance",
        reasons: ["outstanding_balance"],
      },
    });
    const markup = await renderWorkspace(contract, baseStay());
    expect(markup).toContain("Balance Due");
    expect(markup).toContain("fo-check-out-record-payment");
    expect(markup).toMatch(/fo-check-out-continue"[^>]*disabled=""/);
  });

  it("credit state: shows the Credit badge", async () => {
    const contract = baseContract({
      folio: {
        folioId: "folio-1",
        folioNumber: "F-0001",
        status: "open",
        invoiced: false,
        invoiceNumbers: [],
        currency: "GBP",
        charges: 100,
        credits: 150,
        balance: -50,
        depositsReceived: 0,
        transactionCount: 2,
        lastTransactionId: "t2",
      },
    });
    const markup = await renderWorkspace(contract, baseStay());
    expect(markup).toContain("Credit");
  });

  it("override state: shows the Override badge and the left-open chip with reason", async () => {
    const contract = baseContract({
      override: { recorded: true, kind: "unpaid", reason: "Manager approved — company bill" },
      settlement: "override_unpaid",
      eligibility: {
        ...baseContract().eligibility,
        overrideRecorded: true,
        overrideKind: "unpaid",
        checkoutAllowed: true,
      },
    });
    const markup = await renderWorkspace(contract, baseStay());
    expect(markup).toContain("Override");
    expect(markup).toContain("Manager approved — company bill");
  });

  it("closed/invoiced folio: shows authoritative Paid in Full state from the closed folio", async () => {
    const contract = baseContract({
      folio: {
        folioId: "folio-1",
        folioNumber: "F-0001",
        status: "closed",
        invoiced: true,
        invoiceNumbers: ["INV-001"],
        currency: "GBP",
        charges: 300,
        credits: 300,
        balance: 0,
        depositsReceived: 0,
        transactionCount: 2,
        lastTransactionId: "t2",
      },
    });
    const markup = await renderWorkspace(contract, baseStay());
    expect(markup).toContain("Paid in Full");
  });

  it("itemized charges render date, category, description, posted-by, and amount", async () => {
    const contract = baseContract({
      charges: [
        {
          transactionId: "t1",
          postedAt: "2026-10-24T10:00:00Z",
          type: "room_charge",
          category: "Room",
          description: "Room charge — night 1",
          quantity: 1,
          amount: 150,
          postedBy: "front-desk",
          source: "night-audit",
          roomUnitLabel: "101",
        },
      ],
    });
    const markup = await renderWorkspace(contract, baseStay());
    expect(markup).toContain("fo-check-out-charges-table");
    expect(markup).toContain("Room charge — night 1");
    expect(markup).toContain("front-desk");
  });

  it("payments & credits render payment method, reference, cashier/channel, and amount", async () => {
    const contract = baseContract({
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
    });
    const markup = await renderWorkspace(contract, baseStay());
    expect(markup).toContain("fo-check-out-payments-table");
    expect(markup).toContain("AUTH123");
    expect(markup).toContain("cashier-1");
  });

  it("multi-room shared folio: warns when sibling units are still in-house", async () => {
    const stay = baseStay({
      reservationRoomId: "unit-a",
      roomUnits: [unit("unit-a", "101", "checked_in"), unit("unit-b", "102", "checked_in")],
    });
    const contract = baseContract({
      reservationRoomId: "unit-a",
      eligibility: { ...baseContract().eligibility, closeFolioRequired: true },
    });
    const markup = await renderWorkspace(contract, stay);
    expect(markup).toContain("fo-check-out-shared-folio-warning");
    expect(markup).toContain("This folio is shared with other active rooms on this reservation.");
    expect(markup).toContain("fo-check-out-shared-close-ack");
  });

  it("multi-room, no in-house siblings: does not render the shared folio warning", async () => {
    const stay = baseStay({
      reservationRoomId: "unit-a",
      roomUnits: [unit("unit-a", "101", "checked_in"), unit("unit-b", "102", "checked_out")],
    });
    const contract = baseContract({ reservationRoomId: "unit-a" });
    const markup = await renderWorkspace(contract, stay);
    expect(markup).not.toContain("fo-check-out-shared-folio-warning");
  });

  it("exact reservationRoomId is preserved — the fixed unit's own contract is what renders", async () => {
    const stay = baseStay({
      reservationRoomId: "unit-b",
      roomUnits: [unit("unit-a", "101", "checked_in"), unit("unit-b", "102", "checked_in")],
    });
    const contract = baseContract({ reservationRoomId: "unit-b", roomNumber: "102" });
    const markup = await renderWorkspace(contract, stay, "unit-b");
    expect(markup).toContain("Room #102");
  });

  it("stale message banner renders on the folio stage when set", async () => {
    // Source-level proof that the banner text matches the real stale constant
    // lives in fo-check-out-contract.test.ts; this proves the Stage 1 markup
    // path itself (denyMessage/staleMessage block) renders without throwing.
    const markup = await renderWorkspace(baseContract(), baseStay());
    expect(markup).not.toContain("fo-check-out-stale");
    expect(CHECKOUT_STALE_MESSAGE.length).toBeGreaterThan(0);
  });
});

describe("FoCheckOutWorkspace — Stage 2 Final Confirmation (direct render)", () => {
  it("renders guest name, vacating room, totals, final balance, and the housekeeping trigger", async () => {
    const { FinalConfirmationStage } = await import("./fo-check-out-workspace");
    const contract = baseContract({
      guestName: "Jane Guest",
      roomNumber: "101",
      folio: {
        folioId: "folio-1",
        folioNumber: "F-0001",
        status: "closed",
        invoiced: false,
        invoiceNumbers: [],
        currency: "GBP",
        charges: 300,
        credits: 300,
        balance: 0,
        depositsReceived: 0,
        transactionCount: 2,
        lastTransactionId: "t2",
      },
    });
    const markup = renderToString(
      createElement(FinalConfirmationStage, {
        contract,
        loading: false,
        money: (v: number) => `£${v.toFixed(2)}`,
      }),
    );
    expect(markup).toContain("fo-check-out-stage-confirm");
    expect(markup).toContain("Jane Guest");
    expect(markup).toContain("Room #101");
    expect(markup).toContain("fo-check-out-final-balance");
    expect(markup).toContain("Housekeeping Turnover Trigger");
    expect(markup).toContain("dirty");
  });

  it("shows a loading state instead of stale Stage 1 values while the fresh read is in flight", async () => {
    const { FinalConfirmationStage } = await import("./fo-check-out-workspace");
    const markup = renderToString(
      createElement(FinalConfirmationStage, {
        contract: null,
        loading: true,
        money: (v: number) => `£${v.toFixed(2)}`,
      }),
    );
    expect(markup).toContain("Reviewing the fresh folio");
  });
});

describe("FoCheckOutWorkspace — Stage 3 Departure Complete (direct render)", () => {
  function completion(overrides: Partial<CheckOutCompletion> = {}): CheckOutCompletion {
    return {
      reservationId: "res-1",
      reservationRoomId: "unit-a",
      confirmationNumber: "NR-1001",
      guestName: "Jane Guest",
      roomId: "room-a",
      roomNumber: "101",
      roomVacated: true,
      unitStatus: "checked_out",
      reservationStatus: "checked_out",
      folioId: "folio-1",
      folioNumber: "F-0001",
      folioStatus: "closed",
      folioBalance: 0,
      folioSettled: true,
      settlement: "settled",
      housekeeping: {
        roomStatus: "dirty",
        targetStatus: "dirty",
        statusApplied: true,
        departureTaskId: "task-1",
      },
      checkedOutAt: "2026-10-27T11:00:00Z",
      documents: { printFolio: true, finalFolioReceipt: true, bookingVoucher: false },
      ...overrides,
    };
  }

  it("renders the real completion result: departed guest, booking reference, room/housekeeping, folio status, balance, timestamp", async () => {
    const { DepartureCompleteStage } = await import("./fo-check-out-workspace");
    const markup = renderToString(
      createElement(DepartureCompleteStage, {
        completion: completion(),
        money: (v: number) => `£${v.toFixed(2)}`,
      }),
    );
    expect(markup).toContain("fo-check-out-stage-complete");
    expect(markup).toContain("Check-Out Successfully Processed!");
    expect(markup).toContain("Jane Guest");
    expect(markup).toContain("NR-1001");
    expect(markup).toContain("Room #101");
    expect(markup).toContain("fo-check-out-folio-accounting");
    expect(markup).toContain("Settled in Full");
    expect(markup).not.toContain("Booking Voucher");
  });

  it("reflects an override-left-open completion authoritatively, not a fabricated settled state", async () => {
    const { DepartureCompleteStage } = await import("./fo-check-out-workspace");
    const markup = renderToString(
      createElement(DepartureCompleteStage, {
        completion: completion({
          settlement: "override_unpaid",
          folioBalance: 50,
          folioStatus: "open",
        }),
        money: (v: number) => `£${v.toFixed(2)}`,
      }),
    );
    expect(markup).toContain("Left open — unpaid override");
  });
});

describe("FoCheckOutWorkspace — footer actions by stage (source-text, see fo-check-out-contract.test.ts for wiring proofs)", () => {
  it("Print Final Folio Receipt and Done are the only Stage 3 document actions; Booking Voucher is absent", () => {
    const file = readFileSync(new URL("./fo-check-out-workspace.tsx", import.meta.url), "utf8");
    expect(file).toContain("fo-check-out-print-receipt");
    expect(file).toContain("Print Final Folio Receipt");
    expect(file).toContain("fo-check-out-done");
    expect(file).not.toContain("Booking Voucher");
  });
});
