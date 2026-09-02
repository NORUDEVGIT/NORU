# Phase 6E — Front Office Operations

Turns the existing reservation core into a working front desk: arrivals, check-in, in-house, room moves, stay changes, departures, check-out, walk-ins and no-shows. No folios, payments, housekeeping or night audit.

## Reservation lifecycle

Adds three operational statuses to the existing `pending / confirmed / cancelled` set:

```text
pending ─┬─> confirmed ─┬─> checked_in ──> checked_out
         │              ├─> no_show
         └──────────────┴─> cancelled
```

Rules enforced on the server only:
- Check-in requires `confirmed`, a valid stay, and an assigned room (assignable during check-in).
- Check-out requires `checked_in`.
- No-show requires `confirmed` and an arrival date already past the property-local business date.
- `checked_out`, `cancelled` and `no_show` are terminal for Phase 6E.

## Room occupancy

`hotel_rooms.status` (available / out_of_order / out_of_service) stays exactly as it is — a manual restriction flag, never written by reservations. Occupancy is derived: a room is **occupied** when a `checked_in` reservation holds it, otherwise **vacant**. No new stored occupancy column. Out-of-order and out-of-service rooms can never be assigned or checked into.

Availability rules extend so `checked_in` stays block inventory and rooms exactly like `pending`/`confirmed` do; `checked_out`, `cancelled` and `no_show` never block.

## Database (one migration)

- Relax the reservation status CHECK to include `checked_in`, `checked_out`, `no_show`; allow `walk_in` as a `source`; extend the history event CHECK with `check_in`, `check_out`, `room_moved`, `stay_extended`, `stay_shortened`, `no_show`.
- Update `count_reserved_rooms` and `assert_reservation_capacity` to treat `checked_in` as blocking, and add an occupancy clash check for physical rooms.
- New SECURITY DEFINER, transaction-safe functions, each locking the reservation row and re-validating before the transition: `check_in_hotel_reservation`, `check_out_hotel_reservation`, `move_hotel_reservation_room`, `change_hotel_stay_dates`, `mark_hotel_reservation_no_show`. Each writes its own immutable history row inside the same transaction.
- Room-level locking (`SELECT ... FOR UPDATE` on the candidate room plus a conflict re-check) prevents two concurrent check-ins or moves landing in the same room.
- Existing RLS, grants and owner/manager policies are reused unchanged; no table is dropped or renamed and no reservation history is deleted.

## Server layer

`src/lib/frontoffice.functions.ts` (+ helpers in `src/lib/frontoffice.server.ts`), following the existing reservation/guest patterns: every handler re-derives membership from `restaurant_users`, requires owner or manager, and resolves `restaurant_id` server-side.

Functions: `getFrontOfficeDashboard`, `listArrivals`, `listInHouse`, `listDepartures`, `checkInReservation`, `checkOutReservation`, `moveReservationRoom`, `changeStayDates`, `markNoShow`, `listOccupancy` (room-level vacant/occupied for room search). Room assignment and walk-in creation reuse the Phase 6D `assignReservationRoom` and `createReservation` pipeline unchanged — no duplicate reservation logic, no walk-in data model.

## Routes and UI

Sidebar for Rooms & Front Office becomes: Dashboard, Room Types, Rooms, Arrivals, In-House, Departures. Check-in, check-out, assignment, room move and stay changes are dialogs launched from those screens, not extra pages.

- `/restaurant/rooms` dashboard gains operational KPIs — Arrivals Today, Departures Today, In-House Guests, Available, Occupied, Out of Order, Out of Service — on the property-local business date, plus quick actions Check-In, Walk-In, Room Search. No financial KPIs.
- `/restaurant/rooms/arrivals` — date picker defaulting to today, filters for status / room type / assigned-unassigned; row actions View, Assign Room, Check-In.
- `/restaurant/rooms/in-house` — search by guest, room or confirmation; shows room, type, arrival, departure, nights, special requests; actions View Reservation, View Guest, Room Move, Extend/Shorten Stay, Check-Out.
- `/restaurant/rooms/departures` — departures for the selected date plus overdue `checked_in` stays flagged **Overstay**; actions View and Check-Out.
- Walk-In dialog runs Guest → Stay dates → Room Type → Room → Create → Confirm → Check-In through the existing pipeline, with `source = 'walk_in'`.
- Check-out confirmation carries the note "Billing settlement will be handled in a future Cashiering phase." and never touches cleanliness state.

Room moves require a reason, stay within the same room type (a different type is blocked because it would affect pricing), and record previous room, new room, reason, actor and timestamp.

## Permissions and security

Owner and manager only. Kitchen and waiter are hidden in the UI, rejected by the server handlers and blocked by RLS. Browser-supplied ids are only used to select a membership; guest, reservation and room membership is revalidated on every write. Every critical transition runs inside a locked database function.

## Verification (The Garden)

Full front-desk pass: confirmed reservation appears under Arrivals, assign Room 201, check in, verify In-House and the room counted occupied, confirm a conflicting assignment is blocked, move rooms, review history, extend a stay, confirm a conflicting extension is blocked, see the stay under Departures, check out, confirm it leaves In-House, the room reads vacant and its cleanliness was not touched. Then a walk-in end to end, a no-show on an eligible past-due reservation, kitchen/waiter denial, cross-tenant denial, build and typecheck.

## Out of scope

Folios, cashiering, payments/refunds, housekeeping states, maintenance, night audit, OTA, groups, receptionist role, no-show charges, rate changes on upgrades.
