# Phase 8H7 — Standalone POS Dashboard + Reports

Make the independent till observable using only its own sales, lines, payments, refunds, shifts and registers. No new tables, no other package's data, no money movement.

## Dashboard — `/restaurant/pos/dashboard`

Replaces the current "not built yet" page. Scope defaults to the current POS business date (property timezone, never the browser's date) and is labelled "Business date: …".

Cards:
- Completed sales count, gross sale value, refunds, net POS sales, average transaction value, open shifts.
- Tender activity: cash / card / other, shown as recorded POS tenders, with refunds listed separately (never described as bank-cleared or cash in bank).
- Top products by quantity and by value, from the names and prices stored on each sale line at the time of sale.
- Register activity: completed sales, gross, refunds, whether a shift is open.
- Cashier activity: transactions, gross, refunds processed, open shift — framed as till activity, not staff performance.
- Refunds: count, amount, part-refunded and fully-refunded sale counts, recent refunds.
- Shifts: open shifts and recently closed ones with float, cash sales, cash refunds, expected, counted and variance.
- Parked/open sales shown separately and excluded from every total; voided sales excluded entirely.

## Reports — `/restaurant/pos/reports`

Replaces the placeholder. Date filters: today, yesterday, last 7 days, last 30 days, custom range — all on business date. Tabs:
- **Sales** — completed count, gross, refunds, net, average transaction, optional daily breakdown.
- **Payments** — by tender: original payments, refunds by tender, net recorded activity. Each tender of a split payment counts once.
- **Products** — snapshot name, snapshot SKU, quantity, line value, discount; with a plain note that refunds are recorded against the sale/tender and cannot be attributed to individual lines.
- **Registers & Cashiers** — same per-register and per-cashier figures, filterable.
- **Refunds** — original receipt, business date, refund time, amount, method, reason, who processed it, resulting sale status.
- **Shifts** — register, cashier, open/close times, business date, float, cash sales, cash refunds, expected, counted, variance, status.

Category reporting is deferred: sale lines carry no category snapshot, so historical category figures would be guesswork.

CSV export is deferred: no reusable export pattern exists in the project, and this phase should not create one.

## Definitions (frozen, shown in the docs)

- Gross = sum of completed sale totals (status completed, partially_refunded, refunded).
- Refunds = sum of recorded POS refund amounts.
- Net POS sales = gross − refunds. Original sale totals are never rewritten.
- Average transaction = gross ÷ completed sale count.
- Expected cash = opening float + completed cash tenders − cash refunds, reusing the existing shift calculation rather than a second formula.

## Technical notes

- New read-only server functions in `src/lib/standalone-pos.functions.ts`: `getStandalonePosDashboard`, `getStandalonePosSalesReport`, `getStandalonePosTenderReport`, `getStandalonePosProductReport`, `getStandalonePosRefundReport`, `getStandalonePosShiftReport`. Shared aggregation helpers live in `src/lib/standalone-pos.server.ts` (or a small `standalone-pos-reporting.server.ts`) so formulas exist once; `expectedCashFor` is reused as-is.
- Every function: `requireSupabaseAuth` → `requireStandalonePosAccess` (membership + `pos` package + `standalone_pos` module + read roles owner/manager/cashier/accountant). No mutations added.
- Queries touch only `pos_sales`, `pos_sale_items`, `pos_payments`, `pos_refunds`, `pos_cashier_shifts`, `pos_registers`, all scoped by `restaurant_id`. No `orders`, `order_items`, `order_payments` or restaurant `cashier_shifts`.
- New components under `src/components/workspaces/standalone-pos/`: `dashboard-page.tsx`, `reports-page.tsx` (+ small shared table/metric bits). Routes `dashboard.tsx` and `reports.tsx` swap the foundation page for the real one, guards unchanged.
- `standalone-pos-modules.ts`: Dashboard and Reports → `live`.
- No database changes expected; an index only if a query proves slow.

## Verification

Controlled test transactions on a test property: cash sale, card sale, split tender (£30 = £10 cash + £20 card), partial refund, full refund, two registers/cashiers where practical. Reconcile gross, refunds, net, tenders and expected cash exactly against source rows; check split tender never doubles; rename/reprice a sold product and confirm history keeps the sold snapshot; test each date filter and boundary; confirm package independence with RM, PMS and Back Office off. Typecheck, production build, browser smoke pass, then remove all test data.

## Documentation

`docs/standalone-pos-architecture.md` gains dashboard/report definitions, the gross/refund/net formulas, tender rules and snapshot behaviour. `docs/architecture-ownership.md` records that Standalone POS owns its operational reporting; Back Office aggregation stays for 8H8.

Stops here — no Back Office source integration, Charge to Room, inventory consumption, customer accounts or folder cleanup.
