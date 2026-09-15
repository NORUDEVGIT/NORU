# Create Reservation — Phase 1 Section 4 programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** pending Outcome Review — DER PASS 2026-09-15 |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section4.md`](./specs/create-reservation-phase1-section4.md) |
| **ENGINEERING** | **PASS** — [#133](https://github.com/NORUDEVGIT/NORU/pull/133) MERGED |
| **Issue** | [#131](https://github.com/NORUDEVGIT/NORU/issues/131) **OPEN** until Outcome Review / Rekik formal closure YES |
| **Implemented** | Section 4 **Yes** (DER). Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 4 of 8 — Availability / room type only. Rate / specific room / guarantee = later sections |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (`_room_type_id` bind kept) |
| **Availability** | `getRoomTypeAvailability` SoT — **available** (`> 2`) / **limited** (`> 0 && <= 2`) / **none** (`=== 0`). Occupancy soft-warn. Sticky type+state. `NO_AVAILABILITY` preserved |
| **Migration** | **NONE**. Dual-lane APPLY **N/A**. No SECURITY DEFINER inventory/create RPC replace |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Phase 1 COMPLETE** | **NO** |
