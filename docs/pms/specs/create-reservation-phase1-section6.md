# Create Reservation — Phase 1 Section 6 (Room assignment)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 6: Room assignment |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **LIKELY NONE.** Optional `hotel_reservations.room_id`, create bind (`roomId` → `_room_id`), `listAssignableRooms`, and conflict RPCs already exist. Dual-lane APPLY **N/A** unless Eng replaces SECURITY DEFINER `assert_reservation_capacity` / `create_hotel_reservation` / `create_hotel_reservation_priced`. Additive RLS matching reservation tables OK; **flag Abel** if entitlement / RLS **model** must change. No new room table, no create-room-from-reservation API, no invented overbooking engine |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section6-programme.md`](../create-reservation-phase1-section6-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). [`create-reservation-phase1-section4.md`](./create-reservation-phase1-section4.md) already binds **room type** + availability. [`create-reservation-phase1-section5.md`](./create-reservation-phase1-section5.md) is Rate (sibling Spec / [#140](https://github.com/NORUDEVGIT/NORU/pull/140); coding [#141](https://github.com/NORUDEVGIT/NORU/issues/141)). Individual Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139) may continue merge / polish — **OK, do not block**. This section **consumes** stay dates + selected room type; it assigns a **specific room** |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> **Programme rule (LOCKED):** Cover efficient functionality from the reference Individual create **Room** pick (**+ button patterns only if CURRENT** — researched: **absent** → **OUT**) with **modern NORU UI** (own box, sticky summary, drawers). **Do not** clone legacy chrome. Placement may borrow from reference.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → **6 Room assign (THIS)** → 7 Guarantee + confirm → 8 Packages if catalog. Later sections own guarantee chrome.
>
> **Server / RPC remains source of truth** for room availability and assignment. UI lists CURRENT assignable rooms. Do **not** invent a LIVE OTA / RMS / overbooking engine. Section 4 already binds room **type** + availability state — Section 6 is the **specific room**.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Sections 1–5) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). Already takes optional `_room_id` |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Own **Room assignment** box + sticky: optional specific room for selected type + stay dates, or honest **Unassigned**. Modern NORU boxes (not legacy clone). Doc2 shell / sidebar collapse from Section 1 unchanged |
| Assignment source | Reuse CURRENT `listAssignableRooms` (type + dates; omit clash rooms). Create re-check: `assert_reservation_capacity` → `ROOM_NOT_ASSIGNABLE` / `ROOM_ALREADY_BOOKED`. **No** parallel assignment API |
| Walk-in honesty | FO `WalkInDialog` **requires** a room at UI. `/restaurant/bookings/new` **allows** unassigned. Commercial booking source `walk_in` is **not** FO walk-in mode and does **not** require a room |
| + create room | **OUT** — CURRENT has no create-room-from-reservation. Inventory create is Configuration `saveRoom` (`requireRoomManager`) |
| Confirm honesty | Hard Confirm / Guarantee chrome may live in **Section 7**. Section 6 **exposes** assigned vs Unassigned. Do not invent a second Confirm product |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — card **“Room assignment (optional)”**; `useQuery` `["assignable-rooms", restaurantId, roomTypeId, arrival, departure]`; `roomId` state default `UNASSIGNED`; submit `roomId: roomId === UNASSIGNED ? null : roomId`; `canSubmit` does **not** require a room; `selectRoomType` sets `setRoomId(UNASSIGNED)` (silent, no warn); sticky has **no** room / Unassigned line |
| Assignable list | `src/packages/pms/lib/reservations.functions.ts` — `listAssignableRooms` (`requireReservationManager`) |
| Assignable DTO | `AssignableRoom`: `id`, `roomNumber`, `floor`, `building`, `housekeepingStatus` |
| List filter (today) | `hotel_rooms` where `room_type_id` + `active = true` + `status = 'available'`; then omit rooms with overlapping `hotel_reservations` in `pending` \| `confirmed` \| `checked_in` for arrival→departure (`excludeReservationId` unused on create) |
| Writer | `createReservation` — Zod `roomId: idSchema.nullable().optional()`; RPC `_room_id` |
| RPC (priced) | `create_hotel_reservation_priced` — forwards `_room_id` (nullable in practice) into `create_hotel_reservation` |
| Create capacity / clash (server SoT) | `assert_reservation_capacity` inside `create_hotel_reservation` — when `_room_id IS NOT NULL`: room must be same type, `active`, `status = 'available'` else `ROOM_NOT_ASSIGNABLE`; overlapping stay else `ROOM_ALREADY_BOOKED`. **Null `_room_id` skips room clash** (type inventory still via `NO_AVAILABILITY`) |
| FO assign guard (not create writer) | `assert_room_assignable` — check-in / move / rack. Same exception codes. **Do not** add it as a second create writer |
| Post-create assign (not create writer) | `assignReservationRoom` → `amend_hotel_reservation` — detail / FO assign-before-check-in. **Do not** make create = insert then assign |
| Error copy | `reservationError` in `reservations.server.ts` — `ROOM_NOT_ASSIGNABLE`, `ROOM_ALREADY_BOOKED`. Check-in-only `ROOM_REQUIRED` is **not** a create-path rule |
| Walk-in (same writer, different UI) | `src/packages/pms/components/frontoffice/front-office-dialogs.tsx` — `WalkInDialog`: `listAssignableRooms` + `createReservation`; submit **disabled** unless `roomId`; no Unassigned option |
| Inventory create (OUT of this path) | `saveRoom` in `rooms.functions.ts` — Configuration; `requireRoomManager`. **Not** mounted on `/restaurant/bookings/new` |
| Room inventory statuses | `ROOM_STATUSES` = `available` \| `out_of_order` \| `out_of_service` (`rooms.server.ts`). OOO/OOS excluded by `status = 'available'` |
| HK on DTO | `housekeepingStatus` returned; create picker **does not** show or filter it |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |
| Section 4 consume | `CreateReservationRoomType` + `getRoomTypeAvailability` — type + available/limited/none. **Required**. Section 6 does not re-own type availability |

---

## 2. CURRENT (code wins)

- `/restaurant/bookings/new` already has a **Room assignment (optional)** card. The picker is enabled only after a room type is selected. Query: `listAssignableRooms({ restaurantId, roomTypeId, arrival, departure })` once `canManage && datesValid && !!roomTypeId`.
- **List is filtered by type + stay dates.** Physical rooms must match the selected `room_type_id`, be `active`, and have inventory `status = 'available'` (OOO / OOS omitted). Rooms with an overlapping `pending` / `confirmed` / `checked_in` reservation are **omitted** (not shown as occupied-with-warn). Display today: `Room {number}` + optional `Floor`. Building / HK status are on the DTO but unused on this picker.
- **Empty / none:** copy: “No free rooms of this type for those dates — the stay can still be booked and assigned later.” Create remains allowed.
- **Unassigned default:** `roomId` state is `UNASSIGNED` (“Assign later”). Submit sends `roomId: null` → `_room_id` null. `canSubmit` = guest + valid dates + room type with `available > 0` — **room is not required**.
- **Select binds today:** a chosen room id is passed on the **same** `createReservation` call. Server re-checks. Concurrent clash surfaces as `ROOM_ALREADY_BOOKED` (honest toast — not swallowed). Wrong type / inactive / not `available` → `ROOM_NOT_ASSIGNABLE`.
- **Walk-in honesty:** FO `WalkInDialog` uses the same writer but **requires** `roomId` (no Assign later; button disabled). Check-in completion separately requires a room (`ROOM_REQUIRED` / “Assign a room before completing check-in.”) — FO check-in, **not** this create page. Commercial booking source `walk_in` on the Create Reservation context card is a SET6 / default **source label**, not FO walk-in mode, and does **not** require a room.
- **Conflict policy today:** **block** (omit from list + server exception). **No** staff overbooking override, no “book occupied anyway,” no allotment bump. Do not invent one.
- **Change room type:** `selectRoomType` **clears** `roomId` to `UNASSIGNED` and also clears `ratePlanId`. **No warn.** Date / nights change **refetches** the list but **does not** clear a previously selected `roomId` — a stale id can still be submitted; server then fail-closes if it clashes. Honesty gap for Section 6.
- **Sticky summary:** Type, Guest, Associations/Company/TA, Stay, Nights, Occupancy, Room type, Availability. **No** specific room / Unassigned line. Picker “Assign later” is not mirrored on the summary.
- **+ create room:** **absent** on this route. No `saveRoom` / room-inventory dialog from the reservation draft. Creating a physical room is Configuration (`saveRoom` / `requireRoomManager`).
- **No second create writer.** `assignReservationRoom` is post-create. Walk-in still `createReservation`.
- **DATABASE IMPACT:** **LIKELY NONE.** `room_id` already nullable on `hotel_reservations`. Writer + priced RPC already accept null / uuid. No Section 6 migration file expected unless Eng replaces SECURITY DEFINER inventory/create RPCs (then dual-lane APPLY HELD, Abel if model changes).

### DOCUMENTATION / IMPLEMENTATION notes

- Pre-existing Room assignment card on the same page **remains the surface to modernize**, not a second product. Section 6 Spec does **not** claim Stay / Rate / Guarantee / Packages DONE.
- Section 4 (`#133`) already owns type + availability integers. This section must not weaken `canSubmit` type-availability or `NO_AVAILABILITY`.
- Parallel Section 5 coding ([#141](https://github.com/NORUDEVGIT/NORU/issues/141) / [#142](https://github.com/NORUDEVGIT/NORU/pull/142)) and Associations ([#139](https://github.com/NORUDEVGIT/NORU/pull/139)) **OK** — do not block them. Coordinate only if both touch the sticky summary (Section 6 adds a room line; Section 5 adds rate/total).
- Guest GE1–GE3 stay closed. Phase 1 DONE = **NO**. Create Reservation DONE = **NO**.

---

## 3. EXPECTED — Room assignment

### 3.1 Specific room select (reference capability, NORU UI)

- Staff may select **one** specific room from CURRENT `listAssignableRooms` (or equivalent — same `hotel_rooms` + clash query, tenant-scoped) for the **selected room type + draft stay dates**.
- Show at least **room number** (cheap). Floor / building only if already on the DTO — **do not** invent a new room catalog API.
- **Modern NORU box** (own card / box in the Doc2 main column). Do **not** clone legacy PMS chrome. Placement may sit under Room type (CURRENT) or borrow reference placement.
- No room type / invalid dates: do **not** invent a room list (CURRENT: picker disabled / query not enabled).
- Occupied / clashing rooms stay **off the success list** per CURRENT (omit). Do not present them as selectable. Eng may add disabled+reason rows **only** if it is the same clash SoT — default is keep CURRENT omit. **No** overbooking pick.

### 3.2 Empty / Unassigned (create path)

- **Unassigned is a valid create** on `/restaurant/bookings/new` unless this stay is the **FO Walk-in mode** (see §3.3).
- Empty assignable list: honest copy (CURRENT later-assign copy is fine). Staff may still create **Unassigned**.
- Picker must keep an explicit Unassigned / Assign later choice. Sticky must say **Unassigned** (not a blank, not a fake room number).
- Creating without a room binds `room_id = null` on the same writer. **Do not** insert-then-`assignReservationRoom` as the create path.

### 3.3 Walk-in honesty (CURRENT)

| Surface | Room required? | Rule |
|---|---|---|
| `/restaurant/bookings/new` | **No** | Unassigned allowed, including when commercial source is Walk-in |
| FO `WalkInDialog` (same writer) | **Yes** (UI) | Preserve CURRENT: no Unassigned; submit disabled without `roomId` |
| Check-in complete | **Yes** (FO) | `ROOM_REQUIRED` — **out of Section 6 product**; do not move check-in onto Create Reservation |

Do **not** force a room on Create Reservation because the booking-source label is Walk-in. Do **not** loosen FO walk-in to allow unassigned.

### 3.4 Conflict / occupied (CURRENT rules only)

- **Block** assignment of a room that CURRENT clash logic treats as taken (`pending` / `confirmed` / `checked_in` overlapping arrival→departure) or not assignable (`ROOM_NOT_ASSIGNABLE`: wrong type, inactive, not inventory-`available`).
- UI: omit (CURRENT) or disable with the **same** reason. Server: keep `assert_reservation_capacity` exceptions; surface via `reservationError` — **do not swallow**.
- **Hard-warn is not CURRENT.** If Eng adds a confirm dialog, it must still **fail-close** on the RPC — never a successful overlapping assign. Prefer **block** to match CURRENT.
- **Do not** invent overbooking, house-use bump, allotment steal, or OOO override on this path.

### 3.5 Change room type (clear incompatible + warn)

- Changing the **room type** must **clear** a specific room that is no longer compatible (CURRENT already resets to Unassigned).
- Section 6 adds a **visible warn** that the room assignment was cleared (toast or inline). Silent discard is the CURRENT honesty gap — close it.
- Changing **stay dates** must **re-fetch** `listAssignableRooms`. If the selected room is absent from the new list (or would fail CURRENT clash), **clear to Unassigned + warn** (or keep + mark invalid and disable submit — Eng picks **one** documented rule; do not keep a stale id as a silent valid assign).

### 3.6 Bind on create (same writer)

- Selected room **binds** `hotel_reservations.room_id` via `createReservation` → `create_hotel_reservation_priced` (`_room_id`). CURRENT already does this — **keep it**.
- Unassigned binds **null**. Room type remains **required** (Section 4).
- **No** parallel create API. **No** create-time call to `assignReservationRoom`. Walk-in remains a mode of `createReservation`.

### 3.7 Sticky summary

- Sticky (`create-reservation-summary`) shows:
  - **Room {number}** (+ floor if cheap) when assigned, or
  - **Unassigned** when `roomId` is null / Assign later
- Honest empty when no type yet (e.g. Unassigned / “Select a room type first”) — not a invented room.
- **Do not** fake HK board, deposit, or rate total here (Section 5 / 7 / HK).

### 3.8 + create room — OUT

- Reference “+” to create a physical room from the reservation is **in scope only if CURRENT has that path**.
- **CURRENT finding:** no create-room-from-reservation. `saveRoom` is Configuration / `requireRoomManager`.
- Therefore Phase 1 Section 6: **+ create room = OUT**. Do not invent a room-inventory drawer on this page. Staff add rooms in Configuration → Rooms.

### 3.9 No second assignment writer / no invented engines

- Same route + same writer.
- Do **not** invent LIVE RMS, OTA assignment, Group allotment, or an HK full-board product on create.
- HK status on the DTO may be shown as cheap display. **Do not** start filtering assignability by dirty/clean unless CURRENT already does (**it does not**). HK full board remains Housekeeping.

---

## 4. Out of Section 6 (locked)

- **Rate plan + sticky pricing** (Section 5 / [#141](https://github.com/NORUDEVGIT/NORU/issues/141)) — do not expand quotes
- **Guarantee + Confirm UI product** (Section 7) — expose assigned vs Unassigned only
- **Packages** (Section 8)
- **RTC** (room type charged ≠ reserved type) — CURRENT absent
- **+ create room** / inventing room inventory from the reservation
- Inventing **overbooking / LIVE OTA / RMS / allotment** beyond CURRENT `listAssignableRooms` + `assert_reservation_capacity`
- **HK full board** (status board, tasks, inspection) — cheap HK label optional; no HK product
- **Group allotment** / block / rooming list / parent **Company Reservation CR-100**
- Corporate / Group as **separate products** (Individual Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139) stays its own track)
- Email / SMS send confirmation
- Check-in `ROOM_REQUIRED` / walk-in registration stepper (FO) — preserve, do not relocate
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- Fake packages; offline / local-first; second Create Reservation product

---

## 5. Acceptance criteria (AC-CR6)

| ID | Criterion |
|---|---|
| **AC-CR6-1** | Specific-room list on `/restaurant/bookings/new` is filtered by the **selected room type + stay dates** via CURRENT `listAssignableRooms` (or equivalent same `hotel_rooms` + clash SoT). No generic “all rooms in house” list |
| **AC-CR6-2** | Selecting a room **binds** `roomId` → `_room_id` on the same `createReservation` → `create_hotel_reservation_priced` writer. Server re-checks assignability |
| **AC-CR6-3** | **Unassigned** create is allowed on this route (`room_id` null). `canSubmit` must **not** require a specific room. Empty assignable list still allows Unassigned create |
| **AC-CR6-4** | **Walk-in honesty:** FO `WalkInDialog` still **requires** a room (CURRENT). Create Reservation does **not** require a room when commercial source is Walk-in. No second walk-in writer |
| **AC-CR6-5** | **Conflict:** occupied / unassignable rooms are **blocked** per CURRENT (`listAssignableRooms` omit + `assert_reservation_capacity` `ROOM_ALREADY_BOOKED` / `ROOM_NOT_ASSIGNABLE`). Errors are visible. **No** invented overbooking success path |
| **AC-CR6-6** | Changing **room type** clears an incompatible specific room and shows a **warn**. Date change **revalidates** the list; stale incompatible selection is not kept as a silent valid assign |
| **AC-CR6-7** | Sticky summary shows the selected **room number** (cheap extras OK) or honest **Unassigned**. No blank-as-assigned; no fake room |
| **AC-CR6-8** | **No second assignment writer.** Create does not insert-then-`assignReservationRoom`. `assert_room_assignable` stays FO/amend. Walk-in remains `createReservation` |
| **AC-CR6-9** | Existing permission gates preserved: `requireRoutePackage("pms")`, `getBookingsAccess` / `requireReservationManager`. **No** new entitlement / RLS **model**. Flag Abel if model must change. Do not require `requireRoomManager` to assign an existing room |
| **AC-CR6-10** | Section 6 does **not** claim Phase 1 or full Create Reservation **DONE** |
| **AC-CR6-11** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR6-12** | **+ create room** is **OUT**. No `saveRoom` / inventory create from this page |
| **AC-CR6-13** | **No** invented LIVE OTA / RMS / yield / Group allotment / overbooking engine — CURRENT list + `assert_reservation_capacity` only |
| **AC-CR6-14** | **HK full board OUT.** Do not filter assignable rooms by housekeeping status (CURRENT does not). Cheap HK label optional |
| **AC-CR6-15** | **RTC OUT.** Rate (Section 5), Guarantee/Confirm product (Section 7), packages (Section 8), email/SMS are **not** expanded |
| **AC-CR6-16** | Server / RPC remains **source of truth**. UI list is advisory. Create still fail-closes on `ROOM_ALREADY_BOOKED` / `ROOM_NOT_ASSIGNABLE` / `NO_AVAILABILITY`. UI cannot override the RPC |
| **AC-CR6-17** | Section 4 room-**type** bind + availability fail-closed create (`available > 0` / `NO_AVAILABILITY`) is **not** weakened. Specific room stays optional on this route |
| **AC-CR6-18** | Locked non-goals in §4 are **absent** |
| **AC-CR6-19** | Migration honesty: **LIKELY NONE**. Eng **confirms**. Dual-lane APPLY HELD only if SECURITY DEFINER capacity/create RPCs are replaced |
| **AC-CR6-20** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product. Modern NORU box + sticky OK; **do not** clone legacy chrome |
| **AC-CR6-21** | Programme rule honoured: reference Room pick **functionality** (optional assign, type+dates list) with NORU UI. **+** only if CURRENT (it is not). Corporate/Group remain later separate products |
| **AC-CR6-22** | Parallel Section 5 coding ([#141](https://github.com/NORUDEVGIT/NORU/issues/141)) and Associations ([#139](https://github.com/NORUDEVGIT/NORU/pull/139)) are **not blocked** by this Spec. Sticky room line must not fight Section 5 sticky pricing (compose, don’t replace) |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR6-1…22; browser room list (type+dates), select bind, Unassigned create, empty-list create, type-change clear+warn, date-change revalidate, sticky Unassigned vs room number, FO walk-in still requires room, conflict still `ROOM_ALREADY_BOOKED`; no `saveRoom` on this page.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped rooms; preserve reservation gates; do not grant room-inventory create to reservation managers; no new SECURITY DEFINER unless Abel-approved.
- Regression: Sections 1–4 shell / stay / availability / Company-TA / Associations; Section 5 rate path if shipped; walk-in same writer + room-required UI; `assignReservationRoom` / FO check-in `ROOM_REQUIRED` unchanged; Configuration `saveRoom` unchanged; Guest GE closed; `listAssignableRooms` consumers (FO amend, check-in, rack) not silently broken.

---

## 7. Open Eng confirm items

1. **Type-change warn copy:** toast vs inline on the Room box. Must be visible; do not stay silent (CURRENT).
2. **Stale room on date change:** auto-clear to Unassigned + warn vs keep selection + disable submit until revalidated. Pick **one** documented rule (Section 4 type used keep+disable; room assign default **clear + warn** is simpler because Unassigned is valid).
3. **Occupied display:** keep CURRENT **omit** vs disabled row with reason. Same clash SoT either way; no overbook action.
4. **Sticky label:** “Room” vs “Assignment”; whether floor/building appear. Minimum: number or **Unassigned**.
5. **FO Walk-in:** confirm room-required stays FO-only (recommended YES).
6. **HK chip on picker:** display-only from existing DTO vs omit (default omit — HK board OUT).
7. **Sticky compose with Section 5 [#141](https://github.com/NORUDEVGIT/NORU/issues/141):** add a room line; do not remove rate/total work. Parallel OK.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Issue | **TBD** (Eng opens after plan APPROVE) |
| Migration | **LIKELY NONE** (Eng confirms). Dual-lane APPLY HELD only if capacity/create RPCs replaced |
| + create room / overbooking engine / RTC / HK board | **OUT** (CURRENT unsupported or other product) |
| FO Walk-in room required | **Preserved** (CURRENT) |
| Create path room | **Optional** (CURRENT) |
| LIVE OTA / RMS / allotment product | **Not invented** |
| Guest GE1–GE3 | **Closed** — not reopened |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
