# Rate & Revenue — Phase 4 audit (UI-12–UI-16)

| Field | Value |
|---|---|
| **Classification** | Implementation audit / architecture record. **Not** a Functional Spec. **Not** UI-12–UI-16 screens. |
| **Date** | 2026-09-25 |
| **Branch** | `feature/guest-preferences-workspace` |
| **RR-P4-01** | **Foundation implemented.** Live Demand read model + immutable OTB daily snapshots. |
| **Phase 4 status** | **Demand COMPLETE · Pickup COMPLETE · Predictive forecast NOT AVAILABLE · Forecast History NOT AVAILABLE** |

## 1. Executive Summary

No forecast engine, forecast history, or OTB snapshot table existed before RR-P4-01. True pickup cannot be reconstructed from `hotel_reservation_history`. Phase 4 is **Option B**: live demand + daily OTB snapshots + true pickup. Predictive forecast and UI-16 stay future.

## 2. Phase 1–3 Pre-flight

Phase 1–3 remain complete. UI-07–UI-11 stay mounted. `price_hotel_stay` remains in `0016`. Reservation snapshots unchanged. Property Setup owns masters. Room & Inventory unchanged. No approval workflow. No competitor feed.

Separate notes (not Phase 4 blockers): `revenue-config.test.ts` H still looks for `fromDate: context.fromDate` in the workspace; `rate-revenue-workspace.md` still says apply/history are foundation-only.

## 3. Ownership Boundary

Demand & Forecast may show decision-support OTB, remaining inventory, booked snapshot revenue, recent booking activity, lead time, and (after snapshots) pickup. It must not auto-change rates, own reservation/room-status/posted money, fabricate forecasts, or call recent bookings Pickup.

## 4. Current Data Sources

Live OTB: `hotel_reservations` + `nightly_rate_snapshot`. Inventory: active `hotel_rooms`. Rates/restrictions: `hotel_rate_calendar` / `hotel_rate_restrictions`. Business date: `restaurants.business_date`. Night Audit close: `closeBusinessDate` → `close_business_date`. Reservation history: operational audit, incomplete payloads.

## 5. Reservation History Quality

Cancel / no-show store status only. Reprice stores plan/subtotal/currency, not nightly snapshot. FO `amended` payloads are incremental. Stay-date events store dates in some paths only. Replay cannot restore as-of stay + type + nightly snapshot.

## 6. True Pickup Reconstruction

**NO.** Do not approximate from current rows + `created_at`.

## 7. Current OTB Metrics

**YES** — same formulas as Control Center / Rate Calendar via `computeBookedRevenueOverview`.

## 8. Forecast Engine Audit

**NO FORECAST ENGINE EXISTS.** `pms_seasons` is setup catalogue only.

## 9. Snapshot Requirement

Required for honest UI-13 pickup. Not required for live UI-12/14/15 demand.

## 10. Snapshot Design

`hotel_revenue_otb_snapshots`. Grain: restaurant × as-of business date × stay date × room type. Immutable. Insert-once. 90-day horizon. No rate-plan / segment grain.

## 11. Night Audit Integration

After successful `close_business_date` (and on already-closed retry). Close is not rolled back if capture fails.

## 12. UI-12 Audit

**IMPLEMENTED (RR-P4-02).** `view=demand-forecast` mounts `DemandForecastView` and consumes `getRevenueDemandOverview`. Live OTB KPIs, occupancy/revenue charts, room-type nights, attention, and recent booking activity ship. Forecast section stays **Forecast: Not Yet Available**. `forecastAvailable` remains false.

## 13. UI-13 Audit

**IMPLEMENTED (RR-P4-03).** `view=pickup-pace` mounts `PickupPaceView` and consumes `getRevenuePickupPace`. Pickup is snapshot-to-snapshot via `computePickup` for windows 1/3/7/14. Missing prior and partial stay-date coverage are unavailable, not zero. Recent booking activity is omitted. YoY / same-lead-time pace remain unavailable.

## 14. UI-14 Audit

**IMPLEMENTED (RR-P4-04) as a drawer, not `view=forecast-detail`.** `DemandDetailDrawer` opens from a Demand Calendar cell. Tabs: Overview, Pickup, Rates & Restrictions, Related. Forecast is an information line only: **Forecast: Not Yet Available**. `forecast-detail` remains `implemented: false`.

## 15. UI-15 Audit

**IMPLEMENTED (RR-P4-04).** `view=demand-calendar` mounts `DemandCalendarView` and consumes `getRevenueDemandCalendar`. Grain is stay date × room type. Color bands are occupancy/inventory states (Sold Out / High Occupancy / Elevated Occupancy / Open Inventory) plus Stop Sell overlay. No demand score.

## 16. UI-16 Audit

**NOT IMPLEMENTED.** **D — requires a forecast model.** `view=forecast-history` stays `implemented: false`. OTB snapshots ≠ forecast history.

## 17. Metric Definitions

OTB occupancy = booked room nights / available room nights. Rooms remaining = available − sold. Booked room revenue = snapshot nightly sums. Recent bookings = created in last 7 property-local days. Pickup = snapshot delta. No Demand Score / Forecast Revenue / Projected Occupancy.

## 18. Filter Semantics

Date range + room type apply to occupancy. Rate plan applies to revenue / recent bookings only. Segment / source / channel omitted.

## 19. Business Date / Timezone

`restaurants.business_date`. `created_at` via `propertyDateFromInstant` + property timezone.

## 20. Availability Denominator

Unchanged: active rooms × nights. May include OOO/OOS. Documented as `availabilityIncludesFutureOosRisk`.

## 21. Reservation Status Semantics

`confirmed | checked_in | checked_out`. Pending excluded (open decision, not silently changed). Cancelled / no-show excluded.

## 22. Lead-Time Analytics

**DERIVED NOW.** `arrival_date −` property-local created date.

## 23. Event Activity vs Pickup

Recent creations and cancellation **counts** can be derived. They are not pickup.

## 24. Performance

One composed server read. Default 30 / max 90 days. No per-date browser queries.

## 25. Routing

`demand-forecast`, `pickup-pace`, and `demand-calendar` are `implemented: true`. `forecast-detail` and `forecast-history` remain `implemented: false`. UI-14 is the Demand Detail drawer, not a workspace view.

## 26. Access

`canViewForecast` — owner/manager. Reads use `requireRateManager`. Capture is server/internal.

## 27. Frontend Architecture

UI-12 lives in `components/rates/demand-overview/`. UI-13 lives in `components/rates/pickup-pace/`. UI-15 lives in `components/rates/demand-calendar/`. UI-14 lives in `components/rates/demand-detail/`. Do not grow `rates-tabs.tsx`.

## 28. Backend Architecture

`revenue/demand.*` live read. `revenue/demand-snapshot.*` capture/history. `revenue/pickup-pace.*` snapshot-to-snapshot pickup. `revenue/demand-calendar.*` composed calendar read. Official APIs: `getRevenueDemandOverview`, `getRevenueOtbSnapshots`, `getRevenueOtbSnapshotHistoryStart`, `getRevenuePickupPace`, `getRevenueDemandCalendar`. Capture: `captureRevenueOtbSnapshot` (server only).

## 29. Database Changes

`0103_pms_revenue_otb_snapshots.sql` (dual-lane). No forecast table.

## 30. Design-to-Function Matrix

| UI | Component | Now | Snapshot | Model |
|---|---|---|---|---|
| UI-12 | OTB KPIs / curves | Live read | — | — |
| UI-12 | Forecast cards | OMIT | — | YES |
| UI-13 | Pickup 1/3/7/14 | — | YES | — |
| UI-13 | YoY pace | — | year of data | — |
| UI-14 | Demand detail | Live read | — | — |
| UI-15 | Occupancy calendar | Live read | — | — |
| UI-16 | Forecast history | — | — | YES |

## 31. Classification A–F

Current OTB occupancy / remaining / booked revenue / priced share / recent bookings / lead time → **B**. True pickup → **C**. Same-lead-time pace → **C** (later). Predictive forecast / forecast history / demand score → **D/F**. Competitor demand → **E/F**.

## 32. Test Plan

`demand.test.ts` plus Phase 1–3 revenue/restriction/workspace locks and `na1.test.ts`.

## 33. Open Product Decisions

1. Pending in future OTB (currently **no**).
2. Snapshot horizon 90 vs 180.
3. Whether Night Audit UI surfaces `otbSnapshotStatus`.

## 34. Recommended Phase 4 Scope

**Option B**, 4 prompts. UI-16 stays foundation.

## 35. Recommended Prompt Sequence

1. **RR-P4-01** Demand read + OTB snapshots — **done**
2. **RR-P4-02** UI-12 Demand Overview — **done**
3. **RR-P4-03** UI-13 Pickup — **done**
4. **RR-P4-04** UI-15 + UI-14 — **done**. UI-16 stays foundation.

## 36. Definition of Done

**Demand COMPLETE.** UI-12/14/15 consume the live read honestly. **Pickup COMPLETE** after snapshots exist. **Predictive forecast NOT AVAILABLE.** **Forecast History NOT AVAILABLE.** UI-16 is not marked complete.
