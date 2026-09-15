# Create Reservation — Individual Associations (Section 2 amend follow-up)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation — **Individual Associations** (optional Company + Travel Agency on Individual create) |
| **KIND** | **Follow-up amend** to Phase 1 **Section 2** — **Individual only** |
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 (Associations amend only) |
| **ENGINEERING STATUS** | **PASS** — delivery [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED (`c1a236d447bdef07e48643494bb91a3877a225bf`, AK21ER @ 2026-09-15T13:52:05Z). Independent QA **PASS**. Do **not** claim LIVE / Phase 1 COMPLETE |
| **Issue** | [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** completed — OPERATIONALLY ACCEPTED. **Do not reopen** [#127](https://github.com/NORUDEVGIT/NORU/issues/127) |
| **Prior lock (do not reopen)** | Section 2 Spec [#126](https://github.com/NORUDEVGIT/NORU/pull/126) · delivery [#132](https://github.com/NORUDEVGIT/NORU/pull/132) MERGED · CURRENT recon [#134](https://github.com/NORUDEVGIT/NORU/pull/134) · [#127](https://github.com/NORUDEVGIT/NORU/issues/127) **CLOSED** / **OPERATIONALLY ACCEPTED** — AC-CR2-1…18 stand as prior lock; this amend does **not** rewrite them as failed |
| **AC series** | **AC-CR2A-1…15** — locks **PASS** (#139) |
| **Migration** | `0060_pms_create_reservation_individual_associations` — **non-prod APPLY PASS** (version `20260915134818`, project `qcwptraosaudcbjasmul`): dual-bind lift on `create_hotel_reservation` body only (signature unchanged; 0059 optional master-id params). Prerequisite **0059** present (`20260915125648`). Dual-bind verified. **Prod 0060 / 0059 Abel-gated residual NOT applied**. New columns **NONE**; RLS **UNCHANGED** |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen. Reuse GE1 Company + GE3 TA pickers / dialogs / list APIs |
| **Phase 1 / module COMPLETE** | **NO** — Associations amend only; does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-individual-associations-programme.md`](../create-reservation-individual-associations-programme.md) |
| **Sibling Section 2** | [`create-reservation-phase1-section2.md`](./create-reservation-phase1-section2.md) — OPERATIONALLY ACCEPTED / #127 **CLOSED**. This amend does **not** reopen that verdict |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik PRODUCT AMEND LOCKED 2026-09-15** via Hospitality Product Advisor.
>
> This is a **follow-up amend** to Section 2 for **Individual** create only. **Do not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) closure or the OPERATIONALLY ACCEPTED verdict. Prior AC-CR2-1…18 remain the Section 2 lock; new work uses **AC-CR2A-***.
>
> Additive expansion of the **existing** `/restaurant/bookings/new` surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER **IMPLEMENTATION PASS** + Rekik **formal closure YES** (Associations amend only, #139 MERGED). Spec docs baseline [#137](https://github.com/NORUDEVGIT/NORU/pull/137). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** completed / **OPERATIONALLY ACCEPTED**. Does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127). Does **not** claim Phase 1 or Create Reservation DONE.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Section 1–2) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (0059 optional master-id path; 0060 dual-bind body) |
| Change | On **Individual**, **always** show an **Associations** box with optional Company + optional Travel Agency |
| Masters | Reuse GE1 `GuestCompanyFormDialog` / GE3 `GuestTravelAgentFormDialog` + `listGuestAccounts` / `createGuestAccount` / `listGuestAccountLinks` — **no parallel writers** |
| Type chrome | Corporate / TA exclusive pickers **remain** in Context; they **do not** hide Associations on Individual |
| Prior Section 2 | Corporate → Company only; Travel Agency → TA only; **Individual hid both** (AC-CR2-3). This amend changes **Individual** only — #127 / AC-CR2-1…18 **stand** |

---

## 1. Evidence paths (code wins — post-#139 on `main`)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Individual mounts `CreateReservationAssociations` beside Guest; prefill `employer` + `booker_ta`; `mastersForCreateMode`; sticky `summary-associations`; create mutation |
| Associations box | `src/packages/pms/components/bookings/create-reservation-associations.tsx` — own NORU card; optional Company + TA via `CreateReservationMasterPicker` |
| Context chrome | `src/packages/pms/components/bookings/create-reservation-context.tsx` — Company picker when `reservationType === "corporate"`; TA when `"travel_agency"`; **does not** mount Associations (Individual box lives on the route) |
| Master picker | `src/packages/pms/components/bookings/create-reservation-master-picker.tsx` — GE1 / GE3 dialogs + `listGuestAccounts` |
| Section helpers | `src/packages/pms/lib/create-reservation-phase1.ts` + `create-reservation-phase1.test.ts` — `mastersForCreateMode("individual", …)` passes **both** optional IDs; `createReservationPrefillRoles("individual")` → `employer` + `booker_ta`; **AC-CR2A-1…15 PASS** |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` optional `companyMasterId` / `travelAgentMasterId`; **Zod XOR removed** (both allowed) |
| RPC (0060) | `supabase/migrations/0060_pms_create_reservation_individual_associations.sql` (+ drizzle twin) — replaces `create_hotel_reservation` body; **lifts** `DUAL_COMPANY_TA_NOT_ALLOWED`; signature unchanged (0059 params). `create_hotel_reservation_priced` already forwards both |
| RPC (0059) | `supabase/migrations/0059_pms_create_reservation_company_ta.sql` — optional `_company_master_id` / `_travel_agent_master_id` (still required first). Non-prod PASS; **prod Abel-gated** |
| Columns | `hotel_reservations.company_master_id`, `travel_agent_master_id` (Wave 4 / `0053`) — both nullable; **no new columns** |
| Guest links | `listGuestAccountLinks` — roles include `employer` (company) and `booker_ta` (travel_agent) |
| GE1 / GE3 | `guest-company-form-dialog.tsx` / `guest-travel-agent-form-dialog.tsx` |
| Access | `requireRoutePackage("pms")` + `requireReservationManager` / guest-manage on master list/create |

---

## 2. CURRENT (code wins — post #139)

- [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED (`c1a236d447bdef07e48643494bb91a3877a225bf`). Independent QA **PASS**. Eng DER **IMPLEMENTATION PASS** (Associations amend only). [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** completed / OPERATIONALLY ACCEPTED (Rekik formal closure YES 2026-09-15).
- [#127](https://github.com/NORUDEVGIT/NORU/issues/127) stays **CLOSED** / OPERATIONALLY ACCEPTED. Section 2 Spec CURRENT recon [#134](https://github.com/NORUDEVGIT/NORU/pull/134) still records the **#127 Individual-hide baseline** (AC-CR2-3). This amend **supersedes Individual hide only** — it is **not** a Section 2 reopen and does **not** rewrite AC-CR2-1…18 as failed.
- Type mode Individual \| Corporate \| Travel Agency is LIVE.
- **Individual:** `CreateReservationAssociations` is **always** mounted (`reservationType === "individual"`) as its **own box beside Guest** (`lg:grid-cols-2`). Optional Company + optional TA pickers; neither is required (`canSubmit` does not depend on masters). Sticky summary shows Company / TA or **None** (`summary-associations`).
- **Corporate / TA exclusive chrome remains** in `create-reservation-context.tsx` (Company-only / TA-only). Those modes do **not** hide the Individual Associations box (the box is Individual-only).
- **Prefill on Individual:** `createReservationPrefillRoles("individual")` → `employer` + `booker_ta` independently via `listGuestAccountLinks` / `pickPrefillMasterId` (most recent + `masterId` tie-break). **Staff override / clear wins**; guest change **keeps** a staff-chosen Company or TA (`CREATE_RESERVATION_MASTER_OVERRIDE_RULE`).
- **`mastersForCreateMode("individual", …)`** returns both selected optional IDs (no longer nulls). Corporate still Company-only; Travel Agency still TA-only.
- **Persist:** `createReservation` passes optional `_company_master_id` / `_travel_agent_master_id` into `create_hotel_reservation_priced`. **Dual bind allowed** on Individual — Zod XOR **removed**; 0060 RPC body **no longer** raises `DUAL_COMPANY_TA_NOT_ALLOWED`. Fail-closed if only 0059 is live on a given environment.
- Inline create → auto-select (GE1 / GE3), payment-terms read-only, type-switch warn + clear masters: LIVE (Section 2 paths unchanged).
- Detail `setReservationGuestMasters` still available for amend / late link (both columns).
- **Walk-in:** still uses the same `createReservation` writer from Front Office (params omitted → masters null).
- **Migration:** non-prod **0060 APPLY PASS** (`20260915134818` / `pms_create_reservation_individual_associations` on `qcwptraosaudcbjasmul`); prerequisite **0059** present (`20260915125648`); dual-bind lift verified. **Prod 0060 / 0059 Abel-gated NOT applied**. New columns **NONE**. RLS **UNCHANGED** (Flag Abel: NOT required).
- **Corporate / Group as separate products:** still later. No Group / Contact / Member / CR-100 invent on this surface.
- Guest GE1–GE3 stay closed. Phase 1 / Create Reservation DONE = **NO**.

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#137](https://github.com/NORUDEVGIT/NORU/pull/137) EXPECTED AC-CR2A-1…15 remain the acceptance baseline; delivery [#139](https://github.com/NORUDEVGIT/NORU/pull/139) matched locks **15/15** (+ AC-CR2-1…18 Corporate/TA + Section 1 regression PASS). Independent QA **PASS**.
- **No DOCUMENTATION / IMPLEMENTATION DISCREPANCY** on AC-CR2A behaviour — code matches the authorized EXPECTED (Associations always on Individual; GE reuse; prefill/override; persist both; dual-bind lifted; same route/writer; non-goals absent).
- Residual **apply** (not a product-gap): **prod 0060 / 0059 Abel-gated**. Lock-file constants still say `CREATE_RESERVATION_SECTION2A_APPLY = "HELD"` (impl-time APPLY HELD honesty) while **non-prod 0060 is APPLY PASS** — docs CURRENT uses the apply report, not the lock constant.
- Residual **polish** (visible on `main`; **out of #138 scope** — do not reopen this amend): `src/routes/restaurant/bookings/new.tsx` uses `cn(...)` for the Guest/Associations grid without importing `cn`. May land as a separate tsc polish. Does **not** change AC-CR2A-7 (own box beside Guest is LIVE).
- Pre-existing Stay / availability / rate / room / details UI on the same page **remains**. This Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED). Does **not** reopen #127. Does **not** claim Phase 1 COMPLETE.

---

## 3. EXPECTED — Individual Associations (authorized baseline — delivered)

### 3.1 Change vs Section 2 (Individual only) — **delivered**

| | **OLD (Section 2 / AC-CR2-3 — #127 lock, stands)** | **NEW (this amend — delivered)** |
|---|---|---|
| Individual | Company/TA pickers **hidden**; no prefill; no persist from create chrome | **Always** show **Associations** box with optional Company + optional TA |
| Corporate / TA modes | Company-only / TA-only (unchanged by this Spec unless Eng keeps chrome) | Exclusive Context pickers **remain**; **must not** be the reason Individual hides Associations |

### 3.2 Associations box (Individual) — **delivered**

- Always visible when reservation type is **Individual** (default create path).
- Optional **Company** picker — reuse existing `CreateReservationMasterPicker` / GE1 `listGuestAccounts({ accountType: "company" })` + inline **Create Company** → `GuestCompanyFormDialog` → **auto-select**.
- Optional **Travel Agency** picker — reuse GE3 path + `GuestTravelAgentFormDialog` → **auto-select**.
- Staff may **clear** or **override** either picker independently.
- Neither Company nor TA is **required** on Individual to create.
- NORU layout: Associations is its **own box** **beside Guest** (`lg:grid-cols-2` + sticky Associations summary). **Do not** clone legacy UI chrome.

### 3.3 Prefill + override — **delivered**

- When a guest is selected on Individual, prefill from `listGuestAccountLinks`:
  - `employer` → Company (most recent; `masterId` tie-break)
  - `booker_ta` → Travel Agency (same rule, independently)
- **Staff override / clear wins** over prefill.
- Changing guest re-runs prefill **unless** staff already overrode (keep staff choice — `CREATE_RESERVATION_MASTER_OVERRIDE_RULE`).

### 3.4 Persist on create — **delivered**

- On successful Individual create, persist selected masters via existing optional writer/RPC params:
  - `company_master_id` ← selected Company (or null)
  - `travel_agent_master_id` ← selected TA (or null)
- Path: `createReservation` → `create_hotel_reservation_priced` (0059 params). Non-prod 0059 + **0060** PASS; **prod Abel-gated**.
- **Dual-bind:** lifted (preferred). Zod XOR removed; `mastersForCreateMode` passes both; 0060 RPC body no longer raises `DUAL_COMPANY_TA_NOT_ALLOWED`. Fail closed if only 0059 is live.
- Detail amend via `setReservationGuestMasters` remains.

### 3.5 Type mode — **delivered / honoured**

- Individual = full create with Associations **always visible**.
- Individual / Corporate / TA chrome **remains** for later Corporate-as-entry work and does **not** hide Company/TA on Individual.
- This Spec does **not** redesign Corporate/TA exclusive modes beyond ensuring Individual Associations are not gated by them.

---

## 4. Out of this amend (locked — still out)

- Group picker / block / allotment / rooming / **CR-100**
- Contact / Member type unless a real **CURRENT** master/link type exists (do **not** invent)
- Corporate-as-separate-product / Group-as-separate-product (future)
- Reopening Guest GE1–GE3; claiming Phase 1 or Create Reservation **DONE**
- Reopening [#127](https://github.com/NORUDEVGIT/NORU/issues/127) / rewriting AC-CR2-1…18 as failed
- Credit engine; stay/rate/room/guarantee ownership (other sections)
- Email / SMS; LIVE OTA; commission; new entitlement / RLS **architecture**
- Cloning legacy PMS chrome

---

## 5. Acceptance criteria (AC-CR2A) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR2A-1** | On **Individual** Create Reservation, an **Associations** box is **always visible** with optional **Company** and optional **Travel Agency** pickers (neither required) | **PASS** (#139) |
| **AC-CR2A-2** | Company picker reuses GE1 masters (`listGuestAccounts` `accountType: "company"`) + inline **Create Company** via existing `GuestCompanyFormDialog`; save **auto-selects** | **PASS** (#139) |
| **AC-CR2A-3** | Travel Agency picker reuses GE3 masters + inline **Create TA** via existing `GuestTravelAgentFormDialog`; save **auto-selects** | **PASS** (#139) |
| **AC-CR2A-4** | Prefill from guest↔Company/TA links (`listGuestAccountLinks` — `employer` / `booker_ta`); staff can **clear** / **override**; override wins | **PASS** (#139) |
| **AC-CR2A-5** | Selected masters persist on create via existing optional `company_master_id` / `travel_agent_master_id` on `createReservation` → `create_hotel_reservation_priced` (0059 path) | **PASS** (#139) |
| **AC-CR2A-6** | Individual mode **must not hide** Company/TA. Type chrome may remain for later Corporate entry but does not gate Associations visibility on Individual | **PASS** (#139) |
| **AC-CR2A-7** | NORU layout: Associations is its **own box**; placement may be beside Guest (Consignee-position reference). **Do not** clone legacy UI chrome | **PASS** (#139) |
| **AC-CR2A-8** | **No** Group / block / allotment / rooming / **CR-100** on this create surface. **No** Contact/Member invent | **PASS** (#139) |
| **AC-CR2A-9** | **No** second Company/TA table or API. Reuse GE1/GE3 dialogs + `listGuestAccounts` / `createGuestAccount` / `listGuestAccountLinks` | **PASS** (#139) |
| **AC-CR2A-10** | Permission gates preserved (`pms` + reservation/guest manage). **No** new entitlement / RLS **model**. Flag Abel if model must change | **PASS** (#139) |
| **AC-CR2A-11** | Does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127) or claim AC-CR2-1…18 failed. Prior Section 2 lock stands; this is Additive **AC-CR2A** only | **PASS** (#139) |
| **AC-CR2A-12** | Does **not** claim Phase 1 or Create Reservation **DONE**. Guest GE1–GE3 stay closed | **PASS** (#139) |
| **AC-CR2A-13** | Migration honesty: **no new reservation columns**. Dual-bind lift confirmed (`DUAL_COMPANY_TA_NOT_ALLOWED` + Zod XOR). Dual-lane 0060: non-prod **APPLY PASS**; **prod 0060 / 0059 Abel-gated**. RLS unchanged | **PASS** (#139) |
| **AC-CR2A-14** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product. Walk-in stays a mode of the same writer | **PASS** (#139) |
| **AC-CR2A-15** | Locked non-goals in §4 are **absent** | **PASS** (#139) |

Full AC text remains the #137 baseline. Do **not** reopen Guest GE; do **not** claim Phase 1 DONE; do **not** reopen #127. #138 is **CLOSED** / OPERATIONALLY ACCEPTED.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **IMPLEMENTATION PASS** (Associations amend only) — #139 MERGED 2026-09-15 (`c1a236d447bdef07e48643494bb91a3877a225bf`). Independent QA **PASS**. Locks **AC-CR2A-1…15 PASS** (+ AC-CR2-1…18 + Section 1 regression PASS). Combined create-reservation lock suite recorded 99 pass / 0 fail at READY FOR REKIK CHECK. `tsc --noEmit` PASS on the impl PR.
- Security: staff-only; tenant-scoped; same-property master FKs; existing FO / guest / reservation gates preserved; 0060 replaces SECURITY DEFINER `create_hotel_reservation` body only (Abel-approved path); **no** new RLS policies. Flag Abel: **NOT** required.
- Regression: GE1/GE3 create; detail `ReservationGuestMastersCard`; walk-in same writer; AC-CR2 Corporate/TA exclusive paths; Section 1 guest chrome; Guest GE closed.
- Migration: non-prod **0060 APPLY PASS** (`20260915134818`); prerequisite 0059 present; dual-bind lift verified. **Prod 0060 / 0059 Abel-gated NOT applied** (residual).
- Browser (impl PR): **NOT RUN ≠ PASS** (no staff credentials in that agent). Independent QA is the recorded IQ lane.
- Issue [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).
- **#127** stays **CLOSED** completed (OPERATIONALLY ACCEPTED).

---

## 7. Eng confirm items (resolved in #139)

| Item | Resolution |
|---|---|
| Dual-bind on Individual | **Lifted** — Zod XOR removed; `mastersForCreateMode("individual")` passes both; 0060 RPC body no longer raises `DUAL_COMPANY_TA_NOT_ALLOWED`. Signature unchanged (0059 params). Fail-closed if only 0059 is live |
| UI placement | Associations **own box beside Guest** (`lg:grid-cols-2`) + sticky Associations summary. Doc2 shell; no legacy chrome |
| Corporate/TA chrome | Exclusive Context pickers **kept**. They do **not** gate Individual Associations. Unify under Associations = later |
| Prefill on Individual | Links query enabled; `employer` + `booker_ta` independently; staff override wins; guest change **keeps** staff choice |
| Prod apply | **0059 + 0060 Abel-gated** — do not silently apply prod. Non-prod 0060 **APPLY PASS** (`20260915134818`) |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** (#138 CLOSED) |
| ENGINEERING | **PASS** (#139 MERGED) |
| Implemented / PASS (Associations amend) | **Yes** (DER + Rekik formal closure YES) |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Independent QA | **PASS** (Rekik) |
| Migration | Non-prod 0060 **PASS** (`20260915134818` / `qcwptraosaudcbjasmul`; 0059 present; dual-bind verified). **Prod 0060 / 0059 Abel-gated NOT applied**. New columns **NONE**; RLS **UNCHANGED** |
| Prior Section 2 | Spec #126 / delivery #132 / recon #134 / #127 **CLOSED** OPERATIONALLY ACCEPTED — **stands** |
| Issue #138 | **CLOSED** completed — OPERATIONALLY ACCEPTED |
| Issue #127 | **CLOSED** completed — do **not** reopen |
| Guest GE1–GE3 | **CLOSED** — reuse only |
| Create Reservation DONE | **NO** |
| Corporate / Group as products | **Later** — not this amend |
