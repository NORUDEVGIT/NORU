# Rate & Revenue — Phase 2 pre-implementation audit (UI-01–UI-06) + RR-P2-01

| Field | Value |
|---|---|
| **Classification** | Implementation audit / architecture record. **Not** a Functional Spec. **Not** UI-01–UI-06 screens. |
| **Date** | 2026-09-24 |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | Audit findings verified against current code. **RR-P2-01 COMPLETE** (domain + history foundation). |

This file did not exist at the start of RR-P2-01. Findings below were verified against the live tree before the domain work landed. They do **not** contradict current code.

## 1. Pre-flight (verified)

| Check | Result |
|---|---|
| Phase 1 architecture exists | **PASS** — `rate-revenue-phase1-complete.md`, workspace, adapters, context, access, metrics |
| Rate & Revenue has no master CRUD | **PASS** — Rate Plans tab is read-only; writers remain on Card 3 |
| Rate Calendar writes `hotel_rate_calendar` | **PASS** — `saveRateOverride` |
| Property Setup remains master owner | **PASS** |
| `price_hotel_stay` unchanged from 0016 | **PASS** — only later copy is the historical greenfield dump |
| Reservation pricing snapshots unchanged | **PASS** |
| `hotel_rate_calendar` is the operational override table | **PASS** |
| `hotel_rate_restrictions` remains separate | **PASS** |
| UI-04 / UI-05 / UI-06 foundation-only | **PASS** — `implemented: false` |

## 2. Rate override contract (protected)

```
effectiveRate = hotel_rate_calendar.nightly_rate
  if an override exists
  otherwise hotel_rate_plans.base_rate
```

Changing an override must **not** mutate existing reservation snapshots. `price_hotel_stay` / priced create / amend / reprice stay on migration `0016`.

## 3. Writers found

| Writer | Surface | Notes |
|---|---|---|
| `saveRateOverride` | Rate Calendar | Single-date JS upsert/delete. No history. No version token. |
| `saveRateOverrideCard3` | Property Setup Card 3 | Duplicate calendar writer. Out of RR-P2-01 scope. |

There was **no** atomic bulk apply path. A JS loop of `saveRateOverride` would not be acceptable.

## 4. History gap

`restaurant_staff_audit_log` is staff-oriented. Card 3 writes a detail string only. It cannot support UI-06 (before/after rates, stay date, plan, operation grouping).

**Recommendation implemented in RR-P2-01:** dedicated `hotel_rate_change_events`. No backfill of pre-migration calendar edits.

## 5. Concurrency gap

`hotel_rate_calendar` has `updated_at` and **no** version column. Preview-then-apply could last-write-wins.

**Recommendation implemented in RR-P2-01:** optimistic token = override `updated_at`, or `absent` when no row. Entire apply aborts with `RATE_CHANGE_STALE`.

## 6. Open product decisions (do not invent)

| Decision | Current behavior |
|---|---|
| Past-date rate edits | **Not blocked** |
| Night Audit–closed date edits | **No rule.** Not blocked. |
| Reason required? | **Nullable.** Blank trims to null. Persist when supplied. |

## 7. Phase 2 screen readiness (still true after RR-P2-01)

| UI | Screen | Domain ready? | UI ready? |
|---|---|---|---|
| UI-01 | Revenue Control | **Yes** — `getRevenueControlWorkspace` | **Yes** — RR-P2-02 (booked metrics, no forecast/approvals) |
| UI-02 | Rate Calendar | Calendar writer exists | **No redesign** in this prompt |
| UI-03 | Rate Detail & Edit | **Yes** — `previewRateChanges` / `applyRateChanges` | **No drawer** |
| UI-04 | Bulk Rate Change | **Yes** — same APIs, atomic RPC | **Foundation only** |
| UI-05 | Impact Review | **Yes** — deterministic preview, no forecast | **No screen** |
| UI-06 | Rate Change History | **Yes** — paginated read APIs | **Foundation only** |

Approvals stay UI-26–UI-30. No generic Draft → Validate → Approval → Apply framework.

## 8. RR-P2-01 implementation status

| Item | Status |
|---|---|
| Shared preview/apply calculation | **Done** — `rate-change.ts` |
| Atomic apply RPC | **Done** — `apply_hotel_rate_changes` |
| Immutable history table | **Done** — `hotel_rate_change_events` |
| Dual-lane migration `0101` | **Done** |
| Concurrency tokens | **Done** |
| RESET deletes override row | **Done** |
| COPY uses source effective rate | **Done** |
| History pagination / operation detail | **Done** |
| Staff audit pointer | **Done** — one `rate_change_applied` row after apply |
| `saveRateOverride` | **Compatibility-only** — Calendar stays working without 0101. Official apply is `applyRateChanges`. UI-03 migrates the calendar cell save after 0101 apply. |
| Forecast / approval | **Not added** |
| UI-01–UI-06 screens | **Not added** |

See [`rate-revenue-phase2-rate-change-domain.md`](./rate-revenue-phase2-rate-change-domain.md).
