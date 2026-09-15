# Create Reservation — Phase 1 Section 4 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section4.md`](./specs/create-reservation-phase1-section4.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Implemented** | **No** |
| **Section** | 4 of 8 — Availability / room type only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer). `_room_type_id` already bound |
| **Availability** | Reuse CURRENT `getRoomTypeAvailability` (`count_sellable_rooms` / `count_reserved_rooms`). Map integers to **available / limited / none**. Server `assert_reservation_capacity` remains SoT. **Do not** invent LIVE OTA / RMS / overbooking |
| **Migration** | **LIKELY NONE.** Eng confirms. Dual-lane APPLY HELD only if SECURITY DEFINER inventory/create RPCs replaced. Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Out** | Specific room assign (Section 6); rate sticky pricing / D5 (Section 5); Group allotment; Company/TA; Confirm product (Section 7 — expose state only) |
| **Phase 1 COMPLETE** | **NO** |
