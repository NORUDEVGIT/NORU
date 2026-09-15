# Create Reservation — Phase 1 Section 2 (Company / Travel Agency on create)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 2: Company / Travel Agency on create |
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 (DER PASS) |
| **ENGINEERING STATUS** | **PASS** for Section 2 — delivery [#132](https://github.com/NORUDEVGIT/NORU/pull/132) MERGED |
| **Issue** | [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** completed — OPERATIONALLY ACCEPTED. Do **not** claim LIVE / Phase 1 COMPLETE |
| **Migration** | `0059_pms_create_reservation_company_ta` — **non-prod APPLY PASS** (version `20260915125648`, project `qcwptraosaudcbjasmul`): create **14-arg** + priced **15-arg** with optional Company/TA masters. **Prod Abel-gated residual NOT applied**. New columns **NONE**; RLS **UNCHANGED** |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen. Reuse GE1 Company + GE3 TA masters / modals / list APIs |
| **Phase 1 / module COMPLETE** | **NO** — Section 2 only; stay/rate/room/guarantee later sections own DONE claims |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section2-programme.md`](../create-reservation-phase1-section2-programme.md) |
| **Prior section** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) — Context + Guest + type-mode chrome |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Closes **AC-W4-5 for create** (Company + TA master IDs on create — not only reservation detail). Detail attach remains valid for amendments / late link.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER PASS (#132). Spec docs baseline [#126](https://github.com/NORUDEVGIT/NORU/pull/126). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → **2 Company/TA on create (THIS — OPERATIONALLY ACCEPTED / #127 CLOSED)** → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Section 1) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in; optional `_company_master_id` / `_travel_agent_master_id`) |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Corporate / TA mode shows live GE1 / GE3 pickers + inline create (placeholders removed). Doc2 shell / sidebar collapse from Section 1 unchanged |
| Masters | Reuse Guest `listGuestAccounts` / `createGuestAccount` / `GuestCompanyFormDialog` (GE1) / `GuestTravelAgentFormDialog` (GE3). Prefill from `listGuestAccountLinks` (employer / booker_ta). **No parallel writers** |
| AC-W4-5 | **Closed for create** (DER): persist `company_master_id` / `travel_agent_master_id` atomically on create. Detail `setReservationGuestMasters` stays for post-create amend |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — type mode, prefill, bind on submit, sticky Company/TA summary |
| Context UI | `src/packages/pms/components/bookings/create-reservation-context.tsx` — mounts `CreateReservationMasterPicker` for Corporate / TA |
| Master picker | `src/packages/pms/components/bookings/create-reservation-master-picker.tsx` — search / select / inline GE1+GE3 create / payment-terms read-only |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1.ts` + `create-reservation-phase1.test.ts` (AC-CR1-1…21 + **AC-CR2-1…18 PASS**) |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` with optional `companyMasterId` / `travelAgentMasterId` |
| RPC (priced) | `create_hotel_reservation_priced` — **15-arg** with optional `_company_master_id` / `_travel_agent_master_id` (DEFAULT NULL) |
| RPC (base insert) | `create_hotel_reservation` — **14-arg**; INSERT sets `company_master_id` / `travel_agent_master_id` when provided |
| Migration | Dual-lane `supabase/migrations/0059_pms_create_reservation_company_ta.sql` + `drizzle/migrations/0059_pms_create_reservation_company_ta.sql` |
| Reservation columns | `hotel_reservations.company_master_id`, `travel_agent_master_id` (Wave 4 / `0053`) — **no new columns** in 0059. `group_account_master_id` remains detail-only |
| Detail attach | `ReservationGuestMastersCard` → `getReservationGuestMasters` / `setReservationGuestMasters` — amend / late link unchanged |
| GE1 Company UI | `src/packages/pms/components/guests/guest-company-form-dialog.tsx` |
| GE3 TA UI | `src/packages/pms/components/guests/guest-travel-agent-form-dialog.tsx` |
| List / create masters | `listGuestAccounts`, `createGuestAccount`, `getGuestAccount` in `guest-accounts.functions.ts` |
| Guest↔master links | `listGuestAccountLinks` — roles `employer` (company) / `booker_ta` (travel_agent) |
| Payment terms (master) | `guest_account_masters.payment_terms` → `paymentTerms` on selected master card |
| Access | `requireRoutePackage("pms")` + `requireReservationManager`; master list/create via `requireGuestManager` / `getGuestsAccess.canManage` |

---

## 2. CURRENT (code wins — post #132)

- `/restaurant/bookings/new` Corporate / Travel Agency modes show **live** Company / TA pickers (`CreateReservationMasterPicker`) — Section 1 placeholders **removed**.
- **Individual** hides both pickers; `mastersForCreateMode("individual", …)` binds **null** / **null** (no master IDs from this chrome).
- **Company picker:** `listGuestAccounts` (`accountType: "company"`, active); search debounce; Clear / Change; name + code.
- **TA picker:** same pattern (`accountType: "travel_agent"`).
- **Inline create:** GE1 `GuestCompanyFormDialog` / GE3 `GuestTravelAgentFormDialog`; on save **auto-select**; no navigate-away; no parallel writers.
- **Prefill:** `listGuestAccountLinks` → `pickPrefillMasterId` (`employer` / `booker_ta`); most recent link wins; `masterId` tie-break. **Staff override wins**; changing guest **keeps** a staff-chosen Company/TA (does not silently re-prefill).
- **Persist on create (atomic RPC):** `createReservation` passes optional `_company_master_id` / `_travel_agent_master_id` into `create_hotel_reservation_priced`. Dual Company+TA on one create is **rejected** (Zod + RPC `DUAL_COMPANY_TA_NOT_ALLOWED`). Mode exclusive via `mastersForCreateMode`.
- **AC-W4-5 for create:** **closed** — masters bound when the reservation is created. Detail `setReservationGuestMasters` / `ReservationGuestMastersCard` remain for amend / late link (including Group).
- **Payment terms:** read-only on selected master card (`CREATE_RESERVATION_PAYMENT_TERMS_COPY`) — reference for Section 7; **no** credit engine.
- **Type switch:** warn (`CREATE_RESERVATION_TYPE_CHANGE_WARN`); preserves guest / stay; **clears** Company/TA + override flag when applying type change.
- **Confirm honesty:** create `canSubmit` is **not** hard-blocked on missing Company/TA (`CREATE_RESERVATION_MASTER_CONFIRM_COPY` → Section 7). Section 2 collects + persists when a selection is present.
- **Sticky summary:** shows Company or TA name when mode is Corporate / Travel Agency.
- **Migration:** non-prod **0059 APPLY PASS** (`20260915125648` / `pms_create_reservation_company_ta` on `qcwptraosaudcbjasmul`). **Prod Abel-gated NOT applied**. New columns **NONE**. RLS **UNCHANGED** (Flag Abel: NOT required).
- **Walk-in:** still uses the same `createReservation` writer from Front Office (params omitted → masters null).

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#126](https://github.com/NORUDEVGIT/NORU/pull/126) EXPECTED AC-CR2-1…18 remain the acceptance baseline; delivery [#132](https://github.com/NORUDEVGIT/NORU/pull/132) matched locks **18/18** (+ Section 1 locks still PASS).
- Pre-existing Stay / availability / rate / room / details UI on the same page **remains**. Section 2 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).

---

## 3. EXPECTED — Company / TA on create (authorized baseline — delivered)

### 3.1 Mode visibility

| Mode | Company | Travel Agency |
|---|---|---|
| **Individual** | **Hide** Company picker. Do **not** persist `company_master_id` from this chrome | **Hide** TA picker. Do **not** persist `travel_agent_master_id` from this chrome |
| **Corporate** | Show Company picker (GE1). Collect + persist on create | Hide TA (dual-link **OUT**) |
| **Travel Agency** | Hide Company | Show TA picker (GE3). Same persist pattern |

Staff may still amend masters later on detail (`setReservationGuestMasters`) — Section 2 does not remove detail attach.

### 3.2 Pickers — **delivered**

- Company / TA search-select from `listGuestAccounts` (active, tenant-scoped); Clear / Change; name + code.
- **No** typed-only company name presented as a master.

### 3.3 Inline create → auto-select — **delivered**

- GE1 / GE3 dialogs; auto-select on save; no parallel writers; no navigate-away.

### 3.4 Prefill + staff override — **delivered**

- Prefill `employer` / `booker_ta`; most recent + `masterId` tie-break.
- Staff override wins; guest change **keeps** staff choice.

### 3.5 Persist on create (closes AC-W4-5 for create) — **delivered**

- Atomic RPC params on `create_hotel_reservation` / `create_hotel_reservation_priced`.
- Individual → both null from this chrome.
- Exact columns: **`company_master_id`**, **`travel_agent_master_id`**.

### 3.6 Payment-terms reference — **delivered**

- Read-only from master; Section 7 reference; **no** credit engine / deposit.

### 3.7 Type switch — **delivered**

- Warn; preserve guest/stay; **clear** Company/TA when leaving Corporate / TA.

---

## 4. Out of Section 2 (locked — still out)

- Parent **Company Reservation CR-100**; group block / allotment / rooming list
- **Group account** picker on create (detail may keep Group)
- Credit approval engine; create-time cashiering deposit
- Rate / stay / room / guarantee (Sections 3–7)
- Email / SMS send confirmation
- LIVE OTA; commission settlement / posting
- New entitlement / RLS **architecture**
- Reopening Guest Waves 1–5 or GE1–GE3 product scope
- Claiming Phase 1 or full Create Reservation **DONE**
- Fake packages; offline / local-first; hard blacklist block
- Dual Company+TA on one create (mode exclusive; writer + RPC reject both)

---

## 5. Acceptance criteria (AC-CR2) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR2-1…18** | As authorized in Spec #126 | **PASS** (#132) |

Full AC text remains the #126 baseline; do not reopen Guest GE; do not claim Phase 1 DONE.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 2 only (#132 MERGED 2026-09-15). Independent QA **PASS**. `tsc` PASS; locks AC-CR1 + **AC-CR2-1…18 PASS**.
- Security: staff-only; tenant-scoped; same-property master FKs; existing FO / guest / reservation gates preserved; RPC replace SECURITY DEFINER (Abel-approved path); **no** new RLS policies.
- Regression: GE1 Company create; GE3 TA create; detail `ReservationGuestMastersCard` (incl. Group); FO walk-in same writer; Section 1 ACs not regressed.
- Migration: non-prod 0059 **APPLY PASS**; prod **Abel-gated NOT applied** (residual).
- **#127** **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).

---

## 7. Eng confirm items (resolved in #132)

| Item | Resolution |
|---|---|
| Bind mechanism | **Atomic RPC** (preferred) — optional `_company_master_id` / `_travel_agent_master_id`. Post-insert attach **not** used |
| Confirm gate ownership | Hard-block stays **Section 7**; Section 2 collects + persists when selection present |
| Multi-link prefill | Most recent matching link; `masterId` tie-break |
| Override vs guest change | Staff override wins; guest change **keeps** staff-chosen master |
| Dual Company+TA on one create | **OUT** — mode exclusive; Zod + RPC reject both |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** (#127 CLOSED) |
| ENGINEERING | **PASS** (#132) |
| Implemented / PASS (Section 2) | **Yes** (DER) |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Migration | Non-prod 0059 **PASS**; prod Abel-gated **NOT** applied (residual). New columns **NONE**; RLS **UNCHANGED** |
| AC-W4-5 (create) | **Closed** (DER on #132) |
| Create Reservation DONE | **NO** |
| Issue #127 | **CLOSED** completed |
