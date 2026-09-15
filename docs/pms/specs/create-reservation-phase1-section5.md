# Create Reservation — Phase 1 Section 5 (Rate plan + sticky pricing)

| Field | Value |
|---|---|
| **PACKAGE** | PMS · Reservations |
| **FEATURE** | Create Reservation Phase 1 — Section 5: Rate plan + sticky pricing |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Hospitality Product Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Issue** | Relates upcoming Eng issue (not opened by this docs PR). Do not claim PASS / LIVE / COMPLETE until Independent QA + Outcome Review |
| **Migration** | **LIKELY NONE** for core bind/quote (`hotel_reservations.rate_plan_id`, `room_subtotal`, `nightly_rate_snapshot`, `price_hotel_stay`, `quoteStay`, nullable `_rate_plan_id` on `create_hotel_reservation_priced`). Dual-lane APPLY **N/A** unless Eng replaces those SECURITY DEFINER RPCs. **Unpriced permission** may need a small capability / role rule — Eng confirms; **flag Abel** if entitlement / RLS **model** must change. No new RMS / OTA / commission / rate-adjustment engine |
| **Guest Waves 1–5 + GE1 + GE2 + GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Phase 1 / module COMPLETE** | **NO** — this section does **not** claim full Create Reservation DONE |
| **Canonical location** | This file (lean Spec). Programme note: [`../create-reservation-phase1-section5-programme.md`](../create-reservation-phase1-section5-programme.md) |
| **Prior / sibling sections** | [`create-reservation-phase1-section1.md`](./create-reservation-phase1-section1.md) (Context + Guest). Sections 2–4 are sibling Specs. Individual Associations amend (Spec [#137](https://github.com/NORUDEVGIT/NORU/pull/137) / impl [#139](https://github.com/NORUDEVGIT/NORU/pull/139) MERGED; [#138](https://github.com/NORUDEVGIT/NORU/issues/138) **CLOSED** / OPERATIONALLY ACCEPTED) — does **not** reopen [#127](https://github.com/NORUDEVGIT/NORU/issues/127). This section **consumes** stay dates + room type from the create draft |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Rekik AUTHORIZED 2026-09-15** via Hospitality Product Advisor. Additive expansion of the **existing** Create Reservation surface. **Do not** rebuild a second product. Walk-in remains a **mode of the same writer**.
>
> Functional Create Reservation Spec = business rules. UI/UX layout notes = Doc2 shell from Section 1. **Functional wins** on conflicts.
>
> **Programme rule (LOCKED):** Include efficient **rate** functionality from the user’s reference Individual create screen (**Rate Code**, **Rate & Total**, **Fixed Rate only if CURRENT supports**) with **modern NORU UI** (sticky summary, boxes). **Do not** clone legacy chrome. Placement may borrow from reference.
>
> Section delivery order: 1 Context + Guest → 2 Company/TA on create → 3 Stay → 4 Availability / room type → **5 Rate + sticky pricing (THIS)** → 6 Room assign → 7 Guarantee + confirm → 8 Packages if catalog. Later sections own room assign / guarantee chrome.
>
> **Server / RPC remains source of truth.** Sticky totals come from **server** `quoteStay` / `price_hotel_stay`. Browser math is **ignored**. Do **not** invent LIVE RMS / OTA / commission / rate-adjustment engines.

---

## 0. Programme brief

| Item | Value |
|---|---|
| Route to **extend** | `/restaurant/bookings/new` (same product as Sections 1–4) |
| Writer to **extend** | `createReservation` → `create_hotel_reservation_priced` (same stack as FO walk-in). Already takes optional `_rate_plan_id`; when set, RPC calls `price_hotel_stay` and snapshots totals |
| Phase 1 | Individual Create Reservation workspace, including corporate / TA-**linked individual** stays (not a parent Company Reservation CR-100) |
| UI | Extend the existing **Rate plan** card + sticky summary: plan/code select for stay + room-type context; nightly breakdown + **honest server total** in sticky; modern NORU boxes (not legacy clone). Doc2 shell / sidebar collapse from Section 1 unchanged |
| Quote source | Reuse CURRENT `quoteStay` → `price_hotel_stay` for active plans matching `room_type_id` + stay dates. **No** parallel pricing API |
| Product locks (D5) | **Rate required** to Confirm / Guarantee. **Unpriced** Pending/Draft **only with permission**. Sticky shows honest quoted total from **server** — no fake totals; browser totals ignored |
| Confirm honesty | Hard Confirm / Guarantee chrome may live in **Section 7**. Section 5 **exposes** priced vs unpriced state and must not weaken the D5 rate-required rule |
| Fixed rate | **Only if CURRENT supports** a real fixed/manual create path — researched: **does not**. **GATE / OUT** for Phase 1 Section 5 (see §3.5) |

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Create route | `src/routes/restaurant/bookings/new.tsx` — Rate plan section; `useQuery` `["stay-quotes", restaurantId, roomTypeId, arrival, departure]`; `ratePlanId` state; sticky `create-reservation-summary` still uses `CREATE_RESERVATION_SUMMARY_NO_TOTAL` |
| Quote server fn | `src/packages/pms/lib/rates.functions.ts` — `quoteStay` → lists active `hotel_rate_plans` for room type, then `price_hotel_stay` per plan → `RatePlanQuote` (`plan`, `quote` \| null, `unavailableReason`) |
| Quote gate (CURRENT) | `quoteStay` calls `requireRateManager` (`owner` \| `manager` only). Create path uses `requireReservationManager` (`owner` \| `manager` \| `receptionist`) — **role mismatch** Eng must confirm |
| Pricing RPC | `price_hotel_stay(_restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure)` — base rate + `hotel_rate_calendar` nightly overrides + restriction checks (CTA/CTD/stop-sell/min-max stay) |
| Writer | `createReservation` — Zod `ratePlanId: idSchema.nullable().optional()`; comment: browser totals ignored; RPC `_rate_plan_id` |
| RPC (priced) | `create_hotel_reservation_priced` — if `_rate_plan_id IS NOT NULL` then `price_hotel_stay` + set `rate_plan_id` / `currency` / `room_subtotal` / `nightly_rate_snapshot` / `priced_at`; **null skips pricing** |
| Rate plans table | `hotel_rate_plans`: `code`, `name`, `room_type_id`, `base_rate`, `currency`, `valid_from` / `valid_to`, `active`, category FK |
| Calendar overrides (admin) | Rates UI `saveOverride` / `hotel_rate_calendar.nightly_rate` — **configuration**, not a create-time Fixed Rate field |
| Reprice (existing stay) | `repriceReservation` → `reprice_hotel_reservation` — detail amend path; **not** create Fixed Rate |
| Sticky honesty constant | `CREATE_RESERVATION_SUMMARY_NO_TOTAL` in `create-reservation-phase1.ts` — currently “Rate and pricing belong to a later section.” |
| Submit gate (today) | `canSubmit` = guest + valid dates + room type with `available > 0` — **does not** require `ratePlanId` |
| Status (today) | Details Select `pending` \| `confirmed` — unpriced confirmed create is **allowed** today |
| Access | `getBookingsAccess` / `canManageReservations` / `requireReservationManager` + `requireRoutePackage("pms")` |
| FO rate-missing signal | `fo-cancel-noshow.functions.ts` — `rateMissing: rate_plan_id == null && (room_subtotal == null || 0)` (honesty reference only; not a create permission) |

---

## 2. CURRENT (code wins)

- `/restaurant/bookings/new` already shows a **Rate plan** card once stay dates are valid and a room type is selected.
- Quotes load via **`quoteStay`**: active plans for that `room_type_id`, each priced by server **`price_hotel_stay`**. Unavailable plans show `unavailableReason` (restrictions / mismatch) and are not selectable.
- Cards show **name + code**, from-rate / night, and **server** stay total. Selecting a plan sets `ratePlanId` (toggle clears). Changing room type **clears** `ratePlanId` (Section 4 dependency).
- Selected plan shows a **nightly breakdown table** + stay total in the Rate card, with copy that pricing is re-checked on create. Sticky summary **does not** yet show rate code / total — it still prints `CREATE_RESERVATION_SUMMARY_NO_TOTAL`.
- **Create bind:** `ratePlanId: ratePlanId || null` → `_rate_plan_id`. When set, RPC prices and snapshots. When null, reservation is created **unpriced** (no `room_subtotal` / snapshot). Writer comment already: **browser totals ignored**.
- **Unpriced path today:** open to any create-capable staff. Empty catalogue copy: “No rate plans for this room type yet — the stay can be booked without pricing.” **No** dedicated unpriced permission. **Confirmed** status can be chosen without a rate.
- **`canSubmit` does not require a rate.** D5 “rate required for Confirm” is **not** enforced yet.
- **Fixed / manual rate on create:** **absent**. No Fixed Rate field, no create-time amount override, no adjustment %/amount API on this path. Rates admin calendar overrides feed `price_hotel_stay` only.
- **RTC** (room type charged ≠ reserved type): **absent** on create.
- **No** LIVE OTA / RMS / commission settlement / invent rate-adjustment engine on create.
- Role quirk: receptionist can open create (`requireReservationManager`) but `quoteStay` requires **`requireRateManager`** — receptionist may see quote failures (`retry: false`). Documented for Eng confirm — do not silently invent a second quote service.

---

## 3. EXPECTED — Rate plan + sticky pricing

### 3.1 Rate plan / rate code select (reference capability, NORU UI)

- Staff select **one** rate plan (code + name) from CURRENT property plans returned by `quoteStay` (or equivalent — same `price_hotel_stay` SoT) for the **draft stay + selected room type**.
- Show at least **code** + **name** (reference “Rate Code”). Server quote snippet (from-rate / total) is fine on the card — **modern NORU boxes**, not legacy chrome clone.
- Empty catalogue: honest copy (no fake plan). Invalid dates / no room type: do not invent quotes (CURRENT gate).
- Plans that fail `price_hotel_stay` stay visible as **unavailable** with reason — not silently selectable as priced.

### 3.2 Select binds on create

- Selected plan **binds** `hotel_reservations.rate_plan_id` via the same `createReservation` → `create_hotel_reservation_priced` (`_rate_plan_id`) stack. Keep server re-price + snapshot (`room_subtotal`, `nightly_rate_snapshot`, `priced_at`).
- **Do not** add a parallel pricing writer or accept browser-computed totals as authority. Client may display the last server quote for UX; create **re-derives** from plan id.
- Changing stay dates or room type **re-fetches** quotes and **clears or revalidates** selection (CURRENT clears on type change — keep honesty).

### 3.3 Sticky pricing (server quote only)

- Sticky summary (`create-reservation-summary`) shows, when a **priced** plan is selected:
  - Rate **code** (+ name if cheap)
  - **Nightly breakdown** and/or clear nights summary from the **server** quote
  - **Stay total** = `quote.subtotal` (and currency) from `quoteStay` / `price_hotel_stay` — **not** `sum(client)` / invented ADR
- When **unpriced** (no plan, or permitted Pending path): honest unpriced copy — **no** fake `0.00` total. Replace the Section 1 “later section” placeholder once this section ships.
- **Ignore client math.** If sticky and Rate card both show totals, both must be the **same server quote object** (or an Eng-documented single derived view of it) — no second calculator.

### 3.4 Rate required for Confirm / Guarantee (D5)

- **Confirm / Guarantee** require a selected rate that has a successful server quote (**priced** state), unless the staffed **unpriced Pending** permission path applies (§3.6).
- Section **7** may own Confirm / Guarantee button chrome. Section 5 must **expose**:
  - `priced` — plan selected + server quote present
  - `unpriced` — no plan / no successful quote
  - whether unpriced Pending is **allowed for this actor**
- Until Section 7 ships: do **not** invent a second Confirm product; do **not** weaken D5. Prefer tightening create submit so **confirmed** without rate is blocked, while **pending** follows §3.6. Eng confirms exact button ownership with Section 7.

### 3.5 Fixed rate — GATE / OUT (CURRENT does not support)

- Reference screen “Fixed Rate” is **in scope only if CURRENT has a real fixed/manual create path**.
- **CURRENT finding:** no create-time Fixed Rate / manual amount / per-stay override API. Calendar overrides are Rates **admin** configuration consumed by `price_hotel_stay`. `repriceReservation` is post-create.
- Therefore Phase 1 Section 5: **Fixed Rate = OUT / gated**. Do not fake a Fixed Rate checkbox that writes a client total. Prefer a later Spec if product wants manual override.
- **Rate adjustment amount/%** on create: **OUT** (no CURRENT create adjustment API). Folio adjustment is Cashiering — not this section.
- **RTC**: **OUT** unless CURRENT already has it (it does not).

### 3.6 Unpriced path (permission + Pending only)

- Unpriced create is allowed **only** as **Pending** (or draft-equivalent CURRENT status — today `pending`), and **only with permission**.
- **CURRENT:** no dedicated unpriced permission; any create-capable role can omit rate and even choose Confirmed. Section 5 **closes** that honesty gap.
- Eng confirms the permission shape (recommended options — pick one documented in Eng plan):
  1. Reuse `owner` \| `manager` (align with `requireRateManager`), or
  2. Explicit named capability / entitlement (flag Abel if RLS / entitlement **model** changes), or
  3. Temporarily: any `requireReservationManager` for Pending-only unpriced — **weaker**; document residual
- UI must make unpriced **visible** (badge / sticky copy / helper) — not a silent null.
- Without permission: staff cannot submit unpriced; must pick a quoted plan (or abort).

### 3.7 No second pricing writer / no invented engines

- Same route + same writer. Walk-in remains a mode of `createReservation`.
- Do **not** invent LIVE RMS, OTA channel pricing, commission settlement, or a create-time rate-adjustment engine.
- Restrictions already enforced inside `price_hotel_stay` stay as CURRENT behaviour — do not rebuild a parallel restriction UI product here.

---

## 4. Out of Section 5 (locked)

- **Fixed Rate / manual create override** (CURRENT unsupported — GATE / OUT; later Spec if needed)
- **Rate adjustment amount/%** on create (no CURRENT create API)
- **RTC** (room type charged ≠ room type)
- Inventing **LIVE RMS / OTA / commission / yield** engines
- **Room assign** (Section 6) — do not expand assignable-room behaviour
- **Guarantee + Confirm UI product** (Section 7) — expose priced/unpriced state only; do not invent second Confirm chrome
- **Packages** (Section 8)
- Email / SMS send confirmation
- **Corporate / Group** as separate products / CR-100 / allotment
- Reopening Guest Waves 1–5 or GE1–GE3
- Claiming Phase 1 or full Create Reservation **DONE**
- New entitlement / RLS **architecture** without Abel flag
- Fake sticky totals; accepting browser math as SoT

---

## 5. Acceptance criteria (AC-CR5)

| ID | Criterion |
|---|---|
| **AC-CR5-1** | Rate plan / rate code select lists CURRENT property **active** plans for the selected **room type + stay** via `quoteStay` (or equivalent same `price_hotel_stay` SoT) on `/restaurant/bookings/new` |
| **AC-CR5-2** | Selecting a plan **binds** `ratePlanId` → `_rate_plan_id` on the same `createReservation` → `create_hotel_reservation_priced` writer; server re-prices and snapshots |
| **AC-CR5-3** | Sticky summary shows **honest server** nightly/breakdown and **total** from the selected `quoteStay` quote when priced — **not** client-invented math |
| **AC-CR5-4** | Browser / client totals are **ignored** as authority (writer already documents this). UI display must not present a second conflicting calculator as SoT |
| **AC-CR5-5** | **Unpriced** path: Pending (draft-equivalent) **only**, and **only with permission**. Clear UI honesty (sticky / badge). Eng documents the permission rule |
| **AC-CR5-6** | **Confirm / Guarantee** blocked without a successful rate quote unless the permitted unpriced Pending path applies. Section 5 exposes priced vs unpriced state; Section 7 may own button chrome |
| **AC-CR5-7** | **No fake totals** — unpriced sticky must not show `0.00` as a real stay total; empty / loading / error states are honest |
| **AC-CR5-8** | **No second pricing writer** — no parallel create API; walk-in remains a mode of the same writer |
| **AC-CR5-9** | **Fixed Rate** gated **OUT** for this section (CURRENT has no create fixed/manual path). No fake Fixed Rate control |
| **AC-CR5-10** | **No** create-time rate adjustment amount/% and **no** RTC invented |
| **AC-CR5-11** | **No** invented LIVE RMS / OTA / commission / yield engine — CURRENT `quoteStay` / `price_hotel_stay` only |
| **AC-CR5-12** | Date or room-type change **revalidates** quotes; stale priced selection is not kept silently as valid |
| **AC-CR5-13** | Empty rate catalogue and restriction-unavailable plans are honest (reason visible; not selectable as priced) |
| **AC-CR5-14** | Existing permission gates preserved for create: `requireRoutePackage("pms")`, `getBookingsAccess` / `requireReservationManager`. Quote access role mismatch (`requireRateManager` vs receptionist create) is **resolved or documented** in Eng plan — do not leave receptionist create broken. Flag Abel if entitlement / RLS **model** must change |
| **AC-CR5-15** | Room assign (Section 6), Guarantee/Confirm product (Section 7), packages (Section 8), email/SMS are **not** expanded |
| **AC-CR5-16** | Guest Waves 1–5 + GE1 + GE2 + GE3 stay **OPERATIONALLY ACCEPTED** / closed. This section does **not** reopen them |
| **AC-CR5-17** | Section 5 does **not** claim Phase 1 or full Create Reservation **DONE** |
| **AC-CR5-18** | Locked non-goals in §4 are **absent** |
| **AC-CR5-19** | Migration honesty: core path **LIKELY NONE**. Eng **confirms**. Dual-lane APPLY HELD only if SECURITY DEFINER pricing/create RPCs replaced. Unpriced permission must not silently change RLS model |
| **AC-CR5-20** | Additive expansion of existing `/restaurant/bookings/new` — **do not** rebuild a second Create Reservation product. Modern NORU sticky/boxes OK; **do not** clone legacy chrome |
| **AC-CR5-21** | Modern sticky UI may borrow **placement** from the reference Individual create screen (Rate Code / Rate & Total) but must not claim Fixed Rate LIVE |

---

## 6. QA / Security / Regression (summary)

- Developer (when authorised): `tsc` + lock tests for AC-CR5-1…21; browser rate list / select / sticky server total on `/restaurant/bookings/new`; unpriced permission Pending path; Confirm/confirmed blocked without rate when not permitted; null `_rate_plan_id` still creates unpriced only when allowed; create still re-prices from plan id.
- Independent QA (Rekik): required before merge PASS of the **engineering** PR (not this docs PR).
- Security: staff-only; tenant-scoped plans; preserve reservation gates; resolve quote role mismatch honestly; no new SECURITY DEFINER unless Abel-approved.
- Regression: Sections 1–4 shell / stay / availability / Company-TA (as shipped); walk-in same writer; `price_hotel_stay` restrictions unchanged; Rates admin calendar not broken; Guest GE closed; no Fixed Rate / adjustment / RTC invent.

---

## 7. Open Eng confirm items

1. **Unpriced permission shape:** owner/manager reuse vs named capability vs temporary Pending-for-all-managers. Document; Abel if RLS/entitlement model changes.
2. **`quoteStay` role vs create role:** receptionist can create today but `quoteStay` is `requireRateManager`. Align quote gate to reservation managers, keep manager-only, or dual-path — pick one honest rule so create quoting works for intended roles.
3. **Confirm gate ownership:** Section 7 vs tightening CURRENT status/submit now so Confirmed without rate cannot ship. Section 5 must expose state either way.
4. **Sticky vs Rate card duplication:** single server quote object rendered in both places vs sticky summary-only total + card detail — avoid two maths.
5. **Stale quote on date/type change:** auto-clear `ratePlanId` (CURRENT on type change) vs keep + mark invalid until re-quote succeeds.
6. **Fixed Rate later Spec?** Confirm OUT for Phase 1 Section 5; file follow-up only if product still wants manual override after seeing CURRENT.

---

## 8. Status table (locked)

| Item | Status |
|---|---|
| Spec | **ACCEPTED for Engineering** / **READY FOR PLANNING** |
| ENGINEERING | **NOT STARTED** — no code until TIP + Rekik plan approval |
| Implemented / PASS / LIVE / COMPLETE | **No** |
| Migration | **LIKELY NONE** (core). Eng confirms. Unpriced permission may be capability-only; Abel if model changes |
| Fixed Rate / create adjustment / RTC | **OUT** (CURRENT unsupported) |
| LIVE RMS / OTA / commission engine | **Not invented** |
| Phase 1 COMPLETE | **NO** |
| Create Reservation DONE | **NO** |
