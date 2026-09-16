# Create Reservation — Phase 1 Section 5 programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section5.md`](./specs/create-reservation-phase1-section5.md) |
| **ENGINEERING** | **PASS** — [#142](https://github.com/NORUDEVGIT/NORU/pull/142) MERGED (`fafd329e`) |
| **Issue** | [#141](https://github.com/NORUDEVGIT/NORU/issues/141) **CLOSED** completed |
| **Implemented** | Section 5 **Yes** (DER). Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 5 of 8 — Rate plan + sticky pricing only. Room assign / guarantee / packages = later sections |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (`_rate_plan_id` bind kept; walk-in same writer) |
| **Quote / sticky** | `quoteStay` / `price_hotel_stay` SoT — sticky total = **same** `quoteStay` object as Rate card. Browser math ignored. Unpriced = Pending + `owner` \| `manager` only. Confirmed without quote **blocked** |
| **Independent QA** | Rekik **PASS** (pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered) |
| **Migration** | **NONE**. Dual-lane APPLY **N/A**. Capability-only; Flag Abel **NOT** required |
| **Fixed Rate / create adjustment / RTC** | **OUT** |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Parallel** | Individual Associations amend Spec [#137](https://github.com/NORUDEVGIT/NORU/pull/137) / impl [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED; [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** / OPERATIONALLY ACCEPTED. Does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) |
| **Phase 1 COMPLETE** | **NO** |
