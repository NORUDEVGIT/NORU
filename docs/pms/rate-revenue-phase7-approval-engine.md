# Rate & Revenue — Phase 7 approval engine

| Field | Value |
|---|---|
| **Classification** | Backend engine record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **P7-STEP-02 COMPLETE** |
| **UI** | Not yet. Workspace `approvals` stays `implemented: false`. `canApprove` stays false. |

## Schema

Migration `0109_pms_revenue_approvals.sql` (dual-lane).

| Table | Role |
|---|---|
| `hotel_revenue_approval_policy` | One row per property. `enabled` default false. |
| `hotel_revenue_approval_requests` | One request per logical operation. |
| `hotel_revenue_approval_events` | Append-only lifecycle events. |

Missing policy row means approval is disabled. Existing properties do not need a seed row.

## Policy

`getRevenueApprovalPolicy` / `setRevenueApprovalPolicy`. Rate Manager only. Upsert of `enabled` only. No thresholds, role routing, or commercial-specific switches.

Card 7 `pms_approval_rules` and SET5 `rateOverrideNeedsApproval` stay unused.

## Request lifecycle

Statuses: `pending` → `approved` | `rejected` | `cancelled` | `stale`.

Terminal states do not reopen. A new proposal is a new request. Stored proposal, snapshot, domain, action, entity, expected version, requester, and requested time are immutable after submit.

## Events

`submitted`, `approved`, `rejected`, `cancelled`, `stale`. UPDATE/DELETE raise `REVENUE_APPROVAL_EVENT_IMMUTABLE`.

## Self-approval

Count active same-property owner/manager memberships.

- More than one: requester cannot approve or reject their own request.
- Exactly one: requester may approve.

Enforced in SQL (`count_eligible_revenue_approvers` + approve/reject RPCs).

## Domain adapters

`RevenueApprovalDomainAdapter` in `revenue-approval-adapters.ts`.

| Domain | Canonical payload | Apply path |
|---|---|---|
| `rate` | `RateChangeRequest` | `previewRateChanges` / `apply_hotel_rate_changes` |
| `restriction` | `RestrictionChangeRequest` | `previewRestrictionChanges` / `apply_hotel_rate_restrictions` |
| `promotion_activation` | activation proposal | `previewStoredPromotionActivation` / `apply_hotel_promotion_activation` |
| `package_activation` | activation proposal | `previewStoredPackageActivation` / `apply_hotel_package_activation` |

Commercial operations remain `CREATE` / `EDIT` / `DEACTIVATE`. Reactivate is `EDIT` with `active=true`. CREATE expected version is `absent`.

## Submit

`submitRevenueApprovalRequest` requires policy enabled, Rate Manager, schema validation, re-preview, then `submit_hotel_revenue_approval`. No domain mutation.

## Approve

`approveRevenueApprovalRequest` re-previews. If stale, transitions to `stale` and returns `{ status: "stale", reason }`. If valid, `approve_hotel_revenue_approval` applies the stored proposal through the existing domain RPC and marks the request approved in the same transaction.

Unexpected apply failure rolls back. The request stays pending. No approved event. No `applied_operation_id`.

## Reject / cancel

Reject: pending only, authorized reviewer, review reason required, no domain write.

Cancel: pending only, requester only, no domain write.

## Official mutation contract

`executeOrSubmit*` wrappers on Rate Calendar / Bulk Rate / Restriction Calendar / Bulk Restriction / Commercial activation entry points:

```ts
{ mode: "applied", ...domainResult }
{ mode: "submitted_for_approval", approvalRequestId, summary }
```

When policy is disabled, existing apply runs immediately and writes existing domain history. No approval request is created.

## Domain history

Approved apply still writes `hotel_rate_change_events`, `hotel_rate_restriction_change_events`, or `hotel_commercial_change_events`. `applied_operation_id` stores that `operation_id`.

## Read models

`listRevenueApprovalRequests` — filters, server pagination, pending first / newest first.

`getRevenueApprovalRequestDetail` — request, events, snapshot, summary, proposal, actor labels, optional current-state hint. Approve path remains authoritative for stale.

`requestedBy` supports My Requests. Terminal statuses support history.

## Deferred

Notifications, multi-stage approval, thresholds, line-item approval, rollback, replay, approval UI, `canApprove`, and workspace `approvals` implementation.
