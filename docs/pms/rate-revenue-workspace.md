# Rate & Revenue — workspace shell (Phase 1 Prompt 3)

**Classification:** Information architecture / UI shell. **Not** a Functional Spec. **Does not** claim UI-01–UI-40 functionality exists.

Prompt 3 replaces the old four-tab page with a NORU operational command workspace. Layout reference: Room & Inventory (`RoomInventoryChrome`, `rooms-workspace.tsx`). Room & Inventory was **not** modified.

Ownership stays the Prompt 2 boundary: Property Setup owns masters; Rate & Revenue owns operational daily rates, date restrictions, and revenue monitoring. See [`rate-revenue-responsibility.md`](./rate-revenue-responsibility.md).

## Primary sections and views

| Section | Views | Status |
|---|---|---|
| Revenue Control | Control Center | **Implemented** — existing `RevenueOverviewTab` |
| Rates | Rate Plans · Rate Calendar · Bulk Rate Change · Rate History | Plans, Calendar, Bulk Rate Change, and Rate History **implemented** |
| Restrictions | Restrictions · Apply Restriction · Restriction History | Restrictions **implemented** (`hotel_rate_restrictions`); apply + history **foundation only** |
| Demand & Forecast | Demand & Forecast · Pickup & Pace · Forecast Detail · Demand Calendar · Forecast History | **Foundation only** |
| Commercial | Promotions · Packages · Market Intelligence · Approvals | **Foundation only** |
| More | Revenue Performance · Audit & Control · Export | **Foundation only** |

Default view: `control-center` (`?view=control-center`). Invalid `view` values fall back to Control Center.

## URL compatibility

Preferred: `?view=rate-calendar`

Legacy `?tab=` still works:

| Old tab | View |
|---|---|
| `overview` | `control-center` |
| `plans` | `rate-plans-reference` |
| `calendar` | `rate-calendar` |
| `restrictions` | `restrictions` |

Canonical route remains `/restaurant/pms/rates-revenue`. Legacy `/restaurant/bookings/rates` still redirects and preserves search.

## UI-01–UI-40 mapping

These identifiers are **future documentation only**. They map onto the views above so later work does not create 40 routes. Drawers, confirmations, and subviews are **not** primary navigation.

| UI | View / note |
|---|---|
| UI-01 | `control-center` |
| UI-02 | `rate-calendar` |
| UI-03 | rate detail drawer — not primary nav |
| UI-04 | `bulk-rate-change` |
| UI-05 | review/confirmation — not primary nav |
| UI-06 | `rate-history` |
| UI-07 | `restrictions` |
| UI-08 | restriction detail drawer |
| UI-09 | `apply-restriction` |
| UI-10 | confirmation workflow |
| UI-11 | `restriction-history` |
| UI-12 | `demand-forecast` |
| UI-13 | `pickup-pace` |
| UI-14 | `forecast-detail` |
| UI-15 | `demand-calendar` |
| UI-16 | `forecast-history` |
| UI-17 | `promotions` |
| UI-18 | promotion activation workflow |
| UI-19 | promotion performance detail |
| UI-20 | `packages` |
| UI-21 | package activation workflow |
| UI-22 | `market-intelligence` |
| UI-23–25 | market comparison / position / history subviews |
| UI-26 | `approvals` |
| UI-27–30 | approval detail / review / history within approvals |
| UI-31 | `revenue-performance` |
| UI-32–35 | analytics subviews |
| UI-36 | `audit-control` |
| UI-37–39 | audit subviews |
| UI-40 | `export` |

Source of truth in code: `src/packages/pms/lib/rate-revenue-workspace.ts`.

## Design reference

Command chrome reuses `PmsCommandChrome` the same way Room & Inventory does: dark top bar, gold `#C89933` active underline, property name, **read-only** hotel business date (`usePropertyBusinessDate` / Night Audit), help, overflow, avatar. RestaurantShell keeps auth / membership / `requireRoutePackage("pms")` and hides the package rail and restaurant header so chrome is not doubled.

Rate search in chrome is **disabled** (no fake results). Prompt 4 added the shared commercial context bar and URL persistence. See [`rate-revenue-source-of-truth.md`](./rate-revenue-source-of-truth.md). Control Center KPI dates stay local (last 30 property days) so metric meaning is unchanged.

## Deferred

Prompt 5 centralized RevenueAccess and metric definitions without changing formulas. Later work owns Settings write adapters, KPI redesign, forecast/approval tables, and UI-01–UI-40 internals.
