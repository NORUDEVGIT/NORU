# Phase 8G2D — Back Office owns Human Resources

Make Back Office the canonical administrative home for the property's workforce, while the people, their memberships, their shifts and their attendance stay exactly one shared set of records. Restaurant and hotel staffing screens keep working untouched.

## What exists today (audited)

| Capability | Where it lives now | Classification |
| --- | --- | --- |
| Sign-in identity, profiles, property membership | Core (`profiles`, `restaurants`, `restaurant_users`) | A — Core |
| Staff directory, add staff, role change, activate/deactivate | shared workforce screen | B — Back Office HR (admin) with Core membership underneath |
| Module access switches per person | Core authorization (`staff_module_access`) | A — Core, admin surface only |
| Schedule / shifts | shared (`staff_shifts`) | B — HR admin, consumed by RM and PMS |
| Attendance & check-in/out | shared (`staff_attendance`) | B — HR admin |
| Workforce hours report | shared | B |
| Waiter/table assignments | restaurant workflow | C — Restaurant Management |
| Housekeeping / front-office task assignment | hotel workflow | D — PMS |
| Staff audit trail | shared audit log | E — shared, unchanged |

No structured departments or job titles exist. No payroll exists. The workforce screens are not gated by any package today, so switching Back Office off cannot break restaurant or hotel staffing.

## What this phase builds

1. **Back Office · Human Resources home** at `/restaurant/back-office/hr` — replaces the placeholder foundation page with a truthful landing page: cards for Workforce Directory, Shifts, Attendance, Roles & Access (labelled as a Core access surface), plus a clearly-marked "not built yet" block for Payroll, Leave, Performance, Training and Departments/Job titles.
2. **Canonical HR pages**, each reusing the existing workforce components with no forked logic:
   - `/restaurant/back-office/hr/staff` — workforce directory (same people, same add/edit/role/access dialogs)
   - `/restaurant/back-office/hr/shifts` — the existing schedule
   - `/restaurant/back-office/hr/attendance` — the existing attendance view
   No detail route is added: person editing is already a dialog and stays one.
3. **Package-aware wording.** The same workspace reads "workforce administration" inside Back Office, "restaurant staffing" inside Restaurant Management, and neutral property wording on the legacy screen. Wording only — the underlying screens and rules are identical.
4. **Cross-links.** Restaurant Management Staff and PMS Administration gain an "Open in Back Office · Human Resources" link, shown only when Back Office is switched on for the property and the person already has Human Resources permission.
5. **Registry + docs.** `back-office-modules.ts` HR entry updated to reflect what is genuinely available, with its Core / Restaurant / PMS dependencies spelled out; `docs/architecture-ownership.md` gains the Core vs HR vs RM vs PMS split, the authoritative tables and the transitional-route note.

## What deliberately does not change

- No database changes at all — no new tables, no duplicate employees, shifts or attendance.
- No change to who is allowed to do what. Adding staff, changing roles and changing module access keep their existing Core authorization; shift and attendance changes keep their existing manager checks.
- Restaurant table assignments stay in Restaurant Management; hotel task assignment stays in PMS.
- `/restaurant/staff` keeps working unchanged as a shared address. Its callers are audited and the case for turning it into a redirect is documented for a later phase, not acted on.
- No payroll engine, no departments data model.

## Access rules

The new Back Office HR pages require the Back Office package **and** existing Human Resources module/role permission — the package alone grants nothing. Restaurant Management Staff continues to require Restaurant Management plus existing permission; PMS staff usage is unchanged.

## Technical notes

- New route files under `src/routes/restaurant/back-office/hr/` (`index.tsx`, `staff.tsx`, `shifts.tsx`, `attendance.tsx`), each with `requireRoutePackage("back_office")` in `beforeLoad` and `RestaurantShell active="Back Office" boModule="hr"`, mirroring the 8G2C inventory routes. `hr.tsx` becomes the home page body.
- New `src/components/workspaces/back-office/hr-pages.tsx` holding the HR home plus thin wrappers that render `StaffManager`, `ScheduleTab` and `AttendanceTab`, behind a module-access gate consistent with the inventory gate.
- Presentation context extended so the shared workforce workspace can pick its wording; no branching in server functions.
- Verification: typecheck, production build, and an authenticated pass over Back Office HR, the directory, shifts, attendance, Restaurant Management Staff, PMS staff links and `/restaurant/staff`, plus a package matrix (Back Office on/off against Restaurant Management and PMS) confirming one person, one membership, one shift and one attendance record throughout.
