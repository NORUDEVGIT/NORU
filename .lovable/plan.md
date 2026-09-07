# Phase 8H5 — Standalone POS sell screen, cart, payments, atomic completion

Goal: make the first real Standalone POS sale — open shift → cart → server-priced totals → one or more tenders → one atomic completed receipt. Nothing in Restaurant Management, the hotel or Back Office is touched.

## What the till operator gets

A new screen at `/restaurant/pos/sell`:

- **Not ready state.** If the package, module access, selling role, an active register or an open shift is missing, the screen says exactly what is missing and links to Registers & Shifts. No bypass.
- **Shift strip.** Register name, cashier, opened time and business date, resolved by the server — the browser never nominates a shift.
- **Product side.** "All" plus the property's own POS categories, a search box matching product name, SKU or barcode, and large tap targets. Only active products can be added.
- **Cart side.** Lines with quantity plus/minus and remove, subtotal, tax, discount total (when present) and grand total — every figure returned by the server after each change.
- **Park / Clear.** Park leaves the sale open and starts a fresh one; a small strip lists other open sales on this register so they can be resumed. Clear voids the open sale safely (never a completed one).
- **Payment.** Cash, card and other/manual. Multiple tenders on one sale with total due, paid and remaining shown; completion stays disabled while remaining is above zero. Cash accepts an amount tendered and shows change; card/other are capped at the remaining balance.
- **Review then complete.** A concise summary (lines, subtotal, tax, total, tenders, change) precedes the single Complete action.
- **Receipt panel.** Receipt number, date/time, business date, register, cashier, lines with quantities and unit prices, tax, total, tender breakdown and change — rendered from the stored sale, items and payments, not a second copy. Then **New sale**, which opens a fresh sale under the same shift, or drops back to the no-shift state if the shift was closed meanwhile.

## Deferred to 8H6 (stated plainly on screen where relevant)

Discounts UI, refunds, completed-sale voids, transaction browsing and reprints, reports, inventory and room-charge bridges.

## Technical notes

Backend from 8H2/8H4 is reused as-is; **no database changes are expected**. Existing pieces: `posSellReadiness`, `openPosSale`, `listOpenPosSales`, `getPosSale`, `addPosSaleItem`, `updatePosSaleItem`, `removePosSaleItem`, `voidPosSale`, `recordPosPayment`, `completePosSale` (the `pos_complete_sale` transaction), `listPosCategories`, `listPosProducts`, and pricing in `standalone-pos-pricing.server.ts`.

Server additions in `src/lib/standalone-pos.functions.ts` (thin orchestration only, no duplicated formulas):

- `getPosSellContext({ restaurantId, saleId? })` — one call returning readiness, resolved shift context (register, cashier name, opened at, business date, currency), the working open sale (get-or-create: reuse the newest open sale on that register/shift rather than inserting a second one, so double-clicks cannot fan out), its lines, payments and server totals.
- `removePosPayment({ restaurantId, saleId, paymentId })` — only while the sale is open; refuses once completed.
- `completePosSale` gains an idempotent answer: if the sale is already completed by this property, return the existing receipt instead of erroring, so a retry shows the same receipt number.

New files:

- `src/routes/restaurant/pos/sell.tsx` — same guard shape as the other POS routes (`supabase.auth.getUser()` → redirect to `/restaurant/login` with `redirect=/restaurant/pos/sell`, then `requireRoutePackage("pos")`), own `head()`, renders inside `RestaurantShell active="Standalone POS" posModule="sell"`.
- `src/components/workspaces/standalone-pos/sell-page.tsx` — the till UI, product grid, cart, payment dialog and receipt panel. Presentation patterns may echo the restaurant till visually; no restaurant order logic is imported and `menu_categories` / `menu_items` are never read.

Edits: `src/lib/standalone-pos-modules.ts` (Sell becomes live with its canonical route), `src/components/restaurant-shell.tsx` (Sell entry in the POS sidebar), `src/components/workspaces/standalone-pos/pos-home.tsx` (readiness strip reads "Ready to sell" or "Open a shift to start selling"), and both `docs/standalone-pos-architecture.md` and `docs/architecture-ownership.md`.

Error paths handled explicitly: product deactivated mid-sale, shift closed in another tab, register deactivated, insufficient payment, duplicate submit, sale already completed, access or package revoked, and a server total that differs from the optimistic one (server wins, cart refreshes).

## Verification

`bunx tsgo --noEmit`, `bunx vite build`, and a Playwright pass under `/tmp/browser/pos-sell` at 1280x1800. Database checks against a controlled test register/shift/product: arithmetic for tax-exclusive and tax-inclusive lines, cash, card, split tender and cash overpayment; one receipt number under double completion; expected drawer cash rises only by cash tenders; completed rows immutable. Role matrix (owner, manager, cashier sell; accountant refused; no shift refused; POS off refused; `standalone_pos` access removed refused; RM off still sells) and a check that no `orders`, `order_items`, `order_payments` or restaurant `cashier_shifts` rows are written. Completed test sales are immutable by design, so they stay on a controlled test register rather than being deleted; temporary catalog/register rows are removed where safe.

Closes with the 38-point implementation report.
