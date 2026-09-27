# Rate & Revenue — Phase 4 Demand & Forecast Overview (RR-P4-02)

| Field | Value |
|---|---|
| **Prompt** | RR-P4-02 / UI-12 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | Demand & Forecast Overview implemented. Predictive forecast still unavailable. |
| **Route** | `?view=demand-forecast` (workspace view, not a new route) |

## What shipped

`DemandForecastView` mounts on `view=demand-forecast` and consumes **only** `getRevenueDemandOverview`. Access stays `canViewForecast` / `requireRateManager`.

The screen is a Revenue Control twin: live OTB KPIs, two recharts (forward occupancy, booked revenue), room-type nights, deterministic attention, recent booking activity, and an explicit **Forecast: Not Yet Available** card.

## Range

When the URL has no `from`/`to`, the workspace applies `defaultDemandRange(businessDate)` — 30 stay dates forward from `restaurants.business_date`. If a range is already in the URL, it is passed through. The server clamps to 90 days.

## KPI honesty

Summary values are **room nights over the selected range**, not physical room counts.

| Label | Source |
|---|---|
| OTB Occupancy | `summary.occupancyPercent` |
| Booked Room Nights | `summary.roomsOnBooks` |
| Remaining Room Nights | `summary.roomsRemaining` |
| Booked Room Revenue | `summary.bookedRoomRevenue` |
| ADR / RevPAR | `summary.adr` / `summary.revpar` |
| Priced Share | `summary.pricedShare` |
| Recent Booking Activity | `summary.recentBookings` |

Header shows **As of {business date}**. Recent bookings are never labeled Pickup.

## Attention

Flags reuse Control Center constants: occupancy ≥ 90% → **High Occupancy**; remaining / available ≤ 0.2 → **Low Remaining Inventory**; plus **Restriction Active** and **Rate Override**. Never High/Low Demand.

**View Restrictions** is offered when restriction counts exist. Pickup & Pace and Demand Calendar stay unlinked (still foundation).

## Forecast

`forecastAvailable` remains `false`. The forecast card is informational: a predictive forecast is not configured; the workspace shows live OTB; pickup starts after daily snapshots.

## Limitations shown

- Rate-plan filter applies to revenue / ADR / recent activity only.
- Unpriced sold nights can understate ADR / revenue.
- Future availability may include OOO/OOS.
- Snapshot history starts at `snapshotHistoryStartsAt`, or after the first completed business-date snapshot.

## Empty and errors

- No room types → Property Setup copy.
- No OTB → “No on-the-books reservations for this date range.”
- Load failures use `DEMAND_LOAD_ERROR` + `revenueUiError`. Skeleton while loading — zeros are not flashed.

## Not in this prompt

UI-13–16 · pickup UI · forecast engine · demand score · YoY · competitor · auto-price · new migration / RPC · Night Audit / pricing / Room & Inventory / Property Setup ownership changes · `price_hotel_stay` edits.
