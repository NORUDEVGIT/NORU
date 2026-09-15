# Create Reservation — Phase 1 Section 1 (Context + Guest)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 1: Context + Guest |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor; D1–D13 locked) |
| **ENGINEERING STATUS** | **IMPLEMENTATION IN PROGRESS** on [#121](https://github.com/NORUDEVGIT/NORU/issues/121) / PR [#122](https://github.com/NORUDEVGIT/NORU/pull/122) — **HOLD merge** until AC-CR1-21 sidebar amend lands on #122 |
| **Issue** | [#121](https://github.com/NORUDEVGIT/NORU/issues/121) OPEN — Relates; do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **Likely NONE** for Section 1 alone (UI / context + reuse guests). Eng confirms if additive columns are needed for booking source / market segment / external reference on the reservation row. Dual-lane APPLY HELD if a column is required. Additive RLS matching reservation tables OK; **flag Abel** if entitlement / RLS **model** must change |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section1-programme.md`](../create-reservation-phase1-section1-programme.md) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Rekik SCOPE AMEND 2026-09-15 (pre-merge #122):** Doc2 UX — auto-collapse app sidebar on Create Reservation. **AC-CR1-21**. No change to commercial fields / DB.
>
> Functional Create Reservation Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts.
>
> Section delivery order: **1 Context + Guest (THIS)** → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog. Later sections own stay / rate / room / guarantee.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in) |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation) |
| UI | Doc2 layout: main column + sticky summary + sticky actions + drawers. Section 1 focuses **Context + Guest** in the main column. Sticky summary / actions content is later sections; Section 1 may add the shell with **honest placeholders**, not fake totals. **Sidebar:** when Create Reservation is active (`/restaurant/bookings/new`), **auto-collapse** the app sidebar to free width; one-click expand still available; restore normal sidebar behavior when leaving Create Reservation. Applies to **all** reservation type modes; not tied to Corporate/TA or guest create. Layout-only — no commercial-field / DB change. |
| Walk-in | Remains a mode of `createReservation` / `create_hotel_reservation_priced`. Section 1 does **not** rebuild walk-in as a second product |
| Guest consume | Create once → use everywhere. Reuse Guest `listGuests` / `createGuest` / `GuestFormDialog` (GE2 Individual, including staged upload / link) |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` |
| RPC | `create_hotel_reservation_priced` |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |
| Guest list / create | `listGuests`, `createGuest`, `findGuestDuplicates` in `guests.functions.ts` |
| Individual create UI | `src/packages/pms/components/guests/guest-form-dialog.tsx` |
| Restriction UI | `GuestRestrictionBadges`, `GuestRestrictionWarn` in `guest-bits.tsx` (GE2 warn-first) |
| Walk-in (same writer) | `src/packages/pms/components/frontoffice/front-office-dialogs.tsx` |
| Setup catalogues | SET6 `pms_source_codes` / `pms_market_segments` (empty = warning, not a go-live block; **no sample seed**) |
| Reservation row (today) | `hotel_reservations`: `guest_id`, `source` (`staff` \| `walk_in` \| `direct_booking` \| `future_online` — **channel origin**, not the commercial booking-source picker), `created_by_staff_membership_id`. Wave 4 `company_master_id` / `travel_agent_master_id` exist; **create RPC does not take them** (AC-W4-5 residual — Section **2**) |

---

## 2. CURRENT (code wins)

- Route `/restaurant/bookings/new` is a vertical stepper: Guest → Stay → Room type → optional Room → Details → Confirm. **Not** Doc2 (no sticky summary / actions / drawers).
- Guest: `listGuests` pick (`status: active`, limit 8). Search is name / email / phone / `phone_normalized`. **No debounce.** `listGuests` does **not** search ID document number.
- Selected-guest card: name, contact, **restriction badges**, **restriction warn**, **Change guest** (clears selection). **No** VIP badge. **No** View guest.
- Create guest = **link out** to `/restaurant/pms/guests` (leaves the reservation draft). **Not** inline `GuestFormDialog`.
- Restricted / blacklisted: **warn-first** (GE2 `GuestRestrictionWarn`); create is **not** hard-blocked.
- No booking source / market segment / external reference / reservation-type UI mode on create today.
- Denied copy on the page says “owners and managers”; the **gate** is `canManageReservations` = owner / manager / **receptionist**. Code wins; Eng may honest-copy without changing the role set.
- Walk-in uses the same `createReservation` writer from Front Office.

---

## 3. EXPECTED — Context

| Field | Rule |
|---|---|
| **Reservation type** (UI mode) | **Individual** \| **Corporate** \| **Travel Agency**. Controls Corporate / TA picker **chrome** (empty states + placeholders). Pickers / master-ID **persistence** are **Section 2**. Section 1 defines the mode switch. |
| **Booking source** | Required for the **Confirm** path when this Spec ships (Confirm itself is Section 7). Prefer active SET6 `pms_source_codes` if any exist; else the documented default list in §3.1. Not LIVE OTA. Distinct from `hotel_reservations.source` channel-origin enum unless Eng explicitly maps them. |
| **Market segment** | Same rule as booking source, using SET6 `pms_market_segments` else §3.1 defaults. |
| **External reference** | Optional text. |
| **Booking agent** | Default **current user**. Editable if listing property staff is low-cost; otherwise display current user. Do **not** invent a second staff master. CURRENT writer already stamps `created_by_staff_membership_id`. |

Changing reservation type must **not** silently discard guest or stay draft data (**warn + preserve**).

Section 1 **renders** these fields on the Doc2 main column. Confirm-time blocking of an incomplete source / segment is Section 7; Section 1 still collects them and marks source / segment as required for that later path.

### 3.1 Documented default lists (catalog empty)

Use only when the matching SET6 catalogue has **no active rows**. Property-authored catalogue rows **win** when present.

**Booking source:** Phone · Walk-in · Email · Direct · Corporate · Travel agency · Other.

**Market segment:** Leisure · Corporate · Government · Complimentary / house · Other.

These are staff labels, **not** a rate engine, LIVE OTA connector, or commission product.

### 3.2 EXPECTED — App sidebar (Doc2 width)

When staff open or enter `/restaurant/bookings/new` (Create Reservation active):

- **Auto-collapse** the app sidebar so Context + Guest + sticky summary have full width
- **One-click expand** remains available while on the page
- **Restore** normal sidebar behavior when leaving Create Reservation (navigate away / unmount)
- Same rule for **all** reservation type modes (Individual / Corporate / Travel Agency)
- **Not** tied to Corporate/TA picker chrome or guest create drawer
- Layout / interaction only — does **not** change functional commercial fields, ACs for Context/Guest data, or database

---

## 4. EXPECTED — Guest

- **Search:** name / phone / email (plus ID **only if** `listGuests` already supports it — **it does not today**; do **not** invent ID search in this section). Debounce. Results from existing `listGuests` (active, tenant-scoped).
- **Select:** required for create. Selected-guest card with VIP + restriction badges, contact, **Clear** / Change (clears selection).
- **Restricted / blacklist:** **warn-first** (GE2). Continue **allowed**. **No hard block** this phase.
- **Create guest:** drawer / modal = **full existing Individual create (GE2)** (`GuestFormDialog`), including staged upload / link behaviour. On success **auto-select** that guest on the reservation. **No parallel guest writer.** **No** navigation-away to `/restaurant/pms/guests` to complete create.
- **View / change:** Change clears selection. View may open a guest drawer / profile **without losing the reservation draft** where feasible (prefer drawer over a full-page navigate that drops draft).
- **Duplicates:** existing Guest duplicate warn on the Individual create path. **No silent merge** during reservation create.

---

## 5. Out of Section 1 (locked)

- Company / TA **master ID persistence** on create (Section 2 — Context mode may show **placeholders / empty states** only)
- Stay, availability / room type, rate + sticky pricing, room assign
- Guarantee + confirm; send confirmation (email / SMS)
- Packages (Section 8, and only if a catalog exists — **no fake packages**)
- Parent **Company Reservation CR-100**; group block / allotment / rooming list
- LIVE OTA; rate engine; commission settlement; create-time cashiering deposit; credit approval engine
- Offline / local-first; hard blacklist **block**; new entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3
- Boiling AC-W4-5 from this section (create RPC still does not take master IDs until Section 2)

---

## 6. Acceptance criteria (AC-CR1)

| ID | Criterion |
|---|---|
| **AC-CR1-1** | Context fields render on `/restaurant/bookings/new`. Reservation-type mode switches Corporate / TA **chrome** (placeholders / empty states) **without losing** the selected guest |
| **AC-CR1-2** | Guest search / select works (name / phone / email; debounce). Selected-guest card can be cleared |
| **AC-CR1-3** | Create guest opens the **full existing Individual** modal (`GuestFormDialog` / GE2, including staged upload / link). Save **auto-selects** that guest on the reservation |
| **AC-CR1-4** | Restricted and/or blacklisted guest shows a **visible warn**; staff **can continue**. No hard block |
| **AC-CR1-5** | Creating a guest does **not** require navigating away from the reservation draft |
| **AC-CR1-6** | **No** second guest table / API. Reuse `listGuests` / `createGuest` / `GuestFormDialog` / `findGuestDuplicates` |
| **AC-CR1-7** | Existing permission gates preserved: `requireRoutePackage("pms")`, `getBookingsAccess` / `requireReservationManager`, guest-manage on guest writes. **No** new entitlement / RLS **model** |
| **AC-CR1-8** | Changing reservation type **warns** and **preserves** guest / stay draft (no silent discard) |
| **AC-CR1-9** | Booking source and market segment are collected; **required for Confirm** when this Spec ships. Active SET6 catalogue rows if present; else §3.1 defaults. Not LIVE OTA |
| **AC-CR1-10** | External reference is optional text. Booking agent defaults to the **current user**; editable only if low-cost |
| **AC-CR1-11** | Duplicate warn on the create-guest path; **no silent merge** during reservation create |
| **AC-CR1-12** | Change guest clears selection. View guest may open drawer / profile **without losing** the reservation draft where feasible |
| **AC-CR1-13** | Selected and result rows show **VIP** and **restriction** badges (reuse Guest bits) |
| **AC-CR1-14** | Company / TA **master persistence** is **not** claimed. Section 1 chrome is empty-state / placeholder only (Section 2) |
| **AC-CR1-15** | Section 1 does **not** claim Phase 1 or full Create Reservation **DONE**. Stay / rate / room / guarantee / packages / send confirmation remain later sections |
| **AC-CR1-16** | Locked non-goals in §5 are **absent** (no LIVE OTA, rate engine, commission settlement, create-time cashiering deposit, email/SMS, offline, group block / allotment / rooming list, CR-100, credit approval, fake packages, hard blacklist block, new entitlement/RLS architecture) |
| **AC-CR1-17** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR1-18** | Migration **likely NONE** for Section 1 alone. Eng **confirms** if additive columns are needed for source / segment / external ref. Dual-lane APPLY HELD if yes. Flag Abel if RLS **model** must change |
| **AC-CR1-19** | Walk-in remains a **mode of the same writer** (`createReservation` → `create_hotel_reservation_priced`). No second reservation product |
| **AC-CR1-20** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product. Doc2 shell may be introduced; sticky summary / actions must not fake later-section totals |
| **AC-CR1-21** | On enter `/restaurant/bookings/new`, app sidebar **auto-collapses**; one-click expand works; sidebar **restores** on leave. Applies to all reservation type modes. Layout-only — no commercial field / DB change |

---

## 7. QA / Security / Regression (summary)

- Section 1 implementation is on [#122](https://github.com/NORUDEVGIT/NORU/pull/122). **HOLD merge** until AC-CR1-21. Re-run Independent QA for AC-CR1-21 after Eng lands sidebar (prior IQ PASS on AC-CR1-1…20 stands until then).
- Developer (when authorised): `tsc` + lock tests for AC-CR1-1…21; browser on `/restaurant/bookings/new`.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped; preserve existing FO / guest gates; no new SECURITY DEFINER unless Abel-approved.
- Regression: GE2 Individual create; restriction warn on this path and walk-in; Guest directory; walk-in still uses `createReservation`; AC-W4-5 residual **untouched**.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **IN PROGRESS** on #121 / #122 — **HOLD merge** until AC-CR1-21 lands |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Migration | Likely **NONE** (Eng confirms columns) |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
