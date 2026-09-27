# Rate & Revenue — Phase 5 complete

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **PHASE 5 — COMMERCIAL ENGINE & OPERATIONAL UI: COMPLETE** |
| **Surfaces** | UI-17 → UI-21 |

## 1. Scope Delivered

Phase 5 shipped Commercial Engine V1 plus the operational Commercial workspace: Overview, Promotions, Packages, activation wizard, and immutable Commercial History. Property Setup remains the master owner. Rate & Revenue activates and audits those masters. Stay pricing SQL and reservation snapshots stay on migration `0016`.

## 2. Commercial Engine Backend

Migrations `0104`–`0107` (dual-lane). Activations snapshot execution fields so later master edits do not rewrite history. V1 execution: percent and fixed promotions; `per_stay` packages; explicit selection; no stacking; promotion overlaps warn. Official domain: `commercial-engine.ts`, `commercial-promotion.ts`, `commercial-package.ts`, `commercial-*-activation.ts`, `commercial-history.ts`.

## 3. Promotion Engine

Property Setup owns `pms_promotions`. Rate & Revenue owns `hotel_promotion_activations` and mappings. Eligibility and quote compose are snapshot-based. Reservations attribute 0..1 promotion. `room_subtotal` stays pre-commercial; post-promotion room revenue is `room_subtotal_after_promotion`.

## 4. Package Engine

Property Setup owns `pms_packages`. Rate & Revenue owns `hotel_package_activations`. Packages are additive after promotion. Reservations may attach 0..n packages. Charge basis is `per_stay`. Free-night, DOW, source/channel, and advanced package bases stay deferred.

## 5. Activation Apply / History

`apply_hotel_promotion_activation` / `apply_hotel_package_activation` write the activation, mappings, and one logical history operation atomically. `hotel_commercial_change_events` is append-only (`COMMERCIAL_CHANGE_EVENT_IMMUTABLE`). Official reads: `listCommercialChangeHistory`, `getCommercialOperationDetail`, plus UI-21 workspace compose.

## 6. UI-17 Commercial Overview

`view=commercial` mounts `CommercialOverviewView`. Operational KPIs, attention, recent activity (8 rows), and honest attributed performance. Create Activation opens the UI-20 overlay. No forecast impact.

## 7. UI-18 Promotions

`view=promotions` mounts `PromotionsView`. Operational activation of promotion masters. Compact edit / deactivate / reactivate sheets. Master CRUD stays in Property Setup (`CARD3_PROMOTIONS_HREF`).

## 8. UI-19 Packages

`view=packages` mounts `PackagesView`. Operational package availability and attributed package revenue. Master CRUD stays in Property Setup (`CARD3_PACKAGES_HREF`).

## 9. UI-20 Activation Workflow

Contextual overlay only. Not `view=activation`. CREATE wizard: Select → Dates → Scope → Validate → Review → Activate. Preview is authoritative. Apply sends `proposedActivation` plus `expectedVersion`. Stale apply does not auto-retry.

## 10. UI-21 Commercial History

`view=commercial-history` mounts `CommercialHistoryView`. Operation-grouped list, server filters/search/pagination, actor and entity enrichment, before/after drawer. No undo/revert/replay. Default Changed Between range is 30 days.

## 11. Data Ownership

| Domain | Owner | Rate & Revenue may |
|---|---|---|
| Promotion / package masters | Property Setup Card 3 | Read and activate |
| Operational activations | Rate & Revenue | Preview, apply, deactivate |
| Commercial change events | Rate & Revenue | Read only after apply |
| Reservation attribution | Reservation pricing RPCs | Display attributed performance |

## 12. Reservation Attribution Semantics

Attribution is written at priced create / reprice / priced amend. Later activation edits or deactivations do not rewrite existing reservations. There is no historical backfill of pre-engine stays.

## 13. Performance Metric Semantics

Promotion performance uses stay-overlap attribution: bookings, room nights, `discount_amount`, `room_subtotal_after_promotion`. Package performance uses attributed package amounts. These are not forecast, RevPAR uplift, or posted/collected cashiering figures.

## 14. Known Limitations

FO unpriced amend may skip commercial reevaluation. Night Audit OTB snapshots remain occupancy/revenue snapshots, not commercial-impact snapshots. History starts at `0104`/`0107`; older operational writes are not backfilled.

## 15. Explicitly Deferred Capabilities

Approvals · OTA publish/sync · predictive / forecast / RevPAR impact · free-night execution · day-of-week targeting · source / channel / coupon · corporate/season targeting · package per-night/per-person · package consumption tracking · cashiering posting/collection · history rollback/undo/replay · master CRUD in Rate & Revenue · historical attribution backfill.

These are deferred scope, not Phase 5 failures.

## 16. Regression Status

Phase 5 A-01–04 and UI-17–21 tests are the official suite. Rate Calendar / Bulk / History, Restrictions, Demand, reservation create/reprice/amend, revenue-access, workspace, and Card 3 href tests remain the surrounding lock.

Documented pre-existing failures (not introduced here):

- Card 3 `percent={` regex false-positive
- create-reservation AC-CR1-18 generated types still include market_segment / external_reference
- `reservation-amend-impact` vitest runner under `node --experimental-strip-types --test`
- Prompt 4 workspace lock still looks for inline `fromDate: context.fromDate` / `ratePlanId: context.ratePlanId` after views moved to `context={context}`

## 17. Phase 5 Completion Statement

**PHASE 5 COMPLETE.**

Engine safety:

- `price_hotel_stay` body unchanged
- `room_subtotal` semantics unchanged
- `nightly_rate_snapshot` semantics unchanged
- activation edit/deactivate does not rewrite reservations
- Property Setup master ownership unchanged

Ready for Phase 6 rate shopping / competitor intelligence only as a later programme. Phase 5 does not implement market intelligence.
