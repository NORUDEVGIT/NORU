# Reservation finalization audit

Read-only closeout of the NORU Reservation module against the current code and the UI-53–134 product catalogue. This file does not change application code, tests, migrations, or data.

The full screen specification for UI-53–134 is not in the repository. This audit uses the catalogue names in the closeout brief as the product target, and the current implementation as the product reality. [docs/pms/db-04-reservation-operational-read-models-plan.md](db-04-reservation-operational-read-models-plan.md) and [docs/pms/db-01-db-02-reservation-core-ownership-contract.md](db-01-db-02-reservation-core-ownership-contract.md) are historical. Where they disagree with code, this audit follows the code and marks the document stale. Production database state is UNKNOWN. Non-production application of migrations is not inferred.

Module ownership used below:

- Reservations own lifecycle, units, commercial reservation state, dates, guest linkage, notes, and special requests.
- Room & Inventory own physical availability, assignment eligibility, inventory blocks, and OOO/OOS.
- Front Office owns check-in, in-house execution, in-house room move, check-out, and no-show execution.
- Housekeeping owns clean, dirty, inspected, and readiness policy.
- Cashiering owns folio, payments, deposits, refunds, invoices, and settlement.
- Rate & Revenue own rate plans, rules, restrictions, and pricing.
- Groups & Blocks own the operational group master, allotment, pickup, and cutoff.
- Guest Profile owns identity, preferences, and history.
- Notifications own templates, channels, and delivery.
- Security & Audit own permissions, approvals, and the central audit trail.

No second availability engine, folio, or check-in command is recommended.

---

## A. Current reservation core

The Reservation Desk at `/restaurant/pms/reservations` is the canonical workspace. It stays mounted while New Reservation and Reservation Detail open as overlays. Filters, view, page, and row selection are local React state.

| Capability | Status | Evidence |
| --- | --- | --- |
| Reservation Desk | PASS | `getReservationDesk` in `desk.server.ts`. UI-01 in DB-04. |
| Operational search | PASS | `searchOperationalReservations`. Confirmation, guest, phone, email, room number, external reference. Debounce 300ms, minimum two characters. |
| Filters | PASS | Server-side compact bar and advanced filters. No client filter of the page. Saved-filter persistence is deferred and is not core. |
| Server-side views | PASS | all, arrivals, departures, in_house, unassigned, pending, groups. The groups view is linked group masters, not allotment. |
| KPIs | PASS | Business-date arrivals, departures, in-house, unassigned, pending, VIP arrivals. Available rooms are physical vacant, labelled as such. Waitlist KPI stays null on the Desk. |
| Quick View | PASS | `getReservationQuickView`. Financial balance is Cashiering-gated and is never shown as zero when permission is denied. |
| New Reservation | PASS | In-workspace create overlay. `/restaurant/bookings/new` remains a compatibility shell. |
| Reservation Detail | PASS | Overlay is canonical. `/restaurant/pms/reservations/$reservationId` remains a full-page host. |
| Edit Reservation | PASS | `amendReservation`. Unit-scoped edits go through `applyUnitScopedReservationEdit` when `reservationRoomId` is set. |
| Cancellation | PASS | Existing cancel command and `FoCancelStepper`. Orchestration debt already accepted. |
| Reactivation | PASS | `setReservationStatus` with the server capacity check. No-show reactivation stays deferred. |
| No-show | PASS | Front Office owns execution. Reservation surfaces the action. |
| Room assignment | PASS | `assignReservationRoom` calls `assign_hotel_reservation_room_unit`. `listAssignableRooms` stays eligible-only. |
| Multi-room model | PASS | `hotel_reservation_rooms` is the unit authority. Header status rolls up. |
| Guest linkage | PASS | Booker on the header. Named occupants on `hotel_reservation_room_guests`. |
| Company, travel agent, group | PASS | Stored links. Group allotment is section C, not the Desk groups view. |
| Rate plan, market, source, external reference | PASS | Stored on the reservation. Pricing authority stays Rate & Revenue. |
| Notes and special requests | PASS | Separate fields. |
| Packages | PASS | Reservation package snapshots. Posting stays Cashiering. |
| Folio linkage | PASS | One folio per reservation (`guest_folios_one_per_reservation`). Reservation reads it. Cashiering posts it. |
| History | PASS | `hotel_reservation_history` with event types for amend, assign, check-in, check-out, no-show, ETA, late checkout, and room guests. |
| Permissions | PASS | `requireReservationManager` and `RESERVATION_MANAGE_ROLES` (`owner`, `manager`, `receptionist`). UI hints are not authorization. |
| Workspace overlays | PASS | One large overlay at a time. Front Office dialogs stack above it. Escape is layer-specific. |

Core ordinary reservation operation is PASS / CLOSED. Do not reopen it.

Stale doc note: DB-04 still says Arrivals readiness uses `isRoomReady` without Card 2 settings, and that the Exceptions slice has no UI. Current `arrivals-departures.server.ts` and `exceptions.server.ts` both load `loadCard2HousekeepingSnapshot`. The Exceptions and Arrivals workspaces are mounted from `reservations-workspace.tsx`.

---

## B. Booking Calendar — UI-53 to UI-89

Calendar read is `getReservationCalendar` in `calendar.server.ts`. Presentation and drag orchestration are `booking-calendar.tsx` and `booking-calendar.ts`. Bars are not stored.

Authoritative mutations, already present:

- Pre-arrival room change and date change, including extend, are one `amendReservation` after `reservationAmendImpact`. Drop does not save. The review copy says availability is rechecked on save.
- In-house room-only change is `calendarMoveKind` = `fo_room_move`, which selects the row and calls the existing Desk `change_room` action. It does not patch `room_id`.
- In-house date change is `open_detail`. The toast tells staff to use Reservation Detail. Front Office remains the in-house stay writer.
- Assignment uses the existing assign dialog. Eligibility remains `pms_evaluate_room_assignment` through `assignReservationRoom` and `listAssignableRooms`.
- Availability on the board is `getRoomTypeAvailabilityCompat`, capped at 40 room types. That is the inventory read, not a second engine.
- Group operational detail is not painted as a second group calendar. Dated `pms_operational_inventory_blocks` are the calendar blocks.
- Calendar exceptions are a slice of `getReservationExceptions` (first 12). The control workspace remains the full list.
- `updatedAt` is a concurrency identity on the bar. `calendar.server.test.ts` asserts there is no calendar lock and no `SELECT FOR UPDATE`.
- Bulk calendar mutation is not safe to add as one writer. Each stay must go through amend or the Front Office move.
- Saved views are local React state. Persistence is not required to operate the board.
- Print of a reservation confirmation already exists as `ReservationPrintDocument` and `window.print()`. A calendar-board export is presentation only.
- Offline mutation has no Reservation architecture. UI-87 offline is DEFER.

`booking-calendar.test.ts` already locks `calendarMoveKind` (confirmed amend, in-house room `fo_room_move`, in-house dates `open_detail`) and asserts the panel contains `amendReservation` and `reservationAmendImpact`.

Gap that is real but not a new engine: the impact preview passes `currentTotal` and `proposedTotal` as null, so the dialog does not show a priced before/after. The save still uses `amendReservation`, which is the priced stay command. That is a read-model preview gap.

---

## C. Groups & Blocks — UI-90 to UI-103

GB01–GB06 are in the current tree: inventory holds through block sync, pickup from `hotel_reservation_rooms`, cutoff, the three-step create wizard, and the detail overlay (overview, allotment, pickup, rooming, linked reservations, history).

GB07 is not still paused. `GroupDetailWorkspace` calls `onCreateStay(groupId, blockId)`. `reservations-workspace.tsx` opens New Reservation with `pmsGroupId` and `pmsGroupBlockId`. `groups-reservation-prelink.ts` offers only an active block of the same room type whose dates contain the stay. `headerGroupBlockIdFromUnits` sets the header block only when every selected unit block id is the same. Mixed blocks leave the header null. Do not reintroduce a header fallback that stamps one block onto unlike units.

`releaseGroupBlock` releases remaining allotment. `amendGroup` amends the master. `addRoomingRow` and `convertRoomingRow` own the rooming list. History is `pms_group_history`.

Group rate setup stores `rate_plan_id` and shows it as a preferred rate plan. A negotiated or per-block rate engine belongs to Rate & Revenue. It is not required to close Groups.

Communications and documents are not group tables. Notification settings live in property setup. They can wait.

`0180_reservation_room_group_block.sql` adds `hotel_reservation_rooms.pms_group_block_id` and backfills it from the header. Its comment still mentions a header fallback for pickup. Current pickup copy says counts come from room units. The backfill is a one-shot copy of the header onto units that have no unit block yet. Apply it only as a reviewed migration, not from this audit. After it is applied, new creates must keep using `headerGroupBlockIdFromUnits`.

Groups can close without another GB07 design.

---

## D. Waitlist — UI-104 to UI-115

A foundation exists. It is not MISSING.

- Tables: `pms_waitlist_requests`, `pms_waitlist_offers`, `pms_waitlist_history` in `0097_pms_waitlist.sql` (drizzle and supabase copies).
- Server: `listWaitlist`, `getWaitlist`, `createWaitlistRequest`, `amendWaitlistRequest`, `matchWaitlist`, `createWaitlistOffer`, `respondWaitlistOffer`, `convertWaitlist`, `cancelWaitlistRequest`, `expireWaitlistOffer`.
- UI: `waitlist-workspace.tsx`, mounted as a Reservation workspace section.
- Status display: open, offered, accepted, converted, cancelled, expired. Offer expiry is derived when `expiresAt` has passed.
- Match uses `getRoomTypeAvailabilityCompat` and `quoteStay`. It does not invent availability.
- Convert requires an accepted offer, then calls `createReservation` and links `reservation_id`. Deposit and guarantee follow ordinary create. The new stay is `pending` and unassigned.
- Guest linkage is `guest_id` on the request.
- History rows are written for the lifecycle events.
- Communications are not sent from the offer command. UI-113 is DEFER.

Waitlist is not required as new work for an initial operational release. The workspace can ship as it is. Properties that do not use it are unaffected because the Desk waitlist KPI stays null.

---

## E. Arrivals & Departures — UI-116 to UI-126

`getReservationArrivalsDepartures` is the read. It wraps Front Office arrival and departure loaders. It does not check in, check out, move rooms, or mark no-show.

The snapshot supplies arrival and departure rows, ETA (`expected_arrival_at`), late checkout (`late_checkout_granted`, `late_checkout_until`, `late_checkout_note`), room operational and housekeeping status, Card 2 readiness, and a cashiering financial signal capped at 200 ids. Exception keys are derived: arrival `unassigned`, `room_not_ready`, `room_unavailable`, `payment_issue`; departure `overstay`, `payment_issue`.

Writers that are Reservation-owned and already exist:

- `setExpectedArrivalTime` and `bulkSetExpectedArrivalTime` (cap 50), history `expected_arrival_updated`, only while pending or confirmed.
- `setLateCheckout`. It does not change `departure_date`. History `late_checkout_updated`. Fee posting stays Cashiering.

Stay extension opens the existing Front Office extend path (`extend_stay`). Check-in, check-out, assign, and no-show open the existing Front Office dialogs.

Bulk check-in or bulk check-out would duplicate Front Office and is not a Reservation writer. The legitimate Reservation bulk action is ETA. Daily totals exist as `dailyControlTotals`. There is no separate arrivals audit table. History is the reservation history events above.

This band is read and handoff work. The Card 2 wiring the old DB-04 text said was missing is present.

---

## F. Reservation Exceptions & Control — UI-127 to UI-134

`getReservationExceptions` is derived aggregation. There is no exception table and no workflow engine. `ReservationControlWorkspace` is the UI.

Keys: `unassigned`, `room_unavailable`, `room_not_ready`, `operational_block`, `payment_issue`, `overstay`, `room_discrepancy`, `overbooking`, `missing_rate_snapshot`, `missing_guest_contact`, `assignment_overlap`.

Severity is `high` or `standard`. Confirmed unassigned is high and blocking. Pending unassigned stays standard. Room readiness uses Card 2 settings. Financial permission denial omits payment exceptions and sets `financial_signals_unavailable`. Output cap is 500.

Resolution is the underlying owner command: assign room, check-out, open the reservation, open housekeeping, or open the room rack. When the condition disappears, the next read no longer returns the row. That is a safe definition of resolved for these operational conditions. A persisted “resolved” flag would hide a condition that is still true.

Explicit workflow state is not required for this set. Bulk resolution is not safe, because each key has a different owner and a different command. Approval workflow is not present and is not justified by these keys. Connectivity exceptions belong to distribution, not this list. UI-134 is satisfied by reservation, group, folio, and inventory history, not by an exception-case log.

Guarantee and company-credit gaps are not exception keys. They stay commercial fields on the reservation. Do not add them by inventing a workflow engine.

---

## G. Cross-cutting capabilities

### Permissions

`requireReservationManager` gates reservation reads and writes used by Desk, calendar, arrivals, and exceptions. Manage roles are owner, manager, and receptionist. Group and waitlist writers use their own server gates. UI `canManage` hides actions. It is not the authorization boundary.

Not separately permissioned, and not required: calendar export, waitlist as its own role, exception “resolve” as its own role. Financial figures already fail closed when Cashiering access is missing.

### Audit

Reservation history stores event type, actor membership, and previous/new values for stay changes. Room assignment and room-guest changes write history. Group history is `pms_group_history`. Waitlist history is `pms_waitlist_history`. Folio history stays Cashiering. Group history display may show the actor as “Staff” rather than a resolved name. That is a label gap, not a missing event.

### Concurrency

There is no reservation `updated_at` compare-and-swap on `amendReservation`. Last write wins on the header. Room assignment and inventory RPCs are the race boundary for a physical room and for sellable inventory. Calendar drag shows `updatedAt` and then re-reads the reservation before amend, but it does not send the version back as a predicate. That is sufficient for ordinary operation because save rechecks availability. It is not a general optimistic lock. Do not add a lock table to close Reservation.

### Communications

Property notification settings and communication event tables exist outside Reservation. Reservation, group, and waitlist commands do not deliver email or SMS. Closing Reservation does not require a send button on each workspace.

### Documents

No shared reservation attachment store is required for closeout. Confirmation print is `ReservationPrintDocument`. Group documents and waitlist letters are deferred.

### Export / Print

Confirmation print exists and does not mutate the stay. Calendar, arrivals, exceptions, and groups have no CSV/Excel export. That is presentation and can wait. Reports belong to the reports workspace.

### Empty / loading / error

Desk, calendar, groups, waitlist, arrivals, and exceptions each have a loading and an error path. Empty copy exists for no rows, no exceptions, and no waitlist matches. Treatment is consistent enough for operation. A shared empty-state component is polish.

### Offline

NORU Reservation is an online server-function application. There is no offline queue. UI-87 offline mutation is DEFER.

---

## H. Database / migrations

Repo files are the schema expectation. Whether a database has applied them is not known here. Do not apply them from an audit.

Reservation-relevant files in the current tree, mirrored under `drizzle/migrations` and `supabase/migrations`, include the operational read models’ earlier additions and the later unit work:

- `0097_pms_waitlist.sql`
- `0098_pms_reservation_eta_late_checkout.sql`
- `0153_hotel_reservation_rooms.sql` / `0154_create_reservation_room_units.sql` / `0158_room_unit_authority.sql`
- `0160_reservation_room_guests.sql` / `0161_manage_reservation_room_guest.sql`
- `0168_room_assignment_eligibility_qualification.sql`
- `0176_reservation_unit_packages.sql`
- `0177_reservation_package_folio_charge.sql`
- `0178_edit_reservation_room_charge_reconcile.sql`
- `0179_complete_reservation_no_show.sql`
- `0180_reservation_room_group_block.sql`
- `0181_room_guest_primary_guard.sql`

`0180` and `0181` say they are for the pull request and must not be applied from an agent. `0181` replaces `manage_reservation_room_guest` so any primary removal raises `ROOM_GUEST_PRIMARY_REQUIRED`. It does not clear `hotel_reservations.guest_id` and does not change occupancy. Duplicate drizzle/supabase copies of `0181` are the same statement.

No missing waitlist, arrivals, or exception table is required. Saved calendar views would need a new table only if that deferral is later accepted. Do not add it now.

Header versus unit: the unit is authoritative for status, dates, and assignment when units exist. Group block on the header is a shared-block convenience, not a second pickup counter. The unsafe pattern is copying a header block onto units that consume different allotments. Current create prelink avoids that. `0180`’s backfill copies the header onto units that are still null. Review that backfill before applying it to a database that already has mixed-block stays.

Stale legacy columns remain on `hotel_reservations` as compatibility (header `room_id`, header dates, header `guest_id`). They are not a second writer when unit commands are used. Full-page `/restaurant/pms/reservations/$reservationId` still exists beside the overlay.

Indexes and foreign keys for the group-block unit column are in `0180`. This audit did not scan every reservation index for theoretical extras. No missing foreign key was found that blocks ordinary create, assign, or pickup.

---

## I. Test coverage

Present and mapped:

- Desk, search, filters, quick view: `desk.server.test.ts`, `search.server.test.ts`, `reservation-desk-filters.test.ts`, `quick-view.server.test.ts`, `reservations-workspace.test.ts`, `reservation-quick-view.test.ts`.
- Create, edit, cancel, reactivate, lifecycle: `create-reservation-phase1-section*.test.ts`, `reservation-edit-workspace.test.ts`, `reservation-cancel-workspace.test.ts`, `reservations.lifecycle.test.ts`, `reservation-actions.test.ts`.
- Multi-room units, occupants, packages: `reservation-room-units.test.ts`, `reservation-room-occupants.test.ts`, `reservation-room-operations.test.ts`, `reservation-detail-rooms.test.ts`, `group-reservation-e2e-hotfix.test.ts`.
- No-show: `reservation-noshow-workspace.test.ts`.
- Calendar read and move routing: `calendar.server.test.ts`, `booking-calendar.test.ts`.
- Groups, pickup, cutoff, wizard, detail, prelink: `groups.test.ts`, `groups.functions.test.ts`, `groups-inventory-lifecycle.test.ts`, `groups-create-wizard.test.ts`, `groups-detail-workspace.test.ts`, `groups-operational-detail.test.ts`, `groups-reservation-prelink.test.ts`.
- Waitlist: `waitlist.test.ts`, `waitlist.functions.test.ts`.
- Arrivals, ETA, late checkout: `arrivals-departures.server.test.ts`, `arrivals-departures.functions.test.ts`, `arrivals-departures-workspace.test.ts`.
- Exceptions: `exceptions.server.test.ts`, `reservation-control-workspace.test.ts`, `fo-exceptions.test.ts`.
- Cashiering projection: `reservation-cashiering-summary.test.ts`, `reservation-detail-folio.test.ts`.
- Permissions: asserted inside the server tests via `requireReservationManager` / `RESERVATION_MANAGE_ROLES`.

Missing or thin, and not a close blocker unless noted:

- No browser test of calendar drop through to a saved amend.
- `booking-calendar.test.ts` does not assert the `change_room` string in the drop handler. The kind function is tested. The UI branch is only visible by reading `handleDrop`.
- No test that two concurrent header amends reject the stale writer. See concurrency. Defer.
- Waitlist has no communications test because there is no send path.
- Exception tests cover derivation, not a persisted resolve action. That absence is correct.

---

## J. Route / workspace consistency

Canonical workspace: `/restaurant/pms/reservations` with sections desk, calendar, groups, waitlist, arrivals-departures, exceptions.

Still present:

| Route | Role |
| --- | --- |
| `/restaurant/bookings/` | Redirects to `/restaurant/pms/reservations`. |
| `/restaurant/bookings/reservations` | Redirects to `/restaurant/pms/reservations`. |
| `/restaurant/bookings/$reservationId` | Redirects to `/restaurant/pms/reservations/$reservationId`. |
| `/restaurant/bookings/new` | Still renders `CreateReservationPage` inside `RestaurantShell`. Compatibility, not the Desk path. |
| `/restaurant/pms/reservations/$reservationId` | Still renders full-page Detail. Desk Open uses the overlay instead. |
| `/restaurant/bookings/rates` and `/restaurant/bookings/distribution` | Other modules. Not reservation writers. |

Desk New, Open, Edit, Assign, Check-In, Check-Out, Cancel, and No-Show stay inside the workspace. They call the existing server commands. No second create or assign path was found on the calendar or arrivals boards.

---

## K. Documentation versus product reality

For each UI below, the class is one of: already implemented, implemented equivalently, frontend composition, read-model work, mutation work, schema work, other module, defer.

The matrix in section L is the row-level record. Summary:

- Core desk, detail, create, assign, cancel, and history are already implemented.
- Calendar move, extend, and drag are implemented equivalently on `amendReservation` and the Front Office room move. They do not need a new mutation.
- Calendar availability, exceptions, and group blocks are read-model composition of Inventory, Exceptions, and Groups.
- Groups operational screens are implemented. Group rate negotiation, communications, and documents are other-module or defer.
- Waitlist lifecycle is implemented. Offer delivery is defer.
- Arrivals and departures are implemented as reads plus existing writers and Front Office handoff.
- Exceptions are implemented as a derived read. Persisted workflow is defer.
- Saved views, bulk calendar edits, calendar export, calendar reports, and offline are defer or other-module.

---

## L. Final UI-53–134 matrix

Status is PASS, PARTIAL, MISSING, WRONG_OWNER, DUPLICATED, or DEFER. “Close?” means required before Reservation is PASS / CLOSED and build focus moves to Front Office.

| UI | Name | Status | Existing implementation | Backend | Frontend | Schema | Owner | Gap | Priority | Close? | Increment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-53 | Calendar Filters | PARTIAL | Horizon, mode, density, room type, search | Read exists | Local filters | None | Reservation | No saved or building/floor filter set | Low | No | Defer |
| UI-54 | Reservation Quick View Drawer | PASS | Shared Quick View rail on calendar select | `getReservationQuickView` | Equivalent rail, not a second drawer | None | Reservation | None | — | No | None |
| UI-55 | Calendar Reservation Action Menu | PASS | Desk `onAction` / context actions | Existing commands | Shared menu | None | Reservation | None | — | No | None |
| UI-56 | Calendar Quick Search | PASS | `listOperationalReservations` plus focus shift | Existing search | Search box | None | Reservation | None | — | No | None |
| UI-57 | Move Reservation | PARTIAL | Pre-arrival amend; in-house room via `change_room` | `amendReservation`, FO move | Drop opens review or FO action | None | Reservation / FO | Impact totals are null | Low | No | Preview only if wanted |
| UI-58 | Select New Room | PARTIAL | Drop targets a room lane; room-type mode does not drop | Assign command separate | Room board | None | Inventory assign | No second room picker | Low | No | None |
| UI-59 | Move Reservation Impact Review | PARTIAL | `reservationAmendImpact` dialog | Recheck on save | Dialog | None | Reservation | Price before/after not loaded | Low | No | Optional read |
| UI-60 | Move Reservation Completed | PARTIAL | Toast and calendar refetch | Amend result | No dedicated completion page | None | Reservation | Completion is a toast | Low | No | None |
| UI-61 | Extend Stay | PARTIAL | Same dialog edits departure | `amendReservation` | Departure input | None | Reservation | Not a separate command, by design | — | No | None |
| UI-62 | Extend Stay Impact Review | PARTIAL | Same impact dialog | Same amend | Same dialog | None | Reservation | Price preview null | Low | No | Optional read |
| UI-63 | Extend Stay Completed | PARTIAL | Same toast | Same amend | No completion page | None | Reservation | Toast only | Low | No | None |
| UI-64 | Unassigned Reservations | PASS | Unassigned lane for pending/confirmed | Calendar read | Lane | None | Reservation | None | — | No | None |
| UI-65 | Conflict / Assignment Warning | PARTIAL | Bar keys: unassigned, unavailable, overlap | Derived on read; eligibility on save | Chip | None | Inventory | No pre-drop eligibility panel | Low | No | None |
| UI-66 | Availability Overlay | PARTIAL | Per-type availability, cap 40 | `getRoomTypeAvailabilityCompat` | Counts on the board | None | Inventory | Not a cell editor | — | No | None |
| UI-67 | Group / Block View | PARTIAL | Inventory blocks on the calendar | Block read | Not a group calendar | None | Inventory / Groups | Group detail stays on Groups | Low | No | None |
| UI-68 | Empty / Conflict States | PARTIAL | Truncation warning, empty exception copy | Caps and warning keys | Inline copy | None | Reservation | Not a designed empty illustration | Low | No | None |
| UI-69 | Assign Room Review | PASS | Existing assign dialog | `assignReservationRoom` | Shared dialog | None | Inventory | None | — | No | None |
| UI-70 | Assign Room Completed | PASS | Assignment command result | Same RPC | Shared dialog | None | Inventory | None | — | No | None |
| UI-71 | Drag & Drop Reservation | PARTIAL | Room-mode drag, review before save | No new writer | `handleDrop` | None | Reservation | Room-type mode does not drop | — | No | None |
| UI-72 | Drag & Drop Validation / Conflict | PARTIAL | `calendarMoveKind`; invalid drop no-ops | Server reject on save | Kind routing | None | Reservation | No client eligibility call | Low | No | None |
| UI-73 | Drag & Drop Impact Review | PARTIAL | Same as UI-59 | Amend | Dialog | None | Reservation | Price preview null | Low | No | None |
| UI-74 | Drag & Drop Completed | PARTIAL | Same as UI-60 | Amend | Toast | None | Reservation | Toast only | Low | No | None |
| UI-75 | Room Type Calendar | PASS | `mode = room_type` | Calendar read | Mode select | None | Reservation | Drop disabled in this mode | — | No | None |
| UI-76 | Group & Block Calendar View | PARTIAL | Inventory blocks only | Not `getGroup` | No group swimlane | None | Groups | Use Groups workspace | Low | No | None |
| UI-77 | Reservation Status Overlay | PARTIAL | Status bar class and chips | Bar status | Display | None | Reservation | Not a separate overlay screen | Low | No | None |
| UI-78 | Availability Overlay | PARTIAL | Same read as UI-66 | Same availability RPC | Same counts | None | Inventory | Duplicate catalogue name | — | No | None |
| UI-79 | Calendar Exceptions | PARTIAL | First 12 from `getReservationExceptions` | Derived | Panel | None | Reservation | Full list is the control workspace | Low | No | None |
| UI-80 | Conflict Resolution | PARTIAL | Failure toast and owner actions | Existing commands | No resolver screen | None | Owning module | Do not add a resolver | — | No | None |
| UI-81 | Concurrency Conflict | PARTIAL | `updatedAt` on the bar only | No compare-and-swap | No stale-write dialog | None | Reservation | Last header write wins; inventory RPC still guards rooms | Low | No | Defer lock |
| UI-82 | Calendar Bulk Operations | DEFER | None | Would be unsafe as one writer | None | None | Reservation | Per-stay amend already exists | Low | No | Defer |
| UI-83 | Calendar Saved Views | DEFER | Local React state only | None | None | Would need a table | Reservation | Not required to operate | Low | No | Defer |
| UI-84 | Calendar Print / Export | DEFER | Confirmation print exists elsewhere | None for the board | None | None | Reservation | Board export is presentation | Low | No | Defer |
| UI-85 | Calendar Reports | WRONG_OWNER | Reports workspace | Do not add | Do not add | None | Reports | Not a reservation engine | Low | No | Defer |
| UI-86 | Empty State | PARTIAL | Truncation and empty exception copy | Caps | Inline | None | Reservation | Ordinary empty copy only | Low | No | None |
| UI-87 | Loading / Offline State | PARTIAL | Query loading and error | Online only | Spinners / errors | None | Reservation | Offline mutation is DEFER | Low | No | Defer offline |
| UI-88 | Permission / Access State | PARTIAL | `canManage` plus server gate | `requireReservationManager` | Actions hidden | None | Security | No calendar-only denied page | Low | No | None |
| UI-89 | System Error / Sync Conflict | PARTIAL | Query error text | No sync protocol | Inline error | None | Reservation | Sync conflict UI is DEFER with UI-81 | Low | No | Defer |
| UI-90 | Groups & Blocks Workspace | PASS | List plus detail overlay | `listGroups` | `groups-workspace.tsx` | `pms_groups` | Groups | None | — | No | None |
| UI-91 | Search | PASS | Group list search | `listGroups` | Search field | None | Groups | None | — | No | None |
| UI-92 | Quick View | PASS | GB06 replaced the side panel with the detail overlay | `getGroup` / operational detail | Overlay | None | Groups | Equivalent, not a drawer | — | No | None |
| UI-93 | New Group / Block | PASS | Three-step wizard | `createGroup`, `addGroupBlock` | `create-group-wizard.tsx` | Existing | Groups | Non-atomic create-then-block remains an accepted failure mode | Low | No | None |
| UI-94 | Room Block | PASS | Allotment rows and inventory sync | `addGroupBlock` | Allotment tab | Blocks | Groups / Inventory | None | — | No | None |
| UI-95 | Group Rate Setup | WRONG_OWNER | Preferred `rate_plan_id` only | Pointer, not a rate engine | Label on overview | None new | Rate & Revenue | No negotiated or per-block rate builder | Low | No | Defer |
| UI-96 | Pickup / Allotment | PASS | Unit-derived pickup | `getGroupOperationalDetail` | Pickup tab | `0180` unit block column when applied | Groups | Header is not a pickup counter | — | No | Confirm `0180` applied |
| UI-97 | Rooming List | PARTIAL | Add and convert rows | `addRoomingRow`, `convertRoomingRow` | Rooming tab | Existing | Groups | Convert needs a guest and room type | Low | No | None |
| UI-98 | Group Reservations | PASS | Linked stays plus GB07 create | Prelink on create | `onCreateStay` | Unit block id | Groups / Reservation | None | — | No | None |
| UI-99 | Group Amendment | PASS | `amendGroup` | Existing | Detail actions | None | Groups | None | — | No | None |
| UI-100 | Release / Cancel Block | PARTIAL | `releaseGroupBlock` sets remaining allotment | Existing | Release control | None | Groups | No separate impact document; release is immediate | Low | No | None |
| UI-101 | Communication | DEFER | No group send | None | None | None | Notifications | Do not build a second outbox | Low | No | Defer |
| UI-102 | Documents | DEFER | No group file store | None | None | None | Documents | Confirmation print is not a group file cabinet | Low | No | Defer |
| UI-103 | History & Audit | PARTIAL | `pms_group_history` tab | Events stored | Actor may render as Staff | Existing | Groups | Name resolution only | Low | No | Defer label |
| UI-104 | Waitlist Workspace | PASS | Mounted section | `listWaitlist` | `waitlist-workspace.tsx` | `0097` | Reservation | Desk KPI stays null on purpose | — | No | None |
| UI-105 | Search & Filters | PARTIAL | Search and status | List filters | Fields | None | Reservation | Not every catalogue dimension | Low | No | None |
| UI-106 | Quick View | PASS | Detail aside | `getWaitlist` | Aside | None | Reservation | None | — | No | None |
| UI-107 | New Waitlist Request | PASS | Create with guest profile | `createWaitlistRequest` | Form | `0097` | Reservation | None | — | No | None |
| UI-108 | Match | PASS | Availability plus quotes | `matchWaitlist` | Candidates | None | Inventory / Rates | Uses existing reads | — | No | None |
| UI-109 | Offer | PARTIAL | Offer row and expiry | `createWaitlistOffer` | UI | Offers table | Reservation | No message delivery | Low | No | Defer send |
| UI-110 | Offer Response | PASS | Accept / decline | `respondWaitlistOffer` | UI | None | Reservation | None | — | No | None |
| UI-111 | Convert to Reservation | PASS | Accepted offer to `createReservation` | `convertWaitlist` | UI | Link column | Reservation | Stay is pending and unassigned; deposit follows create | — | No | None |
| UI-112 | Amendment | PASS | Amend request | `amendWaitlistRequest` | UI | None | Reservation | None | — | No | None |
| UI-113 | Communication | DEFER | None | None | None | None | Notifications | Do not add a mailer here | Low | No | Defer |
| UI-114 | Expiration / Cancellation | PASS | Cancel request; expire offer | Both commands, plus derived expiry | UI | None | Reservation | None | — | No | None |
| UI-115 | History & Audit | PASS | `pms_waitlist_history` | `recordHistory` | Shown on the request | `0097` | Reservation | None | — | No | None |
| UI-116 | Arrivals & Departures Workspace | PASS | Mounted section | `getReservationArrivalsDepartures` | Workspace | `0098` for ETA / late checkout | Reservation | Does not own check-in | — | No | None |
| UI-117 | Arrivals List | PASS | Date queue, pending and confirmed | FO arrival loader | List | None | Reservation read | Checked-in excluded | — | No | None |
| UI-118 | Arrival Quick View | PARTIAL | Row detail in the workspace | Row DTO | Panel | None | Reservation | Not a second guest profile | Low | No | None |
| UI-119 | Arrival Exceptions | PARTIAL | Derived keys including Card 2 readiness | Same snapshot | Labels | None | Reservation / HK / Cashiering | Not the control workspace | — | No | None |
| UI-120 | Arrival Timing Management | PASS | ETA edit and bulk ETA | `setExpectedArrivalTime`, bulk cap 50 | Dialog | `0098` | Reservation | Only before check-in | — | No | None |
| UI-121 | Departures List | PASS | Due today plus overdue in-house | FO departure loader | List | None | Reservation read | Checked-out excluded | — | No | None |
| UI-122 | Departure Exceptions | PARTIAL | Overstay and payment issue | Derived | Labels | None | Reservation / Cashiering | Settlement stays Cashiering | — | No | None |
| UI-123 | Stay Extension & Late Checkout | PARTIAL | Extend opens FO; late checkout is Reservation | `setLateCheckout`; FO extend | Actions | `0098` | Reservation / FO | Late checkout does not move departure; fee is Cashiering | — | No | None |
| UI-124 | Bulk Arrival & Departure Operations | DEFER | Bulk ETA only | Do not bulk check-in or check-out | ETA dialog | None | FO for stay commands | Bulk lifecycle would duplicate FO | Low | No | Defer |
| UI-125 | Daily Arrival & Departure Control | PARTIAL | `dailyControlTotals` | Snapshot totals | Figures | None | Reservation | Not a night-audit replacement | Low | No | None |
| UI-126 | History & Audit | PARTIAL | `expected_arrival_updated`, `late_checkout_updated` | Reservation history | No dedicated A&D log | None | Reservation | Underlying history is enough | Low | No | None |
| UI-127 | Reservation Control Workspace | PASS | Derived control list | `getReservationExceptions` | `reservation-control-workspace.tsx` | None | Reservation | No exception table, by design | — | No | None |
| UI-128 | Exception Search & Filters | PASS | Severity, key, source, owner | Filter on the snapshot | Controls | None | Reservation | Population is the operational day, not all history | — | No | None |
| UI-129 | Universal Exception Quick View | PARTIAL | Sheet / detail for the selected item | Item DTO | Sheet | None | Reservation | Opens the owner action | Low | No | None |
| UI-130 | Availability & Room Conflicts | PASS | Unassigned, unavailable, overlap, block, overbooking, discrepancy | Derived | Rows | None | Inventory / Reservation | None | — | No | None |
| UI-131 | Commercial & Financial Exceptions | PARTIAL | `payment_issue`, `missing_rate_snapshot` | Cashiering signal when permitted | Rows | None | Cashiering / Rates | No guarantee-workflow key | Low | No | None |
| UI-132 | Guest & Connectivity Exceptions | PARTIAL | `missing_guest_contact` only | Guest fields | Row | None | Guest Profile | Connectivity is distribution, not this list | Low | No | Defer connectivity |
| UI-133 | Exception Resolution & Bulk Actions | PARTIAL | One owner action per row | Assign, check-out, open reservation | Buttons | None | Owning module | No bulk resolve and no persisted resolved flag | — | No | None |
| UI-134 | History & Audit | PARTIAL | Owner histories, not an exception case file | Existing history tables | No exception audit tab | None | Security & Audit | Derived rows need no case log | Low | No | None |

Counts across 82 rows: 31 PASS, 42 PARTIAL, 7 DEFER, 2 WRONG_OWNER, 0 MISSING, 0 DUPLICATED. None of the 82 rows are required to close Reservation. PARTIAL here means the operational path exists and the catalogue screen is thinner, or the work belongs in a compose step that is already good enough to operate.

---

## M. Reservation closeout gate

### Must close before moving build focus to Front Office

1. Confirm, manually and outside this audit, that the target database has applied the reservation migrations the working tree depends on, especially `0176` through `0181`. Production is UNKNOWN. `0180` and `0181` must not be applied from an agent. Review the `0180` unit-block backfill before applying it where mixed-block stays may already exist.
2. Keep calendar move and extend on `amendReservation`, and in-house room change on the Front Office `change_room` path. Do not add a calendar writer.

No other product screen blocks ordinary hotel operation.

### Can defer without breaking core hotel operation

Saved calendar views, calendar bulk edit, calendar print/export, calendar reports, offline mutation, negotiated group rates, group and waitlist communications, group documents, persisted exception workflow, exception bulk resolve, connectivity exceptions inside Reservation, optimistic header locking, group history actor names, and a priced before/after on the calendar impact dialog.

---

## N. Recommended implementation order

1. **RF-SCHEMA — manual migration confirmation.** No code. Confirm `0176`–`0181` on the target database. Apply only through the project’s normal migration path after review. Dependency: none. This audit does not apply them.
2. **RF-CAL — calendar writer contract test, only if the `change_room` branch is still unasserted.** `booking-calendar.test.ts` already locks `calendarMoveKind` and the presence of `amendReservation`. Extend that test so the drop handler’s `change_room` / `open_detail` branches stay wired, and so the panel does not call a direct room update. Dependency: RF-SCHEMA only if the test database must match `0181`. No new mutation. No frontend change unless the assertion fails.
3. Stop. Do not start saved views, exports, group rates, communications, documents, or an exception table in the same increment.

Groups GB07 does not need a new increment. Waitlist does not need a new increment. Arrivals do not need a new increment. Exceptions do not need a new increment.

---

## O. Final verdict

1. **How complete is Reservation?** Ordinary reservation operation (desk, create, detail, edit, cancel, reactivate, assign, multi-room, notes, packages, folio link, history) is PASS / CLOSED. Of the 82 catalogue rows, 31 are PASS, 42 are PARTIAL equivalents, 7 are DEFER, and 2 are WRONG_OWNER. Nothing in the catalogue is MISSING as a foundation.
2. **What major areas remain?** Calendar polish (price preview, saved views, export), group rate negotiation, outbound communications, documents, and a persisted exception workflow. None of those are ordinary-operation holes.
3. **What must be completed before close?** Manual confirmation that `0176`–`0181` are applied on the target database, and continued use of the existing amend and Front Office move writers.
4. **What can be deferred?** Saved views, bulk calendar edits, calendar export, calendar reports, offline, negotiated group rates, communications, documents, exception persistence, and optimistic header locking.
5. **Does Booking Calendar need backend mutation work?** No. Move and extend are `amendReservation`. In-house room move is the Front Office action. Drag is orchestration.
6. **Is Groups & Blocks closable without a new GB07?** Yes. Prelink create from the group detail overlay is already wired, and the header block is set only when units share it.
7. **Is Waitlist required for the initial operational release?** The workspace already exists. New waitlist work is not required. Properties can ignore it.
8. **Are Arrivals & Departures mostly read/UI or backend?** Mostly read and handoff. ETA, bulk ETA, and late checkout already have writers. Check-in and check-out stay Front Office.
9. **Do Reservation Exceptions require persisted workflow?** No. Resolution is the owner command. The row disappears when the condition is gone.
10. **Are Communications required to close Reservation?** No.
11. **Are Documents required to close Reservation?** No. Confirmation print already exists.
12. **Is concurrency protection sufficient?** For rooms and inventory, yes: assignment and availability RPCs are the race boundary. For two staff editing the same header, last write wins. That is acceptable for closeout and is not a lock-table project.
13. **Are room/inventory integrations authoritative?** Yes. Assignment uses `assign_hotel_reservation_room_unit`. Calendar availability uses `getRoomTypeAvailabilityCompat`. Eligibility is not reimplemented.
14. **Are financial integrations authoritative?** Yes. Folio, deposit, and balance reads come from Cashiering. Permission denial is not shown as zero. Calendar impact preview does not yet display the priced delta; the save path still uses the priced amend.
15. **Are any duplicated engines present?** No second availability, folio, check-in, or group pickup counter was found. The Desk “groups” view is linked masters only, and it is labelled that way.
16. **Are any legacy reservation routes still active?** Yes, as compatibility. `/restaurant/bookings/new` still hosts create. `/restaurant/pms/reservations/$reservationId` still hosts full-page detail. `/restaurant/bookings/` and `/restaurant/bookings/$reservationId` redirect. Desk actions use overlays.
17. **Are any migrations pending?** The repo contains `0176`–`0181` in both migration lanes. Whether the target database has them is UNKNOWN. They were not applied by this audit.
18. **Are there unresolved multi-room correctness risks?** The ongoing rule is sound: unit rows are authoritative, and the header group block is shared only when every unit block matches. The risk is operational: applying `0180`’s backfill on a database that already has mixed blocks would copy the header block onto null unit rows. Review that before apply. `0181` correctly rejects removing the primary named guest.
19. **Are there unresolved financial correctness risks?** No second ledger. The calendar review does not show the new room total before save. That can mislead a quote conversation. It does not post a wrong folio line by itself.
20. **Are there unresolved inventory correctness risks?** No second inventory writer. Calendar save depends on amend and assign revalidation. A drop is not an inventory commit.
21. **What should be implemented first?** Nothing in application code until the target database is confirmed for `0176`–`0181`. The first code change, if any, is extending the existing calendar contract test to lock the `change_room` branch.
22. **What is the minimum set for PASS / CLOSED?** RF-SCHEMA confirmation, then RF-CAL only if that branch is not already asserted. No other increment.
23. **What is later enterprise refinement?** Saved views, exports, reports, offline, negotiated group rates, communications, documents, exception cases, bulk exception resolve, and header optimistic locking.
24. **After those required steps, is it safe to move development focus to Front Office?** Yes. Reservation already hands check-in, in-house room move, check-out, and no-show to Front Office. Further Reservation work in this catalogue would be polish, not a blocked hotel operation.

---

RESERVATION FINALIZATION AUDIT: COMPLETE

Implementation:
NONE

Frontend changes:
NONE

Backend changes:
NONE

Database changes:
NONE

Next action:
Confirm manually that migrations 0176–0181 are applied on the target database. Then, only if still unasserted, extend `booking-calendar.test.ts` so the calendar drop’s `change_room` and `open_detail` branches stay on the existing Front Office and Detail paths and do not add a writer.
