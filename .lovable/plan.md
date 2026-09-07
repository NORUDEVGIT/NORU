# Phase 8C — Property Home + navigation gating by package

Presentation only. No route blocking, no server enforcement, no RLS or schema change, no module-key or folder changes.

## One shared package source

Add a small client hook (`src/lib/use-package-entitlements.ts`) that calls the existing `getMyPackageEntitlements` server function through TanStack Query with a single shared key (`["my-packages", restaurantId]`). Every gated surface reads that hook — no component queries entitlements on its own, and nothing hardcodes a package state. Absent row = enabled (compatibility), disabled or expired = hidden.

## Property Home becomes a package launcher

`/restaurant/home` keeps the NORU header and the "today at a glance" strip (those are Core, always shown) and replaces the flat module grid with an **Available packages** section:

| Package | Shown when | Opens |
| --- | --- | --- |
| Restaurant Management | entitlement enabled AND user has F&B module access | `/restaurant/dashboard` |
| PMS | entitlement enabled AND user has any PMS-side module access | `/restaurant/pms` |
| Standalone POS | never in this phase (see below) | — |
| Back Office | entitlement enabled AND user has at least one of inventory / procurement / HR / finance / reports access | a plain "Back Office — foundation" grouping listing only those shared screens the user can already reach today |

Tiles render in a grid that collapses cleanly, so a property with one package shows one tile without empty gaps. Below the packages, a small "Property setup" row keeps the Core links (Settings, Configuration, Reports) exactly as today, gated by existing module access only — Core is never hidden by a package.

No expiry dates, sources, or subscription metadata are shown to tenant users.

### Standalone POS decision

Today's POS is restaurant-bound, so a "Standalone POS" tile would be a lie. Option B: no standalone POS tile in this phase, and the existing POS stays where it is inside Restaurant Management navigation. Reported as deferred.

### Back Office decision

Minimal and truthful: the tile is labelled "Back Office — Foundation / in development" and links only to shared screens that already exist and the user already has access to (Inventory, Procurement, Human Resources, Accounting & Finance, Reports). Nothing is moved, renamed, or invented. If Back Office is disabled, the tile and those grouped links disappear from Property Home; the underlying screens remain reachable by URL (that is Phase 8D).

## Navigation gating

In `src/components/restaurant-shell.tsx`, gate only package-level entry points:

- "PMS Home" back-link and the PMS sidebar group appear only when PMS is enabled.
- The Restaurant Management nav group is hidden when that package is disabled.
- No standalone POS nav entry is added.
- Back Office-owned entry points on Property Home hide when Back Office is disabled.

Inside a package, existing `getMyModuleAccess` filtering stays exactly as it is. Package entitlement sits above module access: a link shows only when the package is enabled AND existing module access already permits the destination. No staff permission is widened.

## Cross-package links

`src/components/pms/shared-module-links.tsx` keeps its module-access filter and adds a package filter: Inventory, Procurement, HR, Accounting and Reports links hide when Back Office is disabled; restaurant-owned links hide when Restaurant Management is disabled.

## Testing

Typecheck, production build, then an authenticated browser pass with entitlements toggled through the Platform Admin panel: no explicit rows (compatibility — everything looks as before), PMS off, Restaurant Management off, POS off, Back Office off, and the two mixed combinations (PMS on / RM off, RM on / PMS off). Also verify public QR ordering and public booking are untouched and the console is clean. Entitlements are restored to their original state afterwards.

## Files expected to change

- `src/lib/use-package-entitlements.ts` (new)
- `src/routes/restaurant/home.tsx`
- `src/components/restaurant-shell.tsx`
- `src/components/pms/shared-module-links.tsx`

## Explicitly out of scope

Direct-route blocking, `requirePropertyPackage` in business server functions, RLS package predicates, POS/HR/Inventory splits, Back Office construction, route or folder moves, legacy route removal. Package presentation gating will be active; direct-route and server enforcement remain deferred to Phase 8D/8E.
