# Phase 7D.2E — Shared module integration cleanup

Make PMS visibly consume the property-wide services (Inventory / Warehouse, Procurement, Human Resources, Accounting & Finance, Reporting) instead of looking like it owns its own copies. Presentation, labels, cross-links and a small metadata addition only — no schema, permission, or workflow changes.

## What changes for the user

- Room & Inventory (inside PMS) reads unmistakably as hotel rooms — room types, rooms, availability, out of order / out of service — while Inventory / Warehouse stays the property-wide stock and equipment system. Titles, descriptions and short helper lines make the difference explicit on both sides.
- Housekeeping and Maintenance / Engineering each get one clearly worded link, in their page context area only: "Open Inventory / Warehouse" (supplies, linen, amenities, spare parts) and, where purchasing is the point, "Open Procurement". They read as leaving PMS for a shared property system.
- PMS Administration keeps the staff/roles screen it already reuses, but is framed as access, users and permissions, with a single "Open Human Resources" link for scheduling, attendance and workforce operations. The two stay separate ideas.
- Cashiering and Night Audit stay PMS pages, no longer labelled "Accounting & Finance"; each offers one "Open Accounting & Finance" follow-up link for the property-wide finance domain.
- PMS Reports & Analytics is described as hotel reporting (occupancy, revenue, operations) and continues to use the existing shared report screen, with a pointer to property-wide reporting.
- Every cross-domain link is hidden when the current user does not already have access to that module — no new access is granted anywhere.

## Technical approach

1. **`src/lib/pms-modules.ts`** — add two small optional fields per module: `domain: "pms"` and `sharedDependencies: ModuleKey[]` (e.g. housekeeping → `["inventory"]`, maintenance → `["inventory", "procurement"]`, administration → `["human_resources"]`, cashiering / night-audit → `["accounting_finance"]`). No permission keys change; this metadata only drives which cross-links render.

2. **New `src/components/pms/shared-module-links.tsx`** — one presentational strip that takes a list of `ModuleKey`s, filters them through the existing module-access result already available in the shell/workspaces (`getMyModuleAccess` / `allowed`), and renders "Open <Module label>" links to the canonical top-level routes (`/restaurant/inventory`, `/restaurant/inventory?tab=purchasing` or the existing procurement route, `/restaurant/staff`, `/restaurant/cashiering`, `/restaurant/reports`). Nothing renders when the user lacks access.

3. **Placement** — render the strip only in landing/context areas: PMS Housekeeping, Maintenance / Engineering, Administration, Cashiering, Night Audit, Reports, Guest Services placeholder, and the PMS Home launcher footer. Not on every page.

4. **Labels and copy sweep** — `src/components/restaurant-shell.tsx` (`MODULE_TITLE` for the `cashiering` workspace when in PMS context), `src/lib/pms-modules.ts` descriptions, `src/routes/restaurant/home.tsx` tile copy, and the `head()` descriptions of the affected PMS routes. Room & Inventory and Inventory / Warehouse each gain a one-line clarifying description. Internal module keys and table names untouched.

5. **Comments/doc notes** — short header comments in `pms-modules.ts` and the new component stating the one-shared-service rule, so future phases don't fork PMS copies.

## Not in this phase

No new tables, RPCs, requisition or purchase-request flows, no auto-consumption, no payroll or journal posting, no entitlements, no permission or RLS changes, no renames of database objects, no redesign of Inventory, Procurement, HR or Accounting.

## Verification

Typecheck, production build, and an authenticated browser pass over the 19 PMS addresses plus the shared top-level modules: PMS navigation intact, Room & Inventory visually distinct from Inventory / Warehouse, Cashiering still PMS-owned, Accounting & Finance still top-level, Administration and HR distinct, cross-links present only where permitted, no console errors. Role-specific checks only if existing test accounts are available.
