# Guest Profile — Gap-edit #3 Spec (IMPLEMENTED ON MAIN)

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile — Travel Agency (TA) master enrichment + Company Payment Terms |
| **STATUS** | **IMPLEMENTED ON MAIN** / Independent QA **PASS** (post-merge 2026-09-15). **Not** OPERATIONALLY ACCEPTED / closed yet |
| **ENGINEERING STATUS** | **COMPLETE / MERGED** — PR [#118](https://github.com/NORUDEVGIT/NORU/pull/118) MERGED 2026-09-15T07:50:05Z |
| **IMPLEMENTATION STATUS** | **PASS** — AC-GE3-1…18 **PASS** |
| **Independent QA** | **PASS** (Rekik 2026-09-15) — **post-merge** accept on `main`. #118 MERGED 2026-09-15T07:50:05Z **before** Independent QA routing; PASS is for the record, not a pre-merge gate |
| **Developer QA** | **PARTIAL** — `tsc` PASS; locks **161/161**; browser **deferred** until 0058 non-prod. `NOT RUN` is never PASS |
| **Issue** | [#115](https://github.com/NORUDEVGIT/NORU/issues/115) remains **OPEN** — READY TO CLOSE after Outcome Review. Advisor Feedback **sent**; Outcome Review **pending**. This recon **Relates** only — do **not** close #115; do **not** claim closed / OPERATIONALLY ACCEPTED closed |
| **Migration** | **0058** dual-lane (`0058_pms_travel_agency_enrichment.sql`) **APPLY HELD**. Rekik has **requested** non-prod apply on `qcwptraosaudcbjasmul`. Do **not** claim APPLY PASS until Eng reports it. Production not applied |
| **Waves 1–5** | Stay OPERATIONALLY ACCEPTED / closed — do **not** reopen |
| **GE1 (#103/#105)** | Stay OPERATIONALLY ACCEPTED / closed — do **not** reopen |
| **GE2 (#109/#111/#112)** | Stay OPERATIONALLY ACCEPTED / closed — do **not** reopen |
| **Module COMPLETE** | **NO** — hotel UAT still required |
| **Canonical location** | This file (lean addendum). Programme note: [`../guest-profile-gap-edit-3-programme.md`](../guest-profile-gap-edit-3-programme.md) |

> **Rekik Independent QA PASS 2026-09-15 (post-merge).** Additive only. Extend `guest_account_masters` / `guest_account_links`. **No** second link store. **No** commission settlement engine. **No** rate engine. **No** AP/AR engine. Group form stays **thin**. Company Payment Terms added on the existing GE1 sectioned form. Gap-edit 3 is **not** OPERATIONALLY ACCEPTED / closed — #115 stays **OPEN** until Outcome Review. Advisor Feedback sent. This recon does **not** close #115.

## 1. CURRENT (code wins — tip of `main` after #118)

- **TA** (`account_type=travel_agent`) uses a **sectioned** create/edit form. Collapsible sections; **Agency Information** open by default: Agency Information, Contacts, Address, License/Registration (staff text, not KYC), Commission (**reference only**), Contract (no e-sign), Rates (**name/code only**), Payment Terms, Notes.
- Legal name + agency type required; `other_text` required when type=`other`.
- **Linking** on TA writes **`guest_account_links` only** (no second store). Default role **`booker_ta`**. Directory search + select; list + unlink (link row only; parties remain). Individual Relationships stays in sync. **Staged Create** on New TA (create master → write staged links; partial-failure retry).
- **Company** sectioned form (GE1) now includes **Payment Terms** (terms / credit limit note / billing instruction) — **not** AP/AR.
- **Group** form stays **thin** (shared `GuestAccountFormDialog`).
- Commission / rates / payment terms are **reference only** — no settlement, rate engine, or AP/AR product.
- Surfaces degrade honestly with `TA_ENRICHMENT_UNAVAILABLE` (or equivalent) until **0058** is applied. **0058 APPLY HELD** — Rekik requested non-prod apply on `qcwptraosaudcbjasmul`; **not** APPLY PASS until Eng reports it.
- Developer QA **PARTIAL** (browser deferred until 0058 non-prod). `NOT RUN` is never PASS.

## 2. EXPECTED — Scope A (sectioned TA form) — delivered on `main`

Replace thin form **only when `account_type = travel_agent`**. Group remains thin.

Collapsible sections; **Agency Information** open by default:

1. **Agency Information:** legal name* (maps to existing `name`); trade/display name; code; **agency type** `ota | local | online | other` (+ `other_text` if other); status active/inactive; website
2. **Contacts:** primary + alt phone; primary + alt email; primary contact person; billing contact
3. **Address:** line1; line2; city; region/state; country; postal code
4. **License / Registration:** IATA / license number; business registration number; tax ID/TIN; license expiry date — staff text/dates only; **not** government KYC
5. **Commission:** default commission % or rule label; commission type `percent | fixed_note`; currency note — **REFERENCE ONLY**. UI copy must not claim live commission posting/settlement
6. **Contract:** contract reference; start date; end date; contract status `draft | active | expired`; signed-with — text/dates only; **no** e-sign product
7. **Rates:** negotiated rate / allotment **reference** name/code only — **NOT** a rate engine
8. **Payment Terms:** terms code/label (e.g. NET15 / NET30 / Due on departure); credit limit note; billing instruction — text/enum only; **not** AP/AR
9. **Notes:** notes

Validation: legal/company name required; agency type required; `other_text` required when type=`other`.

## 3. EXPECTED — Scope B (Linking on TA) — delivered on `main`

On **saved** TA detail and **staged Create**:

- Link guests → Directory search + select
- Default role **`booker_ta`**; other Wave 4 roles (`employer` | `bill_to` | `group_member`) only if UX keeps parity without inventing new roles
- Confirm → write **`guest_account_links` only**
- List linked guests + unlink (delete link row only; parties remain)
- Individual Relationships card remains and stays in sync (same store)
- **No** second relationship system; **no** folio routing invent; **no** guest↔guest family graph

Staged Create honesty: on New TA, staff may stage guest links before submit; one Create → create TA → write links; partial-failure retry if create succeeds but link fails.

## 4. EXPECTED — Scope C (Company Payment Terms) — delivered on `main`

On existing Company sectioned form, Payment Terms (Commercial subsection or dedicated section):

- terms code/label
- credit limit note
- billing instruction

Same honesty as TA Payment Terms. Do **not** invent AP/AR, city-ledger, or folio split.

## 5. DATABASE IMPACT

**YES — additive migration `0058` (APPLY HELD — not APPLY PASS):**

- Additive columns on `guest_account_masters` for TA enrichment + shared/company payment-terms fields (nullable; TA-only fields ignored for company/group where appropriate)
- **No** new link table (reuse `guest_account_links`)
- Dual-lane drizzle + supabase; **APPLY HELD**
- Rekik has **requested** non-prod apply on `qcwptraosaudcbjasmul`. Do **not** claim APPLY PASS until Eng reports it
- Production: separate Abel/PM gate; **not** applied
- Additive RLS matching guest/account tables OK; **flag Abel** if entitlement/RLS **model** must change
- Surfaces degrade honestly until apply (`TA_ENRICHMENT_UNAVAILABLE` / equivalent)

## 6. Out of scope (locked)

Live commission posting/settlement; rate engine; allotment inventory ops; e-sign; AP/AR / city-ledger; Group form enrichment; Import; loyalty points; Folio tab; AC-W4-5 create-reservation boil-in; guest↔guest family; reopening Waves 1–5 / GE1 / GE2; inventing KYC/police export.

## 7. Acceptance criteria (AC-GE3) — all PASS

| ID | Criterion | Result |
|---|---|---|
| **AC-GE3-1** | Sectioned TA create/edit; Agency Information open by default; Group form stays thin | **PASS** |
| **AC-GE3-2** | Legal name + agency type required; `other` requires other_text | **PASS** |
| **AC-GE3-3** | Contacts (primary+alt) + Address (incl. line2/region/postal) persist | **PASS** |
| **AC-GE3-4** | License/registration fields persist; no KYC claim | **PASS** |
| **AC-GE3-5** | Commission fields persist as **reference only**; no settlement UI/claims | **PASS** |
| **AC-GE3-6** | Contract fields persist; no e-sign product | **PASS** |
| **AC-GE3-7** | Rates field is **reference name/code only**; no rate engine | **PASS** |
| **AC-GE3-8** | TA Payment Terms persist (terms / credit note / billing instruction) | **PASS** |
| **AC-GE3-9** | Notes persist | **PASS** |
| **AC-GE3-10** | After save (or staged Create), Linking can attach guests via `guest_account_links` with `booker_ta` (default) | **PASS** |
| **AC-GE3-11** | List + unlink without deleting guest or TA master | **PASS** |
| **AC-GE3-12** | Individual Relationships shows same links (same store; no second system) | **PASS** |
| **AC-GE3-13** | Company form gains Payment Terms; values persist; no AP/AR invent | **PASS** |
| **AC-GE3-14** | `pms` + guest manage gate preserved; tenant-scoped | **PASS** |
| **AC-GE3-15** | No entitlement/RLS **model** change (additive RLS OK); flag Abel if hard model change proposed | **PASS** |
| **AC-GE3-16** | Migration 0058 dual-lane APPLY HELD; honest degrade until apply | **PASS** |
| **AC-GE3-17** | Waves 1–5 + GE1 + GE2 not reopened as incomplete; module not claimed COMPLETE | **PASS** |
| **AC-GE3-18** | Out-of-scope locked items absent (commission engine, rate engine, Group enrichment, Import, etc.) | **PASS** |

## 8. QA / Security / Regression (summary)

- Developer QA: **PARTIAL** — `tsc --noEmit` **PASS**; Guest Profile locks **161/161 PASS** (Waves 1–5 + GE1 + GE2 + AC-GE3-1…18); browser **deferred** until 0058 non-prod. `NOT RUN` is never PASS
- Independent QA (Rekik): **PASS** 2026-09-15 — **post-merge** on #118 (early-merge: #118 MERGED 2026-09-15T07:50:05Z before Independent QA routing)
- Advisor Feedback **sent**; Outcome Review **pending** — #115 remains **OPEN** (READY TO CLOSE after Outcome Review). Do **not** claim closed / OPERATIONALLY ACCEPTED closed
- Security: staff-only; no public TA PII; no new SECURITY DEFINER unless Abel-approved
- Regression: Company GE1 form; Individual GE2; Group thin form; Wave 4 links; Wave 5 privacy — prior batches stay closed
