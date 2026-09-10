# PMS Dashboard

**Route:** `/restaurant/pms/dashboard`  
**Screen:** `RoomsWorkspace` (`src/packages/pms/components/workspaces/rooms-workspace.tsx`) with `initialTab` `dashboard`  
**Tab body:** `RoomsDashboardTab` (`src/packages/pms/components/rooms/rooms-dashboard.tsx`)

PMS-owned. Canonical address is already in the `/restaurant/pms/*` family, which architecture ownership records as guarded (`requireRoutePackage("pms")`). See [`../architecture-ownership.md`](../architecture-ownership.md).

This page documents the **operational PMS Dashboard**. A temporary process-test control landed via issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) and PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13) and is cleaned up by issue [#15](https://github.com/NORUDEVGIT/NORU/issues/15). It does not specify other PMS domains.

---

## EXPECTED FUNCTIONALITY

Approved cleanup Spec (issue #15 — PROCESS TEST follow-up; do not reopen #12):

Authorized PMS users who can open `/restaurant/pms/dashboard` see the operational snapshot only. The disposable frontend-only `PMS Workflow Test` control from #12 / #13 must not appear.

| ID | Criterion |
|---|---|
| AC-1 | No control/text labelled `PMS Workflow Test` on PMS Dashboard. |
| AC-2 | Dashboard never displays `PMS workflow test passed`. |
| AC-3 | `FrontOfficeSummary`, room metric cards, and rooms-by-type still render as before (minus the temporary section). |
| AC-4 | No database, migration, RLS, auth, entitlement, or backend PMS logic changes. |
| AC-5 | New GitHub issue (not a reopen of #12); branch/PR reference this new issue. |

Out of scope: reservations, rooms inventory mutations, rates, folios, payments, housekeeping, night audit, cross-package integrations, reopening #12, new Dashboard features.

---

## CURRENT FUNCTIONALITY

Grounded in `src/packages/pms/components/rooms/rooms-dashboard.tsx` after this #15 cleanup.

`RoomsDashboardTab` loads `getRoomsDashboard` and renders the operational snapshot only:

1. `FrontOfficeSummary` — existing front-office today snapshot (not modified by #12 / #13 / #15).
2. Room metric cards from `getRoomsDashboard`: Total rooms, Active rooms, Sellable rooms, Available, Out of order, Out of service.
3. “Rooms by type” list (or “No room types yet.”).

Loading (`Loading room overview…`) and error (`We couldn't load the room overview.`) behaviour is unchanged.

The temporary process-test block from #12 / #13 (`Temporary process test` helper, `PMS Workflow Test` button, `PMS workflow test passed` status, local `workflowTestPassed` state) is **removed**. The Dashboard is operational-only again.

---

## KNOWN LIMITATIONS

- The #12 / #13 control was a disposable coordination fixture, not a product capability. It is no longer present after #15.
- This page does not document reservations, rates, housekeeping, or other PMS domains.

---

## DEFERRED

Removal of the temporary `PMS Workflow Test` control after Advisor acceptance of the #12 / #13 coordination workflow is **addressed by issue [#15](https://github.com/NORUDEVGIT/NORU/issues/15) / this PR**. It was not done in #12 / #13.

---

## Permissions

No new permissions, entitlements, RLS rules, or package checks.

Access is the **existing** chain only:

1. Signed-in user (route `beforeLoad` auth redirect to `/restaurant/login`).
2. `requireRoutePackage("pms")` on `/restaurant/pms/dashboard`.
3. Rooms workspace manage / access gate: `getRoomsAccess` → `canManage` in `RoomsWorkspace`. Users who fail that gate never reach `RoomsDashboardTab`.

This cleanup does not add a client- or server-side permission of its own.

---

## Backend / database

**None** for this cleanup. No migration, RLS, RPC, server function, or entitlement change.

Pre-existing dashboard reads (`getRoomsDashboard`, `getFrontOfficeDashboard` inside `FrontOfficeSummary`) are unchanged.

---

## Implementation status

**IN PROGRESS** (this PR — awaiting Independent QA)

| Item | Status |
|---|---|
| Issue | [#15](https://github.com/NORUDEVGIT/NORU/issues/15) OPEN |
| Historical process-test cycle | [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED · [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED — do not reopen #12 |
| Classification | PROCESS TEST follow-up / cleanup — no commercial product decision |

---

## QA

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; string-absence PASS (`PMS Workflow Test`, `PMS workflow test passed`, `Temporary process test`, `workflowTestPassed`, `TEMPORARY` absent from `rooms-dashboard.tsx`); diff-scope / AC-4 frontend-only PASS (this PR: `rooms-dashboard.tsx` + `docs/pms/dashboard.md`). Browser smoke on `/restaurant/pms/dashboard` **NOT RUN** (needs a signed-in PMS session). Existing guard regression not re-executed; no guard code changed. |
| Independent QA | **PENDING** | Rekik / Abel per issue #15. |

Historical QA for the #12 / #13 process-test cycle: [qa/test-plan.md](./qa/test-plan.md).

`NOT RUN` is not `PASS`.
