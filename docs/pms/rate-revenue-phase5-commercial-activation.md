# Rate & Revenue — Phase 5A commercial activation (P5A-04)

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Prompt** | **P5A-04 COMPLETE** |
| **Migration** | `0107_pms_commercial_activation_apply.sql` (dual-lane) |
| **Pricing** | `price_hotel_stay` body unchanged in `0016` |

## 1. Preview

`previewPromotionActivation` and `previewPackageActivation` are read-only. They load the master, current activation (edit/deactivate), property room/plan IDs, and existing activations. Browser snapshot, price, and component values are ignored.

Operations: `CREATE`, `EDIT`, `DEACTIVATE`.

Preview returns operation, master, current/proposed activation, scope, warnings, errors, `expectedVersion`, `changedFields`, before/after. No revenue uplift or booking estimates.

## 2. Apply

`apply_hotel_promotion_activation` and `apply_hotel_package_activation` revalidate every authoritative constraint in one transaction, then:

1. check `expectedVersion`
2. snapshot current state
3. create / edit / deactivate
4. replace mappings (except deactivate, which keeps them)
5. write one immutable history event
6. return `operation_id` + activation

No JS per-row apply loop. Apply is the authority; preview is not.

## 3. Concurrency

Create uses `expectedVersion = absent`. Edit/deactivate use the current `updated_at`. Mismatch raises `COMMERCIAL_ACTIVATION_STALE` and writes nothing.

## 4. History

`hotel_commercial_change_events`. Source is `rate_revenue`. One `operation_id` per apply. One event per activation change. UPDATE/DELETE still raise `COMMERCIAL_CHANGE_EVENT_IMMUTABLE`.

Action types stay on the 0104 taxonomy. Reactivation is an `*_edited` event with `changedFields` including `active`.

## 5. Overlap and duplicates

Promotion overlaps (stay + effective room + effective rate-plan) return `PROMOTION_ACTIVATION_OVERLAP` warnings. They do not block.

Exact duplicate of the same promotion, stay window, booking window, effective room scope, effective rate-plan scope, and `active` is `PROMOTION_ACTIVATION_DUPLICATE`.

Packages may overlap freely. Only an exact duplicate package activation is rejected.

## 6. Scope narrowing

Promotion room types must be a subset of master `pms_promotion_room_types`. Empty activation rooms inherit master. Empty master rooms = all property types. Promotion rate plans may be any property plans; empty = all.

Package room and rate-plan IDs must be subsets of the matching master mappings. Empty activation inherits master. Empty master = all.

Cross-property IDs raise `COMMERCIAL_SCOPE_WRONG_PROPERTY`.

## 7. Master validity

Promotion activation stay dates must fall inside the master `valid_from` / `valid_to`. Packages have no master stay window.

## 8. Snapshot safety

CREATE snapshots live master execution fields (code, name, kind/value or price, components, master scopes). Ordinary EDIT does not refresh those snapshots from the mutable master.

Later Property Setup master edits do not rewrite activations or reservation attribution.

## 9. Deactivation and reactivation

Deactivate sets `active = false` and keeps mappings/snapshot/history. Edit of an inactive activation sets `active = true` when preview/apply still pass.

Inactive activations are ineligible for new quotes and creates. Existing reservation attribution is not rewritten. Apply does not reprice reservations.

## 10. Read APIs

Rate Manager:

- `listPromotionActivations` / `getPromotionActivationDetail`
- `listPackageActivations` / `getPackageActivationDetail`
- `listCommercialChangeHistory` (default 25, allowed 10/25/50, max 100, `created_at desc`)
- `getCommercialOperationDetail`

Actor names resolve in one batch through `restaurant_users` + `profiles`. Fallback: **Staff**.

## 11. Unsupported here

Approvals, OTA/publish, forecast impact, free-night execution, DOW, source/channel, coupons, stacking, advanced package charge bases, cashiering settlement, Phase 5 UI.
