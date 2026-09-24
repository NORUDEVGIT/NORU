# DB-04 — Reservation Operational Read Models

CURRENT = non-prod `qcwptraosaudcbjasmul`. Production = **UNKNOWN**.

DB-04 approved derived operational read models over current domain owners. It does not approve
workspace tables, database views, materialized views, migrations, UI, multi-room, Waitlist, Groups &
Blocks, lifecycle changes, or production claims.

## DB-04I-01 — IMPLEMENTED (2026-09-23)

The shared Reservation operational read spine is additive. Legacy `listReservations`, Reservation
Detail, Front Office lists, pricing, cashiering, and lifecycle commands remain unchanged.

**Service location**

- Shared DTOs: `src/packages/pms/lib/reservation-workspace/shared-read-models.ts`
- Business-date fallback contract:
  `src/packages/pms/lib/reservation-workspace/business-date.ts`
- List/search service: `src/packages/pms/lib/reservation-workspace/search.server.ts`
- Tests: `src/packages/pms/lib/reservation-workspace/search.server.test.ts`

**Search architecture**

- Tenant-scoped related lookups find Guest Profile and room IDs for name, phone, email, and room
  number matches.
- Those IDs participate in the primary paginated Reservation query together with exact/prefix
  confirmation and prefix external-reference matching.
- Search therefore runs against the full server-filtered result, not the current
  confirmation-page-then-guest fallback.
- No RPC, database view, or materialized view was added.

**Supported filters**

- One or multiple statuses
- Arrival and departure ranges
- Stay overlap range
- Room type, physical room, assigned/unassigned, guest, and VIP
- Channel source
- Commercial source and market segment (values may remain null while Section 7 persistence is
  **HELD**)
- Rate plan
- Company, Travel Agency, and linked Group master IDs
- Operational views: all, arrivals, departures, in-house, unassigned, pending, linked group master

Waitlist and guest-name sorting are unsupported. The Groups view means only
`group_account_master_id IS NOT NULL` in active states; it is not Groups & Blocks functionality.

**Pagination and enrichment**

- Offset pagination, default 25 and maximum 100, with exact total and `hasMore`
- Allowlisted ordering by arrival, departure, confirmation, or created date, plus stable ID tie-break
- Guest, room, room-type, rate-plan, Company, Travel Agency, and Group display data use named
  relational joins in the page query; no per-row enrichment query remains
- Financial/folio reads and assignment-eligibility RPCs are intentionally excluded

Normal no-text list requests make two database requests after authorization: property business date
and the enriched Reservation page. Text search adds two parallel tenant-scoped related-ID lookups
(Guest Profile and room), for four requests total. Broad related searches fail with a refine-search
message instead of silently truncating matching reservations.

**Schema changes:** NONE  
**Migration changes:** NONE  
**Feature-gate changes:** NONE

## DB-04I-02 — Reservation Desk implemented (2026-09-23)

Additive Desk snapshot read. No UI, calendar, Quick View, Arrivals/Departures, or Exceptions.

**Service:** `src/packages/pms/lib/reservation-workspace/desk.server.ts` (`getReservationDesk`)  
**Rows:** `searchOperationalReservations` — the same implementation used by `listOperationalReservations`.

**Business date:** `resolvePropertyBusinessDate` on `restaurants.business_date` with timezone fallback. KPI and view predicates use that date, not browser-local today.

**Views:** all, arrivals, departures, in_house, unassigned, pending, groups. Waitlist is unsupported (`capabilities.waitlist = false`, `kpis.waitlist = null`).

**KPI definitions**

| KPI              | Rule                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Arrivals today   | `arrival_date = businessDate`, status pending/confirmed                                                                                |
| Departures today | `departure_date = businessDate`, status confirmed/checked_in                                                                           |
| In-house         | status `checked_in`                                                                                                                    |
| Unassigned       | `room_id IS NULL`, status pending/confirmed                                                                                            |
| Pending          | status `pending`                                                                                                                       |
| VIP arrivals     | arrivals-today plus `guest_profiles.vip_status = true`                                                                                 |
| Linked groups    | `group_account_master_id IS NOT NULL`, status pending/confirmed/checked_in — **partial**, not allotment                                |
| Available rooms  | physical vacant: active `hotel_rooms.status = available` minus distinct in-house assigned rooms — **partial**, not type-night sellable |
| Waitlist         | unavailable                                                                                                                            |

`getBookingsDashboard` is not used.

**Performance:** after authorization, one property-date read, then KPI counts (head-only except occupied `room_id` select) in parallel with the shared page read. No folio, history, companions, or assignment-eligibility queries.

**Schema / migration / feature-gate changes:** NONE

## DB-04I-03 — Quick View implemented (2026-09-23)

Additive compact operational summary. Not Reservation Detail. No UI, calendar, Arrivals/Departures, or Exceptions engine.

**Service:** `src/packages/pms/lib/reservation-workspace/quick-view.server.ts` (`getReservationQuickView`)

**DTO:** `ReservationQuickView` in `shared-read-models.ts` — identity, stay, room/HK, commercial snapshot, financial signal, last history, exception keys, action hints.

**Eager (one reservation SELECT):** shared `OPERATIONAL_RESERVATION_SELECT` + `toReservationOperationalSummary` (guest, VIP, room type, assigned room, rate-plan name, Company/TA/Group names, Section 7 columns as stored nulls). Room operational and housekeeping status come from the same `hotel_rooms` embed.

**Parallel with that read:** property business date, latest `hotel_reservation_history` row (`limit 1`), financial signal.

**Financial:** Cashiering-owned. Uses `requireCashieringAccess` then `guest_folios` + `folio_transactions.amount` for balance only. States: `available` (including no folio), `permission_denied`, `not_available`. Permission denied does not fail Quick View. No ledger dump, card data, or client-side balance invention.

**Action hints:** reuse `deskActionHints`; `canOpenFolio` only when financial state is available and a folio id exists.

**Unsupported / future:** companions, assignment eligibility RPC, full history, traces, waitlist, packages, Section 7 inferred guarantee.

**Performance:** after authorization, **4 parallel** calls (property, reservation, history, financial permission+folio). Financial adds folio + optional transaction-amount query when Cashiering is allowed (~5–6 DB round-trips total, not per-field).

**Schema / migration / feature-gate changes:** NONE

## DB-04I-04 — Arrivals & Departures implemented (2026-09-23)

Reservation-owned daily operational read/orchestration. Front Office remains the owner of check-in, in-house lifecycle, check-out, and no-show. No Booking Calendar, Exceptions engine, or UI.

**Service:** `src/packages/pms/lib/reservation-workspace/arrivals-departures.server.ts` (`getReservationArrivalsDepartures`)  
**DTOs:** `ArrivalRow`, `DepartureRow`, `ReservationArrivalsDeparturesSnapshot` in `shared-read-models.ts`  
**Tests:** `src/packages/pms/lib/reservation-workspace/arrivals-departures.server.test.ts`

**Ownership**

- Reservation owns this workspace read.
- Front Office owns stay commands. This slice does not wrap check-in, check-out, no-show, or room-move SQL/RPCs.
- Housekeeping/Inventory own room readiness. Cashiering owns the folio signal.

**Business date**

- Default `selectedDate = resolvePropertyBusinessDate` (persisted `restaurants.business_date`, timezone fallback).
- Explicit `date` override is supported for future/focused views.

**Arrival semantics (wraps `loadFrontOfficeArrivals` / `listArrivals`)**

- `arrival_date = selectedDate`
- Live queue statuses: **pending** and **confirmed** (optional single-status filter)
- Same-day **checked_in** stays are excluded; they belong to In-House
- Unassigned: `room_id IS NULL`
- Walk-in incomplete: reused from `fo_checkin_progress.walk_in_incomplete`
- ETA is Reservation-owned `hotel_reservations.expected_arrival_at` (nullable timestamptz). Exposed as `expectedArrivalTime`. Property check-in time is not used as guest ETA.
- Writers: `setExpectedArrivalTime` / `bulkSetExpectedArrivalTime` in `arrivals-departures.functions.ts`. Editable only before check-in (`pending` | `confirmed`). History: `expected_arrival_updated`.

**Departure semantics (wraps `loadFrontOfficeDepartures` / `listDepartures`)**

- Due today: `departure_date = selectedDate`, status **confirmed** or **checked_in**
- Overdue: status **checked_in** and `departure_date < selectedDate`
- **checked_out** is not in the active queue
- Overstay: FO-derived `status === checked_in && departureDate < selectedDate` (boolean + `overstay` exception key). No new database field.
- Late checkout is stay-level on `hotel_reservations` (`late_checkout_granted`, `late_checkout_until`, `late_checkout_note`). Same-day only; **does not** change `departure_date`. Property SET1 `late_checkout_allowed` / fee / approval / `check_out_time` is policy context. Cashiering owns fee posting. Writer: `setLateCheckout`. History: `late_checkout_updated`.

**Room / HK**

- One batched `hotel_rooms` read for assigned room IDs (`status`, `housekeeping_status`)
- Ready via existing `isRoomReady` without Card 2 settings: unassigned false; OOO/OOS false; `clean` or `inspected` ready
- Does not call assignment-eligibility RPCs per arrival

**Financial batching**

- One `loadFoStaySignals` call for the union of arrival/departure reservation IDs
- Cap **200** IDs (`FINANCIAL_SIGNAL_BATCH_CAP`); `financial.truncated` is true when the union exceeds the cap
- Does not call Quick View's single-reservation financial path per row
- States: `available` (including no folio), `permission_denied`, `not_available`
- Permission denied does not fail the Arrivals & Departures read

**Exception keys (derived only; not DB-04I-06)**

- Arrival: `unassigned`, `room_not_ready`, `room_unavailable`, `payment_issue`
- Departure: `overstay`, `payment_issue`
- `payment_issue` only when the batch lane is live and FO-equivalent deposit/balance evidence exists

**Hints (display only)**

- Check-in: conservative `confirmed && assigned && ready`
- Checkout: `checked_in` only; settlement remains Cashiering/FO command-time validation
- `canOpenFolio` only when financial state is available and a folio id exists

**Filters / pagination**

- Arrivals: date, VIP, assigned/unassigned, room type, pending/confirmed
- Departures: date, overstay, room type, confirmed/checked_in
- Daily queues are **unpaginated** because FO already bounds them to one operational date (arrivals that day; due-today plus overdue in-house). Totals equal list lengths. `hasMore` is always false.

**Performance (typical busy day, after authorization)**

- 1 property business-date read
- Parallel FO base: arrivals reservation list + optional walk-in progress; departures due-today + overdue (2–4 calls)
- Parallel enrichment: 1 batched `hotel_rooms` + `loadFoStaySignals` (check-in progress + amendment history + optional `guest_folios` + `folio_transactions`)
- Typical total: about **8–10** database operations. Not per row.

**Schema / migration / feature-gate changes:** `0098_pms_reservation_eta_late_checkout.sql` adds ETA and stay-level late-checkout columns on `hotel_reservations` only. No A&D tables.

## DB-04I-05 — Booking Calendar implemented (2026-09-24)

Reservation-owned calendar **read/orchestration** only. No drag/drop, move/extend writes, concurrency locks, Groups & Blocks, multi-room, UI, or calendar tables.

**Service:** `src/packages/pms/lib/reservation-workspace/calendar.server.ts` (`getReservationCalendar`)  
**DTOs:** `CalendarRead`, `CalendarRoom`, `CalendarBar`, `CalendarBlock`, `CalendarRoomType` in `shared-read-models.ts`  
**Tests:** `src/packages/pms/lib/reservation-workspace/calendar.server.test.ts`

**Ownership**

- Reservation: stay dates, status, assigned room, room type, guest, pricing snapshot, `updated_at`
- Room & Inventory: rooms, types, sellable/operational state, dated `pms_operational_inventory_blocks`, availability RPC
- Housekeeping: `hotel_rooms.housekeeping_status`
- Front Office: checked-in occupancy for `occupiedNow`; stay commands remain FO

The calendar is a projection. Bars are not stored.

**Window**

- Horizons: 1 / 7 / 14 / 30 (`CALENDAR_HORIZONS`, same as FO `LIVE_HORIZONS`)
- Default `range.start = businessDate` when `rangeStart` is omitted
- `range.end = rangeStart + horizon` (**exclusive**)
- Stay overlap: `arrival_date < rangeEnd AND departure_date > rangeStart` (stay `[arrival, departure)`, window `[start, end)`)
- A checkout on `rangeStart` does not appear. An arrival on the exclusive end date does not appear.
- Placement for UI remains FO `reservationBarPlacement` / `stayOverlapsRange`

**Unassigned**

- Overlapping `room_id IS NULL` with status **pending** or **confirmed** only
- Cancelled / no-show / checked-out are not unassigned inventory demand

**Bars**

- Default statuses: pending, confirmed, checked_in (`CALENDAR_BAR_STATUSES`)
- Checked-out omitted unless explicitly requested
- Not a Quick View payload; open Quick View separately
- Exception keys: `unassigned`, `room_unavailable` (assigned OOO/OOS), `assignment_overlap` (derived same-room stay overlap)
- `updatedAt` is concurrency identity only — no lock schema

**Rooms / HK / blocks / availability**

- Active `hotel_rooms` with stored `building` / `floor` / `wing` strings (nullable; no invented fields)
- Operational + housekeeping status + `sellable` + `occupiedNow` (current checked-in room ids)
- Blocks: active inventory blocks overlapping the same exclusive window; permission failure degrades to `blocks_unavailable`
- Availability: one `getRoomTypeAvailabilityCompat` call per room type (cap 40), not per cell; not `pms_evaluate_room_assignment`

**Caps / truncation**

- Reservations 1500, blocks 500, availability types 40
- `truncated` is true when a cap is hit; honest warning keys returned
- Does **not** use `collectRackReservationPages` / `listReservations` offset paging

**Performance (typical request after authorization)**

- 1 property business-date read
- Parallel: in-house room ids, room types, overlap reservations, inventory blocks, rooms
- Then parallel-ish availability RPCs for visible types (≤40)
- Typical: about **6** table reads + **N type** availability RPCs (N usually small). Not per bar and not per cell.

**Schema / migration / feature-gate changes:** NONE

## DB-04I-06 — Reservation Exceptions / Control implemented (2026-09-24)

Derived control aggregation. No exception table, no persisted rows, no workflow engine, no UI, no remediation writes.

**Service:** `src/packages/pms/lib/reservation-workspace/exceptions.server.ts` (`getReservationExceptions`)  
**DTOs:** `ReservationExceptionItem`, `ReservationExceptionSnapshot` in `shared-read-models.ts`  
**Tests:** `src/packages/pms/lib/reservation-workspace/exceptions.server.test.ts`

**Scope (wraps FO exception desk, not historical scan)**

- Arrivals on property business date (`loadFrontOfficeArrivals`: pending + confirmed)
- In-house (`loadFrontOfficeInHouse`: checked_in)
- Departures (`loadFrontOfficeDepartures`: due today + overdue checked_in)
- Overbooking demand / HK discrepancy via `loadFoExceptionFeeds` (FO cap 500; arrival ≤ businessDate + 6)

Checked-out / cancelled / no-show are not in this population.

**FO reuse**

- `deriveExceptionRows` for `unassigned`, `room_unavailable`, `payment_issue`, `overstay`, `overbooking`, `room_discrepancy`
- `loadFoStaySignals` batched (cap 200)
- Confirmed unassigned is remapped to **high** + **blocking**; pending unassigned stays **standard** / non-blocking (FO emits both as standard)

**Reservation-specific keys**

- `room_not_ready` — arrivals with assigned room not ready via `isRoomReady` (skipped when OOO/OOS/inactive so `room_unavailable` remains canonical)
- `operational_block` — one range read of active `pms_operational_inventory_blocks` overlapping the stay
- `missing_rate_snapshot` — confirmed and `rate_plan_id` or `room_subtotal` null
- `missing_guest_contact` — non-blocking; phone and email both empty
- Guarantee / Section 7 commercial gaps: **deferred** (persist HELD)

**Dedup:** `reservationId + key` (+ room for discrepancy, date for overbooking). Prefer high severity if both sources fire.

**Finance:** permission denied / coming soon omits payment exceptions (`deriveExceptionRows` only when folio lane is live) and sets `financial_signals_unavailable`. The control read still returns.

**Caps:** output 500; FO overbooking feed 500; financial ids 200. `truncated` + warning keys when a source was capped.

**Schema / migration / feature-gate / write-path changes:** NONE

## UI-01 — Reservation Desk implemented (2026-09-24)

The canonical `/restaurant/pms/reservations` workspace now consumes
`getReservationDesk`; the legacy component-side `listReservations` path is no longer used.

- Shared NORU PMS command chrome with Reservations active
- Operations header and Reservation sub-navigation
- DB-04 KPI strip, server-side filters/views, and backend pagination
- Dense operational table using `ReservationDeskRow`
- Single-row selection with lazy `getReservationQuickView`
- Hint-gated Assign Room / Check In / Check Out links to the canonical Reservation detail flow
- Responsive desktop three-column layout with mobile detail sheet
- Waitlist omitted; Groups labelled as linked masters; available rooms labelled physical vacant
- Loading, inline error, no-results, and no-selection states

The supplied Reservation Desk reference image was used for layout density, warm-neutral palette,
gold selection states, table chrome, and detail-panel hierarchy. Runtime truth takes precedence
over the reference image: its Waitlist count and invented commercial/payment details were not
copied.

**Backend / schema / migration / feature-gate changes:** NONE

## UI-02 — Reservation Quick View refinement implemented (2026-09-24)

The Reservation Desk's lazy detail surface now uses
`src/packages/pms/components/reservations/reservation-quick-view.tsx`. It remains a compact
operational panel backed exclusively by `getReservationQuickView`; selecting a row is still the
only trigger for that read.

- Active Overview, Guest, Stay Details, and Notes tabs using the Room detail-panel treatment
- Compact confirmation/status/guest/VIP header and gold-accent tab/action hierarchy
- Separate Reservation, room operational, and housekeeping states
- Null-safe Company, Travel Agent, Group, guarantee, commercial, note, and request fields
- Readable contextual exception labels without embedding the Exceptions workspace
- Exact financial degradation for `available`, `permission_denied`, and `not_available`; lack of
  access is never rendered as a zero balance
- Hint-gated Assign Room, Check In, Check Out, and Open Folio actions; lifecycle/assignment actions
  continue through existing owner-module/detail flows
- Structured skeleton, retry-in-place error, no-selection state, and the existing responsive Sheet

No Guest, room, master, folio, or history read was added. All displayed data comes from the existing
Quick View DTO.

**Backend / schema / migration / feature-gate changes:** NONE

## Phase 1 — Reservation Action Menu implemented (2026-09-24)

Reservation Desk rows and Quick View now share one contextual action model and NORU dropdown:

- `reservation-context-actions.ts` owns presentation-only visibility from status, assignment,
  business date, Desk/Quick View hints, broad workspace role, and optional folio capability.
- `reservation-context-menu.tsx` renders grouped View & Edit, Reservation Actions, Front Office,
  and Cashiering actions.
- Reservation-owned Confirm and Reactivate reuse `setReservationStatus`; cancelled restore therefore
  retains its server-side capacity check.
- Assign Room uses the existing Inventory-backed assignment dialog. Checked-in Change Room,
  Check In, Check Out, and No-Show use existing Front Office dialogs/steppers.
- Cancellation reuses `FoCancelStepper`; its existing orchestration debt is unchanged.
- Open Folio is only emitted when Quick View reports `available` plus a folio id, and routes to the
  canonical Cashiering folio.
- Row menus work from Desk hints without waiting for Quick View. Menu trigger/cell events stop row
  selection propagation.

Deferred because no supported command/route exists here: Send Confirmation, Add Note from menu,
Print Confirmation, Copy, Split, Link/Unlink, Share/Unshare, package actions, and no-show
reactivation.

UI visibility is convenience only; all existing server actions continue to enforce authorization and
domain validation.

**Backend / schema / migration / feature-gate changes:** NONE

## Workspace Navigation Contract

`/restaurant/pms/reservations` is the base Reservation Desk workspace. It stays mounted while
operators create or open a reservation. Desk filters, view, page, and row selection are local React
state; they are not encoded in URL search params and are not discarded when an overlay opens.

**Row selection** loads Quick View only. It does not change the pathname and does not open Detail.

**New Reservation** and **Open Reservation** (including confirmation-number click and Edit) open one
large in-workspace overlay at a time: `new-reservation` or `reservation-detail`. Overlay chrome is
NORU workspace presentation, not an embedded legacy page shell: no `RestaurantShell`, no
`RoomInventoryChrome`, no hotel/page header, and no engineering `CREATE_RESERVATION_SECTION*_SCOPE`
copy. Desktop Dialog is `w-[min(96vw,1400px)]` / `h-[min(92vh,960px)]`; mobile Sheet is `h-dvh`.

**Create overlay** uses the existing create sections behind a five-step workflow: Stay Details, Guest
and Contact, Room and Rate, Add-ons and Services, Review and Confirm. Continue only changes the
visible step; Pending/Confirm remain the existing create writers.

**Detail overlay** has one visual header (eyebrow, confirmation, guest, status, stay line, Amend /
Cancel). Overlay DialogTitle is visually hidden. Overview is the default tab; Folio (and extra Rooms)
are disabled deferred — no fake folio UI and no Open Folio.

**Escape is layer-specific.** Nested Amend Dialog, FO Sheet, and type-change AlertDialog dismiss
independently. The parent overlay `onEscapeKeyDown` / interact-outside guards preventDefault while
another dialog or sheet is open. A second Escape (no child open) closes Detail or New Reservation.
Child surfaces use `z-[70]` above overlay `z-50`.

**Front Office actions** (Assign, Change Room, Check In, Check Out, Cancel, No-Show) continue to use
the existing in-workspace dialogs and steppers. Desk hosts them as siblings of the large overlay so
they can stack above it. Closing a child returns to Detail or Desk; closing Detail or New Reservation
returns to the still-mounted Desk.

**Create confirmation** stays inside the New Reservation overlay. Open Reservation switches the same
overlay to Detail. Return to Desk closes the overlay and invalidates Desk/Quick View reads. New
Reservation resets the create form in place. Print remains `window.print()`.

**Legacy routes remain compatibility-only.** `/restaurant/bookings/new` still hosts the extracted
create page inside `RestaurantShell`. `/restaurant/pms/reservations/$reservationId` still hosts
full-page Detail. Desk actions no longer navigate to those shells.

**Open Folio is deferred** from Desk and Quick View. No folio sheet exists; `FolioPage` is
route-inline. Desk/Quick View omit `allowOpenFolio` so the action is hidden until Cashiering can
embed safely. Guest Profile remains page-only and is omitted from the embedded Detail overlay.

**Backend / schema / migration / feature-gate / lifecycle changes:** NONE

## Search & Filter Contract

Reservation Desk search and filters stay in local React state. They are not encoded in the URL and do
not remount the Desk. Main search, compact bar filters, and applied advanced filters all go through
`getReservationDesk` → `searchOperationalReservations`. There is no client-side row filtering of the
paginated page.

**Main search** (debounced 300ms, sent when the term has at least two characters) covers confirmation
exact/prefix, guest first/last name, phone, email, room-number prefix, and external-reference prefix.

**Compact bar:** Arrival From / Arrival To (`arrivalFrom` / `arrivalTo` — not stay overlap), Status,
Room Type, Source (channel origin including Walk-in), Search, More Filters, Clear, New Reservation.

**Advanced filters (Apply to commit):** VIP, assignment (All / Assigned / Unassigned), departure
range, physical room, rate plan, commercial booking source, market segment, Company, Travel Agent,
Group. Guest name / phone / email / confirmation stay on main search rather than duplicated columns.

**Not a classification:** there is no Reservation Type filter (Individual / Corporate / Group /
Walk-in). Use Company, Group, Travel Agent, Source, commercial booking source, and market segment.

**Deferred:** guest type, membership tier, repeat guest, created by, created date, nights, purpose of
stay, payment status, cancellation-as-dimension, room move, with notes, with packages, with
exceptions, stay-overlap UI, Saved Filters persistence.

**Operational views** remain server-side base predicates. Advanced filters layer on top. Assigned
assignment cannot be Applied on the Unassigned view.

**Clear** resets search, compact filters, advanced filters, chips, and page 1. It does not reset the
operational view, close overlays, or navigate.

**Schema / migration / backend read-model changes:** NONE

## Folio uniqueness correction

The non-prod runtime was re-verified on 2026-09-23. It has partial unique index
`guest_folios_one_per_reservation` on `(restaurant_id, reservation_id)` where
`reservation_id IS NOT NULL`, matching `0017_create_cashiering.sql`. Prior DB-00 / DB-01 wording
claiming no one-folio uniqueness was incorrect and has been corrected. Production remains
**UNKNOWN**.
