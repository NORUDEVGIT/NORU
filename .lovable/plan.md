# Phase 8G2A — Back Office Reports & Intelligence ownership

Make Back Office the canonical home for property-wide, cross-package reporting,
while Restaurant Management and PMS keep their own operational reports exactly
as they are. Read-only. No database changes.

## Ownership model (locked)

| Area | Canonical route | Scope |
|---|---|---|
| Restaurant Management Reports | `/restaurant/restaurant-management/reports` | Restaurant-only operational reporting |
| PMS Reports | `/restaurant/pms/reports` | Hotel-only operational reporting |
| Back Office Reports & Intelligence | `/restaurant/back-office/reports` | Consolidated, cross-package, executive |

Neither PMS nor Restaurant reporting logic, formulas or screens are touched.

## What gets built

`/restaurant/back-office/reports` stops being a generic foundation page and
becomes a real Back Office reporting landing page with:

1. **Header** — Back Office context, property name, plain statement that
   package-level operational reports stay in their own package.
2. **Source packages row** — a card per source: Restaurant Management, PMS,
   Standalone POS, Shared Services. Each card shows only simple availability
   ("Available" / "Not enabled for this property" / "Planned" for Standalone
   POS) plus a link to that package's report area — shown only when the package
   is enabled AND the person already holds the matching module access. No
   entitlement metadata (dates, sources, billing) is shown.
3. **Report categories** — Executive Overview, Revenue & Sales, Operations,
   Workforce, Inventory & Procurement, Finance, Cross-Package Performance. Each
   category lists what it will consolidate, its source packages, and its current
   state. Categories without real data render a clean foundation state.
4. **Executive Overview** — the only section that shows figures, and only from
   sources that are both enabled and permitted for this person:
   - Restaurant Management: today's order value and active orders, from the
     existing restaurant dashboard query.
   - PMS: occupancy, in-house guests and room revenue, from the existing
     front-office/bookings queries.
   Each figure is labelled with the package it came from. If a source is
   disabled or not permitted, it is not queried and not displayed — no
   placeholder number, no estimate, no total that silently omits a source. A
   combined figure is only shown when every contributing source is present, and
   it is labelled with which packages it covers.

## Access rules

- The route keeps its existing sign-in check plus the `back_office` package
  guard.
- Back Office grants nothing extra: every source figure and every source link
  additionally requires that source package to be enabled and the person's
  existing module access to allow it. Existing server functions already enforce
  their own package and permission checks; this page calls them only when both
  conditions hold, so an unavailable source is never queried.

## Legacy `/restaurant/reports`

Audited: it is a mixed screen — property-wide room revenue plus shortcuts into
F&B, inventory, workforce, finance and housekeeping, and it is also reused by
the Restaurant Management reports route. It stays active and is classified
**shared transitional**, with a documented future redirect candidacy once
ownership cleanup runs. No redirect in this phase.

## Technical notes

- New: `src/components/workspaces/back-office/reports-page.tsx` (the landing
  page body) and a small category/source registry, either in that file or added
  to `src/lib/back-office-modules.ts`.
- Edited: `src/routes/restaurant/back-office/reports.tsx` (render the new body
  instead of the generic foundation), `docs/architecture-ownership.md`.
- No new server functions unless a needed read has no existing function; the
  intent is to reuse `getRestaurantDashboard`, `getFrontOfficeDashboard` /
  `getBookingsDashboard`, `getMyModuleAccess` and the package entitlement hook
  as they are. No forked formulas, no new tables, no SQL views, no RLS change,
  no mutation change.

## Testing

Typecheck, production build, and an authenticated browser pass over the Back
Office reports page under: default packages; Back Office off; Back Office on
with PMS on / off; Back Office on with Restaurant Management on / off. Also
re-check that the PMS and Restaurant report screens are unchanged and that the
console is clean. Any temporary package switch used for testing is removed.

## Report at the end

Files changed, page structure, categories, sources represented, which
consolidated figures are real, which sections are foundation-only, ownership
outcomes for RM/PMS, the `/restaurant/reports` classification, access behaviour,
new server reads (expected none), database changes (expected none), typecheck,
build, smoke-test results, recommended future read models, and what defers to
8G2B.

## Out of scope

Procurement, Inventory, HR ownership, accounting build, payroll, cost control,
Standalone POS split, folder or database cleanup.
