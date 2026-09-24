# Rate & Revenue — Phase 2 remaining-work audit

| Field | Value |
|---|---|
| **Classification** | Remaining-work record after RR-P2-01 / 02 / 03 / 04 |
| **Date** | 2026-09-24 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | UI-01–UI-05 implemented. UI-06 + Phase 2 closeout remain. |

This file is the remaining-work audit. It is not UI-06.

## 1. Current Phase 2 status

RR-P2-01, RR-P2-02, RR-P2-03, and RR-P2-04 are present. No regressions on those surfaces.

`rate-history` is still `implemented: false` and renders `RevenueFoundationView`.

## 2. Completed surfaces

| UI | Status |
|---|---|
| UI-01 Revenue Control | Complete |
| UI-02 Rate Calendar | Complete |
| UI-03 Rate Detail & Edit | Complete |
| UI-04 Bulk Rate Change | Complete (RR-P2-04) |
| UI-05 Impact Review | Complete (workflow inside UI-04) |
| UI-06 Rate Change History | Not implemented as a primary view |

## 3. UI-04 remaining work

None for Phase 2. Official preview/apply, 366 cap, five operations, mixed-currency SET_RATE block, local wizard state.

## 4. UI-05 remaining work

None for Phase 2. Deterministic review table, inventory join, no estimate/approval CTAs, Confirm & Apply, stale return to Review.

## 5. UI-06 remaining work

Build `rate-history` as a primary view:

- paginated table from `listRateChangeHistory`
- operation detail drawer from `getRateChangeOperationDetail`
- filters: changed-between (`created_at` from/to), room type, rate plan, action type
- omit Published / Pending / Approved
- omit or disable Export (UI-40)
- honest empty copy: history starts at migration `0101`
- optional actor display-name enrich (no migration)
- RI table + drawer / Sheet
- flip `implemented: true`

## 6. Backend gaps

| Surface | Gap |
|---|---|
| UI-04 / UI-05 | None |
| UI-06 | Actor display name only (`actorMembershipId` exists). No new RPC or migration. |

## 7. Frontend gaps

UI-06 view, filters, pagination, detail drawer. Drawer snippet and Control Center recent activity already exist.

## 8. Routing changes

When UI-06 lands:

- [`rate-revenue-workspace.ts`](../../src/packages/pms/lib/rate-revenue-workspace.ts): `rate-history` `implemented: true`
- [`rates-workspace.tsx`](../../src/packages/pms/components/workspaces/rates-workspace.tsx): `case "rate-history"`
- workspace tests: remove `rate-history` from `foundationRevenueViews()`

UI-05 stays inside `bulk-rate-change`.

## 9. Query invalidation

Already used after apply:

- `["revenue-rate-calendar"]`
- `["revenue-control"]`
- `["rate-change-history"]`
- `["bulk-rate-preview"]` (bulk only)

## 10. Error states

UI-04/05 handle `RATE_CHANGE_STALE`, inactive / out-of-range / missing plans, invalid dates, negatives, over-max, and atomic failure without partial success.

UI-06 should reuse the same history load error pattern as the calendar drawer.

## 11. Responsive design

UI-04/05: xl work surface + 380px wizard; below xl Sheet.

UI-06: desktop table + right drawer; mobile cards + Sheet.

## 12. Visual acceptance

Room & Inventory language: cream `#F7F4EE`, ink `#251605`, gold `#C89933`. No blue-heavy primary actions.

## 13. Test plan

Existing: `rate-change.test.ts`, `revenue-control.test.ts`, `rate-calendar.test.ts`, `bulk-rate-change.test.ts`, Phase 1 locks.

Still required for UI-06 + closeout:

- history filters and pagination
- operation grouping in the detail drawer
- 0101 empty honesty
- no export / no fake statuses
- integration A–K (calendar apply → history → bulk apply → grouped operation → Control Center)

## 14. Open decisions

None block UI-06.

| Decision | Current behavior |
|---|---|
| Past-date edits | Not blocked |
| Night Audit closed dates | No rule |
| Reason required? | Nullable |
| Inventory color bands | Calendar uses RI 20%/10% as inventory labels |
| History page size | Domain default 25, max 100 |

## 15. Remaining implementation prompt

**One prompt:** RR-P2-05 — UI-06 Rate Change History + Phase 2 closeout.

Do not split further. Backend already exists.

## 16. Phase 2 definition of done

- [x] UI-01 implemented
- [x] UI-02 implemented
- [x] UI-03 implemented
- [x] UI-04 implemented
- [x] UI-05 implemented
- [ ] UI-06 implemented
- [x] Phase 2 writes use `applyRateChanges`
- [x] bulk apply atomic
- [x] stale conflicts handled
- [ ] immutable history visible as a primary view
- [ ] history paginated
- [x] no fake forecast / approval / competitor / demand-threshold / publish
- [x] RI visual language on shipped screens
- [x] pricing SQL and snapshots unchanged
- [x] Property Setup ownership unchanged
- [ ] remaining tests pass after UI-06

```
PHASE 2 REMAINING AUDIT: COMPLETE
UI-01: COMPLETE
UI-02: COMPLETE
UI-03: COMPLETE
UI-04: COMPLETE
UI-05: COMPLETE
UI-06: NOT IMPLEMENTED
Backend needed for UI-06: PARTIAL
New migration still required: NO
Pricing SQL changes required: NO
Approval backend required: NO
Forecast backend required: NO
Recommended remaining Cursor prompts: 1
Next prompt: RR-P2-05 — UI-06 Rate Change History + Phase 2 closeout
Phase 2 blockers: none
```
