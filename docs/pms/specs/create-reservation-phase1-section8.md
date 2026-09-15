# Create Reservation — Phase 1 Section 8 (Packages — conditional / GATE)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 8: Packages (conditional / GATE) |
| **STATUS** | **IMPLEMENTATION PASS** (Section 8 GATE only) — Eng DER PASS 2026-09-15. Awaiting Outcome Review / Rekik formal closure. Do **not** claim OPERATIONALLY ACCEPTED / CLOSED |
| **ENGINEERING STATUS** | **PASS** for Section 8 GATE — delivery [#154](https://github.com/NORUDEVGIT/NORU/pull/154) MERGED (`e891f5c13157a5383056ec124d194400548ffef8` by AK21ER @ 2026-09-15T14:34:34Z) |
| **Issue** | [#151](https://github.com/NORUDEVGIT/NORU/issues/151) **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED / LIVE / Phase 1 COMPLETE |
| **Catalog finding (LOCKED)** | **Setup stay-package catalogue EXISTS.** **Create bind + `quoteStay` package lines DO NOT EXIST.** **GATE** detect + honesty box only — no attach / no fake sticky totals |
| **Migration** | **NONE** (DER). Setup `pms_packages` already exists (0049). `createReservation` → `create_hotel_reservation_priced` has no package arg. `hotel_reservations` has no package column. `quoteStay` / `price_hotel_stay` are room-plan only. Dual-lane APPLY **N/A** (SECURITY DEFINER create/pricing RPCs were **not** replaced). RLS **UNCHANGED**. Flag Abel **NOT** required. No new package pricing engine |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 8 GATE only; attach still **OUT**. This section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section8-programme.md`](../create-reservation-phase1-section8-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). [`create-reservation-phase1-section5.md`](./create-reservation-phase1-section5.md) owns Rate + sticky **room** pricing. [`create-reservation-phase1-section6.md`](./create-reservation-phase1-section6.md) owns Room assign. Section 7 Guarantee / Confirm chrome remains a later section. Individual Associations [#139](https://github.com/NORUDEVGIT/NORU/pull/139) shipped |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER **PASS** (#154 MERGED) and Rekik Independent QA **PASS**. Spec docs baseline [#149](https://github.com/NORUDEVGIT/NORU/pull/149) (may still be open/draft). **#151 remains OPEN** until Outcome Review / formal closure. Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → **8 Packages GATE (THIS — IMPLEMENTATION PASS / #151 OPEN)**.
>
> **Programme rule (LOCKED):** Reference Individual create **packages** function + **modern NORU UI** **if CURRENT supports**. Create bind / quote **do not**. Detect Setup catalogue. **Do not** clone legacy chrome. **Do not** invent a catalog or a pricing engine.
>
> **Server / RPC remains source of truth.** Sticky stay total stays Section 5 `quoteStay` / `price_hotel_stay` (room nights). Do **not** add invented package lines to that total.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Sections 1–7) |
| Writer **unchanged** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). **No** package argument — **not added** |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Own **Packages** gated honesty box (`CreateReservationPackages`) — detect only. Modern NORU, not legacy clone. Doc2 shell / sidebar collapse from Section 1 unchanged |
| Catalog source | Setup SET3 `pms_packages` via CURRENT `getPmsSet3Snapshot` (`packagesAvailable` + active count). **Not** commercial NORU product entitlements. **Not** FO `fo_service_catalogue` extras |
| Quote | CURRENT `quoteStay` / `price_hotel_stay` remain **room-rate only**. Package lines = **not in quote**. Sticky stays honest |
| Bind | **GATE / OUT** — CURRENT writer/RPC has **no** package persist path. No column, junction, or second writer |
| Confirm honesty | Hard Confirm / Guarantee chrome may live in **Section 7**. Section 8 does **not** inject a fake package total |

### 0.1 Catalog existence check (code wins — LOCKED 2026-09-15)

Section 8 is **conditional** on a **real** Setup packages/extras catalog **and** CURRENT create support (list/select that can bind; quote lines only if `quoteStay` already prices them). Researched on `main` and **unchanged** after #154:

| Check | Result | Evidence |
|---|---|---|
| Setup stay-package **table** | **EXISTS** | `public.pms_packages` — `supabase/migrations/0049_pms_set3_rates_guest_rules.sql` (+ drizzle twin). Columns: `id`, `restaurant_id`, `type`, `code`, `name`, `active`, `inclusion` (jsonb **string labels**, **no amount**). Types: `accommodation` \| `business` \| `romantic` \| `conference` \| `custom` |
| Setup **UI** | **EXISTS** | `/restaurant/settings` → `PmsSet1Hub` → `Set3RatesSection` (`src/packages/pms/components/settings/pms-set3-section.tsx`). Add / edit / activate packages |
| Setup list / save | **EXISTS** (server fns, **not** SECURITY DEFINER RPCs) | `loadSet3Snapshot` / `getPmsSet3Snapshot` / `savePmsPackage` in `pms-set3-rates-guest.functions.ts`. Missing 0049 → `packagesAvailable: false` (never crash) |
| Package **RPCs** for create/quote | **DOES NOT EXIST** | No `list_packages_for_stay`, no package args on `price_hotel_stay` / `create_hotel_reservation_priced` |
| `quoteStay` package lines | **DOES NOT EXIST** | `quoteStay` lists `hotel_rate_plans` then `price_hotel_stay(_restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure)`. `StayQuote` = plan + nights + `subtotal` + nightly rates — **no package array** |
| Create **bind** | **DOES NOT EXIST** | `createReservation` Zod has no package field. `create_hotel_reservation_priced` Args have no `_package_id`. `hotel_reservations` Row has **no** `package_id` / meal-plan / extras FK. **No** reservation↔package junction table |
| Stay-context filter | **DOES NOT EXIST** | `pms_packages` is property-scoped (no room type, dates, or occupancy applicability) |
| FO extras table | **EXISTS** but **wrong product** | `fo_service_catalogue` (0045) + FO Amend “Add Service”. **No** Settings package editor. **Not** on `/restaurant/bookings/new`. **OUT** |
| Meal-plan sibling | **EXISTS** as SET3 `pms_meal_plans` | Setup only; **no** create bind / quote. **OUT** of Section 8 (not stay packages) |
| Commercial NORU packages | **Irrelevant** | `restaurant_package_entitlements` / PMS vs POS — not hotel stay packages |

**Decision: GATE** (not full EXPECTED list/select/sticky/bind). #154 shipped **detect + honesty only**. Attach remains **OUT**.

Full EXPECTED list/select/bind applies **only** when the Setup catalog exists **and** CURRENT create can bind via the **same** writer **and** (for priced sticky lines) CURRENT quote already includes packages. Setup catalogue **exists**. Create bind **does not**. Quote lines **do not**. Shipping a picker that cannot persist, or a sticky package total that `quoteStay` does not produce, would be **fake packages**. Inventing bind (new column + SECURITY DEFINER RPC) or a package pricing engine is **OUT**.

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — mounts `CreateReservationPackages` after Room assign; `useQuery` `["pms-set3-snapshot", restaurantId, "create-reservation-packages"]` via `getPmsSet3Snapshot`; sticky `summary-packages` / `summary-packages-honesty`; `canSubmitCreateReservation` does **not** require a package |
| Packages UI | `src/packages/pms/components/bookings/create-reservation-packages.tsx` — `CreateReservationPackages` visible gated box (`data-testid="create-reservation-packages-gate"`); detect attribute; **Not attached** badge; Settings link SET3 editors only |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1-section8.ts` + `create-reservation-phase1-section8.test.ts` (**AC-CR8-1…22 PASS**) |
| Detect | `detectCreatePackagesCatalog` / `resolveCreatePackagesGateView` — `packagesAvailable` + `activePackageCountFromRows`. No parallel catalog API |
| Detect API | `getPmsSet3Snapshot` in `pms-set3-rates-guest.functions.ts` — `packagesAvailable` + `packages[]`; `canEdit: canEditSet1(role)` |
| Writer | `createReservation` — Zod: guest, stay, room type, optional room, optional `ratePlanId`, optional Company/TA masters. **No** package id |
| RPC (priced) | `create_hotel_reservation_priced` — stay + `_rate_plan_id` + optional `_company_master_id` / `_travel_agent_master_id`. **No** package arg |
| Reservation row | `hotel_reservations` — `rate_plan_id`, `room_subtotal`, `nightly_rate_snapshot`, `room_id`, … **No** package column |
| Quote | `src/packages/pms/lib/rates.functions.ts` — `quoteStay`. `StayQuote` in `rates.server.ts` — **no** package array |
| Pricing RPC | `price_hotel_stay` — five args (property, plan, room type, arrival, departure) |
| Setup table | `supabase/migrations/0049_pms_set3_rates_guest_rules.sql` — `pms_packages`. Comment: “Empty is a Warning, not a go-live block.” |
| Setup snapshot | `src/packages/pms/lib/pms-set3-rates-guest.ts` — `PmsPackage`, `SET3_PACKAGES_WARNING`, `SET3_RATES_UNAVAILABLE`, `packagesAvailable` |
| Setup UI | `src/packages/pms/components/settings/pms-set3-section.tsx` — Packages list under Rates & meal plans |
| Settings route | `src/routes/restaurant/settings.tsx` — PMS entitlement → `PmsSet1Hub` |
| FO extras (OUT) | `fo_service_catalogue` + `loadServiceCatalogue` in `fo-amendments.functions.ts`; UI `fo-amend-sheet.tsx` “Add Service” |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` (`owner` \| `manager` \| `receptionist`) + `requireRoutePackage("pms")` |
| Phase 1 lock | `CREATE_RESERVATION_LOCKED_NON_GOALS` includes **“fake packages”** (`create-reservation-phase1.ts`) |

---

## 2. CURRENT (code wins — post #154)

- `/restaurant/bookings/new` shows a **Packages** gated honesty card (`CreateReservationPackages`) after the Room assignment card. **Visible gated box** (TIP pick 1 — not omit-only). Badge: **Not attached**.
- **Detect reuses CURRENT SET3 snapshot.** Query: `getPmsSet3Snapshot` with key `["pms-set3-snapshot", restaurantId, "create-reservation-packages"]` once `canManage`. **No** parallel catalog RPC (`CREATE_RESERVATION_PACKAGES_DETECT_API = getPmsSet3Snapshot`). States:
  - `packagesAvailable === false` → **schema missing** — SET3 `SET3_RATES_UNAVAILABLE` + “Create is allowed without a package.”
  - `packagesAvailable === true` and **no** active rows → **empty** — `SET3_PACKAGES_WARNING` + create-allowed copy
  - `packagesAvailable === true` and **active** rows → **active-not-attached** — “Packages are not attached on create and are not in this quote. Create is allowed without a package.”
  - Loading / error wrap the same detect (honest “Checking stay packages…” / “Stay packages could not be checked. Create is allowed without a package.”)
- **No selectable attach.** No checkboxes, multi-pick, quantity, or package picker. Active count is used for **detect only** — the box does **not** list package names as if they were bound. No FO extras / meal plans / sample rows as packages.
- **Settings deep-link:** “Open Settings packages” → `/restaurant/settings#rates` **only** when `canEditSet1` (`owner` \| `manager`). Receptionist honesty: **omit** the link (no silent denied editor).
- **Create does not persist a package.** Same writer; RPC; reservation row — all package-free. Payload has no `packageId`. Notes / special-requests are **not** used as a fake bind (`CREATE_RESERVATION_PACKAGES_BIND = out`).
- **`quoteStay` does not take or return packages.** Sticky stay total (Section 5) remains the room-plan `subtotal` only. Sticky adds an honest **Packages** line after Stay total: “Packages not attached on create — not in this quote.” **No** invented `0.00` / client-sum package amount. Section 5 rate/total and Section 6 Room / Unassigned lines are **unchanged**.
- **`canSubmitCreateReservation` does not require a package.** Unpriced Pending / Unassigned / Individual Associations rules from prior sections stand.
- **FO extras** stay Front Office Amend Add Service. **Meal plans** stay SET3 Settings. Neither is mounted on create.
- **No second create writer.** Walk-in remains `createReservation`.
- **DATABASE IMPACT:** **NONE**. No Section 8 migration file. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#149](https://github.com/NORUDEVGIT/NORU/pull/149) EXPECTED AC-CR8-1…22 remain the acceptance baseline; delivery [#154](https://github.com/NORUDEVGIT/NORU/pull/154) matched locks **22/22** (+ Section 1–6 / Associations locks still PASS on regression). Independent QA **PASS** (Rekik, pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered).
- **No DOCUMENTATION / IMPLEMENTATION DISCREPANCY:** Spec ACs that shipped are present in code. Honest notes (not discrepancies): loading / error views wrap the three catalog states; the gated box does not list package names (GATE — detect only); sticky Packages line sits **after** Stay total; Settings link copy is “Open Settings packages”; badge is always **Not attached**.
- Pre-existing Stay / Rate / Room / Details UI on the same page **remain**. Section 8 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE. Attach remains **OUT**.
- Issue [#151](https://github.com/NORUDEVGIT/NORU/issues/151) remains **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED.

---

## 3. EXPECTED — Packages (GATE — authorized baseline — delivered)

### 3.1 Catalog detect (required) — **delivered**

On Create Reservation, Eng **detects** Setup stay-package availability the same way SET3 already does (reuse `getPmsSet3Snapshot` / `loadSet3Snapshot` — **no** parallel catalog API):

| Detected state | Meaning |
|---|---|
| `packagesAvailable === false` | 0049 (or equivalent) **not** applied — schema missing |
| `packagesAvailable === true` and **no** active rows | Catalogue exists, empty (SET3 warning) |
| `packagesAvailable === true` and **active** rows | Setup catalogue has sellable **masters** — still **not** create-bound |

No invented rows. No sample packages seeded from this section.

### 3.2 List / select — GATE (not full EXPECTED) — **delivered**

- Reference Individual create **package pick** is in scope **only if** CURRENT can list from Setup **and** persist via the **current** writer.
- **CURRENT:** list exists in Setup; persist on create **does not**.
- Therefore Phase 1 Section 8: **no selectable attach** on `/restaurant/bookings/new`. No checkboxes / multi-pick / quantity that look bound.
- **Shipped:** a modern NORU **gated** Packages box with honest copy for the detected state (§3.1). Settings link only for SET3 editors (`canEditSet1`). Not required to create.
- Empty / missing schema: honest SET3 copy + create-allowed. Create **still allowed** (packages are not required).

### 3.3 Bind — GATE / OUT (CURRENT writer does not support) — **honoured**

- Persist on create **only** via CURRENT `createReservation` → `create_hotel_reservation_priced`.
- **CURRENT has no param / column / junction.** Bind is **OUT**. #154 did **not** add one.
- No post-insert package row from a second writer. No notes / `special_requests` smuggling. No SECURITY DEFINER create RPC replace to add `_package_id`.
- If product later wants bind: **new Spec** after a real persist path exists. That follow-up would likely be APPLY **HELD** (RPC replace) and must still **not** invent a pricing engine.

### 3.4 Sticky honesty (not in quote) — **delivered**

- CURRENT `quoteStay` / `price_hotel_stay` **do not** include package lines.
- Sticky does **not** add a package amount, `0.00` package total, or “included” money that the server quote does not contain.
- Sticky copy: **Packages not attached on create — not in this quote.** Section 5 room total stays the only stay total.
- Browser math for packages is **ignored** (there is no server package quote to display).

### 3.5 No fake packages / no invented engines — **honoured**

- Do **not** invent a stay-package catalog (do not alias FO extras or meal plans as packages).
- Do **not** invent a package pricing engine (do not parse `inclusion` into money; do not add package args to `price_hotel_stay`).
- Do **not** invent commission settlement, LIVE OTA/RMS package mapping, or email/SMS package confirmation.

### 3.6 Same writer / same route — **delivered**

- Same `/restaurant/bookings/new`. Walk-in remains a mode of `createReservation`.
- `canSubmit` does **not** require a package.
- Permission gates unchanged.

---

## 4. Out of Section 8 (locked — still out)

- **Selectable package attach** / persist / quote lines on create (CURRENT unsupported — GATE)
- Inventing `hotel_reservations.package_id`, a reservation-package junction, or package args on `create_hotel_reservation_priced` / `price_hotel_stay`
- Inventing a **package pricing engine** (amounts, tax, per-night package yield)
- **Meal plans on create** (`pms_meal_plans`) — sibling Setup catalogue; no bind
- **FO extras / Add Service** (`fo_service_catalogue`) — Front Office amend / cashiering, not create packages
- **Commercial NORU package entitlements** (PMS/POS/RM/Back Office)
- Commission settlement; LIVE OTA / RMS package mapping
- Email / SMS send confirmation
- **Guarantee + Confirm UI product** (Section 7) — do not inject fake package totals
- **Rate engine expand** (Section 5) — do not rewrite `quoteStay`
- **Room assign** (Section 6)
- Group / block / allotment / rooming / parent **Company Reservation CR-100**
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- New entitlement / RLS **architecture** without Abel flag
- Clone legacy PMS packages chrome
- Offline / local-first; second Create Reservation product

---

## 5. Acceptance criteria (AC-CR8) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR8-1…22** | As authorized in Spec #149 | **PASS** (#154) — GATE only |

Full AC text remains the #149 baseline; do not reopen Guest GE; do not claim Phase 1 DONE; do not invent attach/bind/pricing.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 8 GATE only (#154 MERGED 2026-09-15, SHA `e891f5c13157a5383056ec124d194400548ffef8`). Independent QA **PASS** (Rekik, pre-merge). `tsc` PASS; locks **AC-CR8-1…22 PASS** (+ AC-CR1 / AC-CR2 / AC-CR4 / AC-CR5 / AC-CR6 / Associations regression PASS). Browser **NOT RUN ≠ PASS** (IQ covered).
- Security: staff-only; tenant-scoped SET3 reads for detect; existing FO / reservation gates preserved; Settings link SET3 editors only (`canEditSet1`); **no** new SECURITY DEFINER; **no** new RLS policies.
- Regression: Sections 1–6 shell / stay / availability / Company-TA / Rate / Room / Associations (as shipped); walk-in same writer; `quoteStay` room-only; Guest GE closed; SET3 meal/package Setup; FO extras amend.
- Migration: **NONE**. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.
- **#151** remains **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED.

---

## 7. Eng confirm items (resolved in #154)

| Item | Resolution |
|---|---|
| Gated box vs omit | **Visible gated box** (`CREATE_RESERVATION_PACKAGES_BOX = visible-gated`) so detect ACs are testable |
| Detect API | Reuse **`getPmsSet3Snapshot`** (`packagesAvailable` + active count). **No** new catalog RPC |
| Settings deep-link | **SET3 editors only** (`canEditSet1` / owner\|manager). Receptionist: **omit** link |
| Follow-up bind Spec? | Bind stays **OUT**. No RPC replace. No column. No notes smuggling |
| Sticky compose with Section 5 / 6 | Honest “Packages not attached on create — not in this quote” **after** Stay total. Section 5 rate/total and Section 6 Room / Unassigned **kept** |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** (baseline [#149](https://github.com/NORUDEVGIT/NORU/pull/149); may still be open/draft). CURRENT recon on this file |
| ENGINEERING | **PASS** (#154) — Section 8 GATE only |
| Implemented / PASS (Section 8 GATE) | **Yes** (DER) |
| OPERATIONALLY ACCEPTED / LIVE / module COMPLETE / Phase 1 COMPLETE | **No** — Outcome Review pending |
| Issue #151 | **OPEN** until Outcome Review / Rekik formal closure. Do **not** claim CLOSED |
| Setup `pms_packages` catalogue | **EXISTS** (table + Settings UI + list/save fns) |
| Create list/select that binds | **DOES NOT EXIST** — **GATE** / attach **OUT** |
| `quoteStay` package lines | **DOES NOT EXIST** — sticky **not in quote** |
| Bind via CURRENT writer | **DOES NOT EXIST** — **GATE / OUT** |
| Migration | **NONE**. Dual-lane APPLY **N/A**. RLS **UNCHANGED**. Flag Abel **NOT** required |
| Invent catalog / pricing engine / commission / LIVE OTA | **OUT** |
| FO extras / meal plans on create | **OUT** |
| Guest GE1–GE3 | **Closed** — not reopened |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
