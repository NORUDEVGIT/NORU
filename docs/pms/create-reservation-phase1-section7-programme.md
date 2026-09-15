# Create Reservation — Phase 1 Section 7 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section7.md`](./specs/create-reservation-phase1-section7.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| **Implemented** | **No** |
| **Section** | 7 of 8 — Guarantee + review/confirm + on-screen confirmation only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer) |
| **Statuses** | Create writes **pending** \| **confirmed** only. Draft = pending incomplete. Guaranteed = confirmed + guarantee method. **No** Cancelled / No-show at create |
| **Guarantee** | Required on Confirm/Guarantee. Values from CURRENT Setup `pms_payment_methods` (labels only) else CURRENT cashier `PAYMENT_METHODS`. **No** create-time posting. **No** gateway invent |
| **Payment terms** | Read-only from Company/TA master when linked. **Not** a credit engine |
| **Source / segment / ref** | Section 1 still **draft-only**. CURRENT has **no** reservation columns / RPC params. Persist on Confirm via **dual-lane APPLY HELD** additive columns + RPC — Eng names in TIP. Do **not** overload `hotel_reservations.source` channel origin |
| **Success** | On-screen / print confirmation. **No** email/SMS |
| **Deposit** | Stays **FO check-in**. No create-time cashiering |
| **D5 reuse** | Rate **required** to Confirm/Guarantee. Unpriced **Pending + permission** only (Section 5 / #142 LIVE) |
| **Programme rule** | Reference Individual create guarantee/confirm **function** + **modern NORU UI** (boxes, sticky). **Do not** clone legacy chrome |
| **Migration** | **LIKELY YES** (additive columns + RPC params). Dual-lane APPLY **HELD**. Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Parallel** | Section 6 coding ([#145](https://github.com/NORUDEVGIT/NORU/issues/145) / [#148](https://github.com/NORUDEVGIT/NORU/pull/148)) **OK** — do not block |
| **Out** | Create-time deposit posting; email/SMS; credit-approval engine; inventing payment gateway; LIVE OTA/RMS/commission/offline/Group/CR-100/new entitlements; packages (Section 8) |
| **Phase 1 COMPLETE** | **NO** |
