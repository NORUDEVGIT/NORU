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
  const panels = read("../components/cashiering/folio-workspace-panels.tsx");
  const workspaceLoader = read("./cashiering.functions.ts");
  const desk = read("../components/cashiering/cashiering-desk.tsx");

  it("keeps the migration dual-lane and applies a deposit without a new payment", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.guest_deposit_invoice_allocations/);
    assert.match(sql, /ALLOCATION_NOT_A_GUEST_DEPOSIT/);
    assert.match(sql, /guest_invoice_deposit_cover/);
    const preview = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.preview_guest_deposit_invoice_allocation"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.apply_guest_deposit_invoice_allocations"),
    );
    const apply = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.apply_guest_deposit_invoice_allocations"),
      sql.indexOf(
        "CREATE OR REPLACE FUNCTION public.release_excess_guest_deposit_invoice_allocation",
      ),
    );
    assert.doesNotMatch(apply, /INSERT INTO public\.folio_transactions/);
    for (const body of [preview, apply]) {
      assert.match(body, /guest_payment_invoice_allocations\.invoice_id = inv\.id/);
      assert.doesNotMatch(body, /AND invoice_id = inv\.id/);
    }
  });

  it("releases payments before deposits and blocks refund of an applied deposit", () => {
    assert.match(sql, /pay_release := LEAST\(excess, pay_active\)/);
    assert.match(sql, /release_excess_guest_deposit_invoice_allocation/);
    assert.match(sql, /ELSIF source\.transaction_type = 'deposit'/);
    assert.match(sql, /guest_deposit_invoice_allocations/);
    assert.match(dialog, /previewGuestDepositInvoiceAllocation/);
    assert.match(dialog, /Choose a payment or deposit/);
  });

  it("uses invoice allocation as the only deposit action in settlement", () => {
    const settlement = panels.slice(
      panels.indexOf("export function SettlementTab"),
      panels.indexOf("function SettlementPaymentCard"),
    );
    assert.match(settlement, /Issue final invoice/);
    assert.match(settlement, /Allocate payment or deposit/);
    assert.match(settlement, /Post payment/);
    assert.match(settlement, /Transfer charges/);
    assert.match(settlement, /paymentOpen && outstanding/);
    assert.doesNotMatch(settlement, /> Allocate deposit/);
    assert.match(workspaceLoader, /invoiceDepositAllocations/);
    assert.match(workspaceLoader, /\.\.\.invoiceDepositAllocations/);
    assert.match(workspaceLoader, /paymentAllocationNets\[line\.transaction\.id\] = line\.applied/);
    assert.doesNotMatch(desk, /<DepositAllocationForm/);
  });
});
