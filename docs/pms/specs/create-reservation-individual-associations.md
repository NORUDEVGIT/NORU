# Create Reservation — Individual Associations (Section 2 amend follow-up)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation — **Individual Associations** (optional Company + Travel Agency on Individual create) |
| **KIND** | **Follow-up amend** to Phase 1 **Section 2** — **Individual only** |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik PRODUCT AMEND LOCKED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Issue** | Relates **upcoming new Eng issue** (not opened by this docs PR). **Do not reopen** [#127](https://github.com/NORUDEVGIT/NORU/issues/127) |
| **Prior lock (do not reopen)** | Section 2 Spec [#126](https://github.com/NORUDEVGIT/NORU/pull/126) · delivery [#132](https://github.com/NORUDEVGIT/NORU/pull/132) MERGED · [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** / **OPERATIONALLY ACCEPTED** — AC-CR2-1…18 stand as prior lock; this amend does **not** rewrite them as failed |
| **AC series** | **AC-CR2A-1…n** (new series) |
| **Migration** | **Likely NONE for new columns** — `hotel_reservations.company_master_id` / `travel_agent_master_id` already exist (Wave 4 / `0053`); optional RPC params already on `create_hotel_reservation` / `create_hotel_reservation_priced` (`0059`, non-prod **PASS**; **prod Abel-gated**). **Eng confirms** whether Individual dual-bind requires lifting `DUAL_COMPANY_TA_NOT_ALLOWED` + Zod XOR (small RPC follow-up) vs persist path reuse as-is. Dual-lane APPLY **HELD** if SECURITY DEFINER RPC is replaced. Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen. Reuse GE1 Company + GE3 TA pickers / dialogs / list APIs |
| **Phase 1 / module COMPLETE** | **NO** — this amend does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-individual-associations-programme.md`](../create-reservation-individual-associations-programme.md) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik PRODUCT AMEND LOCKED 2026-09-15** via Hospitality Product Advisor.
>
> This is a **follow-up amend** to Section 2 for **Individual** create only. **Do not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) closure or the OPERATIONALLY ACCEPTED verdict. Prior AC-CR2-1…18 remain the Section 2 lock; new work uses **AC-CR2A-***.
>
> Additive expansion of the **existing** `/restaurant/bookings/new` surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Section 1–2) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (0059 optional master-id path) |
| Change | On **Individual**, **always** show an **Associations** box with optional Company + optional Travel Agency |
| Masters | Reuse GE1 `GuestCompanyFormDialog` / GE3 `GuestTravelAgentFormDialog` + `listGuestAccounts` / `createGuestAccount` / `listGuestAccountLinks` — **no parallel writers** |
| Type chrome | Individual / Corporate / TA chrome **may remain** for later Corporate entry, but **must not hide** Company/TA on Individual. Prefer: Individual = full create with Associations **always visible** |
| Prior Section 2 | Corporate → Company only; Travel Agency → TA only; **Individual hid both** (AC-CR2-3). This amend changes **Individual** only |

---

## 1. Evidence paths (code wins — post-#132 on `main`)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — type state, prefill effect, `mastersForCreateMode`, create mutation |
| Context chrome | `src/packages/pms/components/bookings/create-reservation-context.tsx` — Company picker only when `reservationType === "corporate"`; TA only when `"travel_agency"`; **Individual renders neither** |
| Master picker | `src/packages/pms/components/bookings/create-reservation-master-picker.tsx` — GE1 / GE3 dialogs + `listGuestAccounts` |
| Section helpers | `src/packages/pms/lib/create-reservation-phase1.ts` — `mastersForCreateMode` returns **nulls on Individual**; XOR helpers for Corporate/TA |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` optional `companyMasterId` / `travelAgentMasterId`; **Zod rejects both set** |
| RPC | `supabase/migrations/0059_pms_create_reservation_company_ta.sql` (+ drizzle twin) — optional `_company_master_id` / `_travel_agent_master_id`; raises **`DUAL_COMPANY_TA_NOT_ALLOWED`** if both non-null |
| Columns | `hotel_reservations.company_master_id`, `travel_agent_master_id` (Wave 4 / `0053`) — both nullable; detail attach already can hold both |
| Guest links | `listGuestAccountLinks` — roles include `employer` (company) and `booker_ta` (travel_agent) |
| GE1 / GE3 | `guest-company-form-dialog.tsx` / `guest-travel-agent-form-dialog.tsx` |
| Access | `requireRoutePackage("pms")` + `requireReservationManager` / guest-manage on master list/create |

---

## 2. CURRENT (code wins — post-#132)

- [#132](https://github.com/NORUDEVGIT/NORU/pull/132) MERGED; [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** / OPERATIONALLY ACCEPTED. Non-prod **0059** APPLY PASS; **prod 0059 Abel-gated** (not applied).
- Type mode Individual \| Corporate \| Travel Agency is LIVE.
- **Corporate:** shows Company picker (GE1). **Travel Agency:** shows TA picker (GE3). **Individual: both pickers hidden** (`create-reservation-context.tsx`).
- Prefill from `listGuestAccountLinks` runs only when `reservationType !== "individual"`; on Individual the effect **clears** both masters.
- `mastersForCreateMode("individual", …)` always returns `{ companyMasterId: null, travelAgentMasterId: null }` — Individual create never binds masters from this chrome.
- Writer + RPC accept **optional** single master IDs. **Dual bind blocked:** Zod superRefine + RPC `DUAL_COMPANY_TA_NOT_ALLOWED` (Section 2 mode-exclusive lock).
- Inline create → auto-select, payment-terms read-only, type-switch warn + clear masters: LIVE for Corporate/TA modes.
- Detail `setReservationGuestMasters` still available for amend / late link (both columns).

---

## 3. EXPECTED — Individual Associations

### 3.1 Change vs Section 2 (Individual only)

| | **OLD (Section 2 / AC-CR2-3)** | **NEW (this amend)** |
|---|---|---|
| Individual | Company/TA pickers **hidden**; no prefill; no persist from create chrome | **Always** show **Associations** box with optional Company + optional TA |
| Corporate / TA modes | Company-only / TA-only (unchanged by this Spec unless Eng keeps chrome) | May remain for later Corporate entry; **must not** be the reason Individual hides Associations |

### 3.2 Associations box (Individual)

- Always visible when reservation type is **Individual** (default create path).
- Optional **Company** picker — reuse existing `CreateReservationMasterPicker` / GE1 `listGuestAccounts({ accountType: "company" })` + inline **Create Company** → `GuestCompanyFormDialog` → **auto-select**.
- Optional **Travel Agency** picker — reuse GE3 path + `GuestTravelAgentFormDialog` → **auto-select**.
- Staff may **clear** or **override** either picker independently.
- Neither Company nor TA is **required** on Individual to create.
- Prefer NORU layout: Associations as its **own box**. Placement may sit **beside Guest** (reference Consignee-adjacent position in legacy mental model) — **do not** clone legacy UI chrome.

### 3.3 Prefill + override

- When a guest is selected on Individual, prefill from `listGuestAccountLinks`:
  - `employer` → Company (deterministic default if multiple)
  - `booker_ta` → Travel Agency (deterministic default if multiple)
- **Staff override / clear wins** over prefill.
- Changing guest re-runs prefill **unless** staff already overrode (one honest rule — Eng confirms; do not silently thrash staff choice).

### 3.4 Persist on create

- On successful Individual create, persist selected masters via existing optional writer/RPC params:
  - `company_master_id` ← selected Company (or null)
  - `travel_agent_master_id` ← selected TA (or null)
- Path: `createReservation` → `create_hotel_reservation_priced` (0059). Non-prod already PASS; **prod Abel-gated**.
- **Eng confirms dual-bind:** product allows **both** optional on one Individual stay. CURRENT code/RPC **rejects** both non-null. Expected: lift XOR for this path (or equivalent atomic persist of both columns) so create can bind Company **and** TA together when staff selected both. Fail closed — no silent half-success.
- Detail amend via `setReservationGuestMasters` remains.

### 3.5 Type mode

- Prefer Individual = full create with Associations **always visible**.
- Individual / Corporate / TA chrome **may remain** for later Corporate-as-entry work, but **must not hide** Company/TA on Individual.
- This Spec does **not** redesign Corporate/TA exclusive modes beyond ensuring Individual Associations are not gated by them.

---

## 4. Out of this amend (locked)

- Group picker / block / allotment / rooming / **CR-100**
- Contact / Member type unless a real **CURRENT** master/link type exists (do **not** invent)
- Corporate-as-separate-product / Group-as-separate-product (future)
- Reopening Guest GE1–GE3; claiming Phase 1 or Create Reservation **DONE**
- Reopening [#127](https://github.com/NORUDEVGIT/NORU/issues/127) / rewriting AC-CR2-1…18 as failed
- Credit engine; stay/rate/room/guarantee ownership (other sections)
- Email / SMS; LIVE OTA; commission; new entitlement / RLS **architecture**
- Cloning legacy PMS chrome

---

## 5. Acceptance criteria (AC-CR2A)

| ID | Criterion |
|---|---|
| **AC-CR2A-1** | On **Individual** Create Reservation, an **Associations** box is **always visible** with optional **Company** and optional **Travel Agency** pickers (neither required) |
| **AC-CR2A-2** | Company picker reuses GE1 masters (`listGuestAccounts` `accountType: "company"`) + inline **Create Company** via existing `GuestCompanyFormDialog`; save **auto-selects** |
| **AC-CR2A-3** | Travel Agency picker reuses GE3 masters + inline **Create TA** via existing `GuestTravelAgentFormDialog`; save **auto-selects** |
| **AC-CR2A-4** | Prefill from guest↔Company/TA links (`listGuestAccountLinks` — `employer` / `booker_ta`); staff can **clear** / **override**; override wins |
| **AC-CR2A-5** | Selected masters persist on create via existing optional `company_master_id` / `travel_agent_master_id` on `createReservation` → `create_hotel_reservation_priced` (0059 path) |
| **AC-CR2A-6** | Individual mode **must not hide** Company/TA. Type chrome may remain for later Corporate entry but does not gate Associations visibility on Individual |
| **AC-CR2A-7** | NORU layout: Associations is its **own box**; placement may be beside Guest (Consignee-position reference). **Do not** clone legacy UI chrome |
| **AC-CR2A-8** | **No** Group / block / allotment / rooming / **CR-100** on this create surface. **No** Contact/Member invent |
| **AC-CR2A-9** | **No** second Company/TA table or API. Reuse GE1/GE3 dialogs + `listGuestAccounts` / `createGuestAccount` / `listGuestAccountLinks` |
| **AC-CR2A-10** | Permission gates preserved (`pms` + reservation/guest manage). **No** new entitlement / RLS **model**. Flag Abel if model must change |
| **AC-CR2A-11** | Does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) or claim AC-CR2-1…18 failed. Prior Section 2 lock stands; this is Additive **AC-CR2A** only |
| **AC-CR2A-12** | Does **not** claim Phase 1 or Create Reservation **DONE**. Guest GE1–GE3 stay closed |
| **AC-CR2A-13** | Migration honesty: **no new reservation columns**. Eng **confirms** dual-bind (lift `DUAL_COMPANY_TA_NOT_ALLOWED` + Zod XOR) vs other atomic approach. Dual-lane APPLY HELD if SECURITY DEFINER RPC replaced. Prod 0059 remains Abel-gated until applied |
| **AC-CR2A-14** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product. Walk-in stays a mode of the same writer |
| **AC-CR2A-15** | Locked non-goals in §4 are **absent** |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): lock tests for AC-CR2A-1…15; browser Individual with 0 / Company-only / TA-only / **both** associations; verify row columns after create; regression Corporate/TA Section 2 behaviour and Section 1 guest chrome.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped; same-property master FKs; preserve FO / guest / reservation gates.
- Regression: GE1/GE3 create; detail `ReservationGuestMastersCard`; walk-in same writer; AC-CR2 Corporate/TA paths; prod 0059 Abel residual called out in Eng notes.

---

## 7. Open Eng confirm items

1. **Dual-bind on Individual:** lift RPC `DUAL_COMPANY_TA_NOT_ALLOWED` + `createReservation` Zod XOR + `mastersForCreateMode` so both optional IDs can persist together (**preferred**, matches columns + detail). Confirm APPLY lane if RPC replaced.
2. **UI placement:** Associations own box beside Guest vs under Context — Spec allows either NORU placement; Eng picks within Doc2 shell.
3. **Corporate/TA chrome:** keep exclusive mode pickers as today vs eventual unify under Associations — out of scope to redesign; only Individual Associations required.
4. **Prefill on Individual:** enable links query when Individual; bind both employer + booker_ta independently; override rule (keep vs warn+re-prefill).
5. **Prod 0059:** already Abel-gated from #127; any dual-bind RPC follow-up is a **separate** APPLY decision — do not silently apply prod.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan approval |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Relates | Upcoming **new** Eng issue — **not** #127 reopen |
| Prior Section 2 | Spec #126 / delivery #132 / #127 **CLOSED** OPERATIONALLY ACCEPTED — **stands** |
| Migration | Columns + 0059 params exist; **Eng confirms** dual-bind follow-up. Prod 0059 Abel-gated residual |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
