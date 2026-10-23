# Front Office capability and integration audit

Read-only audit of the current NORU Front Office implementation against Front Office product targets UI-01 through UI-118. This file changes no application code, tests, migrations, or database data.

Current code is authoritative. [front-office-workspace-implementation-plan.md](front-office-workspace-implementation-plan.md) and [front-office-walk-in-reservation-audit.md](front-office-walk-in-reservation-audit.md) are historical where code has moved beyond them. Production database state is UNKNOWN. A migration present in this repository is not assumed to be applied to any environment.

Status meanings:

- **PASS** — the operational workflow is coherent, authoritative, permissioned, and auditable.
- **PARTIAL** — useful implementation exists, but an ordinary path or integration is incomplete.
- **MISSING** — the capability has no meaningful current implementation.
- **WRONG_OWNER** — Front Office should consume or link to another owner, not implement a duplicate.
- **DUPLICATED** — two live or residual workflows overlap.
- **DEFER** — intentionally later and not required for ordinary Front Office operation.

Ownership used throughout:

- Property Setup owns property identity, timezone, business date policy, check-in/out policy, and operational settings.
- Reservations own pre-arrival lifecycle, reservation units, commercial snapshots, source/segment/group/company/TA, notes, and special requests.
- Room & Inventory own physical rooms, availability, assignment eligibility, blocks, OOO/OOS, and physical room state.
- Front Office owns check-in, in-house execution, post-check-in room move, stay operations, checkout, no-show execution, and walk-in orchestration.
- Housekeeping owns clean/dirty/inspected state and cleaning readiness.
- Maintenance owns work orders and maintenance conflicts.
- Cashiering owns folios, charges, payments, deposits, refunds, settlement, and invoice state.
- Rate & Revenue own rates, restrictions, pricing, repricing, and rate rules.
- Guest Profile owns identity, contact, address, documents, preferences, duplicates, and guest history.
- Notifications own templates, delivery channels, delivery state, and communication events.
- Security & Audit own permissions, approval policy/workflow, sensitive overrides, and central audit policy.
- Reports own report generation and analytics.
- Night Audit owns business-date advancement and end-of-day consequences.

Front Office must compose these owners. No duplicate availability engine, rate engine, folio, guest master, housekeeping state engine, notification engine, or report engine is recommended.

---

## A. Front Office entry — UI-01

Canonical route: `/restaurant/pms/front-office`, implemented by `src/routes/restaurant/pms/front-office.tsx` and `FrontOfficeWorkspace`.

| Concern | Current truth |
| --- | --- |
| UI-01 Front Desk Welcome | **DEFER**. There is no Welcome screen. Room Rack is the better operational landing. |
| Property identity | Passed through `RestaurantShell`; chrome displays the property name. |
| Business date | `usePropertyBusinessDate(restaurantId, timezone)` reads the Night Audit-owned property date, with property-local fallback. |
| Property-local time | Timezone is consumed, but no continuously updating property-local clock is displayed. |
| Navigation | Rack, Arrivals, In-House, Departures, Walk-ins, Amendments, Cancellations, No-Shows, Exceptions. |
| URL state | Navigation writes `?tab=`. Rack also writes horizon, date, and grouping. |
| Permissions | `getBookingsAccess`; reservation-manage roles are owner, manager, receptionist. Server commands use `requireReservationManager`. |
| Legacy routes | `/restaurant/rooms/arrivals`, `/in-house`, and `/departures` redirect to the canonical Front Office route. |

UI-01 is not a closure gate. A decorative welcome page would reduce operational utility.

---

## B. Room Rack and room operations — UI-02 to UI-10

Front Office does not directly patch `room_id` from React clients and does not update `hotel_rooms.status`. Pre-arrival assignment and in-house move are distinct:

- Pre-arrival: `assignReservationRoom` → `assign_hotel_reservation_room_unit` when a unit exists, otherwise reservation amendment. It rejects checked-in targets.
- In-house: `moveReservationRoom` → `move_hotel_reservation_room`, with reason and freshness assertions.
- Rack drop never writes immediately. Confirmation is required. A vertical room move draft requires `checked_in`; it is not a hidden pre-arrival assignment.

| UI | Status | Current implementation | Authority and gap |
| --- | --- | --- | --- |
| UI-02 Room Rack / Calendar | **PARTIAL** | `RoomRackCalendar`; 1/3/7/14/30-day horizons, floor/type grouping, URL state, confirm-before-write drag. Reads occupancy, reservations, dashboard, HK rack, and exception feeds. | Inventory eligibility remains authoritative. Receptionist access to the HK feed can degrade readiness. No live cross-module refresh. |
| UI-03 Room Quick View & Operations | **PARTIAL** | `RoomQuickViewSheet` via `getFrontOfficeRoomQuickView`; room, HK, maintenance, occupancy, block, stay, recent history, owner-module links. | Coherent read model; some operations deliberately link to owner modules. |
| UI-04 Room Assignment & Reassignment | **PARTIAL** | `AssignRoomDialog`, Check-In v2 assignment, `listAssignableRooms`, `assignReservationRoom`. Unit-capable. | Correct writer. Assignment lacks the explicit stale-read token used by move/date mutations. |
| UI-05 Room Move | **PASS** | `RoomMoveDialog` and rack confirmation call `moveReservationRoom`; unit id supported; reason required. | Correct post-check-in writer and RPC. |
| UI-06 Room Status Operations | **WRONG_OWNER** | FO displays operational, HK, and maintenance status and links out. | Room & Inventory, Housekeeping, and Maintenance must own mutations. |
| UI-07 Room Block / Hold | **WRONG_OWNER** | Active `pms_operational_inventory_blocks` are displayed; FO links to inventory. | Groups/Inventory own block writes. No FO hold table should be added. |
| UI-08 Room Readiness & Coordination | **PARTIAL** | Card2 policy-aware readiness on rack, room QV, assignment, and check-in. | FO consumes readiness correctly, but HK feed permission and data freshness are incomplete. |
| UI-09 Room Operations Queue | **PARTIAL** | `getFrontOfficeRoomOperationsQueue` and `RoomOperationsQueuePanel` exist. | Panel is not mounted; Exceptions already overlaps. Avoid a duplicate queue until the product distinction is proven. |
| UI-10 Room Operations History | **PARTIAL** | `RoomOperationsHistorySheet` merges room-related reservation history and `housekeeping_history`. | Useful room slice, not a complete room/block/maintenance audit timeline. |

Availability authority is `pms_evaluate_room_assignment` / room inventory compatibility. OOO/OOS and active blocks participate in eligibility. Move and stay-date changes use `assertStayMutationFreshness`; assignment rechecks eligibility at commit but does not expose equivalent expected-state conflict semantics.

---

## C. Arrivals and Check-In v2 — UI-11 to UI-19

### Arrivals

| UI | Status | Current truth |
| --- | --- | --- |
| UI-11 Arrivals Workspace | **PARTIAL** | Live business-date list and Check-In action. Rows are master-reservation oriented, so sibling units with different lifecycle states are not represented coherently. |
| UI-12 Arrival Quick View | **PARTIAL** | Guest, room, ETA, folio/readiness hints, assignment, registration, and Check-In actions. Progress read and action hints are less authoritative than Check-In v2 and are not fully unit-scoped. |
| UI-13 Arrival Exceptions | **PARTIAL** | Flags and blocker filter exist in Arrivals and the FO Exceptions desk. No separate persisted exception domain is needed. |

`loadFrontOfficeArrivals` is reservation-header based. The desk sets a simplified registration signal, while Check-In v2 re-evaluates actual progress. This can overstate or understate action readiness. For a reservation with one checked-in unit and one confirmed unit, the master row can hide the sibling workflow.

### Five-step Check-In v2

The live path is `CheckInDialog` → `FoCheckInV2Workspace`. `FoCheckInStepper` remains behind an unmounted `LegacyCheckInStepperHost`.

| Step | UI targets | Data and persistence | Commands and validation | Verdict |
| --- | --- | --- | --- | --- |
| 1 Guest & Reservation | UI-14, UI-16 | `getCheckInUnit`, reservation, selected `hotel_reservation_rooms` unit, occupants, Guest Profile, room candidates, readiness, folio summary. | `assignReservationRoom`, room-guest commands, Guest Profile edit. `projectCheckInStep1Readiness` separates hard blockers from deferred steps. | **PASS** for the selected unit. Arrivals entry is still master-row based. |
| 2 Registration | UI-14, UI-15 | Guest Profile fields/documents plus unit-scoped `fo_checkin_progress.registration_snapshot`. | `saveCheckInUnitRegistration`; required Guest Profile rules, identity document checks, reservation and guest history. | **PASS** backend and UI. Preferences/consent depth remains dependent on Guest Profile fields. |
| 3 Payment & Guarantee | UI-17 | Reservation folio plus unit progress deposit pointer/waiver. | `open_folio_for_reservation`, `callPostFolioTransaction`, deposit waiver restricted to owner/manager. | **PASS** for deposit. Guarantee authorization holds are not implemented; warnings are truthful. |
| 4 Agreement & Signature | UI-18 | Property Setup agreement version and unit-scoped `fo_checkin_agreement_instances`; signature storage reference. | `saveCheckInAgreement`, `captureCheckInAgreementSignature`; required acknowledgements and signature. | **PASS**. |
| 5 Review & Check-In | UI-18, UI-19 | Server readiness, unit, room, registration, folio, agreement, key state. | `completeFoCheckIn` re-reads blockers then calls `check_in_hotel_reservation`. | **BROKEN operational completion** because live v2 cannot record or waive the key blocker. |

### Check-in proof

- **Unit-aware status:** `completeFoCheckIn` passes optional `_reservation_room_id`; migration 0156 resolves and locks the unit, updates its status, and rolls up the reservation.
- **Business date:** arrivals and Step 1 use the property business date. Early/past arrival is represented; lifecycle validity remains server-enforced.
- **Room assignment:** uses the reservation assignment command, never a client `room_id` patch.
- **Housekeeping:** readiness uses Card2 policy. The check-in RPC applies `pms_housekeeping_transition_target(..., 'guest_check_in', ...)` and records HK history when state changes.
- **Guest identity:** Guest Profile and guest documents remain authoritative. Registration stores an FO progress snapshot, not a duplicate guest master.
- **Deposit:** actual posting goes through Cashiering folio RPCs. Financial scope is reservation-level.
- **Agreement/signature:** persisted per reservation room.
- **Final status/occupancy:** target unit becomes checked-in; occupancy is derived from checked-in stay/unit state.
- **History:** assignment/check-in RPC history plus registration, deposit, agreement, signature, and waiver events.
- **Concurrency:** the RPC locks the reservation/unit at completion. The progress stamp follows the RPC; a repair path handles a checked-in unit whose completion stamp failed.

### Blocking defect: key issuance

`getCheckInReadiness` adds `KEY_REQUIRED` unless both `key_access_type` and `key_identifier` are recorded, or a key waiver exists. `completeFoCheckIn` rejects every remaining blocker.

Backend commands already exist:

- `recordCheckInKey`
- `waiveCheckInKey`
- unit-aware `waiveCheckInUnitRequirement` with requirement `key`

Only `fo-check-in-stepper.tsx` calls record/waive key. The live v2 workspace renders the blocker and existing waiver in Review but has no key form or waiver action. Therefore an ordinary eligible guest cannot reach successful completion through the live five-step flow unless key progress was populated elsewhere. UI-18 and UI-19 are **PARTIAL**, and Check-In v2 cannot be called PASS/CLOSED.

`checkInReservation` remains exported as a deprecated ungated wrapper but has no live Front Office TSX caller. Live completion uses `completeFoCheckIn`.

---

## D. In-House operations — UI-20 to UI-29

| UI | Status | Current implementation | Main gap |
| --- | --- | --- | --- |
| UI-20 In-House Workspace | **PARTIAL** | Live checked-in desk, filters, flags, quick actions. | Reservation-header rows cannot represent mixed-status units safely. |
| UI-21 In-House Guest Quick View | **PARTIAL** | Guest, room, stay, folio signals, exceptions, history, owner links. | No single unit-centric aggregate for every action. |
| UI-22 Stay Management | **PARTIAL** | Composite date, guest, type, service, and special-request sheets. | Fragmented; commercial effects differ by action. |
| UI-23 In-House Room Move | **PASS** | `moveReservationRoom`, unit selection, reason, eligibility, history. | Keep distinct from pre-arrival assignment. |
| UI-24 Stay Extension | **PARTIAL** | `changeStayDates` → `change_hotel_stay_dates`. | RPC explicitly does not reprice; it does not call existing room-charge reconciliation. |
| UI-25 Early Departure | **PARTIAL** | Same date writer, emits shortened-stay history. | No penalty policy, posted-charge reconciliation, refund/adjustment semantics, or price confirmation. |
| UI-26 Guest Information Update | **PARTIAL** | Guest Profile links for PII; FO can manage stay occupants/primary linkage. | Correct ownership, but no unified in-house guest-edit flow. |
| UI-27 Requests & Traces | **DUPLICATED** | Canonical `guest_service_history` plus legacy `fo_guest_requests` traces and service/folio amendment actions. | Freeze `fo_guest_requests`; use Guest Services. |
| UI-28 Notes & Alerts | **PARTIAL** | Special requests shown/added; reservation notes remain available. | No first-class alert entity or coherent in-house notes/alerts surface. |
| UI-29 In-House Exceptions | **PARTIAL** | Derived desk and QV flags. | Resolution is spread across owner dialogs; freshness is manual/refocus. |

Post-check-in room changes do not use pre-arrival assignment. `assignReservationRoom` rejects checked-in units. In-house date changes use the FO writer, not pre-arrival `amendReservation`. However, that correct ownership split exposes a financial gap: `change_hotel_stay_dates` says “Does not reprice.” Reservation Edit can call `reconcile_reservation_unit_room_charge` (migration 0178); Front Office does not.

Packages and rates remain commercial snapshots. Front Office must call Rate & Revenue / Reservation reconciliation rather than calculate a new total locally.

---

## E. Departures and Check-Out — UI-30 to UI-39

| UI | Status | Current implementation | Main gap |
| --- | --- | --- | --- |
| UI-30 Departures Workspace | **PARTIAL** | Checked-in departure desk by business date. | Confirmed due-out/no-show candidates are handled elsewhere and mixed-unit visibility is incomplete. |
| UI-31 Departure Quick View | **PARTIAL** | Stay, timing, room, folio, readiness, checkout action. | Not a complete preparation checklist. |
| UI-32 Departure Preparation | **PARTIAL** | Derived financial/timing exceptions and readiness. | No dedicated minibar/services/operational close checklist. |
| UI-33 Folio & Balance Review | **PASS** | Checkout context reads/opens the reservation folio and displays authoritative balance. | Full folio detail remains in Cashiering by design. |
| UI-34 Payment & Settlement | **PASS** | `postCheckOutPayment` uses `callPostFolioTransaction`; supervisor override is persisted. | Credit/refund resolution correctly routes to Cashiering. |
| UI-35 Checkout Validation | **PASS** | Client and server gates require valid stay, folio, settlement/override, and close state. |
| UI-36 Checkout Confirmation | **PASS** | Close step, document preview, optional email, folio close at zero. |
| UI-37 Checkout Completion | **PASS** | `completeFoCheckOut` → unit-aware `check_out_hotel_reservation`. |
| UI-38 Late Checkout | **PARTIAL** | `setLateCheckout` and exception signal exist. | Policy approval is role-based; no central approval request. |
| UI-39 No-Show / Departure Exception | **PARTIAL** | `completeFoNoShow` is the gated FO command; no-show has its own tab/stepper. | It is not part of the Departures desk. Mixed-unit no-show semantics require review. |

Checkout is the strongest end-to-end Front Office workflow:

1. Candidate is a checked-in stay/unit due to depart.
2. `getCheckOutContext` loads the stay and Cashiering folio.
3. A missing folio can be opened through the canonical RPC.
4. Payments are posted by Cashiering’s transaction command.
5. Balance must be zero and folio closed, or a role-authorized override must be recorded.
6. `completeFoCheckOut` repeats server validation.
7. `check_out_hotel_reservation` updates the selected unit/master, rolls up status, records history, applies the HK `guest_check_out` transition, makes the room dirty, and creates the departure cleaning consequence.

Invoice/refund detail stays Cashiering-owned. The checkout document email directly calls Resend; it is not evidence of a general Notifications delivery domain.

---

## F. Walk-In — UI-40 to UI-49

Walk-In is currently **DUPLICATED**.

Path A, preferred:

`Front Office quick action / rack` → `ReservationWorkspaceOverlay` → `CreateReservationPage mode="walk-in"` → `createReservation`

Path B, still live:

`Walk-ins tab` → `WalkInDialog` → `createReservation` → `startWalkInCheckIn` → Check-In v2

Both use the canonical reservation writer; there is no `createWalkInReservation`. The duplication is UI/orchestration, not a second reservation RPC.

| UI | Status | Current truth |
| --- | --- | --- |
| UI-40 Walk-In Workspace | **DUPLICATED** | New Reservation overlay and legacy dialog coexist. |
| UI-41 Guest Search | **DUPLICATED** | Shared create guest search plus thinner dialog search. |
| UI-42 Guest Registration | **DUPLICATED** | Shared Guest Profile create flow plus dialog form. |
| UI-43 Stay Request | **PASS** on overlay | Shared dates, occupancy, requests, and details. |
| UI-44 Availability | **PASS** | Room Inventory availability is reused. |
| UI-45 Rate Selection | **PASS** | `quoteStay` / priced reservation create is reused. |
| UI-46 Room Assignment | **PARTIAL** | Both use assignable-room authority; legacy dialog requires room while overlay may allow unassigned. |
| UI-47 Payment / Guarantee | **PARTIAL** | Shared overlay includes policy/payment inputs; legacy dialog omits them. Actual money stays Cashiering-owned. |
| UI-48 Check-In | **PARTIAL** | Legacy path continues to Check-In v2; overlay confirmation does not. |
| UI-49 Completion | **PARTIAL** | Overlay reservation success exists, but no “Continue to Check-In”; `walk_in_incomplete` semantics differ. |

WI03 remains: add Continue to Check-In after overlay success. WI04 remains: retire `WalkInDialog`. `WalkInsFrame` and `LegacyCheckInStepperHost` are residual/dead hosts. The final path must be one reservation creation authority followed by the live Check-In v2.

---

## G. Guest Services — UI-50 to UI-58

A real Guest Services foundation exists on `guest_service_history`, `pms_guest_service_types`, categories, counters, assignment, priority, preferred time, status, completion, and cancellation timestamps. Guest Profile/Guest Services own it. Front Office has `FoGuestServicesPanel` and can call the canonical create command from an amendment sheet.

Runtime gaps:

- Department routing is configuration, not persisted execution on the request.
- `preferred_at` is not a computed SLA deadline.
- SLA rules exist as setup only; no live SLA clock.
- Escalation lifecycle is absent.
- Cancellation has no dedicated reason field.
- `fo_guest_requests` is a second, weaker traces table still used by FO amendments.

| UI | Status | Reason |
| --- | --- | --- |
| UI-50 Guest Services Workspace | **WRONG_OWNER** | Full workspace belongs to Guest Services; FO should provide an operational window/link. |
| UI-51 New Service Request | **PARTIAL** | Canonical writer is callable; legacy traces still coexist. |
| UI-52 Service Request Detail | **WRONG_OWNER** | Detail lives with Guest Profile/Guest Services. |
| UI-53 Service Assignment | **PARTIAL** | Assigned membership exists; FO panel is read-only. |
| UI-54 Service Tracking | **MISSING** | No operational SLA/deadline engine. |
| UI-55 Service Completion | **PARTIAL** | Backend transition exists; FO cannot complete from its panel. |
| UI-56 Service Cancellation | **PARTIAL** | Backend status exists; no FO action/reason workflow. |
| UI-57 Service Escalation | **MISSING** | No escalation domain. |
| UI-58 Guest Request History | **PARTIAL** | Canonical history exists; FO shows a limited summary. |

Reservation notes are not Guest Services.

---

## H. Exceptions and control — UI-59 to UI-67

FO exceptions are derived. `getFrontOfficeExceptions` composes arrivals, in-house, departures, room operations, Guest Services, guest rules, and folio signals. `deriveExceptionRows` remains a related older feed used by rack/reservation surfaces. There is no exception table and no generic “resolve” writer. Resolution calls the owner command.

| UI | Status | Current truth |
| --- | --- | --- |
| UI-59 FO Exceptions Workspace | **PARTIAL** | Live derived desk, filters, partial-source honesty, manual refresh. Two derivation layers remain. |
| UI-60 Room Conflict Resolution | **PARTIAL** | Routes to assign/move/inventory owner commands. |
| UI-61 Arrival Exception Resolution | **PARTIAL** | Routes to assignment, guest, folio, and Check-In. |
| UI-62 Check-In Exception Resolution | **PARTIAL** | Check-In blockers and owner actions exist; key cannot be resolved in v2. |
| UI-63 In-House Exception Resolution | **PARTIAL** | Move/date/maintenance/folio actions are distributed. |
| UI-64 Departure Exception Resolution | **PARTIAL** | Checkout/folio actions exist. |
| UI-65 Payment / Balance Exceptions | **PARTIAL** | Cashiering signals are consumed, permission-sensitive, and not live. |
| UI-66 Guest Data Exceptions | **PARTIAL** | SET3/Guest Profile completeness is represented; resolution links to owner. |
| UI-67 Operational Override | **PARTIAL** | Check-in waivers, checkout settlement override, and fee waives exist separately. |

Sensitive overrides generally have a reason, role check, and reservation history. There is no approval request. Some history payloads contain the requirement and actor, but before/new-value normalization is inconsistent. Overrides should remain action-specific and audited rather than becoming a generic exception engine.

---

## I. Approvals and authorization — UI-68 to UI-76

`pms_approval_rules` is a Property Setup/Security catalogue with permission, approver role, threshold, unit, and active state. Front Office reads it for display. There is no `pms_approval_requests`, no FO inbox, and no requested/approved/rejected/cancelled lifecycle.

Rate & Revenue has its own `hotel_revenue_approval_policy`, requests, and events. Cashiering and Front Office use role gates. Policy flags such as `late_checkout_needs_approval` are not persisted approval requests.

| UI | Status |
| --- | --- |
| UI-68 Approval Workspace | **MISSING** |
| UI-69 Discount Approval | **MISSING** |
| UI-70 Rate Override Approval | **WRONG_OWNER** / **MISSING in FO**; Rate has a domain |
| UI-71 Room Upgrade Approval | **MISSING** |
| UI-72 Late Checkout Approval | **PARTIAL**; policy + role gate only |
| UI-73 Stay Extension Approval | **MISSING** |
| UI-74 Refund / Adjustment Approval | **WRONG_OWNER** / **PARTIAL**; Cashiering role gate, no request |
| UI-75 Exceptional Room Move Approval | **MISSING** |
| UI-76 Approval History | **MISSING** in FO |

A central Security/Admin-owned request capability should be added only when concrete actions need asynchronous approval. Do not build eight action-specific engines.

---

## J. Communication — UI-77 to UI-83

Property Setup Card4 provides channels, sender settings, templates, events, defaults, and automation configuration. Its code explicitly excludes delivery. No general delivery outbox, retry queue, delivery status, or FO communication event history exists.

The one real FO send is `sendCheckOutDocumentEmail`, which directly calls Resend. Guest Profile can log communication activity, but logging is not delivery.

| UI | Status |
| --- | --- |
| UI-77 FO Communication Workspace | **MISSING** |
| UI-78 Guest Communication | **MISSING** in FO |
| UI-79 Arrival Communication | **MISSING** |
| UI-80 In-House Communication | **MISSING** |
| UI-81 Departure Communication | **PARTIAL**; checkout document email only |
| UI-82 Internal Front Office Alerts | **MISSING** |
| UI-83 Communication History | **PARTIAL**; guest activity logs, no delivery history |

Build Notifications delivery first; Front Office should consume it.

---

## K. Reports and control — UI-84 to UI-94

The report owner is `/restaurant/pms/reports`. Front Office links to it. Reports currently expose a small operational catalogue and counts, not the full FO product report set.

| UI | Status | Ownership result |
| --- | --- | --- |
| UI-84 FO Reports Workspace | **WRONG_OWNER** | Link to Reports; no FO report engine. |
| UI-85 Arrivals Report | **PARTIAL** | Operational count exists; detailed report absent. |
| UI-86 In-House Report | **PARTIAL** | Operational count exists; roster report absent. |
| UI-87 Departures Report | **PARTIAL** | Operational count exists; detailed report absent. |
| UI-88 Room Assignment Report | **MISSING** | Future Reports reader over history. |
| UI-89 Room Move Report | **MISSING** | Future Reports reader over `room_moved`. |
| UI-90 Check-In / Check-Out Report | **MISSING** | Future Reports reader over history. |
| UI-91 Walk-In Report | **PARTIAL** | FO operational history exists, report absent. |
| UI-92 Guest Services Report | **WRONG_OWNER** / **MISSING** | Guest Services/Reports. |
| UI-93 FO Exceptions Report | **PARTIAL** | Live desk exists; report/export absent. |
| UI-94 FO Activity Report | **PARTIAL** | `FoAuditViewer` is operational history, not a report. |

Operational desks are not reports. Extend Reports & Analytics if hotel clients require report/export behavior.

---

## L. History and audit — UI-95 to UI-101

Relevant stores:

- `hotel_reservation_history`: reservation, assignment, move, check-in/out, dates, no-show, ETA, late checkout, room guests, and FO amendments.
- `housekeeping_history`: room readiness/state.
- `folio_history`: Cashiering.
- `guest_profile_history`: guest identity/services/comms activity.
- Rate approval events: Rate & Revenue only.
- Inventory/block histories: owner modules, not consolidated in FO.

FO surfaces are fragmented: `FoAuditViewer` over `listReservationAmendments`, room history merging reservation/HK events, and walk-in history. There is no consolidated FO history read.

| UI | Status | Gap |
| --- | --- | --- |
| UI-95 FO History Workspace | **MISSING** | No global history tab/read model. |
| UI-96 Guest Stay History | **WRONG_OWNER** / **PARTIAL** | Guest Profile owns guest history. |
| UI-97 Room Assignment History | **PARTIAL** | Per-room sheet only. |
| UI-98 Room Move History | **PARTIAL** | Per-room/reservation history only. |
| UI-99 Check-In / Check-Out History | **PARTIAL** | Events exist; no dedicated search. |
| UI-100 Override & Approval History | **MISSING** | Overrides scattered; FO approvals absent. |
| UI-101 FO Audit Detail | **PARTIAL** | Before/after and notes are shown selectively; no full detail inspector. |

`FoAuditViewer` has actor name, timestamp, before/after, notes, reservation, confirmation, and guest. It lacks normalized role, business date, source module, unit, room, folio, and reason fields on every row. A future consolidated view should compose owner histories without copying them.

---

## M. Shift and daily control — UI-102 to UI-109

No Front Office shift domain exists. `hotel_cashier_shifts` is the Cashiering-owned hotel drawer. `cashier_shifts` is a legacy restaurant-management till and is not a Front Office shift.

| UI | Status |
| --- | --- |
| UI-102 Shift Control | **MISSING** |
| UI-103 Handover | **MISSING** |
| UI-104 Pending Tasks | **MISSING**; could compose exceptions/services |
| UI-105 Open Guest Issues | **MISSING**; Guest Services is the owner |
| UI-106 Unresolved Rooms | **PARTIAL**; Exceptions/HK provide a live operational view |
| UI-107 Cash / Settlement Handover | **WRONG_OWNER** / **MISSING in FO**; Cashiering owns drawer shifts |
| UI-108 Daily Checklist | **MISSING** |
| UI-109 Shift Close | **MISSING** |

This phase is later and client-driven. Do not rename or duplicate cashier shifts.

---

## N. Offline and sync — UI-110 to UI-113

Card8 contains offline policy/configuration only. There is no IndexedDB/client persistence, mutation queue, transaction id, replay, conflict detection, sync status, or sync history for Front Office.

| UI | Status |
| --- | --- |
| UI-110 Offline FO Workspace | **DEFER** |
| UI-111 Pending Offline Transactions | **DEFER** |
| UI-112 Sync Conflict Resolution | **DEFER** |
| UI-113 Synchronization History | **DEFER** |

Loading and error states are not offline support. A platform-wide synchronization architecture is required before an FO surface.

---

## O. Administration — UI-114 to UI-118

Front Office has no administration tab. It links to Settings. That is the correct ownership boundary.

| UI | Status |
| --- | --- |
| UI-114 Configuration View | **WRONG_OWNER** / **MISSING read-only FO view** |
| UI-115 Permission View | **WRONG_OWNER** / **MISSING read-only FO view** |
| UI-116 Action Control | **WRONG_OWNER** / **MISSING read-only FO view** |
| UI-117 Audit Configuration | **WRONG_OWNER** / **MISSING read-only FO view** |
| UI-118 Operational Preferences | **WRONG_OWNER** / **MISSING read-only FO view** |

Future FO views may expose read-only effective configuration and deep links. Settings and Security remain masters.

---

## P. Cross-module integration matrix

| Module | Data consumed by FO | Commands called by FO | Authoritative read/write | Refresh mechanism | Failure, permission, audit | Status and gap |
| --- | --- | --- | --- | --- | --- | --- |
| Property Setup | Identity, timezone, business date, CI/CO times, fees, guest rules, HK policy, agreement version, approval/comms/offline policy | None for core desk | Real read; no FO write | Query on mount/cache; Night Audit may invalidate business date | Access through property membership; no FO config audit | **PARTIAL**: effective policy is consumed, no local clock or read-only policy view. |
| Reservations | Reservation/header/unit, guests, dates, source, notes, requests, commercial snapshots | Create walk-in, pre-arrival assign, room guests, limited amendments | Real reads/writes through reservation functions/RPCs | Query on open; FO mutation invalidation | `requireReservationManager`; reservation history | **PARTIAL**: master-row desks hide mixed units; walk-in duplicated. |
| Room & Inventory | Rooms, types, occupancy, availability, assignment eligibility, blocks, OOO/OOS | Pre-arrival assignment via canonical writer; in-house move validates inventory | Real authority | Query on open; no cross-user push | Server eligibility; permission/failure shown; move history | **PARTIAL**: assignment conflict UX and live refresh. |
| Housekeeping | Clean/dirty/inspected, readiness policy, discrepancy/history | CI/CO RPC applies configured transitions; FO links to HK | Real read and owner transition | Rack/HK query on open; no HK→FO invalidation/realtime | HK feed can be permission denied for receptionist | **PARTIAL**: permission and freshness gaps. |
| Maintenance | `maintenance_status`, OOO/OOS conflict signals | None; links to Maintenance | Real read; no FO write | Query on open | Partial-source failure represented | **PARTIAL**: no live work-order/read model in FO. |
| Cashiering | Folio, transactions, deposit, balance, status, checkout override | Open folio, post deposit/payment, close folio | Real read/write via folio RPCs | Query on workflow open; FO mutation invalidation | Permission-sensitive; errors block; folio/reservation history | **PASS** for CI deposit/checkout ownership; external posts are stale while open. |
| Rate & Revenue | Quote, rate plan, restrictions, price snapshot | Reservation create quote; no FO stay-date repricing | Real create-time authority | On-demand quote | Pricing errors block create | **PARTIAL**: extend/early departure bypass priced reconciliation. |
| Guest Profile | Identity, contact, address, documents, rules, preferences, history | Registration/profile and document functions; service request create | Real read/write through Guest domain | Query on workflow open; no cross-module live update | Guest permission and event history | **PARTIAL**: active FO flows can display stale guest state; duplicate handling stays owner-side. |
| Notifications | Card4 settings/templates/events | None generally; checkout bypasses with direct Resend call | Configuration read only; direct one-off write | None | Resend failure returned; no delivery history/retry | **MISSING** delivery integration. |
| Security & Audit | Membership role, module access, approval rules | Role-gated waivers/overrides; append owner histories | Real role checks; rules are display-only | Query on open | Server authorization and action history | **PARTIAL**: no central approval lifecycle or consolidated audit. |
| Reports | Small operational catalogue/counts | Navigation only | Real report owner | On report open | Report permissions | **WRONG_OWNER** for FO duplication; catalogue gaps remain. |
| Night Audit | Property business date; unresolved operational signals consumed by NA | None; FO never advances date | Real read; correct no-write | Query/cache; broad invalidation from NA | NA permissions separate; business-date audit in NA | **PASS** ownership, **PARTIAL** open-screen refresh. |

Front Office communicates with the right owners for core room, reservation, guest, folio, check-in, and checkout changes. The important exceptions are stay-date pricing, direct checkout email rather than Notifications, and fragmented role-based approvals.

---

## Q. Data freshness and “real-time”

There is no Supabase Realtime subscription and no `refetchInterval` in current PMS Front Office code. TanStack Query loads on open/enable. FO mutations generally invalidate `["front-office"]` and related keys. Cross-module mutations do not reliably invalidate FO queries in another browser or module.

| Read | Mechanism | Stale-data window |
| --- | --- | --- |
| Room Rack | Queries on rack mount; FO mutations invalidate | Until window focus, rack remount/navigation, manual/FO refresh, or a local FO mutation. |
| Arrivals | Query when tab mounts; local action invalidation | Same; another user’s assign/check-in can remain displayed. |
| In-House | Query when tab mounts | Same; mixed-unit/master state compounds staleness. |
| Departures | Query when tab mounts | Same; Cashiering settlement and another user’s checkout can remain stale. |
| Check-In | Unit/readiness/folio queries when sheet opens and after its mutations | External guest/HK/folio changes remain stale until query refetch/reopen/focus. Agreement/review queries may cache for five minutes. |
| Room readiness | HK rack/readiness query on open | HK dirty→clean→inspected does not push into FO. |
| Assignment candidates | Query when dialog/workspace opens | Candidate can become stale before commit; server rechecks eligibility but conflict presentation is limited. |
| Folio/balance | Workflow/side-sheet query | External Cashiering posts do not push into an already open FO flow. |
| Guest Profile | Workflow read or navigation to Guest module | Profile edits elsewhere do not push into active Check-In. |
| Maintenance | Room/rack/exception query | OOS/work-order changes require refetch. |
| Exceptions | Always-enabled desk query plus manual refresh | No polling; composition stays stale until focus/manual refresh/invalidation. |

Answer: **No, Front Office does not truly receive live changes made by other modules without refresh.** The stale window is unbounded while the page remains focused and no local invalidation occurs. Browser focus defaults may refresh after leaving and returning; that is not operational real-time.

First improvement should be explicit refresh, known cross-module invalidation, focus refetch, and light periodic refetch for critical desks. Realtime should be evaluated later, not added indiscriminately.

---

## R. Workflow coherence

| Scenario | Entry; reads; writes; owner handoffs | Validation, audit, refresh | Rating and broken/duplicated step |
| --- | --- | --- | --- |
| 1. Existing reservation → assignment → check-in | Arrivals/QV; reservation unit, guest, inventory, HK, folio; assign writer then `completeFoCheckIn`; Reservations→Inventory→Guest/Cashiering→FO/HK | Eligibility/readiness/server blocker/history; local invalidation | **BROKEN**: live v2 cannot clear `KEY_REQUIRED`. |
| 2. Multi-room unit-specific check-in | Check-In unit chooser; unit/readiness; unit RPC | Unit status and history are correct | **PARTIAL**: master Arrivals row can hide sibling units. |
| 3. Dirty room blocks check-in | Check-In readiness reads HK policy/state | Server readiness blocks; no write | **COHERENT** at evaluation time; stale HK read can delay readiness. |
| 4. HK marks inspected → FO ready | HK writes owner state; FO reads it | No push/invalidation from HK | **BROKEN integration** until focus/reopen/manual refresh. |
| 5. Cashiering posts deposit → Check-In updates | Cashiering writes folio; Check-In reads folio | Canonical ledger; no push | **PARTIAL**: authoritative but stale while open. |
| 6. In-house room move | In-House/QV/rack; candidates; `moveReservationRoom` | Eligibility, expected state, reason, RPC history | **COHERENT**. |
| 7. Stay extension | In-House date dialog; availability/date writer | Freshness and history only | **BROKEN financial step**: no reprice/room-charge reconciliation. |
| 8. Early departure | In-House date dialog; shorten writer | Date/history only | **BROKEN financial/policy step**. |
| 9. Checkout with zero balance | Departures/QV; folio; close; checkout RPC | Revalidated server-side; history; HK dirty | **COHERENT**. |
| 10. Checkout with outstanding balance | Checkout settlement; Cashiering post/override | Balance gate and role override | **COHERENT**, with deliberate Cashiering escape for refunds/credits. |
| 11. Late checkout | In-House/Departures dialog; policy + `setLateCheckout` | History/exception signal | **PARTIAL**: role gate, no approval lifecycle. |
| 12. No-show | No-Shows/arrival action; readiness; `completeFoNoShow` | Business date, fee, folio, RPC history | **PARTIAL**: master/unit semantics need FO-04; correct owner otherwise. |
| 13. Walk-in | Quick action/rack overlay or Walk-ins dialog; reservation create; Check-In | Same authoritative create, different progress semantics | **DUPLICATED**; overlay lacks Continue to Check-In. |
| 14. Maintenance makes pending room OOS | Maintenance/Inventory writes room; FO candidates/readiness read it | Commit should reject ineligible room | **PARTIAL**: server protects commit, open screen does not update live. |
| 15. Two staff assign same room | Both read candidate; `assignReservationRoom` and eligibility RPC | Commit recheck exists | **PARTIAL**: no expected assignment token/clear stale conflict; concurrency test absent. |

---

## S. Frontend/backend gap matrix — UI-01 to UI-118

Priority: P0 blocks ordinary Front Office correctness; P1 completes the core desk; P2 is useful secondary capability; P3 is later/enterprise; Deferred is dependency-gated. “Schema” names the current store or says none. Permission and audit cells identify the material gap, not every existing gate.

| UI | Name | Status | Existing frontend | Existing backend / schema | Authoritative owner; dependencies | Workflow completeness | Backend / frontend / integration gap | Permission / audit gap | Priority; core?; increment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-01 | Front Desk Welcome | **DEFER** | None; rack is landing | None | FO shell; Property Setup | Not required | No gap for operation | Existing shell gate sufficient | Deferred; No; none |
| UI-02 | Room Rack / Calendar | **PARTIAL** | Live rack/calendar | Reservations, rooms, HK feeds; no rack table | FO read; Reservations/Inventory/HK | Strong desk, stale cross-module state | HK permission and refresh | Reservation gate; owner histories | P1; Yes; FO-07 |
| UI-03 | Room Quick View & Operations | **PARTIAL** | Live sheet | Aggregated room/stay/block/history read | Room & Inventory/HK/Maintenance/FO | Useful and truthful | Some actions link out; not live | Reservation gate; partial merged history | P1; Yes; FO-07 |
| UI-04 | Room Assignment & Reassignment | **PARTIAL** | Dialog + Check-In section | `assignReservationRoom`; unit assignment RPC | Reservations + Inventory | Authoritative pre-arrival assign | Expected-state conflict semantics | Gate exists; assignment history exists | P0; Yes; FO-06 |
| UI-05 | Room Move | **PASS** | Dialog + rack confirm | `moveReservationRoom`; move RPC/history | FO + Inventory | Complete in-house move | None material | Reason, role, history present | P1; Yes; FO-09 verify |
| UI-06 | Room Status Operations | **WRONG_OWNER** | Read/link only | `hotel_rooms` owner commands elsewhere | Inventory/HK/Maintenance | Correctly not duplicated | No FO writer needed | Owner permissions/audit | P3; No; none |
| UI-07 | Room Block / Hold | **WRONG_OWNER** | Read/link only | `pms_operational_inventory_blocks` | Groups/Inventory | Correctly consume-only | No FO writer needed | Owner permissions/audit | P3; No; none |
| UI-08 | Room Readiness & Coordination | **PARTIAL** | Rack/QV/CI readiness | Card2 policy + rooms/HK | Housekeeping + FO consumer | Correct policy, stale read | Receptionist read and refresh | HK read permission mismatch; HK history | P0; Yes; FO-07 |
| UI-09 | Room Operations Queue | **PARTIAL** | Component unmounted | Derived queue read | FO compose; HK/Inventory | Backend-only and overlaps Exceptions | Decide mount vs remove duplicate | Existing FO gate; owner histories | P2; No; FO-12 |
| UI-10 | Room Operations History | **PARTIAL** | Per-room sheet | Reservation + HK history | Security/Audit + owner stores | Useful slice | Missing block/maintenance completeness | Actor role/business date/source not normalized | P2; No; FO-L4 |
| UI-11 | Arrivals Workspace | **PARTIAL** | Live desk | Reservation-header arrivals read | FO consumer; Reservations | Master row hides mixed units | Unit rows/selection and refresh | Gate/history exist; row audit N/A | P0; Yes; FO-04 then FO-08 |
| UI-12 | Arrival Quick View | **PARTIAL** | Live QV | Stay + simplified progress/signals | FO/Reservations/Guest/Cashiering | Actionable but not unit-authoritative | Unit progress and v2 readiness parity | Gate exists; owner histories | P1; Yes; FO-04/FO-08 |
| UI-13 | Arrival Exceptions | **PARTIAL** | Flags/filter + Exceptions | Derived arrival keys | FO compose; owner modules | Useful, no dedicated resolver | Freshness and action cohesion | Role gates on actions; fragmented audit | P1; Yes; FO-08/FO-12 |
| UI-14 | Guest Verification | **PARTIAL** | CI Steps 1–2 | Guest Profile/documents + readiness | Guest Profile + FO | Coherent inside v2 | Arrival shortcut/step entry and final review | Guest/FO gates; guest + reservation history | P0; Yes; FO-02 |
| UI-15 | Guest Registration | **PASS** | CI Step 2 | Guest writes + unit progress snapshot | Guest Profile + FO | Persisted and gated | Verify product depth only | Server gate; guest/reservation events | P0; Yes; FO-02 verify |
| UI-16 | Room Assignment at Check-In | **PARTIAL** | CI Step 1 | Canonical unit assign | Reservations/Inventory | Correct selected-unit path | Assignment concurrency | Server gate/history | P0; Yes; FO-06 |
| UI-17 | Payment / Guarantee Review | **PARTIAL** | CI Step 3 | Cashiering folio/deposit + unit progress | Cashiering + FO | Deposit works; guarantee hold absent | Guarantee semantics; external refresh | Owner/manager waiver; history exists | P0; Yes; FO-02/FO-07 |
| UI-18 | Check-In Confirmation | **PARTIAL** | CI Review | Readiness + agreement + key state | FO composing owners | Truthful blocker display | No v2 key record/waive UI | Key waiver backend role/audit exists | P0; Yes; FO-01 |
| UI-19 | Check-In Completion | **PARTIAL** | Completion UI exists | `completeFoCheckIn`; CI RPC | FO + HK/Cashiering | Server loop strong but unreachable normally | KEY_REQUIRED resolution | Server gate/history strong | P0; Yes; FO-01 then FO-02 |
| UI-20 | In-House Workspace | **PARTIAL** | Live desk | Checked-in reservation read | FO | Master rows incomplete for mixed units | Unit rows and refresh | Gate; owner histories | P0; Yes; FO-04/FO-09 |
| UI-21 | In-House Guest Quick View | **PARTIAL** | Live QV | Stay/guest/room/folio/history aggregate | FO + Guest/Cashiering | Broad, not one unit authority | Unit context and freshness | Gate; partial audit | P1; Yes; FO-04/FO-09 |
| UI-22 | Stay Management | **PARTIAL** | Several sheets/dialogs | FO amendment/date/guest commands | FO + Reservations/Rate/Cashiering | Fragmented | Financial orchestration and unit scope | Mixed action gates/history | P0; Yes; FO-03/FO-09 |
| UI-23 | In-House Room Move | **PASS** | Live dialog | FO move RPC with unit | FO + Inventory | Coherent | Verify mixed-unit entry | Reason/permission/history present | P1; Yes; FO-04/FO-09 |
| UI-24 | Stay Extension | **PARTIAL** | Date dialog | Date RPC; no priced reconcile | FO + Rate/Reservations/Cashiering | Date changes, money wrong/incomplete | Quote/reconcile/folio impact | Gate/history but no financial audit | P0; Yes; FO-03 |
| UI-25 | Early Departure | **PARTIAL** | Date dialog | Date RPC; no penalty/reconcile | FO + Rate/Cashiering | Operationally unsafe financially | Policy, posted charge, refund semantics | Sensitive change needs complete audit | P0; Yes; FO-03 |
| UI-26 | Guest Information Update | **PARTIAL** | Profile links + occupant edit | Guest and room-guest commands | Guest Profile + FO stay linkage | Correct split, fragmented UX | Active workflow refresh | Owner permissions/history | P1; Yes; FO-09 |
| UI-27 | Requests & Traces | **DUPLICATED** | GS panel + amend actions | `guest_service_history` and `fo_guest_requests` | Guest Services | Two models | Retire/freeze legacy traces | Mixed histories | P2; No for core; FO-11 |
| UI-28 | Notes & Alerts | **PARTIAL** | Special requests/notes | Reservation fields; no alert domain | Reservations/FO consumer | Notes usable, alerts absent | Define only proven alert need | Reservation audit varies by action | P1; Yes (notes); FO-09 |
| UI-29 | In-House Exceptions | **PARTIAL** | Desk/QV flags | Derived keys | FO compose | Useful | Unit scope, freshness, cohesive actions | Owner action audit | P1; Yes; FO-09/FO-12 |
| UI-30 | Departures Workspace | **PARTIAL** | Live desk | Checked-in departure read | FO | Core list exists | Mixed units and candidate clarity | Gate; audit on actions | P1; Yes; FO-04/FO-10 |
| UI-31 | Departure Quick View | **PARTIAL** | Live QV | Stay/folio/readiness aggregate | FO + Cashiering | Actionable | Unit/freshness/prep depth | Gate; owner audit | P1; Yes; FO-10 |
| UI-32 | Departure Preparation | **PARTIAL** | Derived flags | FO/Cashiering signals | FO compose | Basic only | No coherent checklist/services close | No new permission; fragmented evidence | P1; Yes; FO-10 |
| UI-33 | Folio & Balance Review | **PASS** | Checkout step | Guest folio/transactions | Cashiering | Authoritative | External refresh only | Cashiering permission/audit | P1; Yes; FO-07/FO-10 verify |
| UI-34 | Payment & Settlement | **PASS** | Checkout settlement | Cashiering transaction RPC | Cashiering | Coherent; credits route out | External refresh only | Role override and history | P1; Yes; FO-10 verify |
| UI-35 | Checkout Validation | **PASS** | Stepper gates | Server repeats all gates | FO + Cashiering | Complete | None material | Server auth/history | P1; Yes; FO-10 verify |
| UI-36 | Checkout Confirmation | **PASS** | Close/document step | Folio close + optional email | FO/Cashiering; Notifications gap | Core confirmation complete | Email is direct Resend | Checkout audit; no delivery history | P1; Yes; FO-10 verify |
| UI-37 | Checkout Completion | **PASS** | Completion step | Unit-aware checkout RPC | FO + HK | Complete | Mixed-unit entry verification | Permission/history strong | P1; Yes; FO-04/FO-10 |
| UI-38 | Late Checkout | **PARTIAL** | Live dialog | Reservation operational field/history | FO/Reservations + policy | Usable role-gated action | No approval request; conflict depth | Role gate only; history exists | P1; Yes; FO-10; FO-L1 later |
| UI-39 | No-Show / Departure Exception | **PARTIAL** | No-show tab/stepper | Gated no-show RPC/fee/folio | FO + Cashiering | Correct separate path | Unit semantics and desk handoff | Permission/reason/history strong | P1; Yes; FO-04/FO-10 |
| UI-40 | Walk-In Workspace | **DUPLICATED** | Overlay + dialog | Same reservation writer | FO orchestration + Reservations | Two paths | Consolidate hosts | Same permissions; differing history/progress | P0; Yes; FO-05 |
| UI-41 | Guest Search | **DUPLICATED** | Shared create + dialog | Guest search | Guest Profile | Both work | Retire dialog UI | Guest permission/audit N/A | P1; Yes; FO-05 |
| UI-42 | Guest Registration | **DUPLICATED** | Shared create + dialog | Guest create/profile | Guest Profile | Both work differently | One shared flow | Owner permission/history | P1; Yes; FO-05 |
| UI-43 | Stay Request | **PASS** | Shared create flow | Reservation create draft/quote | Reservations | Complete on preferred path | Remove legacy subset | Reservation audit | P1; Yes; FO-05 |
| UI-44 | Availability | **PASS** | Shared + dialog | Inventory availability | Room & Inventory | Authoritative | Remove duplicate consumer | Inventory permission/error | P1; Yes; FO-05 |
| UI-45 | Rate Selection | **PASS** | Shared + dialog | `quoteStay` | Rate & Revenue | Authoritative | Remove duplicate consumer | Rate error/audit through reservation snapshot | P1; Yes; FO-05 |
| UI-46 | Room Assignment | **PARTIAL** | Both paths | Assignable rooms/assignment | Reservations/Inventory | Policy differs by host | Consolidate room-required decision; concurrency | Server gate/history | P0; Yes; FO-05/FO-06 |
| UI-47 | Payment / Guarantee | **PARTIAL** | Overlay only | Reservation policy fields; CI deposit later | Cashiering/Reservations | Legacy skips it | One shared path; clarify guarantee | Payment remains Cashiering-owned | P1; Yes; FO-05 |
| UI-48 | Check-In | **PARTIAL** | Dialog path only continues | Check-In v2 | FO | Preferred overlay stops before CI | Implement WI03; FO-01 prerequisite | Check-In permission/audit | P0; Yes; FO-01/FO-05 |
| UI-49 | Completion | **PARTIAL** | Reservation confirmation/history | Reservation + progress | FO/Reservations | Not one sequence | Honest `walk_in_incomplete` and completion | Differing progress audit | P0; Yes; FO-05 |
| UI-50 | Guest Services Workspace | **WRONG_OWNER** | FO panel/link | `guest_service_history` | Guest Services | FO window only | Full owner workspace/runtime gaps | Owner permissions/history | P2; No; FO-11 |
| UI-51 | New Service Request | **PARTIAL** | FO amend create | Canonical GS writer + legacy traces | Guest Services | Canonical create exists | Stop legacy writes | Guest manager permission/events | P2; No; FO-11 |
| UI-52 | Service Request Detail | **WRONG_OWNER** | Link out | GS detail/read | Guest Services | Owner surface | Optional FO thin detail | Owner permission/history | P2; No; FO-11 |
| UI-53 | Service Assignment | **PARTIAL** | Owner UI, FO read | `assigned_membership_id` | Guest Services | Backend exists | No FO action; dept runtime absent | Guest manager; events | P2; No; FO-11 |
| UI-54 | Service Tracking | **MISSING** | None | No runtime SLA clock | Guest Services | Missing | Due/SLA runtime | Future permission/audit | P2; No; FO-11 |
| UI-55 | Service Completion | **PARTIAL** | Owner UI, FO read | Status/completed_at | Guest Services | Backend exists | No FO action | Owner permission/events | P2; No; FO-11 |
| UI-56 | Service Cancellation | **PARTIAL** | Owner UI, FO read | Status/cancelled_at | Guest Services | Backend partial | Cancel reason and FO action | Owner permission/events | P2; No; FO-11 |
| UI-57 | Service Escalation | **MISSING** | None | No escalation lifecycle | Guest Services | Missing | Full domain gap | Future permission/audit | P2; No; FO-11 |
| UI-58 | Guest Request History | **PARTIAL** | Limited FO summary | GS/profile history | Guest Services | History exists | Search/detail in owner workspace | Owner permission/events | P2; No; FO-11 |
| UI-59 | FO Exceptions Workspace | **PARTIAL** | Live desk | Derived `fo-control` + older feeds | FO compose | Useful | Consolidate derivation/freshness | FO gate; owner audit | P1; Yes; FO-12 |
| UI-60 | Room Conflict Resolution | **PARTIAL** | Owner CTAs | Assign/move/inventory commands | FO/Inventory | Action routing | More coherent resolution context | Owner action permission/audit | P1; Yes; FO-12 |
| UI-61 | Arrival Exception Resolution | **PARTIAL** | Owner CTAs | Arrival/CI commands | FO + owners | Action routing | Unit scope/freshness | Owner action permission/audit | P1; Yes; FO-08/FO-12 |
| UI-62 | Check-In Exception Resolution | **PARTIAL** | CI entry | Readiness/waiver commands | FO + owners | Key blocker unresolved | Key UI; owner refresh | Waiver role/history exist | P0; Yes; FO-01/FO-12 |
| UI-63 | In-House Exception Resolution | **PARTIAL** | Owner CTAs | Move/date/folio links | FO + owners | Fragmented | Pricing and unit gaps | Owner action audit | P1; Yes; FO-03/FO-12 |
| UI-64 | Departure Exception Resolution | **PARTIAL** | Checkout/folio CTAs | Checkout/Cashiering commands | FO/Cashiering | Mostly coherent | Unit/freshness | Strong owner gates/history | P1; Yes; FO-10/FO-12 |
| UI-65 | Payment / Balance Exceptions | **PARTIAL** | Derived signals | Folio summary | Cashiering | Authoritative read | Live refresh and permission-denied lane | Cashiering permission; folio history | P1; Yes; FO-07/FO-12 |
| UI-66 | Guest Data Exceptions | **PARTIAL** | Derived signal/link | Guest rules/profile | Guest Profile | Correct owner | Active refresh and detail | Guest permissions/history | P1; Yes; FO-02/FO-12 |
| UI-67 | Operational Override | **PARTIAL** | Action-specific forms | Waiver/settlement/fee commands | Security policy + action owner | Exists, not unified | Normalize audit; no generic engine | Role gates; scattered before/after | P1; Yes; FO-02/FO-10/FO-12 |
| UI-68 | Approval Workspace | **MISSING** | None | No FO request table | Security/Admin | Missing | Central foundation only if needed | Full lifecycle absent | P3; No; FO-L1 |
| UI-69 | Discount Approval | **MISSING** | None | Rules catalogue only | Security/Cashiering/Rate | Missing | Request lifecycle | Missing | P3; No; FO-L1 |
| UI-70 | Rate Override Approval | **WRONG_OWNER** | Rate workspace elsewhere | Revenue approval tables | Rate & Revenue/Security | Not FO | FO link/context only | Rate-owned audit | P3; No; FO-L1 |
| UI-71 | Room Upgrade Approval | **MISSING** | None | Role gate only | Security/Rate | Missing | Request lifecycle if required | Missing | P3; No; FO-L1 |
| UI-72 | Late Checkout Approval | **PARTIAL** | Policy/role card | Policy flag only | Security + FO | Synchronous role gate | No request/history lifecycle | Role gate; action history only | P3; No; FO-L1 |
| UI-73 | Stay Extension Approval | **MISSING** | None | No request | Security/FO | Missing | Prove need after FO-03 | Missing | P3; No; FO-L1 |
| UI-74 | Refund / Adjustment Approval | **WRONG_OWNER** | Cashiering role flow | Cashiering command/rules display | Cashiering/Security | Owner action exists | No central request | Cashiering audit; no approval history | P3; No; FO-L1 |
| UI-75 | Exceptional Room Move Approval | **MISSING** | None | Role/reason only | Security/FO | Missing | Prove need | Move history, no approval | P3; No; FO-L1 |
| UI-76 | Approval History | **MISSING** | None | Revenue-only events | Security/Audit | Missing in FO | Central composition | Full FO lifecycle absent | P3; No; FO-L1 |
| UI-77 | FO Communication Workspace | **MISSING** | None | Card4 config only | Notifications | Missing | Delivery engine first | Delivery permission/audit absent | P3; No; FO-L2 |
| UI-78 | Guest Communication | **MISSING** | Guest log elsewhere | No FO send | Notifications | Missing | Recipient/send/delivery | Missing | P3; No; FO-L2 |
| UI-79 | Arrival Communication | **MISSING** | None | No dispatch | Notifications | Missing | Event dispatch/history | Missing | P3; No; FO-L2 |
| UI-80 | In-House Communication | **MISSING** | None | No dispatch | Notifications | Missing | Event dispatch/history | Missing | P3; No; FO-L2 |
| UI-81 | Departure Communication | **PARTIAL** | Checkout email | Direct Resend | Notifications should own | One document send | No templates/status/retry/event | No delivery audit | P3; No; FO-L2 |
| UI-82 | Internal Front Office Alerts | **MISSING** | None | No domain | Notifications | Missing | Internal recipient/event model | Missing | P3; No; FO-L2 |
| UI-83 | Communication History | **PARTIAL** | Guest activity logs | Profile history, no delivery | Notifications/Guest | Log only | Delivery event composition | No delivery audit | P3; No; FO-L2 |
| UI-84 | FO Reports Workspace | **WRONG_OWNER** | Link to Reports | Reports catalogue | Reports | Correct link | Catalogue expansion owner-side | Reports permissions/audit | P3; No; FO-L3 |
| UI-85 | Arrivals Report | **PARTIAL** | Operational count/list | Existing dashboard reader | Reports/FO data | Not a report | Detailed reader/export | Reports permission | P3; No; FO-L3 |
| UI-86 | In-House Report | **PARTIAL** | Operational count/list | Existing dashboard reader | Reports/FO data | Not a report | Detailed reader/export | Reports permission | P3; No; FO-L3 |
| UI-87 | Departures Report | **PARTIAL** | Operational count/list | Existing dashboard reader | Reports/FO data | Not a report | Detailed reader/export | Reports permission | P3; No; FO-L3 |
| UI-88 | Room Assignment Report | **MISSING** | None | History exists | Reports/Audit | Missing | Reports reader | History fields need normalization | P3; No; FO-L3 |
| UI-89 | Room Move Report | **MISSING** | None | `room_moved` history | Reports/Audit | Missing | Reports reader | Same | P3; No; FO-L3 |
| UI-90 | Check-In / Check-Out Report | **MISSING** | None | CI/CO history | Reports/Audit | Missing | Reports reader | Same | P3; No; FO-L3 |
| UI-91 | Walk-In Report | **PARTIAL** | Operational history | source/progress reads | Reports/FO | Desk not report | Source/progress first, then reader | Creator/history partial | P3; No; FO-05 then FO-L3 |
| UI-92 | Guest Services Report | **WRONG_OWNER** | GS owner views | GS history | Reports/Guest Services | Not FO | Reports reader if needed | Owner permissions/audit | P3; No; FO-L3 |
| UI-93 | FO Exceptions Report | **PARTIAL** | Live desk | Derived snapshot | Reports/FO | Operational only | Time-bounded report needs persistence/read design | Derived items have no event audit | P3; No; FO-L3 |
| UI-94 | FO Activity Report | **PARTIAL** | Audit sheet | Reservation history read | Reports/Audit | History view only | Filters/export/normalized events | Missing role/business date/source | P3; No; FO-L3/FO-L4 |
| UI-95 | FO History Workspace | **MISSING** | Scattered sheets | Multiple owner histories | Security/Audit | Fragmented | Composition read | Permission union and normalized audit | P3; No; FO-L4 |
| UI-96 | Guest Stay History | **WRONG_OWNER** | Guest/reservation links | Guest + reservation history | Guest Profile/Audit | Owner views | Optional FO context | Owner permissions | P3; No; FO-L4 |
| UI-97 | Room Assignment History | **PARTIAL** | Per-room history | Reservation history | Audit/Inventory | Local slice | Global search/filter | Normalized unit/actor fields | P3; No; FO-L4 |
| UI-98 | Room Move History | **PARTIAL** | Per-room history | Reservation history | Audit/FO | Local slice | Global search/filter | Same | P3; No; FO-L4 |
| UI-99 | Check-In / Check-Out History | **PARTIAL** | Activity/room sheets | Reservation history | Audit/FO | Events exist | Dedicated filters/detail | Same | P3; No; FO-L4 |
| UI-100 | Override & Approval History | **MISSING** | None consolidated | Scattered override history; no FO approvals | Security/Audit | Missing | Composition + future approvals | Inconsistent before/after/reason | P3; No; FO-L1/FO-L4 |
| UI-101 | FO Audit Detail | **PARTIAL** | Row cards | History payloads | Security/Audit | Basic detail | Full payload/reference view | Role/business date/source missing | P3; No; FO-L4 |
| UI-102 | Shift Control | **MISSING** | None | No `fo_shifts` | FO only if needed | Missing | Prove persisted shift need | Full domain absent | P3; No; FO-L5 |
| UI-103 | Handover | **MISSING** | None | No FO handover | FO | Missing | Domain/read composition | Missing | P3; No; FO-L5 |
| UI-104 | Pending Tasks | **MISSING** | Exceptions/GS separately | Derived sources | FO composition | Could compose | No shift snapshot | Permissions across sources | P3; No; FO-L5 |
| UI-105 | Open Guest Issues | **MISSING** | GS owner view | GS active requests | Guest Services | Owner data exists | FO shift composition only | Owner permissions/history | P3; No; FO-L5 |
| UI-106 | Unresolved Rooms | **PARTIAL** | Exceptions/HK | Derived room queue | HK/Inventory/FO | Operational data exists | Shift context absent | Cross-owner permissions | P3; No; FO-L5 |
| UI-107 | Cash / Settlement Handover | **WRONG_OWNER** | Cashiering links | `hotel_cashier_shifts` | Cashiering | Owner flow | FO reference only | Cashiering permissions/audit | P3; No; FO-L5 |
| UI-108 | Daily Checklist | **MISSING** | None | Could derive NA blockers | FO/Night Audit | Missing | Product/client need | Future permission/audit | P3; No; FO-L5 |
| UI-109 | Shift Close | **MISSING** | None | No FO shift writer | FO | Missing | Domain only if required | Full gate/audit absent | P3; No; FO-L5 |
| UI-110 | Offline FO Workspace | **DEFER** | None | Policy only | Platform | Deferred | Platform runtime | All absent | Deferred; No; FO-L6 |
| UI-111 | Pending Offline Transactions | **DEFER** | None | No queue | Platform | Deferred | Platform runtime | All absent | Deferred; No; FO-L6 |
| UI-112 | Sync Conflict Resolution | **DEFER** | None | No replay/conflicts | Platform | Deferred | Platform runtime | All absent | Deferred; No; FO-L6 |
| UI-113 | Synchronization History | **DEFER** | None | No sync ledger | Platform | Deferred | Platform runtime | All absent | Deferred; No; FO-L6 |
| UI-114 | Configuration View | **WRONG_OWNER** | Settings link only | Property Setup | Settings | Correct master | Optional read-only FO view | Settings permission/audit | P3; No; FO-L7 |
| UI-115 | Permission View | **WRONG_OWNER** | None | Security roles | Security | Correct master | Optional effective-permission view | Security-owned | P3; No; FO-L7 |
| UI-116 | Action Control | **WRONG_OWNER** | Role-based action hints | Security/rules | Security | Correct master | Optional read-only matrix | Security-owned | P3; No; FO-L7 |
| UI-117 | Audit Configuration | **WRONG_OWNER** | None | Card7/config | Security/Audit | Correct master | Optional link/view | Security-owned | P3; No; FO-L7 |
| UI-118 | Operational Preferences | **WRONG_OWNER** | None | Card1/Card8 settings | Property Setup | Correct master | Optional read-only view | Settings-owned | P3; No; FO-L7 |

---

## T. Database audit

Repository state only; application to production or development is not inferred.

| Artifact | Classification | Owner and use |
| --- | --- | --- |
| `hotel_reservations` | Existing, authoritative | Reservation header/lifecycle and operational fields. |
| `hotel_reservation_rooms` | Existing, authoritative | Reservation-unit lifecycle, assigned room, per-unit guest and status. Migration 0156 establishes unit-aware FO operations. |
| `hotel_reservation_room_guests` | Existing, authoritative | Unit occupants and primary guest; migrations 0160 and 0181. |
| `hotel_reservation_history` | Existing, shared audit | Reservation and FO events, including assignment, move, dates, check-in/out, no-show, ETA, late checkout, and occupants. |
| `fo_checkin_progress` | Existing | Registration snapshot, deposit pointer/waiver, key fields/waiver, completion, walk-in incomplete. Unit scope added by migration 0169. |
| `pms_registration_agreement_versions` | Existing, Property Setup-owned | Published agreement source. |
| `fo_checkin_agreement_instances` | Existing, FO-owned instance | Unit agreement, acknowledgements, signature reference; migration 0170. |
| `guest_profiles`, `guest_documents`, `guest_profile_history` | Existing, Guest Profile-owned | Identity, contact, documents, preferences/history. |
| `guest_folios`, `folio_transactions`, `folio_history` | Existing, Cashiering-owned | Folio and all actual money. |
| `hotel_cashier_shifts` | Existing, Cashiering-owned | Hotel drawer; not an FO reception shift. |
| `cashier_shifts` | Existing legacy RM till | Wrong owner/model for an FO shift. |
| `hotel_rooms`, room types | Existing, Room & Inventory-owned | Physical, HK, maintenance, assignment target. |
| `housekeeping_history` | Existing, HK-owned | Room state audit; partially composed in room history. |
| `pms_operational_inventory_blocks` | Existing, Inventory/Groups-owned | Dated active blocks consumed by FO. |
| `fo_guest_requests` | Existing legacy/duplicated | Text traces with open/done status. Do not expand. |
| `guest_service_history` | Existing, canonical Guest Services runtime | Request identity, guest/reservation, type, assignment, priority, preferred time, status, completion/cancel. |
| `pms_guest_service_types/categories` | Existing setup | Service catalogue. |
| `pms_guest_service_sla_rules` | Existing configuration only | No runtime SLA clock. |
| `fo_stay_companions`, `fo_service_catalogue` | Existing legacy/FO amendment support | Overlaps newer unit guests/Guest Services; avoid expansion. |
| ETA and late checkout columns | Existing on reservation/settings | No separate FO domain required. |
| `pms_approval_rules` | Existing configuration only | Threshold/role catalogue; not a request lifecycle. |
| `hotel_revenue_approval_*` | Existing, Rate-owned | Real approval workflow for revenue actions only. |
| `pms_approval_requests` equivalent for FO | Missing | Security/Admin foundation only if concrete FO workflows need asynchronous approval. |
| Card4 communication tables | Existing configuration only | Channels/templates/events/defaults; no delivery. |
| Communication outbox/delivery/retry/history | Missing | Notifications-owned future foundation. |
| `pms_offline_policies/capabilities` | Existing configuration only | No runtime queue. |
| Offline queue, transaction IDs, replay, conflicts, sync ledger | Missing | Platform-owned and deferred. |
| `fo_shifts` / handover | Missing | Optional FO foundation only if clients require reception shifts. |

Relevant RPCs/functions:

- `check_in_hotel_reservation`: unit-aware final transition, reservation rollup, folio open, HK check-in transition, history.
- `check_out_hotel_reservation`: unit-aware checkout, rollup, HK dirty/departure consequence, history.
- `move_hotel_reservation_room`: post-check-in room move.
- `assign_hotel_reservation_room_unit`: pre-arrival assignment.
- `change_hotel_stay_dates`: atomic date change; explicitly does not reprice.
- `reconcile_reservation_unit_room_charge`: existing Reservation Edit room-charge reconciliation (migration 0178), not called by FO dates.
- `mark_hotel_reservation_no_show`: canonical no-show transition; migration 0179 extends completion behavior.
- `open_folio_for_reservation`, folio post/close functions: Cashiering authority.
- `pms_evaluate_room_assignment`, room-type availability compatibility: Inventory authority.
- `pms_housekeeping_transition_target`: policy-owned HK consequences.

Missing schema is not automatically a recommendation. Guest Services, approvals, shifts, communications, and offline should only gain schema in their owner domain after a concrete operational requirement.

---

## U. Test coverage

| Area | Current representative coverage | Critical gap |
| --- | --- | --- |
| Room Rack | `fo-rack-power.test.ts`, phase/layout tests | Cross-user refresh and end-to-end drag conflict. |
| Assignment | `fo-room-assignment.test.ts`, reservation unit tests | Two-clerk same-room race and expected-state conflict. |
| Room move | `fo-amendments.test.ts`, rack confirmation tests | Browser unit-specific move under concurrent inventory change. |
| Check-In Step 1 | `fo-checkin-v2-step1-readiness.test.ts`, readiness runtime tests | Browser with live owner data changes. |
| Registration/identity | registration and readiness tests | Full address/contact/document/consent browser matrix. |
| Deposit/guarantee | `fo-check-in-deposit.test.ts`, `fo-checkin-v2-payment.test.ts` | External Cashiering post while Check-In remains open; guarantee hold is absent. |
| Agreement/signature | agreement model/function tests | Storage failure/retry browser path. |
| Key issuance | Legacy stepper/function tests only | **No live v2 record/waive test; core blocker.** |
| Final check-in | `fo-check-in-complete.test.ts`, readiness tests | Happy-path browser completion through all five v2 steps. |
| In-House | phase 3/in-house pure tests | Mixed-unit desk state. |
| Extension/early departure | date/rack tests | Price quote, reconciliation, posted charges, penalty/refund semantics. |
| Checkout | `fo-check-out.test.ts`, departure tests | External settlement refresh and multi-unit browser flow. |
| Late checkout | arrivals/departures tests | Approval policy/history integration. |
| No-show | `fo-cancel-noshow.test.ts`, no-show readiness tests | Mixed-unit no-show and full browser completion. |
| Walk-in | `front-office-walk-in-overlay.test.ts`, phase tests | Overlay success → Check-In; retirement of dialog; truthful incomplete state. |
| Guest Services | phase 6 and guest service tests | SLA/escalation absent; legacy trace prevention needs stronger integration coverage. |
| Exceptions | `fo-exceptions.test.ts`, phase 7 tests | Cross-module freshness and derivation parity. |
| Approvals | phase 8 absence/rules tests | No FO approval workflow exists. |
| Communications | Checkout function behavior only | Delivery status, retry, templates, history absent. |
| History | Source-lock/wiring tests | Room history server loader, global filters, permissions, normalized detail. |
| Shift | None beyond Cashiering shifts | FO phase absent. |
| Cross-module integration | Selected source-contract tests | HK→FO, Cashiering→FO, Guest→FO, Inventory→FO live/focus refresh. |
| Concurrency | Move/date freshness helpers | Assignment and check-in simultaneous staff scenarios. |

Source-lock tests are useful architecture guards but are not browser verification and cannot alone establish PASS.

---

## V. Routes and legacy workflows

| Occurrence | Current location | Finding |
| --- | --- | --- |
| Old `WalkInDialog` | `walk-ins-workspace.tsx` | Live duplicate create host. |
| `WalkInsFrame` | `front-office-frames.tsx` | Residual/dead duplicate frame. |
| `LegacyCheckInStepperHost` | `front-office-dialogs.tsx` | Unmounted host for old `FoCheckInStepper`; only place with key UI. |
| `FoCheckInWorkspaceSheet` | FO workspace | Additional pre-check-in context host that continues to v2; same final writer. |
| `checkInReservation` | `frontoffice.functions.ts` | Deprecated ungated export; no live FO TSX caller. |
| `checkOutReservation` | `frontoffice.functions.ts` | Deprecated ungated export; no live FO TSX caller. |
| `markNoShow` | `frontoffice.functions.ts` | Deprecated ungated export; live UI uses `completeFoNoShow`. |
| New reservation quick action | FO workspace → `/restaurant/bookings/new` | Intentional Reservation escape, separate from walk-in. |
| Legacy room routes | `/restaurant/rooms/arrivals`, `/in-house`, `/departures` | Redirect correctly to Front Office tabs. |
| Owner-module navigation | HK, Maintenance, Inventory, Cashiering, Guests, Reports, Settings | Correct ownership, not a broken legacy path. |

No live FO component directly updates `hotel_rooms.status` or patches a reservation’s `room_id`. No second walk-in RPC exists. Pricing display comes from quote/snapshots; the defect is omitted repricing on stay-date mutation, not a local FO calculator. Checkout payments do not bypass Cashiering. Registration does not create an FO guest master.

---

## W. Front Office implementation order

### Phase 0 — Freeze and baseline

No feature work.

- Treat this audit as the Front Office source of truth.
- Do not reopen Reservation unless an FO increment proves a real integration defect.
- Preserve all ownership boundaries above.
- Confirm the target development database migration state before migration-dependent work. Repository state is not target DB state.
- Every increment runs in this order: backend/read contract → migration only if needed → manual apply → tests → frontend → browser verification → PASS/CLOSED.
- One increment is open at a time. Unit tests alone never close a workflow change.

### FO-01 — Check-In v2 key issuance and waiver

- **Objective:** Make the existing `KEY_REQUIRED` gate resolvable in live `FoCheckInV2Workspace`.
- **Dependencies/owners:** Existing FO progress and key commands; Security role gate; selected Reservation unit.
- **Backend scope:** Audit/harden selected `reservationRoomId`, `key_access_type`, `key_identifier`, record command, owner/manager waiver, history, readiness re-read. Reuse `recordCheckInKey`, `waiveCheckInKey`, or unit requirement waiver.
- **Frontend scope:** Key/Access Type, identifier, Record Key, authorized waiver with reason, and existing waiver state in v2.
- **Tests/browser:** Unit-specific record and waive; unauthorized receptionist waiver rejection; readiness blocker clears; browser completes an eligible check-in without old stepper.
- **PASS/CLOSED:** Review → Complete Check-In succeeds through v2 for record and authorized-waive paths.
- **Non-goals:** New key engine, smart-lock integration, old stepper revival, new migration unless target DB proves a missing required column.

### FO-02 — Check-In v2 Steps 2–5 finalization

- **Objective:** Close UI-14–19 after completion becomes reachable.
- **Dependencies/owners:** FO-01; Guest Profile, Cashiering, Property Setup agreements, HK transition, Security.
- **Backend scope:** Verify registration unit scope and identity rules; Cashiering deposit summary/waiver; agreement instance/signature; truthful final readiness; completion status/HK/history.
- **Frontend scope:** Render all required fields, owner data, guarantee truth, agreement state, blockers, and final outcome without duplicate calculations.
- **Tests/browser:** Registration/document matrix, external deposit refresh behavior, agreement/signature persistence, all blockers, complete check-in and HK consequence.
- **PASS/CLOSED:** Check-In v2 end-to-end is PASS for an ordinary reservation unit.
- **Non-goals:** Duplicate guest master, FO payment ledger, approval inbox, smart-lock integration.

### FO-03 — In-House stay-date financial correctness

- **Objective:** Make extension and early departure financially authoritative.
- **Dependencies/owners:** Rate & Revenue quote, Reservation amendment rules, migration 0178 reconcile function, Cashiering folio; verify target DB first.
- **Backend scope:** Quote proposed dates, validate availability/restrictions, write dates, call `reconcile_reservation_unit_room_charge`, define posted-charge and early-departure penalty/refund/adjustment semantics, record history.
- **Frontend scope:** Separate Extend and Early Departure confirmations showing price/folio impact and policy.
- **Tests/browser:** Extend and shorten with unposted/posted charges, penalty and no-penalty, multi-night delta, failure rollback/compensation semantics.
- **PASS/CLOSED:** Date and financial state reconcile through existing owners with an auditable result.
- **Non-goals:** FO rate engine, direct folio insert, reopening ordinary Reservation creation/edit.

### FO-04 — Multi-room unit awareness

- **Objective:** Preserve `reservationId` + `reservationRoomId` through every operational action.
- **Dependencies/owners:** Existing reservation-unit authority; FO-03 for unit/date semantics where needed.
- **Backend scope:** Unit rows/read models or mandatory unit selection for arrivals, in-house, departure, checkout, no-show, assignment, occupants, move, extension, and early departure.
- **Frontend scope:** Never let a master row silently choose a unit; display mixed sibling lifecycle states.
- **Tests/browser:** Unit 1 checked-in appears In-House while Unit 2 confirmed appears Arrivals; each action targets only the selected unit.
- **PASS/CLOSED:** No unit-scoped action can execute ambiguously from a master row.
- **Non-goals:** New reservation-unit model or master-status replacement.

### FO-05 — Walk-In consolidation

- **Objective:** One sequence: `CreateReservationPage mode="walk-in"` → `createReservation` → Continue to Check-In v2.
- **Dependencies/owners:** FO-01/FO-02 closed; Reservations create remains authoritative.
- **Backend scope:** Truthful `source=walk_in` and `walk_in_incomplete`; reuse existing create and check-in commands.
- **Frontend scope:** WI03 Continue to Check-In; retire `WalkInDialog`; remove `WalkInsFrame` and legacy host where safe.
- **Tests/browser:** New/existing guest, room assigned/unassigned policy, quote, create, continue, check-in, completion/history.
- **PASS/CLOSED:** One live create host and one check-in host; walk-in history is truthful.
- **Non-goals:** `createWalkInReservation` or second pricing/availability engine.

### FO-06 — Assignment concurrency and freshness

- **Objective:** Give deterministic conflict handling for simultaneous assignments.
- **Dependencies/owners:** Reservation assignment and Inventory eligibility RPC.
- **Backend scope:** Recheck unit mutability, expected current assignment/version, and room eligibility atomically at commit; return a recognizable stale/conflict result.
- **Frontend scope:** Show conflict, refresh candidates, preserve safe user context.
- **Tests/browser:** Two staff assign the same room/unit and one gets a clear conflict; no double assignment.
- **PASS/CLOSED:** Stale assignment cannot silently overwrite newer state.
- **Non-goals:** Global lock table, new assignment writer, client-only optimistic lock.

### FO-07 — Cross-module data freshness

- **Objective:** Make critical open screens reflect owner-module changes in an operationally bounded interval.
- **Dependencies/owners:** HK, Inventory, Cashiering, Guest Profile query contracts.
- **Backend/read scope:** Stable query keys and lightweight refresh endpoints only where required.
- **Frontend scope:** Invalidate after known cross-module mutations, explicit Refresh, refetch on focus, and justified light polling on Rack, Arrivals, Check-In, In-House, Departures, Exceptions.
- **Tests/browser:** HK inspected, room blocked/OOS/assigned, payment/deposit/refund/settlement, and guest identity updates appear without full page reload.
- **PASS/CLOSED:** Staleness bounds are documented and verified for priority screens.
- **Non-goals:** Realtime everywhere, FO copies of owner data, offline queue.

### FO-08 — Arrivals finalization

- **Objective:** Close UI-11–13 as orchestration after unit/freshness foundations.
- **Dependencies/owners:** FO-01, FO-02, FO-04, FO-06, FO-07.
- **Backend scope:** Unit-aware list/QV, authoritative readiness/signals, ETA and exception composition.
- **Frontend scope:** List, QV, assignment/readiness, deposit/guarantee, guest issue, request, ETA, exceptions, Check-In.
- **Tests/browser:** Unit rows, dirty/ready transition, missing guest/deposit, assignment conflict, entry to selected-unit Check-In.
- **PASS/CLOSED:** Every arrival action opens the correct owner workflow for the correct unit.
- **Non-goals:** Reservation edit duplication or persisted exception table.

### FO-09 — In-House finalization

- **Objective:** Close UI-20–29 ordinary stay execution.
- **Dependencies/owners:** FO-03, FO-04, FO-07.
- **Backend scope:** Unit-aware QV/actions, priced dates, move, occupants, guest owner links, notes, exceptions.
- **Frontend scope:** Coherent Stay Management with move, extend, early departure, guest update, notes/alerts, exceptions.
- **Tests/browser:** Mixed units, move, extension, early departure, profile update refresh, notes, exception resolution.
- **PASS/CLOSED:** In-house operations are financially and inventory safe.
- **Non-goals:** Stuffing full Guest Services into Stay Management.

### FO-10 — Departures and checkout finalization

- **Objective:** Close UI-30–39 around the existing strong checkout backend.
- **Dependencies/owners:** FO-04 and FO-07; Cashiering and HK remain owners.
- **Backend scope:** Verify unit candidate/readiness, settlement, close, checkout transition, late checkout, no-show handoff, HK dirty.
- **Frontend scope:** List, QV, preparation, folio/balance, settlement, validation, confirmation, completion, exceptions.
- **Tests/browser:** Zero balance, outstanding payment, override, credit/refund escape, unit checkout, late checkout, HK consequence, no-show handoff.
- **PASS/CLOSED:** Ordinary departure finishes with correct folio, unit, reservation rollup, room/HK, and history.
- **Non-goals:** FO refund engine, duplicate invoice engine, cashier shift duplication.

### FO-11 — Guest Services

- **Objective:** Complete Guest Services only if target hotels require the fuller domain.
- **Dependencies/owners:** Guest Services/Guest Profile; Card4/department setup.
- **Backend scope:** Canonical request, category, stay/guest, department, assignee, priority, due/SLA if required, status, completion/cancel, escalation, history. Retire legacy traces writes.
- **Frontend scope:** FO operational window/actions that call the owner; full master workspace remains owner-side.
- **Tests/browser:** Lifecycle, routing, permission, SLA/escalation if implemented, FO link/create/update.
- **PASS/CLOSED:** One request domain; no reservation-note or `fo_guest_requests` substitute.
- **Non-goals:** FO-owned Guest Services master.

### FO-12 — Exceptions refinement

- **Objective:** One derived operational control model across owner signals.
- **Dependencies/owners:** FO-08–FO-10 and Guest Services if enabled.
- **Backend scope:** Consolidate derivation where practical; compose room, HK, arrival, CI, in-house, checkout, Cashiering, guest-data signals.
- **Frontend scope:** Truthful source status, refresh, owner CTAs, separately identified audited overrides.
- **Tests/browser:** Every exception resolves only by changing owner state; stale/permission-denied sources remain honest.
- **PASS/CLOSED:** No duplicate exception engine or fake resolved flag.
- **Non-goals:** Exception table without a concrete persisted workflow.

### Later / enterprise

#### FO-L1 — Approvals

- **Objective/owner:** Security/Admin-owned central requests for proven asynchronous approval needs.
- **Dependencies:** Concrete consumer and policy; Rate/Cashiering integrations.
- **Scope:** Requester, approver, states, threshold, source/target, before/after, reason, expiry, events; thin FO inbox/context.
- **Acceptance:** One reusable lifecycle with authorization and history.
- **Non-goals:** Eight disconnected approval engines. **Core:** No.

#### FO-L2 — Communications

- **Objective/owner:** Notifications-owned delivery first; FO consumes guest/arrival/in-house/departure/internal messaging and history.
- **Dependencies:** Recipient resolution, templates, channel providers, outbox/retry/delivery events.
- **Scope/tests:** Send commands, status/retry/history, permission, browser context. Migrate direct checkout email when suitable.
- **Acceptance:** Delivery is observable and auditable. **Non-goal:** treating Card4 settings as delivery. **Core:** No.

#### FO-L3 — Reports

- **Objective/owner:** Extend Reports & Analytics readers/catalogue.
- **Dependencies:** Stable owner histories/read models.
- **Scope/tests:** FO-context links, filters, exports only where client need exists.
- **Acceptance:** One report engine. **Non-goal:** FO report warehouse. **Core:** No.

#### FO-L4 — Consolidated history

- **Objective/owner:** Security/Audit composition over existing owner histories.
- **Dependencies:** Normalized actor, role, timestamp, business date, source, before/after, reason, reservation, unit, room, guest, folio references.
- **Scope/tests:** Search/detail/read permissions; no copy-on-write log.
- **Acceptance:** Operationally useful unified read. **Core:** No.

#### FO-L5 — Shift and daily control

- **Objective/owner:** Add FO shift/handover only when client operations require it.
- **Dependencies:** FO exceptions/tasks and Cashiering shift reference; Night Audit checklist inputs.
- **Scope/tests:** Shift, handover, unresolved items, checklist, close, actor/time audit.
- **Acceptance:** Reception shift is distinct from `hotel_cashier_shifts`. **Core:** No.

#### FO-L6 — Offline

- **Objective/owner:** Platform-wide queue/replay/conflict/sync architecture.
- **Dependencies:** Platform transaction identity and all owner writers.
- **Scope/tests:** Deferred in full.
- **Acceptance:** Not applicable now. **Non-goal:** FO local-storage mutation hack. **Core:** No.

#### FO-L7 — Administration views

- **Objective/owner:** Read-only effective settings/security visibility in FO.
- **Dependencies:** Property Setup and Security read APIs.
- **Scope/tests:** Preferences, permissions, action rules, audit config, and deep links; no writes.
- **Acceptance:** Masters remain owner-side. **Core:** No.

### Operational closure gate

Front Office can be called operational when these are PASS/CLOSED:

Room Rack and assignment → Arrivals → Check-In v2 → In-House → room move → financially correct extension/early departure → one Walk-In path → Departures → Cashiering-backed checkout → Housekeeping transitions → No-Show → multi-room unit safety → bounded cross-module freshness → sensitive-action audit.

All 118 catalogue UIs are not required. Approvals, communications, reports, consolidated history, shift, administration, and offline remain later unless a client requirement elevates them.

---

## X. Final verdict

1. **How much exists?** The core desk shell and most operational reads/writers exist. Approximately the first 49 catalogue capabilities have meaningful implementation, but many are partial; later enterprise phases are mostly absent or correctly external.
2. **Strongest phases:** Checkout/settlement, in-house room move, authoritative room assignment, unit-aware check-in backend, and room rack.
3. **Weakest phases:** Shift, offline, communications delivery, FO approvals, consolidated history/reports, and full Guest Services tracking.
4. **Missing backend domains:** FO approval requests, Notifications delivery/outbox, FO shift/handover, platform offline sync, Guest Services SLA/escalation. These are not all core.
5. **Missing frontend surfaces:** Check-In v2 key controls, unified walk-in continuation, unit-aware desk rows, complete stay-date financial confirmation, and most UI-68–118 surfaces.
6. **Misleading UIs:** Check-In v2 appears completable but cannot clear `KEY_REQUIRED`; Walk-In appears unified but has two hosts; operational counts are not reports; Card4 settings are not messaging.
7. **Are check-in flows coherent?** Backend and Steps 1–4 are coherent. The live flow is not operationally complete until FO-01.
8. **Are in-house flows coherent?** Room move is. Extension and early departure are not financially coherent; multi-room desk authority is incomplete.
9. **Are checkout flows coherent?** Yes for selected units and Cashiering/HK handoffs; finalization should verify mixed units and freshness.
10. **Is walk-in coherent?** No. It is duplicated and the preferred overlay does not continue to Check-In.
11. **Is Guest Services real?** Yes, partially, on `guest_service_history`; FO also retains a weaker duplicated traces table. It is not merely notes.
12. **Is Exceptions architecture correct?** The derived/no-table principle is correct. Two derivation layers and stale data need refinement.
13. **Is Approvals architecture real?** Not for FO. Rules and role gates exist; Rate has a separate real approval lifecycle.
14. **Is Communications functional?** Only checkout document email and guest activity logging. No general delivery engine.
15. **Are FO reports duplicated?** No report engine is duplicated yet. FO operational desks must not be relabelled as reports.
16. **Is History/Audit sufficient?** Sensitive core commands usually write history, but consolidated search, normalized context, and some override details are insufficient.
17. **Does Shift Control exist?** No. Cashiering shifts are not FO shifts.
18. **Does Offline truly exist?** No; policy only. DEFER.
19. **Does FO consume Reservation data authoritatively?** Yes, but header-oriented desks are not sufficiently unit-aware.
20. **Does FO consume Room & Inventory authoritatively?** Yes. Eligibility and owner writers are reused; assignment concurrency UX is incomplete.
21. **Does FO consume Housekeeping authoritatively?** Yes for policy/state and CI/CO transitions; receptionist read access and freshness are gaps.
22. **Does FO consume Maintenance authoritatively?** It reads room maintenance status and links out; work-order integration is shallow and stale.
23. **Does FO consume Cashiering authoritatively?** Yes. Deposits, payments, settlement, close, refunds/credits remain Cashiering-owned.
24. **Does FO consume Rate & Revenue authoritatively?** At reservation/walk-in create, yes. In-house date changes fail to invoke priced reconciliation.
25. **Does FO consume Guest Profile authoritatively?** Yes for identity/registration/documents; active-flow refresh and duplicate handling remain owner-side gaps.
26. **Does FO communicate through Notifications?** No. Checkout calls Resend directly; Card4 is configuration.
27. **Does FO use Security permissions/approvals authoritatively?** Server role permissions are real. Approval requests are not.
28. **Does FO consume Night Audit/business date correctly?** Yes as a read-only business date. It does not advance the date.
29. **Which integrations are stale/manual?** HK readiness, inventory/blocks/status, external assignment, folio changes, Guest Profile changes, maintenance, and composed exceptions on already open screens.
30. **Are duplicate engines present?** No duplicate folio/rate/inventory writer, but duplicate walk-in UI, legacy check-in host, legacy guest traces, and two exception derivation layers remain.
31. **What legacy flows remain?** `WalkInDialog`, `WalkInsFrame`, `LegacyCheckInStepperHost`, `FoCheckInWorkspaceSheet` pre-host, and deprecated ungated writer exports. Legacy room routes correctly redirect.
32. **Top 10 correctness risks:** (1) v2 key dead-end; (2) extension without reprice; (3) early departure without posted-charge/policy reconcile; (4) mixed-unit rows/actions; (5) duplicate walk-in semantics; (6) simultaneous assignment conflict UX; (7) stale HK readiness; (8) stale folio state; (9) stale inventory/maintenance state; (10) fragmented sensitive-action audit/role-only approvals.
33. **What first?** Phase 0 freeze, then FO-01 Check-In v2 key issuance and waiver.
34. **Minimum sequence to operational:** FO-01 → FO-02 → FO-03 → FO-04 → FO-05 → FO-06 → FO-07 → FO-08 → FO-09 → FO-10. FO-11 and FO-12 are secondary.
35. **What is explicitly deferred?** UI-01; FO-L1 approvals until proven; FO-L2 delivery foundation; FO-L3 report expansion; FO-L4 consolidated history; FO-L5 shifts unless clients require them; FO-L6 offline; FO-L7 read-only admin; FO-owned room status/block/configuration/report engines permanently.

---

FRONT OFFICE CAPABILITY & INTEGRATION AUDIT: COMPLETE

Implementation:
NONE

Frontend changes:
NONE

Backend changes:
NONE

Database changes:
NONE

Next action:
FO-01 — Check-In v2 key issuance and waiver


