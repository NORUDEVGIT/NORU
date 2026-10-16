import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("guest deposit invoice allocation", () => {
  const sql = read("../../../../supabase/migrations/0161_guest_deposit_invoice_allocation.sql");
  const drizzle = read("../../../../drizzle/migrations/0161_guest_deposit_invoice_allocation.sql");
  const dialog = read("../components/cashiering/guest-payment-allocation-drawer.tsx");

  it("keeps the migration dual-lane and applies a deposit without a new payment", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.guest_deposit_invoice_allocations/);
    assert.match(sql, /ALLOCATION_NOT_A_GUEST_DEPOSIT/);
    assert.match(sql, /guest_invoice_deposit_cover/);
    const apply = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.apply_guest_deposit_invoice_allocations"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.release_excess_guest_deposit_invoice_allocation"),
    );
    assert.doesNotMatch(apply, /INSERT INTO public\.folio_transactions/);
  });

  it("releases payments before deposits and blocks refund of an applied deposit", () => {
    assert.match(sql, /pay_release := LEAST\(excess, pay_active\)/);
    assert.match(sql, /release_excess_guest_deposit_invoice_allocation/);
    assert.match(sql, /ELSIF source\.transaction_type = 'deposit'/);
    assert.match(sql, /guest_deposit_invoice_allocations/);
    assert.match(dialog, /previewGuestDepositInvoiceAllocation/);
    assert.match(dialog, /Choose a payment or deposit/);
  });
});
