# Create Reservation — Phase 1 Section 3 programme note

| Field | Value |
|---|---|
| **STATUS** | **OPERATIONALLY ACCEPTED** pending Outcome Review — ENGINEERING PASS 2026-09-15 |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section3.md`](./specs/create-reservation-phase1-section3.md) |
| **ENGINEERING** | **PASS** — [#135](https://github.com/NORUDEVGIT/NORU/pull/135) MERGED (`562a990`) |
| **Issue** | [#129](https://github.com/NORUDEVGIT/NORU/issues/129) **OPEN** until Outcome Review / Rekik formal closure YES |
| **Spec baseline** | [#128](https://github.com/NORUDEVGIT/NORU/pull/128) **SUPERSEDED** (OPEN / Eng-ready text STALE — do **not** merge as-is) |
| **Implemented** | Section 3 **Yes** (engineering). Phase 1 / Create Reservation DONE = **NO** |
| **Section** | 3 of 8 — Stay UX only. Rate / availability invent / room / guarantee / packages = later sections |
| **Route** | `/restaurant/bookings/new` (additive) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (upgrade Stay UX; walk-in same writer) |
| **Stay rules** | Arrival required + property TZ honesty. Departure ↔ nights **linked**. Arrival change: **keep nights, move departure**. Invalid range blocked (min 1 night) |
| **Occupancy** | Soft-warn reuses Section 4 `OccupancySoftWarn` (warn-only; not hard-block) |
| **Sticky** | Honest stay (dates, nights, occupancy) + Section 4 type/availability. No-fake-total honesty preserved |
| **Independent QA** | Rekik review path existed before merge (READY FOR REKIK CHECK). **No verified IQ PASS comment** — do not invent. Honesty = ENGINEERING PASS + #129 **OPEN** |
| **Migration** | **NONE**. Dual-lane APPLY **N/A**. RLS **UNCHANGED**. Flag Abel **NOT** required |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed |
| **Phase 1 COMPLETE** | **NO** |
