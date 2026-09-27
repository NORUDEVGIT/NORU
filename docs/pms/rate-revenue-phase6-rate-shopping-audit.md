# Rate & Revenue — Phase 6 rate-shopping audit

| Field | Value |
|---|---|
| **Classification** | Audit record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **P6-01 AUDIT COMPLETE** |
| **Verdict** | **Option D** — no live inbound competitor data exists. Do not fabricate market intelligence. |

## 1. Question

Can Rate & Revenue show honest competitor rates, history, or market position today?

## 2. Answer

No.

There is no competitor master, no inbound rate-shopping provider, no competitor observation table, no competitor history, and no competitor room-mapping model. Outbound distribution mappings (`distribution_*`) identify *our* property on OTAs. They must not be reused as competitor identity.

## 3. What exists

| Area | Finding |
|---|---|
| Market Intelligence view | `market-intelligence` is a foundation placeholder (`implemented: false`). |
| Card 6 / SET6 | Outbound integrations catalogue and simulated Test Connection. Metadata only. No vault. |
| `aiosell` / `generic_ota` | Catalogue labels for *our* outbound distribution, not inbound shopping. |
| `hotel_rate_change_events` | Our hotel rate history only. |
| OTB snapshots | Our occupancy / booked revenue only. |
| `pms_exchange_rates` | Property FX for our money, not observation conversion. |
| Card 7 import | Governance catalogue only. |
| Edge functions | No inbound shopping worker. |
| Access | `canViewCommercial` + `requireRateManager`. No `canViewRateShopping`. |

## 4. What does not exist

- `hotel_competitors` or any competitor master
- inbound provider HTTP / SDK / cron
- competitor rate observations
- competitor rate history
- competitor room mappings
- rate-plan comparability metadata from a provider
- licensed inbound rate-shopping contract

## 5. Honesty rule

Do not invent competitor rates, freshness, market averages, rankings, or recommendations. `price_hotel_stay`, `room_subtotal`, and `nightly_rate_snapshot` stay on the Phase 5 / `0016` contracts.

## 6. Recommended path

1. **P6-STEP-01** — provider-independent foundation + Competitor Setup (UI-24).
2. **P6-STEP-02** — licensed inbound provider adapter + live ingestion. **Blocked** until a provider is selected.
3. **P6-STEP-03** — comparison / history surfaces (UI-22 / UI-23 / UI-25) only after observations exist.

## 7. Screen status after this audit

| Screen | Status |
|---|---|
| UI-22 Market Intelligence | BLOCKED |
| UI-23 Comparison | BLOCKED |
| UI-24 Competitor / Mapping Setup | Unblocked for Step 1 (setup only) |
| UI-25 Market History | BLOCKED |
