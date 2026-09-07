# Phase 8H1B — Standalone POS architecture freeze (documentation only)

Settle the independent Standalone POS domain on paper. No behaviour change, no
tables, no routes, no policies, no navigation change. The current restaurant
till at `/restaurant/restaurant-management/pos-sales` keeps working exactly as
it does today.

## What gets produced

One new document, `docs/standalone-pos-architecture.md`, plus an ownership
update in `docs/architecture-ownership.md`. Nothing else is touched.

## Confirmed from the current code (already verified)

- The only till is the Restaurant Management one; `/restaurant/pos/new` is a
  redirect-only file and is the sole thing living under `/restaurant/pos`.
- Till components: `pos-menu-panel.tsx`, `pos-sale-panel.tsx`,
  `pos-payment-dialog.tsx`. Server side: `pos.functions.ts`, `pos.server.ts`,
  reusing `order-core`, `order-pricing`, `cashier_shifts`, `room-charge`.
- Module key `pos` today gates the restaurant till (owner, manager, cashier,
  waiter) and is also listed as the future Standalone POS package's module.
- Package key `pos` exists ("Standalone POS") and is enforced nowhere.

## Sections the document will freeze

1. Ownership lock — restaurant menu, orders, order items, order payments and
   restaurant cashier shifts stay Restaurant Management; Standalone POS never
   writes to them.
2. Package independence matrix (POS on with RM/PMS/Back Office off, and both
   tills coexisting).
3. Canonical route family. `/restaurant/pos` currently holds only a redirect
   stub, so it is safe to reclaim; the document states the reclaim condition
   (keep `/restaurant/pos/new` redirecting to the RM till) and freezes
   `/restaurant/pos`, `/dashboard`, `/sell`, `/catalog`, `/transactions`,
   `/shifts`, `/reports`, `/settings`.
4. Module key decision — a separate `standalone_pos` module key rather than
   reusing `pos`, because `pos` already means "the restaurant till" for four
   roles; migration path described.
5. Target tables: `pos_registers`, `pos_categories`, `pos_products`,
   `pos_cashier_shifts`, `pos_sales`, `pos_sale_items`, `pos_payments`,
   `pos_refunds`. Each with purpose, key fields, tenant relationship, foreign
   keys, status values, mutability, timestamps and soft-delete approach.
6. Catalog fields; no variants or modifiers in v1.
7. Price on the product row (option A) — no effective-dated pricing need today.
8. Sale and sale-item model with full snapshot fields.
9. Sale statuses: open, completed, voided, refunded, partially_refunded, with
   void limited to open sales and refunds handling completed ones.
10. Parked sales: persisted as `open` sales (option B) so a suspended cart
    survives a refresh — unlike today's screen-only hold.
11. Payments incl. split tender allowed in v1 (many payment rows per sale).
12. Cashier shifts, register linkage, and the rule that a completed sale must
    belong to an open shift.
13. Registers kept narrow: name, location label, active flag.
14. Receipts rendered from immutable sale data (option A); numbering strategy
    documented, not implemented.
15. Refunds as linked records against the original sale (option A).
16. Minimal discount fields at line and sale level with reason and authoriser.
17. Tax sourced from package-neutral property settings, snapshotted per line;
    never from restaurant menu logic.
18. Walk-in sale with optional, POS-local customer reference; no dependency on
    hotel guests or restaurant customers.
19–22. Inventory, PMS/Charge-to-Room, Restaurant Management and Back Office
    boundaries — all optional, read-only or future.
23–33. Reporting sources, role/access model, server-first authorisation
    helpers, RLS shape, immutability rules, property currency reuse,
    property-timezone business date, and human-readable numbering.
34. Source-of-truth ownership table across Core, RM, Standalone POS, PMS and
    Back Office.
35. Implementation sequence 8H2 → 8H9, with any ordering correction the audit
    justifies.
36. Component and server/lib reuse audit, classifying each existing POS file
    as portable presentation or restaurant-coupled.
37. Blockers before 8H2.

## Technical notes

- Files created: `docs/standalone-pos-architecture.md`.
- Files edited: `docs/architecture-ownership.md` (ownership rows only).
- No runtime code, no migrations, no RLS, no route or navigation changes, so
  no build verification is required beyond confirming nothing else changed.
