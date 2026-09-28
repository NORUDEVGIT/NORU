# NORU PMS — Package Isolation Implementation Plan

| Field | Value |
|---|---|
| **STATUS** | **IN EFFECT** — Phase 0 contract plus Phases 1–9 in the working tree |
| **Basis** | Package Isolation Foundation Audit (2026-09-28), verdict **PARTIAL ISOLATION — ACTIONABLE GAPS** |
| **Date** | 2026-09-28 |
| **Canonical entry** | `/restaurant/pms` |
| **Settings URL** | `/restaurant/settings` (unchanged) |

This document is the engineering contract for making PMS independently navigable under `/restaurant/pms` with exactly ten modules. It does not authorise deleting shared platform code, renaming create-reservation, or moving master data out of Settings.

---

## 1. Locked module bar

Source of truth: `src/packages/pms/lib/pms-module-nav.ts` (`PMS_MODULE_NAV`).

| # | Label | Route | Catalogue key |
|---|---|---|---|
| 1 | Front Office | `/restaurant/pms/front-office` | `front-office` |
| 2 | Reservations | `/restaurant/pms/reservations` | `reservations` |
| 3 | Guest Profile | `/restaurant/pms/guests` | `guest-profile` |
| 4 | Rooms & Inventory | `/restaurant/pms/room-inventory` | `room-inventory` |
| 5 | Housekeeping | `/restaurant/pms/housekeeping` | `housekeeping` |
| 6 | Cashiering | `/restaurant/pms/cashiering` | `cashiering` |
| 7 | Rate & Revenue | `/restaurant/pms/rates-revenue` | `rates-revenue` |
| 8 | Night Audit | `/restaurant/pms/night-audit` | `night-audit` |
| 9 | Reports | `/restaurant/pms/reports` | `reports` |
| 10 | Settings | `/restaurant/settings` | `property-setup` |

Not on the bar: F&B, Dashboard, Maintenance, Distribution, Administration, Integrations, Guest Services, Sales & Events, Notifications, Security & Audit.

Maintenance remains a Housekeeping area at `/restaurant/pms/maintenance`.

---

## 2. Non-nav routes that stay

`PMS_NON_NAV_ROUTES` stays addressable. PMS Home does not list them:

- PMS Home `/restaurant/pms`
- Reservation detail, guest detail, folio detail
- `/restaurant/bookings/new` (create reservation — do not drop)
- `/restaurant/pms/distribution`, `/restaurant/pms/administration`
- Placeholder routes (guest-services, sales-events, notifications, security-audit) stay routed. They are not on PMS Home.
- Legacy redirects already in place (cashiering, guests, housekeeping, rooms arrivals/in-house/departures, bookings reservations/rates/distribution/$id, property-setup, integrations, reservations/guests/$guestId)

Compatibility redirects added with this plan:

- `/restaurant/pms/dashboard` → `/restaurant/pms/room-inventory` (tab preserved)
- `/restaurant/rooms` → `/restaurant/pms/room-inventory` (tab preserved)
- `/restaurant/bookings` → `/restaurant/pms/reservations`

---

## 3. Phase 0 — Nav contract

- One exported list. Chromes, the package rail, and PMS Home read it.
- No route renames in this phase beyond the compatibility redirects in section 2.
- No deletes in this phase.
- Tests that pin the ten labels live in `pms-module-nav.test.ts`.

Non-goals: hook moves, entitlement map rewrites, and deletion are later phases. They are included below because this working tree applies them after the contract exists.

---

## 4. Phase 1 — One chrome

`RoomInventoryChrome` renders `PMS_MODULE_NAV`. F&B is not a module-bar item. Package entry to Restaurant Management stays on Property Home.

`RateRevenueChrome` and `SettingsDashboardChrome` use the same list. Settings active state is the gold underline used by the other desks.

Reservation detail suppresses the restaurant rail and top header and mounts the shared chrome.

---

## 5. Phases 2–4 — Guest Profile, Rate & Revenue, Settings

- Guest Profile routes set `hidePackageRail` and `hideTopHeader` and mount `GuestProfileChrome` → `RoomInventoryChrome`. In-module section tabs stay. Guest links from reservation detail, arrivals, and reservation control use `/restaurant/pms/guests/$guestId`. The old path remains a redirect.
- Rate & Revenue keeps its desk and server logic. Its private `NAV_ITEMS` array is gone.
- Settings hub keeps `PmsSet1Hub`, card hashes, and `/restaurant/settings`. `CARD1_PMS_NAV` stays as the historical card-1 constant and is not the hub bar. Do not restore a second property-setup editor.

---

## 6. Phase 5 — Launcher and rail

`pmsLauncherModules("primary")` is the ten catalogue keys, in bar order. The shell rail shows only those.

`pmsLauncherModules()` is the ten catalogue keys, in bar order. The shell rail and PMS Home show only those. Distribution, Administration, and the placeholders stay on their own routes and are not home cards.

Dashboard, Maintenance, and Integrations are not launcher tiles.

---

## 7. Phase 6 — Compatibility

Redirects in section 2. `/restaurant/bookings/new` is unchanged.

---

## 8. Phase 7 — Break package import cycles

- `useMoney`, `useRestaurantTimezone`, `useRestaurantTime`, and `RestaurantSettingsProvider` live in `src/core/state/property-format.tsx`. Restaurant Management re-exports them. PMS components import the core module.
- `canManageCashiering` lives in `src/core/lib/cashiering-roles.ts`. PMS cashiering re-exports it. Restaurant Management imports the core helper.
- `getFrontOfficeDashboard` lives in `src/integrations/cross-package/front-office-dashboard.functions.ts`. Back Office imports that file. PMS re-exports it for existing callers.

Room charge, folio deep links, and Back Office finance reads of folio tables stay. They are required integrations.

---

## 9. Phase 8 — Entitlements

PMS desks call `requireRoutePackage("pms")` only. Settings switches on `packages.has("pms")` and does not require Back Office, Restaurant Management, or POS.

`accounting_finance` and `reports_analytics` remain shared module-access keys. Turning Back Office off does not remove those keys from the PMS package map and does not add a foreign package gate. Role defaults are unchanged: a receptionist still does not receive Cashiering by this work.

---

## 10. Phase 9 — Dead UI

Removed only after an import and route scan:

- `src/packages/pms/components/workspaces/pms-property-setup-workspace.tsx` (unmounted; the “do not restore a second editor” warning now lives on `PmsSet1Hub`)
- `src/packages/pms/components/settings/pms-property-setup-workspace.tsx` (no imports)
- `src/packages/pms/components/workspaces/pms-integrations-workspace.tsx` (integrations route redirects; tests assert the route does not mount it)

Kept: placeholder routes, legacy redirect files, `RateRevenueChrome` (thin wrapper), `FO_ESCAPE_MODULES` (tests still read it; nothing renders it).

---

## 11. Shared code that stays put

Auth, membership, package entitlements, module access, `RestaurantShell`, UI primitives, property time formatters, audit logging, payment integrations, notifications, public stay chrome, and `src/integrations/cross-package/room-charge.functions.ts`.

---

## 12. Tests to keep green

- `pms-module-nav.test.ts` — ten labels, no F&B, no foreign package gate
- Existing shell tests that still expect `FO_NAV_ITEMS` (in-desk Front Office tabs, not the module bar)
- `card1PmsNavIsUnchanged` — historical seven-item `CARD1_PMS_NAV` constant
- Guest listing tests that expect `sidebarDefaultCollapsed` on guest routes
- Create-reservation tests that expect `/restaurant/bookings/new` and that the bookings index does not collapse the sidebar itself
- Housekeeping tests that expect `/restaurant/pms/maintenance` and that it is not a separate workspace product
