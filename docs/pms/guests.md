# Guest Profile Module — programme overview

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | **Waves 1–2 IMPLEMENTED ON MAIN**. Wave 1: issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14. Wave 2: issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z · follow-up PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. Waves 3–5 still **WAVE-GATED**. The module is **not** COMPLETE. |
| **Wave 1 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** — see [specs/guest-profile-module.md](./specs/guest-profile-module.md) |
| **Wave 2 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** (#72 / #76 / #79). OPERATIONALLY ACCEPTED / closed after Independent QA PASS. |
| **Waves 3–5** | **SPECIFIED / WAVE-GATED** — explicit ungating still required |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | Waves 1–2 complete. Waves 3–5 are **not** automatic. |
| **Classification** | Functional Spec / programme — Waves 1–2 CURRENT on `main`; **not** CURRENT that every card is LIVE |

> **Wave 1 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED completed; PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z. Wave 1 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 2 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED completed; PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z; follow-up PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. Wave 2 delivered Identity upload / mask / staff verify, the Preferences card (Setup-owned), controlled merge, consent, and the Preferences-tab sync fix. Wave 2 is OPERATIONALLY ACCEPTED / closed.
>
> Create once → use everywhere → enrich. The module is **COMPLETE** only after Waves 1–5 **and** hotel UAT. Do **not** treat Wave 1 or Wave 2 merge as module COMPLETE.
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

Company / Group / TA **masters** are Wave 4. Waves 1–2 must not imply those masters are LIVE.

---

## 3. Ten-card north star (individuals)

UI default: Guest sidebar with a profile-type switcher **Individual \| Company \| Group \| TA**, **or** nested Accounts under Guest. **Ownership stays in Guest.**

| # | Card | Wave that makes it real | Honesty rule |
|---|---|---|---|
| 1 | **Dashboard Overview** | 3 (KPIs); Wave 1 shows the card shell only | Real KPIs only — **no fake numbers** |
| 2 | **Directory** | **1** (individuals) | Reuse `listGuests` capabilities |
| 3 | **Information** | **1** (individuals) | Align to existing `GuestProfile`; ID **text** + mask after Wave 2 |
| 4 | **Identity & Documents** | **2** LIVE — upload / mask / staff verify | Staff verify ≠ government KYC |
| 5 | **Stay History** | 3 | From **real** reservations — not profile-event history alone |
| 6 | **Preferences** | **2** LIVE — Setup-owned card; Overview **Preferences** tab selects this card (#79) | Values stored as `id:<uuid>` / `other:<text>` prefixes — see §7.5 |
| 7 | **Loyalty & Value** | 4 | Real-derived only — no invented points or spend |
| 8 | **Relationships** | 4 | Roles to Company / Group / TA masters |
| 9 | **Notes / Comms / Activity** | 5 (product hub); notes + profile history exist today | Notes ≠ comms product |
| 10 | **Admin & Privacy** | 5 (suite); status / VIP exist today; Wave 2 consent is on Information | Consent recorded ≠ export / anonymise / unmerge |

Until a card’s wave exits, the shell may show **Coming in Wave N**. It must **not** display fabricated metrics.

---

## 4. Waves programme

Engineering works **wave-by-wave**. A later wave does not start until the prior wave has exited (docs + product exit criteria). Full testable Wave 1–2 ACs and wave-gated requirements for Waves 3–5 are in the [Functional Spec](./specs/guest-profile-module.md).

| Wave | Title | Engineering status | Exit (summary) |
|---|---|---|---|
| **1** | Shell + Directory + Information (Individuals) | **COMPLETE / MERGED** — issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14. OPERATIONALLY ACCEPTED / closed. | First-class Guest module; individual create / find / edit is the default path; 10-card shell honest |
| **2** | Identity upload / mask / verify; Preferences complete; controlled merge; consent recorded | **COMPLETE / MERGED** — issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. OPERATIONALLY ACCEPTED / closed. | Docs on file, prefs complete (Setup-owned dropdowns), merge works (never silent), consent recorded |
| **3** | Stay History from real reservations; 360 Dashboard KPIs real-derived; quick actions to Res / FO / Folio | **NOT STARTED / AWAITING WAVE GATE** | Real history + honest KPIs |
| **4** | (A) Company / Group / TA masters; (B) Relationships with roles; (C) Loyalty & Value real-derived | **NOT STARTED / AWAITING WAVE GATE** | Masters + associations + loyalty |
| **5** | Comms / Activity + Privacy finish (export / anonymise / unmerge) for individuals and masters as appropriate | **NOT STARTED / AWAITING WAVE GATE** | Full hub + hotel UAT-ready |

> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).** Wave 2 Preferences: room / bed / view / floor (and food / communication if Property Setup has catalogues) use **dropdown / multi-select** from that hotel’s Setup lists — not open free-text as the primary control. Optional **Other**; accessibility and special requests stay textarea. **Delivered on `main`.** Detail: [Functional Spec §4](./specs/guest-profile-module.md#4-wave-2--identity-preferences-controlled-merge-consent). Preference values persist as `id:<uuid>` / `other:<text>` in the existing text columns — see §7.5.

---

## 5. CURRENT vs EXPECTED (summary)

Grounded in `main` at documentation time (after #76 / #79). **Code wins.** Detail and file evidence: [Functional Spec — CURRENT behaviour](./specs/guest-profile-module.md#2-current-behaviour-code-wins).

| Topic | CURRENT | EXPECTED (module complete) |
|---|---|---|
| Navigation | First-class **Guest Profile** (`guest-profile`) at `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue: group `commercial`, `moduleKey` `front_office`, `implementationStatus` `partial`. FR-9 redirects from `/restaurant/guests`, `/restaurant/guests/$guestId`, and `/restaurant/pms/reservations/guests/$guestId`. Guest Services (`guest-services`) remains the planned requests / concierge placeholder. | Same first-class Guest Profile ownership. Later waves do **not** move the module. Guest Services stays requests / concierge (E-S10), not this module. |
| Directory | `listGuests` + Individual Directory: search name / phone / email, status, VIP only. Row open goes to the canonical profile route. Default list excludes retired (merged) profiles. Masked ID + Merge guests. | Same capabilities as the default operational Directory for **individuals**. |
| Information | `GuestFormDialog` create / edit personal, address, VIP, notes, and ID **text**. First name required. Information / Overview shows masked ID text + consent. | Same fields. Wave 5 adds export / anonymise / unmerge. |
| Identity | Identity & Documents **card LIVE**: upload / list (signed URLs), staff verify / reject with actor + time. Ordinary Directory / Information **mask** the ID number (last four + Reveal). Copy is staff confirmation only — never government KYC. Storage: `guest_documents` + `property-images` at `{restaurantId}/guests/{guestId}/{uuid}.{ext}`. | Same store / retrieve / mask / verify surface. FO arrival stepper stays E-S13, not this module. |
| Preferences | Preferences **card LIVE** (Setup-owned). Room → `room_types`; Floor → `hotel_floors` (gated if empty); Bed / View / Food / Communication → Setup `pms_preference_options` CRUD at `/restaurant/settings#guest-profile`. Optional Other; accessibility / special requests stay textarea. Empty catalogue gates the field with a Setup link. Meal plans are **not** food prefs. Single writer `saveGuestPreferences` / `guest_preferences`. Overview **Preferences** tab selects the Preferences card and renders that form (#79). | Same card. Later id mapping may replace the `id:` / `other:` prefix convention (see §7.5). |
| History | `guest_profile_history` on create / update / VIP / status / preference / note / document / merge / consent. | Wave 3 adds **stay** history from real reservations. Profile history remains. |
| Duplicates / merge | Wave 1 warn remains: Open existing / Create anyway — **no auto-merge**. Controlled `mergeGuests` behind explicit confirm. Soft-retire (`inactive` + `merged_into_guest_id`); reassign `hotel_reservations.guest_id`; move documents; history `merged_from` / `merged_into`. | Unmerge is Wave 5. |
| Consent | Data-processing and marketing: `granted` / `refused` / `not_asked` + recorded at / by. Visible on Information. SET3 `consentDefaults` are guidance only when `not_asked`. History `consent_updated`. | Wave 5 privacy suite (export / anonymise / unmerge / audit) builds on this record. |
| Masters / relationships | **None.** Individuals only. | Wave 4. |
| Loyalty | **None** as a derived product. VIP is a boolean flag. | Wave 4: real-derived value. |
| Comms / privacy suite | Add-note + profile history + Wave 2 consent. No export / anonymise / unmerge product. | Wave 5. |
| Access | Package `pms` + existing guest manage gate. Receptionist vs owner/manager inconsistency **PRESERVED** (see §7.3). | Later waves keep that gate unless PM expands. Flag Abel if the entitlement **model** must change. |
| Migration 0051 | Non-prod applied on `qcwptraosaudcbjasmul` (version `20260914110546` / `pms_guest_profile_wave2`). **Production 0051 NOT applied** (Abel / PM gate). Surfaces that need the schema degrade to an unavailable message until apply. | Production apply after Abel / PM explicit approval. |

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

This overview plus the Functional Spec remain the programme record. Waves 1–2 are implemented on `main`. Waves 3–5 are still **WAVE-GATED**. The module is **not** COMPLETE until Waves 3–5 and hotel UAT also pass.

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

Waves 1–2 **preserved** this existing gate. Do **not** silently expand or shrink roles. If a later wave requires an entitlement-**model** change, **flag Abel**.

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

**REQUIRED.** Any Guest Profile card that requires a selected guest first (Dashboard, Stay History, Identity, Preferences, and later live cards) must provide the same easy **Directory back arrow** as Information (or a shell-level sticky back-to-Directory). Staff must always be able to return to Directory, pick another guest, and see that guest’s same card without dead-ends.

| Item | Status on `main` |
|---|---|
| Guest-context headers (#87) | **ON MAIN** — PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) |
| Directory-back on guest-required cards | **ON MAIN** — PRs [#89](https://github.com/NORUDEVGIT/NORU/pull/89) / [#90](https://github.com/NORUDEVGIT/NORU/pull/90) |
| Empty / no-guest-selected Directory CTA | **OPEN** — see §7.8 / Spec §5.16 |

### 7.8 Empty / no-guest-selected Directory CTA — **OPEN** residual (Rekik 2026-09-14)

Wave 3 residual / Guest shell UX (post–Wave 3) — **not** Waves 4–5 product scope. Full note: [Functional Spec §5.16](./specs/guest-profile-module.md#516-wave-3-residuals--ux-consistency--empty-state-directory-cta-rekik-2026-09-14).

**REQUIRED.** Every guest-required card empty / no-guest-selected state must include a **primary CTA** (e.g. Open Directory / Select a guest) that navigates to Guest Directory — copy alone is not enough. Aligns with Directory-back ([#90](https://github.com/NORUDEVGIT/NORU/pull/90)): after guest selected, sticky **← Directory**; before selection, empty-state CTA into Directory.

---

## 8. Related records

| Record | Role |
|---|---|
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | Master Spec: Wave 1–2 ACs + DER results; Waves 3–5 wave-gated |
| [S1 + M1 Product Plan — Option A](./product-roadmap-s1-m1.md) | Wider programme. Guest Waves are **not** E-S01 and do **not** authorise that cycle. |
| [Commercial Readiness (2026-09-11)](./commercial-readiness.md) | Advisory baseline. Groups / company bill-to are **not** CURRENT. |
| [decisions/README.md](./decisions/README.md) | Short note: Waves 1–2 implemented; Waves 3–5 still gated. |
| Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) | Wave 1 implementation issue — **CLOSED** completed. |
| PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) | Wave 1 implementation — **MERGED** 2026-09-14T09:15:10Z. |
| Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) | Wave 2 implementation issue — **CLOSED** completed. |
| PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) | Wave 2 implementation — **MERGED** 2026-09-14T10:57:47Z. |
| PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) | Wave 2 Preferences tab sync — **MERGED** 2026-09-14T11:20:17Z. |
| PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) | Wave 3 guest-context headers — **MERGED**. |
| PR [#89](https://github.com/NORUDEVGIT/NORU/pull/89) | Directory-back shell UX — **MERGED**. |
| PR [#90](https://github.com/NORUDEVGIT/NORU/pull/90) | Directory-back on guest-required cards — **MERGED**. Empty-state Directory CTA residual still **OPEN** (§7.8 / Spec §5.16). |

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
- Waves 3–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.

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
- Waves 3–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.
- DESIGN COMPLETION: **COMPLETE** (Wave 2). IMPLEMENTATION STATUS: **PASS**. The module is **not** COMPLETE.

---

## Closing

> **Wave 1 IMPLEMENTED ON MAIN** (#66 / #67). **Wave 2 IMPLEMENTED ON MAIN** (#72 / #76 / #79). Waves 3–5 still **WAVE-GATED**. Module COMPLETE only after Waves 1–5 + hotel UAT.
>
> Extend existing guest code. Create once → use everywhere → enrich.
