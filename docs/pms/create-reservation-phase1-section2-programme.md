# Create Reservation — Phase 1 Section 2 programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section2.md`](./specs/create-reservation-phase1-section2.md) |
| **ENGINEERING** | **PASS** — [#132](https://github.com/NORUDEVGIT/NORU/pull/132) MERGED |
| **Issue** | [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** completed |
| **Implemented** | Section 2 **Yes** (DER). Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 2 of 8 — Company / Travel Agency on create. Stay / rate / room / guarantee = later sections |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (atomic Company/TA bind) |
| **Closes** | **AC-W4-5 for create** (Company + TA master IDs on create; detail attach remains) |
| **Migration** | `0059_pms_create_reservation_company_ta` — **non-prod APPLY PASS** (version `20260915125648`, project `qcwptraosaudcbjasmul`); **prod Abel-gated NOT applied**. New columns **NONE**; RLS **UNCHANGED** |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Phase 1 COMPLETE** | **NO** |
| **Follow-up (not a reopen)** | Individual Associations **AC-CR2A** — impl [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED / IMPLEMENTATION PASS; [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **OPEN** until Outcome Review. [#127](https://github.com/NORUDEVGIT/NORU/issues/127) stays **CLOSED** |
