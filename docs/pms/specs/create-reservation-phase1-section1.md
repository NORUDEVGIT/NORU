# Create Reservation — Phase 1 Section 1 (Context + Guest)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 1: Context + Guest |
| **STATUS** | **OPERATIONALLY ACCEPTED** (pending Outcome Review / Rekik formal closure YES) — DER PASS 2026-09-15 |
| **ENGINEERING STATUS** | **PASS** for Section 1 — delivery [#122](https://github.com/NORUDEVGIT/NORU/pull/122) + [#123](https://github.com/NORUDEVGIT/NORU/pull/123) + polish [#124](https://github.com/NORUDEVGIT/NORU/pull/124) MERGED |
| **Issue** | [#121](https://github.com/NORUDEVGIT/NORU/issues/121) **OPEN** until Outcome Review / formal closure — do **not** claim LIVE / COMPLETE |
| **Migration** | **NONE** (DER). Source / segment / external ref remain **UI draft only** in Section 1 (no create-RPC persistence). Dual-lane N/A |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 1 only; Company/TA persistence = Section 2+; stay/rate/room/guarantee later sections own DONE claims |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section1-programme.md`](../create-reservation-phase1-section1-programme.md) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Rekik SCOPE AMEND 2026-09-15:** Doc2 UX — auto-collapse app sidebar on Create Reservation. **AC-CR1-21** (delivered on #123).
>
> **Docs CURRENT recon 2026-09-15** after Eng DER PASS (#122+#123+#124). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: **1 Context + Guest (THIS — OPERATIONALLY ACCEPTED pending Outcome Review)** → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in) |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation) |
| UI | Doc2-style main column + sticky summary + sticky actions. Section 1 owns Context + Guest. Sticky summary shows type / guest / stay dates with honest **no fake totals** copy (`CREATE_RESERVATION_SUMMARY_NO_TOTAL`). **Sidebar:** auto-collapse on this route; one-click expand; restore on leave (AC-CR1-21) |
| Walk-in | Remains a mode of `createReservation` / `create_hotel_reservation_priced` |
| Guest consume | Reuse Guest `listGuests` / `createGuest` / `GuestFormDialog` (GE2 Individual, including staged upload / link) |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` |
| Context UI | `src/packages/pms/components/bookings/create-reservation-context.tsx` |
| Guest UI | `src/packages/pms/components/bookings/create-reservation-guest.tsx` |
| Locks / constants | `src/packages/pms/lib/create-reservation-phase1.ts` + `create-reservation-phase1.test.ts` (AC-CR1-1…21 — **22/22 PASS**) |
| Shell sidebar | `src/core/components/restaurant-shell.tsx` (`sidebarDefaultCollapsed`) |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` |
| RPC | `create_hotel_reservation_priced` |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |
| Guest list / create | `listGuests`, `createGuest`, `findGuestDuplicates` in `guests.functions.ts` |
| Individual create UI | `src/packages/pms/components/guests/guest-form-dialog.tsx` |
| Restriction UI | `GuestRestrictionBadges`, `GuestRestrictionWarn` in `guest-bits.tsx` (GE2 warn-first) |
| Setup catalogues | SET6 `pms_source_codes` / `pms_market_segments` via `getPmsSet6Snapshot` |
| Reservation row | `hotel_reservations`: `guest_id`, channel-origin `source`, `created_by_staff_membership_id`. Wave 4 `company_master_id` / `travel_agent_master_id` exist; **create RPC still does not take them** (AC-W4-5 → **Section 2**) |

---

## 2. CURRENT (code wins — post #122+#123+#124)

- `/restaurant/bookings/new` is Doc2-style: Context + Guest + (pre-existing) Stay / Room type / Rate / Room / Details in the main column, plus sticky summary / actions. Section 1 **owns** Context + Guest + sidebar collapse; later sections own DONE claims for stay/rate/room/guarantee.
- **Context:** reservation-type mode Individual | Corporate | Travel Agency with warn-first type switch (`CREATE_RESERVATION_TYPE_CHANGE_WARN`). Booking source, market segment, external reference, booking agent (current user display). Source/segment options from SET6 when present else Spec defaults. **#124:** under-field helper text under source / segment / agent **removed** (labels/controls only; no AC change).
- **Honesty:** `bookingSource` / `marketSegment` / `externalReference` are **draft UI state only** — `createReservation` submit payload does **not** yet persist them (Confirm / commercial persistence = later Spec if required).
- **Company/TA:** type mode shows Corporate/TA **chrome / placeholders only** — **no** master ID persistence on create (Section 2).
- **Guest:** search/select with debounce; VIP + restriction badges; GE2 warn-first (continue allowed); inline `GuestFormDialog` create with auto-select; change clears selection. No second guest writer.
- **Sidebar (AC-CR1-21):** `RestaurantShell` `sidebarDefaultCollapsed` on this route; expand control; leave remounts expanded. Not tied to type mode or guest create.
- **Sticky summary:** type, guest, stay dates; `CREATE_RESERVATION_SUMMARY_NO_TOTAL` — does **not** fake later-section totals.
- **Gates:** `requireRoutePackage("pms")` + reservation manager roles (owner / manager / receptionist); denied copy includes receptionists.
- **Walk-in:** still uses the same `createReservation` writer from Front Office.
- **DATABASE IMPACT:** **NONE** for Section 1.

### DOCUMENTATION / IMPLEMENTATION notes

- Pre-existing Stay / availability / rate / room / details UI on the same page **remains** on main. Section 1 Spec does **not** claim those sections DONE; later section Specs own their ACs. No silent claim of Phase 1 COMPLETE.
- Spec #120 EXPECTED AC-CR1-1…21 remain the acceptance baseline; delivery matched locks **22/22**.

---

## 3. EXPECTED — Context (authorized baseline — delivered)

| Field | Rule |
|---|---|
| **Reservation type** (UI mode) | **Individual** | **Corporate** | **Travel Agency**. Controls Corporate / TA picker **chrome**. Pickers / master-ID **persistence** are **Section 2**. |
| **Booking source** | Collected for Confirm path when Spec requires; SET6 else defaults. Not LIVE OTA. Distinct from channel-origin `hotel_reservations.source` unless Eng maps them. **Section 1 delivery:** UI draft only (not yet on create RPC). |
| **Market segment** | Same pattern as booking source. |
| **External reference** | Optional text (UI draft in Section 1). |
| **Booking agent** | Display **current user** (Section 1). |

Changing reservation type **warns** and **preserves** guest / stay draft.

### 3.1 Documented default lists (catalog empty)

**Booking source:** Phone · Walk-in · Email · Direct · Corporate · Travel agency · Other.

**Market segment:** Leisure · Corporate · Government · Complimentary / house · Other.

### 3.2 EXPECTED — App sidebar (Doc2 width) — **delivered AC-CR1-21**

- Auto-collapse on `/restaurant/bookings/new`
- One-click expand available
- Restore on leave
- All reservation type modes; layout-only

---

## 4. EXPECTED — Guest (authorized baseline — delivered)

- Search name / phone / email; debounce; `listGuests` (active, tenant-scoped). No invented ID search.
- Select required for create; VIP + restriction badges; Clear / Change.
- Restricted / blacklist: **warn-first**; continue allowed; **no hard block**.
- Create guest: full GE2 `GuestFormDialog` inline; auto-select; **no** parallel writer; **no** navigate-away to directory to complete create.
- Duplicates: existing Guest duplicate warn; **no silent merge**.

---

## 5. Out of Section 1 (locked — still out)

- Company / TA **master ID persistence** on create (**Section 2**)
- Section DONE claims for Stay, availability / room type, rate + sticky pricing, room assign, guarantee + confirm, packages
- Parent **Company Reservation CR-100**; group block / allotment / rooming list
- LIVE OTA; rate engine; commission settlement; create-time cashiering deposit; credit approval engine
- Offline / local-first; hard blacklist **block**; new entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3
- Persisting booking source / market segment / external ref on the reservation row (not delivered in Section 1; Spec if needed later)

---

## 6. Acceptance criteria (AC-CR1) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR1-1…20** | As authorized in Spec #120 | **PASS** (#122) |
| **AC-CR1-21** | Sidebar auto-collapse / expand / restore on leave | **PASS** (#123) |
| *(polish)* | Remove under-field helper text under source / segment / agent | **#124** (no AC change) |

Full AC text remains the #120 baseline; do not reopen Guest GE; do not claim Phase 1 DONE.

---

## 7. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 1 only. Independent QA PASS on #122 and #123. `tsc` PASS; locks **22/22**. Browser agent VM NOT RUN on #123 ≠ fail (Rekik IQ PASS stands).
- Security: staff-only; tenant-scoped; existing FO / guest gates preserved; no new SECURITY DEFINER.
- Regression: GE2 Individual create; restriction warn; walk-in same writer; AC-W4-5 residual **untouched** until Section 2.
- **#121** stays OPEN until Outcome Review / Rekik formal closure YES.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** (pending Outcome Review) |
| ENGINEERING | **PASS** (#122+#123+#124) |
| Implemented / PASS (Section 1) | **Yes** (DER) |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Migration | **NONE** |
| Create Reservation DONE | **NO** |
| Issue #121 | **OPEN** until Outcome Review |
