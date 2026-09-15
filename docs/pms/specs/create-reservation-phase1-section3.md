# Create Reservation — Phase 1 Section 3 (Stay)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 3: Stay |
| **STATUS** | **OPERATIONALLY ACCEPTED** pending Outcome Review — ENGINEERING PASS 2026-09-15 |
| **ENGINEERING STATUS** | **PASS** for Section 3 — delivery [#135](https://github.com/NORUDEVGIT/NORU/pull/135) MERGED (`562a990`) |
| **Issue** | [#129](https://github.com/NORUDEVGIT/NORU/issues/129) **OPEN** until Outcome Review / Rekik formal closure YES. Do **not** claim LIVE / Phase 1 COMPLETE. This docs recon does **not** close #129 |
| **Spec baseline** | [#128](https://github.com/NORUDEVGIT/NORU/pull/128) — still OPEN / Eng-ready text **STALE** (`ENGINEERING NOT STARTED`). **Do not merge #128 as-is.** This CURRENT recon **supersedes** it |
| **Migration** | **NONE** (DER). Stay fields already on `create_hotel_reservation_priced` / `hotel_reservations` (`arrival_date`, `departure_date`, `adults`, `children`, `special_requests`, `notes`). Dual-lane APPLY **N/A** (SECURITY DEFINER create RPCs were **not** replaced). RLS **UNCHANGED**. Flag Abel **NOT** required. No Section 3 migration file |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 3 only; this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section3-programme.md`](../create-reservation-phase1-section3-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). [`create-reservation-phase1-section2.md`](./create-reservation-phase1-section2.md) (Company/TA). [`create-reservation-phase1-section4.md`](./create-reservation-phase1-section4.md) already binds room type + availability and owns `OccupancySoftWarn` — Section 3 **reuses** that warn; it does **not** take Section 4 ownership |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng **PASS** (#135 MERGED). Spec docs baseline [#128](https://github.com/NORUDEVGIT/NORU/pull/128) is **superseded** (do not merge the stale Eng-ready draft). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → **3 Stay (THIS — OPERATIONALLY ACCEPTED pending Outcome Review / #129 OPEN)** → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog.
>
> Upgrade **Stay UX** on the existing route/writer. **Do not** rebuild `createReservation` / `create_hotel_reservation_priced`.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Sections 1–2) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in) — **upgrade Stay UX; do not rebuild writer** |
| Phase 1 | Individual Create Reservation workspace (corporate / TA-linked individual stays remain Section 2) |
| UI | `CreateReservationStay` card: arrival / nights / departure **linked**; adults / children; special requests / notes folded under Stay. Sticky shows **honest stay** (dates + nights + occupancy) plus Section 4 type / availability — **no fake totals** |
| Date helpers | Reuse `propertyToday`, `nightsBetween`, `addDays`, `formatStayDate` (`@/shared/lib/property-dates` via `reservation-bits` / `reservation-dates`) |
| Arrival change rule | **Keep nights, move departure** (`addDays(arrival, nights)`). Invalid prior range falls back to 1 night |
| Occupancy | Soft-warn only — reuses Section 4 `OccupancySoftWarn` (`maxOccupancy` / FO `occupancyExceeded`). **Not** a hard-block |
| Walk-in / status | Same form / same writer. Section 3 **did not invent** a new status model (`pending` \| `confirmed` only). Later Section 7 owns Confirm / Guarantee chrome |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — mounts `CreateReservationStay`; `handleArrivalChange` / `handleNightsChange` / `handleDepartureChange`; sticky `summary-stay` / `summary-stay-dates` / `summary-stay-nights` / `summary-stay-occupancy`; Stay `OccupancySoftWarn` `testId="stay-occupancy-warn"` |
| Stay UI | `src/packages/pms/components/bookings/create-reservation-stay.tsx` — `CreateReservationStay` (arrival required; nights stepper; departure; adults / children; special requests / notes) |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1.ts` + `create-reservation-phase1.test.ts` (**AC-CR3-1…16 PASS**) — `linkedStayFromArrival` / `linkedStayFromNights` / `linkedStayFromDeparture` / `isStayRangeValid` / `formatStayOccupancySummary` / `CREATE_RESERVATION_ARRIVAL_CHANGE_RULE = keep_nights` |
| Date helpers (shared) | `src/shared/lib/property-dates.ts` — `propertyToday`, `nightsBetween`, `addDays`, `formatStayDate` |
| Date re-exports | `src/packages/pms/lib/reservation-dates.ts`; `src/packages/pms/components/bookings/reservation-bits.tsx` |
| Timezone | `useRestaurantTimezone()` → `propertyToday(timezone)` |
| Occupancy soft-warn (Section 4 reuse) | `OccupancySoftWarn` in `create-reservation-room-type.tsx` → `occupancySoftWarn` (`create-reservation-phase1-section4.ts`) → FO `occupancyExceeded` / `occupancyBlockMessage` |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` / `stayInputSchema` |
| Server date gate | `assertStayDates` in `reservations.server` (via `createReservation`) |
| RPC (priced) | `create_hotel_reservation_priced` — already takes `_arrival`, `_departure`, `_adults`, `_children`, `_special_requests`, `_notes` |
| Reservation columns | `hotel_reservations.arrival_date` / `departure_date` / `adults` / `children` / `special_requests` / `notes` — **already present** |
| Sticky honesty | `CREATE_RESERVATION_SUMMARY_NO_TOTAL` in `create-reservation-phase1.ts` (no-fake-total honesty preserved; later Section 5 owns priced total) |
| Submit | `canSubmitCreateReservation` requires `datesValid` (`isStayRangeValid`). Occupancy warn is **not** a submit gate |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |
| Walk-in (same writer) | `src/packages/pms/components/frontoffice/front-office-dialogs.tsx` |

---

## 2. CURRENT (code wins — post #135)

- `/restaurant/bookings/new` shows a **Stay** card (`CreateReservationStay`, `data-testid="create-reservation-stay"`) after Guest / Associations. Fields: **Arrival** (required date), **Nights** (editable number, min 1), **Departure** (date, `min = addDays(arrival, 1)`), **Adults** (1–20), **Children** (0–20), plus **Special requests** and **Internal notes** folded under the same card.
- **Arrival** defaults to `propertyToday(timezone)` via `useRestaurantTimezone()`. Initial **departure** is `addDays(today, 1)` (1 night).
- **Linked dates / nights (shipped):**
  - Changing **nights** updates **departure** (`linkedStayFromNights` → `addDays(arrival, nights)`).
  - Changing **departure** updates **nights** (`linkedStayFromDeparture` → `nightsBetween`).
  - Changing **arrival** keeps **nights** and moves **departure** (`linkedStayFromArrival` → `addDays(arrival, nights)`). Constant: `CREATE_RESERVATION_ARRIVAL_CHANGE_RULE = keep_nights`.
  - If the prior range is invalid, arrival change falls back to **1 night** (`CREATE_RESERVATION_MIN_NIGHTS`).
- **Invalid range** `departure <= arrival` (or empty dates) is blocked: `datesValid = isStayRangeValid(arrival, departure)`. Copy: `CREATE_RESERVATION_STAY_INVALID_RANGE` (“Departure must be after arrival.”). Create cannot submit (`canSubmitCreateReservation` requires `datesValid`). Server `assertStayDates` remains. Minimum stay is **1 night**.
- **Occupancy:** adults ≥ 1 / children ≥ 0 captured on the same `createReservation` payload (`_adults` / `_children`). When a **room type is selected**, Stay mounts Section 4 `OccupancySoftWarn` (`testId="stay-occupancy-warn"`) using `maxOccupancy` / FO `occupancyExceeded`. **Warn-only** — create is **not** hard-blocked for occupancy. Adult / child capacity labels stay **display-only** per Section 4. If no room type is selected, occupancy is collected without a capacity warn.
- **Notes:** `specialRequests` → `_special_requests`; `notes` → `_notes`. Same payload fields; no second notes writer or table.
- **Sticky summary:** honest stay — dates (`summary-stay-dates`), nights (`summary-stay-nights` when valid), occupancy (`summary-stay-occupancy` via `formatStayOccupancySummary`). Plus Section 4 room type / availability. **No-fake-total** honesty preserved (`CREATE_RESERVATION_SUMMARY_NO_TOTAL` / `summary-no-fake-total`). Rate / tax / package totals are **not** Section 3.
- **No second Stay writer.** Same `createReservation` → `create_hotel_reservation_priced`. FO walk-in still uses `createReservation`.
- **Status model:** Section 3 did **not** invent new statuses. Create remains `pending` \| `confirmed` only. Later Section 7 owns Confirm / Guarantee chrome on the same page.
- **DATABASE IMPACT:** **NONE**. No Section 3 migration file. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#128](https://github.com/NORUDEVGIT/NORU/pull/128) EXPECTED **AC-CR3-1…16** remain the acceptance baseline; delivery [#135](https://github.com/NORUDEVGIT/NORU/pull/135) matched locks **16/16** (AC-CR1 / AC-CR2 / AC-CR4 regression PASS on that PR). **#128 is superseded** — its header still says ENGINEERING **NOT STARTED** while #135 already shipped. **Do not merge #128 as-is.**
- **No DOCUMENTATION / IMPLEMENTATION DISCREPANCY** versus post-#135 code for the shipped ACs. Honest notes (not discrepancies):
  - Arrival change rule (Spec #128 Eng pick) shipped as **keep nights / move departure**.
  - Live occupancy warn is Section 4 `OccupancySoftWarn` (`maxOccupancy` only). Helper `occupancyCapacitySoftWarn` (adult / child capacity issues) exists on the Section 3 lock module but is **not** the live Stay renderer — adult / child capacity stay display-only per Section 4.
  - Notes / special requests folded under Stay (Spec allowed Details vs Stay placement).
- Independent QA: Rekik review path existed before merge (**READY FOR REKIK CHECK** on [#135](https://github.com/NORUDEVGIT/NORU/pull/135) / [#129](https://github.com/NORUDEVGIT/NORU/issues/129)). **No verified Independent QA PASS comment** on the issue or the impl PR. Honesty = **ENGINEERING PASS** (#135 MERGED) + **#129 OPEN** until formal closure. Do **not** invent IQ PASS.
- Browser on #135: **NOT RUN ≠ PASS**.
- Later sections (4–8) now also live on the same page. Section 3 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#129](https://github.com/NORUDEVGIT/NORU/issues/129) remains **OPEN** until Outcome Review / Rekik formal closure YES. This docs recon does **not** close #129.

---

## 3. EXPECTED — Stay (authorized baseline — delivered)

### 3.1 Arrival (required) — **delivered**

- **Arrival date is required** for the create path (`stay-arrival` `required`).
- Default remains **property-today** via `propertyToday(propertyTimezone)` — **property timezone honesty**.
- Plain calendar dates (`YYYY-MM-DD`); reuse existing helpers — no invented timezone engine.

### 3.2 Departure / nights linked — **delivered**

- **Departure** and **nights** are linked:
  - Changing **nights** updates **departure** (`addDays(arrival, nights)`).
  - Changing **departure** updates **nights** (`nightsBetween`).
  - Changing **arrival** keeps **nights** and moves **departure** (`addDays(arrival, nights)`). Invalid prior range → 1 night.
- Block **invalid** ranges: departure less-than-or-equal arrival is blocked in UI (`isStayRangeValid`) and remains blocked server-side via `assertStayDates`. Staff cannot submit an invalid stay.
- Minimum stay remains **at least 1 night**.

### 3.3 Occupancy — **delivered**

- Capture **adults** (required, at least 1) and **children** (at least 0).
- When a **room type is already selected**, occupancy vs `maxOccupancy` shows a **soft-warn** via Section 4 `OccupancySoftWarn`. Hard invent / availability remains Section 4.
- Create is **not** hard-blocked for occupancy. If no room type is selected yet, collect occupancy without pretending capacity was checked.

### 3.4 Special requests / notes — **delivered**

- Free-text **special requests** and **internal notes** remain on the create surface (folded under Stay).
- On create they map to CURRENT payload fields: `specialRequests` to `_special_requests`, `notes` to `_notes`.
- **No** second notes writer or table.

### 3.5 Sticky summary (honest stay) — **delivered**

- Sticky summary shows an **honest stay summary**: arrival, departure, nights, adults, children (when set).
- **No fake totals** — Section 1 / later Section 5 no-fake-total honesty preserved. Rate / tax / package totals are **not** Section 3.
- Do not claim guarantee, room number, or priced total as Stay truth.

### 3.6 Walk-in / status honesty — **delivered**

- Walk-in remains a **mode of the same form + writer**.
- Section 3 **did not invent** a new reservation status model (`pending` \| `confirmed` only). Later Section 7 owns guarantee + confirm chrome.

### 3.7 Writer / route — **delivered**

- Extend `/restaurant/bookings/new` + `createReservation` to `create_hotel_reservation_priced`.
- **No second Stay writer**, no parallel create RPC, no rebuild of walk-in as a second product.

---

## 4. Out of Section 3 (locked — still out)

- **Rate binding** / sticky pricing totals (Section 5)
- **Availability invent** / room-type sellability product (Section 4) — consume + reuse `OccupancySoftWarn` only
- **Room assign** (Section 6)
- **Guarantee** + confirm product (Section 7)
- **Packages** (Section 8; no fake packages)
- **Company / TA** master persistence (Section 2)
- LIVE OTA / rate / commission engines
- Group / block / allotment / rooming / **CR-100**
- Create-time cashiering **deposit**
- Email / SMS send confirmation
- Offline / local-first
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- Inventing a new status model for walk-in

---

## 5. Acceptance criteria (AC-CR3) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR3-1** | Arrival date is **required** on `/restaurant/bookings/new` and defaults / resolves with **property timezone honesty** via `propertyToday` + restaurant timezone | **PASS** (#135) |
| **AC-CR3-2** | Departure and nights are **linked**: changing one updates the other; staff cannot leave an inconsistent pair. Arrival change keeps nights / moves departure | **PASS** (#135) |
| **AC-CR3-3** | **Invalid range** (departure less-than-or-equal arrival) is **blocked** in UI; create cannot submit. Server `assertStayDates` remains | **PASS** (#135) |
| **AC-CR3-4** | Adults and children occupancy are **captured** (adults at least 1; children at least 0) and included on the create payload | **PASS** (#135) |
| **AC-CR3-5** | When a room type is selected, occupancy vs type capacity shows a **soft-warn** (hard invent / availability remains Section 4). Live path = Section 4 `OccupancySoftWarn` | **PASS** (#135) |
| **AC-CR3-6** | Special requests and notes free text **persist on create** via CURRENT `specialRequests` / `notes` to RPC `_special_requests` / `_notes` | **PASS** (#135) |
| **AC-CR3-7** | Sticky summary shows an **honest stay summary** (dates + nights + occupancy) and **no fake totals** | **PASS** (#135) |
| **AC-CR3-8** | **No second Stay writer** — same `createReservation` to `create_hotel_reservation_priced` stack; walk-in remains a mode of the same writer | **PASS** (#135) |
| **AC-CR3-9** | Existing permission gates preserved: `requireRoutePackage("pms")`, `requireReservationManager` / `canManageReservations`. **No** new entitlement / RLS **model**. Flag Abel **NOT** required | **PASS** (#135) |
| **AC-CR3-10** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them | **PASS** (#135) |
| **AC-CR3-11** | Section 3 does **not** claim Phase 1 or full Create Reservation **DONE**. Rate / availability invent / room / guarantee / packages / send confirmation / Company-TA remain other sections | **PASS** (#135) |
| **AC-CR3-12** | Locked non-goals in section 4 are **absent** | **PASS** (#135) |
| **AC-CR3-13** | Migration honesty: Stay fields **already on RPC** — migration **NONE**. Dual-lane APPLY **N/A** | **PASS** (#135) |
| **AC-CR3-14** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product | **PASS** (#135) |
| **AC-CR3-15** | Walk-in / same-form honesty: Section 3 does **not** invent a new status model | **PASS** (#135) |
| **AC-CR3-16** | Reuse existing date helpers (`propertyToday`, `nightsBetween`, `addDays`, `formatStayDate`) — no parallel date library | **PASS** (#135) |

Full AC text remains the #128 baseline; do not reopen Guest GE; do not claim Phase 1 DONE; do not close #129 from this docs recon.

---

## 6. QA / Security / Regression (summary)

- Eng: **PASS** Section 3 only (#135 MERGED 2026-09-15, `562a990`). `tsc` PASS; locks **AC-CR3-1…16 PASS** (+ AC-CR1 / AC-CR2 / AC-CR4 regression PASS on that PR).
- Independent QA: Rekik review path existed before merge (READY FOR REKIK CHECK). **No verified IQ PASS comment** on #135 or #129. Honesty = ENGINEERING PASS + #129 **OPEN** until formal closure. Browser **NOT RUN ≠ PASS**.
- Security: staff-only; tenant-scoped; preserve FO / reservation gates; **no** new SECURITY DEFINER; **no** new RLS policies. Flag Abel **NOT** required.
- Regression: FO walk-in still uses `createReservation`; Section 1 Context+Guest + sticky no-fake-total; Section 4 availability / `OccupancySoftWarn` not re-owned; do not claim Section 5–8 ownership.
- Migration: **NONE**. Dual-lane APPLY **N/A**.
- Issue [#129](https://github.com/NORUDEVGIT/NORU/issues/129) **OPEN** until Outcome Review / Rekik formal closure YES.

---

## 7. Eng confirm items (resolved in #135)

| Item | Resolution |
|---|---|
| Arrival change rule | **Keep nights, move departure** (`CREATE_RESERVATION_ARRIVAL_CHANGE_RULE = keep_nights`). Invalid prior range → 1 night |
| Nights control UX | Dedicated **nights stepper** on `CreateReservationStay` (`stay-nights`) linked to departure |
| Capacity soft-warn source | Reuse Section 4 **`OccupancySoftWarn`** (`maxOccupancy` / FO). Adult / child capacity **display-only**. Warn-only — not a create hard-block |
| Notes placement | **Folded under Stay** (same payload) |
| Status chrome | Section 3 **did not** invent a new status model (`pending` \| `confirmed` only). Later Section 7 owns Confirm / Guarantee chrome |
| Migration | **NONE** confirmed. Dual-lane APPLY **N/A**. Flag Abel **NOT** required |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** pending Outcome Review — ENGINEERING PASS 2026-09-15 |
| Spec baseline #128 | **SUPERSEDED** (OPEN / Eng-ready text STALE — do **not** merge as-is) |
| ENGINEERING | **PASS** (#135 MERGED `562a990`) |
| Implemented / PASS (Section 3) | **Yes** (engineering) |
| Independent QA PASS (verified comment) | **Not verified** on #135 / #129 — do not invent |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Migration | **NONE**. Dual-lane APPLY **N/A**. RLS **UNCHANGED**. Flag Abel **NOT** required |
| Create Reservation DONE | **NO** |
| Guest Waves 1–5 + GE1–GE3 | **OPERATIONALLY ACCEPTED** / closed — not reopened |
| Issue #129 | **OPEN** until Outcome Review / Rekik formal closure YES |
