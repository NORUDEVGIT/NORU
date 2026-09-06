# Phase 7D.2F1 Patch — Reservations + Cashiering navigation completion

Scope: only the Reservations and Cashiering PMS screens. No changes to Front Office, Housekeeping, Night Audit, folio ledger behaviour, permissions or data rules.

## 1. Reservations (/restaurant/pms/reservations)

Today the screen shows only two tabs: the reservation list and Amendments. It will expose five clearly named categories:

- **Individual** — the existing reservation list with its current search, status and date filters and paging (unchanged logic, renamed tab).
- **Group** — foundation state. Booking records have no group/block field today, so the tab explains that group blocks aren't supported yet and shows nothing else.
- **Corporate** — foundation state for the same reason (no company/account link on bookings or guests today).
- **Amendments** — the existing change-history view, unchanged.
- **Cancellations** — real data: the existing list filtered to cancelled bookings, showing guest, stay dates and the cancellation reason already stored on the record.

The chosen tab stays in the address (`?tab=individual|group|corporate|amendments|cancellations`), so links and refreshes keep their place. No new records, no invented rows.

## 2. Cashiering (/restaurant/pms/cashiering)

Today: Dashboard, Folios, Payments, Deposits, Refunds, Cashier Shifts. One tab is added:

- **Transfers** — the billing ledger has no transfer entry type today (entries are charge, payment, deposit, refund, adjustment, discount). The tab renders the correct foundation state explaining that folio-to-folio transfers are backend-deferred. No fabricated entries, no second ledger.

All other tabs stay exactly as they are.

## 3. Known backend gaps (reported, not built here)

- Bookings have no group-block or corporate-account field.
- The billing ledger has no transfer entry type or transfer posting routine.

## Technical notes

- `src/components/workspaces/reservations-workspace.tsx`: rename `list` tab to `individual`, add `group`, `corporate`, `cancellations` tabs; cancellations reuses `listReservations` with `status: "cancelled"` plus a reason column; group/corporate render a shared empty-state block.
- `src/components/workspaces/cashiering-workspace.tsx`: add a `transfers` tab rendering the same empty-state block.
- Route files for both screens keep their existing `?tab=` pass-through; only the accepted tab names widen.
- No server function, migration, policy or grant changes.

## Verification

`bunx tsgo --noEmit` and `bun run build`, then report reservation category status, transfers status, remaining backend gaps and the typecheck/build result.
