# Create Reservation — Phase 1 Section 6 (Room assignment)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 6: Room assignment |
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 (DER PASS) |
| **ENGINEERING STATUS** | **PASS** for Section 6 — delivery [#148](https://github.com/NORUDEVGIT/NORU/pull/148) MERGED (`73801ada08efd0bde0234f33bc1c8bd86501c36d` by AK21ER @ 2026-09-15T14:17:43Z) |
| **Issue** | [#145](https://github.com/NORUDEVGIT/NORU/issues/145) **CLOSED** completed — OPERATIONALLY ACCEPTED. Do **not** claim LIVE / Phase 1 COMPLETE |
| **Migration** | **NONE** (DER). Optional `hotel_reservations.room_id`, create bind (`roomId` → `_room_id`), `listAssignableRooms`, and conflict RPCs already existed. Dual-lane APPLY **N/A** (SECURITY DEFINER `assert_reservation_capacity` / `create_hotel_reservation` / `create_hotel_reservation_priced` were **not** replaced). RLS **UNCHANGED**. Flag Abel **NOT** required. No new room table, no create-room-from-reservation API, no invented overbooking engine |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 6 only; guarantee / packages later sections own DONE claims |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section6-programme.md`](../create-reservation-phase1-section6-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). [`create-reservation-phase1-section4.md`](./create-reservation-phase1-section4.md) already binds **room type** + availability. [`create-reservation-phase1-section5.md`](./create-reservation-phase1-section5.md) is Rate. Individual Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139) shipped. This section **consumes** stay dates + selected room type; it assigns a **specific room** |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER PASS (#148) and Rekik **formal closure YES**. Spec docs baseline [#143](https://github.com/NORUDEVGIT/NORU/pull/143). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → **6 Room assign (THIS — OPERATIONALLY ACCEPTED / #145 CLOSED)** → 7 Guarantee + confirm → 8 Packages if catalog.
>
> **Programme rule (LOCKED):** Cover efficient functionality from the reference Individual create **Room** pick (**+ button patterns only if CURRENT** — researched: **absent** → **OUT**) with **modern NORU UI** (own box, sticky summary, drawers). **Do not** clone legacy chrome. Placement may borrow from reference.
>
> **Server / RPC remains source of truth** for room availability and assignment. UI lists CURRENT assignable rooms. Do **not** invent a LIVE OTA / RMS / overbooking engine. Section 4 already binds room **type** + availability state — Section 6 is the **specific room**.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Sections 1–5) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). `_room_id` bind **kept** (nullable); Unassigned = null |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | `CreateReservationRoomAssignment` own box + sticky **Room** line: optional specific room for selected type + stay dates, or honest **Unassigned**. Modern NORU boxes (not legacy clone). Doc2 shell / sidebar collapse from Section 1 unchanged |
| Assignment source | CURRENT `listAssignableRooms` (type + dates; occupied **omit**). Create re-check: `assert_reservation_capacity` → `ROOM_NOT_ASSIGNABLE` / `ROOM_ALREADY_BOOKED`. **No** parallel assignment API |
| Walk-in honesty | FO `WalkInDialog` **requires** a room at UI. `/restaurant/bookings/new` **allows** unassigned. Commercial booking source `walk_in` is **not** FO walk-in mode and does **not** require a room |
| + create room | **OUT** — CURRENT has no create-room-from-reservation. Inventory create is Configuration `saveRoom` (`requireRoomManager`) |
| Confirm honesty | Hard Confirm / Guarantee chrome may live in **Section 7**. Section 6 **exposes** assigned vs Unassigned. Do not invent a second Confirm product |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — mounts `CreateReservationRoomAssignment`; `useQuery` `["assignable-rooms", restaurantId, roomTypeId, arrival, departure]`; `roomId` state default `UNASSIGNED`; submit `roomId: roomId === UNASSIGNED ? null : roomId`; `canSubmitCreateReservation` does **not** require a room; `selectRoomType` clears to Unassigned + toast; stale-date `shouldClearStaleAssignedRoom` + toast; sticky `summary-room` / `summary-room-assignment` |
| Room UI | `src/packages/pms/components/bookings/create-reservation-room-assignment.tsx` — `CreateReservationRoomAssignment` (Assign later + `Room {number}` · Floor; empty later-assign copy; HK chip omitted) |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1-section6.ts` + `create-reservation-phase1-section6.test.ts` (**AC-CR6-1…22 PASS**) |
| Assignable list | `src/packages/pms/lib/reservations.functions.ts` — `listAssignableRooms` (`requireReservationManager`) |
| Assignable DTO | `AssignableRoom`: `id`, `roomNumber`, `floor`, `building`, `housekeepingStatus` |
| List filter (CURRENT) | `hotel_rooms` where `room_type_id` + `active = true` + `status = 'available'`; then omit rooms with overlapping `hotel_reservations` in `pending` \| `confirmed` \| `checked_in` for arrival→departure (`excludeReservationId` unused on create) |
| Writer | `createReservation` — Zod `roomId: idSchema.nullable().optional()`; RPC `_room_id` |
| RPC (priced) | `create_hotel_reservation_priced` — forwards `_room_id` (nullable) into `create_hotel_reservation` |
| Create capacity / clash (server SoT) | `assert_reservation_capacity` inside `create_hotel_reservation` — when `_room_id IS NOT NULL`: room must be same type, `active`, `status = 'available'` else `ROOM_NOT_ASSIGNABLE`; overlapping stay else `ROOM_ALREADY_BOOKED`. **Null `_room_id` skips room clash** (type inventory still via `NO_AVAILABILITY`) |
| FO assign guard (not create writer) | `assert_room_assignable` — check-in / move / rack. Same exception codes. **Not** a second create writer |
| Post-create assign (not create writer) | `assignReservationRoom` → `amend_hotel_reservation` — detail / FO assign-before-check-in. Create is **not** insert-then-assign |
| Error copy | `reservationError` in `reservations.server.ts` — `ROOM_NOT_ASSIGNABLE`, `ROOM_ALREADY_BOOKED`. Check-in-only `ROOM_REQUIRED` is **not** a create-path rule |
| Walk-in (same writer, different UI) | `src/packages/pms/components/frontoffice/front-office-dialogs.tsx` — `WalkInDialog`: `listAssignableRooms` + `createReservation`; submit **disabled** unless `roomId`; no Unassigned option |
| Inventory create (OUT of this path) | `saveRoom` in `rooms.functions.ts` — Configuration; `requireRoomManager`. **Not** mounted on `/restaurant/bookings/new` |
| Room inventory statuses | `ROOM_STATUSES` = `available` \| `out_of_order` \| `out_of_service` (`rooms.server.ts`). OOO/OOS excluded by `status = 'available'` |
| HK on DTO | `housekeepingStatus` returned; create picker **does not** show or filter it (`CREATE_RESERVATION_HK_CHIP = omit`) |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |
| Section 4 consume | `CreateReservationRoomType` + `getRoomTypeAvailability` — type + available/limited/none. **Required**. Section 6 does not re-own type availability |
| Section 5 compose | Sticky Rate / Rate & Total / Stay total remain; room line sits **above** them (`summary-room` then `summary-rate`) |

---

## 2. CURRENT (code wins — post #148)

- `/restaurant/bookings/new` shows a **Room assignment (optional)** card (`CreateReservationRoomAssignment`) after the Rate card. The picker is enabled only after a room type is selected and stay dates are valid. Query: `listAssignableRooms({ restaurantId, roomTypeId, arrival, departure })` once `canManage && datesValid && !!roomTypeId`.
- **List is filtered by type + stay dates.** Physical rooms must match the selected `room_type_id`, be `active`, and have inventory `status = 'available'` (OOO / OOS omitted). Rooms with an overlapping `pending` / `confirmed` / `checked_in` reservation are **omitted** (`CREATE_RESERVATION_OCCUPIED_DISPLAY = omit`) — not shown as occupied-with-warn. Display: `Room {number}` + optional `Floor`. Building / HK status are on the DTO but unused on this picker.
- **Empty / none:** copy: “No free rooms of this type for those dates — the stay can still be booked and assigned later.” Create remains allowed. Needs-type copy: “Pick a room type to assign a specific room.”
- **Unassigned default:** `roomId` state is `UNASSIGNED` (“Assign later”). Submit sends `roomId: null` → `_room_id` null. `canSubmitCreateReservation` = guest + valid dates + room type with `available > 0` + Section 5 priced/unpriced rule — **specific room is not required**.
- **Select binds:** a chosen room id is passed on the **same** `createReservation` call. Server re-checks. Concurrent clash surfaces as `ROOM_ALREADY_BOOKED` (honest toast — not swallowed). Wrong type / inactive / not `available` → `ROOM_NOT_ASSIGNABLE`.
- **Walk-in honesty:** FO `WalkInDialog` uses the same writer but **requires** `roomId` (no Assign later; button disabled). Check-in completion separately requires a room (`ROOM_REQUIRED`) — FO check-in, **not** this create page. Commercial booking source `walk_in` on the Create Reservation context card is a SET6 / default **source label**, not FO walk-in mode, and does **not** require a room.
- **Conflict policy:** **block** (omit from list + server exception). **No** staff overbooking override, no “book occupied anyway,” no allotment bump.
- **Change room type:** `selectRoomType` **clears** `roomId` to `UNASSIGNED` (and `ratePlanId`) and shows a **toast** when a specific room was assigned (`CREATE_RESERVATION_TYPE_CHANGE_ROOM_WARN = toast`). Date / nights change **refetches** the list; `shouldClearStaleAssignedRoom` **clears to Unassigned + toast** when the selected room is absent from the new list (`CREATE_RESERVATION_STALE_ROOM_RULE = clear-to-unassigned-toast`). A still-assignable room is **kept**.
- **Sticky summary:** Type, Guest, Associations/Company/TA, Stay, Nights, Occupancy, Room type, Availability, **Room** (`Room {number}` · Floor, or honest **Unassigned**), then Section 5 Rate / total. Label is **Room** (`CREATE_RESERVATION_STICKY_ROOM_LABEL`). No blank-as-assigned; no fake room number. Sticky room line **composes** with Section 5 — does not replace pricing lines.
- **+ create room:** **absent** on this route. No `saveRoom` / room-inventory dialog from the reservation draft. Creating a physical room is Configuration (`saveRoom` / `requireRoomManager`).
- **No second create writer.** `assignReservationRoom` is post-create. Walk-in still `createReservation`.
- **DATABASE IMPACT:** **NONE**. `room_id` already nullable on `hotel_reservations`. Writer + priced RPC already accept null / uuid. No Section 6 migration file. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#143](https://github.com/NORUDEVGIT/NORU/pull/143) EXPECTED AC-CR6-1…22 remain the acceptance baseline; delivery [#148](https://github.com/NORUDEVGIT/NORU/pull/148) matched locks **22/22** (+ Section 1–5 / Associations locks still PASS on regression). Independent QA **PASS** (Rekik, pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered).
- **No DOCUMENTATION / IMPLEMENTATION DISCREPANCY:** Spec ACs that shipped are present in code. Honest notes (not discrepancies): sticky shows **Unassigned** even before a room type is picked (Spec §3.7 allowed Unassigned / “Select a room type first”); floor is shown when present; occupied rooms stay **omit**; HK chip **omit**; date change **revalidates** and clears only when stale (does **not** always-clear like Section 5 `ratePlanId`).
- Pre-existing Stay / Rate / Details UI on the same page **remain**. Section 6 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#145](https://github.com/NORUDEVGIT/NORU/issues/145) **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).

---

## 3. EXPECTED — Room assignment (authorized baseline — delivered)

### 3.1 Specific room select — **delivered**

- Staff may select **one** specific room from CURRENT `listAssignableRooms` for the **selected room type + draft stay dates**.
- Room number (+ floor when present). Building unused on this picker. **No** new room catalog API.
- **Modern NORU box** (`CreateReservationRoomAssignment` in the Doc2 main column, under Rate). **Not** a legacy chrome clone.
- No room type / invalid dates: picker shows needs-type copy; query not enabled.
- Occupied / clashing rooms stay **off the success list** (omit). **No** overbooking pick.

### 3.2 Empty / Unassigned (create path) — **delivered**

- **Unassigned is a valid create** on `/restaurant/bookings/new` unless this stay is the **FO Walk-in mode** (see §3.3).
- Empty assignable list: honest later-assign copy. Staff may still create **Unassigned**.
- Picker keeps an explicit Assign later choice. Sticky says **Unassigned** (not a blank, not a fake room number).
- Creating without a room binds `room_id = null` on the same writer. **Not** insert-then-`assignReservationRoom`.

### 3.3 Walk-in honesty (CURRENT) — **delivered**

| Surface | Room required? | Rule |
|---|---|---|
| `/restaurant/bookings/new` | **No** | Unassigned allowed, including when commercial source is Walk-in |
| FO `WalkInDialog` (same writer) | **Yes** (UI) | Preserve CURRENT: no Unassigned; submit disabled without `roomId` |
| Check-in complete | **Yes** (FO) | `ROOM_REQUIRED` — **out of Section 6 product**; not moved onto Create Reservation |

Create Reservation is **not** forced to require a room because the booking-source label is Walk-in. FO walk-in is **not** loosened to allow unassigned.

### 3.4 Conflict / occupied (CURRENT rules only) — **delivered**

- **Block** assignment of a room that CURRENT clash logic treats as taken (`pending` / `confirmed` / `checked_in` overlapping arrival→departure) or not assignable (`ROOM_NOT_ASSIGNABLE`).
- UI: **omit**. Server: keep `assert_reservation_capacity` exceptions; surface via `reservationError` — **not swallowed**.
- **No** overbooking, house-use bump, allotment steal, or OOO override on this path.

### 3.5 Change room type (clear incompatible + warn) — **delivered**

- Changing the **room type** **clears** a specific room to Unassigned and shows a **toast**.
- Changing **stay dates** **re-fetches** `listAssignableRooms`. If the selected room is absent from the new list, **clear to Unassigned + toast**. If it remains assignable, **keep**.

### 3.6 Bind on create (same writer) — **delivered**

- Selected room **binds** `hotel_reservations.room_id` via `createReservation` → `create_hotel_reservation_priced` (`_room_id`).
- Unassigned binds **null**. Room type remains **required** (Section 4).
- **No** parallel create API. **No** create-time call to `assignReservationRoom`. Walk-in remains a mode of `createReservation`.

### 3.7 Sticky summary — **delivered**

- Sticky (`create-reservation-summary`) shows:
  - **Room {number}** (+ floor if present) when assigned, or
  - **Unassigned** when `roomId` is Assign later / no type / no selected room object
- **Not** a fake room. HK board / deposit / rate total are **not** invented here (Section 5 already owns rate/total; Section 7 / HK later).

### 3.8 + create room — OUT — **honoured**

- **+ create room = OUT.** No `saveRoom` / inventory create from this page. Staff add rooms in Configuration → Rooms.

### 3.9 No second assignment writer / no invented engines — **delivered**

- Same route + same writer.
- **No** invented LIVE RMS, OTA assignment, Group allotment, or HK full-board product on create.
- HK status on the DTO is **not** shown and **not** used to filter assignability.

---

## 4. Out of Section 6 (locked — still out)

- **Rate plan + sticky pricing** (Section 5) — compose only; do not expand quotes
- **Guarantee + Confirm UI product** (Section 7) — expose assigned vs Unassigned only
- **Packages** (Section 8)
- **RTC** (room type charged ≠ reserved type) — CURRENT absent
- **+ create room** / inventing room inventory from the reservation
- Inventing **overbooking / LIVE OTA / RMS / allotment** beyond CURRENT `listAssignableRooms` + `assert_reservation_capacity`
- **HK full board** (status board, tasks, inspection) — no HK chip; no HK product
- **Group allotment** / block / rooming list / parent **Company Reservation CR-100**
- Corporate / Group as **separate products** (Individual Associations stays its own track)
- Email / SMS send confirmation
- Check-in `ROOM_REQUIRED` / walk-in registration stepper (FO) — preserve, do not relocate
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- Fake packages; offline / local-first; second Create Reservation product

---

## 5. Acceptance criteria (AC-CR6) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR6-1…22** | As authorized in Spec #143 | **PASS** (#148) |

Full AC text remains the #143 baseline; do not reopen Guest GE; do not claim Phase 1 DONE.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 6 only (#148 MERGED 2026-09-15, SHA `73801ada08efd0bde0234f33bc1c8bd86501c36d`). Independent QA **PASS** (Rekik, pre-merge). `tsc` PASS; locks **AC-CR6-1…22 PASS** (+ AC-CR1 / AC-CR2 / AC-CR4 / AC-CR5 / Associations regression PASS). Browser **NOT RUN ≠ PASS** (IQ covered).
- Security: staff-only; tenant-scoped rooms; existing FO / reservation gates preserved; assign uses `requireReservationManager` (not `requireRoomManager`); **no** new SECURITY DEFINER; **no** new RLS policies.
- Regression: Sections 1–5 shell / stay / availability / Company-TA / Rate / Associations (as shipped); walk-in same writer + room-required UI; `assignReservationRoom` / FO check-in `ROOM_REQUIRED` unchanged; Configuration `saveRoom` unchanged; Guest GE closed; `listAssignableRooms` consumers (FO amend, check-in, rack) not silently broken.
- Migration: **NONE**. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.
- **#145** **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).

---

## 7. Eng confirm items (resolved in #148)

| Item | Resolution |
|---|---|
| Type-change warn copy | **Toast** when a specific room clears on room-type change (`CREATE_RESERVATION_TYPE_CHANGE_ROOM_WARN = toast`) |
| Stale room on date change | **Auto-clear to Unassigned + toast** when selected room is absent from the re-fetched list (`CREATE_RESERVATION_STALE_ROOM_RULE = clear-to-unassigned-toast`). Still-assignable rooms are kept |
| Occupied display | Keep CURRENT **omit** from list (`CREATE_RESERVATION_OCCUPIED_DISPLAY = omit`). No overbook row |
| Sticky label | **Room** — `Room {number}` (+ floor if present) or **Unassigned**. Composes with Section 5 rate/total |
| FO Walk-in | Room-required stays **FO `WalkInDialog` only**. Create path Unassigned OK |
| HK chip on picker | **Omit** (`CREATE_RESERVATION_HK_CHIP = omit`) — HK board OUT |
| Sticky compose with Section 5 | Room line under room type / availability; Section 5 pricing lines **kept** |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** (#145 CLOSED) |
| ENGINEERING | **PASS** (#148) |
| Implemented / PASS (Section 6) | **Yes** (DER) |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Migration | **NONE**. Dual-lane APPLY **N/A**. RLS **UNCHANGED**. Flag Abel **NOT** required |
| + create room / overbooking engine / RTC / HK board / second writer | **OUT** |
| FO Walk-in room required | **Preserved** (CURRENT) |
| Create path room | **Optional** (CURRENT) |
| LIVE OTA / RMS / allotment product | **Not invented** — CURRENT `listAssignableRooms` + `assert_reservation_capacity` only |
| Guest GE1–GE3 | **Closed** — not reopened |
| Create Reservation DONE | **NO** |
| Issue #145 | **CLOSED** completed |
