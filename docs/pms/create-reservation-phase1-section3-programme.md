# Create Reservation — Phase 1 Section 3 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section3.md`](./specs/create-reservation-phase1-section3.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Implemented** | **No** |
| **Section** | 3 of 8 — Stay only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (upgrade Stay UX; do **not** rebuild writer; walk-in stays a mode of the same writer) |
| **Scope** | Arrival required + property TZ honesty; departure/nights linked; invalid range blocked; occupancy; notes persist; sticky stay summary; no fake totals |
| **Migration** | **Likely NONE** — stay fields already on create RPC. Eng confirms |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Does not wait on** | Section 2 merge (PR #126) |
| **Phase 1 COMPLETE** | **NO** |
