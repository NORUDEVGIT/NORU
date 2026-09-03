# Phase 7C — Hotel staff roles + module access control

Adds hotel job roles, a single server-side module-access resolver, per-staff module overrides, and role-aware navigation. No new auth system, no RBAC engine, no changes to business logic.

## 1. Roles

Keep: owner, manager, kitchen, waiter. Add: receptionist, housekeeper, housekeeping_supervisor, cashier, storekeeper, accountant, maintenance.

`restaurant_users.role` is a CHECK constraint (`owner, manager, kitchen, waiter, housekeeping`). It is widened additively; the existing `housekeeping` value (1 live membership) stays valid and is treated as housekeeping_supervisor everywhere, so no membership is touched or migrated.

## 2. Module keys

food_and_beverage, front_office, housekeeping, pos, inventory, procurement, human_resources, accounting_finance, reports_analytics, configuration, property_settings. POS stays "Coming soon" and is visible to owner/manager only.

## 3. Default access matrix

| Role | Modules |
|---|---|
| owner | all available |
| manager | all available |
| receptionist | front_office |
| housekeeper | housekeeping (own-task scope) |
| housekeeping_supervisor | housekeeping (full) |
| cashier | accounting_finance |
| accountant | accounting_finance, reports_analytics |
| storekeeper | inventory, procurement |
| maintenance | housekeeping (maintenance scope only) |
| kitchen | food_and_beverage, inventory (unchanged) |
| waiter | food_and_beverage (unchanged) |

Everyone keeps property_settings/home as today for owner/manager only where that is already the case.

## 4. Per-staff overrides

New tenant-scoped table `staff_module_access` (restaurant_id, membership_id, module_key, enabled, created_by_membership_id, timestamps; unique on restaurant_id+membership_id+module_key). RLS: owner/manager of the same restaurant may read/write; staff may read only their own rows. Overrides control module ENTRY only.

## 5. Resolver

One helper `resolveModuleAccess(membership)` / `canAccessModule(membership, moduleKey)` in a server module, layered on the existing `callerMembership` pattern: authenticated user → active membership in that restaurant → role defaults → override rows → module availability. Used by Property Home tiles, the sidebar, module route guards, and each module's existing access server function (`getRoomsAccess`, housekeeping/cashiering/inventory guards) so there is a single source of truth.

Action-level authorization stays separate: existing role checks in reservations, housekeeping, cashiering, night audit, rates, inventory and configuration functions gain the new roles only where the matrix allows, expressed as small central `require*Access()` helpers rather than scattered string comparisons.

## 6. Action scopes (server-enforced)

- Receptionist: full Front Office + guest + reservation operations (create/amend/cancel, assign room, check-in/out, room move, walk-in, no-show). Denied: room/room-type config, rate writes, distribution, inventory, night audit close, financial corrections.
- Housekeeper: dashboard, room rack, own tasks (start/complete), create discrepancy, create maintenance request. Denied: assign/reassign, other people's tasks, inspections, discrepancy resolution, OOO/OOS/release, guest PII.
- Housekeeping supervisor: full housekeeping including assignments, inspections, discrepancy resolution, restrictions, history.
- Maintenance: maintenance requests only (view, start, resolve, notes) plus optional read-only room rack; payload limited to room number, category, priority, description, status.
- Cashier: folio lookup, receive payment, deposits, print statements, own shift open/close. Denied: room-charge reversal, refunds/discounts/adjustments, night audit close.
- Accountant: read-only accounting + night audit history + reports/analytics. Corrections stay owner/manager.
- Storekeeper: inventory stock views/movements/receiving, suppliers, purchase orders, goods receiving. No menu/recipe/guest/cashiering access. Kitchen inventory rights unchanged.

## 7. Housekeeping assignment eligibility

Assignment pickers and the server-side validation for task assignment accept only housekeeper, housekeeping_supervisor, legacy housekeeping, owner, manager. Other roles are rejected server-side, not just hidden.

## 8. UI

- Property Home: tiles filtered by the resolver; inaccessible modules are absent (no locked/disabled state).
- `RestaurantShell` sidebars: entries gain module + role scoping so each role sees only openable links (receptionist Front Office set, housekeeper reduced set, supervisor full set, cashier accounting set, accountant read set, maintenance single entry).
- Module Access UI: added to Human Resources → Staff → staff detail (reuses the existing staff table/dialog components). Shows role, default access, and a toggle per module marked "Default" or "Custom". Owner/manager only; self-editing and cross-property edits blocked server-side; changes written to the existing staff audit log.
- Staff create/edit role selector gains the new roles; onboarding, temporary password, last-owner protection and audit behaviour unchanged.

## 9. Route protection

Module routes call the resolver in their guard/access query and render a denial state, so direct URLs (housekeeper → /restaurant/cashiering, cashier → /restaurant/bookings/rates, storekeeper → /restaurant/guests, receptionist → /restaurant/inventory, maintenance → /restaurant/cashiering) are denied regardless of hidden tiles.

## 10. RLS

Migration adds `staff_module_access` with GRANTs and role-scoped policies, widens the role CHECK, and extends only the housekeeping/cashiering/front-office policies that currently name owner/manager where the new roles legitimately need row access. No broad "any member can write" policy is introduced.

## 11. Testing (The Garden only)

Temporary memberships for each new role, verified through the browser: allowed modules visible, allowed workflows working, denied direct URLs blocked, override ON/OFF for receptionist + Reports (tile appears/disappears, route opens/denies, still cannot edit rates or close night audit), owner/manager/kitchen/waiter behaviour unchanged, no cross-tenant access, build and typecheck clean. Test users removed afterwards.

## Technical notes

- One migration: role CHECK widening, `staff_module_access` (+GRANTs, RLS, policies), targeted policy updates. Additive only.
- New `src/lib/module-access.server.ts` (matrix + resolver) and `module-access.functions.ts` (read own access, read/write staff overrides).
- Touched: `restaurant-shell.tsx`, `routes/restaurant/home.tsx`, staff page/dialogs, and the access guards inside rooms/housekeeping/cashiering/inventory/reports/configuration server functions and routes.
- Out of scope: POS, payroll/leave, public stay booking, QR ordering, order/pricing, charge-to-room, availability, rate pricing, folio ledger, night audit close transaction, inventory ledger, platform admin.
