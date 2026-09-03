# Phase 7B — Property Home Tile Redesign + Module Reorganization

Navigation, labelling and presentation only. No schema, RLS, server-authorization, or business-logic changes. No new backend functions. No POS.

## 1. Property Home (`/restaurant/home`)

Keeps the NORU mark, property name, the "unified hospitality workspace" subtitle and the existing summary strip, then renders large rectangular module tiles (icon, module name, one-line subtitle, clear hover/focus/active state).

Grid: 1 column on small phones, 2 on larger phones/tablet, 3 on laptop, 4 on wide desktop. Flat NORU brand surfaces (card + subtle brand-tinted icon plate), no gradients/glass/heavy shadows.

Tile order and status:

| # | Tile | Status | Opens |
| --- | --- | --- | --- |
| 1 | Food & Beverage | Active | `/restaurant/dashboard` |
| 2 | Front Office | Active | `/restaurant/rooms?tab=dashboard` |
| 3 | Housekeeping | Active | `/restaurant/housekeeping?tab=dashboard` |
| 4 | POS | Coming soon | existing Coming Soon dialog |
| 5 | Inventory | Active | `/restaurant/inventory?tab=overview` |
| 6 | Procurement | Active | `/restaurant/inventory?tab=suppliers` |
| 7 | Human Resources | Active | `/restaurant/staff?tab=schedule` |
| 8 | Accounting & Finance | Active | `/restaurant/cashiering?tab=dashboard` |
| 9 | Reports & Analytics | Active | `/restaurant/reports` (new) |
| 10 | Configuration | Active | `/restaurant/configuration` (new) |
| 11 | Property Settings & Integrations | Active | `/restaurant/settings` |

Role visibility follows exactly today's rules (hotel/finance/config tiles owner+manager, Inventory adds kitchen, F&B for all, HR as today). No permission widening.

Summary strip: keeps Today's F&B order value, Active orders, Staff on shift, Low stock, and adds Occupancy and In-house from the existing front-office dashboard function (owner/manager only, dash for others). No new analytics functions.

## 2. Module sidebars

`RestaurantShell` gains an optional explicit `module` prop so a screen can live in a module different from its label default (Menu, Tables, Room Types/Rooms, Rates, Distribution). Nav definitions are edited in place; the shell component itself is not duplicated.

- Food & Beverage: Dashboard, Kitchen, Orders, Take Order (Menu and Tables & QR removed here).
- Front Office: Dashboard, Arrivals, In-House, Departures, Reservations, New Reservation, Guests. (Room Types/Rooms/Rates/Distribution removed; the single "Bookings" + "Reservations" duplication collapses to one Reservations entry pointing at the existing reservations list.)
- Housekeeping: unchanged (Dashboard, Room Rack, Cleaning Board, Inspections, Discrepancies, Room Restrictions, Maintenance, History). No Assignments entry — no such screen exists and creating one is out of scope.
- Inventory: Dashboard, Ingredients, Consumables, Operating Assets, Equipment.
- Procurement: Suppliers, Purchasing (existing inventory tabs, presented under the Procurement module title). No new procurement dashboard.
- Human Resources: Staff, Schedule, Attendance, Reports.
- Accounting & Finance: Dashboard, Folios, Payments, Cashier Shifts, Night Audit (unchanged).
- Reports & Analytics: Overview.
- Configuration: grouped nav — Food & Beverage (Menu, Tables & QR); Rooms (Room Types, Rooms); Rates & Revenue (Rate Plans, Rate Calendar, Restrictions); Distribution. Amenities stays inside room-type editing; no fake page.
- Property Settings & Integrations: unchanged.

Every module keeps "← NORU Home", the module title in sidebar and header, and only its own links.

## 3. New routes (only two)

- `/restaurant/reports` — Reports & Analytics overview reusing the existing `getRevenueOverview` (Occupancy, ADR, RevPAR, Room revenue, rooms sold/available) with a date range, plus link cards into existing report screens (Inventory overview, HR reports, Cashiering dashboard, F&B dashboard). No new backend.
- `/restaurant/configuration` — landing screen listing the configuration areas as links to existing routes.

All existing URLs stay exactly as they are; nothing is renamed or removed, so bookmarks and deep links keep working. The Rates page keeps its Overview tab; Reports & Analytics reads the same function rather than duplicating any calculation.

## 4. Technical notes

- `src/components/restaurant-shell.tsx`: add `procurement`, `reports`, `configuration` workspaces; retitle `restaurant`→Food & Beverage, `rooms`→Front Office, `stock`→Inventory, `staff`→Human Resources; add sectioned nav support (optional `section` on nav entries) for Configuration; add the optional `module` prop.
- Pages that change module ownership pass `module="configuration"`: `menu.tsx`, `tables.tsx`, `rooms/index.tsx` (when opened with `tab=room-types|rooms`), `bookings/rates.tsx`, `bookings/distribution.tsx`. Inventory pages pass `module="procurement"` when the tab is suppliers/purchasing.
- `src/routes/restaurant/home.tsx`: new tile grid, tile definitions, POS coming-soon entry, extended summary strip.
- Icons from `lucide-react` only; colours via existing NORU semantic tokens.
- `head()` metadata for the two new routes.
- Verify: typecheck, build, owner/manager walkthrough of every module in the preview at desktop and mobile widths, console clean.

## Out of scope

POS functionality, Phase 7C roles, schema/RLS/authorization, reservation availability, rate pricing, folio ledger, night audit, charge-to-room, housekeeping workflows, inventory ledger, workforce logic, customer QR and public stay routes, Platform Admin.
