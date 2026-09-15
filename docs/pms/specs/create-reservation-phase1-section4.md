# Create Reservation — Phase 1 Section 4 (Availability / room type)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 4: Availability / room type |
| **STATUS** | **OPERATIONALLY ACCEPTED** pending Outcome Review — DER PASS 2026-09-15 |
| **ENGINEERING STATUS** | **PASS** for Section 4 — delivery [#133](https://github.com/NORUDEVGIT/NORU/pull/133) MERGED |
| **Issue** | [#131](https://github.com/NORUDEVGIT/NORU/issues/131) **OPEN** until Outcome Review / Rekik formal closure YES. Do **not** claim LIVE / Phase 1 COMPLETE |
| **Migration** | **NONE** (DER). List / bind / inventory RPCs already existed. Dual-lane APPLY **N/A** (SECURITY DEFINER inventory/create RPCs were **not** replaced). RLS **UNCHANGED** |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 4 only; stay/rate/room/guarantee later sections own DONE claims |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section4-programme.md`](../create-reservation-phase1-section4-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). Section 2 (Company/TA) and Section 3 (Stay) are sibling Specs. This section **consumes** stay dates + occupancy from the create draft |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER PASS (#133). Spec docs baseline [#130](https://github.com/NORUDEVGIT/NORU/pull/130). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → **4 Availability / room type (THIS — OPERATIONALLY ACCEPTED pending Outcome Review / #131 OPEN)** → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog.
>
> **Server / RPC remains source of truth.** UI maps CURRENT availability integers. Do **not** invent a LIVE OTA / RMS / overbooking engine.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Sections 1–3) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). `_room_type_id` bind **kept** |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | `CreateReservationRoomType` card: active+sellable types + stay-dated **available / limited / none** + occupancy **soft-warn** + sticky selected type + availability state. Doc2 shell / sidebar collapse from Section 1 unchanged |
| Availability source | CURRENT `getRoomTypeAvailability` (`count_sellable_rooms` + `count_reserved_rooms`). **No** parallel inventory API |
| Confirm honesty | Hard Confirm gate may live in **Section 7**. Section 4 **exposes** availability + occupancy state. Create still fail-closes when `available === 0` (button + `assert_reservation_capacity` / `NO_AVAILABILITY`) — **not** weakened |
| Rate | Section 4 does **not** force a rate plan. Unpriced / no-rate create remains **D5 / Section 5**. Null `_rate_plan_id` still allowed |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — mounts `CreateReservationRoomType`; `useQuery` `["room-type-availability", restaurantId, arrival, departure]`; sticky `summary-room-type` / `summary-availability` / `summary-occupancy-warn`; `canSubmit` requires `(selectedType?.available ?? 0) > 0` |
| Room type UI | `src/packages/pms/components/bookings/create-reservation-room-type.tsx` — `CreateReservationRoomType`, `OccupancySoftWarn`, availability badges |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1-section4.ts` + `create-reservation-phase1-section4.test.ts` (**AC-CR4-1…21 PASS**) |
| Availability server fn | `src/packages/pms/lib/reservations.functions.ts` — `getRoomTypeAvailability` |
| Availability DTO | `RoomTypeAvailability`: `roomTypeId`, `code`, `name`, `maxOccupancy`, `adultCapacity`, `childCapacity`, `totalRooms`, `reserved`, `available` |
| Inventory RPCs | `count_sellable_rooms` / `count_reserved_rooms` |
| Create capacity (server SoT) | `assert_reservation_capacity` inside `create_hotel_reservation` — raises `NO_AVAILABILITY` when sell-out. **Does not** check adults/children vs `max_occupancy` |
| Writer | `createReservation` — Zod `roomTypeId: idSchema` (required); RPC `_room_type_id` |
| RPC (priced) | `create_hotel_reservation_priced` — `_room_type_id` required; `_rate_plan_id` **nullable** |
| Occupancy helper | FO `occupancyExceeded` / `occupancyBlockMessage` via `occupancySoftWarn` (warn-only) |
| Specific room (Section 6 — **not expanded**) | `listAssignableRooms` + Room select on `new.tsx` |
| Rate quotes (Section 5 — **not forced**) | `quoteStay` on `new.tsx` after room type selected |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |

---

## 2. CURRENT (code wins — post #133)

- `/restaurant/bookings/new` lists **active + sellable** property room types via `getRoomTypeAvailability({ restaurantId, arrival, departure })` once stay dates are valid (`enabled: canManage && datesValid`).
- **States (documented):** **available** `available > 2`; **limited** `available > 0 && available <= 2` (`CREATE_RESERVATION_LIMITED_AVAILABLE_MAX = 2`); **none** `available === 0`. Badges + copy via `roomTypeAvailabilityState` / `roomTypeAvailabilityCopy`. **None** = Fully booked; not selectable (`isRoomTypeSelectable` false); create `canSubmit` still requires `available > 0`.
- Availability is **stay-dated**: query key includes arrival + departure; `available = max(0, totalRooms - reserved)` from CURRENT RPCs. **Not** LIVE OTA / RMS / yield.
- Selecting a type sets `roomTypeId`, clears specific `roomId` (unassigned) and `ratePlanId`. Date change **refetches** availability. **Stale selection rule:** keep selection + disable submit if type becomes none (`CREATE_RESERVATION_STALE_SELECTION_RULE = keep-selection-disable-submit`) — selection is **not** auto-cleared.
- **Occupancy soft-warn:** `OccupancySoftWarn` when `adults + children > maxOccupancy` (FO `occupancyExceeded`). Warn-only — create is **not** hard-blocked for occupancy; create RPC still does **not** enforce `max_occupancy`. `adult_capacity` / `child_capacity` are **display-only**.
- **Create bind:** `createReservation` requires `roomTypeId` → `_room_type_id` → `hotel_reservations.room_type_id`. Server re-checks inventory (`NO_AVAILABILITY` preserved — not swallowed).
- **Sticky summary:** shows selected room type (name+code) via `stickyRoomTypeLabel` + availability state via `stickyAvailability` / `stickyAvailabilityCopy` (`summary-room-type` / `summary-availability`). Occupancy warn on summary (`summary-occupancy-warn`). No fake rate total (`CREATE_RESERVATION_SUMMARY_NO_TOTAL`).
- **Empty / invalid dates:** honest empty catalogue copy; invalid dates do not invent availability (`CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES`).
- Rate is **not** required (`_rate_plan_id` null still allowed). Specific room assign UI remains — **Section 6** owns that product (not expanded).
- **DATABASE IMPACT:** **NONE**. No Section 4 migration file. Dual-lane APPLY **N/A**.
- **Walk-in:** still uses the same `createReservation` writer from Front Office.

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#130](https://github.com/NORUDEVGIT/NORU/pull/130) EXPECTED AC-CR4-1…21 remain the acceptance baseline; delivery [#133](https://github.com/NORUDEVGIT/NORU/pull/133) matched locks **21/21** (+ Section 1/2 locks still PASS on regression). Independent QA **PASS**.
- Pre-existing Stay / rate / room / details UI on the same page **remains**. Section 4 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#131](https://github.com/NORUDEVGIT/NORU/issues/131) remains **OPEN** until Outcome Review / Rekik formal closure YES. This docs recon does **not** close #131.

---

## 3. EXPECTED — Availability / room type (authorized baseline — delivered)

### 3.1 Room type list — **delivered**

- Staff select **one** room type from property **active + sellable** types via CURRENT `getRoomTypeAvailability`.
- Name + code + Sleeps N + availability copy; adult/child capacity display-only.
- Empty catalogue / invalid dates: honest copy; no invented availability.

### 3.2 Availability for the selected stay (server SoT) — **delivered**

- Stay-dated arrival → departure; CURRENT integers only.
- Date change revalidates; create transaction still re-checks (`assert_reservation_capacity` / `NO_AVAILABILITY`).

### 3.3 Availability states — **delivered**

| State | Rule | UX |
|---|---|---|
| **available** | `available > 2` | Selectable; remaining + of-total copy |
| **limited** | `available > 0 && available <= 2` | Selectable; explicit Limited badge + remaining |
| **none** | `available === 0` | Fully booked; not selectable as success; create disabled |

No invented blocked / closed / OTA stop-sell signals.

### 3.4 Occupancy fit (warn) — **delivered**

- Soft-warn via FO formula; staff may keep selection; no create-RPC occupancy hard-block.

### 3.5 None → Confirm path honesty — **delivered**

- None + occupancy-over exposed; no second Confirm product; CURRENT fail-closed create for none **kept**.

### 3.6 Bind room type on create — **delivered**

- Same writer / `_room_type_id`; room type still required; dependents cleared on type change.

### 3.7 Sticky summary — **delivered**

- Selected type (name+code) + availability state (+ remaining); occupancy warn visible; no fake totals.

### 3.8 Rate (non-goal) — **honoured**

- Rate not forced; null `_rate_plan_id` still allowed (Section 5 / D5).

---

## 4. Out of Section 4 (locked — still out)

- **Specific room assign** (Section 6) — `listAssignableRooms` / room picker not expanded
- **Rate plan + sticky pricing** (Section 5) — including D5 unpriced rules
- Inventing **LIVE OTA / RMS / yield / overbooking** beyond CURRENT `count_*` + `assert_reservation_capacity`
- **Group allotment** / block / rooming list / parent **Company Reservation CR-100**
- **Company / TA** persistence (Section 2)
- Stay date / nights / ETA rules beyond consuming the draft (Section 3)
- Guarantee + Confirm product (Section 7) — expose state only
- Email / SMS send confirmation
- Closed-to-arrival / min-max stay / CTA-CTD as a new availability engine
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3 product scope
- Claiming Phase 1 or full Create Reservation **DONE**
- Fake packages; offline / local-first; inventing an availability engine

---

## 5. Acceptance criteria (AC-CR4) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR4-1…21** | As authorized in Spec #130 | **PASS** (#133) |

Full AC text remains the #130 baseline; do not reopen Guest GE; do not claim Phase 1 DONE; do not close #131 from this docs recon.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 4 only (#133 MERGED 2026-09-15). Independent QA **PASS**. `tsc` PASS; locks **AC-CR4-1…21 PASS** (+ AC-CR1 / AC-CR2 regression PASS).
- Security: staff-only; tenant-scoped room types; existing FO / reservation gates preserved; **no** new SECURITY DEFINER; **no** new RLS policies.
- Regression: Section 1 context/guest + sidebar collapse; Section 2 Company/TA bind; walk-in still `createReservation`; FO amend occupancy helper unchanged; public booking occupancy block unchanged; `listAssignableRooms` / rate quotes not silently broken; Guest GE closed.
- Migration: **NONE**. Dual-lane APPLY **N/A**.
- Issue [#131](https://github.com/NORUDEVGIT/NORU/issues/131) **OPEN** until Outcome Review / Rekik formal closure YES.

---

## 7. Eng confirm items (resolved in #133)

| Item | Resolution |
|---|---|
| Limited threshold | `available <= 2` (`CREATE_RESERVATION_LIMITED_AVAILABLE_MAX = 2`) — documented |
| Occupancy hard-block vs warn-only | **Warn-only** — create RPC still does **not** enforce `max_occupancy` |
| Confirm gate ownership | Hard Confirm stays **Section 7**; CURRENT create disable-when-none **kept** |
| Stale selection on date change | **Keep selection + disable submit** if type becomes none |
| adult_capacity / child_capacity | **Display-only** / OUT of enforcement |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** pending Outcome Review — DER PASS 2026-09-15 |
| ENGINEERING | **PASS** (#133) |
| Implemented / PASS (Section 4) | **Yes** (DER) |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Migration | **NONE**. Dual-lane APPLY **N/A**. RLS **UNCHANGED** |
| Availability engine / LIVE OTA / RMS / overbooking product | **Not invented** — CURRENT `getRoomTypeAvailability` only |
| Create Reservation DONE | **NO** |
| Issue #131 | **OPEN** until Outcome Review / Rekik formal closure YES |
