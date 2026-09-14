# Functional Spec — Guest Profile Module

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | Waves 1–2 Spec **ACCEPTED** + **IMPLEMENTED ON MAIN** (#66 / #67; #72 / #76 / #79). Waves 3–5 still **WAVE-GATED**. |
| **Wave 1 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** (OPERATIONALLY ACCEPTED / closed) |
| **Wave 2 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** — issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z |
| **Waves 3–5** | **SPECIFIED / WAVE-GATED** — explicit ungating still required |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | Waves 1–2 complete. Waves 3–5 are **not** automatic. |
| **Product requirement** | Rekik 2026-09-14 — Waves 1–2 accepted and implemented |
| **Programme overview** | [../guests.md](../guests.md) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Wave 1 Spec ACCEPTED + IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED completed; PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z. Wave 1 is **OPERATIONALLY ACCEPTED** / closed.
>
> **Wave 2 Spec ACCEPTED + IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED completed; PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z; follow-up PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. Wave 2 is **OPERATIONALLY ACCEPTED** / closed. Waves 3–5 stay **WAVE-GATED**. The module is **not** COMPLETE.
>
> Extend existing guest code — do **not** restart.
>
> Create once → use everywhere → enrich. Separate **CURRENT** (what `main` does) from **EXPECTED** (what a later wave must deliver). Do **not** invent LIVE OTA, payment-gateway settlement, or classic nightly room-and-tax night audit.

This document is the master Functional Spec for the Guest Profile Module. Wave 1 ACs remain the accepted contract. Wave 2 ACs in §4 remain the accepted contract (now implemented). Waves 3–5 stay wave-gated.

---

## 0. Locked product intent (all waves)

### 0.1 Principle

Create once → use everywhere → enrich. Other PMS (and later Sales & Events) surfaces **consume** Guest-owned profiles. No second guest / company / travel-agent master is created outside this module.

### 0.2 Two-layer commercial model (locked)

| Layer | Requirement |
|---|---|
| **1. Register masters** | Company, Group, and Travel Agent — create / edit / list / search **in the Guest module** (Wave 4). |
| **2. Associate individuals** | Link guests to masters: employer, bill-to, booker TA, group member (Wave 4). |

| Out unless a later requirement reopens it | Notes |
|---|---|
| Offline-first Guest UX | Not in Waves 1–5. |
| Full Sales & Events group-block ops | Later. This module: Group **account master + links** only. |

### 0.3 Ten-card north star (individuals)

| # | Card | First LIVE wave |
|---|---|---|
| 1 | Dashboard Overview | 3 (real KPIs); Wave 1 = shell / placeholder |
| 2 | Directory | **1** |
| 3 | Information | **1** |
| 4 | Identity & Documents | 2 (images); Wave 1 may surface ID **text** |
| 5 | Stay History | 3 |
| 6 | Preferences | 2 (complete card) |
| 7 | Loyalty & Value | 4 |
| 8 | Relationships | 4 |
| 9 | Notes / Comms / Activity | 5 (hub); notes exist today |
| 10 | Admin & Privacy | 5 (suite); VIP / status exist today |

UI default: Guest sidebar with profile-type switcher **Individual \| Company \| Group \| TA**, **or** nested Accounts under Guest. **Ownership stays in Guest.**

Honesty: cards that are not yet in-wave show **Coming in Wave N**. They must **not** show fabricated KPI numbers.

---

## 1. Evidence paths (code wins)

| Kind | Path |
|---|---|
| Server functions | `src/packages/pms/lib/guests.functions.ts` |
| Access helpers | `src/packages/pms/lib/guests.server.ts` |
| Wave 1 catalogue / card lock | `src/packages/pms/lib/guest-profile-wave1.ts` — Identity + Preferences cards `live: true` |
| Wave 1 lock tests | `src/packages/pms/lib/guest-profile-wave1.test.ts` |
| Wave 2 helpers / encoding | `src/packages/pms/lib/guest-profile-wave2.ts` (`id:<uuid>` / `other:<text>` prefixes; ID mask) |
| Wave 2 lock tests | `src/packages/pms/lib/guest-profile-wave2.test.ts` |
| Identity card | `src/packages/pms/components/guests/guest-identity-card.tsx` |
| Preferences card | `src/packages/pms/components/guests/guest-preferences-card.tsx` |
| Consent panel | `src/packages/pms/components/guests/guest-consent-panel.tsx` |
| Merge dialog | `src/packages/pms/components/guests/guest-merge-dialog.tsx` |
| Setup preference options | `src/packages/pms/components/settings/pms-preference-options-editor.tsx` |
| Create / edit dialog | `src/packages/pms/components/guests/guest-form-dialog.tsx` |
| VIP / status badges | `src/packages/pms/components/guests/guest-bits.tsx` |
| 10-card shell | `src/packages/pms/components/workspaces/guest-profile-workspace.tsx` |
| Individual directory | `src/packages/pms/components/workspaces/guest-directory-workspace.tsx` |
| Information workspace | `src/packages/pms/components/workspaces/guest-detail-workspace.tsx` |
| Canonical directory | `src/routes/restaurant/pms/guests.index.tsx` → `/restaurant/pms/guests` |
| Canonical profile | `src/routes/restaurant/pms/guests.$guestId.tsx` → `/restaurant/pms/guests/$guestId` |
| FR-9 directory redirect | `src/routes/restaurant/guests/index.tsx` → `/restaurant/pms/guests` |
| FR-9 profile redirect | `src/routes/restaurant/guests/$guestId.tsx` → `/restaurant/pms/guests/$guestId` |
| FR-9 reservations redirect | `src/routes/restaurant/pms/reservations.guests.$guestId.tsx` → `/restaurant/pms/guests/$guestId` |
| Guest Services placeholder | `src/routes/restaurant/pms/guest-services.tsx` (requests / concierge — **not** this module) |
| PMS catalogue | `src/packages/pms/lib/pms-modules.ts` — `guest-profile` (**partial**); `guest-services` still **planned** |
| Tables | `guest_profiles`, `guest_preferences`, `guest_profile_history` (`0012`); ID columns (`0041`); Wave 2 `guest_documents` + `pms_preference_options` + merge / consent columns (`0051_pms_guest_profile_wave2.sql`) |

---

## 2. CURRENT behaviour (code wins)

### 2.1 Live server functions

| Function | Behaviour |
|---|---|
| `getGuestsAccess` | Returns `{ role, canManage }` where `canManage = canManageGuests(role)`. |
| `listGuests` | Tenant-scoped list. Optional `search` (name / email / phone / `phone_normalized`), `status` (`active` \| `inactive`), `vipOnly`, `limit` (default 100, max 200). Ordered by `updated_at` desc. Default list **excludes** retired (merged) profiles (`merged_into_guest_id` is null). |
| `getGuest` | Profile + preferences (or empty defaults) + last 100 `guest_profile_history` rows with actor names + consent. |
| `createGuest` | Inserts `guest_profiles`; records `created`. First name required (Zod + DB check). |
| `updateGuest` | Updates profile; records `profile_updated` and/or `vip_changed` when those fields change. |
| `setGuestVip` / `setGuestStatus` | Dedicated toggles; history events `vip_changed` / `status_changed`. |
| `saveGuestPreferences` | Upsert `guest_preferences`; event `preference_updated` when fields differ. **Single writer** — no second prefs table. Catalogue values stored as `id:<uuid>` / `other:<text>` prefixes in the existing text columns. |
| `addGuestNote` | History-only `note_added` (does not write `guest_profiles.notes`). |
| `findGuestDuplicates` | Same property; normalized email and/or phone; optional `excludeGuestId`; max 10. **No unique constraint. No silent merge.** |
| `createGuestDocumentUpload` / `registerGuestDocument` / `listGuestDocuments` / `reviewGuestDocument` | Identity files under existing `property-images` at `{restaurantId}/guests/{guestId}/{uuid}.{ext}`. Staff verify / reject with actor + time. |
| `mergeGuests` | Explicit confirm only. Soft-retire retired (`inactive` + `merged_into_guest_id`); reassign `hotel_reservations.guest_id`; move documents; history `merged_from` / `merged_into`. |
| `saveGuestConsent` | Data-processing + marketing: `granted` \| `refused` \| `not_asked` + recorded at / by. History `consent_updated`. |

`requireGuestManager` wraps `withPmsPackage` + `requireModuleRole(..., "front_office", GUEST_MANAGE_ROLES, ...)`.

### 2.2 `GuestProfile` fields (API)

| Group | Fields |
|---|---|
| Identity | `firstName` (required), `lastName`, `fullName` (derived) |
| Contact | `phone`, `email` (validated if present) |
| Personal | `nationality`, `language`, `dateOfBirth` |
| Address | `addressLine1`, `addressLine2`, `city`, `region`, `country`, `postalCode` |
| ID text (API) | `idDocumentType` (`passport` \| `national_id` \| `driving_licence` \| `other`), `idDocumentNumber`, `idDocumentExpiry` |
| Flags | `vipStatus`, `guestStatus` (`active` \| `inactive`) |
| Merge | `mergedIntoGuestId` (null unless retired into another individual) |
| Consent | `consent.dataProcessing` / `consent.marketing`: `granted` \| `refused` \| `not_asked` + recorded at / by. `consent.available` is false until migration 0051 is applied. SET3 defaults are guidance only. |
| Other | `notes`, `linkedCustomerUserId` (stored; no linking workflow), `createdAt`, `updatedAt` |

### 2.3 Preferences fields (API + Preferences card)

`roomPreference`, `bedPreference`, `floorPreference`, `viewPreference`, `foodPreference`, `communicationPreference`, `accessibilityRequirements`, `specialRequests`.

Catalogue-backed fields persist as `id:<uuid>` or `other:<text>` in those text columns — a **prefix convention**, not a Setup FK. See [../guests.md](../guests.md) §7.5.

### 2.4 History events recorded today

`created`, `profile_updated`, `vip_changed`, `status_changed`, `preference_updated`, `note_added`, `document_uploaded`, `document_verified`, `document_rejected`, `merged_from`, `merged_into`, `consent_updated`.

This is **profile activity**, not reservation stay history.

### 2.5 Live UI (post–Wave 2 `main`)

| Surface | What staff see |
|---|---|
| `/restaurant/pms/guests` | Canonical Guest Profile directory. 10-card shell; landing card is **Directory**. Profile-type hook: Individual LIVE; Company / Group / TA disabled and labelled **not LIVE**. Masked ID numbers. Merge guests. |
| `/restaurant/pms/guests/$guestId` | Canonical profile. Shell defaults to **Information**. Directory + Information + **Identity** + **Preferences** LIVE. Waves 3–5 cards **Coming in Wave N** with no fabricated KPIs. |
| FR-9 redirects | `/restaurant/guests`, `/restaurant/guests/$guestId`, and `/restaurant/pms/reservations/guests/$guestId` redirect to the canonical Guest Profile routes. |
| Individual Directory | `listGuests`: search, status filter, VIP-only, New Guest, open row → profile route. Retired (merged) profiles excluded from the default list. Denied copy still: “Only owners and managers…”. |
| `GuestFormDialog` | Create / edit: personal, address, VIP, notes, and ID **text** (type / number / expiry). Duplicate warning: **Open existing guest** / **Create anyway** / Back to form. Optional Merge CTA when editing a duplicate — **never** auto-merge. |
| Information workspace | Overview (contact / address / **masked** Identity text + Reveal / notes / VIP switch / **consent**). **Preferences** tab selects the Preferences **card** and renders `GuestPreferencesCard` (#79). History tab, Edit, Add note, Deactivate / Reactivate, Merge. |
| Identity & Documents card | Upload / list (signed URLs), staff verify / reject with actor + time. Copy: staff confirmation only — never government KYC. |
| Preferences card | Setup-owned dropdowns: Room → `room_types`; Floor → `hotel_floors` (gated if empty); Bed / View / Food / Communication → `pms_preference_options`. Optional Other. Accessibility / special requests textarea. Empty catalogue gates the field with a Setup link. Meal plans are not food prefs. |
| Setup | `/restaurant/settings#guest-profile` — `pms_preference_options` CRUD. |
| `guest-bits.tsx` | `VipBadge` and `StatusBadge` only — not a preferences form. |
| Catalogue | `guest-profile` — title **Guest Profile**, group `commercial`, `moduleKey` `front_office`, `implementationStatus` `partial`. |
| `/restaurant/pms/guest-services` | Planned placeholder (requests / concierge) with a link “Open Guest Profile” → `/restaurant/pms/guests`. **Not** this module. |
| FO check-in stepper | Can read / write the same ID **text** columns on `guest_profiles`. |

### 2.6 CURRENT access (Wave 1 **preserved** this gate)

| Layer | CURRENT |
|---|---|
| Package | `requireRoutePackage("pms")` on `/restaurant/pms/guests`, `/restaurant/pms/guests/$guestId`, and guest-services. Server: `withPmsPackage`. |
| Role helper | `GUEST_MANAGE_ROLES` = `owner`, `manager`, **`receptionist`**. `canManageGuests` matches that list. |
| Comments + denied UI | Speak of **owner / manager only**. |
| RLS (`0012` + `0051`) | `guest_profiles`, `guest_preferences`, `guest_profile_history`, `guest_documents`: **owner or manager** only. Receptionist is **not** in these policies. |

Waves 1–2 **preserved** this inconsistency. It is a documented residual, not a Wave 1 or Wave 2 defect. Do not change the entitlement **architecture** unless a later wave strictly requires it — then **flag Abel**.

### 2.7 CURRENT gaps vs the north star

| Missing | Notes |
|---|---|
| Stay History KPIs from real reservations | History tab is profile events. Dashboard Overview card is Coming in Wave 3. |
| Loyalty & Value real-derived | VIP boolean only. Card Coming in Wave 4. |
| Company / Group / TA masters + Relationships | Switcher present and disabled / not LIVE. Wave 4. |
| Comms / Activity product | Notes + profile history only. Card Coming in Wave 5. |
| Privacy suite | Wave 2 records data-processing / marketing consent only. Export / anonymise / unmerge stay Wave 5. Admin & Privacy card remains Coming in Wave 5. |
| Production schema 0051 | Non-prod `qcwptraosaudcbjasmul` applied (`20260914110546`). **Production NOT applied** (Abel / PM gate). Surfaces that need the new tables degrade to unavailable until apply. |
| Preference id mapping | Stored as `id:` / `other:` prefixes in text columns — honesty item, not a Setup FK. |

### 2.8 Must-not-claim (CURRENT)

- No LIVE OTA / channel manager (Distribution catalogue `existing` ≠ live sync).
- No company bill-to, groups product, or TA commission.
- No payment-gateway settlement and no classic nightly room-and-tax night audit as Guest capabilities.

---

## 3. Wave 1 — Shell + Directory + Information (Individuals)

| Field | Value |
|---|---|
| **TITLE** | Guest Profile Module — Wave 1 Shell + Directory + Information (Individuals) |
| **PACKAGE** | PMS |
| **PMS AREA** | Guests |
| **SPEC STATUS** | **ACCEPTED** (Rekik 2026-09-14) |
| **ENGINEERING STATUS** | **COMPLETE / MERGED** — issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z |
| **PERMISSIONS** | Package entitlement **pms** + existing guest manage gate (`getGuestsAccess` / `requireGuestManager`). No new entitlement model. Abel was not flagged. |

### 3.1 Business purpose

Establish a first-class Guest module shell and make **individual create / find / edit** the default operational path from the Guest sidebar — **extending** existing APIs and UI, not rewriting them.

### 3.2 EXPECTED behaviour (Wave 1)

| Area | Expected |
|---|---|
| **Navigation** | PMS navigation exposes **Guest Profile** as a first-class module. Canonical address is under `/restaurant/pms/…`. **Engineering proposes the exact route in the tech plan.** This Spec requires **ownership in the Guest module**, not a second master under Reservations or Guest Services. Existing `/restaurant/guests` and reservation-nested detail may redirect or remain compatibility paths; they must not remain the only discoverable home. |
| **10-card shell** | Visible for **Individual** profiles. Directory + Information are operational. Cards beyond those may be placeholders labelled **Coming in Wave N**. **No fabricated KPI numbers** on Dashboard, Loyalty, Stay History, or any other card. |
| **Directory** | List / search / filter **individuals** using existing `listGuests` capabilities (search, status, VIP only). Opening a row shows that guest’s profile in the shell. |
| **Information** | Create and edit individual fields aligned to existing `GuestProfile`. **Prefer** surfacing API ID **text** fields (`idDocumentType`, `idDocumentNumber`, `idDocumentExpiry`) on Information and/or an Identity placeholder **without** upload. If UX explicitly defers ID text to Wave 2, the Wave 1 Design Execution Report must say so — default is **surface them**. |
| **Profile-type hook** | Switcher or equivalent: **Individual** default and LIVE. Company / Group / TA **disabled or empty**, labelled so staff do **not** infer those masters are LIVE. |
| **Duplicates** | Remain **warn-only** (Open existing / Create anyway). **No** merge action. **No** silent merge. |
| **Access** | Preserve CURRENT `canManageGuests` / `requireGuestManager` / RLS behaviour. Denied users do not see or mutate other properties’ guests. |
| **Reuse** | Extend `guests.functions.ts`, `GuestFormDialog`, list/detail workspaces. Do **not** introduce a parallel individual guest table or API. |

### 3.3 Out of scope (Wave 1)

| Out | Belongs |
|---|---|
| Document image upload / mask / verify | Wave 2 |
| Controlled merge | Wave 2 |
| Preferences card “complete” (north-star card) | Wave 2 — do not delete the existing Preferences tab |
| Stay KPIs / reservation stay history | Wave 3 |
| Loyalty & Value | Wave 4 |
| Company / Group / TA master CRUD | Wave 4 |
| Relationships | Wave 4 |
| Comms product | Wave 5 |
| Privacy suite (consent / export / anonymise / unmerge) | Wave 5 |
| Offline-first Guest UX | Out of this module |
| Sales & Events group blocks / allotments | Out of this module |
| Entitlement-architecture redesign | Flag Abel; not assumed |
| LIVE OTA, gateway settlement, classic nightly NA | Never invent |

### 3.4 Information field register (Wave 1)

| Field | Required | CURRENT in form | Wave 1 Information |
|---|---|---|---|
| First name | **Yes** | Yes | Yes |
| Last name | No | Yes | Yes |
| Phone | No | Yes | Yes |
| Email | No (valid if present) | Yes | Yes |
| Nationality | No | Yes | Yes |
| Language | No | Yes | Yes |
| Date of birth | No | Yes | Yes |
| Address lines, city, region, country, postal code | No | Yes | Yes |
| VIP | No | Yes | Yes (Information and/or existing control) |
| Notes (`guest_profiles.notes`) | No | Yes | Yes |
| ID type / number / expiry | No | **Yes** (form + Information Identity panel; API + FO check-in) | **Yes** as text; no image — **delivered** |
| Guest status | — | Detail deactivate control | May remain Admin-adjacent; not a Wave 5 privacy suite |

### 3.5 Acceptance criteria (testable)

Staff in the ACs are **authorised**: signed-in, property membership, package **pms**, and they pass the existing guest manage gate. “Denied staff” fail that gate or lack `pms`.

| ID | Criterion | Pass |
|---|---|---|
| **AC-W1-1** | Authorised staff can open **Guest Profile** from **PMS navigation** and see the **Individual Directory**. | Guest is a first-class PMS sidebar (or equivalent PMS nav) target. Landing view is the individual list, not the Guest Services requests placeholder alone. |
| **AC-W1-2** | Staff can **search** (name, phone, or email) and **open** an existing individual. | A known guest appears in results and the profile Information view shows that guest’s stored name / contact. |
| **AC-W1-3** | Staff can **create** an individual with **first name required**; the guest **appears in Directory**. | Empty first name is rejected (client and existing server rule). After create, Directory lists the new guest without a second master. |
| **AC-W1-4** | Staff can **edit Information** fields and see updates **persist** after reload. | Change last name, phone, or address; reopen; values match. `updateGuest` (or equivalent extension) is used — no parallel writer. |
| **AC-W1-5** | **10-card shell** is present for an Individual. Non-Wave-1 cards do **not** display fabricated metrics. | All ten cards exist as navigation or sections. Dashboard / Stay History / Loyalty show placeholder or empty-honest state (e.g. Coming in Wave N) — never invented occupancy, spend, or points. |
| **AC-W1-6** | **No** Company / Group / TA master CRUD is required. Switcher / hook is present **without** implying those masters are LIVE. | Individual works. Other types are disabled, empty, or labelled not available. No create-company success path. |
| **AC-W1-7** | Duplicate **email or phone** still **warns**. Staff can open the existing guest or continue. **No silent merge.** **No merge control.** | Same as today’s dialog behaviour, on the Wave 1 create/edit path. Two profiles can still exist if staff choose Create anyway. |
| **AC-W1-8** | **No** DB entitlement / auth architecture change beyond the existing guest manage gate, unless the new route strictly requires it. | Diff has no new package, no new RLS role model, no new `restaurant_users` scheme — unless a Spec addendum flags Abel and records the change. `requireRoutePackage("pms")` on the new canonical route is expected and is **not** a model change. |
| **AC-W1-9** | Directory **status** (`all` / `active` / `inactive`) and **VIP only** still work. | Matches `listGuests` filters. Inactive guests are findable when filtered. |
| **AC-W1-10** | ID **text** fields that already exist on the API are **visible and editable** on Information and/or the Identity placeholder, **or** the Wave 1 execution report explicitly defers them to Wave 2. | Default pass: type / number / expiry persist via existing columns. **No** file upload. |
| **AC-W1-11** | Placeholders for Waves 2–5 are labelled **Coming in Wave N** (or equivalent wave name). | Staff can tell Directory / Information are live and the rest are not. |
| **AC-W1-12** | Denied staff cannot list or mutate guests. | Same property, role outside the working gate: no directory data, no create. Other-property IDs fail. Public / unauthenticated users redirect to login. |
| **AC-W1-13** | Creating or updating still writes `guest_profile_history` (`created` / `profile_updated` / `vip_changed` as today). | History is not deleted. Wave 1 does not need a new Comms card. |
| **AC-W1-14** | Guest Services (`guest-services`, requests / concierge placeholder) is **not** relabelled as the finished Guest Profile module. | Catalogue / nav may add a **Guest** / **Guest Profile** entry. Requests remain planned (E-S10), not this Spec. |
| **AC-W1-15** | Walk-in minimal create still works: **first name only**. | Aligns with current dialog copy and DB check. |
| **AC-W1-16** | Invalid email is rejected when provided. | Existing server validation remains. |
| **AC-W1-17** | Opening a guest from Directory does not require going through Reservations as the **only** path. | Guest module is the default operational path. Links from Reservations may remain. |

#### Wave 1 AC results (DER after merge)

DESIGN COMPLETION: **COMPLETE**. IMPLEMENTATION STATUS: **PASS**. Approved deviations: **NONE**.

| ID | Result |
|---|---|
| **AC-W1-1** … **AC-W1-17** | All **IMPLEMENTED AS SPECIFIED / PASS** per the Wave 1 Design Execution Report |

#### Wave 1 QA lanes recorded

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; lock tests 5/5 PASS; eslint PASS. Browser QA-W1 / SEC-W1 **NOT RUN** in the developer environment. |
| Independent QA | **PASS** | Rekik 2026-09-14 — [issue #66](https://github.com/NORUDEVGIT/NORU/issues/66#issuecomment-5662018639) and [PR #67](https://github.com/NORUDEVGIT/NORU/pull/67#issuecomment-5662020604). |

`NOT RUN` is never `PASS`. Developer PARTIAL does not become PASS because Independent QA later passed.

### 3.6 QA (Wave 1)

`NOT RUN` is never `PASS`. Live PMS UI that is not exercised stays **NOT VERIFIED**.

| ID | Check | Notes |
|---|---|---|
| **QA-W1-1** | Authorised happy path: nav → Directory → search → open → edit → persist. | Browser, signed-in PMS session. |
| **QA-W1-2** | Create first-name-only guest; appears in Directory. | |
| **QA-W1-3** | Duplicate email and duplicate phone each show the warning; Open existing and Create anyway both work; no merge. | |
| **QA-W1-4** | Status + VIP filters; empty-state copy when no rows. | No fake list. |
| **QA-W1-5** | 10-card shell: count cards; confirm non-Wave-1 cards have no invented KPIs. | Screenshot + note. |
| **QA-W1-6** | Profile-type hook: Individual only operational. | |
| **QA-W1-7** | ID text (if in Wave 1): set on Information, confirm FO check-in still sees the same columns (no second store). | Skip with **NOT RUN** / deferred note if ID text slipped to Wave 2. |
| **QA-W1-8** | Compatibility: `/restaurant/guests` and reservation guest URL still reach a real profile or an explicit redirect — no dead end. | |
| **QA-W1-9** | `tsc --noEmit` (or project equivalent) on the implementation PR. | Developer lane. |
| **QA-W1-10** | Independent QA after Developer QA. | Required before Wave 1 exit. Hotel UAT is **module** DoD, not Wave 1 alone. |

### 3.7 Security (Wave 1)

| ID | Check |
|---|---|
| **SEC-W1-1** | Unauthenticated visit to the new Guest canonical route redirects to login. |
| **SEC-W1-2** | Membership **without** package `pms` cannot use the Guest module (existing package guard). |
| **SEC-W1-3** | Staff who fail `canManageGuests` / `requireGuestManager` cannot read or write `guest_profiles` for that property. |
| **SEC-W1-4** | Tenant isolation: `restaurantId` from the client is not trusted alone (existing `requireGuestManager` / membership re-derivation). Guest A of property 1 is not returned for property 2. |
| **SEC-W1-5** | No new public / customer route exposes guest PII. Guest data stays staff-only (existing rule in `guests.server.ts`). |
| **SEC-W1-6** | No silent merge and no unique-constraint “upsert” that would hide a second person. |
| **SEC-W1-7** | ID **numbers** are ordinary profile text in Wave 1 — not a verification claim. Do not log full ID numbers in client telemetry if that channel does not already. |
| **SEC-W1-8** | RLS / role model unchanged unless Abel-flagged (AC-W1-8). Receptionist vs owner/manager **inconsistency** (helper vs RLS vs UI copy) is **documented**, not “fixed” in Wave 1. |

### 3.8 Regression (Wave 1)

| ID | Check |
|---|---|
| **REG-W1-1** | Reservations and Front Office still resolve `guest_profiles` names / VIP on stays. |
| **REG-W1-2** | FO check-in ID text read / write still uses the same columns. |
| **REG-W1-3** | Direct booking / public booking guest-profile use is unchanged (no new public PII surface). |
| **REG-W1-4** | `saveGuestPreferences` and the existing Preferences tab still function if the shell wraps detail (Wave 2 completes the card; do not strip the tab). |
| **REG-W1-5** | `addGuestNote`, VIP, and status controls still record history. |
| **REG-W1-6** | Guest Services placeholder remains an honest planned surface for **requests**, not a fake concierge board. |
| **REG-W1-7** | No new package; no Back Office guest master; no second `guest_profiles` table. |
| **REG-W1-8** | Distribution / OTA labels unchanged — this wave must not add “live channel” claims. |

### 3.9 Wave 1 permissions (summary)

| Check | Rule |
|---|---|
| Package | **pms** |
| Module access | Existing `front_office` role check inside `requireGuestManager` |
| Manage flag | Existing `getGuestsAccess` → `canManageGuests` |
| RLS | Existing owner / manager policies on guest tables |
| Wave 1 change | New canonical `/restaurant/pms/…` route uses the same chain. **Flag Abel** if a new entitlement type or RLS role is proposed. |

### 3.10 Wave 1 exit

Wave 1 **exited for engineering-gate purposes** after Independent QA PASS (Rekik 2026-09-14), human merge of PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67), issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED, and the Design Execution Report. This docs reconciliation updates [../guests.md](../guests.md) CURRENT/EXPECTED for Wave 1 surfaces.

**Hotel UAT is not required to start Wave 2** but **is** required for **module COMPLETE**.

Passing Wave 1 did **not** start Wave 2 automatically. Wave 2 was ungated separately, implemented via issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) / PRs [#76](https://github.com/NORUDEVGIT/NORU/pull/76) + [#79](https://github.com/NORUDEVGIT/NORU/pull/79), and is recorded in §4. Waves 3–5 product intent is unchanged and remains **WAVE-GATED**.

---

## 4. Wave 2 — Identity, Preferences, controlled merge, consent

| Field | Value |
|---|---|
| **TITLE** | Guest Profile Module — Wave 2 Identity, Preferences, controlled merge, consent |
| **PACKAGE** | PMS |
| **PMS AREA** | Guests |
| **SPEC STATUS** | **ACCEPTED** (Rekik 2026-09-14) |
| **ENGINEERING STATUS** | **COMPLETE / MERGED** — issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z |
| **PERMISSIONS** | Package entitlement **pms** + existing guest manage gate (`getGuestsAccess` / `requireGuestManager`). No new entitlement model. Abel was not flagged. Receptionist residual **PRESERVED**. |
| **Depends on** | Wave 1 engineering gate **exited** (issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) / PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67)). |
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14), including **PRODUCT ADDENDUM — Preferences UX** (Rekik 2026-09-14) |

> **Wave 2 IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED; PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z; follow-up PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. Wave 2 is **OPERATIONALLY ACCEPTED** / closed.
>
> Delivered ONLY: Identity upload / mask / staff verify; Preferences card (Setup-owned); controlled merge; consent; #79 Preferences tab → Preferences card sync.
>
> Waves 3–5 remain **WAVE-GATED**. The module is **not** COMPLETE.

> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).**
>
> Wave 2 Preferences primary controls are Property Setup option lists (dropdown / multi-select) for that hotel — **not** open free-text. This addendum does **not** change Wave 1 Spec content, issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) scope, or PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67). **Delivered on `main`.** Waves 3–5 intent is unchanged except this Preferences detail. Persistence honesty: values stored as `id:<uuid>` / `other:<text>` prefixes — see [../guests.md](../guests.md) §7.5.

### 4.1 Business purpose

Give authorised staff a first-class **Identity & Documents** card and a first-class **Preferences** card on the existing Guest Profile 10-card shell; let them **merge** two individual profiles only through an explicit, confirmed action; and **record consent** (consented / refuse / not-asked) with what / when / who — **extending** existing guest tables and functions, not rewriting them.

Wave 2 is the guest-side store / retrieve / mask / verify surface that aligns with Option A **E-S13** arrival-ID intent. It is **not** the Front Office arrival stepper, **not** government KYC, and **not** a Wave 5 privacy suite.

### 4.2 EXPECTED behaviour (Wave 2)

| Area | Expected |
|---|---|
| **Identity & Documents card** | The north-star **Identity & Documents** card is operational for individuals. Staff can **upload** ID / document images (or equivalent stored files), retrieve them after reload, **mask** sensitive values in ordinary Directory / Information UI, and **verify or reject** a document with actor + time. UI never claims government / KYC verification. |
| **ID text (Wave 1)** | Existing `idDocumentType` / `idDocumentNumber` / `idDocumentExpiry` remain. Ordinary views **mask** the number (e.g. last four) unless a reveal control is used. |
| **E-S13 alignment** | Guest Profile is the store / retrieve surface for arrival-ID documents. Align with Option A E-S13 (capture or waive at arrival; image or reference visible later; no fake “ID verified by government”). Wave 2 does **not** implement the FO arrival stepper, MRZ hardware, or police export. |
| **Preferences card** | The north-star **Preferences** card is operational in the 10-card shell. Reuse `saveGuestPreferences` / `guest_preferences` — **no** second preferences table. Primary room / bed / view / floor (and food / communication **if** Property Setup has catalogues) are **Setup-owned dropdown / multi-select**, not open free-text. Optional **Other**. Accessibility and special requests stay textarea. See §4.5. |
| **Controlled merge** | Staff may merge two **individual** profiles only after an explicit confirm. **Never silent.** Cancelled merge leaves both profiles. History records surviving and retired IDs. Directory does not show the retired profile as an equal live duplicate. **No** unique-constraint auto-collapse. Reservations and other consumers must not be left pointing at a deleted survivor without a written plan in the Wave 2 tech plan. |
| **Consent recorded** | Staff can record **consented** / **refuse** / **not-asked** on the individual: what was asked, when, who recorded it. Visible on the profile. Not export / anonymise / unmerge (Wave 5). |
| **Duplicates** | Wave 1 warn-only duplicate dialog remains. It does **not** auto-merge and is not a silent merge. |
| **Access** | Preserve CURRENT `canManageGuests` / `requireGuestManager` / RLS behaviour unless Abel-flagged. Document files stay staff-only and tenant-scoped. |
| **Reuse** | Extend `guests.functions.ts`, the 10-card shell, and existing preference / history writers. Do **not** introduce a parallel individual guest table or a new package. |
| **Honesty** | Cards for Waves 3–5 stay **Coming in Wave N**. No fabricated KPIs. Do not claim the **module** COMPLETE from Wave 2. |

### 4.3 Locked requirements

| Theme | EXPECTED |
|---|---|
| **Identity documents** | Staff can **upload** ID / document images (or equivalent stored files) on the guest, **mask** sensitive values in ordinary UI, and **verify** (staff-confirmed, reason/timestamp — **not** a government KYC claim). Retrieval from the profile must work. Align with Option A arrival-ID intent (E-S13) **without** inventing MRZ hardware or police export. |
| **Preferences UI complete** | The north-star **Preferences** card exposes the existing preference fields as a first-class Guest card (reuse `saveGuestPreferences` / `guest_preferences` — **no** second preferences table). Room / bed / view / floor (and food / communication **if** Property Setup has catalogues) use **Setup-owned dropdown / multi-select** as the primary control. Optional **Other** free-text only when staff need a value outside the hotel’s list. **Accessibility requirements** and **special requests** stay free-text (textarea). See §4.2. |
| **Controlled merge** | Staff may merge two **individual** profiles only through an explicit, confirmed action. **Never silent.** Surviving and retired IDs are recorded on `guest_profile_history` (or an additive history event type). Reservations and other consumers must not be left pointing at a deleted survivor without a written engineering plan in that wave’s tech plan. **No** unique-constraint auto-collapse. |
| **Consent recorded** | A recorded consent (or explicit refuse / not-asked) exists on the individual before Wave 2 exit. Minimum: what was consented, when, who recorded it. Not a full privacy suite (export / anonymise / unmerge are Wave 5). |

### 4.2 Preferences UX (product addendum)

Property Setup **owns** clean option catalogues (or exposes reusable lists). Guest Profile **consumes** those hotel-scoped options. Do **not** invent fake global enums that ignore the hotel.

| Field | Wave 2 primary control | Optional Other | Notes |
|---|---|---|---|
| Room preference | Dropdown / multi-select from Property Setup for **this** hotel | Yes — free-text only when staff need a value outside the list | Consume Setup-owned room / room-type (or equivalent) options. |
| Bed preference | Same | Yes | Today `bed_type` on room types is also **free-text**, not a catalogue. |
| View preference | Same | Yes | Today `room_view` on room types is also **free-text**, not a catalogue. |
| Floor preference | Same | Yes | `hotel_floors` exists (SET2). Prefer those ids. |
| Food preference | Dropdown / multi-select **only if** Property Setup has a food / meal catalogue | Yes, if the field is LIVE | SET3 meal-plan catalogue may be the source **if** product treats it as the food list. If no catalogue: **gate** the field or add the **minimal** Setup list in the Wave 2 tech plan. |
| Communication preference | Same rule as food | Yes, if the field is LIVE | **No** communication catalogue on `main` today. Gate or add a **minimal** Setup list — do not hard-code a global enum. |
| Accessibility requirements | **Free-text** (textarea) | — | Unchanged. Not a Setup dropdown. |
| Special requests | **Free-text** (textarea) | — | Unchanged. Not a Setup dropdown. |

**Catalogue dependency (honesty).** Floors and room-amenities catalogues exist in part (SET2). Dedicated bed-type / room-view / room-preference / communication option lists do **not**. Guest dropdowns must consume Setup-owned options for that property. If a catalogue is missing, the Wave 2 tech plan may include the **minimal** Property Setup option list needed for that field — **or** gate the field until Setup provides it. Either choice must be written in the tech plan. Do **not** ship a fake worldwide enum.

**Persistence (CURRENT).** Wave 2 stores catalogue selections as `id:<uuid>` and Other as `other:<text>` in the existing eight text columns — a **prefix convention**, not a Setup FK. Flagged as a **DOCUMENTATION / IMPLEMENTATION** honesty item ([../guests.md](../guests.md) §7.5). Do not pretend a prefix is a database foreign key.

**Wave 1 unchanged.** Issue #66 / PR #67 kept the free-text Preferences tab. Wave 2 replaced that primary UX with the Setup-owned card; #79 makes the Overview **Preferences** tab select that card. Wave 1 ACs are not rewritten.

### 4.3 Out of Wave 2
| **Preferences UI complete** | The north-star **Preferences** card exposes the existing preference fields as a first-class Guest card (reuse `saveGuestPreferences` / `guest_preferences` — **no** second preferences table). Room / bed / view / floor (and food / communication **if** Property Setup has catalogues) use **Setup-owned dropdown / multi-select** as the primary control. Optional **Other** free-text only when staff need a value outside the hotel’s list. **Accessibility requirements** and **special requests** stay free-text (textarea). See §4.5. |
| **Controlled merge** | Staff may merge two **individual** profiles only through an explicit, confirmed action. **Never silent.** Surviving and retired IDs are recorded on `guest_profile_history` (or an additive history event type). Reservations and other consumers must not be left pointing at a deleted survivor without a written engineering plan in that wave’s tech plan. **No** unique-constraint auto-collapse. |
| **Consent recorded** | A recorded consent (or explicit refuse / not-asked) exists on the individual before Wave 2 exit. Minimum: what was consented, when, who recorded it. Not a full privacy suite (export / anonymise / unmerge are Wave 5). |

### 4.4 Identity upload / mask / verify

Staff upload ID / document images (or equivalent stored files) onto the individual. Ordinary Directory and Information views **mask** sensitive values (ID number last-four unless a reveal control). Staff mark a document **verified** or **rejected** with actor + timestamp. Copy never says “government verified”, “KYC passed”, or equivalent.

This addendum does **not** pull Property Setup rebuild, meal-plan product, or a global preferences taxonomy into Guest Wave 2. Minimal Setup option lists are allowed **only** for a missing Guest dropdown dependency, and only when documented in that wave’s tech plan.

### 4.4 Exit

Documents on file; Preferences card complete per §4.2 (Setup-owned options, optional Other, accessibility / special requests still free-text); merge works and is never silent; consent is recorded; history shows merge / document / consent actions; Independent QA recorded.

### 4.5 Wave 2 AC seeds (locked intent; expand at wave gate)
This is **staff confirmation** that a document is on file and reviewed — **not** a government KYC product.

**E-S13 alignment (honesty).** Option A E-S13 is arrival ID / document capture at the desk (capture or waive; image or reference visible later). Wave 2 delivers the **guest-profile** store / retrieve / mask / verify surface that E-S13 can consume. Wave 2 does **not** ship the FO arrival stepper, skip-with-reason registration flow, MRZ hardware, or police export. Do not invent those here.

The tech plan proposes storage (existing columns + file store vs an additive table). This Spec does **not** invent a storage schema. Retrieval from the profile after reload is required regardless of storage choice.

### 4.5 Preferences complete card — PRODUCT ADDENDUM (Rekik 2026-09-14)

> **PRODUCT ADDENDUM — Preferences UX (Rekik 2026-09-14).**
>
> Wave 2 Preferences primary controls are Property Setup option lists (dropdown / multi-select) for that hotel — **not** open free-text. This addendum does **not** change Wave 1 Spec content, issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) scope, or PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67). **Delivered on `main`** (#76 / #79). Waves 3–5 intent is unchanged except this Preferences detail.

The north-star **Preferences** card exposes the eight existing preference fields as a first-class Guest card. Reuse `saveGuestPreferences` / `guest_preferences` — **no** second preferences table.

Property Setup **owns** clean option catalogues (or exposes reusable lists). Guest Profile **consumes** those hotel-scoped options. Do **not** invent fake global enums that ignore the hotel.

| Field | Wave 2 primary control | Optional Other | Notes |
|---|---|---|---|
| Room preference | Dropdown / multi-select from Property Setup for **this** hotel | Yes — free-text only when staff need a value outside the list | Consume Setup-owned room / room-type (or equivalent) options. |
| Bed preference | Same | Yes | Today `bed_type` on room types is also **free-text**, not a catalogue. |
| View preference | Same | Yes | Today `room_view` on room types is also **free-text**, not a catalogue. |
| Floor preference | Same | Yes | `hotel_floors` exists (SET2). Prefer those ids. |
| Food preference | Dropdown / multi-select **only if** Property Setup has a food / meal catalogue | Yes, if the field is LIVE | SET3 meal-plan catalogue may be the source **if** product treats it as the food list. If no catalogue: **gate** the field or add the **minimal** Setup list in the Wave 2 tech plan. |
| Communication preference | Same rule as food | Yes, if the field is LIVE | **No** communication catalogue on `main` today. Gate or add a **minimal** Setup list — do not hard-code a global enum. |
| Accessibility requirements | **Free-text** (textarea) | — | Unchanged. Not a Setup dropdown. |
| Special requests | **Free-text** (textarea) | — | Unchanged. Not a Setup dropdown. |

**Catalogue dependency (honesty).** Floors and room-amenities catalogues exist in part (SET2). Dedicated bed-type / room-view / room-preference / communication option lists do **not**. Guest dropdowns must consume Setup-owned options for that property. If a catalogue is missing, the Wave 2 tech plan may include the **minimal** Property Setup option list needed for that field — **or** gate the field until Setup provides it. Either choice must be written in the tech plan. Do **not** ship a fake worldwide enum. This Spec does **not** invent catalogue rows or global enums.

**Persistence (CURRENT).** Wave 2 stores catalogue selections as `id:<uuid>` and Other as `other:<text>` in the existing eight text columns — a **prefix convention**, not a Setup FK. Flagged as a **DOCUMENTATION / IMPLEMENTATION** honesty item ([../guests.md](../guests.md) §7.5). Do not pretend a prefix is a database foreign key.

**Wave 1 unchanged.** Issue #66 / PR #67 kept the free-text Preferences tab. Wave 2 replaced that primary UX with the Setup-owned card; #79 makes the Overview **Preferences** tab select that card. Wave 1 ACs are not rewritten.

This addendum does **not** pull Property Setup rebuild, meal-plan product, or a global preferences taxonomy into Guest Wave 2. Minimal Setup option lists are allowed **only** for a missing Guest dropdown dependency, and only when documented in that wave’s tech plan.

### 4.6 Controlled merge

Staff may merge two **individual** profiles only through an explicit, confirmed action.

| Rule | Meaning |
|---|---|
| **Never silent** | No background merge. No unique-constraint auto-collapse. Two profiles stay two people until staff confirm. |
| **Explicit confirm** | Staff see surviving vs retired and must confirm. Cancel leaves both profiles unchanged. |
| **History** | Survivor `guest_profile_history` (or an additive event type) records the merge: surviving id, retired id, actor, time. |
| **Directory** | After merge, the retired profile is not shown as an equal live duplicate. |
| **Consumers** | Reservations and other consumers must not be left pointing at a deleted survivor without a written engineering plan in the Wave 2 tech plan. |
| **Wave 1 warn** | Duplicate warning (Open existing / Create anyway) remains and does **not** become merge. |

Unmerge is Wave 5. Company / Group / TA masters are Wave 4 — Wave 2 merge is **individuals only**.

### 4.7 Consent recorded

A recorded consent state exists on the individual before Wave 2 exit.

| Field | Required |
|---|---|
| **AC-W2-1** | Staff can attach at least one document to an individual and see it again after reload. |
| **AC-W2-2** | Ordinary Directory / Information views **mask** ID number (e.g. last four only) unless a reveal control is used. |
| **AC-W2-3** | Staff can mark a document verified or rejected with actor + time; UI never says “government verified”. |
| **AC-W2-4** | Preferences card save persists all eight existing fields (Setup-selected values and/or Other / free-text per §4.2). |
| **AC-W2-5** | Merge requires explicit confirm; cancelled merge leaves both profiles. |
| **AC-W2-6** | After merge, Directory does not show the retired profile as an equal live duplicate; history on the survivor records the merge. |
| **AC-W2-7** | Consent (or refuse / not-asked) can be recorded and is visible on the profile. |
| **AC-W2-8** | Duplicate warning from Wave 1 remains; it does **not** auto-merge. |
| **AC-W2-9** | For each LIVE catalogue-backed preference, options **load from Property Setup for that property** — not a hard-coded global enum. |
| **AC-W2-10** | Selecting a Setup **bed type** (or the hotel’s equivalent bed option) **saves** and **reloads** as the stored preference. |
| **AC-W2-11** | The optional **Other** path accepts a value outside the Setup list, saves, and reloads. |
| **AC-W2-12** | **Accessibility requirements** remain free-text (textarea) — not a Setup dropdown. |
| **AC-W2-13** | **Special requests** remain free-text (textarea) — not a Setup dropdown. |
| **AC-W2-14** | If a catalogue is **missing**, that field is **gated** **or** the Wave 2 tech plan includes the **minimal** Property Setup option list in the same wave — and the choice is documented. |
| **State** | One of **consented** / **refuse** / **not-asked** |
| **What** | What was asked (short label or text the property can later read) |
| **When** | Timestamp |
| **Who** | Actor (staff who recorded it) |

Visible on the profile (Identity / Admin-adjacent / dedicated consent row — tech plan proposes chrome). Not a full privacy suite: **export / anonymise / unmerge** stay Wave 5. Consent from Wave 2 remains the record Wave 5 privacy actions build on.

### 4.8 Out of scope (Wave 2)

| Out | Belongs |
|---|---|
| Stay History / Dashboard KPIs from real reservations | Wave 3 |
| Loyalty & Value real-derived | Wave 4 |
| Company / Group / TA master CRUD | Wave 4 |
| Relationships | Wave 4 |
| Comms / Activity product | Wave 5 |
| Export / anonymise / unmerge / privacy audit | Wave 5 |
| FO arrival stepper / skip-with-reason registration | E-S13 (align intent only) |
| Government KYC, passport MRZ hardware, police export | Never invent |
| Property Setup rebuild / global preferences taxonomy | Out — except **minimal** Setup option list for a missing Guest dropdown, documented in the tech plan |
| Fake global enums for room / bed / view / floor / food / communication | Never invent |
| Offline-first Guest UX | Out of this module |
| Sales & Events group blocks / allotments | Out of this module |
| LIVE OTA, gateway settlement, classic nightly NA | Never invent |
| Entitlement-architecture redesign | Flag Abel; not assumed |
| Waves 3–5 engineering from Wave 2 exit | Still **WAVE-GATED** |

### 4.9 Acceptance criteria (testable)

Staff in the ACs are **authorised**: signed-in, property membership, package **pms**, and they pass the existing guest manage gate. “Denied staff” fail that gate or lack `pms`.

| ID | Criterion | Pass |
|---|---|---|
| **AC-W2-1** | Staff can **upload / attach** at least one ID or document image (or equivalent stored file) to an individual and **see it again after reload**. | File is on the Identity & Documents card (or equivalent). Reload / reopen shows the same attachment. No second guest master. |
| **AC-W2-2** | Ordinary Directory / Information views **mask** the ID number (e.g. last four only) unless a **reveal** control is used. | List / Information do not show the full number by default. Reveal is explicit and staff-only. |
| **AC-W2-3** | Staff can mark a document **verified** or **rejected** with **actor + time**. UI never says “government verified” / KYC / police-cleared. | Status, actor, and timestamp persist after reload. Copy is staff-confirmation only. |
| **AC-W2-4** | Preferences **card** save persists all **eight** existing fields (Setup-selected values and/or Other / free-text per §4.5). | Change each field; reload; values match. `saveGuestPreferences` (or equivalent extension of that writer) is used — no second preferences table. |
| **AC-W2-5** | Merge requires **explicit confirm**. **Cancelled** merge leaves both profiles. | Confirm dialog names surviving vs retired. Cancel: both still open in Directory as live individuals. No silent merge. |
| **AC-W2-6** | After merge, Directory does **not** show the retired profile as an equal live duplicate; history on the **survivor** records surviving + retired ids. | Search for the retired name/id does not present it as a second live person. Survivor history has actor + time + both ids. |
| **AC-W2-7** | Consent state **consented** / **refuse** / **not-asked** can be recorded and is **visible** on the profile with **what / when / who**. | Set each state; reload; values and actor/time remain. Not export / anonymise / unmerge. |
| **AC-W2-8** | Wave 1 duplicate **warning** remains; it does **not** auto-merge and is not a merge control. | Create-anyway still creates two profiles. Duplicate dialog has no silent or one-click merge. |
| **AC-W2-9** | For each **LIVE** catalogue-backed preference, options **load from Property Setup for that property** — not a hard-coded global enum. | Changing hotel / property changes the option list. No worldwide room / bed / view / floor / food / communication enum in Guest code. |
| **AC-W2-10** | Selecting a Setup **bed type** (or the hotel’s equivalent bed option) **saves** and **reloads** as the stored preference. | Pick a Setup bed option; save; reopen; same selection (id preferred). |
| **AC-W2-11** | The optional **Other** path accepts a value **outside** the Setup list, saves, and reloads. | Enter Other text; save; reopen; Other value present. List selection is not required for Other. |
| **AC-W2-12** | **Accessibility requirements** remain **free-text** (textarea) — not a Setup dropdown. | Textarea accepts arbitrary text; save / reload. No forced catalogue. |
| **AC-W2-13** | **Special requests** remain **free-text** (textarea) — not a Setup dropdown. | Same as AC-W2-12 for special requests. |
| **AC-W2-14** | If a catalogue is **missing**, that field is **gated** **or** the Wave 2 tech plan includes the **minimal** Property Setup option list in the same wave — and the **choice is documented**. | No fake global enum. Tech plan / execution report records gate vs minimal list per field. |

#### Wave 2 AC results (DER after merge)

DESIGN COMPLETION: **COMPLETE** (Wave 2). IMPLEMENTATION STATUS: **PASS** (after #79). Approved deviations: **THREE** (see below).

| ID | Result |
|---|---|
| **AC-W2-1** … **AC-W2-14** | All **IMPLEMENTED AS SPECIFIED / PASS** per the Wave 2 Design Execution Report (#76 + #79) |

#### Wave 2 approved deviations (DER)

| # | Deviation | Class |
|---|---|---|
| 1 | Preference values stored as `id:<uuid>` / `other:<text>` prefix convention in existing text columns rather than a Setup FK | **DOCUMENTATION / IMPLEMENTATION honesty** (TIP residual). See [../guests.md](../guests.md) §7.5. |
| 2 | PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) merged **before** Preferences Independent QA PASS. Residual shipped as PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) **after** issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED | **Process note only.** #72 stays closed; #79 is the Wave 2 residual, not a new wave. |
| 3 | Developer browser QA remained **PARTIAL** | Independent QA covered Preferences selection. Developer PARTIAL does not become PASS. |

#### Wave 2 QA lanes recorded

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; Wave 1 + Wave 2 lock tests PASS. Browser AC-W2 / SEC-W2 **NOT RUN** in the developer environment. Independent QA covered Preferences selection (approved deviation 3). |
| Independent QA | **PASS** | Rekik 2026-09-14 OVERALL PASS after #79 Preferences-tab residual — [issue #72](https://github.com/NORUDEVGIT/NORU/issues/72#issuecomment-5663204867) and [PR #79](https://github.com/NORUDEVGIT/NORU/pull/79#issuecomment-5663204648). |

`NOT RUN` is never `PASS`. Developer PARTIAL does not become PASS because Independent QA later passed.

#### Wave 2 residuals / FINAL (not defects)

- Receptionist vs owner/manager RLS inconsistency remains **PRESERVED**.
- Production migration `0051_pms_guest_profile_wave2` **Abel-gated**. Non-prod **PASS** on `qcwptraosaudcbjasmul` (version `20260914110546`).
- Waves 3–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.
- DESIGN COMPLETION: **COMPLETE** (Wave 2). IMPLEMENTATION STATUS: **PASS**. The module is **not** COMPLETE.

### 4.10 QA (Wave 2)

`NOT RUN` is never `PASS`. Live PMS UI that is not exercised stays **NOT VERIFIED**.

| ID | Check | Notes |
|---|---|---|
| **QA-W2-1** | Authorised happy path: open Identity & Documents → upload one file → reload → file still there. | Browser, signed-in PMS session. |
| **QA-W2-2** | Directory and Information mask ID number; reveal shows full number; hide returns to mask. | |
| **QA-W2-3** | Verify a document; reject another; actor + time persist; no “government verified” copy. | |
| **QA-W2-4** | Preferences card: set each of the eight fields; save; reload. | Include at least one Setup dropdown and both textareas. |
| **QA-W2-5** | LIVE catalogue options load from this property’s Setup — not a hard-coded list. | Second property (or empty catalogue) proves hotel scope. |
| **QA-W2-6** | Bed type (or hotel equivalent) save / reload; Other path save / reload. | |
| **QA-W2-7** | Accessibility and special requests are textareas, not dropdowns. | |
| **QA-W2-8** | Missing-catalogue field is gated **or** a documented minimal Setup list is present. | Match the tech plan choice. |
| **QA-W2-9** | Merge confirm; cancel leaves both; confirm retires one; survivor history has both ids. | Never silent. |
| **QA-W2-10** | Duplicate warning still warns only; Create anyway does not merge. | |
| **QA-W2-11** | Consent: record consented, refuse, and not-asked; what / when / who visible after reload. | |
| **QA-W2-12** | Waves 3–5 cards still Coming in Wave N; no fabricated KPIs. | Screenshot + note. |
| **QA-W2-13** | `tsc --noEmit` (or project equivalent) on the implementation PR. | Developer lane. |
| **QA-W2-14** | Independent QA after Developer QA. | Required before Wave 2 exit. Hotel UAT is **module** DoD, not Wave 2 alone. |

### 4.11 Security (Wave 2)

| ID | Check |
|---|---|
| **SEC-W2-1** | Unauthenticated visit to Guest canonical routes (including document URLs) redirects to login. |
| **SEC-W2-2** | Membership **without** package `pms` cannot use Identity / Preferences / merge / consent. |
| **SEC-W2-3** | Staff who fail `canManageGuests` / `requireGuestManager` cannot read or write documents, preferences, merge, or consent for that property. |
| **SEC-W2-4** | Tenant isolation: document files and preference / consent / merge writes re-derive `restaurantId` from membership. Guest A of property 1 is not returned for property 2. |
| **SEC-W2-5** | No new public / customer route exposes ID images, full ID numbers, or consent records. |
| **SEC-W2-6** | Ordinary UI masks ID numbers. Full number and images stay behind authorised staff views. |
| **SEC-W2-7** | No silent merge and no unique-constraint auto-collapse that would hide a second person. |
| **SEC-W2-8** | Verify / reject and consent writes record actor + time. UI never claims government KYC. |
| **SEC-W2-9** | Do not log full ID numbers or document bytes in client telemetry if that channel does not already. |
| **SEC-W2-10** | RLS / role model unchanged unless Abel-flagged. Receptionist vs owner/manager inconsistency remains **documented**, not silently “fixed”. |

### 4.12 Regression (Wave 2)

| ID | Check |
|---|---|
| **REG-W2-1** | Wave 1 Directory / Information create / find / edit still work on the same routes. |
| **REG-W2-2** | ID **text** columns remain the FO check-in store — no second ID-text table. |
| **REG-W2-3** | Reservations and Front Office still resolve `guest_profiles` names / VIP on stays. |
| **REG-W2-4** | `saveGuestPreferences` remains the preferences writer. Wave 1 Preferences **tab** may stay as a compatibility path; do not leave a broken second form. |
| **REG-W2-5** | `addGuestNote`, VIP, and status controls still record history. New merge / document / consent events do not delete older events. |
| **REG-W2-6** | Duplicate warning (Open existing / Create anyway) still works and still does not merge. |
| **REG-W2-7** | Guest Services placeholder remains requests / concierge — not this module. |
| **REG-W2-8** | Company / Group / TA remain not LIVE. Waves 3–5 cards stay honest placeholders. |
| **REG-W2-9** | No new package; no Back Office guest master; no second `guest_profiles` table. |
| **REG-W2-10** | Distribution / OTA labels unchanged — this wave must not add “live channel” claims. |

### 4.13 Wave 2 permissions (summary)

| Check | Rule |
|---|---|
| Package | **pms** |
| Module access | Existing `front_office` role check inside `requireGuestManager` |
| Manage flag | Existing `getGuestsAccess` → `canManageGuests` |
| RLS | Existing owner / manager policies on guest tables |
| Wave 2 change | Document storage, merge, and consent use the same chain. **Flag Abel** if a new entitlement type or RLS role is proposed. |

### 4.14 Wave 2 exit

Wave 2 **exited for engineering-gate purposes** after Independent QA PASS (Rekik 2026-09-14, including #79 Preferences-tab residual), human merge of PRs [#76](https://github.com/NORUDEVGIT/NORU/pull/76) and [#79](https://github.com/NORUDEVGIT/NORU/pull/79), issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED, and the Design Execution Report. This docs reconciliation updates [../guests.md](../guests.md) CURRENT / EXPECTED for Wave 2 surfaces.

Approved deviations: **THREE** (prefix storage honesty; #76 merged before Preferences Independent QA / #79 after #72 CLOSED — process note; Developer browser PARTIAL with Independent QA covering Preferences selection). Residuals / FINAL: receptionist RLS **PRESERVED**; production 0051 **Abel-gated** (non-prod PASS `qcwptraosaudcbjasmul` / `20260914110546`); Waves 3–5 **WAVE-GATED**. DESIGN COMPLETION **COMPLETE** (Wave 2). IMPLEMENTATION STATUS **PASS**.

**Hotel UAT is not required to start Wave 3** but **is** required for **module COMPLETE**.

Passing Wave 2 implementation does **not** start Waves 3–5 — they remain **WAVE-GATED**. The module is **not** COMPLETE.

---

## 5. Wave 3 — Stay History + honest 360 Dashboard

| Field | Value |
|---|---|
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14) |
| **SPEC STATUS** | **SPECIFIED / WAVE-GATED** |
| **ENGINEERING STATUS** | **NOT STARTED / AWAITING WAVE GATE** |
| **Depends on** | Wave 2 exited |

### 5.1 Locked requirements

| Theme | EXPECTED |
|---|---|
| **Stay History** | List stays from **real** `hotel_reservations` (or the CURRENT reservation tables on `main`) for this `guest_id`. Dates, status, room / type as the reservation already stores. Empty state if none — **not** invented stays. |
| **Dashboard Overview KPIs** | Real-derived from those stays and existing folio / reservation amounts **only if those amounts exist**. If a metric cannot be derived honestly, omit it or label **not available** — **never** a fake number. |
| **Quick actions** | From the guest profile, authorised staff can jump to Reservation, Front Office, and Folio **when those records exist**. Disabled / hidden when they do not. No invented “open folio” success. |

### 5.2 Out of Wave 3

Masters, loyalty product, comms, privacy suite, OTA, nightly NA claims.

### 5.3 Exit

Real stay history + honest KPIs + working quick actions; Independent QA recorded.

### 5.4 Wave 3 AC seeds

| ID | Criterion |
|---|---|
| **AC-W3-1** | A guest with a known reservation shows that stay on Stay History with confirmation number and dates matching Reservations. |
| **AC-W3-2** | A guest with zero reservations shows an honest empty Stay History — no sample rows. |
| **AC-W3-3** | Dashboard KPIs that appear are traceable to reservations / folios; any card without data shows empty / not available. |
| **AC-W3-4** | Quick action to an in-house or upcoming reservation opens the existing PMS reservation / FO / folio surface. |
| **AC-W3-5** | Profile-event History from Waves 1–2 remains available and is not presented as stay history. |

---

## 6. Wave 4 — Masters, Relationships, Loyalty & Value

| Field | Value |
|---|---|
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14) |
| **SPEC STATUS** | **SPECIFIED / WAVE-GATED** |
| **ENGINEERING STATUS** | **NOT STARTED / AWAITING WAVE GATE** |
| **Depends on** | Wave 3 exited |

### 6.1 Locked requirements

| Part | EXPECTED |
|---|---|
| **(A) Masters** | Company, Group, and Travel Agent **registers** in the Guest module: create / edit / list / search. Profile-type switcher (or nested Accounts) becomes operational for these types. **No** second company/TA table owned by Reservations, Cashiering, or Sales & Events. |
| **(B) Relationships** | Individuals can be associated with masters with **roles**: employer, bill-to, booker TA, group member (minimum set). Associations are visible from both sides. |
| **(C) Loyalty & Value** | Metrics are **real-derived** (e.g. stay counts, nights, posted folio totals that already exist). VIP remains a staff flag unless a later requirement defines a programme. **No invented points balance.** |

Group **account** ≠ Sales & Events group **block**. Allotments / rooming lists stay out.

Company **bill-to as a folio routing product** may still depend on cashiering / M1 work. Wave 4 must store the **association** honestly; it must **not** claim split-folio routing if Cashiering still exposes `transfersSupported: false`.

### 6.2 Out of Wave 4

Comms product, privacy finish, offline, MICE ops, LIVE OTA, TA commission settlement unless a later Spec says so.

### 6.3 Exit

Masters + associations + honest loyalty/value; Independent QA recorded.

### 6.4 Wave 4 AC seeds

| ID | Criterion |
|---|---|
| **AC-W4-1** | Staff can create a Company master in Guest and find it by search. |
| **AC-W4-2** | Same for Group account master and Travel Agent master. |
| **AC-W4-3** | Staff can link an individual as employer / bill-to / booker TA / group member and see the link on Relationships. |
| **AC-W4-4** | Removing a link does not delete the individual or the master. |
| **AC-W4-5** | Reservations / FO consume the same master IDs — no typed-only “company name” presented as a master. |
| **AC-W4-6** | Loyalty & Value shows only derived figures or honest empty; no placeholder “12,500 points”. |
| **AC-W4-7** | Sales & Events is not required to implement group **blocks** for this wave to exit. |

---

## 7. Wave 5 — Comms / Activity + Privacy finish

| Field | Value |
|---|---|
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14) |
| **SPEC STATUS** | **SPECIFIED / WAVE-GATED** |
| **ENGINEERING STATUS** | **NOT STARTED / AWAITING WAVE GATE** |
| **Depends on** | Wave 4 exited |

### 7.1 Locked requirements

| Theme | EXPECTED |
|---|---|
| **Notes / Comms / Activity** | One hub: existing notes + profile history **plus** activity staff can use operationally (messages / logged comms the property can actually send or record). Send is real or the control is absent — no “email sent” when email is not configured. Align with later notifications work; do not invent a marketing cloud. |
| **Privacy finish** | For individuals and, as appropriate, masters: **export**, **anonymise**, **unmerge** (where Wave 2 merge exists), and an **audit** of those privacy actions. Consent from Wave 2 remains visible and editable under policy. |
| **Hotel UAT-ready** | Wave 5 exit includes the module being ready for hotel UAT (module DoD still requires that UAT to pass). |

### 7.2 Out of Wave 5

Offline-first Guest UX; full Sales & Events blocks; LIVE OTA; gateway settlement; new packages.

### 7.3 Exit

Full hub + privacy finish + Independent QA; property ready for hotel UAT. **Module COMPLETE** still requires hotel UAT + docs reconciliation + Advisor ops review ([../guests.md](../guests.md) §6).

### 7.4 Wave 5 AC seeds

| ID | Criterion |
|---|---|
| **AC-W5-1** | Activity hub shows notes, profile history, and any real comms records in one place. |
| **AC-W5-2** | A send control either delivers through a configured channel or is not offered. |
| **AC-W5-3** | Authorised staff can export an individual’s held profile data. |
| **AC-W5-4** | Authorised staff can anonymise a guest; Directory no longer shows live PII for that record. |
| **AC-W5-5** | Unmerge is available for a Wave 2 merge when technically possible, or a recorded exception explains why not — never a silent undo. |
| **AC-W5-6** | Privacy actions appear on audit / history. |
| **AC-W5-7** | Company / Group / TA masters have export / anonymise **as appropriate** (minimum: company contact PII if stored). |

---

## 8. Cross-wave QA / security / regression (Waves 3–5)

Wave 2 QA / Security / Regression live in §4.10–§4.12 at Wave 1 depth. When a later wave is ungated, its tech plan **must** include the same depth. Until then, these rules hold:

| Rule | Apply |
|---|---|
| `NOT RUN` ≠ `PASS` | Every wave |
| Code wins | Every wave |
| No fabricated KPIs | Every wave |
| No silent merge | Every wave |
| No second masters | Every wave |
| No invented LIVE OTA / gateway / classic NA | Every wave |
| Tenant + `pms` + guest manage gate | Every wave unless Abel-approved change |
| Extend existing tables / functions | Every wave |

---

## 9. What this Spec does not do

| This Spec does | This Spec does **not** |
|---|---|
| Record Wave 1 as **ACCEPTED** and **IMPLEMENTED ON MAIN** (#66 / #67) | Claim the **module** is COMPLETE |
| Keep Wave 1 ACs as the accepted contract | Reopen Wave 1 engineering |
| Record Wave 2 as **ACCEPTED** and **IMPLEMENTED ON MAIN** (#72 / #76 / #79) | Reopen Wave 2 engineering or treat #79 as a new wave |
| Keep Wave 2 ACs as the accepted contract | Ungate or authorise Waves 3–5 engineering |
| Lock Waves 3–5 product intent behind wave gates | Start Stay History / masters / privacy finish from this reconciliation |
| Require extending current guest code | Authorise a rewrite or a new guest package |
| Record that Waves 1–2 preserved the existing guest manage gate | Silently change entitlements or RLS roles |
| Record preference `id:` / `other:` prefix honesty and production 0051 hold | Pretend stored prefixes are Setup FKs, or treat code merge as production apply |

---

## Closing

> **Wave 1 Spec ACCEPTED + IMPLEMENTED ON MAIN** (#66 / #67). Wave 1 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 2 Spec ACCEPTED + IMPLEMENTED ON MAIN** (#72 / #76 / #79). **ENGINEERING STATUS: COMPLETE / MERGED.** Wave 2 is OPERATIONALLY ACCEPTED / closed.
>
> Waves 3–5: **SPECIFIED / WAVE-GATED**.
>
> The module is **not** COMPLETE. Hotel UAT is still required after Waves 3–5.
>
> Extend existing guest code. Create once → use everywhere → enrich.
