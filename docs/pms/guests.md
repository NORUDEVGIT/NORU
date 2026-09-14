# Guest Profile Module — programme overview

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | **APPROVED FOR DOCS** (Rekik 2026-09-14) |
| **Wave 1 Spec** | **READY FOR REKIK REVIEW** — see [specs/guest-profile-module.md](./specs/guest-profile-module.md) |
| **Waves 2–5** | **SPECIFIED / WAVE-GATED** — engineering only after prior wave exit |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | **NOT automatic** until Wave 1 Spec is accepted for handoff |
| **Classification** | Functional Spec / programme — **not** CURRENT feature documentation that every card is LIVE, and **not** a Developer handoff |

> **APPROVED FOR DOCS (Rekik 2026-09-14).** Wave 1 Functional Spec is ready for Rekik review. Waves 2–5 are specified and wave-gated. This is **not** automatic Engineering assignment and **not** a Developer handoff until the Wave 1 Spec is accepted for handoff.
>
> Create once → use everywhere → enrich. The module is **COMPLETE** only after Waves 1–5 **and** hotel UAT.
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

Engineering works **wave-by-wave**. A later wave does not start until the prior wave has exited (docs + product exit criteria). Full testable Wave 1 ACs and wave-gated requirements for Waves 2–5 are in the [Functional Spec](./specs/guest-profile-module.md).

| Wave | Title | Engineering status | Exit (summary) |
|---|---|---|---|
| **1** | Shell + Directory + Information (Individuals) | **NOT STARTED** — Spec ready for Rekik review; **not** handed to Engineering until accepted | First-class Guest module; individual create / find / edit is the default path; 10-card shell honest |
| **2** | Identity upload / mask / verify; Preferences complete; controlled merge; consent recorded | **NOT STARTED / AWAITING PRIOR WAVE EXIT** | Docs on file, prefs complete, merge works (never silent), consent recorded |
| **3** | Stay History from real reservations; 360 Dashboard KPIs real-derived; quick actions to Res / FO / Folio | **NOT STARTED / AWAITING WAVE GATE** | Real history + honest KPIs |
| **4** | (A) Company / Group / TA masters; (B) Relationships with roles; (C) Loyalty & Value real-derived | **NOT STARTED / AWAITING WAVE GATE** | Masters + associations + loyalty |
| **5** | Comms / Activity + Privacy finish (export / anonymise / unmerge) for individuals and masters as appropriate | **NOT STARTED / AWAITING WAVE GATE** | Full hub + hotel UAT-ready |

> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).** Wave 2 Preferences: room / bed / view / floor (and food / communication if Property Setup has catalogues) use **dropdown / multi-select** from that hotel’s Setup lists — not open free-text as the primary control. Optional **Other**; accessibility and special requests stay textarea. Detail: [Functional Spec §4](./specs/guest-profile-module.md#4-wave-2--identity-preferences-controlled-merge-consent). Wave 1 / issue #66 / PR #67 free-text tab is unchanged until this wave.

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
| History | `guest_profile_history` on create / update / VIP / status / preference / note. | Wave 3 adds **stay** history from real reservations. Profile history remains. |
| Duplicates | `findGuestDuplicates` — warn; Open existing / Create anyway. **No merge.** | Wave 2: **controlled** merge, never silent. |
| Masters / relationships | **None.** Individuals only. | Wave 4. |
| Loyalty | **None** as a derived product. VIP is a boolean flag. | Wave 4: real-derived value. |
| Comms / privacy suite | Add-note + profile history. No consent / export / anonymise / unmerge product. | Wave 5. |
| Access | Package `pms` + existing guest manage gate. See §7. | Preserve that gate in Wave 1 unless PM expands. Flag Abel if the entitlement **model** must change. |

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

This overview plus the Functional Spec are **APPROVED FOR DOCS**. They are **not** Engineering assignment until the Wave 1 Spec is accepted for handoff. No GitHub issue is opened by this documentation cycle.

---

## 7. DOCUMENTATION / IMPLEMENTATION DISCREPANCIES

### 7.1 Guest Services catalogue understates live individual guests

`src/packages/pms/lib/pms-modules.ts` has `guest-services` as **`planned`**, description *“Guest profiles today; requests and concierge tracking are planned.”*

| Claim someone might infer | CURRENT on `main` |
|---|---|
| Guest Services is only a future module | The **route** `/restaurant/pms/guest-services` is a labelled placeholder (requests / concierge). |
| Guest **profiles** are not live | **False.** Individual `guest_profiles` CRUD is LIVE via `/restaurant/guests` and reservation-nested detail. |
| There is a first-class Guests PMS module key | **False.** There is no dedicated Guests / Guest Profile catalogue key yet. |

Wave 1 should add first-class **Guest Profile** nav ownership **without** inventing a second guest master, and **without** treating Guest Services (requests / concierge — Option A **E-S10**) as this module.

### 7.2 API richer than Guest form (ID text)

`GuestProfile` / `createGuest` / `updateGuest` accept `idDocumentType`, `idDocumentNumber`, `idDocumentExpiry` (migration `0041_fo_checkin_stepper.sql`). Front Office check-in can write those columns. `GuestFormDialog` and the guest-detail Overview **do not** show them. Wave 1 prefers surfacing those **text** fields on Information / Identity **without** upload.

### 7.3 Access copy vs `canManageGuests` vs RLS

| Layer | CURRENT |
|---|---|
| `GUEST_MANAGE_ROLES` / `canManageGuests` | `owner`, `manager`, **`receptionist`** |
| File comments + denied-state UI copy | “Owner/manager only” / “Only owners and managers…” |
| RLS on `guest_profiles`, `guest_preferences`, `guest_profile_history` | `owner` **or** `manager` only — **not** receptionist |

Wave 1 **preserves** this existing gate. Do **not** silently expand or shrink roles. If the new route requires an entitlement-**model** change, **flag Abel**.

### 7.4 Distribution catalogue (mention only)

`pms-modules.ts` marks Distribution `implementationStatus: "existing"` while live OTA / channel-manager sync does **not** exist. That is a **separate** known honesty issue ([commercial-readiness.md](./commercial-readiness.md) §5). Guest docs do **not** claim OTA. Direct booking may **consume** guest profiles; that is not LIVE OTA.

---

## 8. Related records

| Record | Role |
|---|---|
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | Master Spec: Wave 1 full ACs; Waves 2–5 wave-gated |
| [S1 + M1 Product Plan — Option A](./product-roadmap-s1-m1.md) | Wider programme. Guest Waves are **not** E-S01 and do **not** authorise that cycle. |
| [Commercial Readiness (2026-09-11)](./commercial-readiness.md) | Advisory baseline. Groups / company bill-to are **not** CURRENT. |
| [decisions/README.md](./decisions/README.md) | Short note: Rekik approved this module for Docs. |

---

## Closing

> **APPROVED FOR DOCS (Rekik 2026-09-14).** Not automatic Engineering assignment. Not a Developer handoff until Wave 1 Spec acceptance.
>
> Extend existing guest code. Create once → use everywhere → enrich. Module COMPLETE only after Waves 1–5 + hotel UAT.
