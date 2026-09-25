# Rate & Revenue — Phase 4 complete

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **Demand COMPLETE · Pickup COMPLETE · Predictive forecast NOT AVAILABLE · Forecast History NOT AVAILABLE** |
| **Surfaces** | UI-12, UI-13, UI-15 complete. UI-14 complete as a drawer. UI-16 not implemented. |

## 1. Phase 4 objective

Ship honest live on-the-books demand, immutable daily OTB snapshots, and snapshot-to-snapshot pickup. Do not invent a predictive forecast engine. Property Setup remains the master owner. Pricing SQL and reservation snapshots stay on migration `0016`.

## 2. UI-12 Demand & Forecast Overview

`view=demand-forecast` mounts `DemandForecastView` and consumes `getRevenueDemandOverview`. Live OTB KPIs, occupancy and booked-revenue charts, room-type nights, attention, and Recent Booking Activity ship. Forecast section stays **Forecast: Not Yet Available**. A View Demand Calendar link is the only calendar navigation from Overview.

## 3. UI-13 Pickup & Pace

`view=pickup-pace` mounts `PickupPaceView` and consumes `getRevenuePickupPace`. Pickup is current snapshot minus prior snapshot for the same stay date × room type. Windows: 1 / 3 / 7 / 14. Missing or partial pairs are unavailable, never zero-filled. Recent booking activity is omitted. YoY remains unavailable.

## 4. UI-15 Demand Calendar

`view=demand-calendar` mounts `DemandCalendarView` and consumes `getRevenueDemandCalendar`. Grain is stay date × room type. Visible window: 14 stay dates. Cells show occupancy, remaining, restriction marks, override, and 7D pickup when comparable.

## 5. UI-14 Demand Detail

Right-side drawer from a selected calendar cell. Tabs: Overview / Pickup / Rates & Restrictions / Related. Forecast is an information line only. Pickup windows call the existing pickup API for the selected stay date and room type. `view=forecast-detail` stays unimplemented.

## 6. Live demand read

Official live API: `getRevenueDemandOverview`. Occupancy uses `computeBookedRevenueOverview` and active `hotel_rooms` × nights. Pending is excluded. Rate-plan occupancy is not computed.

## 7. Immutable OTB snapshots

`hotel_revenue_otb_snapshots` (migration `0103`). Grain: restaurant × as-of business date × stay date × room type. Insert-once. 90-day horizon. Night Audit capture after a successful `close_business_date`.

## 8. Pickup semantics

Pickup = snapshot − snapshot. Never live OTB versus a snapshot. Never `created_at` as pickup. Calendar 7D markers reuse the same pair math.

## 9. Restriction and rate context

Calendar restriction marks and effective rates come from `loadRevenueRateCalendar` (`hotel_rate_restrictions` + `hotel_rate_calendar`). Marks are OR’d across plans on the room type. Overrides are calendar overrides, not live reprice.

## 10. Color bands

Sold Out, High Occupancy, Elevated Occupancy, Open Inventory, plus Stop Sell overlay. Thresholds reuse `REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT` (90) and `REVENUE_CONTROL_LOW_REMAINING_RATIO` (0.2). Never demand scores.

## 11. Forecast unavailable

`forecastAvailable` remains false everywhere. Copy is **Forecast: Not Yet Available**. No Forecast Occupancy, Forecast Revenue, Expected Pickup, or Demand Score.

## 12. UI-16 Forecast History

`view=forecast-history` stays `implemented: false`. OTB snapshots are not forecast history. No forecast table or engine.

## 13. Official APIs

`getRevenueDemandOverview`, `getRevenueOtbSnapshots`, `getRevenueOtbSnapshotHistoryStart`, `getRevenuePickupPace`, `getRevenueDemandCalendar`. Capture: `captureRevenueOtbSnapshot` (server / Night Audit only).

## 14. Access

`canViewForecast` — owner/manager. Reads use `requireRateManager`. Capture is server/internal.

## 15. Pricing contract preserved

`price_hotel_stay` remains in `0016`. Demand and calendar reads do not reprice reservations.

## 16. Availability denominator

Unchanged: active rooms × nights. May include OOO/OOS. Documented as `availabilityIncludesFutureOosRisk`.

## 17. Tests

`demand.test.ts`, `demand-overview.test.ts`, `pickup-pace.test.ts`, `demand-calendar.test.ts`, plus Phase 1 workspace/access/control locks, Phase 2 rate-* locks, Phase 3 restriction-* locks, and `na1.test.ts`.

## 18. Out of scope / next

UI-16 · forecast engine · expected pickup · YoY · demand score · competitor · auto-price · View Reservations deep link · new migration/RPC · Night Audit financial / pricing / Room & Inventory / Property Setup changes.

Ready for the next Rate & Revenue phase. Do not reopen live demand math, snapshot immutability, or pickup honesty.
