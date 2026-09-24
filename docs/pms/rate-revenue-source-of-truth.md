# Rate & Revenue — Property Setup source-of-truth map (Phase 1 Prompt 4)

**Classification:** Adapter / ownership map. **Not** a Functional Spec. **Does not** claim UI-01–UI-40 functionality exists.

Prompt 4 adds a **read-only** Settings adapter and a shared commercial context bar. Property Setup remains the master editor. Rate & Revenue does not write rate plans, categories, catalogues, promotions, packages, seasons, restriction templates, or corporate agreements.

Ownership stays the Prompt 2 boundary. See [`rate-revenue-responsibility.md`](./rate-revenue-responsibility.md). Workspace shell: [`rate-revenue-workspace.md`](./rate-revenue-workspace.md).

## Adapter

| File | Role |
|---|---|
| `src/packages/pms/lib/revenue/revenue-config.types.ts` | Read models |
| `src/packages/pms/lib/revenue/revenue-config.server.ts` | Loaders only — no insert / update / delete |
| `src/packages/pms/lib/revenue/revenue-config.functions.ts` | `requireRateManager` server fns |

## What Rate & Revenue reads

| Context / catalogue | Source | Loader reused |
|---|---|---|
| Property (name, timezone, currency, business date) | `restaurants` | `loadRevenueProperty` |
| Room types | `room_types` | `loadRevenueRoomTypes` |
| Rate categories | `hotel_rate_categories` | `loadRevenueRateCategories` |
| Rate plans | `hotel_rate_plans` | `loadRevenueRatePlans` |
| Market segments | SET6 sales / events | `loadSet6Snapshot` |
| Booking sources (commercial) | SET6 source codes | `loadSet6Snapshot` |
| Sales channels | SET6 distribution | `loadSet6Snapshot` |
| Restriction **templates** | Card 3 commercial | `loadCommercialCard3Snapshot` |
| Promotions | Card 3 commercial | `loadCommercialCard3Snapshot` |
| Seasons | Card 3 commercial | `loadCommercialCard3Snapshot` |
| Packages | Card 3 meals | `loadMealsCard3Snapshot` |
| Corporate agreements | Card 3 corporate | `loadCorporateCard3Snapshot` |

Card 3 / SET6 catalogues **fail independently**. A missing commercial table does not hide room types or rate plans.

Configure masters at [`CARD3_HREF`](../../src/packages/pms/lib/pms-property-setup-card3.ts) (`/restaurant/settings#financial-commercial`) or SET1 hub hashes `#sales-events` / `#distribution`. Context-bar empty states link there. There is **no Add** button on Rate & Revenue.

## What Rate & Revenue still owns (operational)

| Surface | Table / contract | Not replaced by Prompt 4 |
|---|---|---|
| Daily rate overrides | `hotel_rate_overrides` via `saveRateOverride` | Calendar remains the writer |
| Applied date restrictions | `hotel_rate_restrictions` | Distinct from Card 3 restriction templates |
| Control Center KPIs | `getRevenueOverview` | Still last 30 property days unless the operator changes the **local** overview dates |
| Stay pricing | `price_hotel_stay` / priced reservation RPCs | Unchanged |

`RevenueRestrictionMaster` is a Property Setup template. It is **not** an applied `hotel_rate_restrictions` row. The two tables stay unmerged.

## Shared context

`RevenueContext` fields: `fromDate`, `toDate`, `roomTypeId`, `ratePlanId`, `marketSegmentId`, `commercialSourceId`, `salesChannelId`.

URL persistence on `/restaurant/pms/rates-revenue`:

`?view=` · `?from=` · `?to=` · `?roomType=` · `?ratePlan=` · `?segment=` · `?source=` · `?channel=`

Legacy `?tab=` still maps through Prompt 3. Unknown IDs are dropped after catalogues load. Changing room type clears an incompatible rate plan. Calendar / Restrictions auto-select the first compatible rate plan when none is in the URL.

**Technical reservation sources** (`staff`, `walk_in`, `direct_booking`) are reservation-origin values. They are never treated as commercial source-code masters.

## View wiring

| View | Consumes shared context | Notes |
|---|---|---|
| Control Center | Bar only | KPI query stays local last-30-days so metric meaning is unchanged |
| Rate Plans | `roomTypeId` | Read-only reference |
| Rate Calendar | dates + room type + rate plan | Hides local `PlanFilters` |
| Restrictions | dates + room type + rate plan | Applied `hotel_rate_restrictions` only |
| Foundation views | Bar fields from the view model | No internals yet |

## Out of scope

- RevenueAccess
- Settings write adapters
- KPI / forecast formula changes
- Forecast or approval tables
- UI-01–UI-40 internals
- Room & Inventory changes
- Merging `hotel_rate_restrictions` with `pms_commercial_restrictions`
- New database migrations
