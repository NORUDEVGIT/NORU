# Create Reservation — Individual Associations programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 (Associations amend only) |
| **Spec** | [`docs/pms/specs/create-reservation-individual-associations.md`](./specs/create-reservation-individual-associations.md) |
| **KIND** | Follow-up **amend** to Section 2 — **Individual only** (AC-CR2A). Does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) |
| **ENGINEERING** | **PASS** — [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED (`c1a236d447bdef07e48643494bb91a3877a225bf`) |
| **Issue** | [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** completed — OPERATIONALLY ACCEPTED |
| **Implemented** | Associations amend **Yes** (DER IMPLEMENTATION PASS · IQ PASS · formal closure YES). Phase 1 / Create Reservation DONE = **NO** |
| **Prior lock** | Spec [#126](https://github.com/NORUDEVGIT/NORU/pull/126) · delivery [#132](https://github.com/NORUDEVGIT/NORU/pull/132) · recon [#134](https://github.com/NORUDEVGIT/NORU/pull/134) · [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** / OPERATIONALLY ACCEPTED — **do not reopen** |
| **Spec baseline** | Docs [#137](https://github.com/NORUDEVGIT/NORU/pull/137) — AC-CR2A-1…15 |
| **Route** | `/restaurant/bookings/new` — Associations always visible on Individual (own box beside Guest + sticky summary) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (0059 optional master IDs; 0060 dual-bind lift) |
| **Change** | OLD (#127): hide Company/TA on Individual. NEW: optional Company + optional TA; prefill `employer` / `booker_ta`; persist both; dual-bind allowed |
| **Migration** | `0060_pms_create_reservation_individual_associations` — **non-prod APPLY PASS** (version `20260915134818`, project `qcwptraosaudcbjasmul`; 0059 present; dual-bind verified). **Prod 0060 / 0059 Abel-gated NOT applied**. New columns **NONE**; RLS **UNCHANGED** |
| **Residuals** | Prod apply Abel-gated. Corporate/Group later. Missing `cn` import on `new.tsx` is residual tsc polish (out of #138 scope). No Phase 1 DONE |
| **Guest GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — reuse only |
| **Phase 1 COMPLETE** | **NO** |
