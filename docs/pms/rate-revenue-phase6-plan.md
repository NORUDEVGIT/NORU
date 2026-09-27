# Rate & Revenue — Phase 6 plan

| Field | Value |
|---|---|
| **Classification** | Engineering plan. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **P6-01 AUDIT COMPLETE** · **P6-STEP-01 FOUNDATION + SETUP COMPLETE** |

## 1. Objective

Build honest competitor rate shopping. Setup first. Live rates only after a licensed inbound provider exists. Never fabricate competitor prices.

## 2. Gates

| Step | Name | Status |
|---|---|---|
| P6-01 | Rate-shopping audit | **COMPLETE** |
| P6-STEP-01 | Foundation + Competitor Setup (UI-24) | **COMPLETE** |
| P6-STEP-02 | Provider adapter + live ingestion | **BLOCKED** until a licensed inbound provider is selected |
| P6-STEP-03 | Comparison + history (UI-22 / UI-23 / UI-25) | BLOCKED until observations exist |

## 3. Screen map

| UI | View | Status |
|---|---|---|
| UI-22 | `market-intelligence` | **BLOCKED** · `implemented: false` |
| UI-23 | comparison subview | **BLOCKED** |
| UI-24 | `competitor-setup` | **COMPLETE** (setup only, no live rates) |
| UI-25 | history subview | **BLOCKED** |

Rate shopping live: **NO**. Provider: **NONE**.

## 4. Non-goals (all steps)

- Scrape OTAs
- Reuse outbound `distribution_*` mappings as competitor identity
- Convert observation currency
- Invent freshness, market averages, rankings, or recommendations
- Auto-change NORU rates
- Change `price_hotel_stay`, `room_subtotal`, or `nightly_rate_snapshot`
- Change Phase 5 commercial engine semantics

## 5. Access

Reuse `canViewCommercial` and `requireRateManager`. Do not add `canViewRateShopping` until a later step needs it.

## 6. Step 1 record

See [rate-revenue-phase6-step1-foundation-setup.md](./rate-revenue-phase6-step1-foundation-setup.md).

## 7. Next

**P6-STEP-02 — PROVIDER ADAPTER + LIVE INGESTION**

Status: **BLOCKED** until a licensed inbound provider is selected.
