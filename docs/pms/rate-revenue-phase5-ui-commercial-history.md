# Rate & Revenue — Phase 5 UI: Commercial History

| Field | Value |
|---|---|
| **Classification** | Implementation record for RR-P5-UI-04. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | UI-21 COMPLETE |
| **Route** | `/restaurant/pms/rates-revenue?view=commercial-history` |

## Purpose

Commercial History is a read-only audit workspace for operational promotion and package activation changes. It reads `hotel_commercial_change_events` through `getCommercialHistoryWorkspace` / `getCommercialHistoryOperationDetail`. It does not audit Property Setup masters and does not mutate activations.

## Row grain and grouping

The stored table is event-grain. V1 apply writes one event per `operation_id`. The workspace compose groups the current page by `operation_id`, keeps the latest `createdAt` as the row clock, and merges `changedFields`. `total` remains the event count, which stays honest while V1 is 1:1.

Detail loads every event for that `operation_id` and shows the combined before/after.

## Filters

Local filters reset page on change:

- Entity Type
- Action
- Changed By (actors from the current date/entity window)
- Search (debounced 300ms, server-only)

Date From/To stay on the shared Revenue Context bar as **Changed Between** (`created_at`). Default range is the last 30 days (`defaultControlCenterRange`). There are no Approval or OTA filters. Search is applied in SQL against `reason`, `operation_id`, and snapshot `promotionCode` / `promotionName` / `packageCode` / `packageName`. One page is never filtered client-side.

## Pagination

Server `page` / `pageSize`. Default 25. Options 10 / 25 / 50. Footer uses `historyPaginationRange` (`Showing X–Y of Z`).

## Action labels

| Code | Label |
|---|---|
| `promotion_activation_created` | Promotion Activated |
| `promotion_activation_edited` | Promotion Edited |
| `promotion_activation_deactivated` | Promotion Deactivated |
| `promotion_activation_scope_changed` | Promotion Scope Changed |
| `package_activation_*` | Package equivalents |

**Reactivated** is inferred only when `actionType` is `*_edited` and `before.active === false` and `after.active === true`. No extra action code is stored.

## Entity and actor resolution

Entity name/code come from `afterState` snapshots. Fallback labels are `Promotion Activation` / `Package Activation`. UUID is never the primary label.

Actors are batched from `restaurant_users` + `profiles`. Unresolved actors display as `Staff`.

Room types and rate plans are resolved from one catalogue load. Empty scopes display as `All eligible`. Missing scalars display as `Not set`. Empty reason values display as `None` in field compare and `No reason provided` in the table.

## Before / after

The drawer shows Operation, Changes, Entity Snapshot, and Context. CREATE sets Status Before to `Not activated`. Scope IDs are named; raw UUID arrays are not shown. Helper copy: `Commercial history is immutable.`

## Navigation

- View Promotion → `view=promotions`
- View Package → `view=packages`
- View Master in Property Setup only when `masterId` exists: `CARD3_PROMOTIONS_HREF` / `CARD3_PACKAGES_HREF`

Overview recent activity and promotion/package Activity tabs keep their 8-row previews and add **View full history**.

## No rollback

The UI has no Undo, Restore, Revert, Replay, Delete, or Edit History. The history server path does not update or delete events. Immutability remains the `COMMERCIAL_CHANGE_EVENT_IMMUTABLE` trigger.
