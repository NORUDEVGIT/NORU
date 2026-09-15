# Create Reservation — Phase 1 Section 1 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor; D1–D13 locked) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section1.md`](./specs/create-reservation-phase1-section1.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Implemented** | **No** |
| **Section** | 1 of 8 — Context + Guest only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer) |
| **Migration** | Likely **NONE** for Section 1 alone. Eng confirms if additive columns are needed for booking source / market segment / external ref |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 COMPLETE** | **NO** |
