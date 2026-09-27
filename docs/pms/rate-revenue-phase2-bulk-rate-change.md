# Rate & Revenue — Phase 2 UI-04 Bulk Rate Change + UI-05 Impact Review

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not UI-06. |
| **Status** | RR-P2-04 implemented |
| **Route** | `/restaurant/pms/rates-revenue?view=bulk-rate-change` |

UI-05 is a workflow step inside this view. It is not a primary navigation view.

## Target expansion

Wizard state is local. Shared `RevenueContext` only seeds `fromDate`, `toDate`, `roomTypeId`, and `ratePlanId`.

Room types and rate plans are multi-select. Each rate plan belongs to one room type. Removing a room type drops incompatible selected plans. Plans are never invented.

The request expands to `{ ratePlanId, date }[]`. Room type is not sent as pricing input.

`selectedPlans × inclusive dates` is capped at **366**. Over-cap selections are blocked with an honest message. The range is not truncated.

The Rate Calendar display still clamps to 14 columns. The wizard scope may be longer. Occupancy join uses calendar cells that exist; dates outside the 14-day preview show "—".

## Wizard steps

1. **Select scope** — date range, room types, rate plans
2. **Set Rate** — official rule
3. **Review** — `previewRateChanges` (read-only)
4. **Confirm** — `applyRateChanges` once

## Supported operations

`SET_RATE` · `PERCENT_INCREASE` · `PERCENT_DECREASE` · `COPY_FROM_DATE` · `RESET_OVERRIDE`

Percentage uses each date's current effective rate (`override ?? base`). Server preview is authoritative.

`RESET_OVERRIDE` deletes the `hotel_rate_calendar` row. It does not write base as an override.

`SET_RATE` is blocked when selected plans use mixed currencies.

Reason is optional.

Source for this workflow is `rate_revenue`.

## Preview semantics

Preview is read-only. Review columns: date, room type, rate plan, current, new, delta, %, restrictions, validation.

Summary cards: affected dates / plans / room types, valid / invalid targets, override-cell count, average absolute delta when present.

Copy: "This preview shows the operational rate changes that will be applied. Existing reservation pricing snapshots are not changed."

No estimated revenue, incremental bookings, or forecast uplift.

## Inventory join

Occupancy / rooms sold / rooms available are joined from `getRevenueRateCalendar` by `roomTypeId` + `date`. Display context only. Pricing is unchanged.

## Restrictions

CTA, CTD, stop sell, min stay, max stay are review context. They do not block apply unless backend validation says so.

## No approval

CTA is **Confirm & Apply**. No Submit for Approval, Save as Draft, or approval-required copy. Approvals remain UI-26–UI-30.

Viewers without `canEditDailyRates` can review and cannot apply. Server still uses `requireRateManager`.

## Atomic apply

One `applyRateChanges` call. Expected versions come from the preview. All targets succeed or none do.

Stale: "One or more rates changed after this preview. Refresh and review the changes again." The wizard returns to Review. No auto-retry.

Any other apply failure is a single error. No partial-success state.

Success: "Rate changes applied." Offers Return to Rate Calendar and View Rate History.

## Query invalidation

- `["revenue-rate-calendar"]`
- `["revenue-control"]`
- `["rate-change-history"]`
- `["bulk-rate-preview"]`

## Out of scope

UI-06 full history · new RPC · new migration · pricing SQL · Room & Inventory edits · forecast · approvals.
