# Create Reservation — Phase 1 Section 7 (Guarantee + review/confirm + on-screen confirmation)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 7: Guarantee + review/confirm + on-screen confirmation |
| **STATUS** | **IMPLEMENTATION PASS** (Section 7 only) — Eng DER PASS 2026-09-15. Awaiting Outcome Review / Rekik formal closure. Do **not** claim OPERATIONALLY ACCEPTED / CLOSED |
| **ENGINEERING STATUS** | **PASS** for Section 7 — delivery [#155](https://github.com/NORUDEVGIT/NORU/pull/155) MERGED (`b3994fd98df89077c3c34f31b563f43e4603640b` by AK21ER @ 2026-09-15T18:29:07Z) |
| **Issue** | [#153](https://github.com/NORUDEVGIT/NORU/issues/153) **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED / LIVE / Phase 1 COMPLETE |
| **Migration** | **0061** `pms_create_reservation_guarantee_confirm` dual-lane (supabase + drizzle). Additive columns `commercial_booking_source`, `market_segment`, `external_reference`, `guarantee_method` + optional RPC params DEFAULT NULL. Do **not** overload channel-origin `hotel_reservations.source`. **Non-prod APPLY PASS** on `qcwptraosaudcbjasmul` version `20260915144627` (columns verified). **Prod 0061 / 0059 / 0060 Abel-gated** — do **not** apply. Writer constant `CREATE_RESERVATION_SECTION7_APPLY` is still **HELD** → Confirm that would claim persist **fail-closes** until the flag is flipped (schema apply ≠ flip). RLS **UNCHANGED**. Additive policies: NONE. Flag Abel **NOT** required. No payment-gateway table. No create-time folio / deposit RPC |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 7 only. Packages (Section 8 GATE) remain. This section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section7-programme.md`](../create-reservation-phase1-section7-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). [`create-reservation-phase1-section5.md`](./create-reservation-phase1-section5.md) owns Rate + sticky **room** pricing. [`create-reservation-phase1-section6.md`](./create-reservation-phase1-section6.md) owns Room assign. Individual Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139) shipped. Section 8 Packages GATE is a sibling on the same page. This section **owns** guarantee, Confirm/Guarantee vs Pending, persist of source/segment/ref, and on-screen/print confirmation |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER **PASS** (#155 MERGED) and Rekik Independent QA **PASS**. Spec docs baseline [#150](https://github.com/NORUDEVGIT/NORU/pull/150) (may still be open/draft). **#153 remains OPEN** until Outcome Review / formal closure. Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → **7 Guarantee + confirm (THIS — IMPLEMENTATION PASS / #153 OPEN)** → 8 Packages GATE.
>
> **Programme rule (LOCKED):** Reference Individual create **guarantee / confirm** function with **modern NORU UI** (own box, sticky summary, sticky actions). **Do not** clone legacy chrome.
>
> **Server / RPC remains source of truth.** Sticky stay total = Section 5 **server** `quoteStay` / `price_hotel_stay`. Browser math is **ignored**. Deposit posting stays **FO check-in**. Do **not** invent a payment gateway, credit-approval engine, or email/SMS send.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Sections 1–6 / 8) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). `_status` `pending` \| `confirmed`. Optional `_commercial_booking_source` / `_market_segment` / `_external_reference` / `_guarantee_method` sent **only** when `section7PersistApplied()` |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Own **Guarantee** box (`CreateReservationGuarantee`) after Room + Packages GATE. Sticky review + **Save as Pending** vs **Confirm / Guarantee**. Success = **in-place** confirmation + print. Modern NORU boxes (not legacy clone). Doc2 shell / sidebar collapse from Section 1 unchanged |
| Product locks | Guarantee method + payment-terms **ref** (from Company/TA when linked) + **server total** on create. Deposit posting = **FO check-in**. Rate required to Confirm/Guarantee; unpriced Pending **only with permission** (Section 5 — **reuse**). Statuses **pending** \| **confirmed** only. On-screen/print confirmation only — **no email/SMS** |
| Walk-in honesty | FO `WalkInDialog` **requires** room + quoted rate for `confirmed`, **without** guarantee (TIP option 1). `/restaurant/bookings/new` **allows** Unassigned. Commercial booking source Walk-in **≠** FO walk-in mode |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — mounts `CreateReservationGuarantee` after Packages GATE; `useQuery` `getPmsPolish1Snapshot`; `guaranteeMethod` state; actions **Save as Pending** / **Confirm / Guarantee** (Details Create-as select **removed**); success `setCreatedView` → `CreateReservationConfirmation` (no toast+navigate). Sticky `summary-source` / `summary-segment` / `summary-external-ref` / `summary-guarantee` / `summary-payment-terms` after stay total. `bookingSource` / `marketSegment` / `externalReference` / `guaranteeMethod` in the `createReservation` payload |
| Guarantee UI | `src/packages/pms/components/bookings/create-reservation-guarantee.tsx` — `CreateReservationGuarantee` (`data-testid="create-reservation-guarantee"`); method select; Setup-empty warning; persist-held copy; read-only payment terms |
| Confirmation UI | `src/packages/pms/components/bookings/create-reservation-confirmation.tsx` — in-place panel + `window.print`; Open reservation → `/restaurant/pms/reservations/$reservationId`. Copy: email and SMS are **not** sent |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1-section7.ts` + `create-reservation-phase1-section7.test.ts` (**AC-CR7-1…24 PASS**) |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation`. Zod `status: z.enum(["pending", "confirmed"])`; optional commercial / segment / ref / guarantee fields; `assertCreateReservationPricing` then `assertCreateReservationSection7`; new RPC params **only** when `section7PersistApplied()` |
| RPC (priced) | `create_hotel_reservation_priced` → `create_hotel_reservation` (`0061_pms_create_reservation_guarantee_confirm.sql`). `_status NOT IN ('pending','confirmed')` → `INVALID_STATUS`. INSERT hardcodes **`source = 'staff'`**. Optional `_commercial_booking_source` / `_market_segment` / `_external_reference` / `_guarantee_method` DEFAULT NULL |
| Reservation row | `hotel_reservations` — new nullable text columns from 0061 (non-prod applied). **`source`** remains channel origin (`staff` \| `walk_in` \| `direct_booking` \| `future_online`) |
| Guarantee values | Prefer active `pms_payment_methods` via `getPmsPolish1Snapshot`; else cashier `PAYMENT_METHODS` (`cash` \| `card` \| `bank_transfer` \| `mobile_money` \| `other`) via `FALLBACK_CASHIERING_TENDERS`. Labels only |
| Payment terms | `guest_account_masters.payment_terms` → read-only on Guarantee box + sticky. **Not** written to the reservation row |
| Rate / unpriced | `assertCreateReservationPricing` unchanged (Section 5). Confirm still requires a quoted plan. Unpriced Pending = `owner` \| `manager` |
| Persist gate | `CREATE_RESERVATION_SECTION7_APPLY = "HELD"` → `section7PersistApplied() === false`. Confirm **fail-closes** (`CREATE_RESERVATION_PERSIST_HELD_COPY`). Pending + FO walk-in omit new RPC params |
| Walk-in (same writer) | `WalkInDialog`: `status: "confirmed"`, room + rate required, **no** `requireGuarantee: true`. Then `startWalkInCheckIn` |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |
| Phase 1 lock | `CREATE_RESERVATION_PHASE1_COMPLETE` / `CREATE_RESERVATION_MODULE_DONE` remain **false** |

---

## 2. CURRENT (code wins — post #155)

Inspected on `origin/main` at `e9e8439` / merge SHA `b3994fd98df89077c3c34f31b563f43e4603640b` (after Section 8 Packages GATE [#154](https://github.com/NORUDEVGIT/NORU/pull/154) composed on the same page).

### 2.1 Review / sticky

- Sticky (`create-reservation-summary`) shows Type, Guest, Associations / Company / TA, Stay dates, Nights, Occupancy, Room type, Availability, **Room** (`Room {number}` · Floor or honest **Unassigned**), and when priced: Rate code/name, Rate & Total, **server** stay total (Section 5 `quoteStay.subtotal`). Unpriced: badge + honest no-total copy (not `0.00`).
- Confirm-path fields on the same sticky: booking source, market segment, external ref (if entered), guarantee, payment terms when a master is linked.
- Sibling Section 8 GATE honesty line (`summary-packages`) sits **after** the sticky `<dl>` (after occupancy warn / unpriced copy) — **not** a second calculator. Section 5 rate/total and Section 6 Room line are **unchanged**.
- Actions: **Save as Pending** + **Confirm / Guarantee** (+ Cancel). Details **Create as** select is **gone**.

### 2.2 Guarantee method

- Own **Guarantee** box on `/restaurant/bookings/new` after Room assignment and Packages GATE.
- Values: active `pms_payment_methods` from `getPmsPolish1Snapshot` (code + name). Empty / unavailable catalogue → cashier `PAYMENT_METHODS` labels + honest warning (`CREATE_RESERVATION_EMPTY_PAYMENT_METHODS_WARN`). **No** fake seed. **No** gateway / folio post.
- **Confirm / Guarantee:** guarantee **required** (`canSubmitConfirmReservation` + `assertCreateReservationSection7`).
- **Pending:** guarantee **optional**.
- Recorded tender class only (`CREATE_RESERVATION_GUARANTEE_LABELS_ONLY`).

### 2.3 Payment terms

- When a Company or TA master is selected, Guarantee box + sticky show **read-only** `paymentTerms` (or “No payment terms on this master”).
- Terms are **not** snapshotted onto `hotel_reservations`. Credit limit / city-ledger / approval engine: **absent**.

### 2.4 Status model

| Product word | CURRENT DB / writer |
|---|---|
| Pending | `status = 'pending'` via **Save as Pending** |
| Draft | **Not a DB status.** Incomplete draft is client state until submit |
| Confirmed | `status = 'confirmed'` via **Confirm / Guarantee** |
| Guaranteed | **Not a DB status.** Confirmed **plus** stored guarantee method (after persist flag flip) |
| Cancelled / No-show | Exist on the table / FO / detail. Create RPC **rejects** any status other than pending \| confirmed (`INVALID_STATUS`). Create UI does **not** offer them |

Unpriced **confirmed** is **blocked** (`assertCreateReservationPricing` unchanged). Unpriced **pending** is owner/manager only.

### 2.5 Booking source / segment / external ref

- Section 1 still **collects** them on the Context card (SET6 catalogues else Spec §3.1 defaults).
- Confirm requires source + segment. External ref optional.
- Distinct from channel-origin `hotel_reservations.source`. Create RPC still hardcodes **`source = 'staff'`** (including FO walk-in) — residual documented (`CREATE_RESERVATION_CHANNEL_ORIGIN_RESIDUAL`).
- Persist of commercial source / segment / ref / guarantee: **0061 columns + optional RPC params**. Writer sends those params **only** when `section7PersistApplied()`.
- **CURRENT writer flag is still HELD.** Confirm that would claim persist **fail-closes** with honest copy. Pending + FO walk-in without those fields omit the new params and keep working against the live signature.

### 2.6 Confirmation UI

- Success = **in-place** `CreateReservationConfirmation` on the same route (replaces the form). Includes confirmation number, guest, stay, occupancy, room type, room/Unassigned, rate + server total (or honest unpriced), status, guarantee when set, payment terms when linked, source / segment / ref when set.
- **Print** via `window.print` (print CSS hides actions).
- Secondary **Open reservation** → reservation detail. **No** toast+navigate. **Not** public `/stay/$propertySlug/confirmation`. **No** email/SMS / Send confirmation.

### 2.7 Walk-in

| Surface | Room | Rate | Guarantee | Unassigned |
|---|---|---|---|---|
| `/restaurant/bookings/new` | Optional | Required for **confirmed**; unpriced **pending** + permission | **Required** on Confirm | Allowed |
| FO `WalkInDialog` | **Required** | **Required** (confirmed + §5 writer gate) | **Not** required (TIP option 1) | **Not** offered |
| FO check-in complete | Required (`ROOM_REQUIRED`) | n/a | Deposit at check-in | n/a |

Commercial booking source `walk_in` on the Context card is **not** FO walk-in mode and does **not** require a room.

### 2.8 DATABASE IMPACT (honesty)

| Field | Persist today? | Section 7 impact |
|---|---|---|
| `status` pending \| confirmed | **Yes** (`_status`) | Reuse. Guaranteed = confirmed **plus** guarantee method |
| Rate / server total | **Yes** when `_rate_plan_id` set | Reuse Section 5. No second total |
| Company/TA payment terms | Master only (read-only UI) | **No** new column |
| Commercial booking source / market segment / external ref / guarantee method | **0061 columns exist** (non-prod applied). Writer **does not send** until `CREATE_RESERVATION_SECTION7_APPLY` is flipped off **HELD** | Dual-lane 0061. Confirm fail-closes while HELD |
| Channel `source` | Hardcoded `staff` | Do **not** map commercial source into this enum |
| Deposit / folio | FO check-in | **None** on create |

**Non-prod 0061 APPLY PASS** (`qcwptraosaudcbjasmul` / `20260915144627`). **Prod 0061 / 0059 / 0060 remain Abel-gated.**

---

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#150](https://github.com/NORUDEVGIT/NORU/pull/150) EXPECTED AC-CR7-1…24 remain the acceptance baseline; delivery [#155](https://github.com/NORUDEVGIT/NORU/pull/155) matched locks **24/24** (+ Section 1–6 / Associations / Section 8 GATE locks still PASS on regression). Independent QA **PASS** (Rekik, pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered).
- **No DOCUMENTATION / IMPLEMENTATION DISCREPANCY:** Spec ACs that shipped are present in code. Honest notes (not discrepancies):
  - Writer persist flag is still **HELD** after non-prod 0061 APPLY — Confirm fail-closes until `CREATE_RESERVATION_SECTION7_APPLY` is flipped (schema apply ≠ flag flip).
  - Details Create-as select was **removed** (two sticky actions instead).
  - Success **replaces** the form in-place (no remaining toast+navigate).
  - Sticky Packages GATE line sits after the sticky `<dl>`; source / segment / guarantee sit **inside** the `<dl>` after Stay total.
  - Pending confirmation may show a selected guarantee label when one was picked (optional on Pending); Confirm still **requires** it.
  - Payment terms remain display-only (not a reservation column).
- Pre-existing Stay / Rate / Room / Packages GATE / Details UI on the same page **remain**. Section 7 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#153](https://github.com/NORUDEVGIT/NORU/issues/153) remains **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED.

---

## 3. EXPECTED — Guarantee + review + confirm (authorized baseline — delivered)

### 3.1 Review summary (honest fields) — **delivered**

Sticky / review shows, when known: Guest; Associations (or honest None); Stay (dates + nights + occupancy); Room type; Room number or Unassigned; Rate (code + name when priced); sticky **server** total from the same Section 5 quote object (unpriced = no fake `0.00`); booking source; market segment; external ref if entered; guarantee method; payment terms when a master is linked.

### 3.2 Guarantee method (required for Confirm / Guarantee) — **delivered**

- One guarantee method on a modern NORU box before Confirm / Guarantee.
- Prefer active `pms_payment_methods`; else cashier `PAYMENT_METHODS`. Empty Setup is a warning, not a fake seed.
- Recorded guarantee / tender class only — **no** deposit post, gateway, or card capture.
- Pending: optional. Confirm: required.

### 3.3 Payment terms (read-only) — **delivered**

- Master `paymentTerms` read-only on the Guarantee / review box. Missing terms: honest copy. **No** credit-approval engine.

### 3.4 Confirm / Guarantee vs Pending (status map) — **delivered**

| Staff action | Writes | Requires rate (D5) | Requires guarantee | Source / segment |
|---|---|---|---|---|
| **Save as Pending** | `status = pending` | No, if unpriced **permission** (Section 5) | No | Collected; persist after flag flip |
| **Confirm / Guarantee** | `status = confirmed` **and** guarantee method (after persist) | **Yes** | **Yes** | **Required**. Persist after flag flip; **fail-closes** while HELD |

- Draft / Guaranteed are **not** new DB statuses.
- Create UI does **not** offer Cancelled, No-show, checked-in, or checked-out.

### 3.5 Source / segment / external ref persist — **delivered (0061 + fail-closed gate)**

- Dual-lane **0061** names the columns and optional RPC params. Do **not** overload `hotel_reservations.source`.
- After persist flag flip: write source/segment/ref (+ guarantee if set) on **every successful create**.
- Until flag flip: Confirm **fail-closes**. Pending + FO walk-in without those fields omit new params.
- Non-prod schema **applied**. Prod **Abel-gated**. App flag still **HELD**.

### 3.6 Unpriced gates (reuse Section 5) — **honoured**

- Confirm blocked without a successful server quote.
- Unpriced = pending + `owner` \| `manager`. `assertCreateReservationPricing` **not** weakened.

### 3.7 Success — on-screen / print confirmation (no send) — **delivered**

- In-place confirmation panel on the create route + `window.print`.
- Secondary Open reservation to detail. **Not** public stay confirmation. **No email. No SMS.**

### 3.8 Walk-in honesty — **delivered (option 1)**

- FO `WalkInDialog`: room required + quoted rate for confirmed. **No** guarantee required.
- Create Reservation: Unassigned allowed. Commercial source Walk-in does **not** require a room.
- Same `createReservation` writer. **No** second walk-in product.

### 3.9 No second writer / no cashiering / no send — **honoured**

- Same route + same writer. No insert-then-`setReservationStatus`. No create-time folio / deposit RPC.
- No invented LIVE OTA, RMS, commission, offline queue, Group allotment, or CR-100.

---

## 4. Out of Section 7 (locked — still out)

- **Create-time deposit posting** / cashiering / folio open (FO check-in remains SoT)
- **Email / SMS** send confirmation (and any send queue / Resend / Twilio invent)
- **Credit-approval engine** / city-ledger / credit-limit hard block
- Inventing a **payment gateway** or card-present capture
- Inventing a **guarantee rules** Setup product
- Overloading `hotel_reservations.source` without an explicit Eng map
- **Selectable package attach** (Section 8 GATE — detect only)
- LIVE **OTA / RMS / commission / yield**; **offline** / local-first
- **Group** block / allotment / rooming list / parent **Company Reservation CR-100**
- New entitlement / RLS **architecture** without Abel flag
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- Weakening Section 5 unpriced / confirmed-rate gates
- Second Create Reservation product; cloning legacy chrome
- Applying **prod** 0061 / 0059 / 0060 from docs or agents

---

## 5. Acceptance criteria (AC-CR7) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR7-1** | Review / sticky honest Guest, Associations, stay, room type, room or Unassigned, rate, server total (unpriced = no fake `0.00`). Compose with §5 totals and §6 room line | **PASS** (#155) |
| **AC-CR7-2** | Guarantee required on Confirm; Pending optional; `pms_payment_methods` else `PAYMENT_METHODS`; no invented gateway | **PASS** (#155) |
| **AC-CR7-3** | Payment terms read-only from Company/TA; no credit engine | **PASS** (#155) |
| **AC-CR7-4** | Confirm → `confirmed` + guarantee; Pending → `pending`; no cancel/no-show at create | **PASS** (#155) |
| **AC-CR7-5** | Draft / Guaranteed are not new DB statuses | **PASS** (#155) |
| **AC-CR7-6** | Unpriced Pending + permission; confirmed without rate blocked; `assertCreateReservationPricing` not weakened | **PASS** (#155) |
| **AC-CR7-7** | Source + segment required on Confirm; external ref optional; not channel `source` | **PASS** (#155) |
| **AC-CR7-8** | Persist via 0061 only; Confirm fail-closes until persist flag | **PASS** (#155) — flag still **HELD** |
| **AC-CR7-9** | On-screen confirmation + print | **PASS** (#155) |
| **AC-CR7-10** | No email/SMS | **PASS** (#155) |
| **AC-CR7-11** | No create-time deposit cashiering | **PASS** (#155) |
| **AC-CR7-12** | Same writer; no insert-then-status | **PASS** (#155) |
| **AC-CR7-13** | Permission gates preserved; RLS model unchanged | **PASS** (#155) |
| **AC-CR7-14** | Guest GE1–GE3 closed | **PASS** (#155) |
| **AC-CR7-15** | No Phase 1 / Create Reservation DONE | **PASS** (#155) |
| **AC-CR7-16** | FO walk-in room+rate; create Unassigned; FO no guarantee required | **PASS** (#155) — option 1 |
| **AC-CR7-17** | Sticky total = §5 server quote | **PASS** (#155) |
| **AC-CR7-18** | Locked non-goals absent | **PASS** (#155) |
| **AC-CR7-19** | Migration 0061 dual-lane; APPLY honesty | **PASS** (#155) — non-prod APPLY PASS; prod Abel-gated; writer HELD |
| **AC-CR7-20** | Additive `/restaurant/bookings/new` | **PASS** (#155) |
| **AC-CR7-21** | Programme rule / NORU UI; CR-100 OUT | **PASS** (#155) |
| **AC-CR7-22** | Compose with §6 room line + §5 total | **PASS** (#155) |
| **AC-CR7-23** | Corporate/TA master required for Confirm | **PASS** (#155) |
| **AC-CR7-24** | Not public stay confirmation / SET5 send | **PASS** (#155) |

Full AC text remains the #150 baseline; do not reopen Guest GE; do not claim Phase 1 DONE; do not invent email/SMS/deposit/gateway.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 7 only (#155 MERGED 2026-09-15, SHA `b3994fd98df89077c3c34f31b563f43e4603640b`). Independent QA **PASS** (Rekik, pre-merge). `tsc` PASS; locks **AC-CR7-1…24 PASS** (+ AC-CR1 / CR2 / CR2A / CR4 / CR5 / CR6 / CR8 regression PASS). Browser **NOT RUN ≠ PASS** (IQ covered).
- Security: staff-only; tenant-scoped; existing FO / reservation gates preserved; guarantee labels do **not** grant cashier post permission; **no** new RLS policies; Flag Abel **NOT** required (RLS model unchanged). SECURITY DEFINER create RPCs were **replaced** (0061) — dual-lane; prod apply Abel-gated.
- Regression: Sections 1–6 shell / stay / availability / Company-TA / Rate / Room / Associations (as shipped); Section 8 Packages GATE detect-only (composed, no bind); walk-in same writer + room+rate, no guarantee; FO check-in deposit unchanged; Guest GE closed; `setReservationStatus` cancel/no-show still FO/detail — not create.
- Migration: **0061** dual-lane. Non-prod **APPLY PASS** (`20260915144627`). **Prod 0061 / 0059 / 0060 Abel-gated**. Writer persist flag still **HELD**.
- **#153** remains **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED.

---

## 7. Eng confirm items (resolved in #155)

| Item | Resolution |
|---|---|
| Empty `pms_payment_methods` | Cashier `PAYMENT_METHODS` fallback + honest warning |
| Persist columns + migration | **0061** (0060 taken by Associations). Dual-lane. Do not overload `source` |
| Pending persist | **Every successful create** after persist flag flip (`CREATE_RESERVATION_SECTION7_PENDING_PERSIST`) |
| FO walk-in vs guarantee | **Option 1** — confirmed + rate **without** guarantee |
| Success chrome | **In-place** panel + `window.print`; Open reservation to detail |
| Sticky compose | Source / segment / ref / guarantee / payment terms after Stay total; §5 total + §6 Room kept; §8 packages honesty after the `<dl>` |
| Channel origin residual | Leave create RPC `source = 'staff'` documented |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** (baseline [#150](https://github.com/NORUDEVGIT/NORU/pull/150); may still be open/draft). CURRENT recon on this file |
| ENGINEERING | **PASS** (#155) — Section 7 only |
| Implemented / PASS (Section 7) | **Yes** (DER) |
| OPERATIONALLY ACCEPTED / LIVE / module COMPLETE / Phase 1 COMPLETE | **No** — Outcome Review pending |
| Issue #153 | **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED |
| Migration | **0061** dual-lane. Non-prod **APPLY PASS** (`qcwptraosaudcbjasmul` / `20260915144627`). **Prod 0061 / 0059 / 0060 Abel-gated**. Writer `CREATE_RESERVATION_SECTION7_APPLY` still **HELD** (Confirm fail-closes). RLS **UNCHANGED**. Flag Abel **NOT** required |
| Guarantee Setup catalogue | **Absent** — reuse `pms_payment_methods` / `PAYMENT_METHODS` as labels only |
| Source / segment / ref / guarantee persist | **0061 schema on non-prod.** Writer flag **HELD** — Confirm fail-closes; Pending omits new params |
| Create statuses | **pending** \| **confirmed** only |
| Email / SMS / create-time deposit / gateway / credit engine | **OUT** |
| FO Walk-in room + rate required | **Preserved** (CURRENT) |
| FO Walk-in guarantee | **Not** required (option 1) |
| Create path room | **Optional** (CURRENT) |
| LIVE OTA / RMS / commission / CR-100 | **Not invented** |
| Guest GE1–GE3 | **Closed** — not reopened |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
