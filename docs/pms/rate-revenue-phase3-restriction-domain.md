# Rate & Revenue — Phase 3 restriction-change domain

| Field | Value |
|---|---|
| **Prompt** | RR-P3-01 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | Domain foundation implemented. UI-07–UI-11 not shipped. |
| **History start** | Migration `0102` — no backfill of older `hotel_rate_restrictions` writes. |

## Ownership boundary

Property Setup / Card 3 owns `pms_commercial_restrictions`: restriction templates, names/codes, default kind, optional room-type mappings, template validity, and active/inactive master state.

Rate & Revenue owns applied operational restrictions on `hotel_rate_restrictions` by rate plan + stay date.

Pricing reads `hotel_rate_restrictions` only. There is no template FK on the operational table or on history. Templates may prefill the future UI; they are not persisted here.

## Operational table

`hotel_rate_restrictions` remains the operational source. A missing row means:

- `minStay = null`
- `maxStay = null`
- `closedToArrival = false`
- `closedToDeparture = false`
- `stopSell = false`

`saveRateRestriction` is still the mounted Phase 1 compatibility writer. Official Phase 3 writes use `applyRestrictionChanges`.

## Preview model

`previewRestrictionChanges` is read-only. Each target is `{ ratePlanId, date }`. Room type, plan name, and current restriction state are re-derived on the server.

Returned per target: before/after of the five restriction fields, `changedFields`, `expectedVersion`, validation status/messages, and `noOp`.

Preview does **not** include revenue impact, forecast, approval, OTA status, or overlapping reservation counts. Overlapping stays stay on the calendar/inventory read model for UI-10.

## Apply model

`applyRestrictionChanges` shares the same validation path as preview. Apply is one transactional RPC: `apply_hotel_rate_restrictions`.

Single and bulk use the same request:

```
RestrictionChangeRequest {
  restaurantId
  targets[]
  operation
  expectedVersions?
  reason?
  source?
}
```

Allowed sources: `restriction_calendar`, `rate_revenue`.

## SET_FIELDS semantics

Optional patch. Omitted fields stay unchanged. `null` clears nullable min/max. Explicit `false` clears a boolean. At least one field is required.

If the patched state is all-default/empty, the operational row is **deleted** (same as `saveRateRestriction`).

## CLEAR_ALL semantics

Deletes the operational row.

Missing-row CLEAR_ALL is a **valid no-op**: no operational write and no history event.

## No-op semantics

If before == after: no row write, no history event. `appliedCount` only counts real changes.

## Concurrency

Preview returns `updated_at` when a row exists, otherwise `absent` (`ABSENT_RESTRICTION_VERSION`). Apply rechecks every target. Any mismatch raises `RESTRICTION_CHANGE_STALE` and aborts the whole operation. No last-write-wins.

## Atomicity

All targets are validated, then written, then history is appended. One failure rolls everything back. The server must not loop `saveRateRestriction`.

## History table

`hotel_rate_restriction_change_events` is the UI-11 source. One full before/after snapshot per changed target. Application reads only. UPDATE/DELETE raise `RESTRICTION_CHANGE_EVENT_IMMUTABLE`.

Staff audit may receive a pointer (`restriction_change_applied`) with operation id, action type, count, and source. It is not the history source.

Actor display names are not stored. UI-11 enriches `actor_membership_id` via `restaurant_users` + `profiles`.

## Operation grouping

One apply request → one `operation_id`.

- SET_FIELDS, one target → `single_restriction_change`
- SET_FIELDS, many targets → `bulk_restriction_change`
- CLEAR_ALL → `clear_restriction`

Multiple fields on one target still produce one event.

## Reason policy

`reason` is optional. Blank trims to `null`. Persisted when supplied.

## Active-plan / validity policy

Not enforced. `saveRateRestriction` only checks that the plan exists on the property. This domain keeps that behavior. Inactive plans and dates outside `valid_from` / `valid_to` are not blocked here.

## Past-date / Night Audit policy

Unresolved product decision. Past dates and Night Audit-closed dates are not blocked.

## Target limit

366 targets, same cap as the rate-change domain.

## Stay bounds

Min/max stay: null or integer 1–365. If both set after the patch: `maxStay >= minStay`.

## Official APIs

- `previewRestrictionChanges`
- `applyRestrictionChanges`
- `listRestrictionChangeHistory` (created_at from/to, optional plan/type/action/actor, page default 25, max 100)
- `getRestrictionOperationDetail` (property-scoped by `operationId` or `eventId`)

## Intentional exclusions

No UI-07–UI-11 screens. No `price_hotel_stay` change. No reservation snapshot mutation. No template FK. No approval workflow. No OTA/distribution sync. No revenue-impact engine.
