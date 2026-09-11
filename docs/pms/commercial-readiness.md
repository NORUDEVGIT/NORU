# NORU PMS Commercial Readiness & Gap Analysis (documentation record)

| Field | Value |
|---|---|
| **Title** | NORU PMS Commercial Readiness & Gap Analysis (documentation record) |
| **Date** | 2026-09-11 |
| **Advisor** | NORU PMS Hospitality Product Advisor |
| **Authorised for documentation by** | Rekik (Vice PM — PMS) |
| **Overall PM** | Abel |
| **Source** | Read-only analysis of [NORUDEVGIT/NORU](https://github.com/NORUDEVGIT/NORU) (`main`); recommendation status **READY FOR PM REVIEW** |
| **UI** | Live PMS UI **NOT VERIFIED** in the advisory session (no staging login). **Code wins on conflict.** |
| **Classification** | **ADVISORY ONLY** |

> **ADVISORY ONLY** — This record does **not** approve engineering. It does **not** create backlog items. It does **not** authorise a Phase 1 Spec, GitHub issue, or developer handoff.
>
> Status: **READY FOR PM REVIEW**. Not an engineering Spec. Not CURRENT feature documentation for each PMS area.
>
> Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This tree does not redefine them.

This page records commercial-readiness advice grounded in a read-only review of `main` on 2026-09-11. Where **EXPECTED** (what a modern rooms PMS would need to sell without hard limitations) and **CURRENT** (what the code on `main` actually implements) differ, both are stated. **`NOT RUN` / `NOT VERIFIED` is never `PASS`.**

Do **not** treat this file as live-capability documentation. Do **not** invent LIVE OTA connectivity, payment-gateway settlement, tax-complete hotel accounting, or a classic nightly room-and-tax night audit from this record.

---

## 1. Executive conclusion by segment

| Segment | Readiness | Sell |
|---|---|---|
| Small hotel | **PILOT READY** (near small-hotel ready with disclosed limits) | **PILOT ONLY** |
| Mid-size hotel | **NOT READY** | **NO** |
| Large hotel | **NOT READY** | **NO** |

**Primary answer:** NORU PMS can run a simplified independent rooms-hotel day for a direct-booking / walk-in boutique. It is **not** safe to sell as a complete modern PMS without hard, written sales limitations.

This is a commercial-readiness conclusion, not a claim that every hotel-day step is `PASS`. See §3 and §4.

---

## 2. Currently supportable customer profile

### Supportable (pilot, with written limitations)

Independent boutique / guest house / small lodge (~5–40 rooms).

| Trait | CURRENT fit |
|---|---|
| Operation | Owner-manager or a small desk |
| Demand | Walk-in, phone, and NORU **direct booking** |
| Folio | One folio |
| Tender | Cash / recorded card tender / bank-transfer **labels** (recorded tender — not a payment gateway) |
| Outlets | Optional restaurant → PMS **charge-to-room** when both packages are enabled |
| Distribution | Accepts **manual / no OTA** |
| Groups | **No** groups |
| Company bill-to | **No** |
| Room charge | **Stay-level** room charge (not classic nightly accrual) |

### Not supportable

Do not sell, imply, or demo as ready for:

- OTA-heavy properties
- Group / MICE business
- Corporate billing
- Multi-folio routing
- Multi-property chains
- Enterprise PMS claims

---

## 3. Hotel-day assessment summary

Statuses below are **advisory assessments** of commercial readiness for a simplified independent rooms-hotel day. They are **not** QA results and **not** CURRENT feature docs.

| Stage | Assessment | Notes (EXPECTED vs CURRENT) |
|---|---|---|
| Before arrival | **MOSTLY PASS** | EXPECTED: deposits, cancellation-fee engine, first-class multi-room. CURRENT gaps: deposit is **manual only**; **no** formal cancellation-fee engine; multi-room **NOT VERIFIED** as first-class. |
| Arrival | **PASS with gaps** | ID / document capture **MISSING**. Housekeeping readiness gate **PARTIAL**. |
| During stay | **PASS with gaps** | Guest request board **DEFERRED**. Folio transfers **MISSING**. |
| Departure | **PARTIAL** | Checkout and folio settle are **separate**. No verified hard block requiring zero folio balance before checkout. Receipt / invoice **NOT VERIFIED** / weak. |
| End of day | **PARTIAL** | Night-audit exceptions plus `close_business_date` exist. Room charge is **stay-level**, not classic nightly room + tax. Financial / tax pack **PARTIAL** / **MISSING**. |

`NOT VERIFIED` items are left as **NOT VERIFIED**. Live PMS UI was **not** exercised in the advisory session.

---

## 4. Area gap matrix highlights

The full letter-by-letter matrix lived in the 2026-09-11 advisory session. This record keeps the commercially material highlights only. Absence of a row is **not** a `PASS`.

| Area | Status | Commercial severity | Advisory note |
|---|---|---|---|
| Tax / fees | **MISSING** | **CRITICAL** | No property tax / fee engine. Do not claim tax-complete hotel accounting. |
| Checkout | **PARTIAL** | **HIGH** | Front-office checkout and folio settlement are separate. Outstanding balance does not hard-block checkout. |
| Night audit | **PARTIAL** | **HIGH** | Exception checks + business-date close. **Not** classic nightly room + tax posting. |
| OTA / distribution | **FOUNDATION** | **CRITICAL** | Direct booking is live. Channel-manager / live OTA sync is **not**. See §5. |
| Groups | **DEFERRED** | **HIGH** for mid+ | Sales & Events is planned. Not a mid-size or MICE product. |
| Folio transfers / advanced folio | **MISSING** / unsupported | **HIGH** for mid+ | Ledger has no folio-to-folio transfer. No split / routing / company bill-to. |
| Payments / card | **PARTIAL** | **HIGH** | Recorded tender labels only. **Not** payment-gateway settlement. |

---

## 5. DOCUMENTATION / IMPLEMENTATION DISCREPANCY

`src/packages/pms/lib/pms-modules.ts` marks **Distribution** as `implementationStatus: "existing"`.

That catalogue flag must **not** be read as LIVE OTA / channel-manager connectivity.

| Claim someone might infer | CURRENT on `main` |
|---|---|
| Distribution module exists as a PMS surface | Yes — catalogue + workspace + foundation tables / helpers |
| NORU **direct booking** | Live |
| Live OTA sync / channel manager | **Does not exist** |
| Distribution as LIVE OTA connectivity | **Do not document** |

Document Distribution as an **OTA foundation** plus a live **direct-booking** engine. Do **not** document the OTA foundation as LIVE OTA connectivity. Code wins if any later copy conflicts with this distinction.

---

## 6. What we can / must not promise

### Can safely promise (pilot, written limitations)

- Rooms PMS for a **small independent / boutique** property
- Reservations, desk, rooms / rates, guests
- Housekeeping
- Basic folio and cashier shifts
- Business-date close with exception checks
- **Direct booking**
- Optional restaurant **charge-to-room** (when both packages are enabled)
- An **honest pilot** with a written limitations sheet

### Must not promise

- Live OTA / channel manager
- Groups / corporate / agent billing
- Payment-gateway settlement
- Folio split / transfer / routing
- Full tax-compliant hotel accounting
- Classic nightly room-and-tax night audit
- Enterprise / multi-property PMS
- A complete mid-market PMS

---

## 7. Recommended roadmap (Phases 1–5) — summary only

These phases are **advice**, not an approved programme and not a backlog.

| Phase | Intent | Summary |
|---|---|---|
| **1** | Small-hotel **sale blockers** | Checkout vs folio settlement rules; tax / fees baseline; room-posting model decision; receipt / statement; sales limitation sheet |
| **2** | Small-hotel **commercial maturity** | Deposit / cancel; housekeeping checkout automation; cashier variance; audit UI; direct-booking pay rules |
| **3** | **Mid-size readiness** | Advanced folio; companies; stronger permissions; report pack; maintenance depth |
| **4** | **Distribution / groups / controls** | Live OTA **or** partner channel manager; groups / allotments; travel agents; manager approvals |
| **5** | **Large / enterprise** | Scale, routing, gateway, multi-property, governance, interfaces — **only** with a commercial case |

Phase 1 is **not** authorised by this document.

---

## 8. First recommended cycle

| Field | Value |
|---|---|
| **Name** | **Pilot Front-Desk Day Integrity** |
| **Label** | **AWAITING PM APPROVAL** |
| **Engineering status** | **NOT READY FOR DEVELOPER** |

This document alone creates:

- **no** Functional Spec
- **no** GitHub issue
- **no** engineering handoff

**Why first (brief):** enforceable departure settlement and a clear room-charge / tax story are required before a confident small-hotel pilot.

PM review (Rekik and/or Abel) must approve any first development cycle **before** the requirement → Spec → Developer flow starts.

---

## Closing

> **ADVISORY ONLY.** Status: **READY FOR PM REVIEW.**
>
> Awaiting Rekik and/or Abel approval of any first development cycle before the requirement → Spec → Developer flow.
>
> This record does not approve engineering, does not create backlog items, and does not authorise a Phase 1 Spec, issue, or developer handoff.
