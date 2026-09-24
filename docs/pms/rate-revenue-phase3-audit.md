# Rate & Revenue — Phase 3 audit (UI-07–UI-11)

| Field | Value |
|---|---|
| **Classification** | Pre-implementation audit + RR-P3-01 closeout. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Phase 2** | UI-01–UI-06 complete. |
| **RR-P3-01** | **Foundation implemented.** Restriction-change domain, immutable history, atomic apply. |
| **RR-P3-02** | **UI-07 and UI-08 implemented.** Restriction Calendar + Detail/Edit. |

## Current operational facts (pre-flight)

These still hold after RR-P3-01:

- `pms_commercial_restrictions` is Property Setup / Card 3 catalogue only.
- `hotel_rate_restrictions` is the operational pricing source.
- `saveRateRestriction` remains a compatibility export. UI-07/UI-08 do not call it; `RateRestrictionsTab` is unmounted.
- `price_hotel_stay` remains in migration `0016` and is unchanged.
- `hotel_rate_restrictions.updated_at` exists and is the concurrency token.
- Clear-all / all-default still deletes the operational row.
- No template FK was added.

RR-P3-01 added what the audit said was missing:

- Immutable `hotel_rate_restriction_change_events` (starts at `0102`, no backfill).
- Atomic `apply_hotel_rate_restrictions` for single and bulk.
- Official APIs: `previewRestrictionChanges`, `applyRestrictionChanges`, `listRestrictionChangeHistory`, `getRestrictionOperationDetail`.

## Ownership

Do not merge setup catalogue and operational restrictions. Pricing continues to read `hotel_rate_restrictions` only.

## Pricing contract (protected)

Unchanged:

- CTA / min stay / max stay checked on arrival.
- CTD checked on departure.
- Stop sell checked for every occupied night in `[arrival, departure)`.
- Existing reservation snapshots are not cancelled, repriced, or amended.

## RR-P3-01 foundation

| Item | Status |
|---|---|
| Shared validation path | Done |
| Deterministic preview | Done |
| Atomic single/bulk apply | Done |
| Immutable history + operation grouping | Done |
| Optimistic concurrency (`absent` / `updated_at`) | Done |
| SET_FIELDS partial patch | Done |
| CLEAR_ALL deletes row; missing-row no-op | Done |
| No-op history suppressed | Done |

## Still not implemented (later prompts)

| Prompt | Surfaces |
|---|---|
| RR-P3-02 | **Done.** UI-07 Restriction Calendar + UI-08 Restriction Detail/Edit |
| RR-P3-03 | UI-09 Bulk Apply Restriction + UI-10 Impact Review |
| RR-P3-04 | UI-11 Restriction Change History + Phase 3 closeout |

Workspace: `restrictions` mounts UI-07. `apply-restriction` and `restriction-history` remain `implemented: false`.

## Open product decisions (preserved)

1. Active plan / `valid_from` / `valid_to` are **not** enforced on restriction apply (matches `saveRateRestriction`).
2. Past dates and Night Audit-closed dates are **not** blocked.
3. Reason remains optional.
4. Overlapping reservation count is **not** in RR-P3-01 preview (avoid N+1 / pricing-domain coupling). UI-10 may join calendar inventory later.

## Intentional exclusions

Approvals (UI-26–UI-30) · OTA/distribution sync · forecast/revenue impact · Room & Inventory changes · template persistence · export (UI-40).
