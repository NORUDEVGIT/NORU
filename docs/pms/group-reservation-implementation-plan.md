# Group Reservation Implementation Plan

| Field | Value |
|---|---|
| Status | Living implementation plan |
| This run | GROUP-RES-06 room occupants in Reservation Detail and Front Office. |
| Migration | `0161_manage_reservation_room_guest.sql` is written and not applied. `0159` and `0160` are applied. Next unused number is `0162`. |

Do not start a later phase from this file until that phase is explicitly commissioned.

## Authority

`hotel_reservations.reservation_mode` is the booking mode.

| Mode | Meaning |
|---|---|
| `single` | Exactly one room unit |
| `group` | One or more room units. One room is allowed while another room is still being added. |

This is not a block. `pms_group_id` and `pms_group_block_id` stay the Groups & Blocks link. A group reservation can be ad hoc, or it can later link to an existing group or block. That link is a later phase.

The confirmation number stays on the master reservation. One booking is not split into one reservation per room.

## GROUP-RES-01

- Goal: persist `single` or `group` on the booking and enforce the room-unit count on the server.
- Scope: column, backfill, create RPC, create payload, detail read model, and the create draft.
- Explicit non-scope: room guest tables, guest assignment UI, a Step 1 selector, Step 2, Step 3, Step 4, Front Office, and Groups & Blocks ownership.
- DB changes: `0159_reservation_mode.sql` in both migration lanes. Not applied. Apply `0153` through `0158` first.
- Backfill: the column defaults to `single`. A reservation whose room-unit count is greater than one is set to `group`. A reservation with no room-unit row stays `single`. `rooms_requested` is not used.
- Create: an omitted mode follows the room-unit count, so the current New Reservation screen still creates one room or several rooms. An explicit `single` with more than one room unit is rejected with `SINGLE_RESERVATION_ROOM_LIMIT`. An explicit `group` may create one or more room units. The current screen does not send the mode, so creates keep working before this migration is applied. After it is applied, the function stores the derived mode.
- Read model: reservation detail exposes `reservationMode`. A missing column reads as `single`. The detail screen does not show the mode.
- Draft: `reservationMode` defaults to `single`. An older draft without the field restores as `single`. There is no visual selector.
- Tests: `reservation-mode.test.ts`.
- Manual verification: not done. Apply `0159` after `0153` through `0158`. Create one room and confirm the stored mode is `single`. Create the current multi-room stay and confirm the stored mode is `group`, with one confirmation number.
- Status: PASS

`0159` is applied. The Step 1 selector was added in GROUP-RES-03. Room occupants are GROUP-RES-02.

## GROUP-RES-02

- Goal: each room unit can own occupants. `hotel_reservations.guest_id` stays the lead guest / booker.
- Scope: `hotel_reservation_room_guests`, backfill, an optional create assignment payload, and occupants on the reservation-detail room DTO.
- Explicit non-scope: the Step 1 reservation-mode selector, Step 2, Step 3, Step 4, Front Office check-in UI, Groups & Blocks, and a rooming list.
- DB changes: `0160_reservation_room_guests.sql`. Not applied. Apply `0153` through `0159` first.
- Table: one row is one guest on one room unit. Guest profile columns are not copied. Same-property foreign keys point at the room unit, the booking, and `guest_profiles`. The room foreign key includes `reservation_id`, so an occupant cannot name a room from another booking.
- Primary occupant: at most one per room, enforced by a unique index on `reservation_room_id` where `is_primary` is true. A room may also have additional occupants. The primary occupant does not have to be the lead guest.
- Backfill: for each booking, `guest_id` becomes the primary occupant of `unit_sequence` 1 when that room has no primary yet. Sibling rooms stay empty. Running the insert again does not add a second primary.
- Create: `assign_reservation_room_guests` runs inside `create_hotel_reservation_priced` before the function returns. An omitted payload leaves current create behavior and, after this migration, stores the lead guest as the primary occupant of unit 1. An explicit `roomGuestAssignments` list is inserted in that same transaction. GROUP-RES-03 sends that list for a group reservation.
- Read model: each reservation-detail room unit has `occupants: [{ guestId, name, isPrimary }]`. Names come from `guest_profiles`. A missing table leaves the list empty. The Rooms tab is unchanged.
- Master guest: create still writes `hotel_reservations.guest_id` as the lead guest. Occupant writes do not update that column. On an existing one-room stay, the lead guest and the room 1 primary occupant match because of the backfill.
- Tests: `reservation-room-guests.test.ts`.
- Manual verification: not done. Apply `0160`. Open a one-room reservation and confirm unit 1’s primary occupant is the lead guest, and a second room has no occupant until one is assigned.
- Status: PASS

`0160` is applied. Signed-in reservation detail was not opened in that phase. The Rooms tab does not yet show occupants. Step 1 now sends occupants through GROUP-RES-03.

## Later phases

### GROUP-RES-03

Step 1 — Guest, Stay & Availability is single or group.

- Reservation Type sits at the top of Step 1: Single Reservation or Group Reservation. It writes `reservationMode`. Block is not a mode.
- Single keeps the current guest search, availability table, and selected room panel. Rooms is 1 and read-only. Add Room and the rooming list stay hidden. The selected guest is room 1’s primary occupant. The create payload omits `reservationMode` and `roomGuestAssignments`, so the server still stores one room and defaults unit 1 to the lead guest.
- Group keeps the same guest and the same arrival and departure. Rooms, adults, children, and infants on Stay Information are read-only sums of the room units. Each room card has its own occupancy, room type, rate plan, and per-night amount. Dates are not per room.
- One room is active. The existing availability table and Selected Room & Rate panel edit that room only, at quantity 1. The per-room amount is labeled per night. Stay Information does not present the group total as a nightly rate.
- Room 1’s primary occupant is the lead guest, shown as Lead Guest. Room 2 and later use guest search or the existing Guest Profile form. Continue requires that primary occupant. Other adults, children, and infants do not need names yet.
- Add Room appends a draft unit with 1 adult and no type, rate, or occupant, then makes it active. Remove applies to Room 2 and later, drops that occupant, and keeps the remaining units in order. Room 1 cannot be removed. The cap stays 20 rooms.
- Switching from group to single asks before extra rooms are removed. Confirming keeps room 1, the lead guest, and the dates.
- Create sends `reservationMode: "group"`, `roomUnits`, and `roomGuestAssignments` for room 1 and each extra primary occupant. Assignment still happens inside the create function. Nothing writes occupants after create.
- Draft stores the mode, the active room, the extra units, and each extra occupant. A draft with no mode restores as single. A group draft restores its cards. Room 1 is not stored again as an extra occupant.
- Validation copy is operator-facing: lead guest, dates, a room and rate for every room, occupancy within the room type, and a primary occupant on every room after room 1.
- Groups & Blocks fields are unchanged. No block selector, allocation, pickup, or cutoff.
- Tests: `create-reservation-rooming.test.ts`.
- Manual verification: not done signed in. New Reservation redirects to the restaurant login.
- Status: PASS WITH DEBT

UI polish locked design applied. Reference: Hotel Group Reservation Interface. The group rooming list is a compact horizontal row: guest, adults, children, infants, room type, rate plan, per-night rate, and actions. The active row has a gold outline and a separate Editing badge. Room 1 also has a separate Primary badge and no Remove action. Room 2 and later use Edit Selection and Remove. Add Another Room sits in the rooming-list header. Group stay totals are read-only. The availability heading names the active room, and the criteria button reads Edit Room N Criteria. Selected Room & Rate names that same room.

Debt: signed-in Step 1 was not opened against the reference image. No new migration. Room-type and rate-plan tags appear only when the catalog already has them.

### GROUP-RES-04

Step 2 and Step 3 stay the same wizard. Single Reservation is unchanged. Group Reservation adds context only.

- Source, channel, market segment, booking agent, and campaign stay on the booking. They are not copied per room.
- Company, travel agent, and Group / Block stay on the existing card. A Group Reservation does not create a group or block. Ad hoc bookings leave `pms_group_id` and `pms_group_block_id` empty. Selecting an existing group still uses `onLinkedGroupChange` and `attachReservationToGroup` after create. No pickup or allocation mutation.
- Group mode shows a read-only Rooming Summary: room count, occupancy, primary occupant, room type, and rate plan. Edit in Step 1 calls `setWorkflowStep(0)` and leaves Step 2 and Step 3 values in place.
- Packages stay one reservation-level selection. Prices are not multiplied by room count and are not bound to Room 1. When room types or rate plans differ, the catalog says it matches Room 1 and does not check the other rooms.
- Saved preferences in group mode are labeled Primary Guest / Booker. Special requests and internal notes stay on the booking. Other occupants' profile preferences are not merged.
- Payment type, reference, method, and deposit due date stay one booking section.
- The stored deposit is still one reservation snapshot. The server applies Room 1's rate-plan deposit rule to the summed room total and summed nightly rates. When every room is quoted, the Step 3 amount uses that combined total. When the deposit rules differ, the card says the stored amount follows Room 1's rate plan on the combined total. It does not present Room 1's subtotal as the booking deposit.
- Stay policies compare cancellation, no-show, early departure, and refundability text. Matching rooms keep the four cards once, with “Applies to all N rooms”. Different rooms show a compact row per room. Room 1 is not shown as the policy for the whole booking when the sets differ.
- No new migration.
- Tests: `create-reservation-group-step23.test.ts`.
- Manual verification: not done signed in. New Reservation redirects to the restaurant login.
- Status: PASS WITH DEBT

Debt: signed-in Step 2 and Step 3 were not opened. Step 4 review still shows the Room 1 deposit preview. Package eligibility is still the Room 1 room type and rate plan. The stored deposit policy id remains Room 1's rate plan even when other rooms use a different deposit rule.

### GROUP-RES-05

Step 4 reviews one master reservation. Single Reservation keeps the existing cards. Group Reservation uses the same page.

- A compact Reservation Type line reads Group Reservation.
- The guest card is titled Primary Guest / Booker. It shows the booking guest, not every room occupant.
- Stay Information uses the room-unit totals for rooms, adults, children, and infants.
- Group / Block appears only when Step 2 linked an existing group. The card shows the group name, code, and block room type when those values exist. An ad-hoc group shows no empty card. Pickup and allocation stay out.
- The single Room & Rate card is replaced by a full-width Rooms & Occupants table: sequence, primary occupant, room type, compact occupancy, rate plan, rate per night, and room subtotal. Room Total is the sum of those subtotals. A missing quote leaves the total blank and says it is incomplete.
- Payment stays one booking section. Deposit amount and the explanatory note reuse `groupDepositPresentation` and `computeDepositRequirementAmount` from Step 3.
- Matching stay policies show the existing summary once, with “Applies to all N rooms”. Different policies show one compact row per room. Room 1 is not the policy for the whole booking.
- Source, channel, and market segment stay on the booking. Packages are listed once and labeled Booking-level package. Saved preferences are labeled Primary Guest Preference and are not presented as the booked rooms. Special requests are labeled Reservation Special Requests.
- Print uses the same document. Group drafts add a room row for every room, the combined room total, the deposit note, and either the shared policy note or the per-room policies. The print root is portaled to the document body and other body children are hidden while printing, so the same review is not repeated on later pages.
- Create still uses the existing atomic reservation call and one confirmation number. Step 4 does not add a second create.
- No new migration.
- Tests: `create-reservation-group-step4.test.ts`.
- Manual verification: not done signed in. New Reservation redirects to the restaurant login.
- Status: PASS WITH DEBT

Debt: signed-in Step 4 was not opened. Package eligibility is still the Room 1 room type and rate plan. The stored deposit policy id remains Room 1’s rate plan when other rooms use a different deposit rule. Step 4 states that with the Step 3 note.

### GROUP-RES-06

Reservation Detail and Front Office can operate on the occupants of one room unit. This is the last phase in this roadmap.

- `hotel_reservations` stays the master booking and the lead guest / booker. `hotel_reservation_rooms` stays the room-unit authority. `hotel_reservation_room_guests` stays the occupant authority. Occupant writes do not change `guest_id`, booked occupancy, the confirmation number, or the folio.
- Writer: `manage_reservation_room_guest` in `0161`. Service role only. Actions are `add`, `remove`, and `set_primary`. The guest and the room must belong to the same property and the same reservation. A duplicate guest on that room is rejected. One primary is kept by clearing the current primary before setting the next one in the same transaction. Named guests cannot exceed booked adults plus children. The booked counts are not changed. Removing the primary while another occupant remains is rejected; change primary first. Removing the only occupant is allowed. The guest profile is not deleted.
- Historical rooms: cancelled, checked-out, and no-show rooms reject occupant changes. Cancel and no-show do not detach occupants.
- History: `room_guest_added`, `room_guest_removed`, and `room_primary_guest_changed`. The payload has the room id, unit sequence, and guest id. It does not include a name, phone, or document.
- Permissions: owner, manager, and receptionist use the existing reservation manager gate. Cashier, accountant, and housekeeping stay read-only through the existing policies. There is no direct delete grant.
- Reservation Detail Rooms shows each room unit: physical room, room type, status, occupancy, rate plan, primary occupant, and additional occupants. Add Guest uses guest search and the existing guest form. Change Primary and Remove Guest target that room. A cancelled, checked-out, or no-show room keeps the list and locks the buttons. Check-in, check-out, assign, and change room open the existing Front Office dialogs for that room. The old Rooms assignment grid does not guess Room 1 when the booking has several rooms.
- Front Office still asks for a room only when there is more than one. The selected room shows its primary occupant, additional occupants, occupancy, and room type. Sibling occupants are not listed. A one-room stay whose only occupant is the booker does not add a second guest block. Registration still saves the Primary Guest / Booker. Check-in, check-out, assign, and room move still update the selected unit. The first check-in still opens the folio. A later room does not open another folio. Master status still rolls up through the STAY-08E rules.
- No new confirmation number. Steps 1–4, Groups & Blocks, and Quick View were not redesigned.
- Tests: `reservation-room-occupants.test.ts`.
- Manual verification: not done signed in. New Reservation and Reservation Detail redirect to the restaurant login.
- Status: PASS WITH DEBT

Debt: signed-in Reservation Detail and Front Office were not opened. Check-in document verification still reads the booking guest, not the selected room's primary occupant. Apply `0161` before the occupant buttons can save.

### E2E correctness hotfix

NR-000020 proved that atomic create was retaining the group correctly: one `group` master,
two room units with different room types, rate plans, subtotals, and two primary room
occupants. The compatibility `rooms_requested` value was still `1`. Reservation Detail
Overview and persisted print trusted the master room fields and `rooms_requested`; Front
Office list reads did not hydrate room units or room occupants.

- Future creates project `rooms_requested` from the authoritative room-unit count.
- Reservation Detail Overview derives room count and aggregate occupancy from `rooms[]`,
  identifies Group Reservation and Primary Guest / Booker, and summarizes every room.
- Persisted group print uses the same multi-room row shape as draft print and keeps one
  confirmation number.
- Front Office list and direct-stay reads hydrate all room units and their occupants. Existing
  room-level action targeting remains unchanged.
- Regression: `group-reservation-e2e-hotfix.test.ts`.
- No migration was added for this hotfix. Existing room units remain authoritative when an
  older compatibility `rooms_requested` value is stale.

## Status

| Phase | Status | Migration | Notes |
|---|---|---|---|
| GROUP-RES-01 | PASS | 0159 applied | mode persisted |
| GROUP-RES-02 | PASS | 0160 applied | occupants stored |
| GROUP-RES-03 | PASS WITH DEBT | — | Step 1 rooming list; compact-row polish applied; signed-in visual check still open |
| GROUP-RES-04 | PASS WITH DEBT | — | Step 2 and Step 3 group context; signed-in check still open |
| GROUP-RES-05 | PASS WITH DEBT | — | Step 4 group review; signed-in check still open |
| GROUP-RES-06 | PASS WITH DEBT | 0161 not applied | Room occupants in Reservation Detail and Front Office. Signed-in check still open. |

## Files

- `drizzle/migrations/0159_reservation_mode.sql`
- `supabase/migrations/0159_reservation_mode.sql`
- `src/packages/pms/lib/reservation-mode.ts`
- `src/packages/pms/lib/reservation-mode.test.ts`
- `src/packages/pms/lib/reservations.functions.ts`
- `src/packages/pms/lib/reservations.server.ts`
- `src/packages/pms/lib/create-reservation-draft.ts`
- `src/packages/pms/lib/create-reservation-draft.test.ts`
- `src/packages/pms/lib/reservation-edit-workspace.test.ts`
- `src/packages/pms/components/bookings/create-reservation-page.tsx`
- `src/integrations/supabase/types.ts`
- `docs/pms/group-reservation-implementation-plan.md`

### GROUP-RES-02

- `drizzle/migrations/0160_reservation_room_guests.sql`
- `supabase/migrations/0160_reservation_room_guests.sql`
- `src/packages/pms/lib/reservation-room-units.ts`
- `src/packages/pms/lib/reservation-room-guests.test.ts`
- `src/packages/pms/lib/reservation-mode.test.ts`
- `src/packages/pms/lib/reservations.functions.ts`
- `src/packages/pms/lib/reservations.server.ts`
- `src/integrations/supabase/types.ts`
- `docs/pms/group-reservation-implementation-plan.md`

### GROUP-RES-03

- `src/packages/pms/lib/create-reservation-rooming.ts`
- `src/packages/pms/lib/create-reservation-rooming.test.ts`
- `src/packages/pms/components/bookings/create-reservation-rooming-list.tsx`
- `src/packages/pms/components/bookings/create-reservation-page.tsx`
- `src/packages/pms/components/bookings/create-reservation-stay.tsx`
- `src/packages/pms/components/bookings/create-reservation-selected-room.tsx`
- `src/packages/pms/components/bookings/create-reservation-extra-rooms.tsx`
- `src/packages/pms/lib/create-reservation-draft.ts`
- `src/packages/pms/lib/create-reservation-draft.test.ts`
- `src/packages/pms/lib/reservation-mode.test.ts`
- `src/packages/pms/lib/reservation-room-guests.test.ts`
- `docs/pms/group-reservation-implementation-plan.md`

### GROUP-RES-04

- `src/packages/pms/lib/create-reservation-group-step23.ts`
- `src/packages/pms/lib/create-reservation-group-step23.test.ts`
- `src/packages/pms/components/bookings/create-reservation-rooming-summary.tsx`
- `src/packages/pms/components/bookings/create-reservation-page.tsx`
- `src/packages/pms/components/bookings/create-reservation-booking-details.tsx`
- `src/packages/pms/components/bookings/create-reservation-policies-guarantee.tsx`
- `src/packages/pms/components/bookings/create-reservation-packages.tsx`
- `src/packages/pms/components/bookings/create-reservation-extra-rooms.tsx`
- `docs/pms/group-reservation-implementation-plan.md`

### GROUP-RES-05

- `src/packages/pms/lib/create-reservation-group-step23.ts`
- `src/packages/pms/lib/create-reservation-group-step4.test.ts`
- `src/packages/pms/lib/reservation-print-document.ts`
- `src/packages/pms/components/bookings/reservation-print-document.tsx`
- `src/packages/pms/components/bookings/create-reservation-review.tsx`
- `src/packages/pms/components/bookings/create-reservation-page.tsx`
- `src/packages/pms/lib/create-reservation-review.test.ts`
- `docs/pms/group-reservation-implementation-plan.md`

### GROUP-RES-06

- `drizzle/migrations/0161_manage_reservation_room_guest.sql`
- `supabase/migrations/0161_manage_reservation_room_guest.sql`
- `src/packages/pms/lib/reservation-room-occupants.ts`
- `src/packages/pms/lib/reservation-room-occupants.test.ts`
- `src/packages/pms/lib/reservation-room-units.ts`
- `src/packages/pms/lib/reservations.functions.ts`
- `src/packages/pms/lib/reservations.server.ts`
- `src/packages/pms/lib/guest-bookings-workspace.ts`
- `src/packages/pms/lib/fo-amendments.ts`
- `src/packages/pms/components/workspaces/reservation-detail-room-occupants.tsx`
- `src/packages/pms/components/workspaces/reservation-detail-rooms.tsx`
- `src/packages/pms/components/workspaces/reservation-detail-workspace.tsx`
- `src/packages/pms/components/frontoffice/room-unit-target-select.tsx`
- `src/packages/pms/components/frontoffice/fo-check-in-stepper.tsx`
- `src/packages/pms/components/frontoffice/fo-check-out-stepper.tsx`
- `src/packages/pms/components/frontoffice/front-office-dialogs.tsx`
- `src/integrations/supabase/types.ts`
- `docs/pms/group-reservation-implementation-plan.md`

The group-reservation roadmap is complete. Remaining debt is listed on GROUP-RES-03, GROUP-RES-04, GROUP-RES-05, and GROUP-RES-06. Apply `0161` before occupant changes can be saved.

## Reservation Detail audit appendix

Reservation Detail already had one master booking, authoritative room units, and room occupants. The remaining gap was presentation. Eight tabs copied the same summary rail from master guest, room, rate, and occupancy fields, including “This reservation has one room.” Stay, Rates, Guest, Rooms, History, and Notes still preferred those master fields for group reservations. Packages, folio ownership, communication, linked reservations, Front Office targeting, and persisted print were already on the intended model.

## Reservation Detail Consistency Polish

Shared pieces:

- `reservation-detail-group.ts` is the group projection: room count, aggregate occupancy, assignment, combined subtotal, per-room rate sections, history labels, and trace room targets.
- `ReservationDetailSummary` replaces the eight copied rails. Single reservations keep the one-room summary. Group reservations show the booker, both room lines, aggregate occupancy, assignment count, and combined total.

Tabs corrected:

- Header uses Primary Guest / Booker and a Rooms KPI for group reservations. Total Amount stays the combined room subtotal. Deposit stays booking-level.
- Overview rate summary lists each room plan and nightly rate, then the combined room total.
- Stay shows read-only aggregate occupancy for group reservations. Amend dates and Extend Stay are not offered as one-room actions.
- Guest shows the booker, then Room Guests / Occupants. Lead preferences are labeled as profile preferences.
- Rooms hides the legacy Room 1 card and assignment grid for group reservations. `ReservationRoomOccupants` stays authoritative.
- Rates renders one section per room unit and gates Change Rate Plan.
- Notes traces load every assigned physical room and label Room N.
- History resolves `reservation_room_id`, `unit_sequence`, `guest_id`, and `room_id` to Room N and the guest name.

Intentional limitations preserved:

- No multi-room amend, copy, or rate writer.
- Package eligibility still uses the primary room’s room type and rate plan.
- One folio per reservation.
- Communication and Linked Reservations stay deferred. Room units are not linked reservations.
- Front Office Check In, Check Out, Assign Room, Change Room, and No Show targeting is unchanged.
- Persisted print stays group-aware.
- New Reservation Steps 1–4, confirmation architecture, folio ownership, and Groups & Blocks are unchanged.

Action gating:

- Group Copy: “Copy Reservation is not available for multi-room reservations yet.”
- Group Amend and Stay date changes: “Multi-room date amendments are not supported from this workspace yet.”
- Group Change Rate Plan: “Rate changes for multi-room reservations must be handled per room. This action is not available here yet.”
- Single Copy, Amend, Stay editors, and Change Rate Plan stay available.

Tests: `reservation-detail-group.test.ts`, plus the existing stay, rates, rooms, room-unit, and e2e hotfix scans.

Runtime verification: not claimed. Signed-in Reservation Detail was not opened in this pass.

Remaining debt: multi-room copy, multi-room date amendment, per-room rate changes, package eligibility beyond the primary room, communication recipients, and linked-reservation records. Migration `0161` is still not applied, so occupant add, change, and remove cannot save until it is.
