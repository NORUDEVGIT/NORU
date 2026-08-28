# Phase 3.5 — Batch 1B: Minimal Workforce UI

Expose the existing Batch 1A workforce server functions in the cheapest useful UI, all inside `/restaurant/staff`. No schema changes, no backend refactor, no new top-level routes.

## Tabs on /restaurant/staff

Four tabs using the existing shadcn `Tabs` component: **Staff**, **Schedule**, **Attendance**, **Reports**.

The page currently blocks kitchen/waiter entirely. That changes: every active member reaches the page, but tab visibility depends on role.

- Owner/Manager: all four tabs; Staff tab keeps its current content untouched.
- Kitchen/Waiter: only **Schedule** (rendered as "My Schedule", read-only) — plus the My Shift card. No Staff, Attendance or Reports tabs.
- The sidebar "Staff" entry (currently hidden for non-managers) is shown to all roles and relabelled "Staff & Shifts".

## My Shift card

Shown at the top of the page for any active staff member (all roles, owners included) who has a shift today, pulled from `listShifts` for today's date plus `listShiftTableAssignments` for that shift.

```text
John · Waiter
09:00–17:00
Tables 1, 2
[ Check In ]        -> Checked in at 09:04  [ Check Out ]  -> Completed 09:04–17:02
```

Buttons call the existing `checkIn` / `checkOut`. Large, full-width touch targets on mobile. If check-in was late, the card shows a "Late" badge that persists after checkout.

## Schedule tab (owner/manager)

Controls: date selector, staff selector (from existing `listStaff`), start time, end time, **Add Shift** (`createShift`).

Below: shifts for the selected date, as rows on desktop and cards on mobile. Each shows staff name, role, date, start, end, status, and assigned tables. Actions: **Assign Tables**, **Cancel Shift** (`cancelShift`, with confirm).

For kitchen/waiter the same tab renders only their own shifts, no controls — `listShifts` already re-scopes non-managers to themselves server-side.

## Assign Tables modal

A dialog listing active restaurant tables (`listRestaurantTables`) with a checkbox per table for that shift. Checking calls `assignTableToShift`, unchecking calls `removeTableAssignment`. The backend's "This table is already assigned for this shift." error is surfaced as a toast. No drag/drop, floor plans, or zones.

## Attendance tab (owner/manager)

Today's scheduled staff from `listShifts` (today→today): name, role, shift times, check-in, check-out, attendance state. Read-only — no manual correction in this batch.

## Reports tab (owner/manager)

Date-range selector (Today / 7 days / 30 days / custom) feeding `getStaffAttendanceSummary`. Simple table: Staff, Scheduled, Completed, Late, Missed, Missing Checkout, Scheduled Hours, Worked Hours. Cards on mobile. No charts, no payroll.

## Late handling

`listShifts` returns `checkInAt` and `startTime`, and after checkout the stored status becomes `completed`, which would hide lateness. The UI therefore derives the late badge from `check_in_at > shift start + grace`, using the same rule the backend uses — not a second rule.

To make that rule importable from the browser, `LATE_GRACE_MINUTES`, `shiftMoment` and `isLate` move out of `src/lib/workforce.server.ts` into a new client-safe `src/lib/workforce-rules.ts`, which the server file re-exports. Backend behaviour is unchanged; this is a file move, not a logic change. Reports already count late shifts server-side with the same helper.

## Permissions

Server-side rules from Batch 1A are the boundary; UI hiding is cosmetic. Owner/Manager: add and cancel shifts, assign and remove tables, view attendance and reports. Kitchen/Waiter: own shifts and assigned tables, check in/out only.

## States

Existing loading patterns plus a clear Retry on failure. Empty states: "No shifts scheduled for this date.", "No attendance records yet.", "No staff activity for this period." No placeholder rows.

## Technical notes

- Files changed: `src/routes/restaurant/staff.tsx` (tabs + new tab components), `src/components/restaurant-shell.tsx` (nav visibility/label), new `src/lib/workforce-rules.ts`, small re-export edit in `src/lib/workforce.server.ts`.
- Tab panels may be split into `src/components/workforce/*.tsx` to keep the route file manageable.
- Query keys scoped by restaurant id and date range; mutations invalidate the affected schedule/attendance queries.
- No migrations, no new dependencies.

## Verification (The Garden, temporary data)

Temporary shift for a test waiter 09:00–17:00 with Tables 1 and 2. Check: owner and manager see Schedule controls; waiter sees only their own schedule and assigned tables; waiter can check in and out; owner sees attendance and reports; kitchen/waiter cannot schedule others. Temporary rows removed afterwards.

## Known limitations

Grace period still fixed at 10 minutes. No manual attendance correction, no shift editing (cancel and recreate), no overlapping-shift conflict detection, no charts, payroll, leave, swaps, or waiter order attribution.
