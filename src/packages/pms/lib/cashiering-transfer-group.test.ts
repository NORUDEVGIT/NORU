import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  allocateTransferShares,
  chargeGroupRemainder,
  type TransferLedgerRow,
} from "./cashiering-transfer-allocate.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function row(
  partial: Pick<TransferLedgerRow, "id" | "type" | "category" | "amount"> &
    Partial<TransferLedgerRow>,
): TransferLedgerRow {
  return {
    originalTransactionId: null,
    ...partial,
  };
}

describe("transfer charge group", () => {
  const sql = read("../../../../supabase/migrations/0139_cashiering_transfer_charge_group.sql");
  const drizzle = read("../../../../drizzle/migrations/0139_cashiering_transfer_charge_group.sql");

  it("keeps the group transfer SQL dual-lane and server-authoritative", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /TRANSFER_SAME_FOLIO/);
    assert.match(sql, /TRANSFER_CURRENCY_MISMATCH/);
    assert.match(sql, /TRANSFER_CHILD_NOT_ALLOWED/);
    assert.match(sql, /TRANSFER_EXCEEDS_REMAINDER/);
    assert.match(sql, /TRANSFER_ALLOCATION_MISMATCH/);
    assert.match(sql, /source_folio\.status <> 'open'/);
    assert.match(sql, /target_folio\.status <> 'open'/);
    assert.match(sql, /source_folio\.currency IS DISTINCT FROM target_folio\.currency/);
    assert.match(sql, /allocate_transfer_shares/);
    assert.match(sql, /transferable_charge_group_remainder/);
    assert.match(sql, /floor\(\(rem_cents\[i\]::numeric \* amount_cents\) \/ gross_cents\)/);
    assert.match(sql, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(sql, /folio_transfer_out/);
    assert.match(sql, /folio_transfer_in/);
    assert.match(sql, /actor_membership_id, notes, new_values/);
    assert.match(sql, /'folio_transfer'/);
    assert.match(sql, /transfer, 'out'/);
    assert.match(sql, /transfer, 'in'/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /DELETE FROM public\.folio_transactions/);
  });

  it("moves a full laundry group and a one-third partial without drift", () => {
    const full = allocateTransferShares(
      [
        { id: "parent", remaining: 450 },
        { id: "vat", remaining: 67.5 },
        { id: "service", remaining: 22.5 },
      ],
      540,
    );
    assert.deepEqual(
      full.map((share) => share.share),
      [450, 67.5, 22.5],
    );

    const partial = allocateTransferShares(
      [
        { id: "parent", remaining: 450 },
        { id: "vat", remaining: 67.5 },
        { id: "service", remaining: 22.5 },
      ],
      180,
    );
    assert.deepEqual(
      partial.map((share) => share.share),
      [150, 22.5, 7.5],
    );
    assert.equal(
      partial.reduce((sum, share) => sum + share.share, 0),
      180,
    );
  });

  it("keeps rounded component shares equal to the requested amount", () => {
    const shares = allocateTransferShares(
      [
        { id: "parent", remaining: 100 },
        { id: "tax-a", remaining: 10.01 },
        { id: "tax-b", remaining: 10.01 },
      ],
      40,
    );
    const total = Math.round(shares.reduce((sum, share) => sum + share.share, 0) * 100) / 100;
    assert.equal(total, 40);
    assert.ok(shares.every((share, index) => share.share <= [100, 10.01, 10.01][index]));
  });

  it("reduces the next remainder by the earlier transfer and rejects an over-transfer", () => {
    const first = allocateTransferShares(
      [
        { id: "parent", remaining: 450 },
        { id: "vat", remaining: 67.5 },
        { id: "service", remaining: 22.5 },
      ],
      180,
    );
    const next = [
      { id: "parent", remaining: 450 - first[0].share },
      { id: "vat", remaining: 67.5 - first[1].share },
      { id: "service", remaining: 22.5 - first[2].share },
    ];
    const second = allocateTransferShares(next, 360);
    assert.equal(Math.round(second.reduce((sum, share) => sum + share.share, 0) * 100) / 100, 360);
    assert.throws(() => allocateTransferShares(next, 360.01), /TRANSFER_EXCEEDS_REMAINDER/);
    assert.throws(() => allocateTransferShares(next, 0), /INVALID_AMOUNT/);
  });

  it("counts posted tax and service children in the gross remainder and ignores a tax source", () => {
    const rows = [
      row({ id: "parent", type: "charge", category: "manual", amount: 450 }),
      row({
        id: "vat",
        type: "charge",
        category: "tax",
        amount: 67.5,
        originalTransactionId: "parent",
      }),
      row({
        id: "service",
        type: "charge",
        category: "service_charge",
        amount: 22.5,
        originalTransactionId: "parent",
      }),
      row({
        id: "out",
        type: "transfer_out",
        category: "transfer",
        amount: -150,
        originalTransactionId: "parent",
      }),
    ];
    const remainder = chargeGroupRemainder("parent", rows);
    assert.equal(remainder.parentRemaining, 300);
    assert.equal(remainder.taxRemaining, 67.5);
    assert.equal(remainder.serviceRemaining, 22.5);
    assert.equal(remainder.grossRemaining, 390);
    assert.equal(chargeGroupRemainder("vat", rows).grossRemaining, 0);
  });
});
