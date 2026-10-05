import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANCEL_NOT_EVALUATED,
  canConfirmCancelReservation,
  canContinueCancelReview,
  cancelFinanceRows,
  cancelPolicyView,
  composeCancelReason,
  folioCreditExposure,
  persistedSystemUpdates,
  postedCancelFeeAmount,
  predictedSystemUpdates,
} from "@/packages/pms/lib/reservation-cancel-workspace";

describe("reservation cancel workspace helpers", () => {
  it("evaluates free-cancel vs penalty vs not evaluated without inventing a fee", () => {
    const snapshot = {
      name: "BAR Flexible",
      policy_kind: "free_cancellation",
      window_value: 2,
      window_unit: "days_before_arrival",
      cutoff_time: "18:00",
      penalty_type: "none",
    };
    const within = cancelPolicyView(
      snapshot,
      "2026-09-22",
      "Africa/Addis_Ababa",
      new Date("2026-09-19T10:00:00.000Z"),
    );
    expect(within.outcome).toBe("within_free");
    expect(within.deadlineLabel.toLowerCase()).toContain("free cancellation");

    const late = cancelPolicyView(
      snapshot,
      "2026-09-22",
      "UTC",
      new Date("2026-09-22T10:00:00.000Z"),
    );
    expect(late.outcome).toBe("penalty_applies");

    const missing = cancelPolicyView(null, "2026-09-22", "UTC", new Date());
    expect(missing.outcome).toBe("not_evaluated");
    expect(missing.outcomeLabel).toBe(CANCEL_NOT_EVALUATED);

    const nr = cancelPolicyView(
      { name: "NR", policy_kind: "non_refundable" },
      "2026-09-22",
      "UTC",
      new Date(),
    );
    expect(nr.outcome).toBe("penalty_applies");
  });

  it("keeps financial rows on stored values and cashiering refund honesty", () => {
    const rows = cancelFinanceRows({
      roomSubtotal: 9000,
      packageAmount: 0,
      additionalServices: null,
      postedCancelFee: null,
      feeRequired: false,
      feeSatisfied: true,
      creditBalance: 0,
      money: (value) => `ETB ${value}`,
    });
    expect(rows[0]?.amount).toBe("ETB 9000");
    expect(rows[1]?.amount).toBe("Included");
    expect(rows[2]?.amount).toBe("—");
    expect(rows[3]?.status).toBe("Not applicable");
    expect(rows[4]?.status).toBe("No refund posted");
    expect(folioCreditExposure(-4500)).toBe(4500);
    expect(
      postedCancelFeeAmount([{ type: "charge", description: "Cancel fee", amount: 100 }]),
    ).toBe(100);
  });

  it("gates continue/confirm on existing reason and fee rules", () => {
    expect(canContinueCancelReview({ status: "confirmed", reason: "Guest Cancelled" })).toBe(true);
    expect(canContinueCancelReview({ status: "checked_in", reason: "Guest Cancelled" })).toBe(
      false,
    );
    expect(
      canConfirmCancelReservation({
        status: "confirmed",
        reason: "Guest Cancelled",
        feeRequired: true,
        posted: false,
        waived: false,
      }),
    ).toBe(false);
    expect(
      canConfirmCancelReservation({
        status: "pending",
        reason: composeCancelReason("Guest Cancelled", "changed plans"),
        feeRequired: true,
        posted: false,
        waived: true,
      }),
    ).toBe(true);
  });

  it("only claims room release and audit that completeFoCancel performs", () => {
    const predicted = predictedSystemUpdates({ assignedRoom: "305", feeRequired: false });
    expect(
      predicted.some((row) => /email|housekeeping notified|refund processed/i.test(row.title)),
    ).toBe(false);
    expect(predicted.find((row) => row.id === "inventory")?.title).toContain("305");
    const persisted = persistedSystemUpdates({
      status: "cancelled",
      roomReleased: true,
      assignedBefore: "305",
      historyRecorded: true,
    });
    expect(persisted.every((row) => row.guaranteed)).toBe(true);
  });
});

describe("reservation cancel workspace UI", () => {
  const ui = readFileSync(
    resolve(
      process.cwd(),
      "src/packages/pms/components/workspaces/reservation-cancel-workspace.tsx",
    ),
    "utf8",
  );
  const desk = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
    "utf8",
  );

  it("opens a dedicated overlay from Desk Cancel and reuses completeFoCancel", () => {
    expect(desk).toContain("function openCancelReservation(id: string)");
    expect(desk).toContain('setOverlay({ type: "cancel-reservation", reservationId: id })');
    expect(desk).toContain("openCancelReservation(row.reservationId)");
    expect(desk).toContain("<ReservationCancelWorkspace");
    expect(ui).toContain("completeFoCancel");
    expect(ui).toContain("getCancelNoShowContext");
    expect(ui).toContain("Reservation Details");
    expect(ui).toContain("Cancellation Policy");
    expect(ui).toContain("Financial Impact");
    expect(ui).toContain("Room Inventory Impact");
    expect(ui).toContain("Related System Updates");
    expect(ui).toContain("Cancellation Reason");
    expect(ui).toContain("CANCEL_COMM_GAP");
    expect(ui).not.toContain("Confirmation Sent");
    expect(ui).not.toContain("email has been sent");
  });
});
