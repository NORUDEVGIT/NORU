# DB-01 / DB-02 — Reservation freeze kickoff

This is a planning handoff after [DB-00](./db-00-reservation-deployed-schema-truth.md). It is **not** a Spec, not approval to build, and it does **not** add schema.

**Canonical contract:** [DB-01 / DB-02 — Reservation Core & Ownership Contract](./db-01-db-02-reservation-core-ownership-contract.md) (**PASS WITH DEBT**).

CURRENT for later work is the **non-prod** runtime recorded in DB-00 (`qcwptraosaudcbjasmul`). Production remains **UNKNOWN**.

---

## DB-01 — Reservation Core Freeze

Freeze what a Reservation **is today**, using deployed objects only:

- One stay row on `hotel_reservations` (single room type, optional `room_id`).
- Statuses: `pending`, `confirmed`, `cancelled`, `checked_in`, `checked_out`, `no_show`.
- Channel origin `source` is not commercial booking source.
- Priced create: `create_hotel_reservation_priced` + `price_hotel_stay`.
- History events already constrained to `RESERVATION_EVENT_TYPES`.
- Folio is the financial ledger; reservation holds the price snapshot.
- Company/TA masters bind on **create** only; group master column exists but is unused.
- Section 7 columns exist on non-prod; persist stays **HELD** until production 0061 is verified.

DB-01 must **not**: invent multi-room, waitlist, links, package-on-stay, traces, or new statuses.

---

## DB-02 — Ownership / lifecycle contract

Record who owns which fields on the **existing** stay row:

- Reservation create/amend vs Front Office check-in / check-out / no-show on the same `status` column.
- `fo_stay_companions` remains FO-owned until a later DB-05 guest-on-stay decision.
- Room assignment: canonical `pms_evaluate_room_assignment` on non-prod; list path still omits occupancy/preference args.
- Pricing writers: create/quote for reservation managers; reprice for rate managers.

DB-02 must **not** redesign RBAC or split `hotel_reservations.status` until that contract is agreed.

---

## Blocked until production is known

- Flipping `CREATE_RESERVATION_SECTION7_APPLY`.
- Treating 0095 as a tracked applied migration.
- Claiming types.ts matches production.
