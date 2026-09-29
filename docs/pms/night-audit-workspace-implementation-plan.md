# NORU PMS — NIGHT AUDIT WORKSPACE IMPLEMENTATION PLAN

| Field | Value |
|---|---|
| **STATUS** | **PLAN ONLY** — not a Functional Spec, not authorised engineering, not implemented |
| **Basis** | Current local working tree + Night Audit Workspace Foundation Audit (2026-09-28, accepted) |
| **Date** | 2026-09-28 |
| **Audit verdict** | **PARTIAL FOUNDATION — ACTIONABLE GAPS** |
| **Module COMPLETE** | **NO** |
| **Canonical route** | `/restaurant/pms/night-audit` |
| **Canonical clock** | `restaurants.business_date` |
| **Canonical close** | `closeBusinessDate` → `close_business_date` |
| **Repository changes from this document** | This file only |

This document is the Cursor execution roadmap. It does not approve GitHub issues by itself. Do not implement from this file until a named engineering phase is explicitly commissioned.

The approved product proposal’s 7 presentation phases are **coverage**, not build order. Engineering is **Phase 0–8**, plus an explicit **Hold register**. Binding architecture is **§1A Locked Decisions**.

**Master rule:** Night Audit detects, classifies, links, and routes. It never silently edits another module’s source data. If a backend capability is missing, hold the screen rather than fake the check, the posting, or the recovery.

---

## 1. Purpose

Night Audit is the **business-date control and close orchestration** workspace for one property.

It owns readiness display, reconciliation **reads**, the audit run for the current house date, blocker visibility, close/open of that date, and the history of those runs.

It does **not** own charges, payments, deposits, refunds, adjustments, folio settlement, hotel drawer counts, reservation status, check-in, check-out, housekeeping completion, physical room status, rate configuration, POS order state, or Settings editors.

**Night Audit consumes owner-module facts. It writes only `night_audit_runs`, `night_audit_exceptions`, and `restaurants.business_date` (through `close_business_date`).**

---

## 1A. Locked Decisions (2026-09-28)

These decisions are **binding**. Later engineering phases must not reopen them without an explicit plan revision.

### 1. One clock

`restaurants.business_date` is the hotel business date. One value per property. Historical dates live on `night_audit_runs.business_date`, not as a second current-date column.

Do **not** add `property_business_date`, a per-module date copy, or `open_business_date`.

Null `business_date` falls back to property-local calendar today only for **reads and for the first close**. After the first successful close, the column is the clock.

### 2. Close is the only roll, and it must be the current date

`close_business_date` remains the only writer that advances the clock. Next date is `run.business_date + 1` (calendar day). Timezone and Card 1 `dayBoundary` do **not** change that arithmetic until a commissioned Settings runtime exists. This plan does not commission that runtime.

Phase 0 must reject a close whose run date is not the current house date. A second close of an already `closed` run must not add another day. A later closed run must make an older open run unclosable.

### 3. Phase 0 is close safety, not a new workspace

Before any reconciliation UI, nightly posting, or recovery stepper:

- stale-run close cannot move the clock
- every condition that can refuse close is visible on the operator board
- the board, the server function, and the SQL function refuse the same blocking set

### 4. One blocker contract

Today two engines disagree:

- NA-1 board: `evaluateNa1Blockers` / `buildNa1Blockers` (what the operator sees)
- Phase 6I: `evaluateAudit` persisted to `night_audit_exceptions` (what can still reject close while the board says All clear)

Phase 0 folds every **blocking** Phase 6I condition onto the NA-1 board (or an equivalent single list the board renders). After that, `closeBusinessDate` refuses only that list. SQL counts the same persisted blocking rows. Warnings never block close.

`cancel_noshow_pending` stays **unavailable**. It does not block and it is not invented from arrivals.

### 5. Night Audit does not post money

Room revenue today is one `reservation_room_charge` per reservation inside `open_folio_for_reservation`, protected by `folio_transactions_room_charge_once`. Night Audit may detect a duplicate. It must not post, reverse, or “catch up” nights.

A per-night posting engine is **Hold**. It belongs to Cashiering, with a per-stay-per-date idempotency key, before Night Audit may show a nightly posting step.

### 6. Night Audit does not write source domains

Forbidden from Night Audit server functions and from `close_business_date`:

- folio inserts/updates, settlement, refunds, adjustments
- hotel drawer open/close/count
- reservation status, including no-show and cancel
- check-in, check-out, stay amendments
- housekeeping task, inspection, or discrepancy resolution
- `hotel_rooms` physical status, OOO/OOS, availability
- POS order status

Clearance is a link to the owner workspace. `NA1_HAS_MARK_NO_SHOW`, waive, ignore, and reverse stay false on the live workspace.

### 7. Exceptions are derived

`night_audit_exceptions` exist so close can count open blockers and so history survives a refresh. They are not a second operational inbox.

- When the underlying condition disappears, the row may become `resolved` with the existing automatic note.
- A blocking condition that returns reopens the row.
- A human `resolved` or `ignored` on a **warning** does not fix the source record. Do not mount `updateException` as “Fixed”.
- Blocking types in `NON_IGNORABLE_TYPES` stay non-ignorable.
- Do not add an exception row whose `resolved` flag is the only “fix”.

### 8. Hotel drawer is not restaurant cash

Open-drawer blocking uses `list_hotel_drawers` (`hotel_cashier_shifts` / `hotel_drawer_figures.expected`). Do not read `cashier_shifts.expected_cash`.

Variance and closing count are Cashiering facts. Night Audit may display them only after Cashiering exposes them on that RPC. An open hotel drawer blocks close. Zero drawers is N/A, not a fake pass and not a blocker.

### 9. Settings JSON is not Night Audit policy

Do not read these for run or close until a later plan revision names the reader:

- `business_date_config` (`nightAuditWindowStart` / `End`, `dayBoundary`, `automaticRollover`, `manualRolloverRoles`, `approvalRequired`, `lockDuringAudit`, `closeBlockersEnabled`, calendar display, sell-date rule, board-date rules)
- `business_date_blockers`
- `pms_permissions` codes `night_audit.run.view`, `night_audit.run.create`, `night_audit.exception.edit`, `night_audit.business_date.activate`

Live authorization stays `restaurant_users.role`: view via `requireNightAuditView`, close via `requireCashierManager` (owner/manager).

### 10. No recovery theatre

`night_audit_runs.status = 'failed'` is unused. There is no step table and no checkpoint.

Do not add a Retry button, a step stepper, or a resume API in Phases 0–7. Re-opening the workspace re-derives checks. That is safe only while Night Audit does not post.

If a posting step is ever added, it needs its own idempotency key first. That work is Hold, not a UI phase.

### 11. Close and next date are one transaction

Do not split “close” and “open next date” into two RPCs in this plan. The existing function locks the property row and the run, sets the run `closed`, and sets `business_date = run.business_date + 1`.

`captureOtbSnapshotAfterClose` stays **after** that transaction and fail-open. A snapshot failure must not roll the date back and must not be shown as a failed night audit.

### 12. Do not fake these

Tax or service-charge reconciliation. Company, group, master, or city-ledger accounts. Payment-provider or integration health (green/red). POS pending-post queue. Queued approval inbox. HK readiness computed with a second formula. Occupancy or oversell as a Night Audit inventory engine. PDF/CSV packs whose source totals do not exist. Card 1 “incomplete night audit” as a live blocker. Guaranteed no-show worklists. Reopening a prior business date.

### 13. Cross-module clock gaps are not Night Audit writes

Cashiering desk, PMS reports, create-reservation defaults, public booking, and standalone POS use calendar `propertyToday`. Check-in and check-out RPCs do not read `restaurants.business_date`. No-show accepts a client-supplied date.

Those are owner-module defects. Night Audit phases must not patch them by writing into those modules. A separate commissioned change in the owner module may switch a reader to `getPropertyBusinessDate`. Track them in §7. Do not bury them inside a Night Audit prompt.

### 14. Finance totals are not authoritative until the window is honest

`evaluateAudit` buckets `folio_transactions.posted_at` with naive strings `` `${businessDate}T00:00:00` `` through the next midnight. There is no business-date column on the ledger.

Phase 5 may show those totals only with an explicit label that they are posted-at aggregates, or it may wait until Cashiering stamps a business date. It must not label them “expected vs posted” or “today’s room revenue” as if a nightly engine had run.

---

## 2. Locked Architecture

**Shared data does not mean shared ownership.** A folio balance Night Audit can read is still a Cashiering balance.

| Domain | Owns | Night Audit role |
|---|---|---|
| Settings / Property Setup | Business-date **policy** JSON, timezone, currency, readiness policy, payment/deposit catalogues, permission catalogue | Read timezone and currency. Do not copy editors. Do not execute setup-only JSON. |
| Night Audit | Current-date run, derived exceptions, close orchestration, run history | Own. |
| Cashiering | Folio lines, settlement, hotel drawer | Read. Link. Never post. |
| Reservations | Reservation lifecycle, cancel, no-show | Read. Link to FO/Reservations writers. |
| Front Office | Check-in, check-out, stay state | Read desks. Link. Never change stay state. |
| Housekeeping | Cleaning, inspection, readiness | Read discrepancies and, when a check needs it, call the existing readiness evaluator. Do not fork the formula. |
| Rooms & Inventory | Physical status, availability, OOO/OOS | Read. Link. Never write room status. |
| Rate & Revenue | Pricing and OTB analytics | Optional fail-open snapshot after close. Not a posting check. |
| POS / Restaurant | Outlet orders; RM cash-up | Reconcile only a real pending-post query if Cashiering exposes one. RM `expected_cash` stays RM. |
| Accounting | GL | No journals from Night Audit. |
| Security | Roles and future permission cutover | Live gate remains `restaurant_users.role`. |

Protected engines (do not fork):

- `close_business_date`
- `open_folio_for_reservation` and `folio_transactions_room_charge_once`
- `post_folio_transaction`, `close_guest_folio`, `post_order_room_charge`
- `list_hotel_drawers` and hotel drawer writers
- `check_in_hotel_reservation`, `check_out_hotel_reservation`, `mark_hotel_reservation_no_show`
- Housekeeping task/inspect/discrepancy writers and the readiness evaluator
- Room restriction / inventory RPCs
- Card 1 settings save

---

## 3. Current State

**Audit verdict (accepted):** PARTIAL FOUNDATION — ACTIONABLE GAPS.

### Route and workspace

- Canonical: `/restaurant/pms/night-audit` → `NightAuditWorkspace` → `na1-panels.tsx`.
- Page load calls `runNightAudit` (create or refresh the run for the resolved house date). No separate Run button.
- Local History and Summary only. No URL tabs. No PMS `$runId` route.
- Confirm close calls `closeBusinessDate`. Clear actions are links (`NA1_BLOCKER_META`).
- `/restaurant/cashiering/night-audit` redirects to the PMS route.
- `/restaurant/cashiering/night-audit/$runId` still serves `getNightAuditRun` and is not linked.
- `night-audit-panels.tsx` (checklist, exceptions, no-show, shifts, revenue) is unmounted.
- `updateException` has no live caller.

### What is already LIVE

- `restaurants.business_date` and `close_business_date` (`FOR UPDATE` on property and run; idempotent when `status = closed`; blocking-exception guard; `business_date + 1`).
- Unique `(restaurant_id, business_date)` on `night_audit_runs`.
- NA-1 blockers that query real rows: arrivals pending, overstays, unpaid folios (role-gated), open hotel drawer, HK conflict (OOO/OOS assignment + open discrepancies).
- Phase 6I evaluation persisted to `night_audit_exceptions`, including integrity blockers the board does not show.
- Hotel drawer via `list_hotel_drawers`, not restaurant expected cash.
- Role gates: view `requireNightAuditView`; close `requireCashierManager`.
- Run history list (60) and summary snapshot on the closed run.
- Auto-clear of exceptions when the derived condition is gone; reopen when a blocking condition returns.

### What is unsafe or split

- SQL close does not require `run.business_date = restaurants.business_date`.
- UI can show All clear while Phase 6I blocking exceptions reject close.
- `failed` is a dead status. No checkpoints.
- Finance day window is a string compare on `posted_at`.
- Warning resolve/ignore API does not change source rows.

### What must stay HOLD

Nightly posting. Tax and service charge. Company/group/master/city ledger. Provider and integration health. POS queue. Queued approvals. Card 1 window and automatic rollover. Second HK readiness formula. Reopen prior date. Step-based recovery.

---

## 4. Preserve / Do Not Replace

- `close_business_date` as the only date roll. Harden it in place. Do not add `open_business_date`.
- `night_audit_runs` and `night_audit_exceptions`. Do not add a parallel audit-event table in Phases 0–7.
- `runNightAudit` as the sync entry for the **current** house date. Do not re-derive a closed run.
- `resolvePropertyBusinessDate` / `getPropertyBusinessDate` / `loadProperty`.
- `list_hotel_drawers`.
- NA-1 link-out pattern (detect and route).
- One-shot room charge and its unique index.
- OTB snapshot fail-open behavior.
- Legacy cashiering night-audit index redirect.

---

## 5. Canonical Close Contract

After Phase 0, `close_business_date` must do all of the following inside one transaction:

1. `FOR UPDATE` the `restaurants` row, then the run row scoped by `id` and `restaurant_id`.
2. If the run is missing, raise `AUDIT_RUN_NOT_FOUND`.
3. If `status = 'closed'`, return the run and do not change `business_date`.
4. If `status` is not `open` or `ready`, raise (do not treat `failed` as closable).
5. If `restaurants.business_date` is not null and differs from `run.business_date`, raise `STALE_BUSINESS_DATE` and do not update either row.
6. If any `night_audit_runs` row for the property has `business_date > run.business_date` and `status = 'closed'`, raise `STALE_BUSINESS_DATE`.
7. If any exception on this run has `severity = 'blocking'` and `status = 'open'`, raise `BLOCKING_EXCEPTIONS_OPEN`.
8. Otherwise set the run `closed` with summary, closer, and `closed_at`, then set `restaurants.business_date = run.business_date + 1`.

Null house date: step 5 allows this run through (first close). The run’s `business_date` must already be the property-local today that `resolvePropertyBusinessDate` stored. The app must not create that run from a caller-supplied date.

App `closeBusinessDate` must apply the same stale-date check **before** the RPC and must refuse when the single blocker list is non-empty. It must not keep a second hidden `evaluateAudit` blocking pass that the board does not show.

Service role remains the only SQL executor. The app still checks `requireCashierManager` and passes that membership id. Phase 0 does not move authorization into a permission-catalogue lookup.

---

## 6. Technical Debt Before Expansion

Fix in Phase 0 (safety):

- Stale run can assign `business_date = stale_date + 1`.
- Dual blocker engines.
- SQL does not require `open`/`ready`.

Fix in Phase 2–4 only as visibility, not as new writers:

- Unmounted Phase 6I panels and unwired `updateException`.
- Orphan `/restaurant/cashiering/night-audit/$runId` (redirect or replace with a PMS history detail that calls the same reader).
- Dead `failed` status: leave it unused; do not start writing it.

Do not “fix” in a Night Audit phase:

- Cashiering, reports, booking, or POS calendar dates (owner modules).
- Client-supplied no-show business date (FO/Reservations).
- Check-in/out not reading the house date (FO).
- `posted_at` as the only ledger time (Cashiering), except Phase 5 may label Night Audit totals honestly.
- Card 1 and `pms_permissions` unused by close (leave unused).

---

## 7. Cross-Module Dependency Map

| Dependency | Owner | Night Audit rule |
|---|---|---|
| House date column and close RPC | Night Audit | Phase 0 hardens. Others only read. |
| Folio lines and balances | Cashiering | Read-only. Unsettled checkout stays Cashiering’s marker. |
| Hotel drawer open/expected | Cashiering Phase 6 | `list_hotel_drawers` only. |
| Arrivals, in-house, departures | Front Office | Link to FO tabs. |
| No-show and cancel | Reservations / FO | Unavailable on the board until a real pending-fee query exists. Do not call `mark_hotel_reservation_no_show` from Night Audit. |
| Room OOO/OOS | Rooms & Inventory | Read `hotel_rooms.status`. |
| Discrepancies | Housekeeping | Read open discrepancies. |
| Readiness | Housekeeping evaluator | Call it in Phase 6 if arrival/departure readiness is shown. Do not reimplement. |
| OTB snapshot | Rate & Revenue | Keep fail-open after close. |
| Calendar-today desks | Cashiering, Reports, booking, POS | Out of scope. Separate commissions. |
| Tax, company, city ledger, provider | Not live | Hold. |

---

## 8. Settings / Property Setup Master Data Contract

| Object | Consume in this plan? |
|---|---|
| `restaurants.business_date` | Yes. The clock. |
| `restaurants.timezone` | Yes, for null-date fallback and display. Not for `+ 1`. |
| `restaurants.currency_code` | Yes, as the label on finance aggregates. |
| `business_date_config` | No. |
| `business_date_blockers` | No. |
| `pms_permissions` night_audit.* | No. |
| HK readiness policy | Only by calling the existing evaluator in a later phase. |
| Payment methods, tax, deposit policy | No. Ledger reads do not re-interpret catalogues. |

Property setup may keep showing the last closed run. That display is not a second close button.

---

## 9. Night Audit Read/Write Model

**Writes (only these):**

- Insert/update `night_audit_runs` for the current house date (`open` ↔ `ready`, then `closed` via RPC).
- Insert/auto-resolve/reopen `night_audit_exceptions` from the single derived blocker/warning set.
- `restaurants.business_date` inside `close_business_date` only.
- Optional `notes` on the run after a successful close.
- OTB snapshot after close, fail-open, not a source-domain write.

**Reads:**

- Reservations and stay rows for arrivals, overstays, assignment, double occupancy.
- `guest_folios` and `folio_transactions` for unpaid, closed-folio integrity, duplicate room charge, and (later) labeled aggregates.
- `list_hotel_drawers`.
- `hotel_rooms` and `housekeeping_discrepancies`.
- Staff names for actor display.

**Not reads that become fake health:**

- Card 1 blocker labels.
- Permission catalogue.
- Integration queues that do not exist.

---

## 10. Engineering Roadmap

Product presentation phases (coverage only):

1. Night Audit Control
2. Pre-Audit Validation
3. Financial Reconciliation
4. Operational Reconciliation
5. Exceptions & Approvals
6. Run Night Audit & Close Date
7. Next Day, Reports & Recovery

Engineering order (this plan):

| Phase | Name | Product coverage | Commission now? |
|---|---|---|---|
| 0 | Close-date guard and single blocker contract | Makes product 6 safe; surfaces product 2 blockers | **Yes — first** |
| 1 | Control shell | Product 1 | After 0 |
| 2 | Pre-audit board | Product 2 | After 0; warnings and links |
| 3 | Close and next date | Product 6 | Safety is Phase 0; this phase is operator proof |
| 4 | History | Product 7 history | After 3 |
| 5 | Financial reconciliation reads | Product 3 | After 0; holds inside the phase |
| 6 | Operational reconciliation | Product 4 | After 2 |
| 7 | Exceptions and direct authorization | Product 5 | After 2; no inbox |
| 8 | Reports | Product 7 reports | Only totals that exist |
| Hold | Nightly posting, integrations, settings runtime, queued approval, checkpoints, prior-date reopen | — | **Do not implement** |

---

## Phase 0 — Close-Date Guard & Single Blocker Contract

### Functional Scope

Make close safe and make every close refusal visible. No new tabs. No nightly posting. No settings consumption. No retry stepper.

### Product Coverage

Protects product phase 6. Pulls product phase 2 **blocking** rows onto the existing board. Does not build reconciliation or reports.

### Existing Capability Reused

`close_business_date`, `closeBusinessDate`, `runNightAudit`, `evaluateNa1Blockers`, `evaluateAudit`, `NON_IGNORABLE_TYPES`, `list_hotel_drawers`, `NA1_BLOCKER_META` links.

### Backend Work

- Extend `close_business_date` per §5. New SQL exceptions: `STALE_BUSINESS_DATE`. Keep `AUDIT_RUN_NOT_FOUND` and `BLOCKING_EXCEPTIONS_OPEN`. Keep closed-run idempotency.
- `closeBusinessDate`: load the property date; if it is non-null and not equal to the run date, return a failure and do not call the RPC. If any later closed run exists, same refusal.
- Replace the dual gate. The blocking set that refuses close is exactly the set rendered as NA-1 `block` rows (not `na`, not `unavailable`):
  - arrivals pending (covers `arrival_not_processed` / pending-or-confirmed arrival on or before the house date)
  - overstays
  - unpaid folios when the folio lane is live
  - open hotel drawer
  - HK conflict (assigned OOO/OOS and open discrepancies)
  - checked in without a room
  - double occupancy
  - closed folio non-zero balance
  - closed folio post-close activity
  - duplicate `reservation_room_charge`
- Persist those blocking conditions as `night_audit_exceptions` so SQL and the board match after `runNightAudit`.
- Warnings may still be stored. They must not set run status away from `ready` and must not fail close.
- `canClose` / `canEnableConfirm` uses that same list.
- Do not write `failed`. Do not call folio, reservation, room, or HK writers.
- Map `STALE_BUSINESS_DATE` to an operator message that the run is not the current business date. Do not advance the date.

### Frontend Work

- Add board rows (or extend existing rows) so each blocking condition above has a label, count, and an owner link. No waive, ignore, or mark-no-show control.
- A blocker that is `unavailable` because the role cannot read folios stays unavailable and does not count as pass. Close remains owner/manager, whose folio lane is live.
- Phone still cannot confirm close.
- Do not add Retry, Run steps, or a green integration panel.

### Database / Migration Work

Replace `close_business_date` in a new dual-lane migration (`drizzle/migrations` and `supabase/migrations`). No new tables. No `business_date` column on `folio_transactions`. No step table. Revoke/grant stays service_role only.

### Settings Dependencies

None. Do not read `business_date_config`.

### Cross-Module Dependencies

Reads only. Links only. Cashiering drawer RPC and folio tables stay owners.

### Ownership Risks

Folding blockers must not start resolving them in-process. Duplicate room charge is a report, not a delete. Closed-folio integrity is not a write-off.

### Tests Required

- Close current open/ready run: `business_date` becomes `run date + 1` once; run `closed`.
- Second close of that run: `alreadyClosed` / SQL returns the same run; date does not move again.
- Open run for an older date while the house date is later: `STALE_BUSINESS_DATE`; house date unchanged.
- Property with a closed run on a later date: older run cannot close.
- Null `business_date`: first close of the resolved today run sets the column to that date + 1.
- Each blocking condition in the list prevents close and appears on the blocker payload the workspace renders.
- A warning alone does not prevent close.
- `cancel_noshow_pending` does not prevent close.
- Close does not insert `folio_transactions` or update reservation or room status.
- Closed run is not re-derived into new open exceptions.

### Browser Verification

Not a redesign phase. After the server change, one authenticated pass on `/restaurant/pms/night-audit`: board shows the blocking set, Confirm stays disabled while any blocking row is `block`, and a property that is already clear still shows Confirm only for owner/manager on desktop. Do not close a production date as the test. Use a non-production property if a close is exercised.

### PASS Criteria

- Wrong-run close cannot move `restaurants.business_date`.
- Same-run re-close cannot move it twice.
- Operator board and server refusal list the same blockers.
- No source-domain writes.
- No new posting, approval, or settings behavior.

### Explicitly Deferred

Shell cleanup, history route, finance totals, operational extra checks, exception ignore UI, reports, nightly posting.

**Cursor prompt:** **SINGLE PROMPT** — close safety and one blocker contract only.

---

## Phase 1 — Control Shell

### Functional Scope

One Night Audit home. Staff are not sent to legacy panels. History can open a run detail without a second product.

### Product Coverage

Product phase 1 (Night Audit Control).

### Existing Capability Reused

`NightAuditWorkspace`, `getNightAuditAccess`, `listNightAuditRuns`, `getNightAuditRun`, `pms-modules.ts` canonical route, cashiering index redirect.

### Backend Work

None beyond reads already used. Do not add writers.

### Frontend Work

- Shell and in-module links keep `/restaurant/pms/night-audit`.
- Keep the cashiering index redirect.
- History rows link to a detail that uses `getNightAuditRun`. Prefer a PMS path; the cashiering `$runId` route redirects there with the same id.
- Do not mount `ChecklistPanel`, `ExceptionsPanel`, `NoShowPanel`, `ShiftsPanel`, or `RevenuePanel`.
- Do not add a control center, URL tab explosion, or Run/Retry primary action. Page load remains the sync.
- Empty and closed states stay honest: closed date shows the stored summary; it does not invite another close.

### Database / Migration Work

None.

### Settings Dependencies

None.

### Cross-Module Dependencies

Nav only.

### Ownership Risks

Do not place Settings editors or folio post actions on this shell.

### Tests Required

- Canonical route constant unchanged.
- Legacy index still redirects.
- Workspace source does not import the legacy panels or `updateException`.
- History detail reader is the existing `getNightAuditRun`.

### Browser Verification

Authenticated: open Night Audit, switch History and Summary, open one past run, return to the board. No console runtime errors. Confirm still respects role and blockers from Phase 0.

### PASS Criteria

- One staff URL.
- Run detail is reachable from History.
- Legacy checklist UI stays unwired.
- No new close rules.

### Explicitly Deferred

Finance and occupancy reports on the detail page beyond the stored summary.

**Cursor prompt:** **SINGLE PROMPT** — shell and history link only.

---

## Phase 2 — Pre-Audit Board

### Functional Scope

The board is the full pre-audit view: blockers from Phase 0 plus non-blocking warnings with owner links. Unavailable rows stay unavailable.

### Product Coverage

Product phase 2.

### Existing Capability Reused

Phase 0 blocker list, `evaluateAudit` warning types that already query real tables, FO and Cashiering and HK links.

### Backend Work

- Surface existing warning derivations on the same payload (not a third engine): pending arrival if still distinct from the blocking arrival row, cancelled holding a room, invalid stay dates, occupied restricted room when not already in HK conflict, dirty room without an open task, restriction without reason, inconsistent room state, open folio balance, missing folio.
- Warnings do not change `canClose`.
- Do not add POS, payment-queue, provider, or no-show-fee queries.
- Do not call no-show or check-in writers.

### Frontend Work

- Warnings visible and labeled warning, with links, without resolve/ignore buttons.
- `cancel_noshow_pending` remains the unavailable row with the current copy (no invented worklist).
- Receptionist unpaid row remains Unavailable.

### Database / Migration Work

None required if warnings already persist on `night_audit_exceptions`. Do not add a checklist settings table.

### Settings Dependencies

Do not bind the board to `business_date_blockers`.

### Cross-Module Dependencies

Links only.

### Ownership Risks

Dirty-without-task is a warning, not a task create. Cancelled-holding-room is not a room unassign from Night Audit.

### Tests Required

- Each warning type is present in the payload when the fixture exists and absent when it does not.
- Close still allowed when only warnings exist.
- Unavailable cancel/no-show row is not `pass` and not `block`.

### Browser Verification

Board shows a warning without enabling a resolve action. Confirm follows Phase 0 blockers only.

### PASS Criteria

- Pre-audit is one board.
- No fake checks.
- No source writes.

### Explicitly Deferred

Readiness evaluator (Phase 6). Posting-date finance (Phase 5).

**Cursor prompt:** **SINGLE PROMPT** — warnings on the existing board.

---

## Phase 3 — Close and Next Date

### Functional Scope

Operator close matches the Phase 0 contract. Success shows the closed date and the next date from the database after the RPC, not from a client guess.

### Product Coverage

Product phase 6. Next date is the same transaction (product “next day” open is not a second button).

### Existing Capability Reused

`closeBusinessDate`, `nextBusinessDate`, `NaClosePanel`, summary snapshot already written into `summary`.

### Backend Work

- Keep notes as an optional post-close update. A notes failure must be visible and must not be described as a rolled-back close.
- Keep OTB capture fail-open. Surface `otbSnapshotStatus` only as analytics, not as audit failure.
- Re-read `loadProperty` after close for `nextBusinessDate` (already done on the success path). The idempotent already-closed path must return the property’s current date, not a computed `+ 1` that could diverge.
- Do not implement `automaticRollover` or a night-audit window.

### Frontend Work

- Confirm copy stays “Confirm close”. Note hint stays “not a waive”.
- Success state shows previous date and next date from the server payload.
- Disabled reasons: blockers, wrong role, phone, already closed, request in flight.
- Do not add “reopen date”.

### Database / Migration Work

None if Phase 0 already altered the function.

### Settings Dependencies

None.

### Cross-Module Dependencies

None beyond the clock other modules may read later.

### Ownership Risks

Do not “help” close by auto-checking out overstays or closing drawers.

### Tests Required

- Success payload `nextBusinessDate` equals the property row after close.
- Already-closed call does not change the row’s `closed_at` or the house date.
- OTB failure still returns ok close.
- Blocked close returns ok false and leaves the date unchanged.

### Browser Verification

On a non-production property, with blockers clear, owner confirms close once and sees the next date. Refresh shows the new house date and a closed run. Second confirm does not advance again.

### PASS Criteria

- One manager action rolls one day.
- UI cannot waive blockers.
- Snapshot failure is not a failed audit.

### Explicitly Deferred

Separate open-next-date permission. Timezone boundary. Reverse close.

**Cursor prompt:** **SINGLE PROMPT** — close UX on the Phase 0 RPC. No new SQL unless a test proves the idempotent path lies about the next date.

---

## Phase 4 — History

### Functional Scope

One history stream: `night_audit_runs` plus `night_audit_exceptions` for that run.

### Product Coverage

Product phase 7 history. Not the report pack.

### Existing Capability Reused

`listNightAuditRuns`, `getNightAuditRun`, `summary` jsonb (finance, checks, blocker snapshot, previous/next date), exception resolver columns.

### Backend Work

- History read includes status, business date, started/closed actors and timestamps, notes, blocker snapshot, and exception rows.
- Do not create `night_audit_events`.
- Do not backfill step or failure rows.
- Closed runs stay immutable: `runNightAudit` must keep skipping exception mutation when `status = closed`.

### Frontend Work

- History list and Phase 1 detail show those fields.
- Distinguish automatic resolution notes from human warning notes if both exist. Do not label either as “source corrected” unless the message already says the condition cleared.
- No export button in this phase.

### Database / Migration Work

None.

### Settings Dependencies

None.

### Cross-Module Dependencies

Actor names from `restaurant_users` / profiles, as today.

### Ownership Risks

Do not write a second Card 7 audit stream.

### Tests Required

- Closed run reload does not insert exceptions.
- Detail returns exceptions for that run and property only (wrong `restaurant_id` is null / forbidden).

### Browser Verification

Open two historical runs if they exist; each shows its own date and summary. No edit controls on a closed run.

### PASS Criteria

- History is the existing tables.
- Closed runs are immutable.
- Property scope holds.

### Explicitly Deferred

PDF, CSV, occupancy pack.

**Cursor prompt:** **SINGLE PROMPT** — history read model and detail. No new table.

---

## Phase 5 — Financial Reconciliation Reads

### Functional Scope

Show Cashiering facts Night Audit already aggregates, labeled as ledger reads. No expected-vs-posted room revenue. No tax. No company accounts.

### Product Coverage

Product phase 3, only the live subset.

### Existing Capability Reused

`evaluateAudit` finance totals, folio integrity blockers from Phase 0, `list_hotel_drawers` expected figure, `ShiftReconciliation` shape if still produced.

### Backend Work

- Either label the `posted_at` window as “postings whose timestamp falls on this calendar date string” or stop publishing the totals until Cashiering adds a business-date stamp. Do not silently treat the string window as the house date in property timezone.
- Do not add a comparison to `room_subtotal` or `nightly_rate_snapshot` as “missing nights”.
- Drawer block remains open-status only. If `expected` is shown, label it hotel drawer expected, not restaurant expected cash.
- Do not query `cashier_shifts.expected_cash`.

### Frontend Work

- A reconciliation section on the current run (and on the closed summary) for: charges, payments, deposits, refunds, adjustments/discounts, open-drawer count.
- Empty copy for tax, service charge, company/group/master, city ledger, FX: omit the rows. Do not show zeros that imply a live account.
- Links to Cashiering folios and hotel drawer. No post buttons.

### Database / Migration Work

None in Night Audit. A ledger `business_date` column is a **Cashiering** commission, not this phase.

### Settings Dependencies

Currency code for labels only.

### Cross-Module Dependencies

Cashiering ledger. If the window is too misleading to label honestly, ship the section without day totals and keep the Phase 0 integrity blockers.

### Ownership Risks

Do not insert balancing adjustments. Do not close folios. Do not close drawers.

### Tests Required

- Totals match a fixture of `folio_transactions` under the documented window rule.
- No code path references restaurant `expected_cash`.
- Response has no tax, company, or city-ledger fields presented as balances.

### Browser Verification

Section renders from the run payload, links to Cashiering, and does not offer a post or a waive.

### PASS Criteria

- Numbers are ledger reads with an honest window.
- Held products are absent, not zeroed fakes.
- Hotel drawer figure is the hotel RPC.

### Explicitly Deferred

Expected room revenue, tax, service charge, company/master, provider settlement, POS unposted queue, drawer variance as a blocker.

**Cursor prompt:** **SINGLE PROMPT** — labeled reads. No ledger migration.

---

## Phase 6 — Operational Reconciliation

### Functional Scope

Read-only operational checks that already have an owner query or the existing HK readiness evaluator. No inventory engine.

### Product Coverage

Product phase 4.

### Existing Capability Reused

Phase 0/2 reservation and room checks, FO desk links, `hotel_rooms`, `housekeeping_discrepancies`. Readiness: call the existing evaluator; do not copy it into `na1.server.ts`.

### Backend Work

- Arrival-not-ready and dirty-departure may appear only as the evaluator’s result, with the evaluator’s reason codes. If the evaluator cannot be called without new policy, omit those rows.
- Do not compute occupancy, availability, or oversell. Link to Rooms & Inventory if a count is needed later.
- Unassigned arrival stays a warning or blocker only if the existing reservation read already exposes it (`checked_in` without room is already blocking). Do not invent a second assignment matcher.
- No writes to rooms, tasks, or reservations.

### Frontend Work

- Rows for the checks above with owner links (FO, HK, Rooms).
- No “mark ready”, “create task”, or “move guest” buttons inside Night Audit.

### Database / Migration Work

None.

### Settings Dependencies

Only whatever the readiness evaluator already reads. Do not re-parse Card 2 JSON in Night Audit.

### Cross-Module Dependencies

Housekeeping evaluator, FO, room status.

### Ownership Risks

A second readiness formula is a failed phase even if the UI looks complete.

### Tests Required

- Readiness row matches the evaluator for a fixture, or the row is absent.
- No `hotel_rooms` update and no task insert from the night-audit server modules.

### Browser Verification

Operational rows link out. Completing the owner flow and returning to Night Audit clears the derived row on refresh (condition gone), without a Night Audit resolve button.

### PASS Criteria

- Operational checks are reads and links.
- Readiness is the existing evaluator or omitted.
- No occupancy engine.

### Explicitly Deferred

Oversell, room-type availability, sellable inventory rebuild.

**Cursor prompt:** **SINGLE PROMPT** — operational reads. Evaluator call or omit.

---

## Phase 7 — Exceptions and Direct Authorization

### Functional Scope

Exception list is the derived table behind the board. Authorization to close stays owner/manager. No approval queue.

### Product Coverage

Product phase 5.

### Existing Capability Reused

`night_audit_exceptions`, auto-resolve and blocking reopen in `runNightAudit`, `requireCashierManager`, `NA1_HAS_WAIVE/IGNORE/REVERSE = false`.

### Backend Work

- Keep `updateException` unmounted, or restrict a future caller so blocking and `NON_IGNORABLE_TYPES` still cannot be ignored (already true).
- Do not add `night_audit_approvals`.
- Do not read `approvalRequired`.
- Document in UI copy that a cleared row means the source condition is gone, not that Night Audit fixed it.

### Frontend Work

- Exception history on the run detail (Phase 4) shows severity, type, reference, status, actor, time, note.
- No Ignore / Resolve / Approve buttons on the live board.
- Close stays the existing role gate. Optional note stays non-waive.

### Database / Migration Work

None.

### Settings Dependencies

None.

### Cross-Module Dependencies

None.

### Ownership Risks

Mounting Ignore would mark warnings resolved while the source row is unchanged. That is out of scope.

### Tests Required

- Blocking ignore still returns the existing error if the server function is called.
- Re-run reopens a blocking exception whose condition returned.
- Auto-resolve runs only when the condition is absent.

### Browser Verification

No approval inbox and no ignore control on the board or history detail.

### PASS Criteria

- Exceptions stay derived.
- Close authorization is the role gate.
- No fake resolved source state.

### Explicitly Deferred

Permission-catalogue cutover. Queued supervisor approval. Waive with reason.

**Cursor prompt:** **SINGLE PROMPT** — exception display and lock the ignore UI off.

---

## Phase 8 — Reports

### Functional Scope

Reports that repeat stored run summary and history. Nothing that needs tax, company, or nightly expected revenue.

### Product Coverage

Product phase 7 reports.

### Existing Capability Reused

`listNightAuditRuns`, `summary.finance` when Phase 5 has defined the label, `summary.blockers`, PMS reports “Recent night audits” entry.

### Backend Work

- Do not add a report whose query is a new occupancy or GL calculation.
- Card 7 `period_basis = business_date` stays setup-only. Do not pretend report queries use the house date unless the reports module is commissioned separately to call `getPropertyBusinessDate`.

### Frontend Work

- In-workspace summary and, if the reports workspace already lists runs, keep that list as date / status / closed at.
- No PDF/CSV in this phase unless it is a direct dump of the same JSON already on the run.
- Omit reconciliation “packs” for held domains.

### Database / Migration Work

None.

### Settings Dependencies

None.

### Cross-Module Dependencies

Reports module must not be rewritten here.

### Ownership Risks

Do not embed a second cashiering dashboard.

### Tests Required

- Report payload fields are a subset of run summary and exception counts.
- No query against a company-folio or tax table.

### Browser Verification

Summary matches the closed run after refresh. Reports list does not show empty columns for tax or city ledger.

### PASS Criteria

- Every figure has a live source from Phases 0–5.
- Held domains are absent.

### Explicitly Deferred

Export packs, occupancy/ADR as Night Audit reports (those stay Rate & Revenue), business-date report cutover inside the reports module.

**Cursor prompt:** **SINGLE PROMPT** — summary report only.

---

## Hold Register — Do Not Implement

| Item | Why | Revisit when |
|---|---|---|
| Nightly / recurring room posting | No per-night writer or per-date idempotency. One-shot stay charge is Cashiering. | Cashiering commissions an idempotent per-stay-per-date poster. Night Audit may then **read** results. It still does not own the writer. |
| Expected vs posted room revenue | Would invent the nightly engine. | Same. |
| Tax and service charge | Not posted on `folio_transactions`. | Cashiering posts them. |
| Company, group, master, city ledger | No accounts. `city_ledger` is a payment-method class label. | Cashiering Phase 8 / city ledger, then a read. |
| FX | No runtime. | Cashiering/accounting. |
| POS pending room charges | No Night Audit queue. `post_order_room_charge` is Cashiering. | A real pending/failed query from Cashiering. |
| Payment provider, email, fiscal, webhooks | No health runtime. | A real queue with status. Do not show green/red before that. |
| Queued approvals | Card 1 `approvalRequired` is unread JSON. | Security programme with request rows. |
| Audit window, day boundary, automatic rollover, lock during audit | Setup only. | A plan revision that defines the reader and the timezone rule. |
| `pms_permissions` night_audit.* | Catalogue unused. | Security cutover. Not Phases 0–8. |
| Checkpoints, `failed` runs, Retry | No step ledger. Refresh re-derives. | Only after a posting step with idempotency exists. |
| Reopen / reverse close | `NA1_HAS_REVERSE = false`. | Do not revisit in this plan. |
| Cancel/no-show pending fees | Explicitly unavailable. | FO/Reservations pending-fee worklist. |
| HK formula fork | Readiness evaluator exists. | Phase 6 calls it or omits the row. |
| Second business-date column | Locked §1A.1. | Do not revisit. |
| Cross-module calendar desks | Owner modules. | Separate commissions for Cashiering, reports, booking, POS, FO check-in/out, no-show date. |

---

## 11. Product Phase Map

| Product phase | Engineering home | Until then |
|---|---|---|
| 1 Night Audit Control | Phase 1 | Current NA-1 workspace is the live desk |
| 2 Pre-Audit Validation | Phase 0 blockers, Phase 2 warnings | Hidden Phase 6I blockers are a Phase 0 defect |
| 3 Financial Reconciliation | Phase 5 | Integrity blockers only; no fake tax/company |
| 4 Operational Reconciliation | Phase 6 | Phase 0 room/HK blockers; no second readiness formula |
| 5 Exceptions & Approvals | Phase 7 | Derived rows; direct owner/manager close; no inbox |
| 6 Run & Close Date | Phase 0 and Phase 3 | RPC exists; stale-run guard is not optional |
| 7 Next Day, Reports & Recovery | Next day is the close transaction; history Phase 4; reports Phase 8 | Recovery stepper is Hold |

---

## 12. Close Safety Rules (all phases)

- Only `close_business_date` changes `restaurants.business_date`.
- Close the current house date only. Closed run is idempotent.
- One blocking list for board, server, and SQL.
- Warnings do not block.
- Unavailable is not pass.
- No source-domain writes from Night Audit.
- No nightly post from Night Audit.
- No ignore/waive/reverse on the live workspace.
- No second clock and no second audit table.
- Service-role RPC stays revoked from `authenticated`.
- OTB snapshot failure does not undo close.
- Hotel drawer reads stay on `list_hotel_drawers`.
- Property id is on every run and exception query.

---

## 13. Ownership Conflicts to Avoid

- Settings JSON executed as if it were the close policy.
- Cashiering totals “corrected” by a Night Audit adjustment.
- No-show or check-out invoked to clear a blocker.
- Room status or HK tasks written to clear HK conflict.
- Restaurant `expected_cash` used as the hotel drawer.
- A readiness formula copied into `na1.ts`.
- Rate & Revenue UI-32/UI-33 treated as Night Audit steps.
- Permission catalogue shown as the live gate.
- `updateException` treated as source resolution.
- An approval inbox built from `approvalRequired`.
- GL or city-ledger journals.

---

## 14. Canonical Writers to Preserve

- `close_business_date`
- `closeBusinessDate`
- `runNightAudit` (run and exception sync only)
- `updateException` (warning flags only; do not mount; do not extend into source fixes)
- `open_folio_for_reservation` (Cashiering one-shot room charge)
- `post_folio_transaction`, `close_guest_folio`
- `post_order_room_charge`, `reverse_order_room_charge`
- `list_hotel_drawers` and hotel drawer open/close writers
- `check_in_hotel_reservation`, `check_out_hotel_reservation`, `mark_hotel_reservation_no_show`
- HK task, inspect, and discrepancy writers
- Room restriction and inventory writers
- `captureOtbSnapshotAfterClose` (analytics, fail-open)

---

## 15. Read Models to Reuse

- `resolvePropertyBusinessDate`, `getPropertyBusinessDate`, `loadProperty`
- `evaluateNa1Blockers`, `canEnableConfirm`, `remainingBlockerCount`
- `evaluateAudit` until Phase 0’s single list fully replaces the hidden gate; then it is a warning/finance reader, not a second close gate
- `listNightAuditRuns`, `getNightAuditRun`
- `list_hotel_drawers`
- FO arrival, in-house, and departure loaders that already resolve the house date
- Room inventory RPCs that coalesce `restaurants.business_date`
- Housekeeping readiness evaluator (call, do not copy)

---

## 16. Settings-Dependent Hold Points

Do not fake: audit window, day boundary, automatic rollover, approval required, lock during audit, blocker checklist JSON, permission-catalogue enforcement, recurring-charge rules, integration requirements, notification rules, tax, deposit-policy amounts.

Any later prompt that claims to “honor Settings” must name the runtime reader or mark the feature held.

---

## 17. Test Strategy

- Phase 0 contract tests: stale run, double close, null-date first close, blocker parity, no folio/reservation/room writes.
- Warning-only close allowed (Phase 2).
- Closed-run immutability (Phase 4).
- Finance fixture matches the documented `posted_at` rule and does not claim nightly expected revenue (Phase 5).
- Readiness test calls the evaluator or asserts the row is omitted (Phase 6).
- Blocking ignore still fails (Phase 7).
- Dual-lane SQL for the Phase 0 function replace.
- Do not run `npm run build` or the full suite as a requirement of this plan document.
- UI phases: authenticated browser smoke on `/restaurant/pms/night-audit`.

---

## 18. Browser Verification Contract

A UI phase is not PASS until authenticated smoke:

- No CatchBoundary
- No console runtime errors
- Canonical route `/restaurant/pms/night-audit`
- Legacy cashiering index still redirects
- Blockers disable Confirm close
- Owner/manager desktop can confirm only when the single blocker list is clear
- Receptionist cannot close
- Phone does not confirm
- No ignore, waive, retry, mark no-show, or integration health control
- History opens the run that was clicked
- After a non-production close, refresh shows the next house date once
- Links land in FO, Cashiering, or Housekeeping and do not post from Night Audit

Do not claim browser PASS from unit tests alone. Do not close a date on a property that is in real use.

---

## 19. Definition of Done

The Night Audit module is complete only when commissioned phases that are not held are implemented, the clock still moves only through `close_business_date`, the board and the SQL guard match, and Night Audit still does not post money or edit stays, rooms, or drawers.

Module COMPLETE remains **NO** until that bar. Holds (nightly posting, tax, company, integrations, approvals, checkpoints) can stay open without being called done. An earlier “date close is safe” acceptance must be named explicitly and must not be called module complete.

---

## 20. Deferred Register

See **Hold Register**. Also deferred as opportunistic, not Phase 0:

| Item | Reason | Revisit |
|---|---|---|
| Delete unmounted `night-audit-panels.tsx` | Dead UI | Phase 1 may leave the file if nothing imports it; do not revive it |
| Cashiering desk on calendar today | Owner module | Separate Cashiering commission |
| Reports `propertyToday` | Owner module | Separate reports commission |
| Public booking and create-reservation min date | Owner module | Separate reservations commission |
| Standalone POS business date | Separate product clock | Do not merge with the hotel clock in this plan |
| FO check-in/out date gate | FO | Separate FO commission |
| No-show client-supplied date | FO/Reservations | Separate commission |
| Ledger business-date stamp | Cashiering | Before any “authoritative day total” |

---

## 21. Recommended Execution Method

One coherent phase = one Cursor prompt.

| Phase | Prompt | Why |
|---|---|---|
| 0 | SINGLE | Clock safety and one blocker list |
| 1 | SINGLE | Shell and history link |
| 2 | SINGLE | Warnings on that board |
| 3 | SINGLE | Close UX on the hardened RPC |
| 4 | SINGLE | History, no new table |
| 5 | SINGLE | Labeled finance reads or omit totals |
| 6 | SINGLE | Operational reads; evaluator or omit |
| 7 | SINGLE | Exception display; ignore stays off |
| 8 | SINGLE | Summary report only |
| Hold | DO NOT IMPLEMENT | Missing owners or idempotency |

Do not create a prompt per blocker. Do not start Phase 5 expected-revenue or a posting step inside Phase 0.

---

## 22. Immediate Next Step

**First implementation action: Phase 0 — Close-Date Guard & Single Blocker Contract.**

Do not start a new Night Audit shell, reconciliation screens, or a recovery stepper on top of a close that can move the clock from a stale run.

Sequence:

1. Commission **Phase 0** (single prompt).
2. Then **Phase 1** control shell.
3. Then **Phase 2** pre-audit warnings.
4. Then **Phase 3** close proof and **Phase 4** history.
5. Then **Phase 5–8** only for data that already exists.
6. Do **not** post nightly charges from Night Audit.
7. Do **not** read Card 1 night-audit JSON or `pms_permissions` as the close policy.
8. Do **not** add `open_business_date`, a step table, or a Retry API.
9. Do **not** show tax, company, provider health, or an approval inbox.
10. Do **not** fix Cashiering, FO, or POS date readers inside a Night Audit prompt.

---

## Do Not Touch (protected)

- `open_folio_for_reservation` and `folio_transactions_room_charge_once`
- `post_folio_transaction`, `close_guest_folio`, hotel drawer writers
- `check_in_hotel_reservation`, `check_out_hotel_reservation`, `mark_hotel_reservation_no_show`
- Housekeeping task, inspection, discrepancy, and readiness evaluator implementations (call the evaluator; do not edit it in a Night Audit phase)
- Room inventory and restriction writers
- Restaurant `expected_cash` / `close_cashier_shift`
- Card 1 `business_date_config` save path
- POS order lifecycle
- Rate & Revenue pricing writers (OTB snapshot caller may stay fail-open)
- A new business-date table or a stored copy of the clock on each module

Phase 0 may replace the body of `close_business_date` only as specified in §5.

---

## Final validation (this document)

1. Audit accepted as PARTIAL FOUNDATION — ACTIONABLE GAPS — **yes**.
2. One clock: `restaurants.business_date` — **yes** (§1A.1).
3. Phase 0 is the stale-run guard and a single blocker contract — **yes**.
4. Close remains `close_business_date`; next date is `+ 1` in that transaction — **yes** (§1A.11).
5. Night Audit does not post money or edit source domains — **yes** (§1A.5, §1A.6).
6. Hotel drawer is `list_hotel_drawers`, not restaurant expected cash — **yes** (§1A.8).
7. Settings JSON and permission catalogue are not runtime — **yes** (§1A.9).
8. Exceptions stay derived; no fake resolve — **yes** (§1A.7).
9. Nightly posting, tax, company, integrations, queued approvals, and checkpoints are Hold — **yes**.
10. Seven product phases are coverage; engineering order does not follow UI order — **yes** (§10).
11. Cross-module calendar dates are out of scope for Night Audit prompts — **yes** (§1A.13).
12. Master rule recorded — **yes**: detect, classify, link, route; do not silently edit source data.
13. No application implementation in this change set — **yes** (this file only).
