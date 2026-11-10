# NORU PMS — Detailed ERD 01: Property Core — Notes (NORU-DB-ARCH-04)

Companion to `01-property-core.mmd` (primary), `01-property-core.dbml` and the rendered `01-property-core.svg`.

- **Sources.**
  - `noru-db-architecture-catalogue.md` (ARCH-01 group `01-property-core`)
  - `noru-db-architecture-review.md` (ARCH-02, sections 3, 4.9 and 7, the readiness matrix, and R-09 / R-14)
  - `erd/noru-pms-high-level-notes.md`
  - `docs/pms-only-architecture.md`
  - Live Supabase metadata for project `qcwptraosaudcbjasmul`, read on 2026-11-10 from `pg_constraint`, `pg_index`, `pg_attribute` and `pg_trigger`, plus row counts.
- **Diagram rule.** The ERD shows the current approved architecture only. Every line is a deployed FK, and no proposed tables or FKs appear. Future candidates are listed only in section I.

## A. Purpose

Property Core owns the property itself and its shared tenant anchoring:

1. **Property identity and tenant root.** `restaurants` (alias: Property) carries identity, legal and brand data, timezone, default currency, platform approval state and the current business date. Every PMS table is scoped by `restaurant_id → restaurants.id`.
2. **Physical structure.** Buildings, floors, wings and named property areas. Rooms and room types (ERD 04) reference these.
3. **Organisation.** Departments (with hierarchy), work centres, service-to-department routing, department contacts and outlets or facilities.
4. **Property-level operational configuration.** The offline and sync policy, the go-live governance plan and checklist, and the policy defaults and operating rules stored as `restaurants` columns (section F).
5. **Business-date state.** The single current value `restaurants.business_date` and its configuration in `restaurants.business_date_config` and `business_date_blockers`. The **execution and history** of business-date changes is Night Audit (ERD 10): `night_audit_runs` and `business_date_adjustments`, through the RPCs `close_business_date` and `adjust_business_date`. Those tables are not part of this ERD.

## B. Table inventory (14 owned + 2 stubs)

ARCH-01 assigns 14 tables to this group. ARCH-02 did not move ownership of any of them. The diagram shows exactly these 14 tables, plus the 2 reference stubs ARCH-01 named (`pms_tax_groups` and `pms_property_currencies`). Stubs are excluded from the count comparison.

| # | Table | Business label | PK | Rows (live) |
|---|---|---|---|---|
| 1 | `restaurants` | Property | `id` | 11 |
| 2 | `hotel_buildings` | Building | `id` | 13 |
| 3 | `hotel_floors` | Floor | `id` | 31 |
| 4 | `hotel_wings` | Wing | `id` | 16 |
| 5 | `pms_property_areas` | Named Property Area | `id` | 4 |
| 6 | `pms_departments` | Department | `id` | 15 |
| 7 | `pms_work_centers` | Work Centre | `id` | 3 |
| 8 | `pms_department_routing_rules` | Service Routing Rule | `id` | 0 |
| 9 | `pms_property_department_contacts` | Department Contact | `id` | 0 |
| 10 | `pms_outlets` | Outlet / Facility | `id` | 10 |
| 11 | `pms_golive_plans` | Go-Live Plan | `id` | 0 |
| 12 | `pms_golive_tasks` | Go-Live Task | `id` | 0 |
| 13 | `pms_offline_policies` | Offline & Sync Policy | `id` | 2 |
| 14 | `pms_offline_capabilities` | Offline Capability | `id` | 14 |
| stub | `pms_tax_groups` | Tax Group (owned by 08-taxes-fees) | `id` | — |
| stub | `pms_property_currencies` | Property Currency (owned by 13b-fiscal-finance) | `id`; FK target is unique `(restaurant_id, code)` | — |

## C. Table ownership

Owner and type come from ARCH-01; ARCH-02 changed neither. The "Primary editor" column records the setup area that writes the table, for documentation only. It is not a second owner.

| Table | Owner | Type (ARCH-01) | Scope | Primary editor | Notes |
|---|---|---|---|---|---|
| `restaurants` | Property Core | MASTER | SHARED | Property Setup cards (column groups), Platform Admin (approval), Night Audit (business-date RPCs) | Tenant root. See section F. |
| `hotel_buildings` | Property Core | MASTER | PMS | Property Setup (SET2 structure) | `hotel_rooms.building` text is kept in sync from `name` (DB comment). |
| `hotel_floors` | Property Core | MASTER | PMS | Property Setup (SET2) | `hotel_rooms.floor` text is kept in sync from `name`. |
| `hotel_wings` | Property Core | MASTER | PMS | Property Setup (SET2) | Parent is a building XOR a floor (CHECK `hotel_wings_parent_xor`). |
| `pms_property_areas` | Property Core | MASTER | PMS | Property Setup card 1 | Table source; `restaurants.property_areas` is a compatibility snapshot. |
| `pms_departments` | Property Core | MASTER | PMS | Property Setup (SET5), Guest Services | Revenue and cost centres. Referenced by 8 tables in other domains. |
| `pms_work_centers` | Property Core | MASTER | PMS | Property Setup (SET5) | "Empty is a Warning" (DB comment). |
| `pms_department_routing_rules` | Property Core | CONFIGURATION | PMS | Property Setup card 5 | Service key → department → default role. Not folio routing. |
| `pms_property_department_contacts` | Property Core | MASTER | PMS | — (no app writer) | 0 rows; `restaurants.department_contacts` is the de facto source. |
| `pms_outlets` | Property Core | MASTER | PMS | Property Setup (SET2) | Outlet and facility master. Folio posting is not rewritten (DB comment). |
| `pms_golive_plans` | Property Core | CONFIGURATION | PMS | Property Setup card 8 | One per property. `ready` must never write `restaurants.pms_set1_live`. |
| `pms_golive_tasks` | Property Core | TRANSACTION | PMS | Property Setup card 8 | Explicit status; never auto-completed by other cards. |
| `pms_offline_policies` | Property Core | CONFIGURATION | PMS | Property Setup card 8 | Setup only; no offline runtime ships. One per property. |
| `pms_offline_capabilities` | Property Core | CONFIGURATION | PMS | Property Setup card 8 | Per-capability policy; `policy_configured` is not runtime-supported. |

ARCH-01 uses only MASTER, CONFIGURATION and TRANSACTION in this group, so no LOOKUP, SNAPSHOT or AUDIT tables appear.

## D. Relationships

Key:
- **Tenant** marks a composite FK `(x_id, restaurant_id) → (id, restaurant_id)`, which guarantees the parent belongs to the same property.
- ON DELETE codes: `a` no action, `c` cascade, `n` set null, `r` restrict.
- Cardinality is derived from FK nullability and unique indexes.

### D.1 Drawn relationships (23, all deployed FKs)

| # | Parent | Child | FK (constraint) | Cardinality | Optionality | Meaning |
|---|---|---|---|---|---|---|
| 1 | `restaurants` | `hotel_buildings` | `hotel_buildings_restaurant_id_fkey` (`c`) | 1:N | required | Property has buildings. |
| 2 | `restaurants` | `pms_property_areas` | `pms_property_areas_restaurant_id_fkey` (`c`) | 1:N | required | Property names its areas. |
| 3 | `restaurants` | `pms_departments` | `pms_departments_restaurant_id_fkey` (`c`) | 1:N | required | Property organises departments. |
| 4 | `restaurants` | `pms_golive_plans` | `pms_golive_plans_restaurant_id_fkey` (`c`) + unique `pms_golive_plans_restaurant_unique` | 1 : 0..1 | required | At most one go-live plan per property. |
| 5 | `restaurants` | `pms_offline_policies` | `pms_offline_policies_restaurant_id_fkey` (`c`) + unique `pms_offline_policies_restaurant_unique` | 1 : 0..1 | required | At most one offline policy per property. |
| 6 | `pms_tax_groups` (stub) | `restaurants` | `restaurants_default_room_tax_group_fk`: `(default_room_tax_group_id, id) → (id, restaurant_id)` (`n`) | 0..1 : 0..1 | optional | Default room tax group, which must belong to the same property. |
| 7 | `hotel_buildings` | `hotel_floors` | `hotel_floors_building_fk` (Tenant, `a`) | 1:N | `building_id` NOT NULL | Building contains floors; `(restaurant_id, building_id, code)` is unique. |
| 8 | `hotel_buildings` | `hotel_wings` | `hotel_wings_building_fk` (Tenant, `a`) | 0..1:N | optional; XOR with #9 | Wing whose parent is a building. |
| 9 | `hotel_floors` | `hotel_wings` | `hotel_wings_floor_fk` (Tenant, `a`) | 0..1:N | optional; XOR with #8 | Wing whose parent is a floor. |
| 10 | `hotel_wings` | `hotel_floors` | `hotel_floors_wing_fk` (Tenant, `r`) | 0..1:N | optional | Floor grouped under a wing. Together with #9 this forms a circular reference; see H-4. |
| 11 | `pms_departments` | `pms_departments` | `pms_departments_parent_fk` (Tenant, `n`) | 0..1:N | optional | Department hierarchy. |
| 12 | `pms_departments` | `pms_work_centers` | `pms_work_centers_department_id_fkey` (`c`, **single-column**) | 1:N | required | Work centres within a department. |
| 13 | `pms_departments` | `pms_department_routing_rules` | `pms_department_routing_rules_department_fk` (Tenant, `c`) | 1:N | required | Service key routed to a department; `(restaurant_id, service_key)` is unique. |
| 14 | `pms_departments` | `pms_property_department_contacts` | `pms_property_department_contacts_department_fk` (Tenant, `r`) | 1:N | required | Contact channels per department. |
| 15 | `pms_departments` | `pms_outlets` | `pms_outlets_department_fk` (Tenant, `n`) | 0..1:N | optional | Department operating the outlet. |
| 16 | `hotel_buildings` | `pms_outlets` | `pms_outlets_building_fk` (Tenant, `n`) | 0..1:N | optional | Outlet location: building. |
| 17 | `hotel_floors` | `pms_outlets` | `pms_outlets_floor_fk` (Tenant, `n`) | 0..1:N | optional | Outlet location: floor. |
| 18 | `hotel_wings` | `pms_outlets` | `pms_outlets_wing_fk` (Tenant, `n`) | 0..1:N | optional | Outlet location: wing. |
| 19 | `pms_tax_groups` (stub) | `pms_outlets` | `pms_outlets_tax_group_fk` (Tenant, `n`) | 0..1:N | optional | Tax group applied to outlet charges. |
| 20 | `pms_property_currencies` (stub) | `pms_outlets` | `pms_outlets_currency_fk`: `(restaurant_id, currency_code) → (restaurant_id, code)` (`n`) | 0..1:N | optional | Outlet currency, a natural-key FK. |
| 21 | `pms_golive_plans` | `pms_golive_tasks` | `pms_golive_tasks_plan_fk` (Tenant, `c`) | 1:N | required | Checklist tasks of the plan; `(restaurant_id, task_key)` is unique. |
| 22 | `pms_departments` | `pms_golive_tasks` | `pms_golive_tasks_department_fk` (Tenant, `n`) | 0..1:N | optional | Department owning the task. |
| 23 | `pms_offline_policies` | `pms_offline_capabilities` | `pms_offline_capabilities_policy_fk`: `restaurant_id → pms_offline_policies.restaurant_id` (`c`) | 1:N | required | Capability rows require the property's offline policy. |

### D.2 Deployed but implicit (not drawn, to avoid a central spider)

These eight tenant FKs exist, all `restaurant_id NOT NULL → restaurants.id ON DELETE CASCADE`. Each child is reachable through a drawn sub-domain parent:

- `hotel_floors_restaurant_id_fkey`
- `hotel_wings_restaurant_id_fkey`
- `pms_work_centers_restaurant_id_fkey`
- `pms_department_routing_rules_restaurant_id_fkey`
- `pms_property_department_contacts_restaurant_id_fkey`
- `pms_outlets_restaurant_id_fkey`
- `pms_golive_tasks_restaurant_id_fkey`
- `pms_offline_capabilities_restaurant_id_fkey`

### D.3 Documented outbound actor and platform references (not drawn, no stub)

| Child | Column(s) | Target | Constraint | Optionality | Meaning |
|---|---|---|---|---|---|
| `pms_departments` | `(restaurant_id, manager_user_id)` | `restaurant_users (restaurant_id, user_id)` | `pms_departments_manager_fk` (`n`) | optional | Department manager. |
| `pms_departments` | `(restaurant_id, escalation_manager_user_id)` | `restaurant_users (restaurant_id, user_id)` | `pms_departments_escalation_manager_fk` (`n`) | optional | Escalation manager. |
| `pms_outlets` | `(restaurant_id, manager_user_id)` | `restaurant_users (restaurant_id, user_id)` | `pms_outlets_manager_fk` (`n`) | optional | Outlet manager. |
| `pms_golive_tasks` | `(restaurant_id, owner_user_id)` | `restaurant_users (restaurant_id, user_id)` | `pms_golive_tasks_owner_fk` (`n`) | optional | Task owner. |
| `restaurants` | `approved_by` | `auth.users (id)` | `restaurants_approved_by_fkey` (`a`) | optional | Platform admin who approved the property. |

The four `restaurant_users` FKs target the natural key `(restaurant_id, user_id)` rather than `restaurant_users.id`. They identify the staff member by auth user within the property, which differs from most PMS actor FKs (`*_membership_id → restaurant_users.id`); see H-5.

## E. Cross-domain consumers

Live metadata shows **278 tables** with a FK to `restaurants`, one each. Of these, 13 are Property Core children and **265** belong to other domains. They are summarised here rather than drawn. Counts use the ARCH-01 domain classification.

| Domain | Tables referencing `restaurants` | Example anchors | Detailed ERD |
|---|---|---|---|
| Guest Profile | 41 | `guest_profiles`, `guest_account_masters` | 02a / 02b |
| Rate & Revenue | 39 | `hotel_rate_plans`, rate shopping, promotions | 09a / 09b |
| Reservations | 31 | `hotel_reservations`, `hotel_reservation_rooms` | 03a / 03b |
| Fiscal / Invoicing | 23 | `guest_folio_invoices`, `fiscal_registrations` | 13a / 13b |
| Cashiering | 17 | `guest_folios`, `folio_transactions`, `hotel_cashier_shifts` | 07 |
| Integrations | 17 | communication channels and events | 14 / 15 |
| Rooms & Inventory | 13 | `room_types`, `hotel_rooms` | 04 |
| Guest Services | 11 | guest requests, service types | 05 |
| Housekeeping | 9 | `housekeeping_tasks`, inspections | 06 |
| Security / Permissions | 9 | approval rules, audit policies | 15a |
| Distribution | 8 | `distribution_channels`, mappings | 14 |
| Taxes & Fees | 8 | `pms_fees`, `pms_service_charges` | 08 |
| Human Resources / Staff | 6 | `restaurant_users`, `staff_shifts` | 12 |
| Night Audit | 5 | `night_audit_runs`, `business_date_adjustments` | 10 |
| Front Office | 5 | `fo_checkin_progress`, `fo_guest_requests` | 05 |
| Reports / Analytics | 5 | report and metric settings | 15c |
| Inventory | 4 | `inventory_items`, `inventory_stock_movements` | 11 |
| Procurement | 4 | `purchase_orders`, `restaurant_suppliers` | 11 |
| Accounting / Finance | 4 | `pms_property_currencies`, `pms_exchange_rates` | 13b |
| Maintenance | 4 | maintenance categories and rules | 06 |
| Platform Admin | 2 | `admin_audit_log`, `restaurant_package_entitlements` | 15a |

Inbound references to other Property Core tables, which will be drawn in the consuming ERDs:

- `hotel_buildings`, `hotel_floors` and `hotel_wings` are referenced by `hotel_rooms` (`building_id`, `floor_id`, `wing_id`) and `room_types` (`default_building_id`, `preferred_floor_id`, `default_wing_id`). ERD 04.
- `pms_departments` is referenced by:
  - `folio_transactions` (ERD 07)
  - `guest_company_contacts` (02b)
  - `pms_guest_request_types` and `pms_guest_service_department_assignments` (05)
  - `pms_hotel_roles` (15a)
  - `pms_maintenance_rules` (06)
  - `pms_service_charge_department_targets` and `pms_tax_department_targets` (08)
- `pms_outlets` is referenced by `pms_event_package_template_outlets` and `pms_function_space_outlets` (09b).

## F. `restaurants` configuration ownership

**Architectural rule (ARCH-02 §3 and finding 24).**

- `restaurants` has one primary owner: **Property Core**.
- Several Property Setup settings cards are the **authoritative editors** of separate column groups. They are not database owners, and this is **not** a multi-owner lifecycle violation.
- Platform Admin owns approval state.
- Night Audit changes `business_date` only through RPCs.
- The trigger `enforce_restaurant_protected_fields` (BEFORE UPDATE, SECURITY DEFINER) resets the following columns for any writer that is neither `service_role` nor a platform admin: `id`, `slug`, `active`, `approved`, `approved_at`, `approved_by`, `rejection_reason`, `suspension_reason` and `status_updated_at`.

The writers below were identified by searching the code for the files that reference each column. ARCH-02 §4.9 supplies the classification.

| Column group | Example columns | Authoritative editor | ARCH-02 classification |
|---|---|---|---|
| Platform state | `active`, `approved`, `approved_at`, `approved_by`, `rejection_reason`, `suspension_reason`, `slug` | Platform Admin (trigger-protected) | SOURCE OF TRUTH |
| Identity, brand, address, legal | `name`, `property_code`, `legal_name`, `trading_name`, `brand_*`, `address_*`, `legal_entity_*`, `registration_number`, `emergency_contacts`, `identity_toggles` | Property Setup card 1 (`pms-property-setup-card1`) and SET1 foundation | SOURCE OF TRUTH |
| Tax identity | `vat_registered`, `vat_number`, `tin_number` | Property Setup card 1 and billing card 3 | SOURCE OF TRUTH |
| Tax identity snapshot | `tax_identities` | SET1 foundation | COMPATIBILITY (snapshot) |
| Localisation | `timezone`, `currency_code`, `default_language` | Property Setup card 1 / SET1 | SOURCE OF TRUTH |
| Business date | `business_date` | Night Audit RPCs `close_business_date` and `adjust_business_date` | SOURCE OF TRUTH (state) |
| Business-date configuration | `business_date_config`, `business_date_blockers` | Property Setup card 1 (go-live card 8 reads it) | REVIEW LATER (not classified in ARCH-02) |
| Policy defaults and operating rules | `deposit_required/type/value`, `fo_cancel_fee_*`, `cancel_fee_basis`, `fo_noshow_fee_*`, `noshow_fee_basis`, `early_checkin_allowed/needs_approval`, `late_checkout_allowed/fee`, `check_in_time`, `check_out_time`, `*_policy_text` | SET1 foundation and Property Setup card 1. Read by Front Office, Reservations and Cashiering. | SOURCE OF TRUTH (property default and fallback; booking-time terms are snapshotted on the reservation) |
| Superseded fees | `early_checkin_fee`, `cancel_window_hours` | setup card only | LEGACY CANDIDATE (superseded by `pms_fees` and `pms_rate_cancellation_policies`) |
| Department contacts | `department_contacts` | Property Setup card 1 | SOURCE OF TRUTH (de facto, because `pms_property_department_contacts` has 0 rows) |
| Property areas | `property_areas` | Property Setup card 1 | COMPATIBILITY (`pms_property_areas` is the source) |
| Structure and check-in snapshots | `structure_rules_posture`, `checkin_ops` | Property Setup card 1 | COMPATIBILITY (snapshot) |
| Structure mode | `single_building_mode` | SET2 structure | REVIEW LATER (not classified in ARCH-02) |
| Default room tax group | `default_room_tax_group_id` | Taxes card 3 | SOURCE OF TRUTH (FK to `pms_tax_groups`) |
| Guest profile rules | `pms_guest_profile_rules` | SET3 rates/guest; read by guest listing | SOURCE OF TRUTH (runtime reader) |
| Setup posture JSON | `pms_rate_package_rules` (SET3); `pms_hk_status_rules` and `pms_hk_cleaning_posture` (housekeeping card 2); `pms_ooo_oos_posture` (SET4); `pms_routing_defaults`, `pms_notification_event_rules` and `pms_session_access_posture` (SET5); `pms_audit_retention_posture` (audit card 7); `pms_reports_catalogue_posture` and `pms_reports_schedule_access_posture` (reports card 7); `pms_distribution_channel_posture`, `pms_distribution_mapping_posture`, `pms_offline_enablement_posture` and `pms_offline_sync_posture` (SET6) | the named setup card | COMPATIBILITY (snapshot mirroring dedicated tables) |
| Other setup JSON | `pms_maintenance_sla` (SET4); `pms_notification_channels` and `pms_admin_controls` (SET5) | the named setup card | REVIEW LATER (not classified in ARCH-02) |
| Setup readiness | `pms_property_setup_status` | readiness checks of cards 4, 5, 7 and 8 | DERIVED (cache) |
| Go-live flag | `pms_set1_live` | card 8 activation. `pms_golive_plans.status = ready` must never set it. | SOURCE OF TRUTH |
| Direct booking | `direct_booking_enabled`, `booking_contact_*`, `booking_message` | Distribution / Direct Booking | REVIEW LATER (editor outside Property Setup; not classified in ARCH-02) |

Only the identity, localisation, business-date, tax-group, go-live and platform fields are shown in the ERD entity. The roughly 100 other columns are documented here, following the ARCH-02 readiness note: "Show `restaurants` column groups … as notes, not tables."

Offline overlap inside this group. `pms_offline_policies` and `pms_offline_capabilities` are the **table source** for offline policy. `restaurants.pms_offline_enablement_posture` and `pms_offline_sync_posture` are **COMPATIBILITY** snapshots of the same setup state (ARCH-02 §4.9).

## G. Legacy naming

ARCH-02 §7 classifies `restaurants` (= Property) and `restaurant_users` (= Property Membership) as **DOCUMENT ALIAS**, and the other `restaurant_*` tables similarly.

- **Why the names stay.**
  - `restaurant_id` appears in nearly every table and in every tenant-composite FK. There are 278 direct FKs to `restaurants` and many composite unique keys of the form `(id, restaurant_id)`.
  - RLS helpers, RPCs and the application all depend on the names.
  - `docs/pms-only-architecture.md` protects them.
  - A rename is therefore high-risk and low-value.
- **How the ERD handles them.** Labels show the business alias alongside the real name, for example `restaurants [Property]`. No schema object is renamed.

## H. Architecture findings (carried from ARCH-02 or observed in deployed metadata)

| # | Severity | Finding | Source |
|---|---|---|---|
| H-1 | P2 | `restaurants` has multiple settings-card writers. This is accepted as column-group ownership, not multi-ownership, with Property Core as the primary owner. | ARCH-02 finding 24, §3 |
| H-2 | P2 | Policy and config overlap: about 20 posture JSON columns on `restaurants` mirror dedicated tables (COMPATIBILITY). `early_checkin_fee` and `cancel_window_hours` are LEGACY. | ARCH-02 §4.9, R-09 |
| H-3 | P3 | `pms_property_department_contacts` has 0 rows and no app writer, while `restaurants.department_contacts` JSON is the de facto source. The dedicated table is not yet authoritative. | ARCH-02 §4.9, catalogue |
| H-4 | P3 | Circular structural reference: `hotel_floors.wing_id → hotel_wings` and `hotel_wings.parent_floor_id → hotel_floors`. Both are nullable, and the XOR CHECK on wings prevents a wing having both parents. Valid as deployed; documented for ERD readers. | Deployed metadata |
| H-5 | P3 | Actor FK style differs: Property Core uses `(restaurant_id, user_id) → restaurant_users (restaurant_id, user_id)`, while most PMS actor FKs use `*_membership_id → restaurant_users.id`. Both are valid. | Deployed metadata |
| H-6 | P3 | `pms_work_centers.department_id` is a single-column FK to `pms_departments.id`, whereas every other department FK in this group is tenant-composite. Same-property consistency therefore depends on RLS and the application. | Deployed metadata |
| H-7 | P3 | Legacy `restaurant*` naming is documented as an alias; no rename. | ARCH-02 §7, R-14 |
| H-8 | Info | Structure text columns remain on `hotel_rooms` (`building`, `floor`, `wing`) and are synced from the masters. They are owned by ERD 04 and noted here only because the DB comments on buildings and floors describe them. | Catalogue DB comments |

`enforce_profile_account_type` is **not** carried forward. It guards `profiles` (Security / Permissions), not a Property Core table.

## I. Future refactor candidates (documentation only, not implemented)

1. Retire the `restaurants` posture JSON columns that mirror dedicated tables, one setup card at a time, starting with the offline postures because `pms_offline_*` already exists (ARCH-02 R-09).
2. Retire `early_checkin_fee` and `cancel_window_hours` once no setup card writes them (R-09).
3. Decide the source for department contacts: either start writing `pms_property_department_contacts` or drop it (H-3).
4. Consider a tenant-composite FK `(department_id, restaurant_id)` on `pms_work_centers` for consistency (H-6).
5. Classify `business_date_config`, `business_date_blockers`, `single_building_mode`, `pms_maintenance_sla`, `pms_notification_channels`, `pms_admin_controls` and the direct-booking columns in a future ARCH review (all currently REVIEW LATER).
6. Document the `restaurant_*` aliases in `docs/pms-only-architecture.md` (R-14).

## J. Validation

| Check | Result |
|---|---|
| Catalogue group count = diagram-owned count | PASS: 14 = 14 (2 stubs excluded) |
| Every displayed relationship has a deployed FK | YES: 23/23 constraint names listed in D.1 |
| No retired RMS/POS or consumer objects | PASS |
| No table in the wrong domain | PASS: all 14 are ARCH-01 Property Core. The stubs are labelled with their owning ERD. |
| `restaurants` remains Property Core owner | PASS |
| DBML compiles | PASS: `@dbml/cli dbml2sql` produces 16 tables and 23 FKs |
| Mermaid renders | PASS: `@mermaid-js/mermaid-cli` 12.2.0 renders `01-property-core.svg` |
