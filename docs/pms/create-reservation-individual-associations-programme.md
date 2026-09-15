# Create Reservation — Individual Associations programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik PRODUCT AMEND LOCKED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-individual-associations.md`](./specs/create-reservation-individual-associations.md) |
| **KIND** | Follow-up **amend** to Section 2 — **Individual only** (AC-CR2A) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Implemented** | **No** |
| **Prior lock** | Spec [#126](https://github.com/NORUDEVGIT/NORU/pull/126) · delivery [#132](https://github.com/NORUDEVGIT/NORU/pull/132) · [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** / OPERATIONALLY ACCEPTED — **do not reopen** |
| **Issue** | Relates upcoming **new** Eng issue (not #127) |
| **Route** | Extend `/restaurant/bookings/new` — Associations always visible on Individual |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (0059 optional master IDs; non-prod PASS; prod Abel-gated) |
| **Change** | OLD: hide Company/TA on Individual. NEW: optional Company + optional TA Associations box; prefill from guest links; persist on create |
| **Migration** | No new columns. Eng confirms dual-bind XOR lift if both masters selected. Dual-lane APPLY HELD if RPC replaced |
| **Guest GE1–GE3** | Stay closed — reuse only |
| **Phase 1 COMPLETE** | **NO** |
