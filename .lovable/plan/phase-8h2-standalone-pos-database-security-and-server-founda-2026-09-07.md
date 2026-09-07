# Phase 8H2 — Standalone POS database, security and server foundations

Backend only. No selling screen, no POS package UI, no changes to the restaurant till, Charge to Room, PMS cashiering or Back Office.

## What gets built

**A new, fully independent till backend** for the Standalone POS package: its own products and categories, its own registers, its own cashier shifts, and its own sales, payments and refunds. Nothing is shared with the restaurant till, which keeps working exactly as today.

**A new staff access key, "Standalone POS"**, separate from the existing restaurant till access. Owner, manager and cashier get it by default; waiters and kitchen do not. Turning the package on by itself still grants nobody anything.

**Server-side rules that cannot be bypassed from a browser.** Prices, tax and totals are always recalculated on the server from the POS catalog; a completed sale can never be edited, only refunded; every sale gets a unique tenant-local receipt number like `POS-000123`.

## Database work (one migration)

New tables, all keyed by property (`restaurant_id`), all with grants, row-level security and indexes:

- `pos_registers` — named tills, retired with an active flag, never deleted
- `pos_categories`, `pos_products` — POS-owned catalog; price and optional tax rate live on the product; SKU and barcode unique per property; retired with an active flag
- `pos_settings` — one row per property holding the default tax rate and inclusive/exclusive flag (see decision below)
- `pos_cashier_shifts` — open/closed, opening float, closing cash, expected cash, variance, business date; at most one open shift per register
- `pos_sales` — statuses `open`, `completed`, `voided`, `refunded`, `partially_refunded`; business date, currency snapshot, totals, receipt number assigned at completion
- `pos_sale_items` — immutable snapshots (name, SKU, unit price, tax rate, tax, discount, line total)
- `pos_payments` — append-only, split tender supported, methods cash/card/voucher/other, no room charge
- `pos_refunds` — append-only against completed sales, with remaining-refundable enforcement
- `pos_sale_counters` — per-property receipt counter

Security: signed-in staff can read only their own property's rows through the existing membership helper; no broad insert/update/delete for staff; no anonymous access at all; writes go through the server with the service role. Historical sales survive product, category and register retirement (no cascade deletes of sale history).

**Tax decision (deviation from the freeze):** the freeze suggested extending property settings; instead POS keeps its own `pos_settings` row, so POS tax never touches restaurant or hotel configuration. Rate source per line: product rate, else POS default, else zero — always snapshotted on the line.

**Numbering:** a dedicated per-property counter row, incremented atomically inside the completion transaction, with a unique constraint on (property, receipt number). Completely isolated from reservation numbering.

## Server work

- `src/lib/standalone-pos.server.ts` — access and mutation guards: signed-in person, property membership, `pos` package enabled, `standalone_pos` module access, permitted role. Fail-closed, no browser-supplied package identity.
- `src/lib/standalone-pos-pricing.server.ts` — the one canonical totals calculation (line tax, line total, sale subtotal/discount/tax/total, half-up rounding per line).
- `src/lib/standalone-pos.functions.ts` — server primitives: list/create/edit registers, categories and products; read POS settings; open/read/close a shift; open a sale, list open sales, read a sale; add/update/remove an open line; complete a sale; record a payment; void an open sale; refund a completed sale; list transactions.
- Sale completion runs as a database function so it is atomic: shift open, sale open, lines valid, totals recalculated, payments sufficient, receipt number allocated, sale marked completed exactly once.
- `standalone_pos` added to the module-access model (types, labels, role defaults, overridable list) without changing the meaning of the existing `pos` key. The existing staff-access screen renders keys from that registry, so it picks the new key up automatically.

## Checks before reporting done

Tenant isolation and anonymous access, the package/access matrix (package on + access, package on without access, package off with access, and each other package switched off), unique receipt numbers under rapid creation, a full server-side sale (catalog → shift → sale → priced line → payment → completion → immutability → partial refund), and regression on the restaurant till, restaurant orders and payments, Charge to Room, PMS cashiering, Back Office procurement/inventory/accounting and public ordering. All temporary test rows removed afterwards. Docs `standalone-pos-architecture.md` and `architecture-ownership.md` updated, then typecheck and production build.

Stops here — no POS package shell, selling screen, receipts, reports or inventory integration.
