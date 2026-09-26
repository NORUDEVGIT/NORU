# NORU PMS — FRONT OFFICE WORKSPACE IMPLEMENTATION PLAN

| Field | Value |
|---|---|
| **STATUS** | **PLAN ONLY** — not a Functional Spec, not authorised engineering, not implemented |
| **Basis** | Current local working tree + live FO workspace + `Noru_PMS_Front_Office_UI_UX_Design_Proposal.docx` + Front Office capability audit |
| **Date** | 2026-09-25 |
| **Module COMPLETE** | **NO** |
| **Default landing** | Room Rack + Calendar |
| **UI-01 Welcome** | **DEFERRED BY DESIGN / optional entry experience** — never the default landing |
| **Repository changes from this document** | This file only |

This document is the Cursor execution roadmap. It does not approve GitHub issues by itself. Do not implement from this file until a named engineering phase is explicitly commissioned.

---

## 1. Purpose

Front Office is the **operational desk** that coordinates check-in, in-house stay operations, post-check-in room moves, checkout, walk-in orchestration, and Front Office operational control.

Front Office is **not** a second reservation engine, availability engine, housekeeping engine, cashiering ledger, rate engine, guest-master engine, night-audit engine, or notification delivery engine.

**Front Office is the operational desk coordinating Reservation, Room & Inventory, Housekeeping, Cashiering, Rate & Revenue, Guest Profile, Night Audit and related modules.**

Functional coverage remains UI-01 through UI-118 (15 product phases). Engineering is grouped into **14 waves (Phase 0–13)** so related work ships together.

---

## 2. Locked Architecture

**Shared data does not mean shared ownership.**

Front Office **orchestrates** other modules. It does not replace them. Displaying a field does not make Front Office the persistence owner.

| Domain | Owns | Front Office role |
|---|---|---|
| Settings / Property Setup | Property configuration, business-date *rules*, CI/CO defaults, FO policies, rooms/property operational config, approval *rules*, preferences | Consume. Do not duplicate editors. |
| Reservations | Reservation lifecycle before check-in, stay records, pre-arrival amendments, booked room type, dates, commercial snapshot | Consume + invoke canonical reservation writers where still reservation-owned |
| Front Office | Check-in, in-house operations, post-CI room moves, checkout, walk-in orchestration, FO operational control | Own those workflows; write only through canonical FO / invoked domain writers |
| Room & Inventory | Physical rooms, types, availability, blocks, assignment eligibility, physical room state, occupancy compatibility | Consume. Do not create a second availability engine. |
| Housekeeping | Clean/dirty/inspected/readiness, HK task/state workflow | Consume readiness; route/coordinate; do not mutate HK state outside HK writers |
| Maintenance | Maintenance work orders and maintenance issues; OOS/OOO where architecture assigns it | Consume operational/maintenance status |
| Cashiering | Folios, deposits, payments, settlement, refunds/adjustments | Consume signals; invoke folio RPCs; never implement payment logic inside FO |
| Rate & Revenue | Rates, restrictions, pricing/repricing | Consume; invoke reprice for extend/early-dep/walk-in as needed |
| Guest Profile | Guest master, identity, contact, VIP, preferences/history | Capture/update only through Guest Profile contracts |
| Night Audit | Business date *rollover*, end-of-day validation, night audit process | Read business date; send unresolved operational signals; do not roll the date |
| Notifications | Templates, channels, delivery | Launch communications; consume history |
| Security / Audit | Roles, permissions, approvals, central audit policy | Consume gates; append stay history via existing stores |
| Reports | Central reporting | Consume catalogues/queries; do not duplicate a FO report engine |
| Groups & Blocks | Group room blocks / pickup | Consume for assignment eligibility; do not invent FO hold tables |

Protected engines (do not touch):

- Reservation priced create/amend engine
- Room Inventory availability engine
- HK task/state engine
- Cashiering ledger
- Rate engine
- Guest master engine
- Night Audit `close_business_date`
- Notifications delivery engine
- Central Security/Audit
- Current live Room Rack replacement

---

## 3. Current State

**Audit verdict (fixed):** PARTIAL FOUNDATION — ACTIONABLE GAPS. No blocker to continue incrementally on the live workspace.

### Route and workspace

| Item | Current truth |
|---|---|
| Canonical route | `/restaurant/pms/front-office` — `src/routes/restaurant/pms/front-office.tsx` |
| Workspace | `src/packages/pms/components/workspaces/front-office-workspace.tsx` |
| Chrome | `FrontOfficeChrome` → `PmsCommandChrome` (not `RoomInventoryChrome`) |
| Nav | `front-office-shell.ts`: `rack`, `arrivals`, `inhouse`, `departures`, `walkins`, `amendments`, `cancellations`, `noshows`, `exceptions` |
| Default | `FO_LANDING_NAV = "rack"` |
| URL | `?tab=` read on mount; **nav does not write URL** |
| Access | `getBookingsAccess` / `canManage`; otherwise `PermissionDeniedPanel` |
| Legacy | `/restaurant/rooms/arrivals` redirects; `/rooms/in-house` and `/rooms/departures` still standalone pages |
| Dead | `FrontOfficeSummary` unmounted |

### Tabs (all live, not placeholders)

| Tab | Backend trace |
|---|---|
| Room Rack + Calendar | `listOccupancy`, `listReservations`, `getFrontOfficeDashboard`, `listRoomRack`, `listFoExceptionFeeds`; writes via confirm sheet → `moveReservationRoom` / `changeStayDates` |
| Arrivals | `listArrivals`, `listFoStaySignals`, assign, check-in stepper, no-show stepper |
| In-House | `listInHouse`, move, dates, checkout stepper |
| Departures | `listDepartures`, checkout stepper |
| Walk-ins | `WalkInDialog` → `createReservation` + `startWalkInCheckIn`; `listWalkInsHistory` |
| Amendments | `fo-amendments.functions.ts` |
| Cancellations | `completeFoCancel` (+ fee path) |
| No-Shows | `completeFoNoShow` |
| Exceptions | derived `fo-exceptions` + `resolveDiscrepancy` |

Quick Action and Guest Search are live (`searchFrontOfficeStays`, stay picker → existing dialogs/steppers).

### Canonical FO writers (current)

| Action | Writer | Underlying |
|---|---|---|
| Check-in (gated, UI path) | `completeFoCheckIn` | RPC `check_in_hotel_reservation` |
| Checkout (gated, UI path) | `completeFoCheckOut` | RPC `check_out_hotel_reservation` |
| Post-CI room move | `moveReservationRoom` | RPC `move_hotel_reservation_room` |
| Stay dates / extend / shorten | `changeStayDates` | RPC `change_hotel_stay_dates` |
| Cancel (FO fee path) | `completeFoCancel` | Direct `hotel_reservations` update |
| No-show (FO fee path) | `completeFoNoShow` | RPC `mark_hotel_reservation_no_show` |
| Registration / deposit / key gates | `fo-check-in.functions.ts` | `guest_profiles`, `fo_checkin_progress`, folio RPCs |
| Walk-in start | `startWalkInCheckIn` | `fo_checkin_progress.walk_in_incomplete` |

Invoked, not FO-owned: `createReservation`, `assignReservationRoom`, `quoteStay`, `listAssignableRooms`, `getRoomTypeAvailability`, `setLateCheckout`, folio open/post/close, `resolveDiscrepancy`.

Legacy ungated wrappers still exported and unused by steppers: `checkInReservation`, `checkOutReservation`, `markNoShow`.

### Dependencies already wired

Business date via `usePropertyBusinessDate` (Night Audit column). Occupancy derived from rooms + checked-in stays. HK glyphs and CI readiness from Card2 policy. Cashiering folio slice at CI/CO. SET3 guest required fields on registration. SET1 FO fee defaults on cancel/no-show.

---

## 4. Preserve / Do Not Replace

Keep as operational base:

- Room Rack + Calendar as **default landing**
- Existing FO chrome and horizontal submodule tabs
- Canonical gated CI/CO/cancel/no-show steppers
- Existing stay/reservation side-sheet (`ReservationSideSheet`)
- Canonical business date (read-only from Night Audit)
- Occupancy / inventory / HK glyph wiring on the rack
- Reservation create/assign/quote integration
- Confirm-before-write rack drag/resize (`fo-rack-power`)
- Exceptions derived desk (FO-EX1 live types)
- `FoAuditViewer` over `hotel_reservation_history`
- `PmsCommandChrome` guest search / quick action pattern

Do **not** replace the rack because proposal images look different. Proposal images are **workflow references**. Visual language follows the **Reservation workspace**, not a from-scratch FO mockup.

Locked visual contract:

- NORU global chrome
- Warm cream/off-white workspace
- Dark brown / gold accent
- OPERATIONS eyebrow
- Clear workspace title
- Horizontal submodule tabs
- Compact KPI cards only where operationally useful (existing ops strip is allowed)
- Compact filters
- Central operational table/rack
- Right-side Quick View
- Dialogs/sheets for smaller actions
- Large overlays for complex flows
- No unnecessary permanent left sidebar
- Mobile Sheet where appropriate
- Same typography/tokens as Reservation module

---

## 5. Technical Debt Before Expansion

| Debt | Severity | Risk | Required Action | Phase |
|---|---|---|---|---|
| Dual CI writers (`completeFoCheckIn` vs `checkInReservation`) | HIGH | Ungated CI bypasses registration/deposit/key/readiness | Policy: UI + server call sites use gated writer only; deprecate/lock ungated export from production paths; update `FO_ACTIONS.write` names | 0 |
| Dual CO writers (`completeFoCheckOut` vs `checkOutReservation`) | HIGH | Checkout without folio settle/close gates | Same as CI | 0 |
| Dual no-show writers (`completeFoNoShow` vs `markNoShow`) | HIGH | No-show without fee/reason gates | Same as CI | 0 |
| Dual cancel paths (`completeFoCancel` vs `setReservationStatus`) | HIGH | Cancel without clearing `room_id` or FO fees | FO desk always `completeFoCancel`; booking desk cancel stays reservation-owned for pre-CI only; document the split in code comments/tests | 0 |
| `change_hotel_stay_dates` drizzle 4-arg vs supabase 5-arg (`0044`) | HIGH | Arrival-aware date change fails or silently ignores arrival | Verify applied DB; align drizzle copy if needed; no new semantic RPC | 0 |
| Walk-in `source` often remains `staff`; history unions `source=walk_in` | HIGH | Walk-in history incomplete; reporting lies | Set `source: "walk_in"` on FO create path; keep `startWalkInCheckIn` | 0 |
| `fo_guest_requests` vs `guest_service_history` | HIGH | Two request engines | Freeze FO table as traces-lite; Guest Services remains canonical runtime (Phase 6). Phase 0: document lock + tests forbidding SLA columns on `fo_guest_requests` | 0 (lock) / 6 (integrate) |
| `?tab=` not written on nav | MEDIUM | Refresh loses desk context | Write search param on tab change; keep rack default | 0 |
| No concurrency token on rack mutations | MEDIUM | Double-assign / lost update | Server re-read occupancy + stay version/`updated_at` before `moveReservationRoom` / `changeStayDates`; toast conflict. Prefer stay `updated_at` over new table | 0 |
| HK `guest_check_in` transition seeded but not applied in CI RPC | MEDIUM | Occupied-clean/dirty policy unused | Contract with HK owner: apply existing Card2 transition inside `check_in_hotel_reservation` **or** explicit FO call to HK writer. FO must not invent HK SQL | 0 (contract) / HK-owned apply |
| Legacy `/rooms/in-house` and `/rooms/departures` pages | LOW | Split UX, duplicate lists | Redirect to FO with `?tab=` like arrivals | 0 |
| Dead `FrontOfficeSummary` | LOW | Drift / accidental remount | Remove or keep unmounted; do not revive KPI dashboard | 0 |
| Early/late arrival badges empty; registration-card chip coming soon | LOW | Honesty slots | Leave until Phase 2 (ETA) / later registration doc | 2 / deferred |
| `FO_ACTIONS` still names ungated writes | MEDIUM | Future UI accidentally calls legacy | Rename to gated writers | 0 |
| History event types vs DB CHECK (ETA/late checkout) | MEDIUM | History insert fail | Confirm constraint includes `expected_arrival_updated` / `late_checkout_updated` before FO late-CO wrap | 0 / 4 |
| Chrome vs Reservation `RoomInventoryChrome` | COSMETIC | Visual inconsistency | Token/eyebrow/filter alignment only; keep FO tabs | 1 |

No unrelated repo-wide cleanup.

---

## 6. Cross-Module Dependency Map

| Module | Front Office Consumes | Front Office Sends | Owner | Current Status | Gap |
|---|---|---|---|---|---|
| Settings | Identity, timezone, CI/CO times, fees, guest rules, policies | None (read-only) | Property Setup | PARTIAL consume | Admin views (Phase 13); early/late clocks unused |
| Reservations | Stays, assign, create, quotes, amend context, history | Status transitions via FO writers; walk-in create | Reservations | LIVE | Walk-in source; late CO owned here |
| Room & Inventory | Rooms, types, availability, eligibility, OOO/OOS | Assignment/move via existing RPCs | Room & Inventory | LIVE | FO must not write `hotel_rooms.status` |
| Housekeeping | `housekeeping_status`, readiness policy, discrepancies | Checkout already triggers dirty + task; CI transition unused | Housekeeping | PARTIAL | `guest_check_in`; FO→HK request routing |
| Maintenance | `maintenance_status` / OOO-OOS as room status | None | Maintenance / Rooms | LIVE read | No FO maintenance ticket UI |
| Cashiering | Folio, balance, deposit, payment, close | Open/post/close via RPCs; cashier shift required | Cashiering | LIVE desk slice | Refunds stay Cashiering; walk-in guarantee |
| Rate & Revenue | `quoteStay`, snapshots, restrictions | Date change currently **no reprice** | Rate & Revenue | PARTIAL | Invoke reprice on extend/early-dep |
| Guest Profile | Search, profile fields, SET3 rules, VIP | Registration updates via guest columns | Guest Profile | PARTIAL | Duplicate detection; create-in-walk-in |
| Guest Services | Card4 types (settings); `guest_service_history` unused by FO | `fo_guest_requests` only | Guest Services / Guests | SPLIT | Phase 6 consume GS engine |
| Night Audit | `restaurants.business_date` | Unresolved arrivals/deps/overstays already NA-read | Night Audit | LIVE date | No FO close handshake UI until Phase 11 |
| Notifications | Card4 event catalogue | Checkout email (Resend) only | Notifications | PARTIAL | Chrome coming soon; no Card4 dispatch |
| Security/Audit | Role gates; `pms_approval_rules` unused | `hotel_reservation_history` | Security | PARTIAL | No `pms_approval_requests` |
| Reports | Escape nav to `/restaurant/pms/reports` | Dashboard counts reused | Reports | PARTIAL | Dedicated FO report windows |
| Groups & Blocks | Block inventory / pickup constraints | None from FO desk | Groups | LIVE elsewhere | UI-07 is consume/link, not FO hold |

---

## 7. Settings / Property Setup Master Data Contract

| Master Data | Settings Source | Front Office Use | Current Integration | Planned Work |
|---|---|---|---|---|
| Property identity | Card1 / SET1 | Header, Welcome-if-ever | Chrome/shell | Consume; optional UI-01 only |
| Timezone | Card1 | Business/local time, rack dates | Used with business date | Keep |
| Business date | Card1 config + `restaurants.business_date` | Desk “today”, lists, rack ops strip | `usePropertyBusinessDate` | Never roll in FO |
| Check-in / check-out times | SET1 columns | Early/late presentation, late CO default | Stored; FO exceptions treat early/late as coming soon | Phase 2/4 consume for display + late CO |
| Early check-in policy | SET1 flags/fees/needs_approval + Card1 text | Arrival exception / CI override | Not in CI stepper | Phase 2 display + role gate; approval inbox only if Phase 8 |
| Late checkout policy | SET1 + Card1 text | Late CO workflow | `setLateCheckout` in Arrivals-Departures | Phase 4 FO wrap |
| Cancel / no-show fees | `fo-fee-defaults` on restaurants | Cancel/no-show steppers | LIVE | Keep; Settings remains editor |
| Rooms | Card2 / Rooms | Rack rows, QV, assign | `listOccupancy` | Room QV read model |
| Room types | Card2 | Filters, assign, walk-in | LIVE | Keep |
| Buildings / floors | Card2 hierarchy | Rack grouping | Rooms have floor; rack grouping absent | Phase 1 grouping |
| Occupancy / capacity | Room type / room | Assign/move/upgrade | Amendments capacity checks | Keep |
| Room / HK / maintenance policy | Card2 + inventory rules | Readiness, illegal rack drops | `evaluateRoomReadinessWithPolicy`, `fo-rack-power` | Phase 0 HK CI contract; Phase 1 readiness queue |
| Guest required fields | SET3 `pms_guest_profile_rules` | CI registration | `guestCreateBlocked` | Phase 2 completeness UX |
| Payment / guarantee defaults | SET1 deposit_* | CI deposit; walk-in guarantee | CI Policy A; walk-in skips guarantee | Phase 5 wrap Cashiering |
| Service types | Card4 `pms_guest_service_types` | Guest services | FO uses `fo_service_catalogue` / FO requests | Phase 6 Card4 + GS engine |
| Department / SLA | Card5 | Assignment/SLA | Config only | Phase 6 consume; no FO SLA table |
| Approval rules | Card7 `pms_approval_rules` | Discount/rate/upgrade/late CO | Unused by FO | Phase 8 only after request table |
| Communication defaults | Card4 events/templates | Arrival/IH/dep messages | Chrome coming soon | Phase 9 |
| Operational preferences | Card1/Card8 | Desk prefs, offline policy | Policy only | Phase 13 read-only; offline deferred |

---

## 8. Front Office Read/Write Model Strategy

### Read models

Operational aggregation for rack, lists, Room Quick View, exception desk, FO activity. Prefer server functions that **join existing tables**. No new occupancy table. Occupancy remains derived from `hotel_rooms` + `hotel_reservations` (checked-in).

### Writers

Only canonical domain writers (section 12). FO steppers may **gate then call** those writers. Do not add third CI/CO RPCs.

### Orchestration

FO coordinates multi-module flows (walk-in = create + progress + CI; checkout = folio + stay RPC + HK side effects already in RPC). Orchestration lives in FO `*.functions.ts`, not in React.

### History

Reuse `hotel_reservation_history`, HK history, cashiering folio history, guest events. Do not create a second FO audit log. Unified history UI is a **read model**.

**No new table merely because a UI exists.**

---

## 9. Engineering Roadmap

Fourteen engineering waves (Phase 0–13). Product phases 1–15 remain the functional coverage map. Grouping is justified because:

- Core desk (arrivals through no-show) is already live; remaining work is gap-close and wrapping, not greenfield modules.
- UI-02–10 share one rack surface.
- Reports (product phase 11) and history (product phase 12) share the same stores — one engineering wave.
- Approvals, comms, shift, offline, admin are dependency-gated and must not inflate early waves.

UI-01 is **not** an engineering phase. It is deferred.

---

## Phase 0 — Foundation Safety & Debt

### Functional Scope

Make the live desk safe to extend: one writer per sensitive action, walk-in honesty, URL addressability, mutation concurrency, HK CI contract, legacy route redirects.

### UI Coverage

None of UI-01–118 as new screens. Enables all later UIs.

### Existing Capability Reused

All current gated steppers, RPCs, `fo-rack-power` confirm-before-write.

### Backend Work

- Lock production paths to `completeFoCheckIn` / `completeFoCheckOut` / `completeFoNoShow` / `completeFoCancel`.
- Stop FO UI from calling `checkInReservation` / `checkOutReservation` / `markNoShow`; mark them legacy (test lock).
- Confirm `change_hotel_stay_dates` 5-arg is the live RPC; align drizzle artifact if it is documentation-only drift.
- Walk-in `createReservation` payload: `source: "walk_in"`.
- Pre-write occupancy/stay freshness check on move/date (conflict error, no new table if `updated_at` exists).
- Agree HK `guest_check_in` apply path (HK-owned change).
- Tests: source locks, cancel path matrix, walk-in source, tab search param.

### Frontend Work

- Tab change writes `?tab=` (and reads it).
- Redirect `/rooms/in-house` and `/rooms/departures` → FO with tab.
- Do not redesign chrome.

### Database / Migration Work

**None expected** unless drizzle/supabase RPC copies must match (documentation/alignment only). No new tables. HK CI apply is an existing RPC edit owned with Housekeeping — only if that contract is commissioned in this phase.

### Settings Dependencies

None new.

### Cross-Module Dependencies

Reservations (cancel split), Housekeeping (CI transition), Inventory (concurrency re-read).

### Ownership Risks

Do not “fix” cancel by routing booking-desk cancel through FO fees. Do not patch HK status from FO SQL.

### Tests Required

Contract tests on writer names; cancel/no-show/CI/CO source locks; walk-in source; URL `validateSearch`; rack conflict unit tests; redirect tests.

### Browser Verification

Open FO, switch tabs, refresh — tab preserved. Check-in/out/cancel/no-show still complete. Rack drag still confirm-gated. No CatchBoundary.

### PASS Criteria

- One documented canonical writer per FO action in section 12 is used by live UI.
- Walk-in creates `source=walk_in`.
- `?tab=` round-trips.
- Legacy in-house/departures redirect.
- Dual-writer tests fail if ungated functions return to UI.
- Rack still default landing.

### Explicitly Deferred

Room QV, visual Reservation-token polish, reprice, guest services, approvals.

**Cursor prompt:** **SINGLE PROMPT** — small, mechanical, high leverage. No UX expansion in the same prompt.

---

## Phase 1 — Room Rack & Room Operations

### Functional Scope

Layer Room Quick View, assignment/move entry, readiness coordination, operations queue, room-ops history, rack grouping/horizon/filter/URL state **onto the existing rack**.

### UI Coverage

UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-09, UI-10

### Existing Capability Reused

`room-rack-calendar.tsx`, `listOccupancy`, `listReservations`, `listRoomRack`, `assignReservationRoom`, `moveReservationRoom`, `fo-rack-power`, exceptions desk, `FoAuditViewer` / `listReservationAmendments`, Room Inventory restriction writers (for UI-06 **consume**), Groups blocks (UI-07 **consume**).

### Backend Work

- Room Quick View read model: room master, status, HK, maintenance, current stay, recent history for that room/stay.
- Optional filter query params if cheap (`horizon`, `focusDate`) — do not block QV.
- Do not add FO room-status or FO room-block writers.

### Frontend Work

- Room row click → Room Quick View (new sheet, not stay sheet).
- Stay bar click → existing Stay Quick View.
- Reservation-layout tokens: OPERATIONS eyebrow, cream workspace, compact filters (no mockup rebuild).
- Horizon include **3-day** if cheap (`1/3/7/14`; 30 may remain).
- Floor/type grouping.
- Place assign/move/readiness CTAs that call existing dialogs.
- UI-06: deep-link/open Rooms/HK restriction actions — do not duplicate.
- UI-07: show active blocks impact + link to Groups/Inventory — do not create FO holds.
- UI-08/09: readiness + waiting-for-room from existing exception/HK feeds.
- UI-10: filter activity by room/assignment/move.

### Database / Migration Work

**None.** Read model only.

### Settings Dependencies

Room hierarchy (floors/buildings), HK/maintenance policies (display).

### Cross-Module Dependencies

Room & Inventory, Housekeeping, Maintenance, Reservations, Groups, History.

### Ownership Risks

Do not let Room QV “Set OOO” write `hotel_rooms` except via Rooms/Maintenance canonical functions. Do not replace rack.

### Tests Required

Room QV payload honesty; grouping helpers; horizon includes 3; click routing (room vs stay); no write on QV open; inventory FO-access tests remain green.

### Browser Verification

Rack default. Room click opens room QV; stay click opens stay QV. Filters/grouping. Drag/drop still confirm. Mobile: QV as Sheet, no drag. Existing tabs work. No overlay-on-overlay trap.

### PASS Criteria

- Rack not rewritten.
- UI-02 remaining gaps (3-day, grouping, URL) closed or explicitly leftover-deferred.
- UI-03 Room QV live from real data.
- UI-04/05 reachable from QV using existing writers.
- UI-06/07 clearly consume other modules.
- UI-08/09 operational from derived feeds.
- UI-10 history filterable for assignment/move events.

### Explicitly Deferred

New FO block table; FO-owned status engine; drag concurrency UI beyond Phase 0 conflict errors.

**Cursor prompt:** **SINGLE PROMPT** if Phase 0 is merged. Split only if Room QV read model proves large.

---

## Phase 2 — Arrivals & Check-In

### Functional Scope

Arrival Quick View completeness, guest verification/registration UX, assignment at CI, guarantee/deposit review, keep gated completion.

### UI Coverage

UI-11, UI-12, UI-13, UI-14, UI-15, UI-16, UI-17, UI-18, UI-19

### Existing Capability Reused

`listArrivals`, `FoCheckInStepper` (steps stay/registration/deposit/key/complete), `saveCheckInRegistration`, SET3 rules, `assignReservationRoom`, folio deposit, exceptions unassigned/payment/unavailable, `completeFoCheckIn`.

### Backend Work

- Arrival QV: reuse stay detail + CI context (`getCheckInContext`) — extend read if needed (ETA, deposit signal).
- Verification: required-field + ID completeness; **do not** build a new duplicate-merge engine — call Guest Profile duplicate helpers if they exist, else show “open Guest Profile” CTA.
- Registration remains `fo_checkin_progress.registration_snapshot` unless legal doc is later required.
- No new CI RPC.

### Frontend Work

- Arrival QV from arrivals tab / sheet.
- Stepper UX aligned with Reservation overlays (large overlay OK).
- Surface SET1 early-CI policy as warning, not a second engine.
- Early/late badges only if ETA (`expected_arrival_at`) is trusted — else keep coming soon.

### Database / Migration Work

**None** unless Guest Profile already has duplicate APIs. Legal registration document = deferred foundation.

### Settings Dependencies

SET3 guest rules, SET1 deposit/early CI, CI time.

### Cross-Module Dependencies

Guest Profile, Cashiering, Room Inventory, Housekeeping readiness, Reservations assign.

### Ownership Risks

Do not store identity documents outside Guest Profile columns. Do not skip gates.

### Tests Required

Existing `fo-check-in.test.ts` extended; SET3 block still enforced; assign-at-CI still uses `assignReservationRoom`.

### Browser Verification

Arrivals list → QV → CI overlay → complete in-house. Unassigned blocked until assign. Deposit waive requires manager. Room not ready blocked.

### PASS Criteria

UI-11 remains complete. UI-12–17 gap-closed or explicitly Guest-Profile-blocked. UI-18/19 still `completeFoCheckIn`. Pending status still cannot CI.

### Explicitly Deferred

Duplicate merge UI; printed registration card; early/late auto-no-show.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 3 — In-House Operations

### Functional Scope

Stay management overlay, post-CI move, extension and early departure with **rate impact via Rate engine**, guest update via Guest Profile, requests/traces direction (lite until Phase 6), notes, in-house exceptions.

### UI Coverage

UI-20, UI-21, UI-22, UI-23, UI-24, UI-25, UI-26, UI-27, UI-28, UI-29

### Existing Capability Reused

`listInHouse`, `FoAmendSheet`, `moveReservationRoom`, `upgradeReservationType`, `changeStayDates`, `ReservationSideSheet`, `createGuestRequest`, exceptions overstay.

### Backend Work

- Extension/early-dep **orchestration**: `changeStayDates` + invoke existing Rate reprice/amend-priced path (do not reimplement pricing).
- Guest update: Guest Profile update functions, not a FO guest table.
- UI-27: until Phase 6, FO requests remain open/done traces; do not add SLA columns.
- UI-28: stay notes via existing reservation notes/special requests; **alerts entity only if product insists** (small schema, later).

### Frontend Work

- In-house QV + stay management overlay (Reservation detail language).
- Dedicated move overlay wrapping `RoomMoveDialog`.
- Extension/early-dep impact review (availability + rate honesty).
- Exception CTAs from in-house list.

### Database / Migration Work

**None** for core. Optional stay-alerts table only if UI-28 cannot use notes — prefer notes first.

### Settings Dependencies

Late/early policies not required for date change; rates/restrictions.

### Cross-Module Dependencies

Rate & Revenue, Room Inventory, Guest Profile, Cashiering (folio impact display), Guest Services (Phase 6).

### Ownership Risks

Do not use `moveReservationRoom` for type upgrades (`upgradeReservationType` remains). Do not reprice inside FO math.

### Tests Required

`fo-amendments` + date-change + rate-impact honesty; move same-type; upgrade path.

### Browser Verification

In-house → move → room changes. Extend departure → availability fail toast. Early dep. Guest phone update appears on profile. Rack bar updates.

### PASS Criteria

UI-20 complete. UI-23 uses `moveReservationRoom`. UI-24/25 show rate impact or explicit “rate unavailable”. UI-27 does not become SLA. UI-29 uses derived exceptions.

### Explicitly Deferred

Full traces/SLA (Phase 6); persisted alerts if notes suffice.

**Cursor prompt:** **BACKEND + FRONTEND SPLIT** only if reprice wiring is large; otherwise **SINGLE PROMPT**.

---

## Phase 4 — Departures & Check-Out

### Functional Scope

Departure QV, prep checklist (outstanding FO/GS/HK flags), folio/balance, settlement via Cashiering, gated checkout, late checkout wrap, departure/no-show exceptions.

### UI Coverage

UI-30, UI-31, UI-32, UI-33, UI-34, UI-35, UI-36, UI-37, UI-38, UI-39

### Existing Capability Reused

`listDepartures`, `FoCheckOutStepper`, `getReservationFolio`, `postCheckOutPayment`, `overrideCheckOutSettlement`, `closeFolioAtCheckout`, `completeFoCheckOut`, `setLateCheckout`, `completeFoNoShow`, checkout HK dirty in RPC.

### Backend Work

- Departure prep read: open FO requests, folio balance, late-CO flags, HK status.
- FO entry for `setLateCheckout` (Reservations remains writer owner).
- Confirm history event CHECK includes `late_checkout_updated`.
- Refunds: CTA to Cashiering only.

### Frontend Work

- Departure QV + checkout overlay (already exist; complete prep panel).
- Late checkout sheet wrapping `setLateCheckout` + SET1 policy display.
- Settlement UI remains FO orchestration of cashiering posts.

### Database / Migration Work

**None** if 0098 columns exist. No FO money tables.

### Settings Dependencies

`late_checkout_*`, `check_out_time`, fee flags.

### Cross-Module Dependencies

Cashiering, Housekeeping, Reservations (late CO), Night Audit (unresolved deps).

### Ownership Risks

Do not close folio in FO SQL. Do not change HK except via checkout RPC / HK writers.

### Tests Required

Existing `fo-check-out.test.ts`; late CO wrap tests; override still manager-only.

### Browser Verification

Departures → QV → checkout overlay → room vacant/dirty. Open balance blocks without override. Late CO sets until-time. No-show from arrivals still works.

### PASS Criteria

UI-30 complete. UI-33–37 still Cashiering-owned money. UI-37 still `completeFoCheckOut`. UI-38 live via existing writer. UI-34 refunds not implemented in FO.

### Explicitly Deferred

Late CO persisted approval (Phase 8); GS outstanding until Phase 6.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 5 — Walk-In Operations

### Functional Scope

Dedicated FO walk-in **orchestration overlay** (not New Reservation page). Guest search/create, stay request, availability, rates, room assignment, guarantee via Cashiering, immediate CI, completion/audit. **Still one Reservation engine.**

### UI Coverage

UI-40, UI-41, UI-42, UI-43, UI-44, UI-45, UI-46, UI-47, UI-48, UI-49

### Existing Capability Reused

`WalkInDialog` pieces, `listGuests`, guest create (Guest Profile), `getRoomTypeAvailability`, `quoteStay`, `listAssignableRooms`, `createReservation`, `startWalkInCheckIn`, `FoCheckInStepper`, Phase 0 `source=walk_in`.

### Backend Work

- FO orchestrator function: validate room required, source walk_in, optional guarantee/deposit then `startWalkInCheckIn`.
- **No** `createWalkInReservation` RPC.
- Guest create uses Guest Profile create.

### Frontend Work

- Walk-in tab: workspace + overlay steps (search → stay → avail/rate/room → guarantee → CI).
- History list remains.
- Do not send users to `/bookings/new` for walk-in.

### Database / Migration Work

**None.**

### Settings Dependencies

Deposit/guarantee defaults, rates, guest required fields.

### Cross-Module Dependencies

Reservations create, Rate quote, Inventory assignable rooms, Guest Profile, Cashiering, CI stepper.

### Ownership Risks

Do not relax room-required FO rule. Do not skip CI gates after create.

### Tests Required

Existing walk-in honesty tests (`createWalkInReservation` forbidden); source walk_in; room required; guarantee step posts or waives via CI deposit path.

### Browser Verification

Walk-in overlay end-to-end → in-house. Create guest then stay. Availability zero blocks. Rate selected. Check-in stepper continues at registration.

### PASS Criteria

No second booking engine. UI-47 uses Cashiering. Completion audited on reservation history. Tab is not history-only.

### Explicitly Deferred

Unpriced walk-in; online walk-in.

**Cursor prompt:** **SINGLE PROMPT** after Phase 0 source fix.

---

## Phase 6 — Guest Services Integration

### Functional Scope

FO launches and tracks **Guest Services** transactions (`guest_service_history` + Card4 types). Stop expanding `fo_guest_requests` into an SLA engine.

### UI Coverage

UI-50, UI-51, UI-52, UI-53, UI-54, UI-55, UI-56, UI-57, UI-58

### Existing Capability Reused

Guests module service request create/update; Card4 types/pricing; Card5 dept map; FO amend “guest request” as migrate-or-wrap.

### Backend Work

- FO list/create/complete/cancel/escalate **via Guest Services functions**.
- Map stay context (`reservation_id`) into GS payload.
- `fo_guest_requests`: freeze schema; optional read-adapter for old rows; no new SLA columns.

### Frontend Work

- Guest Services workspace **inside FO chrome** (tab or overlay) consuming GS UI patterns, Reservation visual language.
- In-house/arrival CTAs open GS request, not a second form.

### Database / Migration Work

**None** if `guest_service_history` is production. No FO SLA tables. Do not create `guest_service_requests` if tests forbade it in Card4.

### Settings Dependencies

Card4 service types, Card5 departments/SLA **as display/assignment defaults**.

### Cross-Module Dependencies

Guest Services / Guest Profile, Housekeeping (route only), Notifications (later).

### Ownership Risks

FO must not write HK tasks as a side door. Card5 must not be treated as runtime.

### Tests Required

FO does not insert `fo_guest_requests` for new typed services; GS create from FO stay; Card5 still does not write FO table.

### Browser Verification

Create request from in-house → appears in GS + FO list. Complete/cancel with reason. History filter.

### PASS Criteria

One canonical runtime: `guest_service_history`. UI-50–58 covered or honestly blocked on GS gaps (escalation/SLA clock).

### Explicitly Deferred

Building a GS engine if Guest module cannot assign/SLA yet — then FO workspace shows GS as dependency-blocked, still no second engine.

**Cursor prompt:** **BACKEND + FRONTEND SPLIT** if GS APIs need FO-facing read models; else **SINGLE PROMPT**.

---

## Phase 7 — FO Exceptions & Control

### Functional Scope

Promote the derived exceptions tab to the control workspace: contextual resolution, guest-data exceptions via Profile, role-based override with audit. **No new generic exception engine.**

### UI Coverage

UI-59, UI-60, UI-61, UI-62, UI-63, UI-64, UI-65, UI-66, UI-67

### Existing Capability Reused

`fo-exceptions.ts` live types, `listFoExceptionFeeds`, `listFoStaySignals`, CTAs assign/move/CI/CO/folio/rack/resolve.

### Backend Work

- Extend derived types only from real signals (guest-data incompleteness from SET3 + profile; departure blockers from folio/HK).
- Override remains role + `hotel_reservation_history` (existing waive/override). No `resolved` flag on a fake table.

### Frontend Work

- Exception workspace layout (Reservation language).
- Resolution = navigate to underlying fixer, then row disappears when source is fixed.

### Database / Migration Work

**None.**

### Settings Dependencies

SET3, deposit policy, HK policy.

### Cross-Module Dependencies

HK discrepancy, Cashiering folio, Reservations, Guest Profile.

### Ownership Risks

Do not persist “resolved” without source change.

### Tests Required

Honesty tests (no invented early/late counts); permission denied ≠ coming soon.

### Browser Verification

Fix unassigned → row gone. Resolve discrepancy via HK writer. Override still manager.

### PASS Criteria

UI-59 is the exceptions tab, upgraded not replaced. UI-67 is not an approval inbox.

### Explicitly Deferred

Early/late if ETA still untrusted; approval workflow (Phase 8).

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 8 — Approvals & Authorization

### Functional Scope

Persisted approval request/pending/approve/reject **only after** Security builds `pms_approval_requests` (or equivalent). Until then this phase is **not started**.

### UI Coverage

UI-68, UI-69, UI-70, UI-71, UI-72, UI-73, UI-74, UI-75, UI-76

### Existing Capability Reused

`pms_approval_rules` catalogue; FO role gates; late_checkout_needs_approval flag.

### Backend Work

**NEW DOMAIN FOUNDATION (Security-owned):** request table, status, approver, reason, before/after, audit. FO submits requests for discount/rate override/upgrade/late CO/extension/refund/exceptional move **if rules say so**.

### Frontend Work

FO approval workspace consuming Security APIs. Refund approval launches Cashiering, does not post refunds.

### Database / Migration Work

**Required for this phase** — Security/Audit owned, not FO-invented. Do not start FO UI without it.

### Settings Dependencies

Card7 rules.

### Cross-Module Dependencies

Security, Rate, Cashiering, Reservations.

### Ownership Risks

Do not treat `pms_approval_rules` as workflow. Do not store approvals only in FO.

### Tests Required

Cannot approve own request if policy forbids; FO cannot bypass rule when rule.active.

### Browser Verification

Request → pending → approve → FO action proceeds; reject leaves stay unchanged.

### PASS Criteria

UI-68–76 live **or** phase remains deferred with role gates documented.

### Explicitly Deferred

Entire phase until foundation exists.

**Cursor prompt:** **BACKEND + FRONTEND SPLIT** (foundation first).

---

## Phase 9 — Communication

### Functional Scope

FO communication workspace that **dispatches Card4/Notifications** events (arrival, in-house, departure, internal alert) and reads history. No FO mailer.

### UI Coverage

UI-77, UI-78, UI-79, UI-80, UI-81, UI-82, UI-83

### Existing Capability Reused

Card4 events (`pre_arrival`, `vip_arrival`, `checkout_completed`, …); checkout Resend email; Guest Profile comms if any.

### Backend Work

FO “send” = Notifications API. Remove `notificationsComingSoon` when dispatch is real.

### Frontend Work

Workspace + templates picker + history. Keep chrome honest until then.

### Database / Migration Work

**None** in FO. Use Notifications stores.

### Settings Dependencies

Card4 templates/channels.

### Cross-Module Dependencies

Notifications, Guest Profile contact, Night Audit none.

### Ownership Risks

No FO `fo_messages` table.

### Tests Required

Coming soon removed only when send path exists; no write on failed channel.

### Browser Verification

Send arrival message; history row; checkout email still works.

### PASS Criteria

UI-77–83 consume Notifications or remain deferred.

### Explicitly Deferred

WhatsApp unless Notifications supports it.

**Cursor prompt:** **SINGLE PROMPT** after Notifications send API is usable; else **DEFER**.

---

## Phase 10 — Reports + History

### Functional Scope

FO report windows and unified history search **over existing stores and central Reports**. Product phases 11 and 12 in one wave.

### UI Coverage

UI-84, UI-85, UI-86, UI-87, UI-88, UI-89, UI-90, UI-91, UI-92, UI-93, UI-94, UI-95, UI-96, UI-97, UI-98, UI-99, UI-100, UI-101

### Existing Capability Reused

`pms-reports-workspace` occupancy/FO activity, `getFrontOfficeDashboard`, `listReservationAmendments`, `FoAuditViewer`, Card7 report catalogue.

### Backend Work

Filtered read models / report queries in Reports module (preferred) or FO-thin wrappers calling the same queries. Walk-in filter = `source=walk_in`. Room move = `event_type=room_moved`.

### Frontend Work

FO Reports + History tabs or overlays; export if Reports already exports.

### Database / Migration Work

**None.**

### Settings Dependencies

Card7 catalogue/permissions.

### Cross-Module Dependencies

Reports, Audit history, Guest Services (UI-92).

### Ownership Risks

Do not copy dashboard SQL into a new FO warehouse.

### Tests Required

Filters; permission; walk-in source honesty after Phase 0.

### Browser Verification

Each report returns live rows or empty honest state. History detail opens event payload. Rack/lists unchanged.

### PASS Criteria

UI-84–101 are windows, not new engines. UI-100 empty until Phase 8.

### Explicitly Deferred

Pixel-perfect catalogue items until Reports export exists.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 11 — Shift & Daily Control

### Functional Scope

FO shift/handover/checklist **after** Cashiering shift and Night Audit contracts are explicit. Do not merge with business date or cashier session.

### UI Coverage

UI-102, UI-103, UI-104, UI-105, UI-106, UI-107, UI-108, UI-109

### Existing Capability Reused

`cashier_shifts`, Night Audit unresolved lists, FO exceptions, open GS requests.

### Backend Work

**NEW DOMAIN FOUNDATION (FO-owned session, not cashier shift):** shift open/handover/close with checklist snapshots **or** a view-only console that composes NA + cashier + exceptions without a new table if that meets the product.

Prefer **compose-first** (no table) if checklist is “open items from other modules”. Add `fo_shifts` only if handover notes/sign-off must persist.

### Frontend Work

Shift workspace: status, pending tasks (derived), guest issues, unresolved rooms, cash handover **link to Cashiering**, daily checklist, close.

### Database / Migration Work

Only if persist sign-off is required. Not implied by UI existence.

### Settings Dependencies

Card1 blockers (`open_cashier_shifts`, etc.).

### Cross-Module Dependencies

Night Audit, Cashiering, Housekeeping, Exceptions.

### Ownership Risks

Do not call cashier shift “FO shift”. Do not roll business date.

### Tests Required

Close blocked when NA/cashier blockers configured; no date rollover from FO.

### Browser Verification

Open FO shift (or dashboard) shows live open items. Close blocked on open folio/unresolved arrivals if configured.

### PASS Criteria

Four concepts remain separate: business date, NA close, FO shift, cashier shift.

### Explicitly Deferred

If product accepts derived checklist only, skip `fo_shifts` table.

**Cursor prompt:** **BACKEND + FRONTEND SPLIT** if new table; **SINGLE PROMPT** if compose-only.

---

## Phase 12 — Offline & Sync

### Functional Scope

Controlled FO offline operation.

### UI Coverage

UI-110, UI-111, UI-112, UI-113

### Existing Capability Reused

Card8 offline **policy only**. Tests forbid FO write RPCs in an offline runtime.

### Backend Work

**None in FO.** Requires platform offline foundation.

### Frontend Work

None until platform exists. Do not build IndexedDB FO queues.

### Database / Migration Work

Platform queue — not FO.

### Settings Dependencies

Card8 policy display in Phase 13.

### Cross-Module Dependencies

Platform.

### Ownership Risks

FO-only local queue would diverge from server writers.

### Tests Required

Keep Card8 tests: no FO RPC in offline runtime.

### Browser Verification

N/A until platform.

### PASS Criteria

Phase remains **DEFERRED**.

### Explicitly Deferred

Entire phase.

**Cursor prompt:** **DO NOT IMPLEMENT.**

---

## Phase 13 — Administration Views

### Functional Scope

Read-only FO windows over Settings: configuration, permissions, action control visibility, audit configuration visibility, operational preferences. **No duplicate editors.**

### UI Coverage

UI-114, UI-115, UI-116, UI-117, UI-118

### Existing Capability Reused

SET1, fo-fee-defaults, roles, Card7 audit policy, Card8 offline policy, Card1 ops.

### Backend Work

Read aggregations of existing settings.

### Frontend Work

FO admin tab/overlay with links to Property Setup for edits.

### Database / Migration Work

**None.**

### Settings Dependencies

All of section 7.

### Cross-Module Dependencies

Settings, Security.

### Ownership Risks

No FO copy of fee defaults.

### Tests Required

Deep-link to Settings; FO cannot POST settings except existing fee editor ownership (stay in Settings).

### Browser Verification

View policies; Edit navigates to Settings; FO desk unchanged.

### PASS Criteria

UI-114–118 are visibility, not a second Property Setup.

### Explicitly Deferred

Editable FO preferences that do not already exist in Settings.

**Cursor prompt:** **SINGLE PROMPT**.

---

## 10. UI-01–UI-118 Traceability Matrix

Implementation types: REUSE | FRONTEND ONLY | BACKEND READ MODEL | EXISTING WRITER WRAP | NEW FO ORCHESTRATION | NEW DOMAIN WRITER | SMALL SCHEMA EXTENSION | NEW DOMAIN FOUNDATION | SETTINGS INTEGRATION | CROSS-MODULE INTEGRATION | DEFERRED

| UI | Name | Engineering Phase | Existing Status | Implementation Type | Dependency | Final Target |
|---|---|---|---|---|---|---|
| UI-01 | Front Desk Welcome | Deferred register | ABSENT | DEFERRED | None | Optional entry only; Rack remains home |
| UI-02 | Room Rack / Calendar | 1 | PARTIAL | FRONTEND ONLY | Phase 0 URL | Complete on existing rack |
| UI-03 | Room Quick View & Operations | 1 | PARTIAL | BACKEND READ MODEL | Rooms/HK | Room sheet live |
| UI-04 | Room Assignment & Reassignment | 1 | PARTIAL | EXISTING WRITER WRAP | `assignReservationRoom` | Overlay from rack/QV |
| UI-05 | Room Move | 1 | PARTIAL | EXISTING WRITER WRAP | `moveReservationRoom` | Overlay from rack/QV |
| UI-06 | Room Status Operations | 1 | ABSENT in FO | CROSS-MODULE INTEGRATION | Rooms/HK/Maintenance | Consume, no FO writer |
| UI-07 | Room Block / Hold | 1 | ABSENT in FO | CROSS-MODULE INTEGRATION | Groups/Inventory | Consume/link |
| UI-08 | Room Readiness & Coordination | 1 | PARTIAL | EXISTING WRITER WRAP | HK readiness | Queue + route |
| UI-09 | Room Operations Queue | 1 | PARTIAL | BACKEND READ MODEL | Exceptions/HK | Derived queue |
| UI-10 | Room Operations History | 1 | PARTIAL | BACKEND READ MODEL | `hotel_reservation_history` | Filtered history |
| UI-11 | Arrivals Workspace | 2 | COMPLETE | REUSE | — | Keep |
| UI-12 | Arrival Quick View | 2 | PARTIAL | FRONTEND ONLY | Stay/CI context | Complete QV |
| UI-13 | Arrival Exceptions | 2 | PARTIAL | EXISTING WRITER WRAP | Phase 7 overlap OK | Signals + fix |
| UI-14 | Guest Verification | 2 | PARTIAL | CROSS-MODULE INTEGRATION | Guest Profile | Required fields + ID |
| UI-15 | Guest Registration | 2 | PARTIAL | EXISTING WRITER WRAP | `saveCheckInRegistration` | Completeness UX |
| UI-16 | Room Assignment at Check-In | 2 | PARTIAL | EXISTING WRITER WRAP | `assignReservationRoom` | In stepper |
| UI-17 | Payment / Guarantee Review | 2 | PARTIAL | CROSS-MODULE INTEGRATION | Cashiering | Deposit/guarantee review |
| UI-18 | Check-In Confirmation | 2 | COMPLETE | REUSE | `completeFoCheckIn` | Keep |
| UI-19 | Check-In Completion | 2 | COMPLETE | REUSE | RPC CI | Keep |
| UI-20 | In-House Workspace | 3 | COMPLETE | REUSE | — | Keep |
| UI-21 | In-House Guest Quick View | 3 | PARTIAL | FRONTEND ONLY | Stay sheet | Complete QV |
| UI-22 | Stay Management | 3 | PARTIAL | EXISTING WRITER WRAP | Amend sheet | Overlay |
| UI-23 | In-House Room Move | 3 | PARTIAL | EXISTING WRITER WRAP | `moveReservationRoom` | Dedicated overlay |
| UI-24 | Stay Extension | 3 | PARTIAL | NEW FO ORCHESTRATION | Rate reprice | Dates + price |
| UI-25 | Early Departure | 3 | PARTIAL | NEW FO ORCHESTRATION | Rate reprice | Dates + price |
| UI-26 | Guest Information Update | 3 | PARTIAL | CROSS-MODULE INTEGRATION | Guest Profile | Canonical guest update |
| UI-27 | In-House Requests & Traces | 3 (lite) / 6 (full) | PARTIAL | CROSS-MODULE INTEGRATION | Guest Services | GS engine; FO traces-lite until 6 |
| UI-28 | In-House Notes & Alerts | 3 | PARTIAL | EXISTING WRITER WRAP | Notes/special requests | Notes first |
| UI-29 | In-House Exceptions | 3 | PARTIAL | REUSE | FO-EX1 | Derived |
| UI-30 | Departures Workspace | 4 | COMPLETE | REUSE | — | Keep |
| UI-31 | Departure Quick View | 4 | PARTIAL | FRONTEND ONLY | — | Complete QV |
| UI-32 | Departure Preparation | 4 | PARTIAL | BACKEND READ MODEL | Folio/GS/HK | Prep panel |
| UI-33 | Folio & Balance Review | 4 | PARTIAL | CROSS-MODULE INTEGRATION | Cashiering | Display only |
| UI-34 | Payment & Settlement | 4 | PARTIAL | CROSS-MODULE INTEGRATION | Cashiering | Invoke posts |
| UI-35 | Checkout Validation | 4 | COMPLETE | REUSE | Gated CO | Keep |
| UI-36 | Checkout Confirmation | 4 | COMPLETE | REUSE | — | Keep |
| UI-37 | Checkout Completion | 4 | COMPLETE | REUSE | `completeFoCheckOut` | Keep |
| UI-38 | Late Checkout | 4 | PARTIAL | EXISTING WRITER WRAP | `setLateCheckout` | FO overlay |
| UI-39 | No-Show / Departure Exception | 4 | PARTIAL | EXISTING WRITER WRAP | `completeFoNoShow` | Control UI |
| UI-40 | Walk-In Workspace | 5 | PARTIAL | NEW FO ORCHESTRATION | `createReservation` | Dedicated overlay |
| UI-41 | Walk-In Guest Search | 5 | PARTIAL | CROSS-MODULE INTEGRATION | Guest Profile | Search |
| UI-42 | Walk-In Guest Registration | 5 | PARTIAL | CROSS-MODULE INTEGRATION | Guest create + CI | Create/register |
| UI-43 | Walk-In Stay Request | 5 | PARTIAL | NEW FO ORCHESTRATION | — | Overlay step |
| UI-44 | Walk-In Availability | 5 | PARTIAL | EXISTING WRITER WRAP | Inventory availability | Reuse |
| UI-45 | Walk-In Rate Selection | 5 | PARTIAL | EXISTING WRITER WRAP | `quoteStay` | Reuse |
| UI-46 | Walk-In Room Assignment | 5 | PARTIAL | EXISTING WRITER WRAP | `listAssignableRooms` | Room required |
| UI-47 | Walk-In Payment / Guarantee | 5 | ABSENT | CROSS-MODULE INTEGRATION | Cashiering | Deposit/guarantee |
| UI-48 | Walk-In Check-In | 5 | PARTIAL | EXISTING WRITER WRAP | CI stepper | Immediate CI |
| UI-49 | Walk-In Completion | 5 | PARTIAL | NEW FO ORCHESTRATION | History | Audit complete |
| UI-50 | Guest Services Workspace | 6 | ABSENT in FO | CROSS-MODULE INTEGRATION | GS engine | FO window |
| UI-51 | New Service Request | 6 | PARTIAL (FO table) | CROSS-MODULE INTEGRATION | `guest_service_history` | Canonical create |
| UI-52 | Service Request Detail | 6 | ABSENT | CROSS-MODULE INTEGRATION | GS | Detail |
| UI-53 | Service Assignment | 6 | ABSENT | CROSS-MODULE INTEGRATION | Card5/GS | Assign |
| UI-54 | Service Tracking | 6 | ABSENT | CROSS-MODULE INTEGRATION | SLA config | Track if GS supports |
| UI-55 | Service Completion | 6 | PARTIAL | CROSS-MODULE INTEGRATION | GS update | Complete |
| UI-56 | Service Cancellation | 6 | ABSENT | CROSS-MODULE INTEGRATION | GS | Cancel + reason |
| UI-57 | Service Escalation | 6 | ABSENT | CROSS-MODULE INTEGRATION | GS/Card5 | Escalate if exists |
| UI-58 | Guest Request History | 6 | PARTIAL | BACKEND READ MODEL | GS history | Search |
| UI-59 | FO Exceptions Workspace | 7 | PARTIAL | FRONTEND ONLY | FO-EX1 | Control layout |
| UI-60 | Room Conflict Resolution | 7 | PARTIAL | EXISTING WRITER WRAP | Assign/move | Resolve via writers |
| UI-61 | Arrival Exception Resolution | 7 | PARTIAL | EXISTING WRITER WRAP | CI/assign | Same |
| UI-62 | Check-In Exception Resolution | 7 | PARTIAL | EXISTING WRITER WRAP | CI gates | Same |
| UI-63 | In-House Exception Resolution | 7 | PARTIAL | EXISTING WRITER WRAP | Move/dates | Same |
| UI-64 | Departure Exception Resolution | 7 | PARTIAL | EXISTING WRITER WRAP | CO/folio | Same |
| UI-65 | Payment / Balance Exceptions | 7 | PARTIAL | CROSS-MODULE INTEGRATION | Cashiering | Signals |
| UI-66 | Guest Data Exceptions | 7 | ABSENT | CROSS-MODULE INTEGRATION | Guest Profile | Incomplete profile |
| UI-67 | Operational Override | 7 | PARTIAL | EXISTING WRITER WRAP | Role waive | Audited override |
| UI-68 | Approval Workspace | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security | Inbox |
| UI-69 | Discount Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security/Rate | Request flow |
| UI-70 | Rate Override Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security/Rate | Same |
| UI-71 | Room Upgrade Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security | Same |
| UI-72 | Late Checkout Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | SET1 flag | Same |
| UI-73 | Stay Extension Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security | Same |
| UI-74 | Refund / Adjustment Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | Cashiering | Same |
| UI-75 | Exceptional Room Move Approval | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security | Same |
| UI-76 | Approval History | 8 | ABSENT | NEW DOMAIN FOUNDATION | Security | Search |
| UI-77 | FO Communication Workspace | 9 | ABSENT | CROSS-MODULE INTEGRATION | Notifications | Workspace |
| UI-78 | Guest Communication | 9 | ABSENT | CROSS-MODULE INTEGRATION | Notifications | Send |
| UI-79 | Arrival Communication | 9 | ABSENT | CROSS-MODULE INTEGRATION | Card4 | Send |
| UI-80 | In-House Communication | 9 | ABSENT | CROSS-MODULE INTEGRATION | Card4 | Send |
| UI-81 | Departure Communication | 9 | ABSENT | CROSS-MODULE INTEGRATION | Card4 | Send |
| UI-82 | Internal Front Office Alerts | 9 | ABSENT | CROSS-MODULE INTEGRATION | Notifications | Internal |
| UI-83 | Communication History | 9 | ABSENT | CROSS-MODULE INTEGRATION | Notifications | History |
| UI-84 | FO Reports Workspace | 10 | PARTIAL | CROSS-MODULE INTEGRATION | Reports | Catalog |
| UI-85 | Arrivals Report | 10 | PARTIAL | CROSS-MODULE INTEGRATION | Reports/`listArrivals` | Report |
| UI-86 | In-House Report | 10 | PARTIAL | CROSS-MODULE INTEGRATION | Reports | Report |
| UI-87 | Departures Report | 10 | PARTIAL | CROSS-MODULE INTEGRATION | Reports | Report |
| UI-88 | Room Assignment Report | 10 | ABSENT | BACKEND READ MODEL | History | Report |
| UI-89 | Room Move Report | 10 | ABSENT | BACKEND READ MODEL | `room_moved` | Report |
| UI-90 | Check-In / Check-Out Report | 10 | ABSENT | BACKEND READ MODEL | History | Report |
| UI-91 | Walk-In Report | 10 | ABSENT | BACKEND READ MODEL | `source=walk_in` | Report |
| UI-92 | Guest Services Report | 10 | ABSENT | CROSS-MODULE INTEGRATION | GS | Report |
| UI-93 | FO Exceptions Report | 10 | ABSENT | BACKEND READ MODEL | Derived desk | Report |
| UI-94 | FO Activity Report | 10 | PARTIAL | BACKEND READ MODEL | `FoAuditViewer` | Report |
| UI-95 | FO History Workspace | 10 | PARTIAL | BACKEND READ MODEL | History | Search |
| UI-96 | Guest Stay History | 10 | PARTIAL | CROSS-MODULE INTEGRATION | Guest/history | Timeline |
| UI-97 | Room Assignment History | 10 | PARTIAL | BACKEND READ MODEL | History | Filter |
| UI-98 | Room Move History | 10 | PARTIAL | BACKEND READ MODEL | History | Filter |
| UI-99 | Check-In / Check-Out History | 10 | PARTIAL | BACKEND READ MODEL | History | Filter |
| UI-100 | Override & Approval History | 10 | PARTIAL | BACKEND READ MODEL | History; Phase 8 | Combined |
| UI-101 | FO Audit Detail | 10 | PARTIAL | BACKEND READ MODEL | History payload | Detail |
| UI-102 | Shift Control Workspace | 11 | ABSENT | NEW DOMAIN FOUNDATION or BACKEND READ MODEL | NA/Cashiering | Compose or `fo_shifts` |
| UI-103 | Shift Handover | 11 | ABSENT | NEW DOMAIN FOUNDATION | Phase 11 | Handover |
| UI-104 | Pending Task Control | 11 | ABSENT | BACKEND READ MODEL | GS/exceptions | Derived |
| UI-105 | Open Guest Issue Control | 11 | ABSENT | BACKEND READ MODEL | GS | Derived |
| UI-106 | Unresolved Room Control | 11 | ABSENT | BACKEND READ MODEL | HK/exceptions | Derived |
| UI-107 | Cash / Settlement Handover | 11 | ABSENT | CROSS-MODULE INTEGRATION | Cashiering | Link |
| UI-108 | Daily FO Checklist | 11 | ABSENT | BACKEND READ MODEL | NA blockers | Checklist |
| UI-109 | Shift Close | 11 | ABSENT | NEW DOMAIN FOUNDATION | Phase 11 | Close gates |
| UI-110 | Offline FO Workspace | 12 | ABSENT | DEFERRED | Platform | Deferred |
| UI-111 | Pending Offline Transactions | 12 | ABSENT | DEFERRED | Platform | Deferred |
| UI-112 | Sync Conflict Resolution | 12 | ABSENT | DEFERRED | Platform | Deferred |
| UI-113 | Synchronization History | 12 | ABSENT | DEFERRED | Platform | Deferred |
| UI-114 | FO Configuration View | 13 | ABSENT | SETTINGS INTEGRATION | Property Setup | Read-only |
| UI-115 | FO Permission View | 13 | ABSENT | SETTINGS INTEGRATION | Security | Read-only |
| UI-116 | FO Action Control | 13 | ABSENT | SETTINGS INTEGRATION | Security | Visibility |
| UI-117 | FO Audit Configuration | 13 | ABSENT | SETTINGS INTEGRATION | Card7 | Read-only |
| UI-118 | FO Operational Preferences | 13 | ABSENT | SETTINGS INTEGRATION | Card1/Card8 | Read-only |

UI-27 is the only dual-phase item: lite in Phase 3, canonical in Phase 6. Final target is Guest Services. Traceability count: **UI-01–UI-118 all mapped**.

---

## 11. Database Strategy

**Reuse (no new tables):** `hotel_reservations`, `hotel_reservation_history`, `hotel_rooms`, `fo_checkin_progress`, `fo_stay_companions`, `guest_folios`, `folio_transactions`, `guest_profiles`, `restaurants.business_date`, `cashier_shifts`, `night_audit_*`, `guest_service_history`, `pms_approval_rules`, Card2 HK rules, group room blocks.

**RPCs to keep:** `check_in_hotel_reservation`, `check_out_hotel_reservation`, `move_hotel_reservation_room`, `change_hotel_stay_dates`, `mark_hotel_reservation_no_show`, `amend_hotel_reservation` / priced variants, `create_hotel_reservation_priced`, folio open/post/close, `close_business_date`.

**Small extensions (only if proven):** stay alerts if notes cannot satisfy UI-28; legal registration document if compliance requires more than `registration_snapshot`.

**New foundations (justified, not implied by a screen):**

| Foundation | Phase | Owner |
|---|---|---|
| `pms_approval_requests` (or equivalent) | 8 | Security / Audit |
| FO shift sign-off (`fo_shifts`) | 11 | FO — **only if** compose-only checklist is insufficient |
| Offline platform queue | 12 | Platform |
| Alerts / legal registration | optional | FO/Guest — only if product requires |

`fo_guest_requests` is **not** expanded.

---

## 12. Canonical Writer Policy

| Action | Canonical Writer | Owner | Legacy/Duplicate Risk | Plan |
|---|---|---|---|---|
| Check-in | `completeFoCheckIn` → `check_in_hotel_reservation` | FO | `checkInReservation` | Phase 0 lock; never call ungated from UI |
| Checkout | `completeFoCheckOut` → `check_out_hotel_reservation` | FO | `checkOutReservation` | Phase 0 lock |
| No-show | `completeFoNoShow` → `mark_hotel_reservation_no_show` | FO | `markNoShow` | Phase 0 lock |
| Cancel (FO desk) | `completeFoCancel` | FO | `setReservationStatus({cancelled})` | FO always completeFoCancel; booking desk pre-CI may keep reservation cancel |
| Assign room (pre-CI) | `assignReservationRoom` | Reservations | Assign inside CI RPC only if already assigned policy | Keep Reservations writer |
| Post-CI room move | `moveReservationRoom` | FO | Type upgrade via `upgradeReservationType` | Keep split |
| Stay dates | `changeStayDates` | FO | Pre-CI priced `amendReservation` | In-house dates = FO RPC; add Rate reprice in Phase 3 |
| Late checkout | `setLateCheckout` | Reservations | Do not invent FO column writers | Phase 4 wrap |
| Walk-in create | `createReservation` + `startWalkInCheckIn` | Reservations + FO | `createWalkInReservation` forbidden | Phase 0 source; Phase 5 orchestrate |
| Folio / deposit / payment | Cashiering RPCs via FO steppers | Cashiering | Direct `folio_transactions` insert | Never |
| Guest update | Guest Profile functions | Guest Profile | FO-only guest table | Never |
| HK readiness/status | HK writers + checkout RPC | Housekeeping | FO UPDATE `housekeeping_status` | Never; CI transition HK-owned |
| Room status OOO/OOS | Rooms/Maintenance writers | Room & Inventory / Maintenance | FO status ops UI | Consume only |
| Room block/hold | Groups / Inventory block writers | Groups / Inventory | FO hold table | Consume only |

---

## 13. Frontend Workspace Contract

- Route remains `/restaurant/pms/front-office`.
- **Rack stays default.**
- Horizontal tabs remain; become **URL-addressable** (`?tab=` writeback, Phase 0).
- Room click → Room Quick View.
- Stay bar click → Stay/Reservation Quick View.
- Small tasks → dialog/sheet.
- Complex workflows (CI, CO, walk-in, stay management) → large overlay.
- No navigation to legacy `/rooms/in-house` or `/departures` after Phase 0 redirects.
- External modules (Cashiering, Settings, Reservations new booking, HK, Reports) via escape/quick action — intentional.
- Phone: select nav + Sheet; no rack DnD.
- No stacked-sheet traps (one primary overlay; confirm sheets sequential).
- Reservation layout tokens (section 4). Ops strip KPIs allowed on rack only.

---

## 14. Quick View / Overlay Contract

### Room Quick View

Room-owned: number, type, floor, physical status, HK, maintenance, occupancy, current stay summary, recent room-related history, CTAs that **route** to assign/move/status-in-owner-module/readiness.

### Stay Quick View

Existing `ReservationSideSheet` (enhanced): guest, dates, room, status, folio strip, FO actions (CI/CO/move/amend/cancel).

### Guest Quick View

Guest Profile context when identity/history/duplicates needed. Open Guest module or a thin sheet that calls Guest reads — **do not** merge guest master into Room QV.

Do not collapse all three into one component.

---

## 15. Exception Strategy

- **Derived** from lists, occupancy, folio signals, HK discrepancies, overbook horizon, overstay flag.
- Resolution = fix underlying state (assign, move, pay, resolve discrepancy).
- **No** fake resolved flag unless a true persisted exception record already exists (it does not).
- Reuse Reservation control, FO-EX1, HK discrepancies, Cashiering balances.
- Early/late remain coming soon until ETA + property times are trusted.

---

## 16. Approval Strategy

**Current:** role gates only (`owner|manager` waives; receptionist cannot). `pms_approval_rules` is a **catalogue**, not a workflow. There is **no** `pms_approval_requests`.

**Future:** Phase 8 persisted request flow, Security-owned. Until then, do not pretend approvals exist. Late-checkout `needs_approval` is a property flag only.

---

## 17. Guest Services Strategy

**Canonical runtime:** `guest_service_history` (Guest Services / Guest Profile module) + Card4 types.

**`fo_guest_requests`:** traces-lite (open/done text). Freeze. Phase 6 FO creates typed requests via GS. Do not allow both to become full engines. Do not add SLA/escalation columns to `fo_guest_requests`.

---

## 18. Night Audit / Shift Strategy

Keep four concepts separate:

| Concept | Owner | FO |
|---|---|---|
| Property business date | Night Audit (`restaurants.business_date`) | Read only |
| Night Audit close | Night Audit (`close_business_date`, exceptions) | Supplies unresolved ops; does not close |
| FO shift / handover | FO (Phase 11, optional persist) | Desk session / checklist |
| Cashiering shift | Cashiering (`cashier_shifts`) | Required to post; handover links to Cashiering |

Do not merge.

---

## 19. Offline Strategy

Current truth: **no FO offline persistence, queue, or sync.** Card8 is policy-only.

**DEFERRED — requires platform-level offline foundation**

Do not propose a FO-only local queue. POS/offline elsewhere does not inherit.

---

## 20. Test Strategy

Layers: unit (pure helpers) · read model · writer/contract · component source-locks · route search · browser smoke · regression of Reservation/Inventory.

Minimum per phase:

| Phase | Minimum tests |
|---|---|
| 0 | Writer source locks, cancel matrix, walk-in source, `?tab=`, redirects, conflict helper |
| 1 | Room QV honesty, grouping/horizon, click routing, no new rack writes |
| 2 | CI gates, SET3, assign-at-CI |
| 3 | Move vs upgrade, date+rate honesty |
| 4 | CO gates, late CO wrap, refund CTA |
| 5 | No `createWalkInReservation`, room required, source, CI continue |
| 6 | GS create from FO; freeze `fo_guest_requests` |
| 7 | Derived types honesty |
| 8 | Request lifecycle (when foundation exists) |
| 9 | Dispatch to Notifications only |
| 10 | Report filters; history event types |
| 11 | No date rollover; cashier distinct |
| 12 | Keep “no FO offline RPC” tests |
| 13 | Settings read-only |

Do not claim browser PASS from unit tests alone.

---

## 21. Browser Verification Contract

A UI phase is not PASS until authenticated smoke on `/restaurant/pms/front-office`:

- No CatchBoundary
- No console runtime errors
- First-click overlays open
- Mobile Sheet state safe (close restores rack)
- All existing tabs still load and write through canonical writers
- Reservation create/desk not regressed
- Room Rack not regressed (default landing, bars, confirm-before-write)
- Cashiering posts still require cashier shift

---

## 22. Definition of Done

Front Office module is complete only when:

- All **non-deferred** UI-01–UI-118 coverage is implemented
- Ownership boundaries respected; no duplicate engines
- Canonical writers used
- Settings remains master source
- Room Rack preserved as home
- Reservation-style UX consistent
- Browser verification passes
- Deferred items remain in section 23

Module COMPLETE remains **NO** until that bar and hotel UAT.

---

## 23. Deferred Register

| Item | Reason | Dependency | Revisit Trigger |
|---|---|---|---|
| UI-01 Welcome as default | Operational Rack is superior | Product | Never as default; optional route only if PM asks |
| Offline/sync UI-110–113 | No platform engine | Platform offline | Platform queue exists |
| Persisted approvals UI-68–76 | No request table | Security foundation | `pms_approval_requests` (or equivalent) exists |
| Advanced comms UI-77–83 | Notifications send not wired to FO | Notifications API | Card4 dispatch callable |
| Some report exports | Central Reports export gaps | Reports module | Export API exists |
| FO shift persist | May be compose-only | NA + Cashiering contracts | PM requires sign-off record |
| Duplicate guest merge in FO | Guest Profile owns merge | Guest merge UI | Call existing merge, don’t fork |
| Legal registration document | Snapshot may suffice | Compliance | Legal requires separate artifact |
| Early/late auto-no-show | Explicitly forbidden in FO-EX1 | ETA + policy | Product change |
| Printed registration card chip | Coming soon honesty | Phase 2/compliance | Spec |
| WhatsApp | Channel may not exist | Notifications | Channel live |
| FO-only local offline queue | Diverges from writers | — | Do not revisit as shortcut |

---

## 24. Recommended Execution Method

Default: **one coherent phase = one Cursor implementation prompt** when the phase wraps existing writers.

Split backend/frontend only when the phase introduces **new domain foundation** or a large read model plus overlay.

| Phase | Prompt | Why |
|---|---|---|
| 0 | SINGLE | Mechanical locks, no UX expansion |
| 1 | SINGLE (split if QV read model explodes) | One rack surface |
| 2 | SINGLE | Stepper already exists |
| 3 | SINGLE or SPLIT | Split only for Rate reprice wiring |
| 4 | SINGLE | Stepper exists |
| 5 | SINGLE | Orchestration overlay |
| 6 | SPLIT if GS APIs need FO reads | Cross-module |
| 7 | SINGLE | Derived desk |
| 8 | SPLIT | New foundation |
| 9 | SINGLE or DEFER | Depends on Notifications |
| 10 | SINGLE | Read models |
| 11 | SPLIT if `fo_shifts` | Foundation vs compose |
| 12 | DO NOT IMPLEMENT | Deferred |
| 13 | SINGLE | Settings windows |

Do not create dozens of tiny prompts. Audit (or re-audit) before any new foundation.

---

## 25. Immediate Next Step

**First implementation action: Phase 0 — Foundation Safety & Debt.**

Phase 1 Room Quick View is the first *visible* product increment, but rack writes, walk-in history, and cancel/CI/CO already hit **HIGH** dual-writer and source bugs. Expanding QV/move UX on top of ungated wrappers and unsigned walk-ins would encode the debt.

Sequence:

1. Commission **Phase 0** (single prompt).
2. Then **Phase 1 — Room Rack & Room Operations** (Room QV on the live rack).
3. Do **not** implement UI-01 Welcome.
4. Do **not** start Phase 8/11/12 foundations opportunistically.

---

## Do Not Touch (protected)

- Reservation priced create/amend engine
- Room Inventory availability engine
- HK task/state engine (except agreed `guest_check_in` apply on existing CI RPC, HK-owned)
- Cashiering ledger
- Rate engine (invoke, don’t copy)
- Guest master engine
- Night Audit close engine
- Notifications delivery engine
- Central Security/Audit policy stores
- Replacement of the current live Room Rack

---

## Final validation (this document)

1. UI-01–UI-118 mapped — **yes** (section 10).
2. Every engineering phase has PASS criteria — **yes**.
3. Every phase states dependencies — **yes**.
4. Ownership explicit — **yes** (sections 2, 12, 16–18).
5. Live workspace preserved — **yes**.
6. Reservation layout language locked — **yes**.
7. Technical debt sequenced — **yes** (Phase 0 first).
8. Deferred items explicit — **yes** (section 23).
9. No implementation code in this change set — **plan file only**.
