# Rate & Revenue — Phase 7 approvals audit

| Field | Value |
|---|---|
| **Classification** | Audit + V1 workflow contract. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **P7-STEP-01 COMPLETE** |
| **Surfaces** | UI-26 → UI-30 (workspace foundation only; UI deferred to Step 3) |

## 1. Finding — no generic approval engine

Rate & Revenue has no reusable approval product. Card 7 `pms_approval_rules`, SET5 `rateOverrideNeedsApproval`, Room & Inventory approval-required flags, and other catalogue `approval_required` columns remain independent setup concepts. Phase 7 does not reuse them.

## 2. Finding — applies are immediate

Official write paths apply immediately after preview:

| Domain | Preview | Official apply | Authoritative RPC |
|---|---|---|---|
| Rates | `previewRateChanges` | `applyRateChanges` | `apply_hotel_rate_changes` |
| Restrictions | `previewRestrictionChanges` | `applyRestrictionChanges` | `apply_hotel_rate_restrictions` |
| Promotion | `previewPromotionActivation` | `applyPromotionActivation` → `applyStoredPromotionActivation` | `apply_hotel_promotion_activation` |
| Package | `previewPackageActivation` | `applyPackageActivation` → `applyStoredPackageActivation` | `apply_hotel_package_activation` |

Approval boundary is after preview and before those RPCs. Domain apply paths stay authoritative. Phase 7 must not write `hotel_rate_calendar`, restriction rows, or commercial activations directly.

## 3. Finding — immutable domain history already exists

Approved applies must still write the existing append-only histories:

- `hotel_rate_change_events`
- `hotel_rate_restriction_change_events`
- `hotel_commercial_change_events`

Approval events supplement those histories. They do not replace them.

## 4. V1 contract

- Policy is property-scoped (`hotel_revenue_approval_policy`).
- Default is disabled. Missing policy row means `enabled = false`.
- One approval request per logical operation (including one request for a 366-cell bulk).
- Request stores canonical proposal payload + expected version token + display snapshot.
- Approve revalidates current state. Stale requests do not apply.
- Approved means review accepted **and** domain apply committed in one transaction.
- Actors are existing Rate Managers (`RATE_MANAGE_ROLES` = owner, manager). No new role.
- Self-approval is blocked when another authorized owner/manager membership exists. Sole Rate Manager may self-approve.
- Notifications, multi-stage routing, thresholds, line-item approval, rollback, and replay are deferred.

## 5. Payload and version semantics

Canonical stored payloads:

- Rate: `RateChangeRequest`
- Restriction: `RestrictionChangeRequest`
- Promotion / package: existing activation preview/apply input (`CREATE` / `EDIT` / `DEACTIVATE`)

Reactivate remains `EDIT` with `active=true`. There is no `REACTIVATE` backend type.

Version tokens reuse the domain:

- Rates / restrictions: `updated_at` or `absent`
- Commercial: `updated_at` or `absent`
- Commercial CREATE expected version is `absent`. If the entity exists before approve, the request is stale.

## 6. Access / workspace lock

`canApprove` stays `false` in the UI access model until Step 3.

Workspace view `approvals` stays `implemented: false` until Step 3.

## 7. Explicit non-goals

No approval UI in this audit. No notifications. No threshold routing. No `price_hotel_stay` / `room_subtotal` / `nightly_rate_snapshot` changes. No Phase 6 provider work.
