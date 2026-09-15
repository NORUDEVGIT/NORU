# Create Reservation — Phase 1 Section 3 (Stay)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 3: Stay |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **Likely NONE** for Stay fields already on the create path (`arrival` / `departure` / `adults` / `children` / `special_requests` / `notes`). Eng confirms. Dual-lane APPLY **HELD** only if a column or SECURITY DEFINER RPC replace is required (not expected for this section). Additive RLS matching reservation tables OK; **flag Abel** if entitlement / RLS **model** must change |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section3-programme.md`](../create-reservation-phase1-section3-programme.md) |
| **Prior sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest); [`create-reservation-phase1-section2.md`](./create-reservation-phase1-section2.md) (Company/TA — PR #126; do **not** wait on merge) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Upgrade **Stay UX** per Doc2 on the existing route/writer. **Do not** rebuild `createReservation` / `create_hotel_reservation_priced`.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → **3 Stay (THIS)** → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog. Later sections own availability invent, rate binding, room assign, guarantee.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Sections 1–2) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in) — **upgrade Stay UX; do not rebuild writer** |
| Phase 1 | Individual Create Reservation workspace (corporate / TA-linked individual stays remain Section 2) |
| UI | Doc2 Stay block in the main column: arrival / departure / nights linked; adults / children; special requests / notes. Sticky summary shows **honest stay** (dates + nights + occupancy) — **no fake totals** |
| Date helpers | Reuse `propertyToday`, `nightsBetween`, `addDays`, `formatStayDate` (`@/shared/lib/property-dates` via `reservation-bits` / `reservation-dates`) |
| Walk-in | Same form / same writer. Room-required / often-unpriced honesty stays with later **D5/D7** — Section 3 **must not invent** a new status model |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Stay section + sticky summary |
| Date helpers (shared) | `src/shared/lib/property-dates.ts` — `propertyToday`, `nightsBetween`, `addDays`, `formatStayDate` |
| Date re-exports | `src/packages/pms/lib/reservation-dates.ts`; `src/packages/pms/components/bookings/reservation-bits.tsx` |
| Timezone | `useRestaurantTimezone()` → `propertyToday(timezone)` |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` / `stayInputSchema` |
| Server date gate | `assertStayDates` in `reservations.server` (via `createReservation`) |
| RPC (priced) | `create_hotel_reservation_priced` — already takes `_arrival`, `_departure`, `_adults`, `_children`, `_special_requests`, `_notes` |
| Capacity signals (later Section 4) | `getRoomTypeAvailability` returns `maxOccupancy`, `adultCapacity`, `childCapacity` — room-type cards already show Sleeps maxOccupancy |
| Section 1 helpers | `src/packages/pms/lib/create-reservation-phase1.ts` — `CREATE_RESERVATION_SUMMARY_NO_TOTAL` |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |
| Walk-in (same writer) | `src/packages/pms/components/frontoffice/front-office-dialogs.tsx` |

---

## 2. CURRENT (code wins)

- Stay block on `/restaurant/bookings/new` already collects **arrival**, **departure**, **adults**, **children** in a card. Special requests + internal notes live in a separate **Details** card; both flow into `createReservation`.
- **Arrival** defaults to `propertyToday(timezone)` via `useRestaurantTimezone()`. **Departure** defaults to `addDays(today, 1)`.
- Arrival and departure are **independent** date inputs. Changing one does **not** auto-adjust the other. There is **no** editable nights control that drives departure (or vice versa).
- UI validity: `datesValid = departure > arrival`. Invalid range shows Departure must be after arrival and disables availability / submit (`canSubmit` requires `datesValid`). Server also runs `assertStayDates` before RPC.
- Nights are **display-only** under the Stay card when valid (`nightsBetween(arrival, departure)`). Sticky summary shows arrival to departure dates only — **not** nights count or occupancy.
- Sticky summary already carries **no-fake-total** honesty (`CREATE_RESERVATION_SUMMARY_NO_TOTAL`). Rate-plan nightly table elsewhere on the page is **Section 5 territory** — Section 3 must not treat browser rate totals as Stay truth.
- Occupancy: adults min 1 / max 20; children min 0 / max 20. **No** soft-warn against selected room-type `maxOccupancy` / `adultCapacity` / `childCapacity` in the Stay block today (capacity is shown on room-type cards for Section 4).
- `createReservation` Zod (`stayInputSchema`) already accepts `arrival`, `departure`, `adults`, `children`, `specialRequests`, `notes` and passes them to `create_hotel_reservation_priced`. **No** new stay columns needed for CURRENT fields.
- Details card also has **Create as** pending or confirmed. Walk-in / room-required / often-unpriced honesty is **later D5/D7**. Section 3 does **not** own or invent a new status model.
- Guest GE1–GE3 and Section 1 Context/Guest chrome are LIVE / closed as prior work; Section 2 Company/TA Spec is on PR #126 (docs). This section does **not** wait on Section 2 merge and does **not** reopen Guest GE.

---

## 3. EXPECTED — Stay

### 3.1 Arrival (required)

- **Arrival date is required** for the create path.
- Default remains **property-today** via `propertyToday(propertyTimezone)` — **property timezone honesty** (not browser-local today as truth).
- Plain calendar dates (`YYYY-MM-DD`); reuse existing helpers — no invented timezone engine.

### 3.2 Departure / nights linked

- **Departure** and **nights** are linked:
  - Changing **nights** updates **departure** (`addDays(arrival, nights)`).
  - Changing **departure** updates **nights** (`nightsBetween`).
  - Changing **arrival** keeps nights (preferred) **or** keeps departure — Eng picks one honest rule and documents it; do **not** leave both fields silently inconsistent.
- Block **invalid** ranges: departure less-than-or-equal arrival must be blocked in UI (and remains blocked server-side via `assertStayDates`). Staff must not be able to submit an invalid stay.
- Minimum stay for a normal create remains **at least 1 night** (same as CURRENT `departure > arrival`).

### 3.3 Occupancy

- Capture **adults** (required, at least 1) and **children** (at least 0).
- When a **room type is already selected**, validate occupancy against that type capacity signals (`maxOccupancy` and/or `adultCapacity` / `childCapacity` from CURRENT availability payload).
- **Soft-warn is OK** until Section 4 owns hard capacity / availability invent. Do **not** invent a second availability product in Section 3.
- If no room type is selected yet, collect occupancy without pretending capacity was checked.

### 3.4 Special requests / notes

- Free-text **special requests** and **internal notes** remain on the create surface.
- On create they map to CURRENT payload fields: `specialRequests` to `_special_requests`, `notes` to `_notes` (already on `create_hotel_reservation_priced`).
- Layout may consolidate into the Stay / Doc2 main column; **do not** invent a second notes writer or table.

### 3.5 Sticky summary (honest stay)

- Sticky summary must show an **honest stay summary**: arrival, departure, nights, adults, children (when set).
- **No fake totals** — keep / extend Section 1 no-fake-total honesty. Rate / tax / package totals are **not** Section 3.
- Do not claim guarantee, room number, or priced total in the Stay summary.

### 3.6 Walk-in / status honesty

- Walk-in remains a **mode of the same form + writer** when applicable.
- Room-required / often-unpriced honesty stays with later **D5/D7**.
- Section 3 **must not invent** a new reservation status model (pending / confirmed chrome may remain as CURRENT Details behaviour; Section 7 owns guarantee + confirm product).

### 3.7 Writer / route

- Extend `/restaurant/bookings/new` + `createReservation` to `create_hotel_reservation_priced`.
- **No second Stay writer**, no parallel create RPC, no rebuild of walk-in as a second product.

---

## 4. Out of Section 3 (locked)

- **Rate binding** / sticky pricing totals (Section 5)
- **Availability invent** / room-type sellability product (Section 4)
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

## 5. Acceptance criteria (AC-CR3)

| ID | Criterion |
|---|---|
| **AC-CR3-1** | Arrival date is **required** on `/restaurant/bookings/new` and defaults / resolves with **property timezone honesty** via `propertyToday` + restaurant timezone |
| **AC-CR3-2** | Departure and nights are **linked**: changing one updates the other; staff cannot leave an inconsistent pair |
| **AC-CR3-3** | **Invalid range** (departure less-than-or-equal arrival) is **blocked** in UI; create cannot submit. Server `assertStayDates` remains |
| **AC-CR3-4** | Adults and children occupancy are **captured** (adults at least 1; children at least 0) and included on the create payload |
| **AC-CR3-5** | When a room type is selected, occupancy vs type capacity shows a **soft-warn** (hard invent / availability remains Section 4) |
| **AC-CR3-6** | Special requests and notes free text **persist on create** via CURRENT `specialRequests` / `notes` to RPC `_special_requests` / `_notes` |
| **AC-CR3-7** | Sticky summary shows an **honest stay summary** (dates + nights + occupancy) and **no fake totals** |
| **AC-CR3-8** | **No second Stay writer** — same `createReservation` to `create_hotel_reservation_priced` stack; walk-in remains a mode of the same writer |
| **AC-CR3-9** | Existing permission gates preserved: `requireRoutePackage("pms")`, `requireReservationManager` / `canManageReservations`. **No** new entitlement / RLS **model**. Flag Abel if model must change |
| **AC-CR3-10** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR3-11** | Section 3 does **not** claim Phase 1 or full Create Reservation **DONE**. Rate / availability invent / room / guarantee / packages / send confirmation / Company-TA remain other sections |
| **AC-CR3-12** | Locked non-goals in section 4 are **absent** |
| **AC-CR3-13** | Migration honesty: Stay fields **already on RPC** — migration **likely NONE**. Eng confirms. Dual-lane APPLY HELD only if a column / SECURITY DEFINER replace is required |
| **AC-CR3-14** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product |
| **AC-CR3-15** | Walk-in / same-form honesty: Section 3 does **not** invent a new status model; room-required / often-unpriced remains later D5/D7 |
| **AC-CR3-16** | Reuse existing date helpers (`propertyToday`, `nightsBetween`, `addDays`, `formatStayDate`) — no parallel date library |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR3-1 through 16; browser Stay on `/restaurant/bookings/new`; verify create payload dates / occupancy / notes; regression Section 1 Context+Guest + sticky no-fake-total; do not regress walk-in writer.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped; preserve FO / reservation gates; no new SECURITY DEFINER unless Abel-approved (not expected for Stay UX).
- Regression: FO walk-in still uses `createReservation`; Section 1 ACs not regressed; room-type availability / rate quote paths remain for later sections (do not claim Section 3 owns them).

---

## 7. Open Eng confirm items

1. **Arrival change rule:** keep **nights** (adjust departure) vs keep **departure** (adjust nights) when arrival moves — pick one honest default.
2. **Nights control UX:** dedicated nights stepper vs derived-only display that becomes editable — Doc2 preference; functional link rule in 3.2 wins.
3. **Capacity soft-warn source:** use `maxOccupancy` alone vs also `adultCapacity` / `childCapacity` when room type selected (payload already exposes all three).
4. **Notes placement:** keep Details card vs fold special requests / notes under Stay in Doc2 main column — same payload either way.
5. **Status chrome:** leave CURRENT pending/confirmed Select in Details until Section 7, or hide/relabel without inventing a new status model — confirm with Rekik if UX moves it.
6. **Migration:** confirm **NONE** (expected). Flag only if Eng discovers a real column gap (unlikely for listed Stay fields).

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan approval |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Migration | **Likely NONE** (Stay fields already on create RPC). Eng confirms |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
