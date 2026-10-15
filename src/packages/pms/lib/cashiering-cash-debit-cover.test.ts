import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fiscalSnapshotMode, registeredCashDebitCover } from "./cashiering-cash-debit-cover.ts";

describe("registered cash debit cover", () => {
  it("covers only a debit note that is fiscally registered as CASH", () => {
    const covered = registeredCashDebitCover(
      [
        { id: "debit-cash", noteType: "debit", totalDelta: 20 },
        { id: "debit-credit", noteType: "debit", totalDelta: 15 },
        { id: "debit-open", noteType: "debit", totalDelta: 10 },
        { id: "credit", noteType: "credit", totalDelta: -5 },
      ],
      [
        { sourceId: "debit-cash", status: "REGISTERED", mode: "CASH" },
        { sourceId: "debit-credit", status: "REGISTERED", mode: "CREDIT" },
        { sourceId: "debit-open", status: "FAILED", mode: "CASH" },
      ],
    );
    assert.equal(covered, 20);
    assert.equal(fiscalSnapshotMode({ Mode: "CASH" }), "CASH");
    assert.equal(fiscalSnapshotMode({ Mode: "CREDIT" }), "CREDIT");
    assert.equal(fiscalSnapshotMode({}), null);
  });
});
