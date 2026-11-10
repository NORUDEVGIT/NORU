# NORU PMS — High-Level Domain ERD: Notes (NORU-DB-ARCH-03)

Companion to `noru-pms-high-level.mmd` (primary), `noru-pms-high-level.dbml`, and the rendered `noru-pms-high-level.svg`.

- **Source of truth.** Live Supabase FK metadata for project `qcwptraosaudcbjasmul`, read on 2026-11-10 from `pg_constraint`, `pg_attribute` and `pg_index`. Ownership, domain and scope come from `noru-db-architecture-catalogue.md` and `noru-db-architecture-review.md` (ARCH-01 and ARCH-02).
- **Scope.** The 22 approved anchor tables only. The other 275 tables appear only where noted, as named bridges; they are never drawn.
- **Rule.** A relationship is drawn only when a deployed FK supports it. No relationship in this ERD depends on an ARCH-02 soft relationship. The one indirect line (inventory ↔ purchase orders) is backed by two deployed FKs on the bridge table `purchase_order_items`.

## 1. Anchor validation (22/22 present)

All 22 anchors exist in the deployed `public` schema, and each has the primary key `id uuid`.

| # | Table | Business label | PK | Important FKs (deployed, anchor-to-anchor) | Owner | Domain group | Scope |
|---|---|---|---|---|---|---|---|
| 1 | `restaurants` | Property (Tenant) | `id` | — (root) | Property Core | PROPERTY / STAFF | SHARED |
| 2 | `restaurant_users` | Staff Membership | `id` | `restaurant_id` | HR / Staff | PROPERTY / STAFF | SHARED |
| 3 | `staff_shifts` | Staff Rota Shift | `id` | `staff_membership_id` | HR / Staff | PROPERTY / STAFF | SHARED |
| 4 | `guest_profiles` | Guest Profile | `id` | `restaurant_id` (+5 actor FKs → `restaurant_users`) | Guest Profile | GUESTS | PMS |
| 5 | `guest_account_masters` | Company / Group / Travel Agent | `id` | `primary_contact_guest_id` | Guest Profile | GUESTS | PMS |
| 6 | `hotel_reservations` | Reservation Header | `id` | `guest_id`, `booker_guest_id`, `company_master_id`, `group_account_master_id`, `travel_agent_master_id` (+ header copies `room_type_id`, `room_id`, `rate_plan_id`) | Reservations | RESERVATIONS | PMS |
| 7 | `hotel_reservation_rooms` | Stay Unit | `id` | `reservation_id`, `room_type_id`, `room_id`, `rate_plan_id` | Reservations | RESERVATIONS | PMS |
| 8 | `room_types` | Room Type | `id` | `restaurant_id` | Rooms & Inventory | ROOMS / OPERATIONS | PMS |
| 9 | `hotel_rooms` | Physical Room | `id` | `room_type_id` | Rooms & Inventory | ROOMS / OPERATIONS | PMS |
| 10 | `housekeeping_tasks` | Housekeeping Task | `id` | `room_id`, `assigned_membership_id` | Housekeeping | ROOMS / OPERATIONS | PMS |
| 11 | `night_audit_runs` | Night Audit Run | `id` | `started_by_membership_id`, `closed_by_membership_id` | Night Audit | ROOMS / OPERATIONS | PMS |
| 12 | `guest_folios` | Guest Folio | `id` | `guest_id`, `reservation_id` | Cashiering | CASHIERING / FINANCE | PMS |
| 13 | `folio_transactions` | Ledger Line | `id` | `folio_id`, `financial_account_id`, `reservation_room_id`, `hotel_cashier_shift_id`, `posted_by_membership_id` | Cashiering | CASHIERING / FINANCE | PMS |
| 14 | `financial_accounts` | AR / Master Billing Account | `id` | `master_id` | Cashiering | CASHIERING / FINANCE | PMS |
| 15 | `hotel_cashier_shifts` | Cashier Drawer Shift | `id` | `membership_id` | Cashiering | CASHIERING / FINANCE | PMS |
| 16 | `pms_taxes` | PMS Tax Definition | `id` | `restaurant_id` only | Taxes & Fees | RATES / TAX | PMS |
| 17 | `hotel_rate_plans` | Rate Plan | `id` | `room_type_id` | Rate & Revenue | RATES / TAX | PMS |
| 18 | `guest_folio_invoices` | Issued Guest Invoice | `id` | `folio_id` | Fiscal / Invoicing | INVOICING / FISCAL | PMS |
| 19 | `fiscal_registrations` | Fiscal Registration | `id` | `restaurant_id` only (`source_id` is polymorphic and has no FK) | Fiscal / Invoicing | INVOICING / FISCAL | PMS |
| 20 | `distribution_channels` | Distribution Channel | `id` | `restaurant_id` only | Distribution | DISTRIBUTION | PMS |
| 21 | `inventory_items` | Stock Item | `id` | `restaurant_id` (→ `purchase_orders` via the `purchase_order_items` bridge) | Inventory / Procurement | INVENTORY / PROCUREMENT | SHARED |
| 22 | `purchase_orders` | Purchase Order | `id` | `restaurant_id` (→ `inventory_items` via the `purchase_order_items` bridge) | Inventory / Procurement | INVENTORY / PROCUREMENT | SHARED |

Missing anchors: none. No replacements were invented.

## 2. Cardinality method

- **Optionality.** A relationship is "exactly one parent" (`||`) when the child FK column is `NOT NULL`, and "zero or one" (`|o`) when it is nullable. `restaurant_id` is excluded from the nullability test, because it is always `NOT NULL` and only scopes the tenant.
- **Uniqueness.** A child side is "at most one" (`o|`) only when a full (non-partial) unique index covers the FK columns, or when a partial unique index covers every non-null FK value.
- **Partial uniques that do not change cardinality.** Indexes such as "max one open per …" leave the overall relationship one-to-many. They are recorded as notes:
  - `housekeeping_tasks_one_open_per_room`
  - `hotel_cashier_shifts_one_open`
  - `guest_folio_invoices_legacy_folio_unique`
- **Composite tenant FKs.** FKs of the form `(x_id, restaurant_id)` → `(id, restaurant_id)` are shown as a single relationship on `x_id`. Both FKs to `hotel_rooms` are three-column FKs, `(room_id, restaurant_id, room_type_id)`, which forces the assigned room to match the booked room type.
- **Safe defaults where unsure.** For reservation → stay unit, the FK allows a header with zero units. The ERD therefore uses `||--o{` rather than `||--|{`. The application and RPC layer always creates at least one unit, but the FK does not enforce it.

## 3. Relationship register (34 drawn lines, 37 DBML refs)

Key: **FK** = deployed constraint name. **Tenant** = composite `(x_id, restaurant_id)` FK. ON DELETE values: `a` no action, `c` cascade, `n` set null.

### 3.1 Property tenant roots (10)

Every child anchor has `restaurant_id NOT NULL → restaurants(id) ON DELETE CASCADE`. Only the roots of each domain are drawn. The other 11 tenant FKs are deployed but left implicit to avoid a dense web: `staff_shifts`, `hotel_reservations`, `hotel_reservation_rooms`, `hotel_rooms`, `housekeeping_tasks`, `guest_folios`, `folio_transactions`, `financial_accounts`, `hotel_cashier_shifts`, `hotel_rate_plans` and `guest_folio_invoices`.

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| T1 | `restaurants` | `restaurant_users` | `restaurant_users_restaurant_id_fkey` | 1:N | child requires parent | A property employs staff memberships. |
| T2 | `restaurants` | `guest_profiles` | `guest_profiles_restaurant_id_fkey` | 1:N | required | Guest identities are property-scoped. |
| T3 | `restaurants` | `guest_account_masters` | `guest_account_masters_restaurant_id_fkey` | 1:N | required | Company, group and agent masters are property-scoped. |
| T4 | `restaurants` | `room_types` | `room_types_restaurant_id_fkey` | 1:N | required | The property defines its room types. |
| T5 | `restaurants` | `night_audit_runs` | `night_audit_runs_restaurant_id_fkey` | 1:N | required | One run per business date per property. |
| T6 | `restaurants` | `pms_taxes` | `pms_taxes_restaurant_id_fkey` | 1:N | required | The property's PMS tax catalogue. |
| T7 | `restaurants` | `distribution_channels` | `distribution_channels_restaurant_id_fkey` | 1:N | required | Connected channel-manager channels. |
| T8 | `restaurants` | `fiscal_registrations` | `fiscal_registrations_restaurant_id_fkey` | 1:N | required | The property's fiscal outbox. |
| T9 | `restaurants` | `inventory_items` | `inventory_items_restaurant_id_fkey` | 1:N | required | Stock items held by the property. |
| T10 | `restaurants` | `purchase_orders` | `purchase_orders_restaurant_id_fkey` | 1:N | required | Purchase orders raised by the property. |

### 3.2 Guests → Reservations (3 lines, 5 FKs)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| G1 | `guest_profiles` | `hotel_reservations` | `hotel_reservations_guest_same_property` (Tenant, `a`) | 1:N | `guest_id` NOT NULL | Primary guest of a booking. **Cross-domain: guest ↔ reservation.** |
| G2 | `guest_account_masters` | `hotel_reservations` | `hotel_reservations_company_master_same_property`, `…_group_account_master_same_property`, `…_travel_agent_master_same_property` (Tenant, `a`) | 0..1:N (×3) | all nullable | Company, group-account and travel-agent attribution. Drawn as one Mermaid line and as 3 DBML refs. |
| G3 | `guest_profiles` | `guest_account_masters` | `guest_account_masters_primary_contact_guest_fk` (Tenant, `n`) | 0..1:N | nullable | The primary contact person of a company or group master. |

Not drawn, but deployed: `hotel_reservations_booker_guest_same_property`. It is an optional second guest role (the booker) and is omitted to keep one clear guest ↔ reservation line.

### 3.3 Reservation → Stay Unit → Room / Room Type / Rate Plan (6)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| R1 | `hotel_reservations` | `hotel_reservation_rooms` | `hotel_reservation_rooms_reservation_same_property` (Tenant, `c`) | 1:N | `reservation_id` NOT NULL. The header may have 0 units at FK level; see §2. | The header (booking aggregate) contains stay units. `(reservation_id, unit_sequence)` is unique. **Cross-domain: reservation ↔ room unit.** |
| R2 | `room_types` | `hotel_reservation_rooms` | `hotel_reservation_rooms_type_same_property` (Tenant, `a`) | 1:N | NOT NULL | Booked room type per unit. |
| R3 | `hotel_rooms` | `hotel_reservation_rooms` | `hotel_reservation_rooms_room_same_type` (3-col, `a`) | 0..1:N | nullable until assignment | Physical room assigned to the unit; it must match the unit's room type. **Cross-domain: room unit ↔ room.** |
| R4 | `hotel_rate_plans` | `hotel_reservation_rooms` | `hotel_reservation_rooms_rate_plan_same_property` (Tenant, `a`) | 0..1:N | nullable | Rate plan pricing the unit. **Cross-domain: rate plan ↔ reservation.** |
| R5 | `room_types` | `hotel_rooms` | `hotel_rooms_type_same_property` (Tenant, `a`) | 1:N | NOT NULL | Each room belongs to one type. |
| R6 | `room_types` | `hotel_rate_plans` | `hotel_rate_plans_type_same_property` (Tenant, `a`) | 1:N | NOT NULL | Each rate plan sells one room type. |

Header-copy FKs are deployed but not drawn, following the ARCH-02 ownership rule that the unit is the lifecycle source and the header is derived:

- `hotel_reservations_type_same_property` (`room_type_id`)
- `hotel_reservations_room_same_type` (`room_id`, which equals the first unit's room)
- `hotel_reservations_rate_plan_same_property` (`rate_plan_id`)

Drawing them would suggest the header holds an independent room or rate, which it does not. They are listed as columns in the DBML.

### 3.4 Rooms → Operations (1)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| O1 | `hotel_rooms` | `housekeeping_tasks` | `housekeeping_tasks_room_same_property` (Tenant, `a`) | 1:N | NOT NULL | Housekeeping work per room. Partial unique: max one open task (pending, assigned or in_progress) per room. |

### 3.5 Reservation / Guest → Folio → Ledger → Cashier / Finance (7)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| F1 | `hotel_reservations` | `guest_folios` | `guest_folios_reservation_same_property` (Tenant, `a`) + partial unique `guest_folios_one_per_reservation` | 0..1 : 0..1 | nullable. A walk-in or standalone folio has no reservation. | A reservation is billed on at most one folio. **Cross-domain: folio ↔ reservation.** |
| F2 | `guest_profiles` | `guest_folios` | `guest_folios_guest_same_property` (Tenant, `a`) | 1:N | NOT NULL | The folio holder is a PMS guest profile. |
| F3 | `guest_folios` | `folio_transactions` | `folio_transactions_folio_same_property` (Tenant, `a`) | 0..1:N | nullable; **XOR** with F4 (`folio_transactions_target_check`) | Guest-ledger postings. **Cross-domain: transaction ↔ folio.** |
| F4 | `financial_accounts` | `folio_transactions` | `folio_transactions_account_same_property` (Tenant, `a`) | 0..1:N | nullable; **XOR** with F3 | AR / master-account postings on the same single ledger. |
| F5 | `hotel_reservation_rooms` | `folio_transactions` | `folio_transactions_room_unit_same_property` (Tenant, `a`) | 0..1:N | nullable | Charge attributed to a specific stay unit. |
| F6 | `hotel_cashier_shifts` | `folio_transactions` | `folio_transactions_hotel_shift_same_property` (Tenant, `a`) | 0..1:N | nullable; payments taken at the drawer | Cash and payment lines recorded within a PMS cashier shift. **Cross-domain: cashier shift ↔ transaction.** |
| F7 | `guest_account_masters` | `financial_accounts` | `financial_accounts_master_same_property` (Tenant, `a`) + unique `financial_accounts_one_per_master` | 1 : 0..1 | `master_id` NOT NULL | Each company or group master has at most one AR billing account. |

### 3.6 Folio → Invoice (1)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| I1 | `guest_folios` | `guest_folio_invoices` | `guest_folio_invoices_folio_fk` (Tenant, `c`) | 1:N | NOT NULL | Issued immutable invoices for a folio. A partial unique allows only one `legacy_folio`-scope invoice per folio; `charge_groups` invoices may be many. |

### 3.7 Staff → Operations (5 lines, 6 FKs)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| S1 | `restaurant_users` | `staff_shifts` | `staff_shifts_staff_membership_id_fkey` (`c`) | 1:N | NOT NULL | Rostered shifts per staff member. |
| S2 | `restaurant_users` | `hotel_cashier_shifts` | `hotel_cashier_shifts_membership_same_property` (Tenant, `a`) | 1:N | NOT NULL | The cashier operating a drawer. Partial unique: max one open shift per cashier. |
| S3 | `restaurant_users` | `housekeeping_tasks` | `housekeeping_tasks_assigned_membership_id_fkey` (`a`) | 0..1:N | nullable | Attendant assigned to the task. |
| S4 | `restaurant_users` | `folio_transactions` | `folio_transactions_posted_by_membership_id_fkey` (`a`) | 0..1:N | nullable | Staff member who posted the ledger line. |
| S5 | `restaurant_users` | `night_audit_runs` | `night_audit_runs_started_by_membership_id_fkey`, `night_audit_runs_closed_by_membership_id_fkey` (`n`) | 0..1:N (×2) | nullable | Who started and who closed the business day. Drawn as one Mermaid line and as 2 DBML refs. |

Deployed but not drawn: about 20 further audit-actor FKs to `restaurant_users`, such as `created_by_*`, `anonymised_by_*`, consent recorders, restriction placers and approvers. They are audit metadata rather than domain flow; the detailed ERDs will show them.

### 3.8 Inventory → Procurement (1, via bridge)

| # | Parent | Child | FK | Cardinality | Optionality | Domain meaning |
|---|---|---|---|---|---|---|
| P1 | `inventory_items` | `purchase_orders` | No direct FK. Backed by bridge `purchase_order_items`: `purchase_order_items_inventory_item_id_fkey` (RESTRICT) and `purchase_order_items_purchase_order_id_fkey` (CASCADE). | N:M | both optional | A PO orders many items, and an item appears on many POs. The bridge is not an anchor and is drawn as a labelled N:M line. Both tables have 0 rows (NOT YET USED, per ARCH-02). |

**Totals.** 34 Mermaid lines, of which 33 are direct deployed FKs and 1 is FK-backed through a bridge. They correspond to 37 DBML refs: 36 direct FK refs plus one `<>` N:M ref. Together these cover 38 deployed FK constraints once the two bridge FKs are counted. Soft relationships drawn: 0.

## 4. Requested flows that are not drawn (no deployed support)

| Requested flow | Finding in deployed schema | Decision |
|---|---|---|
| Tax → folio domain (`pms_taxes`) | `pms_taxes` has no FK to any folio-domain anchor. It is referenced only by non-anchor bridges (`pms_tax_group_taxes`, `pms_tax_department_targets` and `fiscal_tax_code_mappings`). Folio lines carry a JSON `folio_transactions.tax_snapshot`, resolved by `resolve_folio_tax_rows`. | Not drawn. Tax is linked to the property only. The detailed "08 Taxes & Fees" ERD will show the bridge chain. |
| Distribution Channel → Reservations | `distribution_channels` is referenced only by `distribution_room_mappings`, `distribution_rate_mappings`, `distribution_meal_mappings` and `distribution_logs`. Reservations record their channel as text (`source`, `commercial_sales_channel`, `external_reference`). | Not drawn. This is a candidate for ARCH-02 follow-up only if a hard link is wanted. |
| Invoice → Fiscal registration | `fiscal_registrations.source_type/source_id` is polymorphic and has no FK. `source_type` can be `guest_invoice`, `account_invoice`, `credit_note`, `debit_note`, `guest_allocation`, `account_allocation` or `withholding`. Live data has 18 `guest_invoice` rows. ARCH-02 does not list this column among its approved soft relationships. | Not drawn, per the rule. If ARCH-02 approves it as an intentional soft link, add a dotted `guest_folio_invoices ..o{ fiscal_registrations` line. |
| Night audit → operations | `night_audit_runs` has FKs only to `restaurants` and `restaurant_users`. | Only those links are drawn. |

## 5. Ownership annotations

- **Reservation model.**
  - `hotel_reservations` is the **header / booking aggregate**. Its `status` comes from `rollup_hotel_reservation_status` and its `room_subtotal` from `sync_reservation_room_total`; `room_id` is the first unit's room.
  - `hotel_reservation_rooms` is the **stay unit / lifecycle source**.
  - Cancellation goes through `cancel_hotel_reservation_unit` and, since migration 0203, `cancel_hotel_reservation_all_units`.
- **Cashiering (PMS only).**
  - The anchors are `guest_folios`, `folio_transactions` and `hotel_cashier_shifts`, plus `financial_accounts` for AR.
  - `folio_transactions` is the single ledger. Each row targets exactly one of a folio or an AR account.
  - No RMS/POS concepts and no retired `cashier_shifts` / `pos_cashier_shifts`.
- **Tax.** `pms_taxes` is the only tax catalogue shown. No retired restaurant tax columns (such as `restaurants.tax_rate`) are modelled.
- **Guest identity.** `guest_profiles` is the PMS guest identity. No consumer or auth account identity tables are included.
- **Staff identity.** `restaurant_users` is the staff membership. All staff FKs point to it.

## 6. Quality checklist

| Check | Result |
|---|---|
| No retired RMS/POS tables | PASS. None of the 22 anchors is RMS/POS. `hotel_cashier_shifts` is the PMS drawer (its DB comment reads "Not a restaurant till and not pos_cashier_shifts"). |
| No consumer tables | PASS |
| No duplicate lines | PASS. Multi-FK pairs (G2, S5) are consolidated into one labelled line, and composite FKs are drawn once. |
| No impossible cardinality | PASS. 1:0..1 is used only where a full or non-null-covering unique index exists (F1, F7). |
| PK markers present | PASS, 22/22 (`id PK`). |
| No owner-domain violations | PASS. Header-copy FKs are not drawn, and the ledger is under CASHIERING. |
| No anchor omitted | PASS, 22/22 present and drawn. |
| DBML validity | PASS. `@dbml/cli dbml2sql` compiles 22 tables plus 1 auto-junction and 38 FK statements. |
| Mermaid validity | PASS. `@mermaid-js/mermaid-cli` 12.2.0 renders `noru-pms-high-level.svg`. Note that Mermaid rejects empty `%%` comment lines. |
