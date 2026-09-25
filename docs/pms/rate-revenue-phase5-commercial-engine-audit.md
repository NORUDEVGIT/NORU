# Rate & Revenue — Phase 5A commercial engine audit

| Field | Value |
|---|---|
| **Classification** | Design + implementation audit. **Not** a Functional Spec. **Not** UI-17–21. |
| **Date** | 2026-09-25 |
| **Branch** | `feature/guest-preferences-workspace` |
| **P5A-01** | **Foundation implemented.** Schema + domain types + immutable history. |
| **P5A-02** | **Promotion engine implemented.** Eligibility, quote compose, create/reprice/amend attribution. |
| **P5A-03** | **Package engine implemented.** Eligibility, quote compose, create/reprice/amend package attribution. |
| **P5A-04** | **Activation preview/apply + history implemented.** Commercial Engine V1 backend complete. |

## 1. Executive summary

Card 3 masters exist. `price_hotel_stay` (0016) still prices room + plan + dates only. Before P5A-01 there was no operational promotion/package activation, no reservation commercial attribution, and no Rate & Revenue commercial history.

P5A-01 adds operational tables and types. It does **not** apply activations, compose quotes, or change reservation create/reprice.

The earlier read-only Phase 5 UI audit file (`rate-revenue-phase5-audit.md`) was never written. This document stands alone.

## 2. Pre-flight

| Check | Result |
|---|---|
| Latest prior migration | `0103_pms_revenue_otb_snapshots.sql` |
| `pms_promotions` / `pms_promotion_room_types` | `0076` |
| `pms_packages` / components / room-type / rate-plan joins | `0049` + `0072` |
| `hotel_reservations` | `0013` |
| `price_hotel_stay` | Unchanged in `0016` |
| Prior operational activation / attribution / commercial history | None |

## 3. Ownership

Property Setup remains master owner. Rate & Revenue owns operational activation, attribution, and commercial change events. See [`rate-revenue-responsibility.md`](./rate-revenue-responsibility.md) and [`rate-revenue-phase5-commercial-engine-foundation.md`](./rate-revenue-phase5-commercial-engine-foundation.md).

## 4. Why separate activation tables

Masters are catalogues. Activating them in place would rewrite history when a manager edits a promotion or package. Snapshot-on-activate keeps execution fields on `hotel_*` rows.

## 5. Promotion activation

`hotel_promotion_activations` + room-type + rate-plan mappings. Stay window + booking window + priority. Snapshots code, name, kind, value.

## 6. Package activation

`hotel_package_activations` + room-type + rate-plan mappings. Stay window only. Snapshots price, `per_stay`, components.

## 7. Empty mapping semantics

| Scope | Empty rows mean |
|---|---|
| Promotion room types | Inherit master room-type mappings |
| Promotion rate plans | All property rate plans |
| Package room types | Inherit master package room types |
| Package rate plans | Inherit master package rate plans |

Do not store fake `ALL` rows. Narrowing is allowed; broadening is rejected later at apply.

## 8. Reservation attribution

`hotel_reservation_promotions` 0..1. `hotel_reservation_packages` 0..n. No backfill. Missing rows on older reservations are valid.

## 9. Room money contract

`room_subtotal` and `nightly_rate_snapshot` remain pre-commercial. Promotion discount and package amounts live on child rows. Required so Demand/OTB/ADR/RevPAR stay honest.

## 10. History

`hotel_commercial_change_events`. Immutable. Full before/after including scope. Shared `operation_id` per apply. Not Property Setup staff audit.

## 11. Locked V1 product decisions

- Fixed = amount off stay room subtotal
- Free night deferred from execution
- Explicit promotion selection
- No stacking (global; no DB column)
- Overlaps allowed with warning; priority then discount then `created_at`
- Packages additive `per_stay`
- No DOW
- No source/channel mappings
- No corporate / season / restriction-template wiring

## 12. P5A-01 status

**IMPLEMENTED.** Dual-lane `0104`. Domain: `src/packages/pms/lib/revenue/commercial-engine.ts`. Tests: `commercial-engine.test.ts`.

## 12b. P5A-02 status

**IMPLEMENTED.** Dual-lane `0105`. Domain: `src/packages/pms/lib/revenue/commercial-promotion.ts`. Quote compose calls `price_hotel_stay` then evaluates an explicit selection. Create uses `create_hotel_reservation_priced_commercial` only when a promotion is selected. Reprice and priced amend reevaluate the current attribution in the same transaction. See [`rate-revenue-phase5-promotion-engine.md`](./rate-revenue-phase5-promotion-engine.md).

Not implemented in P5A-02: package pricing, activation apply/preview RPCs, UI, approvals, OTA.

## 12c. P5A-03 status

**IMPLEMENTED.** Dual-lane `0106`. Domain: `src/packages/pms/lib/revenue/commercial-package.ts`. Quote compose layers selected packages after the promotion result. Create uses `create_hotel_reservation_priced_commercial` when a promotion and/or packages are selected. Reprice and priced amend reevaluate current package attribution in the same transaction. See [`rate-revenue-phase5-package-engine.md`](./rate-revenue-phase5-package-engine.md).

Not implemented in P5A-03: activation apply/preview RPCs, activation UI, commercial history UI, approvals, OTA, forecast impact, cashiering settlement.

## 12d. P5A-04 status

**IMPLEMENTED.** Dual-lane `0107`. Preview/apply for promotion and package activations, optimistic concurrency, immutable history writes, list/detail reads. See [`rate-revenue-phase5-commercial-activation.md`](./rate-revenue-phase5-commercial-activation.md) and [`rate-revenue-phase5-commercial-engine-complete.md`](./rate-revenue-phase5-commercial-engine-complete.md).

Not implemented: Phase 5 UI, approvals, OTA, forecast impact, cashiering settlement.

## 13. Recommended remaining sequence

1. **P5A-02** — promotion eligibility + commercial quote compose + reservation attribution — **done**
2. **P5A-03** — package eligibility + additive package money — **done**
3. **P5A-04** — preview/apply RPCs + immutable history writes — **done**
4. Later — UI-17–21 over live activations, not masters

## 14. Out of scope until later

UI-17–21, forecast impact, free-night execution, stacking configuration, approvals, OTA, cashiering settlement.
