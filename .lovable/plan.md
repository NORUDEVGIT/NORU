# Phase 8F2 — Canonical Restaurant Management route family

Create the thirteen `/restaurant/restaurant-management/*` addresses, each one reusing the screen that works today. No new business logic, no database work, no legacy URL removed.

## What the user will see

The Restaurant Management launcher tiles now open addresses inside the Restaurant Management family. Each page looks and behaves exactly as it does today, with one consistent header line — "Restaurant Management · Orders", "Restaurant Management · Kitchen" and so on — a breadcrumb reading Property Home → Restaurant Management → [area], and a clear way back to the Restaurant Management home. Every old address keeps working, so existing bookmarks are unaffected.

## Canonical routes created

```text
/restaurant/restaurant-management/dashboard        reuses /restaurant/dashboard
/restaurant/restaurant-management/pos-sales        reuses /restaurant/pos/new
/restaurant/restaurant-management/digital-ordering reuses /restaurant/waiter
/restaurant/restaurant-management/tables           reuses /restaurant/tables
/restaurant/restaurant-management/orders           reuses /restaurant/orders
/restaurant/restaurant-management/kitchen          reuses /restaurant/kitchen
/restaurant/restaurant-management/menu             reuses /restaurant/menu
/restaurant/restaurant-management/recipe-cost      reuses the menu screen's recipe/cost surface
/restaurant/restaurant-management/inventory        reuses /restaurant/inventory
/restaurant/restaurant-management/payments         reuses the POS payment/cashier-shift surface
/restaurant/restaurant-management/staff            reuses /restaurant/staff
/restaurant/restaurant-management/reports          reuses /restaurant/reports
/restaurant/restaurant-management/setup            reuses /restaurant/configuration
```

`/restaurant/restaurant-management` stays the launcher.

## How reuse works

Several current screens keep their whole page body inside the route file (dashboard 523 lines, menu 647, orders 516, inventory 639, POS 420, tables 375, waiter 322, kitchen 138). To avoid a second copy of that logic, each body moves once into a shared workspace component under `src/components/workspaces/restaurant/` — the same pattern already used for PMS in `src/components/workspaces/`. Both the legacy route and the canonical route then become thin wrappers around the same component, so the logic exists exactly once. Screens that already use a shared workspace (`staff`, `reports`, `configuration`) need no extraction — the canonical route simply renders the existing workspace component.

Nothing inside the extracted bodies changes: same queries, same server functions, same mutations, same components, same permissions.

## Shell context

`RestaurantShell` gains two optional presentation props mirroring the existing `pms` / `pmsModule` pair: `rm` and `rmModule`. They drive the breadcrumb (Property Home → Restaurant Management → submodule), the "Restaurant Management · [Submodule]" heading, and the back link to `/restaurant/restaurant-management`. No second shell, no sidebar restructuring (that is 8F4). Legacy routes keep their current shell props, so their appearance is unchanged.

## Registry

`src/lib/restaurant-management-modules.ts` becomes the single source of truth for the canonical family:

- `canonicalRoute` becomes the address the launcher links to (renaming `pos` → `pos-sales` and `recipes` → `recipe-cost` to match this phase's targets).
- `legacyRoutes: string[]` replaces `currentRoute` / `currentSearch` as documentation of what each canonical route reuses.
- `key`, `title`, `group`, `moduleKey`, `implementationStatus`, `transitional` and `sharedDependencies` stay as they are.

The launcher route renders `canonicalRoute` for every core module. Future-capability cards that point at an existing screen keep their existing links.

## Guards and permissions

Every canonical route's `beforeLoad` does the existing sign-in check then `await requireRoutePackage("restaurant_management")` — the same 8D1 guard, no new entitlement logic. Package off or expired sends the person to Property Home with the existing notice. Role and module-access checks inside each screen and each server function are untouched, so a person without Inventory permission still cannot use the Inventory page.

## Submodule decisions

- **POS & Sales**: the current Restaurant Management POS (restaurant menu, restaurant orders, restaurant kitchen flow). Not the future standalone POS package.
- **Payments & Cashiering**: the restaurant-side payment and cashier-shift surface already inside POS, presented under its own address, status `foundation`. PMS Cashiering (guest folios, hotel payments) stays entirely separate.
- **Digital Ordering**: the authenticated waiter/QR management screen. The public `/r/*` guest flow is untouched and never duplicated.
- **Recipe & Cost**: the existing recipe/cost functionality tied to the menu screen, opened directly with its recipe focus, status `partial`.
- **Inventory, Staff, Reports, Setup**: the current shared implementations, marked transitional. Reports show restaurant reporting only; Setup shows the restaurant-relevant configuration and does not duplicate PMS Property Setup.

## Detail routes left as they are

`/restaurant/orders/$orderId`, `/restaurant/inventory/purchasing/$purchaseOrderId`, staff detail flows and existing configuration detail screens stay at their current addresses. Canonical pages link into them. These are documented in the report as remaining legacy implementation routes.

## Out of scope

Sidebar cleanup, legacy redirects, folder reorganisation, component moves beyond the extraction described above, standalone POS split, HR split, Inventory split, Back Office, dead-code removal. No database, RLS, RPC or server-logic changes.

## Verification

Typecheck, production build, and a signed-in browser pass over all fourteen canonical addresses plus the legacy list (`/restaurant/dashboard`, `/orders`, `/kitchen`, `/menu`, `/tables`, `/waiter`, `/pos/new`, `/inventory`, `/staff`, `/reports`), checking correct context headers, working launcher links, package-off behaviour, untouched PMS and public pages, and a clean console. A 21-point implementation report closes the phase.
