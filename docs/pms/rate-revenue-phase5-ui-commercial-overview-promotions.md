# Rate & Revenue — Phase 5 UI: Commercial Overview + Promotions

| Field | Value |
|---|---|
| **Classification** | Implementation record for RR-P5-UI-01. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | UI-17 COMPLETE · UI-18 COMPLETE · UI-19 COMPLETE · UI-20 COMPLETE · UI-21 FOUNDATION |

## Views

| View ID | Label | Status |
|---|---|---|
| `commercial` | Commercial Overview (UI-17) | Implemented |
| `promotions` | Promotions (UI-18) | Implemented |
| `packages` | Packages (UI-19) | Implemented |
| `commercial-history` | Commercial History (UI-21) | Foundation |

Commercial section default is `commercial`. Workspace default remains `control-center`. Activation wizard (UI-20) is not a tab.

## KPI definitions

Operational counts are as-of the property business date:

- **Active Promotions** — activation is active and `validFrom <= businessDate <= validTo`
- **Upcoming Promotions** — activation is active and `validFrom > businessDate`
- **Expiring Soon** — Active and `validTo` within 7 days inclusive
- **Active Packages** — same operational rule on package activations

Display statuses: Active, Upcoming, Expired, Inactive. Overlap is an amber attention badge, not a fifth status.

## Attribution period

Performance uses **reservation stay overlap** with workspace `from`/`to` (arrival inclusive, departure exclusive). Optional room-type / rate-plan filters apply to the reservation and to activation scope.

- Bookings = distinct attributed `reservation_id`
- Room nights = overlapping stay nights of those reservations
- Discount = `SUM(hotel_reservation_promotions.discount_amount)`
- Post-promotion room revenue = `SUM(room_subtotal_after_promotion)`

Reservations without an attribution row are excluded. No pre-engine backfill. Label: “Based on attributed bookings since Commercial Engine launch.”

## Attention

Shown only when real:

- Promotion overlap (warning, not an error)
- Expiring soon
- Inactive master referenced by an active activation
- Unsupported free-night master
- Activation validity ended

## UI-18

Filters: search (name/code), status, kind (local). Room type, rate plan, and stay range come from the existing context bar. No approval, channel, source, or publish filters.

Detail drawer tabs: Overview, Scope & Eligibility, Performance, Activity. Property Setup conditions are informational only.

## Operational actions

Edit, deactivate, and reactivate call `previewPromotionActivation` then `applyPromotionActivation` with `expectedVersion`. Stale responses return the user to review. Create / Activate is a foundation hand-off for UI-20.

Deactivate stops future eligibility. It does not rewrite existing reservations.

## Non-goals

No Property Setup master CRUD, approvals, OTA publish, forecast impact, free-night execution, DOW / source / channel targeting, or cashiering settlement claims.

## Reads

`getCommercialOverviewWorkspace`, `getPromotionsWorkspace`, `getPromotionPerformanceSummary`. Rate Manager only. No N+1. No writes to `pms_promotions`.
