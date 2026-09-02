# Phase 6H — Cashiering & Guest Folios

Foundation only: one folio per reservation, one immutable ledger, manual payments, lightweight cashier shifts. No gateways, no night audit, no accounting.

## Database (one migration, `0017_create_cashiering.sql`)

- `guest_folios` — id, restaurant_id, guest_id, reservation_id (nullable), folio_number, status (`open` | `closed`), currency, opened_at, closed_at, created_by_membership_id, timestamps. Unique `(restaurant_id, folio_number)`; partial unique `(restaurant_id, reservation_id)` so a reservation has exactly one primary folio. Numbers come from a per-property counter table (same pattern as `hotel_reservation_counters`), format `FL-000001`.
- `folio_transactions` — immutable ledger: id, restaurant_id, folio_id, transaction_type (`charge|payment|deposit|refund|adjustment|discount`), category (`room|manual|payment|deposit|refund|adjustment|discount|future_restaurant`), description, amount (signed numeric), reference_type, reference_id, posted_by_membership_id, posted_at, created_at. No UPDATE/DELETE policies. Partial unique index on `(restaurant_id, reference_type, reference_id)` where `reference_type = 'reservation_room_charge'` — this is what makes room posting idempotent.
- `cashier_shifts` — id, restaurant_id, membership_id, opened_at, closed_at, opening_cash, closing_cash, status (`open|closed`), notes, created_at. Partial unique index: one open shift per membership per property.
- `folio_history` — append-only audit: event_type, folio_id / shift_id, previous_values, new_values, notes, actor_membership_id, created_at.
- All tables: GRANTs to `authenticated` + `service_role`, RLS on, policies via `public.has_restaurant_role(restaurant_id, 'owner'/'manager')`. No `anon`. Same-property FKs.

### SECURITY DEFINER functions (transaction-safe, service-role only)

- `open_folio_for_reservation(...)` — locks the reservation, creates the folio if absent, posts the room charge from `room_subtotal` / `currency` / `nightly_rate_snapshot` exactly once (reference `reservation_room_charge` + reservation id), writes history. Safe to call repeatedly.
- `post_folio_transaction(...)` — validates folio belongs to the property, rejects postings to a closed folio, enforces amount > 0 on the input and applies the sign convention server-side, writes the ledger row + history in one transaction.
- `close_folio(...)` — locks the folio, recomputes the balance from the ledger, rejects unless `abs(balance) < 0.01`, sets status/closed_at, writes history.
- `close_cashier_shift(...)` — locks the shift, records closing cash/notes, writes history.
- `check_in_hotel_reservation` gains a call to `open_folio_for_reservation` inside the same transaction (only when the reservation is priced), leaving all existing check-in behaviour intact.

### Sign convention (ledger is authoritative, no stored balance)

charges +, adjustments ±, discounts −, payments −, deposits −, refunds +. Balance = `sum(amount)`.

## Server layer

- `src/lib/cashiering.server.ts` — `requireCashierManager` (owner/manager, re-derives membership like `requireRateManager`), transaction/category/method enums, error-code map, signing helper, history writer.
- `src/lib/cashiering.functions.ts` — `getCashieringAccess`, `getCashieringDashboard`, `listFolios`, `getFolio` (header + ledger + derived totals), `initializeFolio`, `postCharge`, `receivePayment`, `addDeposit`, `postRefund`, `postAdjustment`, `postDiscount`, `closeFolio`, `listCashierShifts`, `openCashierShift`, `closeCashierShift`, `getShiftSummary`. Every handler re-derives the membership, validates every id against the property, and routes writes through the RPCs. Expected business rejections (closed folio, non-zero balance on close, refund over paid amount) return `{ ok: false, message }` rather than throwing, matching the Phase 6G pattern.

## Routes & UI

- `/restaurant/cashiering` — tabs Dashboard, Folios, Payments, Cashier Shifts.
  - Dashboard: Open Folios, Outstanding Balance, and Payments / Charges / Deposits / Refunds today, using the property-local date.
  - Folios: search (folio number, guest, confirmation number, room), open/closed and balance filters; columns Folio, Guest, Reservation, Room, Status, Total Charges, Payments, Balance.
  - Payments: property-wide payment/deposit/refund feed with date filter.
  - Cashier Shifts: open shift, live summary (payments received, cash, card, refunds, deposits, net movement), close with closing cash + notes.
- `/restaurant/cashiering/folios/$folioId` — header (folio number, guest, reservation, room, status, currency), grouped ledger sections, summary (total charges, payments/deposits, adjustments/discounts, balance) and action dialogs: Post Charge, Receive Payment, Add Deposit, Refund, Adjustment, Discount, Close Folio. Plus print-friendly Receipt (single payment) and Folio Statement views rendered from existing components with a print stylesheet — no PDF library.
- `src/components/cashiering/` for the tabs and dialogs, following the housekeeping/rates component layout.
- `restaurant-shell.tsx`: new `cashiering` workspace ("Accounting & Finance") with Dashboard / Folios / Payments / Cashier Shifts plus the NORU Home backlink. `restaurant/home.tsx`: flip Accounting & Finance to active, owner/manager only.
- Front Office check-out dialog gains a non-blocking outstanding-balance warning; check-out itself is not gated.

## Permissions & security

Owner/manager full access; kitchen/waiter get no card, no nav, no API. Tenant id always server-derived; all folio/reservation/guest/shift ids revalidated against the property; RPCs service-role only inside handlers; no anonymous or public-route exposure of guest PII.

## Verification (The Garden, owner session)

Use the existing priced reservation: initialize folio → exactly one room charge from the snapshot; repeat → no duplicate; add a laundry charge; partial payment; check balance; discount; deposit; partial refund; confirm no ledger row was mutated; attempt close with balance ≠ 0 (blocked); settle; close; confirm postings to the closed folio are rejected; view receipt and statement; open/close a cashier shift; check dashboard metrics; confirm kitchen/waiter denial and cross-tenant blocking; run build and typecheck.

## Out of scope

Restaurant charge-to-room, night audit, general ledger, bank reconciliation, OTA/gateway payments, tax engine, payroll, supplier payments, cashier/accountant role, deposit schedules, multi-folio routing, folio reopen.
