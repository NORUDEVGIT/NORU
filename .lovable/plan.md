# Phase 3.5 — Batch 2: Waiter-Assisted Ordering + Waiter Attribution

Let waiter/manager/owner staff place an order from their phone for a table, and record on every order which waiter is responsible and where the order came from. One ordering engine only: both the customer QR path and the staff path go through the same shared server-side pricing, validation and insert core.

## 1. Migration (small, additive)

Add to `orders`:

- `order_source` text NOT NULL DEFAULT `'customer_qr'`, constrained to `customer_qr` / `waiter_assisted`
- `assigned_waiter_membership_id` uuid NULL → `restaurant_users(id)`
- `created_by_staff_membership_id` uuid NULL → `restaurant_users(id)`
- `assigned_waiter_name_snapshot` text NULL
- `created_by_staff_name_snapshot` text NULL

Existing rows become `customer_qr` with all attribution NULL, so history keeps loading. Indexes only on `assigned_waiter_membership_id` and `order_source`.

**Integrity invariant**, enforced by a CHECK constraint in the same migration (it is a pure row-level rule, so it is safe as a constraint):

- `customer_qr` → `created_by_staff_membership_id` IS NULL
- `waiter_assisted` → `created_by_staff_membership_id` IS NOT NULL

The shared order-creation core sets these fields itself, so the constraint is a backstop rather than the only guard.

## 2. One shared order-creation pipeline

Refactor today's `placeOrder` handler into named server-only steps, then have both entry points call them. No pricing, validation or insert logic is copied.

```text
resolveRestaurant(slug|id)        -> approved + active restaurant row
resolveRestaurantTable(...)       -> table row belonging to that restaurant
resolveAndValidateOrderLines(...) -> existing resolveOrderLines (authoritative name/price/total)
resolveAssignedWaiter(...)        -> current waiter for this table, or null
createValidatedOrder(...)         -> orders insert + order_items insert
```

`createValidatedOrder` accepts only already-authorized, already-validated context: restaurant id, table id and table-number snapshot, customer id, order_source, attribution ids and name snapshots, and the resolved lines with their authoritative prices. It computes the total from the resolved lines and never reads a browser-supplied price, name or total.

Entry wrappers:

- `placeOrder` — public customer wrapper (unchanged signature and behaviour); resolves restaurant/table/customer exactly as today, then calls the shared core
- `placeWaiterAssistedOrder` — authenticated staff wrapper; does authorization and table selection, then calls the same shared core

## 3. Assigned-waiter resolver

One server-only helper in the workforce server module. Given restaurant, table and the server's current time, it finds assignments where: the assignment, table, shift and membership all belong to that restaurant; the membership is active with an assignable role (waiter/manager/owner, matching the existing `ASSIGNABLE_TABLE_ROLES` rule); the shift is `scheduled`, not cancelled, and covers the current moment; and the assignment belongs to that shift. Returns `{ membershipId, name }` or null. The browser never supplies a waiter id.

Time handling reuses the existing workforce `shiftMoment` convention — no second timezone algorithm. Per-restaurant timezones remain a documented future improvement.

**Ambiguity:** if more than one valid current assignment matches the same table, the resolver reports ambiguity rather than picking one.

- Staff-assisted ordering: fail with a clear staffing-conflict message
- Customer QR ordering: never blocked — attribution is set to NULL and the conflict is logged server-side

## 4. Customer QR path

`placeOrder` keeps its current restaurant/table/approval/guest-token behaviour. After the table is resolved it calls the resolver and passes to the core: `order_source = 'customer_qr'`, assigned waiter id + name snapshot when one exists (both NULL otherwise), `created_by_staff_membership_id` and its snapshot always NULL. Missing shifts, missing assignments, absent staff, missing attendance or ambiguous staffing never fail a customer order — only restaurant/table/menu validation can.

## 5. Waiter-assisted path

`placeWaiterAssistedOrder` verifies the authenticated user, an active membership in the restaurant (re-derived server-side, never trusted from the browser) and a role of owner, manager or waiter. Kitchen is excluded.

Role = waiter:

- valid current shift today, not cancelled, current time inside the shift
- the selected table is assigned to that waiter for that shift
- checked in — otherwise "Check in before taking orders."
- not already checked out — otherwise "Your shift has already been checked out."

Role = owner/manager: any active table of their own restaurant; no assignment, shift or check-in requirement.

Attribution: `order_source = 'waiter_assisted'`, `created_by_staff_membership_id` = the caller's own membership with their current display name snapshot, and `assigned_waiter_membership_id` = whatever the resolver returns for that table — which may be a different person (John assigned, Sarah entering) or NULL. A manager is never auto-promoted to assigned waiter.

## 6. `/restaurant/waiter` (mobile-first)

Inside `RestaurantShell`, visible to owner/manager/waiter only.

- **My Shift** — reuses the existing My Shift card (times, check-in status, assigned tables)
- **My Tables** — waiter sees only tables assigned to their current valid shift; owner/manager get a picker of all active restaurant tables. Each row has a thumb-sized **Create Order** button
- **Create Order** — a full-screen mobile sheet using the same database menu helpers as customers (categories, availability, price formatting): tap to add, quantity steppers, per-line special instructions, running total, review list, **Place Order**. Success shows the order number and clears the draft

The draft cart is local state on this screen; the customer cart store is untouched. No waiter-specific menu records.

## 7. Orders, detail, kitchen

- `/restaurant/orders`: **Waiter** and **Source** shown in the desktop rows where space allows and inside each mobile card
- `/restaurant/orders/:orderId`: Assigned Waiter, Order Source, and Entered By for waiter-assisted orders
- Kitchen card: a single `Waiter: John` line, omitted when unassigned. No change to status logic or realtime

Display prefers the stored name snapshots, falling back to a current membership lookup only when a legacy row has no snapshot. No membership UUIDs are shown. Customer-facing screens are unchanged.

## 8. Security

No RLS change and no new public access: the new columns sit on the already tenant-scoped `orders` table, privileged writes stay in server functions, and no service-role credential reaches the browser. Rejected server-side: another restaurant's table/assignment/menu, an unassigned table, bypassing check-in, ordering after checkout, supplying someone else's membership id, and supplying prices, names or totals.

## 9. Verification on The Garden

Shared-logic check first: confirm both wrappers call the same core and that no pricing logic exists twice. Then, with a test waiter on a current shift holding Tables 1 and 2 and checked in — assisted order on Table 1 records the right source, creator, waiter, snapshots, table, database prices and total, and reaches the kitchen. Also tested: order attempt before check-in, order attempt after checkout, forged Table 7, anonymous QR order on Table 1 (customer_qr, waiter attributed, no creator), QR order on an unassigned table, manager-entered order on John's table, an ambiguous-assignment case, and cross-tenant identifier tampering. Checked at mobile width; test data cleaned up afterwards.

## Out of scope

Payroll, leave, holiday workflow, attendance corrections, waiter performance reports, tips, split bills, payments, Telebirr, POS, inventory, reservations.

## Known limitations

Attribution is a point-in-time snapshot: reassigning a table later does not rewrite past orders. Shift matching uses the shift's scheduled date and time window under the existing workforce time convention, so overnight shifts crossing midnight match by their scheduled date only, and per-restaurant timezones are still a future improvement.
