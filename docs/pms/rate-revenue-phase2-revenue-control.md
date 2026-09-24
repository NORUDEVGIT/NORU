# Rate & Revenue — Phase 2 UI-01 Revenue Control

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not UI-02–UI-06. |
| **Status** | RR-P2-02 implemented |
| **Route** | `/restaurant/pms/rates-revenue?view=control-center` |

## Read model

`getRevenueControlWorkspace` is owner/manager only. Reports still uses `getRevenueOverview` + `RevenueOverviewTab` (local last 30 days).

Formulas stay in `computeBookedRevenueOverview`. Known Phase 1 gaps are unchanged: available nights may include OOO/OOS; ADR is understated by unpriced sold nights; booked ≠ posted ≠ collected.

## Filter scope

| Context | Occupancy / available / RevPAR | Booked revenue / ADR / sold nights | Tables / alerts / history |
|---|---|---|---|
| Dates | Applied (clamped to 62 days) | Applied | Applied |
| Room type | Applied — same active-room count | Applied | Applied |
| Rate plan | Not applied | Applied | Applied |
| Segment / source / channel | Not applied | Not applied | Not applied |

If URL has no `from`/`to`, Control Center seeds the last 30 property days into shared context.

## Alerts and signals

Documented constants only:

- Occupancy ≥ 90% → High occupancy
- Remaining / available ≤ 0.2 → Low remaining inventory
- Remaining = 0 → No remaining inventory
- Stop sell / CTA / CTD / min / max from `hotel_rate_restrictions`
- Overrides on more than half the focused-plan dates → Override active
- Focused plan `valid_to` within 14 days of the property business date → Rate plan ending

Signals: `High Occupancy` · `Low Remaining Inventory` · `Restriction Active` · `Override Active` · `Open`. Never High/Low Demand.

## History

Recent activity reads `hotel_rate_change_events`. Empty or pre-0101:

> No rate changes have been recorded since rate-change history was enabled.

## Out of scope

Forecast · approvals · competitor / rate-shopping · UI-02–UI-06 screens · Room & Inventory edits · pricing SQL.
