# POS — Touchscreen Ordering & Payment

A full-screen, touch-first point of sale for counter and takeaway sales, built for a landscape tablet (1024x768 / 1280x800). Menu on the left, live sale on the right, one-tap add, big PAY flow with Cash, Card and Charge to Room.

## What gets built

**Screen: `/restaurant/pos/new`**

- Full-height two-panel layout: menu ~68% left, current sale ~32% right. No page scroll, each panel scrolls independently, no horizontal overflow.
- Top bar: property name, order type toggle (COUNTER / TAKEAWAY), cashier name, open-shift indicator, exit to Food & Beverage.
- Menu panel: category buttons from the property's menu categories (All + each active category), search field, grid of large item tiles (name + price) that add one to the sale on a single tap. Unavailable items are not shown.
- Sale panel: order number placeholder, line list with name, quantity stepper (−/+), line total, tap-to-remove; Subtotal and Total (no tax for now, per your choice); HOLD, VOID/CLEAR and a full-width PAY button.
- HOLD parks the current sale locally on the till (recall list in the top bar) so the cashier can start another sale; nothing is written to the database until the sale is placed.
- All targets 44–64px, no hover-only controls, instant visual feedback on tap.

**Payment flow (modal, touch-sized)**

- PAY opens method choice: CASH, CARD, CHARGE TO ROOM.
- CASH: numeric keypad plus Exact and denomination quick-buttons generated from the property's currency (never hard-coded), live change-due readout, CONFIRM.
- CARD: manual/external terminal confirmation only — cashier confirms the payment was taken on the terminal, with an optional reference.
- CHARGE TO ROOM: reuses the existing in-house stay search and room-charge posting from Phase 7A.
- Completion state: big confirmation with order number, total, tendered and change; NEW SALE and PRINT (browser print receipt).

**Behaviour tied to your answers**

- No tax: sale shows Subtotal and Total only.
- An open cashier shift is required before payment. If none is open, the till shows an "Open cashier shift" prompt with opening float, using the existing cashier-shift functions; cash payments are recorded against that shift.
- POS sales go into the normal order pipeline, so they appear on the Kitchen board and in Orders like any other order.

**Access**

- POS tile on Property Home stops being "Coming soon" and links to the till.
- POS module becomes available to cashier and waiter by default (owner/manager already have it) and becomes toggleable per staff member in HR → Staff → Module Access.
- Server-side guard on every POS server function: POS module access plus an operating role.

## Technical notes

- Migration `0025_phase_7d_pos_sales.sql` (additive only):
  - widen `orders.order_source` CHECK to include `pos_counter`, and widen `orders_source_attribution_check` so POS orders also require a staff membership;
  - add nullable `orders.order_type` (`counter` | `takeaway`), `orders.paid_at`, `orders.cashier_shift_id`;
  - new table `public.order_payments` (restaurant_id, order_id, cashier_shift_id, method `cash`|`card`, amount, tendered_amount, change_amount, reference, membership_id, timestamps) with GRANTs, RLS and role-scoped policies via `has_any_restaurant_role`;
  - `record_pos_order_payment(...)` SECURITY DEFINER RPC: validates tenant, order, open shift and amount, inserts the payment, stamps `paid_at` and `billing_method = 'direct'`.
- `src/lib/pos.server.ts` — module + role guards (`requirePosAccess`, `requirePosOperator`) built on `requireModuleRole`.
- `src/lib/pos.functions.ts` — `getPosContext` (menu, categories, currency, shift state, permissions), `placePosSale` (goes through the existing shared `order-core.server` pipeline — no second ordering engine, prices re-read from the database), `payPosSale`.
- `src/components/pos/*` — `pos-menu-panel`, `pos-sale-panel`, `pos-payment-dialog`, `pos-cash-keypad`, `pos-complete`.
- `src/routes/restaurant/pos/new.tsx` — standalone till layout (not inside the admin sidebar shell), guarded by POS module access.
- `src/lib/module-access.ts` — add `pos` to cashier/waiter defaults and to `OVERRIDABLE_MODULES`.
- Untouched: QR ordering, waiter ordering, pricing, charge-to-room internals, folio ledger, night audit, inventory ledger, Property Home 7B architecture.

## Verification

Playwright at 1280x800 and 1024x768: add items, adjust quantities, hold/recall, cash payment with change, card payment, charge to room, kitchen board shows the sale, and role checks for cashier vs. staff without POS access.
