# Rate & Revenue - Phase 7 Approval UI

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not a Functional Spec. |
| **Branch** | feature/guest-preferences-workspace |
| **Status** | **P7-STEP-03 COMPLETE** |
| **Tests** | 7/7 revenue-approval-ui.test.ts - 38/38 full Phase 7 suite |

## Workspace mount

approvals view flipped to implemented: true in REVENUE_VIEW_DEFINITIONS.

rates-workspace.tsx mounts ApprovalsView on case "approvals", passing restaurantId, context, access, search, onNavigateView.

serializeRevenueSearch passes approvalTab and approvalRequest when view=approvals. No new app route added.

## REVENUE_UI_SCREEN_MAP

| UI | View | Note |
|---|---|---|
| UI-26 | approvals | pending queue |
| UI-27 | null | shared approval detail drawer |
| UI-28 | approvals | My Requests tab |
| UI-29 | null | reviewed detail in the shared drawer |
| UI-30 | approvals | History tab |

## Access and permissions

canApprove = true for owner and manager (REVENUE_OPERATE_ROLES). No new role.

membershipId is returned from callerMembership() in loadRevenueAccess() (server) and surfaced on RevenueAccessResolution. UI-28 passes requestedBy: access.membershipId for My Requests. Self-approval copy uses the same id.

Server-computed review flags on RevenueApprovalDetail:
- canReview: boolean - set to true when the caller can approve this specific request (not self-blocking).
- selfApprovalBlocked: boolean - set to true when the caller is the requester and another eligible approver exists.

Computed in getRevenueApprovalRequestDetail using countEligibleRevenueApprovers + canSelfApproveRevenueRequest. The drawer reads these from the detail response; no eligibility re-implementation in the client.

## Tabs

approval-tabs.tsx renders Pending / My Requests / History.

parseApprovalTab defaults unknown values to "pending".

| Tab | Query |
|---|---|
| Pending | status: "pending" |
| My Requests | requestedBy: access.membershipId |
| History | statuses: REVENUE_APPROVAL_TERMINAL_STATUSES + date/status/domain/actor filters |

Empty-state copy:
- Pending: "No approvals are waiting for review."
- My Requests: "You have not submitted any approval requests."
- History: "No reviewed approval requests yet."
- Pending + disabled: "Approval workflow is currently disabled. Operational changes apply immediately."

## Table (approval-table.tsx)

Shared across all three tabs. Columns: Submitted, Domain, Change (summary), Scope, Requested By, Reason, Status, Actions.

- Pending: Review action opens drawer.
- My Requests / own pending: View + Cancel (pending only).
- Terminal: View only.
- Domain labels: Rates / Restrictions / Promotion / Package.
- Pagination: page sizes 10 / 25 / 50. Server pagination only.

## Shared detail drawer (approval-detail-drawer.tsx)

Sections: Request, Proposed Change, Current State / Warnings, Events, Actions.

Desktop >=1280px: right-hand panel 480px. Mobile: Sheet overlay.

### Request section
Status, Domain, Action, Submitted, Requested By, Reason. When reviewed: Reviewed By, Reviewed At, Review Reason.

### Proposed Change section

| Domain | Renderer |
|---|---|
| rate | RateApprovalProposal - SET_RATE, PERCENT_INCREASE, PERCENT_DECREASE, RESET_OVERRIDE, COPY_FROM_DATE |
| restriction | RestrictionApprovalProposal - Stop Sell, CTA, CTD, Min Stay, Max Stay, CLEAR_ALL |
| promotion_activation | PromotionApprovalProposal - includes Reactivate Promotion label when EDIT + active to true |
| package_activation | PackageApprovalProposal - includes Reactivate Package label similarly |

No JSON.stringify in any renderer.

### Current State / Warnings section
Shows APPROVAL_CURRENT_STATE_CHANGED only when currentStateHint.changed. Never marks status stale from UI.
Shows APPROVAL_STALE_COPY + APPROVAL_STALE_HELP when stale.

### Actions section
- Pending: Approve & Apply (canApprove && canReview), Reject (canReview), Cancel Request (own request only).
- SELF_APPROVAL_BLOCKED_COPY shown when selfApprovalBlocked.
- Terminal: no mutation buttons. View Applied Change navigates to rate-history / restriction-history / commercial-history when appliedOperationId exists.

## Policy control (approval-policy-control.tsx)

Header of Approvals. Rate Manager only.
- Enable confirm: "New Rate & Revenue changes will require approval before they are applied."
- Disable confirm: "New changes will apply immediately. Existing pending requests are not automatically applied."
- Never auto-approves pending rows.

## Action dialog (approval-action-dialog.tsx)

Handles: approve, reject (reason required), cancel, policy-enable, policy-disable.
- Approve confirm: "Approve and apply this requested change?"
- Reject: "Reject this approval request?"
- Cancel: "Cancel this pending request?"

## Approve success / stale / error

- Success: toast "Approval applied"; invalidate revenue-approvals + domain query keys.
- Stale: drawer stays open; shows stale copy + help. No reapply.
- Apply error: stays Pending; shows error; allows retry.

## Mutation UX on official forms

handleRevenueMutationResult(result) shared helper.

| Surface | Disabled | Enabled + submitted |
|---|---|---|
| rate-edit-form.tsx | Apply | Submit for Approval + RATE_SUBMITTED_TOAST |
| bulk-rate-change-view.tsx | Confirm & Apply | Submit for Approval + BULK_RATE_SUBMITTED_TOAST |
| restriction edit / bulk | Apply | Submit for Approval + RESTRICTION_SUBMITTED_TOAST |
| promotion / package flows | Activate / Confirm | Submit for Approval + PROMOTION_SUBMITTED_TOAST / PACKAGE_SUBMITTED_TOAST |

mode: "applied" - existing domain invalidation. mode: "submitted_for_approval" - invalidate revenue-approvals only.

"View Request" CTA uses approvalRequestSearch(approvalRequestId).

## Query keys

| Purpose | Key |
|---|---|
| Approval list | ["revenue-approvals", restaurantId, ...] |
| Approval detail | ["revenue-approval-detail", restaurantId, id] |
| Policy | ["revenue-approval-policy", restaurantId] |

Submit does NOT invalidate domain keys. Approve invalidates both approval + affected domain keys.

## Known limitations

- No notifications, multi-stage, thresholds, comments, line-item approval, rollback, replay, delegated approval, SLA, or analytics.
- Sole-approver self-approval remains permitted.
- Phase 6 market intelligence provider still on hold.
