# Rate & Revenue — Phase 5 UI: Packages

| Field | Value |
|---|---|
| **Classification** | Implementation record for RR-P5-UI-02. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | UI-19 COMPLETE · UI-20 COMPLETE · UI-21 FOUNDATION |

## Structure

View ID `packages` is implemented in the Commercial section:

Commercial Overview · Promotions · Packages · Commercial History (foundation)

`PackagesView` is operational visibility of package activations. It does not create or edit Property Setup package masters.

## Row model

One row per activation. The same master may appear more than once; the stay window is the secondary identity. Masters with no activation appear as a separate **Not Activated** row. That status is not an inactive activation.

## Status

Activation operational status as of the property business date:

- Active — `active` and `validFrom <= businessDate <= validTo`
- Upcoming — `active` and `validFrom > businessDate`
- Expired — `active` and `validTo < businessDate`
- Inactive — `active = false`

Master-only rows use **Not Activated**.

Expiring Soon: Active and `validTo` within 7 days inclusive.

## Filters

Local: search (name/code), status (including Not Activated), package type (Card 3 types only).

Room type and rate plan come from the existing revenue context bar and match effective activation scope (empty activation inherits master; empty master = all).

No market segment, source, channel, approval, published, or payment filters.

## KPI definitions

- **Active / Upcoming / Expiring Soon** — operational activation counts
- **Package Bookings** — distinct `reservation_id` in `hotel_reservation_packages` whose stay overlaps the workspace range
- **Package Revenue** — `SUM(applied_amount)` for those attribution rows

Helper: “Based on attributed package selections since Commercial Engine launch.”

Revenue helper: “Attributed package value; not cashiering collection.”

No backfill. Reservations without an attribution row are excluded.

## Performance formulas

Stay overlap matches promotions (arrival inclusive, departure exclusive).

- Bookings = distinct attributed `reservation_id`
- Revenue = `SUM(applied_amount)`
- Attribution count = `hotel_reservation_packages` rows
- Average applied amount = revenue / attribution rows (0 when none)

Room nights are omitted. Package amounts are per stay, so nights would overstate consumption.

## Activation vs master

Master (`pms_packages`) owns identity, type, catalogue price, and components.

Activation owns stay window, narrowed room/rate scope, and snapshotted price/components.

Ordinary edit does not refresh price or components from the live master. If the current master price differs, detail may show it as informational only.

## Components

Displayed from the activation `components_snapshot` (`label`, `componentType`, `quantity`). Example: `Breakfast × 2`. No Used / Consumed / Delivered claims.

## Drawer

Tabs: Overview, Scope & Components, Performance, Activity.

Activity lists `package_activation` commercial history only. Full UI-21 comes later.

## Edit / deactivate / reactivate

`previewPackageActivation` then `applyPackageActivation` with `expectedVersion`.

Editable: stay window, room scope, rate plan scope, reason.

Read-only: charge basis Per Stay, configured price, component snapshot.

Deactivation stops new eligibility. Existing reservation attribution is not rewritten.

Reactivate is an EDIT through preview/apply, not a direct `active=true` write.

Stale: “This package activation changed since you reviewed it. Review the latest values before applying again.”

## Activate Package

UI-20 overlay. Activate Package and master-row Activate open `CommercialActivationWorkflow` (`kind=package`). CREATE uses `previewPackageActivation` then `applyPackageActivation`.

## Ownership

Rate & Revenue does not insert or update `pms_packages` or `pms_package_components`. Property Setup remains master owner. Writes go through `apply_hotel_package_activation`.

## Unsupported

No cashiering posting, approvals, OTA publish, forecast / occupancy / RevPAR impact, inclusion consumption, per-night or per-person packages, automatic application, or master CRUD.
