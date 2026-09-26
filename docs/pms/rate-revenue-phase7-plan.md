# Rate & Revenue — Phase 7 plan

| Field | Value |
|---|---|
| **Classification** | Implementation plan. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **PHASE 7 COMPLETE** |
| **Completed** | 2026-09-26 |

## Steps

| Step | Name | Status |
|---|---|---|
| P7-STEP-01 | Approvals capability audit + workflow contract | **COMPLETE** |
| P7-STEP-02 | Approval backend engine + domain integration | **COMPLETE** |
| P7-STEP-03 | Approval UI-26–30 + Phase 7 closeout | **COMPLETE** |

## UI mapping

| UI | View | Step 2 | Step 3 |
|---|---|---|---|
| UI-26 | `approvals` queue | Backend read models only | Queue + filters ✓ |
| UI-27 | approval detail | `getRevenueApprovalRequestDetail` | Detail drawer ✓ |
| UI-28 | review / approve / reject | Server functions only | Review actions ✓ |
| UI-29 | my requests | `requestedBy` filter | Requester list ✓ |
| UI-30 | approval history | Terminal-status pagination | History within approvals ✓ |

## Step 2 delivered

- Property approval policy (`enabled` only). Missing row = disabled.
- Approval request store + immutable approval events.
- Submit / cancel / reject / approve + apply.
- Stale detection and atomic approve+apply RPC.
- Domain adapters for rate, restriction, promotion activation, package activation.
- Official apply wrappers return `{ mode: "applied" }` or `{ mode: "submitted_for_approval" }`.
- Read models for queue, detail, my requests, and history.

## Step 3 delivered

- `canApprove = true` for owner / manager. `approvals` workspace `implemented: true`.
- `membershipId` on `RevenueAccessResolution`. `canReview` / `selfApprovalBlocked` server-computed on detail.
- `ApprovalsView` mounted in workspace (`case "approvals"`). No new app route.
- `approval-tabs.tsx`, `approval-table.tsx`, `approval-detail-drawer.tsx`, `approval-status-chip.tsx`, `approval-policy-control.tsx`, `approval-action-dialog.tsx`, domain proposal renderers.
- Full mutation UX on rate-edit-form, bulk-rate-change, restriction-edit, promotion/package flows.
- `handleRevenueMutationResult` shared helper. `invalidateRevenueApprovals` / `invalidateApprovalAffectedDomain`.
- 38/38 Phase 7 tests passing.
- Docs: rate-revenue-phase7-approval-ui.md, rate-revenue-phase7-complete.md.

## Phase 7 complete

| Area | Status |
|---|---|
| Backend approval engine | COMPLETE |
| Approval UI (UI-26–30) | COMPLETE |
| Approvals workspace | COMPLETE |
| Policy backend + UI | COMPLETE |
| Approval requests + history | COMPLETE |
| canApprove | COMPLETE (true for owner/manager) |
| Official mutation UX | COMPLETE |
| Phase 7 tests | 38/38 PASS |
