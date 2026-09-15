# Create Reservation — Phase 1 Section 8 programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 (Section 8 GATE only) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section8.md`](./specs/create-reservation-phase1-section8.md) |
| **ENGINEERING** | **PASS** — [#154](https://github.com/NORUDEVGIT/NORU/pull/154) MERGED (`e891f5c1`) |
| **Issue** | [#151](https://github.com/NORUDEVGIT/NORU/issues/151) **CLOSED** completed |
| **Implemented** | Section 8 GATE **Yes** (DER). Attach / bind / quote lines **OUT**. Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 8 of 8 — Packages (**conditional / GATE**). Catalog detect + honesty box only. **Not** full Create Reservation DONE |
| **Catalog finding** | Setup stay-package catalogue **EXISTS** (`pms_packages` + SET3 UI). Create bind + `quoteStay` package lines **DO NOT EXIST**. **GATE** — no attach / no fake sticky totals |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` — **unchanged** (no package arg). Walk-in same writer |
| **Detect / sticky** | `getPmsSet3Snapshot` (`packagesAvailable` + active count). Visible gated Packages box. Sticky **Packages not attached on create — not in this quote**. Settings link SET3 editors only |
| **Independent QA** | Rekik **PASS** (pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered) |
| **Migration** | **NONE**. Dual-lane APPLY **N/A**. Flag Abel **NOT** required |
| **Attach / bind / invent pricing / FO extras / meal plans on create** | **OUT** |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Phase 1 COMPLETE** | **NO** |
