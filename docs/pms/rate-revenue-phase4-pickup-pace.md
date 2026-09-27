# Rate & Revenue — Phase 4 Pickup & Pace (RR-P4-03)

| Field | Value |
|---|---|
| **Prompt** | RR-P4-03 / UI-13 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | Pickup & Pace implemented. YoY and forecast pace still unavailable. |
| **Route** | `?view=pickup-pace` (workspace view, not a new route) |

## Semantics

Pickup is **snapshot minus snapshot** for the same stay date × room type.

```
current hotel_revenue_otb_snapshots row
− prior hotel_revenue_otb_snapshots row
```

It is never derived from live reservations + `created_at`. Recent Booking Activity is omitted from this view.

Pace, for Phase 4, is the selected short-term window: **1 / 3 / 7 / 14** business days. Default **7D**. No YoY, same-lead-time, or forecast pace.

## Current and prior snapshots

- **Current Snapshot** = latest `as_of_business_date` in the table. Not the live property business date. If Night Audit has not closed, today is not current.
- **Compared With** = `priorAsOfDate(currentAsOf, windowDays)` — exact date only. No nearest-available substitution.
- Header shows both dates. Browser today is never the comparison basis.

## Windows

If the exact prior as-of does not exist: “No snapshot exists for the selected comparison date.” plus “N-day pickup is not available yet because snapshot history has not accumulated far enough.” Missing prior is **not** zero.

One snapshot only: “Pickup requires at least two OTB snapshots.” No snapshots: honest empty. Do not flash zero pickup.

## Comparable rows

A pair is comparable only when both current and prior rows exist for the same `stay_date × room_type_id`. One side missing → excluded. No implicit zero-fill. This matters because older snapshots have a 90-day horizon and may omit farther future stay dates.

Summary totals use comparable pairs only. `comparableRows` / `excludedRows` / `coverageTotal` are returned. Partial coverage copy: “Pickup is based on N of M comparable stay-date/room-type snapshot rows.”

## Metrics

| Label | Formula |
|---|---|
| Rooms Pickup | current `rooms_on_books` − prior |
| Revenue Pickup | current `booked_room_revenue` − prior (no reprice) |
| Occupancy Change | current occupancy % − prior occupancy % in **pts** |
| ADR Change | current snapshot ADR − prior snapshot ADR |

Negative pickup is valid. Occupancy / ADR rollups recompute from summed snapshot rooms/revenue/available, then subtract — they are not averages of cell deltas.

Availability denominator is the captured snapshot value and may include OOO/OOS. If current or prior priced share is below 100%, revenue pickup may be understated.

## Filters

Date range + optional room type. Default stay range: 30 days forward when the URL has no `from`/`to` (`defaultDemandRange`). Max 90. Rate plan is stripped from this view’s context fields — snapshot grain has no rate plan. Segment / source / channel are not accepted.

## History start

“Pickup history available from {earliest `as_of_business_date`}.” No pre-0103 backfill.

## Official API

`getRevenuePickupPace` → `loadRevenuePickupPace` → `buildPickupModel` + `computePickup`. Access: `canViewForecast` / `requireRateManager`. Capture and Night Audit stay on P4-01.

## Not in this prompt

UI-14–16 · YoY · forecast · recent-bookings-as-pickup · live-vs-snapshot · rate-plan/commercial pickup · new migration / RPC · Night Audit / pricing / Room & Inventory / Property Setup changes.
