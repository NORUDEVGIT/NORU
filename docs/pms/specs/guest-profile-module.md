# Functional Spec — Guest Profile Module

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | **APPROVED FOR DOCS** (Rekik 2026-09-14) |
| **Wave 1 Spec** | **READY FOR REKIK REVIEW** |
| **Waves 2–5** | **SPECIFIED / WAVE-GATED** — engineering only after prior wave exit |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | **NOT automatic** until Wave 1 Spec is accepted for handoff |
| **Product requirement** | Rekik 2026-09-14 — **APPROVED FOR DOCS** |
| **Programme overview** | [../guests.md](../guests.md) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **APPROVED FOR DOCS (Rekik 2026-09-14).**
>
> Wave 1 Spec: **READY FOR REKIK REVIEW**. Waves 2–5: **SPECIFIED / WAVE-GATED**.
>
> Extend existing guest code — do **not** restart. **Not** automatic Engineering assignment until Wave 1 Spec is accepted for handoff.
>
> Create once → use everywhere → enrich. Separate **CURRENT** (what `main` does) from **EXPECTED** (what a wave must deliver). Do **not** invent LIVE OTA, payment-gateway settlement, or classic nightly room-and-tax night audit.

This document is the master Functional Spec for the Guest Profile Module. It is **not** a GitHub issue and **not** a Developer handoff.

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
| Create / edit dialog | `src/packages/pms/components/guests/guest-form-dialog.tsx` |
| VIP / status badges | `src/packages/pms/components/guests/guest-bits.tsx` |
| Detail workspace | `src/packages/pms/components/workspaces/guest-detail-workspace.tsx` |
| Individual directory | `src/routes/restaurant/guests/index.tsx` |
| Legacy detail redirect | `src/routes/restaurant/guests/$guestId.tsx` → `/restaurant/pms/reservations/guests/$guestId` |
| Canonical detail today | `src/routes/restaurant/pms/reservations.guests.$guestId.tsx` |
| Guest Services placeholder | `src/routes/restaurant/pms/guest-services.tsx` |
| PMS catalogue | `src/packages/pms/lib/pms-modules.ts` (`guest-services`, **planned**) |
| Front Office rail | `src/core/components/restaurant-shell.tsx` (`/restaurant/guests`) |
| Tables | `guest_profiles`, `guest_preferences`, `guest_profile_history` (`drizzle/migrations/0012_create_guest_profiles.sql`; ID columns in `0041_fo_checkin_stepper.sql`) |

---

## 2. CURRENT behaviour (code wins)

### 2.1 Live server functions

| Function | Behaviour |
|---|---|
| `getGuestsAccess` | Returns `{ role, canManage }` where `canManage = canManageGuests(role)`. |
| `listGuests` | Tenant-scoped list. Optional `search` (name / email / phone / `phone_normalized`), `status` (`active` \| `inactive`), `vipOnly`, `limit` (default 100, max 200). Ordered by `updated_at` desc. |
| `getGuest` | Profile + preferences (or empty defaults) + last 100 `guest_profile_history` rows with actor names. |
| `createGuest` | Inserts `guest_profiles`; records `created`. First name required (Zod + DB check). |
| `updateGuest` | Updates profile; records `profile_updated` and/or `vip_changed` when those fields change. |
| `setGuestVip` / `setGuestStatus` | Dedicated toggles; history events `vip_changed` / `status_changed`. |
| `saveGuestPreferences` | Upsert `guest_preferences`; event `preference_updated` when fields differ. |
| `addGuestNote` | History-only `note_added` (does not write `guest_profiles.notes`). |
| `findGuestDuplicates` | Same property; normalized email and/or phone; optional `excludeGuestId`; max 10. **No unique constraint. No merge.** |

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
| Other | `notes`, `linkedCustomerUserId` (stored; no linking workflow), `createdAt`, `updatedAt` |

### 2.3 Preferences fields (API + detail tab)

`roomPreference`, `bedPreference`, `floorPreference`, `viewPreference`, `foodPreference`, `communicationPreference`, `accessibilityRequirements`, `specialRequests`.

### 2.4 History events recorded today

`created`, `profile_updated`, `vip_changed`, `status_changed`, `preference_updated`, `note_added`.

This is **profile activity**, not reservation stay history.

### 2.5 Live UI

| Surface | What staff see |
|---|---|
| `/restaurant/guests` | Directory: search, status filter, VIP-only, New Guest, open row. Denied copy: “Only owners and managers…”. |
| `GuestFormDialog` | Create / edit: personal, address, VIP, notes. Duplicate warning: **Open existing guest** / **Create anyway** / Back to form. **No merge.** **No ID fields.** |
| Guest detail (Reservations leaf) | Overview (contact / address / notes / VIP switch), **Preferences** tab (all eight fields + Save), **History** tab, Edit, Add note, Deactivate / Reactivate. **No ID fields on Overview.** |
| `guest-bits.tsx` | `VipBadge` and `StatusBadge` only — not a preferences form. |
| `/restaurant/pms/guest-services` | Planned placeholder (requests / concierge) with a link “Open guest profiles” → `/restaurant/guests`. |
| FO check-in stepper | Can read / write the same ID **text** columns on `guest_profiles`. |

### 2.6 CURRENT access (document, do not “fix” in Wave 1)

| Layer | CURRENT |
|---|---|
| Package | `requireRoutePackage("pms")` on guest list, reservation guest detail, and guest-services. Server: `withPmsPackage`. |
| Role helper | `GUEST_MANAGE_ROLES` = `owner`, `manager`, **`receptionist`**. `canManageGuests` matches that list. |
| Comments + denied UI | Speak of **owner / manager only**. |
| RLS (`0012`) | `guest_profiles`, `guest_preferences`, `guest_profile_history`: **owner or manager** only. Receptionist is **not** in these policies. |

Wave 1 **preserves** this gate. Do not change the entitlement **architecture** unless the new route strictly requires it — then **flag Abel**.

### 2.7 CURRENT gaps vs the north star

| Missing | Notes |
|---|---|
| First-class Guest Profile sidebar module + 10-card shell | Guest list is on the Front Office rail; detail is nested under Reservations. |
| Profile-type switcher / Company \| Group \| TA masters | Individuals only. |
| Document upload / mask / verify | ID text exists on API / FO check-in only. |
| Controlled merge | Warn-only. Never silent today; also never a merge action. |
| Stay History KPIs from real reservations | History tab is profile events. |
| Loyalty & Value real-derived | VIP boolean only. |
| Relationships | None. |
| Comms / Activity product | Notes + profile history only. |
| Privacy suite | No consent, export, anonymise, unmerge, or privacy audit product. |

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
| **SPEC STATUS** | **READY FOR REKIK REVIEW** |
| **ENGINEERING STATUS** | **NOT STARTED** — **not** assigned until this Wave 1 Spec is accepted for handoff |
| **PERMISSIONS** | Package entitlement **pms** + existing guest manage gate (`getGuestsAccess` / `requireGuestManager`). No new entitlement model unless Abel-flagged. |

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
| ID type / number / expiry | No | **No** (API + FO check-in only) | **Yes, preferred** as text; no image |
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

Wave 1 may exit only when Rekik (or Abel) accepts the implemented wave against these ACs, Independent QA is recorded, and [../guests.md](../guests.md) CURRENT/EXPECTED is reconciled for Wave 1 surfaces. **Hotel UAT is not required to start Wave 2** but **is** required for **module COMPLETE**.

Passing Wave 1 does **not** start Wave 2 engineering automatically — Wave 2 remains **AWAITING PRIOR WAVE EXIT** plus the Wave 2 gate.

---

## 4. Wave 2 — Identity, Preferences, controlled merge, consent

| Field | Value |
|---|---|
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14) |
| **SPEC STATUS** | **SPECIFIED / WAVE-GATED** |
| **ENGINEERING STATUS** | **NOT STARTED / AWAITING WAVE GATE** (prior wave exit) |
| **Depends on** | Wave 1 exited |

### 4.1 Locked requirements

| Theme | EXPECTED |
|---|---|
| **Identity documents** | Staff can **upload** ID / document images (or equivalent stored files) on the guest, **mask** sensitive values in ordinary UI, and **verify** (staff-confirmed, reason/timestamp — **not** a government KYC claim). Retrieval from the profile must work. Align with Option A arrival-ID intent (E-S13) **without** inventing MRZ hardware or police export. |
| **Preferences UI complete** | The north-star **Preferences** card exposes the existing preference fields as a first-class Guest card (reuse `saveGuestPreferences`). Accessibility and special requests remain first-class. Do not invent a second preferences table. |
| **Controlled merge** | Staff may merge two **individual** profiles only through an explicit, confirmed action. **Never silent.** Surviving and retired IDs are recorded on `guest_profile_history` (or an additive history event type). Reservations and other consumers must not be left pointing at a deleted survivor without a written engineering plan in that wave’s tech plan. **No** unique-constraint auto-collapse. |
| **Consent recorded** | A recorded consent (or explicit refuse / not-asked) exists on the individual before Wave 2 exit. Minimum: what was consented, when, who recorded it. Not a full privacy suite (export / anonymise / unmerge are Wave 5). |

### 4.2 Out of Wave 2

Stay KPIs, loyalty derivation, masters, relationships, comms product, export / anonymise / unmerge, offline, Sales & Events blocks, LIVE OTA.

### 4.3 Exit

Documents on file; Preferences card complete; merge works and is never silent; consent is recorded; history shows merge / document / consent actions; Independent QA recorded.

### 4.4 Wave 2 AC seeds (locked intent; expand at wave gate)

| ID | Criterion |
|---|---|
| **AC-W2-1** | Staff can attach at least one document to an individual and see it again after reload. |
| **AC-W2-2** | Ordinary Directory / Information views **mask** ID number (e.g. last four only) unless a reveal control is used. |
| **AC-W2-3** | Staff can mark a document verified or rejected with actor + time; UI never says “government verified”. |
| **AC-W2-4** | Preferences card save persists all eight existing fields. |
| **AC-W2-5** | Merge requires explicit confirm; cancelled merge leaves both profiles. |
| **AC-W2-6** | After merge, Directory does not show the retired profile as an equal live duplicate; history on the survivor records the merge. |
| **AC-W2-7** | Consent (or refuse / not-asked) can be recorded and is visible on the profile. |
| **AC-W2-8** | Duplicate warning from Wave 1 remains; it does **not** auto-merge. |

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

## 8. Cross-wave QA / security / regression (later waves)

When a later wave is ungated, its tech plan **must** include QA, Security, and Regression sections at Wave 1 depth. Until then, these rules hold:

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
| Record Rekik’s **APPROVED FOR DOCS** Guest Profile requirement | Open a GitHub issue |
| Specify Wave 1 with testable ACs | Hand work to a Developer |
| Lock Waves 2–5 product intent behind wave gates | Authorise Waves 2–5 engineering now |
| Require extending current guest code | Authorise a rewrite or a new guest package |
| Preserve the existing guest manage gate | Silently change entitlements or RLS roles |

---

## Closing

> **APPROVED FOR DOCS (Rekik 2026-09-14).**
>
> **Wave 1 Spec: READY FOR REKIK REVIEW.** Waves 2–5: **SPECIFIED / WAVE-GATED** — **ENGINEERING STATUS: NOT STARTED / AWAITING WAVE GATE**.
>
> **Not** automatic Engineering assignment until Wave 1 Spec is accepted for handoff.
>
> Extend existing guest code. Create once → use everywhere → enrich.
