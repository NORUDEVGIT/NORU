# Phase 8H6 — Standalone POS transactions, receipt reprints and refunds

Finish the post-sale lifecycle for the independent till: browse completed sales, open one, reprint its receipt, and take an authorised partial or full refund — without ever deleting or silently editing a completed sale.

## What the user gets

**Transactions list** (`/restaurant/pos/transactions`, becomes live)
- Completed / partly refunded / fully refunded / voided sales from the till's own records only.
- Columns: receipt number, business date, completed time, register, cashier, status, total, tender summary, refunded amount, still refundable.
- Simple filters: receipt number search, business-date range, status, register, cashier, tender type. No dashboards, no charts.

**Transaction detail** (`/restaurant/pos/transactions/$saleId`)
- Everything from the moment of sale, read from the stored snapshots: items, quantities, prices, tax, discounts, subtotal, total. Later catalogue edits never change an old receipt.
- Original tenders and refunds listed as two separate sections; the original payment rows are never rewritten.
- Refundable balance shown, calculated by the server.

**Receipt reprint**
- Rendered from the same sale/item/payment records as the till's own receipt. No second copy of receipt text is stored. Reprint changes nothing — same number, same totals, same status.
- No reprint audit trail exists today and this phase will not build one; the docs will state plainly that reprint is presentation-only.

**Refunds** (owner and manager only)
- From a completed or part-refunded sale: choose which original tender the money comes back on, enter an amount and a reason.
- Full-refund shortcut fills the remaining balance.
- Refused for open, voided and fully refunded sales, and for anything above the remaining balance.
- Confirmation panel afterwards: original receipt number, amount, tender, reason, who processed it, date/time, remaining refundable, new status — with a print view.
- Card refunds are labelled clearly as an internal record; NORU has no payment-gateway connection, so nothing is sent to a card network.

**Cash and shifts**
- A cash refund requires the person to have their own open shift, and the cash impact lands on *that* shift — never on the closed shift the sale came from. Closed shifts stay exactly as they were.
- Non-cash refunds (card, voucher, other) need no open shift; they carry no drawer impact.
- Expected drawer cash stays a server calculation: opening float + cash taken − cash refunds.

**Not in this phase:** completed-sale voids (corrections are refunds only), inventory consumption, charge to room, customer accounts, loyalty, reporting expansion, Back Office finance integration, folder cleanup.

## Technical section

Routes
- `src/routes/restaurant/pos/transactions.tsx` — swap the foundation body for the real list page; same guard shape (sign-in → `requireRoutePackage("pos")`).
- New `src/routes/restaurant/pos/transactions/$saleId.tsx` with its own `head()` (this means moving `transactions.tsx` to `transactions/index.tsx`).

Components (new, under `src/components/workspaces/standalone-pos/`)
- `transactions-page.tsx` — filter bar + table + empty/loading states.
- `transaction-detail-page.tsx` — snapshot detail, tenders, refunds, refundable balance, reprint and refund actions.
- `receipt-view.tsx` — extract the receipt body already rendered in `sell-page.tsx` so the till and reprint share one renderer.
- `refund-dialog.tsx` + refund confirmation panel.

Server (`src/lib/standalone-pos.functions.ts`)
- Extend `listPosTransactions` with filters (reference, date range, status, register, cashier, method), register/cashier names, tender summary and remaining refundable.
- Extend `getPosSale` to include register name, cashier name, per-refund method/processed-by/authorised-by, and per-payment refunded totals.
- Extend `refundPosSale`: require an explicit `paymentId`, resolve the acting shift, map new error codes in `standalone-pos.server.ts`. Authorisation stays `requireStandalonePosManager` (owner/manager). Read paths stay `requireStandalonePosAccess` (owner/manager/cashier/accountant).
- No pricing or tax logic duplicated; reuse `standalone-pos-pricing.server.ts`.

Database — no new tables. One narrow migration replacing `public.pos_refund_sale` with a version taking `_shift_id` and enforcing, inside the same locked transaction:
- refund must target a payment belonging to the sale;
- per-payment cap: refunds against that payment ≤ that payment's amount;
- sale cap unchanged (≤ remaining), duplicate/racing refunds serialised by the existing `FOR UPDATE`;
- `shift_id` = the acting open shift for cash refunds (required), null otherwise — never the original sale's closed shift;
- `authorized_by_membership_id` recorded alongside `processed_by_membership_id`.
New error codes: `POS_REFUND_PAYMENT_MISMATCH`, `POS_REFUND_EXCEEDS_PAYMENT`, `POS_REFUND_SHIFT_REQUIRED`.

Registry, home and docs
- `standalone-pos-modules.ts`: Transactions → `live`.
- POS home + sidebar reflect the live status.
- `docs/standalone-pos-architecture.md`: transaction lifecycle, reprint (presentation-only), refund semantics, tender-specific allocation, cash shift impact, post-close rule. `docs/architecture-ownership.md`: Standalone POS owns transaction history, receipt presentation/reprint and refund records.

Verification
- `bunx tsgo --noEmit`, `bunx vite build`.
- Playwright under `/tmp/browser/pos-transactions` at 1280x1800.
- SQL-level tests, all rolled back: £20 → £5 (part), → £20 (full), → £25 (refused), £5+£15 (full), £5+£16 (second refused); double-click and racing refunds; split tender £10 cash + £10 card with per-tender caps; cash shift float 100 + sale 20 → 120, refund 5 → 115, including refund under a different open shift; completed-sale edit/delete still refused; product renamed after sale, old receipt unchanged.
- Package matrix: POS on with RM/PMS/Back Office off; role matrix owner/manager/cashier/accountant; RM till, RM orders/payments, PMS cashiering and Back Office untouched.
