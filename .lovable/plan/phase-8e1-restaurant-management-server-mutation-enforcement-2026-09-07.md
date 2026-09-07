# Phase 8E1 — Restaurant Management server mutation enforcement

Make the Restaurant Management package a real server-side authorization boundary: when it is switched off or expired, no restaurant action can succeed on the server, even from a stale tab, a bypassed page or a hand-made request. Everything that works today for properties with no package settings keeps working exactly as before.

## Approach

One new guard file, then a thin call added at the top of each restaurant action — before any database write. No business rules, no schema, no roles, no file moves change.

### 1. The guard (new `src/lib/restaurant-package.server.ts`)

- `requireRestaurantManagement(context, restaurantId)` — for signed-in staff actions. Re-derives the caller's membership through the existing `callerMembership`, then calls the existing `requirePropertyPackage(..., "restaurant_management")`. Fails closed on any lookup error. Message is the project's normal access-denied wording; no package, expiry or admin detail.
- `requirePublicRestaurantManagement(restaurantId)` — for public ordering. Uses the existing public-safe resolver `publicPackageAvailable` from Phase 8D2 (already cached 30s, fail-closed, boolean only). Throws/returns the neutral "This ordering service is currently unavailable." shape used by the public flow.
- `requireRestaurantAndPms(context, restaurantId)` — for the Charge to Room bridge; requires both packages, rejecting if either is off or expired.

Expiry and the "no row = enabled" compatibility default are not reimplemented — they come from the shared Phase 8B1 resolver.

### 2. Actions the guard is added to (outer check, before the first write)

Order creation and mutation
- `placeOrder` (public QR) — public guard, placed after the restaurant is resolved and before menu/table resolution and the insert.
- `placeWaiterAssistedOrder` — staff guard.
- `placePosSale`, `payPosSale`, `openPosShift` (and the POS context read) — staff guard with `restaurant_management`, not `pos`; the standalone POS package stays unbuilt.
- Kitchen status changes — see item 4.

Menu / tables / QR
- `saveCategory`, `setCategoryActive`, `moveCategory`, `deleteCategory`, `saveMenuItem`, `setItemAvailability`, `deleteMenuItem`, `createMenuImageUpload`.
- `saveRestaurantTable`, `setTableActive`, `regenerateTableToken`, `deleteRestaurantTable`.
- `resolveRestaurantTable` / `resolveManualTable` already carry the 8D2 public check — order preserved: resolve property, check package, then validate the token, so a disabled property never reveals whether a token exists.

Recipes (clearly restaurant-owned today)
- `saveRecipeComponent`, `updateRecipeComponent`, `removeRecipeComponent`.

Charge to Room
- `postOrderRoomCharge` and `reverseOrderRoomCharge` require both packages. All existing checks stay: idempotency, served-order rule, open folio, same tenant, currency, waiter ownership, reversal rules.

Restaurant reporting reads that are direct endpoints
- `getRestaurantAnalytics`, `getRestaurantDashboard`, `listRestaurantOrders`, `getRestaurantOrderDetail`, `getManagedMenu`.

### 3. Deliberately left alone (documented in the report)

- Inventory and procurement mutations (`createInventoryMovement`, purchasing/receiving, suppliers, assets) — classified transitional/shared in the Phase 8A audit; gating them would break Back Office-bound work.
- Workforce and staff identity (`createStaff`, `changeStaffRole`, shifts, check-in/out, attendance) — transitional and shared with hotel operations. Waiter table assignment functions are reviewed; if they are restaurant-only they are gated, otherwise deferred with a note.
- All PMS, housekeeping, reservations, night audit, rates, guests, distribution actions — out of scope for this phase.
- Public order tracking (`getTrackedOrder`) — a customer reading their own already-placed order; not a mutation.

### 4. The one direct browser write

The kitchen board updates order status straight from the browser (`src/components/kitchen-board.tsx`, the `.update({ status })` call), so a package guard on the server would not cover it. Fix narrowly: add a `updateKitchenOrderStatus` server action in the existing restaurant orders module that keeps the current transition rules and tenant/role checks, add the package guard to it, and have the board call it. Realtime refresh behaviour stays as-is. No other direct client writes were found in restaurant code.

### 5. Database functions

Restaurant-related database routines (`log_order_status`, `record_pos_order_payment`, `post_order_room_charge`, `reverse_order_room_charge`, `apply_inventory_movement`, `receive_purchase_order_goods`) stay unchanged; they are invoked only by trusted server code that now carries the guard. The report lists which remain protected by the calling layer only. No SQL is rewritten unless a routine turns out to be directly callable by a normal browser session, in which case the finding is reported rather than silently patched.

## Verification

- Compatibility property (no package rows): QR order, waiter order, POS sale, menu edit, kitchen status change all work.
- Restaurant Management switched off, then expired: each of those is rejected, with no order, item, payment or token row written.
- Charge to Room: works with both packages on; rejected when either is off.
- Role denial still applies when the package is on.
- Forced resolver failure: action rejected, nothing written.
- Typecheck, production build, signed-in browser smoke test and a public ordering smoke test. Test rows removed afterwards.

Stops here — no hotel-side, Back Office, RLS, POS/HR/Inventory split work.
