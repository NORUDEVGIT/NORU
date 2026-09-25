# Rate & Revenue — Phase 4 demand foundation (RR-P4-01)

| Field | Value |
|---|---|
| **Prompt** | RR-P4-01 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | Domain foundation implemented. UI-12–UI-16 not shipped. |
| **History start** | Migration `0103` — no backfill of earlier OTB. |

## Live OTB

On the Books = currently qualifying reservations overlapping a stay date. Official read: `getRevenueDemandOverview` → `loadRevenueDemandOverview` → `buildDemandModel`.

Grain: **stay date × room type**. Inventory belongs to the room type. Rate-plan occupancy is not computed.

## Reservation statuses

`confirmed`, `checked_in`, `checked_out` — same as `REVENUE_STATUSES` / Revenue Control.

- **Pending is not included.** Open product decision preserved so Phase 1 metrics stay unchanged. Inventory RPCs still count pending separately.
- **Cancelled and no-show are excluded** from current OTB.
- Group stays: one `hotel_reservations` row = one room. Count rows, not travelers.

## Metric formulas

Reuse `computeBookedRevenueOverview`:

- Occupancy = rooms on books / available rooms
- Booked room revenue = sum of `nightly_rate_snapshot` rates for the stay date
- ADR = booked revenue / revenue sold nights
- RevPAR = booked revenue / available rooms
- Priced share = priced nights / revenue sold nights

Reservations are **not** repriced. Unpriced sold nights stay in occupancy and can understate ADR. `pricedRooms` / `pricedShare` expose coverage.

## Availability

`availabilityBasis = active_hotel_rooms`. Available rooms = `hotel_rooms` where `active = true`, same as Control Center / Rate Calendar. **May include OOO/OOS.** Not silently changed.

## Recent booking activity

Reservations whose property-local `created_at` date falls in the last 7 days ending on the business date. This is **not** pickup.

## Lead time

`arrival_date −` property-local created date. Honest current-state analytics. Not pace.

## Range

Default: 30 future stay dates from `restaurants.business_date`. Max live / snapshot horizon: **90** days inclusive (`D` through `D + 89`). As-of date is the property business date, never the browser clock. `created_at` buckets use the property timezone.

## Rate plan and commercial filters

A rate-plan filter applies to booked revenue, ADR, and recent bookings only. Occupancy / rooms remaining stay room-type inventory. Segment / source / channel are **not** accepted — they would mislabel shared-inventory occupancy. No sales-channel column exists on reservations.

## Snapshot table

`hotel_revenue_otb_snapshots`. **OTB snapshots, not forecast snapshots.**

Grain / unique: `(restaurant_id, as_of_business_date, stay_date, room_type_id)`.

Immutable: `BEFORE UPDATE OR DELETE` raises `OTB_SNAPSHOT_IMMUTABLE`. Insert-once; unique conflict is `already_present`. No update.

Horizon: 90 stay dates from the **closed** business date. Cadence: once per business date after a successful Night Audit close. Approximate growth: 1 property × 365 as-of days × 90 stay dates × 8 room types ≈ 260k rows/year. No retention job.

No backfill. History starts when capture is enabled. `getRevenueOtbSnapshotHistoryStart` returns the earliest `as_of_business_date`.

## Night Audit integration

`closeBusinessDate` calls `captureOtbSnapshotAfterClose` **after** `close_business_date` succeeds, and again on an already-closed retry.

- Close semantics, posting, blockers, and business-date roll are unchanged.
- Snapshot failure is logged and returned as `otbSnapshotStatus: "failed"`. The close is **not** rolled back.

Capture is server/internal. It is not exported as a browser server function. Reads use `requireRateManager` (owner/manager / `canViewForecast`).

## True pickup

`computePickup({ current, prior })` = current OTB − prior OTB for the same stay date × room type (rooms, revenue, occupancy points, ADR). Missing prior is **not** treated as zero. Windows `[1, 3, 7, 14]` are helpers only. No YoY / same-lead-time pace.

## Not in this foundation

Predictive forecast · forecast table · demand score · UI-12–UI-16 · automatic pricing · approvals · OTA · Room & Inventory / Property Setup ownership changes · `price_hotel_stay` changes.
