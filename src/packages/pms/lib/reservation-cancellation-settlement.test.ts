import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { folioLedgerExceptions } from "./night-audit-settlement.ts";
import {
  parseCancellationSettlement,
  publicCancelAllowed,
  settlementOutcome,
  settlementOutcomeMessage,
} from "./reservation-cancellation-settlement.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../../../supabase/migrations/0206_reservation_cancellation_settlement.sql");

function settlement(patch: Record<string, unknown> = {}) {
  return parseCancellationSettlement({
    dry_run: false,
    kind: "cancel",
    reservation_id: "res-1",
    reservation_room_id: null,
    folio_id: "folio-1",
    folio_number: "FL-000001",
    folio_status: "open",
    currency: "ETB",
    reversed: [],
    pending: [],
    released: [],
    skipped: [],
    reversal_total: 0,
    fees_posted: 0,
    credits: 0,
    balance: 0,
    refund_due: 0,
    amount_due: 0,
    closable: true,
    ...patch,
  });
}

describe("settlement result parsing", () => {
  it("maps the RPC payload and keeps money rounded", () => {
    const s = settlement({
      reversed: [{ charge_id: "c1", reference_type: "reservation_room_charge", description: "Room", mode: "reverse_remaining", amount: "3000.004" }],
      released: [{ allocation_id: "a1", deposit_transaction_id: "d1", amount: 500 }],
      pending: [{ charge_id: "c2", description: "Pkg", amount: 200, reason: "credit_note_required" }],
      reversal_total: 3000,
      balance: -500,
      refund_due: 500,
    });
    assert.equal(s.currency, "ETB");
    assert.equal(s.reversed[0]?.amount, 3000);
    assert.equal(s.released[0]?.allocationId, "a1");
    assert.equal(s.pending[0]?.reason, "credit_note_required");
    assert.equal(s.refundDue, 500);
    assert.equal(s.dryRun, false);
  });

  it("treats an unknown kind as cancel and a missing dry_run flag as a dry run", () => {
    const s = parseCancellationSettlement({ kind: "other" });
    assert.equal(s.kind, "cancel");
    assert.equal(s.dryRun, true);
    assert.equal(s.folioId, null);
  });
});

describe("settlement outcome", () => {
  it("A. no folio is reported as nothing to settle", () => {
    assert.equal(settlementOutcome(settlement({ folio_id: null })), "no_folio");
  });
  it("B. deposit larger than the fee leaves a refund due", () => {
    const s = settlement({ fees_posted: 1000, credits: 1500, balance: -500, refund_due: 500 });
    assert.equal(settlementOutcome(s), "refund_due");
    assert.match(settlementOutcomeMessage(s), /Refund it in Cashiering/);
  });
  it("C. fee larger than the deposit leaves an amount due", () => {
    assert.equal(settlementOutcome(settlement({ balance: 250, amount_due: 250 })), "amount_due");
  });
  it("D. zero balance is settled and closable", () => {
    const s = settlement();
    assert.equal(settlementOutcome(s), "settled");
    assert.match(settlementOutcomeMessage(s), /close the folio/);
  });
  it("E. an invoiced charge needs a credit note before anything else", () => {
    const s = settlement({
      pending: [{ charge_id: "c1", amount: 3000, reason: "credit_note_required" }],
      balance: 3000,
      amount_due: 3000,
    });
    assert.equal(settlementOutcome(s), "credit_note_required");
  });
  it("F. a closed folio is flagged for review", () => {
    const s = settlement({ pending: [{ charge_id: "c1", amount: 10, reason: "folio_closed" }] });
    assert.equal(settlementOutcome(s), "pending");
  });
});

describe("public online cancel is free only", () => {
  it("allows a calculable zero penalty", () => {
    assert.equal(publicCancelAllowed({ calculable: true, required: false, amount: 0 }), true);
    assert.equal(publicCancelAllowed({ calculable: true, required: true, amount: 0 }), true);
  });
  it("refuses a penalty or a policy that cannot be evaluated", () => {
    assert.equal(publicCancelAllowed({ calculable: true, required: true, amount: 1500 }), false);
    assert.equal(publicCancelAllowed({ calculable: false, required: false, amount: null }), false);
  });
});

describe("night audit duplicate room charge", () => {
  const folios = [{ id: "f1", number: "FL-1", status: "open", closedAt: null }];
  it("G. a reversed charge plus a reposted charge is not a duplicate", () => {
    const { exceptions } = folioLedgerExceptions({
      folios,
      transactions: [
        { id: "t1", folioId: "f1", amount: 3000, postedAt: "2026-11-01T10:00:00Z", referenceType: "reservation_room_charge", referenceId: "res-1" },
        { id: "t2", folioId: "f1", amount: -3000, postedAt: "2026-11-02T10:00:00Z", referenceType: "charge_reversal", referenceId: "grp", originalTransactionId: "t1" },
        { id: "t3", folioId: "f1", amount: 3000, postedAt: "2026-11-03T10:00:00Z", referenceType: "reservation_room_charge", referenceId: "res-1" },
      ],
      missingFolios: [],
    });
    assert.equal(exceptions.some((e) => e.exceptionType === "duplicate_room_charge"), false);
  });
  it("H. two live room charges for one stay are still a duplicate", () => {
    const { exceptions } = folioLedgerExceptions({
      folios,
      transactions: [
        { id: "t1", folioId: "f1", amount: 3000, postedAt: "2026-11-01T10:00:00Z", referenceType: "reservation_room_charge", referenceId: "res-1" },
        { id: "t3", folioId: "f1", amount: 3000, postedAt: "2026-11-03T10:00:00Z", referenceType: "reservation_room_charge", referenceId: "res-1" },
      ],
      missingFolios: [],
    });
    assert.equal(exceptions.some((e) => e.exceptionType === "duplicate_room_charge"), true);
  });
});

describe("0206 migration", () => {
  it("is identical in the Supabase and Drizzle lanes", () => {
    assert.equal(read("../../../../drizzle/migrations/0206_reservation_cancellation_settlement.sql"), migration);
  });

  it("I. reverses through the existing correction function and never edits or deletes ledger rows", () => {
    assert.match(migration, /PERFORM public\.post_folio_charge_correction\(/);
    assert.match(migration, /'reverse_remaining'/);
    assert.doesNotMatch(migration, /UPDATE public\.folio_transactions/i);
    assert.doesNotMatch(migration, /DELETE FROM public\.folio_transactions/i);
    assert.doesNotMatch(migration, /DELETE FROM public\.folio_deposit_allocations/i);
  });

  it("J. never posts a refund", () => {
    assert.doesNotMatch(migration, /'refund',/);
  });

  it("K. is idempotent: deterministic keys are checked before posting", () => {
    assert.match(migration, /correction_key := 'cxrev' \|\| replace\(charge\.id::text, '-', ''\)/);
    assert.match(migration, /'already_corrected'/);
    assert.match(migration, /release_key := 'cxrel'/);
  });

  it("L. locks the reservation and folio when applying", () => {
    const settle = migration.slice(migration.indexOf("FUNCTION public.settle_reservation_cancellation"));
    assert.match(settle, /FROM public\.hotel_reservations\s+WHERE id = _reservation_id AND restaurant_id = _restaurant_id\s+FOR UPDATE/);
    assert.match(settle, /FROM public\.guest_folios\s+WHERE restaurant_id = _restaurant_id AND reservation_id = res\.id\s+FOR UPDATE/);
  });

  it("M. routes invoiced charges to the credit-note workflow", () => {
    assert.match(migration, /public\.group_is_billed\(_restaurant_id, charge\.id\)/);
    assert.match(migration, /'credit_note_required'/);
    assert.match(migration, /coverage_scope = 'legacy_folio'/);
  });

  it("N. releases deposit allocations with negative linked rows capped at the original", () => {
    assert.match(migration, /released_allocation_id IS NOT NULL AND amount < 0/);
    assert.match(migration, /ALLOCATION_RELEASE_EXCEEDS/);
  });

  it("opens a fee-only folio without a room charge", () => {
    const fn = migration.slice(
      migration.indexOf("FUNCTION public.open_reservation_fee_folio"),
      migration.indexOf("Package charges follow the live charge"),
    );
    assert.doesNotMatch(fn, /post_folio_charge_with_tax|reservation_room_charge/);
    assert.match(fn, /'fee_only', true/);
  });

  it("reverses the cancel or no-show fee when a stay is reinstated", () => {
    const fn = migration.slice(
      migration.indexOf("FUNCTION public.repost_reservation_charges_after_restore"),
      migration.indexOf("FUNCTION public.list_cancelled_reservation_settlement_exceptions"),
    );
    assert.match(fn, /reference_type IN \('reservation_cancel', 'reservation_no_show'\)/);
    assert.match(fn, /'rsrfee' \|\| replace\(fee\.id::text, '-', ''\)/);
    assert.match(fn, /CONTINUE WHEN remaining_fee <= 0;/);
    assert.match(fn, /CONTINUE WHEN EXISTS \([\s\S]*idempotency_key = fee_key/);
    assert.match(fn, /RAISE EXCEPTION 'FEE_INVOICED'/);
    assert.match(fn, /release_charge_allocations_above\(/);
    assert.match(fn, /post_folio_charge_correction\([\s\S]*'reverse_remaining'/);
    assert.ok(
      fn.indexOf("reference_type IN ('reservation_cancel'") <
        fn.indexOf("reservation_room_charge', res.id"),
      "fee reversal runs before the room repost",
    );
  });

  it("releases deposit allocations above the live amount before reversing", () => {
    const helper = migration.slice(
      migration.indexOf("FUNCTION public.release_charge_allocations_above"),
      migration.indexOf("FUNCTION public.repost_reservation_charges_after_restore"),
    );
    assert.match(helper, /released_allocation_id IS NULL/);
    assert.match(helper, /'cxrel' \|\| replace\(alloc\.id::text, '-', ''\)/);
    assert.match(helper, /-release_amount/);
  });

  it("lets a restored stay post its package again", () => {
    assert.match(migration, /DROP INDEX IF EXISTS public\.folio_transactions_package_charge_once/);
    assert.match(migration, /charge_group_remaining_gross\(_restaurant_id, t\.id\) > 0/);
  });

  it("grants the new functions to service_role only", () => {
    for (const fn of [
      "open_reservation_fee_folio(uuid, uuid, uuid)",
      "settle_reservation_cancellation(uuid, uuid, uuid, text, uuid, boolean)",
      "repost_reservation_charges_after_restore(uuid, uuid, uuid)",
      "list_cancelled_reservation_settlement_exceptions(uuid)",
    ]) {
      assert.ok(migration.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`), fn);
      assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`), fn);
    }
    assert.doesNotMatch(migration, /TO (anon|authenticated)/);
  });
});

describe("entry points share the cancellation workflow", () => {
  const fo = read("./fo-cancel-noshow.functions.ts");
  const reservations = read("./reservations.functions.ts");
  const publicBooking = read("./public-booking.functions.ts");

  it("Front Office cancel and no-show settle the folio", () => {
    assert.match(fo, /return processReservationCancellation\(supabaseAdmin, \{/);
    assert.match(fo, /kind: "noshow"/);
    assert.doesNotMatch(fo, /"open_folio_for_reservation"/);
    assert.match(fo, /"open_reservation_fee_folio"/);
  });

  it("the fee is posted once per stay or room", () => {
    assert.match(fo, /A cancel fee is already posted to this folio\./);
    assert.match(fo, /"cxfee" : "nsfee"/);
  });

  it("Reservations cancel uses the fee gate and the shared workflow; restore reposts", () => {
    assert.match(reservations, /assertCancelFeeSatisfied\(supabaseAdmin/);
    assert.match(reservations, /source: "booking"/);
    assert.match(reservations, /"repost_reservation_charges_after_restore"/);
    assert.match(reservations, /kind: "unit_removal"/);
  });

  it("the guest cancels online only when the penalty is zero", () => {
    assert.match(publicBooking, /publicCancelAllowed\(penalty\)/);
    assert.match(publicBooking, /source: "public"/);
    assert.doesNotMatch(publicBooking, /restaurant_memberships/);
  });
});
