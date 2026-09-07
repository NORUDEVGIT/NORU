# Phase 8D2 — Public package capability gating

Goal: when a property's Restaurant Management package is switched off (or expired), its public ordering pages stop working; when its PMS package is off, its public booking pages stop working. Customers see a neutral "currently unavailable" message — never any hint about packages, billing, expiry or admin settings. Properties with no explicit package rows keep working exactly as today.

## What changes for visitors

- Restaurant ordering pages (`/r/<restaurant>` and everything under it, including the table QR link) show: "Online ordering is currently unavailable." with a link back home.
- Hotel booking pages (`/stay/<property>` search, booking, confirmation, manage booking) show: "Online booking is currently unavailable."
- Unknown restaurant/property addresses keep their existing "not found" screen — the unavailable screen looks different from not-found only in wording, and neither reveals anything about the account.
- The QR scan page is unchanged; it forwards to the table link, which then performs the check.

## Technical plan

### 1. One public-safe resolver

New `src/lib/public-package.server.ts`:

```ts
publicPackageAvailable(restaurantId, packageKey): Promise<boolean>
```

- Uses the service-role client already used by the public booking/ordering server code, reading only `restaurant_package_entitlements`.
- Delegates expiry/compatibility semantics to the existing `propertyHasPackage` / `resolvePackages` (no duplicated expiry logic).
- Returns a bare boolean; never source, `activated_at`, `expires_at` or admin metadata.
- Fail-safe: on a resolver error return `false` (unavailable) and log server-side only.
- Small in-memory cache keyed `restaurantId + packageKey`, ~30s TTL, errors never cached. Admin entitlement changes therefore take effect within ~30 seconds.

### 2. Restaurant Management public routes

- `src/lib/public-restaurant.functions.ts` — `getPublicRestaurant` keeps its anti-enumeration behaviour (unknown/unapproved/inactive → `null`) and gains a `serviceAvailable: boolean` field resolved from the new resolver after the restaurant row is found.
- `src/routes/r/$restaurantSlug/route.tsx` (the parent layout for every `/r/...` page) renders the neutral unavailable screen instead of `<Outlet />` when `serviceAvailable` is false, so index, table, cart, review, status, confirmation and order pages all inherit the guard and never fetch menu/order data.
- `src/lib/tables.functions.ts` — `resolveRestaurantTable` resolves the restaurant, checks availability, and returns its existing generic failure shape when unavailable, *before* touching the QR token. Token validation logic itself is untouched, and a disabled property returns the same generic result for valid and invalid tokens, so nothing new is enumerable.
- `/scan` needs no change (it only routes to the table URL, which is guarded).

### 3. PMS public routes

- `src/lib/public-booking.server.ts` — `resolveStayProperty` (already the single entry point used by every `/stay` server function) returns `null` for unknown/closed properties as today, and additionally returns `null` when PMS is unavailable, with a distinguishing flag returned to the page layer so the correct wording is shown.
  - Concretely: `resolveStayProperty` gains an internal companion `resolveStayPropertyPublic` returning `{ status: "ok" | "not_found" | "unavailable", property }`; `getStayProperty` surfaces `{ status }` to the route, and `searchStay`, `submitDirectBooking`, `lookupDirectBooking`, `cancelDirectBooking` treat "unavailable" the same as "not found" (their existing generic message), so deep links and direct form posts cannot bypass the gate.
- `src/routes/stay/$propertySlug/index.tsx`, `book.tsx`, `confirmation.tsx`, `manage.tsx` each render a new `StayUnavailable` state from `src/components/stay/stay-chrome.tsx` when the status is "unavailable".

### 4. Explicitly not in this phase

- No package checks added inside order placement, folio, reservation, or RPC mutations beyond the minimum public-route loaders described above (deferred to 8E).
- No RLS changes, no POS/HR/Inventory split, no Back Office work, no changes to pricing, availability, guest matching or manage-booking security.

## Verification

- Typecheck and production build.
- Browser smoke test against The Garden with temporary entitlement rows, then removal of those rows:
  - compatibility default (no rows): `/r/...` and `/stay/...` both work;
  - `restaurant_management` disabled and expired: restaurant landing, QR link and deeper pages unavailable, no ordering UI;
  - `pms` disabled and expired: stay landing, `/book`, `/manage` unavailable;
  - unknown slug still shows not-found; invalid QR token still safe;
  - re-enabling restores the public flow within the cache interval;
  - page source inspected to confirm no entitlement metadata is sent to the browser.
- Final implementation report covering the 18 requested points.
