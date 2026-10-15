/**
 * Loads the payment allocations that decide fiscal Mode, and assigns item
 * codes for unmapped manual charges. Neither step posts a payment or calls
 * the fiscal provider.
 */
import {
  eligiblePaymentTotal,
  fiscalSettlementSummary,
  snapshotInvoiceTotal,
  type EligibleAllocationKind,
  type FiscalSettlementSummary,
} from "./fiscal-document-mode.ts";
import { groupHasItemMapping } from "./fiscal-manual-item.ts";
import { fiscalRecord, fiscalRecords, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

type ItemMapping = {
  active: boolean;
  serviceTypeId: string | null;
  departmentId: string | null;
  chargeSource: string | null;
  isDefault: boolean;
};

export async function loadFiscalSettlement(
  db: Db,
  input: {
    restaurantId: string;
    invoiceId: string;
    snapshot: unknown;
    allocationTable: "guest_payment_invoice_allocations" | "financial_account_payment_allocations";
  },
): Promise<FiscalSettlementSummary> {
  const result = await db
    .from(input.allocationTable)
    .select("id, amount, reverses_allocation_id, payment_transaction_id")
    .eq("restaurant_id", input.restaurantId)
    .eq("invoice_id", input.invoiceId);
  const allocations = fiscalRecords((await result).data);
  const rows = [];
  for (const allocation of allocations) {
    const id = text(allocation.id);
    const paymentId = text(allocation.payment_transaction_id);
    if (!id || !paymentId) continue;
    rows.push({
      id,
      amount: numberValue(allocation.amount),
      reversesAllocationId: text(allocation.reverses_allocation_id),
      sourceKind: await paymentSourceKind(db, input.restaurantId, paymentId),
    });
  }
  return fiscalSettlementSummary(snapshotInvoiceTotal(input.snapshot), eligiblePaymentTotal(rows));
}

export async function allocateUnmappedManualCodes(
  db: Db,
  restaurantId: string,
  snapshot: unknown,
  mappings: readonly ItemMapping[],
  lane: "guest" | "company",
): Promise<{ ok: true; codes: Record<string, string> } | { ok: false; reason: string }> {
  const codes: Record<string, string> = {};
  for (const group of snapshotGroups(snapshot, lane)) {
    if (group.chargeSource !== "manual" || groupHasItemMapping(group, mappings)) continue;
    const assigned = await allocateItemCode(db, restaurantId);
    if (!assigned.ok) return assigned;
    codes[group.groupKey] = assigned.code;
  }
  return { ok: true, codes };
}

async function paymentSourceKind(
  db: Db,
  restaurantId: string,
  paymentId: string,
): Promise<EligibleAllocationKind> {
  const result = await db
    .from("folio_transactions")
    .select("id, transaction_type, amount")
    .eq("id", paymentId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  const type = text(row?.transaction_type);
  if (type === "deposit" || type === "deposit_received") return "deposit";
  if (type === "payment" && numberValue(row?.amount) < 0) return "payment";
  return "other";
}

async function allocateItemCode(
  db: Db,
  restaurantId: string,
): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  const result = await db.rpc("allocate_fiscal_item_code", {
    _restaurant_id: restaurantId,
    _requested: null,
    _except_mapping_id: null,
  });
  const value = result.data;
  const code =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : typeof value === "string" && /^[0-9]+$/.test(value.trim())
        ? value.trim()
        : null;
  if (result.error || !code) {
    return {
      ok: false,
      reason:
        "A manual charge needs a fiscal item code, and the item-code allocator is unavailable.",
    };
  }
  return { ok: true, code };
}

function snapshotGroups(snapshot: unknown, lane: "guest" | "company") {
  const row =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? (snapshot as { groups?: unknown[] })
      : null;
  if (!Array.isArray(row?.groups)) return [];
  return row.groups.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const group = value as Record<string, unknown>;
    const charge = record(group.chargeSnapshot);
    const parent = text(group.parentTransactionId);
    const source = text(group.sourceGroupId);
    const groupKey = lane === "company" ? (source ?? parent) : (parent ?? source);
    if (!groupKey) return [];
    return [
      {
        groupKey,
        chargeSource: text(group.chargeSource),
        serviceTypeId: text(charge?.serviceTypeId),
        departmentId: text(charge?.departmentId),
      },
    ];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
