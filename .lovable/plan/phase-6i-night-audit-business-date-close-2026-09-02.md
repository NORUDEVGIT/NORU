# Phase 6I — Night Audit & Business Date Close

Operational end-of-day close for a property: one audit run per business date, server-side checks, exceptions, no-show and shift handling, an immutable summary, and a single safe close that advances the business date by one day.

## Database (one migration, `0018_night_audit.sql`)

- `restaurants.business_date date NULL` — additive. When null, everything falls back to the property-local current date (`restaurants.timezone`); the first successful close sets it explicitly. Never advanced except by a successful close.
- `folio_transactions.payment_method text NULL` — additive. Today the cashier's method is appended to the description text, which cannot be summed. New postings write the method; the check constraint allows `cash | card | bank_transfer | mobile_money | other`. Existing rows stay null and roll up as "other/unspecified".
- `night_audit_runs` — id, restaurant_id, business_date, status (`open|ready|closed|failed`), started_by_membership_id, started_at, closed_by_membership_id, closed_at, summary jsonb, notes, timestamps. Unique `(restaurant_id, business_date)`.
- `night_audit_exceptions` — id, restaurant_id, night_audit_run_id, exception_type, severity (`warning|blocking`), reference_type, reference_id, message, status (`open|resolved|ignored`), resolved_by_membership_id, resolved_at, resolution_note, created_at. No delete path; system checks re-derive rows each run rather than removing them.
- All new tables: GRANTs to `authenticated` + `service_role`, RLS on, policies through `public.has_restaurant_role(restaurant_id, 'owner'/'manager')`, no `anon`, same-property FKs.
- SECURITY DEFINER function `close_business_date(_restaurant_id, _run_id, _business_date, _summary, _membership_id)` — locks the restaurant row and the audit run, returns the existing result if already closed, re-verifies there are no open blocking exceptions, stores the summary, sets status/closed_by/closed_at, and advances `restaurants.business_date` to `business_date + 1` in the same transaction. Any failure rolls everything back.

## Audit engine (`src/lib/nightaudit.server.ts`)

One server-side evaluator, run on demand, returning a checklist of areas each with PASS / WARNING / BLOCKING plus the exception rows it produced. It reads only; it never mutates reservations, rooms, folios, or the ledger.

- Reservations — confirmed arrivals for the business date never checked in (blocking once the date is being closed), stays with inconsistent status, checked-in stays whose departure is before the business date (overstay), cancelled/no-show rows still holding a room.
- Front office / rooms — checked-in stay without an assigned room (blocking), two overlapping checked-in stays on one room (blocking), checked-in stay on an OOO/OOS room (warning), occupancy derivation mismatch.
- Housekeeping — checked-out room with no cleaning task, restriction missing a reason, obviously inconsistent vacant/occupied data. Warnings only; inspection state never blocks the close.
- Folios — priced checked-in/checked-out reservation with no folio, duplicate `reservation_room_charge`, closed folio with a non-zero balance or post-close activity (blocking); open folio balances are warnings.
- Payments — charges, payments, deposits, refunds, discounts, adjustments for the business date from the immutable ledger, payments split by method.
- Cashier shifts — any shift still open for the business date is a blocking exception, listed with cashier, opened time, payments, cash payments, refunds, deposits and expected cash movement.

Re-running the audit refreshes system-derived exceptions: cleared conditions close themselves, manual resolutions on still-failing checks reappear.

## Server functions (`src/lib/nightaudit.functions.ts`)

`getNightAuditAccess`, `getBusinessDate`, `runNightAudit` (creates or reuses the run for the current business date, then evaluates), `getNightAuditSummary`, `listNightAuditRuns`, `getNightAuditRun` (read-only historical detail), `resolveException` / `ignoreException` (blocking integrity types cannot be ignored), and `closeBusinessDate`. No-show processing reuses the existing Phase 6E transition rather than a new path. Every handler re-derives the caller's membership through `requireCashierManager`, validates every id against the property, and returns `{ ok: false, message }` for expected rejections.

## Routes & UI

- `/restaurant/cashiering/night-audit` — current business date shown prominently, then Audit Progress, Checklist, Exceptions, No-Shows, Cashier Shifts, Revenue Summary, and a History table. Actions: Run / Refresh Audit, Process No-Show, Close Business Date (disabled while blocking exceptions remain), plus deep links out to Front Office, the folio, and the cashier shift instead of rebuilding those flows.
- `/restaurant/cashiering/night-audit/$runId` — read-only historical summary and exception list.
- `restaurant-shell.tsx`: add `Night Audit` to the Accounting & Finance sidebar.
- New components under `src/components/nightaudit/`.

## Permissions & security

Owner/manager only; kitchen and waiter get no nav, no card, no API. Tenant id always server-derived; business date read from the property, never from the browser; every reservation/room/folio/shift id revalidated against the property; the close RPC is service-role only inside handlers.

## Verification (The Garden, owner session)

Start the audit, confirm a single run, produce a confirmed arrival that was never checked in and see the exception, process the no-show and see it clear, leave a cashier shift open and confirm the close is blocked, close the shift and see the blocker clear, confirm an open folio balance is a warning only, check the revenue and payment totals, confirm overstay detection, close the business date, confirm the run is locked and the date advanced exactly one day, retry the close and confirm no second advance, open a historical run read-only, confirm kitchen/waiter denial and cross-tenant blocking, then run typecheck and build.

## Out of scope

General ledger, bank reconciliation, OTA settlement, tax, payroll, supplier AP, restaurant charge-to-room, distribution, no-show charges, night-auditor role.
