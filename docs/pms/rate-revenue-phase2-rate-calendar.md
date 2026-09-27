# Rate & Revenue — Phase 2 UI-02 Rate Calendar + UI-03 Rate Detail

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not UI-04–UI-06. |
| **Status** | RR-P2-03 implemented |
| **Route** | `/restaurant/pms/rates-revenue?view=rate-calendar` |

## Read model

`getRevenueRateCalendar` is owner/manager only. After `requireRateManager` it reads through `supabaseAdmin`.

One batched load: property, active rooms, room types, rate plans, sparse calendar overrides (`updated_at` included), sparse restrictions, overlapping reservations.

`effectiveRate = override ?? base`. `expectedVersion` is the override `updated_at`, or `absent`.

Visible columns are clamped to 14 days. Longer shared context ranges show a note. Toolbar Previous / Next jumps 7 days; Today seeds 7 property days from the business date.

Occupancy uses the same Phase 1 denominator as Revenue Control: sold nights from `confirmed` / `checked_in` / `checked_out` stays; available = active `hotel_rooms` for that type. OOO/OOS may still be included.

## Inventory coloring

Cell tint uses remaining / available bands, labeled inventory:

- `>= 0.2` Available
- `>= 0.1` Limited
- else Low Remaining

Never High / Normal / Low Demand. No forecast line.

## Drawer

Selecting a cell opens Rate Detail & Edit (desktop 380px pane, mobile Sheet). Tabs: Overview · Edit Rate · Restrictions · History.

Edit uses `previewRateChanges` then `applyRateChanges` with the cell `expectedVersion`. Source is `rate_calendar`. `RESET_OVERRIDE` deletes the calendar row. Reason is optional.

Stale apply: “The rate changed after this preview. Refresh and review again.”

Inactive plans and dates outside `valid_from` / `valid_to` are read-only in the drawer. The server remains the authority.

History filters `hotel_rate_change_events` by `rate_plan_id` + `stay_date`. Empty copy: “No recorded rate-change history for this date.”

Past-date / Night Audit-closed edits remain unblocked (open product decision). There is no Publish Changes workflow.

## Out of scope

UI-04 bulk wizard · UI-05 review · UI-06 full history · restriction editing · pricing SQL · Room & Inventory edits.
