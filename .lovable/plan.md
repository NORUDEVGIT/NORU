# Phase 7D.2D — PMS navigation and module ownership cleanup

Make the whole app read as one architecture: Property Home is the launcher, PMS is the hotel system, and everything inside a PMS address is presented as PMS-owned. Presentation only — no business logic, permissions, or database changes.

## What changes for the user

- Inside any PMS page, the sidebar becomes a PMS sidebar: "NORU Home" and "PMS Home" at the top, then the hotel submodules grouped exactly as on the PMS launcher (Core hotel operations, Guest & commercial, Management & intelligence, System management, Support/communication/control). No Food & Beverage, Inventory, or HR entries mixed in.
- Every PMS page shows the same breadcrumb: Property Home → PMS → [module name].
- Page headings match the PMS names: Front Office, Cashiering, Housekeeping, Room & Inventory, Rate & Revenue Management, Night Audit, Property Setup, Administration, Integrations, Maintenance / Engineering, Dashboard, Reports & Analytics.
- Stale labels disappear on PMS pages: "Rooms Dashboard", "Configuration", "Human Resources", "Rooms & Front Office", "Housekeeping · Maintenance", "Accounting & Finance" over Cashiering.
- Cashiering, Maintenance, Administration and Integrations feel owned by PMS; Accounting & Finance, Human Resources and Inventory / Warehouse stay separate top-level domains reachable from Property Home.
- Room & Inventory is clearly hotel rooms (room types, rooms, availability, out of order / out of service); Inventory / Warehouse stays the property-wide stock module.
- Old addresses keep working exactly as today.

## Technical approach

1. **`src/lib/pms-modules.ts`** — keep it the single registry. Add a `PMS_NAV` derivation (grouped modules in the approved order) and a lookup by module key so the shell and the launcher share one source of names, groups and canonical routes. No permission-key changes.

2. **`src/components/restaurant-shell.tsx`** — add an optional `pmsModule` prop (a PMS module key). When present:
   - sidebar renders the grouped PMS_NAV (filtered by the existing module-access filter, unchanged logic), links to `canonicalRoute`, active item = current PMS module;
   - back-links row shows "PMS Home" and "Property Home";
   - header context line shows `PMS · <module title>`.
   The existing `module`/`pms` props and all non-PMS behaviour stay untouched; no second shell.

3. **Breadcrumb** — a small shared breadcrumb strip (Property Home → PMS → module) rendered by the shell when `pmsModule` is set, matching the one already used in `pms-placeholder.tsx`.

4. **Workspace headings** — add an optional `heading` (and optional subtitle) prop to the reused workspace components (`rooms`, `cashiering`, `housekeeping`, `staff`, `settings`, `configuration`, `rates`, `reports`, `arrivals`, `reservations`, `distribution`, `night-audit`). Default keeps today's text for legacy routes; the canonical PMS route passes the PMS name. No logic or data changes inside the workspaces.

5. **Canonical routes (`src/routes/restaurant/pms/*`)** — each passes `pmsModule="<key>"` to the shell and the PMS heading to its workspace; placeholders switch to the same shell wiring so all 18 look identical. Titles in `head()` normalised to the PMS names.

6. **Property Home / stale labels** — sweep for user-visible strings from the old flat architecture and align them with the domain list; internal keys (`front_office`, `housekeeping`, `configuration`, `reports_analytics`, `property_settings`, `accounting_finance`, `human_resources`) untouched.

7. **Cross-module jumps** — where a PMS page already links to a shared module (housekeeping/maintenance → stock, PMS staffing → HR), keep the link but present it as leaving PMS. No new workflows.

## Not in this phase

Legacy routes stay as-is (no removals, no new redirects). No entitlements, no new backends for the planned placeholders, no schema or RLS changes, no role-logic changes.

## Verification

Typecheck, production build, and an authenticated browser pass over all 19 PMS addresses plus the retained legacy routes: correct PMS context and breadcrumbs, PMS Home and Property Home navigation, no duplicate nav sections, no redirect loops, no console errors. Role-specific checks only if existing test accounts are available; no new users created.
