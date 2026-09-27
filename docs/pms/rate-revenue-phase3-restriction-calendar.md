# Rate & Revenue — Phase 3 Restriction Calendar

| Field | Value |
|---|---|
| **Prompt** | RR-P3-02 |
| **Surfaces** | UI-07 Restriction Calendar, UI-08 Restriction Detail & Edit |
| **Status** | Implemented |
| **Template prefill** | Deferred |

## UI-07 grid

`view=restrictions` mounts `RestrictionCalendarView`. Rows are Room Type → Rate Plan. Columns are stay dates. Cells read operational `hotel_rate_restrictions` via `getRevenueRateCalendar`.

Visible window: 14 days, 7-day Previous/Next, Today = property business date. Shared `RevenueContext` supplies Date Range / Room Type / Rate Plan only.

## Restriction semantics

Markers: SS (stop sell, red), CTA / CTD (amber), Min n / Max n (neutral). Empty row: **Open**. Inventory occupancy is secondary context only.

Card 3 templates are not displayed as applied restrictions.

## UI-08 drawer

Desktop: 380px right panel. Tablet/mobile: Sheet. Tabs: Overview / Edit Restriction / History.

Overview shows the five operational fields, inventory, and last change from `hotel_rate_restriction_change_events`. Empty row: “No restrictions applied”.

## Official preview / apply

Edit uses `previewRestrictionChanges` then `applyRestrictionChanges` with `source: restriction_calendar`. SET_FIELDS sends only changed fields. `CLEAR_ALL` is the dedicated Clear restrictions action and deletes the operational row.

## Concurrency

`expectedVersion` is `hotel_rate_restrictions.updated_at` or `absent`. Stale apply shows: “The restriction changed after this preview. Refresh and review again.”

## Reason

Optional. Blank trims to null.

## History tab

`listRestrictionChangeHistory` filtered by `ratePlanId` + `stayDate`. Link: View Full Restriction History → `view=restriction-history` (UI-11 still foundation).

## Template behavior

Deferred. No Apply Template control. No template id persisted.

## Legacy writer status

`saveRateRestriction` remains exported for compatibility/tests. `RateRestrictionsTab` is unmounted. Rate & Revenue UI-07/UI-08 do not call `saveRateRestriction`.

## No pricing change

`price_hotel_stay` and reservation snapshots are unchanged. Future quotes read live operational rows.
