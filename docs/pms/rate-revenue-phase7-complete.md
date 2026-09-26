# Rate & Revenue - Phase 7 Complete

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | feature/guest-preferences-workspace |
| **Status** | **PHASE 7 COMPLETE** |
| **Completed** | 2026-09-26 |

## 1. What was delivered

Phase 7 adds the Rate & Revenue approval workflow. Property owners and managers can enable a policy requiring approval before rate, restriction, promotion, or package changes are applied. Submitted requests flow through a queue, are reviewed in a shared detail drawer, and are approved (with immediate domain apply), rejected, cancelled, or automatically marked stale when the underlying configuration changes.

## 2. Steps completed

| Step | Name | Status |
|---|---|---|
| P7-STEP-01 | Approvals capability audit + workflow contract | COMPLETE |
| P7-STEP-02 | Approval backend engine + domain integration | COMPLETE |
| P7-STEP-03 | Approval UI-26-30 + Phase 7 closeout | COMPLETE |

## 3. Schema additions

Migration 0109_pms_revenue_approvals.sql (dual-lane).

| Table | Role |
|---|---|
| hotel_revenue_approval_policy | One row per property. enabled default false. Missing row = disabled. |
| hotel_revenue_approval_requests | One request per logical operation. Immutable after submit. |
| hotel_revenue_approval_events | Append-only lifecycle events. UPDATE/DELETE raise REVENUE_APPROVAL_EVENT_IMMUTABLE. |

No changes to price_hotel_stay, room_subtotal, nightly_rate_snapshot.

## 4. Backend engine

Server functions: getRevenueApprovalPolicy, setRevenueApprovalPolicy, submitRevenueApprovalRequest, approveRevenueApprovalRequest, rejectRevenueApprovalRequest, cancelRevenueApprovalRequest, listRevenueApprovalRequests, getRevenueApprovalRequestDetail, countEligibleRevenueApprovers.

RPCs: submit_hotel_revenue_approval, transition_hotel_revenue_approval, approve_hotel_revenue_approval, count_eligible_revenue_approvers.

## 5. Official apply wrappers

executeOrSubmitRateChange, executeOrSubmitRestrictionChange, executeOrSubmitPromotionActivation, executeOrSubmitPackageActivation.

Return type: { mode: "applied", ...domainResult } or { mode: "submitted_for_approval", approvalRequestId, summary }.

When policy is disabled, existing immediate apply runs unchanged.

## 6. Domain adapters

RevenueApprovalDomainAdapter in revenue-approval-adapters.ts handles rate, restriction, promotion_activation, package_activation.

Each adapter implements prepareSubmit (validates, resolves names, builds snapshot) and checkStale (re-preview before approve).

## 7. Access model

canApprove = true for owner and manager. No new role. Same REVENUE_OPERATE_ROLES.

membershipId surfaced on RevenueAccessResolution from callerMembership().

canReview and selfApprovalBlocked computed server-side in getRevenueApprovalRequestDetail.

Self-approval blocked when another eligible approver exists. Sole-approver may self-approve.

## 8. Workspace

approvals view: implemented = true. Section: commercial (existing Commercial nav).

rates-workspace.tsx mounts ApprovalsView on case "approvals".

URL extras: approvalTab=pending|mine|history, approvalRequest=<id> on the existing rates-revenue search object, serialized only when view=approvals.

## 9. UI screens

| UI | Description |
|---|---|
| UI-26 | Pending queue - listRevenueApprovalRequests with status: pending, newest first |
| UI-27 | Shared detail drawer (pending view) |
| UI-28 | My Requests - requestedBy=membershipId |
| UI-29 | Reviewed detail in the same shared drawer |
| UI-30 | History - terminal statuses, server pagination, date/status/domain/actor filters |

## 10. Policy control

Header of Approvals view. Rate Manager only. Enable/disable with confirm copy. No auto-approve of pending rows on disable.

## 11. Drawer sections

Request, Proposed Change (domain renderers), Current State / Warnings (currentStateHint.changed only, never client-set stale), Events (audit), Actions (Approve & Apply, Reject, Cancel Request when pending; View Applied Change when terminal + appliedOperationId).

## 12. Domain proposal renderers

RateApprovalProposal, RestrictionApprovalProposal, PromotionApprovalProposal, PackageApprovalProposal. No JSON.stringify. All fields as labelled rows. Reactivate label when EDIT + active to true.

## 13. Status chip

ApprovalStatusChip: Pending amber, Approved green, Rejected subdued red, Cancelled neutral, Stale warning.

## 14. Stale handling

checkStale runs before approve. If stale: transition to stale, return { status: "stale", reason }, drawer stays open showing APPROVAL_STALE_COPY + APPROVAL_STALE_HELP. No reapply button. User creates a new request from the current workflow.

## 15. Approve success

Toast "Approval applied". Invalidate revenue-approvals + domain query keys (rate calendar/history, restriction history, commercial overview/promotions/packages/history).

## 16. Mutation UX

handleRevenueMutationResult shared helper. Submit: toast + invalidate revenue-approvals only. Apply: existing domain invalidation. "View Request" CTA after submit.

Button labels: "Apply" (disabled policy) vs "Submit for Approval" (enabled policy).

## 17. Pagination

Page sizes 10, 25, 50 (REVENUE_APPROVAL_PAGE_SIZES). Server pagination throughout. No client-only filtering.

## 18. Tests

| File | Tests | Status |
|---|---|---|
| revenue-approval-ui.test.ts | 7 | PASS |
| revenue-approval.test.ts | 15 | PASS |
| revenue-access.test.ts | 5 | PASS |
| rate-revenue-workspace.test.ts | 11 | PASS |
| **Total Phase 7** | **38** | **PASS** |

Phase 2-6 regression tests (rate-change, bulk-rate-change, restriction-change, commercial-engine, commercial-activation, commercial-overview, commercial-promotion, commercial-package, rate-shopping) remain passing and unchanged.

market-intelligence: implemented: false (Phase 6 on hold - not a regression).

## 19. What was not done (by design)

- Notifications (email, push, in-app).
- Multi-stage or delegated approval.
- Approval thresholds or per-domain policy switches.
- Comments thread.
- Line-item approval.
- Rollback or replay of approved operations.
- SLA timers.
- Approval analytics.
- Pending nav badge (not added - would require extra query).
- Phase 6 market intelligence data provider (still on hold).

## 20. Phase 7 complete statement

All three steps of Phase 7 are complete. The Rate & Revenue approval workflow is production-ready for the single-policy, single-stage use case. The workspace, tabs, drawer, policy control, domain renderers, official mutation UX, query key strategy, access model, server-computed review flags, and all 38 Phase 7 tests are in place. Phase 7 is closed.
