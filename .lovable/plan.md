# Phase 6D — Reservation Core

Hotel reservations only: create, search, amend, cancel, optional room assignment. No check-in, folios, rates, or housekeeping.

## Database (one migration, `0013_create_hotel_reservations.sql`)

- `hotel_reservations` — tenant-scoped: `guest_id`, `confirmation_number` (unique per restaurant), `arrival_date`/`departure_date` (date-only), `adults` (>= 1), `children` (>= 0), `room_type_id`, `room_id` nullable, `status` ('pending' | 'confirmed' | 'cancelled', default 'pending'), `source` ('staff' | 'future_online'), `special_requests`, `notes`, `cancellation_reason`, `created_by_staff_membership_id`, timestamps. CHECK constraints for `departure_date > arrival_date`, occupancy counts, status/source values. Composite foreign keys `(restaurant_id, guest_id)`, `(restaurant_id, room_type_id)`, `(restaurant_id, room_id)` so cross-property references are impossible at the database level (matching the pattern already used by rooms/guests). Indexes on `(restaurant_id, arrival_date)`, `(restaurant_id, status)`, `(restaurant_id, room_id, arrival_date)`, and `(restaurant_id, confirmation_number)`.
- `hotel_reservation_counters` — `(restaurant_id, last_number)` row used to hand out `NR-000001`-style confirmation numbers atomically inside the create function.
- `hotel_reservation_history` — immutable append-only: `event_type` (`created`, `confirmed`, `amended`, `cancelled`, `room_assigned`, `room_changed`, `status_changed`), `previous_values`/`new_values` jsonb, `notes`, `actor_membership_id`, `created_at`. No update/delete policies; written with the service role like guest history.
- GRANTs to `authenticated` and `service_role`, RLS enabled, policies limited to owner/manager members of the same restaurant. No `anon` grant — reservation and guest data stays off public/QR routes.
- `set_updated_at` trigger reused.
- Database function `create_hotel_reservation(...)` (SECURITY DEFINER) does the transaction-safe booking: locks the room-type inventory row set (`SELECT ... FOR UPDATE` on the counter row for that property), recomputes availability inside the transaction, raises `NO_AVAILABILITY` when exhausted, allocates the next confirmation number, and inserts the reservation. A companion `amend_hotel_reservation_dates(...)` applies the same locked re-check for date/room-type/room changes. Room assignment is validated inside the same function (same property, same room type, active, not OOO/OOS, no overlapping active reservation).

## Availability engine

One shared server-side implementation used by the room-type picker, create, and amend:

```text
sellable rooms = hotel_rooms where restaurant matches, active = true,
                 status = 'available', room_type.sellable = true, room_type.active = true
reserved       = active reservations (pending or confirmed) for that room type where
                 existing.arrival_date < requested.departure_date
                 AND existing.departure_date > requested.arrival_date
available      = max(sellable - reserved, 0)
```

Cancelled reservations never block. Per room type it returns `total_sellable_rooms`, `reserved_rooms`, `available_rooms`. Room-level availability uses the same overlap rule filtered to one `room_id`. The UI figure is advisory only — the authoritative check runs inside the locked database function, so a stale screen cannot overbook.

## Server layer

- `src/lib/reservations.server.ts` — `requireReservationManager` (owner/manager, re-derived from `restaurant_users`), overlap/nights helpers, date validation, history writer via service role, availability query helpers.
- `src/lib/reservations.functions.ts` — `createServerFn` + `requireSupabaseAuth`: `getReservationAccess`, `listReservations` (search by confirmation/guest name/phone/email; filters status, arrival, departure, room type; paginated), `getReservation` (detail + history), `getRoomTypeAvailability`, `getAssignableRooms`, `createReservation`, `amendReservation`, `assignReservationRoom`, `setReservationStatus` (confirm), `cancelReservation`. Every handler resolves `restaurant_id` from the caller's membership and re-verifies guest, room type, and room belong to that property. No hard delete.
- Guest search and creation reuse the Phase 6C functions unchanged — no new guest tables or duplicated logic.

## Routes and UI

- `src/routes/restaurant/bookings/index.tsx` — Booking dashboard: Today's Arrivals, Today's Departures, Confirmed, Pending, Cancelled (property-local dates), plus quick actions New Reservation / Reservations / Guests. No In-House tile.
- `src/routes/restaurant/bookings/reservations.tsx` — list with search, status/date/room-type filters, desktop table (Confirmation, Guest, Arrival, Departure, Nights, Room Type, Room, Status, Created) and mobile cards; row click opens detail.
- `src/routes/restaurant/bookings/new.tsx` — stepper: Guest (search existing or create via the Phase 6C dialog) → Stay (dates, adults, children, auto nights) → Room Type (cover image, capacity, bed, amenities, available count; unavailable types clearly marked, no prices) → optional Room → Details (special requests, notes) → Confirm.
- `src/routes/restaurant/bookings/$reservationId.tsx` — header with confirmation number, guest, status badge; details panel; actions Confirm, Amend, Cancel (with optional reason), Assign/Change room; History tab timeline in restaurant timezone. No Check-In action.
- Dialogs in `src/components/bookings/` following the rooms/guests dialog patterns.
- `restaurant-shell.tsx`: expand the `guests` workspace nav to Dashboard, Reservations, New Reservation, Guests (owner/manager only). Existing guest routes stay as they are.
- `restaurant/home.tsx`: Booking & Guest Management card points at `/restaurant/bookings`.

## Dates

Stay dates are stored and handled as plain `date` values and formatted as property-local dates — never passed through a browser timezone conversion that could shift a day.

## Permissions and security

Owner and manager: full access. Kitchen and waiter: hidden in UI, rejected server-side, blocked by RLS. Service-role client only inside server handlers. Cross-property access is impossible because membership, composite foreign keys, and RLS all scope by restaurant.

## Verification (The Garden, owner session)

Create a confirmed reservation for the existing Phase 6C guest on Deluxe King; search by confirmation and by guest; check nights; watch availability drop; book overlapping stays until inventory is exhausted and confirm the next attempt is rejected; cancel and confirm availability returns; amend dates; assign Room 201; attempt an overlapping assignment of the same room and confirm it is blocked; review the history timeline; confirm kitchen/waiter are denied and another tenant cannot read the records; run build and typecheck. Extra sellable rooms are added to The Garden only as test data if needed.

## Out of scope

Check-in/out, in-house, housekeeping, folios, payments, deposits, night audit, OTA, groups, company/agent bookings, rates and revenue management.
