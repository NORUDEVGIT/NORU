# Rate & Revenue — Phase 3 Bulk Apply Restriction

| Field | Value |
|---|---|
| **Prompt** | RR-P3-03 |
| **Surfaces** | UI-09 Bulk Apply Restriction, UI-10 Restriction Impact Review / Confirmation |
| **Status** | Implemented |
| **Route** | `view=apply-restriction` |
| **Template prefill** | Deferred |

## Workflow

One four-step wizard. UI-10 is steps 3–4 of this view, not a separate route.

1. **Select scope** — date range, multi room types, multi rate plans.
2. **Define restriction** — `SET_FIELDS` tri-state patch or official `CLEAR_ALL`.
3. **Review impact** — read-only `previewRestrictionChanges`.
4. **Confirm & Apply** — one `applyRestrictionChanges` call with preview `expectedVersions`.

Desktop: left summarized scope + optional 14-day Restriction Calendar preview, 380px right wizard. Tablet/mobile: Sheet.

Wizard selections stay in local state. `RevenueContext` only seeds `fromDate`, `toDate`, and optional `roomTypeId` / `ratePlanId`. Temporary wizard state is not written to the URL.

## Target expansion

Targets are `{ ratePlanId, date }`. Room type is re-derived from the rate plan and is never sent on apply. Changing room types prunes incompatible plans.

Date range is **not** clamped to the 14-day UI-07 window. The calendar preview shows the first 14 days; the wizard uses the full range.

Over the 366-target cap: Next is blocked. No silent truncate.

## SET_FIELDS tri-state

| Control | Unchanged | Set / On | Clear / Off |
|---|---|---|---|
| Min / Max | omit | integer 1–365 | `null` |
| CTA / CTD / Stop Sell | omit | `true` | `false` |

`CLEAR_ALL` is a separate operation. It is never simulated as an all-default `SET_FIELDS` patch.

Client validation before preview: at least one plan, valid date range, at least one changed field for `SET_FIELDS`, stay integers 1–365, and `max >= min` when both are being set. Server remains authority.

Inactive / out-of-validity plans are informational notes only. They are not blocked (same as RR-P3-01).

Reason is optional.

## Review (UI-10)

`previewRestrictionChanges` is read-only, `source: "rate_revenue"`, no `expectedVersions`.

Table: Date, Room Type, Rate Plan, Changed Fields, Before → After (humanized), Occ. / Sold / Avail., Validation.

Inventory is joined from `getRevenueRateCalendar` by `roomTypeId` + `date` for the first 14 days. Later dates show "—".

Summary cards only: Affected Dates, Rate Plans, Room Types, Changed Fields, Valid / Invalid Targets. No estimated revenue or forecast.

Existing reservations stay as booked. Stop sell / CTA / CTD warnings are informational. Stop sell on occupied dates does not block apply.

## Confirm

Primary CTA: **Confirm & Apply**. Apply is gated by `canApplyRestrictions`. Apply is disabled while the mutation is pending.

Stale conflict (`RESTRICTION_CHANGE_STALE`): return to Review. Atomic failure: coherent error, wizard state preserved. No partial success.

Success copy: **Restrictions applied.** Actions: Return to Restrictions, View Restriction History (UI-11 remains foundation).

Invalidation keys:

- `["revenue-rate-calendar"]`
- `["revenue-control"]`
- `["restriction-change-history"]`
- `["rate-restrictions"]`

There is no `restriction-calendar` query key.

## Template prefill — deferred

Apply Template is omitted on purpose:

- Card 3 restriction kinds exclude max stay.
- Template `roomTypeIds` do not map cleanly to plan × date targets.
- The workspace does not load `listRevenueCommercialMasters`.

Card 3 remains Property Setup catalogue only. No template FK is written.

## Ownership and pricing

`pms_commercial_restrictions` stays Property Setup. `hotel_rate_restrictions` stays the operational source. `price_hotel_stay` and reservation snapshots are unchanged. No new migration or RPC. Official apply remains `apply_hotel_rate_restrictions`.

## Intentional exclusions

UI-11 Restriction History workspace · approvals · forecast / revenue engine · OTA / distribution sync · Room & Inventory changes · template persistence.
