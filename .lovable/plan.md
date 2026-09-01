# Phase 6A Update — NORU Property Home Architecture

UI and navigation only. No schema, RLS, permission, or business-logic changes.

## Property Home cards (8)

| Card | Status | Opens |
| --- | --- | --- |
| Restaurant Management | Active | `/restaurant/dashboard` |
| Rooms & Front Office | Coming soon | info modal only |
| Booking & Guest Management | Coming soon | info modal only |
| Stock & Procurement | Active | `/restaurant/inventory?tab=overview` |
| Staff Management | Active | `/restaurant/staff` |
| Accounting & Finance | Coming soon | info modal only |
| Reports & Analytics | Coming soon | info modal only |
| Property Settings & Integrations | Active | `/restaurant/settings` |

Order follows the requested grouping (3 / 3 / 2 on desktop), collapsing to a single column on mobile with large touch targets. Coming-soon cards keep a "Coming soon" badge, stay visible, and open a small dialog describing the planned scope — they never navigate.

Header becomes "NORU · [property name]" with the subtitle "Manage every part of your hospitality operation from one place."

## Summary strip

Keeps the existing three metrics (Today's restaurant order value, Active restaurant orders, Low stock items) and adds **Staff on shift**, computed from today's shifts via the existing `listShifts` function for owner/manager only; other roles see a dash. No hotel metrics.

## Sidebars

- Restaurant Management: unchanged (Dashboard, Menu, Kitchen, Orders, Tables & QR, Take Order).
- Stock module renamed **Stock & Procurement**; same entries (Overview, Ingredients, Consumables, Operating Assets, Equipment, Suppliers, Purchasing). Recipes and Waste & Loss are not added as nav items in this phase — recipes live inside the Menu module and waste/loss is part of the Overview report; adding links would point at screens that do not exist.
- Staff Management: unchanged (Staff, Schedule, Attendance, Reports).
- Settings label on Property Home becomes "Property Settings & Integrations"; route stays `/restaurant/settings`.

## Role visibility

Reuses current role gating: owner/manager see all 8 cards; kitchen sees Restaurant Management and Stock & Procurement (plus coming-soon cards); waiter sees Restaurant Management only. Backend permissions untouched.

## Technical notes

- `src/routes/restaurant/home.tsx`: replace the module arrays with the 8-card definition, add the coming-soon dialog (existing shadcn `Dialog`), add the staff-on-shift summary card, update header/subtitle and grid layout.
- `src/components/restaurant-shell.tsx`: rename the `stock` module title to "Stock & Procurement" and the settings title to "Property Settings & Integrations". No structural change.
- Icons from `lucide-react` already in use: UtensilsCrossed, BedDouble, CalendarCheck, Boxes, Users, Wallet, BarChart3, Settings.
- Verify build and typecheck, and check the page at desktop and mobile widths in the preview.

## Out of scope

Rooms, Booking, Accounting, Reports functionality; customer/QR routes; kitchen, orders, inventory, recipes, workforce, admin logic; database and RLS.
