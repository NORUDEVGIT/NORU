# Create Reservation — Phase 1 Section 8 (Packages — conditional / GATE)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 8: Packages (conditional) |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Catalog finding (LOCKED)** | **Setup stay-package catalogue EXISTS.** **Create-usable package product (list/select that binds + quote lines) DOES NOT EXIST.** See §0.1. **GATE** the Create Reservation packages picker / bind / quote — do **not** fake packages |
| **Migration** | **LIKELY NONE.** No create bind column / RPC param exists to keep, and this section must **not** invent one. Dual-lane APPLY **N/A** unless Eng replaces SECURITY DEFINER `create_hotel_reservation` / `create_hotel_reservation_priced` / `price_hotel_stay` (then APPLY **HELD**; **flag Abel** if entitlement / RLS **model** must change). No new package pricing engine |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section8-programme.md`](../create-reservation-phase1-section8-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). [`create-reservation-phase1-section5.md`](./create-reservation-phase1-section5.md) owns Rate + sticky **room** pricing. Section 6 Spec ([#143](https://github.com/NORUDEVGIT/NORU/pull/143) / coding [#145](https://github.com/NORUDEVGIT/NORU/issues/145)) and Section 7 Spec drafting may run **in parallel — OK**. This section does **not** wait on them |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> **Programme rule (LOCKED):** Reference Individual create **packages** function + **modern NORU UI** **if CURRENT supports**. **Do not** clone legacy chrome. **Do not** invent a catalog or a pricing engine.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → 5 Rate + sticky pricing → 6 Room assign → 7 Guarantee + confirm → **8 Packages if catalog (THIS)**.
>
> **Server / RPC remains source of truth.** Sticky stay total stays Section 5 `quoteStay` / `price_hotel_stay` (room nights). Do **not** add invented package lines to that total.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Sections 1–7) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). **No** package argument today — **do not add one in this section** |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Own **Packages** box (modern NORU, not legacy clone) that **gates** attach. Honest detect copy. Doc2 shell / sidebar collapse from Section 1 unchanged |
| Catalog source | Setup SET3 `pms_packages` (table + Settings UI + `loadSet3Snapshot` / `savePmsPackage`). **Not** commercial NORU product entitlements. **Not** FO `fo_service_catalogue` extras |
| Quote | CURRENT `quoteStay` / `price_hotel_stay` are **room-rate only**. Package lines = **not in quote**. Sticky must stay honest |
| Bind | **GATE / OUT** — CURRENT writer/RPC has **no** package persist path. Do **not** invent a column, junction, or second writer |
| Confirm honesty | Hard Confirm / Guarantee chrome may live in **Section 7**. Section 8 must **not** inject a fake package total into Confirm |

### 0.1 Catalog existence check (code wins — LOCKED 2026-09-15)

Section 8 is **conditional** on a **real** Setup packages/extras catalog **and** CURRENT create support (list/select that can bind; quote lines only if `quoteStay` already prices them). Researched on `main`:

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

**Decision: GATE** (not full EXPECTED list/select/sticky/bind).

Full EXPECTED applies **only** when the Setup catalog exists **and** CURRENT create can bind via the **same** writer **and** (for priced sticky lines) CURRENT quote already includes packages. Setup catalogue **exists**. Create bind **does not**. Quote lines **do not**. Shipping a picker that cannot persist, or a sticky package total that `quoteStay` does not produce, would be **fake packages**. Inventing bind (new column + SECURITY DEFINER RPC) or a package pricing engine is **OUT**.

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Context, Guest, Associations, Stay, Room type, Rate, optional Room. **No** Packages card. **No** package state |
| Writer | `src/packages/pms/lib/reservations.functions.ts` — `createReservation` Zod: guest, stay, room type, optional room, optional `ratePlanId`, optional Company/TA masters. **No** package id |
| RPC (priced) | `create_hotel_reservation_priced` — Args in `src/integrations/supabase/types.ts`: stay + `_rate_plan_id` + optional `_company_master_id` / `_travel_agent_master_id`. **No** package arg |
| Reservation row | `hotel_reservations` — `rate_plan_id`, `room_subtotal`, `nightly_rate_snapshot`, `room_id`, … **No** package column |
| Quote | `src/packages/pms/lib/rates.functions.ts` — `quoteStay`. `StayQuote` in `rates.server.ts` |
| Pricing RPC | `price_hotel_stay` — five args (property, plan, room type, arrival, departure) |
| Setup table | `supabase/migrations/0049_pms_set3_rates_guest_rules.sql` — `pms_packages`. Comment: “Empty is a Warning, not a go-live block.” |
| Setup snapshot | `src/packages/pms/lib/pms-set3-rates-guest.ts` — `PmsPackage`, `SET3_PACKAGES_WARNING`, `packagesAvailable` |
| Setup load/save | `src/packages/pms/lib/pms-set3-rates-guest.functions.ts` — `loadSet3Snapshot` reads `pms_packages`; `savePmsPackage` inserts/updates |
| Setup UI | `src/packages/pms/components/settings/pms-set3-section.tsx` — Packages list under Rates & meal plans |
| Settings route | `src/routes/restaurant/settings.tsx` — PMS entitlement → `PmsSet1Hub` |
| FO extras (OUT) | `fo_service_catalogue` + `loadServiceCatalogue` in `fo-amendments.functions.ts`; UI `fo-amend-sheet.tsx` “Add Service” |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |
| Phase 1 lock | `CREATE_RESERVATION_LOCKED_NON_GOALS` includes **“fake packages”** (`create-reservation-phase1.ts`) |

---

## 2. CURRENT (code wins)

- **Setup stay packages exist** as a SET3 catalogue. Managers add code / name / type / inclusion strings / active on `/restaurant/settings`. Empty catalogue is a **warning**, not a go-live block. Schema 0049 is additive and **may be absent** at runtime (`packagesAvailable: false`; copy `SET3_RATES_UNAVAILABLE`).
- **Inclusion is not a price.** `inclusion jsonb` is a string list. There is **no** package amount, tax, per-night/per-stay charge, or rate-plan link on `pms_packages`.
- **Create Reservation has no packages surface.** Staff cannot pick a stay package on `/restaurant/bookings/new`. Sticky summary has no package line.
- **Create does not persist a package.** Same writer; RPC; reservation row — all package-free.
- **`quoteStay` does not take or return packages.** Sticky stay total (Section 5) is room-plan `subtotal` only.
- **FO extras are a different product.** `fo_service_catalogue` feeds Front Office Amend Add Service (optional amount → folio or stay-only). No Setup packages editor. Not create-path. Empty → “No catalogue items — enter a service manually.”
- **Meal plans** are a sibling SET3 table (`pms_meal_plans`) with tax posture / outlets — also **not** bound on create.
- **No second create writer.** Walk-in remains `createReservation`.
- **DATABASE IMPACT:** **LIKELY NONE** for this gated section (no new column, no RPC replace). Inventing bind would require a new column **and** SECURITY DEFINER create RPC replace → dual-lane APPLY **HELD**. That invent path is **OUT**.

### DOCUMENTATION / IMPLEMENTATION notes

- Setup `pms_packages` **must not** be silently treated as “no catalog.” Detect it. **Do not** ship attach/bind as LIVE.
- Do **not** clone a legacy packages grid. If a box ships, it is a **gated honesty** card on the existing Doc2 column.
- Parallel Section 6 coding ([#145](https://github.com/NORUDEVGIT/NORU/issues/145)) and Section 7 Spec drafting **OK** — do not block. Sticky: do **not** overwrite Section 5 rate/total with an invented package sum.
- Guest GE1–GE3 stay closed. Phase 1 DONE = **NO**. Create Reservation DONE = **NO**.

---

## 3. EXPECTED — Packages (GATE)

### 3.1 Catalog detect (required)

On Create Reservation, Eng must **detect** Setup stay-package availability the same way SET3 already does (reuse `getPmsSet3Snapshot` / `loadSet3Snapshot` — **no** parallel catalog API):

| Detected state | Meaning |
|---|---|
| `packagesAvailable === false` | 0049 (or equivalent) **not** applied — schema missing |
| `packagesAvailable === true` and **no** active rows | Catalogue exists, empty (SET3 warning) |
| `packagesAvailable === true` and **active** rows | Setup catalogue has sellable **masters** — still **not** create-bound |

Do **not** invent rows. Do **not** seed sample packages from this section.

### 3.2 List / select — GATE (not full EXPECTED)

- Reference Individual create **package pick** is in scope **only if** CURRENT can list from Setup **and** persist via the **current** writer.
- **CURRENT:** list exists in Setup; persist on create **does not**.
- Therefore Phase 1 Section 8: **no selectable attach** on `/restaurant/bookings/new`. Do **not** present checkboxes / multi-pick / quantity that look bound.
- **Allowed:** a modern NORU **gated** Packages box with honest copy for the detected state (§3.1). Optional link to Settings packages (`/restaurant/settings` #rates) for staff who can edit SET3 — **not** required to create.
- Empty / missing schema: honest copy (reuse SET3 strings where cheap). Create **still allowed** (packages are not required).

### 3.3 Bind — GATE / OUT (CURRENT writer does not support)

- Persist on create **only** via CURRENT `createReservation` → `create_hotel_reservation_priced`.
- **CURRENT has no param / column / junction.** Bind is **OUT**.
- Do **not** post-insert a package row from a second writer. Do **not** encode packages into `notes` / `special_requests` as a fake bind. Do **not** replace SECURITY DEFINER create RPCs **in this section** to add `_package_id`.
- If product later wants bind: **new Spec** after a real persist path exists. That follow-up would likely be APPLY **HELD** (RPC replace) and must still **not** invent a pricing engine.

### 3.4 Sticky honesty (not in quote)

- CURRENT `quoteStay` / `price_hotel_stay` **do not** include package lines.
- Sticky must **not** add a package amount, `0.00` package total, or “included” money that the server quote does not contain.
- Allowed sticky copy: packages **not in this quote** / **not attached on create** (Eng wording). Section 5 room total stays the only stay total.
- Browser math for packages is **ignored** (there is no server package quote to display).

### 3.5 No fake packages / no invented engines

- Do **not** invent a stay-package catalog (do not alias FO extras or meal plans as packages).
- Do **not** invent a package pricing engine (do not parse `inclusion` into money; do not add package args to `price_hotel_stay`).
- Do **not** invent commission settlement, LIVE OTA/RMS package mapping, or email/SMS package confirmation.

### 3.6 Same writer / same route

- Same `/restaurant/bookings/new`. Walk-in remains a mode of `createReservation`.
- `canSubmit` must **not** require a package.
- Permission gates unchanged.

---

## 4. Out of Section 8 (locked)

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

## 5. Acceptance criteria (AC-CR8)

| ID | Criterion |
|---|---|
| **AC-CR8-1** | **Catalog detect:** Create Reservation distinguishes Setup `pms_packages` **schema missing** vs **available empty** vs **available with active rows**, using CURRENT SET3 snapshot (`packagesAvailable` / active count) — **no** parallel catalog service |
| **AC-CR8-2** | Locked finding is honoured: Setup stay-package catalogue **EXISTS**; create bind + `quoteStay` package lines **DO NOT EXIST**. Spec/UI must not claim the opposite |
| **AC-CR8-3** | **GATE list/select:** `/restaurant/bookings/new` has **no** selectable package attach that looks bound. No fake package cards invented from FO extras, meal plans, or hardcoded sample rows |
| **AC-CR8-4** | **No fake packages:** gated box (if shipped) uses honest copy for missing schema / empty catalogue / “not attached on create”. Create remains allowed without a package |
| **AC-CR8-5** | **Bind GATE:** `createReservation` → `create_hotel_reservation_priced` is **unchanged** for packages (no new package arg). `hotel_reservations` gains **no** package column in this section. No notes/special-requests smuggling |
| **AC-CR8-6** | **Sticky honesty:** sticky stay total remains Section 5 server room quote. **No** package line in `quoteStay` / `StayQuote`. **No** invented package `0.00` / client-sum total |
| **AC-CR8-7** | **Quote unchanged:** `quoteStay` / `price_hotel_stay` stay room-plan + dates. No invented package pricing engine |
| **AC-CR8-8** | **No second writer.** Walk-in remains `createReservation`. No post-insert package writer |
| **AC-CR8-9** | Existing permission gates preserved: `requireRoutePackage("pms")`, `getBookingsAccess` / `requireReservationManager`. **No** new entitlement / RLS **model**. Flag Abel if model must change |
| **AC-CR8-10** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR8-11** | Section 8 does **not** claim Phase 1 or full Create Reservation **DONE** |
| **AC-CR8-12** | **FO extras OUT.** Do not mount `fo_service_catalogue` / Add Service on create as stay packages |
| **AC-CR8-13** | **Meal plans OUT** of this section’s create bind. SET3 meal-plan Setup stays Settings |
| **AC-CR8-14** | **No** commission settlement, LIVE OTA/RMS package mapping, or email/SMS send confirmation |
| **AC-CR8-15** | **CR-100 / Group** products are **not** expanded |
| **AC-CR8-16** | Rate (Section 5), Room assign (Section 6), Guarantee/Confirm product (Section 7) are **not** rewritten. Sticky compose: do not replace Section 5 totals |
| **AC-CR8-17** | Locked non-goals in §4 are **absent** |
| **AC-CR8-18** | Migration honesty: **LIKELY NONE**. Eng **confirms**. Dual-lane APPLY HELD **only** if SECURITY DEFINER create/pricing RPCs are replaced — **not** required for this gated section |
| **AC-CR8-19** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product. Modern NORU gated box OK; **do not** clone legacy chrome |
| **AC-CR8-20** | Programme rule honoured: reference packages **functionality only if CURRENT supports** (create bind / quote **do not**). Setup catalogue may be **detected** and linked; attach is **not** LIVE |
| **AC-CR8-21** | Parallel Section 6 ([#145](https://github.com/NORUDEVGIT/NORU/issues/145)) and Section 7 Spec drafting are **not blocked** by this Spec |
| **AC-CR8-22** | `canSubmit` does **not** require a package. Unpriced / Unassigned / Individual Associations behaviour from prior sections is **not** weakened by this gate |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR8-1…22; browser gated Packages honesty on `/restaurant/bookings/new` (schema-missing / empty / active-masters-but-not-attached); create still succeeds without a package; sticky has no fake package total; `createReservation` payload still has no package id; Settings SET3 packages editor unchanged; FO Amend Add Service unchanged.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped SET3 reads if used for detect; preserve reservation gates; do not grant Setup package **edit** to create-only roles unless CURRENT already does (`savePmsPackage` is SET1 editor / owner-manager). No new SECURITY DEFINER unless Abel-approved.
- Regression: Sections 1–5 shell / stay / availability / rate sticky / Company-TA / Associations; Section 6 room assign if shipped; walk-in same writer; `quoteStay` room-only; Guest GE closed; SET3 meal/package Setup; FO extras amend.

---

## 7. Open Eng confirm items

1. **Gated box vs omit:** ship a visible Packages honesty card vs omit the card and rely on sticky “not in quote” only. Recommend **visible gated box** so detect ACs are testable. Pick one in the TIP.
2. **Detect API:** reuse `getPmsSet3Snapshot` (includes meals/ID/VIP) vs a thinner read of `packagesAvailable` + active count. Same SoT either way — do not add a new catalog RPC.
3. **Settings deep-link:** optional “Open package catalogue” to `/restaurant/settings` for SET3 editors only vs no link. Must not send receptionists into a denied editor without CURRENT permission honesty.
4. **Follow-up bind Spec?** Confirm bind stays OUT until a real persist path exists. Do **not** sneak RPC replace into this section.
5. **Sticky compose with Section 5 / 6:** add “Packages not in quote” without disturbing rate total or Unassigned room line.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Issue | **TBD** (Eng opens after plan APPROVE) |
| Setup `pms_packages` catalogue | **EXISTS** (table + Settings UI + list/save fns) |
| Create list/select that binds | **DOES NOT EXIST** — **GATE** |
| `quoteStay` package lines | **DOES NOT EXIST** — sticky **not in quote** |
| Bind via CURRENT writer | **DOES NOT EXIST** — **GATE / OUT** |
| Migration | **LIKELY NONE** (Eng confirms). APPLY HELD only if create/pricing RPCs replaced (not in this section) |
| Invent catalog / pricing engine / commission / LIVE OTA | **OUT** |
| FO extras / meal plans on create | **OUT** |
| Guest GE1–GE3 | **Closed** — not reopened |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
