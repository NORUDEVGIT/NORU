# Rate & Revenue — Phase 1 complete

| Field | Value |
|---|---|
| **Classification** | Architecture record. **Not** a Functional Spec. **Not** UI-01–UI-40 implementation. |
| **Date** | 2026-09-24 |
| **Status** | **PHASE 1 — FOUNDATION / RESPONSIBILITY REFACTOR — COMPLETE** |

## 1. Phase 1 objective

Separate **master configuration** from **revenue operations** without changing stay pricing, reservation snapshots, or KPI formulas. Property Setup owns catalogues. Rate & Revenue operates daily rates, date restrictions, and booked-revenue monitoring inside an operational command workspace.

## 2. Final ownership model

| Domain | Owner | Rate & Revenue may |
|---|---|---|
| Rate categories / plans | Property Setup Card 3 | Read-only reference |
| Room types | Property Setup / Rooms | Filter context |
| Segments, commercial sources, channels | SET6 | Filter context |
| Restriction **templates**, promotions, seasons | Card 3 commercial | Read later; no auto-apply |
| Packages / corporate agreements | Card 3 meals / corporate | Read later |
| Daily overrides | Rate Calendar → `hotel_rate_calendar` | Write |
| Applied date restrictions | Restrictions → `hotel_rate_restrictions` | Write |
| Booked KPIs | `getRevenueOverview` | Read (Reports also consumes this) |
| Stay pricing | `price_hotel_stay` + priced RPCs | Unchanged consumer |
| Reservation lifecycle | Reservations / Front Office | None |
| Posted / collected money | Cashiering | None |
| Business date roll | Night Audit | Read displayed date only |
| Distribution connectivity | Distribution | None |

Living maps: [`rate-revenue-responsibility.md`](./rate-revenue-responsibility.md) · [`rate-revenue-source-of-truth.md`](./rate-revenue-source-of-truth.md).

## 3. Workspace shell architecture

Canonical route: `/restaurant/pms/rates-revenue`. Chrome: `RateRevenueChrome` / `PmsCommandChrome`. Default view: `control-center`. Legacy `?tab=` still maps.

Primary sections: Revenue Control · Rates · Restrictions · Demand & Forecast · Commercial · More.

IA: [`rate-revenue-workspace.md`](./rate-revenue-workspace.md). Room & Inventory was the layout reference and was **not** modified.

## 4. Settings adapter architecture

Read-only loaders in `src/packages/pms/lib/revenue/revenue-config.*`. No insert / update / delete / upsert against Property Setup masters. Card 3 / SET6 catalogues fail independently.

## 5. Shared RevenueContext

Fields: dates, room type, rate plan, market segment, commercial source, sales channel. Persisted on the URL. Unknown IDs drop after catalogues load. Room-type change clears an incompatible rate plan. Technical reservation sources (`staff`, `walk_in`, `direct_booking`) are not commercial masters.

Control Center KPI dates stay **local last-30-days** so metric meaning is unchanged.

## 6. RevenueAccess model

`resolveRevenueAccess` / `getRevenueAccess` / `loadRevenueAccess`.

Current mapping (conservative):

| Role | Rate & Revenue workspace | Notes |
|---|---|---|
| owner / manager | Full current operational access | `canApprove` is **false** — no approval product |
| accountant | No workspace access | Still reads `getRevenueOverview` via Reports (`REPORTS_ROLES`) |
| receptionist / others | No workspace access | No mutation access |
| PMS package off | All flags false | Route + `requirePmsPackage` remain authoritative |

View definitions carry `requiredCapability`. Mutations still use `requireRateManager`. Calendar / Restrictions disable Save when the matching flag is false.

## 7. Metric semantic foundation

`src/packages/pms/lib/revenue/revenue-metrics.ts` is the definition registry. `getRevenueOverview` now calls `computeBookedRevenueOverview` with the **same** rounding as before.

| Key | Current formula |
|---|---|
| Occupancy | sold ÷ available room nights |
| ADR | booked snapshot revenue ÷ sold nights |
| RevPAR | booked snapshot revenue ÷ available nights |
| Booked Room Revenue | sum of snapshot nightly rates in range |
| Sold Room Nights | eligible reservation nights |
| Available Room Nights | active `hotel_rooms` × days |
| Priced Share | priced nights ÷ sold nights |

**Data classes (documented, not calculated yet):** BOOKED · POSTED · COLLECTED · FORECAST · NET.

Control Center label is **Booked room revenue** — reservation pricing snapshots, not Cashiering.

## 8. Protected pricing contracts

Unchanged from Prompt 1 / migration `0016`:

- `price_hotel_stay`
- `create_hotel_reservation_priced`
- `amend_hotel_reservation_priced`
- `reprice_hotel_reservation`
- Calendar override resolution
- CTA / CTD / Stop Sell / Min Stay / Max Stay on `hotel_rate_restrictions`
- Reservation snapshot columns
- Reprice history behavior

## 9. Implemented operational surfaces

| View | Status |
|---|---|
| Control Center | Existing `RevenueOverviewTab` |
| Rate Plans | Read-only Property Setup reference |
| Rate Calendar | Daily overrides |
| Restrictions | Applied `hotel_rate_restrictions` |

## 10. Foundation-only future surfaces

Bulk Rate Change, Rate History, Apply Restriction, Restriction History, Demand & Forecast family, Promotions, Packages, Market Intelligence, Approvals, Revenue Performance, Audit & Control, Export.

These are honest foundation states. They are **not** UI-01–UI-40.

## 11. Known metric gaps

- Available room nights may include active OOO/OOS rooms.
- ADR is understated by unpriced sold nights.
- Control Center uses a local date picker, not a single business-date vs calendar-range rule.
- Booked snapshot revenue ≠ posted financial revenue ≠ collected payments.

Do not silently “fix” these without a later metric Spec.

## 12. Known integration gaps

- Commercial restriction templates are not applied to `hotel_rate_restrictions`.
- Promotions / packages / seasons / corporate rates are not in the pricing engine.
- Dual calendar writers (`saveRateOverride` vs Card 3 override) remain.
- `module="configuration"` remains on the route (rail-suppression tests).
- Reports reuse Control Center KPIs; accountant does not enter Rate & Revenue.

## 13. Deferred database work

Phase 1 added **no** forecast, approval, competitor, activation, or revenue-snapshot tables.

## 14. Test results

Focused Prompt 2–5, adapter/context, Card 3 commercial/rates, Card 6, CR5/CR8, SET3, and Room & Inventory compat suites. See the Prompt 5 completion report in the implementing chat for the run counts.

Repo-wide `tsc` / production build were **not** treated as a Phase 1 gate (known pre-existing failures outside this surface).

## 15. Phase 2 readiness checklist

- [x] Property Setup owns master configuration
- [x] Rate & Revenue has no master CRUD
- [x] Rate & Revenue is operational, not Configuration
- [x] New workspace shell exists
- [x] Room & Inventory layout language is reused appropriately
- [x] control-center is default
- [x] Settings adapter exists
- [x] adapter is read-only
- [x] shared commercial context exists
- [x] context uses real configured masters
- [x] RevenueAccess is centralized
- [x] metric semantics are centralized
- [x] pricing engine is unchanged
- [x] reservation snapshots are unchanged
- [x] no accidental new operational schema
- [x] implemented views still work
- [x] future views are clearly foundation-only
- [x] tests are passing or known pre-existing failures are documented

**PHASE 1 — FOUNDATION / RESPONSIBILITY REFACTOR**  
**STATUS: COMPLETE**

Recommended next implementation: **UI-01–UI-06 Revenue Control & Rates**.
