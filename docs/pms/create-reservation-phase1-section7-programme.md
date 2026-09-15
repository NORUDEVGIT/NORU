# Create Reservation — Phase 1 Section 7 programme note

| Field | Value |
|---|---|
| **STATUS** | **IMPLEMENTATION PASS** (Section 7 only) — awaiting Outcome Review / Rekik formal closure. Do **not** claim OPERATIONALLY ACCEPTED |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section7.md`](./specs/create-reservation-phase1-section7.md) |
| **ENGINEERING** | **PASS** — [#155](https://github.com/NORUDEVGIT/NORU/pull/155) MERGED (`b3994fd9`) |
| **Issue** | [#153](https://github.com/NORUDEVGIT/NORU/issues/153) **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED |
| **Implemented** | Section 7 **Yes** (DER). Email / SMS / deposit / gateway **OUT**. Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 7 of 8 — Guarantee + review/confirm + on-screen confirmation only. **Not** full Create Reservation DONE |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in same writer). Optional `_commercial_booking_source` / `_market_segment` / `_external_reference` / `_guarantee_method` |
| **Statuses** | **Save as Pending** → `pending`. **Confirm / Guarantee** → `confirmed` + guarantee. Draft / Guaranteed are **not** new DB statuses. **No** Cancelled / No-show at create |
| **Guarantee** | Required on Confirm. Pending optional. Values from active `pms_payment_methods` else cashier `PAYMENT_METHODS`. Labels only — **no** gateway / folio post |
| **Payment terms** | Read-only from Company/TA master when linked. **Not** a credit engine. **Not** snapshotted on the reservation row |
| **Source / segment / ref** | Required on Confirm (ref optional). Distinct from channel-origin `source` (still `'staff'` residual). Persist via **0061** only |
| **Success** | In-place confirmation panel + `window.print`. Secondary Open reservation to detail. **No** email/SMS |
| **Deposit** | Stays **FO check-in**. No create-time cashiering |
| **FO walk-in** | Confirmed + rate **without** guarantee (TIP option 1). Create path Unassigned still allowed |
| **Independent QA** | Rekik **PASS** (pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered) |
| **Migration** | **0061** dual-lane. Non-prod **APPLY PASS** on `qcwptraosaudcbjasmul` version `20260915144627` (columns verified). **Prod 0061 / 0059 / 0060 Abel-gated**. Writer flag `CREATE_RESERVATION_SECTION7_APPLY` still **HELD** → Confirm **fail-closes** until flipped. Flag Abel **NOT** required |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Email / SMS / create-time deposit / gateway / credit engine** | **OUT** |
| **Phase 1 COMPLETE** | **NO** |
