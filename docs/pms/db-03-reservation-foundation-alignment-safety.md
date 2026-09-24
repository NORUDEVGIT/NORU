# DB-03 — Reservation Foundation Alignment & Safety Plan

Planning record plus **DB03-B01 implementation**. CURRENT = non-prod `qcwptraosaudcbjasmul`. Production = **UNKNOWN**.

Authoritative prior records: [DB-00](./db-00-reservation-deployed-schema-truth.md), [DB-01 / DB-02](./db-01-db-02-reservation-core-ownership-contract.md).

## Executive summary

Read models (DB-04) must not sit on a generic writer that can overwrite Front Office stay states.

**DB-04 verdict after B01:** **READY FOR DB-04** (prerequisite satisfied). Other DB-03 items remain documented debt.

**Do not:** open Section 7, reapply 0095, unify cancellation, bind group on create, or infer production.

---

## DB03-B01 — RESOLVED (2026-09-23)

**Problem:** `setReservationStatus` accepted any current row status as source and could UPDATE `checked_in` / `checked_out` / `no_show` to pending/confirmed/cancelled.

**Implementation path (CODE ONLY):**

- Allowlist `BOOKING_STATUS_TRANSITIONS` in `src/packages/pms/lib/reservation-dates.ts`
- Guard `assertBookingStatusTransition` in `src/packages/pms/lib/reservations.server.ts` (throws `INVALID_TRANSITION`)
- `setReservationStatus` calls the guard **before** capacity check, UPDATE, and `recordReservationEvent`

**Transition allowlist:**

| From | Allowed targets |
|---|---|
| pending | confirmed, cancelled (same-status no-op) |
| confirmed | cancelled (same-status no-op); **not** pending, checked_in, no_show |
| cancelled | pending, confirmed (capacity re-check kept) |
| checked_in / checked_out / no_show | **REJECT** — Front Office RPCs only |

**Tests:** `src/packages/pms/lib/reservations.lifecycle.test.ts`

**Schema changes:** NONE  
**Migration changes:** NONE  
**Feature-gate changes:** NONE (`CREATE_RESERVATION_SECTION7_APPLY` unchanged)

Front Office writers unchanged: `check_in_hotel_reservation`, `check_out_hotel_reservation`, `mark_hotel_reservation_no_show`.

Cancellation paths remain multiple (`setReservationStatus` cancelled, `completeFoCancel`, `cancelDirectBooking`) — deferred orchestrator.

---

## Remaining DB-03 debt (not this task)

| ID | Area | Severity | Status |
|---|---|---|---|
| DB03-A01 | Section 7 persist HELD | HIGH | DEFER — do not flip |
| DB03-A02 | 0095 untracked ledger | MEDIUM | DEFER — do not reapply |
| DB03-A03 | Production unknown | HIGH | DEFER |
| DB03-B02 | Thin cancelled restore | MEDIUM | DEFER |
| DB03-B03 | Public booking cancel | HIGH | DEFER orchestrator |
| DB03-C01 | Dual staff cancel | HIGH | DEFER orchestrator |
| DB03-D01 | List SELECT omits masters | LOW | DEFER |
| DB03-D02 | Group create unbound | MEDIUM | DEFER |
| DB03-E01 | listAssignableRooms occupancy args | MEDIUM | DEFER |
| DB03-E02 | Assign write uses assert_room_assignable | MEDIUM | DEFER |
| DB03-E03 | Inventory fallback if 0095 missing | HIGH if absent | DEFER |
| DB03-F01 | Types vs production | HIGH if promoted | DEFER regen from prod |
