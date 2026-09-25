# Rate & Revenue — Phase 3 audit (UI-07–UI-11)

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Phase 2** | UI-01–UI-06 complete. |
| **RR-P3-01** | **Foundation implemented.** Restriction-change domain, immutable history, atomic apply. |
| **RR-P3-02** | **UI-07 COMPLETE.** Restriction Calendar. **UI-08 COMPLETE.** Restriction Detail/Edit. |
| **RR-P3-03** | **UI-09 COMPLETE.** Bulk Apply Restriction. **UI-10 COMPLETE.** Impact Review. |
| **RR-P3-04** | **UI-11 COMPLETE.** Restriction Change History + Phase 3 closeout. |

## Current operational facts

- `pms_commercial_restrictions` is Property Setup / Card 3 catalogue only.
- `hotel_rate_restrictions` is the operational pricing source.
- `saveRateRestriction` remains a compatibility export. `RateRestrictionsTab` is unmounted. UI-07–UI-11 do not call it.
- `price_hotel_stay` remains in migration `0016` and is unchanged.
- `hotel_rate_restrictions.updated_at` exists and is the concurrency token.
- Clear-all / all-default still deletes the operational row.
- No template FK was added.
- Immutable `hotel_rate_restriction_change_events` starts at `0102` (no backfill).
- Atomic `apply_hotel_rate_restrictions` for single and bulk.

## Ownership

Do not merge setup catalogue and operational restrictions. Pricing continues to read `hotel_rate_restrictions` only.

## Pricing contract (protected)

Unchanged:

- CTA / min stay / max stay checked on arrival.
- CTD checked on departure.
- Stop sell checked for every occupied night in `[arrival, departure)`.
- Existing reservation snapshots are not cancelled, repriced, or amended.

## Phase 3 surfaces

| UI | Status |
|---|---|
| UI-07 Restriction Calendar | COMPLETE |
| UI-08 Restriction Detail/Edit | COMPLETE |
| UI-09 Bulk Apply Restriction | COMPLETE |
| UI-10 Impact Review / Confirmation | COMPLETE |
| UI-11 Restriction Change History | COMPLETE |

Workspace: `restrictions` mounts UI-07. `apply-restriction` mounts UI-09/UI-10. `restriction-history` mounts UI-11.

## PHASE 3 REMAINING WORK

NONE

## Open product decisions (preserved)

1. Active plan / `valid_from` / `valid_to` are **not** enforced on restriction apply.
2. Past dates and Night Audit-closed dates are **not** blocked.
3. Reason remains optional.
4. Overlapping reservation count is **not** in preview. UI-10 joins calendar inventory for the first 14 days.

## Intentional exclusions

Approvals (UI-26–UI-30) · OTA/distribution sync · forecast/revenue impact · Room & Inventory changes · template persistence · export (UI-40) · Phase 4 Demand & Forecast (UI-12–UI-16).
