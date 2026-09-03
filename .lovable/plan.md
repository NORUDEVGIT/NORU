# Phase 7A — Restaurant Charge to Room

Let a completed restaurant order be posted once, as a charge, onto an open guest folio of a checked-in stay. No new payment rails, no new dashboards.

## Database (one migration, `0020_room_charge.sql`)

Additive only; every new column nullable so legacy orders stay valid.

- `orders`: `billing_method text NULL` (check `direct | room_charge`), `room_charge_folio_id uuid NULL`, `room_charge_reservation_id uuid NULL`, `room_charge_posted_at timestamptz NULL`, `room_charge_posted_by_membership_id uuid NULL`. Foreign keys to `guest_folios`, `hotel_reservations`, `restaurant_users`.
- `folio_transactions`: extend the category check to allow `restaurant` (keep `future_restaurant` so old rows and Night Audit categorisation stay valid).
- Idempotency: partial unique index on `folio_transactions (restaurant_id, reference_type, reference_id) WHERE reference_type = 'restaurant_order'` — the same shape already used for room charges. Plus a partial unique index on `orders (room_charge_folio_id, id)` is unnecessary; the order row itself carries the posted state and is locked during posting.
- `SECURITY DEFINER public.post_order_room_charge(_restaurant_id, _order_id, _folio_id, _membership_id)`: locks the order row, returns the existing linkage untouched if already posted (`already = true`), otherwise re-checks order eligibility, folio/reservation/room/guest/property/currency, posts the ledger charge (`transaction_type = charge`, `category = restaurant`, `reference_type = restaurant_order`, `reference_id = order.id`, amount taken from `orders.total` in the database, description `Restaurant Order #<order_number>`), stamps the order billing columns, writes `folio_history` (`room_charge_posted`) and `order_status_history`-style audit, all in one transaction.
- `SECURITY DEFINER public.reverse_order_room_charge(_restaurant_id, _order_id, _reason, _membership_id)`: owner/manager only (enforced in the server layer), never deletes the original row — posts an opposite `adjustment` ledger entry (`category = restaurant`, `reference_type = restaurant_order_reversal`), clears `billing_method` back to `direct` while keeping a history trail, writes `folio_history` (`room_charge_reversed`) with the reason. Rejects when the folio is closed or the charge was already reversed.
- RAISE EXCEPTION codes: `ORDER_NOT_FOUND`, `ORDER_NOT_ELIGIBLE`, `ORDER_CANCELLED`, `ORDER_ALREADY_POSTED`, `RESERVATION_NOT_CHECKED_IN`, `FOLIO_NOT_FOUND`, `FOLIO_CLOSED`, `CURRENCY_MISMATCH`, `REVERSAL_REASON_REQUIRED`, `CHARGE_NOT_FOUND`.

## Eligibility

- Order: belongs to the property, status `served` (existing final service state) and not `cancelled`, not already room-charged, total > 0.
- Target stay: reservation `status = checked_in`, has an assigned room, that room belongs to the property, and it has exactly one `open` folio whose guest matches the reservation guest.
- Currency: folio currency must equal the property currency; otherwise rejected with a clear message. No FX.

## Server layer

- `src/lib/room-charge.server.ts` — role helpers (`canPostRoomCharge`: owner/manager always; waiter only for an order they may operate under the existing waiter rules already in `waiter-orders.functions.ts` — their assignment plus an open checked-in shift; kitchen never), error-code map, eligibility predicates.
- `src/lib/room-charge.functions.ts` — `searchChargeableStays` (by room number, guest name, confirmation number; returns room, guest, reservation, folio number, folio balance, currency — checked-in + open folio only), `getOrderRoomCharge` (billing block for the order detail page), `postOrderRoomCharge`, `reverseOrderRoomCharge`. Every handler re-derives the membership, revalidates every id against `restaurant_id`, calls the RPC with the service role, and returns `{ ok: true, … } | { ok: false, message }` in the established style. Retried posts return the existing posting as success.

## UI

- `src/components/orders/charge-to-room-dialog.tsx`: room/guest/confirmation search, results list of eligible stays, then a confirmation panel showing Room, Guest, Reservation, Folio, Folio balance, Order number and Order total, with an explicit **Confirm charge to room** button.
- `/restaurant/orders/$orderId`: a Billing section. Before posting, a **Charge to Room** action (shown only when the order is eligible and the caller may post). After posting: "Charged to Room 201 · John Doe · FL-000001 · posted <time>", a link to the folio, the action disabled, plus **Reverse charge** (owner/manager only, reason required).
- Waiter flow (`/restaurant/waiter`): the same action on an order the waiter may operate; nothing added to the Kitchen board.
- Folio detail (`/restaurant/cashiering/folios/$folioId`): the charge already renders in the existing ledger; add a link back to the order when the reference is `restaurant_order`. No second financial table.

## Night audit and reporting

No changes to Night Audit logic. Restaurant charges are ordinary ledger charges, so folio balances, cashiering totals and audit "other charges" pick them up once. `category = restaurant` is added alongside the existing categories, and any breakdown labels it "Restaurant".

## Permissions

Owner/manager: post and reverse. Waiter: post only within the existing waiter rules; no reversal. Kitchen: no action, no API. Tenant id always server-derived.

## Verification (The Garden)

Served order → charge to room → one ledger row at the authoritative total → retry returns the same posting with no duplicate → order shows Charged to Room → folio balance up by the total. Rejections: checked-out guest, closed folio, cancelled order, cross-tenant target, kitchen role. Waiter path follows existing waiter rules. Reverse as owner: original row intact, opposite entry created, balance correct. Typecheck, build, console check.

## Out of scope

Payment gateways, loyalty, customer accounts, split billing, restaurant accounting, POS terminal, OTA, inventory consumption, anonymous QR self-charging.
