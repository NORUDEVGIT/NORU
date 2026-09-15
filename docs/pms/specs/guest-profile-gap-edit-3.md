# Guest Profile — Gap-edit #3 Spec (Eng-ready)

| Field | Value |
|---|---|
| **PACKAGE** | PMS |
| **FEATURE** | Guest Profile — Travel Agency (TA) master enrichment + Company Payment Terms |
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik 2026-09-15 via Advisor) |
| **ENGINEERING STATUS** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Issue** | OPEN when Eng opens (Relates; do not claim implemented) |
| **Migration** | Proposed **0058** dual-lane APPLY HELD — Abel/PM gate (non-prod first). TIP names next free after 0057; Eng confirms sequential number if 0058 taken |
| **Waves 1–5** | Stay OPERATIONALLY ACCEPTED / closed — do **not** reopen |
| **GE1 (#103/#105)** | Stay OPERATIONALLY ACCEPTED / closed — do **not** reopen |
| **GE2 (#109/#111/#112)** | Stay OPERATIONALLY ACCEPTED / closed — do **not** reopen |
| **Module COMPLETE** | **NO** — hotel UAT still required |
| **Canonical location** | This file (lean addendum). Programme overview: `docs/pms/guests.md` / `docs/pms/README.md` |

> **Rekik APPROVED 2026-09-15.** Additive only. Extend `guest_account_masters` / `guest_account_links`. **No** second link store. **No** commission settlement engine. **No** rate engine. **No** AP/AR engine. Group form stays **thin**. Company form already sectioned (GE1) — this Spec only **adds Payment Terms** to Company.

## 1. CURRENT (code wins — tip of `main` after GE1/GE2)

- **TA / Group** create/edit still use thin shared `GuestAccountFormDialog`: name*, code, status, email, phone, addressLine1, city, country, notes.
- **Company** uses sectioned enrichment form (GE1): Basic / Tax / Contact / Address / Commercial / Notes — **no Payment Terms** fields yet.
- Relationships: Wave 4 `guest_account_links` roles `employer` | `bill_to` | `booker_ta` | `group_member` LIVE.
- No TA-specific license/IATA/commission/contract/rates/payment-terms columns LIVE as product UI.

## 2. EXPECTED — Scope A (sectioned TA form)

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

## 3. EXPECTED — Scope B (Linking on TA)

On **saved** TA detail (and staged Create if Eng mirrors Individual/Company pattern):

- Link guests → Directory search + select
- Default role **`booker_ta`**; other Wave 4 roles (`employer` | `bill_to` | `group_member`) only if UX keeps parity without inventing new roles
- Confirm → write **`guest_account_links` only**
- List linked guests + unlink (delete link row only; parties remain)
- Individual Relationships card remains and stays in sync (same store)
- **No** second relationship system; **no** folio routing invent; **no** guest↔guest family graph

Staged Create honesty (preferred if low-cost): on New TA, staff may stage guest links before submit; one Create → create TA → write links; partial-failure retry if create succeeds but link fails.

## 4. EXPECTED — Scope C (Company Payment Terms)

On existing Company sectioned form, add Payment Terms (Commercial subsection or dedicated section):

- terms code/label
- credit limit note
- billing instruction

Same honesty as TA Payment Terms. Do **not** invent AP/AR, city-ledger, or folio split.

## 5. DATABASE IMPACT

**YES — additive migration** (proposed **0058**):

- Additive columns on `guest_account_masters` for TA enrichment + shared/company payment-terms fields as Eng maps (nullable; TA-only fields ignored for company/group where appropriate)
- **No** new link table (reuse `guest_account_links`)
- Dual-lane drizzle + supabase; **APPLY HELD**; Abel/PM non-prod first then production
- Additive RLS matching guest/account tables OK; **flag Abel** if entitlement/RLS **model** must change
- Surfaces degrade honestly until apply (e.g. `TA_ENRICHMENT_UNAVAILABLE` / equivalent)

## 6. Out of scope (locked)

Live commission posting/settlement; rate engine; allotment inventory ops; e-sign; AP/AR / city-ledger; Group form enrichment; Import; loyalty points; Folio tab; AC-W4-5 create-reservation boil-in; guest↔guest family; reopening Waves 1–5 / GE1 / GE2; inventing KYC/police export.

## 7. Acceptance criteria (AC-GE3)

| ID | Criterion |
|---|---|
| **AC-GE3-1** | Sectioned TA create/edit; Agency Information open by default; Group form stays thin |
| **AC-GE3-2** | Legal name + agency type required; `other` requires other_text |
| **AC-GE3-3** | Contacts (primary+alt) + Address (incl. line2/region/postal) persist |
| **AC-GE3-4** | License/registration fields persist; no KYC claim |
| **AC-GE3-5** | Commission fields persist as **reference only**; no settlement UI/claims |
| **AC-GE3-6** | Contract fields persist; no e-sign product |
| **AC-GE3-7** | Rates field is **reference name/code only**; no rate engine |
| **AC-GE3-8** | TA Payment Terms persist (terms / credit note / billing instruction) |
| **AC-GE3-9** | Notes persist |
| **AC-GE3-10** | After save (or staged Create), Linking can attach guests via `guest_account_links` with `booker_ta` (default) |
| **AC-GE3-11** | List + unlink without deleting guest or TA master |
| **AC-GE3-12** | Individual Relationships shows same links (same store; no second system) |
| **AC-GE3-13** | Company form gains Payment Terms; values persist; no AP/AR invent |
| **AC-GE3-14** | `pms` + guest manage gate preserved; tenant-scoped |
| **AC-GE3-15** | No entitlement/RLS **model** change (additive RLS OK); flag Abel if hard model change proposed |
| **AC-GE3-16** | Migration 0058 (or next free) dual-lane APPLY HELD; honest degrade until apply |
| **AC-GE3-17** | Waves 1–5 + GE1 + GE2 not reopened as incomplete; module not claimed COMPLETE |
| **AC-GE3-18** | Out-of-scope locked items absent (commission engine, rate engine, Group enrichment, Import, etc.) |

## 8. QA / Security / Regression (summary)

- Developer: `tsc` + lock tests for AC-GE3-1…18; browser may be PARTIAL until 0058 non-prod apply
- Independent QA (Rekik): required before merge PASS
- Security: staff-only; no public TA PII; no new SECURITY DEFINER unless Abel-approved
- Regression: Company GE1 form; Individual GE2; Group thin form; Wave 4 links; Wave 5 privacy
