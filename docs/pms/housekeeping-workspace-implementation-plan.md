# NORU PMS — HOUSEKEEPING WORKSPACE IMPLEMENTATION PLAN

| Field | Value |
|---|---|
| **STATUS** | **PLAN ONLY** — not a Functional Spec, not authorised engineering, not implemented |
| **Basis** | Current local working tree + Housekeeping Workspace Foundation Audit (2026-09-26) + **Locked Decisions §1A (2026-09-26)** + approved Housekeeping design proposal (15 product phases) |
| **Date** | 2026-09-26 |
| **Audit verdict** | **PARTIAL FOUNDATION — ACTIONABLE GAPS** |
| **Module COMPLETE** | **NO** |
| **Canonical route** | `/restaurant/pms/housekeeping` |
| **Maintenance** | Stays **inside** the Housekeeping module (`/restaurant/pms/maintenance` is the same workspace, Maintenance tab) |
| **Default landing (planned)** | Housekeeping Board (today: Dashboard) |
| **Repository changes from this document** | This file only |

This document is the Cursor execution roadmap. It does not approve GitHub issues by itself. Do not implement from this file until a named engineering phase is explicitly commissioned.

The 15 product phases are **coverage**, not build order. Engineering is grouped into **Phase 0–8 (actionable)** plus **Phase 9–15 (Settings/runtime held)**. Binding architecture is **§1A Locked Decisions**.

---

## 1. Purpose

Housekeeping is the **operational workspace** that executes cleaning, inspection, room readiness, housekeeping-routed guest requests, housekeeping exceptions, and **Maintenance work orders inside this module**.

Housekeeping is **not** a second Settings catalogue, room-master engine, availability engine, reservation engine, Front Office desk, Guest Services request engine, or Cashiering ledger.

**Housekeeping consumes Settings configuration and Room / Reservation / FO / Guest Services / Inventory read models. It writes only through canonical HK, restriction, and (later) work-order writers.**

---

## 1A. Locked Decisions (2026-09-26)

These decisions are **binding**. Later engineering phases must not reopen them without an explicit plan revision.

### 1. State model freeze — no second room-state system

Do **not** create `ready`, `assigned`, or `cleaning` / `cleaning_in_progress` as new values on `hotel_rooms.housekeeping_status`.

Current reality stays:

- Room HK state: `dirty | clean | inspected | pickup`
- Cleaning workflow: task `pending | assigned | in_progress | completed | cancelled`
- Physical availability: `available | out_of_order | out_of_service`
- Maintenance: separate `hotel_rooms.maintenance_status`
- **Ready = derived** from Housekeeping + physical room state + maintenance + Card 2 policy (`evaluateRoomReadinessWithPolicy`)

The product lifecycle Dirty → Assigned → Cleaning → Clean → Inspection → Ready is a **business workflow**, not one database enum.

| Product stage | Canonical source |
|---|---|
| Dirty | Room HK status (`hotel_rooms.housekeeping_status`) |
| Assigned | Cleaning task (`housekeeping_tasks.status`) |
| Cleaning | Cleaning task (`housekeeping_tasks.status`) |
| Clean | Room HK status (`hotel_rooms.housekeeping_status`) |
| Inspection | Inspection workflow/queue (`housekeeping_inspections` + rooms with `clean`) |
| Ready | Derived readiness (`evaluateRoomReadinessWithPolicy`) |

### 2. `pickup` remains

`pickup` is an existing operational HK code even though it is not in the six-step product lifecycle. Do **not** remove it during the workspace rebuild. First Board/rack work must **document live hotel meaning and current usage** (where written and read). It may be shown as an additional HK state while the primary workflow remains Dirty → Ready.

### 3. Settings — consume as-is; no third source

Card 2 relational configuration and SET4 JSONB both exist and both affect some runtime paths. That overlap is **genuine foundation debt**.

Phases 0–8 **consume the existing runtime configuration exactly as it works today**. Do not attempt a Settings rewrite from inside Housekeeping.

**Card 2 vs SET4 consolidation = Settings technical-debt stream** (not an HK phase). Housekeeping must **never** introduce a third configuration source.

### 4. One canonical readiness calculation everywhere

Whenever NORU asks “Is this room ready?”, use the same policy: `evaluateRoomReadinessWithPolicy` (wrappers `isRoomReady` / `foRoomReadiness` allowed).

Applies to: Housekeeping Board, Housekeeping Room Quick View, Front Office Room Quick View, arrivals, room rack, check-in, exceptions.

This is **Phase 0** work, not a later polish. Do not ship one screen saying Ready while check-in says Not Ready.

### 5. Maintenance stays inside the Housekeeping module

Preserve current nav: same `HousekeepingWorkspace`, Maintenance tab, `/restaurant/pms/maintenance` opening that workspace, `moduleKey = housekeeping`.

Distinguish:

- **Housekeeping module** — contains the Maintenance workspace/UI.
- **Maintenance domain (internal)** — owns ticket/work-order lifecycle.

Current runtime is a thin ticket system (`housekeeping_maintenance_requests`: `open → in_progress → resolved`), not a full work-order engine. **Evolve that model.** Do not create a parallel work-order table by default.

### 6. Canonical maintenance-state writer before Maintenance expansion

Tickets, `hotel_rooms.maintenance_status`, and readiness (which reads `maintenance_status`) are not synchronized today. Define **one canonical writer** for `maintenance_status` before expanding Maintenance UX.

Cleaning / `housekeeping_complete_task` must **not** manipulate maintenance state. Phase 4 cannot expand work-order UX until that writer exists and is tested.

### 7. Housekeeping Requests reuse Guest Services

Guest Services owns the request (`guest_service_history` + `createGuestServiceRequest` / `updateGuestServiceRequest`). Housekeeping owns **execution** of Housekeeping-routed requests. No `housekeeping_requests` clone.

### 8. Permissions remain known debt initially

Live enforcement stays `restaurant_users.role`. Card 7 `pms_permissions` grants do **not** enforce HK actions today. Do **not** switch to Card 7 during the first UI phases. Dedicated RBAC alignment comes **after Settings is ready**.

### 9. Writer-hardening is a debt stream, not UI work

Create / complete / inspect already use RPCs. Assign / start / cancel / discrepancy / maintenance still use privileged server-side table writes behind authorized server functions.

That is **not** an immediate blocker. Do **not** casually rewrite those paths while building UI.

Later stream: UI → server function → canonical validated writer/RPC. Not: UI → server function → unrestricted admin mutation as a long-term pattern.

### 10. DND and Refused Service are missing foundation

They are absent from the operational model. They are **service conditions / exceptions**, not cleaning-task statuses and not new `housekeeping_status` values. **Defer storage** until a later plan revision defines the model. Do not pick a table in Phase 6 by default.

### 11. Inspection workspace before checklists

Pass/fail, inspection rows, supervisor approval, fail → dirty + `re_clean` are enough for an early Inspection workspace. Checklist / failed-criteria wait until the Settings master exists.

### 12. Do not build these yet (do not fake)

Turndown advanced operations, Linen & Supplies, Lost & Found, Communication, Reports, Housekeeping shifts, Offline, Administration, zones/workload/auto-assignment, inspection checklist configuration, final Card 7 permission cutover.

---

## 2. Locked Architecture

**Shared data does not mean shared ownership.** Displaying a field does not make Housekeeping the persistence owner.

| Domain | Owns | Housekeeping role |
|---|---|---|
| Settings / Property Setup | HK statuses/readiness mapping, cleaning types/standards, priorities, floors/zones, attendants/roles, workload rules, inspection rules/checklists, shifts, SLA/duration, turndown/deep-clean, request categories, linen/supply categories, Lost & Found rules, escalation, approvals, RBAC, notifications, offline policy | Consume. Do not duplicate editors inside HK. |
| Housekeeping | Cleaning workflow, HK status progression, assignments, attendant worklists, start/complete, inspection workflow, readiness **outcome**, re-clean, HK operational exceptions, execution of HK-routed requests, HK operational history | Own those workflows; write only through canonical HK writers |
| Maintenance (inside HK module) | Issue reporting, work orders, work-order lifecycle, maintenance status, repair coordination, maintenance history | Own internally; HK readiness **consumes** maintenance state. Do not duplicate writers inside complete-task. |
| Room & Inventory | Room master, types, floors/physical mapping, availability, eligibility, OOO/OOS, blocks, physical room state | Consume. Call inventory restriction writer for OOO/OOS. Do not create a second availability engine. |
| Front Office | Arrivals, departures, early arrivals, stayovers, in-house, VIP/ops priority, room-change context, guest-facing readiness coordination | Consume demand/context; FO consumes HK readiness. FO must not `UPDATE housekeeping_status`. |
| Reservations | Stay record, stay dates, room assignment, reservation status, occupancy context | Consume occupancy/stay reads. Do not copy reservation rows. |
| Guest Services | Canonical guest service request domain (`guest_service_history`) | Execute HK-routed requests. Do not create a second request engine. |
| Guest Profile | Guest identity, preferences | Consume where permitted. |
| Cashiering | Chargeable services, posting, settlement | Invoke only if a chargeable HK/GS item requires it. No HK ledger. |
| Security / Settings | Permissions, approval policy, access control | Consume gates. Do not invent a HK-only RBAC store. |
| Reports / Notifications | Central report and delivery engines | Consume; do not fake HK-only engines. |

Protected engines (do not touch / do not fork):

- Card 2 / SET4 / Card 4 / Card 7 configuration editors (Settings)
- Room Inventory availability / `pms_evaluate_room_assignment` / dated inventory blocks
- Reservation priced create/amend
- FO check-in/out steppers (except agreed HK transition **inside** existing CI/CO RPCs)
- `createGuestServiceRequest` / `updateGuestServiceRequest`
- Cashiering folio RPCs
- Night Audit `close_business_date`

---

## 3. Current State

**Audit verdict (fixed):** PARTIAL FOUNDATION — ACTIONABLE GAPS. Enough real writers exist to rebuild the workspace **on top of them**. The locked product lifecycle is **not** already implemented as six room statuses.

### Route and workspace

| Item | Current truth |
|---|---|
| Canonical HK route | `/restaurant/pms/housekeeping` — `src/routes/restaurant/pms/housekeeping.tsx` |
| Canonical Maintenance route | `/restaurant/pms/maintenance` — same `HousekeepingWorkspace`, default tab `maintenance` |
| Workspace | `src/packages/pms/components/workspaces/housekeeping-workspace.tsx` |
| Tabs UI | `src/packages/pms/components/housekeeping/housekeeping-tabs.tsx` |
| Current tabs | `dashboard`, `rack`, `board`, `inspections`, `discrepancies`, `restrictions`, `maintenance`, `history` |
| Dialogs | New task, Assign, Pass/Fail inspection, Restriction, Discrepancy, Log maintenance request |
| Drawers / sheets / QV | **None** inside HK |
| URL | `?tab=` read on mount; **in-page tabs do not write URL** |
| Access | `restaurant_users.role` via `requireHousekeepingAccess` / `housekeepingScope` |
| Legacy | `/restaurant/housekeeping` live twin (no redirect) |
| PMS rail | Housekeeping (core) + Maintenance / Engineering (support); both `moduleKey: "housekeeping"` |

### What is already LIVE (ops)

- Room rack (`listRoomRack`) with HK status, restriction, attendant, occupancy from `hotel_reservations.status = checked_in`
- Cleaning board (`listHousekeepingTasks`) — pending / assigned / in_progress
- Create / assign / start / complete / cancel tasks
- Inspection pass/fail (`housekeeping_inspect_room`); fail → dirty + `re_clean`
- Discrepancies create/resolve
- OOO/OOS via `setRoomRestriction` → `pms_set_room_operational_restriction`
- Maintenance tickets (`housekeeping_maintenance_requests`) open / in_progress / resolved
- `housekeeping_history` + History tab
- Card 2 readiness consumed by FO check-in (`evaluateRoomReadinessWithPolicy` / `isRoomReady`)
- Checkout RPC: HK transition + auto `departure_cleaning`
- Check-in RPC: `guest_check_in` transition **only if** target ∈ `{dirty,clean,inspected,pickup}`

### What is setup-only or missing

See sections 8 and 24. Headline: no linen, Lost & Found, DND storage, refused service storage, inspection checklists, zones, workload, HK shifts, work-order CMMS, Guest Services execution queue, communication send, HK reports pack, offline runtime. Turndown exists in SET4 + Guest Services types, not as `housekeeping_tasks.task_type`.

---

## 4. Preserve / Do Not Replace

Keep as operational base:

- Tables: `housekeeping_tasks`, `housekeeping_inspections`, `housekeeping_discrepancies`, `housekeeping_maintenance_requests`, `housekeeping_history`
- Room columns: `hotel_rooms.housekeeping_status` (CHECK: `dirty|clean|inspected|pickup`), `hotel_rooms.status` (physical OOO/OOS), `hotel_rooms.maintenance_status`
- RPCs: `housekeeping_create_task`, `housekeeping_complete_task`, `housekeeping_inspect_room`, `pms_housekeeping_transition_target`, `pms_housekeeping_event_priority`, `pms_set_room_operational_restriction`
- FO/CI/CO: `check_in_hotel_reservation` / `check_out_hotel_reservation` remain the **only** FO paths that may flip HK status
- Readiness helper: `evaluateRoomReadinessWithPolicy` (single policy)
- Staff identity: `restaurant_users` via `assigned_membership_id` — **no HK employee directory**
- Guest Services writers — consume, never fork
- Maintenance **inside** Housekeeping module (nav sibling is allowed; do not split package)

Do **not** invent a second room-state system, a second guest-request engine, or a top-level Maintenance PMS module.

Locked visual contract (when UX is rebuilt):

- NORU global chrome
- Warm cream/off-white workspace
- Dark brown / gold accent
- OPERATIONS eyebrow
- Clear workspace title
- Horizontal submodule tabs
- Compact filters
- Central board / table
- Right-side Quick View for room/task (to be added; none today)
- Dialogs/sheets for small actions
- Responsive web / PWA-class field flows — **not** a second native app
- Same typography/tokens as Reservation / Front Office modules

---

## 5. Canonical Room / Housekeeping State Model

Binding mapping is in **§1A**. This section restates it for implementers.

**Forbidden on `hotel_rooms.housekeeping_status`:** `ready`, `assigned`, `cleaning`, `cleaning_in_progress`. Do not expand the CHECK to smuggle the product lifecycle into one enum.

### Four independent dimensions

| Dimension | Canonical store | Values (current) | Owner |
|---|---|---|---|
| Housekeeping cleanliness | `hotel_rooms.housekeeping_status` | `dirty`, `clean`, `inspected`, `pickup` | Housekeeping RPCs (+ gated `saveRoom` defaults) |
| Cleaning job | `housekeeping_tasks.status` | `pending`, `assigned`, `in_progress`, `completed`, `cancelled` | Housekeeping |
| Physical restriction | `hotel_rooms.status` | `available`, `out_of_order`, `out_of_service` | Room & Inventory (`pms_set_room_operational_restriction`) |
| Maintenance condition | `hotel_rooms.maintenance_status` | `normal`, `maintenance_required`, `in_progress`, `out_of_service`, `out_of_order`, `inspection` | Maintenance domain (inside HK module). **Canonical writer required before Phase 4 UX expansion.** Today mostly `saveRoom`. |
| Readiness for check-in | **Derived** | boolean + reason | Card 2 policy via `evaluateRoomReadinessWithPolicy` — **one function everywhere** |

Dated OOO/OOS also exists as `pms_operational_inventory_blocks`. Point-in-time `hotel_rooms.status` and dated blocks are **Inventory**. HK Restrictions tab calls the inventory writer; it does not own a second OOO table.

### Locked product lifecycle mapping

| Product stage | Canonical source |
|---|---|
| Dirty | Room HK status |
| Assigned | Cleaning task |
| Cleaning | Cleaning task |
| Clean | Room HK status |
| Inspection | Inspection workflow/queue |
| Ready | Derived readiness |

`pickup` remains a live operational code (additional HK state, not part of the six-step product list). **Do not remove it.** Phase 0 documents where it is written and read; Phase 2 may present it on the board. Do not drop it to force a six-value CHECK.

Card 2 catalog labels `ready`, `occupied`, `vacant`, `cleaning_in_progress`, `inspection_required` are **labels / derived / occupancy**. They must **not** be written to `hotel_rooms.housekeeping_status`. Schema expansion of that CHECK is **not** implied by this plan.

### Special states

| State | Current | Plan |
|---|---|---|
| Inspection fail / re-clean | LIVE (dirty + `re_clean`) | Preserve |
| OOO / OOS | LIVE via restriction RPC | Preserve; Inventory-owned |
| Maintenance issue | Ticket table; **does not** flip `maintenance_status` | Canonical maintenance-state writer **before** Phase 4 WO expansion |
| `pickup` | LIVE operational HK code | Keep; document usage in Phase 0 |
| Do Not Disturb | **ABSENT** | Service condition / exception — **not** a cleanliness or task status. Storage **deferred** |
| Refused service | **ABSENT** | Same as DND. Storage **deferred** |
| Turndown | SET4 + GS type; blocked on `housekeeping_tasks` | Held (do not fake) |

### Seed-transition honesty (Phase 0)

Default Card 2 seed `guest_check_in: ready → occupied` **often no-ops** because neither code is writable on the room. Phase 0 must lock operational transition targets to `{dirty,clean,inspected,pickup}` (or explicitly no-op). FO must not invent a workaround UPDATE. Do not “fix” this by adding `ready`/`occupied` to the room CHECK.

---

## 6. Technical Debt Before Expansion

| Debt | Severity | Risk | Required Action | Stream / phase |
|---|---|---|---|---|
| Dual Settings: Card 2 tables vs SET4 JSONB | HIGH | Dual truth; HK might grow a third editor | **Consume runtime config as-is** in Phases 0–8. HK must not add a third source. Consolidation is **Settings technical-debt stream**, not an HK rewrite. | Settings debt stream |
| Quick-view / exceptions `room_not_ready` ≠ Card 2 readiness | HIGH | One screen Ready, check-in Not Ready | Unify **all** ready? call sites on `evaluateRoomReadinessWithPolicy` | **Phase 0** |
| Tickets vs `maintenance_status` unsynchronized | HIGH | Resolved ticket, room still `maintenance_required` (or reverse) | Define **one canonical `maintenance_status` writer**. Cleaning must not write it. **Gate:** writer + tests **before** Phase 4 WO UX | Prerequisite to Phase 4 |
| Dual OOO: `hotel_rooms.status` vs dated blocks vs overlapping `maintenance_status` labels | HIGH | Wrong module writes physical state | Restriction RPC only for OOO/OOS; `maintenance_status` is not a second OOO writer | Phase 0 contract / Phase 4 writer |
| `guest_check_in` seed targets non-writable codes | HIGH | CI leaves HK unchanged | Keep 0100 invalid-target no-op; do **not** add `ready`/`occupied` to room CHECK | Phase 0 |
| Assign/start/cancel/discrepancy/maintenance admin table writes | MEDIUM | Weaker invariants than create/complete/inspect RPCs | Leave as authorized server-fn mutations during UI phases. Later: UI → server fn → validated RPC. **Do not rewrite while building UI.** | **Writer-hardening stream** |
| `pms_permissions` unused at HK runtime | MEDIUM | Card 7 grants lie | `restaurant_users.role` remains authoritative for early UI. No Card 7 cutover in Phases 0–8. | Known debt; RBAC after Settings |
| Legacy `/restaurant/housekeeping` + no `?tab=` writeback | MEDIUM | Split bookmarks; refresh loses tab | Redirect legacy → canonical; write `?tab=` | 1 |
| `turn_down` in SET4, rejected by task CHECK | MEDIUM | Settings lie | Hold ops — do not fake a turndown board | 9 hold |
| Custom catalog statuses cannot hit room CHECK | MEDIUM | Decoy labels | Document; HK UI must not write custom codes | Phase 0 |
| `pickup` meaning undocumented | MEDIUM | Wrong UX if treated as Dirty or Ready | Inventory writers/readers in Phase 0; keep the code | Phase 0 |
| DND / Refused Service absent | MEDIUM | Missing foundation, not missing UI | Defer storage; not task status; not new HK room codes | Deferred (model undecided) |
| `room_release_rule` / SET4 `serviceTiming` unread | LOW | Dead config | Do not enforce until Settings runtime; do not hide in HK | Hold |
| `housekeeping.server.ts` header says owner/manager only | LOW | Comment drift | Fix comment when that file is touched | 0 / 1 |
| Dual-lane 0015 drizzle-only | LOW | Greenfield vs incremental | No new table from this plan; dual-lane any future SQL | All |

No unrelated repo-wide cleanup. No `npm run build` / browser work from **this document**.

---

## 7. Cross-Module Dependency Map

| Module | Housekeeping Consumes | Housekeeping Sends | Owner | Current Status | Gap |
|---|---|---|---|---|---|
| Settings | Card 2 readiness, transitions, priorities, enable flag; SET4 cleaning types; restriction reasons | None (read-only) | Property Setup | PARTIAL / dual | **Consume as-is.** Consolidation = Settings debt stream; no third HK source |
| Room & Inventory | Rooms, types, floors, OOO/OOS, eligibility | Restriction RPC; never availability SQL | Room & Inventory | LIVE consume + restriction write | `saveRoom` still sets HK/maintenance columns |
| Front Office | Arrivals/deps/stayover/VIP/room-change **reads** (not yet a HK demand board) | Readiness + discrepancies; CI/CO RPCs already flip HK | Front Office | LIVE FO→HK; PARTIAL HK→FO demand | Board should reuse FO/reservation read models |
| Reservations | Checked-in occupancy, stay dates, assigned room | None (checkout RPC creates departure task) | Reservations | LIVE occupancy | Room-move / cancel task generators |
| Maintenance (in-module) | `maintenance_status` for readiness | Tickets today | Housekeeping **module** / Maintenance **domain** | PARTIAL | Canonical `maintenance_status` writer **before** WO expansion |
| Guest Services | Card 4 HK types (`HK_CLEAN`, `HK_TOWELS`, …) unused by HK UI | None | Guest Services | SPLIT | Phase 5 execution queue |
| Guest Profile | Names on occupancy map | None | Guest Profile | LIVE lite | Preferences where permitted. DND is **not** a guest-profile substitute for HK exception storage |
| Cashiering | None | None | Cashiering | NONE | Chargeable GS items later |
| Night Audit | — | Dirty vacant without open task (NA reads rooms/tasks) | Night Audit | LIVE signals | Keep derived |
| Notifications | Card 4 `room_ready` / `room_not_ready` codes | **No emitter** | Notifications | SETUP ONLY | Phase 12 hold |
| Security | Role gates (`restaurant_users.role`) | `housekeeping_history` | Security | PARTIAL | `pms_permissions` catalogue unused; RBAC after Settings |
| Reports | Escape to reports (legacy HK history link exists) | Dashboard counts | Reports | MISSING HK pack | Phase 13 hold |
| Shared Inventory / Procurement | Footer deep-links | None | Inventory | COPY ONLY | Linen not HK-owned |

---

## 8. Settings / Property Setup Master Data Contract

| Master data | Runtime status | Current source | HK use | Planned work |
|---|---|---|---|---|
| HK enable flag | LIVE | Card 2 `settings.enabled` | Workspace gate | Keep |
| Readiness mapping | LIVE | Card 2 clean/inspect/maintenance-clear | `evaluateRoomReadinessWithPolicy` | **Phase 0:** same function on every ready? surface |
| Status catalog / transitions | LIVE core | Card 2 + RPCs | Complete/inspect/CI/CO | Phase 0 operational-code contract; consume as-is |
| Event priorities | PARTIAL | Card 2 rules + SQL helper | Checkout / inspect fail | Apply on more task-create paths in Phase 2 |
| Cleaning types | PARTIAL | SET4 posture | Create-task allowlist | Hold `turn_down` until schema |
| Deep clean | LIVE | `TASK_TYPES` | Task create | Keep |
| Assignment override | LIVE | Card 2 | `updateHousekeepingTask` assign | Keep |
| Manual HK status on room save | PARTIAL | Card 2 `manualStatusChangeAllowed` | `saveRoom` | Inventory remains editor; HK should not add another |
| Inspection supervisor gate | LIVE | Card 2 | `inspectRoom` | Checklists **MISSING** — hold |
| Floors | PARTIAL | SET2 / `hotel_rooms.floor` | Rack filter | Zones MISSING — hold |
| Maintenance rules / catalogues | PARTIAL / SETUP | Card 2 + SET4 | Tickets ignore catalogues | Consume as-is until 4B after writer gate |
| OOO/OOS posture | PARTIAL | SET4 JSONB still on restriction writer | Restrictions tab | Consume as-is; Settings consolidation stream |
| Guest request categories | PARTIAL | Card 4 | Unused by HK | Phase 5 consume |
| Turndown | SETUP ONLY (ops) | SET4 + Card 4 type | Filtered out of New Task | Phase 9 hold — do not fake |
| SLA / service timing | SETUP ONLY | SET4 | Unused | Hold |
| Room release rule | SETUP ONLY | Card 2 | Unread | Hold |
| Notifications | SETUP ONLY | Card 4 events | No send | Phase 12 hold |
| Permissions catalogue | PARTIAL | Card 7 `housekeeping.*` | Not enforced | Role gates stay live; RBAC after Settings |
| Linen / supplies / L&F / HK shifts / workload / checklists / standards / zones | MISSING | — | — | Hold until Settings LIVE |

**Rule:** Housekeeping screens must **not** grow configuration editors. Link to Property Setup. Phases 0–8 consume Card 2 + SET4 **exactly as they work today**.

**Settings technical-debt stream (not HK):** Card 2 vs SET4 consolidation. Until that stream is commissioned, dual reads remain acceptable **if** HK does not add a third store.

---

## 9. Housekeeping Read/Write Model Strategy

### Read models

Join existing tables. No occupancy table. Occupancy remains `hotel_reservations` checked-in + `hotel_rooms`. Demand board (arrivals, departures, stayovers, VIP, early arrival, room change) **reuses** reservation/FO helpers:

- `evaluateRoomReadinessWithPolicy` / `isRoomReady` / `foRoomReadiness`
- `listRoomRack`, `listHousekeepingTasks`, dashboard, inspections, discrepancies, maintenance list, history
- Arrivals-departures / `deriveRoomNotReadyItems` / `operationalRoomState` / `resolvePropertyBusinessDate`
- `getAssignmentEligibilityCompat` (do not reimplement)

### Writers

Only canonical domain writers (section 13). UI uses `createServerFn` + existing RPCs or existing authorized admin mutations. **No browser `supabase.from` writes** (already true — keep). Do **not** promote assign/start/cancel to new RPCs during Board/Cleaning UI (writer-hardening stream).

### Orchestration

Task complete already flips room HK inside SQL. Inspect fail already creates `re_clean`. Do not duplicate those side effects in TypeScript. Maintenance must **not** be flipped inside `housekeeping_complete_task`.

### History

Reuse `housekeeping_history`. Inventory events stay on restriction RPC. Do not create a second HK audit log. Unified History UI is a **read model**.

**No new table merely because a UI exists.**

---

## 10. Engineering Roadmap

Product phases 1–15 remain the functional coverage map:

1. Entry  
2. Housekeeping Board  
3. Cleaning Operations  
4. Inspection & Room Readiness  
5. Housekeeping Requests  
6. Turndown & Special Cleaning  
7. Linen & Supplies  
8. Lost & Found  
9. Housekeeping Exceptions  
10. Communication  
11. Reports  
12. History & Audit  
13. Shift Control  
14. Offline & Sync  
15. Administration  

Engineering waves (this plan):

| Wave | Name | Product coverage | Commission now? |
|---|---|---|---|
| 0 | Foundation freeze | Enables all later work | **Yes — first** |
| 1 | Workspace shell (Entry) | Product 1 | After 0 |
| 2 | Board + Cleaning | Product 2–3 | After 1 |
| 3 | Inspection & readiness | Product 4 | After 2 |
| 4 | Maintenance inside HK | Maintenance (locked in-module) | After Phase 0 **and** canonical `maintenance_status` writer |
| 5 | Requests via Guest Services | Product 5 | After GS read/write reuse is confirmed |
| 6 | Exceptions | Product 9 | After 2–4 signals exist |
| 7 | History | Product 12 | After 2–5 event coverage |
| 8 | Responsive field ops | Mobile/PWA behaviour on existing tabs | After 2–3 |
| 9–15 | Held | Product 6–8, 10–11, 13–15 + Admin | **Not until Settings/runtime** |

Phase 4 (Maintenance) stays in this module. **4A writer gate before 4B UX.** Do not wait for a separate Maintenance package.

---

## Phase 0 — Foundation Freeze

### Functional Scope

Lock the state model, unify **every** “is this room ready?” call site on `evaluateRoomReadinessWithPolicy`, inventory `pickup` writers/readers, keep CI transition honesty, and **consume Settings as-is**. No UX expansion. No Settings consolidation.

### Product Coverage

None of the 15 UIs as new screens. Enables Board/Inspection/FO consistency.

### Existing Capability Reused

All current RPCs, `evaluateRoomReadinessWithPolicy`, `isRoomReady`, `foRoomReadiness`, FO CI/CO RPCs, restriction RPC. Card 2 + SET4 **as they work today**.

### Backend Work

- Tests lock operational HK CHECK to `{dirty,clean,inspected,pickup}` — fail if `ready`, `assigned`, or `cleaning` / `cleaning_in_progress` appear as writable room codes.
- Document in comments/tests: room HK vs task status vs derived ready vs physical OOO vs `maintenance_status`.
- Guard: FO TypeScript must not `.update({ housekeeping_status })` (already tested — keep).
- Guard: complete-task must not write maintenance tickets or `maintenance_status`.
- Keep `guest_check_in` invalid-target no-op; do **not** expand the room CHECK.
- **Required:** point FO Room Quick View, arrivals, room rack Confirm, reservation exceptions, and any HK dashboard/rack ready flag at `evaluateRoomReadinessWithPolicy` (HK owns the policy; FO call sites must switch). Simpler `dirty|pickup` heuristics are forbidden.
- Inventory `pickup`: list writers and readers (test or comment lock). No schema change.
- Consume Card 2 + SET4 as today. **Do not** declare a new Settings master or add a third store.
- Tests: mapping table; invalid transition target no-op; readiness policy matrix (OOO, dirty, clean, inspected, pickup, `maintenance_status`).

### Frontend Work

None required. Optional comment fix on `housekeeping.server.ts`.

### Database / Migration Work

**None.** Do not add `ready`, `assigned`, or `cleaning` to `hotel_rooms.housekeeping_status`. Do not add DND/linen/L&F tables. Do not promote assign/start/cancel RPCs.

### Settings Dependencies

Read-only, as-is. Settings Card 2 vs SET4 consolidation is **not** this phase.

### Cross-Module Dependencies

FO and reservation exception/QV/rack/check-in (readiness keys). Inventory restriction writer unchanged.

### Ownership Risks

Do not “fix” readiness by writing a Ready column. Do not merge `maintenance_status` into `housekeeping_status`. Do not move Maintenance out of HK. Do not rewrite admin mutations in this phase.

### Tests Required

Contract tests on writers listed in section 13; CHECK vocabulary; `evaluateRoomReadinessWithPolicy` cases; every listed ready? surface uses that policy; CI RPC does not write illegal HK codes; pickup still in CHECK.

### Browser Verification

Smoke FO check-in, arrivals, FO Room Quick View, and room rack: Ready / Not Ready **agree**. No CatchBoundary.

### PASS Criteria

- State mapping in §1A is the documented contract; tests fail if operational CHECK gains `ready` / `assigned` / `cleaning`.
- Single readiness function is used on Board-bound helpers, FO QV, arrivals, rack, check-in, and exceptions (HK Board/QV may still be unbuilt — their **helpers** must be ready).
- Maintenance writers remain separate from complete-task.
- Settings still dual-read; no third source.
- No new tables.

### Explicitly Deferred

Board redesign, work orders, checklists, DND storage, Guest Services queue, permissions catalogue enforcement, writer-hardening RPCs, Card 2 vs SET4 consolidation.

**Cursor prompt:** **SINGLE PROMPT** — readiness unification + locks and tests. No UX expansion.

---

## Phase 1 — Workspace Shell (Entry)

### Functional Scope

Canonical PMS Housekeeping home, URL-addressable areas, role-gated IA mapped toward Board / Cleaning / Inspection / Requests / Maintenance / Exceptions / History. Legacy route redirect. Maintenance remains an **area inside HK**, including the existing `/restaurant/pms/maintenance` entry.

### Product Coverage

Product phase 1 (Entry). Does not yet rebuild board UX.

### Existing Capability Reused

`HousekeepingWorkspace`, PMS modules, role scopes.

### Backend Work

None beyond access already in `getHousekeepingAccess`.

### Frontend Work

- Write `?tab=` on tab change; keep validateSearch.
- Redirect `/restaurant/housekeeping` → `/restaurant/pms/housekeeping` (preserve tab).
- Map IA (do not delete writers):
  - Board ← dashboard + rack demand (landing **Board**, not Dashboard-as-KPI home)
  - Cleaning ← board + rack actions
  - Inspection ← inspections
  - Requests ← placeholder routed to Phase 5 (honesty empty or GS count, **not** fake CRUD)
  - Maintenance ← existing tab + maintenance route
  - Exceptions ← discrepancies (+ derived later)
  - History ← history
  - Restrictions remain an action from Board/QV, not a competing room-state system — may stay a supervisor tab until Phase 2 QV exists
- Reports workspace link that still points at legacy HK history must use the canonical route.

### Database / Migration Work

None.

### Settings Dependencies

`settings.enabled` already gates ops.

### Cross-Module Dependencies

PMS shell, FO escape links (`HK_HREF` / `MAINTENANCE_HREF` stay valid).

### Ownership Risks

Do not create a standalone Maintenance workspace component. Do not add Settings editors to Entry.

### Tests Required

Route redirect; `?tab=` round-trip; maintenance route still opens Maintenance area; role tab visibility.

### Browser Verification

Open both PMS routes, switch areas, refresh, legacy URL lands on canonical. Housekeeper vs supervisor vs maintenance role.

### PASS Criteria

- Canonical route is the live home.
- Maintenance still inside HK module.
- No fake Linen / L&F / Turndown tabs.

### Explicitly Deferred

Quick View, mobile worklist, chrome visual polish beyond tokens.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 2 — Housekeeping Board + Cleaning Operations

### Functional Scope

Operational Board and Cleaning worklist on **`housekeeping_tasks` + `listRoomRack`**. Consume FO/reservation demand as **reads** (arrivals, departures, stayovers, VIP, early arrival, room change) for priority/sort — do not copy stay rows.

### Product Coverage

Product phases 2 and 3.

### Existing Capability Reused

`createHousekeepingTask`, `updateHousekeepingTask`, `completeHousekeepingTask`, checkout auto-task, SET4 `cleaningTypeAllowed`, Card 2 priorities, `listHousekeepingStaff`.

### Backend Work

- Board read model: rooms + open task + occupancy + **derived ready from the Phase 0 helper** + FO demand flags (reuse helpers).
- Apply `pms_housekeeping_event_priority` (or TS equivalent of stored rules) on more create paths (arrival/stayover/VIP) **without** a new priority engine.
- Keep `updateHousekeepingTask` as the single assign/start/cancel writer. **Do not** promote to new RPCs in this phase (writer-hardening stream).
- Still one open task per room.
- Present `pickup` as an additional HK state; do not treat it as Ready or drop it.

### Frontend Work

- Board as default landing.
- Cleaning: assign, start, complete, notes; housekeeper sees own assignments.
- Room Quick View (read): HK status, task, occupancy snippet, **same derived ready + reason**, links to FO stay / Maintenance / Inventory — **no FO writers**.
- Responsive table → attendant-usable stacked actions (Phase 8 can deepen).
- Do not add turndown create until Phase 9.
- Consume SET4 cleaning-type allowlist and Card 2 priorities **as they work today**.

### Database / Migration Work

**None.** No assign/start/cancel RPCs. No `ready` column. No `pickup` removal.

### Settings Dependencies

Cleaning types, priorities, assignment override — consume existing (Card 2 + SET4 as-is). No Settings rewrite.

### Cross-Module Dependencies

FO/Reservations read models; Inventory room master; Guest Profile names.

### Ownership Risks

Do not write `hotel_rooms.status`. Do not auto-OOO from a dirty room. Do not create tasks from a duplicated reservation table.

### Tests Required

Task lifecycle; one-open-per-room; housekeeper start-only-own; checkout still creates departure cleaning; priority rules; board does not UPDATE HK status except via complete RPC.

### Browser Verification

Create/assign/start/complete on a room; rack and board stay consistent; FO arrival still shows `room_not_ready` when policy says so.

### PASS Criteria

- Cleaning lifecycle is task+room mapped per section 5.
- Demand context is reused reads.
- Canonical complete RPC still the only complete-task writer.

### Explicitly Deferred

Auto-assignment, workload credits, zones, SLA timers, checklists, writer-hardening RPCs.

**Cursor prompt:** **SINGLE** (split only if demand read model explodes).

---

## Phase 3 — Inspection & Room Readiness

### Functional Scope

Inspection **workspace** on existing pass/fail RPC. Ready stays **derived** (already unified in Phase 0). **No checklists.** Notes-only fail criteria remain.

### Product Coverage

Product phase 4 (Inspection & Room Readiness UI). Readiness calculation is **not** redone here.

### Existing Capability Reused

`inspectRoom`, inspections table, fail → re_clean, supervisor approval flag, Phase 0 readiness helper.

### Backend Work

- Keep queue derived from `clean` (or policy-driven “awaiting inspection”) — **no inspection-queue table**.
- Do **not** add checklist / failed-criteria tables. Settings master does not exist.
- Do **not** re-open readiness unification unless a call site was missed in Phase 0.

### Frontend Work

- Inspection area: awaiting + history + pass/fail.
- Ready shown as outcome + reason from the canonical helper, not a status dropdown of catalog “Ready”.

### Database / Migration Work

None. Do not store Ready on `hotel_rooms`.

### Settings Dependencies

`inspectionRequired`, `supervisorApprovalRequired` — consume as-is. Checklists = **hold**.

### Cross-Module Dependencies

FO check-in gate already uses the helper; Inventory OOO; Maintenance `maintenance_status` (read only).

### Ownership Risks

Do not let inspectors write OOO. Do not treat `inspected` as sellable inventory. Do not add `ready` to the room enum.

### Tests Required

Pass → inspected (or transition target); fail → dirty + re_clean. Readiness matrix lives in Phase 0 tests.

### Browser Verification

Pass and fail a room; FO check-in blocked/allowed per the same policy as the Inspection ready reason.

### PASS Criteria

- Inspection RPC preserved.
- Inspection UI usable without checklists.
- No checklist theatre.

### Explicitly Deferred

Checklist items, failed-criteria codes, re-inspection SLA, inspector-only hotel role beyond current supervisor gate.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 4 — Maintenance Inside Housekeeping

### Functional Scope

**Gate first:** one canonical writer for `hotel_rooms.maintenance_status` (dedicated Maintenance-domain function/RPC). Cleaning / complete-task must not call it.

**Then:** evolve `housekeeping_maintenance_requests` toward a work-order model **in this module**. Keep OOO/OOS on `pms_set_room_operational_restriction`. HK readiness continues to **consume** maintenance state.

Do **not** start WO UX/catalogue expansion until the writer exists and tests prove create/start/resolve keep tickets and `maintenance_status` consistent.

### Product Coverage

Maintenance (locked inside Housekeeping). Not a new PMS package.

### Existing Capability Reused

`createMaintenanceRequest`, `updateMaintenanceRequest`, Card 2 `pms_maintenance_status_rules`, SET4 catalogues, restriction RPC, Room Inventory More CTA. Same workspace / `moduleKey = housekeeping`.

### Backend Work

1. Canonical `maintenance_status` writer + tests (ticket open/start/resolve ↔ room column). Not `saveRoom`. Not complete-task.
2. Only after (1): extend tickets — **do not** add a parallel `work_orders` table unless a commissioned schema proves tickets cannot carry WO numbers/assignee/start.
3. Consume SET4/Card 2 categories/priorities instead of hardcoded CHECKs only if commissioned (may need CHECK relax — dual-lane).
4. OOO/OOS still Inventory RPC; HK/Maintenance UI may call `setRoomRestriction`.
5. Do **not** rewrite assign/start/cancel **cleaning** paths here (writer-hardening stream). Maintenance ticket writes may stay server-fn + admin until this phase’s canonical maintenance-status writer exists; that writer is the exception because it is the Phase 4 gate, not opportunistic hardening.

### Frontend Work

- Only after the writer gate: Maintenance area list, create, start, complete, notes, room link.
- `/restaurant/pms/maintenance` remains the deep link.
- Do not build a full CMMS (inventory parts, vendor contracts).

### Database / Migration Work

Writer may be SQL RPC or tightly validated server function — **no new room-state column**. Ticket CHECK/catalogue FK / WO number only if commissioned after the writer gate. Dual-lane. No linen/L&F hitchhike.

### Settings Dependencies

Consume catalogues **as they work today**. SLA warning catalogue remains display-only until Settings runtime.

### Cross-Module Dependencies

Inventory restriction + assignment rules; FO readiness `maintenanceClearRequired` (already Phase 0 helper).

### Ownership Risks

Do not move this to a top-level module. Do not duplicate restriction writers. Do not treat `maintenance_status` values `out_of_order` / `out_of_service` as replacing `hotel_rooms.status`. Do not let Cleaning write maintenance state.

### Tests Required

Writer gate: create/start/resolve cannot leave ticket resolved + `maintenance_required` (or open ticket + `normal` if policy says otherwise). Complete-task unchanged. Restriction RPC still the OOO writer. Readiness blocks when `maintenanceClearRequired`.

### Browser Verification

After the gate: log issue, start, resolve; FO check-in / QV agree on maintenance-clear. Restrictions still set OOO via existing dialog.

### PASS Criteria

- One `maintenance_status` writer.
- Tickets evolved, not forked.
- Maintenance nav still inside HK.
- Inventory owns physical OOO.

### Explicitly Deferred

Vendor management, PM schedules (`pms_maintenance_rules` already says not schedules/instances), parts inventory, writer-hardening of **cleaning** assign/start/cancel.

**Cursor prompt:** **SPLIT** — (A) maintenance-status writer + tests; (B) WO UX/catalogue only after A passes.

---

## Phase 5 — Housekeeping Requests (Guest Services Execution)

### Functional Scope

HK Requests area **executes** Guest Services items routed to housekeeping. Canonical create/update remain `createGuestServiceRequest` / `updateGuestServiceRequest` / `guest_service_history`.

### Product Coverage

Product phase 5.

### Existing Capability Reused

Card 4 types (`HK_CLEAN`, `HK_TOWELS`, laundry, turndown), Guest Services workspace writers, FO GS history reads.

### Backend Work

- HK read model: open GS rows assigned/categorised to HK (department assignment Card 4/5 if present).
- Complete/cancel through **GS update writer**, optionally spawning a `housekeeping_tasks` row when the request **is** a clean — do not insert into a new HK request table.
- Tests forbidding a second request table.

### Frontend Work

- Requests tab becomes a real queue (honesty: empty state if none).
- No HK-local request composer that bypasses GS types.

### Database / Migration Work

None (no new request table).

### Settings Dependencies

Card 4 types + department routing should be LIVE. SLA display consume-only.

### Cross-Module Dependencies

Guest Services, FO (do not revive `fo_guest_requests` as HK runtime).

### Ownership Risks

Do not merge GS into `housekeeping_tasks`. Do not let HK create a parallel SLA engine.

### Tests Required

HK complete calls GS writer; no `from("hk_requests")`; Card 4 type codes used.

### Browser Verification

Create a HK-typed request in Guest Services; it appears in HK; complete updates GS history.

### PASS Criteria

- One request engine.
- HK is execution UI.

### Explicitly Deferred

Charge posting (Cashiering), turndown as a cleaning type (Phase 9).

**Cursor prompt:** **SINGLE** or **SPLIT** if GS filter APIs are missing.

---

## Phase 6 — Housekeeping Exceptions

### Functional Scope

Exception desk: **derived** signals plus existing persisted discrepancies.

### Product Coverage

Product phase 9.

### Existing Capability Reused

`housekeeping_discrepancies`, FO `room_not_ready` / `room_unavailable` / `room_discrepancy`, night-audit dirty-vacant-without-task.

### Backend Work

- Derived feed: dirty + upcoming arrival, inspect fail, maintenance blocker, OOO vs assigned stay, open task stale (if timestamps suffice).
- Persist **only** existing discrepancies. **Do not** persist DND / Refused Service in this phase — storage model is **undecided**. They are service conditions, not task statuses and not new `housekeeping_status` values.
- Resolution = underlying writers (complete clean, inspect, restriction, GS, work order).

### Frontend Work

Exceptions area (replace/expand Discrepancies). No fake “resolve” that only flags UI.

### Database / Migration Work

None. Do not add DND/refused tables.

### Settings Dependencies

None new.

### Cross-Module Dependencies

FO, Inventory, Maintenance, Reservations.

### Ownership Risks

Do not duplicate FO exception tables.

### Tests Required

Derived keys stable; discrepancy resolve still `resolveDiscrepancy`.

### Browser Verification

Open exception → action lands on Board/Inspection/Maintenance/FO as appropriate.

### PASS Criteria

- Derived preferred.
- Discrepancy writer preserved.
- DND / Refused Service still have **no** storage.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 7 — History & Audit

### Functional Scope

Searchable HK/Maintenance history over `housekeeping_history` (+ inspection/discrepancy/WO rows as filters). Do not create `housekeeping_audit_2`.

### Product Coverage

Product phase 12.

### Existing Capability Reused

`listHousekeepingHistory`, `recordHousekeepingEvent`, RPC-written events, FO room QV mixed history.

### Backend Work

- Ensure assign/start/complete/inspect/restriction/WO/GS-execution emit events (fill gaps).
- Actor = `actor_membership_id`.

### Frontend Work

History area: filter by room, event type, actor, date. Link to Room QV.

### Database / Migration Work

None unless event_type CHECK must grow (dual-lane).

### Settings Dependencies

None.

### Cross-Module Dependencies

Inventory events remain on restriction path — show, do not rewrite.

### PASS Criteria

- One history store for HK ops.
- No parallel audit table.

**Status (2026-09-27):** Searchable History over `housekeeping_history`; GS execution emits `guest_request_updated` (CHECK dual-lane 0101). Restriction events remain inventory-RPC written into the same store.

**Cursor prompt:** **SINGLE PROMPT**.

---

## Phase 8 — Responsive Field Operations

### Functional Scope

Attendant/inspector/maintenance **mobile web** flows on the same routes: worklist, start/complete, inspect, request execute, WO start/complete. No separate app.

### Product Coverage

Cross-cutting (proposal Web + Mobile/PWA).

### Existing Capability Reused

Phases 2–5 writers.

### Backend Work

None expected.

### Frontend Work

Stacked worklist; large tap targets; no `min-w-[900px]` as the only layout.

### Settings Dependencies

None.

### PASS Criteria

Phone viewport can complete a clean and an inspection without horizontal-only tables as the sole UI.

**Status (2026-09-27):** Same routes. Phone stacked worklists for Board, Cleaning, Inspection, Requests, Maintenance. Wide tables remain `md+` / `lg+` only.

**Cursor prompt:** **SINGLE PROMPT** after Phase 2–3 exist.

---

## Phase 9 — Turndown & Special Cleaning (HELD)

**Hold** until Settings cleaning types include turndown as a **writable** `housekeeping_tasks.task_type` (CHECK + `TASK_TYPES` + SET4) **or** turndown remains Guest Services-only execution (Phase 5) without a HK task type.

Do not show a Turndown board that cannot insert.

PASS when commissioned: type allowed, duration/SLA from Settings if LIVE, else honesty without fake timers.

---

## Phase 10 — Linen & Supplies (HELD)

**MISSING** foundation. Do not build UI. Revisit when Settings linen/supply categories exist **and** a writer is owned (HK vs shared Inventory). Default: consume Inventory, do not fork stock ledgers.

---

## Phase 11 — Lost & Found (HELD)

**MISSING** foundation (zero tables). Do not build UI. Revisit when Settings L&F rules + a canonical table/writer exist.

---

## Phase 12 — Communication (HELD)

Card 4 has `room_ready` / `room_not_ready`. **No HK emitter.** Hold until Notifications dispatch is callable. Then emit from existing writers; do not build a HK mailer.

---

## Phase 13 — Reports (HELD)

Dashboard counts are ops, not a report pack. Hold until Reports module can host HK queries. Do not add a fake Reports tab.

---

## Phase 14 — Shift Control (HELD)

`pms_shift_definitions` is not HK attendant shifts. Cashier shifts are unrelated. Hold until Settings HK shift runtime exists. Do not compose a fake handover ledger.

---

## Phase 15 — Offline, Administration, Permissions Cutover (HELD)

| Item | Status | Rule |
|---|---|---|
| Offline & Sync | Card 8 flags only | Do not implement a HK-local queue |
| Administration | Card 2/SET4/Card 7 exist | HK shows read-only links; no second config |
| `pms_permissions` | Catalogue unused | Keep `restaurant_users.role` until Security cutover is commissioned |
| Zones / workload / auto-assign | MISSING | Hold |
| Inspection checklists | MISSING | Hold |

---

## 11. Product-Phase Traceability

Implementation types: REUSE | FRONTEND ONLY | BACKEND READ MODEL | EXISTING WRITER WRAP | NEW DOMAIN WRITER | SMALL SCHEMA EXTENSION | NEW DOMAIN FOUNDATION | SETTINGS INTEGRATION | CROSS-MODULE INTEGRATION | DEFERRED

| Product phase | Engineering wave | Existing status | Implementation type | Dependency | Final target |
|---|---|---|---|---|---|
| 1 Entry | 1 | PARTIAL | FRONTEND ONLY | Phase 0 | Canonical shell + URL |
| 2 Board | 2 | PARTIAL | BACKEND READ MODEL | FO/Res reads | Demand-aware board |
| 3 Cleaning | 2 | LIVE core | EXISTING WRITER WRAP | Tasks RPCs | Field worklist |
| 4 Inspection & readiness | 3 | PARTIAL | EXISTING WRITER WRAP | Inspect RPC; **readiness already Phase 0** | Inspection UI; derived ready |
| Maintenance (in-module) | 4 | PARTIAL | NEW DOMAIN WRITER (evolve tickets) | **4A `maintenance_status` writer gate** then catalogues | Work orders inside HK |
| 5 Requests | 5 | ABSENT in HK UI | CROSS-MODULE INTEGRATION | Guest Services | GS execution |
| 6 Turndown | 9 | SETUP ONLY | DEFERRED | Settings + CHECK | Task type or GS-only |
| 7 Linen & supplies | 10 | MISSING | DEFERRED | Settings + Inventory | No fork |
| 8 Lost & Found | 11 | MISSING | DEFERRED | Settings + table | New foundation later |
| 9 Exceptions | 6 | PARTIAL | BACKEND READ MODEL | Discrepancies + derived | Derived desk |
| 10 Communication | 12 | SETUP ONLY | DEFERRED | Notifications | Emit from writers |
| 11 Reports | 13 | MISSING | DEFERRED | Reports module | Catalog |
| 12 History | 7 | LIVE | BACKEND READ MODEL | `housekeeping_history` | Searchable History + Room QV |
| 13 Shift | 14 | MISSING | DEFERRED | Settings HK shifts | No fake |
| 14 Offline | 15 | SETUP ONLY | DEFERRED | Platform | No local queue |
| 15 Administration | 15 | PARTIAL | SETTINGS INTEGRATION | Property Setup | Read-only |
| Mobile/PWA | 8 | LIVE | FRONTEND ONLY | Phases 2–3 | Same routes |

---

## 12. Database Strategy

**Reuse (no new tables for Phases 0–3, 5–8):** `hotel_rooms` HK/physical/maintenance columns, `housekeeping_tasks`, `housekeeping_inspections`, `housekeeping_discrepancies`, `housekeeping_maintenance_requests`, `housekeeping_history`, Card 2 HK/maintenance tables, SET4 JSONB **consumed as-is** (Settings consolidation is a separate stream), `pms_operational_inventory_blocks`, `pms_room_inventory_events`, `hotel_reservations`, `guest_service_history`, `restaurant_users`.

**RPCs to keep:** `housekeeping_create_task`, `housekeeping_complete_task`, `housekeeping_inspect_room`, `pms_housekeeping_transition_target`, `pms_housekeeping_event_priority`, `pms_set_room_operational_restriction`, `check_in_hotel_reservation`, `check_out_hotel_reservation`, `pms_evaluate_room_assignment`.

**Small extensions (only if proven in the named phase):**

| Extension | Phase | Owner |
|---|---|---|
| Assign/start/cancel DEFINER RPCs | **Writer-hardening stream** (not Phase 2 UI) | Housekeeping |
| Canonical `maintenance_status` writer (RPC or validated fn) | **4A gate** | Maintenance-in-HK |
| Task type `turn_down` CHECK | 9 hold | Housekeeping + Settings |
| Ticket CHECK relaxed to catalogue codes / WO number | 4B after writer gate | Maintenance-in-HK |
| `housekeeping_history.event_type` CHECK growth | 7 | Housekeeping |
| DND / Refused Service persist | **Not in this plan** — model undecided | Housekeeping + Settings later |

**New foundations (not implied by a screen):**

| Foundation | Phase | Owner |
|---|---|---|
| Linen / supply ledger | 10 | Settings + Inventory (preferred) |
| Lost & Found | 11 | Settings + HK |
| HK shift runtime | 14 | Settings |
| Offline queue | 15 | Platform |
| Inspection checklist items | after Settings | Settings master; HK executes |

`drizzle/schema.ts` is blank — TS truth is `src/integrations/supabase/types.ts` + migrations. Dual-lane any SQL.

---

## 13. Canonical Writer Policy

| Action | Canonical writer | Owner | Legacy / duplicate risk | Plan |
|---|---|---|---|---|
| Create cleaning task | `createHousekeepingTask` → `housekeeping_create_task` | Housekeeping | Direct insert | Never |
| Assign / start / cancel | `updateHousekeepingTask` | Housekeeping | Second TS helper; admin mutation | Keep one function. RPC = **writer-hardening stream**, not UI phases |
| Complete cleaning | `completeHousekeepingTask` → `housekeeping_complete_task` | Housekeeping | Client status update | Never; must not write `maintenance_status` |
| Inspect | `inspectRoom` → `housekeeping_inspect_room` | Housekeeping | Direct inspection insert | Never |
| HK status on CI | `check_in_hotel_reservation` | FO RPC, HK transition helper | FO `.update(housekeeping_status)` | Forbidden |
| HK status on CO | `check_out_hotel_reservation` | FO RPC + auto task | Duplicate dirty write in TS | Forbidden |
| Manual HK default | `saveRoom` if `manualStatusChangeAllowed` | Room Inventory UI | HK rack dropdown write | Do not add rack direct writes |
| OOO / OOS | `setRoomRestriction` → `pms_set_room_operational_restriction` | Room & Inventory | Direct `hotel_rooms.status` | Never |
| Discrepancy | `createDiscrepancy` / `resolveDiscrepancy` | Housekeeping | FO-only flag; admin mutation | FO consumes. RPC = writer-hardening stream |
| Maintenance ticket / WO | `createMaintenanceRequest` / `updateMaintenanceRequest` (evolve) | Maintenance **domain** (HK **module**) | Parallel work_order table | Evolve, don’t fork |
| `maintenance_status` | Dedicated Maintenance writer | Maintenance domain | `saveRoom` / complete-task | **Phase 4A gate** — required before WO UX |
| Guest HK request | `createGuestServiceRequest` / `updateGuestServiceRequest` | Guest Services | HK request table | Forbidden |
| Policy save | `savePmsCard2Housekeeping`, `saveMaintenanceRules`, `saveInventoryRules` | Settings | HK settings clone / third store | Forbidden |
| Event log | `recordHousekeepingEvent` + RPC history | Housekeeping | Second audit table | Forbidden |

---

## 14. Frontend Workspace Contract

- Canonical route: `/restaurant/pms/housekeeping`.
- Maintenance deep link: `/restaurant/pms/maintenance` (same workspace).
- **Board is planned default landing** (today Dashboard — change in Phase 1–2).
- Horizontal areas URL-addressable (`?tab=` writeback, Phase 1).
- Room click → Room Quick View (Phase 2).
- Small tasks → dialog/sheet.
- Complex inspect/WO → dialog or overlay; not a new route tree.
- Legacy `/restaurant/housekeeping` redirects after Phase 1.
- Phone: same routes; Phase 8 worklist. No native app.
- Escape to Settings, FO, Inventory, Guest Services, Reports — intentional.
- No stacked-sheet traps.

---

## 15. Quick View / Overlay Contract

### Room Quick View (HK)

Room number, type, floor, `housekeeping_status`, derived ready + reason, open task, occupancy snippet (from reservations), maintenance ticket/WO summary, physical OOO/OOS, recent `housekeeping_history`. CTAs: assign/start/complete, inspect, log WO, set restriction (supervisor), open FO stay. **No** reservation amend, **no** folio post.

### Task overlay

Task type, priority, assignee, timestamps, notes, complete/cancel.

### Guest / stay

Open FO/Reservation QV for stay identity. Do not merge guest master into HK Room QV.

Do not collapse Room QV, Task overlay, and Guest QV into one component.

---

## 16. Exception Strategy

- **Derived:** not ready (canonical policy), overdue/stale assignment (from timestamps), inspect fail, maintenance blocker, dirty + arrival, OOO vs stay.
- **Persisted:** discrepancies (existing) only.
- **DND / Refused Service:** missing foundation. Service conditions — **not** cleanliness, **not** task status. Storage **deferred**; no Phase 6 table.
- Resolution = canonical writers.
- Prefer derived unless a record must be closed independently of room state.

---

## 17. Approval Strategy

**Current:** role gates (`housekeepingScope`); Card 2 supervisor inspect + assignment override. `pms_permissions` / `pms_approval_rules` are **not** HK action gates. `restaurant_users.role` remains **authoritative** for Phases 0–8.

**Future:** Security-owned RBAC alignment **after Settings is ready** (Phase 15 hold). Do not switch Card 7 during first UI phases.

---

## 18. Guest Services Strategy

**Canonical runtime:** `guest_service_history`.

HK tasks = room cleaning jobs. Maintenance tickets = property repair. Guest Services = guest/stay requests.

Phase 5 HK Requests = execution UI. Freeze any urge to add `housekeeping_requests`. Do not use `fo_guest_requests` as HK runtime.

---

## 19. Front Office / Night Audit / Shift Strategy

| Concept | Owner | Housekeeping |
|---|---|---|
| Check-in readiness | HK policy + FO gate | Provide `evaluateRoomReadinessWithPolicy` |
| CI/CO HK flip | Existing stay RPCs | Transition helper; no FO SQL |
| Demand (arrivals/deps/VIP) | FO / Reservations | Read-only board context |
| Business date | Night Audit | Read for “today” queues |
| Dirty vacant without task | Night Audit already reads | Keep derived; optional HK exception |
| HK attendant shift | Settings (absent) | Phase 14 hold |
| Cashier shift | Cashiering | Irrelevant |

---

## 20. Offline Strategy

Card 8 lists housekeeping as a capability flag. **There is no offline runtime.** Phase 15: do not implement a HK-only IndexedDB writer that diverges from RPCs.

---

## 21. Test Strategy

- Contract tests: writer names, operational CHECK vocabulary (`ready`/`assigned`/`cleaning` forbidden), no FO HK updates, no second request table, complete-task does not write maintenance, **every ready? surface uses `evaluateRoomReadinessWithPolicy`**.
- Unit: `evaluateRoomReadinessWithPolicy`, task status machine, inspect fail path, assignment override policy, `cleaningTypeAllowed`.
- Dual-lane: any new SQL in `drizzle/migrations` and `supabase/migrations`.
- Do not run broad test suites or `npm run build` from this plan document.
- Commissioned UI phases require authenticated browser smoke on `/restaurant/pms/housekeeping` and `/restaurant/pms/maintenance`.

---

## 22. Browser Verification Contract

A UI phase is not PASS until authenticated smoke:

- No CatchBoundary
- No console runtime errors
- Tabs URL-round-trip (after Phase 1)
- Housekeeper / supervisor / maintenance role gates
- Complete clean still uses complete RPC (rack + board agree)
- Inspect pass/fail still uses inspect RPC
- FO check-in still blocked when not ready
- FO Room Quick View / arrivals / rack Ready labels **agree** with check-in (canonical policy)
- Maintenance route still HK module
- Reservation / FO / Room Inventory not regressed

Do not claim browser PASS from unit tests alone.

---

## 23. Definition of Done

Housekeeping module is complete only when:

- Non-deferred product phases 1–5, 9, 12 + in-module Maintenance + responsive field ops are implemented
- Ownership boundaries respected; no duplicate engines
- Canonical writers used
- Settings remains master **configuration** owner; HK consumes as-is (no third store). Card 2 vs SET4 consolidation is Settings debt, not an HK DoD item.
- Ready remains **derived**. `hotel_rooms.housekeeping_status` does not gain `ready`, `assigned`, or `cleaning`.
- Maintenance remains inside Housekeeping; tickets evolved, not forked; `maintenance_status` has one writer.
- Browser verification passes
- Deferred items remain in section 24. Writer-hardening and Card 2 vs SET4 are **streams**, not UI phases.

Module COMPLETE remains **NO** until that bar and hotel UAT.

---

## 24. Deferred Register

| Item | Reason | Dependency | Revisit trigger |
|---|---|---|---|
| Writable room status `ready` / `assigned` / `cleaning` | Business workflow ≠ one enum | — | **Do not revisit** as a room CHECK |
| `pickup` removal | Live operational code | Usage documented in Phase 0 | Only after a dedicated meaning/usage decision |
| DND / Refused Service persist | Missing foundation; model undecided | Settings + exception design | Plan revision that defines storage — **not** Phase 6 default |
| Card 2 vs SET4 consolidation | Dual runtime config | Settings stream | Settings programme commissions it |
| Writer-hardening (assign/start/cancel/discrepancy RPC) | Authorized admin mutations work | Dedicated stream | After UI phases; do not mix with Board UX |
| Turndown task type | CHECK + SET4 mismatch | Settings + migration | Phase 9 |
| Linen & supplies | No tables | Settings + Inventory | Phase 10 |
| Lost & Found | No tables | Settings | Phase 11 |
| Communication send | No emitter | Notifications | Phase 12 |
| HK report pack | No report engine | Reports | Phase 13 |
| HK shifts / auto-assign / zones / workload | Missing masters | Settings | Phase 14 / Settings |
| Offline | No platform | Card 8 runtime | Phase 15 |
| `pms_permissions` enforcement | Catalogue only | Security after Settings | Phase 15 |
| Inspection checklists | No item table | Settings | After Settings LIVE |
| Custom catalog codes on `hotel_rooms` | CHECK forbids | — | **Do not sneak in UX** |
| Standalone Maintenance module | Locked architecture | — | **Do not revisit** |
| Second guest request table | Locked architecture | — | **Do not revisit** |
| Second room-state system | Locked architecture | — | **Do not revisit** |

---

## 25. Recommended Execution Method

Default: **one coherent phase = one Cursor implementation prompt** when the phase wraps existing writers.

| Phase | Prompt | Why |
|---|---|---|
| 0 | SINGLE | State freeze **plus** readiness unification + pickup usage inventory |
| 1 | SINGLE | Shell / routes |
| 2 | SINGLE (split if demand read explodes) | Board + tasks; **no** RPC rewrite |
| 3 | SINGLE | Inspection UI; checklists held |
| 4 | SPLIT | 4A maintenance-status writer; 4B WO UX after gate |
| 5 | SINGLE or SPLIT | Cross-module GS |
| 6 | SINGLE | Derived desk; no DND table |
| 7 | SINGLE | History read model |
| 8 | SINGLE | CSS/layout |
| 9–15 | DO NOT IMPLEMENT | Settings/runtime holds |
| Writer-hardening | SEPARATE later prompt | Not mixed with UI |
| Card 2 vs SET4 | Settings programme | Not HK |

Do not create dozens of tiny prompts. Re-audit before any new foundation table.

---

## 26. Immediate Next Step

**First implementation action: Phase 0 — Foundation Freeze (state model + canonical readiness everywhere).**

The live board already works. Expanding Board/Inspection UX on top of inconsistent `room_not_ready`, a tempting `ready` room column, unsynchronized `maintenance_status`, or a Settings rewrite would encode the debt.

Sequence:

1. Commission **Phase 0** (single prompt): freeze CHECK; unify ready? on HK Board helpers, HK/FO Room QV, arrivals, rack, check-in, exceptions; document `pickup` usage; consume Settings as-is.
2. Then **Phase 1** shell (canonical route, tabs, Board as home).
3. Then **Phase 2** Board + Cleaning (derived ready; keep `pickup`; no writer RPC rewrite).
4. Then **Phase 3** Inspection workspace (no checklists).
5. **Phase 4A** canonical `maintenance_status` writer **before** 4B WO UX.
6. Do **not** start Linen, L&F, Turndown ops, Offline, Reports, Shifts, DND storage, Administration, or Card 7 permission theatre.
7. Do **not** split Maintenance into a new PMS module.
8. Do **not** add `ready`, `assigned`, or `cleaning` to `hotel_rooms.housekeeping_status`.

---

## Do Not Touch (protected)

- Settings configuration editors (Card 2 / SET4 / Card 4 / Card 7)
- Room Inventory availability engine
- Reservation priced create/amend
- FO steppers except agreed transition **inside** existing CI/CO RPCs
- Guest Services create/update writers (invoke, don’t copy)
- Cashiering ledger
- Night Audit close
- Notifications delivery engine
- Replacement of `housekeeping_tasks` with a new cleaning engine
- Top-level Maintenance package extraction
- Adding `ready` / `assigned` / `cleaning` to `hotel_rooms.housekeeping_status`
- A third Housekeeping configuration store
- `housekeeping_requests` (or any second guest-request engine)

---

## Final validation (this document)

1. Fifteen product phases mapped — **yes** (section 11).
2. Twelve locked decisions recorded — **yes** (§1A).
3. Every engineering phase has PASS criteria or an explicit HOLD — **yes**.
4. Settings holds identified — **yes** (Phases 9–15, section 8, Settings debt stream).
5. Ownership explicit — **yes** (sections 1A, 2, 5, 13).
6. Live writers preserved; writer-hardening is a later stream — **yes**.
7. Maintenance stays inside Housekeeping; domain writer gated — **yes**.
8. Ready is derived; no new room HK enum values — **yes**.
9. Readiness unification is Phase 0, not Phase 3 leftover — **yes**.
10. No application implementation in this change set — **yes** (this file only).
