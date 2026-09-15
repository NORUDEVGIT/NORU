# Create Reservation — Phase 1 Section 5 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section5.md`](./specs/create-reservation-phase1-section5.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Implemented** | **No** |
| **Section** | 5 of 8 — Rate plan + sticky pricing only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer). Optional `_rate_plan_id` already bound; null skips `price_hotel_stay` |
| **Quote** | Reuse CURRENT `quoteStay` → `price_hotel_stay`. Sticky total = **server** quote. Browser math ignored. **Do not** invent LIVE RMS / OTA / commission |
| **D5 locks** | Rate **required** for Confirm/Guarantee. Unpriced **Pending only + permission**. Honest sticky totals |
| **Fixed Rate** | **OUT / gated** — CURRENT has no create fixed/manual path |
| **Migration** | **LIKELY NONE** (core). Eng confirms. Dual-lane APPLY HELD only if SECURITY DEFINER pricing/create RPCs replaced. Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Parallel** | Individual Associations amend Spec [#137](https://github.com/NORUDEVGIT/NORU/pull/137) / impl [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED; [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** / OPERATIONALLY ACCEPTED. Does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) |
| **Out** | Room assign (Section 6); Guarantee/Confirm product (Section 7 — expose state); packages (Section 8); Fixed Rate; adjustment %; RTC; Corporate/Group products; email/SMS |
| **Phase 1 COMPLETE** | **NO** |
