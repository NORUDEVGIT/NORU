# Phase 6F — Housekeeping Operations

A dedicated Housekeeping workspace for owners and managers: room rack, cleaning tasks, inspections, room restrictions, discrepancies, basic maintenance requests and an immutable history log. Occupancy stays derived from reservations; housekeeping cleanliness becomes its own field.

## What the user gets

New top-level "Housekeeping" card on Property Home (owner/manager only) opening `/restaurant/housekeeping`, with its own sidebar:

```text
← NORU Home
Housekeeping
  Dashboard
  Room Rack
  Cleaning Board
  Assignments
  Inspections
  Discrepancies
  Room Restrictions
  Maintenance
  History
```

Implemented as one route with deep-linkable `?tab=` sections (the existing pattern), so no unnecessary extra pages.

**Dashboard** — Total Rooms, Occupied, Vacant, Dirty, Clean, Inspected, Out of Order, Out of Service, Pending Cleaning, Pending Inspection, using the property-local business date. Quick actions: Room Rack, Cleaning Board, Assign Rooms, Inspection.

**Room Rack** — table of every room: number, type, floor, guest (if occupied), occupancy, HK status, restriction, assigned attendant, actions. Filters for floor, room type, occupancy, HK status and restriction, with clear status badges.

**Cleaning Board** — Pending / Assigned / In Progress / Completed Today columns showing room, type, task type, priority, assignee, status and the created/started/completed times. Actions: Assign, Start, Complete, Cancel.

**Assignments** — a filtered view of the board for bulk assigning open tasks to eligible staff.

**Inspections** — rooms in `clean` state awaiting inspection; pass or fail with notes.

**Discrepancies** — report and resolve mismatches between what the system says and what housekeeping finds.

**Room Restrictions** — mark a room Out of Order / Out of Service with a required reason and optional expected return date, or release it back to Available.

**Maintenance** — log a room problem (category, priority, description) and mark it in progress or resolved. No technician scheduling, parts or costing.

**History** — immutable, filterable event log per room.

## Housekeeping status model

`hotel_rooms` gains `housekeeping_status`: `dirty` | `clean` | `inspected` | `pickup`, defaulting to `dirty` for existing rooms via an additive column with a default (no breaking change). This is completely separate from `status` (`available` / `out_of_order` / `out_of_service`), which stays the operational restriction, and from occupancy, which stays derived from checked-in reservations. All combinations (Vacant+Dirty, Vacant+Clean, Vacant+Inspected, Occupied+Clean, Occupied+Dirty) are representable.

**Room readiness** = active AND not out_of_order AND not out_of_service AND vacant AND `housekeeping_status = 'inspected'`. Surfaced as a Ready / Not Ready badge in the room rack and Front Office room lists. Reservation availability rules from 6D are unchanged, so no existing booking is retroactively blocked.

## Check-out integration

The existing `check_out_hotel_reservation` RPC is extended so that in the same transaction it also sets the room's `housekeeping_status` to `dirty`, writes `room_dirty` history, and creates a `departure_cleaning` task only when no open (pending/assigned/in_progress) cleaning task exists for that room. Occupancy still becomes vacant purely through the existing derived logic. No other Front Office behaviour changes, and repeated or retried check-outs never produce duplicate tasks.

## Database

One additive migration, all tables tenant-scoped with GRANTs, RLS enabled and owner/manager-only policies, matching the existing modules:

- `hotel_rooms.housekeeping_status` (new column, defaulted).
- `housekeeping_tasks` — room, task_type (`departure_cleaning`, `stayover_cleaning`, `touch_up`, `deep_cleaning`, `re_clean`), status (`pending`, `assigned`, `in_progress`, `completed`, `cancelled`), priority (`normal`, `high`, `urgent`), assigned membership, notes, creator, started_at, completed_at, timestamps. No hard delete.
- `housekeeping_inspections` — room, optional task, status (`pending`, `passed`, `failed`), inspector, notes, created/completed timestamps.
- `housekeeping_discrepancies` — room, reported/actual occupancy and HK status, reason, status (`open`, `resolved`), reporter, resolver, timestamps.
- `housekeeping_maintenance_requests` — room, category (`plumbing`, `electrical`, `furniture`, `equipment`, `other`), priority, description, status (`open`, `in_progress`, `resolved`), creator, resolver, timestamps.
- `housekeeping_history` — append-only log capturing room_dirty, cleaning_task_created, task_assigned, cleaning_started, cleaning_completed, inspection_passed, inspection_failed, room_reclean_required, room_ooo, room_oos, room_released, discrepancy_created/resolved, maintenance_created/resolved — with room, actor membership, timestamp and before/after JSON.

Composite foreign keys tie every row's `(restaurant_id, room_id)` to the room's own property, exactly as in 6B/6D. A partial unique index enforces at most one open cleaning task per room, which is what makes task creation idempotent.

Transactional SECURITY DEFINER RPCs (service-role execute only, locking the room row) for: check-out cleaning hand-off, cleaning completion (→ `clean`), inspection pass (→ `inspected`), inspection fail (→ `dirty` + single re_clean task), and room restriction changes. Repeating any of these is a no-op rather than a duplicate.

## Housekeeping role

`housekeeping` is added to the staff role list so real attendants can be created in Staff Management and assigned tasks. The role grants no Housekeeping workspace access in this phase — only owners and managers can view or write anything here; attendant-facing task screens come later. No other permissions widen, and the existing role architecture is otherwise untouched.

## Server functions

New `src/lib/housekeeping.functions.ts` + `src/lib/housekeeping.server.ts` following the front-office pattern: every handler uses `requireSupabaseAuth`, re-derives the caller's membership and property server-side, rejects non owner/manager, and revalidates every room / task / inspection / discrepancy / maintenance id against that property before acting. The browser's restaurant id is never trusted. Service-role access stays server-only; nothing is anonymous.

Functions cover: dashboard KPIs, room rack, task list/create/assign/start/complete/cancel, inspection start/pass/fail, discrepancy create/resolve, maintenance create/update/resolve, restriction set/release, and history.

## Routes / UI

- `src/routes/restaurant/housekeeping/index.tsx` with the tab sections and `head()` metadata.
- `src/components/housekeeping/*` — room rack, cleaning board, inspections, discrepancies, restrictions, maintenance, dashboard cards and dialogs, built from existing NORU components and badge styles.
- `src/components/restaurant-shell.tsx` — new `housekeeping` workspace, nav entries and title.
- `src/routes/restaurant/home.tsx` — new active Housekeeping card, owner/manager only.
- Minor Front Office additions: Ready / Not Ready and HK status badges only.

## Verification on The Garden

Check in a guest to Room 201, check out, and confirm the room becomes Vacant + Dirty with exactly one departure cleaning task. Assign, start and complete it (→ Clean), inspect and pass (→ Inspected / Ready). Repeat with a failed inspection and confirm the room returns to Dirty with exactly one re-clean task. Test OOO/OOS and release, create and resolve a discrepancy and a maintenance request, review history, confirm kitchen and waiter are denied and cross-tenant ids are rejected. Typecheck and build must pass. Test data is left in place unless you'd like it cleared.

## Out of scope

Full maintenance management, linen and housekeeping supplies inventory, productivity credits, cashiering, night audit, OTA/distribution, advanced guest services, and any change to Restaurant Management, QR ordering, Kitchen, Orders, Stock, Staff scheduling, Guest foundation, room images, Property Settings or Platform Admin.
