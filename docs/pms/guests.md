# Guest Profile Module — programme overview

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | **Wave 1 IMPLEMENTED ON MAIN** (issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14). Wave 2 Spec **READY FOR ENGINEERING PLANNING** (gate OPENED). Waves 3–5 still **WAVE-GATED**. The module is **not** COMPLETE. |
| **Wave 1 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** — see [specs/guest-profile-module.md](./specs/guest-profile-module.md) |
| **Wave 2 Spec** | **READY FOR ENGINEERING PLANNING** — gate **OPENED** (Rekik intent 2026-09-14 via Advisor). **Not** implemented. |
| **Waves 3–5** | **SPECIFIED / WAVE-GATED** — explicit ungating still required |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | Wave 1 complete. Wave 2 gate **OPENED** — code only after issue + tech plan + Rekik plan approval. Waves 3–5 are **not** automatic. |
| **Classification** | Functional Spec / programme — Wave 1 CURRENT on `main`; Wave 2 planning only; **not** CURRENT that every card is LIVE |

> **Wave 1 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED completed; PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z. Wave 1 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 2 gate OPENED** (Rekik intent 2026-09-14 via Advisor). Spec is **READY FOR ENGINEERING PLANNING**. Code starts only after issue + tech plan + Rekik plan approval. Waves 3–5 remain **WAVE-GATED**. Do **not** claim Wave 2 implemented.
>
> Create once → use everywhere → enrich. The module is **COMPLETE** only after Waves 1–5 **and** hotel UAT. Do **not** treat Wave 1 merge as module COMPLETE.
>
> Do **not** invent LIVE OTA, payment-gateway settlement, or classic nightly room-and-tax night audit from this page. Code wins on conflict with catalogue copy.

Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This page does not redefine them.

---

## 1. Principle

| Rule | Meaning |
|---|---|
| **Create once** | One guest / company / group / travel-agent master, owned by the Guest Profile Module. |
| **Use everywhere** | Reservations, Front Office, Cashiering, Distribution (direct booking), and later Sales & Events **consume** these profiles. No second guest, company, or TA master elsewhere. |
| **Enrich** | Later waves add documents, stay KPIs, relationships, loyalty, comms, and privacy on the **same** records. |
| **Extend, do not restart** | Wave work continues `guest_profiles` / `guest_preferences` / `guest_profile_history` and the existing server functions and thin UI. |
| **Honest UI** | Placeholders are labelled by wave. **No fabricated KPI numbers.** |

The module is **COMPLETE** only when Waves 1–5 are done, Independent QA has passed, hotel UAT has passed, docs are reconciled to code, and Advisor ops review is recorded. See §6.

---

## 2. Two-layer commercial model (locked)

| Layer | What it is | What it is not |
|---|---|---|
| **1. Register masters** | Create / edit / list / search **Company**, **Group**, and **Travel Agent** accounts **inside the Guest module**. | Not a second CRM in Sales & Events, Reservations, or Cashiering. |
| **2. Associate individuals** | Link an individual guest to masters: employer, bill-to, booker TA, group member. | Not folio split / routing / city-ledger product (those stay in later cashiering / M1 work). |

Other modules consume these profiles. There is **no** second guest / company / TA master elsewhere.

| Explicitly out unless a later requirement reopens it | Why |
|---|---|
| Offline-first Guest UX | Not required for this module. Offline desk is optional later programme work, not Guest Wave 1–5. |
| Full Sales & Events group-block operations | Later. This module owns the **Group account master + links** only — not allotments, rooming lists, or MICE ops. |

Company / Group / TA **masters** are Wave 4. Wave 1 must not imply those masters are LIVE.

---

## 3. Ten-card north star (individuals)

UI default: Guest sidebar with a profile-type switcher **Individual \| Company \| Group \| TA**, **or** nested Accounts under Guest. **Ownership stays in Guest.** Engineering chooses the chrome in the tech plan; the Spec requires Guest-module ownership.

| # | Card | Wave that makes it real | Honesty rule |
|---|---|---|---|
| 1 | **Dashboard Overview** | 3 (KPIs); Wave 1 shows the card shell only | Real KPIs only — **no fake numbers** |
| 2 | **Directory** | **1** (individuals) | Reuse `listGuests` capabilities |
| 3 | **Information** | **1** (individuals) | Align to existing `GuestProfile`; prefer surfacing API ID **text** fields |
| 4 | **Identity & Documents** | 2 (upload / mask / verify); Wave 1 may show ID **text** only | No implied government verification |
| 5 | **Stay History** | 3 | From **real** reservations — not profile-event history alone |
| 6 | **Preferences** | 2 (complete product card; Setup-owned dropdowns — see Wave 2 addendum); API + a Preferences tab already exist | Do not claim Wave 2 complete because a tab already saves |
| 7 | **Loyalty & Value** | 4 | Real-derived only — no invented points or spend |
| 8 | **Relationships** | 4 | Roles to Company / Group / TA masters |
| 9 | **Notes / Comms / Activity** | 5 (product hub); notes + profile history exist today | Notes ≠ comms product |
| 10 | **Admin & Privacy** | 5 (suite); status / VIP exist today | Consent, export, anonymise, unmerge, audit |

Until a card’s wave exits, the shell may show **Coming in Wave N**. It must **not** display fabricated metrics.

---

## 4. Waves programme

Engineering works **wave-by-wave**. A later wave does not start until the prior wave has exited (docs + product exit criteria). Full testable Wave 1 ACs, the Wave 2 planning Spec, and wave-gated requirements for Waves 3–5 are in the [Functional Spec](./specs/guest-profile-module.md).

| Wave | Title | Engineering status | Exit (summary) |
|---|---|---|---|
| **1** | Shell + Directory + Information (Individuals) | **NOT STARTED** — Spec ready for Rekik review; **not** handed to Engineering until accepted | First-class Guest module; individual create / find / edit is the default path; 10-card shell honest |
| **2** | Identity upload / mask / verify; Preferences complete; controlled merge; consent recorded | **NOT STARTED / AWAITING PRIOR WAVE EXIT** | Docs on file, prefs complete, merge works (never silent), consent recorded |
| **1** | Shell + Directory + Information (Individuals) | **COMPLETE / MERGED** — issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14. OPERATIONALLY ACCEPTED / closed. | First-class Guest module; individual create / find / edit is the default path; 10-card shell honest |
| **2** | Identity upload / mask / verify; Preferences complete; controlled merge; consent recorded | Gate **OPENED** (Rekik 2026-09-14). Spec **READY FOR ENGINEERING PLANNING**. **AWAITING ISSUE + TECH PLAN + REKIK PLAN APPROVAL.** **Not** implemented. | Docs on file, prefs complete (Setup-owned dropdowns), merge works (never silent), consent recorded |
| **3** | Stay History from real reservations; 360 Dashboard KPIs real-derived; quick actions to Res / FO / Folio | **NOT STARTED / AWAITING WAVE GATE** | Real history + honest KPIs |
| **4** | (A) Company / Group / TA masters; (B) Relationships with roles; (C) Loyalty & Value real-derived | **NOT STARTED / AWAITING WAVE GATE** | Masters + associations + loyalty |
| **5** | Comms / Activity + Privacy finish (export / anonymise / unmerge) for individuals and masters as appropriate | **NOT STARTED / AWAITING WAVE GATE** | Full hub + hotel UAT-ready |

> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).** Wave 2 Preferences: room / bed / view / floor (and food / communication if Property Setup has catalogues) use **dropdown / multi-select** from that hotel’s Setup lists — not open free-text as the primary control. Optional **Other**; accessibility and special requests stay textarea. Detail: [Functional Spec §4](./specs/guest-profile-module.md#4-wave-2--identity-preferences-controlled-merge-consent). Wave 1 / issue #66 / PR #67 free-text tab is unchanged until this wave.
> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).** Wave 2 Preferences: room / bed / view / floor (and food / communication if Property Setup has catalogues) use **dropdown / multi-select** from that hotel’s Setup lists — not open free-text as the primary control. Optional **Other**; accessibility and special requests stay textarea. Detail: [Functional Spec §4](./specs/guest-profile-module.md#4-wave-2--identity-preferences-controlled-merge-consent). Wave 1 / issue #66 / PR #67 free-text tab is unchanged until this wave is implemented. Do **not** claim Wave 2 implemented.

---

## 5. CURRENT vs EXPECTED (summary)

Grounded in `main` at documentation time. **Code wins.** Detail and file evidence: [Functional Spec — CURRENT behaviour](./specs/guest-profile-module.md#2-current-behaviour-code-wins).

| Topic | CURRENT | EXPECTED (module complete) |
|---|---|---|
| Navigation | Individual list at `/restaurant/guests` (Front Office rail). Detail at `/restaurant/pms/reservations/guests/$guestId`. PMS catalogue entry is **Guest Services** (`planned`), not a Guest Profile module. | First-class **Guest Profile** sidebar module under `/restaurant/pms/…`. Ownership stays in Guest. Exact route is an Engineering proposal in the tech plan. |
| Directory | `listGuests` + list UI: search name / phone / email, status, VIP only. | Same capabilities as the default operational Directory for **individuals**. |
| Information | `GuestFormDialog` create / edit personal, address, VIP, notes. First name required. | Same fields as the Information card, extended to surface existing API ID **text** in Wave 1 (images in Wave 2). |
| Identity | API + FO check-in can persist `id_document_*`. Guest form / overview **do not** expose ID fields. No upload / mask / verify. | Wave 2: documents on file, masked, verifiable by staff. |
| Preferences | Table + `saveGuestPreferences`. Full field form on the guest-detail **Preferences** tab (not in `guest-bits.tsx` — that file is VIP / status badges only). Wave 1 / PR #67 remains **free-text** until Wave 2. | Wave 2: complete Preferences **card** in the 10-card shell. Primary room / bed / view / floor (and food / communication if catalogues exist) are **Setup-owned** dropdowns; optional Other; accessibility / special requests stay free-text. |
| Navigation | First-class **Guest Profile** (`guest-profile`) at `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue: group `commercial`, `moduleKey` `front_office`, `implementationStatus` `partial`. FR-9 redirects from `/restaurant/guests`, `/restaurant/guests/$guestId`, and `/restaurant/pms/reservations/guests/$guestId`. Guest Services (`guest-services`) remains the planned requests / concierge placeholder. | Same first-class Guest Profile ownership. Later waves do **not** move the module. Guest Services stays requests / concierge (E-S10), not this module. |
| Directory | `listGuests` + Individual Directory: search name / phone / email, status, VIP only. Row open goes to the canonical profile route. | Same capabilities as the default operational Directory for **individuals**. |
| Information | `GuestFormDialog` create / edit personal, address, VIP, notes, and ID **text**. First name required. Information / Overview shows the same ID text. | Same fields. Images / mask / verify stay Wave 2. |
| Identity | ID **text** (`idDocumentType`, `idDocumentNumber`, `idDocumentExpiry`) is on the form and Information. Identity & Documents **card** is Coming in Wave 2. No upload / mask / verify. | Wave 2: documents on file, masked, verifiable by staff. |
| Preferences | Table + `saveGuestPreferences`. Full field form remains on the Information workspace **Preferences** tab (not in `guest-bits.tsx` — that file is VIP / status badges only). Preferences **card** is Coming in Wave 2. Wave 1 / PR #67 remains **free-text** until Wave 2 is implemented. | Wave 2: complete Preferences **card** in the 10-card shell. Primary room / bed / view / floor (and food / communication if catalogues exist) are **Setup-owned** dropdowns; optional Other; accessibility / special requests stay free-text. **Not** implemented yet. |
| History | `guest_profile_history` on create / update / VIP / status / preference / note. | Wave 3 adds **stay** history from real reservations. Profile history remains. |
| Duplicates | `findGuestDuplicates` — warn; Open existing / Create anyway. **No merge.** | Wave 2: **controlled** merge, never silent. |
| Masters / relationships | **None.** Individuals only. | Wave 4. |
| Loyalty | **None** as a derived product. VIP is a boolean flag. | Wave 4: real-derived value. |
| Comms / privacy suite | Add-note + profile history. No consent / export / anonymise / unmerge product. | Wave 5. |
| Access | Package `pms` + existing guest manage gate. Receptionist vs owner/manager inconsistency **PRESERVED** (see §7.3). | Later waves keep that gate unless PM expands. Flag Abel if the entitlement **model** must change. |

---

## 6. Definition of Done (module)

The Guest Profile Module is **COMPLETE** only when **all** of the following are true:

| Gate | Required |
|---|---|
| Waves 1–5 | Each wave built against its Spec section, exited, and not skipped |
| Independent QA | Recorded PASS per wave (and module close) — `NOT RUN` is never `PASS` |
| Hotel UAT | Property staff have accepted the hub as operational |
| Docs reconciliation | This page and the Functional Spec match `main` (code wins; copy is corrected) |
| Advisor ops review | Recorded after the Design Execution Report |

**Process (locked):** Spec → Engineering **wave-by-wave** → QA → human merge → Design Execution Report → Docs reconciliation → Advisor review.

This overview plus the Functional Spec remain the programme record. Wave 1 is implemented on `main`. Wave 2 gate is **OPENED** for planning — **not** implemented. Waves 3–5 are still **WAVE-GATED**. The module is **not** COMPLETE until Waves 2–5 and hotel UAT also pass.

---

## 7. DOCUMENTATION / IMPLEMENTATION DISCREPANCIES

### 7.1 Guest Services is still planned requests — Guest Profile now exists

`src/packages/pms/lib/pms-modules.ts` now has a dedicated **`guest-profile`** catalogue entry (title **Guest Profile**, group `commercial`, `moduleKey` `front_office`, `implementationStatus` `partial`, canonical `/restaurant/pms/guests`).

`guest-services` remains **`planned`**, description *“Guest requests and concierge tracking — planned.”* Guest Services was **not** repurposed as this module.

| Claim someone might infer | CURRENT on `main` |
|---|---|
| Guest Services is the Guest Profile module | **False.** `/restaurant/pms/guest-services` is still the labelled requests / concierge placeholder (Option A **E-S10**). |
| Guest **profiles** are not live | **False.** Individual `guest_profiles` CRUD is LIVE on `/restaurant/pms/guests` (+ `$guestId`). |
| There is a first-class Guests PMS module key | **True after Wave 1.** Key is `guest-profile`. Do not treat `guest-services` as that key. |

### 7.2 ID text on form / Information — **RESOLVED on `main`**

`GuestProfile` / `createGuest` / `updateGuest` accept `idDocumentType`, `idDocumentNumber`, `idDocumentExpiry` (migration `0041_fo_checkin_stepper.sql`). Front Office check-in can write those columns.

**Wave 1 closed this gap.** `GuestFormDialog` and the Information / Overview Identity panel now show and edit those **text** fields. No upload / mask / verify (Wave 2). The Identity & Documents **card** remains Coming in Wave 2.

### 7.3 Access copy vs `canManageGuests` vs RLS

| Layer | CURRENT |
|---|---|
| `GUEST_MANAGE_ROLES` / `canManageGuests` | `owner`, `manager`, **`receptionist`** |
| File comments + denied-state UI copy | “Owner/manager only” / “Only owners and managers…” |
| RLS on `guest_profiles`, `guest_preferences`, `guest_profile_history` | `owner` **or** `manager` only — **not** receptionist |

Wave 1 **preserved** this existing gate. Do **not** silently expand or shrink roles. If a later wave requires an entitlement-**model** change, **flag Abel**.

### 7.4 Distribution catalogue (mention only)

`pms-modules.ts` marks Distribution `implementationStatus: "existing"` while live OTA / channel-manager sync does **not** exist. That is a **separate** known honesty issue ([commercial-readiness.md](./commercial-readiness.md) §5). Guest docs do **not** claim OTA. Direct booking may **consume** guest profiles; that is not LIVE OTA.

---

## 8. Related records

| Record | Role |
|---|---|
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | Master Spec: Wave 1 full ACs; Wave 2 READY FOR ENGINEERING PLANNING; Waves 3–5 wave-gated |
| [S1 + M1 Product Plan — Option A](./product-roadmap-s1-m1.md) | Wider programme. Guest Waves are **not** E-S01 and do **not** authorise that cycle. |
| [Commercial Readiness (2026-09-11)](./commercial-readiness.md) | Advisory baseline. Groups / company bill-to are **not** CURRENT. |
| [decisions/README.md](./decisions/README.md) | Short note: Wave 1 implemented; Wave 2 planning gate opened; Waves 3–5 still gated. |
| Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) | Wave 1 implementation issue — **CLOSED** completed. |
| PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) | Wave 1 implementation — **MERGED** 2026-09-14T09:15:10Z. |

---

## 9. QA / implementation status (Wave 1)

Grounded in the Wave 1 Design Execution Report after merge. **`NOT RUN` is not `PASS`.** Developer PARTIAL does not become PASS because Independent QA later passed.

| Item | Status |
|---|---|
| DESIGN COMPLETION | **COMPLETE** (Wave 1) |
| IMPLEMENTATION STATUS | **PASS** |
| AC-W1-1 … AC-W1-17 | All **IMPLEMENTED AS SPECIFIED / PASS** per DER |
| Approved deviations | **NONE** |
| Backend / DB / RPC / RLS | **NONE** material — reused existing guests stack |
| Issue | [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED (completed) |
| Implementation PR | [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z |

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `npx tsc --noEmit` PASS; Wave 1 lock tests 5/5 PASS (`guest-profile-wave1.test.ts`); eslint on Wave 1 sources PASS. Browser **QA-W1** / **SEC-W1** **NOT RUN** in the developer environment (signed-in PMS session not available). |
| Independent QA | **PASS** | Rekik 2026-09-14. Evidence: [issue #66 comment](https://github.com/NORUDEVGIT/NORU/issues/66#issuecomment-5662018639) and [PR #67 comment](https://github.com/NORUDEVGIT/NORU/pull/67#issuecomment-5662020604). |

**Residuals (not Wave 1 defects):**

- Receptionist vs owner/manager inconsistency (helper vs RLS vs denied-copy) is **PRESERVED**, not fixed (AC-W1-8 / SEC-W1-8).
- Preferences **card** is Coming in Wave 2. Existing Preferences tab / free-text remains on Information (REG-W1-4). Wave 2 Preferences are locked to Setup-owned dropdowns (Rekik addendum 2026-09-14) — **not** implemented.
- Wave 2 gate is **OPENED** for engineering **planning**. Waves 3–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.

---

## Closing

> **Wave 1 IMPLEMENTED ON MAIN** (#66 / #67). Wave 2 Spec **READY FOR ENGINEERING PLANNING** (gate OPENED) — **not** implemented. Waves 3–5 still **WAVE-GATED**. Module COMPLETE only after Waves 1–5 + hotel UAT.
>
> Extend existing guest code. Create once → use everywhere → enrich.
