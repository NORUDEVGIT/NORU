# Guest Profile Module — programme overview

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | **Waves 1–3 IMPLEMENTED ON MAIN**. Wave 4 **IN IMPLEMENTATION** on `feature/95-guest-profile-wave-4` (issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95)). Wave 5 still **WAVE-GATED**. The module is **not** COMPLETE. |
| **Wave 1 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** — see [specs/guest-profile-module.md](./specs/guest-profile-module.md) |
| **Wave 2 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** (#72 / #76 / #79). OPERATIONALLY ACCEPTED / closed after Independent QA PASS. |
| **Wave 3 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** (#81 / #85 / #87 / #90). OPERATIONALLY ACCEPTED / closed after Independent QA PASS. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**. |
| **Waves 4–5** | Wave 4 **IN IMPLEMENTATION** ([#95](https://github.com/NORUDEVGIT/NORU/issues/95)). Wave 5 still **WAVE-GATED**. |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | Waves 1–3 complete. Waves 4–5 are **not** automatic. |
| **Classification** | Functional Spec / programme — Waves 1–3 CURRENT on `main`; **not** CURRENT that every card is LIVE |

> **Wave 1 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED completed; PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z. Wave 1 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 2 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED completed; PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z; follow-up PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. Wave 2 delivered Identity upload / mask / staff verify, the Preferences card (Setup-owned), controlled merge, consent, and the Preferences-tab sync fix. Wave 2 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 3 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z; PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85), [#87](https://github.com/NORUDEVGIT/NORU/pull/87), and [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed via #90. Wave 3 delivered Stay History LIVE, honest Dashboard KPIs, quick actions, guest-context naming, and Directory-back on guest-required cards. Wave 3 is OPERATIONALLY ACCEPTED / closed. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**.
>
> Create once → use everywhere → enrich. The module is **COMPLETE** only after Waves 1–5 **and** hotel UAT. Do **not** treat Wave 1, Wave 2, or Wave 3 merge as module COMPLETE.
>
> Do **not** invent LIVE OTA, payment-gateway settlement, or classic nightly room-and-tax night audit from this page. Code wins on conflict with catalogue copy.

Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This page does not redefine them.

---

## 1. Principle

| Rule | Meaning |
|---|---|
| **Create once** | One guest / company / group / travel-agent master, owned by the Guest Profile Module. |
| **Use everywhere** | Reservations, Front Office, Cashiering, Distribution (direct booking), and later Sales & Events **consume** these profiles. No second guest, company, or TA master elsewhere. |
| **Enrich** | Later waves add stay KPIs, relationships, loyalty, comms, and privacy finish on the **same** records. |
| **Extend, do not restart** | Wave work continues `guest_profiles` / `guest_preferences` / `guest_profile_history` (plus Wave 2 `guest_documents` / `pms_preference_options`) and the existing server functions and thin UI. |
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

Company / Group / TA **masters** are Wave 4. Waves 1–3 must not imply those masters are LIVE.

---

## 3. Ten-card north star (individuals)

UI default: Guest sidebar with a profile-type switcher **Individual \| Company \| Group \| TA**, **or** nested Accounts under Guest. **Ownership stays in Guest.**

| # | Card | Wave that makes it real | Honesty rule |
|---|---|---|---|
| 1 | **Dashboard Overview** | **3** LIVE — honest KPIs | Real-derived only — **no fake numbers** |
| 2 | **Directory** | **1** (individuals) | Reuse `listGuests` capabilities |
| 3 | **Information** | **1** (individuals) | Align to existing `GuestProfile`; ID **text** + mask after Wave 2 |
| 4 | **Identity & Documents** | **2** LIVE — upload / mask / staff verify | Staff verify ≠ government KYC |
| 5 | **Stay History** | **3** LIVE — real reservations | From **real** reservations — not profile-event history |
| 6 | **Preferences** | **2** LIVE — Setup-owned card; Overview **Preferences** tab selects this card (#79) | Values stored as `id:<uuid>` / `other:<text>` prefixes — see §7.5 |
| 7 | **Loyalty & Value** | **4 LIVE** — derived stay / folio figures | Real-derived only — no invented points or spend |
| 8 | **Relationships** | **4 LIVE** — employer / bill-to / booker TA / group member | Bill-to is association only, not folio split |
| 9 | **Notes / Comms / Activity** | 5 (product hub); notes + profile history exist today | Notes ≠ comms product |
| 10 | **Admin & Privacy** | 5 (suite); status / VIP exist today; Wave 2 consent is on Information | Consent recorded ≠ export / anonymise / unmerge |

Until a card’s wave exits, the shell may show **Coming in Wave N**. It must **not** display fabricated metrics.

---

## 4. Waves programme

Engineering works **wave-by-wave**. A later wave does not start until the prior wave has exited (docs + product exit criteria). Full testable Wave 1–3 ACs and wave-gated requirements for Waves 4–5 are in the [Functional Spec](./specs/guest-profile-module.md).

| Wave | Title | Engineering status | Exit (summary) |
|---|---|---|---|
| **1** | Shell + Directory + Information (Individuals) | **COMPLETE / MERGED** — issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14. OPERATIONALLY ACCEPTED / closed. | First-class Guest module; individual create / find / edit is the default path; 10-card shell honest |
| **2** | Identity upload / mask / verify; Preferences complete; controlled merge; consent recorded | **COMPLETE / MERGED** — issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. OPERATIONALLY ACCEPTED / closed. | Docs on file, prefs complete (Setup-owned dropdowns), merge works (never silent), consent recorded |
| **3** | Stay History from real reservations; 360 Dashboard KPIs real-derived; quick actions to Res / FO / Folio | **COMPLETE / MERGED** — issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z · PR [#85](https://github.com/NORUDEVGIT/NORU/pull/85) MERGED 2026-09-14T11:53:26Z · PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) MERGED 2026-09-14T12:12:30Z · PR [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED 2026-09-14T12:32:41Z. OPERATIONALLY ACCEPTED / closed. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**. | Real history + honest KPIs + guest-context + Directory-back |
| **4** | (A) Company / Group / TA masters; (B) Relationships with roles; (C) Loyalty & Value real-derived | **IN IMPLEMENTATION** — issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) | Masters + associations + loyalty |
| **5** | Comms / Activity + Privacy finish (export / anonymise / unmerge) for individuals and masters as appropriate | **NOT STARTED / AWAITING WAVE GATE** | Full hub + hotel UAT-ready |

> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).** Wave 2 Preferences: room / bed / view / floor (and food / communication if Property Setup has catalogues) use **dropdown / multi-select** from that hotel’s Setup lists — not open free-text as the primary control. Optional **Other**; accessibility and special requests stay textarea. **Delivered on `main`.** Detail: [Functional Spec §4](./specs/guest-profile-module.md#4-wave-2--identity-preferences-controlled-merge-consent). Preference values persist as `id:<uuid>` / `other:<text>` in the existing text columns — see §7.5.

---

## 5. CURRENT vs EXPECTED (summary)

Grounded in `main` at documentation time (after #85 / #87 / #90). **Code wins.** Detail and file evidence: [Functional Spec — CURRENT behaviour](./specs/guest-profile-module.md#2-current-behaviour-code-wins).

| Topic | CURRENT | EXPECTED (module complete) |
|---|---|---|
| Navigation | First-class **Guest Profile** (`guest-profile`) at `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue: group `commercial`, `moduleKey` `front_office`, `implementationStatus` `partial`. FR-9 redirects from `/restaurant/guests`, `/restaurant/guests/$guestId`, and `/restaurant/pms/reservations/guests/$guestId`. Guest Services (`guest-services`) remains the planned requests / concierge placeholder. | Same first-class Guest Profile ownership. Later waves do **not** move the module. Guest Services stays requests / concierge (E-S10), not this module. |
| Directory | `listGuests` + Individual Directory: search name / phone / email, status, VIP only. Row open goes to the canonical profile route. Default list excludes retired (merged) profiles. Masked ID + Merge guests. | Same capabilities as the default operational Directory for **individuals**. |
| Information | `GuestFormDialog` create / edit personal, address, VIP, notes, and ID **text**. First name required. Information / Overview shows masked ID text + consent. | Same fields. Wave 5 adds export / anonymise / unmerge. |
| Identity | Identity & Documents **card LIVE**: upload / list (signed URLs), staff verify / reject with actor + time. Ordinary Directory / Information **mask** the ID number (last four + Reveal). Copy is staff confirmation only — never government KYC. Storage: `guest_documents` + `property-images` at `{restaurantId}/guests/{guestId}/{uuid}.{ext}`. | Same store / retrieve / mask / verify surface. FO arrival stepper stays E-S13, not this module. |
| Preferences | Preferences **card LIVE** (Setup-owned). Room → `room_types`; Floor → `hotel_floors` (gated if empty); Bed / View / Food / Communication → Setup `pms_preference_options` CRUD at `/restaurant/settings#guest-profile`. Optional Other; accessibility / special requests stay textarea. Empty catalogue gates the field with a Setup link. Meal plans are **not** food prefs. Single writer `saveGuestPreferences` / `guest_preferences`. Overview **Preferences** tab selects the Preferences card and renders that form (#79). | Same card. Later id mapping may replace the `id:` / `other:` prefix convention (see §7.5). |
| History | Two surfaces. **Stay History** card LIVE: real `hotel_reservations` for that `guest_id` (confirmation #, dates, nights, status, room type / room # as stored; honest empty — no sample rows). Information **History** tab remains `guest_profile_history` profile events and is labelled **not** stay history. | Same split. Wave 5 may add a comms hub; profile history remains. |
| Dashboard Overview | **LIVE** honest KPIs: stays + nights first (`nightsBetween`, same helper as Reservations); in-house / upcoming counts; last stay when a checked-out reservation exists. Quoted `room_subtotal` and posted folio balance only when amounts exist — otherwise **Not available**, never fake `0.00`. Header names the selected guest (#87): **This guest's overview**. | Same honest 360. Loyalty points stay Wave 4. |
| Quick actions | Reservation / Front Office / Folio jump to **existing** surfaces when the record exists **and** the caller has access. Hidden when the surface is out of role; disabled when the record is missing (no invented “open folio” success). | Same read + jump only — no Guest-owned reservation / folio writers. |
| Directory-back | Shell-level sticky **← Directory** on every LIVE guest-required card (#90). `?card=` restores the same card after picking another guest. Directory itself has no back-to-Directory control. | Same affordance on later LIVE cards via `isGuestRequiredProfileCard`. |
| Empty-state Directory CTA | Primary **Open Directory** button on guest-required cards when no guest is selected (#91 / #93). `?card=` restores the same card after pick. Coming-in-Wave cards stay copy-only. Directory itself has no Open Directory dead-end. | Same CTA on later LIVE cards via `showEmptyDirectoryCta`. |
| Duplicates / merge | Wave 1 warn remains: Open existing / Create anyway — **no auto-merge**. Controlled `mergeGuests` behind explicit confirm. Soft-retire (`inactive` + `merged_into_guest_id`); reassign `hotel_reservations.guest_id`; move documents; history `merged_from` / `merged_into`. | Unmerge is Wave 5. |
| Consent | Data-processing and marketing: `granted` / `refused` / `not_asked` + recorded at / by. Visible on Information. SET3 `consentDefaults` are guidance only when `not_asked`. History `consent_updated`. | Wave 5 privacy suite (export / anonymise / unmerge / audit) builds on this record. |
| Masters / relationships | **Wave 4 LIVE** on the implementation branch: Guest-owned `guest_account_masters` + `guest_account_links`. Roles: employer, bill-to, booker TA, group member. Unlink does not delete parties. | Same. Group account ≠ S&E blocks. |
| Loyalty | **Wave 4 LIVE** derived from Wave 3 stay / folio reads. No points. VIP remains a staff flag on Information. | Same honesty. |
| Comms / privacy suite | Add-note + profile history + Wave 2 consent. No export / anonymise / unmerge product. | Wave 5. |
| Access | Package `pms` + existing guest manage gate. Receptionist vs owner/manager inconsistency **PRESERVED** (see §7.3). | Later waves keep that gate unless PM expands. Flag Abel if the entitlement **model** must change. |
| Migration 0051 | Non-prod applied on `qcwptraosaudcbjasmul` (version `20260914110546` / `pms_guest_profile_wave2`). **Production 0051 NOT applied** (Abel / PM gate). Surfaces that need the schema degrade to an unavailable message until apply. | Production apply after Abel / PM explicit approval. |
| Migration 0053 | Dual-lane `0053_pms_guest_profile_wave4.sql` **APPLY HELD** for Abel/PM. Not applied from this agent. | Apply non-prod first; production explicit. |

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

This overview plus the Functional Spec remain the programme record. Waves 1–3 are implemented on `main`. Waves 4–5 are still **WAVE-GATED**. The module is **not** COMPLETE until Waves 4–5 and hotel UAT also pass.

---

## 7. DOCUMENTATION / IMPLEMENTATION DISCREPANCIES

### 7.1 Guest Services is still planned requests — Guest Profile now exists

`src/packages/pms/lib/pms-modules.ts` has a dedicated **`guest-profile`** catalogue entry (title **Guest Profile**, group `commercial`, `moduleKey` `front_office`, `implementationStatus` `partial`, canonical `/restaurant/pms/guests`).

`guest-services` remains **`planned`**, description *“Guest requests and concierge tracking — planned.”* Guest Services was **not** repurposed as this module.

| Claim someone might infer | CURRENT on `main` |
|---|---|
| Guest Services is the Guest Profile module | **False.** `/restaurant/pms/guest-services` is still the labelled requests / concierge placeholder (Option A **E-S10**). |
| Guest **profiles** are not live | **False.** Individual `guest_profiles` CRUD is LIVE on `/restaurant/pms/guests` (+ `$guestId`). |
| There is a first-class Guests PMS module key | **True after Wave 1.** Key is `guest-profile`. Do not treat `guest-services` as that key. |

### 7.2 ID text on form / Information — **RESOLVED on `main`** (Wave 1)

`GuestProfile` / `createGuest` / `updateGuest` accept `idDocumentType`, `idDocumentNumber`, `idDocumentExpiry` (migration `0041_fo_checkin_stepper.sql`). Front Office check-in can write those columns.

**Wave 1 closed the text-field gap.** `GuestFormDialog` and the Information / Overview Identity panel show and edit those **text** fields. **Wave 2** added mask (last four + Reveal) plus the Identity & Documents **card** (upload / staff verify).

### 7.3 Access copy vs `canManageGuests` vs RLS — **PRESERVED**

| Layer | CURRENT |
|---|---|
| `GUEST_MANAGE_ROLES` / `canManageGuests` | `owner`, `manager`, **`receptionist`** |
| File comments + denied-state UI copy | “Owner/manager only” / “Only owners and managers…” |
| RLS on `guest_profiles`, `guest_preferences`, `guest_profile_history`, `guest_documents` | `owner` **or** `manager` only — **not** receptionist |

Waves 1–3 **preserved** this existing gate. Do **not** silently expand or shrink roles. If a later wave requires an entitlement-**model** change, **flag Abel**.

### 7.4 Distribution catalogue (mention only)

`pms-modules.ts` marks Distribution `implementationStatus: "existing"` while live OTA / channel-manager sync does **not** exist. That is a **separate** known honesty issue ([commercial-readiness.md](./commercial-readiness.md) §5). Guest docs do **not** claim OTA. Direct booking may **consume** guest profiles; that is not LIVE OTA.

### 7.5 Preference storage prefixes — **DOCUMENTATION / IMPLEMENTATION honesty**

Wave 2 reuses the existing eight `guest_preferences` **text** columns. Catalogue-backed values are stored as:

- `id:<uuid>` — selected Setup option (room type, floor, or `pms_preference_options` row)
- `other:<text>` — optional Other path

That is a **prefix convention**, not a Setup foreign key. Legacy free-text is treated as Other unless it matches a current option id or label. Do **not** pretend a stored `id:` string is a database FK. A later mapping wave may replace the prefix; until then this is the honest persistence model.

This is **Approved deviation 1** from the Wave 2 DER (TIP honesty residual). Documented here as **DOCUMENTATION / IMPLEMENTATION honesty**, not as a Wave 2 defect.

### 7.6 Production migration 0051 hold

File: `supabase/migrations/0051_pms_guest_profile_wave2.sql` (dual-lane `drizzle/migrations/0051_pms_guest_profile_wave2.sql`).

| Environment | Status |
|---|---|
| Non-prod `qcwptraosaudcbjasmul` | **Applied** — version `20260914110546` / `pms_guest_profile_wave2` |
| Production | **NOT applied** — Abel / PM gate |

Until production apply, Identity / merge / consent / preference-options surfaces that need the new schema degrade to an unavailable message (`WAVE2_MIGRATION_UNAVAILABLE`). Do **not** treat code merge as production schema apply.

### 7.7 Directory-back shell UX — **ON MAIN** (Rekik 2026-09-14)

Wave 3 residual / Guest shell UX — **not** Waves 4–5 product scope. Full note: [Functional Spec §5.15](./specs/guest-profile-module.md#515-wave-3-residuals--ux-consistency--directory-back-rekik-2026-09-14).

**DELIVERED.** Any LIVE Guest Profile card that requires a selected guest first (Dashboard, Stay History, Identity, Preferences — and later LIVE cards via `isGuestRequiredProfileCard`) shows the same shell-level sticky **Directory** back arrow as Information (`GuestDirectoryBackLink`, `data-testid="guest-profile-directory-back"`). Staff return to Directory, pick another guest, and land on that guest’s **same** card (`?card=` restore). Directory itself has no back-to-Directory control.

| Item | Status on `main` |
|---|---|
| Guest-context headers (#87) | **ON MAIN** — PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) MERGED |
| Directory-back on guest-required cards | **ON MAIN** — PRs [#89](https://github.com/NORUDEVGIT/NORU/pull/89) / [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed. |
| Empty / no-guest-selected Directory CTA | **ON MAIN** — PR [#93](https://github.com/NORUDEVGIT/NORU/pull/93) MERGED. Issue [#91](https://github.com/NORUDEVGIT/NORU/issues/91) CLOSED completed. See §7.8 / Spec §5.16. |

### 7.8 Empty / no-guest-selected Directory CTA — **RESOLVED on `main`** (Rekik 2026-09-14)

Wave 3 residual / Guest shell UX (post–Wave 3) — **not** Waves 4–5 product scope. Full note: [Functional Spec §5.16](./specs/guest-profile-module.md#516-wave-3-residuals--ux-consistency--empty-state-directory-cta-rekik-2026-09-14).

**DELIVERED.** Every LIVE guest-required card empty / no-guest-selected state includes a primary **Open Directory** button (`GuestDirectoryOpenButton`, `data-testid="guest-profile-open-directory"`) that navigates to Guest Directory — copy alone is not enough. Aligns with Directory-back ([#90](https://github.com/NORUDEVGIT/NORU/pull/90)): after guest selected, sticky **← Directory**; before selection, empty-state CTA into Directory (`?card=` restore). Issue [#91](https://github.com/NORUDEVGIT/NORU/issues/91) CLOSED completed via PR [#93](https://github.com/NORUDEVGIT/NORU/pull/93). AC-EMPTY-1…6 **PASS**.

---

## 8. Related records

| Record | Role |
|---|---|
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | Master Spec: Wave 1–3 ACs + DER results; Waves 4–5 wave-gated |
| [S1 + M1 Product Plan — Option A](./product-roadmap-s1-m1.md) | Wider programme. Guest Waves are **not** E-S01 and do **not** authorise that cycle. |
| [Commercial Readiness (2026-09-11)](./commercial-readiness.md) | Advisory baseline. Groups / company bill-to are **not** CURRENT. |
| [decisions/README.md](./decisions/README.md) | Short note: Waves 1–3 implemented; Waves 4–5 still gated. |
| Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) | Wave 1 implementation issue — **CLOSED** completed. |
| PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) | Wave 1 implementation — **MERGED** 2026-09-14T09:15:10Z. |
| Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) | Wave 2 implementation issue — **CLOSED** completed. |
| PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) | Wave 2 implementation — **MERGED** 2026-09-14T10:57:47Z. |
| PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) | Wave 2 Preferences tab sync — **MERGED** 2026-09-14T11:20:17Z. |
| Issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) | Wave 3 implementation issue — **CLOSED** completed 2026-09-14T12:37:18Z. |
| PR [#85](https://github.com/NORUDEVGIT/NORU/pull/85) | Wave 3 Stay History / honest KPIs / quick actions — **MERGED** 2026-09-14T11:53:26Z. |
| PR [#86](https://github.com/NORUDEVGIT/NORU/pull/86) | Wave 3 guest-context duplicate — **CLOSED** (not merged); superseded by #87. |
| PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) | Wave 3 guest-context headers — **MERGED** 2026-09-14T12:12:30Z. |
| Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) | Directory-back residual — **CLOSED** completed via #90. |
| PR [#89](https://github.com/NORUDEVGIT/NORU/pull/89) | Directory-back shell UX docs — **MERGED**. |
| PR [#90](https://github.com/NORUDEVGIT/NORU/pull/90) | Directory-back on guest-required cards — **MERGED** 2026-09-14T12:32:41Z. |
| Issue [#91](https://github.com/NORUDEVGIT/NORU/issues/91) | Empty-state Open Directory CTA — **CLOSED** completed via #93. |
| PR [#92](https://github.com/NORUDEVGIT/NORU/pull/92) | Empty-state Directory CTA docs residual — **MERGED**. |
| PR [#93](https://github.com/NORUDEVGIT/NORU/pull/93) | Empty-state Open Directory button — **MERGED** 2026-09-14T12:48:14Z. |
| Issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) | Wave 4 masters / relationships / loyalty — **OPEN**. |

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
- Wave 1 delivered Directory + Information. Wave 2 later delivered the Preferences **card** and Identity **card** (see §10).
- Waves 4–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.

---

## 10. QA / implementation status (Wave 2)

Grounded in the Wave 2 Design Execution Report after #76 + #79. **`NOT RUN` is not `PASS`.** Developer PARTIAL does not become PASS because Independent QA later passed.

| Item | Status |
|---|---|
| DESIGN COMPLETION | **COMPLETE** (Wave 2) |
| IMPLEMENTATION STATUS | **PASS** (after #79) |
| AC-W2-1 … AC-W2-14 | All **IMPLEMENTED AS SPECIFIED / PASS** per DER |
| Approved deviations | **THREE** — see list below (prefix storage; #76 / #79 process; Developer browser PARTIAL) |
| Backend / DB | Additive dual-lane `0051_pms_guest_profile_wave2.sql`. Non-prod **PASS** on `qcwptraosaudcbjasmul` (`20260914110546`); production **Abel-gated**. |
| RPC / RLS | Existing guest manage gate. Receptionist residual **PRESERVED**. No entitlement redesign. Abel was not flagged. |
| Issue | [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED (completed) |
| Implementation PR | [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z |
| Follow-up PR | [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z (Preferences tab → Preferences card) |

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; Wave 1 + Wave 2 lock tests PASS. Browser AC-W2 matrix **NOT RUN** in the developer environment. Approved deviation 3: Independent QA covered Preferences selection. |
| Independent QA | **PASS** | Rekik 2026-09-14. OVERALL PASS after #79 Preferences-tab residual (that residual is what Independent QA exercised for tab → card). Evidence: [issue #72](https://github.com/NORUDEVGIT/NORU/issues/72#issuecomment-5663204867) and [PR #79](https://github.com/NORUDEVGIT/NORU/pull/79#issuecomment-5663204648). |

**Wave 2 delivered ONLY:**

1. Identity upload / mask / staff verify
2. Preferences card (Setup-owned options + Other + textareas)
3. Controlled merge (never silent)
4. Consent recorded (`granted` / `refused` / `not_asked`)
5. #79 Preferences tab sync — Overview **Preferences** selects the Preferences card

**Approved deviations (DER):**

| # | Deviation | Class |
|---|---|---|
| 1 | Preference values stored as `id:<uuid>` / `other:<text>` prefix convention in existing text columns rather than a Setup FK | **DOCUMENTATION / IMPLEMENTATION honesty** (TIP residual). See §7.5. |
| 2 | PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) merged **before** Preferences Independent QA PASS. The residual shipped as PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) **after** issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED | **Process note only** — not a product defect. #72 stays closed; #79 is the Wave 2 residual, not a new wave. |
| 3 | Developer browser QA remained **PARTIAL** | Independent QA covered Preferences selection. Developer PARTIAL does not become PASS. |

**Residuals / FINAL (not Wave 2 defects):**

- Receptionist vs owner/manager RLS inconsistency remains **PRESERVED**.
- Production migration `0051_pms_guest_profile_wave2` **Abel-gated**. Non-prod **PASS** on `qcwptraosaudcbjasmul` (version `20260914110546`).
- Waves 4–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.
- DESIGN COMPLETION: **COMPLETE** (Wave 2). IMPLEMENTATION STATUS: **PASS**. The module is **not** COMPLETE.

---

## 11. QA / implementation status (Wave 3)

Grounded in the Wave 3 Design Execution Report after #85 + #87 + #90. **`NOT RUN` is not `PASS`.** Developer PARTIAL does not become PASS because Independent QA later passed.

| Item | Status |
|---|---|
| DESIGN COMPLETION | **COMPLETE** (Wave 3) |
| IMPLEMENTATION STATUS | **PASS** (after residuals #87 + #90) |
| AC-W3-1 … AC-W3-17 | All **IMPLEMENTED AS SPECIFIED / PASS** per DER |
| AC-DIR-1 … AC-DIR-7 | All **IMPLEMENTED AS SPECIFIED / PASS** per DER (#90 / #88) |
| Approved deviations | **THREE** — see list below (#85 early merge → #87; #86 duplicate of #87; Developer browser PARTIAL) |
| Backend / DB | **NONE** — additive reads of existing `hotel_reservations` / `guest_folios` / `folio_transactions`. **No migration.** |
| RPC / RLS | Existing guest manage gate. Reservation / FO / folio jumps reuse existing surface access. Receptionist residual **PRESERVED**. RLS **not** weakened. Abel was not flagged. |
| Issue | [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED (completed) 2026-09-14T12:37:18Z |
| Residual issue | [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed via #90 |
| Implementation PR | [#85](https://github.com/NORUDEVGIT/NORU/pull/85) MERGED 2026-09-14T11:53:26Z |
| Guest-context PR | [#87](https://github.com/NORUDEVGIT/NORU/pull/87) MERGED 2026-09-14T12:12:30Z |
| Directory-back PR | [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED 2026-09-14T12:32:41Z |

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; Wave 1 + Wave 2 + Wave 3 lock tests PASS (36/36 after #90, including AC-DIR-1…7). Browser QA-W3 / SEC-W3 / guest A vs B **NOT RUN** in the developer environment. Approved deviation 3. |
| Independent QA | **PASS** | Rekik 2026-09-14 after residuals. Evidence: [issue #81 DER](https://github.com/NORUDEVGIT/NORU/issues/81#issuecomment-5664019733) and [PR #90](https://github.com/NORUDEVGIT/NORU/pull/90#issuecomment-5664008291). |

**Wave 3 delivered ONLY:**

1. Stay History LIVE from real `hotel_reservations` for that `guest_id` — honest empty if none
2. Dashboard Overview LIVE with honest KPIs (stays / nights first; amounts only when stored)
3. Quick actions to existing Reservation / Front Office / Folio when the record + access exist
4. Guest-context naming on Dashboard and Stay History (#87)
5. Directory-back sticky control on every LIVE guest-required card (#90)
6. Profile-event History remains separate and is labelled **not** stay history

**Approved deviations (DER):**

| # | Deviation | Class |
|---|---|---|
| 1 | PR [#85](https://github.com/NORUDEVGIT/NORU/pull/85) merged **before** the guest-context UX fix. Residual shipped as PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) | **Process note only** — not a product defect. |
| 2 | PR [#86](https://github.com/NORUDEVGIT/NORU/pull/86) CLOSED as **duplicate** of #87 (same residual, older branch tip) | **Process note only.** Canonical guest-context follow-up is #87. |
| 3 | Developer browser QA remained **PARTIAL** | Independent QA covered guest-context and Directory-back after residuals. Developer PARTIAL does not become PASS. |

**Residuals / FINAL (not Wave 3 defects):**

- Receptionist vs owner/manager RLS inconsistency remains **PRESERVED**.
- Production migration `0051_pms_guest_profile_wave2` remains **Abel-gated** (Wave 2 leftover). Wave 3 added **no** migration.
- Guest-context (#87) and Directory-back (#90 / #88) residuals are **RESOLVED on `main`**.
- Empty-state Open Directory CTA (#91 / #93) is **RESOLVED on `main`**. Do **not** reopen [#81](https://github.com/NORUDEVGIT/NORU/issues/81).
- Waves 4–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.
- DESIGN COMPLETION: **COMPLETE** (Wave 3). IMPLEMENTATION STATUS: **PASS**. The module is **not** COMPLETE.

---

## 12. QA / implementation status (Wave 4)

Grounded in issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95). **`NOT RUN` is not `PASS`.** Independent QA is Rekik after merge-ready PR.

| Item | Status |
|---|---|
| DESIGN COMPLETION | **IN IMPLEMENTATION** (Wave 4) |
| IMPLEMENTATION STATUS | Developer QA in this PR |
| AC-W4-1 … AC-W4-23 | Locked in `guest-profile-wave4.test.ts` (Spec expansion PR [#96](https://github.com/NORUDEVGIT/NORU/pull/96)) |
| Backend / DB | Dual-lane `0053_pms_guest_profile_wave4.sql` **APPLY HELD** — not applied from this agent |
| RPC / RLS | Existing `pms` + `requireGuestManager`. Wave 4 RLS matches `guest_profiles` (owner/manager). Receptionist residual **PRESERVED**. No SECURITY DEFINER. Entitlement architecture **not** redesigned. |
| Honesty | No invented points. Bill-to association only (`transfersSupported: false`). Group account ≠ S&E blocks. Wave 5 still Coming. |

**OUT-OF-SCOPE FINDING (AC-W4-5 residual):** `create_hotel_reservation_priced` / new-reservation forms do not take master IDs. Staff attach Guest masters on reservation detail. FO typed company/group labels remain search text.

---

## Closing

> **Wave 1 IMPLEMENTED ON MAIN** (#66 / #67). **Wave 2 IMPLEMENTED ON MAIN** (#72 / #76 / #79). **Wave 3 IMPLEMENTED ON MAIN** (#81 / #85 / #87 / #90). Wave 3 is OPERATIONALLY ACCEPTED / closed. Wave 4 **IN IMPLEMENTATION** (#95). Wave 5 still **WAVE-GATED**. Module COMPLETE only after Waves 1–5 + hotel UAT.
>
> Extend existing guest code. Create once → use everywhere → enrich.
