# Phase 7D.2C — Canonical PMS routes + legacy compatibility

Establish `/restaurant/pms/...` as the real address of every hotel workspace, without rebuilding a single feature. Each canonical page renders the existing screen; the old addresses keep working.

## Approach

Today each hotel screen's body lives inside its route file, so it can't be rendered from a second address. For each screen, the page body moves into a small shared component file (no logic change), and both the legacy route and the new canonical route render it. Tabbed screens accept the initial tab as a prop, so the tab state reached today by `?tab=...` is reached by the canonical URL — and `?tab=` still works on both.

Placeholders (Guest Services, Sales & Events, Notifications, Security & Audit) already live at the canonical paths and stay as they are.

## The 18 canonical routes and what each renders

| Canonical route | Renders (existing screen) | Legacy address |
| --- | --- | --- |
| `/restaurant/pms/dashboard` | rooms page, dashboard tab | `/restaurant/rooms?tab=dashboard` |
| `/restaurant/pms/room-inventory` | rooms page, rooms tab (room types + rooms) | `/restaurant/rooms?tab=rooms` |
| `/restaurant/pms/front-office` | arrivals screen (links to in-house/departures unchanged) | `/restaurant/rooms/arrivals` |
| `/restaurant/pms/reservations` | reservations list | `/restaurant/bookings/reservations` |
| `/restaurant/pms/cashiering` | cashiering workspace, dashboard tab | `/restaurant/cashiering?tab=dashboard` |
| `/restaurant/pms/night-audit` | night audit | `/restaurant/cashiering/night-audit` |
| `/restaurant/pms/housekeeping` | housekeeping, dashboard tab | `/restaurant/housekeeping?tab=dashboard` |
| `/restaurant/pms/maintenance` | housekeeping, maintenance tab | `/restaurant/housekeeping?tab=maintenance` |
| `/restaurant/pms/rates-revenue` | rates, plans tab | `/restaurant/bookings/rates?tab=plans` |
| `/restaurant/pms/distribution` | distribution | `/restaurant/bookings/distribution` |
| `/restaurant/pms/reports` | reports & analytics | `/restaurant/reports` |
| `/restaurant/pms/property-setup` | property configuration | `/restaurant/configuration` |
| `/restaurant/pms/administration` | staff / roles / module access, staff tab | `/restaurant/staff?tab=staff` |
| `/restaurant/pms/integrations` | property settings | `/restaurant/settings` |
| `/restaurant/pms/guest-services` | existing placeholder | — |
| `/restaurant/pms/sales-events` | existing placeholder | — |
| `/restaurant/pms/notifications` | existing placeholder | — |
| `/restaurant/pms/security-audit` | existing placeholder | — |

`/restaurant/pms` stays the launcher.

## Redirect vs. retain

Redirect the hotel-only addresses that have no shared use and no tab/deep-link state:
`/restaurant/rooms/arrivals` → front-office, `/restaurant/bookings/reservations` → reservations, `/restaurant/bookings/rates` → rates-revenue, `/restaurant/bookings/distribution` → distribution, `/restaurant/cashiering/night-audit` (index only) → night-audit. Redirects carry any query string through unchanged.

Retain as live implementation routes (linked from the sidebar, tabbed, deep-linked or shared): `/restaurant/rooms`, `/restaurant/housekeeping`, `/restaurant/cashiering`, `/restaurant/configuration`, `/restaurant/settings`, `/restaurant/staff`, `/restaurant/reports`, `/restaurant/rooms/in-house`, `/restaurant/rooms/departures`, night audit run detail, reservation/folio/booking detail pages. Nothing breaks; both addresses show the same screen.

## Registry

`src/lib/pms-modules.ts` becomes the single source of truth: each module gains `key`, `canonicalRoute`, `legacyRoutes`, `implementationStatus` (`existing` / `planned`), keeping its existing `moduleKey` permission key, group, icon and description. PMS Home tiles read `canonicalRoute` only — no tile points at a legacy hotel URL after this phase.

## Permissions and security

No change to permission keys, guards, server authorization or RLS. Every canonical route keeps the same sign-in guard and renders the same component, which runs the same access checks it runs today; server functions and RLS stay authoritative, so knowing a `/restaurant/pms/...` URL grants nothing. Verified by direct-URL checks per route.

## Navigation

Canonical routes use the existing shell with the PMS workspace context so the trail reads Property Home → PMS → <module>, and each page keeps a route back to `/restaurant/pms`. No second shell, no new back buttons where the shell already provides one.

## Out of scope

No database change, no entitlements, no new backends for the planned modules, no move of Food & Beverage, POS, Inventory / Warehouse, Procurement, HR or Accounting under PMS.

## Verification

Typecheck, production build, then a signed-in pass over all 19 PMS addresses plus the retained legacy ones, checking tab state, placeholders, role visibility, blocked direct access, and that Property Home, F&B, POS, Inventory, Procurement, HR and Accounting are untouched. Closing report covers the 17 requested points.
