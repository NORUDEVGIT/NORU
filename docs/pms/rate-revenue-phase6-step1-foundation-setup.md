# Rate & Revenue — Phase 6 Step 1 — Foundation + Competitor Setup

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **P6-STEP-01 FOUNDATION + SETUP COMPLETE** |
| **Screen** | UI-24 Competitor Setup |

## 1. Backend tables

Dual-lane migration `0108_pms_rate_shopping_foundation.sql` (drizzle + supabase, identical).

| Table | Purpose |
|---|---|
| `hotel_competitors` | Property-owned competitor master. Name, active, location label, notes. No rank/tier/score. |
| `hotel_competitor_provider_mappings` | Generic inbound provider identity. Unique per competitor+provider and per restaurant+provider+external property. |
| `hotel_competitor_room_mappings` | Manual NORU room type → external room. Exact duplicates blocked. Multiple external variants allowed. `mapping_status = manual` only. |
| `hotel_rate_shopping_fetch_runs` | Future fetch-run ledger. Statuses: running / success / partial / failed. No scheduler. |
| `hotel_competitor_rate_observations` | Append-only inbound observations. Source currency. Tax basis defaults to `unknown`. |

`hotel_competitor_rate_mappings` (rate-plan comparability) is **not** created.

## 2. RLS and writes

All five tables have RLS. Authenticated owner/manager may SELECT. Authenticated INSERT/UPDATE/DELETE is not granted. Setup writes go through Rate Manager server functions + `service_role`. Observation and fetch-run writes are internal server helpers only.

## 3. Immutability

`hotel_competitor_rate_observations` blocks UPDATE and DELETE (`RATE_SHOPPING_OBSERVATION_IMMUTABLE`). Append is allowed only through `insertRateShoppingObservationBatch`.

## 4. Setup ownership

Competitor setup is Rate & Revenue operational. Provider credentials stay future Integrations ownership. This step stores no secrets and does not reuse outbound `distribution_*` mappings.

## 5. Competitor master

Create / edit / deactivate / reactivate. Soft disable via `active = false`. No hard delete in UI.

## 6. Provider mapping

Free-text provider identifier, normalized to a lowercase token when safe. Identifies the competitor in a *future* inbound provider. No connection status.

## 7. Room mapping

Requires an active provider mapping first. Maps one NORU room type to one external room. No auto-match and no confidence score.

## 8. Comparability helper

`assessCompetitorRateComparability` is a pure V1 helper for later Step 3 use. Comparable only when stay date, room mapping, occupancy, currency, and tax basis are known and equal. It does **not** claim board, refundability, or rate-plan parity.

## 9. UI-24

`view=competitor-setup` mounts `CompetitorSetupView`. KPIs are setup counts only. Drawer tabs: Overview, Provider Mapping, Room Mapping. No rates, history, trend, refresh, or shop actions.

## 10. Provider dependency

Live rate collection is unavailable. Helper copy: "Live rate collection requires a connected provider." `market-intelligence` remains `implemented: false`.

## 11. Unsupported in this step

UI-22 / UI-23 / UI-25 · live provider · fake rates · FX · freshness · market averages · rankings · recommendations · rate-plan mapping · Phase 5 pricing changes.
