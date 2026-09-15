# Create Reservation — Phase 1 Section 5 (Rate plan + sticky pricing)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 5: Rate plan + sticky pricing |
| **STATUS** | **OPERATIONALLY ACCEPTED** — Rekik formal closure YES 2026-09-15 (DER PASS) |
| **ENGINEERING STATUS** | **PASS** for Section 5 — delivery [#142](https://github.com/NORUDEVGIT/NORU/pull/142) MERGED (`fafd329e5682523457f57ad99f54b9fa0f6ed708` by AK21ER @ 2026-09-15T13:59:51Z) |
| **Issue** | [#141](https://github.com/NORUDEVGIT/NORU/issues/141) **CLOSED** completed — OPERATIONALLY ACCEPTED. Do **not** claim LIVE / Phase 1 COMPLETE |
| **Migration** | **NONE** (DER). Quote / bind / snapshot columns and RPCs already existed. Capability-only unpriced (`owner` \| `manager`). Dual-lane APPLY **N/A** (SECURITY DEFINER pricing/create RPCs were **not** replaced). RLS **UNCHANGED**. Flag Abel **NOT** required |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — Section 5 only; room assign / guarantee / packages later sections own DONE claims |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section5-programme.md`](../create-reservation-phase1-section5-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). Sections 2–4 are sibling Specs. Individual Associations amend (Spec [#137](https://github.com/NORUDEVGIT/NORU/pull/137) / impl [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED; [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** / OPERATIONALLY ACCEPTED) — does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127). This section **consumes** stay dates + room type from the create draft |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> **Docs CURRENT recon 2026-09-15** after Eng DER PASS (#142) and Rekik **formal closure YES**. Spec docs baseline [#140](https://github.com/NORUDEVGIT/NORU/pull/140). Functional Spec = business rules. UI/UX Doc2 note = layout. **Functional wins** on conflicts. **Code wins** for CURRENT.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → **5 Rate + sticky pricing (THIS — OPERATIONALLY ACCEPTED / #141 CLOSED)** → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog.
>
> **Server / RPC remains source of truth.** Sticky totals come from **server** `quoteStay` / `price_hotel_stay`. Browser math is **ignored**. Do **not** invent LIVE RMS / OTA / commission / rate-adjustment engines.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route **extended** | `/restaurant/bookings/new` (same product as Sections 1–4) |
| Writer **extended** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). `_rate_plan_id` bind **kept**; server re-prices + snapshots when set |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | `CreateReservationRate` card + sticky: plan/code select for stay + room-type context; nightly table on the Rate card; **honest server total** in sticky from the **same** `quoteStay` object. Doc2 shell / sidebar collapse from Section 1 unchanged |
| Quote source | CURRENT `quoteStay` → `price_hotel_stay` for active plans matching `room_type_id` + stay dates. **No** parallel pricing API |
| Product locks (D5) | **Rate required** to Confirm. **Unpriced** Pending **only** + `owner` \| `manager`. Sticky shows honest quoted total from **server** — no fake totals; browser totals ignored |
| Confirm honesty | Hard Confirm / Guarantee chrome may live in **Section 7**. Section 5 **exposes** priced vs unpriced and **tightens** create submit so **confirmed** without a successful quote is blocked |
| Fixed rate | **OUT** — CURRENT has no create fixed/manual path (see §3.5) |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — mounts `CreateReservationRate`; `useQuery` `["stay-quotes", restaurantId, roomTypeId, arrival, departure]`; `selectedQuote` from `quoteStay`; sticky `summary-rate` / `summary-rate-and-total` / `summary-stay-total`; `canSubmitCreateReservation` |
| Rate UI | `src/packages/pms/components/bookings/create-reservation-rate.tsx` — `CreateReservationRate` (code + name, server from-rate / total, nightly table, Unpriced badge, unavailable reason) |
| Locks / helpers | `src/packages/pms/lib/create-reservation-phase1-section5.ts` + `create-reservation-phase1-section5.test.ts` (**AC-CR5-1…21 PASS**) |
| Quote server fn | `src/packages/pms/lib/rates.functions.ts` — `quoteStay` → lists active `hotel_rate_plans` for room type, then `price_hotel_stay` per plan → `RatePlanQuote` (`plan`, `quote` \| null, `unavailableReason`) |
| Quote gate (CURRENT) | `quoteStay` calls `requireReservationManager` (`owner` \| `manager` \| `receptionist`). Rate admin writers stay `requireRateManager`. Unpriced Pending stays `owner` \| `manager` |
| Pricing RPC | `price_hotel_stay(_restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure)` — base rate + `hotel_rate_calendar` nightly overrides + restriction checks (CTA/CTD/stop-sell/min-max stay) |
| Writer | `createReservation` — Zod `ratePlanId: idSchema.nullable().optional()`; `assertCreateReservationPricing`; comment: browser totals ignored; RPC `_rate_plan_id` |
| RPC (priced) | `create_hotel_reservation_priced` — if `_rate_plan_id IS NOT NULL` then `price_hotel_stay` + set `rate_plan_id` / `currency` / `room_subtotal` / `nightly_rate_snapshot` / `priced_at`; **null skips pricing** (Pending + manager only) |
| Rate plans table | `hotel_rate_plans`: `code`, `name`, `room_type_id`, `base_rate`, `currency`, `valid_from` / `valid_to`, `active`, category FK |
| Calendar overrides (admin) | Rates UI `saveOverride` / `hotel_rate_calendar.nightly_rate` — **configuration**, not a create-time Fixed Rate field |
| Reprice (existing stay) | `repriceReservation` → `reprice_hotel_reservation` — detail amend path; **not** create Fixed Rate |
| Sticky honesty | Priced: `pricingState.quote` (same `selectedQuote` object as the Rate card). Unpriced / loading / error: `stickyPricingCopy` — **no** fake `0.00`. `CREATE_RESERVATION_SUMMARY_NO_TOTAL` is now an **alias** of the unpriced copy |
| Submit gate (CURRENT) | `canSubmitCreateReservation` = guest + valid dates + room type with `available > 0` + (**priced** **or** Pending + `canCreateUnpricedPending`) |
| Status (CURRENT) | Details Select `pending` \| `confirmed` — **confirmed** without a successful quote is **blocked** (UI + writer) |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |
| FO walk-in (same writer) | `front-office-dialogs.tsx` — walk-in creates **confirmed**, so it now **requires** a quoted plan from `quoteStay` |
| FO rate-missing signal | `fo-cancel-noshow.functions.ts` — `rateMissing: rate_plan_id == null && (room_subtotal == null || 0)` (honesty reference only; not a create permission) |

---

## 2. CURRENT (code wins — post #142)

- `/restaurant/bookings/new` shows a **Rate plan** card (`CreateReservationRate`) once stay dates are valid and a room type is selected.
- Quotes load via **`quoteStay`**: active plans for that `room_type_id`, each priced by server **`price_hotel_stay`**. Unavailable plans show `unavailableReason` (restrictions / mismatch) and are **not** selectable as priced (`data-rate-available="unavailable"`).
- Cards show **name + code**, from-rate / night, and **server** stay total. Selecting a plan sets `ratePlanId` (toggle clears). Changing room type **clears** `ratePlanId`. Stay arrival / nights / departure change also **clears** `ratePlanId`. After a re-quote, `shouldClearStaleRatePlan` clears a selection that no longer has a successful quote (`CREATE_RESERVATION_STALE_RATE_RULE = clear-on-type-and-invalid-stay`).
- Selected plan shows a **nightly breakdown table** + stay total on the Rate card, with copy that pricing is re-checked on create and **browser totals are ignored**.
- **Sticky SoT:** when priced, sticky `summary-rate` / `summary-rate-and-total` / `summary-stay-total` render **rate code (+ name)**, nights / from-night, and **stay total** from `pricingState.quote` — the **same** `selectedQuote` object as the Rate card (`quoteStay` row). **No** second calculator.
- **Unpriced / loading / error:** sticky shows honest copy (`CREATE_RESERVATION_SUMMARY_UNPRICED` / loading / quote-error) and an **Unpriced** badge when unpriced. **No** fake `0.00` stay total. The Section 1 “later section” placeholder is **replaced** (`CREATE_RESERVATION_SUMMARY_NO_TOTAL` is now an alias of the unpriced copy).
- **Create bind:** `ratePlanId: ratePlanId || null` → `_rate_plan_id`. When set, RPC prices and snapshots. When null, reservation is created **unpriced** (no `room_subtotal` / snapshot) **only** if Pending + `owner` \| `manager`. Writer comment already: **browser totals ignored**. Writer also `assertCreateReservationPricing`.
- **Unpriced path:** Pending only + `canCreateUnpricedPending` (`owner` \| `manager`, align `requireRateManager`). Receptionist **must** pick a quoted plan. Empty catalogue copy is role-honest (manager may create Pending unpriced; receptionist is told a quoted plan is required). **Confirmed** without a successful quote is **blocked**.
- **`quoteStay` gate:** `requireReservationManager` so create UX (including receptionist) can quote. Rate admin writers stay `requireRateManager`. Capability-only — **no** RLS / entitlement model change.
- **Fixed / manual rate on create:** **absent**. No Fixed Rate field, no create-time amount override, no adjustment %/amount API on this path. Rates admin calendar overrides feed `price_hotel_stay` only.
- **RTC** (room type charged ≠ reserved type): **absent** on create.
- **No** LIVE OTA / RMS / commission settlement / invent rate-adjustment engine on create.
- **Walk-in:** still the same `createReservation` writer. Because walk-in creates **confirmed**, FO now requires a quoted `ratePlanId`.
- **DATABASE IMPACT:** **NONE**. No Section 5 migration file. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.

### DOCUMENTATION / IMPLEMENTATION notes

- Spec [#140](https://github.com/NORUDEVGIT/NORU/pull/140) EXPECTED AC-CR5-1…21 remain the acceptance baseline; delivery [#142](https://github.com/NORUDEVGIT/NORU/pull/142) matched locks **21/21** (+ Section 1–4 locks still PASS on regression). Independent QA **PASS** (Rekik, pre-merge). Browser **NOT RUN ≠ PASS** (IQ covered).
- **No DOCUMENTATION / IMPLEMENTATION DISCREPANCY:** Spec ACs that shipped are present in code. Sticky nightly **table** lives on the Rate card; sticky shows nights / from-rate / total from the **same** `quoteStay` object (Spec §3.3 “and/or”). Date change **always** clears `ratePlanId` (stricter than “clear when invalid” — still honest).
- Pre-existing Stay / room / details / Section 6 assign picker on the same page **remain**. Section 5 Spec does **not** claim those sections DONE. No silent claim of Phase 1 COMPLETE.
- Issue [#141](https://github.com/NORUDEVGIT/NORU/issues/141) **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).

---

## 3. EXPECTED — Rate plan + sticky pricing (authorized baseline — delivered)

### 3.1 Rate plan / rate code select — **delivered**

- Staff select **one** rate plan (code + name) from CURRENT property plans returned by `quoteStay` for the **draft stay + selected room type**.
- Code + name + server quote snippet (from-rate / total) on modern NORU boxes — **not** a legacy chrome clone.
- Empty catalogue: honest copy (no fake plan). Invalid dates / no room type: do not invent quotes.
- Plans that fail `price_hotel_stay` stay visible as **unavailable** with reason — not silently selectable as priced.

### 3.2 Select binds on create — **delivered**

- Selected plan **binds** `hotel_reservations.rate_plan_id` via the same `createReservation` → `create_hotel_reservation_priced` (`_rate_plan_id`) stack. Server re-price + snapshot kept.
- **No** parallel pricing writer. Client displays the last server quote; create **re-derives** from plan id.
- Changing stay dates or room type **re-fetches** quotes and **clears** selection (type change + stay-date change + stale-quote effect).

### 3.3 Sticky pricing (server quote only) — **delivered**

- Sticky summary shows, when a **priced** plan is selected:
  - Rate **code** (+ name)
  - Nights / from-night summary from the **server** quote (full nightly table on the Rate card)
  - **Stay total** = `quote.subtotal` (and currency) from the **same** `quoteStay` object as the Rate card
- When **unpriced** (no plan, or permitted Pending path): honest unpriced copy — **no** fake `0.00` total.
- **Ignore client math.** Sticky and Rate card share `selectedQuote`.

### 3.4 Rate required for Confirm / Guarantee (D5) — **delivered** (create tighten; Section 7 chrome later)

- **Confirmed** create requires a selected rate that has a successful server quote, unless the staffed **unpriced Pending** permission path applies (§3.6).
- Section 5 **exposes** `priced` / `unpriced` / whether unpriced Pending is allowed for this actor (`canCreateUnpricedPending`).
- Section **7** still owns Confirm / Guarantee **button chrome**. No second Confirm product.

### 3.5 Fixed rate — GATE / OUT (CURRENT does not support) — **honoured**

- **Fixed Rate = OUT.** No fake Fixed Rate checkbox. No create-time manual amount.
- **Rate adjustment amount/%** on create: **OUT**.
- **RTC**: **OUT**.

### 3.6 Unpriced path (permission + Pending only) — **delivered**

- Unpriced create is allowed **only** as **Pending**, and **only** for `owner` \| `manager` (align `requireRateManager`).
- Receptionist must pick a quoted plan.
- Capability-only — **no** RLS / entitlement model change. Flag Abel: **NOT** required.
- UI makes unpriced **visible** (badge + sticky copy).

### 3.7 No second pricing writer / no invented engines — **delivered**

- Same route + same writer. Walk-in remains a mode of `createReservation` (confirmed walk-in now binds a quoted plan).
- **No** invented LIVE RMS, OTA channel pricing, commission settlement, or create-time rate-adjustment engine.

---

## 4. Out of Section 5 (locked — still out)

- **Fixed Rate / manual create override** (CURRENT unsupported — GATE / OUT; later Spec if needed)
- **Rate adjustment amount/%** on create (no CURRENT create API)
- **RTC** (room type charged ≠ room type)
- Inventing **LIVE RMS / OTA / commission / yield** engines
- **Room assign** (Section 6) — do not expand assignable-room behaviour
- **Guarantee + Confirm UI product** (Section 7) — expose priced/unpriced state; create-status tighten is Section 5; do not invent second Confirm chrome
- **Packages** (Section 8)
- Email / SMS send confirmation
- **Corporate / Group** as separate products / CR-100 / allotment
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- New entitlement / RLS **architecture** without Abel flag
- Fake sticky totals; accepting browser math as SoT

---

## 5. Acceptance criteria (AC-CR5) — locks PASS

| ID | Criterion | Delivery |
|---|---|---|
| **AC-CR5-1…21** | As authorized in Spec #140 | **PASS** (#142) |

Full AC text remains the #140 baseline; do not reopen Guest GE; do not claim Phase 1 DONE.

---

## 6. QA / Security / Regression (summary)

- Eng DER: **PASS** Section 5 only (#142 MERGED 2026-09-15, SHA `fafd329e5682523457f57ad99f54b9fa0f6ed708`). Independent QA **PASS** (Rekik, pre-merge). `tsc` PASS; locks **AC-CR5-1…21 PASS** (+ AC-CR1 / AC-CR2 / AC-CR4 regression PASS). Browser **NOT RUN ≠ PASS** (IQ covered).
- Security: staff-only; tenant-scoped plans; existing FO / reservation gates preserved; quote gate aligned to reservation managers; unpriced capability-only; **no** new SECURITY DEFINER; **no** new RLS policies.
- Regression: Sections 1–4 shell / stay / availability / Company-TA (as shipped); walk-in same writer (now requires a quoted plan because confirmed); `price_hotel_stay` restrictions unchanged; Rates admin calendar not broken; Guest GE closed; no Fixed Rate / adjustment / RTC invent.
- Migration: **NONE**. Dual-lane APPLY **N/A**. Flag Abel: **NOT** required.
- **#141** **CLOSED** completed (Rekik formal closure YES / OPERATIONALLY ACCEPTED).

---

## 7. Eng confirm items (resolved in #142)

| Item | Resolution |
|---|---|
| Unpriced permission shape | **`owner` \| `manager` only** (align `requireRateManager`); Pending-only. Receptionist must select a quoted plan. Capability-only — Flag Abel **NOT** required |
| `quoteStay` role vs create role | **`requireReservationManager`** (owner \| manager \| receptionist) so create UX can quote. Rate admin writers stay `requireRateManager` |
| Confirm gate ownership | Create **confirmed** without a successful quote is **blocked** now (UI + `assertCreateReservationPricing`). Guarantee / Confirm **chrome** stays **Section 7** |
| Sticky vs Rate card duplication | **Single** `selectedQuote` / `quoteStay` object rendered in both places |
| Stale quote on date/type change | **Clear `ratePlanId`** on room-type change and on stay-date / nights change; plus `shouldClearStaleRatePlan` when the re-quote has no successful quote |
| Fixed Rate later Spec? | **OUT** for Phase 1 Section 5. No follow-up filed from this recon |

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **OPERATIONALLY ACCEPTED** (#141 CLOSED) |
| ENGINEERING | **PASS** (#142) |
| Implemented / PASS (Section 5) | **Yes** (DER) |
| LIVE / module COMPLETE / Phase 1 COMPLETE | **No** |
| Migration | **NONE**. Dual-lane APPLY **N/A**. RLS **UNCHANGED**. Flag Abel **NOT** required |
| Fixed Rate / create adjustment / RTC | **OUT** (CURRENT unsupported) |
| LIVE RMS / OTA / commission engine | **Not invented** — CURRENT `quoteStay` / `price_hotel_stay` only |
| Create Reservation DONE | **NO** |
| Issue #141 | **CLOSED** completed |
