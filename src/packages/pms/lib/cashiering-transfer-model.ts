/**
 * Cashiering Phase 7 — transfer target model (locked).
 *
 * Routing from pms_billing_rules is held until rules are executable.
 * Transfers post only between real ledger targets that already exist:
 *
 * 1. Guest folio windows — child targets of guest_folios (default window 1 at folio open).
 * 2. Guest folios — cross-reservation transfer via paired transfer_out / transfer_in rows.
 * 3. Financial accounts (Phase 8) — company / group / master accounts; cross-target
 *    transfers wait until Phase 8 accounts exist.
 *
 * Balance stays derived: sum(folio_transactions.amount) per folio or account.
 * A transfer is a paired append: transfer_out (negative on source) + transfer_in
 * (positive on target), sharing transfer_id and linking the source charge via
 * original_transaction_id on the transfer_out row.
 *
 * A guest-folio transfer moves the remaining gross of one parent charge group:
 * the parent line plus its posted tax and service-charge children.
 * Each component's remainder is
 *   line.amount − sum(abs(transfer_out.amount)) linked to that line.
 * The cashier amount is that gross remainder, split in the database.
 * Company, group, outlet, and department are not transfer destinations.
 */

export const TRANSFER_TARGET_KINDS = ["folio_window", "guest_folio", "financial_account"] as const;
export type TransferTargetKind = (typeof TRANSFER_TARGET_KINDS)[number];

export const TRANSFER_DIRECTIONS = ["out", "in"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

export const TRANSFER_TRANSACTION_TYPES = ["transfer_out", "transfer_in"] as const;
export type TransferTransactionType = (typeof TRANSFER_TRANSACTION_TYPES)[number];

/** Routing execution from Settings billing rules — not live; do not call from posters. */
export const BILLING_ROUTING_EXECUTABLE = false;

export function isTransferType(type: string): type is TransferTransactionType {
  return TRANSFER_TRANSACTION_TYPES.some((value) => value === type);
}
