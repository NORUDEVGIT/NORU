# Phase 3.5 — Batch 2: Waiter-Assisted Ordering + Waiter Attribution

Let waiter/manager/owner staff place an order from their phone for a table, and record on every order which waiter is responsible and where the order came from. No second ordering engine: the existing hardened order-placement path does the pricing and validation.

## 1. Migration (small, additive)

Add to `orders`:

- `order_source` text, default `customer_qr`, not null, constrained to `customer_qr` / `waiter_assisted`
- `assigned_waiter_membership_id` uuid null → `restaurant_users(id)`
- `created_by_staff_membership_id` uuid null → `restaurant_users(id)`
- `assigned_waiter_name_snapshot` text null
- `created_by_staff_name_snapshot` text null

Existing rows get `customer_qr` and null attribution, so history keeps loading. Indexes only on `assigned_waiter_membership_id` and `order_source`. No RLS change: these columns live on a table that is already tenant-scoped, and nothing new is exposed to customers.

## 2. Shared attribution helper (server-only)

New helper in the workforce server module: given a restaurant and a table, find the active (non-cancelled) shift covering now whose staff member is assigned that table, and return `{ membershipId, name }` or null. Used by both order paths so the rule is defined once. The browser never supplies a waiter id.

## 3. Customer QR orders

`placeOrder` stays exactly as it is except that, after the table is resolved server-side, it calls the helper and writes `order_source = 'customer_qr'`, the assigned waiter (or null), and `created_by_staff_membership_id = NULL`. No customer UI change; missing staffing data never blocks an order.

## 4. Waiter-assisted order placement

One new authenticated server function that reuses the same line-resolution/pricing helper and the same insert shape as `placeOrder`:

- verifies the caller's active membership in the restaurant and role in owner/manager/waiter
- waiter: the table must be assigned to them on a valid current shift, and they must be checked in — otherwise "Check in before taking orders."
- owner/manager: any active table of their own restaurant; no shift or check-in requirement
- table, menu item, availability, name, price and total all re-derived from the database
- writes `order_source = 'waiter_assisted'`, `created_by_staff_membership_id` = the caller's membership, and `assigned_waiter_membership_id` = the table's assigned waiter (which may be someone other than the caller, or null)

Forged table ids, other restaurants' tables and other waiters' tables all fail server-side.

## 5. `/restaurant/waiter` (mobile-first)

Inside `RestaurantShell`, accessible to owner/manager/waiter; a nav entry appears for those roles.

- **My Shift** — reuses the existing My Shift card (times, check-in status, assigned tables)
- **My Tables** — waiter sees only tables assigned to their current shift; owner/manager see a picker of all active tables. Each row has a **Create Order** button
- **Create Order** — a full-screen mobile sheet: category-grouped menu from the existing public menu function, tap to add, quantity steppers, per-line special instructions, running total, review list, then **Place Order**. Success shows the order number and clears the draft

The draft cart is local component state for this screen only; the customer cart store is untouched.

## 6. Orders, detail, kitchen

- `/restaurant/orders`: a **Source** badge and **Waiter** value in the desktop table (space permitting) and inside each mobile card
- `/restaurant/orders/:orderId`: Assigned Waiter, Order Source, and — for waiter-assisted — Entered by. Names come from the snapshot fields; no UUIDs shown
- Kitchen card: a single small `Waiter: John` line, omitted when unassigned. Same queue, same realtime, same statuses

Customer-facing screens are unchanged.

## 7. Verification on The Garden

Test waiter with a shift, tables 1 and 2, checked in: My Tables shows only 1 and 2; assisted order for Table 1 records the right source, creator, waiter, table, item snapshots and server total, and reaches the kitchen. Forged Table 7 attempt fails. Anonymous QR order on Table 1 records `customer_qr` with the waiter attributed and no creator. QR order on an unassigned table succeeds with a null waiter. Owner-entered order attributes the owner as creator but keeps the assigned waiter. Cross-tenant identifier tampering fails. Checked at mobile width, then test data cleaned up.

## Out of scope

Payroll, leave, attendance corrections, waiter performance reports, tips, split bills, payments, POS, inventory, reservations.

## Known limitations

Attribution is a point-in-time snapshot: reassigning a table later does not rewrite past orders. Shift-coverage matching uses the shift's own start/end window in the restaurant's local day, so overnight shifts crossing midnight are matched by their scheduled date only.
