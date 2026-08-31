# Phase 5D — Suppliers, Purchasing & Goods Receiving

Extend the existing Inventory module with procurement: suppliers, purchase orders, goods receiving that flows through the Phase 5A stock ledger, purchase history, and light supplier visibility. No payments, invoicing, recipes, forecasting, or barcode work.

## Database (one migration)

New tables, all tenant-scoped by `restaurant_id`, with GRANTs, RLS and membership policies matching the existing inventory tables (SELECT for members, all writes server-side via the privileged client):

- `restaurant_suppliers` — name, contact_name, email, phone, address, tax_id, notes, active (default true), created_by_staff_membership_id, timestamps. Unique supplier name per restaurant. No hard delete; deactivate only.
- `purchase_orders` — supplier_id, po_number (unique per restaurant), status (`draft | ordered | partially_received | received | cancelled`), order_date, expected_delivery_date, notes, subtotal, total, created_by / ordered_by membership ids, timestamps.
- `purchase_order_items` — purchase_order_id, inventory_item_id, item_name_snapshot, unit_id, ordered_quantity, received_quantity (default 0), unit_cost, line_total, timestamps.
- `purchase_order_history` — purchase_order_id, event_type (`po_created`, `po_updated`, `po_ordered`, `goods_received`, `po_partially_received`, `po_received`, `po_cancelled`), previous_values/new_values jsonb, notes, created_by membership, created_at. Insert-only; no UPDATE/DELETE policies.

Additive traceability columns on `inventory_stock_movements`: `purchase_order_id`, `purchase_order_item_id`, `supplier_id` (all nullable). Existing ledger semantics unchanged.

New security-definer RPC `receive_purchase_order_goods(...)` runs the whole receipt in one transaction: lock the PO, validate tenancy/status/lines, reject `receive_now <= 0` or above remaining, insert each `purchase_received` movement through the same balance logic as `apply_inventory_movement`, bump `received_quantity`, update `inventory_items.unit_cost` to the latest received cost, recompute PO status (`partially_received` / `received`), and write history. It does not duplicate balance maths — it reuses the existing movement function per line.

## Server functions

- `src/lib/purchasing.server.ts` — role helpers (owner/manager = full; kitchen = view POs + receive only; waiter = denied), PO/supplier loaders scoped to the restaurant, PO total recalculation, status transition rules.
- `src/lib/suppliers.functions.ts` — list/create/update/deactivate supplier, supplier purchase history, supplier summary (PO count, ordered value, last order date).
- `src/lib/purchasing.functions.ts` — list POs (filters: status, supplier, restaurant-local date range; search on PO number/supplier), PO KPIs, create/update draft PO with lines, mark ordered, cancel (only when nothing received), get PO detail, receive goods (calls the RPC).

All identity, restaurant, totals and line totals are derived server-side; browser-supplied restaurant/supplier/cost values are validated against the caller's membership. PO number is generated server-side per restaurant.

## UI

- Convert `src/routes/restaurant/inventory.tsx` into `src/routes/restaurant/inventory/index.tsx`, add two tabs: **Suppliers** and **Purchasing** (Overview, Ingredients, Consumables, Operating Assets, Equipment stay as-is).
- `src/components/inventory/suppliers-tab.tsx` + dialogs — desktop table / mobile cards, add/edit/deactivate, last purchase, PO count, view purchase history.
- `src/components/inventory/purchasing-tab.tsx` — KPI strip (open POs, awaiting delivery, partially received, received this period), filters, search, PO table with restaurant-local dates and restaurant currency.
- `src/routes/restaurant/inventory/purchasing/$purchaseOrderId.tsx` — PO detail: header info, line table (item, ordered, received, remaining, unit, unit cost, line total), status-driven actions (Draft: edit / mark ordered / cancel; Ordered or Partial: receive goods, cancel if nothing received; Received or Cancelled: read-only), plus history timeline.
- `src/components/inventory/receive-goods-dialog.tsx` — per-line Receive Now inputs with remaining-quantity clamping.
- Inventory Overview gains two tiles (Open Purchase Orders, Expected Deliveries) and procurement events in recent activity. Phase 5C layout otherwise untouched.
- Item movement history shows PO number and supplier when the movement is linked.

## Costing rule

MVP: the movement records the PO line's `unit_cost`; `inventory_items.unit_cost` is overwritten with the latest received cost. Historical movement costs are never rewritten. No FIFO/LIFO/weighted average.

## Verification

Browser test as The Garden owner: create supplier "Test Foods Ltd", PO with Chicken 10 kg @ 200 and Napkins 200 @ 2, mark ordered, receive 6 kg + 200 (expect partially_received and matching ledger entries), then receive the remaining 4 kg (expect received). Confirm over-receipt is rejected, a received PO cannot be received again, kitchen is receive-only, waiter is blocked, and cross-tenant access fails. Clean up test records afterwards. Build and typecheck must pass.

## Out of scope

Customer/waiter ordering, Orders, Kitchen workflow, staff/workforce, recipes, menu stock deduction, existing ledger and asset-history semantics are untouched. Equipment/assets are not purchasable in this phase.
