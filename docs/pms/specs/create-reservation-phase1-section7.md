# Create Reservation — Phase 1 Section 7 (Guarantee + review/confirm + on-screen confirmation)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 7: Guarantee + review/confirm + on-screen confirmation |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **LIKELY YES** for Confirm-path persist. CURRENT has **no** `hotel_reservations` columns / `create_hotel_reservation_priced` params for commercial booking source, market segment, external reference, or guarantee method. Dual-lane APPLY **HELD** (same pattern as `0059_pms_create_reservation_company_ta.sql`): next free after **0059**, drizzle + supabase mirrors, Abel/PM apply after merge, fail-closed until apply. Do **not** invent LIVE schema in this Spec — Eng **names** additive columns + RPC params in TIP. Do **not** overload `hotel_reservations.source` (`staff` \| `walk_in` \| `direct_booking` \| `future_online` = **channel origin**). Additive RLS matching reservation tables OK; **flag Abel** if entitlement / RLS **model** must change. No new payment-gateway table. No create-time folio / deposit RPC |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE (Section **8** packages remain) |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section7-programme.md`](../create-reservation-phase1-section7-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest — source/segment/ref **draft-only**). [`create-reservation-phase1-section5.md`](./create-reservation-phase1-section5.md) Rate + sticky **LIVE** ([#141](https://github.com/NORUDEVGIT/NORU/issues/141) CLOSED / [#142](https://github.com/NORUDEVGIT/NORU/pull/142)). [`create-reservation-phase1-section6.md`](./create-reservation-phase1-section6.md) Room assign Spec ([#143](https://github.com/NORUDEVGIT/NORU/pull/143); coding [#145](https://github.com/NORUDEVGIT/NORU/issues/145) / [#148](https://github.com/NORUDEVGIT/NORU/pull/148) — **parallel OK, do not block**). Individual Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139) LIVE. This section **owns** guarantee, Confirm/Guarantee vs Pending, and on-screen/print confirmation |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> **Programme rule (LOCKED):** Reference Individual create **guarantee / confirm** function with **modern NORU UI** (own box, sticky summary, sticky actions). **Do not** clone legacy chrome. Placement may borrow from reference.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → **7 Guarantee + confirm (THIS)** → 8 Packages if catalog.
>
> **Server / RPC remains source of truth.** Sticky stay total = Section 5 **server** `quoteStay` / `price_hotel_stay` (LIVE). Browser math is **ignored**. Deposit posting stays **FO check-in**. Do **not** invent a payment gateway, credit-approval engine, or email/SMS send.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Sections 1–6) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). Already takes `_status` `pending` \| `confirmed` and optional `_rate_plan_id` |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Own **Guarantee** box + **Review** in sticky + Confirm / Guarantee vs Pending actions. Success = **on-screen / print** confirmation. Modern NORU boxes (not legacy clone). Doc2 shell / sidebar collapse from Section 1 unchanged |
| Product locks (D4 / D5 / D7 / D8) | Guarantee method + payment-terms **ref** (from Company/TA when linked) + **server total** on create. Deposit posting = **FO check-in**. Rate required to Confirm/Guarantee; unpriced Pending **only with permission** (Section 5 — **reuse**, do not reopen). Statuses **pending** \| **confirmed** only. On-screen/print confirmation only — **no email/SMS**. Persist source/segment/external ref on confirm if still draft-only — CURRENT **does not persist**; dual-lane APPLY HELD |
| Walk-in honesty | FO `WalkInDialog` **requires** room **and** (post-#142) a quoted rate for `confirmed`. `/restaurant/bookings/new` **allows** Unassigned. Commercial booking source Walk-in **≠** FO walk-in mode |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Details **Create as** `pending` \| `confirmed`; sticky `create-reservation-summary`; actions **Create reservation**; success `toast` + navigate `/restaurant/pms/reservations/$reservationId`. **No** guarantee box. **No** on-screen confirmation panel. **No** print. `bookingSource` / `marketSegment` / `externalReference` state is **not** in the `createReservation` payload |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation`. Zod `status: z.enum(["pending", "confirmed"]).optional()`; `assertCreateReservationPricing` (Section 5); RPC `_status` default `pending`. **No** guarantee / source / segment / external-ref params |
| RPC (priced) | `create_hotel_reservation_priced` → `create_hotel_reservation` (`0059_pms_create_reservation_company_ta.sql`). `_status NOT IN ('pending','confirmed')` → `INVALID_STATUS`. INSERT hardcodes **`source = 'staff'`**. Optional `_company_master_id` / `_travel_agent_master_id`. Optional `_rate_plan_id` (null skips `price_hotel_stay`) |
| Reservation row (today) | `hotel_reservations.status` CHECK after 0014: `pending` \| `confirmed` \| `cancelled` \| `checked_in` \| `checked_out` \| `no_show`. **`source`** CHECK: `staff` \| `walk_in` \| `direct_booking` \| `future_online` (**channel origin**). **No** columns for commercial booking source, market segment, external reference, or guarantee method (SQL + generated `types.ts` Row). Master IDs exist (Wave 4 / `0053`; RPC `0059`) |
| Status literals | `RESERVATION_STATUSES` in `reservation-dates.ts`. Create UI + writer: **pending** \| **confirmed** only. `MANUAL_RESERVATION_STATUSES` also includes `cancelled` on **detail** `setReservationStatus` — **not** create |
| Guarantee Setup | **Absent.** Property setup copy: cancellation / deposit / **guarantee** / no-show rules **aren't configurable yet**. **No** `guarantee_method` enum / table / column |
| Closest Setup catalogue | Polish 1 `pms_payment_methods` (`0056`) via `getPmsPolish1Snapshot` — **accepted tenders for folio posting**, not a gateway, not a guarantee product. Empty = warning. **No sample seed** |
| Closest cashier enum | `PAYMENT_METHODS` in `nightaudit.server.ts`: `cash` \| `card` \| `bank_transfer` \| `mobile_money` \| `other` |
| Payment terms | `guest_account_masters.payment_terms` → `paymentTerms` on Company/TA pickers (`create-reservation-master-picker.tsx`). Read-only copy already points at Section 7. **Not** written to the reservation row |
| Rate / unpriced (LIVE §5) | `create-reservation-phase1-section5.ts` — `assertCreateReservationPricing`; unpriced = **Pending** + `owner` \| `manager`; confirmed without `ratePlanId` **throws**. Sticky total = server quote |
| Success (today) | Toast `Reservation {confirmationNumber} created.` then reservation **detail**. Public print lives on `/stay/$propertySlug/confirmation` (direct booking) — **not** this staff path. Detail workspace has **no** `window.print` |
| Email / SMS | Create path has **no** `sendConfirmation`. SET5 notification channels exist as **Settings** posture — **not** wired to this create |
| Deposit / cashiering | FO check-in stepper Policy A (`fo-check-in.ts`) — deposit posted or waived **at check-in**. Create does **not** call folio / `createDeposit` |
| Walk-in (same writer) | `WalkInDialog`: `status: "confirmed"`, **requires** `roomId` + (post-#142) `ratePlanId`; then `startWalkInCheckIn`. No guarantee picker. No Unassigned |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |

---

## 2. CURRENT (code wins)

Inspected on `origin/main` at `7c72484` (after Section 5 [#142](https://github.com/NORUDEVGIT/NORU/pull/142) + Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139); Section 6 coding [#145](https://github.com/NORUDEVGIT/NORU/issues/145) may still be in flight).

### 2.1 Review / sticky

- Sticky (`create-reservation-summary`) shows Type, Guest, Associations / Company / TA, Stay dates, Nights, Occupancy, Room type, Availability, and when priced: Rate code/name, Rate & Total, **server** stay total (Section 5). Unpriced: badge + honest no-total copy (not `0.00`).
- **No** specific room / Unassigned line yet (Section 6 Spec / [#145](https://github.com/NORUDEVGIT/NORU/issues/145) — compose when it lands; do not block).
- **No** booking source / segment / external ref / guarantee / payment-terms line on the sticky.
- Actions: single **Create reservation** (plus Cancel). Not Confirm / Guarantee vs Pending.

### 2.2 Guarantee method

- **Absent** on `/restaurant/bookings/new`. Section 1 lock tests still assert the page does not contain `guarantee method`.
- **No** reservation column, RPC param, or Setup guarantee catalogue. Closest CURRENT lists: `pms_payment_methods` (tenders) and cashier `PAYMENT_METHODS`. Using them on create must be **label / recorded method only** — **not** a folio post.

### 2.3 Payment terms

- When a Company or TA master is selected, pickers already show **read-only** `paymentTerms` (or “No payment terms on this master”). Copy: reference for later Confirm — not a credit engine.
- Terms are **not** snapshotted onto `hotel_reservations`. Credit limit / city-ledger / approval engine: **absent**.

### 2.4 Status model

| Product word | CURRENT DB / writer |
|---|---|
| Pending | `status = 'pending'` (create default) |
| Draft | **Not a DB status.** Incomplete draft is client state until submit |
| Confirmed | `status = 'confirmed'` via Details select |
| Guaranteed | **Not a DB status.** No guarantee method stored |
| Cancelled / No-show | Exist on the table / FO / detail. Create RPC **rejects** any status other than pending \| confirmed (`INVALID_STATUS`) |

Unpriced **confirmed** is **blocked** on the shared writer (Section 5). Unpriced **pending** is owner/manager only.

### 2.5 Booking source / segment / external ref

- Section 1 **collects** them on the Context card (SET6 catalogues else Spec §3.1 defaults).
- `canSubmit` / `createReservation` **do not** read them. RPC does **not** take them.
- `hotel_reservations.source` is **channel origin**, hardcoded **`staff`** on this create RPC (including FO walk-in). Commercial picker `walk_in` is **not** that enum.
- **Honesty:** still **draft-only**. Persist is **this** section’s job and **needs schema + RPC** (not CURRENT-supported).

### 2.6 Confirmation UI

- Success = **toast + navigate to detail**. No staff on-screen confirmation sheet. No print on this path. No email/SMS send.

### 2.7 Walk-in

| Surface | Room | Rate | Guarantee | Unassigned |
|---|---|---|---|---|
| `/restaurant/bookings/new` | Optional | Required for **confirmed**; unpriced **pending** + permission | **None** | Allowed |
| FO `WalkInDialog` | **Required** | **Required** (confirmed + §5 writer gate) | **None** | **Not** offered |
| FO check-in complete | Required (`ROOM_REQUIRED`) | n/a | Deposit at check-in | n/a |

Pre-#142 walk-in was often unpriced **confirmed**. **CURRENT after #142:** confirmed walk-in **must** send a rate. Preserve **room-required** FO vs **optional** create-path. Do **not** treat commercial source Walk-in as FO walk-in.

### 2.8 DATABASE IMPACT (honesty)

| Field | CURRENT persist? | Section 7 impact |
|---|---|---|
| `status` pending \| confirmed | **Yes** (`_status`) | Reuse. Map Guaranteed → confirmed **plus** guarantee method (new) |
| Rate / server total | **Yes** when `_rate_plan_id` set | Reuse Section 5. Do not add a second total |
| Company/TA payment terms | Master only (read-only UI) | **No** new column required for display |
| Commercial booking source / market segment / external ref | **No** | Additive columns + RPC params — dual-lane APPLY **HELD** |
| Guarantee method | **No** | Additive column + RPC param — dual-lane APPLY **HELD** |
| Channel `source` | Hardcoded `staff` | Do **not** silently map commercial source into this enum |
| Deposit / folio | FO check-in | **None** on create |

Until APPLY, Confirm that requires persist of source/segment/guarantee must **fail closed** (honest error) — not pretend the row stored them.

---

## 3. EXPECTED — Guarantee + review + confirm

### 3.1 Review summary (honest fields)

Sticky / review must show, when known:

- **Guest** (selected name)
- **Associations** (Company and/or TA name, or honest None) — Individual Associations LIVE
- **Stay** (dates + nights + occupancy)
- **Room type**
- **Room number or Unassigned** (compose with Section 6 when shipped; until then honest Unassigned / “Assign later” from CURRENT `roomId`)
- **Rate** (code + name when priced)
- **Sticky server total** from the **same** Section 5 quote object — **not** client math. Unpriced: reuse Section 5 unpriced copy — **no** fake `0.00`

Also on review (Confirm path): booking source, market segment, external ref (if entered), guarantee method, payment terms when a master is linked.

Empty / loading / error states stay honest.

### 3.2 Guarantee method (required for Confirm / Guarantee)

- Staff pick **one** guarantee method on a modern NORU box before **Confirm / Guarantee**.
- **Values from CURRENT only:**
  1. Prefer **active** `pms_payment_methods` rows from `getPmsPolish1Snapshot` (code + name). Empty catalogue is a **warning**, not a fake seed.
  2. If the catalogue is empty or `paymentMethodsAvailable === false`, fall back to CURRENT cashier `PAYMENT_METHODS` labels (`cash`, `card`, `bank_transfer`, `mobile_money`, `other`) — same pattern as Section 1 SET6-else-defaults.
- This is a **recorded guarantee / tender class**. It does **not** post a deposit, open a gateway, or capture a card.
- **Pending / Draft** submit: guarantee **optional**.
- **Confirm / Guarantee** submit: guarantee **required**. Block with visible copy if missing.
- Do **not** invent CC-auth, city-ledger, guarantee-letter, or 3-D Secure products.

### 3.3 Payment terms (read-only)

- When Company and/or TA is linked, show master `paymentTerms` as **read-only** on the Guarantee / review box (reuse picker data — **no** parallel master API).
- Missing terms: honest “No payment terms on this master.”
- **No** credit-approval engine, credit-limit hard block, or city-ledger posting.

### 3.4 Confirm / Guarantee vs Pending (status map)

| Staff action | Writes | Requires rate (D5) | Requires guarantee | Source / segment |
|---|---|---|---|---|
| **Pending** (Draft incomplete) | `status = pending` | No, if unpriced **permission** (Section 5) | No | Collected; persist if columns exist / after APPLY |
| **Confirm / Guarantee** | `status = confirmed` **and** guarantee method stored | **Yes** — priced server quote | **Yes** | **Required** (Section 1). Persist per §3.5 |

- **Draft** is **not** a new DB status — it is pending + incomplete UI.
- **Guaranteed** is **not** a new DB status — it is **confirmed + guarantee method**.
- Create UI must **not** offer Cancelled, No-show, checked-in, or checked-out.
- Replace or wrap the CURRENT Details “Create as” select so Confirm cannot be chosen without guarantee (and without rate).

### 3.5 Source / segment / external ref persist (honesty)

Section 1 still **draft-only**. CURRENT RPC/columns **cannot** store them.

On **Confirm / Guarantee** (and on Pending once persist exists — Eng picks one documented rule; default = persist whenever create succeeds **after APPLY**):

- Persist commercial **booking source** and **market segment** (required on Confirm; SET6 else Section 1 §3.1 defaults).
- Persist **external reference** when entered (optional text).
- **Do not** write these into `hotel_reservations.source` unless Eng documents an explicit map (CURRENT enums do **not** match Phone/Email/Corporate/…). Channel origin stays `staff` on this desk path unless Eng separately sets `walk_in` for FO walk-in (today it does **not** — residual; **do not boil** from this section unless cheap and documented).

**Dual-lane APPLY HELD pattern** (mirror `0059`):

1. Eng TIP names next free migration after **0059** (likely **0060** if still free).
2. Dual-lane `supabase/migrations/` + `drizzle/migrations/` additive columns + replace `create_hotel_reservation` / `create_hotel_reservation_priced` with optional params (DEFAULT NULL so older callers keep resolving).
3. **APPLY HELD** — Abel/PM; non-prod first, then production. This docs PR does **not** add SQL.
4. Until apply: Confirm must **fail closed** if it would claim persist. Do not toast success with silently dropped source/segment/guarantee.
5. No new tables required for these four fields. No sample seed. Flag Abel only if RLS **model** changes.

Do **not** invent extra schema (gateways, guarantee rules engine, email queue).

### 3.6 Unpriced gates (reuse Section 5 — do not reopen)

- **Confirm / Guarantee** blocked without a successful server quote.
- Unpriced create = **pending** only + `owner` \| `manager` (LIVE `UNPRICED_PENDING_ROLES`). Receptionist must pick a quoted plan.
- Section 7 must **not** weaken `assertCreateReservationPricing`. Prefer calling the same helper from Confirm/Pending actions.

### 3.7 Success — on-screen / print confirmation (no send)

After a successful create:

- Show an **on-screen confirmation** (same route success panel or dedicated staff confirmation view — Eng picks **one**; do **not** use the public `/stay/$propertySlug/confirmation` guest path as the staff product).
- Include at least: confirmation number, guest, stay, room type, room/Unassigned, rate + **server** total (or honest unpriced), status (pending vs confirmed), guarantee method when confirmed, payment terms when linked.
- **Print** from that view (`window.print` or equivalent). No PDF engine invent.
- **No email. No SMS. No “Send confirmation”.** SET5 channels stay Settings.
- CURRENT toast+detail may remain as a **secondary** “Open reservation” link. Detail is **not** a substitute for the on-screen confirmation.

### 3.8 Walk-in honesty (preserve CURRENT)

- FO `WalkInDialog`: keep **room required** + **quoted rate for confirmed** (post-#142). Same `createReservation` writer. **No** second walk-in product.
- Create Reservation: keep **Unassigned** allowed. Commercial source Walk-in does **not** require a room.
- FO walk-in has **no** guarantee picker **today**. Section 7 writer must **not** silently break it. Eng confirms **one**:
  1. **Preferred:** FO walk-in stays confirmed + rate **without** guarantee (exception documented; deposit still check-in), **or**
  2. Add a **cheap** guarantee pick on `WalkInDialog` using the same writer fields.
- Do **not** loosen FO walk-in to unassigned or unpriced confirmed.

### 3.9 No second writer / no cashiering / no send

- Same route + same writer. No insert-then-`setReservationStatus`. No create-time folio / deposit RPC.
- Do **not** invent LIVE OTA, RMS, commission settlement, offline queue, Group allotment, or CR-100.

---

## 4. Out of Section 7 (locked)

- **Create-time deposit posting** / cashiering / folio open (FO check-in remains SoT)
- **Email / SMS** send confirmation (and any send queue / Resend / Twilio invent)
- **Credit-approval engine** / city-ledger / credit-limit hard block
- Inventing a **payment gateway** or card-present capture
- Inventing a **guarantee rules** Setup product (property copy still says not configurable)
- Overloading `hotel_reservations.source` without an explicit Eng map
- **Packages** (Section 8 — only if catalog; no fake packages)
- LIVE **OTA / RMS / commission / yield**; **offline** / local-first
- **Group** block / allotment / rooming list / parent **Company Reservation CR-100**
- New entitlement / RLS **architecture** without Abel flag
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- Weakening Section 5 unpriced / confirmed-rate gates
- Second Create Reservation product; cloning legacy chrome

---

## 5. Acceptance criteria (AC-CR7)

| ID | Criterion |
|---|---|
| **AC-CR7-1** | Review / sticky on `/restaurant/bookings/new` shows honest **Guest, Associations, stay, room type, room or Unassigned, rate, and sticky server total** (unpriced = no fake `0.00`). Compose with Section 5 LIVE totals and Section 6 room line when present |
| **AC-CR7-2** | **Guarantee method** is required on the **Confirm / Guarantee** path. Pending / Draft does **not** require it. Values come from CURRENT `pms_payment_methods` if active rows exist, else CURRENT `PAYMENT_METHODS`. Empty Setup is honest. **No** invented gateway |
| **AC-CR7-3** | **Payment terms** display **read-only** from the linked Company/TA master when present. No credit-approval engine |
| **AC-CR7-4** | **Confirm / Guarantee** writes `status = confirmed` **and** stores the selected guarantee method (after APPLY). **Pending** writes `status = pending`. UI does **not** offer Cancelled / No-show / checked-in / checked-out at create |
| **AC-CR7-5** | **Draft** is pending incomplete (not a new DB status). **Guaranteed** is confirmed + guarantee method (not a new DB status) |
| **AC-CR7-6** | **Unpriced** create remains **Pending + permission only** (Section 5 LIVE: owner \| manager). Confirmed without a successful rate quote is **blocked**. Section 7 does not weaken `assertCreateReservationPricing` |
| **AC-CR7-7** | Booking **source** and **market segment** are **required** on Confirm / Guarantee (Section 1). **External ref** optional. Distinct from channel-origin `source` unless Eng documents a map |
| **AC-CR7-8** | Source / segment / external ref / guarantee method **persist** on the reservation row **only via CURRENT columns/RPC if they exist** — they **do not** today. Eng dual-lane APPLY HELD additive columns + RPC. Until apply, Confirm **fail-closes** rather than silent drop. Do **not** invent extra schema |
| **AC-CR7-9** | Successful create shows **on-screen confirmation** including confirmation number and honest stay/rate/total/status/guarantee. **Print** works from that view |
| **AC-CR7-10** | **No email** and **no SMS** send (no Send confirmation control, no `sendConfirmation` on this writer) |
| **AC-CR7-11** | **No create-time deposit cashiering** — no folio post / `createDeposit` / payment capture from this page. Deposit remains FO check-in |
| **AC-CR7-12** | **No second writer.** Walk-in remains `createReservation` → `create_hotel_reservation_priced`. No insert-then-status. No parallel confirm API |
| **AC-CR7-13** | Existing permission gates preserved: `requireRoutePackage("pms")`, `getBookingsAccess` / `requireReservationManager`. Unpriced Pending stays owner \| manager. **No** new entitlement / RLS **model**. Flag Abel if model must change |
| **AC-CR7-14** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR7-15** | Section 7 does **not** claim Phase 1 or full Create Reservation **DONE**. Packages (Section 8) remain |
| **AC-CR7-16** | **Walk-in honesty:** FO `WalkInDialog` still **requires** a room (and a rate for confirmed). Create Reservation does **not** require a room when commercial source is Walk-in. Guarantee-on-walk-in follows §3.8 Eng pick — do not silently 500 FO walk-in |
| **AC-CR7-17** | Sticky / Confirm total is the Section 5 **server** quote (or honest unpriced). Browser math is **ignored** |
| **AC-CR7-18** | Locked non-goals in §4 are **absent** (no gateway, credit engine, LIVE OTA/RMS/commission, offline, Group/CR-100, fake packages, new entitlement architecture) |
| **AC-CR7-19** | Migration honesty: **LIKELY YES** (columns + RPC). Dual-lane APPLY **HELD** (pattern §3.5). Eng **confirms** next free after 0059. This docs PR adds **no** SQL |
| **AC-CR7-20** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second product. Modern NORU box + sticky OK; **do not** clone legacy chrome |
| **AC-CR7-21** | Programme rule honoured: reference guarantee/confirm **function** with NORU UI. Corporate/Group remain later separate products (CR-100 OUT) |
| **AC-CR7-22** | Parallel Section 6 coding ([#145](https://github.com/NORUDEVGIT/NORU/issues/145)) is **not blocked**. Review room/Unassigned line must compose with sticky rate/total — not replace it |
| **AC-CR7-23** | Company/TA **required for Confirm** when reservation type is Corporate / Travel Agency (Section 2 hand-off). Individual Associations remain optional. Missing required master blocks Confirm with visible copy |
| **AC-CR7-24** | Public direct-booking confirmation (`/stay/$propertySlug/confirmation`) and SET5 messaging Settings are **not** retitled as this staff confirmation product |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR7-1…24; browser review fields, guarantee required for confirmed, pending without guarantee, unpriced pending permission, confirmed blocked without rate, source/segment required on Confirm, fail-closed persist until APPLY, on-screen + print, no email/SMS, no deposit post, FO walk-in still room+rate, Create path Unassigned still allowed.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped; preserve reservation gates; no new SECURITY DEFINER unless Abel-approved (RPC replace is the likely case — dual-lane APPLY HELD). Guarantee labels must not grant cashier post permission.
- Regression: Sections 1–5 LIVE shell / stay / availability / Company-TA / Associations / rate sticky; Section 6 room assign if shipped; walk-in same writer; FO check-in deposit unchanged; Guest GE closed; `setReservationStatus` cancel/no-show still FO/detail — not create.

---

## 7. Open Eng confirm items

1. **Guarantee value source when `pms_payment_methods` is empty:** cashier `PAYMENT_METHODS` fallback (recommended) vs block Confirm until Setup has an active tender.
2. **Persist column names + next free migration after 0059** (likely 0060). Dual-lane APPLY HELD. Do not overload `source`.
3. **Pending persist:** write source/segment/ref/guarantee (if any) on every successful create after APPLY, vs Confirm-only. Recommend **every successful create** so Pending rows are not silently blank.
4. **FO walk-in vs guarantee required on writer** (§3.8 option 1 vs 2).
5. **Success chrome:** in-place success panel vs staff confirmation route. Print CSS. Keep “Open reservation” to detail.
6. **Sticky compose with #145:** room/Unassigned line + rate/total + guarantee snippet — single summary, not a second calculator.
7. **Channel origin residual:** create RPC hardcodes `source = 'staff'` even for FO walk-in. Boil only if cheap; otherwise leave documented.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Issue | **TBD** (Eng opens after plan APPROVE) |
| Migration | **LIKELY YES** (additive columns + RPC). Dual-lane APPLY **HELD**. Eng confirms. No SQL in this docs PR |
| Guarantee Setup catalogue | **Absent** — reuse `pms_payment_methods` / `PAYMENT_METHODS` as labels only |
| Source / segment / ref persist | **Not CURRENT** — draft-only until APPLY |
| Create statuses | **pending** \| **confirmed** only |
| Email / SMS / create-time deposit / gateway / credit engine | **OUT** |
| FO Walk-in room required | **Preserved** (CURRENT) |
| Create path room | **Optional** (CURRENT) |
| FO Walk-in unpriced confirmed | **Closed by Section 5** — rate required for confirmed |
| LIVE OTA / RMS / commission / CR-100 | **Not invented** |
| Guest GE1–GE3 | **Closed** — not reopened |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
