# POS Architecture Freeze — Audit and Decisions

## What exists today (verified)

There is exactly **one** till in NORU, and it belongs to Restaurant Management.

| Surface | Where | State |
| --- | --- | --- |
| Till screen | `/restaurant/restaurant-management/pos-sales` | Live, used |
| Old till address | `/restaurant/pos/new` | Redirect only, kept for bookmarks |
| "Payments & Cashiering" | `/restaurant/restaurant-management/payments` | Renders the **same** till component; labelled "foundation" |
| Hotel billing | PMS Cashiering (folios) | Separate, untouched |

Key facts confirmed in code:

- A till sale is an ordinary order. `placePosSale` reuses the shared order
  pipeline (same as QR and waiter orders), tagged `pos_counter`, tied to the
  cashier's open shift. Prices are always re-read from the menu, never taken
  from the browser.
- Settlement runs through one guarded database function
  (`record_pos_order_payment`), which validates the order, the amount, the
  cash tendered and the open shift, then stamps the order as paid.
- Charge to Room is a second settlement path for the same order, requiring the
  order to be served and **both** Restaurant Management and PMS to be enabled.
- There is **no tax, service charge, tip or discount logic anywhere** in the
  till or the pricing path. Totals are price × quantity.
- Hold and Void are screen-only: held sales live in browser memory and vanish
  on refresh; Void only clears an unsent cart. There is no void-after-payment,
  no refund, and no receipt beyond the browser print dialog.
- The "Standalone POS" package key exists but is enforced nowhere; the till is
  gated by the Restaurant Management package plus the `pos` module permission
  (owner, manager, cashier, waiter).

## Decisions to freeze

1. **One till, one owner.** POS & Sales belongs to Restaurant Management. The
   future Standalone POS package is a separate product and is not started here.
2. **The till never becomes a second ordering engine.** All sales keep going
   through the shared order pipeline with server-side pricing.
3. **Restaurant payments stay in Restaurant Management; hotel folios stay in
   PMS.** Charge to Room remains the only bridge, and only when both packages
   are on.
4. **PMS Cashiering and `/restaurant/cashiering` are untouched.**
5. **Money rules (tax, service charge, tips, discounts) are not invented.**
   They are recorded as missing, not faked.

## Corrections in this phase (small, no behaviour change)

- Stop "Payments & Cashiering" from silently rendering the till. It becomes an
  honest foundation page: what the till already does today, links to the till
  and to the shift/reconciliation screens that exist, and a plainly-labelled
  list of what is not built (tax, service charge, discounts, refunds, receipt
  reprint, end-of-day cash-up report).
- Fix the module registry so the two tiles no longer claim the same old
  address, and so each tile's description matches what it really does.
- Label Hold and Void in the till as screen-only, so staff are not misled into
  thinking a held sale survives a refresh.
- Record the freeze and the known gaps in `docs/architecture-ownership.md`.

## Not in this phase

Tax/VAT and service charge, discounts and comps, refunds and post-payment
voids, persisted held sales, receipt templates and reprint, end-of-day cash-up
reporting, and the Standalone POS package. Each is listed as a gap, not built.

## Technical notes

- Files touched: `src/routes/restaurant/restaurant-management/payments.tsx`
  (render a foundation page instead of `PosPage`), a new
  `src/components/workspaces/restaurant/payments-foundation.tsx`,
  `src/lib/restaurant-management-modules.ts` (tile metadata and legacy-route
  ownership), `src/components/workspaces/restaurant/pos-workspace.tsx` and
  `src/components/pos/pos-sale-panel.tsx` (wording only),
  `docs/architecture-ownership.md`.
- No database changes, no migrations, no changes to `pos.functions.ts`,
  `pos.server.ts`, `order-core.server.ts`, `order-pricing.server.ts`,
  `room-charge.*` or any RPC.
- Verification: typecheck, production build, and a signed-in pass over the
  till (sale, cash payment, room-charge option) and the payments page.
