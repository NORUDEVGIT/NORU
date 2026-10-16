# Rate & Revenue — Phase 4 Demand Calendar + Demand Detail (RR-P4-04)

| Field | Value |
|---|---|
| **Prompt** | RR-P4-04 / UI-15 + UI-14 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | Demand Calendar implemented. Demand Detail ships as a drawer. Forecast History remains foundation. |
| **Route** | `?view=demand-calendar` (workspace view, not a new route) |

## Grain

The grid is **stay date × room type**. Occupancy is room-type inventory, never a rate-plan occupancy row. Context fields are date range and room type only.

## Official API

`getRevenueDemandCalendar` → `loadRevenueDemandCalendar` → `buildDemandCalendarModel`.

One browser call. The server batches:

1. `loadRevenueDemandOverview` — live OTB occupancy
2. `loadRevenueRateCalendar` — operational `hotel_rate_restrictions` + `hotel_rate_calendar`
3. `loadRevenuePickupPace` with `windowDays: 7`

Access: `canViewForecast` / `requireRateManager`.

## Visible window

Default: **14 stay dates** forward from `restaurants.business_date` when the URL has no `from`/`to`. The visible grid always clamps to 14 columns. Previous / Next jump **7** days. Today = business date.

## Cell

Live occupancy %, rooms on books, remaining, available, booked revenue, ADR, RevPAR, priced share, recent bookings, and days to arrival come from the live demand read.

Restriction marks are **OR** across that room type’s plans (SS, CTA, CTD, Min, Max). Override is true when any plan on that type/date has a calendar override. 7D pickup is snapshot-to-snapshot and omitted when no comparable pair exists. It is never recent booking activity.

## Color bands

Occupancy / inventory only, from Control Center constants (90% high occupancy, 20% low remaining):

- Sold Out — remaining ≤ 0
- High Occupancy — occupancy ≥ 90 and remaining > 0
- Elevated Occupancy — remaining/available ≤ 0.2, remaining > 0, occupancy < 90
- Open Inventory — otherwise
- Stop Sell — overlay; may apply even when rooms remain

Never High / Low / Normal Demand.

## UI-14 Demand Detail

A **drawer**, not `view=forecast-detail`. Desktop ~420px panel; tablet/mobile Sheet.

Copy: **Live on-the-books demand for the selected stay date.** Small information block only: **Forecast: Not Yet Available**.

Tabs: Overview, Pickup (1/3/7/14 via `getRevenuePickupPace` for that stay date + room type), Rates & Restrictions, Related.

Quick actions seed `from`/`to` and `roomType` only: Rate Calendar, Restrictions, Pickup & Pace. View Reservations is omitted.

## Honesty

No forecast occupancy/revenue, expected pickup, demand score, YoY, competitor, auto-price, or recommended rate. UI-16 stays foundation. No new migration or RPC.
