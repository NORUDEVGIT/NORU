# Phase 7D.2F2 — PMS Management & System Module Correction

Presentation-only correction of four PMS submodules so each stays inside its own domain. No database changes, no changes to permissions, server functions or the business logic of the already-passed modules.

## 1. Reports & Analytics (`/restaurant/pms/reports`)

Today this page shows the hotel revenue overview plus shortcut cards to Food & Beverage, Inventory, Human Resources, property-wide Financial and Housekeeping reports. The cross-domain shortcuts get removed.

New structure — five tabbed categories, all built from existing PMS data:

- **Operational** — arrivals, departures, in-house, room readiness and housekeeping task status (front office + housekeeping dashboards already in use).
- **Financial** — folio charges, payments, deposits/refunds and cashier shift totals (cashiering dashboard + ledger). Labelled clearly as PMS-generated finance, not property accounting.
- **Occupancy** — rooms occupied/available and occupancy rate (existing rooms + reservation data).
- **Revenue** — room revenue, ADR, RevPAR (the current revenue overview, moved into this tab).
- **Management** — a summary combining occupancy, revenue and reservation activity (new bookings, cancellations/no-shows), plus recent Night Audit runs.

Where a metric has no existing query, the section shows an honest empty/foundation panel instead of invented numbers. Module-access gating for Reports & Analytics stays exactly as it is.

## 2. Property Setup (`/restaurant/pms/property-setup`)

Currently a link board including F&B Menu, Tables & QR, Rate plans/calendar/restrictions and Distribution. Rebuilt as property configuration only:

- **Property Information** — name, contact, address, logo (the existing property details form, reused).
- **Room Configuration** — links to room types and rooms.
- **Hotel Operational Settings** — timezone, currency (existing fields).
- **Outlets** — foundation panel; no outlet model exists yet and no F&B tables will be duplicated.
- **Policies / Business Rules** — foundation panel.
- **Taxes & Charges** — foundation panel.
- **General PMS Settings** — remaining property-level settings.

Removed from this screen: Menu, Tables & QR, the duplicated Rate & Revenue sections and the duplicated Distribution card. Those modules stay reachable at their own canonical addresses.

## 3. Administration (`/restaurant/pms/administration`)

Currently renders the whole staff workspace, including Schedule, Attendance and workforce Reports — which belong to Human Resources.

Rebuilt as PMS administration only, with these sections:

- **Users** — existing property staff list (read/manage as today), presented as PMS users.
- **Roles** — role assignment using the existing role controls.
- **Permissions** — the existing module-access matrix.
- **Configuration** — links to Property Setup and PMS settings.
- **Master Data** — links to the existing master data owned by PMS (room types, rooms, rate plans); anything not yet modelled shows a foundation panel.

Schedule, attendance and workforce reporting are dropped from the PMS screen and remain in Human Resources, which keeps its existing link from this page. No staff records are duplicated; the existing staff/workforce data stays authoritative.

## 4. Integrations (`/restaurant/pms/integrations`)

Currently the general property settings form. Rebuilt as five integration categories:

- **POS** — PMS ↔ POS connection settings (charge-to-room posting already exists; shown as its live capability). The POS module itself is untouched and stays top-level.
- **Payment Gateways** — configuration category, foundation panel; no fake providers or transactions.
- **Accounting** — outbound PMS financial data (folio revenue, payments, deposits, refunds, night audit totals) for future Accounting & Finance; foundation panel, no second accounting engine.
- **APIs** — foundation panel.
- **Third-Party Systems** — foundation panel.

Property/regional details move out of this page into Property Setup so the two screens stop overlapping.

## Technical notes

- New presentational components under `src/components/workspaces/`: a rewritten `reports-workspace.tsx`, a rewritten `configuration-workspace.tsx` (Property Setup), a new PMS administration workspace, and a rewritten PMS integrations view. The existing non-PMS routes (`/restaurant/reports`, `/restaurant/configuration`, `/restaurant/settings`, `/restaurant/staff`) keep their current behaviour via their existing components, so nothing outside PMS regresses.
- Reuses existing server functions only: `getCashieringDashboard`, `listCashierShifts`, `listLedgerEntries`, `getBookingsDashboard`, `listReservations`, `getHousekeepingDashboard`, `listNightAuditRuns`, rates/revenue overview, rooms and staff/module-access functions. No new queries against F&B, inventory, procurement or workforce data from PMS screens.
- Unimplemented areas use the existing `FoundationPanel` (honest "planned" state, never sample records).
- No migrations, no RLS or authorization changes, no route renames; canonical routes and legacy redirects stay as they are.

## Verification

Typecheck, production build, then a browser pass over the four screens: report categories present with no F&B/inventory/HR content; Property Setup free of Menu, Tables & QR, duplicated Rates and Distribution; Administration showing Users/Roles/Permissions/Configuration/Master Data with no scheduling or attendance; Integrations showing the five categories. Access gating checked as unchanged.

Work stops after these four modules.
