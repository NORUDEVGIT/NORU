# NORU PMS — REPORTS & ANALYTICS WORKSPACE IMPLEMENTATION PLAN

| Field | Value |
|---|---|
| **STATUS** | **PLAN ONLY** — not a Functional Spec, not authorised engineering, not implemented |
| **Basis** | Current local working tree + Reports & Analytics Foundation Audit (2026-09-28, accepted) |
| **Date** | 2026-09-28 |
| **Audit verdict** | **PARTIAL FOUNDATION — ACTIONABLE GAPS** |
| **Module COMPLETE** | **NO** |
| **Canonical route** | `/restaurant/pms/reports` |
| **Canonical clock** | `restaurants.business_date` via `getPropertyBusinessDate` / `resolvePropertyBusinessDate` |
| **Canonical booked metrics** | `computeBookedRevenueOverview` |
| **Repository changes from this document** | This file only |

This document is the Cursor execution roadmap. It does not approve GitHub issues by itself. Do not implement from this file until a named engineering phase is explicitly commissioned.

The approved product proposal’s presentation phases are **coverage**, not build order. Engineering is **Phase 0–5**, plus an explicit **Hold register**. Binding architecture is **§1A Locked Decisions**.

**Master rule:** Reports reads authoritative sources. Reports must not silently fix operational data. If a source module, a Settings runtime, or an execution job does not exist, hold the screen rather than fake the report, the count, the export, or the schedule.

---

## 1. Purpose

Reports & Analytics is the **read and presentation** workspace for one property.

It owns report discovery, parameters, execution, presentation, drill-down, and — only when a later phase is commissioned — export, print, execution history, and scheduling.

It does **not** own source transactions.

| Source | Owner |
|---|---|
| Reservation lifecycle | Reservations |
| Check-in, check-out, stay operations | Front Office |
| Charges, payments, deposits, refunds, settlement, hotel drawers | Cashiering |
| Physical room status and availability | Rooms & Inventory |
| Cleaning and readiness | Housekeeping |
| Work orders | Maintenance |
| Rates, restrictions, booked revenue formulas | Rate & Revenue |
| Groups, contracts, events | Sales & Events |
| OTA and channel data | Distribution |
| Identity and profile | Guest Profile |
| Access and audit | Security & Audit |
| Report configuration, property, fiscal context | Property Setup |

**Reports writes nothing on source tables.** Card 7 setup writers stay in Property Setup. A future `report_runs` row, if Phase 5 commissions it, records that a read happened. It does not change the read’s inputs.

---

## 1A. Locked Decisions (2026-09-28)

These decisions are **binding**. Later engineering phases must not reopen them without an explicit plan revision.

### 1. One clock, read from Night Audit

`restaurants.business_date` is the hotel business date. Reports does not store a second current date, does not roll the date, and does not call `close_business_date`.

Resolve it with `getPropertyBusinessDate` or `resolvePropertyBusinessDate`. `propertyToday` is calendar today in the property timezone. It is not the house date.

Null `business_date` already falls back inside those helpers. Reports must not add its own fallback.

### 2. No generic query engine

Do not dispatch `pms_report_definitions.query_key` as SQL or as an arbitrary server function. The column is an opaque label. Card 7 (`reports-card7.functions.ts`) never executes reports. That stays true.

Each report is a named reader that already checks membership and `.eq("restaurant_id", …)`. A future registry may map a code to one of those named functions. It must not `eval` a key, and it must not run under `supabaseAdmin` with an optional property id.

### 3. Phase 0 is an honest shell, not new reports

Before row reports, exports, or schedules:

- PMS Reports uses the same dark top chrome as Cashiering and Night Audit (`RoomInventoryChrome`), Reports active in gold, no permanent left sidebar.
- The catalogue lists only readers that exist.
- Counts appear only when that reader returned them.
- Every figure names its date basis.
- Export, Schedule, Email, Print-as-PDF, and Submit are absent.
- No migration.

The five live dashboard calls may remain behind that shell only with the labels in §5. They are not a Report Center of record.

### 4. One booked formula

Occupancy, ADR, and RevPAR that mean **booked stay nights** come only from `computeBookedRevenueOverview` in `src/packages/pms/lib/revenue/revenue-metrics.ts`:

- occupancy = sold room nights / (active rooms × days) × 100
- ADR = booked room revenue / sold room nights
- RevPAR = booked room revenue / available room nights
- revenue = sum of `nightly_rate_snapshot` rates inside the range, not folio posted revenue

`computeRevenuePerformanceOverview` repeats those ratios inline. Reports must not copy them again. Do not mount that view in Reports until it calls the shared helper. That call-site change belongs to Rate & Revenue and is a prerequisite of any chart in Phase 3, not a Reports formula.

Point-in-time occupancy from `getBookingsDashboard` (pending + confirmed + checked_in overlapping the supplied date, divided by `status = available` rooms, integer percent) is a different metric. Do not label it ADR, RevPAR, or booked occupancy.

Front Office desk occupancy (checked-in rooms) is a third metric. Reuse the desk reader. Do not reimplement it.

### 5. Reports does not write source domains

Forbidden from Reports server functions:

- folio inserts/updates, settlement, refunds, adjustments, drawer open/close
- reservation status, check-in, check-out, no-show, cancel, amendments
- housekeeping task, inspection, discrepancy, or room status
- `restaurants.business_date` and `close_business_date`
- POS order status
- guest identity updates
- “repair”, “rebuild”, or “catch up” actions that change operational rows so a total looks right

Drill-down links to the owner workspace. The 3-dot menu in Phases 0–4 is “Open in owner module” only.

### 6. Pass the house date only where the reader’s contract matches

| Reader | What `today` / range means today | Phase 0 rule |
|---|---|---|
| `getBookingsDashboard` | Filters `arrival_date` / `departure_date` / overlap on the caller date | May pass the house date. Label: reservation stay dates on the house date. Not Front Office desk definitions (pending is included). |
| `getHousekeepingDashboard` | Accepts `today` and does not filter by it | Point-in-time room status. Do not caption it “as of business date”. |
| `getCashieringDashboard` | `posted_at` between `` `${today}T00:00:00Z` `` and `` `${today}T23:59:59Z` `` | Do not relabel as business-date cash. Outstanding balance is all open folios, not that window. Phase 2 may show it only with this UTC label, or wait for a Cashiering business-date stamp. Reports does not change the filter inside this plan’s phases. |
| `getRevenueOverview` | Stay overlap on `arrival_date` / `departure_date`, booked snapshot | Range report. Default end may be the house date. Label: booked, not posted. |
| `listNightAuditRuns` | Rows already store `business_date` | Business-date correct. Cap display; server already `.limit(60)`. |

Changing Cashiering’s UTC window is a Cashiering commission. Do not bury it in a Reports prompt.

### 7. Permissions stay on live roles

Do not enforce `pms_report_permissions` or `reports.pms.view` / `reports.pms.export` / `reports.pms.print` until a later plan revision names the server check.

Live gates remain:

- `getRevenueOverview`: `requireModuleRole(..., "reports_analytics", REPORTS_ROLES)` and `requirePmsPackage`
- `getBookingsDashboard`: `requireReservationManager`
- `getHousekeepingDashboard`: `requireHousekeepingAccess`
- `getCashieringDashboard`: `requireCashieringAccess`, then property-filtered service-role reads
- `listNightAuditRuns`: `requireNightAuditView`
- Front Office desk readers: their existing FO gates

A Reports page that can open a reader must not bypass that reader’s gate. `NoAccess` stays when the gate throws. Card 7 policy flags (`mask_guest_names`, `export_csv`, `owner_manager_export_only`) are not applied by the live workspace and must not be described as enforcement.

### 8. Sensitive fields use the existing mask

A guest report may call `listGuests` and `maskIdNumber`. It must not select `id_document_number` into a table, CSV, or print view. `mask_guest_names` on `pms_report_policies` does not mask anything until a reader reads it. Phase 4 uses `maskIdNumber`, not the policy flag.

### 9. No fake capability

Do not render a report, a count, a trend delta, a schedule card, an export button, or a government submission whose reader or job does not exist.

Hold, and do not show as live rows in the catalogue:

- police / government file and submission
- invoices, invoice register, aging
- city ledger and company/group/master AR (folio aggregates are not accounts)
- tax and service-charge reports
- forecast (`DEMAND_FORECAST_AVAILABLE = false`)
- channel reconciliation and OTA commission reports
- events / banquet production
- scheduling, subscriptions, email delivery
- custom report builder and editable formulas
- PDF and Excel
- combined PMS + POS sales total
- transfers (`transfersSupported: false`)

`city_ledger` in Card 3 is a tender class label. Phase 4 cashiering blocks it from folio posting. It is not an AR book.

### 10. Pagination and property scope are part of the contract

Every new report reader takes `restaurantId`, checks membership first, and filters `restaurant_id` on every query. Service role is allowed only after that check, matching Cashiering and Housekeeping. A missing property filter is a failed phase.

Do not load a property’s reservations or folio lines and filter in the browser. Reuse the owner reader’s existing limit. Where the owner reader has no page, the report adds a hard limit and says the list is capped. `getCashieringDashboard`’s full open-folio scan is not the pattern to copy.

### 11. Legacy hub stays cross-domain

`/restaurant/reports` is the shared property hub (Food & Beverage, inventory, HR links, and a revenue embed). It is not the hotel report center.

PMS home, PMS chrome, and escape links stay on `/restaurant/pms/reports`. Do not redirect `/restaurant/reports` onto the PMS page in Phase 0. Do not add hotel report actions to `REPORT_LINKS` or to the Back Office planned category cards.

### 12. Card 7 remains setup

`pms_report_categories`, `pms_report_definitions`, `pms_metric_definitions`, and the per-property settings, permission maps, and policies stay Property Setup. Phase 0 does not read them to decide which reports run. The shell catalogue is a code list of real readers, aligned to the five seeded codes only where those codes already match a live call.

Do not add report-run, favorite, subscription, or schedule tables in Phases 0–4. Phase 5 may add one execution-history table. It may not add a second metric formula table.

### 13. POS stays in POS

`buildPosReport` reads `pos_sales.business_date`. That clock is not `restaurants.business_date`. PMS Reports may link to `/restaurant/pos/reports`. It must not re-query POS sales or add them to hotel revenue.

---

## 2. Locked Architecture

**Shared data does not mean shared ownership.** A folio total Reports can read is still a Cashiering total.

| Domain | Owns | Reports role |
|---|---|---|
| Property Setup | Report catalogue, metric labels, policy JSON, fiscal year start, permission catalogue | Do not copy editors into Reports. Do not execute setup-only policy. |
| Reports | Discovery, parameters, presentation, drill-down links; later export and run history | Own the shell and the read orchestration. |
| Reservations | Stay lifecycle, source, cancel, no-show | Read desk and search loaders. Do not write status. |
| Front Office | Arrivals, departures, in-house, walk-ins | Read. Link. |
| Cashiering | Ledger, drawers, settlement | Read. Do not post. Do not “fix” the UTC window here. |
| Housekeeping | Room status, tasks, inspections, discrepancies | Read. Do not complete work. |
| Rooms & Inventory | Physical status, OOO/OOS, availability | Read. |
| Maintenance | Requests | Read `listMaintenanceRequests`. No SLA clock. |
| Rate & Revenue | Booked occupancy, ADR, RevPAR, pickup, OTB | Call `computeBookedRevenueOverview`. Do not fork. |
| Guest Profile | Identity, documents, nationality | Read with `maskIdNumber`. |
| Night Audit | House date, run history | Read date and `listNightAuditRuns`. Do not close. |
| Sales & Events | Companies, groups, contracts, events | Company/group folio aggregates may be linked. Do not label them statements. Events stay Hold. |
| Distribution | Channels and mappings | Not a production report. |
| POS / Restaurant | Outlet sales and RM cash-up | Link out. Do not merge totals. |
| Security | Roles | Live gate stays `restaurant_users.role` and module access. |

Protected engines (do not fork or wrap in a generic executor):

- `computeBookedRevenueOverview`
- `getRevenueOverview` (calls the helper)
- Front Office desk loaders and `resolvePropertyBusinessDate`
- `post_folio_transaction`, `close_guest_folio`, `list_hotel_drawers`, hotel drawer writers
- `close_business_date`
- `listGuests` / `maskIdNumber`
- `buildPosReport`
- Card 7 save functions
- Housekeeping task and room-status writers

---

## 3. Current State

**Audit verdict (accepted):** PARTIAL FOUNDATION — ACTIONABLE GAPS.

### Route and workspace

- Canonical: `/restaurant/pms/reports` → `PmsReportsWorkspace`.
- Five tabs: Operational, Financial, Occupancy, Revenue, Management.
- Data: `getBookingsDashboard`, `getHousekeepingDashboard`, `getCashieringDashboard`, `getRevenueOverview`, `listNightAuditRuns`.
- Date input: `propertyToday(membership.restaurant.timezone)` only.
- No report id route, no category route, no Quick View, no 3-dot menu, no export.
- Management list: server `.limit(60)`, UI `.slice(0, 10)`.
- Legacy: `/restaurant/reports` → `ReportsWorkspace` (`REPORT_LINKS` plus revenue embed). No redirect.
- Home Back Office tile and `REPORTS_NAV` still target `/restaurant/reports`.
- `SharedModuleLinks` on the PMS page points back to `/restaurant/reports`.
- Chrome is the PMS sidebar (`pmsModule="reports"`), not `RoomInventoryChrome`.

### What is already LIVE

- Property-scoped dashboard counts and booked revenue for a caller-supplied range.
- Night-audit run rows keyed by `business_date`.
- Owner-module row readers Reports does not yet call: FO arrivals/departures/in-house (house date), `listOperationalReservations`, `listRoomRack`, folio and ledger lists, hotel drawers, guest directory.
- Revenue CSV and guest/company client CSV in those owner modules, not in Reports.
- Card 7 setup tables and SET6 JSON posture. Schedules are not jobs. Migration 0087 forbids report-run tables.

### What is unsafe or split

- Hotel reports use calendar today. Cashiering “today” is a UTC `posted_at` window. Housekeeping `today` is unused.
- Three occupancy definitions can sit on one screen unlabeled.
- `computeRevenuePerformanceOverview` duplicates booked ratios.
- `getCashieringDashboard` sums every open folio’s transactions.
- `pms_report_permissions` looks like authorization and is not consulted.
- Two catalogues (hardcoded tabs and Card 7) are not wired together.

### What must stay HOLD

Government submission. Invoices. City ledger. Aging. Posted tax. Forecast. Channel reconciliation. Scheduling. Custom reports. PDF/Excel. Combined POS totals. Editable KPI formulas.

---

## 4. Preserve / Do Not Replace

- `PmsReportsWorkspace` data rule: figures come from existing PMS queries. Replace the layout; do not invent numbers.
- `computeBookedRevenueOverview` and `REVENUE_METRIC_DEFINITIONS`.
- `getRevenueOverview` as the range reader. Do not add `getRevenueOverview` SQL in the database (Card 7 tests already forbid a public function of that name).
- FO desk loaders as the arrival/departure/in-house row source.
- `getPropertyBusinessDate` / `resolvePropertyBusinessDate`.
- Card 7 tables and “Never executes reports”.
- `/restaurant/reports` as the cross-domain hub.
- Owner export and `window.print()` on folio and guest profile. Reports does not absorb those pages in Phases 0–4.
- `listNightAuditRuns` as night-audit history. Reports may list runs. It does not recompute the close summary.

---

## 5. Canonical Read Contract

After Phase 0, every figure on `/restaurant/pms/reports` has all of the following:

1. `restaurantId` from the membership, checked by the reader’s existing role gate.
2. A date basis caption from this set: `house business date`, `stay overlap`, `point-in-time`, `posted_at UTC day`, `night_audit_runs.business_date`.
3. A source function name in the report’s description (operator-visible, short).
4. No number that the function did not return.
5. No action that writes a source table.

House date for new calls:

```text
businessDate = getPropertyBusinessDate(restaurantId)
```

Do not pass `new Date()`, `toISOString().slice(0, 10)`, or `propertyToday` into a new report reader.

`getBookingsDashboard` may receive `businessDate` as `today` because that argument is a stay-date filter. The caption must say the count includes pending and confirmed, which the Front Office desk does not.

`getCashieringDashboard` must not be captioned with `house business date` while the handler uses `Z` bounds. Phase 0 may keep the tile only with the caption `posted_at UTC day of {date}` and a separate caption on outstanding: `sum of open folio amounts, all dates`.

`getHousekeepingDashboard` caption: `current room status`. The echoed `today` field is not a business-date cut.

---

## 6. Technical Debt Before Expansion

Fix in Phase 0 (honesty, no migration):

- Shell still uses the PMS sidebar and `propertyToday` with no caption.
- Occupancy tab and Revenue tab can show two occupancies with no distinction.
- Catalogue in the database is not what the page runs. The shell must not pretend it is.

Fix in later phases only as reads:

- Management `.slice(0, 10)` becomes the report page size once history is a real report (Phase 1 or 2 may show the night-audit list with the server limit stated).
- Revenue performance inline math (Rate & Revenue), before any Reports chart uses it.
- Cashiering UTC window (Cashiering owner). Not a Reports migration.

Do not “fix” in a Reports phase:

- `close_business_date`, folio posting, FO status writers.
- POS `business_date`.
- Card 7 policy execution.
- Back Office consolidated totals.
- Making `query_key` executable.

---

## 7. Cross-Module Dependency Map

| Dependency | Owner | Reports rule |
|---|---|---|
| House date | Night Audit | Read only. |
| Arrivals, departures, in-house, unassigned | Front Office | Phase 1 calls desk / `listOperationalReservations`. |
| Room status, tasks, rack | Housekeeping | Phase 1 calls existing list readers. `listRoomRack` already takes the house date. |
| Folio lines, drawers | Cashiering | Phase 2 reads. UTC window stays labeled until Cashiering changes it. |
| Booked ADR / RevPAR | Rate & Revenue | `computeBookedRevenueOverview` only. |
| Pickup / OTB | Rate & Revenue | Show only when snapshots exist. Forecast stays off. |
| Guest identity | Guest Profile | Phase 4. Mask before display. |
| Night-audit runs | Night Audit | Read `listNightAuditRuns`. |
| Invoices, city ledger, tax posting | Not live | Hold. |
| Government file | Not live | Hold. |
| Schedule job | Not live | Hold. |
| POS sales | Standalone POS | Link only. |

---

## 8. Settings / Property Setup Master Data Contract

| Object | Consume in this plan? |
|---|---|
| `restaurants.business_date` | Yes. Through the existing resolver. |
| `restaurants.timezone` | Yes, only as the resolver’s fallback input. Not a second clock. |
| `restaurants.currency_code` | Yes, as the money label the revenue and cashiering readers already return. |
| `pms_financial_settings` fiscal start | No. Card 7 may display it. Reports ranges do not become fiscal until a revision says so. |
| `pms_report_policies.period_basis` | No. |
| `default_date_range_days` | No. Phase 3 may use the revenue tab’s existing 30-day window ending on the house date, in code, not from the policy row. |
| `export_csv`, `export_pdf`, `mask_guest_names`, `schedule_*` | No, until Phase 5 names CSV only, and still not PDF or schedule. |
| `pms_report_permissions` and `reports.pms.*` | No. |
| `pms_reports_catalogue_posture` / schedule posture | No. |
| Tax catalogues | No. |
| Government reporting config | Does not exist. Hold. |

Property Setup may keep the Card 7 Reports tab. That tab is not a second Report Center and must keep the copy that schedules are not executed.

---

## 9. Reports Read/Write Model

**Writes in Phases 0–4:** none.

**Writes in Phase 5, only if commissioned:** an insert into one execution-history table (or one `restaurant_staff_audit_log` event) recording user, report code, parameter summary, status, and row count. No update of source rows. No email row.

**Reads:** the named functions in §15. Reports does not add a parallel query for the same fact.

**Not reads of this module:** Card 7 load/save stays on the setup route.

---

## 10. Engineering Roadmap

Product coverage (not build order): report center, operational lists, financial lists, revenue, guest lists, export, scheduling, government, custom reports.

Engineering order (this plan):

| Phase | Name | What it delivers | Commission now? |
|---|---|---|---|
| 0 | Honest shell and date captions | Chrome, catalogue of real readers, labeled live figures, no new tables | **Yes — first** |
| 1 | Operational row reports | Arrivals, departures, in-house, room status via owner readers | After 0 |
| 2 | Cashiering reads | Open balances, payments, refunds, deposits, drawers, with the UTC label | After 0; holds inside the phase |
| 3 | Booked revenue | `getRevenueOverview` only; charts wait on the shared helper | After 0 |
| 4 | Guest list | `listGuests` + `maskIdNumber` | After 1 |
| 5 | CSV of an authorized result | Same gate as the reader; one audit event | After 1–3 for those reports only |
| Hold | Schedules, PDF, government, invoices, city ledger, tax, forecast, custom formulas, POS merge | — | **Do not implement** |

---

## Phase 0 — Honest Shell and Date Captions

### Functional Scope

Replace the PMS-sidebar reports page with the locked chrome and a Report Center that cannot lie. No new report queries beyond the five functions already on the page. No migration. No export. No schedule.

### Product Coverage

Report Center shell. Not category-complete operational or finance lists.

### Existing Capability Reused

`RoomInventoryChrome` (as Cashiering and Night Audit already do), `PmsReportsWorkspace` readers, `getPropertyBusinessDate`, `pms-modules.ts` canonical route.

### Backend Work

- Pass the resolved house date into `getBookingsDashboard` as `today`.
- Do not change `getCashieringDashboard`, `getHousekeepingDashboard`, or `getRevenueOverview` query semantics.
- Do not read `pms_report_definitions` to execute anything.
- Do not add a server function whose only job is to return hardcoded counts.

### Frontend Work

- Mount `RoomInventoryChrome` with Reports active. Remove dependence on the permanent PMS sidebar for this workspace (same pattern as Cashiering: chrome inside the route, module highlighted in the top bar).
- Working tabs: Report Center, and a tab per opened report, plus a control that opens the catalogue. Tabs are client routes or search params (`tab`, `report`). They do not create records.
- Top category dropdown lists only: Operational, Financial, Rooms, Revenue, Management. Each item opens a list of report codes that have a reader. Do not list Government, Invoices, City Ledger, Custom, or Scheduled.
- Report Center rows: name, one-line source, date-basis caption. Counts only if the existing query returned them.
- Keep the five live figures only with §5 captions. Do not place bookings-dashboard occupancy beside booked occupancy without both captions.
- Revenue range default: end on the house date, length unchanged from the current revenue tab (about 30 days). Caption: booked stay overlap.
- Night-audit table: up to 10 rows, text that the server returns at most 60. Row click links to the existing night-audit workspace, not a fake detail drawer full of recomputed KPIs.
- 3-dot menu omitted in this phase, or a single disabled-free link “Open Night Audit” / “Open Cashiering” / “Open Front Office” where a figure has a natural owner. No Export, Schedule, Email, Print, Submit.
- Empty and no-access states stay. No sample rows.
- Do not add colorful KPI cards whose values are not the reader payload.
- Leave `/restaurant/reports` mounted. Do not point `REPORT_LINKS` at new hotel reports.

Suggested catalogue codes for the shell (labels, not new queries):

| Code | Reader | Caption |
|---|---|---|
| `operational` | `getBookingsDashboard` | Stay dates on the house date; includes pending and confirmed |
| `financial` | `getCashieringDashboard` | Outstanding: all open folios. Activity: `posted_at` UTC day |
| `rooms` | `getHousekeepingDashboard` | Point-in-time room status |
| `revenue` | `getRevenueOverview` | Booked snapshot via `computeBookedRevenueOverview` |
| `management` | `listNightAuditRuns` | `night_audit_runs.business_date` |

Occupancy is not a sixth formula. Drop the separate Occupancy tab or make it a labeled view of the operational staying count. Do not compute a new percent in the component.

### Database / Migration Work

None.

### Settings Dependencies

None. Do not read Card 7 policies to hide buttons. Buttons that do not exist need no policy.

### Cross-Module Dependencies

Reads only. Links only.

### Ownership Risks

Passing the house date into the bookings dashboard changes which calendar day the counts use when night audit has not rolled. That is the point. It must not update reservations.

Relabeling cashiering activity as “business date cash” would be a false report. The UTC caption is mandatory.

### Tests Required

- Shell catalogue codes are the five above and no others.
- No import of export, schedule, or PDF helpers in the new reports shell module.
- Bookings request sends the house date string, not a `propertyToday` string, when the test supplies a business date.
- Component or shell test: financial copy includes `posted_at` or `UTC`, and housekeeping copy does not say “business date”.
- Revenue path still calls `computeBookedRevenueOverview` (existing rate tests). Reports shell does not reimplement the division.
- No new SQL file.

### Browser Verification

Authenticated pass on `/restaurant/pms/reports`:

- Dark top chrome, Reports indicated, no permanent left nav on this workspace.
- Report Center lists only the real packs.
- No Export, Schedule, Email, or Government control.
- Figures that load match the reader (or no-access). No placeholder percentages.
- A changed house date (non-production property) changes the operational stay-date counts’ request date. Do not close the night as part of this test.

### PASS Criteria

- Route remains `/restaurant/pms/reports`.
- No source writes.
- No migration.
- Date captions match §5.
- Catalogue cannot open a held report.

### Explicitly Deferred

Row-level arrivals, folio registers, CSV, schedules, guest ID columns, revenue charts from `revenue-analytics.ts`.

**Cursor prompt:** **SINGLE PROMPT** — shell, captions, and house date on the bookings dashboard only.

---

## Phase 1 — Operational Row Reports

### Functional Scope

Table reports for arrivals, departures, in-house, and room status. Each table is the owner reader. Filters are that reader’s parameters. Quick View links to the reservation or room. No second filter language.

### Product Coverage

Operational lists. Not production-by-source, not a move ledger, not no-show fees.

### Existing Capability Reused

`listFrontOfficeArrivalsDesk`, `listFrontOfficeDeparturesDesk`, `listFrontOfficeInHouseDesk` (or `getReservationArrivalsDepartures` / `listOperationalReservations` if the desk payload is already the right shape), `listRoomRack`, `getPropertyBusinessDate`.

Use the reader that already defaults to the house date. Do not add a Reports copy of the SQL.

### Backend Work

- Thin report functions are allowed only as wrappers that call the owner loader and return its rows plus `{ businessDate, capped }`.
- No new status rules. Unassigned, waitlist, and exceptions appear only if the chosen loader already returns them. Otherwise omit the report. Do not invent a waitlist KPI (`getReservationDesk` leaves waitlist null on purpose).
- No-show and cancellation lists: **omit** unless `listOperationalReservations` already filters those statuses. `cancelledThisMonth` on the bookings dashboard is not this report.
- Room moves: **omit**. Amendment history is not a move register.
- Hard limit: reuse the loader’s limit. If it has none, cap at 200 and say so. No client-side filter after a full-property download.

### Frontend Work

- Reports in the Operational and Rooms categories: Arrivals, Departures, In-house, Room rack.
- Filters at the top: house date (default, overridable only if the owner reader already accepts a date). No nationality, company, or payment method.
- Table first. Pagination uses the owner page or the cap. Column controls only if the owner table already has them; do not build a new column-picker framework.
- Row click: Quick View with the fields the reader returned, and a link to Front Office or Rooms. 3-dot: that link only.
- Do not show a fake “count of reports in category”.

### Database / Migration Work

None.

### Settings Dependencies

None.

### Cross-Module Dependencies

Front Office and Housekeeping own the queries. A bug in desk date filtering is fixed in that module, not by a Reports `WHERE`.

### Ownership Risks

Re-querying `hotel_reservations` from a new reports server file would fork arrival rules. The wrapper must call the desk function.

### Tests Required

- Arrivals wrapper returns the desk loader’s rows for the house date and the same `restaurant_id`.
- A second property’s reservation is absent.
- Wrapper does not import folio or reservation write functions.
- Room rack report uses the rack reader’s business date, not `propertyToday`.
- No-show report code is absent from the catalogue.

### Browser Verification

Open Arrivals, Departures, In-house, and Room rack. Confirm rows match the Front Office or Housekeeping screen for the same house date on a non-production property. Row link lands in the owner module and does not change stay or room status. Empty property shows an empty table.

### PASS Criteria

- Four reports, four owner readers.
- House date on the request.
- No source writes.
- Held operational ideas (moves, no-show register, booking-source production) are not in the menu.

### Explicitly Deferred

Source production (Phase 3 analytics, still not a new formula). Waitlist report. Guest-service SLA.

**Cursor prompt:** **SINGLE PROMPT** — four operational tables, wrappers only.

---

## Phase 2 — Cashiering Reads

### Functional Scope

Read-only financial tables the ledger can support: open folios and balances, ledger lines, payments, refunds, deposits, hotel drawers. Honest captions for the UTC activity window and for all-dates outstanding.

### Product Coverage

Financial lists. Not invoices, aging, city ledger, tax, or company statements.

### Existing Capability Reused

`listFolios`, `getFolio`, `listLedgerEntries` (existing limit 200), `listCashierShifts`, `getShiftSummary`, `list_hotel_drawers`. `getCashieringDashboard` may remain the Phase 0 summary. Do not use it as a row source.

### Backend Work

- Wrappers call those readers. Property id required. Role gate remains `requireCashieringAccess`.
- Do not change `posted_at` bounds inside `getCashieringDashboard`.
- Do not add a business-date column on `folio_transactions` in this phase.
- If a “activity on house date” report would require a new timestamp rule, **do not ship it**. Ship the ledger list with its existing order and the 200 cap, and keep the dashboard’s UTC caption.
- `transfersSupported` stays false. No transfers report.
- Company and group screens that sum guest folios stay in Guest Profile. Do not title a Reports page “City ledger”, “Master”, or “Accounts receivable”.

### Frontend Work

- Financial category: Open folios, Ledger (capped), Shifts / drawers.
- Outstanding on a folio row uses the balance the folio reader already returns (`sum(amount)`). Do not re-sum with a new sign.
- Quick View links to the folio page. No post, refund, or close button.
- Hide invoice number, tax amount, and provider status columns. Those fields are not a report.

### Database / Migration Work

None in Reports. A Cashiering migration that stamps business date is out of scope and must not be attached to this prompt.

### Settings Dependencies

Currency label from the restaurant row the cashiering reader already loads. Do not read tax setup.

### Cross-Module Dependencies

Cashiering owns the ledger. Night Audit may read the same rows. Reports must not post.

### Ownership Risks

A “today’s cash” tile that formats the UTC sum as the business date will be used as a deposit slip. The caption has to stay on the tile and on the CSV if Phase 5 exports it.

### Tests Required

- Ledger wrapper does not call `post_folio_transaction` or drawer open/close RPCs.
- Result is limited (200 or the reader’s limit) and scoped by `restaurant_id`.
- Catalogue has no invoice, aging, city-ledger, or tax code.
- Dashboard test or copy test still documents `T00:00:00Z` if that tile remains.

### Browser Verification

Open folios and ledger on a non-production property. Balances match the folio page. No payment button. Empty ledger is empty. A user without cashiering access sees no-access, not zeros.

### PASS Criteria

- Only live ledger and drawer readers.
- No AR, tax, or invoice UI.
- No ledger writes.
- UTC activity is not renamed.

### Explicitly Deferred

Business-date stamp on `folio_transactions`. Aging buckets. Company statements.

**Cursor prompt:** **SINGLE PROMPT** — folio, ledger, and drawer reads with existing caps.

---

## Phase 3 — Booked Revenue

### Functional Scope

Show booked occupancy, ADR, RevPAR, sold nights, and available nights for a stay-date range by calling `getRevenueOverview`. Optional pickup only through `getRevenuePickupPace` when snapshots exist. Forecast stays off.

### Product Coverage

Revenue presentation. Not posted room revenue, not departmental revenue, not a second chart library.

### Existing Capability Reused

`getRevenueOverview`, `computeBookedRevenueOverview`, `REVENUE_METRIC_DEFINITIONS`. Pickup: existing pace reader. OTB capture stays on night-audit close (`captureOtbAfterClose`), fail-open, not triggered by Reports.

### Backend Work

- Reports calls `getRevenueOverview`. It does not duplicate the night loop.
- Range end defaults to the house date. The metric remains stay overlap, captioned booked.
- Available nights stay `active rooms × days`, including the documented OOO/OOS gap. Do not “correct” availability in Reports.
- Do not call `computeRevenuePerformanceOverview` from Reports.
- Prerequisite if charts or segment tables are included in this phase: change `computeRevenuePerformanceOverview` so occupancy, ADR, and RevPAR for the unfiltered property range are the numbers `computeBookedRevenueOverview` returns for the same inputs. Segment buckets may still sum snapshot rates. They must not introduce a new ratio function. If that edit is not in the same prompt, ship the overview tiles only.
- `DEMAND_FORECAST_AVAILABLE` stays false. No forecast card with a null shown as zero.

### Frontend Work

- Revenue category: one range report. KPI labels use `REVENUE_METRIC_DEFINITIONS` text (booked, snapshot, active rooms × days).
- No comparison-period percent unless the pace reader returned a prior snapshot. Missing snapshot is “not enough history”, not 0%.
- Table or definition list is enough. Charts only after the prerequisite above.
- Do not show rate-plan or channel production as money unless the performance reader is included under that prerequisite. Otherwise omit those breakdowns.

### Database / Migration Work

None.

### Settings Dependencies

None. Fiscal year does not clip the range.

### Cross-Module Dependencies

Rate & Revenue owns the formula. Reports displays it.

### Ownership Risks

Fixing OOO in the available-room base is a Rate & Revenue change. Doing it inside a Reports prompt would change every revenue screen at once. Out of scope.

### Tests Required

- Reports revenue module calls `getRevenueOverview` or `computeBookedRevenueOverview`, and does not contain `bookedRoomRevenue / sold` or `* 100` of its own.
- If the analytics file is edited: unfiltered overview totals match `computeBookedRevenueOverview` for the same sold nights, available nights, and revenue.
- Forecast flag still false.
- Property scope unchanged on `getRevenueOverview`.

### Browser Verification

Revenue report for a short range on a non-production property. Occupancy, ADR, and RevPAR match the existing Rates revenue overview for the same dates. Caption says booked. No forecast number.

### PASS Criteria

- One formula.
- No posted-revenue claim.
- No forecast.
- No source writes.

### Explicitly Deferred

Posted RevPAR. Departmental revenue. Promotion performance. OOO-adjusted availability.

**Cursor prompt:** **SINGLE PROMPT** — overview via the shared helper; analytics fork only if charts are in the same prompt.

---

## Phase 4 — Guest List

### Functional Scope

One in-house or directory guest report using `listGuests` (and the in-house desk only to choose ids if a stay filter is required). Passport and ID numbers go through `maskIdNumber` before they reach the client. No government file.

### Product Coverage

Guest list. Not police submission.

### Existing Capability Reused

`listGuests`, `maskIdNumber`, optional `listFrontOfficeInHouseDesk` for “who is in house”. Nationality filter only if `listGuests` already applies it server-side.

### Backend Work

- Do not add a police layout, a jurisdiction table, or a submission status.
- Do not read `pms_report_policies.mask_guest_names`. Always mask document numbers.
- Permission: the guest reader’s existing gate. A reports role that fails that gate sees no-access, not an unmasked dump.
- Property id on every profile query.

### Frontend Work

- Columns: name, nationality if present, room or confirmation if the join already exists, masked document.
- No export in this phase (Phase 5).
- Quick View links to the guest profile. Do not embed the identity editor.

### Database / Migration Work

None.

### Settings Dependencies

None. Audit `maskIdNumbers` setup flag is not this mask.

### Cross-Module Dependencies

Guest Profile owns identity. Reports does not update documents.

### Ownership Risks

Selecting `id_document_number` “for the drawer only” still ships it to the browser. Mask on the server.

### Tests Required

- Payload document field matches `maskIdNumber` output, never the raw value.
- Cross-property guest id returns nothing.
- No government, police, or submission string in the report module.
- No guest update function imported.

### Browser Verification

Guest report shows masked IDs. Opening the link lands on the guest profile. A user without guest access sees no-access.

### PASS Criteria

- Masked documents.
- No submission UI.
- No profile writes.

### Explicitly Deferred

Unmasked export for a privileged role. That needs a real server permission check, not a Card 7 checkbox. Hold even in Phase 5 unless the revision names the role gate.

**Cursor prompt:** **SINGLE PROMPT** — masked guest list, no police layout.

---

## Phase 5 — CSV of an Authorized Result

### Functional Scope

Download CSV for a report Phase 1–3 already runs, using the same server function and the same role gate. One audit event. No PDF, Excel, email, or schedule.

### Product Coverage

Export. Not print layout, not subscriptions.

### Existing Capability Reused

The report wrapper from the earlier phase. Pattern may follow `exportRevenuePerformanceCsv` (server CSV, property scoped) but must not export a different query than the screen. Browser print of the current table is allowed as `window.print()` with no new PDF renderer. Guest document columns stay masked; do not add an unmasked CSV.

### Backend Work

- CSV built from the wrapper’s rows, after the cap. Filename includes report code, property id or name, and house date or range. No row beyond the cap.
- Audit: either `restaurant_staff_audit_log` with a new action code, or one new table `report_runs` (dual-lane migration) with `restaurant_id`, `report_code`, `actor_membership_id`, `parameters` jsonb, `status`, `row_count`, `created_at`. No schedule columns. No recipient column.
- If the migration is skipped, the audit-log event is enough. Do not add both a log event and a table that duplicate the same fact unless the log is the only writer.
- Refuse CSV when the role gate fails. Do not consult `reports.pms.export` yet (§1A.7).
- Do not export `getCashieringDashboard` “today” activity without the UTC column names in the header.

### Frontend Work

- 3-dot item “Download CSV” on reports that have the wrapper. Absent on Report Center summaries that are not the same row set.
- No Email, Schedule, or Excel item.

### Database / Migration Work

Optional single table as above. No favorites, no cron, no storage bucket.

### Settings Dependencies

Do not read `export_csv` / `export_pdf` booleans. Shipping CSV while the boolean is false would be a lie in the other direction; leaving the boolean unused matches §1A.7. Card 7 copy stays “not a CSV engine” until this phase is live, then a follow-up may adjust that sentence. This phase does not change Card 7.

### Cross-Module Dependencies

None beyond the readers already used.

### Ownership Risks

A CSV that re-queries with wider filters than the screen is a different report. Generate from the same result.

### Tests Required

- CSV row count equals the capped result.
- Other property’s ids absent.
- Guest CSV has masked documents.
- Failed role check writes no audit success row and no file.
- No `pg_cron`, no email send, no PDF library import.

### Browser Verification

Download CSV for arrivals or ledger on a non-production property. Open the file: headers match the table, row count matches the page cap. Button missing for a no-access role.

### PASS Criteria

- Same query as the screen.
- One history fact per download.
- No schedule and no PDF.

### Explicitly Deferred

Print stylesheet beyond `window.print()`. Excel. Email. Unmasked export.

**Cursor prompt:** **SINGLE PROMPT** — CSV plus one audit write. No Card 7 behavior change.

---

## Hold Register — Do Not Implement

| Item | Why | Revisit when |
|---|---|---|
| Police / government report and submission | No format, jurisdiction, or integration. Guest tests reject police-cleared copy. | A commissioned government spec with a real file schema. Still mask by default. |
| Invoices and invoice register | No invoice documents. Group invoice list is empty. | Cashiering invoice runtime. |
| Aging, city ledger, master AR | No AR book. `city_ledger` is a tender class. | Cashiering account phases. Reports then reads. |
| Tax and service charge | Catalogues only. Not posted on folio lines. | Cashiering posts them. |
| Forecast | `DEMAND_FORECAST_AVAILABLE = false`. | Rate & Revenue turns the flag on with a real model. Do not show 0. |
| Pickup without snapshots | Pace needs two OTB snapshots. | Show “not enough history”, which Phase 3 already requires. |
| Channel reconciliation, OTA commissions | Distribution is mappings and logs. Agency commission entries are not channel settlement. | A reconciliation reader in Distribution. |
| Events and banquet production | Card 5 is setup. | Sales runtime. |
| Scheduling, subscriptions, email, cron | Policy flags only. Migration 0087 invented no job tables. | A job runner plan. Not an extension of Phase 5. |
| Custom report builder, editable formulas | No approved field list or draft/publish. `formula_notes` is text. | A governed model. Do not edit formulas in Reports. |
| PDF and Excel | No renderer. Excel is rejected nearby. | A dedicated export plan. |
| Combined PMS and POS totals | Different clocks and ledgers. Back Office copy already says the combined total is not shown. | Never inside PMS Reports. |
| `pms_report_permissions` as the gate | Catalogue only. | Security cutover revision. |
| Favorites, recents, saved filters | No tables. | After run history exists, a separate preference phase. Not Phase 0. |
| Fiscal-year ranges | Settings stores month/day. Reports does not apply them. | A revision that defines period math. |
| Posted / collected RevPAR | Booked snapshot is the only formula. | Cashiering business-date stamp, then a named reader. |
| No-show fee register, room-move register | No report reader. Writes exist. | FO/Reservations list readers. |
| Guest-service SLA and complaints | SLA is setup. No complaint entity. | Guest Services runtime. |
| Second business date inside Reports | Locked §1A.1. | Do not revisit. |
| Executing `query_key` | Locked §1A.2. | Do not revisit. |
| Cashiering UTC window change | Owner defect. | Cashiering commission. |

---

## 11. Product Phase Map

| Product idea | Engineering home | Until then |
|---|---|---|
| Report Center, categories, tabs | Phase 0 | Five KPI tabs with no captions |
| Operational lists | Phase 1 | Dashboard counts only |
| Financial lists | Phase 2 | Dashboard sums, UTC caption required |
| Revenue analytics | Phase 3 | `getRevenueOverview` on the old tab is acceptable once captioned in Phase 0 |
| Guest / government | Phase 4 guest list; government is Hold | Do not show a police tile |
| Export / print | Phase 5 CSV; print is browser print | No button before that |
| History of runs | Phase 5 audit row; night-audit list is Phase 0 read | No fake “last run” |
| Scheduling | Hold | Card 7 cadence is not a job |
| Custom reports | Hold | Enable/disable of five packs is setup, not a builder |
| POS outlet reports | Out of PMS Reports | Link to POS |

---

## 12. Report Safety Rules (all phases)

- Reports does not insert or update source tables.
- House date is read from Night Audit’s column via the existing resolver.
- Booked occupancy, ADR, and RevPAR have one function.
- Point-in-time and booked occupancy are never the same label.
- Cashiering activity keeps the UTC `posted_at` caption until Cashiering changes the reader.
- Every query includes `restaurant_id` after a membership check.
- Service role does not skip that check.
- No report code without a reader.
- No sample rows, sample percentages, or sample companies.
- Document numbers are masked server-side.
- `query_key` is not executed.
- Card 7 policies are not authorization.
- POS totals are not added to hotel revenue.
- A cap is visible when the list is capped.
- Drill-down links; it does not post, check out, or close the day.

---

## 13. Ownership Conflicts to Avoid

- A Reports SQL file that re-selects arrivals with different statuses than the FO desk.
- A Reports copy of ADR/RevPAR “for the chart”.
- Relabeling `getCashieringDashboard` as business-date cash.
- City ledger, invoice, or tax tiles fed by zeros.
- Government layout built from in-house names.
- Schedule UI bound to `schedule_intent_enabled`.
- Permission checkboxes treated as export control.
- Back Office combined sales total.
- Night-audit close or folio post from a report action.
- “Fix balance” or “rebuild occupancy” tools.
- Using `propertyToday` in new report code.
- Reading SET6 posture to hide live readers or to show fake ones.

---

## 14. Canonical Writers to Preserve

Reports Phases 0–4 add no writers.

Leave these in their modules:

- Card 7 saves: `saveCard7ReportDefinitions`, `saveCard7ReportMetrics`, `saveCard7ReportPermissions`, `saveCard7ReportPolicy`
- SET6 posture mirrors
- `restaurant_staff_audit_log` entries for those setup saves
- `close_business_date` and `captureOtbAfterClose`
- `post_folio_transaction`, `close_guest_folio`, hotel drawer RPCs
- Reservation, front-office, and housekeeping writers
- `post_order_room_charge` / `reverse_order_room_charge`

Phase 5 may insert a run-history row or an audit-log event. It may not update the rows above.

---

## 15. Read Models to Reuse

- `getPropertyBusinessDate`, `resolvePropertyBusinessDate`
- `getBookingsDashboard` (labeled stay-date counts only)
- `getHousekeepingDashboard` (point-in-time only)
- `listFrontOfficeArrivalsDesk`, `listFrontOfficeDeparturesDesk`, `listFrontOfficeInHouseDesk`
- `listOperationalReservations`, `getReservationArrivalsDepartures`, `getReservationDesk`
- `listRoomRack`, `listHousekeepingTasks`, `listInspections`, `listDiscrepancies`, `listMaintenanceRequests`
- `getCashieringDashboard` (captions in §5), `listFolios`, `getFolio`, `listLedgerEntries`, `listCashierShifts`, `getShiftSummary`, `list_hotel_drawers`
- `getRevenueOverview`, `computeBookedRevenueOverview`
- `getRevenuePickupPace` only when snapshots exist
- `listNightAuditRuns`
- `listGuests`, `maskIdNumber`
- `buildPosReport` only as a link target, not a PMS query

Do not reuse as live report engines: Card 7 reports tab, Card 5 events, SET6 posture, tax catalogues, `getGroupInvoices`, forecast helpers, `pms_report_permissions`.

---

## 16. Settings-Dependent Hold Points

Do not fake: schedule cadence, export PDF flag, mask-guest-names flag, fiscal period basis, permission-catalogue enforcement, government config, tax settings, email delivery, default date range from `pms_report_policies`.

Any later prompt that claims to “honor report settings” must name the runtime reader or mark the feature held.

---

## 17. Test Strategy

- Phase 0: catalogue allow-list, captions, house date passed to bookings dashboard, no migration, no export import.
- Phase 1: wrapper parity with FO/HK loaders and property isolation.
- Phase 2: no folio writes; cap; no invoice/tax/city-ledger codes.
- Phase 3: no local ADR division; forecast flag false.
- Phase 4: masked document payload.
- Phase 5: CSV equals capped rows; audit row on success only; no cron.
- Dual-lane SQL only if Phase 5 adds `report_runs`.
- Do not require `npm run build` or a full regression suite from this document.
- UI phases: authenticated browser smoke on `/restaurant/pms/reports`.

---

## 18. Browser Verification Contract

A UI phase is not PASS until an authenticated smoke on a non-production property:

- No error boundary on `/restaurant/pms/reports`
- Reports chrome matches Cashiering/Night Audit (dark top bar, warm working surface)
- Catalogue contains no held report names as if they open data
- No Export before Phase 5; no Schedule, Email, or Submit in any commissioned phase of this plan
- Operational counts or rows use the house date
- Financial activity is not labeled as business-date cash
- Revenue figures match Rate & Revenue for the same range
- Guest documents are masked
- Row links do not post, check out, or close the day
- A role that fails the owner gate sees no-access, not zeros
- `/restaurant/reports` still opens the cross-domain hub

Do not claim browser PASS from unit tests alone.

---

## 19. Definition of Done

The Reports module is complete only when commissioned phases that are not held are implemented, every on-screen number comes from an owner reader, booked ADR/RevPAR still resolve through `computeBookedRevenueOverview`, the house date is the Night Audit clock, and Reports still does not write source data.

Module COMPLETE remains **NO** until that bar. Holds (government, invoices, city ledger, tax, forecast, schedules, custom formulas, PDF) can stay open without being called done. An accepted Phase 0 shell is not module complete.

---

## 20. Deferred Register

See **Hold Register**. Also deferred as separate owner commissions, not Reports prompts:

| Item | Reason | Revisit |
|---|---|---|
| `getCashieringDashboard` UTC bounds | Cashiering reader | Cashiering plan |
| `getHousekeepingDashboard` ignores `today` | Housekeeping reader | Optional HK cleanup; Reports captions around it |
| `computeRevenuePerformanceOverview` inline ratios | Rate & Revenue | Before Reports charts, or inside the Phase 3 prompt if charts ship |
| OOO/OOS counted as available room nights | Documented revenue-metrics gap | Rate & Revenue |
| Home tile and `REPORTS_NAV` point at `/restaurant/reports` | Cross-domain hub is intentional (§1A.11) | Do not redirect in Phase 0 |
| `SharedModuleLinks` back to the hub | Same | Keep |
| Check-in/out not reading house date | Front Office | FO plan |
| POS business date | Separate clock (§1A.13) | Do not merge |

---

## 21. Recommended Execution Method

One coherent phase = one Cursor prompt.

| Phase | Prompt | Why |
|---|---|---|
| 0 | SINGLE | Shell and honest captions before any new list |
| 1 | SINGLE | Four operational wrappers |
| 2 | SINGLE | Ledger reads, no new money window |
| 3 | SINGLE | One revenue formula |
| 4 | SINGLE | Masked guest list |
| 5 | SINGLE | CSV and one audit write |
| Hold | DO NOT IMPLEMENT | Missing source, missing job, or missing authz |

Do not create a prompt per KPI. Do not start Phase 5, government, or a schedule table inside Phase 0.

---

## 22. Immediate Next Step

**First implementation action: Phase 0 — Honest Shell and Date Captions.**

Do not start arrival tables, CSV, or a report-run migration on top of a page that still calls calendar today and has no date caption.

Sequence:

1. Commission **Phase 0** (single prompt).
2. Then **Phase 1** operational row reports.
3. Then **Phase 2** and **Phase 3** in either order; both stay read-only.
4. Then **Phase 4** guest list.
5. Then **Phase 5** CSV only for reports that already match the screen.
6. Do **not** execute `query_key`.
7. Do **not** read Card 7 policies as authorization or as the scheduler.
8. Do **not** add a second ADR/RevPAR formula.
9. Do **not** relabel cashiering UTC activity as business-date cash.
10. Do **not** show government, invoice, city ledger, tax, forecast, or schedule actions.
11. Do **not** change folio posting, night-audit close, or POS inside a Reports prompt.

---

## Do Not Touch (protected)

- `post_folio_transaction`, `close_guest_folio`, hotel drawer writers
- `close_business_date` and `restaurants.business_date` writes
- `check_in_hotel_reservation`, `check_out_hotel_reservation`, `mark_hotel_reservation_no_show`
- Housekeeping task, inspection, and room-status writers
- `computeBookedRevenueOverview` arithmetic (call it; do not change rounding in a Reports phase)
- `buildPosReport` and `pos_sales`
- Card 7 save path and the “does not run reports” contract
- `open_folio_for_reservation` and room-charge uniqueness
- A new business-date column owned by Reports

Phase 3 may call into `computeRevenuePerformanceOverview` only to delegate ratios to the shared helper, and only in that phase’s prompt.

Phase 5 may add `report_runs` or an audit-log action. It may not add schedule columns.

---

## Final validation (this document)

1. Audit accepted as PARTIAL FOUNDATION — ACTIONABLE GAPS — **yes**.
2. Reports reads source modules and does not fix their data — **yes** (§1A.5).
3. One clock: `restaurants.business_date` via the existing resolver — **yes** (§1A.1).
4. Phase 0 is the honest shell and captions, with no migration — **yes**.
5. Booked ADR/RevPAR stay on `computeBookedRevenueOverview` — **yes** (§1A.4).
6. `query_key` is not an execution engine — **yes** (§1A.2).
7. Cashiering “today” stays a UTC `posted_at` window until Cashiering changes it — **yes** (§1A.6).
8. Live authorization stays role and module gates, not `pms_report_permissions` — **yes** (§1A.7).
9. Government, invoices, city ledger, tax, forecast, schedules, custom formulas, and PDF are Hold — **yes**.
10. POS is not merged into hotel revenue — **yes** (§1A.13).
11. `/restaurant/reports` stays the cross-domain hub — **yes** (§1A.11).
12. Engineering order is Phase 0–5, not the product catalogue order — **yes** (§10).
13. No application implementation in this change set — **yes** (this file only).
