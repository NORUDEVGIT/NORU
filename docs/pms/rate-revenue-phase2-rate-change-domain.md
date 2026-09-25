# Rate & Revenue — Phase 2 rate-change domain (RR-P2-01)

| Field | Value |
|---|---|
| **Classification** | Domain / API record. **Not** UI-03–UI-06. |
| **Migration** | Dual-lane `0101_pms_rate_change_events.sql` |
| **Pricing SQL** | Unchanged (`0016`) |

## Official API

| Function | Role |
|---|---|
| `previewRateChanges` | Read-only. Re-derives plan, currency, base, override, restrictions. |
| `applyRateChanges` | One `apply_hotel_rate_changes` RPC. Recalculates proposed rates. All-or-nothing. |
| `listRateChangeHistory` | Offset pagination. Default 25. Filters: created-at range, plan, room type, action, actor. |
| `getRateChangeOperationDetail` | All events for one `operation_id` (or via event id). Property-scoped. |

Browser may submit: targets, rule, expected concurrency tokens, reason.  
Server does **not** trust room type, currency, base rate, or proposed nightly rate from the client.

`saveRateOverride` remains the Rate Calendar compatibility writer (JS upsert/delete, no history). Official Phase 2 apply is `applyRateChanges`. UI-03 should route the calendar cell save through that API after `0101` is applied. Do **not** loop `saveRateOverride` for bulk apply.

## Operations

`SET_RATE` · `PERCENT_INCREASE` · `PERCENT_DECREASE` · `RESET_OVERRIDE` · `COPY_FROM_DATE`

Percentage source = **current effective rate** (`override ?? base`).

`RESET_OVERRIDE` **deletes** the `hotel_rate_calendar` row. It does not write base as a fake override. After reset, `effectiveRate = hotel_rate_plans.base_rate`.

`COPY_FROM_DATE` copies the **source date's effective rate** for the same property + plan. It does not copy a browser-supplied number.

## Rounding

Final nightly rate is `numeric(12,2)`.

- SQL apply: `ROUND(value, 2)` on `numeric`
- JS preview: calculate at full precision, then `roundNightlyRate` (half-up for values ≥ 0)

No Property Setup rounding rules are invented here.

## Concurrency

Preview returns `expectedVersion` per target:

- existing override → calendar `updated_at`
- no override → `absent`

Apply rechecks. Any mismatch raises `RATE_CHANGE_STALE` and rolls the whole operation back. No last-write-wins.

## Operation grouping

One apply request → one `operation_id`.

- Single edit → one event row
- Bulk edit → many event rows

Action types: `single_rate_change` · `bulk_rate_change` · `reset_override` · `copy_rate`

## History

`hotel_rate_change_events` is immutable (no UPDATE/DELETE from application code; table trigger raises `RATE_CHANGE_EVENT_IMMUTABLE`). Owner/manager may SELECT. Writes only through the apply RPC.

History **starts at migration/deployment**. Do not backfill pre-`0101` calendar changes. UI-06 must be honest about that.

Staff audit gets a lightweight `rate_change_applied` pointer (`operation_id`, action, count, source). UI-06 reads the domain table, not staff-audit columns.

## Open product decisions

1. **Past-date / Night Audit-closed dates** — not blocked. No new policy.
2. **Reason required?** — reason is nullable; blank trims to null; persisted when supplied. UI/product decides later.

## Out of scope

Forecast / revenue uplift · approvals · commercial-action framework · UI-01–UI-06 screens · repricing existing reservations · Property Setup ownership changes.
