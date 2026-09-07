# Phase 8F1 — Restaurant Management launcher + module registry

One clear home for the Restaurant Management package, plus a single authoritative list of its modules. No route migration, no component moves, no database or business-logic changes.

## What the user will see

A new page at `/restaurant/restaurant-management`, reached from the Restaurant Management tile on Property Home. It uses the existing NORU shell, shows the property name, a breadcrumb back to Property Home, and grouped cards for each restaurant area. Every card opens the screen that already works today. Planned areas appear in a clearly labelled "Future capabilities" strip and are not clickable.

## New file: `src/lib/restaurant-management-modules.ts`

Mirrors `src/lib/pms-modules.ts` in purpose and shape. Exports `RM_GROUPS` and `RM_MODULES`.

Fields per module: `key`, `title`, `description`, `group`, `icon`, `moduleKey` (existing `ModuleKey`, no new keys), `currentRoute` (+ optional `search` tab), `canonicalRoute` (the future 8F2 address, recorded only), `implementationStatus` (`existing | partial | foundation | planned`), optional `sharedDependencies`, optional `transitional: true`.

### Groups and core modules

RESTAURANT OPERATIONS
- Dashboard → `/restaurant/dashboard` — existing — `food_and_beverage`
- POS & Sales → `/restaurant/pos/new` — existing — `pos`
- Digital Ordering (QR & waiter-assisted) → `/restaurant/waiter` — existing — `food_and_beverage`
- Table & Floor Management → `/restaurant/tables` — existing — `food_and_beverage`
- Order Management & Distribution → `/restaurant/orders` — existing — `food_and_beverage`
- Kitchen & Department Order Display → `/restaurant/kitchen` — existing — `food_and_beverage`

MENU, COST & STOCK
- Menu & Product Management → `/restaurant/menu` — existing — `food_and_beverage`
- Recipe & Cost Management → `/restaurant/menu` (recipes live inside the menu screen today) — partial — `food_and_beverage`
- Inventory & Stock Management → `/restaurant/inventory` — existing, transitional (shared) — `inventory`

PEOPLE & CONTROL
- Staff & Workforce Management → `/restaurant/staff` — existing, transitional (shared) — `human_resources`
- Payments & Cashiering → `/restaurant/pos/new` cash/payment surface — foundation — `pos`; described as restaurant payments, cashier shifts and POS reconciliation, explicitly not hotel folios
- Reports & Analytics → `/restaurant/reports` — existing, transitional (shared) — `reports_analytics`

SYSTEM MANAGEMENT
- Restaurant Setup & Administration → `/restaurant/configuration` — partial, transitional — `configuration`; wording notes it reuses current configuration until restaurant-specific setup lands

### Future modules (registered, not built)

Reservation & Waitlist, Guest & Customer Management, Bar & Beverage, Procurement & Supplier Management (foundation — links to existing procurement), Production & Central Kitchen, Delivery Management, Buffet & Catering, Room Service & PMS Integration (foundation — Charge to Room exists), Customer Loyalty & Membership, Promotions & Marketing, Staff Money & Sales Dashboard, Restaurant Finance & Accounting, Multi-Outlet & Chain Management, Integrations & API, Security & Audit. Each carries an honest status; planned ones render as non-clickable cards.

## New route: `src/routes/restaurant/restaurant-management/index.tsx`

Copies the proven shape of `src/routes/restaurant/pms/index.tsx`:
- `ssr: false`; `beforeLoad` does the existing sign-in check then `await requireRoutePackage("restaurant_management")` — no new entitlement logic.
- Renders inside `RestaurantShell` (no second shell).
- Fetches `getMyModuleAccess` and shows only modules whose `moduleKey` the person has; groups with nothing visible are hidden.
- Own `head()` metadata (title, description, og:title, og:description, og:type, twitter:card, noindex).
- `RestaurantNavLabel` gains one entry, "Restaurant Management", mapped to the existing `restaurant` workspace.

## Property Home change

In `src/routes/restaurant/home.tsx`, the Restaurant Management package tile's `to` becomes `/restaurant/restaurant-management`. Its visibility condition (package entitlement AND `food_and_beverage` module access) is untouched.

## Explicitly not in this phase

No `/restaurant/restaurant-management/*` submodule routes, no redirects from legacy routes, no component moves, no server function, RLS, RPC or table changes, no POS/HR/Inventory split, no Back Office.

## Verification

Typecheck, production build, and a signed-in browser pass: Property Home tile lands on the launcher; every core card opens its working screen (dashboard, POS, orders, kitchen, menu, tables, inventory, staff, reports); the launcher is blocked when the package is switched off and loads under the compatibility default; PMS untouched; no console errors.
