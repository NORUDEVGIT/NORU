# Create Reservation — Phase 1 Section 2 (Company / Travel Agency on create)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 2: Company / Travel Agency on create |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **LIKELY YES for RPC signature** (not new reservation columns). `hotel_reservations.company_master_id` / `travel_agent_master_id` already exist (Wave 4 / `0053`). `create_hotel_reservation` / `create_hotel_reservation_priced` do **not** take those params today. Dual-lane APPLY **HELD** if Eng replaces the SECURITY DEFINER RPCs. Additive RLS matching reservation / guest-account tables OK; **flag Abel** if entitlement / RLS **model** must change |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen. Reuse GE1 Company + GE3 TA masters / modals / list APIs |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section2-programme.md`](../create-reservation-phase1-section2-programme.md) |
| **Prior section** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) — Context + Guest + type-mode chrome (placeholders) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Closes **AC-W4-5 for create** (Company + TA master IDs on create — not only reservation detail). Detail attach remains valid for amendments / late link.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts.
>
> Section delivery order: 1 Context + Guest → **2 Company/TA on create (THIS)** → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog. Later sections own stay / rate / room / guarantee.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Section 1) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in) |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Replace Section 1 Corporate / TA **placeholders** with real GE1 / GE3 pickers + inline create. Doc2 shell / sidebar collapse from Section 1 unchanged |
| Masters | Reuse Guest `listGuestAccounts` / `createGuestAccount` / `GuestCompanyFormDialog` (GE1) / `GuestTravelAgentFormDialog` (GE3). Prefill from `listGuestAccountLinks` (employer / booker_ta). **No parallel writers** |
| AC-W4-5 | Close residual **for create**: persist `company_master_id` / `travel_agent_master_id` when Corporate / TA mode confirms create. Detail `setReservationGuestMasters` stays for post-create amend |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Section 1 type mode + type-change warn dialog |
| Context chrome (today) | `src/packages/pms/components/bookings/create-reservation-context.tsx` — Corporate / TA **placeholders only** (`CREATE_RESERVATION_COMPANY_PLACEHOLDER` / `CREATE_RESERVATION_TA_PLACEHOLDER`) |
| Section 1 helpers | `src/packages/pms/lib/create-reservation-phase1.ts` |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` |
| RPC (priced) | `create_hotel_reservation_priced` — params today: `_restaurant_id`, `_guest_id`, `_room_type_id`, `_room_id`, `_arrival`, `_departure`, `_adults`, `_children`, `_special_requests`, `_notes`, `_status`, `_rate_plan_id`, `_membership_id` — **no** company / TA |
| RPC (base insert) | `create_hotel_reservation` — INSERT does **not** set `company_master_id` / `travel_agent_master_id` |
| Reservation columns | `hotel_reservations.company_master_id`, `travel_agent_master_id` (also `group_account_master_id` — **out of Section 2 create UI**). Added Wave 4 / `0053_pms_guest_profile_wave4.sql` |
| Detail attach (AC-W4-5 residual path) | `ReservationGuestMastersCard` → `getReservationGuestMasters` / `setReservationGuestMasters` in `guest-accounts.functions.ts`; mounted from `reservation-detail-workspace.tsx` |
| GE1 Company UI | `src/packages/pms/components/guests/guest-company-form-dialog.tsx` |
| GE3 TA UI | `src/packages/pms/components/guests/guest-travel-agent-form-dialog.tsx` |
| List / create masters | `listGuestAccounts`, `createGuestAccount`, `getGuestAccount` in `guest-accounts.functions.ts` |
| Guest↔master links | `listGuestAccountLinks` (`guestId` / `accountId`) — roles include `employer` (company) and `booker_ta` (travel_agent) |
| Payment terms (master) | `guest_account_masters.payment_terms` (GE3 / `0058`); exposed as `paymentTerms` on Company + TA forms / `getGuestAccount` |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")`. Guest master list/create uses `requireGuestManager` (same role set today) |

---

## 2. CURRENT (code wins)

- Section 1 type mode **Individual \| Corporate \| Travel Agency** is LIVE on `/restaurant/bookings/new`. Corporate / TA show **dashed placeholders** only — **no** picker, **no** master ID in draft, **no** persist on create.
- Type switch: warn dialog (`CREATE_RESERVATION_TYPE_CHANGE_WARN`); switching **preserves** guest / stay draft. Copy still says Company/TA masters are **not saved in this section**.
- `createReservation` Zod input has **no** `companyMasterId` / `travelAgentMasterId`. RPC call omits them.
- `create_hotel_reservation` / `create_hotel_reservation_priced` signatures have **no** `_company_master_id` / `_travel_agent_master_id`. INSERT leaves those columns null.
- **AC-W4-5 residual (documented):** reservation **detail** + FO search consume Guest master IDs; create path does not. Staff attach via `ReservationGuestMastersCard` → `setReservationGuestMasters` (Company, Group, TA) after the stay exists.
- Exact CURRENT column names on `hotel_reservations`: **`company_master_id`**, **`travel_agent_master_id`** (uuid, same-property FKs to `guest_account_masters`). Also `group_account_master_id` (Group — detail only; **not** Section 2 create).
- GE1 / GE3 masters + create modals + `listGuestAccounts` / `createGuestAccount` / `listGuestAccountLinks` / `payment_terms` are **LIVE** and must be **reused**, not rebuilt.
- Section 1 lock tests assert create page does **not** yet reference `company_master_id` / `travel_agent_master_id` (expected until this section ships).

---

## 3. EXPECTED — Company / TA on create

### 3.1 Mode visibility

| Mode | Company | Travel Agency |
|---|---|---|
| **Individual** | **Hide** Company picker. Do **not** require. Do **not** persist `company_master_id` from this chrome | **Hide** TA picker. Do **not** require. Do **not** persist `travel_agent_master_id` from this chrome |
| **Corporate** | Show Company picker (GE1 masters). Collect selection. **Required before Confirm** when Corporate (hard Confirm gate may live in **Section 7** — Section 2 must still **collect + persist honestly** when create runs) | Hide TA picker (unless Eng proves a locked dual-link need — **default OUT**) |
| **Travel Agency** | Hide Company picker (default) | Show TA picker (GE3 masters). Same required / persist pattern as Corporate |

Staff may still amend masters later on detail (`setReservationGuestMasters`) — Section 2 does not remove detail attach.

### 3.2 Pickers

- **Company:** search / select from `listGuestAccounts` with `accountType: "company"`. Prefer **active** masters. Tenant-scoped. Show name (+ code if cheap).
- **TA:** same pattern with `accountType: "travel_agent"`.
- Clear / Change clears the draft master for that mode.
- **No** typed-only company name presented as a master (Wave 4 honesty — FO typed labels stay labels elsewhere).

### 3.3 Inline create → auto-select

- **Create Company** opens existing **GE1** `GuestCompanyFormDialog` (full existing form). On success **auto-select** that master on the reservation draft.
- **Create TA** opens existing **GE3** `GuestTravelAgentFormDialog`. On success **auto-select**.
- **No parallel writers** / second Company or TA API / second table.
- Do **not** navigate away to Guest directory to complete create (mirror Section 1 guest create rule).

### 3.4 Prefill + staff override

- When a guest is selected, prefill from `listGuestAccountLinks` for that `guestId`:
  - Corporate mode: prefer an **`employer`** link → `company_master_id`
  - Travel Agency mode: prefer a **`booker_ta`** link → `travel_agent_master_id`
- If multiple links exist, pick a deterministic default (e.g. most recent) and let staff change.
- **Staff override** always wins over prefill.
- Changing guest re-runs prefill **unless** staff already overrode (warn or keep override — Eng picks one honest rule; do not silently thrash a staff choice).

### 3.5 Persist on create (closes AC-W4-5 for create)

- On successful create in Corporate mode, the new `hotel_reservations` row must store **`company_master_id`** = selected Company master (uuid).
- On successful create in Travel Agency mode, store **`travel_agent_master_id`** = selected TA master.
- Individual mode: leave both null from this chrome (detail amend still allowed later).
- Writer remains **`createReservation` → `create_hotel_reservation_priced`** (extend params **or** same-handler post-insert attach via existing `setReservationGuestMasters` — Eng confirms). Staff-visible outcome: masters are bound **when the reservation is created**, not only after opening detail.
- Prefer **atomic** create+bind (RPC params) so a successful create cannot leave masters silently null when Corporate/TA required selection was present. If Eng uses post-insert attach, treat attach failure as create failure (or compensating clear) — **no** silent half-success.
- Exact CURRENT column names to write: **`company_master_id`**, **`travel_agent_master_id`**.

### 3.6 Payment-terms reference (read-only)

- When a Company or TA master is selected, show **payment terms** from the master (`paymentTerms` / `guest_account_masters.payment_terms`) as **read-only reference** for later **Section 7** (guarantee / confirm).
- **No** credit approval engine, credit limit enforcement, city-ledger, or create-time deposit in this section.

### 3.7 Type switch

- Changing reservation type **warns** (extend Section 1 dialog copy).
- **Preserve** guest and stay draft.
- When leaving Corporate or Travel Agency **with** a selected Company/TA: **clear** that master selection, or confirm discard first (no silent keep of a master that the new mode hides).
- Do not invent persistence of hidden-mode masters on Individual create.

---

## 4. Out of Section 2 (locked)

- Parent **Company Reservation CR-100**; group block / allotment / rooming list
- **Group account** picker on create (detail may keep Group; Section 2 create UI is Company + TA only)
- Credit approval engine; create-time cashiering deposit
- Rate / stay / room / guarantee (Sections 3–7)
- Email / SMS send confirmation
- LIVE OTA; commission settlement / posting
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3 product scope
- Claiming Phase 1 or full Create Reservation **DONE**
- Fake packages; offline / local-first; hard blacklist block

---

## 5. Acceptance criteria (AC-CR2)

| ID | Criterion |
|---|---|
| **AC-CR2-1** | Corporate mode shows a **Company picker** over GE1 `listGuestAccounts` (`accountType: "company"`). Selection is collected on `/restaurant/bookings/new` |
| **AC-CR2-2** | Travel Agency mode shows a **TA picker** over GE3 masters (`accountType: "travel_agent"`). Same pattern as Company |
| **AC-CR2-3** | Individual mode **hides** Company and TA pickers and does **not** require either |
| **AC-CR2-4** | Create in Corporate / TA mode **binds** the selected master onto the new reservation row (`company_master_id` / `travel_agent_master_id`) via the same `createReservation` writer stack |
| **AC-CR2-5** | Inline **Create Company** uses existing **GE1** `GuestCompanyFormDialog`; save **auto-selects** that master. Inline **Create TA** uses existing **GE3** `GuestTravelAgentFormDialog`; save **auto-selects** |
| **AC-CR2-6** | Prefill from guest Company/TA links (`listGuestAccountLinks` — `employer` / `booker_ta`); **staff override** wins |
| **AC-CR2-7** | **AC-W4-5 closed for create** for Company + TA: create path persists master IDs (not detail-only). Detail `setReservationGuestMasters` remains for amend / late link |
| **AC-CR2-8** | Selected master shows **payment-terms** as **read-only** reference for later Section 7. **No** credit engine |
| **AC-CR2-9** | **No** Group / block / allotment / rooming / **CR-100** on this create surface |
| **AC-CR2-10** | **No** second Company/TA table or API. Reuse `listGuestAccounts` / `createGuestAccount` / GE1+GE3 dialogs / `listGuestAccountLinks` (and existing reservation attach helpers only as Eng wires create bind) |
| **AC-CR2-11** | Existing permission gates preserved: `requireRoutePackage("pms")`, `requireReservationManager`, guest-manage on master list/create. **No** new entitlement / RLS **model**. Flag Abel if model must change |
| **AC-CR2-12** | Type switch **warns**; **preserves** guest / stay; **clears or confirms discard** of Company/TA when leaving Corporate / TA |
| **AC-CR2-13** | Confirm-time hard block for missing Company/TA when mode requires them may live in **Section 7**; Section 2 still collects and persists honestly when create executes with a selection (and does not invent a second confirm product) |
| **AC-CR2-14** | Section 2 does **not** claim Phase 1 or full Create Reservation **DONE**. Stay / rate / room / guarantee / packages / send confirmation remain later sections |
| **AC-CR2-15** | Locked non-goals in §4 are **absent** |
| **AC-CR2-16** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR2-17** | Migration honesty: columns **already exist**; Eng **confirms** RPC signature change vs same-handler post-insert attach. Dual-lane APPLY **HELD** if SECURITY DEFINER RPC is replaced. Walk-in remains a mode of the **same writer** |
| **AC-CR2-18** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR2-1…18; browser Corporate / TA / Individual on `/restaurant/bookings/new`; verify row columns after create; regression Section 1 type chrome + guest create.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped; same-property master FKs; preserve FO / guest / reservation gates; no new SECURITY DEFINER unless Abel-approved (RPC replace is the likely case — dual-lane APPLY HELD).
- Regression: GE1 Company create; GE3 TA create; detail `ReservationGuestMastersCard`; FO search master labels; walk-in still uses `createReservation`; Section 1 ACs not regressed; Group on detail unchanged.

---

## 7. Open Eng confirm items

1. **Bind mechanism:** extend `create_hotel_reservation` / `create_hotel_reservation_priced` with optional `_company_master_id` / `_travel_agent_master_id` (**preferred** for atomicity) **vs** `createReservation` calling `setReservationGuestMasters` immediately after insert (must fail closed).
2. **Confirm gate ownership:** Section 7 vs Section 2 for hard-block copy when Corporate/TA selection is missing — Section 2 must not pretend Confirm exists if it does not yet.
3. **Multi-link prefill:** deterministic rule when a guest has multiple employer / booker_ta links.
4. **Override vs guest change:** keep staff override or re-prefill with warn.
5. **Dual Company+TA on one create:** default **OUT** (mode is exclusive). Flag if product later needs both on one individual stay (detail already allows both columns).

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan approval |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Migration | Columns exist; **RPC change likely** (Eng confirms). Dual-lane APPLY HELD if yes |
| AC-W4-5 (create) | **Closed by this Spec's EXPECTED** when Eng ships — not claimed LIVE by this docs PR |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
