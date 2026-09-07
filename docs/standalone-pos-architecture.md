# Standalone POS — architecture and current state

Status: **built and live** (8H2–8H8), audited and corrected in 8H9. The
current state of the package is described in the "Phase 8H9 — current state"
section at the end of this document; that section is authoritative.

Everything between here and that section is the original 8H1B design contract
plus a per-phase delivery record. Those sections are **historical**: statements
such as "not built yet" describe the moment that phase was written, not the
system today.

The existing restaurant till is unaffected by everything below.

---

## 1. Current Restaurant Management POS ownership (locked)

The live till stays exactly where it is:

| Item | Owner | Address / file |
| --- | --- | --- |
| Till screen | Restaurant Management | `/restaurant/restaurant-management/pos-sales` |
| Legacy till address | Restaurant Management | `/restaurant/pos/new` (redirect only) |
| Sale creation | Restaurant Management | `placePosSale` → `order-core.server.ts` |
| Pricing | Restaurant Management | `order-pricing.server.ts` (server-read prices) |
| Settlement | Restaurant Management | `record_pos_order_payment` RPC |
| Charge to Room | RM → PMS bridge | `room-charge.server.ts` / `.functions.ts` |

These tables remain **Restaurant Management property** and are never written
by Standalone POS: `menu_categories`, `menu_items`, `orders`, `order_items`,
`order_payments`, `cashier_shifts`.

### Current RM POS dependency graph

```text
pos-sales route
  └─ PosPage (pos-workspace.tsx)
       ├─ PosMenuPanel        → menu_items / menu_categories (RM catalog)
       ├─ PosSalePanel        → in-memory cart only
       ├─ PosPaymentDialog    → cash / card / room choice
       └─ pos.functions.ts
            ├─ getPosContext  → menu_categories, menu_items, cashier_shifts,
            │                   restaurant settings (currency, timezone)
            ├─ openPosShift   → open_cashier_shift RPC
            ├─ placePosSale   → order-pricing + order-core → orders/order_items
            └─ payPosSale     → record_pos_order_payment RPC → order_payments
       └─ ChargeToRoomDialog  → room-charge → PMS folios
  guards: pos.server.ts → module "pos" + requireRestaurantManagement
```

---

## 2. Package independence

Standalone POS is entitled by the `pos` package key alone.

| Packages | Result |
| --- | --- |
| POS on, RM off | Standalone POS works fully |
| POS on, PMS off | Standalone POS works fully (no room charge) |
| POS on, Back Office off | Standalone POS works fully (no stock posting) |
| POS off, RM on | Restaurant Management till works, Standalone POS blocked |
| POS on, RM on | Both tills coexist; separate catalogs and separate transactions |

No Standalone POS code path may call an RM, PMS or Back Office guard.

---

## 3. Frozen route family

`/restaurant/pos` currently contains only `new.tsx`, a redirect to the RM till.
There is no index route and no other child, so the namespace is **safe to
reclaim**. Reclaim condition: `/restaurant/pos/new` keeps redirecting to
`/restaurant/restaurant-management/pos-sales` and must not be captured by a
future `/restaurant/pos/$something` dynamic segment.

Frozen canonical family:

```text
/restaurant/pos                 launcher / home
/restaurant/pos/dashboard       today's takings, shift state
/restaurant/pos/sell            the till itself (full screen)
/restaurant/pos/catalog         POS products and categories
/restaurant/pos/transactions    sales list + sale detail + receipt
/restaurant/pos/shifts          register shifts, open/close, cash-up
/restaurant/pos/reports         sales, products, tenders, refunds
/restaurant/pos/settings        registers, tax defaults, receipt settings
```

Detail addresses: `/restaurant/pos/transactions/$saleId`,
`/restaurant/pos/shifts/$shiftId`.

---

## 4. Module key audit and decision

Today `pos` (in `MODULE_KEYS`) means *the restaurant till*: it is granted by
default to owner, manager, cashier and waiter, is overridable per staff member,
and is checked by `requirePosAccess` alongside `requireRestaurantManagement`.
`PACKAGE_MODULE_MAP.pos` also lists it, which is documentation only.

- Used by RM POS today: **yes**, exclusively.
- Already treated as standalone: **no**, only aspirationally in the map.
- Reusing it would be ambiguous: **yes** — every waiter would silently gain
  entry to the standalone till, and revoking standalone access would revoke
  the restaurant till.

**Decision:** introduce a new module key `standalone_pos` in 8H2. `pos` keeps
its current meaning. Migration: add the key, default it to owner/manager only,
make it overridable, and grant it to existing cashiers explicitly if a property
turns the package on. No data migration is needed because no property uses the
standalone package today.

---

## 5. Target domain model

All tables live in `public`, all carry `restaurant_id uuid not null references
restaurants(id) on delete cascade`, all carry `created_at timestamptz not null
default now()`, and mutable tables also carry `updated_at`. Every table gets
explicit GRANTs plus RLS in 8H2.

### pos_registers
Purpose: a named till. Fields: `id`, `restaurant_id`, `name`, `location_label`,
`active boolean default true`, `settings jsonb default '{}'`, timestamps.
Mutable. Soft-delete by `active = false` — never hard-deleted, because sales
reference it. A completed sale **must** reference a register.

### pos_categories
Purpose: grouping for the till grid. Fields: `id`, `restaurant_id`, `name`,
`sort_order int default 0`, `active boolean default true`, timestamps.
Mutable, soft-deleted by `active`.

### pos_products
Purpose: the authoritative POS catalog (see §6). Mutable, soft-deleted by
`active`.

### pos_cashier_shifts
See §12. Mutable while open, effectively immutable once closed.

### pos_sales
See §8/§9. Mutable while `open`; immutable once `completed`.

### pos_sale_items
Snapshot rows. Mutable only while the parent sale is `open`; immutable after.

### pos_payments
Append-only. Never updated except `status`; never deleted.

### pos_refunds
Append-only records against a completed sale. Never deleted.

`pos_product_prices`, `pos_receipts` and `pos_sale_events` are **not** created:
no effective-dated pricing, no legal numbering register and no audit-history
requirement is established today.

---

## 6. Catalog model (frozen)

```text
pos_products
  id                uuid pk
  restaurant_id     uuid not null → restaurants(id)
  category_id       uuid null → pos_categories(id) on delete set null
  name              text not null
  sku               text null            unique per restaurant when present
  barcode           text null            unique per restaurant when present
  description       text null
  unit_price        numeric(12,2) not null check (unit_price >= 0)
  tax_rate          numeric(5,2) null    null = use property default (§17)
  tax_inclusive     boolean not null default false
  cost_price        numeric(12,2) null   reference only, no accounting meaning
  active            boolean not null default true
  sort_order        int not null default 0
  created_at, updated_at
```

No variants, no modifiers, no option groups in v1. `menu_items` /
`menu_categories` are never read as the POS product source; an optional
one-way import is described in §21.

---

## 7. Price model decision

**Option A — price stored directly on `pos_products`.** There is no established
need for effective-dated pricing, multiple price lists, per-register pricing or
price history. Historical correctness is preserved by the sale-line snapshot
(§8), not by a price table. Option B stays available later without breaking the
sale model.

---

## 8. Sale transaction model

```text
pos_sales
  id                    uuid pk
  restaurant_id         uuid not null
  register_id           uuid not null → pos_registers(id)
  shift_id              uuid null → pos_cashier_shifts(id)   required to complete
  sale_number           bigint null      assigned on completion (§30)
  status                text not null    see §9
  business_date         date not null    property timezone (§29)
  subtotal              numeric(12,2) not null default 0
  discount_amount       numeric(12,2) not null default 0
  tax_amount            numeric(12,2) not null default 0
  total                 numeric(12,2) not null default 0
  currency_code         text not null    snapshot of property currency (§28)
  customer_reference    text null        §18
  note                  text null
  opened_by_membership_id   uuid not null → restaurant_users(id)
  completed_by_membership_id uuid null
  cashier_name_snapshot text null
  completed_at, voided_at, created_at, updated_at
```

```text
pos_sale_items
  id                    uuid pk
  restaurant_id         uuid not null
  sale_id               uuid not null → pos_sales(id) on delete cascade
  product_id            uuid null → pos_products(id) on delete set null
  product_name_snapshot text not null
  sku_snapshot          text null
  quantity              numeric(10,3) not null check (quantity > 0)
  unit_price_snapshot   numeric(12,2) not null
  tax_rate_snapshot     numeric(5,2) not null
  tax_amount            numeric(12,2) not null default 0
  discount_amount       numeric(12,2) not null default 0
  line_total            numeric(12,2) not null
  note                  text null
  created_at
```

Editing or deactivating a product never changes a historical receipt: every
figure printed comes from the snapshot columns.

---

## 9. Sale status model (frozen)

| Status | Meaning |
| --- | --- |
| `open` | Cart in progress, including a parked/suspended cart |
| `completed` | Fully paid and settled; immutable |
| `voided` | Abandoned **before** completion only |
| `refunded` | Completed sale fully refunded |
| `partially_refunded` | Completed sale with refunds totalling less than the sale |

`voided` applies **only** to an `open` sale. A completed sale is corrected by a
refund, never by a void. `refunded` / `partially_refunded` are derived by the
refund server function, never set by the browser.

---

## 10. Park / hold decision

**Option B — parked sales are persisted as `pos_sales` rows with status
`open`**, tied to the register and the opening cashier. A parked cart survives a
refresh, a device swap and a browser crash. Today's RM screen-local "Park here"
is explicitly *not* the model to carry forward. The sell screen lists open sales
for the current register so any cashier on that till can resume one.

---

## 11. Payment model

```text
pos_payments
  id               uuid pk
  restaurant_id    uuid not null
  sale_id          uuid not null → pos_sales(id)
  payment_method   text not null    cash | card | voucher | other
  amount           numeric(12,2) not null check (amount > 0)
  tendered_amount  numeric(12,2) null    cash only
  change_amount    numeric(12,2) not null default 0
  status           text not null    captured | voided
  reference        text null
  received_by_membership_id uuid not null → restaurant_users(id)
  created_at
```

`order_payments` is never reused. **Split tender is supported in v1**: a sale
may have several `captured` payment rows; the sale completes when the captured
total reaches the sale total. Rows are append-only; a mistaken payment is
marked `voided` by the server, never deleted.

---

## 12. Cashier shift model

```text
pos_cashier_shifts
  id, restaurant_id
  register_id      uuid not null → pos_registers(id)
  opened_by_membership_id  uuid not null
  opened_at        timestamptz not null default now()
  opening_float    numeric(12,2) not null default 0
  closed_by_membership_id  uuid null
  closed_at        timestamptz null
  closing_cash     numeric(12,2) null
  expected_cash    numeric(12,2) null   float + cash sales − cash refunds
  variance         numeric(12,2) null   closing_cash − expected_cash
  business_date    date not null
  status           text not null        open | closed
  notes            text null
```

At most one `open` shift per register (partial unique index). RM
`cashier_shifts` are untouched and stay RM-owned.

**A sale must belong to an open shift to be completed.** A cart may be opened
without one, but completion is refused with a plain message.

---

## 13. Register model

Narrow by design: name, location label, active flag, optional `settings` JSON
for receipt header text and default tax behaviour. No device registration, no
pairing codes, no hardware inventory. Every completed sale references a
register; the sell screen requires a register selection before it will open a
cart.

---

## 14. Receipt strategy

**Option A — receipts are rendered from immutable sale, sale-item and payment
data.** No `pos_receipts` table: nothing in the current requirement set demands
a legal receipt register or fiscal audit trail.

- Receipt number = the sale's `sale_number` (§30), shown as `POS-000123`.
- Reprint is free and unlimited; it re-renders the same snapshot data, so a
  reprint is byte-identical to the original.
- Reprints are **not** audited in v1. If a fiscal regime later requires it,
  add an append-only `pos_receipt_prints` table without touching the sale model.

---

## 15. Refund / void strategy

| Action | Applies to | Effect |
| --- | --- | --- |
| Clear cart | `open` sale, no payments | Lines removed; sale stays `open` |
| Void open sale | `open` sale | Status → `voided`, retained, never deleted |
| Void completed sale | — | **Not supported.** Use a refund |
| Full refund | `completed` | Refund covering every line; sale → `refunded` |
| Partial refund | `completed` | Refund for selected lines/amount; sale → `partially_refunded` |

**Option A — refund records linked to the original sale and payment.** Chosen
over reversal sales because it keeps one row per real-world transaction, makes
"what was refunded against this receipt" a direct lookup, and avoids negative
sales polluting product and tender reports.

```text
pos_refunds
  id, restaurant_id
  sale_id          uuid not null → pos_sales(id)
  payment_id       uuid null → pos_payments(id)
  shift_id         uuid null → pos_cashier_shifts(id)
  amount           numeric(12,2) not null check (amount > 0)
  method           text not null
  reason           text not null
  line_detail      jsonb null      refunded lines snapshot, optional
  refunded_by_membership_id uuid not null
  created_at
```

Completed sales are never deleted, and no completed row is edited except the
server-derived `status` transition to (partially) refunded.

---

## 16. Discount model

Minimum only — no promotions, coupons, happy hours or automatic rules.

- `pos_sale_items.discount_amount` (line level, absolute money).
- `pos_sales.discount_amount` (whole-sale level, absolute money).
- `pos_sales.discount_reason text null`.
- `pos_sales.discount_authorized_by_membership_id uuid null` — required by the
  server when a discount exceeds a configurable threshold; owner/manager only.

Percentage entry is a UI convenience; only the resolved money amount is stored.

---

## 17. Tax model

Tax configuration is taken from **package-neutral property settings**
(`restaurants` settings, the same source that supplies currency and timezone),
extended in 8H2 with a POS-neutral default rate and inclusive/exclusive flag if
one is not already present. POS tax is never derived from restaurant menu
logic, which has no tax at all today.

- Source order per line: product `tax_rate` → property default rate → 0.
- Snapshot on every line: `tax_rate_snapshot`, `tax_amount`, plus the sale's
  `tax_amount` total.
- Rounding: compute per line, round each line to 2 decimals in the property
  currency, then sum. The sale total is the sum of rounded line totals, so the
  printed receipt always adds up. Rounding rule is half-up.

No existing calculation is modified in this phase.

---

## 18. Customer model

v1 is **walk-in first**: a sale completes with no customer record at all.
`pos_sales.customer_reference text null` holds an optional free-text label
(a name or phone the cashier types) for receipts. No foreign key to PMS guest
profiles or restaurant customers, and no customer table of its own. Future
linkage (loyalty, guest lookup, room charge) would add a nullable reference
column plus an explicit bridge, never a hard dependency.

---

## 19. Inventory boundary

- POS only → a sale completes with **no** stock posting. Inventory is never
  required for the till to work.
- POS + Back Office → a future *optional* mapping from `pos_products` to
  inventory items, posting consumption after completion.

Not built in 8H2. Never mandatory.

---

## 20. PMS boundary

Current bridge (unchanged): RM's `ChargeToRoomDialog` → `room-charge.functions`
→ `post_order_room_charge`, requiring the order to be served and both
`restaurant_management` and `pms` enabled. It is bound to `orders`.

Charge to Room is **not** part of Standalone POS v1. To add it later:
a POS-specific posting function against `pos_sales` (not `orders`), a folio
lookup restricted to in-house reservations, a `pos_payments` row with method
`room` plus folio/reservation reference columns, a reversal path mirroring
`reverse_order_room_charge`, and a both-packages-enabled guard.

---

## 21. Restaurant Management boundary

RM POS and Standalone POS stay separate products. Nothing authoritative is
shared: not the catalog, not sales, not payments, not shifts. The only future
bridge considered is a **one-way, one-time copy** of selected `menu_items` into
`pos_products` (an import button producing ordinary POS rows with no link back).
No sync, no mirroring, no shared writes.

---

## 22. Back Office boundary

Back Office may later **read** POS sales summaries, payment summaries, cashier
activity and refunds, exactly as its Accounting & Finance page reads other
sources today: live queries against the owning tables, labelled by package. No
copied rows, no POS transaction ownership, no POS mutations from Back Office.

---

## 23. Reporting sources

Authoritative and only: `pos_sales`, `pos_sale_items`, `pos_payments`,
`pos_cashier_shifts`, `pos_refunds`. Future reports: sales by day/hour, product
performance, tender mix, cashier shift and cash-up, refunds and voids. Not
built now.

---

## 24. Role / access model

Access requires **all three**:

1. `pos` package enabled for the property, **and**
2. `standalone_pos` module access for the person, **and**
3. a permitted role.

Roles: `owner`, `manager`, `cashier`. `waiter` is deliberately excluded — the
waiter's till is the restaurant one. `accountant` gets read-only reports and
transactions, never the sell screen or refunds. Refunds, discounts above the
threshold and shift close with a variance require `owner` or `manager`.
Package entitlement alone grants nothing.

---

## 25. Server authorization model

Two helpers in a new `standalone-pos.server.ts`:

```text
requireStandalonePosAccess(context, restaurantId)    → read/entry
requireStandalonePosMutation(context, restaurantId)  → any write
```

Both re-derive membership from the authenticated caller, check module
`standalone_pos`, check the role list, and check the `pos` package via the
existing entitlement resolver. A restaurant id from the browser only selects
which membership applies. Mutations additionally validate the register, the
open shift, sale ownership by the tenant and the sale's current status before
writing. Prices, tax and totals are always recomputed server-side from
`pos_products`; browser-supplied money is never trusted. No browser-direct
database writes.

---

## 26. RLS model (to implement in 8H2)

For every POS table: `GRANT` first, then `ENABLE ROW LEVEL SECURITY`, then
policies.

- `authenticated`: `SELECT` restricted to rows whose `restaurant_id` matches an
  active membership of `auth.uid()`, via the existing security-definer
  membership helper. No recursive policy lookups.
- Writes: performed by server functions through the service role after the
  guards in §25. No broad `INSERT`/`UPDATE`/`DELETE` policy for
  `authenticated`; `DELETE` is granted to nobody on transactional tables.
- `service_role`: `GRANT ALL`.
- `anon`: no grant, no policy. There is no public Standalone POS surface.

---

## 27. Transaction immutability rules

1. A `completed` sale is never silently edited. The only permitted change is a
   server-derived status transition to `refunded` / `partially_refunded`.
2. Every historical sale keeps its own snapshots: product name, SKU, unit
   price, tax rate and amount, discount, cashier name, register, timestamps
   and currency.
3. Corrections are explicit: void (open sales) or refund (completed sales).
4. Payments and refunds are append-only.
5. Nothing transactional is hard-deleted; catalog rows are retired with
   `active = false`.

---

## 28. Currency

Reuse the property's configured currency — `restaurants.currency_code`, read
server-side through the existing restaurant settings loader and formatted with
`formatMoney` from `src/lib/restaurant-time.ts`. Each sale stores
`currency_code` as a snapshot so an old receipt still prints correctly if the
property changes currency. GBP is never hardcoded.

---

## 29. Timezone and business date

Sales carry **both** `created_at` (timestamptz, real instant) and
`business_date` (date). The business date is computed server-side from
`restaurants.timezone` (IANA), using the same property-aware helpers already
used by cashiering and night audit. The browser timezone is never a source of
truth. Shift close and all daily reports group by `business_date`.

---

## 30. Human-readable numbering

Primary keys stay UUIDs. In addition, a completed sale receives `sale_number`,
a **tenant-local** monotonic integer assigned inside the completion transaction
by a database-side counter row per restaurant (`SELECT ... FOR UPDATE` or a
dedicated counter table, the same shape used for reservation confirmation
numbers). Displayed as `POS-000123`.

- Assigned on completion only — parked and voided carts never consume a number.
- Register-aware numbering (`POS-2-000123`) is possible later by adding a
  per-register counter; the column layout already allows it.
- Not implemented in this phase.

---

## 31. Current POS component reuse audit

| File | Class | Reuse verdict |
| --- | --- | --- |
| `src/components/pos/pos-menu-panel.tsx` | A + B | Layout, search, category chips and tile grid are portable presentation; it is typed to `PosMenuItem` from `pos.functions`. Reuse by copying with a POS-product type. |
| `src/components/pos/pos-sale-panel.tsx` | A | Fully portable: cart lines, quantity steppers, totals, park/void buttons. Owns no data access. Best reuse candidate. |
| `src/components/pos/pos-payment-dialog.tsx` | A + F | Cash keypad, quick tenders and change display are portable; the `room` choice and `canChargeRoom` prop are Charge-to-Room specific and are dropped for v1. |
| `src/components/workspaces/restaurant/pos-workspace.tsx` | B + C + D + E | Orchestrates RM catalog, RM orders, RM payments and RM shifts. Not reusable; Standalone POS gets its own workspace. |
| `src/components/orders/charge-to-room-dialog.tsx` | F | Out of scope for v1. |

No file is moved, renamed or edited in this phase.

---

## 32. Server / lib reuse audit

| Helper | Class | Verdict |
| --- | --- | --- |
| `formatMoney`, timezone/business-date helpers (`restaurant-time.ts`, `reservation-dates.ts`) | Package-neutral | **Reuse as-is** |
| `getRestaurantSettings`, `displayName` (`workforce.server.ts`) | Package-neutral | **Reuse as-is** |
| `requireModuleAccess`, `requireModuleRole` (`module-access.server.ts`) | Core | **Reuse as-is** |
| Package entitlement resolver (`package-entitlements.server.ts`) | Core | **Reuse** with key `pos` |
| `posError` message map (`pos.server.ts`) | Mostly neutral | Copy the pattern; codes differ |
| `requirePosAccess` / `requirePosOperator` | RM-specific (calls `requireRestaurantManagement`) | **Do not reuse** |
| `order-pricing.server.ts` / `order-core.server.ts` | RM order logic | **Do not reuse** |
| `record_pos_order_payment`, `open_cashier_shift` RPCs | RM payment / shift logic | **Do not reuse** |
| `room-charge.server.ts` | RM→PMS bridge | Out of scope for v1 |
| Tax helpers | None exist | Must be written fresh (§17) |

No refactor performed in this phase.

---

## 33. Route conflict decision

- Today under `/restaurant/pos/*`: only `new.tsx`, which redirects to
  `/restaurant/restaurant-management/pos-sales` (signed out → login with a
  redirect back to the RM till).
- No index route, no layout route, no other child exists at `/restaurant/pos`.
- **`/restaurant/pos` is safe to reclaim.** Conditions before reclaiming, in
  8H2: add `/restaurant/pos/route.tsx` as a package-guarded layout, keep
  `new.tsx` untouched so the RM bookmark still resolves, and avoid any dynamic
  child segment directly under `/restaurant/pos` that would swallow `new`.
- Nothing is changed now.

---

## 34. Source-of-truth ownership table

| Domain | Owner | Tables / surfaces |
| --- | --- | --- |
| Tenant, auth, property identity, memberships, module access | **Core** | `profiles`, `restaurants`, `restaurant_users`, `staff_module_access`, package entitlements |
| Restaurant menu and ordering | **Restaurant Management** | `menu_categories`, `menu_items`, `orders`, `order_items`, `order_payments`, `cashier_shifts` |
| Standalone till (proposed) | **Standalone POS** | `pos_registers`, `pos_categories`, `pos_products`, `pos_cashier_shifts`, `pos_sales`, `pos_sale_items`, `pos_payments`, `pos_refunds` |
| Hotel billing | **PMS** | folios, folio transactions, reservations, night audit |
| Cross-package consolidation | **Back Office** | read-only views over the owners above; owns no POS rows |

---

## 35. Frozen 8H implementation sequence

| Phase | Scope |
| --- | --- |
| 8H1A | RM POS truth/UX cleanup — **complete** |
| 8H1B | This architecture freeze — **complete** |
| 8H2 | Tables, GRANTs, RLS, generated types, `standalone_pos` module key, server guards |
| 8H3 | Catalog (categories, products) and POS settings incl. tax defaults |
| 8H4 | Registers and cashier shifts (open, close, cash-up, variance) |
| 8H5 | Sell screen: cart, parked sales, completion, payments incl. split tender |
| 8H6 | Transactions list, sale detail, receipts, voids and refunds |
| 8H7 | POS dashboard and reports |
| 8H8 | Optional Back Office read bridge and optional PMS room-charge bridge |
| 8H9 | Legacy route and ownership cleanup |

One ordering note: 8H4 must precede 8H5 because a sale cannot be completed
without an open shift on a register (§12/§13). The rest of the sequence stands
as proposed.

---

## 36. Blockers before 8H2

1. **Property tax settings.** No package-neutral tax rate exists on the
   property today. 8H2 must add a neutral default rate plus an
   inclusive/exclusive flag to property settings, or 8H3 must ship it before
   §17 can be honoured.
2. **`standalone_pos` module key.** Must be added to `MODULE_KEYS`,
   `MODULE_LABELS`, `ROLE_MODULES` (owner/manager) and `OVERRIDABLE_MODULES`
   in the same change as the guards, or the guards deny everyone.
3. **Package enforcement for `pos`.** The `pos` package key is currently
   enforced nowhere; 8H2 must wire it through the existing entitlement
   resolver, including the compatibility default (absent row = enabled), and
   confirm the desired behaviour for properties that have never been sold POS.
4. **Tenant-local sequence helper.** Confirm whether the reservation
   confirmation-number counter can be generalised or whether POS needs its own
   counter table.

None of these blocks the freeze itself.

## Phase 8H2 — implemented foundation (backend only)

The freeze above is now backed by real tables and server code. No selling UI
exists yet, and the Restaurant Management till at
`/restaurant/restaurant-management/pos-sales` is unchanged.

Migrations: `0030_standalone_pos_foundation.sql`,
`0031_fix_pos_complete_sale_cashier_name.sql`.

Tables (all tenant-scoped by `restaurant_id`, RLS on, no anonymous access,
read-only for `authenticated` staff, all writes via service role behind server
guards): `pos_registers`, `pos_categories`, `pos_products`, `pos_settings`,
`pos_cashier_shifts`, `pos_sales`, `pos_sale_items`, `pos_payments`,
`pos_refunds`, `pos_sale_counters`.

Deviations from the 8H1B freeze:
- POS keeps its own `pos_settings` row (default tax rate, inclusive flag)
  instead of a property-neutral tax setting, which does not exist. POS tax
  therefore never depends on restaurant or hotel configuration.
- Receipt numbering uses a dedicated `pos_sale_counters` row per property,
  not the reservation counter.

Server code:
- `src/lib/module-access.ts` — new `standalone_pos` module key, role lists.
- `src/lib/standalone-pos.server.ts` — access/mutation/manager guards
  (membership + `pos` package + `standalone_pos` module + role) and error
  translation. Fail-closed.
- `src/lib/standalone-pos-pricing.server.ts` — the single canonical money
  calculation (line and sale totals, inclusive/exclusive tax, half-up
  rounding).
- `src/lib/standalone-pos.functions.ts` — settings, registers, categories,
  products, shifts, sales, lines, payments, completion, refunds,
  transactions.
- `public.pos_complete_sale` / `public.pos_refund_sale` — SECURITY DEFINER,
  service-role only; completion recalculates totals, requires an open shift
  and sufficient captured payment, allocates the receipt number and finalises
  in one transaction. Completed sales are immutable (`POS_SALE_IMMUTABLE`).

Not built yet: POS shell and routes, catalog/register/shift screens, the sell
screen, receipts, reports, inventory and Charge to Room bridges.

## Phase 8H3 — package shell, catalog and settings (implemented)

Delivered:

- `src/lib/standalone-pos-modules.ts` — registry of the seven POS sections with
  an honest status per section (`live`, `foundation`, `next`, `blocked`).
- Canonical routes now exist: `/restaurant/pos` (home), `/catalog`, `/settings`
  (working) and `/dashboard`, `/transactions`, `/shifts`, `/reports`
  (foundation pages that state plainly they are not built). There is no
  `/restaurant/pos/sell` route — selling cannot be reached.
- `src/components/workspaces/standalone-pos/*` — home, catalog, settings,
  foundation page and shared header/notices.
- `RestaurantShell` gained a `posModule` prop: a POS-only sidebar plus a
  `Standalone POS · <module>` context label. Property Home shows a POS tile
  gated by the `pos` package entitlement AND the `standalone_pos` module key.
- Route guard: sign-in check then `requireRoutePackage("pos")`. Server
  functions keep their own 8H2 guards (membership + package + module + role).
- Roles: owner/manager can change catalog and settings; cashier and accountant
  see them read-only. Hiding controls is never the only protection.
- Catalog reads and writes only `pos_categories` / `pos_products`. No
  restaurant menu table is imported and there is no menu fallback. Products and
  categories are deactivated, never deleted.
- New read `getPosOverview` returns readiness counts only (categories,
  products, active products, registers, active registers, open shifts). No
  sales figures, because there are no sales yet.
- No database changes were required.

Deferred to 8H4+: registers, cashier shifts, the sell screen, payments,
transactions browser, receipts, refunds, reports, and the optional inventory
and Charge to Room bridges.

## Phase 8H4 — Registers and cashier shifts (implemented)

- A register is a named till in one property (`pos_registers`: name, optional
  location label, active). Names are unique per property. No codes, no
  hardware pairing.
- Only owner/manager create, edit, activate or deactivate registers. A
  register with an open cashier shift cannot be deactivated; the shift must be
  closed and counted first. Shifts are never closed implicitly.
- A cashier shift (`pos_cashier_shifts`) is opened on an active register with
  an opening float, and stamped with the property-timezone business date.
  Uniqueness is one open shift per register; a person may hold shifts on more
  than one register.
- Expected cash = opening float + captured cash payments − cash refunds for
  that shift, computed server-side. Variance = counted cash − expected cash.
  The browser never derives any of these.
- Closed shifts are terminal: no edit path exists. Corrections require an
  audited adjustment, which is not built.
- Selling readiness (`posSellReadiness`) requires the POS package, the
  `standalone_pos` module, a permitted role, an active register and an open
  shift held by that person. Phase 8H5 consumes it.

Routes: `/restaurant/pos/registers` (setup) and `/restaurant/pos/shifts`
(open/close/history). Both guarded by sign-in plus the `pos` package; the
server functions re-check membership, package, module and role.

## Phase 8H5 — Sell screen (live)

Route `/restaurant/pos/sell` (`posModule: "sell"`, registry status `live`).

- `getPosSellContext` resolves the caller's own open shift (never nominated by
  the browser), fetches-or-creates the working open sale on that shift, and
  returns lines, tenders, server totals and other open sales on the register.
  A double click cannot fan out into two open sales.
- Cart edits reuse `addPosSaleItem` / `updatePosSaleItem` / `removePosSaleItem`;
  prices and tax always come from `pos_products` + `pos_settings`.
- Tenders use `recordPosPayment`; a mis-keyed tender can be dropped with
  `removePosPayment` while the sale is still open.
- `completePosSale` is idempotent: a retry returns the receipt already issued
  rather than allocating a second number.
- The receipt panel renders from the completed sale's own data; printing uses
  the browser print dialog. Refunds, reprints and reports remain 8H6.

## Phase 8H6 — Transactions, receipt reprint, refunds (live)

Routes `/restaurant/pos/transactions` (list) and
`/restaurant/pos/transactions/:saleId` (detail). Registry status `live`.
Both guarded by sign-in plus the `pos` package; every server function
re-checks membership, package, module and role.

### Transaction lifecycle

open → completed (receipt number issued) → partially_refunded → refunded.
`voided` belongs to the open-sale lifecycle only; a completed sale can never
be voided or deleted, and there is no completed-sale "Void" action anywhere in
the UI. Corrections are refunds.

### Reads

`listPosTransactions` reads `pos_sales` for this property only, with filters
for receipt number, business-date range, status, register, cashier and tender
method, plus register/cashier names, a tender summary and the remaining
refundable amount. `getPosSale` returns the completed snapshots, per-tender
refundable balances and the refund history. Neither ever reads Restaurant
Management orders or PMS folios. Read roles: owner, manager, cashier,
accountant. There is no public receipt lookup and no anonymous access.

### Receipt reprint

`ReceiptView` is the single renderer used by both the sell screen and the
transaction detail. It renders from `pos_sales` / `pos_sale_items` /
`pos_payments` snapshots; there is no second receipt-body store. Reprint
changes nothing — same number, same totals, same status — and it is
**presentation-only**: no reprint audit event is recorded, because no suitable
audit structure exists for POS and this phase did not create one.

### Refund semantics

`refundPosSale` (owner/manager only) calls `pos_refund_sale_allocated`, which
in one locked transaction:

- refuses anything other than a `completed` / `partially_refunded` sale;
- requires the refund to name a captured payment on that sale
  (`POS_REFUND_PAYMENT_MISMATCH`);
- caps the refund at the amount still refundable on that tender
  (`POS_REFUND_EXCEEDS_PAYMENT`) and on the sale
  (`POS_REFUND_EXCEEDS_REMAINING`);
- takes the refund method from the payment, never from the browser;
- writes `pos_refunds` with `authorized_by_membership_id` and
  `processed_by_membership_id`;
- moves the sale to `partially_refunded` or `refunded` and updates
  `refunded_amount`. Original totals and payment rows are never rewritten.

`SELECT ... FOR UPDATE` on the sale serialises racing or double-clicked
refunds, so the caps hold under concurrency.

### Split-tender refund policy

Allocation is **payment-specific and explicit**: the person choses which
original tender the money returns on, and the per-tender cap is enforced by
the database. Nothing is auto-allocated or split by the backend.

### Card refunds

NORU has no payment-gateway integration. A card refund row is an internal POS
record only; no funds move through a card network. The refund dialog says so.

### Cash impact and shifts

Cash refunds require an open shift belonging to the person processing them
(`POS_REFUND_SHIFT_REQUIRED`), resolved server-side — the browser never
nominates a shift. The refund's cash impact lands on that shift, even when the
original sale's shift is long closed; closed shifts are never rewritten or
backdated. Non-cash refunds carry no shift and no drawer impact. Expected cash
stays: opening float + captured cash payments − cash refunds for that shift.

### Roles

Owner/manager: read, reprint, refund. Cashier and accountant: read and
reprint, no refund. The server is authoritative; the UI only hides what the
server would refuse.

## Phase 8H7 — Dashboard and reporting

Standalone POS reports on itself. Every figure on `/restaurant/pos/dashboard`
and `/restaurant/pos/reports` comes from one aggregation
(`src/lib/standalone-pos-reporting.server.ts`, `buildPosReport`), exposed by
`getStandalonePosDashboard` and `getStandalonePosReport`, so the two screens
can never disagree.

Sources, and nothing else: `pos_sales`, `pos_sale_items`, `pos_payments`,
`pos_refunds`, `pos_cashier_shifts`, `pos_registers` — all scoped by
`restaurant_id`. Never Restaurant Management `orders` / `order_items` /
`order_payments`, never the restaurant's own `cashier_shifts`, never PMS
folios. POS reporting therefore works with every other package switched off.

Frozen definitions:

- Gross = sum of `pos_sales.total` for status `completed`,
  `partially_refunded`, `refunded`.
- Refunds = sum of `pos_refunds.amount`, attributed to the business date of
  the original sale so gross, refunds and net always reconcile in one range.
- Net POS sales = gross − refunds. Original sale totals are never rewritten.
- Average sale = gross ÷ counted sale count.
- Expected cash = opening float + captured cash tenders − cash refunds, the
  same rule as `expectedCashFor` in the shift screens.

Behaviour:

- Parked (`open`) sales are shown separately and excluded from every total;
  `voided` sales are excluded entirely.
- Tender figures are recorded till activity, never bank settlement. Each part
  of a split tender is counted once against its own method.
- Product figures come from line snapshots (`product_name_snapshot`,
  `sku_snapshot`, `line_total`), so renaming or repricing a product never
  rewrites history. There is no category snapshot on a sale line, so
  historical category reporting is deliberately not offered.
- Refunds cannot be attributed to individual lines: they are recorded against
  a sale and a tender, and the screens say so.
- Date scope is always the property's own business date (property timezone),
  never the browser's date.
- Read access follows `requireStandalonePosAccess` (owner, manager, cashier,
  accountant). Reporting adds no mutations and no schema changes.
- CSV export is deferred: the project has no export pattern to reuse.

Deviation from the plan: the six planned per-section server functions were
implemented as two (`getStandalonePosDashboard`, `getStandalonePosReport`)
over one shared aggregation — same formulas in one place, one round trip per
screen instead of six.

## Phase 8H8 — cross-package integration (implemented)

Back Office consumes Standalone POS as a **read-only source**:

- `src/lib/back-office-pos.functions.ts` exposes `getBackOfficePosSummary`,
  reusing the POS-owned aggregation in `standalone-pos-reporting.server.ts`.
- Back Office Accounting shows a POS source card (gross, refunds against
  today's receipts, net, receipt count, refunds processed today, open shifts,
  tender split) and a link to POS Reports.
- Back Office Reports shows POS gross / net / receipts / refunds as labelled
  source figures and a POS reporting-source card.

Constraints: no copied tables, no writes, no database change, no combined
cross-package total, exact reconciliation with `/restaurant/pos/reports`.

Inventory depletion and POS → folio Charge to Room remain **deferred**
(see the ownership doc for the reasoning); nothing about the RM Charge to Room
bridge changed.
