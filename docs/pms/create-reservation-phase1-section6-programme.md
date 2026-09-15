# Create Reservation — Phase 1 Section 6 programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section6.md`](./specs/create-reservation-phase1-section6.md) |
| **ENGINEERING** | **PASS** — [#148](https://github.com/NORUDEVGIT/NORU/pull/148) MERGED (`73801ada`) |
| **Issue** | [#145](https://github.com/NORUDEVGIT/NORU/issues/145) **CLOSED** completed |
| **Implemented** | Section 6 **Yes** (DER). Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 6 of 8 — Specific room assignment only. Guarantee / packages = later sections |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (`_room_id` nullable bind kept; walk-in same writer) |
| **List / conflict / sticky** | `listAssignableRooms` (type + dates; occupied **omit**). Server SoT `assert_reservation_capacity` (`ROOM_ALREADY_BOOKED` / `ROOM_NOT_ASSIGNABLE`). Sticky **Room** `{number}` (+ floor) or honest **Unassigned**. Type-change toast; stale-date clear-to-Unassigned + toast |
| **Walk-in honesty** | FO `WalkInDialog` **requires** room. Create Reservation **allows** Unassigned (including commercial Walk-in source) |
| **Independent QA** | Rekik **PASS** (pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered) |
| **Migration** | **NONE**. Dual-lane APPLY **N/A**. Flag Abel **NOT** required |
| **+ create room / overbooking / RTC / HK board / second writer** | **OUT** |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Phase 1 COMPLETE** | **NO** |
