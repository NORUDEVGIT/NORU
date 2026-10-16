# NORU PMS — CASHIERING WORKSPACE IMPLEMENTATION PLAN

| Field | Value |
|---|---|
| **STATUS** | **PLAN ONLY** — not a Functional Spec, not authorised engineering, not implemented |
| **Basis** | Current local working tree + Cashiering Workspace Foundation Audit (2026-09-28, **PASS**) + **Locked Decisions §1A (2026-09-28)** |
| **Date** | 2026-09-28 |
| **Audit verdict** | **PARTIAL FOUNDATION — ACTIONABLE GAPS** |
| **Module COMPLETE** | **NO** |
| **Canonical route** | `/restaurant/pms/cashiering` |
| **Canonical ledger** | `guest_folios` + `folio_transactions`; balance = `sum(amount)` |
| **Default landing (planned)** | Cashiering Desk (today: Dashboard tab) |
| **Repository changes from this document** | This file only |

This document is the Cursor execution roadmap. It does not approve GitHub issues by itself. Do not implement from this file until a named engineering phase is explicitly commissioned.

The approved product proposal’s 14 presentation phases are **coverage**, not build order. Engineering is **Phase 0–14**. Binding architecture is **§1A Locked Decisions**.

**Master rule:** Never trade financial integrity for UI completeness. If a backend financial capability is missing, hold the screen rather than fake the transaction.

---

## 1. Purpose

Cashiering is the **financial workspace** for guest folios and, later, real company, group/master, and city-ledger accounts.

Cashiering is **not** a second Settings catalogue, reservation engine, group-contract engine, Front Office stay engine, POS order engine, Guest Services request engine, or general ledger.

**Cashiering consumes Settings configuration only where that configuration already affects runtime. It writes money only through the existing folio RPCs, extended in place. It does not create another ledger or a second balance engine.**

---

## 1A. Locked Decisions (2026-09-28)

These decisions are **binding**. Later engineering phases must not reopen them without an explicit plan revision.

### 1. Keep the current guest ledger — extend, do not replace

Current truth stays:

- `guest_folios`
- `folio_transactions`
- balance = `sum(amount)` via `folio_balance` / `close_guest_folio`
- canonical writers: `open_folio_for_reservation`, `post_folio_transaction`, `close_guest_folio`, `post_order_room_charge`, `reverse_order_room_charge`

Do **not** rebuild the guest folio engine. Do **not** add a parallel payments table that becomes the balance. Do **not** introduce a second sign convention.

### 2. Phase 0 is financial safety hardening

Before major UI work, harden the live money paths:

- idempotency on user-triggered posts (payment, deposit, refund, adjustment, discount, manual charge, checkout payment, check-in deposit)
- tender validation **before** insert
- ledger immutability contract, then database enforcement
- FO charge permission alignment with Cashiering
- checkout override classified as an unsettled financial exception

These are not cosmetic.

### 3. No stored balance

Do **not** add a mutable balance column to `guest_folios`. Balance stays derived. Close stays `abs(sum(amount)) < 0.01`.

### 4. Committed lines become effectively immutable

- committed amount, type, folio, category, and source identity are not edited
- corrections are new ledger rows
- reversal, refund, and adjustment preserve the original row
- the only fields that may change after insert must be listed in the legal-mutation contract (Phase 0). Default: **none**, including `payment_method` (set on insert)
- enforce with a database trigger before refunds, transfers, and settlement grow

`service_role` `GRANT ALL` is not an exception to this contract.

### 5. Tender validation before posting

`postFolioEntry` must not post and then reject an inactive method. The same order applies to checkout and check-in payment/deposit writers. A failed tender check leaves **zero** new ledger rows.

### 6. Idempotency is mandatory for user-triggered money

Every user-triggered money command carries a deterministic or client-supplied idempotency key **before** the module expands.

Required as soon as that command exists:

- payments, deposits, refunds, adjustments, discounts, manual charges
- checkout payments and check-in deposits
- transfers, when Phase 7 exists

Room-charge and restaurant-order uniqueness indexes stay. They are not a substitute for manual-post keys.

### 7. Do not fake Company / Group / Master folios

Company and group screens that sum participant `guest_folios` are **aggregates**. Do not label them Company Folio or Master Folio.

Real financial accounts are **Phase 8**. Not a UI redesign of the aggregate.

### 8. Hotel drawer is not restaurant cash

`cashier_shifts.expected_cash` is restaurant `order_payments` / `order_refunds`. Hotel folio lines have no shift id.

Do **not** build Phase 6 shift/drawer UX on that figure. Separate hotel drawer runtime from Restaurant Management reconciliation first.

### 9. Payments are recorded, not provider-integrated

Do not show authorized, captured, declined, pending provider, or gateway-refunded unless that runtime exists.

Honest states for now: recorded manual tender, method from the active catalogue, reference text. No PAN/CVV.

### 10. Deposits are a ledger credit until Phase 9

A deposit today is a negative `folio_transactions` row. Simple posting may stay in Phase 2.

Do not show allocated, unallocated, transferred, or deposit-refund lifecycle until Phase 9.

### 11. Source linkage before richer refund and adjustment UX

Before Phase 5 workflows, each correction row must be able to point at:

- original/source transaction
- the new reversal, refund, or adjustment row
- reason, actor, and approval where the gate is real

Phase 3 lands the relationship and history visibility. Phase 5 builds the workflow on it.

### 12. Front Office owns checkout status; Cashiering owns settlement truth

FO may complete stay checkout. Cashiering owns whether the folio is settled.

A supervisor override that leaves a non-zero folio may remain an operational exception. Cashiering must record it as **unsettled**, not as settled and not as a silent success. Full exception desk is Phase 12; the classification is Phase 0.

### 13. Settings is master, but setup-only config is not runtime

Consume Settings **as it actually posts today**. Do not invent tax, service charge, routing, deposit due amounts, approval inbox, invoice numbers, FX, or offline queue because the catalogue exists.

Hold list (do not fake):

- tax and service charge calculation
- charge-code engine (none exists; categories are a CHECK)
- routing execution
- deposit policy amounts
- approval requests / thresholds
- invoice/receipt issue
- FX conversion
- fiscal / e-invoicing
- offline financial posts
- city ledger as an AR account

### 14. Do not build these yet (do not fake)

Transfers tab as if transfers post. Provider payment states. Allocated deposits. Company/Master folio labels on aggregates. Hotel drawer variance from `expected_cash`. Approval inbox from `pms_approval_rules`. Invoice PDFs from `pms_invoice_settings.starting_number`. City ledger, GL, FX, and offline cashiering.

---

## 2. Locked Architecture

**Shared data does not mean shared ownership.** A `company_id` on a reservation does not create a company folio.

| Domain | Owns | Cashiering role |
|---|---|---|
| Settings / Property Setup | Payment methods, charge codes (when they exist), tax, service charge, deposit policy, routing rules, billing policy, invoice settings, cashier permissions, thresholds, refund/adjustment rules, settlement rules, drawer policy, notifications, offline policy | Consume only live runtime. Do not copy editors into Cashiering. |
| Cashiering | Folios, ledger lines, charges, recorded payments, deposit credits, refunds, adjustments, transfers, routing **execution**, settlement, receipts/invoices when real, hotel drawer, financial exceptions, financial history | Own. Extend `guest_folios` / `folio_transactions`. |
| Reservations | Reservation lifecycle, guarantee context, stay structure, reservation identity | Consume. Do not write stay status from Cashiering. |
| Groups & Blocks / Sales | Group/master commercial structure, contracts, rooming | Consume. Phase 8 accounts do not recreate contracts. |
| Front Office | Stay lifecycle, check-in/out coordination | Invokes folio RPCs. Does not own settlement truth. |
| Rate & Revenue | Pricing / rate rules | Cashiering records the posted result (`room_subtotal` today). |
| Guest Services | Service-request domain | A chargeable request may post through Cashiering. |
| POS / Restaurant | Outlet order lifecycle; RM cash-up | Approved room charges post via `post_order_room_charge`. RM `expected_cash` stays RM. |
| Guest Profile | Identity; company/group **views** | Aggregates are reads. Not accounts. |
| Accounting | GL / journals when integrated | Cashiering does not invent a private GL. City ledger is joint (Phase 13). |
| Security / Settings | Permission catalogue, approval policy | Live gate remains `restaurant_users.role` until a later security cutover. |

Protected engines (do not fork):

- `post_folio_transaction`, `open_folio_for_reservation`, `close_guest_folio`, `folio_balance`
- `post_order_room_charge`, `reverse_order_room_charge`
- `check_in_hotel_reservation`, `check_out_hotel_reservation`
- Settings Card 1/3/7/8 editors
- Restaurant `order_payments` / `close_cashier_shift` expected-cash math until Phase 6 explicitly splits it
- Night Audit `close_business_date` (read folios; do not become a poster)

Sign convention (locked): charge and refund **positive**; payment, deposit, and discount **negative**; adjustment keeps caller sign; balance = sum; positive means the guest owes more.

---

## 3. Current State

**Audit verdict (accepted):** PARTIAL FOUNDATION — ACTIONABLE GAPS.

### Route and workspace

- Canonical: `/restaurant/pms/cashiering` → `CashieringWorkspace` (search `tab`, `folio`).
- Legacy twin still mounted: `/restaurant/cashiering/` (no `folio` search). Shell Accounting nav still targets it.
- Folio operations only at `/restaurant/cashiering/folios/$folioId` (post, pay, deposit, refund, discount, adjustment, close, print).
- Transfers tab: Planned placeholder (`transfersSupported: false`).
- Night-audit index under cashiering redirects. Run URL is orphaned.

### What is already LIVE

- One guest folio per reservation; derived balance; zero-balance close.
- Manual post types on the folio page (manager for charge/refund/adjustment/discount; operator for payment/deposit).
- One-shot room charge from `room_subtotal`.
- POS room charge + compensating reversal.
- FO checkout payment and close via the same RPCs; supervisor override leaves the folio open.
- Check-in can post a deposit credit.
- Cashier shift open/close on shared `cashier_shifts` (expected cash is restaurant cash).
- `folio_history` for post/close/shift events.
- Property scope on every cashiering table. No PAN/CVV columns.

### What is setup-only or missing

Setup-only: taxes, service charge, deposit policies, billing rules, invoice settings, approval rules, FX, offline policy, city-ledger **tender class**.

Missing as runtime: windows, company/group/master accounts, city ledger/AR, transfers, charge routing, deposit allocation, refund workflow, source FKs, idempotency keys, immutability trigger, hotel drawer, invoices, GL, provider payments, approval inbox.

Unsafe today: tender check after insert in `postFolioEntry`; `payment_method` updated after commit; no idempotency on manual/checkout posts; FO operator can post charges that Cashiering UI reserves for managers; shift summary is property-wide by time.

---

## 4. Preserve / Do Not Replace

| Keep | Why |
|---|---|
| `guest_folios`, `guest_folio_counters`, `folio_transactions`, `folio_history` | Canonical hotel ledger |
| Derived `folio_balance` | Prevents balance drift |
| `post_folio_transaction` sign rules and refund cap | One convention |
| `guest_folios_one_per_reservation` | Until Phase 8 defines extra accounts explicitly |
| Room-charge and `restaurant_order` unique indexes | Existing idempotency |
| `close_guest_folio` zero-balance rule | Settlement truth for guest folios |
| FO `completeFoCheckOut` as stay-status writer | FO owns checkout |
| Guest company/group financial **queries** as aggregates | Do not relabel; do not fork |

Do not replace these with a new `payments`, `deposits`, or `folios` schema that posts balance independently.

`recordFolioEvent` in `cashiering.server.ts` is unused. History stays inside SQL writers unless a phase explicitly moves it without dropping events.

---

## 5. Canonical Ledger Contract

| Rule | Source |
|---|---|
| Account header | `guest_folios` (`open` / `closed`, currency at open, no balance column) |
| Lines | `folio_transactions` |
| Balance | `sum(amount)` |
| Post | `post_folio_transaction` (and room-charge RPCs for those sources) |
| Close | `close_guest_folio` |
| Corrections | New rows only, after Phase 3 linked to source |
| Idempotency | Partial unique indexes today; general key in Phase 0 |
| Mutation | Phase 0 contract; trigger before Phase 5 |

`payment_method` CHECK (`cash`, `card`, `bank_transfer`, `mobile_money`, `other`) is a stored tender code, not a provider status.

---

## 6. Technical Debt Before Expansion

Phase 0 owns the money bugs. Do not mix them into shell UX.

| Debt | Phase |
|---|---|
| Post-then-validate tender | 0 |
| In-place `payment_method` update | 0 |
| No immutability trigger | 0 |
| No idempotency on user posts | 0 |
| FO vs Cashiering charge role mismatch | 0 |
| Override looks like a clean checkout | 0 |
| Dual cashiering routes; folio URL only on legacy path | 1 |
| Transfers placeholder | Hide in Phase 1; build in Phase 7 |
| Tax copy implies calculation | Remove or qualify in Phase 2; real calc only in Phase 4 if Settings runtime exists |
| `getShiftSummary` time-window attribution | Do not feature in UI; fix with Phase 6 |
| Shared `cashier_shifts` / RM `expected_cash` | Phase 6 prerequisite |
| `pms_permissions` unused at write | Known debt. Do not switch in Phases 0–5 |
| Misaligned `folio_transactions` generated types | Fix when Phase 0 migration touches the table; do not regen casually |
| No source transaction link | Phase 3 |

---

## 7. Cross-Module Dependency Map

| Caller | May | Must not |
|---|---|---|
| Front Office checkout | `post_folio_transaction` payment, `close_guest_folio`, stay checkout RPC | Insert ledger rows; mark non-zero folio settled |
| Front Office check-in | Open folio, post deposit credit | Invent deposit allocation |
| Front Office fees / stay services | Post charges **under the same permission contract as Cashiering** after Phase 0 | Keep a quieter role gate |
| POS | `post_order_room_charge` / `reverse_order_room_charge` | Use hotel drawer expected cash |
| Night Audit | Read open folios, balances, shifts | Post charges or close folios as a side effect of date close |
| Guest Profile | Read aggregates | Create company/master accounts |
| Settings | Own catalogues | Be treated as posting engines |
| Accounting | Future journals | Be reimplemented inside Cashiering |

---

## 8. Settings / Property Setup Master Data Contract

| Area | Today | Cashiering rule |
|---|---|---|
| Payment methods | Live catalogue; UI reads it; RPC does not | Phase 0: reject inactive tender **before** post. Phase 4: posting requires an active method code on the line. |
| Charge codes | Missing | Do not invent codes in the folio dialog. Phase 4 only if Settings has a real catalogue. |
| Tax / service | Setup rows; poster ignores them | Phase 2 copy must not claim tax was calculated. Phase 4 calculates only if a defined Settings snapshot is applied inside the writer. |
| Deposit policy | Setup | Phase 2 posts an entered amount. Phase 4 may **display** policy. Do not auto-post policy amounts until that writer is specified. |
| Billing / routing rules | Setup hints, not routing | Phase 7. |
| Approval rules | Setup, no request table | Phase 5 uses real role/threshold gates that exist. No inbox. |
| Invoice settings | Prefix and starting number are not a counter | Phase 11. |
| FX | Setup rates | Phase 14 hold. |
| Offline | Policy flags, no queue | Phase 14 hold. |
| Cashier permissions catalogue | Not enforced | Keep `restaurant_users.role`. |

---

## 9. Cashiering Read/Write Model Strategy

### Read models

Reuse `listFolios`, `getFolio`, `getReservationFolio`, `listLedgerEntries`, `getCashieringDashboard`, FO `loadFolioState`, night-audit folio signals, guest company/group aggregates (labeled as aggregates).

Do not feature `getShiftSummary` as hotel cashier performance until Phase 6.

### Writers

UI and FO call server functions that call RPCs. Phase 0 tightens those functions and the RPCs. No browser `.from("folio_transactions").insert`.

### Orchestration

FO steppers stay the stay workflow. They call cashiering functions. Cashiering workspace posts guest-folio money. Neither duplicates the other.

### History

`folio_history` plus, from Phase 3, source links on the ledger row. No second audit log. No raw JSON debug panels.

---

## 10. Engineering Roadmap

Product presentation phases (coverage only):

1. Cashiering Entry
2. Folio Operations
3. Payments
4. Deposits & Prepayments
5. Refunds & Adjustments
6. Settlement & Checkout
7. Cashier Shift & Cash Drawer
8. Receipts & Invoices
9. Financial Exceptions
10. Approvals & Authorization
11. Financial Reports
12. History & Audit
13. Offline & Synchronization
14. Cashiering Administration

Engineering order (this plan):

| Phase | Name | Product coverage | Commission now? |
|---|---|---|---|
| 0 | Financial safety & ledger hardening | Enables all later money UI | **Yes — first** |
| 1 | Workspace shell | Product 1 | After 0 |
| 2 | Guest folio operations | Product 2, 3 (recorded), 4 (simple deposit), 6 (zero-balance guest close) | After 1 |
| 3 | History & source linkage | Product 12 foundation | After 2 |
| 4 | Settings-backed posting | Methods, codes, tax only where runtime is real | After 3; hold pieces that are still setup-only |
| 5 | Refunds, adjustments & authorization | Product 5, 10 | After 3; approvals only if a real gate exists |
| 6 | Hotel cashier shift / drawer | Product 7 | After hotel cash is split from RM `expected_cash` |
| 7 | Routing & transfers | Folio routing/transfer | After a real payer/window target exists |
| 8 | Company / group / master accounts | Real accounts | After 0–3; not an aggregate relabel |
| 9 | Deposit lifecycle | Allocation, transfer, refund, unallocated | After 8 if those accounts are destinations; else guest-folio allocation only when the model exists |
| 10 | Extended settlement | Company/group, exceptions, linked close | After 8 |
| 11 | Receipts & invoices | Product 8 | When numbering and tax identity are real |
| 12 | Exceptions & reports | Product 9, 11 | After the ledger events exist |
| 13 | City ledger / AR | Joint with Accounting | Not Cashiering-only |
| 14 | FX / fiscal / offline / administration | Product 13–14 | **Hold** |

---

## Phase 0 — Financial Safety & Ledger Hardening

### Functional Scope

Make the current guest ledger safe to extend. No new workspace. No company accounts. No drawer UX. No provider payments.

### Product Coverage

None of the 14 product UIs as new screens. Protects every later phase.

### Existing Capability Reused

`post_folio_transaction`, `close_guest_folio`, `open_folio_for_reservation`, `postFolioEntry`, `postCheckOutPayment`, `postCheckInDeposit`, `postCancelOrNoShowFee`, `addStayService`, active payment-method loader.

### Backend Work

- **Tender before insert** in `postFolioEntry`: if type is payment, deposit, or refund, validate the active catalogue first; do not call the RPC on failure. Apply the same order to checkout payment and check-in deposit.
- **Set `payment_method` on insert.** Stop the follow-up `.update`. Extend the RPC (or a single wrapper used by every caller) so the column is written once. Legal-mutation list: no post-insert financial updates. If a non-financial column must remain mutable, name it in tests; `amount`, `transaction_type`, `folio_id`, `category`, `reference_type`, `reference_id` are immutable.
- **Idempotency:** accept a key on user-triggered posts; unique `(restaurant_id, idempotency_key)` where key is not null; replay returns the original row and does not insert again. Cover payment, deposit, refund, adjustment, discount, manual charge, checkout payment, check-in deposit.
- **Immutability trigger** (or equivalent constraint) blocking UPDATE of immutable columns and DELETE of `folio_transactions` for all roles the migration can bind, including paths service role uses from the app. Document the operational break-glass if a trigger cannot see service role; the app must still have no update/delete of those columns.
- **Permission consistency:** charge, refund, adjustment, and discount from FO use the same role rule as `postFolioEntry` (manager), or the plan revision explicitly lowers Cashiering to match FO. Do not leave two gates. Room charge at folio open and POS room charge stay on their existing idempotent RPCs; do not silently re-gate POS through the manual-charge rule without a stated decision in the phase prompt.
- **Override classification:** `overrideCheckOutSettlement` remains allowed for supervisor + reason, but the folio stays open and a durable cashiering-visible marker says **unsettled exception** (reservation history alone is not enough if Cashiering cannot see it). `completeFoCheckOut` must not report the folio as settled. Do not auto-write-off.
- Do **not** add `guest_folios.balance`.

### Frontend Work

None required, except copy that would still say a failed tender post “did not record” must be true. No new tabs.

### Database / Migration Work

Additive columns/indexes/trigger on `folio_transactions` (idempotency key, payment method at insert). Dual-lane `drizzle/migrations` and `supabase/migrations`. No new ledger table. No balance column. No city-ledger table.

### Settings Dependencies

Read active `pms_payment_methods` before post. Do not apply tax, deposit policy, or approval rules in this phase.

### Cross-Module Dependencies

FO checkout, check-in deposit, cancel/no-show fee, stay-service charge. POS room-charge RPCs stay idempotent and append-only (already).

### Ownership Risks

Do not move checkout status into Cashiering. Do not “fix” override by force-closing a non-zero folio. Do not change RM `close_cashier_shift` expected-cash math here.

### Tests Required

- Inactive tender: no row inserted.
- Replay same idempotency key: one row.
- UPDATE amount/type fails.
- DELETE ledger row fails (or is impossible for app roles and covered by trigger tests).
- Refund still cannot exceed net settled.
- Close still requires ~0 balance.
- FO charge path matches the locked role rule.
- Override leaves folio open and is visible as unsettled.
- No balance column in schema.

### Browser Verification

Not a UI phase. If any existing folio dialog is touched, smoke one successful payment and one rejected tender on `/restaurant/cashiering/folios/$folioId` and confirm the rejected attempt does not change the balance.

### PASS Criteria

- User-triggered money posts are idempotent.
- Tender failure cannot leave a ledger row.
- Immutable columns cannot be updated; corrections are still new rows.
- FO and Cashiering charge gates match the locked rule.
- Non-zero checkout override is an unsettled exception, not settled.
- Balance remains `sum(amount)`.

### Explicitly Deferred

Workspace shell, source-link UX, tax calculation, transfers, hotel drawer split, company accounts, approval inbox.

**Cursor prompt:** **SINGLE PROMPT** — ledger safety only. No UX expansion.

---

## Phase 1 — Cashiering Workspace Shell

### Functional Scope

One canonical cashiering home. Navigation that does not advertise unsupported money.

### Product Coverage

Product phase 1 (Entry). Not folio posting features.

### Existing Capability Reused

`CashieringWorkspace`, `getCashieringAccess`, dashboard and list readers, `pms-modules.ts` canonical route.

### Backend Work

None beyond reads already used. Do not add writers.

### Frontend Work

- `/restaurant/pms/cashiering` is the only workspace URL staff are sent to.
- Legacy `/restaurant/cashiering/` redirects (preserve query where safe).
- Shell Accounting links, Property Home, and in-app folio CTAs use the canonical path.
- Folio detail route moves under the PMS path (or Phase 2 if the move is easier with folio actions). Phase 1 must not leave “Open” on a second live app.
- Desk landing: property, open folios, outstanding (derived), today’s totals, entry to folios. No fake KPIs.
- Tabs that are not backed by runtime are omitted, not “Planned” posters. Transfers tab comes off until Phase 7. Shift tab stays only as the **current** open/close control, with copy that it is not a hotel drawer reconciliation.
- URL `tab` round-trips.

### Database / Migration Work

None.

### Settings Dependencies

None.

### Cross-Module Dependencies

Update FO, guest, night-audit, and reports links that still target the legacy path. Do not change their writers.

### Ownership Risks

Do not relabel the dashboard as company or city ledger. Do not merge RM Payments into this shell.

### Tests Required

Route registry: one canonical module route; legacy redirects. Links in shell/FO helpers point at canonical paths.

### Browser Verification

Authenticated: canonical desk loads; legacy URL redirects; tab query survives refresh; no CatchBoundary. No posting required.

### PASS Criteria

- Staff navigation lands on `/restaurant/pms/cashiering`.
- No second live workspace.
- No placeholder module claims transfers, invoices, or provider status.

### Explicitly Deferred

Folio action redesign (Phase 2), history panel (Phase 3), drawer reconciliation (Phase 6).

**Cursor prompt:** **SINGLE PROMPT** — routes and shell.

---

## Phase 2 — Guest Folio Operations

### Functional Scope

Guest folio desk and quick view for charges, recorded payments, simple deposit credits, and zero-balance close. Canonical folio route.

### Product Coverage

Product 2, recorded payments (3), simple deposits (4), guest zero-balance settlement (6). Not routing, not company settlement, not deposit allocation.

### Existing Capability Reused

`getFolio`, `postFolioEntry`, `closeFolio`, `initializeFolio`, Phase 0 RPC contract. FO checkout remains the stay path and still calls the same posters.

### Backend Work

- Folio route under `/restaurant/pms/cashiering/folios/$folioId`.
- All posts send idempotency keys (Phase 0).
- Payment/deposit/refund require an active method code stored on insert.
- Do not calculate tax. Dialog copy must not say the property tax was applied.
- Deposit is labeled a folio credit, not an allocated deposit.
- Close uses `close_guest_folio` only. Non-zero stays open.
- Partial payments remain multiple payment rows. No provider states.

### Frontend Work

- Folio desk: list, balance (derived), status, guest, reservation, currency.
- Quick view: balance, last lines, open folio, not a second poster.
- Actions: post charge, receive payment, add deposit credit, refund line, discount, adjustment, close if zero. Each action states it records a ledger line.
- Empty and closed folio states. Closed folio cannot post.
- Print may remain `window.print` and must be labeled a statement print, not an invoice.

### Database / Migration Work

None unless Phase 0 columns need a folio-number search index already covered. No windows table.

### Settings Dependencies

Active payment methods only. Charge description stays free text until Phase 4 has charge codes.

### Cross-Module Dependencies

FO “Open folio” and refund CTA land on the canonical folio route. Checkout stepper unchanged except links and Phase 0 gates.

### Ownership Risks

Do not post stay-status changes. Do not create a cash folio. Do not show company payer as a destination.

### Tests Required

Post and replay; close at zero; close rejected when non-zero; closed folio rejects posts; deposit is a negative line; UI strings do not say allocated, captured, or tax calculated.

### Browser Verification

Open a folio, post a charge, post a partial payment, attempt close (blocked), pay remainder, close. Refresh shows the same derived balance. Rejected tender does not change balance. Desktop and a narrow viewport for the post dialog.

### PASS Criteria

- Guest folio money still flows through canonical RPCs.
- Idempotent user posts.
- Close only at ~0.
- No fake deposit lifecycle, provider state, or tax line.

### Explicitly Deferred

Source-link UI (Phase 3), tax lines (Phase 4), approval workflow (Phase 5), transfers.

**Cursor prompt:** **SINGLE PROMPT** — folio desk on hardened writers. Split only if the route move was left in Phase 1 and conflicts.

---

## Phase 3 — Financial History & Source Linkage

### Functional Scope

Link correction rows to the original line. Show actor, reason, and source in history. No debug metadata.

### Product Coverage

Product 12 foundation. Not the full report pack.

### Existing Capability Reused

`folio_history`, `posted_by_membership_id`, POS `restaurant_order_reversal` pattern.

### Backend Work

- Additive source pointer on `folio_transactions` (original transaction id, same property and folio unless a later phase allows cross-folio).
- Refund, adjustment, discount, and POS reversal writers set it when an original exists.
- Manual charge and payment may have a null source.
- History read model: type, signed amount, method, description, actor, time, source folio line. Hide internal RPC names and raw jsonb.

### Frontend Work

Folio history list on the folio page. Refund/adjustment forms can pick a source line when posting those types (full workflow polish can wait for Phase 5, but the link must be stored if the user is correcting a line).

### Database / Migration Work

Nullable self-FK or equivalent `(original_transaction_id)` scoped to the property. No update of the original row. Dual-lane migration.

### Settings Dependencies

None.

### Cross-Module Dependencies

POS reversal should set the same pointer. Do not rewrite the order.

### Ownership Risks

Do not store a second copy of the original amount as an editable balance.

### Tests Required

Adjustment does not change the original amount. History shows both rows. Replay does not duplicate.

### Browser Verification

Post a charge, post a linked adjustment, confirm both lines and that the charge amount is unchanged.

### PASS Criteria

- Original lines remain intact.
- Corrections identify their source when one was chosen.
- History is staff-readable.

### Explicitly Deferred

Approval capture (Phase 5), transfer links (Phase 7), invoice reprint log (Phase 11).

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 4 — Settings-backed Posting

### Functional Scope

Posts consume Settings that are actually executable. Anything still setup-only stays held.

### Product Coverage

Honest slice of payments, charges, and deposit policy display.

### Existing Capability Reused

`pms_payment_methods`, SET1/Card 3 tax rows, `pms_deposit_policies`. Phase 0 tender check.

### Backend Work

- Payment method code on the line is mandatory for payment, deposit, and refund, and must be active at post time.
- **Tax / service charge:** implement inside the posting writer only if the phase prompt cites the exact Settings snapshot (which table, inclusive flag, rounding). If that contract is still ambiguous, **hold** and keep free-text charges with no tax line.
- **Charge codes:** add posting by code only after a Settings charge-code table exists and is the master. Do not create the catalogue inside Cashiering.
- **Deposit policy:** may display the policy result. Auto-posting the policy amount requires an explicit writer spec in the commission prompt; otherwise the cashier still enters the amount (Phase 2).

### Frontend Work

Method select from active methods only. No “city ledger” method that pretends to transfer to AR. Tax lines appear only when the writer created them.

### Database / Migration Work

Only if the writer must snapshot tax rate/name on the line for history. Snapshot is immutable. No Cashiering-owned tax table.

### Settings Dependencies

This phase is the consumer. Settings remains the editor.

### Cross-Module Dependencies

FO checkout method list should use the same active catalogue, not a hardcoded `cash|card|transfer|other`, once this phase is commissioned.

### Ownership Risks

Do not fork `pms_taxes` into folio settings. Do not let a billing-rule row route a charge.

### Tests Required

Inactive method rejected with no row. If tax is in scope: one fixture proves the snapshot on the line and that later Settings edits do not rewrite the line. If tax is held: tests prove the writer still posts the entered amount only.

### Browser Verification

Only if UI changes: post with an active method; inactive method absent from the list.

### PASS Criteria

- No posting behavior that Settings does not actually support.
- Held items named in the phase result, not implied by the screen.

### Explicitly Deferred

Routing, FX conversion, fiscal invoice.

**Cursor prompt:** **SINGLE**, and the prompt must say whether tax calculation is in or held. Default **held** if the Settings contract is not quoted.

---

## Phase 5 — Refunds, Adjustments & Authorization

### Functional Scope

Linked corrections with reason, actor, and a real authorization gate. No approval inbox fabricated from rules.

### Product Coverage

Product 5 and the part of product 10 that is direct authorization.

### Existing Capability Reused

Phase 3 source link. Refund cap in `post_folio_transaction`. Manager role gate. `pms_approval_rules` as **display/config only** unless a request table is commissioned (it is not).

### Backend Work

- Refund and adjustment require source link, reason, and actor.
- Partial refund still cannot exceed remaining refundable amount on that source (tighter than folio-wide settled cap once source exists; specify the formula in the prompt: source payment minus prior refunds linked to it, and still within folio settled cap).
- Authorization: owner/manager role **or** a threshold already enforced in code. Do not insert `pms_approval_requests` in this phase.
- Discount follows the same link-and-reason rule when it corrects a charge.
- No in-place amount edit.

### Frontend Work

Refund and adjustment flows show original line, remaining refundable, reason, and who is allowed to post. Do not show a queue, “pending approval”, or “approved by workflow” unless a row exists.

### Database / Migration Work

Only columns Phase 3 did not already add (reason if description is not enough). Prefer description + history notes if that is already durable.

### Settings Dependencies

Read thresholds for display. Do not enforce a threshold the database/rule loader does not already expose as a number the writer can check. If it cannot, role gate only, and say so in the UI.

### Cross-Module Dependencies

FO refund CTA still opens Cashiering. FO does not post refunds.

### Ownership Risks

Do not turn Security’s rule catalogue into a Cashiering workflow engine.

### Tests Required

Over-refund rejected. Original unchanged. Non-manager rejected if that is the gate. No approval-request table created.

### Browser Verification

Manager posts a partial refund against a payment; second refund beyond the remainder fails; ledger shows three rows (charge or payment, refund, and the remainder math is visible).

### PASS Criteria

- Corrections are linked new rows.
- Gate is a real role or a real numeric check.
- No fake inbox.

### Explicitly Deferred

Queued approvals, provider refunds, write-off (Phase 10).

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 6 — Hotel Cashier Shift / Drawer

### Functional Scope

Hotel cash movements attributable to a cashier, separate from restaurant expected cash.

### Product Coverage

Product 7.

### Existing Capability Reused

Open/close shift **only after** the data model no longer treats RM `expected_cash` as hotel variance. `open_cashier_shift` may remain if the row is clearly hotel-scoped.

### Backend Work

Prerequisite gate (must pass before UX):

- Hotel drawer expected cash is the sum of **hotel** cash tenders posted under that shift (folio lines need a shift or drawer id set at post).
- `close_cashier_shift` restaurant formula is not the hotel variance.
- One open restaurant shift must not block or be blocked by the hotel drawer unless the commission prompt explicitly keeps a shared lock and documents it. Default: **separate**.

Then: opening cash, cash in, cash out, closing count, variance, close. Each movement is an auditable row, not an edited total.

### Frontend Work

Shift screen uses hotel figures only. Copy must not say restaurant sales are included unless they actually are.

### Database / Migration Work

New hotel drawer movements or a hotel-specific shift table. Do not overload `expected_cash`. Dual-lane. Design review before migration: do not merge `pos_cashier_shifts`.

### Settings Dependencies

None required to start. Operating-hours policy stays held if it is only a flag.

### Cross-Module Dependencies

RM cash-up tests must still pass unchanged. Night audit shift blockers must be retargeted at the hotel shift if the old shared row is no longer the hotel signal.

### Ownership Risks

Do not “fix” hotel variance by subtracting restaurant cash inside Cashiering.

### Tests Required

Restaurant close expected cash unchanged by a hotel cash payment. Hotel variance includes that payment. Idempotent drawer movement keys.

### Browser Verification

Open hotel shift, post a cash folio payment, close with a count, variance matches hotel cash only.

### PASS Criteria

- Hotel and restaurant cash reconciliation are separate.
- Drawer lines are append-only.
- Phase 2 folio posts can attribute cash to the open hotel shift.

### Explicitly Deferred

Blind counts policy, multi-currency drawer, handover workflow beyond close.

**Cursor prompt:** **SPLIT** — 6A schema split and tests; 6B UX after 6A PASS. Do not build 6B on current `expected_cash`.

---

## Phase 7 — Routing & Transfers

### Functional Scope

Move or route a charge between real targets (guest windows or accounts that already exist).

### Product Coverage

Transfer and routing slices of folio operations. Not company-account creation (Phase 8).

### Existing Capability Reused

Ledger append model. Phase 3 links.

### Backend Work

**Blocked** until a payer/window target exists as data, not as a label. Guest folio windows may be introduced here only as real child targets of `guest_folios` with their own lines or a window id on the line, balance still derived, no stored balance.

Transfer = paired ledger entries (debit one target, credit the other) with a shared transfer id, idempotency key, actor, reason. Partial transfer allowed only if the source line’s remaining amount is defined. Reversal is another pair, not a delete.

Routing runs only from an executable rule version. `pms_billing_rules` today is **not** that. If rules are still hints, **hold routing** and ship transfers only between existing guest targets.

### Frontend Work

No Transfers tab until a transfer writer PASS. No “company pays room” preview that does not post.

### Database / Migration Work

Window id and/or transfer pair columns. Dual-lane. No second balance.

### Settings Dependencies

Routing rules consumed only when executable. Otherwise hold.

### Cross-Module Dependencies

Do not rewrite group rooming lists to store routes.

### Ownership Risks

Do not create a company folio “temporarily” to receive a transfer. That is Phase 8.

### Tests Required

Transfer pair sums to zero across targets. Replay once. Original charge remains. Reversal restores derived balances.

### Browser Verification

Transfer part of a charge between two windows of one guest folio, if windows shipped; otherwise this phase does not ship UI.

### PASS Criteria

- Every transfer is traceable and reversible by new rows.
- Routing held if rules are not executable.

### Explicitly Deferred

Group master routing until Phase 8 accounts exist.

**Cursor prompt:** **SPLIT** only if windows and transfers are both in scope. Default: do not start until the target model is named in the prompt.

---

## Phase 8 — Company / Group / Master Accounts

### Functional Scope

Real financial accounts for company and group/master, linked to participant guest folios. Not a rename of Guest Profile aggregates.

### Product Coverage

Company and group billing **accounts**. Commercial structure stays in Groups/Sales and Guest Profile.

### Existing Capability Reused

`guest_folios` pattern (extend with account kind) **or** a new account header that still posts into `folio_transactions` / the same line shape. One balance function. Participant folios stay.

### Backend Work

- Account kind is an explicit column/table, not inferred from `company_id`.
- Master links to participant folios by id.
- Payments, charges, and Phase 7 transfers can target the account only after Phase 7’s pair model exists; otherwise this phase ships accounts and direct posts only.
- Aggregates in Guest Profile stay labeled as stay totals and link to the account when one exists. They are not the account.

### Frontend Work

Company folio and master folio screens only when the account row exists. Empty state: “No financial account”, not a fake balance built from stays.

### Database / Migration Work

Account header + link table. Dual-lane. Design must forbid a stored balance. Re-audit before migration.

### Settings Dependencies

Billing profile may **inform** defaults. It does not create the account by itself.

### Cross-Module Dependencies

Guest Profile and Groups read links. They do not insert ledger lines.

### Ownership Risks

Do not copy contracts, rooming lists, or company master data into Cashiering.

### Tests Required

Aggregate query unchanged in meaning. New account balance equals its own lines. Participant folio balance unchanged by account creation.

### Browser Verification

Create/open a company account (if the phase includes create), post a payment, see it only on that account. Group screen does not call the aggregate a master folio when no master exists.

### PASS Criteria

- Accounts are rows with a derived balance.
- No fake folio label on an aggregate.

### Explicitly Deferred

City ledger (Phase 13), AR aging, contract editing.

**Cursor prompt:** **SPLIT** — 8A schema; 8B UI. Re-audit before 8A.

---

## Phase 9 — Deposit Lifecycle

### Functional Scope

Allocation, transfer, refund, and unallocated remainder for deposits. Replaces the “deposit is just a credit” simplification **only where the lifecycle is real**.

### Product Coverage

Product 4 beyond simple posting.

### Existing Capability Reused

Deposit lines from Phase 2. Source links from Phase 3. Transfer pairs from Phase 7 if cross-account.

### Backend Work

Unallocated amount is **derived** (deposit credits minus allocations minus deposit refunds), not a mutable column. Allocation is a ledger pair or a dedicated allocation row that cannot exceed unallocated. Double allocation fails. Guest-folio-only allocation can ship before company destinations; company/group deposit destinations wait for Phase 8.

### Frontend Work

Show unallocated vs allocated only when those rows exist. Do not badge Phase 2 credits as allocated.

### Database / Migration Work

Allocation records referencing deposit lines. Dual-lane. No stored unallocated balance that can drift.

### Settings Dependencies

Deposit policy may suggest an amount. It does not allocate.

### Cross-Module Dependencies

Reservation guarantee context stays on the reservation. Cashiering stores the money movement.

### Ownership Risks

Do not delete the original deposit line when allocating.

### Tests Required

Allocate twice: second fails. Refund of unallocated reduces remainder. Original deposit row unchanged.

### Browser Verification

Post deposit, allocate part, refund remainder, balances match the derived figures.

### PASS Criteria

- Unallocated is derived.
- Allocation is auditable and cannot double-spend.

### Explicitly Deferred

Interest, forfeiture rules, unless Settings already posts them (it does not).

**Cursor prompt:** **SINGLE** after Phase 3. Cross-account allocation waits for Phase 7–8.

---

## Phase 10 — Extended Settlement

### Functional Scope

Settlement beyond guest zero-balance close: company/group accounts, exceptional settlement, linked participant close.

### Product Coverage

Product 6 beyond the guest folio.

### Existing Capability Reused

`close_guest_folio`. Phase 0 unsettled-override marker. Phase 8 accounts.

### Backend Work

- Guest close remains zero-balance.
- Company/master close uses the same derived-zero rule unless an exceptional settlement writer posts an explicit write-off or transfer line (new row, reason, actor, authorization).
- Override/write-off is never a status flip alone.
- Participant folios do not close because the master closed unless their own balance is zero or an explicit transfer settled them.

### Frontend Work

Settlement review shows derived balance, required actions, and exception state. Do not show “settled” when the marker says unsettled.

### Database / Migration Work

Write-off or exceptional line type only if it cannot be represented as adjustment. Prefer adjustment + authorization over a new status enum that skips the ledger.

### Settings Dependencies

Settlement rules consumed only when they change the writer. Otherwise zero-balance remains the rule.

### Cross-Module Dependencies

FO checkout still cannot mark a non-zero guest folio settled. Company settlement is not an FO action.

### Ownership Risks

Do not let Night Audit close folios. Do not write off by updating amount.

### Tests Required

Non-zero close fails. Write-off posts a line and then close succeeds. Master close does not close a non-zero participant.

### Browser Verification

Guest checkout override still shows unsettled in Cashiering. Company close blocked until zero or write-off line exists.

### PASS Criteria

- Settled means derived balance ~0 or an explicit posted exception line plus close.
- FO override remains visible and unsettled until corrected.

### Explicitly Deferred

AR settlement (Phase 13).

**Cursor prompt:** **SPLIT** if company accounts and write-off are both large; guest exception display can be earlier only as a read of the Phase 0 marker (that read may ship in Phase 2/12 without calling it extended settlement).

---

## Phase 11 — Receipts & Invoices

### Functional Scope

Issue, reprint, and resend only when document identity is real.

### Product Coverage

Product 8.

### Existing Capability Reused

Statement `window.print` stays a print, not an invoice. `pms_invoice_settings` is input to a **new** issued-document counter, not the counter itself.

### Backend Work

Blocked until: issuer identity, tax totals that match posted lines, and a monotonic issued number that is not `starting_number` reused as the next live number. Duplicate issue of the same document id fails. Reprint does not create a new number. Email send does not imply a new issue.

No fiscal device in this phase.

### Frontend Work

Issue / reprint / resend actions only after the writer PASS. Otherwise keep “Print statement”.

### Database / Migration Work

Invoice/receipt header + number counter. Dual-lane. Re-audit first. Do not seed fake invoices.

### Settings Dependencies

Prefix and format from invoice settings. Branding and currency from property setup. Tax display follows posted snapshots, not a later settings edit.

### Cross-Module Dependencies

Checkout email must attach or reference an issued document only after issue exists. Until then it stays a non-invoice message.

### Ownership Risks

Do not generate numbers in the client.

### Tests Required

Two issues get two numbers. Reprint keeps the number. Totals equal the ledger snapshot.

### Browser Verification

Issue one invoice, reprint, confirm one number. Statement print still available and labeled as such.

### PASS Criteria

- No document number from the setup starting figure alone.
- Issued documents are immutable snapshots.

### Explicitly Deferred

Fiscal/e-invoice (Phase 14), city-ledger invoice transfer (Phase 13).

**Cursor prompt:** **DO NOT START** until tax identity and numbering are specified. **SPLIT** schema then UI.

---

## Phase 12 — Exceptions & Reports

### Functional Scope

Exceptions derived from owner state. Reports read the ledger. No fake resolved flags.

### Product Coverage

Product 9 and 11.

### Existing Capability Reused

Night-audit and FO folio signals, Phase 0 unsettled override, Phase 6 variance, close failures.

### Backend Work

Prefer queries: non-zero folio after override, refund failure, duplicate blocked by idempotency (not an open exception), drawer variance on close. Persist a row only when the exception has a lifecycle the ledger does not already express. Resolver is the financial action (post, transfer, close), not a boolean.

Reports: cashier, payments, deposits, refunds, adjustments, settlement, tax **only if tax lines exist**, drawer **only after Phase 6**. Each report names its source query.

### Frontend Work

Exception list with owner and the action that clears it. No “Mark resolved” that leaves the folio non-zero.

### Database / Migration Work

None by default.

### Settings Dependencies

None.

### Cross-Module Dependencies

Night audit may link to the exception. It does not own a second resolved flag.

### Ownership Risks

Do not build a report warehouse or a GL trial balance.

### Tests Required

Override exception clears only when balance is ~0 and folio policy says settled. Report totals equal `sum(amount)` fixtures.

### Browser Verification

Exception appears after override and disappears only after a real settling post and close.

### PASS Criteria

- Exceptions match ledger/override/drawer state.
- Reports are sums of canonical lines.

### Explicitly Deferred

AR aging (Phase 13).

**Cursor prompt:** **SINGLE** after the signals it lists actually exist. Do not stub missing domains.

---

## Phase 13 — City Ledger / AR

### Functional Scope

Transfer a settled document or balance to a receivable **with Accounting**.

### Product Coverage

City ledger. Not a tender nickname.

### Existing Capability Reused

`type_class = city_ledger` is not the account. Phase 8 account pattern may be reused if Accounting agrees it is the receivable. Otherwise hold.

### Backend Work

Joint design: AR account, invoice posting, terms, aging, transfer, collection. Cashiering posts the folio side (transfer out). Accounting owns the receivable ledger. No second GL inside Cashiering.

### Frontend Work

None until the joint model is written into a plan revision.

### Database / Migration Work

Do not migrate from this document alone.

### Settings Dependencies

Settlement terms from Settings only when Accounting will age them.

### Cross-Module Dependencies

Accounting workspace. Guest company profile is not the AR balance.

### Ownership Risks

A payment method named city ledger must not reduce a guest folio without an AR debit owned by Accounting.

### Tests Required

Defined in the joint revision, not here.

### Browser Verification

None until that revision.

### PASS Criteria

- Hold until Accounting and Cashiering both have a named writer.
- No city-ledger UI in earlier phases.

### Explicitly Deferred

Everything in this phase until a joint plan revision.

**Cursor prompt:** **DO NOT IMPLEMENT** from this file.

---

## Phase 14 — FX / Fiscal / Offline / Administration

### Functional Scope

None until each owner has a runtime.

### Product Coverage

Product 13 and 14, plus FX and fiscal.

### Existing Capability Reused

Catalogues stay in Settings. Cashiering ignores them for posting.

### Backend Work

Do not add FX snapshots, fiscal payloads, or an offline money queue in Cashiering phases 0–12.

### Frontend Work

Do not show multi-currency entry, fiscal status, offline sync, or an admin catalogue inside Cashiering.

### Database / Migration Work

None.

### Settings Dependencies

`pms_exchange_rates`, invoice fiscal fields if any, `pms_offline_policies`, Card 7 catalogues. Read-only and non-posting.

### Cross-Module Dependencies

Offline platform, fiscal provider, and Security permission cutover are outside this module.

### Ownership Risks

A Cashiering-only offline queue would fork the ledger. Forbidden.

### Tests Required

A guard test may assert posters do not read FX or offline tables. Optional, not a feature.

### Browser Verification

None.

### PASS Criteria

- Phase stays held.
- Earlier screens do not imply these capabilities.

### Explicitly Deferred

The whole phase.

**Cursor prompt:** **DO NOT IMPLEMENT**.

---

## 11. Product Phase Map

| Product phase | Engineering home | Until then |
|---|---|---|
| 1 Entry | Phase 1 | Current dashboard is the live desk |
| 2 Folio operations | Phase 2 | Legacy folio page |
| 3 Payments | Phase 2 recorded; Phase 4 methods | No provider states |
| 4 Deposits | Phase 2 credit; Phase 9 lifecycle | Do not say allocated |
| 5 Refunds & adjustments | Phase 5 after Phase 3 | Manager post of an unlinked line may remain only until Phase 5 |
| 6 Settlement | Phase 2 guest close; Phase 10 extended | Override is unsettled after Phase 0 |
| 7 Shift & drawer | Phase 6 | Do not treat RM expected cash as hotel |
| 8 Receipts & invoices | Phase 11 | Print statement only |
| 9 Exceptions | Phase 12; override marker in Phase 0 | No fake resolved |
| 10 Approvals | Phase 5 direct gate | No inbox |
| 11 Reports | Phase 12 | Dashboard totals only |
| 12 History | Phase 3 | `folio_history` |
| 13 Offline | Phase 14 hold | — |
| 14 Administration | Phase 14 hold | Settings owns catalogues |

---

## 12. Financial Safety Rules (all phases)

- Append corrections; do not delete or rewrite committed amount, type, or source.
- No stored folio balance.
- Idempotency key on every user-triggered post that exists in that phase.
- Unique business keys kept for room charge and restaurant order.
- Property scope on every new row.
- Debit/credit sign stays the locked convention.
- Refunds cannot exceed the refundable remainder.
- Transfer pairs net to zero.
- Settlement is derived zero or an explicit posted exception line.
- FO cannot mark a non-zero folio settled.
- No PAN/CVV.
- No provider status without a provider.
- Service-role writers go through the same RPC contract as the UI.

---

## 13. Ownership Conflicts to Avoid

- Settings catalogues edited or duplicated under Cashiering.
- Guest Profile aggregates titled as company or master folios.
- FO fee posts using a weaker gate than Cashiering after Phase 0.
- POS/RM `expected_cash` presented as hotel drawer variance.
- Night Audit posting room charges or closing folios.
- Accounting journals invented in Cashiering.
- A second ledger for payments or deposits.

---

## 14. Canonical Writers to Preserve

- `open_folio_for_reservation`
- `post_folio_transaction`
- `close_guest_folio`
- `folio_balance`
- `post_order_room_charge` / `reverse_order_room_charge`
- `check_in_hotel_reservation` / `check_out_hotel_reservation`
- App invokers: `initializeFolio`, `postFolioEntry`, `closeFolio`, `postCheckOutPayment`, `closeFolioAtCheckout`, `completeFoCheckOut`, `postCheckInDeposit`, `postCancelOrNoShowFee`, `addStayService`, `postOrderRoomCharge`, `reverseOrderRoomCharge`

Phase 6 may stop using RM `close_cashier_shift` for hotel variance. Do not change that function’s restaurant math as a side effect.

---

## 15. Read Models to Reuse

- `listFolios`, `getFolio`, `getReservationFolio`, `listLedgerEntries`, `getCashieringDashboard`
- FO `loadFolioState` and departure/arrival folio signals
- Night-audit folio reads
- Guest company/group financial aggregates (as aggregates)
- `folio_balance`

`getShiftSummary` is not a hotel read model until Phase 6 replaces it.

---

## 16. Settings-Dependent Hold Points

Do not fake: tax calculation, service charge, charge codes, routing execution, deposit-policy auto-post, approval inbox, invoice numbers, FX, fiscal documents, offline posts, city-ledger AR, provider capture.

Phase 4 and later prompts must quote the Settings object they consume or mark the feature held.

---

## 17. Test Strategy

- Contract tests: no `guest_folios` balance column; immutable amount/type; idempotency replay; tender failure inserts nothing; refund cap; close at non-zero fails; FO override does not set folio closed.
- Sign convention tests on `post_folio_transaction`.
- Dual-lane SQL for every migration.
- Do not run `npm run build` or the full suite from this plan document.
- UI phases: authenticated browser smoke on the canonical route, plus one money action when the phase posts.

---

## 18. Browser Verification Contract

A UI phase is not PASS until authenticated smoke:

- No CatchBoundary
- No console runtime errors
- Canonical route only (after Phase 1)
- Tab query round-trips
- Posted money matches a refresh of derived balance
- Failed tender does not change balance (after Phase 0)
- Closed folio rejects posts
- Non-zero folio is not labeled settled
- Company/group screens do not say Folio unless an account row exists (after those screens are touched)
- Restaurant cash-up still matches restaurant payments (after Phase 6)
- FO checkout still completes stay status only through its RPC

Do not claim browser PASS from unit tests alone.

---

## 19. Definition of Done

The Cashiering module is complete only when commissioned phases that are not held are implemented, ownership boundaries hold, balance is still derived, corrections are new rows, and hotel drawer is not restaurant expected cash.

Module COMPLETE remains **NO** until that bar and hotel UAT. Phases 13–14 can stay held without blocking an earlier “guest folio cashiering” acceptance, which must be named explicitly and must not be called module complete.

---

## 20. Deferred Register

| Item | Reason | Revisit |
|---|---|---|
| Second ledger or stored balance | Locked §1A | Do not revisit |
| Provider payment states | No provider | When a provider runtime exists |
| Allocated deposit UI | No allocation rows | Phase 9 |
| Company/master labels on aggregates | Not accounts | Phase 8 |
| Hotel variance from RM `expected_cash` | Wrong domain | Phase 6A |
| Approval inbox | No request table | Security programme, not a fake queue |
| Invoice issue | No issued counter or tax snapshot | Phase 11 |
| Charge codes inside Cashiering | Settings must own the catalogue | Phase 4 |
| Tax calculation | Setup-only until writer contract exists | Phase 4 prompt must opt in |
| Routing | Rules are hints | Phase 7 |
| City ledger / AR | No AR owner | Phase 13 joint revision |
| FX, fiscal, offline | No runtime | Phase 14 |
| `pms_permissions` cutover | Catalogue unused | After Settings/Security, not Phases 0–5 |
| Transfers tab | No writer | Phase 7 |
| Night-audit orphan route cleanup | Legacy | Opportunistic with Phase 1 links; do not expand night audit |

---

## 21. Recommended Execution Method

One coherent phase = one Cursor prompt, except where split is required.

| Phase | Prompt | Why |
|---|---|---|
| 0 | SINGLE | Safety only |
| 1 | SINGLE | Shell and redirects |
| 2 | SINGLE | Guest folio UX on hardened writers |
| 3 | SINGLE | Source link + history |
| 4 | SINGLE | Opt-in tax; otherwise methods only |
| 5 | SINGLE | Linked refunds; no inbox |
| 6 | SPLIT | 6A separate hotel cash; 6B UX after |
| 7 | DO NOT START until targets exist | Transfers need a real destination |
| 8 | SPLIT | 8A accounts; 8B UI; re-audit first |
| 9 | SINGLE | After linkage; cross-account waits |
| 10 | After 8 | Extended settlement |
| 11 | DO NOT START until numbering and tax identity | Documents |
| 12 | SINGLE | Derived exceptions and reports |
| 13–14 | DO NOT IMPLEMENT | Missing owners |

Do not create a prompt per dialog. Re-audit before any new account or document table.

---

## 22. Immediate Next Step

**First implementation action: Phase 0 — Financial Safety & Ledger Hardening.**

Do not start the workspace shell, folio redesign, or shift UX on top of post-then-validate tender, missing idempotency, or an unenforced ledger.

Sequence:

1. Commission **Phase 0** (single prompt).
2. Then **Phase 1** shell (canonical route, no fake modules).
3. Then **Phase 2** guest folio operations.
4. Then **Phase 3** source linkage before refund workflows.
5. Do **not** start hotel drawer UX, company folios, transfers, invoices, city ledger, FX, or offline.
6. Do **not** add a balance column.
7. Do **not** show provider, allocated-deposit, or approval-inbox states.

---

## Do Not Touch (protected)

- Settings catalogue editors (payment methods, taxes, deposit policies, billing rules, invoice settings, approval rules, FX, offline, Card 7)
- Reservation priced create/amend and stay-status RPCs (invoke checkout; do not copy it)
- Group/contract structure
- POS order lifecycle and restaurant `expected_cash` math (until a Phase 6 prompt changes only the hotel side)
- Guest Services request writers
- Night Audit date close
- A new `payments` or `deposits` balance store
- `guest_folios.balance`
- In-place edits of committed amount, type, or source

---

## Final validation (this document)

1. Audit accepted as PASS — **yes**.
2. Guest ledger preserved; no second balance engine — **yes** (§1A.1, §1A.3).
3. Phase 0 is financial safety, not UI — **yes**.
4. Immutability, idempotency, and tender-before-post are Phase 0 — **yes**.
5. Company/group/master are not aggregates — **yes** (Phase 8).
6. Hotel drawer split from restaurant cash before shift UX — **yes** (Phase 6).
7. Recorded payments only; deposits are credits until Phase 9 — **yes**.
8. Source linkage before rich refund UX — **yes** (Phase 3 then 5).
9. FO override stays unsettled — **yes** (Phase 0).
10. Settings setup-only items are holds — **yes** (§1A.13, §16).
11. Fifteen engineering phases including Phase 0 — **yes**.
12. Master rule recorded — **yes**: never trade financial integrity for UI completeness.
13. No application implementation in this change set — **yes** (this file only).
