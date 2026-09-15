# Create Reservation — Phase 1 Section 4 (Availability / room type)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 4: Availability / room type |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **LIKELY NONE.** Room-type list, stay-dated availability integers, `hotel_reservations.room_type_id`, and create bind already exist (`getRoomTypeAvailability` → `count_sellable_rooms` / `count_reserved_rooms`; writer already passes `_room_type_id`). No new availability engine, OTA/RMS, or overbooking product. Dual-lane APPLY **N/A** unless Eng replaces those SECURITY DEFINER RPCs. Additive RLS matching reservation tables OK; **flag Abel** if entitlement / RLS **model** must change |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section4-programme.md`](../create-reservation-phase1-section4-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). Section 2 (Company/TA) and Section 3 (Stay) are sibling Specs — **do not wait** on their merge. This section **consumes** stay dates + occupancy from the create draft (Section 3 owns stay rules when it ships) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → **4 Availability / room type (THIS)** → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog. Later sections own rate / room / guarantee.
>
> **Server / RPC remains source of truth.** UI maps CURRENT availability integers. Do **not** invent a LIVE OTA / RMS / overbooking engine.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Sections 1–3) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). Already takes `_room_type_id` |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Extend the existing **Room type** card: property room types + stay-dated availability states (available / limited / none) + occupancy **warn** + sticky summary of selected type + availability. Doc2 shell / sidebar collapse from Section 1 unchanged |
| Availability source | Reuse CURRENT `getRoomTypeAvailability` (or equivalent). Backed by `count_sellable_rooms` + `count_reserved_rooms`. **No** parallel inventory API |
| Confirm honesty | Hard Confirm gate may live in **Section 7**. Section 4 must **expose** availability + occupancy state. CURRENT create already fail-closes when `available === 0` (button + `assert_reservation_capacity` / `NO_AVAILABILITY`) — do not weaken that |
| Rate | Section 4 does **not** force a rate plan. Unpriced / no-rate create is allowed only per **D5** (Section 5). CURRENT priced RPC already accepts null `_rate_plan_id` |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Room type card; `useQuery` `["room-type-availability", restaurantId, arrival, departure]`; `canSubmit` requires `(selectedType?.available ?? 0) > 0` |
| Availability server fn | `src/packages/pms/lib/reservations.functions.ts` — `getRoomTypeAvailability` |
| Availability DTO | `RoomTypeAvailability`: `roomTypeId`, `code`, `name`, `maxOccupancy`, `adultCapacity`, `childCapacity`, `totalRooms`, `reserved`, `available` |
| Inventory RPCs | `count_sellable_rooms(_restaurant_id, _room_type_id)`; `count_reserved_rooms(_restaurant_id, _room_type_id, _arrival, _departure, _exclude_reservation_id)` |
| Create capacity (server SoT) | `assert_reservation_capacity` inside `create_hotel_reservation` — raises `NO_AVAILABILITY` when `sellable - reserved <= 0`. **Does not** check adults/children vs `max_occupancy` |
| Writer | `createReservation` — Zod `roomTypeId: idSchema` (required); RPC `_room_type_id` |
| RPC (priced) | `create_hotel_reservation_priced` — params include `_room_type_id`; `_rate_plan_id` **nullable** (null = skip `price_hotel_stay`) |
| Room types table | `room_types`: `id`, `code`, `name`, `max_occupancy`, `adult_capacity`, `child_capacity`, `active`, `sellable`, `description`, `bed_type`, `bed_count`, `room_size`, `room_view` |
| List filter (today) | `getRoomTypeAvailability` selects `active = true` **and** `sellable = true`, ordered by `name` |
| Occupancy helper (FO amend — not wired on create) | `occupancyExceeded` / `occupancyBlockMessage` in `src/packages/pms/lib/fo-amendments.ts` (`adults + children` vs `maxOccupancy`) |
| Sticky summary (today) | `data-testid="create-reservation-summary"` — Type, Guest, Stay; **no** room type / availability state; honest no-fake-total placeholder |
| Specific room (Section 6 — **do not expand**) | `listAssignableRooms` + Room select on `new.tsx` |
| Rate quotes (Section 5 — **do not expand**) | `quoteStay` on `new.tsx` after room type selected |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |

---

## 2. CURRENT (code wins)

- `/restaurant/bookings/new` already lists **active + sellable** property room types via `getRoomTypeAvailability({ restaurantId, arrival, departure })` once stay dates are valid.
- Each card shows name, code, `Sleeps {maxOccupancy}`, and `{available} of {totalRooms} available`. Types with `available <= 0` are **disabled** and labelled **fully booked**. There is **no** named **limited** state — only available vs none.
- Availability is **stay-dated**: query key includes arrival + departure; `available = max(0, totalRooms - reserved)` from CURRENT RPCs. Not a generic “rooms in house today” count. **Not** LIVE OTA / RMS.
- Selecting a type sets `roomTypeId`, clears specific `roomId` (unassigned) and `ratePlanId`. Date change **refetches** availability; selected `roomTypeId` is **not** auto-cleared (submit still fail-closes if that type now has `available === 0`).
- **Occupancy:** create UI does **not** warn when `adults + children > maxOccupancy`. FO amend uses `occupancyExceeded`. Public booking **blocks**. Staff create RPC (`assert_reservation_capacity`) does **not** reject occupancy overflow — only inventory count + optional specific-room clash.
- **Create bind:** `createReservation` already requires `roomTypeId` and passes `_room_type_id` to `create_hotel_reservation_priced` → `hotel_reservations.room_type_id`. Server re-checks inventory (`NO_AVAILABILITY`).
- **None → create:** `canSubmit` is false unless guest + valid dates + `roomTypeId` + `available > 0`. Button copy: “Pick a guest, valid dates and an available room type to continue.”
- Sticky summary does **not** yet show selected room type or availability state (Type / Guest / Stay + no-fake-total).
- Rate is **not** required by the writer (`_rate_plan_id` null skips pricing). Section 4 must **not** start forcing a rate.
- Specific room assign UI already exists on the page — **Section 6** owns that product. This section does not extend assignable-room behaviour.
- **No** group allotment, Company/TA inventory, overbooking policy, or closed-to-arrival / min-stay engine on this path (stay restrictions are Section 3 / rate restrictions Section 5).

---

## 3. EXPECTED — Availability / room type

### 3.1 Room type list

- Staff select **one** room type from the property’s **active + sellable** types returned by CURRENT `getRoomTypeAvailability` (or equivalent — same RPCs, tenant-scoped).
- Show at least **name** + **code** (cheap). Occupancy ceiling (`maxOccupancy` / “Sleeps N”) stays visible. Bed / description / view only if already on the DTO or a cheap same-table read — **do not** invent a new room-type catalog API.
- Empty catalogue: honest copy (CURRENT: “No sellable room types yet. Add them in Configuration → Rooms.”). Not a fake type.
- Invalid / incomplete stay dates: do **not** fetch or invent availability (CURRENT: “Choose valid dates to see availability.”). Section 3 owns date validity; Section 4 consumes it.

### 3.2 Availability for the selected stay (server SoT)

- Availability is always for the **draft arrival → departure**, not “rooms free right now.”
- Source of truth: CURRENT `getRoomTypeAvailability` integers (`totalRooms`, `reserved`, `available`) from `count_sellable_rooms` / `count_reserved_rooms`. **Do not** invent LIVE OTA, RMS, yield, or a second inventory service.
- Changing stay dates **re-fetches** and **revalidates** the selected type. Do not silently present a previously available type as still available if the new dates return none.
- **Create / confirm transaction** must still re-check on the server (`assert_reservation_capacity`). UI is advisory; RPC **wins**. Concurrent sell-out surfaces as `NO_AVAILABILITY` (honest error — do not swallow).

### 3.3 Availability states (map CURRENT integers — no new engine)

Map the CURRENT integer `available` (and optionally `totalRooms`) to three staff-visible states. **Do not** add new RPC fields or overbooking flags.

| State | Rule (honest over CURRENT) | UX |
|---|---|---|
| **available** | `available > 0` and not limited | Selectable. Show remaining count (CURRENT `{n} of {total} available` is fine) |
| **limited** | `available > 0` **and** remaining is low | Selectable. **Explicit** limited copy, e.g. “2 rooms left” / “limited”. Eng picks **one** small documented threshold from CURRENT numbers (recommended default: `available <= 2`, or `available === 1` if Eng wants tighter). Document the chosen threshold in the Eng plan — **not** a new inventory product |
| **none** | `available === 0` (or type missing from sellable list) | Not a silent empty card. Label **none / fully booked**. **Not selectable** as a successful availability choice |

- **None** must be visible as a state, not only a disabled control with no explanation.
- Do **not** invent “blocked / closed” channel states, OTA stop-sell, or allotment holds. If CURRENT RPCs do not return those signals, do not display them.
- Nearby-date search / “alternative types we invented” is **OUT**. Staff may pick another listed type that CURRENT says is available.

### 3.4 Occupancy fit (warn)

- When a type is selected (or occupancy changes after selection), **warn** if `adults + children > maxOccupancy` (same formula as FO `occupancyExceeded` — reuse that helper if cheap; **no** second occupancy model).
- Warn is **visible** and explains the ceiling (e.g. FO copy: adults and children together exceed this room type’s maximum occupancy, with counts).
- Staff may keep the type selected (warn-first, mirror Guest restriction style) **unless** Eng later fail-closes on the writer — that hard block, if any, is an Eng confirm (CURRENT create RPC does **not** enforce occupancy). Confirm-time hard block may live in **Section 7**; Section 4 must still **expose the warn**.
- Do **not** silently treat an over-capacity type as a fit. Do **not** invent adult-only vs child-only enforcement beyond CURRENT `max_occupancy` unless Eng proves `adult_capacity` / `child_capacity` are already enforced on create (**they are not**).

### 3.5 None → Confirm path honesty

- Section 4 **exposes** `none` (and occupancy-over) as first-class draft state.
- Hard Confirm chrome is **Section 7**. Until Section 7 ships, do **not** invent a second Confirm product.
- Do **not** weaken CURRENT fail-closed create: staff must not get a successful create when CURRENT availability is none. Keep button disable **and** server `NO_AVAILABILITY`.
- Limited is **not** none: selectable, with explicit remaining-count copy.

### 3.6 Bind room type on create

- Selected type **binds** `hotel_reservations.room_type_id` via the same `createReservation` → `create_hotel_reservation_priced` (`_room_type_id`) stack. CURRENT already does this — **keep it**. Do not add a parallel writer or a second room-type column.
- Creating without a room type remains **invalid** (CURRENT Zod `roomTypeId` required).
- Changing type after a rate or specific room was picked: **clear or revalidate** those dependents (CURRENT already clears `roomId` + `ratePlanId`). Rate re-quote is Section 5; specific room is Section 6.

### 3.7 Sticky summary

- Sticky summary (`create-reservation-summary`) shows:
  - **Selected room type** (name + code if cheap), or honest “No room type selected”
  - **Availability state** for the current stay: available / limited / none (plus remaining count when cheap)
- Occupancy warn may appear on the type card and/or summary — must be visible without opening a second page.
- **Do not** fake a rate total, deposit, or guarantee here (Section 5 / 7). Keep Section 1 no-fake-total honesty.

### 3.8 Rate (non-goal of this section)

- Section 4 does **not** require a rate plan to select a room type or to expose availability.
- Unpriced / no-rate create is **D5 / Section 5**. CURRENT RPC already allows null `_rate_plan_id`. This section must not start forcing a rate “to make availability look commercial.”

---

## 4. Out of Section 4 (locked)

- **Specific room assign** (Section 6) — do not expand `listAssignableRooms` / room picker behaviour
- **Rate plan + sticky pricing** (Section 5) — including D5 unpriced rules
- Inventing **LIVE OTA / RMS / yield / overbooking** policy beyond CURRENT `count_*` + `assert_reservation_capacity`
- **Group allotment** / block / rooming list / parent **Company Reservation CR-100**
- **Company / TA** persistence (Section 2)
- Stay date / nights / ETA rules beyond consuming the draft (Section 3)
- Guarantee + Confirm product (Section 7) — expose state only
- Email / SMS send confirmation
- Closed-to-arrival / min-max stay / CTA-CTD as a new availability engine (rate/stay restrictions stay in their sections)
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3 product scope
- Claiming Phase 1 or full Create Reservation **DONE**
- Fake packages; offline / local-first; inventing an availability engine

---

## 5. Acceptance criteria (AC-CR4)

| ID | Criterion |
|---|---|
| **AC-CR4-1** | Room type select lists property **active + sellable** types from CURRENT `getRoomTypeAvailability` (or equivalent) on `/restaurant/bookings/new` |
| **AC-CR4-2** | Availability is computed for the **selected stay dates** (arrival → departure), not a generic current house count |
| **AC-CR4-3** | Staff-visible states **available / limited / none** are mapped from CURRENT `available` (and `totalRooms`) integers. Limited uses one documented low-remaining threshold. **No** new inventory RPC |
| **AC-CR4-4** | **None** (`available === 0`) is explicit (fully booked / none). Type is not presented as a successful availability choice |
| **AC-CR4-5** | Occupancy **warn** when `adults + children > maxOccupancy` (reuse FO `occupancyExceeded` if cheap). Warn is visible; do not silent-fit |
| **AC-CR4-6** | Selected room type **binds** `room_type_id` on create via the same `createReservation` → `create_hotel_reservation_priced` writer (`_room_type_id`) |
| **AC-CR4-7** | **No fake availability.** Do not invent LIVE OTA, RMS, yield, allotment holds, or overbooking beyond CURRENT `count_sellable_rooms` / `count_reserved_rooms` / `assert_reservation_capacity` |
| **AC-CR4-8** | Server / RPC remains **source of truth**. Create still fail-closes on `NO_AVAILABILITY`. UI cannot override the RPC |
| **AC-CR4-9** | Sticky summary shows **selected room type + availability state** (honest empty when none selected). **No** fake rate total |
| **AC-CR4-10** | Section 4 does **not** force a rate plan. Unpriced / no-rate remains Section **5 / D5**. CURRENT null `_rate_plan_id` must not be broken by this section |
| **AC-CR4-11** | Specific room assign is **not** expanded (Section 6). Existing unassigned default may remain |
| **AC-CR4-12** | **No** Group allotment / block / CR-100 / Company-TA inventory on this surface |
| **AC-CR4-13** | Existing permission gates preserved: `requireRoutePackage("pms")`, `getBookingsAccess` / `requireReservationManager`. **No** new entitlement / RLS **model**. Flag Abel if model must change |
| **AC-CR4-14** | Confirm-time hard block chrome may live in **Section 7**; Section 4 still **exposes** none + occupancy-over state and does **not** invent a second Confirm product. CURRENT create disable-when-none is **not** weakened |
| **AC-CR4-15** | Date (or occupancy) change **revalidates** availability / occupancy warn. Stale “available” is not kept silently |
| **AC-CR4-16** | Empty sellable-type catalogue is honest. Invalid dates do not invent availability |
| **AC-CR4-17** | Section 4 does **not** claim Phase 1 or full Create Reservation **DONE**. Stay / rate / room / guarantee / packages / send confirmation remain their sections |
| **AC-CR4-18** | Locked non-goals in §4 are **absent** |
| **AC-CR4-19** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR4-20** | Migration honesty: **LIKELY NONE**. Eng **confirms**. Dual-lane APPLY HELD only if SECURITY DEFINER inventory / create RPCs are replaced. Walk-in remains a mode of the **same writer** |
| **AC-CR4-21** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR4-1…21; browser available / limited / none on `/restaurant/bookings/new`; occupancy warn; sticky summary; create still binds `room_type_id`; sell-out still `NO_AVAILABILITY`; unpriced create still allowed (null rate).
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped room types; preserve reservation gates; no new SECURITY DEFINER unless Abel-approved.
- Regression: Section 1 context/guest + sidebar collapse; walk-in still `createReservation`; FO amend occupancy helper unchanged; public booking occupancy block unchanged; `listAssignableRooms` / rate quotes not silently broken; Guest GE closed.

---

## 7. Open Eng confirm items

1. **Limited threshold:** exact rule (`available <= 2` vs `available === 1` vs share of `totalRooms`). One documented choice; no new engine.
2. **Occupancy hard-block vs warn-only:** CURRENT create RPC does **not** enforce `max_occupancy`. Spec bar is **warn**. If Eng fail-closes on the writer, flag — may belong in Section 7. Do not silently add a new RPC exception without plan approval.
3. **Confirm gate ownership:** Section 7 vs keeping CURRENT create-button disable for `none`. Section 4 must not pretend Confirm exists if it does not yet.
4. **Stale selection on date change:** auto-clear `roomTypeId` when the type becomes `none`, vs keep selection + disabled submit (CURRENT). Pick one honest rule.
5. **adult_capacity / child_capacity:** display-only vs extra warn. Default **OUT** of enforcement (CURRENT create ignores them).

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan approval |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Migration | **LIKELY NONE** (Eng confirms). Dual-lane APPLY HELD only if inventory/create RPCs replaced |
| Availability engine / LIVE OTA / RMS / overbooking product | **Not invented** — CURRENT `getRoomTypeAvailability` only |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
