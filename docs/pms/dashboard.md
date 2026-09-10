# PMS Dashboard

**Route:** `/restaurant/pms/dashboard`  
**Screen:** `RoomsWorkspace` (`src/packages/pms/components/workspaces/rooms-workspace.tsx`) with `initialTab` `dashboard`  
**Tab body:** `RoomsDashboardTab` (`src/packages/pms/components/rooms/rooms-dashboard.tsx`)

PMS-owned. Canonical address is already in the `/restaurant/pms/*` family, which architecture ownership records as guarded (`requireRoutePackage("pms")`). See [`../architecture-ownership.md`](../architecture-ownership.md).

This page documents the **process-test cycle** that landed on `main` via issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) and PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13). It does not specify other PMS domains.

---

## EXPECTED FUNCTIONALITY

Approved process-test Spec (issue #12 — PROCESS TEST, no commercial-readiness significance):

Authorized PMS users who can open `/restaurant/pms/dashboard` can activate a disposable, **frontend-only** control labelled exactly `PMS Workflow Test` and see success text exactly `PMS workflow test passed`.

The control exists only to prove the Advisor → Docs → Developer → Docs → Advisor coordination loop. It must not change real hotel workflows.

| ID | Criterion |
|---|---|
| AC-1 | Signed-in user who can open PMS Dashboard sees the control labelled exactly `PMS Workflow Test`. |
| AC-2 | Activating that control displays exactly `PMS workflow test passed`. |
| AC-3 | No database, migration, RLS, auth, entitlement, or backend PMS logic changes. |
| AC-4 | Existing dashboard operational snapshot behaviour unchanged aside from the temporary control and its feedback. |
| AC-5 | Control is clearly temporary / removable after workflow-test acceptance. |

Out of scope for the Spec: reservations, rooms inventory mutations, rates, folios, payments, housekeeping, night audit, cross-package integrations, production permanence of the control.

---

## CURRENT FUNCTIONALITY

Grounded in `src/packages/pms/components/rooms/rooms-dashboard.tsx` on `main` after PR #13.

`RoomsDashboardTab` still loads `getRoomsDashboard` and renders the **pre-existing** snapshot (unchanged by #12 / #13 except that the temporary control is appended below it):

1. `FrontOfficeSummary` — existing front-office today snapshot (not part of the process-test Spec; not modified by #13).
2. Room metric cards from `getRoomsDashboard`: Total rooms, Active rooms, Sellable rooms, Available, Out of order, Out of service.
3. “Rooms by type” list (or “No room types yet.”).

**Temporary process-test control** (appended after rooms-by-type):

- Helper text: `Temporary process test`.
- Outline button labelled exactly `PMS Workflow Test` (`aria-label` matches the label).
- Click sets local React `useState` (`workflowTestPassed`) to `true`.
- When true, inline status text: `PMS workflow test passed`.
- Source comments mark the block `TEMPORARY` / removable after Advisor acceptance.

No other dashboard behaviour was added in this cycle. Do not read this control as a hotel operations feature.

---

## KNOWN LIMITATIONS

- The workflow-test control is **temporary** and **removable**. It is local UI state only: refresh clears the success message; nothing is persisted.
- It is a process-test fixture, not a product capability. It must not be treated as commercial dashboard functionality.
- Removal was deferred (see below); the control remains visible on `main` until that follow-up lands.

---

## DEFERRED

Removal of the temporary `PMS Workflow Test` control after Advisor acceptance of the coordination workflow. Optional separate issue; not done in #12 / #13.

---

## Permissions

No new permissions, entitlements, RLS rules, or package checks.

Access is the **existing** chain only:

1. Signed-in user (route `beforeLoad` auth redirect to `/restaurant/login`).
2. `requireRoutePackage("pms")` on `/restaurant/pms/dashboard`.
3. Rooms workspace manage / access gate: `getRoomsAccess` → `canManage` in `RoomsWorkspace`. Users who fail that gate never reach `RoomsDashboardTab` (or the temporary control).

The process-test button does not add a client- or server-side permission of its own.

---

## Backend / database

**None** for the process-test control. No migration, RLS, RPC, server function, or entitlement change in #13.

Pre-existing dashboard reads (`getRoomsDashboard`, `getFrontOfficeDashboard` inside `FrontOfficeSummary`) are unchanged. The workflow-test success path does not call them.

---

## Implementation status

**PASS**

| Item | Status |
|---|---|
| Issue | [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED (`completed`) |
| PR | [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED to `main` |
| AC-1 – AC-5 | PASS (recorded on #12 Design Execution Report) |
| Classification | PROCESS TEST — no commercial product decision |

---

## QA

| Lane | Result | Notes |
|---|---|---|
| Developer QA | **PARTIAL** | `tsc --noEmit` PASS; diff-scope / AC-3 frontend-only PASS. Browser smoke on `/restaurant/pms/dashboard` **NOT RUN** in the developer environment (needs a signed-in PMS session). Existing guard regression not re-executed; no guard code changed. |
| Independent QA | **PASS** | Recorded by Rekik / Abel on #12 / #13. |

`NOT RUN` is not `PASS`. Full evidence: [qa/test-plan.md](./qa/test-plan.md).
