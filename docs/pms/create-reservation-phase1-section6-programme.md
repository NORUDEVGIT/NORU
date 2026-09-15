# Create Reservation — Phase 1 Section 6 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section6.md`](./specs/create-reservation-phase1-section6.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| **Implemented** | **No** |
| **Section** | 6 of 8 — Specific room assignment only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer). Optional `_room_id` already bound; null = Unassigned |
| **List / conflict** | Reuse CURRENT `listAssignableRooms` (type + dates; omit clash). Server SoT `assert_reservation_capacity` (`ROOM_NOT_ASSIGNABLE` / `ROOM_ALREADY_BOOKED`). **Do not** invent overbooking / LIVE OTA / RMS |
| **Walk-in honesty** | FO `WalkInDialog` **requires** room. Create Reservation **allows** Unassigned. Booking source Walk-in ≠ FO walk-in |
| **+ create room** | **OUT** — CURRENT has no create-room-from-reservation |
| **Programme rule** | Reference Room pick functionality + **modern NORU UI** (own box, sticky). **Do not** clone legacy chrome |
| **Migration** | **LIKELY NONE.** Eng confirms. Dual-lane APPLY HELD only if SECURITY DEFINER capacity/create RPCs replaced. Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Parallel** | Section 5 coding ([#141](https://github.com/NORUDEVGIT/NORU/issues/141)) and Associations ([#139](https://github.com/NORUDEVGIT/NORU/pull/139)) **OK** — do not block |
| **Out** | Rate (Section 5); Guarantee/Confirm product (Section 7 — expose state); packages (Section 8); RTC; HK full board; Group allotment; inventing room create / overbooking |
| **Phase 1 COMPLETE** | **NO** |
