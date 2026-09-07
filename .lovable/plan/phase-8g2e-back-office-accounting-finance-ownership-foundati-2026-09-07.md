# Phase 8G2E — Back Office Accounting & Finance ownership / foundation expansion

## What the audit found

- The only real finance screen today is the shared Cashiering workspace at `/restaurant/cashiering` (tabs: dashboard, folios, payments, deposits, refunds, transfers, shifts). It is PMS-flavoured guest billing, gated by the `accounting_finance` module plus the PMS package. It keeps its home and its owner.
- `/restaurant/back-office/accounting` is currently a static foundation page with no figures.
- There is **no** general ledger, chart of accounts, journal, accounts payable, accounts receivable, bank reconciliation or tax ledger anywhere in the database. The folio ledger is guest billing, not double-entry accounting.
- Trustworthy high-level source figures that already exist: hotel folio activity (open folios, outstanding balance, today's payments/charges/deposits/refunds), restaurant order value for today, purchase-order value and supplier count, and stock-at-cost totals with an "uncosted items" counter.

## Financial ownership model (locked)

| Owner | Keeps |
| --- | --- |
| PMS | Folios, room charges, hotel payments, deposits, refunds, cashier shifts, night audit |
| Restaurant Management | Restaurant orders, payments, till shifts, refunds/voids, Charge to Room bridge |
| Procurement | Purchase orders, receiving, supplier spend source data |
| Inventory | Stock quantities and cost inputs |
| Standalone POS | Future independent sales (planned, 8H) |
| Back Office Accounting & Finance | Cross-package finance overview, financial control, source monitoring, future accounting engine |

No transaction is moved, copied or duplicated. No posting logic changes.

## What gets built

### 1. A narrow, read-only finance summary service

New `src/lib/back-office-finance.functions.ts` (+ a `.server.ts` helper) exposing one server function, `getBackOfficeFinanceOverview({ restaurantId })`.

Authorization, in order:
1. Active membership on the property.
2. `requireModuleRole(..., "accounting_finance", ["owner","manager","accountant"])` — the Back Office package alone grants nothing.
3. The Back Office package must be enabled for the property.

Then, per source, the entitlement is checked **before** the source is queried; a disabled package is reported as unavailable and never touched:
- Restaurant Management → today's order value and order count (labelled "order value, not settled cash").
- PMS → open folios, outstanding balance, today's payments/charges/deposits/refunds.
- Procurement → open/period purchase-order value and supplier count (labelled "purchasing commitment, not a payable").
- Inventory → stock at last-known cost, with the uncosted-item count surfaced as a caveat.
- Standalone POS → planned.

The response carries only these roll-ups — no folio lines, no order rows, no supplier detail. No mutations are added anywhere in this phase.

### 2. Accounting & Finance home

`/restaurant/back-office/accounting` becomes a real landing page (new `src/components/workspaces/back-office/accounting-pages.tsx`), following the existing Back Office header and module-gate conventions used by HR and Inventory.

Header: `BACK OFFICE · ACCOUNTING & FINANCE`, breadcrumb Property Home → Back Office → Accounting & Finance.

Sections:
- **Finance overview** — the source-labelled figures above. Each card names its source package and what the number means. No card sums across sources; there is no "total revenue", "profit" or "net position".
- **Financial sources** — one card per source package (Restaurant Management, PMS, Procurement, Inventory, Standalone POS) showing availability, the role it plays, its current summary when real, and a link to the source screen **only** when that package is enabled and the person already holds the matching module access. Links never grant access.
- **Accounting foundations** — an honest, clearly-marked "not built yet" list: General Ledger, Chart of Accounts, Journals, Accounts Payable, Accounts Receivable, Bank Reconciliation, Tax Accounting, Financial Statements. Each carries a one-line note on what would be required.
- A short pointer to Back Office Reports & Intelligence for management analytics, so the two domains stay distinct. The Reports page is not duplicated.

No new subroutes. One honest Accounting home; extra routes would be empty shells.

### 3. Registry and documentation

- `src/lib/back-office-modules.ts`: Accounting & Finance moves from `foundation` to `partial`, with accurate `sourcePackages`, an updated `todayNote` (finance monitoring is canonical here; operational transactions stay with their packages; no accounting engine exists) and a `futureScope` covering GL, journals, CoA, AP, AR, reconciliation, tax accounting and statements.
- `docs/architecture-ownership.md`: the ownership table above, plus a documented decision on the shared `/restaurant/cashiering` route — it stays exactly as it is, PMS-owned, no redirect, because it is live operational hotel billing and is linked from PMS Cashiering, PMS Night Audit, PMS Home and Property Home. Missing accounting domains recorded as architecture gaps.

## Not in this phase

No ledger, journals, chart of accounts, AP, AR, reconciliation, tax accounting, financial statements, payroll or cost-control backend. No database changes. No changes to PMS Cashiering, Restaurant payments, Charge to Room, Procurement, Inventory or Reports. No folder cleanup.

## Verification

Type check, production build, and an authenticated browser pass covering: the Accounting home with all sources on; Back Office off (route blocked); Restaurant Management off and PMS off (that source shown unavailable and not queried); a person without Accounting access (blocked, no escalation); and PMS Cashiering, Restaurant payments, Procurement, Inventory and Reports each still working untouched. A temporary entitlement row used for the matrix is deleted afterwards. Closes with the 30-point implementation report.
