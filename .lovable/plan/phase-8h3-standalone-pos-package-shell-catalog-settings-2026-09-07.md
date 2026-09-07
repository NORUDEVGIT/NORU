# Phase 8H3 — Standalone POS package shell + Catalog + Settings

Make Standalone POS a real, visible package with its own home, navigation,
product catalogue and settings — and prove its catalogue owes nothing to
Restaurant Management. No selling, no registers/shifts, no payments, no
receipts, no reports.

## What the user gets

- A **Standalone POS** tile on Property Home (only when the POS package is on
  and the person has Standalone POS access), opening `/restaurant/pos`.
- A **Standalone POS home** listing the seven areas of the package with honest
  status labels: Catalog and Settings live; Dashboard, Transactions and
  Reports as foundations; Sell and Registers & Shifts as not-yet-built.
- A **Catalog** page: searchable, filterable product list with categories,
  price, SKU, barcode, tax behaviour and active/inactive; create and edit
  products and categories.
- A **Settings** page: default tax rate, tax-inclusive behaviour, plus
  read-only facts (currency, timezone/business date, receipt numbering).
- Its own sidebar — no Restaurant Management, PMS or Back Office navigation.

## Files

New:
- `src/lib/standalone-pos-modules.ts` — the package registry: seven modules
  (dashboard, sell, catalog, transactions, registers & shifts, reports,
  settings) with title, description, icon, canonical route and an honest
  status (`live` / `foundation` / `next` / `blocked`).
- `src/components/workspaces/standalone-pos/pos-home.tsx` — package home.
- `src/components/workspaces/standalone-pos/catalog-page.tsx` — catalogue list,
  filters, product dialog, category dialog.
- `src/components/workspaces/standalone-pos/settings-page.tsx` — POS settings.
- `src/components/workspaces/standalone-pos/foundation-page.tsx` — shared
  "not built yet" page used by the foundation routes.
- Routes: `src/routes/restaurant/pos/index.tsx`, `catalog.tsx`, `settings.tsx`,
  `dashboard.tsx`, `transactions.tsx`, `shifts.tsx`, `reports.tsx`.
  No `sell` route is created.

Edited:
- `src/components/restaurant-shell.tsx` — add a `posModule` prop with a
  Standalone POS-only sidebar (Property Home → POS Home → the module list,
  planned entries rendered disabled) and a `Standalone POS · <module>` context
  label. Same shape as the existing Back Office navigation.
- `src/routes/restaurant/home.tsx` — the new package tile.
- `src/lib/standalone-pos.functions.ts` — add one read for the honest dashboard
  counts (categories, products, active products, registers, open shifts) and a
  `deleteable`-free category/product listing that includes inactive rows for
  setup users. No new mutation logic; catalogue writes reuse the existing
  `savePosProduct` / `savePosCategory` / `savePosSettings`.
- `docs/standalone-pos-architecture.md`, `docs/architecture-ownership.md`.

## How it behaves

- **Guards.** Every `/restaurant/pos/*` route runs the sign-in check then
  `requireRoutePackage("pos")` in `beforeLoad`, exactly like Back Office uses
  `back_office`. The Restaurant Management guard is not involved. The server
  functions keep their own 8H2 checks (membership + `pos` package +
  `standalone_pos` module + role), so a direct call is refused even if a
  screen were reached another way.
- **Roles.** Owner/manager see and use the create/edit controls. Cashier and
  accountant see the catalogue and settings read-only — the buttons are hidden
  *and* the server still refuses them; hiding is never the only protection. The
  page reads the person's role from the shell's membership.
- **Catalogue independence.** Only `pos_categories` and `pos_products` are
  read or written. No `menu_items` / `menu_categories` import appears anywhere
  under the Standalone POS workspace, and there is no restaurant-menu fallback.
- **Money.** Prices use the property currency through the existing money
  formatter; nothing is hardcoded.
- **Tax.** Each product shows either "POS default (X%)" or "Override X%".
  Settings edit only `pos_settings`; restaurant and hotel tax configuration are
  untouched.
- **Products are deactivated, never deleted**, because sale lines reference
  them. Categories likewise.
- **Selling stays impossible.** The home states that selling needs an active
  register and an open shift, both arriving in 8H4. No sell route, no hidden
  path to `openPosSale`.

## Technical notes

- No database changes are expected; the 8H2 schema is used as is. If a genuine
  missing constraint surfaces during testing, the smallest corrective migration
  is applied and reported.
- Route conflict check: `src/routes/restaurant/pos/new.tsx` already exists as a
  legacy redirect to the Restaurant Management till. Adding `index.tsx` in the
  same folder is a sibling route, not a conflict, and that redirect is left
  exactly as it is.
- `listPosProducts` / `listPosCategories` already support inactive rows; the
  catalogue calls them through `useServerFn` + TanStack Query, and mutations
  invalidate those queries.
- Validation errors from the backend (duplicate SKU, duplicate barcode,
  duplicate names) are surfaced verbatim next to the form.

## Verification

- Typecheck and production build.
- Signed-in browser pass over `/restaurant/pos`, `/catalog`, `/settings` and
  the four foundation routes; no console errors.
- Package matrix: POS on with RM/PMS/Back Office each off → POS still works;
  POS off → blocked back to Property Home; POS on without `standalone_pos`
  access → blocked; cashier → read-only; owner/manager → full setup.
- Data integrity: create a category and product, edit it, deactivate and
  reactivate it, change the default tax rate, confirm the catalogue reads the
  same records and that no restaurant menu table was touched — then delete the
  test records and restore the original settings.
- Regression: Restaurant Management POS & Sales, its menu, orders, shifts and
  Charge to Room unchanged; PMS and Back Office unchanged.

## Deferred to 8H4 and later

Registers, cashier shifts, the sell screen, payments, transactions browser,
receipts, refunds, POS reports, the inventory bridge, any Charge to Room
bridge, and Back Office finance source cards for POS.
