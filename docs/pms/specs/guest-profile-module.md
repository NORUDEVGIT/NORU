# Functional Spec — Guest Profile Module

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile Module (first-class sidebar module) |
| **PMS AREA** | Guests |
| **STATUS** | Waves 1–3 Spec **ACCEPTED** + **IMPLEMENTED ON MAIN** (#66 / #67; #72 / #76 / #79; #81 / #85 / #87 / #90). Wave 4 Spec **READY FOR ENGINEERING PLANNING** (gate OPENED). Wave 5 still **WAVE-GATED**. Wave 4 is **not** implemented. |
| **Wave 1 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** (OPERATIONALLY ACCEPTED / closed) |
| **Wave 2 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** — issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z |
| **Wave 3 Spec** | **ACCEPTED** + **IMPLEMENTED ON MAIN** — issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z · PR [#85](https://github.com/NORUDEVGIT/NORU/pull/85) MERGED 2026-09-14T11:53:26Z · PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) MERGED 2026-09-14T12:12:30Z · PR [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED 2026-09-14T12:32:41Z |
| **Wave 4 Spec** | **READY FOR ENGINEERING PLANNING** — gate OPENED by Rekik 2026-09-14 via Advisor. ENGINEERING STATUS **AWAITING ISSUE + TECH PLAN + REKIK PLAN APPROVAL**. Issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) OPEN. **Not** implemented. |
| **Wave 5 Spec** | **SPECIFIED / WAVE-GATED** — explicit ungating still required |
| **Implementation rule** | **Extend existing guest code — do NOT restart** |
| **Engineering assignment** | Waves 1–3 complete. Wave 4 awaits issue + tech plan + Rekik plan approval. Wave 5 is **not** automatic. |
| **Product requirement** | Rekik 2026-09-14 — Waves 1–3 accepted and implemented; Wave 4 Spec gate OPENED |
| **Programme overview** | [../guests.md](../guests.md) |
| **Boundaries** | [`../../architecture-ownership.md`](../../architecture-ownership.md) — this Spec does not redefine package or shared-service ownership |

> **Wave 1 Spec ACCEPTED + IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED completed; PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED 2026-09-14T09:15:10Z. Wave 1 is **OPERATIONALLY ACCEPTED** / closed.
>
> **Wave 2 Spec ACCEPTED + IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED completed; PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED 2026-09-14T10:57:47Z; follow-up PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED 2026-09-14T11:20:17Z. Wave 2 is **OPERATIONALLY ACCEPTED** / closed.
>
> **Wave 3 Spec ACCEPTED + IMPLEMENTED ON MAIN** (Rekik 2026-09-14). Issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z; PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85), [#87](https://github.com/NORUDEVGIT/NORU/pull/87), and [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED via #90. Wave 3 is **OPERATIONALLY ACCEPTED** / closed. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**. Wave 4 Spec gate **OPENED** 2026-09-14 by Rekik via Advisor — Spec **READY FOR ENGINEERING PLANNING**. Wave 4 is **not** implemented. Wave 5 stays **WAVE-GATED**. The module is **not** COMPLETE.
>
> Extend existing guest code — do **not** restart.
>
> Create once → use everywhere → enrich. Separate **CURRENT** (what `main` does) from **EXPECTED** (what a later wave must deliver). Do **not** invent LIVE OTA, payment-gateway settlement, or classic nightly room-and-tax night audit.

This document is the master Functional Spec for the Guest Profile Module. Wave 1 ACs remain the accepted contract. Wave 2 ACs in §4 remain the accepted contract (now implemented). Wave 3 ACs in §5 remain the accepted contract (now implemented). Wave 4 ACs in §6 are the planning contract (gate OPENED; **not** implemented). Wave 5 stays wave-gated.

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
| 1 | Dashboard Overview | **3** LIVE (honest KPIs) |
| 2 | Directory | **1** |
| 3 | Information | **1** |
| 4 | Identity & Documents | **2** LIVE (images); Wave 1 surfaces ID **text** |
| 5 | Stay History | **3** LIVE |
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
| Wave 1 catalogue / card lock | `src/packages/pms/lib/guest-profile-wave1.ts` — Directory / Information / Identity / Preferences / Dashboard / Stay History `live: true`; Directory-back helpers (`isGuestRequiredProfileCard`, `?card=`); empty-state CTA (`showEmptyDirectoryCta`) |
| Wave 1 lock tests | `src/packages/pms/lib/guest-profile-wave1.test.ts` (includes AC-DIR-1…7) |
| Wave 2 helpers / encoding | `src/packages/pms/lib/guest-profile-wave2.ts` (`id:<uuid>` / `other:<text>` prefixes; ID mask) |
| Wave 2 lock tests | `src/packages/pms/lib/guest-profile-wave2.test.ts` |
| Wave 3 helpers / KPIs / quick actions | `src/packages/pms/lib/guest-profile-wave3.ts` (`nightsBetween`, honest money, guest-context copy) |
| Wave 3 lock tests | `src/packages/pms/lib/guest-profile-wave3.test.ts` (AC-W3-1…17) |
| Wave 4 CURRENT hook | `GUEST_PROFILE_TYPES` + Loyalty / Relationships cards in `guest-profile-wave1.ts` — Company / Group / TA `live: false`; cards `live: false` |
| Wave 4 CURRENT switcher | `src/packages/pms/components/workspaces/guest-profile-workspace.tsx` — `data-testid="guest-profile-type-switcher"`; non-Individual tabs disabled and labelled **not LIVE · Wave 4** |
| FO company / group **labels** | `hotel_reservations.company_name` / `group_name` (`0046_fo_search1_company_group.sql`) — optional stay text, **not** Guest masters |
| SET3 company flag | `restaurants.pms_guest_profile_rules.companyRelationshipEnabled` — Setup boolean, **not** a Company register |
| Cashiering transfers | `src/packages/pms/lib/cashiering.functions.ts` — `transfersSupported: false` |
| Sales & Events | `src/routes/restaurant/pms/sales-events.tsx` — planned placeholder (blocks / corporate / TA accounts); **not** Guest masters |
| Identity card | `src/packages/pms/components/guests/guest-identity-card.tsx` |
| Preferences card | `src/packages/pms/components/guests/guest-preferences-card.tsx` |
| Stay History card | `src/packages/pms/components/guests/guest-stay-history-card.tsx` |
| Dashboard Overview card | `src/packages/pms/components/guests/guest-dashboard-card.tsx` |
| Stay quick actions | `src/packages/pms/components/guests/guest-stay-actions.tsx` |
| Directory-back control | `src/packages/pms/components/guests/guest-directory-back-link.tsx` |
| Empty-state Directory CTA | `src/packages/pms/components/guests/guest-directory-open-button.tsx` |
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
| `listGuestStays` | Tenant-scoped `hotel_reservations` for one `guest_id` (arrival desc). Maps confirmation, dates, nights (`nightsBetween`), status, room type / room # as stored. Attaches folio id / number / balance **only** when cashiering access allows and a folio exists for that reservation. RLS block on reservations surfaces `WAVE3_RESERVATION_RLS_BLOCKED` (flag Abel — do **not** weaken RLS). |
| `getGuestStayOverview` | Derives Dashboard KPIs from `listGuestStays`: stay / night / in-house / upcoming counts; last checked-out stay; quoted room total and posted folio balance only from stored amounts (`knownMoneyTotal` — missing values omitted, never treated as 0). |

`requireGuestManager` wraps `withPmsPackage` + `requireModuleRole(..., "front_office", GUEST_MANAGE_ROLES, ...)`. Stay / Dashboard reads use the same gate. Quick-action enablement additionally checks reservation / FO / cashiering access (`guestStayAccessForRole`) — Wave 3 does **not** widen those entitlements.

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

This is **profile activity**, not reservation stay history. Wave 2 also records merge / document / consent events on the same table. Stay rows do **not** appear here. The Information History tab is labelled *“Profile activity for this guest. This is not stay history.”*

Stay rows live on the **Stay History** card via `listGuestStays` (`hotel_reservations.guest_id`).

### 2.5 Live UI (post–Wave 3 `main`)

| Surface | What staff see |
|---|---|
| `/restaurant/pms/guests` | Canonical Guest Profile directory. 10-card shell; landing card is **Directory**. Profile-type hook: Individual LIVE; Company / Group / TA disabled and labelled **not LIVE**. Masked ID numbers. Merge guests. |
| `/restaurant/pms/guests/$guestId` | Canonical profile. Shell defaults to **Information**. Directory + Information + **Identity** + **Preferences** + **Dashboard Overview** + **Stay History** LIVE. Waves 4–5 cards **Coming in Wave N** with no fabricated KPIs. Optional `?card=` restores the same guest-required card after Directory-back. |
| FR-9 redirects | `/restaurant/guests`, `/restaurant/guests/$guestId`, and `/restaurant/pms/reservations/guests/$guestId` redirect to the canonical Guest Profile routes. |
| Individual Directory | `listGuests`: search, status filter, VIP-only, New Guest, open row → profile route. Retired (merged) profiles excluded from the default list. Denied copy still: “Only owners and managers…”. |
| `GuestFormDialog` | Create / edit: personal, address, VIP, notes, and ID **text** (type / number / expiry). Duplicate warning: **Open existing guest** / **Create anyway** / Back to form. Optional Merge CTA when editing a duplicate — **never** auto-merge. |
| Information workspace | Overview (contact / address / **masked** Identity text + Reveal / notes / VIP switch / **consent**). **Preferences** tab selects the Preferences **card** and renders `GuestPreferencesCard` (#79). History tab (profile events — **not** stay history), Edit, Add note, Deactivate / Reactivate, Merge. |
| Identity & Documents card | Upload / list (signed URLs), staff verify / reject with actor + time. Copy: staff confirmation only — never government KYC. |
| Preferences card | Setup-owned dropdowns: Room → `room_types`; Floor → `hotel_floors` (gated if empty); Bed / View / Food / Communication → `pms_preference_options`. Optional Other. Accessibility / special requests textarea. Empty catalogue gates the field with a Setup link. Meal plans are not food prefs. |
| Stay History card | LIVE. Selected guest’s **full name** + **This guest's stays**. Table/list of real `hotel_reservations` for that `guest_id`: confirmation #, dates, nights, status, room type · room # or **Unassigned**. Honest empty names that guest. Quick actions per stay. |
| Dashboard Overview card | LIVE. Selected guest’s **full name** + **This guest's overview**. KPIs: stays, nights, in-house, upcoming, last stay (or **Not available**), quoted room total / posted folio balance only when stored — never fake `0.00`. Featured in-house/upcoming stay quick actions. |
| Quick actions | Reservation → `/restaurant/pms/reservations/$reservationId`. Front Office → `/restaurant/pms/front-office?tab=inhouse\|arrivals`. Folio → `/restaurant/pms/cashiering?tab=folios&folio=`. Hidden without surface access; disabled when the record is missing. |
| Directory-back | Shell-level sticky **← Directory** (`GuestDirectoryBackLink`) on every LIVE guest-required card when a guest is selected. Directory itself has no back-to-Directory control. `#90` / AC-DIR-1…7. |
| Empty-state Directory CTA | Primary **Open Directory** button (`GuestDirectoryOpenButton`) on every LIVE guest-required card when no guest is selected. `#91` / `#93` / AC-EMPTY-1…6. |
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

Waves 1–3 **preserved** this inconsistency. It is a documented residual, not a Wave 1, Wave 2, or Wave 3 defect. Do not change the entitlement **architecture** unless a later wave strictly requires it — then **flag Abel**. Wave 3 stay reads use the same guest manage gate; reservation RLS failure must **flag Abel**, not weaken RLS.

### 2.7 CURRENT gaps vs the north star

| Missing | Notes |
|---|---|
| Loyalty & Value real-derived | VIP boolean only. Card Coming in Wave 4. Stay count / nights on Dashboard are stay figures, not a loyalty product. |
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

Passing Wave 1 did **not** start Wave 2 automatically. Wave 2 was ungated separately, implemented via issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) / PRs [#76](https://github.com/NORUDEVGIT/NORU/pull/76) + [#79](https://github.com/NORUDEVGIT/NORU/pull/79), and is recorded in §4. Wave 3 was later ungated and implemented (see §5). Waves 4–5 product intent is unchanged and remains **WAVE-GATED**.

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
> Waves 4–5 remain **WAVE-GATED**. Wave 3 is recorded in §5. The module is **not** COMPLETE.

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
- Waves 4–5 stay **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.
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

Approved deviations: **THREE** (prefix storage honesty; #76 merged before Preferences Independent QA / #79 after #72 CLOSED — process note; Developer browser PARTIAL with Independent QA covering Preferences selection). Residuals / FINAL: receptionist RLS **PRESERVED**; production 0051 **Abel-gated** (non-prod PASS `qcwptraosaudcbjasmul` / `20260914110546`); Waves 4–5 **WAVE-GATED**. DESIGN COMPLETION **COMPLETE** (Wave 2). IMPLEMENTATION STATUS **PASS**.

**Hotel UAT is not required to start Wave 4** but **is** required for **module COMPLETE**.

Passing Wave 2 implementation did **not** start Waves 3–5 automatically. Wave 3 was later ungated and implemented (see §5). Waves 4–5 remain **WAVE-GATED**. The module is **not** COMPLETE.

---

## 5. Wave 3 — Stay History + honest 360 Dashboard

| Field | Value |
|---|---|
| **TITLE** | Guest Profile Module — Wave 3 Stay History + honest 360 Dashboard |
| **PACKAGE** | PMS |
| **PMS AREA** | Guests |
| **SPEC STATUS** | **ACCEPTED** (Rekik 2026-09-14) |
| **ENGINEERING STATUS** | **COMPLETE / MERGED** — issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z · PR [#85](https://github.com/NORUDEVGIT/NORU/pull/85) MERGED 2026-09-14T11:53:26Z · PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) MERGED 2026-09-14T12:12:30Z · PR [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED 2026-09-14T12:32:41Z. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**. |
| **PERMISSIONS** | Package entitlement **pms** + existing guest manage gate (`getGuestsAccess` / `requireGuestManager`). Folio jumps reuse existing Cashiering routes / access — do **not** invent a Guest-owned folio writer. No new entitlement model. Abel was not flagged. Receptionist residual **PRESERVED**. RLS **not** weakened. |
| **Depends on** | Wave 2 engineering gate **exited** (issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) / PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) / PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79)). Wave 3 gate **OPENED** then **implemented** (Rekik 2026-09-14). |
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14) |

> **Wave 3 IMPLEMENTED ON MAIN** (Rekik 2026-09-14).
>
> Issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z. PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed via #90. PR [#86](https://github.com/NORUDEVGIT/NORU/pull/86) CLOSED as duplicate of #87.
>
> Delivered ONLY: Stay History LIVE; honest Dashboard KPIs; quick actions to Res / FO / Folio; guest-context naming (#87); Directory-back on guest-required cards (#90); profile History remains separate. **No migration.** RLS not weakened.
>
> Wave 3 is **OPERATIONALLY ACCEPTED** / closed. Closing #81 does **not** implement Wave 4 and does **not** ungate Wave 5.
>
> Wave 4 Spec is recorded in §6 (**READY FOR ENGINEERING PLANNING**; **not** implemented). Wave 5 remains **WAVE-GATED**. The module is **not** COMPLETE.

### 5.1 Business purpose

Give authorised staff an honest **Stay History** of real reservations for this individual and an honest **Dashboard Overview** of stay-derived figures — **extending** existing `hotel_reservations` / folio readers, not inventing a second stay store or fake KPIs.

Wave 3 is the guest-side **read** of stays that Reservations and Front Office already operate. It is **not** a new reservation product, **not** Cashiering, **not** Loyalty & Value (Wave 4), and **not** the property-wide PMS Dashboard at `/restaurant/pms/dashboard`.

### 5.2 CURRENT behaviour (Wave 3 surfaces — code wins)

Grounded in `main` after #85 / #87 / #90 (`0545232`). **Code wins.**

| Surface | CURRENT |
|---|---|
| **Stay History card** | `GUEST_PROFILE_CARDS` id `stay-history`: `live: true`, `wave: 3`. `GuestStayHistoryCard` lists real `hotel_reservations` for the selected `guest_id`. Header is the guest’s **full name** (`getGuest`); subtitle **This guest's stays**. Empty copy: *“No stays yet for {name}. Stay history lists real reservations only — this card does not invent stays.”* |
| **Dashboard Overview card** | id `dashboard`: `live: true`, `wave: 3`. `GuestDashboardCard` shows stays, nights, in-house, upcoming, last stay, quoted room total, posted folio balance. Header is the guest’s **full name**; subtitle **This guest's overview**. Amounts without a stored source render **Not available** — never fake `0.00`. |
| **Information History tab** | Still `guest_profile_history` (create / update / VIP / status / preference / note / Wave 2 merge / document / consent). Labelled *“Profile activity for this guest. This is not stay history.”* **Not** reservation stays. |
| **Guest-scoped stay API** | `listGuestStays` + `getGuestStayOverview` in `guests.functions.ts`. Read-only; gated by `requireGuestManager`. |
| **Stay store** | Unchanged: `hotel_reservations` (`0013`) filtered by `restaurant_id` + `guest_id`, ordered by arrival desc. Nights via shared `nightsBetween`. Room number only when `room_id` is assigned; otherwise **Unassigned**. Companion-only stays (`fo_stay_companions`) are **out**. |
| **Folio attach** | When cashiering access allows, folio id / number / balance are joined by **reservation_id** (not a silent `guest_folios.guest_id` sum). No folio → Folio action disabled; posted-folio KPI **Not available**. |
| **Quick actions** | Per stay (and featured Dashboard stay): Reservation / Front Office / Folio. Hidden without surface access; Front Office enabled only for in-house or upcoming; Folio enabled only when `folioId` exists. Targets: `/restaurant/pms/reservations/$reservationId`, `/restaurant/pms/front-office?tab=inhouse\|arrivals`, `/restaurant/pms/cashiering?tab=folios&folio=`. |
| **Guest-context (#87)** | Switching guests updates Dashboard / Stay History names. Empty Stay History names the current guest. |
| **Directory-back (#90)** | Shell-level sticky **← Directory** on every LIVE guest-required card (`isGuestRequiredProfileCard`). `?card=` restores the same card after picking another guest. Directory has no back-to-Directory control. AC-DIR-1…7 **PASS**. |
| **Empty-state Directory CTA (#91 / #93)** | Primary **Open Directory** button on guest-required cards when no guest is selected (`showEmptyDirectoryCta`). `?card=` restore. AC-EMPTY-1…6 **PASS**. |
| **Inbound guest link** | Reservation detail and FO stay lists still link **to** Guest Profile. Wave 3 adds the reverse jumps above. |
| **Merge residual** | `mergeGuests` still reassigns `hotel_reservations.guest_id` and does **not** rewrite `guest_folios.guest_id`. Wave 3 folio amounts follow **reservation_id**, so reassigned stays remain honest. |
| **Migration / RLS** | **No Wave 3 migration.** Reservation RLS failure throws `WAVE3_RESERVATION_RLS_BLOCKED` (flag Abel). Existing guest-table RLS unchanged. |

#### Must-not-claim (CURRENT)

- Profile History is **not** stay history.
- Quoted `room_subtotal` is **not** posted revenue. Posted folio balance is **not** lifetime spend.
- `getBookingsDashboard` / `getCashieringDashboard` / `getRoomsDashboard` remain **property-wide** — not this guest’s 360.
- No LIVE OTA stay feed, payment-gateway settlement total, or classic nightly room-and-tax night-audit revenue as a Guest KPI.
- Waves 4–5 cards are **not** LIVE. The module is **not** COMPLETE.

### 5.3 EXPECTED behaviour (Wave 3)

| Area | Expected |
|---|---|
| **Stay History card** | Operational for the selected individual. Lists **real** `hotel_reservations` rows where `guest_id` is this guest (same property). Each row shows confirmation number, arrival / departure dates, status, and room / room type **as the reservation already stores** (`room_types.name`; `hotel_rooms.room_number` when `room_id` is set — otherwise honest unassigned, not a fake room). Empty state if none — **no sample / demo / invented stays**. |
| **Stay source** | Reuse `hotel_reservations` and existing reservation readers (`listReservations` / `getReservation` / `RESERVATION_SELECT` or an equivalent **extension**). **No** second stay table. **No** invented LIVE OTA reservations. |
| **Dashboard Overview card** | Operational 360 for this guest. KPIs that appear are **real-derived** from that stay set and from existing folio / reservation amounts **only if those amounts exist**. Prefer **stays and nights** first if revenue is not ready. If a metric cannot be derived honestly, **omit it** or label **not available** — **never** a fake number. |
| **Quick actions** | From the guest profile, authorised staff can open the **existing** Reservation detail, Front Office, and Folio surfaces **when those records exist**. Hidden or disabled when they do not. No invented “open folio” success when `getReservationFolio` would return `null`. |
| **Profile-event History** | Information History tab (Waves 1–2 `guest_profile_history`) **remains**. It must **not** be relabelled or presented as Stay History. |
| **Access** | Preserve CURRENT `canManageGuests` / `requireGuestManager` / RLS behaviour unless Abel-flagged. Stay and folio reads stay staff-only and tenant-scoped. |
| **Reuse** | Extend guests + reservation / folio **read** paths. Do **not** introduce a parallel individual guest table, a new package, or a Guest-owned reservation writer. |
| **Honesty** | Cards for Waves 4–5 stay **Coming in Wave N**. No fabricated loyalty points. Do not claim the **module** COMPLETE from Wave 3. |

### 5.4 Locked requirements

| Theme | EXPECTED |
|---|---|
| **Stay History** | List stays from **real** `hotel_reservations` (the CURRENT reservation table on `main`) for this `guest_id`. Dates, status, room / type as the reservation already stores. Empty state if none — **not** invented stays. |
| **Dashboard Overview KPIs** | Real-derived from those stays and existing folio / reservation amounts **only if those amounts exist**. If a metric cannot be derived honestly, omit it or label **not available** — **never** a fake number. Prefer stays / nights first if revenue is not ready. |
| **Quick actions** | From the guest profile, authorised staff can jump to Reservation, Front Office, and Folio **when those records exist**. Disabled / hidden when they do not. No invented “open folio” success. |
| **History separation** | Profile-event History from Waves 1–2 remains available and is **not** presented as stay history. |

### 5.5 KPI honesty matrix

| KPI | Honest on `main`? | Source / rule |
|---|---|---|
| **Stay count** | **Yes** | `COUNT` of `hotel_reservations` for this `guest_id` (same property). Zero is honest. |
| **Nights** | **Yes** | Sum of `nightsBetween(arrival_date, departure_date)` per stay. Do not invent a nights column. |
| **Status breakdown** (upcoming / in-house / checked out / cancelled / no-show) | **Yes** | Reservation `status` (+ dates if the tech plan splits upcoming vs past). Empty buckets may show **0** or be omitted — not a fake “12 stays”. |
| **Quoted room total** | **Partial** | Sum `room_subtotal` **only where NOT NULL**. Label as **quoted / priced room total**, not posted revenue. If every row is null, **omit** or **not available**. |
| **Posted folio charges / credits / balance** | **Partial** | `guest_folios` + `folio_transactions` / `getReservationFolio` **when a folio exists**. Folios typically exist after check-in / `initializeFolio`. No folio → **not available**, not `0.00` presented as “settled”. |
| **Outstanding balance** | **Partial** | Derived open-folio balance only. Meaningless without a folio. |
| **Deposits collected** | **Partial** | Folio `deposit` lines and/or `fo_checkin_progress.deposit_amount` **if** the tech plan can name the source. Otherwise omit. |
| **Lifetime “true revenue”** | **Not a single honest source** | Quoted `room_subtotal` ≠ posted folio charges (adjustments, extras, refunds). Do **not** ship one invented “lifetime spend”. |
| **Folio transfers** | **N/A** | `transfersSupported: false`. Do not show transfer KPIs. |
| **Loyalty points / OTA / gateway / classic NA revenue** | **Does not exist** | Omit. Never invent. |

**Default Dashboard set (locked preference):** show **stays** and **nights** (and optional honest status counts) first. Add amount KPIs only when the source row exists and the label matches the source (quoted vs posted).

### 5.6 Quick actions honesty

| Action | When enabled | Target (existing) | When hidden / disabled |
|---|---|---|---|
| **Open reservation** | At least one `hotel_reservations` row for this `guest_id` | `/restaurant/pms/reservations/$reservationId` for that stay (or the selected / current / next stay — tech plan names the picker) | Zero reservations |
| **Open Front Office** | An in-house or operationally relevant stay exists (`checked_in`, or arrivals/departures the FO surface already lists) | `/restaurant/pms/front-office` (optional `?tab=` the tech plan maps to an **existing** FO tab) | No such stay |
| **Open folio** | `getReservationFolio` (or equivalent) returns a folio for that stay | `/restaurant/pms/cashiering?tab=folios&folio={folioNumber}` (or the existing folio detail the tech plan names) | No folio opened — **do not** toast “folio opened” or navigate to an empty success |

Quick actions **read** existing records. They do **not** create a reservation, check anyone in, or open a folio as a side effect of the click.

### 5.7 Stay History field register

| Field | Required | CURRENT store | Wave 3 Stay History |
|---|---|---|---|
| Confirmation number | **Yes** | `hotel_reservations.confirmation_number` | Yes — must match Reservations detail |
| Arrival date | **Yes** | `arrival_date` | Yes |
| Departure date | **Yes** | `departure_date` | Yes |
| Nights | Derived | `nightsBetween` | Yes if shown — same helper / same dates |
| Status | **Yes** | `status` (`pending` … `no_show`) | Yes — same labels Reservations / FO already use |
| Room type | **Yes** | `room_types.name` via `room_type_id` | Yes |
| Room number | No | `hotel_rooms.room_number` when `room_id` set | Show number **or** honest unassigned — never invent a room |
| Quoted room subtotal | No | `room_subtotal` nullable | Optional; omit / not available if null |
| Folio number / balance | No | `guest_folios` / `getReservationFolio` | Optional; only if folio exists |
| Profile-history event type | — | `guest_profile_history` | **Not** a Stay History column |

### 5.8 Out of Wave 3

| Out | Belongs |
|---|---|
| Company / Group / TA master CRUD | Wave 4 |
| Relationships | Wave 4 |
| Loyalty & Value product / points | Wave 4 |
| Comms / Activity hub | Wave 5 |
| Export / anonymise / unmerge / privacy audit | Wave 5 |
| Companion-only stays as a required Stay History source | Out unless the tech plan documents `fo_stay_companions`; default is primary `guest_id` |
| Inventing LIVE OTA / channel-manager stays | Never invent |
| Payment-gateway settlement totals | Never invent |
| Classic nightly room-and-tax night-audit revenue as a Guest KPI | Never invent |
| Fake KPIs, sample stays, demo occupancy / spend | Never invent |
| Property-wide PMS Dashboard rewrite (`/restaurant/pms/dashboard`) | Separate surface — out |
| Guest-owned reservation / folio **writers** (create stay, post charge, open folio on click) | Out — read + jump only |
| Folio-to-folio transfers | `transfersSupported: false` |
| Offline-first Guest UX | Out of this module |
| Sales & Events group blocks / allotments | Out of this module |
| Entitlement-architecture redesign | Flag Abel; not assumed |
| Wave 3 **code** from this Spec alone | Historical — implementation later landed via issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) / PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90) |

### 5.9 Acceptance criteria (testable)

Staff in the ACs are **authorised**: signed-in, property membership, package **pms**, and they pass the existing guest manage gate. “Denied staff” fail that gate or lack `pms`.

| ID | Criterion | Pass |
|---|---|---|
| **AC-W3-1** | A guest with a **known reservation** shows that stay on **Stay History** with **confirmation number** and **dates** matching Reservations. | Open the same stay on `/restaurant/pms/reservations/$reservationId`. Confirmation, arrival, and departure match exactly. Source is `hotel_reservations` for this `guest_id`. |
| **AC-W3-2** | A guest with **zero** reservations shows an **honest empty** Stay History — **no sample rows**. | Copy states there are no stays (or equivalent). No demo confirmation numbers, no invented dates. |
| **AC-W3-3** | Dashboard KPIs that **appear** are **traceable** to reservations / folios; any metric without data shows **empty / not available**. | Each visible number can be recalculated from `hotel_reservations` and/or existing folio amounts. No placeholder “12 stays / $4,500”. |
| **AC-W3-4** | Quick action to an **in-house or upcoming** reservation opens the **existing** PMS reservation / FO / folio surface. | Click lands on `/restaurant/pms/reservations/$reservationId` and/or `/restaurant/pms/front-office` and/or the existing folio route for **that** record. No new Guest folio page required. |
| **AC-W3-5** | Profile-event **History** from Waves 1–2 remains available and is **not** presented as stay history. | Information History tab still lists `guest_profile_history`. Stay History is a separate card. Profile events are not retitled “stays”. |
| **AC-W3-6** | Stay row shows **status** and **room / type** as the reservation stores. | Status matches Reservations. Room type name matches. Room number appears only when `room_id` is assigned; otherwise honest unassigned — no invented room. |
| **AC-W3-7** | **Stay count** and **nights** appear on Dashboard when stays exist; nights use arrival / departure (same `nightsBetween` rule Reservations uses). | Two-night stay counts as 2. Zero stays → 0 or empty, not a fake average LOS. |
| **AC-W3-8** | An **amount** KPI is shown **only** when `room_subtotal` and/or folio totals exist; otherwise the metric is **omitted** or labelled **not available**. | Unpriced reservation (`room_subtotal` null, no folio) does not display `0.00` as revenue. Quoted vs posted is labelled if both could appear. |
| **AC-W3-9** | If revenue cannot be derived honestly, Dashboard still ships **stays / nights** (or honest empty) — it does **not** invent spend to fill the card. | Revenue slot omitted or “not available”. Stays/nights remain the primary figures. |
| **AC-W3-10** | Quick actions are **hidden or disabled** when the target record does **not** exist. | Guest with no reservation: no enabled Open reservation. Guest with reservation but no folio: Open folio hidden/disabled. No dead-end “success”. |
| **AC-W3-11** | **No invented “open folio” success.** | When `getReservationFolio` would be `null`, the control does not claim a folio exists and does not create one as a side effect. |
| **AC-W3-12** | Stay History does **not** use profile-history rows as stays. | A guest with notes / merge / consent events and **zero** reservations still has empty Stay History. Those events remain on Information History. |
| **AC-W3-13** | Stays are **tenant-scoped**. | Property 2 does not see property 1 reservations for the same person-shaped data. `restaurantId` from the client is not trusted alone. |
| **AC-W3-14** | **No** second stay table and **no** parallel guest master. | Diff extends existing `hotel_reservations` / folio reads. No `guest_stays` rewrite store. |
| **AC-W3-15** | Waves 4–5 cards stay **Coming in Wave N** with **no fabricated** loyalty / comms metrics. | Loyalty does not show invented points. Company / Group / TA remain not LIVE. |
| **AC-W3-16** | Denied staff cannot read another guest’s stays or folio amounts through the new Guest surfaces. | Same gate as `getGuest` / guest manage. No new public PII route. |
| **AC-W3-17** | Wave 3 does **not** invent LIVE OTA stays, gateway settlement, or classic nightly NA revenue. | No “channel stay” or “NA room+tax total” KPI unless that source already exists on `main` for this guest (it does not). |

#### Wave 3 AC results (DER after merge)

DESIGN COMPLETION: **COMPLETE** (Wave 3). IMPLEMENTATION STATUS: **PASS** (after #87 + #90). Approved deviations: **THREE** (see below).

| ID | Result |
|---|---|
| **AC-W3-1** … **AC-W3-17** | All **IMPLEMENTED AS SPECIFIED / PASS** per the Wave 3 Design Execution Report (#85 + #87 + #90) |
| **AC-DIR-1** … **AC-DIR-7** | All **IMPLEMENTED AS SPECIFIED / PASS** per DER (#90 / issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED) |

#### Wave 3 approved deviations (DER)

| # | Deviation | Class |
|---|---|---|
| 1 | PR [#85](https://github.com/NORUDEVGIT/NORU/pull/85) merged **before** the guest-context UX fix. Residual shipped as PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) | **Process note only.** Not a product defect. |
| 2 | PR [#86](https://github.com/NORUDEVGIT/NORU/pull/86) CLOSED as **duplicate** of #87 (same residual, older branch tip) | **Process note only.** Canonical guest-context follow-up is #87. |
| 3 | Developer browser QA remained **PARTIAL** | Independent QA covered guest-context and Directory-back after residuals. Developer PARTIAL does not become PASS. |

#### Wave 3 QA lanes recorded

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; Wave 1 + Wave 2 + Wave 3 lock tests PASS (36/36 after #90). Browser QA-W3 / SEC-W3 / guest A vs B **NOT RUN** in the developer environment. Independent QA covered residuals (approved deviation 3). |
| Independent QA | **PASS** | Rekik 2026-09-14 after residuals — [issue #81 DER](https://github.com/NORUDEVGIT/NORU/issues/81#issuecomment-5664019733) and [PR #90](https://github.com/NORUDEVGIT/NORU/pull/90#issuecomment-5664008291). |

`NOT RUN` is never `PASS`. Developer PARTIAL does not become PASS because Independent QA later passed.

#### Wave 3 residuals / FINAL (not defects)

- Receptionist vs owner/manager RLS inconsistency remains **PRESERVED**.
- Wave 3 added **no** migration. Production `0051_pms_guest_profile_wave2` remains **Abel-gated** (Wave 2 leftover).
- Guest-context (#87) and Directory-back (#90 / #88) residuals are **RESOLVED on `main`**.
- Empty-state Open Directory CTA (#91 / #93) is **RESOLVED on `main`**. Do **not** reopen [#81](https://github.com/NORUDEVGIT/NORU/issues/81).
- Wave 4 Spec is in §6 (**READY FOR ENGINEERING PLANNING**; **not** implemented). Wave 5 stays **WAVE-GATED**. Hotel UAT is still required for **module COMPLETE**.
- DESIGN COMPLETION: **COMPLETE** (Wave 3). IMPLEMENTATION STATUS: **PASS**. The module is **not** COMPLETE.

### 5.10 QA (Wave 3)

`NOT RUN` is never `PASS`. Live PMS UI that is not exercised stays **NOT VERIFIED**.

| ID | Check | Notes |
|---|---|---|
| **QA-W3-1** | Authorised happy path: Directory → open guest with a known reservation → Stay History shows that confirmation + dates. | Browser, signed-in PMS session. Compare to Reservations detail. |
| **QA-W3-2** | Guest with **zero** reservations: Stay History empty-honest; Dashboard stays/nights 0 or empty; no sample rows. | |
| **QA-W3-3** | Stay row: status + room type match Reservations; unassigned room is honest. | Include one assigned and one unassigned stay if available. |
| **QA-W3-4** | Dashboard: stays and nights match the Stay History set (`nightsBetween`). | |
| **QA-W3-5** | Amount KPI: unpriced stay (null `room_subtotal`, no folio) is omitted or **not available** — not a fake `0.00` revenue. | |
| **QA-W3-6** | Amount KPI: when `room_subtotal` and/or folio totals exist, the number matches that source and is labelled quoted vs posted. | |
| **QA-W3-7** | Quick action Open reservation lands on the existing reservation detail for that id. | |
| **QA-W3-8** | In-house stay: Open Front Office reaches `/restaurant/pms/front-office` (or documented existing tab). | Skip with **NOT RUN** if no in-house stay in the environment. |
| **QA-W3-9** | Folio exists: Open folio reaches existing Cashiering folio surface. Folio missing: control hidden/disabled — no invented success. | |
| **QA-W3-10** | Information History tab still shows profile events; those events are not on Stay History. | Guest with notes/merge/consent and with/without stays. |
| **QA-W3-11** | Waves 4–5 cards still Coming in Wave N; no fabricated KPIs. | Screenshot + note. |
| **QA-W3-12** | `tsc --noEmit` (or project equivalent) on the implementation PR. | Developer lane. |
| **QA-W3-13** | Independent QA after Developer QA. | Required before Wave 3 exit. Hotel UAT is **module** DoD, not Wave 3 alone. |

### 5.11 Security (Wave 3)

| ID | Check |
|---|---|
| **SEC-W3-1** | Unauthenticated visit to Guest canonical routes (including any new stay / KPI reader URL) redirects to login. |
| **SEC-W3-2** | Membership **without** package `pms` cannot use Stay History / Dashboard / quick actions. |
| **SEC-W3-3** | Staff who fail `canManageGuests` / `requireGuestManager` cannot read another guest’s stays or folio amounts through Guest Profile. |
| **SEC-W3-4** | Tenant isolation: stay and folio reads re-derive `restaurantId` from membership. Guest A of property 1 is not returned for property 2. |
| **SEC-W3-5** | No new public / customer route exposes stay lists, folio balances, or confirmation numbers. |
| **SEC-W3-6** | Quick actions only navigate to surfaces the staff can already open; they do not bypass Cashiering / FO access. |
| **SEC-W3-7** | Do not log full folio ledgers or ID numbers in client telemetry if that channel does not already. |
| **SEC-W3-8** | RLS / role model unchanged unless Abel-flagged. Receptionist vs owner/manager inconsistency remains **documented**, not silently “fixed”. |

### 5.12 Regression (Wave 3)

| ID | Check |
|---|---|
| **REG-W3-1** | Wave 1 Directory / Information create / find / edit still work on the same routes. |
| **REG-W3-2** | Wave 2 Identity / Preferences / merge / consent still work. Merge still reassigns `hotel_reservations.guest_id`. |
| **REG-W3-3** | Information History tab still lists `guest_profile_history` and is not replaced by Stay History. |
| **REG-W3-4** | Reservations list / detail and FO arrivals / in-house / departures still resolve `guest_profiles` names / VIP. |
| **REG-W3-5** | `getReservation`, `listReservations`, and `getReservationFolio` remain the reservation / folio readers — no second store. |
| **REG-W3-6** | Inbound **Open guest profile** from reservation detail / FO still reaches the canonical Guest route. |
| **REG-W3-7** | Property PMS Dashboard (`/restaurant/pms/dashboard`) is unchanged. Guest Dashboard Overview is a different card. |
| **REG-W3-8** | Guest Services placeholder remains requests / concierge — not this module. |
| **REG-W3-9** | Company / Group / TA remain not LIVE. Waves 4–5 cards stay honest placeholders. |
| **REG-W3-10** | No new package; no Back Office guest master; no second `guest_profiles` or `hotel_reservations` table. |
| **REG-W3-11** | Distribution / OTA labels unchanged — this wave must not add “live channel” claims. |
| **REG-W3-12** | Cashiering `transfersSupported: false` unchanged. Wave 3 must not claim folio transfers. |

### 5.13 Wave 3 permissions (summary)

| Check | Rule |
|---|---|
| Package | **pms** |
| Module access | Existing `front_office` role check inside `requireGuestManager` |
| Manage flag | Existing `getGuestsAccess` → `canManageGuests` |
| Reservation / FO / folio jump | Existing routes and their existing access checks. Guest Wave 3 does **not** widen Cashiering or FO entitlements. |
| RLS | Existing owner / manager policies on guest tables; existing reservation / folio policies unchanged unless Abel-flagged |
| Wave 3 change | New guest-scoped **reads** use the same chain. **Flag Abel** if a new entitlement type or RLS role is proposed. |

### 5.14 Wave 3 exit

Wave 3 **exited for engineering-gate purposes** after Independent QA PASS (Rekik 2026-09-14, including #87 guest-context and #90 Directory-back residuals), human merge of PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85), [#87](https://github.com/NORUDEVGIT/NORU/pull/87), and [#90](https://github.com/NORUDEVGIT/NORU/pull/90), issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED, issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed 2026-09-14T12:37:18Z, and the Design Execution Report. This docs reconciliation updates [../guests.md](../guests.md) CURRENT / EXPECTED for Stay History, Dashboard Overview, quick actions, guest-context, and Directory-back.

Wave 3 is **OPERATIONALLY ACCEPTED** / closed. Closing #81 does **not** make the module COMPLETE.

Approved deviations: **THREE** (#85 merged before guest-context / #87 follow-up; #86 CLOSED as duplicate of #87; Developer browser PARTIAL with Independent QA covering residuals). Residuals / FINAL: receptionist RLS **PRESERVED**; no Wave 3 migration; #87 and #90 residuals **RESOLVED**. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**. Wave 4 Spec is recorded in §6 (planning only). Wave 5 remains **WAVE-GATED**.

**Hotel UAT is not required to start Wave 4** but **is** required for **module COMPLETE**.

Closing #81 did **not** ungate Wave 4 by itself. Wave 4 Spec gate was later **OPENED** by Rekik (2026-09-14 via Advisor) — see §6. Wave 4 is **not** implemented. Wave 5 remains **WAVE-GATED**. The module is **not** COMPLETE.

### 5.15 Wave 3 residuals / UX consistency — Directory-back (Rekik 2026-09-14)

> **Guest shell UX residual** (Rekik 2026-09-14). This is a Wave 3 residual / Guest shell UX — **not** Waves 4–5 product scope. **RESOLVED on `main`** via PR [#90](https://github.com/NORUDEVGIT/NORU/pull/90) (issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed).

**DELIVERED.** Any LIVE Guest Profile card that requires a selected guest first (Dashboard, Stay History, Identity, Preferences, and later LIVE cards via `isGuestRequiredProfileCard`) provides the same easy **Directory back arrow** as Information (shell-level sticky `GuestDirectoryBackLink`). Staff return to Directory, pick another guest, and see that guest’s **same** card (`?card=` restore). Directory itself has no back-to-Directory control.

| Item | Status on `main` |
|---|---|
| Guest-context headers (selected guest named on Dashboard / Stay History) | **ON MAIN** — PR [#87](https://github.com/NORUDEVGIT/NORU/pull/87) MERGED |
| Directory-back arrow (or shell-level sticky back-to-Directory) on guest-required cards | **ON MAIN** — PRs [#89](https://github.com/NORUDEVGIT/NORU/pull/89) / [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed. |
| Empty / no-guest-selected Directory CTA | **ON MAIN** — PR [#93](https://github.com/NORUDEVGIT/NORU/pull/93) MERGED. Issue [#91](https://github.com/NORUDEVGIT/NORU/issues/91) CLOSED completed. See §5.16. |

**CURRENT.** After [#89](https://github.com/NORUDEVGIT/NORU/pull/89) / [#90](https://github.com/NORUDEVGIT/NORU/pull/90), guest-required cards with a selected guest show a sticky **← Directory** (`GuestDirectoryBackLink`) to `/restaurant/pms/guests` (with `?card=` so Directory reopens the same card). Empty / no-guest-selected states use the §5.16 primary **Open Directory** CTA (#91 / #93).

**EXPECTED.** The same Directory-back control as Information, **or** one sticky shell-level back-to-Directory, on every guest-required card — including later live cards. After Directory, staff pick another guest and land on that guest’s **same** card. No dead-end. Empty / no-guest-selected states have a primary CTA — §5.16.

This residual does **not** ungate Waves 4–5 and does **not** change Wave 3 stay / KPI / quick-action product scope.

### 5.16 Wave 3 residuals / UX consistency — Empty-state Directory CTA (Rekik 2026-09-14)

> **Guest shell UX residual** (Rekik 2026-09-14, post–Wave 3). This is a Wave 3 residual / Guest shell UX — **not** Waves 4–5 product scope. **RESOLVED on `main`** via PR [#93](https://github.com/NORUDEVGIT/NORU/pull/93) (issue [#91](https://github.com/NORUDEVGIT/NORU/issues/91) CLOSED completed).

**DELIVERED.** Every LIVE guest-required card (Dashboard, Stay History, Identity, Preferences, Information, and later LIVE cards via `showEmptyDirectoryCta`) includes a primary **Open Directory** button (`GuestDirectoryOpenButton`) in the empty / no-guest-selected state that navigates to Guest Directory. Copy alone is not enough. AC-EMPTY-1…6 **PASS**.

Align with Directory-back ([#90](https://github.com/NORUDEVGIT/NORU/pull/90)): after a guest is selected, sticky **← Directory**; before selection, the empty-state CTA into Directory (`?card=` restore).

| Item | Status on `main` |
|---|---|
| Directory-back on guest-required cards (after guest selected) | **ON MAIN** — PRs [#89](https://github.com/NORUDEVGIT/NORU/pull/89) / [#90](https://github.com/NORUDEVGIT/NORU/pull/90). Issue [#88](https://github.com/NORUDEVGIT/NORU/issues/88) CLOSED completed. |
| Empty / no-guest-selected primary CTA into Directory | **ON MAIN** — PR [#93](https://github.com/NORUDEVGIT/NORU/pull/93) MERGED 2026-09-14T12:48:14Z. Issue [#91](https://github.com/NORUDEVGIT/NORU/issues/91) CLOSED completed. |

**CURRENT.** When no guest is selected, guest-required cards show a primary **Open Directory** button (`data-testid="guest-profile-open-directory"`) plus honest empty copy. The button navigates to `/restaurant/pms/guests` and keeps `?card=` so Directory reopens the same card after staff pick a guest. Coming-in-Wave cards stay copy-only. Directory itself has no Open Directory dead-end. After selection, §5.15 sticky **← Directory** remains.

This residual does **not** ungate Waves 4–5 and does **not** change Wave 3 stay / KPI / quick-action product scope.

---

## 6. Wave 4 — Masters, Relationships, Loyalty & Value

| Field | Value |
|---|---|
| **TITLE** | Guest Profile Module — Wave 4 Masters, Relationships, Loyalty & Value |
| **PACKAGE** | PMS |
| **PMS AREA** | Guests |
| **SPEC STATUS** | **READY FOR ENGINEERING PLANNING** |
| **ENGINEERING STATUS** | **AWAITING ISSUE + TECH PLAN + REKIK PLAN APPROVAL** — gate OPENED by Rekik 2026-09-14 via Advisor; Wave 3 exited. Issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) OPEN. Tech plan posted on #95 (READY for Rekik review). **No implementation** until Rekik plan approval. |
| **PERMISSIONS** | Package entitlement **pms** + existing guest manage gate (`getGuestsAccess` / `requireGuestManager`). No new entitlement model unless Abel-flagged. Receptionist residual **PRESERVED**. |
| **Depends on** | Wave 3 engineering gate **exited** (issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) / PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90)). Wave 4 Spec gate **OPENED** (Rekik 2026-09-14 via Advisor). |
| **REQUIREMENTS** | **Locked** from the product requirement (Rekik 2026-09-14) |

> **Wave 4 Spec READY FOR ENGINEERING PLANNING** (Rekik 2026-09-14). Gate **OPENED** via Advisor. Wave 3 is **OPERATIONALLY ACCEPTED** / closed.
>
> This section expands the Wave 4 AC seeds into a testable planning contract. It does **not** start Wave 4 code. It does **not** ungate Wave 5. It does **not** claim Company / Group / TA masters, Relationships, or Loyalty & Value are LIVE.
>
> Wave 5 remains **WAVE-GATED**. The module is **not** COMPLETE.

### 6.1 Business purpose

Give authorised staff **Company**, **Group**, and **Travel Agent** registers **inside the Guest module**; let them **link individuals** to those masters with named roles; and show **Loyalty & Value** from figures that already exist on `main` — **extending** the Guest Profile shell, not inventing a second CRM in Reservations, Cashiering, or Sales & Events, and **not** inventing a points programme.

Wave 4 is the Guest-owned **account master + association + honest value** layer. It is **not** folio split / city-ledger routing, **not** Sales & Events group blocks / allotments / rooming lists, **not** TA commission settlement, and **not** Wave 5 comms / privacy.

### 6.2 CURRENT behaviour (Wave 4 surfaces — code wins)

Grounded in `main` at `cb2724f` (Wave 3 reconciliation after #85 / #87 / #90 / #91 / #93). **Code wins.** Inspected: **no** Guest-owned Company / Group / TA master tables, **no** relationship-link table, **no** loyalty-points store.

| Surface | CURRENT |
|---|---|
| **Profile-type hook** | `GUEST_PROFILE_TYPES` in `guest-profile-wave1.ts`: `individual` `live: true` (wave 1); `company` / `group` / `travel-agent` `live: false` (wave 4). Shell switcher (`data-testid="guest-profile-type-switcher"`) renders all four tabs; non-Individual tabs are **disabled** and labelled **not LIVE · Wave 4**. No create-company / create-group / create-TA success path. |
| **Directory** | Individual `listGuests` only. No Company / Group / TA directory, search, or list. |
| **Relationships card** | `GUEST_PROFILE_CARDS` id `relationships`: `live: false`, `wave: 4`. Copy: *“Coming in Wave 4. Company, group and travel-agent links are not LIVE. No master accounts can be created here.”* |
| **Loyalty & Value card** | id `loyalty`: `live: false`, `wave: 4`. Copy: *“Coming in Wave 4. Loyalty and value will use real-derived stay and folio figures only. No points balance is shown.”* Lock tests forbid invented numbers (no `12,500` / occupancy %). |
| **Individual VIP** | `guest_profiles.vip_status` boolean + `setGuestVip`. Staff flag only. **Not** a points balance or tier programme. |
| **SET3 VIP levels** | `pms_guest_vip_levels` is a Setup **catalogue** (code / name). It is **not** wired as a Guest loyalty product and is **not** a points store. |
| **SET3 company flag** | `restaurants.pms_guest_profile_rules.companyRelationshipEnabled` — Setup boolean on guest rules. **Not** a Company master, **not** a relationship row. |
| **FO / stay labels** | `hotel_reservations.company_name` / `group_name` (`0046_fo_search1_company_group.sql`) — optional **text labels** for FO search. Comments: *“optional company/group label. Null until stored. Never derived from source.”* **Not** FKs to a Guest master. |
| **Bill-to / folio routing** | **None.** Cashiering dashboard exposes `transfersSupported: false`. Ledger has no folio-to-folio transfer, split, or company bill-to product. |
| **Sales & Events** | `/restaurant/pms/sales-events` is a **planned placeholder** (*“Group blocks, corporate accounts and event bookings”*). No group-block / allotment / rooming-list product. |
| **TA commission** | **None.** Source-of-business may exist as a stay label; agent billing / commission is not a product. |
| **Catalogue** | `guest-profile` description: *“Individual guest directory and information. Company, group and travel-agent masters come later.”* `implementationStatus` `partial`. |
| **Server functions** | Individual CRUD / merge / consent / stay reads only (`guests.functions.ts`). **No** `createCompany` / `listTravelAgents` / relationship link APIs. |
| **Tables** | `guest_profiles`, `guest_preferences`, `guest_profile_history`, `guest_documents`. **No** `guest_companies`, `guest_groups`, `guest_travel_agents`, or link table on `main`. |

#### Must-not-claim (CURRENT)

- FO `company_name` / `group_name` are **not** Company / Group masters.
- SET3 `companyRelationshipEnabled` is **not** a Company register.
- SET3 `pms_guest_vip_levels` and `vipStatus` are **not** a loyalty-points programme.
- Wave 3 Dashboard stays / nights / folio amounts are **stay figures**, not Loyalty & Value LIVE.
- Sales & Events placeholder copy is **not** a live corporate / TA CRM.
- `transfersSupported: false` means Wave 4 must **not** claim folio split / routing / city-ledger as delivered.
- Wave 4 cards and types are **not** LIVE. This Spec does **not** implement them.

### 6.3 EXPECTED behaviour (Wave 4)

| Area | Expected |
|---|---|
| **(A) Masters** | Company, Group, and Travel Agent **registers** in the Guest module: **create / edit / list / search**. Ownership stays in Guest. **No** second company / group / TA table owned by Reservations, Cashiering, or Sales & Events. |
| **Profile-type hook → LIVE** | Wave 1 switcher (or nested Accounts under Guest) becomes **operational** for Company \| Group \| TA. Individual remains default and LIVE. Staff can switch type and use that type’s Directory / Information (or equivalent) without inferring a second module. |
| **Master Directory** | List / search / open for each master type. A created master is findable by search after create. Empty-honest when none — **no** sample companies. |
| **(B) Relationships** | Individuals can be associated with masters with **roles** (minimum: employer, bill-to, booker TA, group member). Associations are **visible from both sides** (individual Relationships card **and** the master). |
| **Unlink** | Removing a link does **not** delete the individual or the master. |
| **Consumer IDs** | Reservations / FO that attach a company / group / TA to a stay **consume the same Guest master IDs**. Typed-only `company_name` / `group_name` labels are **not** presented as masters. Existing labels stay labels until a written tech-plan migration (do **not** silently rewrite history as masters). |
| **(C) Loyalty & Value** | The north-star card is operational. Figures are **real-derived** from stored stays / nights / folio amounts (same honesty as Wave 3) **or** honest empty. **No invented points balance.** **No** placeholder “12,500 points”. Segments, if shown, are real-derived or omitted — do **not** invent a marketing taxonomy. |
| **VIP** | Remains the existing staff flag (`vipStatus`) unless a later requirement defines a programme. SET3 VIP **levels** stay a Setup catalogue unless the tech plan explicitly maps them — still **not** points. |
| **Bill-to honesty** | Store the **association** (role `bill-to`). Do **not** claim split-folio routing, city-ledger, or transfer-to-company if Cashiering still exposes `transfersSupported: false`. Copy must say association, not routing. |
| **Group honesty** | Group **account master** ≠ Sales & Events group **block**. Allotments, rooming lists, and MICE ops stay out. Wave 4 exit does **not** require S&E blocks. |
| **Access** | Preserve CURRENT `canManageGuests` / `requireGuestManager` / RLS behaviour unless Abel-flagged. Masters and links stay staff-only and tenant-scoped. |
| **Reuse** | Extend the Guest stack and 10-card shell. Do **not** introduce a parallel individual guest table, a new package, or peer-package masters. Persistence is proposed in the tech plan (this Spec does **not** invent table names). |
| **Shell UX** | When Loyalty / Relationships (or master Information) become LIVE guest-required cards, they inherit Directory-back (`isGuestRequiredProfileCard`) and empty-state **Open Directory** (`showEmptyDirectoryCta`). |
| **Honesty** | Wave 5 cards stay **Coming in Wave 5**. Do not claim the **module** COMPLETE from Wave 4. Do not claim Wave 4 implemented from this Spec. |

### 6.4 Locked requirements

| Part | EXPECTED |
|---|---|
| **(A) Masters** | Company, Group, and Travel Agent **registers** in the Guest module: create / edit / list / search. Profile-type switcher (or nested Accounts) becomes operational for these types. **No** second company/TA table owned by Reservations, Cashiering, or Sales & Events. |
| **(B) Relationships** | Individuals can be associated with masters with **roles**: employer, bill-to, booker TA, group member (minimum set). Associations are visible from both sides. |
| **(C) Loyalty & Value** | Metrics are **real-derived** (e.g. stay counts, nights, posted folio totals that already exist). VIP remains a staff flag unless a later requirement defines a programme. **No invented points balance.** |

Group **account** ≠ Sales & Events group **block**. Allotments / rooming lists stay out.

Company **bill-to as a folio routing product** may still depend on cashiering / M1 work. Wave 4 must store the **association** honestly; it must **not** claim split-folio routing if Cashiering still exposes `transfersSupported: false`.

### 6.5 Master register (planning — no invented schema)

This Spec does **not** invent table names or columns. The tech plan proposes Guest-owned persistence (additive tables **or** an equivalent Guest-owned design). **Must not** create peer-package masters.

| Master type | Wave 4 capability | Not this wave |
|---|---|---|
| **Company** | Create / edit / list / search in Guest. Link individuals (employer, bill-to as applicable). | City-ledger / folio routing product; a second company table in Cashiering or Reservations |
| **Group (account)** | Create / edit / list / search in Guest. Link individuals (group member). | S&E group **blocks**, allotments, rooming lists, MICE ops |
| **Travel Agent** | Create / edit / list / search in Guest. Link individuals (booker TA). | TA commission settlement; GDS / IATA full settlement |

**Minimum identity for search:** a display **name** (required) so staff can find the master they just created. Optional contact / notes: tech plan names the field list; do not invent a worldwide company schema here.

**SET3 `companyRelationshipEnabled`:** remains a Setup **flag**. Wave 4 must **not** treat the flag as the Company register. The tech plan may consume it as a property capability switch or leave it Setup-only — write the choice.

### 6.6 Relationship roles (minimum set)

| Role | Typical pair | Meaning |
|---|---|---|
| **employer** | Individual ↔ Company | The company employs (or sponsors) this guest. |
| **bill-to** | Individual ↔ Company (or other master if the tech plan allows) | **Association** of who is billed — **not** folio split / routing unless Cashiering later supports it. |
| **booker TA** | Individual ↔ Travel Agent | The travel agent booked (or represents) this guest. |
| **group member** | Individual ↔ Group account | The guest belongs to this Group **account** — **not** an S&E rooming-list assignment. |

Rules:

- Visible on the individual’s **Relationships** card and on the master.
- Unlink does not delete either party.
- One individual may hold more than one role (tech plan names uniqueness: e.g. one employer vs many group memberships).
- Wave 2 **individual** merge must not silently delete masters. The tech plan writes what happens to links when an individual is merged (reassign to survivor, or explicit staff choice) — never a silent wipe presented as success.

### 6.7 Loyalty & Value honesty matrix

| Figure | Honest on `main`? | Wave 4 Loyalty rule |
|---|---|---|
| **Stay count** | **Yes** (Wave 3) | May appear, labelled as stays — **not** “points”. |
| **Nights** | **Yes** (`nightsBetween`) | May appear, labelled as nights. |
| **Quoted room total** | **Partial** | Same as Wave 3: only where stored; not posted revenue; omit / not available if none. |
| **Posted folio balance** | **Partial** | Same as Wave 3: only when a folio exists. |
| **VIP flag** | **Yes** (boolean) | Remains the staff flag on Information. Loyalty must **not** convert VIP into invented points. |
| **SET3 VIP level catalogue** | Setup list only | Not a points programme. Do not display fake tier scores. |
| **Points balance / earn / burn** | **Does not exist** | **Omit.** Never invent `12,500 points` or a placeholder ledger. |
| **Marketing segments** | **Does not exist** as a product | If shown, derive from real stays (e.g. stay-count band) **and** label the derivation — or omit. Do not invent personas. |
| **Lifetime “true revenue”** | **Not a single honest source** | Do **not** ship one invented lifetime spend. |
| **Folio transfers / company routing** | **N/A** (`transfersSupported: false`) | Do not show transfer / split-to-company KPIs. |
| **OTA / gateway / classic NA** | **Does not exist** | Omit. Never invent. |

**Default Loyalty set (locked preference):** reuse Wave 3 honest stay / night (and optional stored amounts) **or** honest empty. Prefer empty-honest over a decorative points widget.

### 6.8 Bill-to vs folio routing (honesty)

| Claim | Wave 4 |
|---|---|
| Staff can store **bill-to** as a relationship role | **Yes** — association on the profile |
| Folio header routes charges to that company | **Not from this wave** while `transfersSupported: false` |
| Split folio / city-ledger / transfer-to-master | **Out** — Cashiering / later M1 (E-M02 / E-M03). Flag if a later Spec reopens it. |
| UI copy “billed to {Company}” as **routing success** | **Forbidden** while transfers are unsupported. Allowed: “Bill-to association: {Company}” (or equivalent honest label) |

### 6.9 Group account vs Sales & Events blocks (honesty)

| Surface | Wave 4 |
|---|---|
| Guest **Group account** master (name, list, member links) | **In** — Guest module |
| S&E group **block** / allotment / pickup / rooming list | **Out** — `/restaurant/pms/sales-events` stays the planned placeholder |
| MICE / event / meeting-space ops | **Out** |
| Wave 4 exit depends on S&E blocks | **No** (AC-W4-7) |

### 6.10 Out of Wave 4

| Out | Belongs |
|---|---|
| Notes / Comms / Activity hub | Wave 5 |
| Export / anonymise / unmerge / privacy audit | Wave 5 |
| Offline-first Guest UX | Out of this module |
| Full Sales & Events group-block operations / allotments / rooming lists | Out of this module |
| MICE ops | Out |
| Second company / group / TA master outside Guest | Never invent |
| LIVE OTA / channel-manager sync | Never invent |
| Payment-gateway settlement | Never invent |
| Classic nightly room-and-tax night audit as a Guest capability | Never invent |
| TA commission settlement | Out unless a later Spec says so |
| Folio split / routing / city-ledger product | Cashiering / M1 — not Guest Wave 4 |
| Invented loyalty points / fake segments | Never invent |
| Entitlement-architecture redesign | Flag Abel; not assumed |
| Wave 4 **code** from this Spec alone | Issue + tech plan + **Rekik plan approval** first |

### 6.11 Acceptance criteria (testable)

Staff in the ACs are **authorised**: signed-in, property membership, package **pms**, and they pass the existing guest manage gate. “Denied staff” fail that gate or lack `pms`.

| ID | Criterion | Pass |
|---|---|---|
| **AC-W4-1** | Staff can **create a Company master** in Guest and **find it by search**. | Create with a required display name. Reload Directory (Company type). Search returns that master. Source is the Guest-owned Company register — not a typed FO `company_name` label. |
| **AC-W4-2** | Staff can **create / find** a **Group account** master and a **Travel Agent** master the same way. | Same as AC-W4-1 for Group and TA. Both types are operational in Guest. S&E is not the create path. |
| **AC-W4-3** | Staff can **link** an individual as **employer** / **bill-to** / **booker TA** / **group member** and see the link on **Relationships**. | Each minimum role can be set. Relationships card shows the master + role. The master shows the individual. |
| **AC-W4-4** | **Removing a link** does not delete the individual or the master. | Unlink → individual still in Individual Directory; master still in its Directory; relationship gone. |
| **AC-W4-5** | Reservations / FO **consume the same master IDs** — no typed-only “company name” presented as a master. | Where a stay attaches Company / Group / TA after Wave 4, the picker uses Guest master IDs. FO `company_name` / `group_name` remain labels unless the tech plan migrates them — they are not retitled “master”. |
| **AC-W4-6** | **Loyalty & Value** shows only **derived** figures or **honest empty**; no placeholder “12,500 points”. | Visible numbers trace to Wave 3 stay / folio sources (or are omitted). No points ledger. VIP is not converted into invented points. |
| **AC-W4-7** | Sales & Events is **not** required to implement group **blocks** for this wave to exit. | Group **account** CRUD + member links work. `/restaurant/pms/sales-events` may remain a placeholder. Allotments / rooming lists absent is **PASS**, not a defect. |
| **AC-W4-8** | Staff can **edit** a Company / Group / TA master and see updates **persist** after reload. | Change name (or an allowed contact field); reopen; values match. Same Guest writer — no parallel store. |
| **AC-W4-9** | Wave 1 **profile-type hook** is **LIVE** for Company \| Group \| TA (switcher or nested Accounts). | Staff can select each type and reach that type’s Directory. Individual remains default. Disabled “not LIVE” labels are removed for types that are operational. |
| **AC-W4-10** | Associations are **visible from both sides**. | Open the individual → Relationships shows the master. Open the master → the individual + role appear. |
| **AC-W4-11** | **No** second company / group / TA master owned by Reservations, Cashiering, or Sales & Events. | Diff does not add peer-package master tables. Consumers read Guest IDs. |
| **AC-W4-12** | **Bill-to** is stored as an **association**. UI does **not** claim folio split / routing while `transfersSupported: false`. | Role persists. No “folio routed to company” success. Cashiering transfer flag unchanged unless a later cashiering Spec says otherwise. |
| **AC-W4-13** | Group **account** master is **not** an S&E block / allotment / rooming list. | Group Information / Relationships have no pickup, allotment, or rooming-list editor. Copy does not call the account a “block”. |
| **AC-W4-14** | **VIP** remains the staff flag unless a later programme is specified. | `setGuestVip` / Information VIP still work. Loyalty does not invent a points-for-VIP conversion. |
| **AC-W4-15** | A guest with **no** honest derived value sees **empty / not available** on Loyalty — not a decorative score. | Zero stays → no invented points or lifetime spend. Stays without amounts omit revenue. |
| **AC-W4-16** | FO `company_name` / `group_name` and SET3 `companyRelationshipEnabled` are **not** presented as Guest masters. | Labels / flag remain what they are. Creating a Company master does not require those fields to already hold data. |
| **AC-W4-17** | Wave 5 cards stay **Coming in Wave 5**. Wave 4 does **not** ship comms / export / anonymise / unmerge. | Notes / Comms / Activity and Admin & Privacy remain placeholders. Wave 2 consent / notes remain on Information. |
| **AC-W4-18** | Denied staff cannot list or mutate masters or relationships. | Same property, role outside the working gate: no master data, no links. Other-property IDs fail. Public / unauthenticated users redirect to login. |
| **AC-W4-19** | Masters and links are **tenant-scoped**. | Property 2 does not see property 1 Company / Group / TA or links. `restaurantId` from the client is not trusted alone. |
| **AC-W4-20** | Creating / updating a master or changing a relationship writes **history** (additive event types as the tech plan names). | History is not deleted. Wave 4 does not need the Wave 5 Comms card. |
| **AC-W4-21** | Wave 4 does **not** invent LIVE OTA, gateway settlement, classic nightly NA, or TA commission settlement. | No “channel points”, “commission due”, or “NA room+tax loyalty” widgets. |
| **AC-W4-22** | **No** DB entitlement / auth architecture change beyond the existing guest manage gate, unless Abel-flagged. | Diff has no new package and no new RLS role model unless a Spec addendum flags Abel. Additive RLS on new Guest-owned tables that **matches** existing guest-table roles is expected and is **not** a model change. |
| **AC-W4-23** | When Loyalty / Relationships (or master Information) are LIVE guest-required cards, **Directory-back** and empty-state **Open Directory** inherit the Wave 3 shell rules. | Selected guest: sticky **← Directory**. No guest: primary **Open Directory**. Coming-in-Wave cards stay copy-only. |

#### Wave 4 AC results

DESIGN COMPLETION: **READY FOR ENGINEERING PLANNING** (Wave 4 Spec). IMPLEMENTATION STATUS: **NOT STARTED**. Approved deviations: **NONE** (planning only).

`NOT RUN` is never `PASS`. Do **not** record AC-W4-* as PASS from this Spec.

### 6.12 QA (Wave 4)

`NOT RUN` is never `PASS`. Live PMS UI that is not exercised stays **NOT VERIFIED**.

| ID | Check | Notes |
|---|---|---|
| **QA-W4-1** | Authorised happy path: switch to Company → create → search → open → edit → persist. | Browser, signed-in PMS session. |
| **QA-W4-2** | Same happy path for Group account and Travel Agent. | |
| **QA-W4-3** | Link individual as employer, bill-to, booker TA, and group member; confirm both sides. | |
| **QA-W4-4** | Unlink each role; individual and masters still exist. | |
| **QA-W4-5** | Profile-type switcher / Accounts: Individual + Company + Group + TA all operational. | Screenshot + note. |
| **QA-W4-6** | Loyalty: guest with stays shows only derived figures; guest with zero stays is empty-honest — no points. | Compare to Wave 3 Dashboard sources. |
| **QA-W4-7** | Bill-to association visible; **no** folio-routing / split success copy while `transfersSupported: false`. | |
| **QA-W4-8** | Group account has **no** S&E block / allotment / rooming-list controls. S&E placeholder unchanged. | |
| **QA-W4-9** | FO search still matches stored `company_name` / `group_name` **labels**; those rows are not retitled as masters. | |
| **QA-W4-10** | SET3 `companyRelationshipEnabled` toggle still saves as a Setup flag — not a Company row. | |
| **QA-W4-11** | Wave 5 cards still Coming in Wave 5; no fabricated comms / privacy metrics. | Screenshot + note. |
| **QA-W4-12** | `tsc --noEmit` (or project equivalent) on the implementation PR. | Developer lane. |
| **QA-W4-13** | Independent QA after Developer QA. | Required before Wave 4 exit. Hotel UAT is **module** DoD, not Wave 4 alone. |

### 6.13 Security (Wave 4)

| ID | Check |
|---|---|
| **SEC-W4-1** | Unauthenticated visit to Guest canonical routes (including any new master / relationship URL) redirects to login. |
| **SEC-W4-2** | Membership **without** package `pms` cannot use Company / Group / TA masters, Relationships, or Loyalty. |
| **SEC-W4-3** | Staff who fail `canManageGuests` / `requireGuestManager` cannot read or write masters or links for that property. |
| **SEC-W4-4** | Tenant isolation: master and relationship reads re-derive `restaurantId` from membership. Property 1 Company is not returned for property 2. |
| **SEC-W4-5** | No new public / customer route exposes company contact PII, TA contacts, or relationship graphs. |
| **SEC-W4-6** | Unlink is not a silent delete of people or masters. No unique-constraint “upsert” that hides a second company. |
| **SEC-W4-7** | Do not log full company tax IDs, TA credentials, or ID numbers in client telemetry if that channel does not already. |
| **SEC-W4-8** | RLS / role model unchanged unless Abel-flagged. Receptionist vs owner/manager inconsistency remains **documented**, not silently “fixed”. Additive policies on new Guest-owned tables must not widen receptionist access beyond the documented residual. |

### 6.14 Regression (Wave 4)

| ID | Check |
|---|---|
| **REG-W4-1** | Wave 1 Individual Directory / Information create / find / edit still work on the same routes. |
| **REG-W4-2** | Wave 2 Identity / Preferences / merge / consent still work. Merge still reassigns `hotel_reservations.guest_id`. |
| **REG-W4-3** | Wave 3 Stay History, Dashboard Overview, quick actions, guest-context, Directory-back, and empty-state Open Directory still work. |
| **REG-W4-4** | Information History tab still lists `guest_profile_history` and is not replaced by Relationships or Loyalty. |
| **REG-W4-5** | FO-SEARCH1 `company_name` / `group_name` label search still functions. |
| **REG-W4-6** | SET3 guest rules (`companyRelationshipEnabled`, consent defaults, required fields) still save. |
| **REG-W4-7** | Sales & Events placeholder remains planned — Wave 4 must not ship fake group blocks there. |
| **REG-W4-8** | Cashiering `transfersSupported: false` unchanged. Wave 4 must not claim folio transfers. |
| **REG-W4-9** | Wave 5 cards stay honest placeholders. |
| **REG-W4-10** | No new package; no Back Office / Reservations / Cashiering guest or company master; no second `guest_profiles` table. |
| **REG-W4-11** | Distribution / OTA labels unchanged — this wave must not add “live channel” claims. |
| **REG-W4-12** | Individual `vipStatus` toggle and badges still work. |
| **REG-W4-13** | Guest Services placeholder remains requests / concierge — not this module. |

### 6.15 Wave 4 permissions (summary)

| Check | Rule |
|---|---|
| Package | **pms** |
| Module access | Existing `front_office` role check inside `requireGuestManager` |
| Manage flag | Existing `getGuestsAccess` → `canManageGuests` |
| RLS | Existing owner / manager policies on guest tables; new Guest-owned master / link tables match that model unless Abel-flagged |
| Wave 4 change | New master / relationship **writes** use the same chain. **Flag Abel** if a new entitlement type or RLS role is proposed. |
| Cashiering / S&E | Wave 4 does **not** widen folio-transfer or S&E entitlements. |

### 6.16 Wave 4 exit

Wave 4 **exits for engineering-gate purposes** only after:

1. Rekik **plan approval** (issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) tech plan)
2. Implementation against this §6 contract (extend existing guest code — do **not** restart)
3. Developer QA recorded (`NOT RUN` ≠ `PASS`)
4. Independent QA **PASS**
5. Human merge of the implementation PR
6. Design Execution Report
7. Docs reconciliation to `main` (code wins)

**Hotel UAT is not required to start Wave 5** but **is** required for **module COMPLETE**.

Passing this planning Spec does **not** start Wave 4 code and does **not** ungate Wave 5. Wave 5 remains **WAVE-GATED**. The module is **not** COMPLETE.

Exit product summary: masters + associations + honest loyalty/value; Independent QA recorded; bill-to stored without a folio-routing claim; Group account delivered without S&E blocks.

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

## 8. Cross-wave QA / security / regression (Wave 5)

Wave 2 QA / Security / Regression live in §4.10–§4.12. Wave 3 QA / Security / Regression live in §5.10–§5.12 at Wave 1 depth. Wave 4 QA / Security / Regression live in §6.12–§6.14 at Wave 1 depth (`NOT RUN` ≠ `PASS`). When Wave 5 is ungated, its tech plan **must** include the same depth. Until then, these rules hold:

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
| Directory-back on guest-required cards | Every wave — same Information back-arrow pattern, or a shell-level sticky back-to-Directory. Wave 3 residual **delivered** (#90); see §5.15. Not Waves 4–5 product scope. |
| Empty / no-guest-selected Directory CTA | Every wave — guest-required cards must include a primary CTA into Directory (copy alone is not enough). Wave 3 residual **delivered** (#91 / #93); see §5.16. Aligns with §5.15 / #90. Not Waves 4–5 product scope. |

---

## 9. What this Spec does not do

| This Spec does | This Spec does **not** |
|---|---|
| Record Wave 1 as **ACCEPTED** and **IMPLEMENTED ON MAIN** (#66 / #67) | Claim the **module** is COMPLETE |
| Keep Wave 1 ACs as the accepted contract | Reopen Wave 1 engineering |
| Record Wave 2 as **ACCEPTED** and **IMPLEMENTED ON MAIN** (#72 / #76 / #79) | Reopen Wave 2 engineering or treat #79 as a new wave |
| Keep Wave 2 ACs as the accepted contract | Treat Wave 2 residuals as Wave 3 defects |
| Record Wave 3 as **ACCEPTED** and **IMPLEMENTED ON MAIN** (#81 / #85 / #87 / #90) | Reopen #81 or claim the module COMPLETE |
| Keep Wave 3 ACs as the accepted contract | Reopen Stay History / KPI / Directory-back engineering |
| Record Wave 4 Spec as **READY FOR ENGINEERING PLANNING** (gate OPENED; §6 ACs) | Claim Wave 4 **implemented**, start Wave 4 **code** from this Spec alone, or ungate Wave 5 |
| Keep Wave 5 product intent **WAVE-GATED** | Start comms / privacy finish from this planning pass |
| Require extending current guest code | Authorise a rewrite or a new guest package |
| Record that Waves 1–3 preserved the existing guest manage gate | Silently change entitlements or RLS roles |
| Record Wave 3 approved deviations (#85 early merge → #87; #86 duplicate of #87; Developer browser PARTIAL) | Treat those process notes as product defects, or treat Developer PARTIAL as PASS |

---

## Closing

> **Wave 1 Spec ACCEPTED + IMPLEMENTED ON MAIN** (#66 / #67). Wave 1 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 2 Spec ACCEPTED + IMPLEMENTED ON MAIN** (#72 / #76 / #79). **ENGINEERING STATUS: COMPLETE / MERGED.** Wave 2 is OPERATIONALLY ACCEPTED / closed.
>
> **Wave 3 Spec ACCEPTED + IMPLEMENTED ON MAIN** (#81 / #85 / #87 / #90). **ENGINEERING STATUS: COMPLETE / MERGED.** Wave 3 is OPERATIONALLY ACCEPTED / closed. DESIGN COMPLETION **COMPLETE** (Wave 3). IMPLEMENTATION STATUS **PASS**.
>
> Wave 4 Spec: **READY FOR ENGINEERING PLANNING**. ENGINEERING STATUS **AWAITING ISSUE + TECH PLAN + REKIK PLAN APPROVAL**. Gate OPENED by Rekik (2026-09-14 via Advisor). Issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) OPEN. Wave 4 is **not** implemented.
>
> Wave 5: **SPECIFIED / WAVE-GATED**.
>
> The module is **not** COMPLETE. Hotel UAT is still required after Waves 4–5.
>
> Extend existing guest code. Create once → use everywhere → enrich.
