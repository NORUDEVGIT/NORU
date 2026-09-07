# Phase 8G2B — Back Office owns Procurement

Make Back Office the canonical home for suppliers, purchase orders and goods receiving. Ownership and navigation only: the existing purchasing data, server functions, permissions and receiving transaction stay exactly as they are. No database changes.

## Audit of what exists today

| Screen | Where it lives now | Classification |
| --- | --- | --- |
| Suppliers list + add/edit/deactivate + purchase history dialog | Tab inside `/restaurant/inventory?tab=suppliers` (`suppliers-tab.tsx`, `supplier-dialogs.tsx`) | A — procurement-owned |
| Purchase order list, filters, KPIs, create/edit dialog | Tab inside `/restaurant/inventory?tab=purchasing` (`purchasing-tab.tsx`, `purchase-order-dialogs.tsx`) | A — procurement-owned |
| Purchase order detail, status actions, history timeline, receive goods dialog | `/restaurant/inventory/purchasing/:purchaseOrderId` | A — procurement-owned |
| Stock items, movements, ledger, assets, overview | Other tabs of the inventory screen | B — inventory-owned, untouched |
| Sidebar "Procurement" group (Suppliers, Purchasing) | `restaurant-shell.tsx`, pointing at inventory tabs | C — shared, repointed this phase |
| PMS / Property Home procurement references | Cross-package links | D — other package, relabelled only |

There is no separate returns or approvals flow today, so no returns or approvals section will be invented.

## Canonical routes to create

- `/restaurant/back-office/procurement` — real landing page (replaces the foundation placeholder)
- `/restaurant/back-office/procurement/suppliers`
- `/restaurant/back-office/procurement/purchase-orders`
- `/restaurant/back-office/procurement/purchase-orders/$purchaseOrderId`

No suppliers-detail route and no separate receiving route: supplier detail is a dialog today, and receiving happens inside purchase order detail. Creating either would be inventing a screen.

Each route requires the `back_office` package (`requireRoutePackage`) plus sign-in, exactly like the other Back Office routes; the procurement module/role check stays where it already is — inside the server functions (`requireModuleRole(..., "procurement", PURCHASING_ROLES)`). Back Office alone never grants procurement access.

## Reuse, not rebuild

`SuppliersTab`, `PurchasingTab`, `supplier-dialogs`, `purchase-order-dialogs` are already standalone components — the new routes mount them directly. The purchase order detail body is currently inline in its route file; it moves once into `src/components/workspaces/back-office/purchase-order-page.tsx` and both the legacy route and the canonical route render that same component. No second editor, receiving engine or history engine.

## Procurement home

Real landing page with:
- a short Back Office · Procurement header
- three cards linking to Suppliers, Purchase Orders and (as guidance) Goods Receiving, which points into open purchase orders since that is where receiving happens
- live counts from the existing list functions (active suppliers, open purchase orders) for people who hold procurement access
- a plain note that received goods post to the Inventory stock ledger, which Inventory still owns

People without procurement module access see the header and a neutral "you don't have purchasing access" line — no data, no escalation.

## Navigation

- Breadcrumb on canonical routes: Property Home → Back Office → Procurement → [detail]
- Headers read "Back Office · Procurement"; Restaurant Management never appears as parent
- Sidebar: the Procurement group's Suppliers and Purchasing entries repoint to the canonical Back Office addresses
- Inventory screen keeps its Suppliers and Purchasing tabs working, but each gains a clearly labelled "Open in Back Office · Procurement" link
- PMS shared-module links already route procurement to `back_office`; only the label is confirmed

## Legacy compatibility

`/restaurant/inventory?tab=suppliers`, `?tab=purchasing` and `/restaurant/inventory/purchasing/:id` all keep working unchanged. No redirects this phase; they are recorded as redirect candidates for a later phase.

## Boundary and enforcement

- Procurement owns the purchase order workflow; Inventory owns the resulting stock movement. `receive_purchase_order_goods` is not touched.
- Server mutations already enforce procurement module + role via `requireModuleRole`. No package check is added to those mutations, because they must remain callable from the legacy inventory screen for properties without Back Office. This decision is documented rather than silently applied.

## Technical notes

Files added: four route files under `src/routes/restaurant/back-office/procurement/`, one extracted workspace component for purchase order detail, one procurement home component. Files edited: `src/routes/restaurant/back-office/procurement.tsx` (becomes the layout/home), `src/lib/back-office-modules.ts` (procurement status → partial, canonical route, migration notes), `src/components/restaurant-shell.tsx` (nav + breadcrumb), inventory tabs (cross-link), `src/routes/restaurant/inventory/purchasing/$purchaseOrderId.tsx` (renders the shared component), `docs/architecture-ownership.md`.

Database changes: none.

## Verification

Typecheck, production build, and an authenticated browser pass as The Garden owner: procurement home, suppliers list and edit, purchase order list and detail, a receive-goods action that posts exactly one stock movement, back navigation, legacy routes, and cross-links from Inventory. Package scenarios checked: Back Office off blocks the canonical routes; procurement access missing shows no data; Restaurant Management or PMS off does not affect procurement.

## Deferred to 8G2C

Inventory ownership, stock ledger screens, cost control, returns, approvals, legacy redirects, folder cleanup.
