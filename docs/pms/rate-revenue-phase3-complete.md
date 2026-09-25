# Rate & Revenue — Phase 3 complete

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **PHASE 3 — RESTRICTION CONTROL: COMPLETE** |
| **Surfaces** | UI-07 → UI-11 |

## 1. Phase 3 objective

Ship operational Restriction Calendar, single and bulk restriction apply, impact review, and immutable restriction-change history. Property Setup remains the restriction-template owner. Pricing SQL and reservation snapshots stay on migration `0016`.

## 2. UI-07 Restriction Calendar

`view=restrictions` mounts `RestrictionCalendarView`. Rows are Room Type → Rate Plan. Cells read operational `hotel_rate_restrictions` via `getRevenueRateCalendar`. Markers: SS, CTA, CTD, Min/Max. Visible window: 14 days.

## 3. UI-08 Restriction Detail/Edit

Right-side drawer: Overview / Edit Restriction / History. Edit uses `previewRestrictionChanges` then `applyRestrictionChanges` with `source: restriction_calendar`. SET_FIELDS sends only changed fields. CLEAR_ALL deletes the operational row. Stale copy is honest.

## 4. UI-09 Bulk Apply

`view=apply-restriction` four-step wizard. Targets expand to `{ ratePlanId, date }[]`, cap 366. Date range is not clamped to the 14-day calendar window. Room type is never sent on apply.

## 5. UI-10 Impact Review

Review/confirm steps inside the same wizard. Deterministic before/after, inventory join for the first 14 days. CTA: **Confirm & Apply**. No estimated revenue. No approval.

## 6. UI-11 Restriction History

Primary view `restriction-history`. Table + filters + server pagination + operation detail drawer. Source: `hotel_rate_restriction_change_events`. **Changed Between** filters `created_at`, not stay date. History starts at migration `0102`. No export. No Published/Pending/Approved.

Actor names are enriched from `restaurant_users` + `profiles` after `requireRateManager`. Fallback: `Staff`. Names are not written into history rows.

## 7. Restriction-change domain

Official API: `previewRestrictionChanges`, `applyRestrictionChanges`, `listRestrictionChangeHistory`, `getRestrictionOperationDetail`.

Single and bulk share one domain. Browser never supplies current restriction state as authority.

## 8. SET_FIELDS semantics

Optional patch. Omitted fields stay unchanged. `null` clears nullable min/max. Explicit `false` clears a boolean. At least one field is required. All-default after patch deletes the operational row.

## 9. CLEAR_ALL semantics

Deletes the operational row. Missing-row CLEAR_ALL is a valid no-op: no write, no history event.

## 10. Atomicity

One `apply_hotel_rate_restrictions` RPC. All targets succeed or none do. One `operation_id` per apply.

## 11. Concurrency

Preview returns `expectedVersion` (`updated_at` or `absent`). Apply aborts with `RESTRICTION_CHANGE_STALE`.

## 12. Immutable history

`hotel_rate_restriction_change_events` is append-only. Staff audit gets a pointer only. UI-11 reads the domain table. Full before/after snapshot per target, not one event per field.

## 13. Operation grouping

One apply → one `operation_id`. Single edit: one event. Bulk: many events. UI-11 drawer loads `getRestrictionOperationDetail` once.

## 14. Property Setup template boundary

`pms_commercial_restrictions` stays Card 3 catalogue. No template FK on operational rows or history.

## 15. Pricing contract preserved

`price_hotel_stay` remains in `0016`. CTA / min / max on arrival. CTD on departure. Stop sell on every occupied night.

## 16. Existing reservation behavior

Restriction apply does not cancel, reprice, or amend existing reservations. Snapshots stay unchanged.

## 17. No approvals

No draft / pending / approved / rejected. Approvals remain UI-26–UI-30.

## 18. No distribution sync

No OTA push, channel manager, or publish status.

## 19. Template prefill deferred

Card 3 kinds exclude max stay; `roomTypeIds` do not map to plan×date targets; workspace does not load commercial restriction masters.

## 20. Open product decisions

1. Active plan / `valid_from` / `valid_to` are not enforced on restriction apply.
2. Past dates and Night Audit-closed dates are not blocked.
3. Reason remains optional.
4. Overlapping reservation count is not in preview; UI-10 joins calendar inventory for 14 days.

## 21. Tests

`restriction-change.test.ts`, `restriction-calendar.test.ts`, `bulk-restriction-change.test.ts`, `restriction-history.test.ts`, plus Phase 2 rate/control locks and Phase 1 workspace/access/config locks.

## 22. Phase 4 readiness

Ready for UI-12 → UI-16 Demand & Forecast. Do not reopen pricing, snapshots, or Property Setup ownership.

## Legacy writer

`saveRateRestriction` remains exported for compatibility and Phase 1 tests. `RateRestrictionsTab` is unmounted. Rate & Revenue UI-07–UI-11 do not call it.
