import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOSHOW_NOT_EVALUATED,
  canConfirmNoShowReservation,
  canContinueNoShowReview,
  composeNoShowReason,
  isDeskNoShowEligible,
  noShowFinanceRows,
  pickNoShowHistory,
  postedNoShowFeeAmount,
  predictedNoShowUpdates,
} from "@/packages/pms/lib/reservation-noshow-workspace";

describe("reservation no-show workspace helpers", () => {
  it("reuses Desk Mark No-Show eligibility (confirmed + arrival on/before business date)", () => {
    expect(isDeskNoShowEligible("confirmed", "2026-09-22", "2026-09-22")).toBe(true);
    expect(isDeskNoShowEligible("confirmed", "2026-09-23", "2026-09-22")).toBe(false);
    expect(isDeskNoShowEligible("pending", "2026-09-22", "2026-09-22")).toBe(false);
    expect(isDeskNoShowEligible("checked_in", "2026-09-22", "2026-09-22")).toBe(false);
  });

  it("does not invent a no-show fee and keeps cashiering collect honesty", () => {
    const rows = noShowFinanceRows({
      roomSubtotal: 9000,
      packageAmount: 0,
      additionalServices: null,
      postedNoShowFee: null,
      feeRequired: false,
      feeSatisfied: true,
      depositAmount: 4500,
      folioBalance: 0,
      money: (value) => `ETB ${value}`,
    });
    expect(rows.find((row) => row.description === "Room Charges")?.status).toBe(
      "Stored on reservation",
    );
    expect(rows.find((row) => row.description === "No-Show Charge")?.status).toBe("Not applicable");
    expect(rows.find((row) => row.description === "Amount to Collect")?.status).toBe(
      "No balance to collect",
    );
    expect(
      postedNoShowFeeAmount([{ type: "charge", description: "No-show charge", amount: 9000 }]),
    ).toBe(9000);
  });

  it("gates confirm on existing reason and FO no-show fee rules", () => {
    expect(
      canContinueNoShowReview({
        status: "confirmed",
        arrivalDate: "2026-09-22",
        businessDate: "2026-09-22",
        reason: "Guest Did Not Arrive",
      }),
    ).toBe(true);
    expect(
      canConfirmNoShowReservation({
        status: "confirmed",
        arrivalDate: "2026-09-22",
        businessDate: "2026-09-22",
        reason: composeNoShowReason("Guest Did Not Arrive", ""),
        feeRequired: true,
        posted: false,
        waived: false,
      }),
    ).toBe(false);
    expect(
      canConfirmNoShowReservation({
        status: "confirmed",
        arrivalDate: "2026-09-22",
        businessDate: "2026-09-22",
        reason: "Guest Did Not Arrive",
        feeRequired: true,
        posted: false,
        waived: true,
      }),
    ).toBe(true);
  });

  it("only claims room release and history that completeFoNoShow performs", () => {
    const rows = predictedNoShowUpdates({ assignedRoom: "305", feeRequired: false });
    expect(rows.some((row) => /email|housekeeping|blacklist/i.test(row.title))).toBe(false);
    expect(
      pickNoShowHistory([
        {
          id: "h1",
          eventType: "amended",
          previousValues: null,
          newValues: { no_show_reason: "Guest Did Not Arrive" },
          notes: "Guest Did Not Arrive",
          createdAt: "2026-09-22T18:35:00.000Z",
          actorName: "Abebawe Demeke",
        },
      ])?.actorName,
    ).toBe("Abebawe Demeke");
    expect(NOSHOW_NOT_EVALUATED).toBe("Not evaluated");
  });
});

describe("reservation no-show workspace UI", () => {
  const ui = readFileSync(
    resolve(
      process.cwd(),
      "src/packages/pms/components/workspaces/reservation-noshow-workspace.tsx",
    ),
    "utf8",
  );
  const desk = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
    "utf8",
  );
  const actions = readFileSync(
    resolve(
      process.cwd(),
      "src/packages/pms/components/reservations/reservation-context-actions.ts",
    ),
    "utf8",
  );

  it("opens a dedicated overlay from Desk Mark No-Show and reuses completeFoNoShow", () => {
    expect(desk).toContain("function openNoShowReservation(id: string)");
    expect(desk).toContain('setOverlay({ type: "no-show-reservation", reservationId: id })');
    expect(desk).toContain("openNoShowReservation(row.reservationId)");
    expect(desk).toContain("<ReservationNoShowWorkspace");
    expect(desk).not.toContain("<NoShowDialog");
    expect(ui).toContain("completeFoNoShow");
    expect(ui).toContain("getCancelNoShowContext");
    expect(ui).toContain("isDeskNoShowEligible");
    expect(ui).toContain("Arrival Status");
    expect(ui).toContain("Cancellation Policy Check");
    expect(ui).toContain("NOSHOW_COMM_GAP");
    expect(ui).toContain("NOSHOW_BLACKLIST_GAP");
    expect(ui).not.toContain("Notification Sent");
    expect(actions).toContain('id: "no_show"');
    expect(actions).toContain("arrivalDate <= input.businessDate");
  });
});
