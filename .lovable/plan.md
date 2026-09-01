# Phase 6A — NORU Property Home + Module Navigation

Navigation and presentation only. No schema changes, no business-logic changes.

## What the user gets

A new landing screen after signing in: **NORU Property Home** at `/restaurant/home`. It shows the NORU mark, the property name, the signed-in user and role, a light summary strip, and large workspace cards:

| Card | Status | Opens |
| --- | --- | --- |
| Restaurant Management | Active | `/restaurant/dashboard` |
| Stock Management | Active | `/restaurant/inventory` |
| Staff Management | Active | `/restaurant/staff` |
| Settings | Active | `/restaurant/settings` |
| Rooms Management | Coming soon | non-interactive |
| Booking Management | Coming soon | non-interactive |
| Accounting & Finance | Coming soon | non-interactive |

Coming-soon cards are styled as intentional, disabled cards with a subtle "Coming soon" label — they never navigate.

Summary strip (reusing existing data only): Today's Order Value, Active Orders, and Low Stock Items (owner/manager only, from the existing inventory dashboard function). Staff On Shift is omitted — there is no cheap existing aggregate for it.

## Module workspaces

The existing sidebar becomes module-scoped. Each active workspace shows `← NORU Home` at the top, then the module name, then only its own links:

- Restaurant Management: Dashboard, Menu, Kitchen, Orders, Tables & QR, Take Order
- Stock Management: Overview, Ingredients, Consumables, Operating Assets, Equipment, Suppliers, Purchasing (each links to the existing inventory page with the matching tab preselected)
- Staff Management: Staff, Schedule, Attendance, Reports (each links to the existing staff page with the matching tab preselected)
- Settings stays a single page at `/restaurant/settings`, reachable from Property Home and each module header.

The header keeps the property name and adds the current module name next to it, plus the existing user/role and logout controls.

## Role-aware visibility

Card and nav visibility follows the roles already enforced server-side:

- Owner / Manager: Restaurant, Stock, Staff, Settings + coming-soon cards
- Kitchen: Restaurant, Stock
- Waiter: Restaurant only (Take Order / operational entries as today)

No new permissions are granted; the backend stays authoritative and unchanged.

## Technical notes

- New route `src/routes/restaurant/home.tsx` rendering inside the existing `RestaurantShell` (a new `"Home"` nav label with no sidebar module).
- `src/components/restaurant-shell.tsx`: replace the single flat `NAV` array with three module nav definitions plus a `module` prop (`"restaurant" | "stock" | "staff" | "home"`). Each page passes its module; the shell renders the matching links, the back-to-home link, and the module name in the header. Sign-out, membership query, settings provider, mobile drawer behaviour all unchanged.
- Tab deep-linking: `/restaurant/inventory` and `/restaurant/staff` get a validated optional `tab` search param that seeds the existing `useState` tab value. Defaults preserved, so bare URLs behave exactly as today.
- Post-login redirect: `src/routes/restaurant/login.tsx` and `src/routes/restaurant/register.tsx` default to `/restaurant/home`; an explicit `?redirect=` destination still wins. All existing deep links (`/restaurant/orders`, `/restaurant/inventory`, `/restaurant/staff`, …) keep working untouched.
- Icons from `lucide-react` only (UtensilsCrossed, BedDouble, CalendarCheck, Boxes, Users, Wallet, Settings). Colours via existing NORU semantic tokens — no hardcoded hex.
- `head()` metadata added for the new route.

## Out of scope

Rooms, Booking, Accounting functionality; any database, RLS, ordering, kitchen, inventory, recipe, procurement, workforce or admin logic changes; customer/QR routes.
