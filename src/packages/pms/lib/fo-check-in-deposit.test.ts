import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/fo-check-in.functions.ts"),
  "utf8",
);
const deposit = source.slice(
  source.indexOf("export const postCheckInDeposit"),
  source.indexOf("export const waiveCheckInDeposit"),
);

describe("postCheckInDeposit tender", () => {
  it("stores the tender that was posted and does not read an undeclared method", () => {
    expect(deposit).toContain("paymentMethod: tender.stored");
    expect(deposit).toContain("deposit_method: tender.stored");
    expect(deposit).toContain("method: tender.stored");
    expect(deposit).not.toContain("ledgerMethod");
    expect(deposit).toContain('type: "deposit"');
    expect(deposit).toContain("idempotencyKey: data.idempotencyKey");
    expect(deposit.match(/callPostFolioTransaction/g)).toHaveLength(1);
  });

  it("names the posted transaction when the unit progress write fails and records history after that write", () => {
    expect(deposit).toContain("reservationRoomId: target.reservationRoomId");
    expect(deposit).toContain("writeCheckInUnitProgress");
    expect(deposit).toContain("Deposit ${txnId} was posted.");
    expect(deposit.indexOf("writeCheckInUnitProgress")).toBeLessThan(
      deposit.indexOf("recordReservationEvent"),
    );
    expect(deposit.indexOf("Deposit ${txnId} was posted.")).toBeLessThan(
      deposit.indexOf("recordReservationEvent"),
    );
    expect(deposit).toContain("requireReservationManager");
    expect(deposit).toContain("requireCashierOperator");
    expect(deposit).toContain('rpc("open_folio_for_reservation"');
    expect(deposit.match(/open_folio_for_reservation/g)).toHaveLength(1);
  });
});
