# Phase 7D.2F1 — PMS core operations correction

Scope: Reservations, Front Office and Cashiering only. No changes to Housekeeping, Room & Inventory, Rate & Revenue, Night Audit, Distribution, or shared modules except link corrections.

## 1. Reservations (/restaurant/pms/reservations)

Turn the single flat list into a lifecycle workspace with tabs:

- **Individual** — the existing reservation list (all standard reservations), same search, status, date filters and pagination.
- **Group** — foundation state. The reservation records have no group/block concept today, so this tab explains that group blocks are not yet supported and offers no fake rows.
- **Corporate** — foundation state for the same reason (no company/account link on reservations or guests today).
- **Amendments** — real data: the reservation change history already recorded for every reservation (date changes, room assignment, status changes), newest first, each row linking to its reservation.
- **Cancellations** — real data: reservations with status "cancelled", showing guest, stay dates and cancellation reason.

Tab is reflected in the address (`?tab=individual|group|corporate|amendments|cancellations`) so links and refreshes keep place. No new reservation tables, no duplicate lists, no mock rows.

Reported limitation: the reservation record has no group-block or company/corporate-account field, so those two tabs are foundation-only until a later phase adds them.

## 2. Reservation navigation fix

Inside PMS, all reservation links stay in the PMS family:

- "New reservation" and reservation rows currently jump to the old booking area. They will route to PMS-context equivalents; the reservation detail page stays where it is (it is the only detail screen) but is reached with PMS context preserved, and its "back" link returns to `/restaurant/pms/reservations`.
- Front Office links inside reservations/arrivals point at `/restaurant/pms/front-office`.
- The same sweep is applied to the arrivals list and Night Audit's two Front Office links.

## 3. Legacy Front Office entry

`/restaurant/rooms/arrivals` already redirects to the canonical route. This phase also:

- redirects the legacy in-house and departures entry pages into the canonical Front Office tabs (their content moves into Front Office, so no screen is lost),
- removes the legacy Front Office / In-House / Departures items from the sidebar and any dashboard shortcut, leaving `/restaurant/pms/front-office` as the only Front Office landing screen,
- keeps reservation detail and dialogs intact.

## 4. Front Office content

`/restaurant/pms/front-office` becomes the day-of-stay landing screen with tabs, all built from the existing check-in / check-out / room-move / no-show logic:

- **Overview** — today's arrivals, departures, in-house, available / occupied / out-of-order counts (existing summary), plus walk-in and room-search actions.
- **Arrivals** — today's arrivals with assign room, check in, no-show (existing screen).
- **Check-In** — arrivals filtered to those ready to check in (confirmed, arriving today), same check-in action.
- **In-House** — current stays with room move, date change and folio access (existing in-house screen).
- **Room Assignment** — stays without a room assigned, using the existing assign-room dialog.
- **Departures** — today's departures with check-out (existing departures screen).

Tab is reflected in the address. No new stay records, no rebuilt check-in logic, Reservations stays a separate submodule.

## 5. Cashiering

`/restaurant/pms/cashiering` keeps its ledger untouched and gains tabs:

- Dashboard, Folios, Payments, **Deposits**, **Refunds**, **Transfers**, Cashier Shifts.

Deposits and Refunds read the existing folio ledger, filtered to deposit and refund entries — no new records, no second ledger. Transfers is a foundation screen: the ledger has no transfer entry type today, so it explains that folio-to-folio transfers are not yet supported and shows nothing else.

The Dashboard summary gains totals for deposits, refunds and transfers (transfers shown as not yet available) alongside the existing folio, payment, charge and open-shift indicators, all derived from the same ledger read.

## 6. Ownership and duplication

Cashiering stays guest-billing only; Accounting & Finance stays a separate top-level module and no export/integration is built. No POS or F&B financial data is copied in. Charge-to-room keeps posting through the existing folio ledger. Every new figure is a read of existing entries — nothing recalculates or re-posts.

## 7. Security

No permission, role or database-policy changes. The new tabs render inside the existing access checks: reception-level staff keep Reservations and Front Office without Cashiering, cashier-level staff keep Cashiering without Front Office mutations.

## Technical notes

- `src/lib/reservations.functions.ts`: add read-only server functions for reservation history (amendments) and reuse `listReservations` with a cancelled filter; no schema changes.
- `src/components/workspaces/reservations-workspace.tsx`: wrap the existing list in `Tabs`, add `initialTab`, add amendments/cancellations panels and foundation panels for group/corporate; fix `Link`/`navigate` targets.
- New `src/components/workspaces/front-office-workspace.tsx` composing the existing `FrontOfficeSummary`, `ArrivalsWorkspace` body, and the in-house/departures list bodies extracted from `src/routes/restaurant/rooms/in-house.tsx` and `departures.tsx` into shared components; dialogs (`CheckInDialog`, `AssignRoomDialog`, `NoShowDialog`, check-out) reused as-is.
- `src/routes/restaurant/pms/front-office.tsx` and `reservations.tsx`: add `validateSearch` for `tab` and pass `initialTab`.
- `src/routes/restaurant/rooms/in-house.tsx` and `departures.tsx`: convert to redirects into the canonical Front Office tabs.
- `src/components/restaurant-shell.tsx`: drop legacy Front Office / In-House / Departures nav entries.
- `src/lib/cashiering.functions.ts`: extend `getCashieringDashboard` with deposit/refund totals (single ledger aggregate) and allow `listFolioTransactions`-style filtered reads for the deposits/refunds tabs.
- `src/components/cashiering/cashiering-tabs.tsx` + `cashiering-workspace.tsx`: add Deposits, Refunds, Transfers tabs.

## Verification

Typecheck, production build, and an authenticated browser pass over Reservations (five tabs), Front Office (six tabs) and Cashiering (seven tabs), confirming PMS context is kept, no link returns to the old booking or rooms dashboards, and no financial record is created by viewing.

## Not in this phase

Group/corporate reservation schema, folio-to-folio transfers backend, accounting export, changes to the other PMS submodules.
