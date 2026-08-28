# Phase 3.5 — Batch 1A: Workforce Core (Backend Only)

Adds the database foundation and server functions for staff shifts, attendance, and waiter table assignments. No UI, no payroll, no waiter ordering, no changes to kitchen/orders/menu/QR/customer flow/dashboard/settings.

## What gets built

### 1. Three new tables (one migration)

`staff_shifts`
- id, restaurant_id, staff_membership_id (references the existing restaurant membership), shift_date, start_time, end_time, status (`scheduled` | `cancelled`), created_by, created_at, updated_at
- end_time must be after start_time (check constraint)
- One shift = one calendar date; no recurring templates

`staff_attendance`
- id, restaurant_id, staff_membership_id, shift_id, check_in_at, check_out_at, status (`checked_in` | `completed` | `late` | `missing_checkout` | `absent`), notes, created_at, updated_at
- Unique on (shift_id, staff_membership_id) so a shift has one attendance record

`staff_table_assignments`
- id, restaurant_id, restaurant_table_id, staff_membership_id, shift_id, created_by, created_at
- Unique on (shift_id, restaurant_table_id) to block duplicate table assignment for the same shift

Same-restaurant consistency (staff, table, shift all belonging to the restaurant on the row) is enforced in the server functions, plus foreign keys and composite uniqueness in the schema where it is cheap to do so.

Indexes: shifts by (restaurant_id, shift_date) and (staff_membership_id, shift_date); attendance by shift_id and staff_membership_id; assignments by shift_id and restaurant_table_id.

### 2. RLS and grants
- Owner/manager of the restaurant can read all workforce rows for their restaurant.
- A staff member can read only rows tied to their own active membership.
- No `USING (true)`. No insert/update/delete policies for `authenticated` — all writes go through server functions using the privileged server client after authorization.
- `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`, no `anon` access.

### 3. Server functions (`src/lib/workforce.functions.ts`)
Scheduling (owner/manager only): `createShift`, `cancelShift`, `listShifts`
Table assignments (owner/manager only): `assignTableToShift`, `removeTableAssignment`, `listShiftTableAssignments`
Attendance (the staff member themselves): `checkIn`, `checkOut`
Reporting (owner/manager only): `getStaffAttendanceSummary`

Every function re-derives the caller's active membership and role from `restaurant_users` server-side, exactly like the existing staff module — a browser-supplied restaurant id is never trusted on its own, and cross-tenant ids fail.

### 4. Rules
- Check-in: requires an active membership owning the shift, uses server time, rejects a second check-in.
- Check-out: requires an existing checked-in record for the caller's shift, uses server time, rejects a second checkout, sets status `completed`.
- Late: 10-minute grace period after shift start, in a single shared constant. Not restaurant-configurable in this batch (noted limitation).
- Missed shifts: derived at query time when the shift has passed with no check-in — no background job, no bulk absence rows.
- Worked hours: `check_out_at - check_in_at`, only when both exist; never estimated.
- Table assignment lives on the shift, never as a permanent field on `restaurant_tables`. Conflict returns "This table is already assigned for this shift."

### 5. Attendance summary
For a date range, per staff member: scheduled shifts, completed, late, missed, missing checkout, scheduled hours, worked hours. No payroll math.

### 6. Audit
Reuses `restaurant_staff_audit_log` for `shift_created`, `shift_cancelled`, `table_assigned`, `table_unassigned`. Check-in/out is not audited separately — the attendance row is the record.

## Verification (The Garden, temporary data)
Owner and manager can create shifts; waiter cannot schedule others; waiter reads own shift, checks in, duplicate check-in rejected, checks out, duplicate checkout rejected; worked hours computed; table assignments visible; duplicate table assignment blocked; cross-tenant table and cross-tenant membership rejected. Temporary rows removed afterwards.

## Files
- New migration for the three tables, constraints, indexes, grants, RLS
- New `src/lib/workforce.functions.ts`
- Regenerated database types
No UI files touched.

## Known limitations (carried into a later batch)
- Grace period fixed at 10 minutes, not configurable per restaurant
- No automatic absence marking (derived only, at report time)
- No overlapping-time shift conflict detection beyond the exact shift record
- No recurring shift templates, zones/sections, payroll, or waiter order attribution
