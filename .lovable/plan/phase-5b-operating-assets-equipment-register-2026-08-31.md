# Phase 5B — Operating Assets + Equipment Register

Extend the existing Inventory module with a physical asset register (operating assets and equipment), including condition/status tracking, location, purchase info, and a read-only change history. Stock/ingredient logic is untouched.

## What you get

- Two new tabs on `/restaurant/inventory`: **Operating Assets** and **Equipment**, alongside Overview, Ingredients, Consumables.
- Add/edit assets with name, asset code, quantity, condition, status, location, purchase date, purchase cost, notes. Equipment additionally has serial number and warranty expiry.
- Quick actions: change condition, change status, change location, update quantity, mark disposed, view history.
- Semantic badges kept separate: Status (Active / Under Maintenance / Out of Service / Disposed) vs Condition (Excellent / Good / Fair / Damaged).
- Warranty shown as Valid / Expiring Soon / Expired using the restaurant's local date; costs shown in the restaurant's currency.
- Search by name, asset code, and serial number; filters for status, condition, and location; a "show disposed" toggle.
- Overview gains four counters: Operating Assets, Equipment, Under Maintenance, Out of Service. Existing stock KPIs stay.
- Every meaningful change is written to an immutable history log viewable per asset.

## Permissions

- Owner and Manager: full asset management.
- Kitchen: read-only (no cost edits, no status/quantity changes, no disposal).
- Waiter: no access to the asset tabs or asset server functions.
All rules enforced server-side; the UI only hides what the server already blocks.

## Technical plan

### Migration (one new migration)
- `public.restaurant_assets`: id, restaurant_id (FK restaurants), asset_type (`operating_asset` | `equipment`), name, asset_code, quantity numeric NOT NULL DEFAULT 0 CHECK >= 0, condition (`excellent|good|fair|damaged`), status (`active|under_maintenance|out_of_service|disposed`), location, purchase_date, purchase_cost, serial_number, warranty_expiry, notes, created_by_staff_membership_id (FK restaurant_users, ON DELETE SET NULL), created_at, updated_at.
  - Partial unique index on `(restaurant_id, lower(asset_code))` where asset_code is not null.
  - Indexes on `(restaurant_id, asset_type, status)`.
  - `set_updated_at` trigger reused.
- `public.restaurant_asset_history`: id, restaurant_id, asset_id (FK, ON DELETE CASCADE), event_type, previous_values jsonb, new_values jsonb, notes, created_by_staff_membership_id, created_at.
- GRANTs then RLS, mirroring the inventory tables: `SELECT ... TO authenticated` gated by `public.is_restaurant_member(restaurant_id)`; no anon grants; writes via service role only (`GRANT ALL ... TO service_role`), no INSERT/UPDATE/DELETE policies for authenticated. No hard delete path.

### Server layer
- `src/lib/assets.server.ts` — asset/condition/status/event constants, role rules (`canManageAssets`, `canViewAssets`), warranty state helper, tenant-scoped `loadAsset`.
- `src/lib/assets.functions.ts` — `listAssets`, `getAssetOverview`, `listAssetHistory`, `createAsset`, `updateAsset`, `changeAssetStatus`, `changeAssetCondition`, `updateAssetQuantity`, `disposeAsset`. All use `requireSupabaseAuth`, derive membership and `created_by_staff_membership_id` server-side from the session, validate the restaurant membership, reject waiter and kitchen writes, and write a history row in the same handler by diffing old vs new values (event type derived from which fields changed). Never trust browser-supplied restaurant or identity fields.

### UI
- `src/components/inventory/asset-dialogs.tsx` — asset create/edit dialog (equipment variant adds serial + warranty), quick-change dialogs (status/condition/location/quantity, with optional note), disposal confirm, and a read-only history dialog.
- `src/routes/restaurant/inventory.tsx` — add two tabs sharing an `AssetList` (desktop table + mobile cards, matching current styling), search/filter bar, and four extra Overview KPI cards. Money via `useMoney`, dates via `useRestaurantTime`.

### Verification
Against The Garden: create "Dining Chair" (40, good, active, Dining Area) and "Coffee Machine" (1, good, active, Bar, TEST-CM-001); exercise edit, condition/status/location/quantity changes, maintenance, disposal, history entries, disposed visibility; confirm kitchen read-only, waiter blocked, cross-tenant reads/writes rejected; then remove the temporary rows.

### Out of scope
Maintenance scheduling, depreciation, suppliers, purchase orders, repairs workflow, notifications, barcodes, serialised instances, advanced analytics. No changes to stock movements, ordering, kitchen, workforce, settings, or auth.
