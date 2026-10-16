# Rate & Revenue — Phase 2 complete

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **PHASE 2 — REVENUE CONTROL & RATE MANAGEMENT FOUNDATION: COMPLETE** |
| **Surfaces** | UI-01 → UI-06 |

## 1. Phase 2 objective

Ship operational Revenue Control, Rate Calendar, single and bulk nightly-rate edits, impact review, and immutable rate-change history. Property Setup remains the master owner. Pricing SQL and reservation snapshots stay on migration `0016`.

## 2. UI-01 Revenue Control

Booked occupancy, ADR, RevPAR, restriction attention, and recent rate activity. No live forecast, approval, or competitor data.

## 3. UI-02 Rate Calendar

Batched matrix, 14-day display clamp, inventory bands labeled inventory (not demand), official `expectedVersion` on cells.

## 4. UI-03 Rate Detail & Edit

Right-side drawer: Overview / Edit / Restrictions / History. Edit uses `previewRateChanges` then `applyRateChanges`. `RESET_OVERRIDE` deletes the calendar row. Stale copy is honest.

## 5. UI-04 Bulk Rate Change

Local wizard: Select → Set Rate. Targets expand to `{ ratePlanId, date }[]`, cap 366. Five official rules. Mixed-currency SET_RATE blocked.

## 6. UI-05 Impact Review

Review/confirm steps inside bulk. Deterministic before/after, restrictions, inventory join. CTA: **Confirm & Apply**. No estimated revenue. No approval.

## 7. UI-06 Rate Change History

Primary view `rate-history`. Table + filters + server pagination + operation detail drawer. Source: `hotel_rate_change_events`. `Changed Between` filters `created_at`. History starts at migration `0101`. No export. No Published/Pending/Approved.

Actor names are enriched from `restaurant_users` + `profiles` after `requireRateManager` (admin read). Fallback: `Staff`. Names are not written into history rows.

## 8. Rate-change domain

Official API: `previewRateChanges`, `applyRateChanges`, `listRateChangeHistory`, `getRateChangeOperationDetail`.

`effectiveRate = override ?? base`. Browser never supplies the proposed nightly rate.

## 9. Atomicity

One `apply_hotel_rate_changes` RPC. All targets succeed or none do. One `operation_id` per apply.

## 10. Concurrency

Preview returns `expectedVersion` (`updated_at` or `absent`). Apply aborts with `RATE_CHANGE_STALE`.

## 11. Immutable history

`hotel_rate_change_events` is append-only. Staff audit gets a pointer only. UI-06 reads the domain table.

## 12. UI/UX system

Room & Inventory language: cream `#F7F4EE`, ink `#251605`, gold `#C89933`. Compact filters, dense tables, RI pagination, RI drawer/Sheet.

## 13. Intentional exclusions

Forecast · pickup · approvals · market intelligence · promotions · packages · export (UI-40) · restriction apply/history (UI-07+) · publish workflow · demand-threshold product · pre-0101 history backfill.

## 14. Known metric gaps

Control Center and Calendar occupancy use booked stays × active rooms. Segment/source/channel are not applied. Posted/collected revenue and forecast formulas do not exist.

## 15. Open product decisions

Past-date edits not blocked. Night Audit closed dates have no extra rule. Reason remains optional. Inventory color bands are RI remaining-stock labels, not demand.

## 16. Tests

`rate-change.test.ts`, `revenue-control.test.ts`, `rate-calendar.test.ts`, `bulk-rate-change.test.ts`, `rate-history.test.ts`, plus Phase 1 workspace/access/config/metrics/permission locks.

## 17. Phase 3 readiness

Ready for UI-07 → UI-11 Restrictions. Do not reopen pricing, snapshots, or Property Setup ownership.
