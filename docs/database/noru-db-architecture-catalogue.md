# NORU Database Architecture Catalogue

Task: **NORU-DB-ARCH-01 — Database Architecture Classification Audit** (read-only).

- Source database: deployed Supabase project `qcwptraosaudcbjasmul`, schema `public`.
- Source code: `src/` (1,571 non-test `.ts`/`.tsx` files; generated `types.ts` and tests excluded).
- Audit date: 2026-11-10.
- No migrations, schema changes, data changes or code refactors were made.
- Updated by **NORU-DB-ARCH-02** (read-only): the four INVESTIGATE tables were assigned owners and `housekeeping_maintenance_requests` moved to Housekeeping. Decisions and evidence: `docs/database/noru-db-architecture-review.md`.

## Executive Summary

| Metric | Value |
|---|---|
| Total deployed `public` tables | 297 |
| Classified tables | 297 |
| PMS tables | 275 |
| SHARED tables | 18 |
| PLATFORM tables | 2 |
| MARKETING tables | 2 |
| Domains with at least one owned table | 23 (of 25 candidate domains) |
| INVESTIGATE tables | 0 |
| Tables with at least one architecture warning | 126 |
| Architecture warning instances (all warning flags) | 169 |
| Foreign keys | 764 (all validated; 11 reference `auth.users`) |
| Public functions | 251 (of which 200 reference at least one table by name) |
| Views / materialized views | 0 / 0 |
| Tables with RLS enabled | 297 / 297 |
| Tables without a primary key | 0 |
| High-level ERD anchor tables | 22 |

Warning flags counted: NO APPLICATION REFERENCES (1), ZERO ROWS (55), DUPLICATE BUSINESS CONCEPT (19), UNCLEAR OWNER (0), MULTIPLE WRITERS (44), CROSS-DOMAIN WRITE CONFLICT (23), ORPHANED FK (0), NO FK WHERE RELATIONSHIP EXPECTED (16), LEGACY NAMING (11).
Informational flag (not counted as a warning): CROSS-DOMAIN SHARED REFERENCE (41).

### Method

1. **Schema facts** (tables, PKs, FKs, uniqueness, NOT NULL, row counts, comments, triggers) come from `pg_catalog` on the deployed database. Row counts are exact `count(*)` values at audit time.
2. **Function dependencies** come from scanning `pg_proc.prosrc` of the 251 `public` functions for each table name, classifying `INSERT INTO`, `UPDATE`, `DELETE FROM` as I/U/D. Functions that only read are listed separately.
3. **Application readers / writers** come from scanning `src/` for (a) `.from("table")` chains followed by `.insert/.update/.upsert/.delete`, (b) string-literal table names in files that use generic `.from(table)` helpers with writes, and (c) `.rpc("fn")` calls resolved through step 2. Files are mapped to application modules by file/directory name. `Property Setup` is the settings workspace module.
4. **Writer kinds**: `direct` = table DML from TypeScript, `rpc` = only via a database function, `generic` = table name passed to a generic CRUD helper.
5. **Ownership** follows the PMS-only contract in `docs/pms-only-architecture.md`, then deployed write paths, then table comments. One primary owner per table.
6. Incidental FKs to `restaurants` (tenant), `restaurant_users` (actor membership), `profiles` and `auth.users` are omitted from Important FKs / Parents in the main catalogue for readability, and are kept in Appendix A.

### Flag legend

| Code | Flag | Rule |
|---|---|---|
| NOREF | NO APPLICATION REFERENCES | Table name never referenced in non-test source. |
| ZERO | ZERO ROWS | `count(*) = 0` at audit time. |
| DUP | DUPLICATE BUSINESS CONCEPT | Columns / relationships overlap another table (see Duplicate Concept Audit). |
| UNCLEAR | UNCLEAR OWNER | No PMS domain cleanly owns the lifecycle. |
| MULTIW | MULTIPLE WRITERS | Two or more application modules write the table (direct, rpc or generic). Not applied to AUDIT tables. |
| XWRITE | CROSS-DOMAIN WRITE CONFLICT | A module outside the owner domain writes with direct table DML (not via an owner RPC). `Property Setup` and `Shared Core` are excluded. |
| ORPHFK | ORPHANED FK | FK not validated / referencing a missing object. None found. |
| NOFK | NO FK WHERE RELATIONSHIP EXPECTED | A relationship column (not an actor or polymorphic id) has no FK constraint. |
| LEGACY | LEGACY NAMING | Name carries a retired product or a misleading suffix. |
| XREF | CROSS-DOMAIN SHARED REFERENCE | Read by four or more non-setup modules. Informational. |

## Domain Summary

| Domain | Table Count | Main Owner | Main Anchor Tables | Notes |
|---|---|---|---|---|
| Property Core | 14 | Property Core module | `restaurants` | Tenant/property identity and physical structure. `restaurants` is the tenant root referenced by almost every table. |
| Reservations | 31 | Reservations module | `hotel_reservation_rooms`, `hotel_reservations` | Reservation header + room units, waitlist, groups, sales & events. Writes go through reservation RPCs. |
| Front Office | 5 | Front Office module | `pms_registration_agreement_versions`, `fo_checkin_agreement_instances` | Check-in progress, registration cards, FO requests. Mutates reservations/rooms only via owner RPCs. |
| Guest Profile | 42 | Guest Profile module | `guest_account_masters`, `guest_profiles` | Individual guests plus account masters (company, group account, travel agent) and agreements. |
| Rooms & Inventory | 14 | Rooms & Inventory module | `hotel_rooms`, `room_types` | Room types, rooms, amenities, inventory blocks and overbooking rules. |
| Housekeeping | 9 | Housekeeping module | `housekeeping_tasks` | Tasks, inspections, discrepancies, HK status rules, maintenance requests raised from housekeeping. |
| Cashiering | 17 | Cashiering module | `financial_accounts`, `folio_transactions`, `guest_folios`, `hotel_cashier_shifts` | Folios, unified ledger, AR financial accounts, cashier drawers, payment/deposit allocations. |
| Taxes & Fees | 8 | Taxes & Fees module | `pms_taxes` | Tax, tax-group, service-charge and fee configuration. |
| Rate & Revenue | 39 | Rate & Revenue module | `hotel_rate_plans` | Rate plans, calendar, restrictions, policies, packages/promotions, revenue approvals, rate shopping. |
| Night Audit | 5 | Night Audit module | `night_audit_runs` | Business-date close runs, exceptions, overrides. |
| Inventory | 5 | Inventory / Procurement module | `inventory_items` | Shared PMS capability (stock and assets). Currently zero rows. |
| Procurement | 4 | Inventory / Procurement module | `purchase_orders` | Shared PMS capability (suppliers, purchase orders). Currently zero rows. |
| Human Resources / Staff | 6 | Human Resources / Staff module | `restaurant_users`, `staff_shifts` | Staff memberships, rota, attendance, shift templates, retained outlet table assignment. |
| Accounting / Finance | 4 | Accounting / Finance module | `pms_property_currencies`, `withholding_certificates` | Currencies, FX, financial settings, withholding certificates. |
| Fiscal / Invoicing | 27 | Fiscal / Invoicing module | `fiscal_registrations`, `guest_folio_invoices` | Guest and account invoices, credit/debit notes, fiscal authority integration. |
| Distribution | 8 | Distribution module | `distribution_channels` | Channel manager channels, mappings, inbound booking mappings and sync logs. |
| Direct Booking | 0 | — | — | No dedicated tables. Booking engine uses `restaurants` booking columns and writes reservations via `create_direct_booking`. |
| Guest Services | 11 | Guest Services module | `pms_guest_service_types`, `pms_guest_service_categories` | Service catalogue, requests, SLA, meal/service entitlements. |
| Maintenance | 5 | Maintenance module | `pms_maintenance_rules`, `pms_maintenance_categories` | Maintenance rules, catalogues and status rules. Maintenance requests are owned by Housekeeping (ARCH-02). |
| Integrations | 19 | Integrations module | `pms_integrations`, `pms_import_types` | Integration registry, communications, data import. |
| Reports / Analytics | 8 | Reports / Analytics module | `pms_report_definitions`, `pms_metric_definitions` | Report and metric catalogues, report access audit. |
| Security / Permissions | 12 | Security / Permissions module | `pms_hotel_roles`, `pms_permissions` | Roles, permissions, staff identity, audit policy and audit log. |
| Platform Admin | 2 | Platform Admin module | `admin_audit_log`, `restaurant_package_entitlements` | Platform-admin audit and package entitlements. |
| Marketing / CMS | 2 | Marketing / CMS module | `leads`, `marketing_content_revisions` | Public site leads and CMS revisions. |
| Shared Core | 0 | — | — | No tables owned; shared concerns are owned by Property Core / Security / HR. |
| INVESTIGATE | 0 | — | — | Tables without a clean PMS owner. |

Main Owner is the application module that owns the domain's write lifecycle (Property Setup workspace writes excluded). Other writing modules are listed per table in the catalogue and in Architecture Findings D.

## Full Table Catalogue

One subsection per domain. Each subsection has a **structure** table (type, scope, keys, relationships, ERD placement, flags) and an **access** table (application readers/writers, database functions, notes). Domain and primary owner are the subsection heading; every table in a subsection has that domain as its single primary owner.

### Property Core (14 tables)

Domain: **Property Core** · Primary owner: **Property Core**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `hotel_buildings` | MASTER | PMS | `id` | 13 | — | — | hotel_floors, hotel_rooms, hotel_wings, pms_outlets, room_types | 01-property-core | NO | — |
| `hotel_floors` | MASTER | PMS | `id` | 31 | building_id→hotel_buildings, wing_id→hotel_wings | hotel_buildings, hotel_wings | hotel_rooms, hotel_wings, pms_outlets, room_types | 01-property-core | NO | — |
| `hotel_wings` | MASTER | PMS | `id` | 16 | parent_building_id→hotel_buildings, parent_floor_id→hotel_floors | hotel_buildings, hotel_floors | hotel_floors, hotel_rooms, pms_outlets, room_types | 01-property-core | NO | — |
| `pms_department_routing_rules` | CONFIGURATION | PMS | `id` | 0 | department_id→pms_departments | pms_departments | — | 01-property-core | NO | ZERO |
| `pms_departments` | MASTER | PMS | `id` | 15 | parent_id→pms_departments | pms_departments (self) | folio_transactions, guest_company_contacts, pms_department_routing_rules, pms_departments (self), pms_golive_tasks, +9 more | 01-property-core | NO | MULTIW, XWRITE, XREF |
| `pms_golive_plans` | CONFIGURATION | PMS | `id` | 0 | — | — | pms_golive_tasks | 01-property-core | NO | ZERO |
| `pms_golive_tasks` | TRANSACTION | PMS | `id` | 0 | golive_plan_id→pms_golive_plans, owner_department_id→pms_departments | pms_golive_plans, pms_departments | — | 01-property-core | NO | ZERO |
| `pms_offline_capabilities` | CONFIGURATION | PMS | `id` | 14 | restaurant_id→pms_offline_policies | pms_offline_policies | — | 01-property-core | NO | — |
| `pms_offline_policies` | CONFIGURATION | PMS | `id` | 2 | — | — | pms_offline_capabilities | 01-property-core | NO | — |
| `pms_outlets` | MASTER | PMS | `id` | 10 | building_id→hotel_buildings, currency_code→pms_property_currencies, department_id→pms_departments, floor_id→hotel_floors, +2 more | hotel_buildings, pms_property_currencies, pms_departments, hotel_floors, +2 more | pms_event_package_template_outlets, pms_function_space_outlets | 01-property-core | NO | MULTIW |
| `pms_property_areas` | MASTER | PMS | `id` | 4 | — | — | — | 01-property-core | NO | — |
| `pms_property_department_contacts` | MASTER | PMS | `id` | 0 | department_id→pms_departments | pms_departments | — | 01-property-core | NO | ZERO |
| `pms_work_centers` | MASTER | PMS | `id` | 3 | department_id→pms_departments | pms_departments | — | 01-property-core | NO | — |
| `restaurants` | MASTER | SHARED | `id` | 11 | id,default_room_tax_group_id→pms_tax_groups | pms_tax_groups | admin_audit_log, business_date_adjustments, distribution_channels, distribution_logs, distribution_meal_mappings, +273 more | 01-property-core | YES | MULTIW, XWRITE, LEGACY, XREF |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `hotel_buildings` | Property Core, Property Setup, Rooms & Inventory | Property Setup: direct | — | Building master. DB comment: “PMS-SET2 building masters. hotel_rooms.building text is kept and synced from name.” |
| `hotel_floors` | Property Core, Property Setup, Rooms & Inventory, Guest Profile | Property Setup: direct | — | Floor master. DB comment: “PMS-SET2 floor masters. hotel_rooms.floor text is kept and synced from name.” |
| `hotel_wings` | Property Core, Property Setup, Rooms & Inventory | Property Setup: direct | — | Wing master. DB comment: “PMS-SET2 wing masters. Parent is building XOR floor.” |
| `pms_department_routing_rules` | Property Core | Property Core: direct | — | Service-key to department routing. DB comment: “Card 5 setup map: service/task key → department → default role. Not folio pms_routing_defaults, not fo_guest_requests, not work orders.” |
| `pms_departments` | Property Setup, Property Core, Guest Profile, Guest Services, Security / Permissions, +7 more | Property Setup: direct, Guest Services: direct, Property Core: direct, Taxes & Fees: generic | reads: `list_chargeable_guest_services`, `resolve_chargeable_guest_service` | Department master (revenue/cost centres). Direct writes from: Guest Services. |
| `pms_golive_plans` | Property Setup | Property Setup: direct | — | Go-live plan. DB comment: “Card 8 Go-Live governance plan. One row per restaurant. status ready is preparation only and must never write restaurants.pms_set1_live.” |
| `pms_golive_tasks` | Property Setup | Property Setup: direct | — | Go-live checklist tasks. DB comment: “Card 8 Go-Live governance checklist. Status is explicit. Completing a Card 1–7 domain must never auto-complete a task. Not an operational te…” |
| `pms_offline_capabilities` | Property Setup | Property Setup: direct | — | Offline capability policy. DB comment: “Card 8 tenant offline capability policy. policy_configured is not runtime-supported. Not a device capability matrix.” |
| `pms_offline_policies` | Property Setup | Property Setup: direct | — | Offline mode policy. DB comment: “Card 8 Offline & Sync tenant policy. Setup only. Saving does not ship a runtime and must never read Offline Ready. SET6 JSONB posture is not…” |
| `pms_outlets` | Property Core, Reservations, Property Setup | Property Core: direct, Property Setup: direct, Reservations: generic | — | Outlet / facility master. DB comment: “PMS-SET2 outlet masters only. Folio posting is not rewritten in this wave.” |
| `pms_property_areas` | Property Setup | Property Setup: direct | — | Property areas. DB comment: “Card 1 named property areas. No FK cascade into rooms, outlets, or other modules. restaurants.property_areas JSON remains for compatibility.” |
| `pms_property_department_contacts` | Property Setup | — | — | Department contacts (0 rows, no app writer). DB comment: “Card 1 contact channels for a Card 5 department. Not a second department catalogue. restaurants.department_contacts JSON remains for compati…” |
| `pms_work_centers` | Property Setup | Property Setup: direct | — | Work centres within departments. DB comment: “PMS-SET5 work-centre catalogue under a department. Empty is a Warning.” |
| `restaurants` | Property Setup, Guest Profile, Front Office, Rate & Revenue, Reservations, +18 more | Platform Admin: direct, Shared Core: direct, Property Setup: direct, Security / Permissions: direct, +8 more | writes: `adjust_business_date(U)`, `close_business_date(U)`; triggers: `enforce_restaurant_protected_fields`, `seed_restaurant_package_entitlements` | Property (tenant) master incl. business_date and many policy columns. Direct writes from: Platform Admin, Security / Permissions, Rooms & Inventory, Maintenance, Reports / Analytics, Distribution, Taxes & Fees, Housekeeping, Guest Profile. |

### Reservations (31 tables)

Domain: **Reservations** · Primary owner: **Reservations**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `hotel_reservation_counters` | CONFIGURATION | PMS | `restaurant_id` | 5 | — | — | — | 03a-reservations-core | NO | MULTIW |
| `hotel_reservation_history` | HISTORY | PMS | `id` | 389 | reservation_id→hotel_reservations | hotel_reservations | — | 03a-reservations-core | NO | MULTIW, XWRITE, XREF |
| `hotel_reservation_packages` | TRANSACTION | PMS | `id` | 11 | package_activation_id→hotel_package_activations, package_id→pms_packages, reservation_id→hotel_reservations, reservation_room_id→hotel_reservation_rooms | hotel_package_activations, pms_packages, hotel_reservations, hotel_reservation_rooms | — | 03a-reservations-core | NO | XREF |
| `hotel_reservation_promotions` | BRIDGE | PMS | `id` | 1 | promotion_activation_id→hotel_promotion_activations, promotion_id→pms_promotions, reservation_id→hotel_reservations | hotel_promotion_activations, pms_promotions, hotel_reservations | — | 03a-reservations-core | NO | — |
| `hotel_reservation_room_guests` | BRIDGE | PMS | `id` | 67 | guest_id→guest_profiles, reservation_id→hotel_reservations, reservation_id,reservation_room_id→hotel_reservation_rooms | guest_profiles, hotel_reservations, hotel_reservation_rooms | — | 03a-reservations-core | NO | MULTIW, XREF |
| `hotel_reservation_rooms` | TRANSACTION | PMS | `id` | 67 | pms_group_block_id→pms_group_blocks, rate_plan_id→hotel_rate_plans, reservation_id→hotel_reservations, room_type_id→room_types, +1 more | pms_group_blocks, hotel_rate_plans, hotel_reservations, room_types, +1 more | fo_checkin_agreement_instances, fo_checkin_progress, folio_transactions, hotel_reservation_packages, hotel_reservation_room_guests, +1 more | 03a-reservations-core | YES | MULTIW, XWRITE, XREF |
| `hotel_reservations` | TRANSACTION | PMS | `id` | 65 | company_contact_id→guest_company_contacts, billing_rule_id→pms_billing_rules, booker_guest_id→guest_profiles, company_master_id→guest_account_masters, +12 more | guest_company_contacts, pms_billing_rules, guest_profiles, guest_account_masters, +8 more | fo_checkin_agreement_instances, fo_checkin_progress, fo_guest_requests, fo_stay_companions, guest_account_links, +14 more | 03a-reservations-core | YES | MULTIW, XWRITE, XREF |
| `pms_event_contract_defaults` | CONFIGURATION | PMS | `id` | 1 | deposit_policy_id→pms_deposit_policies | pms_deposit_policies | — | 03b-groups-sales-events | NO | — |
| `pms_event_package_template_outlets` | BRIDGE | PMS | `id` | 3 | outlet_id→pms_outlets, template_id→pms_event_package_templates | pms_outlets, pms_event_package_templates | — | 03b-groups-sales-events | NO | — |
| `pms_event_package_template_services` | BRIDGE | PMS | `id` | 0 | fo_service_id→fo_service_catalogue, template_id→pms_event_package_templates | fo_service_catalogue, pms_event_package_templates | — | 03b-groups-sales-events | NO | ZERO |
| `pms_event_package_templates` | CONFIGURATION | PMS | `id` | 2 | currency_code→pms_property_currencies, event_type_id→pms_event_types, tax_group_id→pms_tax_groups | pms_property_currencies, pms_event_types, pms_tax_groups | pms_event_package_template_outlets, pms_event_package_template_services | 03b-groups-sales-events | NO | — |
| `pms_event_statuses` | LOOKUP | PMS | `id` | 3 | — | — | — | 03b-groups-sales-events | NO | — |
| `pms_event_types` | LOOKUP | PMS | `id` | 8 | — | — | pms_event_package_templates | 03b-groups-sales-events | NO | MULTIW |
| `pms_function_space_labels` | LOOKUP | PMS | `id` | 8 | — | — | pms_function_space_outlets | 03b-groups-sales-events | NO | MULTIW |
| `pms_function_space_outlets` | BRIDGE | PMS | `id` | 4 | function_space_label_id→pms_function_space_labels, outlet_id→pms_outlets | pms_function_space_labels, pms_outlets | — | 03b-groups-sales-events | NO | — |
| `pms_group_allotment_nights` | TRANSACTION | PMS | `id` | 0 | group_block_id→pms_group_blocks | pms_group_blocks | — | 03b-groups-sales-events | NO | ZERO, NOFK |
| `pms_group_blocks` | TRANSACTION | PMS | `id` | 1 | group_id→pms_groups, room_type_id→room_types | pms_groups, room_types | hotel_reservation_rooms, hotel_reservations, pms_group_allotment_nights | 03b-groups-sales-events | NO | — |
| `pms_group_history` | HISTORY | PMS | `id` | 5 | group_id→pms_groups | pms_groups | — | 03b-groups-sales-events | NO | — |
| `pms_group_rooming_rows` | TRANSACTION | PMS | `id` | 2 | group_id→pms_groups | pms_groups | — | 03b-groups-sales-events | NO | NOFK |
| `pms_groups` | TRANSACTION | PMS | `id` | 2 | company_master_id→guest_account_masters, group_account_master_id→guest_account_masters, travel_agent_master_id→guest_account_masters | guest_account_masters | hotel_reservations, pms_group_blocks, pms_group_history, pms_group_rooming_rows | 03b-groups-sales-events | NO | NOFK |
| `pms_lead_types` | LOOKUP | PMS | `id` | 3 | — | — | — | 03b-groups-sales-events | NO | — |
| `pms_market_segments` | LOOKUP | PMS | `id` | 10 | — | — | guest_account_masters | 03a-reservations-core | NO | MULTIW, XREF |
| `pms_purpose_of_stay` | LOOKUP | PMS | `id` | 0 | — | — | — | 03a-reservations-core | NO | ZERO, XWRITE |
| `pms_reservation_overbooking_approvals` | AUDIT | PMS | `id` | 0 | reservation_id→hotel_reservations | hotel_reservations | — | 03a-reservations-core | NO | ZERO |
| `pms_sales_channel_labels` | LOOKUP | PMS | `id` | 3 | — | — | — | 03a-reservations-core | NO | — |
| `pms_sales_pipeline_stages` | LOOKUP | PMS | `id` | 11 | — | — | — | 03b-groups-sales-events | NO | — |
| `pms_source_codes` | LOOKUP | PMS | `id` | 9 | — | — | guest_account_masters | 03a-reservations-core | NO | MULTIW, XREF |
| `pms_waitlist_history` | HISTORY | PMS | `id` | 2 | waitlist_request_id→pms_waitlist_requests | pms_waitlist_requests | — | 03a-reservations-core | NO | — |
| `pms_waitlist_offers` | TRANSACTION | PMS | `id` | 1 | room_type_id→room_types, waitlist_request_id→pms_waitlist_requests | room_types, pms_waitlist_requests | — | 03a-reservations-core | NO | NOFK |
| `pms_waitlist_requests` | TRANSACTION | PMS | `id` | 1 | reservation_id→hotel_reservations, guest_id→guest_profiles, requested_room_type_id→room_types | hotel_reservations, guest_profiles, room_types | pms_waitlist_history, pms_waitlist_offers | 03a-reservations-core | NO | — |
| `reservation_traces` | TRANSACTION | PMS | `id` | 0 | reservation_id→hotel_reservations | hotel_reservations | — | 03a-reservations-core | NO | ZERO |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `hotel_reservation_counters` | Front Office, Reservations, Distribution | Front Office: rpc, Reservations: rpc, Distribution: rpc | writes: `amend_hotel_reservation(I)`, `apply_external_reservation_event(IU)`, `create_hotel_reservation(IU)` | Reservation number sequence. |
| `hotel_reservation_history` | Front Office, Reservations, Rate & Revenue, Housekeeping, Security / Permissions, +3 more | Front Office: rpc, Rate & Revenue: rpc, Reservations: direct, Direct Booking: direct, +1 more | writes: `amend_hotel_reservation(I)`, `amend_hotel_reservation_priced(I)`, `apply_external_reservation_event(I)`, `apply_inhouse_stay_date_change(I)`, `assign_hotel_reservation_room_unit(I)` +14 | Reservation lifecycle history. Direct writes from: Direct Booking. |
| `hotel_reservation_packages` | Reservations, Rate & Revenue, Guest Services, Front Office, Property Setup | Reservations: rpc | writes: `apply_hotel_reservation_room_package(I)`, `release_hotel_reservation_room_package(D)`, `sync_hotel_reservation_packages(ID)`; triggers: `hotel_reservation_packages_post_charge`, `hotel_reservation_packages_reverse_charge` | Packages applied to a reservation. DB comment: “Zero-to-many additive packages per reservation. applied_amount is commercial money outside hotel_reservations.room_subtotal. Missing rows on…” |
| `hotel_reservation_promotions` | Rate & Revenue, Reservations | Reservations: rpc | writes: `remove_hotel_reservation_promotion(D)`, `sync_hotel_reservation_promotion(ID)` | Promotion applied to a reservation. DB comment: “V1 at most one promotion per reservation. Stores commercial discount separately. Does not change hotel_reservations.room_subtotal. Missing r…” |
| `hotel_reservation_room_guests` | Front Office, Guest Profile, Direct Booking, Reservations, Distribution | Reservations: rpc, Distribution: rpc | writes: `apply_external_reservation_event(I)`, `assign_reservation_room_guests(IU)`, `manage_reservation_room_guest(IUD)` | Guests per reservation room unit. DB comment: “Occupants of one reservation room unit. The booking guest_id remains the lead guest.” |
| `hotel_reservation_rooms` | Front Office, Reservations, Rate & Revenue, Rooms & Inventory, Property Setup, +6 more | Front Office: direct, Rate & Revenue: rpc, Reservations: direct, Distribution: rpc | writes: `amend_hotel_reservation_priced(U)`, `apply_external_reservation_event(ID)`, `assign_hotel_reservation_room_unit(U)`, `cancel_hotel_reservation_unit(U)`, `change_hotel_stay_dates(U)` +7; triggers: `hotel_reservation_rooms_align_insert_status` | Room unit (stay line) within a reservation. Direct writes from: Front Office. |
| `hotel_reservations` | Front Office, Reservations, Rate & Revenue, Guest Profile, Night Audit, +8 more | Front Office: direct, Rate & Revenue: rpc, Reservations: direct, Direct Booking: direct, +2 more | writes: `amend_hotel_reservation(U)`, `amend_hotel_reservation_priced(U)`, `apply_external_reservation_event(IU)`, `cancel_hotel_reservation_unit(U)`, `change_hotel_stay_dates(U)` +11 | Reservation header. Direct writes from: Front Office, Direct Booking, Guest Profile. |
| `pms_event_contract_defaults` | Reservations | Reservations: direct | — | Event contract defaults. DB comment: “Card 5 event contract defaults. Setup only. Not live contracts, not pms_corporate_agreements, not AR.” |
| `pms_event_package_template_outlets` | Reservations | Reservations: generic | — | Event template outlets. DB comment: “Included Card 5 facilities for an event package template. Not a live booking.” |
| `pms_event_package_template_services` | Reservations | Reservations: generic | — | Event template services (FK to fo_service_catalogue). DB comment: “Included FO services for an event package template. Reuses fo_service_catalogue. Not a second service master.” |
| `pms_event_package_templates` | Reservations | Reservations: direct | — | Event package templates. DB comment: “Card 5 event package templates. Setup only. Not pms_packages stay packages and not consumed bookings.” |
| `pms_event_statuses` | Reservations | Reservations: generic | — | Event statuses. DB comment: “Card 5 event-status catalogue with display order. Setup only. Not live event execution.” |
| `pms_event_types` | Property Setup, Reservations | Property Setup: generic, Reservations: generic | — | Event types. DB comment: “PMS-SET6 event-type catalogue. Empty is a Warning, not a go-live block. No sample seed.” |
| `pms_function_space_labels` | Property Setup, Reservations | Reservations: direct, Property Setup: generic | — | Function space labels. DB comment: “PMS-SET6 optional function-space labels. Empty is a Warning.” |
| `pms_function_space_outlets` | Reservations | Reservations: generic | — | Function spaces mapped to outlets. DB comment: “Card 5 setup map: SET6 function-space label → pms_outlets venue. Not a second facility master. Not a live booking.” |
| `pms_group_allotment_nights` | Reservations | Reservations: direct | — | Group block nightly allotment; inventory_block_id has no FK. |
| `pms_group_blocks` | Reservations | Reservations: direct | — | Group room blocks. DB comment: “Group room-type allotment. Pickup is derived from linked hotel_reservations.” |
| `pms_group_history` | Reservations | Reservations: direct | — | Group lifecycle history. |
| `pms_group_rooming_rows` | Reservations | Reservations: direct | — | Rooming list rows; group_block_id, guest_id, room_type_id, reservation_id have no FK. |
| `pms_groups` | Reservations | Reservations: direct | — | Sales & events group header; leader_guest_id and rate_plan_id have no FK. |
| `pms_lead_types` | Reservations | Reservations: generic | — | Sales lead types. DB comment: “Card 5 / SET6-shaped lead-type catalogue. Setup only. Not a live lead or opportunity.” |
| `pms_market_segments` | Guest Profile, Property Setup, Reservations, Cashiering, Rate & Revenue | Property Setup: generic, Reservations: generic | — | Market segments. DB comment: “PMS-SET6 market-segment catalogue. Empty is a Warning, not a go-live block. No sample seed.” |
| `pms_purpose_of_stay` | Direct Booking, Reservations | Direct Booking: direct | — | Purpose of stay catalogue. Direct writes from: Direct Booking. |
| `pms_reservation_overbooking_approvals` | Night Audit | — | writes: `pms_enforce_explicit_overbooking(I)` | Explicit overbooking approvals (RPC-written). DB comment: “Immutable evidence of an explicit overbooking decision. Not an allowance counter. Consumption is derived from room-type shortages.” |
| `pms_sales_channel_labels` | Property Setup, Cashiering | Property Setup: generic | — | Sales channel labels. DB comment: “PMS-SET6 optional sales-channel labels. Empty is a Warning.” |
| `pms_sales_pipeline_stages` | Reservations | Reservations: generic | — | Sales pipeline stages. DB comment: “Card 5 sales-pipeline stage catalogue. Setup only. Not opportunities, leads, or pipeline transactions.” |
| `pms_source_codes` | Guest Profile, Property Setup, Reservations, Cashiering, Distribution, +1 more | Property Setup: generic, Reservations: generic | — | Source codes. DB comment: “PMS-SET6 source-code catalogue. Empty is a Warning, not a go-live block. No sample seed.” |
| `pms_waitlist_history` | Reservations | Reservations: direct | — | Waitlist history. DB comment: “Operational waitlist event log. Not the Security & Audit card.” |
| `pms_waitlist_offers` | Reservations | Reservations: direct | — | Waitlist offers; rate_plan_id has no FK. DB comment: “Persisted waitlist offer snapshot. Matches are derived from inventory until an offer is created.” |
| `pms_waitlist_requests` | Reservations, Night Audit | Reservations: direct | — | Waitlist requests. DB comment: “Hotel waitlist request. Not a reservation stay and not F&B table waitlist.” |
| `reservation_traces` | Reservations | Reservations: direct | — | Reservation traces (department follow-ups). DB comment: “Follow-up traces for one reservation. Overdue is a past due date, not a stored status. Housekeeping tasks stay in their own table.” |

### Front Office (5 tables)

Domain: **Front Office** · Primary owner: **Front Office**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `fo_checkin_agreement_instances` | TRANSACTION | PMS | `id` | 10 | agreement_version_id→pms_registration_agreement_versions, guest_id→guest_profiles, reservation_id→hotel_reservations, reservation_room_id→hotel_reservation_rooms | pms_registration_agreement_versions, guest_profiles, hotel_reservations, hotel_reservation_rooms | — | 05-front-office-guest-services | NO | — |
| `fo_checkin_progress` | TRANSACTION | PMS | `id` | 24 | deposit_transaction_id→folio_transactions, reservation_id→hotel_reservations, reservation_id→hotel_reservations, reservation_room_id→hotel_reservation_rooms | folio_transactions, hotel_reservations, hotel_reservation_rooms | — | 05-front-office-guest-services | NO | — |
| `fo_guest_requests` | TRANSACTION | PMS | `id` | 1 | reservation_id→hotel_reservations, reservation_id→hotel_reservations | hotel_reservations | — | 05-front-office-guest-services | NO | DUP |
| `fo_stay_companions` | BRIDGE | PMS | `id` | 0 | guest_id→guest_profiles, reservation_id→hotel_reservations, guest_id→guest_profiles, reservation_id→hotel_reservations | guest_profiles, hotel_reservations | — | 05-front-office-guest-services | NO | ZERO, DUP |
| `pms_registration_agreement_versions` | CONFIGURATION | PMS | `id` | 11 | — | — | fo_checkin_agreement_instances | 05-front-office-guest-services | NO | MULTIW, XWRITE |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `fo_checkin_agreement_instances` | Front Office | Front Office: direct | triggers: `fo_checkin_agreement_instances_guard`; reads: `pms_registration_agreement_versions_freeze[trg]` | Signed registration card per room unit; immutable once signed. |
| `fo_checkin_progress` | Front Office, Property Setup | Front Office: direct | triggers: `fo_checkin_progress_require_unit` | Check-in checklist state (registration, deposit, key) per reservation/unit. |
| `fo_guest_requests` | Front Office | Front Office: direct | — | Free-text guest requests per reservation. Overlaps guest_service_history (typed service requests). |
| `fo_stay_companions` | Front Office | Front Office: direct | — | Reservation companions (0 rows). Overlaps hotel_reservation_room_guests. |
| `pms_registration_agreement_versions` | Guest Profile, Front Office | Front Office: direct, Guest Profile: direct | triggers: `pms_registration_agreement_versions_freeze` | Registration card agreement versions. Direct writes from: Guest Profile. |

### Guest Profile (42 tables)

Domain: **Guest Profile** · Primary owner: **Guest Profile**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `guest_account_history` | HISTORY | PMS | `id` | 206 | master_id→guest_account_masters | guest_account_masters | — | 02b-guest-accounts-agreements | NO | — |
| `guest_account_links` | BRIDGE | PMS | `id` | 27 | guest_id→guest_profiles, master_id→guest_account_masters, reservation_id→hotel_reservations | guest_profiles, guest_account_masters, hotel_reservations | — | 02b-guest-accounts-agreements | NO | — |
| `guest_account_masters` | MASTER | PMS | `id` | 32 | business_profile_type_id→pms_business_profile_types, default_billing_rule_id→pms_billing_rules, default_deposit_policy_id→pms_deposit_policies, default_no_show_policy_id→pms_no_show_policies, +10 more | pms_business_profile_types, pms_billing_rules, pms_deposit_policies, pms_no_show_policies, +8 more | financial_accounts, guest_account_history, guest_account_links, guest_account_masters (self), guest_company_contacts, +10 more | 02b-guest-accounts-agreements | YES | XREF |
| `guest_company_contact_roles` | BRIDGE | PMS | `contact_id, role_id` | 5 | contact_id→guest_company_contacts, role_id→pms_business_contact_roles | guest_company_contacts, pms_business_contact_roles | — | 02b-guest-accounts-agreements | NO | — |
| `guest_company_contacts` | MASTER | PMS | `id` | 22 | department_id→pms_departments, company_master_id→guest_account_masters | pms_departments, guest_account_masters | guest_company_contact_roles, hotel_reservations | 02b-guest-accounts-agreements | NO | — |
| `guest_company_documents` | MASTER | PMS | `id` | 2 | agreement_id→pms_corporate_agreements, document_type_id→pms_company_document_types, company_master_id→guest_account_masters | pms_corporate_agreements, pms_company_document_types, guest_account_masters | — | 02b-guest-accounts-agreements | NO | — |
| `guest_documents` | MASTER | PMS | `id` | 26 | id_type_id→pms_guest_id_types, guest_id→guest_profiles | pms_guest_id_types, guest_profiles | — | 02a-guest-profile-individual | NO | — |
| `guest_emergency_contacts` | MASTER | PMS | `id` | 3 | guest_id→guest_profiles | guest_profiles | — | 02a-guest-profile-individual | NO | — |
| `guest_merge_ledger` | HISTORY | PMS | `id` | 0 | retired_id→guest_profiles, survivor_id→guest_profiles | guest_profiles | — | 02a-guest-profile-individual | NO | ZERO |
| `guest_preference_values` | MASTER | PMS | `id` | 41 | guest_id→guest_profiles, preference_type_id→pms_guest_preference_types | guest_profiles, pms_guest_preference_types | — | 02a-guest-profile-individual | NO | DUP |
| `guest_preferences` | MASTER | PMS | `id` | 7 | guest_id→guest_profiles | guest_profiles | — | 02a-guest-profile-individual | NO | DUP |
| `guest_profile_counters` | CONFIGURATION | PMS | `restaurant_id` | 7 | — | — | — | 02a-guest-profile-individual | NO | — |
| `guest_profile_history` | HISTORY | PMS | `id` | 258 | guest_id→guest_profiles | guest_profiles | — | 02a-guest-profile-individual | NO | MULTIW, XWRITE |
| `guest_profiles` | MASTER | PMS | `id` | 50 | merged_into_guest_id→guest_profiles, profile_type_id→pms_guest_profile_types | guest_profiles (self), pms_guest_profile_types | fo_checkin_agreement_instances, fo_stay_companions, guest_account_links, guest_account_masters, guest_documents, +12 more | 02a-guest-profile-individual | YES | MULTIW, XWRITE, XREF |
| `guest_tax_identities` | MASTER | PMS | `id` | 1 | guest_profile_id→guest_profiles | guest_profiles | — | 02a-guest-profile-individual | NO | — |
| `pms_account_create_drafts` | TRANSACTION | PMS | `id` | 13 | — | — | — | 02b-guest-accounts-agreements | NO | — |
| `pms_account_type_labels` | LOOKUP | PMS | `id` | 4 | — | — | — | 02b-guest-accounts-agreements | NO | — |
| `pms_agency_allotments` | TRANSACTION | PMS | `id` | 1 | agency_master_id→guest_account_masters, room_type_id→room_types | guest_account_masters, room_types | — | 02b-guest-accounts-agreements | NO | DUP |
| `pms_agency_allowed_room_types` | BRIDGE | PMS | `restaurant_id, agency_master_id, room_type_id` | 0 | agency_master_id→guest_account_masters, room_type_id→room_types | guest_account_masters, room_types | — | 02b-guest-accounts-agreements | NO | ZERO |
| `pms_agency_commission_entries` | LEDGER | PMS | `id` | 0 | commission_rule_id→pms_agency_commission_rules, plan_id→pms_agency_commission_plans, agency_master_id→guest_account_masters, reservation_id→hotel_reservations | pms_agency_commission_rules, pms_agency_commission_plans, guest_account_masters, hotel_reservations | — | 02b-guest-accounts-agreements | NO | ZERO |
| `pms_agency_commission_plans` | CONFIGURATION | PMS | `id` | 11 | agency_master_id→guest_account_masters | guest_account_masters | pms_agency_commission_entries, pms_agency_commission_rules | 02b-guest-accounts-agreements | NO | NOFK |
| `pms_agency_commission_rules` | CONFIGURATION | PMS | `id` | 10 | commission_plan_id→pms_agency_commission_plans, rate_plan_id→hotel_rate_plans, room_type_id→room_types | pms_agency_commission_plans, hotel_rate_plans, room_types | pms_agency_commission_entries | 02b-guest-accounts-agreements | NO | — |
| `pms_agency_notification_prefs` | CONFIGURATION | PMS | `restaurant_id, agency_master_id, event_key, channel` | 0 | agency_master_id→guest_account_masters | guest_account_masters | — | 02b-guest-accounts-agreements | NO | ZERO |
| `pms_agency_rate_defaults` | CONFIGURATION | PMS | `id` | 0 | agency_master_id→guest_account_masters, rate_plan_id→hotel_rate_plans, room_type_id→room_types | guest_account_masters, hotel_rate_plans, room_types | — | 02b-guest-accounts-agreements | NO | ZERO |
| `pms_business_contact_roles` | LOOKUP | PMS | `id` | 28 | — | — | guest_company_contact_roles | 02b-guest-accounts-agreements | NO | — |
| `pms_business_profile_settings` | CONFIGURATION | PMS | `restaurant_id` | 7 | default_business_type_id→pms_business_profile_types | pms_business_profile_types | — | 02b-guest-accounts-agreements | NO | — |
| `pms_business_profile_types` | LOOKUP | PMS | `id` | 57 | — | — | guest_account_masters, pms_business_profile_settings | 02b-guest-accounts-agreements | NO | — |
| `pms_company_document_types` | LOOKUP | PMS | `id` | 56 | — | — | guest_company_documents | 02b-guest-accounts-agreements | NO | — |
| `pms_contract_rates` | CONFIGURATION | PMS | `id` | 5 | agreement_id→pms_corporate_agreements, room_type_id→room_types | pms_corporate_agreements, room_types | — | 02b-guest-accounts-agreements | NO | — |
| `pms_contract_types` | LOOKUP | PMS | `id` | 5 | — | — | pms_corporate_agreements | 02b-guest-accounts-agreements | NO | — |
| `pms_corporate_agreements` | MASTER | PMS | `id` | 13 | agency_master_id→guest_account_masters, contract_type_id→pms_contract_types, deposit_policy_id→pms_deposit_policies, no_show_policy_id→pms_no_show_policies, +3 more | guest_account_masters, pms_contract_types, pms_deposit_policies, pms_no_show_policies, +2 more | guest_company_documents, pms_contract_rates | 02b-guest-accounts-agreements | NO | — |
| `pms_group_create_drafts` | TRANSACTION | PMS | `id` | 6 | — | — | — | 02b-guest-accounts-agreements | NO | — |
| `pms_group_templates` | CONFIGURATION | PMS | `id` | 0 | — | — | — | 02b-guest-accounts-agreements | NO | ZERO |
| `pms_group_types` | LOOKUP | PMS | `id` | 49 | — | — | guest_account_masters | 02b-guest-accounts-agreements | NO | MULTIW, XWRITE |
| `pms_guest_create_drafts` | TRANSACTION | PMS | `id` | 6 | — | — | — | 02a-guest-profile-individual | NO | — |
| `pms_guest_fields` | CONFIGURATION | PMS | `id` | 878 | — | — | — | 02a-guest-profile-individual | NO | — |
| `pms_guest_id_types` | LOOKUP | PMS | `id` | 28 | — | — | guest_documents | 02a-guest-profile-individual | NO | MULTIW |
| `pms_guest_preference_categories` | LOOKUP | PMS | `id` | 28 | — | — | pms_guest_preference_types | 02a-guest-profile-individual | NO | — |
| `pms_guest_preference_types` | CONFIGURATION | PMS | `id` | 53 | category_id→pms_guest_preference_categories | pms_guest_preference_categories | guest_preference_values | 02a-guest-profile-individual | NO | — |
| `pms_guest_profile_types` | CONFIGURATION | PMS | `id` | 28 | — | — | guest_profiles | 02a-guest-profile-individual | NO | — |
| `pms_guest_vip_levels` | LOOKUP | PMS | `id` | 0 | — | — | — | 02a-guest-profile-individual | NO | ZERO |
| `pms_preference_options` | LOOKUP | PMS | `id` | 0 | — | — | — | 02a-guest-profile-individual | NO | ZERO, DUP |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `guest_account_history` | Guest Profile | Guest Profile: direct | — | Append-only history for account masters. DB comment: “Wave 4 append-only history for Guest account masters. Not the Wave 5 Comms card.” |
| `guest_account_links` | Guest Profile, Cashiering | Guest Profile: direct | — | Individual guest to account-master roles. DB comment: “Wave 4 individual-to-master roles. Unlink does not delete the guest or the master. Bill-to is an association, not folio split routing.” |
| `guest_account_masters` | Guest Profile, Cashiering, Rate & Revenue, Fiscal / Invoicing, Front Office | Guest Profile: direct | reads: `create_hotel_reservation`, `freeze_company_invoice_fiscal_identity[trg]`, `issue_financial_account_invoice_draft` +4 | Company / group account / travel agent master. DB comment: “Wave 4 Guest-owned Company / Group account / Travel Agent masters. Group account is not a Sales & Events group block.” |
| `guest_company_contact_roles` | Guest Profile | Guest Profile: direct | — | Contact role assignments. DB comment: “Assigned Card 4 contact roles. Inactive roles stay readable on existing contacts.” |
| `guest_company_contacts` | Guest Profile | Guest Profile: direct | — | Company contact persons. DB comment: “Operational contact persons for a Guest Company master. One primary contact per company.” |
| `guest_company_documents` | Guest Profile | Guest Profile: direct | — | Company document metadata. |
| `guest_documents` | Guest Profile, Front Office, Property Setup | Guest Profile: direct | — | Guest ID / supporting document metadata. DB comment: “Wave 2 guest ID / supporting document metadata. Staff verify is not government KYC.” |
| `guest_emergency_contacts` | Guest Profile | Guest Profile: direct | — | Guest emergency contacts. DB comment: “Gap-edit #2 Individual emergency contacts. Cascades with the guest. Not a family graph.” |
| `guest_merge_ledger` | Guest Profile | Guest Profile: direct | — | Guest merge snapshot for unmerge. DB comment: “Wave 5 merge snapshot for unmerge. Merges without a ledger cannot be silently undone — record an exception instead.” |
| `guest_preference_values` | Guest Profile | Guest Profile: direct | — | Dynamic preference answers (EAV on pms_guest_preference_types). |
| `guest_preferences` | Guest Profile, Front Office | Guest Profile: direct | — | Fixed-column guest preferences. Overlaps guest_preference_values. |
| `guest_profile_counters` | Guest Profile | Guest Profile: rpc | writes: `next_guest_profile_number(I)` | Guest profile number sequence. |
| `guest_profile_history` | Guest Profile, Security / Permissions, Direct Booking | Guest Profile: direct, Direct Booking: direct | — | Guest profile change history. Direct writes from: Direct Booking. |
| `guest_profiles` | Front Office, Guest Profile, Reservations, Cashiering, Direct Booking, +5 more | Reservations: direct, Front Office: direct, Guest Profile: direct, Direct Booking: direct, +1 more | writes: `apply_external_reservation_event(IU)`; triggers: `normalize_guest_contact` | Hotel guest identity. Direct writes from: Reservations, Front Office, Direct Booking. |
| `guest_tax_identities` | Guest Profile, Fiscal / Invoicing | Guest Profile: rpc | writes: `save_guest_tax_identity(IU)`, `set_default_guest_tax_identity(U)`, `set_guest_tax_identity_active(U)` | Guest buyer tax identities used for fiscal invoices. |
| `pms_account_create_drafts` | Guest Profile | Guest Profile: direct | — | Account-master create wizard drafts (JSON payload). DB comment: “In-progress Register New Company / Travel Agency payloads. Not searchable account masters.” |
| `pms_account_type_labels` | Property Setup | Property Setup: generic | — | Account type labels. DB comment: “PMS-SET6 optional account-type labels. Empty is a Warning. Not a sales CRM.” |
| `pms_agency_allotments` | Guest Profile | Guest Profile: direct | — | Travel agency allotments. Overlaps group blocks / operational inventory blocks as an inventory-hold concept. |
| `pms_agency_allowed_room_types` | Guest Profile | Guest Profile: direct | — | Agency allowed room types. |
| `pms_agency_commission_entries` | Guest Profile | Guest Profile: direct | — | Agency commission accruals per reservation. |
| `pms_agency_commission_plans` | Guest Profile | Guest Profile: direct | — | Agency commission plans; agreement_id has no FK. |
| `pms_agency_commission_rules` | Guest Profile | Guest Profile: direct | — | Agency commission rules. |
| `pms_agency_notification_prefs` | Guest Profile | Guest Profile: direct | — | Agency notification preferences. |
| `pms_agency_rate_defaults` | Rate & Revenue, Guest Profile | Guest Profile: direct | — | Agency default rate plans per room type. |
| `pms_business_contact_roles` | Guest Profile | Guest Profile: direct | — | Business contact role catalogue. DB comment: “Card 4 contact-role catalogue for company contact persons. Not guest profile types.” |
| `pms_business_profile_settings` | Guest Profile | Guest Profile: direct | — | Business profile settings. DB comment: “Card 4 business profile settings. Configuration only; no credit accounting.” |
| `pms_business_profile_types` | Guest Profile | Guest Profile: direct | — | Business profile types. DB comment: “Card 4 business profile type catalogue. Not guest profile types and not company billing.” |
| `pms_company_document_types` | Guest Profile | Guest Profile: direct | — | Company document type catalogue. |
| `pms_contract_rates` | Guest Profile, Rate & Revenue | Guest Profile: direct | — | Contract rates under corporate/agency agreements. DB comment: “Card 3 contract-rate lines. Setup figure in the agreement currency. Not a quote RPC, not hotel_rate_plans, not a reservation snapshot.” |
| `pms_contract_types` | Guest Profile | Guest Profile: direct | — | Contract type catalogue. |
| `pms_corporate_agreements` | Guest Profile, Rate & Revenue | Guest Profile: direct | — | Corporate / agency agreements. DB comment: “Card 3 corporate-agreement catalogue. Company identity is guest_account_masters. Not AR, not a reservation snapshot, not an authorized-booke…” |
| `pms_group_create_drafts` | Guest Profile | Guest Profile: direct | — | Group account create wizard drafts. DB comment: “In-progress Register New Group payloads. Not searchable group masters.” |
| `pms_group_templates` | Guest Profile | Guest Profile: direct | — | Group account templates. DB comment: “Reusable group creation defaults. Applying a template copies payload into a new group master.” |
| `pms_group_types` | Guest Profile, Reservations | Reservations: direct, Guest Profile: direct | — | Group type catalogue (FK target of guest_account_masters). Direct writes from: Reservations. |
| `pms_guest_create_drafts` | Guest Profile | Guest Profile: direct | — | Guest create wizard drafts. DB comment: “In-progress Individual guest creation payloads. Not searchable guests.” |
| `pms_guest_fields` | Guest Profile | Guest Profile: direct | — | Dynamic guest field definitions. DB comment: “Card 4 Required Fields catalogue. Not SET3 guest-rules JSON and not operational guest forms.” |
| `pms_guest_id_types` | Guest Profile, Property Setup | Property Setup: direct, Guest Profile: direct | triggers: `normalize_pms_guest_id_type_flags` | ID document types. DB comment: “Property identity-document type configuration shared by Card 4 and SET3. Contains no guest identity data.” |
| `pms_guest_preference_categories` | Guest Profile | Guest Profile: direct | — | Preference categories. DB comment: “Card 4 preference categories. Not Wave 2 pms_preference_options and not guest preference values.” |
| `pms_guest_preference_types` | Guest Profile | Guest Profile: direct | — | Preference type definitions. DB comment: “Card 4 preference type definitions. Configuration only; no guest preference values.” |
| `pms_guest_profile_types` | Guest Profile, Integrations | Guest Profile: direct | — | Guest profile types (required fields / documents). DB comment: “Card 4 Profile Types catalogue. Not the operational Guest Profile type switcher.” |
| `pms_guest_vip_levels` | Property Setup | Property Setup: direct | — | VIP levels. DB comment: “PMS-SET3 VIP-level catalogue. Empty is a Warning, not a go-live block.” |
| `pms_preference_options` | Guest Profile | Guest Profile: direct | — | Preference options (0 rows). Overlaps pms_guest_preference_types.options. |

### Rooms & Inventory (14 tables)

Domain: **Rooms & Inventory** · Primary owner: **Rooms & Inventory**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `hotel_room_amenity_overrides` | BRIDGE | PMS | `id` | 4 | amenity_id→room_amenities, room_id→hotel_rooms | room_amenities, hotel_rooms | — | 04-rooms-inventory | NO | — |
| `hotel_room_links` | BRIDGE | PMS | `id` | 1 | other_room_id→hotel_rooms, room_id→hotel_rooms | hotel_rooms | — | 04-rooms-inventory | NO | — |
| `hotel_rooms` | MASTER | PMS | `id` | 147 | building_id→hotel_buildings, floor_id→hotel_floors, restriction_maintenance_request_id→housekeeping_maintenance_requests, room_type_id→room_types, +1 more | hotel_buildings, hotel_floors, housekeeping_maintenance_requests, room_types, +1 more | hotel_reservation_rooms, hotel_reservations, hotel_room_amenity_overrides, hotel_room_links, housekeeping_discrepancies, +6 more | 04-rooms-inventory | YES | MULTIW, XWRITE, XREF |
| `pms_inventory_block_type_rules` | CONFIGURATION | PMS | `id` | 54 | restaurant_id→pms_inventory_rules | pms_inventory_rules | — | 04-rooms-inventory | NO | — |
| `pms_inventory_rules` | CONFIGURATION | PMS | `id` | 6 | — | — | pms_inventory_block_type_rules | 04-rooms-inventory | NO | MULTIW |
| `pms_operational_inventory_blocks` | TRANSACTION | PMS | `id` | 3 | room_id→hotel_rooms, room_type_id→room_types | hotel_rooms, room_types | pms_room_inventory_events | 04-rooms-inventory | NO | MULTIW, NOFK |
| `pms_overbooking_date_limits` | CONFIGURATION | PMS | `id` | 0 | room_type_id→room_types | room_types | — | 04-rooms-inventory | NO | ZERO |
| `pms_room_inventory_events` | HISTORY | PMS | `id` | 9 | block_id→pms_operational_inventory_blocks, room_id→hotel_rooms | pms_operational_inventory_blocks, hotel_rooms | — | 04-rooms-inventory | NO | — |
| `pms_room_type_overbooking_rules` | CONFIGURATION | PMS | `id` | 2 | room_type_id→room_types | room_types | — | 04-rooms-inventory | NO | — |
| `room_amenities` | MASTER | PMS | `id` | 1,155 | — | — | hotel_room_amenity_overrides, pms_package_components, room_type_amenities | 04-rooms-inventory | NO | MULTIW, XREF |
| `room_type_amenities` | BRIDGE | PMS | `id` | 298 | amenity_id→room_amenities, room_type_id→room_types | room_amenities, room_types | — | 04-rooms-inventory | NO | — |
| `room_type_beds` | CONFIGURATION | PMS | `id` | 30 | room_type_id→room_types | room_types | — | 04-rooms-inventory | NO | — |
| `room_type_images` | MASTER | PMS | `id` | 45 | room_type_id→room_types | room_types | — | 04-rooms-inventory | NO | XREF |
| `room_types` | MASTER | PMS | `id` | 30 | default_building_id→hotel_buildings, default_wing_id→hotel_wings, preferred_floor_id→hotel_floors | hotel_buildings, hotel_wings, hotel_floors | distribution_room_mappings, hotel_competitor_room_mappings, hotel_package_activation_room_types, hotel_promotion_activation_room_types, hotel_rate_change_events, +24 more | 04-rooms-inventory | YES | MULTIW, XREF |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `hotel_room_amenity_overrides` | Rooms & Inventory | Rooms & Inventory: direct | — | Room-level amenity overrides. DB comment: “Room-specific amenity add/remove vs room_type_amenities. Effective set = type mappings plus add minus remove. Reset to type defaults = DELET…” |
| `hotel_room_links` | Rooms & Inventory | Rooms & Inventory: direct | reads: `pms_evaluate_room_assignment` | Connecting-room links. DB comment: “Connecting and adjacent physical-room pairs. Same-restaurant FKs only.” |
| `hotel_rooms` | Front Office, Reservations, Rate & Revenue, Rooms & Inventory, Housekeeping, +7 more | Housekeeping: direct, Property Setup: direct, Rooms & Inventory: direct, Front Office: rpc | writes: `check_in_hotel_reservation(U)`, `check_out_hotel_reservation(U)`, `housekeeping_complete_task(U)`, `housekeeping_inspect_room(U)`, `pms_set_room_operational_restriction(U)`; triggers: `pms_hotel_rooms_operational_status_guard` | Physical room master incl. housekeeping / maintenance status columns. Direct writes from: Housekeeping. |
| `pms_inventory_block_type_rules` | Rooms & Inventory, Reservations | Rooms & Inventory: direct | reads: `pms_assert_operational_block_activatable`, `pms_create_operational_block` | Operational block type rules. DB comment: “Card 2 block TYPE policy only. No room_id, dates, block instances, or restriction-reason mapping. Inventory impact is configuration; 0066 do…” |
| `pms_inventory_rules` | Rooms & Inventory, Rate & Revenue, Reservations | Rooms & Inventory: direct, Rate & Revenue: generic | reads: `assert_room_assignable`, `pms_evaluate_room_assignment`, `pms_prepare_explicit_overbooking` +4 | Room inventory / assignment rules. DB comment: “Card 2 Inventory Rules configuration only. Does not allow reservations beyond capacity, does not modify count_sellable_rooms, assert_reserva…” |
| `pms_operational_inventory_blocks` | Rooms & Inventory, Reservations, Front Office | Reservations: rpc, Rooms & Inventory: rpc | writes: `pms_activate_operational_block(U)`, `pms_approve_operational_block(U)`, `pms_cancel_operational_block(U)`, `pms_create_operational_block(I)`, `pms_release_operational_block(U)` | Operational inventory blocks (OOO/OOS/holds); group_id has no FK. |
| `pms_overbooking_date_limits` | Rooms & Inventory | Rooms & Inventory: direct | reads: `pms_room_type_overbooking_effective_limits` | Date-specific overbooking limits. |
| `pms_room_inventory_events` | Rooms & Inventory | Rooms & Inventory: direct | writes: `pms_write_room_inventory_event(I)` | Room inventory change history. |
| `pms_room_type_overbooking_rules` | Rooms & Inventory | Rooms & Inventory: direct | reads: `pms_room_type_overbooking_effective_limits` | Room-type overbooking rules. DB comment: “Per room-type overbooking allowance. Independent of every other room type. Not a shared property pool.” |
| `room_amenities` | Rate & Revenue, Rooms & Inventory, Property Setup, Guest Services, Front Office | Rooms & Inventory: direct, Property Setup: direct | reads: `apply_hotel_package_activation` | Amenity catalogue. |
| `room_type_amenities` | Rooms & Inventory, Direct Booking, Front Office | Rooms & Inventory: direct | — | Room type amenities. |
| `room_type_beds` | Rooms & Inventory, Direct Booking, Front Office | Rooms & Inventory: direct | reads: `pms_evaluate_room_assignment` | Room type bed configuration. DB comment: “Multi-row bed configuration per room type. Source of truth over room_types.bed_type/bed_count.” |
| `room_type_images` | Rooms & Inventory, Direct Booking, Front Office, Reservations | Rooms & Inventory: direct | — | Room type images. |
| `room_types` | Rate & Revenue, Guest Profile, Rooms & Inventory, Reservations, Front Office, +5 more | Rooms & Inventory: direct, Property Setup: generic, Rate & Revenue: generic | reads: `apply_hotel_package_activation`, `apply_hotel_promotion_activation`, `assert_reservation_capacity` +10 | Room type master. |

### Housekeeping (9 tables)

Domain: **Housekeeping** · Primary owner: **Housekeeping**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `housekeeping_discrepancies` | TRANSACTION | PMS | `id` | 2 | room_id→hotel_rooms | hotel_rooms | — | 06-housekeeping-maintenance | NO | — |
| `housekeeping_history` | HISTORY | PMS | `id` | 165 | room_id→hotel_rooms | hotel_rooms | — | 06-housekeeping-maintenance | NO | MULTIW, XWRITE, XREF |
| `housekeeping_inspections` | TRANSACTION | PMS | `id` | 40 | room_id→hotel_rooms, task_id→housekeeping_tasks | hotel_rooms, housekeeping_tasks | — | 06-housekeeping-maintenance | NO | — |
| `housekeeping_maintenance_requests` | TRANSACTION | PMS | `id` | 5 | room_id→hotel_rooms | hotel_rooms | hotel_rooms | 06-housekeeping-maintenance | NO | LEGACY |
| `housekeeping_tasks` | TRANSACTION | PMS | `id` | 43 | room_id→hotel_rooms | hotel_rooms | housekeeping_inspections | 06-housekeeping-maintenance | YES | XREF |
| `pms_housekeeping_priority_rules` | CONFIGURATION | PMS | `id` | 70 | — | — | — | 06-housekeeping-maintenance | NO | — |
| `pms_housekeeping_settings` | CONFIGURATION | PMS | `restaurant_id` | 10 | default_housekeeping_status→pms_housekeeping_status_catalog | pms_housekeeping_status_catalog | — | 06-housekeeping-maintenance | NO | — |
| `pms_housekeeping_status_catalog` | LOOKUP | PMS | `id` | 113 | — | — | pms_housekeeping_settings, pms_housekeeping_transition_rules | 06-housekeeping-maintenance | NO | — |
| `pms_housekeeping_transition_rules` | CONFIGURATION | PMS | `id` | 40 | from_status_code→pms_housekeeping_status_catalog, to_status_code→pms_housekeeping_status_catalog | pms_housekeeping_status_catalog | — | 06-housekeeping-maintenance | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `housekeeping_discrepancies` | Night Audit, Housekeeping, Front Office | Housekeeping: direct | — | Occupancy / HK status discrepancies. |
| `housekeeping_history` | Front Office, Housekeeping, Rooms & Inventory, Security / Permissions | Housekeeping: direct, Rooms & Inventory: direct, Front Office: rpc | writes: `check_in_hotel_reservation(I)`, `check_out_hotel_reservation(I)`, `housekeeping_complete_task(I)`, `housekeeping_create_task(I)`, `housekeeping_inspect_room(I)` +1 | Room HK status history. Direct writes from: Rooms & Inventory. |
| `housekeeping_inspections` | Housekeeping, Rooms & Inventory | Housekeeping: rpc | writes: `housekeeping_inspect_room(I)` | Room inspections. |
| `housekeeping_maintenance_requests` | Housekeeping, Rooms & Inventory, Night Audit | Housekeeping: direct | reads: `pms_set_room_operational_restriction` | Maintenance requests raised and progressed only by the Housekeeping module; owner moved from Maintenance to Housekeeping (ARCH-02). Maintenance owns rules and catalogues. |
| `housekeeping_tasks` | Night Audit, Housekeeping, Rooms & Inventory, Front Office | Housekeeping: direct | writes: `housekeeping_complete_task(U)`, `housekeeping_create_task(I)` | Housekeeping tasks. |
| `pms_housekeeping_priority_rules` | Housekeeping | Housekeeping: direct | reads: `pms_housekeeping_event_priority` | HK priority rules. DB comment: “Property event priority policy. priority_code maps to housekeeping task severity.” |
| `pms_housekeeping_settings` | Front Office, Rooms & Inventory, Housekeeping | Housekeeping: direct | reads: `pms_evaluate_room_assignment`, `pms_housekeeping_event_priority`, `pms_housekeeping_transition_target` | HK settings. DB comment: “Card 2 Step 3 property rules only. Daily housekeeping remains in the operational module.” |
| `pms_housekeeping_status_catalog` | Front Office, Housekeeping | Housekeeping: direct | triggers: `protect_pms_housekeeping_core_status`; reads: `pms_housekeeping_transition_target` | HK status catalogue. DB comment: “Cross-dimension status registry. Only housekeeping-domain operational codes write hotel_rooms.housekeeping_status.” |
| `pms_housekeeping_transition_rules` | Front Office, Housekeeping | Housekeeping: direct | reads: `pms_housekeeping_transition_target` | HK status transition rules. DB comment: “Property event-transition configuration consumed by housekeeping and Front Office server flows.” |

### Cashiering (17 tables)

Domain: **Cashiering** · Primary owner: **Cashiering**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `financial_account_counters` | CONFIGURATION | PMS | `restaurant_id` | 2 | — | — | — | 07-cashiering-ledger | NO | — |
| `financial_account_participants` | BRIDGE | PMS | `financial_account_id, guest_folio_id` | 0 | financial_account_id→financial_accounts, guest_folio_id→guest_folios | financial_accounts, guest_folios | — | 07-cashiering-ledger | NO | NOREF, ZERO |
| `financial_account_payment_allocations` | LEDGER | PMS | `id` | 0 | financial_account_id→financial_accounts, invoice_id→financial_account_invoices, payment_transaction_id→folio_transactions, reverses_allocation_id→financial_account_payment_allocations | financial_accounts, financial_account_invoices, folio_transactions, financial_account_payment_allocations (self) | financial_account_payment_allocations (self) | 07-cashiering-ledger | NO | ZERO, DUP, MULTIW |
| `financial_accounts` | MASTER | PMS | `id` | 3 | master_id→guest_account_masters | guest_account_masters | financial_account_invoice_drafts, financial_account_invoice_events, financial_account_invoice_lines, financial_account_invoices, financial_account_participants, +3 more | 07-cashiering-ledger | YES | — |
| `folio_deposit_allocations` | LEDGER | PMS | `id` | 0 | charge_transaction_id→folio_transactions, deposit_transaction_id→folio_transactions | folio_transactions | — | 07-cashiering-ledger | NO | ZERO, DUP |
| `folio_history` | HISTORY | PMS | `id` | 357 | folio_id→guest_folios | guest_folios | — | 07-cashiering-ledger | NO | MULTIW, XWRITE, LEGACY, XREF |
| `folio_transactions` | LEDGER | PMS | `id` | 344 | department_id→pms_departments, financial_account_id→financial_accounts, folio_id→guest_folios, folio_id,original_transaction_id→folio_transactions, +4 more | pms_departments, financial_accounts, guest_folios, folio_transactions (self), +4 more | financial_account_invoice_draft_items, financial_account_invoice_lines, financial_account_payment_allocations, fo_checkin_progress, folio_deposit_allocations, +7 more | 07-cashiering-ledger | YES | MULTIW, XREF |
| `guest_deposit_invoice_allocations` | LEDGER | PMS | `id` | 5 | deposit_transaction_id→folio_transactions, guest_folio_id→guest_folios, invoice_id→guest_folio_invoices, reverses_allocation_id→guest_deposit_invoice_allocations | folio_transactions, guest_folios, guest_folio_invoices, guest_deposit_invoice_allocations (self) | guest_deposit_invoice_allocations (self) | 07-cashiering-ledger | NO | DUP |
| `guest_folio_counters` | CONFIGURATION | PMS | `restaurant_id` | 3 | — | — | — | 07-cashiering-ledger | NO | MULTIW, XREF |
| `guest_folio_windows` | TRANSACTION | PMS | `id` | 35 | folio_id→guest_folios | guest_folios | folio_transactions | 07-cashiering-ledger | NO | — |
| `guest_folios` | TRANSACTION | PMS | `id` | 35 | guest_id→guest_profiles, reservation_id→hotel_reservations | guest_profiles, hotel_reservations | financial_account_participants, folio_history, folio_transactions, guest_deposit_invoice_allocations, guest_folio_invoice_drafts, +3 more | 07-cashiering-ledger | YES | MULTIW, XWRITE, XREF |
| `guest_payment_invoice_allocations` | LEDGER | PMS | `id` | 25 | guest_folio_id→guest_folios, invoice_id→guest_folio_invoices, payment_transaction_id→folio_transactions, reverses_allocation_id→guest_payment_invoice_allocations | guest_folios, guest_folio_invoices, folio_transactions, guest_payment_invoice_allocations (self) | guest_payment_invoice_allocations (self) | 07-cashiering-ledger | NO | DUP, MULTIW |
| `hotel_cashier_shifts` | TRANSACTION | PMS | `id` | 2 | — | — | folio_transactions, hotel_drawer_movements | 07-cashiering-ledger | YES | — |
| `hotel_drawer_movements` | LEDGER | PMS | `id` | 5 | hotel_cashier_shift_id→hotel_cashier_shifts | hotel_cashier_shifts | — | 07-cashiering-ledger | NO | — |
| `pms_billing_rules` | CONFIGURATION | PMS | `id` | 82 | — | — | guest_account_masters, hotel_reservations | 07-cashiering-ledger | NO | — |
| `pms_deposit_policies` | CONFIGURATION | PMS | `id` | 7 | — | — | guest_account_masters, hotel_rate_plans, hotel_reservations, pms_corporate_agreements, pms_event_contract_defaults | 07-cashiering-ledger | NO | MULTIW, XREF |
| `pms_payment_methods` | LOOKUP | PMS | `id` | 12 | — | — | guest_account_masters | 07-cashiering-ledger | NO | MULTIW |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `financial_account_counters` | Cashiering | Cashiering: rpc | writes: `open_financial_account(I)` | Account number sequence (open_financial_account). |
| `financial_account_participants` | — | — | — | Links a master billing account to participant guest folios. No source references. |
| `financial_account_payment_allocations` | Fiscal / Invoicing, Cashiering, Night Audit | Cashiering: rpc, Fiscal / Invoicing: rpc | writes: `apply_financial_account_payment_allocations(I)`, `correct_failed_company_sales_receipt_allocation(I)`, `release_excess_account_invoice_allocation(I)`, `reverse_financial_account_payment_allocation(I)`; triggers: `financial_account_payment_allocations_immutable` | Allocates account payments to account invoices. Parallel to guest_payment_invoice_allocations. |
| `financial_accounts` | Cashiering, Fiscal / Invoicing, Night Audit | Cashiering: rpc | writes: `open_financial_account(I)` | Company / group / master billing (AR) account; balance = sum(folio_transactions) by financial_account_id. |
| `folio_deposit_allocations` | Cashiering, Night Audit, Fiscal / Invoicing | — | reads: `apply_guest_deposit_invoice_allocations`, `folio_deposit_refund_hold[trg]`, `guest_invoice_deposit_cover` +2 | Deposit allocation against folio charges; written only by RPC/trigger. Overlaps guest_deposit_invoice_allocations. |
| `folio_history` | Cashiering, Fiscal / Invoicing, Front Office, Security / Permissions, Reservations | Front Office: direct, Cashiering: rpc, Fiscal / Invoicing: rpc, Reservations: rpc | writes: `apply_guest_deposit_invoice_allocations(I)`, `apply_guest_payment_invoice_allocations(I)`, `close_guest_folio(I)`, `correct_failed_guest_sales_receipt_allocation(I)`, `create_guest_folio_invoice_draft(I)` +16 | Folio audit trail. Column legacy_cashier_shift_id has no FK (retired POS shift link). Direct writes from: Front Office. |
| `folio_transactions` | Cashiering, Fiscal / Invoicing, Front Office, Guest Profile, Reservations, +2 more | Cashiering: rpc, Fiscal / Invoicing: rpc | writes: `append_folio_tax_and_service_lines(IU)`, `issue_invoice_credit_note_draft(I)`, `post_cross_ledger_transfer(I)`, `post_financial_account_transaction(I)`, `post_folio_charge_correction(I)` +5; triggers: `folio_deposit_refund_hold`, `folio_transactions_assign_room_unit`, `folio_transactions_immutable` | Unified money ledger for guest folios and financial accounts. |
| `guest_deposit_invoice_allocations` | Fiscal / Invoicing, Cashiering, Night Audit | Cashiering: rpc | writes: `apply_guest_deposit_invoice_allocations(I)`, `release_excess_guest_deposit_invoice_allocation(I)`; triggers: `guest_deposit_invoice_allocations_immutable` | Allocates guest deposits to issued invoices. |
| `guest_folio_counters` | Front Office, Cashiering, Reservations, Distribution | Front Office: rpc, Cashiering: rpc, Reservations: rpc, Distribution: rpc | writes: `apply_external_reservation_event(IU)`, `open_folio_for_reservation(IU)` | Folio number sequence. |
| `guest_folio_windows` | Cashiering | — | writes: `ensure_primary_folio_window(I)` | Billing windows within a folio; created by ensure_primary_folio_window. |
| `guest_folios` | Cashiering, Front Office, Night Audit, Guest Profile, Fiscal / Invoicing, +3 more | Front Office: direct, Cashiering: rpc, Reservations: rpc, Distribution: rpc | writes: `apply_external_reservation_event(I)`, `close_guest_folio(U)`, `open_folio_for_reservation(I)`; triggers: `guest_folios_post_deferred_package_charges` | Guest folio header (open/close lifecycle). Direct writes from: Front Office. |
| `guest_payment_invoice_allocations` | Fiscal / Invoicing, Cashiering, Night Audit | Cashiering: rpc, Fiscal / Invoicing: rpc | writes: `apply_guest_payment_invoice_allocations(I)`, `correct_failed_guest_sales_receipt_allocation(I)`, `release_excess_guest_invoice_allocation(I)`, `reverse_guest_payment_invoice_allocation(I)`; triggers: `guest_payment_allocation_respects_deposit_cover`, `guest_payment_invoice_allocations_immutable` | Allocates guest payments to issued invoices. DB comment: “Classifies a posted guest payment against issued charge-group invoices. Does not move the folio ledger.” |
| `hotel_cashier_shifts` | Cashiering, Night Audit, Fiscal / Invoicing | Cashiering: rpc | writes: `close_hotel_cashier_shift(U)`, `open_hotel_cashier_shift(I)` | Hotel cashier drawer session. DB comment: “Hotel cashier drawer. Not a restaurant till and not pos_cashier_shifts.” |
| `hotel_drawer_movements` | Cashiering | Cashiering: rpc | writes: `close_hotel_cashier_shift(I)`, `open_hotel_cashier_shift(I)`, `post_hotel_drawer_movement(I)`; triggers: `hotel_drawer_movements_immutable` | Cash drawer movements per cashier shift. |
| `pms_billing_rules` | Guest Profile, Cashiering | Cashiering: direct | — | Payer / billing routing rules. DB comment: “Card 3 billing-rule catalogue. Setup only. Not folio split, city ledger, or a guest_account_masters link.” |
| `pms_deposit_policies` | Rate & Revenue, Reservations, Cashiering, Guest Profile | Cashiering: direct, Reservations: generic | — | Deposit policies. DB comment: “Card 3 deposit-policy catalogue. Setup only. Not a folio row, check-in deposit, or reservation link. Does not replace restaurants.deposit_*.” |
| `pms_payment_methods` | Guest Profile, Reservations, Property Setup, Cashiering | Property Setup: direct, Cashiering: direct | — | Payment methods. DB comment: “PMS Polish Wave 1 accepted-tenders catalogue. Not payment gateways. Empty is a Warning, not a go-live block. No sample seed.” |

### Taxes & Fees (8 tables)

Domain: **Taxes & Fees** · Primary owner: **Taxes & Fees**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_fees` | CONFIGURATION | PMS | `id` | 6 | — | — | — | 08-taxes-fees | NO | — |
| `pms_service_charge_department_targets` | BRIDGE | PMS | `id` | 0 | department_id→pms_departments, service_charge_id→pms_service_charges | pms_departments, pms_service_charges | — | 08-taxes-fees | NO | ZERO |
| `pms_service_charges` | CONFIGURATION | PMS | `id` | 5 | — | — | pms_service_charge_department_targets | 08-taxes-fees | NO | — |
| `pms_tax_department_targets` | BRIDGE | PMS | `id` | 0 | department_id→pms_departments, tax_id→pms_taxes | pms_departments, pms_taxes | — | 08-taxes-fees | NO | ZERO |
| `pms_tax_exemption_rules` | CONFIGURATION | PMS | `id` | 6 | — | — | guest_account_masters | 08-taxes-fees | NO | — |
| `pms_tax_group_taxes` | BRIDGE | PMS | `id` | 3 | tax_group_id→pms_tax_groups, tax_id→pms_taxes | pms_tax_groups, pms_taxes | — | 08-taxes-fees | NO | — |
| `pms_tax_groups` | CONFIGURATION | PMS | `id` | 3 | — | — | pms_event_package_templates, pms_outlets, pms_tax_group_taxes, restaurants | 08-taxes-fees | NO | MULTIW, XREF |
| `pms_taxes` | CONFIGURATION | PMS | `id` | 9 | — | — | fiscal_tax_code_mappings, pms_tax_department_targets, pms_tax_group_taxes | 08-taxes-fees | YES | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_fees` | Taxes & Fees | Taxes & Fees: direct | — | Fee definitions. DB comment: “Card 3 additional-charge catalogue (resort fee, levy). Not FO cancel/no-show or deposit policy.” |
| `pms_service_charge_department_targets` | Taxes & Fees, Guest Profile | Taxes & Fees: generic | reads: `folio_service_scope_matches` | Service charge department scope. |
| `pms_service_charges` | Taxes & Fees, Guest Profile | Taxes & Fees: direct | reads: `resolve_folio_service_charge_rows` | Service charge definitions. DB comment: “Card 3 service-charge catalogue. Does not replace restaurants.service_rate (SET1/RM till).” |
| `pms_tax_department_targets` | Taxes & Fees, Guest Profile | Taxes & Fees: generic | reads: `folio_tax_scope_matches` | Tax department scope. |
| `pms_tax_exemption_rules` | Guest Profile, Taxes & Fees | Taxes & Fees: direct | — | Tax exemption rules. DB comment: “Card 3 exemption configuration. Not an applied reservation/folio exemption. No pms_tax_exemptions table.” |
| `pms_tax_group_taxes` | Taxes & Fees, Guest Profile | Taxes & Fees: direct | reads: `resolve_folio_tax_rows` | Tax group membership. DB comment: “Maps a tax group to a tax in the same restaurant. Composite FKs prevent cross-tenant joins.” |
| `pms_tax_groups` | Property Core, Reservations, Taxes & Fees, Guest Profile | Taxes & Fees: direct, Reservations: generic | reads: `resolve_folio_tax_rows` | Tax groups. DB comment: “Card 3 named tax groups. Membership lives on pms_tax_group_taxes.” |
| `pms_taxes` | Taxes & Fees, Guest Profile, Property Setup, Fiscal / Invoicing | Taxes & Fees: direct | reads: `resolve_folio_tax_rows` | Tax definitions. DB comment: “Card 3 tax catalogue. Setup master only. Does not replace restaurants.tax_rate (SET1/RM till).” |

### Rate & Revenue (39 tables)

Domain: **Rate & Revenue** · Primary owner: **Rate & Revenue**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `fo_service_catalogue` | CONFIGURATION | PMS | `id` | 0 | — | — | pms_event_package_template_services, pms_package_components | 09b-packages-promotions | NO | ZERO, DUP, MULTIW, XREF |
| `hotel_commercial_change_events` | HISTORY | PMS | `id` | 7 | — | — | — | 09b-packages-promotions | NO | — |
| `hotel_competitor_provider_mappings` | INTEGRATION | PMS | `id` | 0 | competitor_id→hotel_competitors | hotel_competitors | — | 09c-revenue-management | NO | ZERO |
| `hotel_competitor_rate_observations` | INTEGRATION | PMS | `id` | 0 | competitor_id→hotel_competitors, fetch_run_id→hotel_rate_shopping_fetch_runs | hotel_competitors, hotel_rate_shopping_fetch_runs | — | 09c-revenue-management | NO | ZERO |
| `hotel_competitor_room_mappings` | INTEGRATION | PMS | `id` | 0 | competitor_id→hotel_competitors, our_room_type_id→room_types | hotel_competitors, room_types | — | 09c-revenue-management | NO | ZERO |
| `hotel_competitors` | MASTER | PMS | `id` | 0 | — | — | hotel_competitor_provider_mappings, hotel_competitor_rate_observations, hotel_competitor_room_mappings | 09c-revenue-management | NO | ZERO |
| `hotel_package_activation_rate_plans` | BRIDGE | PMS | `id` | 5 | activation_id→hotel_package_activations, rate_plan_id→hotel_rate_plans | hotel_package_activations, hotel_rate_plans | — | 09b-packages-promotions | NO | — |
| `hotel_package_activation_room_types` | BRIDGE | PMS | `id` | 3 | activation_id→hotel_package_activations, room_type_id→room_types | hotel_package_activations, room_types | — | 09b-packages-promotions | NO | — |
| `hotel_package_activations` | TRANSACTION | PMS | `id` | 2 | package_id→pms_packages | pms_packages | hotel_package_activation_rate_plans, hotel_package_activation_room_types, hotel_reservation_packages | 09b-packages-promotions | NO | — |
| `hotel_promotion_activation_rate_plans` | BRIDGE | PMS | `id` | 4 | activation_id→hotel_promotion_activations, rate_plan_id→hotel_rate_plans | hotel_promotion_activations, hotel_rate_plans | — | 09b-packages-promotions | NO | — |
| `hotel_promotion_activation_room_types` | BRIDGE | PMS | `id` | 1 | activation_id→hotel_promotion_activations, room_type_id→room_types | hotel_promotion_activations, room_types | — | 09b-packages-promotions | NO | — |
| `hotel_promotion_activations` | TRANSACTION | PMS | `id` | 2 | promotion_id→pms_promotions | pms_promotions | hotel_promotion_activation_rate_plans, hotel_promotion_activation_room_types, hotel_reservation_promotions | 09b-packages-promotions | NO | — |
| `hotel_rate_calendar` | MASTER | PMS | `id` | 79 | rate_plan_id→hotel_rate_plans | hotel_rate_plans | — | 09a-rate-plans-pricing | NO | XREF |
| `hotel_rate_categories` | LOOKUP | PMS | `id` | 32 | — | — | hotel_rate_plans | 09a-rate-plans-pricing | NO | — |
| `hotel_rate_change_events` | HISTORY | PMS | `id` | 74 | rate_plan_id→hotel_rate_plans, room_type_id→room_types | hotel_rate_plans, room_types | — | 09a-rate-plans-pricing | NO | — |
| `hotel_rate_plans` | MASTER | PMS | `id` | 30 | cancellation_policy_id→pms_rate_cancellation_policies, cancellation_policy_id→pms_rate_cancellation_policies, deposit_policy_id→pms_deposit_policies, early_departure_policy_id→pms_early_departure_policies, +6 more | pms_rate_cancellation_policies, pms_deposit_policies, pms_early_departure_policies, pms_meal_plans, +4 more | distribution_rate_mappings, hotel_package_activation_rate_plans, hotel_promotion_activation_rate_plans, hotel_rate_calendar, hotel_rate_change_events, +8 more | 09a-rate-plans-pricing | YES | XREF |
| `hotel_rate_restriction_change_events` | HISTORY | PMS | `id` | 8 | rate_plan_id→hotel_rate_plans, room_type_id→room_types | hotel_rate_plans, room_types | — | 09a-rate-plans-pricing | NO | — |
| `hotel_rate_restrictions` | CONFIGURATION | PMS | `id` | 7 | rate_plan_id→hotel_rate_plans | hotel_rate_plans | — | 09a-rate-plans-pricing | NO | DUP, XREF |
| `hotel_rate_shopping_fetch_runs` | INTEGRATION | PMS | `id` | 0 | — | — | hotel_competitor_rate_observations | 09c-revenue-management | NO | ZERO |
| `hotel_revenue_approval_events` | HISTORY | PMS | `id` | 21 | approval_request_id→hotel_revenue_approval_requests | hotel_revenue_approval_requests | — | 09c-revenue-management | NO | — |
| `hotel_revenue_approval_policy` | CONFIGURATION | PMS | `restaurant_id` | 1 | — | — | — | 09c-revenue-management | NO | — |
| `hotel_revenue_approval_requests` | TRANSACTION | PMS | `id` | 19 | — | — | hotel_revenue_approval_events | 09c-revenue-management | NO | — |
| `hotel_revenue_otb_snapshots` | SNAPSHOT | PMS | `id` | 1,170 | room_type_id→room_types | room_types | — | 09c-revenue-management | NO | — |
| `pms_commercial_restriction_room_types` | BRIDGE | PMS | `id` | 4 | restriction_id→pms_commercial_restrictions, room_type_id→room_types | pms_commercial_restrictions, room_types | — | 09a-rate-plans-pricing | NO | — |
| `pms_commercial_restrictions` | CONFIGURATION | PMS | `id` | 4 | — | — | pms_commercial_restriction_room_types | 09a-rate-plans-pricing | NO | DUP |
| `pms_early_departure_policies` | CONFIGURATION | PMS | `id` | 7 | — | — | hotel_rate_plans, hotel_reservations | 09a-rate-plans-pricing | NO | — |
| `pms_meal_plans` | MASTER | PMS | `id` | 13 | — | — | distribution_meal_mappings, hotel_rate_plans, pms_package_components | 09a-rate-plans-pricing | NO | MULTIW, XREF |
| `pms_no_show_policies` | CONFIGURATION | PMS | `id` | 8 | — | — | guest_account_masters, hotel_rate_plans, hotel_reservations, pms_corporate_agreements | 09a-rate-plans-pricing | NO | MULTIW, XWRITE |
| `pms_package_components` | CONFIGURATION | PMS | `id` | 7 | fo_service_id→fo_service_catalogue, meal_plan_id→pms_meal_plans, package_id→pms_packages, room_amenity_id→room_amenities | fo_service_catalogue, pms_meal_plans, pms_packages, room_amenities | — | 09b-packages-promotions | NO | NOFK |
| `pms_package_rate_plans` | BRIDGE | PMS | `id` | 5 | package_id→pms_packages, rate_plan_id→hotel_rate_plans | pms_packages, hotel_rate_plans | — | 09b-packages-promotions | NO | — |
| `pms_package_room_types` | BRIDGE | PMS | `id` | 5 | package_id→pms_packages, room_type_id→room_types | pms_packages, room_types | — | 09b-packages-promotions | NO | — |
| `pms_packages` | MASTER | PMS | `id` | 9 | — | — | hotel_package_activations, hotel_reservation_packages, pms_package_components, pms_package_rate_plans, pms_package_room_types | 09b-packages-promotions | NO | MULTIW |
| `pms_promotion_room_types` | BRIDGE | PMS | `id` | 4 | promotion_id→pms_promotions, room_type_id→room_types | pms_promotions, room_types | — | 09b-packages-promotions | NO | — |
| `pms_promotions` | MASTER | PMS | `id` | 4 | — | — | hotel_promotion_activations, hotel_reservation_promotions, pms_promotion_room_types | 09b-packages-promotions | NO | — |
| `pms_rate_cancellation_policies` | CONFIGURATION | PMS | `id` | 11 | — | — | guest_account_masters, hotel_rate_plans, pms_corporate_agreements | 09a-rate-plans-pricing | NO | — |
| `pms_rate_refundability_codes` | LOOKUP | PMS | `id` | 6 | — | — | hotel_rate_plans | 09a-rate-plans-pricing | NO | — |
| `pms_restriction_reasons` | LOOKUP | PMS | `id` | 0 | — | — | — | 09a-rate-plans-pricing | NO | ZERO |
| `pms_season_room_types` | BRIDGE | PMS | `id` | 3 | room_type_id→room_types, season_id→pms_seasons | room_types, pms_seasons | — | 09a-rate-plans-pricing | NO | — |
| `pms_seasons` | CONFIGURATION | PMS | `id` | 4 | — | — | pms_season_room_types | 09a-rate-plans-pricing | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `fo_service_catalogue` | Rate & Revenue, Front Office, Reservations, Guest Services | Rate & Revenue: direct, Reservations: generic | — | Legacy package-service catalogue (0 rows). Only FK children are pms_package_components.fo_service_id and pms_event_package_template_services; edited from the meals/packages and sales-events setup cards. Superseded by pms_guest_service_types (deprecate later, ARCH-02). |
| `hotel_commercial_change_events` | Rate & Revenue | Rate & Revenue: rpc | writes: `apply_hotel_package_activation(I)`, `apply_hotel_promotion_activation(I)`; triggers: `prevent_hotel_commercial_change_event_mutation` | Immutable package/promotion activation history. DB comment: “Immutable Rate & Revenue operational commercial history for UI-21. One full before/after snapshot per changed activation. One operation_id p…” |
| `hotel_competitor_provider_mappings` | Rate & Revenue | Rate & Revenue: direct | — | Competitor identity at inbound rate-shopping provider. DB comment: “Generic inbound provider identity for a competitor. Provider is free text. Not outbound distribution mappings. No connection status.” |
| `hotel_competitor_rate_observations` | Rate & Revenue | Rate & Revenue: direct | triggers: `prevent_hotel_competitor_rate_observation_mutation` | Append-only competitor rate observations. DB comment: “Append-only inbound competitor rate observations. Source currency only. No FX. No ranking. UPDATE and DELETE are blocked.” |
| `hotel_competitor_room_mappings` | Rate & Revenue | Rate & Revenue: direct | — | Room type to competitor room mapping. DB comment: “Manual mapping of a NORU room type to a competitor external room. Multiple external variants are allowed. No auto-match.” |
| `hotel_competitors` | Rate & Revenue | Rate & Revenue: direct | — | Competitor master for future rate shopping. DB comment: “Property-owned competitor master for future rate shopping. Setup only. No rank, tier, score, or market position.” |
| `hotel_package_activation_rate_plans` | Reservations, Rate & Revenue | Rate & Revenue: rpc | writes: `apply_hotel_package_activation(ID)` | Activation rate-plan scope. DB comment: “Activation rate-plan scope. May narrow master pms_package_rate_plans. Must not broaden. Empty set inherits master rate-plan scope.” |
| `hotel_package_activation_room_types` | Reservations, Rate & Revenue | Rate & Revenue: rpc | writes: `apply_hotel_package_activation(ID)` | Activation room-type scope. DB comment: “Activation room-type scope. May narrow master pms_package_room_types. Must not broaden. Empty set inherits master scope.” |
| `hotel_package_activations` | Rate & Revenue, Reservations | Rate & Revenue: rpc | writes: `apply_hotel_package_activation(IU)` | Operational package activation snapshot. DB comment: “Operational package activation. Snapshots package_price, charge_basis, and components. V1 charge_basis is per_stay only. Additive outside ho…” |
| `hotel_promotion_activation_rate_plans` | Rate & Revenue, Reservations | Rate & Revenue: rpc | writes: `apply_hotel_promotion_activation(ID)` | Promotion activation rate-plan scope. DB comment: “Operational rate-plan scope. Promotion masters have no rate-plan join. Empty set allows all property rate plans.” |
| `hotel_promotion_activation_room_types` | Rate & Revenue, Reservations | Rate & Revenue: rpc | writes: `apply_hotel_promotion_activation(ID)` | Promotion activation room-type scope. DB comment: “Activation room-type scope. May narrow master pms_promotion_room_types. Must not broaden. Empty set inherits master scope.” |
| `hotel_promotion_activations` | Rate & Revenue, Reservations | Rate & Revenue: rpc | writes: `apply_hotel_promotion_activation(IU)` | Operational promotion activation snapshot. DB comment: “Operational promotion activation. Snapshots master execution fields at apply time. Master edits do not rewrite existing rows. Empty room-typ…” |
| `hotel_rate_calendar` | Rate & Revenue, Reservations, Direct Booking, Front Office, Distribution | Rate & Revenue: direct | writes: `apply_hotel_rate_changes(ID)` | Date x rate plan x room type price grid. |
| `hotel_rate_categories` | Rate & Revenue, Guest Profile | Rate & Revenue: direct | — | Rate plan categories. |
| `hotel_rate_change_events` | Rate & Revenue | Rate & Revenue: rpc | writes: `apply_hotel_rate_changes(I)`; triggers: `prevent_hotel_rate_change_event_mutation` | Immutable rate change history. DB comment: “Immutable operational rate-change history for UI-06. Begins at migration 0101; no backfill. Domain source for before/after rates, stay date,…” |
| `hotel_rate_plans` | Rate & Revenue, Guest Profile, Distribution, Reservations, Front Office, +5 more | Rate & Revenue: direct | reads: `apply_hotel_package_activation`, `apply_hotel_promotion_activation`, `apply_hotel_rate_changes` +4 | Rate plan master. Carries two duplicated FK constraint pairs (cancellation policy, refundability). |
| `hotel_rate_restriction_change_events` | Rate & Revenue | Rate & Revenue: rpc | writes: `apply_hotel_rate_restrictions(I)`; triggers: `prevent_hotel_rate_restriction_change_event_mutation` | Immutable restriction change history. DB comment: “Immutable operational restriction-change history for UI-11. Begins at migration 0102; no backfill. One full before/after snapshot per change…” |
| `hotel_rate_restrictions` | Rate & Revenue, Reservations, Direct Booking, Front Office, Night Audit, +1 more | Rate & Revenue: direct | writes: `apply_hotel_rate_restrictions(ID)` | Date-level restrictions (CTA/CTD/min stay). Overlaps pms_commercial_restrictions. |
| `hotel_rate_shopping_fetch_runs` | Rate & Revenue | Rate & Revenue: direct | — | Inbound rate-shopping fetch-run ledger. DB comment: “Inbound fetch-run ledger for a future licensed provider. No scheduler, cron, or production seed runs.” |
| `hotel_revenue_approval_events` | Rate & Revenue | Rate & Revenue: rpc | writes: `approve_hotel_revenue_approval(I)`, `submit_hotel_revenue_approval(I)`, `transition_hotel_revenue_approval(I)`; triggers: `prevent_hotel_revenue_approval_event_mutation` | Revenue approval workflow events. |
| `hotel_revenue_approval_policy` | Rate & Revenue | Rate & Revenue: direct | — | Revenue approval thresholds. |
| `hotel_revenue_approval_requests` | Rate & Revenue, Night Audit | Rate & Revenue: rpc | writes: `approve_hotel_revenue_approval(U)`, `submit_hotel_revenue_approval(I)`, `transition_hotel_revenue_approval(U)`; triggers: `enforce_hotel_revenue_approval_request_lifecycle` | Revenue change approval requests (polymorphic entity_id). |
| `hotel_revenue_otb_snapshots` | Rate & Revenue, Night Audit | Rate & Revenue: direct | triggers: `prevent_hotel_revenue_otb_snapshot_mutation` | On-the-books snapshot per business date / stay date / room type. |
| `pms_commercial_restriction_room_types` | Rate & Revenue | Rate & Revenue: generic | — | Commercial restriction room-type scope. |
| `pms_commercial_restrictions` | Rate & Revenue | Rate & Revenue: direct | — | Commercial restriction masters. Overlaps hotel_rate_restrictions. |
| `pms_early_departure_policies` | Rate & Revenue, Reservations | Rate & Revenue: direct | — | Early departure policies. DB comment: “Rate & Pricing early departure catalogue. Not a posted checkout charge.” |
| `pms_meal_plans` | Guest Profile, Rate & Revenue, Property Setup, Guest Services, Distribution | Property Setup: direct, Rate & Revenue: direct | reads: `apply_hotel_package_activation` | Meal plan (board basis) master. DB comment: “PMS-SET3 meal-plan catalogue. Rate calendar stays on /restaurant/pms/rates-revenue.” |
| `pms_no_show_policies` | Rate & Revenue, Guest Profile, Reservations | Rate & Revenue: direct, Guest Profile: direct | — | No-show policies. Direct writes from: Guest Profile. |
| `pms_package_components` | Rate & Revenue, Guest Services | Rate & Revenue: direct | reads: `apply_hotel_package_activation` | Package components; fulfillment_department_id has no FK. DB comment: “Card 3 typed package inclusions. Setup master only. No price per component, no posting, no folio row, no reservation link.” |
| `pms_package_rate_plans` | Rate & Revenue | Rate & Revenue: direct | reads: `apply_hotel_package_activation` | Package rate-plan scope. DB comment: “Card 3 package applicability by rate plan. Setup only. Does not alter hotel_rate_plans and does not derive, override, or quote a rate.” |
| `pms_package_room_types` | Rate & Revenue | Rate & Revenue: direct | reads: `apply_hotel_package_activation` | Package room-type scope. DB comment: “Card 3 package applicability by room type. Setup only. Composite FKs prevent cross-tenant joins. Not a reservation or availability row.” |
| `pms_packages` | Rate & Revenue, Reservations, Guest Profile, Property Setup | Property Setup: direct, Rate & Revenue: direct | reads: `apply_hotel_package_activation`, `apply_hotel_reservation_room_package`, `sync_hotel_reservation_packages` | Package master. DB comment: “PMS-SET3 package catalogue. Empty is a Warning, not a go-live block.” |
| `pms_promotion_room_types` | Rate & Revenue | Rate & Revenue: generic | reads: `apply_hotel_promotion_activation` | Promotion room-type scope. |
| `pms_promotions` | Rate & Revenue, Reservations | Rate & Revenue: direct | reads: `apply_hotel_promotion_activation`, `sync_hotel_reservation_promotion` | Promotion master. DB comment: “Card 3 promotion catalogue. Setup only. Not RM/POS discounts and not a quote modifier.” |
| `pms_rate_cancellation_policies` | Guest Profile, Rate & Revenue, Reservations | Rate & Revenue: direct | reads: `create_hotel_reservation_priced` | Cancellation policies. DB comment: “Card 2 rate-plan cancellation catalogue. Setup only. Not a reservation cancel event.” |
| `pms_rate_refundability_codes` | Rate & Revenue, Reservations | Rate & Revenue: direct | reads: `create_hotel_reservation_priced` | Refundability codes. DB comment: “Card 2 rate-plan refundability catalogue. Setup only. Not a folio refund.” |
| `pms_restriction_reasons` | Property Setup | Property Setup: generic | — | Restriction reason codes (0 rows, no FK children). DB comment: “PMS-SET4 restriction-reason catalogue. Empty is a Warning, not a go-live block.” |
| `pms_season_room_types` | Rate & Revenue | Rate & Revenue: generic | — | Season room-type scope. |
| `pms_seasons` | Rate & Revenue | Rate & Revenue: direct | — | Seasons. DB comment: “Card 3 named-season catalogue. Setup hint only. Does not write hotel_rate_calendar.” |

### Night Audit (5 tables)

Domain: **Night Audit** · Primary owner: **Night Audit**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `business_date_adjustments` | AUDIT | PMS | `id` | 2 | — | — | — | 10-night-audit | NO | — |
| `night_audit_exceptions` | TRANSACTION | PMS | `id` | 1,971 | night_audit_run_id→night_audit_runs | night_audit_runs | night_audit_fiscal_overrides, night_audit_warning_reviews | 10-night-audit | NO | — |
| `night_audit_fiscal_overrides` | AUDIT | PMS | `id` | 2 | exception_id→night_audit_exceptions, night_audit_run_id→night_audit_runs | night_audit_exceptions, night_audit_runs | — | 10-night-audit | NO | — |
| `night_audit_runs` | TRANSACTION | PMS | `id` | 61 | — | — | night_audit_exceptions, night_audit_fiscal_overrides, night_audit_warning_reviews | 10-night-audit | YES | — |
| `night_audit_warning_reviews` | AUDIT | PMS | `id` | 3 | exception_id→night_audit_exceptions, night_audit_run_id→night_audit_runs | night_audit_exceptions, night_audit_runs | — | 10-night-audit | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `business_date_adjustments` | Night Audit | Night Audit: rpc | writes: `adjust_business_date(I)`; triggers: `business_date_adjustments_immutable` | Manual business-date corrections written by adjust_business_date. |
| `night_audit_exceptions` | Night Audit | Night Audit: direct | reads: `close_business_date` | Exceptions raised per night audit run (polymorphic reference_id). |
| `night_audit_fiscal_overrides` | Night Audit | Night Audit: direct | reads: `adjust_business_date`, `close_business_date` | Overrides of fiscal blockers during close. |
| `night_audit_runs` | Night Audit, Security / Permissions, Property Setup | Night Audit: direct | writes: `adjust_business_date(U)`, `close_business_date(U)` | Night audit run per business date. |
| `night_audit_warning_reviews` | Night Audit | Night Audit: direct | — | Reviewed night audit warnings. |

### Inventory (5 tables)

Domain: **Inventory** · Primary owner: **Inventory**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `inventory_items` | MASTER | SHARED | `id` | 0 | base_unit_id→inventory_units | inventory_units | inventory_stock_movements, purchase_order_items | 11-inventory-procurement | YES | ZERO |
| `inventory_stock_movements` | LEDGER | SHARED | `id` | 0 | inventory_item_id→inventory_items, purchase_order_id→purchase_orders, purchase_order_item_id→purchase_order_items, supplier_id→restaurant_suppliers, +1 more | inventory_items, purchase_orders, purchase_order_items, restaurant_suppliers, +1 more | — | 11-inventory-procurement | NO | ZERO |
| `inventory_units` | LOOKUP | SHARED | `id` | 0 | — | — | inventory_items, inventory_stock_movements, purchase_order_items | 11-inventory-procurement | NO | ZERO |
| `restaurant_asset_history` | HISTORY | SHARED | `id` | 0 | asset_id→restaurant_assets | restaurant_assets | — | 11-inventory-procurement | NO | ZERO, LEGACY |
| `restaurant_assets` | MASTER | SHARED | `id` | 0 | — | — | restaurant_asset_history | 11-inventory-procurement | NO | ZERO, LEGACY |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `inventory_items` | Inventory / Procurement | Inventory / Procurement: direct | writes: `apply_inventory_movement(U)`, `receive_purchase_order_goods(U)` | Stock item master. |
| `inventory_stock_movements` | Inventory / Procurement | Inventory / Procurement: rpc | writes: `apply_inventory_movement(I)`, `receive_purchase_order_goods(U)` | Stock movement ledger. |
| `inventory_units` | Inventory / Procurement | — | — | Units of measure (no app writer). |
| `restaurant_asset_history` | Inventory / Procurement | Inventory / Procurement: direct | — | Asset history. |
| `restaurant_assets` | Inventory / Procurement | Inventory / Procurement: direct | — | Asset register. |

### Procurement (4 tables)

Domain: **Procurement** · Primary owner: **Procurement**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `purchase_order_history` | HISTORY | SHARED | `id` | 0 | purchase_order_id→purchase_orders | purchase_orders | — | 11-inventory-procurement | NO | ZERO |
| `purchase_order_items` | TRANSACTION | SHARED | `id` | 0 | inventory_item_id→inventory_items, purchase_order_id→purchase_orders, unit_id→inventory_units | inventory_items, purchase_orders, inventory_units | inventory_stock_movements | 11-inventory-procurement | NO | ZERO |
| `purchase_orders` | TRANSACTION | SHARED | `id` | 0 | supplier_id→restaurant_suppliers | restaurant_suppliers | inventory_stock_movements, purchase_order_history, purchase_order_items | 11-inventory-procurement | YES | ZERO |
| `restaurant_suppliers` | MASTER | SHARED | `id` | 0 | — | — | inventory_stock_movements, purchase_orders | 11-inventory-procurement | NO | ZERO, LEGACY |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `purchase_order_history` | Inventory / Procurement | Inventory / Procurement: direct | writes: `receive_purchase_order_goods(I)` | Purchase order history. |
| `purchase_order_items` | Inventory / Procurement | Inventory / Procurement: direct | writes: `receive_purchase_order_goods(U)` | Purchase order lines. |
| `purchase_orders` | Inventory / Procurement | Inventory / Procurement: direct | writes: `receive_purchase_order_goods(U)` | Purchase orders. |
| `restaurant_suppliers` | Inventory / Procurement | Inventory / Procurement: direct | — | Supplier master. |

### Human Resources / Staff (6 tables)

Domain: **Human Resources / Staff** · Primary owner: **Human Resources / Staff**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_shift_definitions` | CONFIGURATION | PMS | `id` | 0 | — | — | — | 12-staff-hr | NO | ZERO, DUP |
| `restaurant_tables` | MASTER | SHARED | `id` | 3 | — | — | staff_table_assignments | 12-staff-hr | NO | LEGACY |
| `restaurant_users` | MASTER | SHARED | `id` | 15 | hotel_role_id→pms_hotel_roles | pms_hotel_roles | business_date_adjustments, financial_accounts, fo_checkin_progress, fo_guest_requests, folio_deposit_allocations, +59 more | 12-staff-hr | YES | MULTIW, LEGACY, XREF |
| `staff_attendance` | TRANSACTION | SHARED | `id` | 0 | shift_id→staff_shifts | staff_shifts | — | 12-staff-hr | NO | ZERO |
| `staff_shifts` | TRANSACTION | SHARED | `id` | 0 | — | — | staff_attendance, staff_table_assignments | 12-staff-hr | YES | ZERO |
| `staff_table_assignments` | BRIDGE | SHARED | `id` | 0 | restaurant_table_id→restaurant_tables, shift_id→staff_shifts | restaurant_tables, staff_shifts | — | 12-staff-hr | NO | ZERO |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_shift_definitions` | Property Setup | Property Setup: direct | — | Workforce shift templates (0 rows) maintained in the Administration roles/shifts/staff card. Template only; not a cashier drawer session (hotel_cashier_shifts) and not a rota instance (staff_shifts) (ARCH-02). |
| `restaurant_tables` | Human Resources / Staff | — | — | Retained F&B outlet table master used only by workforce table assignment (docs/pms-only-architecture.md). No app writer; qr_token is a retired NOT NULL column (ARCH-02). |
| `restaurant_users` | Cashiering, Front Office, Fiscal / Invoicing, Rate & Revenue, Human Resources / Staff, +12 more | Human Resources / Staff: direct, Shared Core: direct | reads: `apply_hotel_rate_changes`, `apply_hotel_rate_restrictions`, `approve_hotel_revenue_approval` +18 | Staff membership per property (role, hotel_role_id). |
| `staff_attendance` | Human Resources / Staff | Human Resources / Staff: direct | — | Staff attendance. |
| `staff_shifts` | Human Resources / Staff | Human Resources / Staff: direct | — | Staff rota shifts. |
| `staff_table_assignments` | Human Resources / Staff | Human Resources / Staff: direct | — | Workforce: staff member to outlet table per staff shift (0 rows). Written only by the workforce module (ARCH-02). |

### Accounting / Finance (4 tables)

Domain: **Accounting / Finance** · Primary owner: **Accounting / Finance**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_exchange_rates` | CONFIGURATION | PMS | `id` | 21 | quote_currency_code→pms_property_currencies | pms_property_currencies | — | 13b-fiscal-finance | NO | XREF |
| `pms_financial_settings` | CONFIGURATION | PMS | `restaurant_id` | 4 | — | — | — | 13b-fiscal-finance | NO | — |
| `pms_property_currencies` | CONFIGURATION | PMS | `id` | 15 | — | — | pms_event_package_templates, pms_exchange_rates, pms_outlets | 13b-fiscal-finance | NO | MULTIW, XREF |
| `withholding_certificates` | TRANSACTION | PMS | `id` | 6 | financial_account_id→financial_accounts, invoice_id→financial_account_invoices, ledger_transaction_id→folio_transactions, reverses_certificate_id→withholding_certificates | financial_accounts, financial_account_invoices, folio_transactions, withholding_certificates (self) | withholding_certificates (self) | 13b-fiscal-finance | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_exchange_rates` | Rate & Revenue, Reservations, Accounting / Finance, Direct Booking, Front Office | Accounting / Finance: direct | reads: `price_hotel_stay` | FX rates per effective date. DB comment: “Card 3 FX quotes. Base is restaurants.currency_code. No second base column. No live FX feed.” |
| `pms_financial_settings` | Reports / Analytics, Accounting / Finance | Accounting / Finance: direct | — | Fiscal year / FX settings (PK restaurant_id). DB comment: “Card 3 fiscal-year and FX defaults. Does not store primary currency, timezone, or business date.” |
| `pms_property_currencies` | Guest Profile, Accounting / Finance, Property Core, Reservations | Accounting / Finance: direct, Reservations: generic | — | Accepted property currencies. DB comment: “Card 3 supported currencies. Base currency is restaurants.currency_code; API derives isBase as code = restaurants.currency_code. No is_base …” |
| `withholding_certificates` | Fiscal / Invoicing, Night Audit, Cashiering | Fiscal / Invoicing: rpc | writes: `record_withholding_certificate(I)`, `reverse_withholding_certificate(I)`; triggers: `withholding_certificates_immutable`, `withholding_certificates_ledger_check` | Withholding tax certificates posted against AR invoices. |

### Fiscal / Invoicing (27 tables)

Domain: **Fiscal / Invoicing** · Primary owner: **Fiscal / Invoicing**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `financial_account_invoice_draft_items` | TRANSACTION | PMS | `id` | 0 | draft_id→financial_account_invoice_drafts, source_group_id→folio_transactions | financial_account_invoice_drafts, folio_transactions | — | 13a-invoicing-credit-notes | NO | ZERO |
| `financial_account_invoice_drafts` | TRANSACTION | PMS | `id` | 1 | financial_account_id→financial_accounts | financial_accounts | financial_account_invoice_draft_items | 13a-invoicing-credit-notes | NO | — |
| `financial_account_invoice_events` | AUDIT | PMS | `id` | 11 | financial_account_id→financial_accounts | financial_accounts | — | 13a-invoicing-credit-notes | NO | NOFK |
| `financial_account_invoice_lines` | TRANSACTION | PMS | `id` | 6 | component_transaction_id→folio_transactions, invoice_id→financial_account_invoices, financial_account_id→financial_accounts | folio_transactions, financial_account_invoices, financial_accounts | — | 13a-invoicing-credit-notes | NO | — |
| `financial_account_invoices` | TRANSACTION | PMS | `id` | 3 | financial_account_id→financial_accounts | financial_accounts | financial_account_invoice_lines, financial_account_payment_allocations, invoice_credit_note_drafts, invoice_credit_notes, withholding_certificates | 13a-invoicing-credit-notes | NO | — |
| `fiscal_buyer_code_mappings` | INTEGRATION | PMS | `id` | 0 | integration_id→pms_integrations | pms_integrations | — | 13b-fiscal-finance | NO | ZERO |
| `fiscal_credential_refs` | SECURITY | PMS | `integration_id` | 2 | integration_id→pms_integrations | pms_integrations | — | 13b-fiscal-finance | NO | — |
| `fiscal_integration_tokens` | SECURITY | PMS | `id` | 2 | integration_id→pms_integrations | pms_integrations | — | 13b-fiscal-finance | NO | — |
| `fiscal_item_code_counters` | CONFIGURATION | PMS | `restaurant_id` | 2 | — | — | — | 13b-fiscal-finance | NO | — |
| `fiscal_item_mappings` | INTEGRATION | PMS | `id` | 14 | integration_id→pms_integrations | pms_integrations | — | 13b-fiscal-finance | NO | NOFK |
| `fiscal_mode_mappings` | INTEGRATION | PMS | `id` | 1 | integration_id→pms_integrations | pms_integrations | — | 13b-fiscal-finance | NO | — |
| `fiscal_registration_attempts` | AUDIT | PMS | `id` | 71 | registration_id→fiscal_registrations | fiscal_registrations | — | 13b-fiscal-finance | NO | — |
| `fiscal_registrations` | QUEUE | PMS | `id` | 52 | integration_id→pms_integrations, related_registration_id→fiscal_registrations | pms_integrations, fiscal_registrations (self) | fiscal_registration_attempts, fiscal_registrations (self) | 13b-fiscal-finance | YES | — |
| `fiscal_tax_code_mappings` | INTEGRATION | PMS | `id` | 4 | integration_id→pms_integrations, pms_tax_id→pms_taxes | pms_integrations, pms_taxes | — | 13b-fiscal-finance | NO | — |
| `guest_folio_invoice_draft_items` | TRANSACTION | PMS | `id` | 0 | draft_id→guest_folio_invoice_drafts, source_transaction_id→folio_transactions | guest_folio_invoice_drafts, folio_transactions | — | 13a-invoicing-credit-notes | NO | ZERO |
| `guest_folio_invoice_drafts` | TRANSACTION | PMS | `id` | 1 | folio_id→guest_folios | guest_folios | guest_folio_invoice_draft_items | 13a-invoicing-credit-notes | NO | — |
| `guest_folio_invoice_lines` | TRANSACTION | PMS | `id` | 74 | invoice_id→guest_folio_invoices | guest_folio_invoices | — | 13a-invoicing-credit-notes | NO | NOFK |
| `guest_folio_invoices` | TRANSACTION | PMS | `id` | 28 | folio_id→guest_folios | guest_folios | guest_deposit_invoice_allocations, guest_folio_invoice_lines, guest_payment_invoice_allocations, invoice_credit_note_drafts, invoice_credit_notes | 13a-invoicing-credit-notes | YES | XREF |
| `invoice_credit_note_draft_items` | TRANSACTION | PMS | `id` | 0 | draft_id→invoice_credit_note_drafts, source_group_id→folio_transactions | invoice_credit_note_drafts, folio_transactions | — | 13a-invoicing-credit-notes | NO | ZERO |
| `invoice_credit_note_drafts` | TRANSACTION | PMS | `id` | 0 | account_invoice_id→financial_account_invoices, guest_invoice_id→guest_folio_invoices | financial_account_invoices, guest_folio_invoices | invoice_credit_note_draft_items | 13a-invoicing-credit-notes | NO | ZERO |
| `invoice_credit_note_events` | AUDIT | PMS | `id` | 58 | — | — | — | 13a-invoicing-credit-notes | NO | NOFK |
| `invoice_credit_note_lines` | TRANSACTION | PMS | `id` | 50 | component_transaction_id→folio_transactions, credit_note_id→invoice_credit_notes | folio_transactions, invoice_credit_notes | — | 13a-invoicing-credit-notes | NO | NOFK |
| `invoice_credit_notes` | TRANSACTION | PMS | `id` | 18 | account_invoice_id→financial_account_invoices, guest_invoice_id→guest_folio_invoices | financial_account_invoices, guest_folio_invoices | invoice_credit_note_lines | 13a-invoicing-credit-notes | NO | NOFK |
| `pms_credit_note_counters` | CONFIGURATION | PMS | `restaurant_id` | 1 | — | — | — | 13a-invoicing-credit-notes | NO | — |
| `pms_debit_note_counters` | CONFIGURATION | PMS | `restaurant_id` | 1 | — | — | — | 13a-invoicing-credit-notes | NO | — |
| `pms_invoice_settings` | CONFIGURATION | PMS | `restaurant_id` | 4 | — | — | — | 13a-invoicing-credit-notes | NO | XWRITE |
| `pms_issued_invoice_counters` | CONFIGURATION | PMS | `restaurant_id` | 1 | — | — | — | 13a-invoicing-credit-notes | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `financial_account_invoice_draft_items` | Fiscal / Invoicing, Cashiering | Fiscal / Invoicing: rpc | writes: `update_financial_account_invoice_draft(ID)` | Line selection for a company/master account invoice draft. |
| `financial_account_invoice_drafts` | Fiscal / Invoicing, Cashiering | Fiscal / Invoicing: rpc | writes: `create_financial_account_invoice_draft(I)`, `delete_financial_account_invoice_draft(D)`, `issue_financial_account_invoice_draft(D)`, `update_financial_account_invoice_draft(U)` | Draft invoice for a financial (AR) account. |
| `financial_account_invoice_events` | Fiscal / Invoicing, Cashiering | Fiscal / Invoicing: rpc | writes: `create_financial_account_invoice_draft(I)`, `delete_financial_account_invoice_draft(I)`, `issue_financial_account_invoice_draft(I)`, `issue_invoice_credit_note_draft(I)`, `issue_invoice_debit_note_draft(I)` +2 | Invoice lifecycle events; invoice_id has no FK (append-only design). |
| `financial_account_invoice_lines` | Fiscal / Invoicing, Cashiering | Fiscal / Invoicing: rpc | writes: `issue_financial_account_invoice_draft(I)` | Issued account-invoice lines. |
| `financial_account_invoices` | Fiscal / Invoicing, Cashiering, Night Audit | Fiscal / Invoicing: rpc | writes: `issue_financial_account_invoice_draft(I)`, `reprint_financial_account_invoice(U)`; triggers: `financial_account_invoices_immutable`, `freeze_company_invoice_fiscal_identity` | Issued invoice for a financial (AR) account. Parallel structure to guest_folio_invoices. |
| `fiscal_buyer_code_mappings` | Fiscal / Invoicing | Fiscal / Invoicing: direct | — | Buyer type code mapping for the fiscal authority API. |
| `fiscal_credential_refs` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `fiscal_store_api_credentials(I)` | Pointer to Vault secret holding fiscal API credentials. DB comment: “Server-only pointer to a Supabase Vault secret holding the fiscal API username and password. The secret value is not stored here.” |
| `fiscal_integration_tokens` | Fiscal / Invoicing | Fiscal / Invoicing: direct | writes: `claim_fiscal_token_refresh(IU)` | Server-only fiscal access tokens. DB comment: “Server-only fiscal access tokens. Browser roles have no privileges on this table.” |
| `fiscal_item_code_counters` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `allocate_fiscal_item_code(IU)` | Monotonic fiscal ItemCode counter. DB comment: “Monotonic fiscal ItemCode counter per property. last_code starts at 1000 so the first allocation is 1001. The counter only moves forward.” |
| `fiscal_item_mappings` | Fiscal / Invoicing | Fiscal / Invoicing: direct | reads: `allocate_fiscal_item_code` | Service/department to fiscal item code; service_type_id and department_id have no FK. |
| `fiscal_mode_mappings` | Fiscal / Invoicing | Fiscal / Invoicing: direct | — | Payment mode to fiscal mode mapping. |
| `fiscal_registration_attempts` | Fiscal / Invoicing | Fiscal / Invoicing: direct | triggers: `fiscal_registration_attempts_immutable` | Append-only fiscal API attempts (redacted payloads). DB comment: “Append-only fiscal API attempts. Payloads must already be redacted. UPDATE and DELETE are rejected.” |
| `fiscal_registrations` | Fiscal / Invoicing, Night Audit, Cashiering | Fiscal / Invoicing: direct | writes: `claim_fiscal_registrations(U)`, `correct_failed_company_sales_receipt_allocation(U)`, `correct_failed_guest_sales_receipt_allocation(U)`; triggers: `fiscal_registrations_protect` | Fiscal outbox and registration state (IRN/RRN). Polymorphic source_id. |
| `fiscal_tax_code_mappings` | Fiscal / Invoicing | Fiscal / Invoicing: direct | reads: `allocate_fiscal_item_code` | PMS tax to fiscal tax code mapping. |
| `guest_folio_invoice_draft_items` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `update_guest_folio_invoice_draft(ID)` | Line selection for a guest folio invoice draft. |
| `guest_folio_invoice_drafts` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `create_guest_folio_invoice_draft(I)`, `delete_guest_folio_invoice_draft(D)`, `issue_guest_folio_invoice_draft(D)`, `update_guest_folio_invoice_draft(U)` | Draft guest folio invoice. |
| `guest_folio_invoice_lines` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `issue_guest_folio_invoice_draft(I)` | Issued guest invoice lines; folio_id, source_transaction_id, component_transaction_id have no FK. |
| `guest_folio_invoices` | Fiscal / Invoicing, Night Audit, Cashiering, Reservations | Fiscal / Invoicing: rpc | writes: `issue_guest_folio_invoice(I)`, `issue_guest_folio_invoice_draft(I)`, `reprint_guest_folio_invoice(U)`; triggers: `guest_folio_invoices_immutable` | Immutable issued invoice snapshot for a guest folio. DB comment: “Immutable issued invoice snapshot for a guest folio. One issued document per folio. Reprint does not change the number or snapshot.” |
| `invoice_credit_note_draft_items` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `update_invoice_credit_note_draft(ID)`, `update_invoice_debit_note_draft(ID)` | Credit/debit note draft lines. |
| `invoice_credit_note_drafts` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `create_invoice_credit_note_draft(I)`, `create_invoice_debit_note_draft(I)`, `delete_invoice_credit_note_draft(D)`, `delete_invoice_debit_note_draft(D)`, `issue_invoice_credit_note_draft(D)` +3 | Credit/debit note drafts. |
| `invoice_credit_note_events` | Fiscal / Invoicing, Cashiering | Fiscal / Invoicing: rpc | writes: `create_invoice_credit_note_draft(I)`, `create_invoice_debit_note_draft(I)`, `delete_invoice_credit_note_draft(I)`, `delete_invoice_debit_note_draft(I)`, `issue_invoice_credit_note_draft(I)` +3 | Credit note events; invoice/folio/account ids have no FK. |
| `invoice_credit_note_lines` | Fiscal / Invoicing, Cashiering | Fiscal / Invoicing: rpc | writes: `issue_invoice_credit_note_draft(I)`, `issue_invoice_debit_note_draft(I)`; triggers: `invoice_credit_lines_within_invoice`, `invoice_credit_note_lines_immutable` | Credit/debit note lines; ledger_transaction_id has no FK. |
| `invoice_credit_notes` | Fiscal / Invoicing, Cashiering, Night Audit | Fiscal / Invoicing: rpc | writes: `issue_invoice_credit_note_draft(I)`, `issue_invoice_debit_note_draft(I)`, `reprint_invoice_credit_note(U)`; triggers: `invoice_credit_notes_immutable`, `invoice_credit_notes_withholding_guard`, `release_guest_invoice_settlement_excess` | Issued credit/debit notes (guest or account); folio_id and financial_account_id have no FK. |
| `pms_credit_note_counters` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `issue_invoice_credit_note_draft(IU)` | Credit note number sequence. |
| `pms_debit_note_counters` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `issue_invoice_debit_note_draft(IU)` | Debit note number sequence. |
| `pms_invoice_settings` | Cashiering, Fiscal / Invoicing | Cashiering: direct | reads: `build_guest_folio_invoice_snapshot`, `issue_financial_account_invoice_draft`, `issue_guest_folio_invoice` +1 | Invoice numbering / layout settings. Direct writes from: Cashiering. |
| `pms_issued_invoice_counters` | Fiscal / Invoicing | Fiscal / Invoicing: rpc | writes: `issue_financial_account_invoice_draft(IU)`, `issue_guest_folio_invoice(IU)`, `issue_guest_folio_invoice_draft(IU)` | Issued invoice number sequence. DB comment: “Monotonic issued-invoice sequence per property. Seeded from pms_invoice_settings.starting_number on first issue.” |

### Distribution (8 tables)

Domain: **Distribution** · Primary owner: **Distribution**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `distribution_channels` | CONFIGURATION | PMS | `id` | 3 | integration_id→pms_integrations | pms_integrations | distribution_logs, distribution_meal_mappings, distribution_rate_mappings, distribution_room_mappings | 14-distribution-direct-booking | YES | XREF |
| `distribution_logs` | INTEGRATION | PMS | `id` | 0 | channel_id→distribution_channels | distribution_channels | — | 14-distribution-direct-booking | NO | ZERO, DUP, XWRITE |
| `distribution_meal_mappings` | INTEGRATION | PMS | `id` | 1 | channel_id→distribution_channels, meal_plan_id→pms_meal_plans | distribution_channels, pms_meal_plans | — | 14-distribution-direct-booking | NO | — |
| `distribution_rate_mappings` | INTEGRATION | PMS | `id` | 2 | channel_id→distribution_channels, rate_plan_id→hotel_rate_plans | distribution_channels, hotel_rate_plans | — | 14-distribution-direct-booking | NO | — |
| `distribution_room_mappings` | INTEGRATION | PMS | `id` | 3 | channel_id→distribution_channels, room_type_id→room_types | distribution_channels, room_types | — | 14-distribution-direct-booking | NO | — |
| `pms_distribution_sync_events` | INTEGRATION | PMS | `id` | 18 | — | — | — | 14-distribution-direct-booking | NO | DUP |
| `pms_external_reservation_mappings` | INTEGRATION | PMS | `id` | 3 | reservation_id→hotel_reservations | hotel_reservations | — | 14-distribution-direct-booking | NO | MULTIW |
| `pms_external_reservation_snapshots` | SNAPSHOT | PMS | `id` | 3 | reservation_id→hotel_reservations | hotel_reservations | — | 14-distribution-direct-booking | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `distribution_channels` | Distribution, Cashiering, Direct Booking, Guest Profile | Distribution: direct | — | Channel-manager channel per property; parent of all distribution mappings. |
| `distribution_logs` | Security / Permissions, Distribution, Direct Booking | Direct Booking: direct | — | Channel event log (polymorphic reference_id). Overlaps pms_distribution_sync_events. Direct writes from: Direct Booking. |
| `distribution_meal_mappings` | Distribution | Distribution: direct | — | Meal plan to channel code mapping. DB comment: “Card 6 meal-plan mapping. Deleting a channel removes these rows only.” |
| `distribution_rate_mappings` | Distribution | Distribution: direct | — | Rate plan to channel code mapping. |
| `distribution_room_mappings` | Distribution | Distribution: direct | — | Room type to channel code mapping. |
| `pms_distribution_sync_events` | Distribution, Night Audit | Distribution: direct | — | Channel sync events. Overlaps distribution_logs. DB comment: “Technical distribution sync log. No request body, Basic Auth, partner secret, or card material.” |
| `pms_external_reservation_mappings` | Distribution, Reservations | Distribution: rpc, Reservations: rpc | writes: `apply_external_reservation_event(IU)`, `create_external_reservation_mapping(I)` | External (channel) booking id to reservation. DB comment: “External OTA booking identity. Not hotel_reservations.external_reference. Does not own reservation state.” |
| `pms_external_reservation_snapshots` | Distribution | Distribution: rpc | writes: `apply_external_reservation_event(I)`; triggers: `post_channel_folio_from_external_snapshot` | Raw inbound channel booking snapshots. DB comment: “Scrubbed external booking metadata. Not a folio, not a raw webhook body, and not card data.” |

### Guest Services (11 tables)

Domain: **Guest Services** · Primary owner: **Guest Services**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `guest_service_counters` | CONFIGURATION | PMS | `restaurant_id` | 3 | — | — | — | 05-front-office-guest-services | NO | — |
| `guest_service_history` | TRANSACTION | PMS | `id` | 27 | guest_id→guest_profiles, reservation_id→hotel_reservations, service_type_id→pms_guest_service_types | guest_profiles, hotel_reservations, pms_guest_service_types | — | 05-front-office-guest-services | NO | MULTIW, XWRITE, NOFK, LEGACY, XREF |
| `pms_guest_request_types` | LOOKUP | PMS | `id` | 4 | department_id→pms_departments | pms_departments | — | 05-front-office-guest-services | NO | DUP |
| `pms_guest_service_availability` | CONFIGURATION | PMS | `id` | 5 | service_type_id→pms_guest_service_types | pms_guest_service_types | — | 05-front-office-guest-services | NO | — |
| `pms_guest_service_categories` | LOOKUP | PMS | `id` | 49 | — | — | pms_guest_service_types | 05-front-office-guest-services | NO | XREF |
| `pms_guest_service_department_assignments` | BRIDGE | PMS | `id` | 12 | department_id→pms_departments, service_type_id→pms_guest_service_types | pms_departments, pms_guest_service_types | — | 05-front-office-guest-services | NO | XREF |
| `pms_guest_service_pricing` | CONFIGURATION | PMS | `id` | 16 | service_type_id→pms_guest_service_types | pms_guest_service_types | — | 05-front-office-guest-services | NO | — |
| `pms_guest_service_sla_rules` | CONFIGURATION | PMS | `id` | 4 | service_type_id→pms_guest_service_types | pms_guest_service_types | — | 05-front-office-guest-services | NO | — |
| `pms_guest_service_types` | MASTER | PMS | `id` | 156 | category_id→pms_guest_service_categories | pms_guest_service_categories | folio_transactions, guest_service_history, pms_guest_service_availability, pms_guest_service_department_assignments, pms_guest_service_pricing, +1 more | 05-front-office-guest-services | NO | XREF |
| `pms_meal_applicability_policies` | CONFIGURATION | PMS | `restaurant_id` | 9 | — | — | — | 05-front-office-guest-services | NO | MULTIW, XWRITE, NOFK |
| `pms_reservation_service_entitlements` | TRANSACTION | PMS | `id` | 14 | reservation_id→hotel_reservations, reservation_room_id→hotel_reservation_rooms | hotel_reservations, hotel_reservation_rooms | — | 05-front-office-guest-services | NO | NOFK |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `guest_service_counters` | Guest Profile | Guest Profile: rpc | writes: `next_guest_service_number(I)` | Guest service request number sequence. |
| `guest_service_history` | Guest Profile, Front Office, Housekeeping, Taxes & Fees, Guest Services | Taxes & Fees: rpc, Front Office: rpc, Guest Profile: direct | writes: `post_reservation_service_requests(U)` | Live guest service requests despite the _history name; folio_transaction_id has no FK. Direct writes from: Guest Profile. |
| `pms_guest_request_types` | Property Setup | Property Setup: direct | — | Guest request types with department. Overlaps pms_guest_service_types. |
| `pms_guest_service_availability` | Guest Services | Guest Services: direct | — | Service availability schedule. DB comment: “Card 4 weekly availability windows for configured guest service types, interpreted in the property timezone.” |
| `pms_guest_service_categories` | Guest Services, Housekeeping, Cashiering, Guest Profile | Guest Services: direct | reads: `list_chargeable_guest_services`, `resolve_chargeable_guest_service` | Service categories. DB comment: “Card 4 Guest Service Types categories. Not SET5 request types and not operational guest requests.” |
| `pms_guest_service_department_assignments` | Guest Services, Housekeeping, Taxes & Fees, Cashiering, Guest Profile | Guest Services: direct | triggers: `enable_service_type_for_billing_department`; reads: `list_chargeable_guest_services`, `resolve_chargeable_guest_service` | Service type to department assignment. DB comment: “Card 4 department responsibility for configured guest service types. Not SET5 request types or operational routing.” |
| `pms_guest_service_pricing` | Guest Services, Cashiering, Guest Profile | Guest Services: direct | reads: `list_chargeable_guest_services`, `resolve_chargeable_guest_service` | Service pricing. DB comment: “Card 4 pricing for configured guest service types. Not operational charges or invoices.” |
| `pms_guest_service_sla_rules` | Guest Services | Guest Services: direct | — | Service SLA rules. DB comment: “Card 4 response and resolution targets for configured guest service types. Durations are integer minutes.” |
| `pms_guest_service_types` | Guest Services, Guest Profile, Housekeeping, Taxes & Fees, Front Office, +2 more | Guest Services: direct | writes: `enable_service_type_for_billing_department[trg](U)` | Guest service type master. DB comment: “Card 4 Guest Service Types catalogue. Child of pms_guest_service_categories. Not operational guest requests.” |
| `pms_meal_applicability_policies` | Guest Services, Rate & Revenue | Guest Services: direct, Rate & Revenue: direct | — | Meal entitlement rules (PK restaurant_id); *_department_id columns have no FK. Direct writes from: Rate & Revenue. |
| `pms_reservation_service_entitlements` | Guest Services, Night Audit | Guest Services: direct | — | Meal / service entitlements per reservation night; guest_id, component_id, department_id have no FK. |

### Maintenance (5 tables)

Domain: **Maintenance** · Primary owner: **Maintenance**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_maintenance_categories` | LOOKUP | PMS | `id` | 0 | — | — | — | 06-housekeeping-maintenance | NO | ZERO |
| `pms_maintenance_priorities` | LOOKUP | PMS | `id` | 0 | — | — | — | 06-housekeeping-maintenance | NO | ZERO |
| `pms_maintenance_rules` | CONFIGURATION | PMS | `id` | 5 | preventive_assigned_department_id→pms_departments | pms_departments | pms_maintenance_status_rules | 06-housekeeping-maintenance | NO | — |
| `pms_maintenance_status_rules` | CONFIGURATION | PMS | `id` | 30 | restaurant_id→pms_maintenance_rules | pms_maintenance_rules | — | 06-housekeeping-maintenance | NO | — |
| `pms_maintenance_type_tags` | LOOKUP | PMS | `id` | 0 | — | — | — | 06-housekeeping-maintenance | NO | ZERO |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_maintenance_categories` | Property Setup | Property Setup: generic | — | Maintenance categories. DB comment: “PMS-SET4 maintenance-category catalogue. Baseline codes are property-editable. Empty is a Warning.” |
| `pms_maintenance_priorities` | Property Setup | Property Setup: generic | — | Maintenance priorities. DB comment: “PMS-SET4 maintenance-priority catalogue (normal/high/urgent). Empty is a Warning.” |
| `pms_maintenance_rules` | Maintenance, Rooms & Inventory | Maintenance: direct | reads: `pms_set_room_operational_restriction` | Maintenance / OOO / OOS rules. DB comment: “Card 2 Maintenance configuration only. Does not change assignment, check-in, capacity RPCs, Inventory Rules, SET4, or Housekeeping. Not live…” |
| `pms_maintenance_status_rules` | Maintenance, Rooms & Inventory | Maintenance: direct | reads: `assert_room_assignable`, `pms_evaluate_room_assignment` | Maintenance status assignability rules. DB comment: “Card 2 per-status maintenance policy. Applies to hotel_rooms.maintenance_status. Closed set: normal, maintenance_required, in_progress, out_…” |
| `pms_maintenance_type_tags` | Property Setup | Property Setup: generic | — | Maintenance type tags. DB comment: “PMS-SET4 maintenance type-tag catalogue (preventive/corrective/emergency/inspection). Empty is a Warning.” |

### Integrations (19 tables)

Domain: **Integrations** · Primary owner: **Integrations**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_communication_automation_rules` | CONFIGURATION | PMS | `id` | 1 | event_id→pms_communication_notification_events, template_id→pms_communication_templates | pms_communication_notification_events, pms_communication_templates | — | 15b-integrations-communications | NO | — |
| `pms_communication_channels` | CONFIGURATION | PMS | `id` | 40 | — | — | pms_communication_defaults, pms_communication_sender_settings | 15b-integrations-communications | NO | MULTIW, XWRITE, XREF |
| `pms_communication_defaults` | CONFIGURATION | PMS | `id` | 7 | default_guest_channel_id→pms_communication_channels, default_internal_channel_id→pms_communication_channels, default_marketing_channel_id→pms_communication_channels, default_sender_id→pms_communication_sender_settings | pms_communication_channels, pms_communication_sender_settings | — | 15b-integrations-communications | NO | — |
| `pms_communication_notification_events` | LOOKUP | PMS | `id` | 96 | default_template_id→pms_communication_templates | pms_communication_templates | pms_communication_automation_rules | 15b-integrations-communications | NO | XWRITE |
| `pms_communication_sender_settings` | CONFIGURATION | PMS | `id` | 40 | channel_type→pms_communication_channels | pms_communication_channels | pms_communication_defaults | 15b-integrations-communications | NO | — |
| `pms_communication_templates` | CONFIGURATION | PMS | `id` | 2 | — | — | pms_communication_automation_rules, pms_communication_notification_events | 15b-integrations-communications | NO | DUP |
| `pms_import_duplicate_policies` | CONFIGURATION | PMS | `id` | 30 | import_type_id→pms_import_types | pms_import_types | — | 15b-integrations-communications | NO | — |
| `pms_import_field_definitions` | LOOKUP | PMS | `id` | 37 | import_type_id→pms_import_types | pms_import_types | pms_import_mapping_template_fields | 15b-integrations-communications | NO | — |
| `pms_import_job_issues` | HISTORY | PMS | `id` | 0 | job_id→pms_import_jobs | pms_import_jobs | — | 15b-integrations-communications | NO | ZERO |
| `pms_import_jobs` | QUEUE | PMS | `id` | 0 | import_type_id→pms_import_types | pms_import_types | pms_import_job_issues | 15b-integrations-communications | NO | ZERO |
| `pms_import_mapping_template_fields` | CONFIGURATION | PMS | `id` | 14 | field_definition_id→pms_import_field_definitions, template_id→pms_import_mapping_templates | pms_import_field_definitions, pms_import_mapping_templates | — | 15b-integrations-communications | NO | — |
| `pms_import_mapping_templates` | CONFIGURATION | PMS | `id` | 2 | import_type_id→pms_import_types | pms_import_types | pms_import_mapping_template_fields | 15b-integrations-communications | NO | — |
| `pms_import_policies` | CONFIGURATION | PMS | `id` | 6 | — | — | — | 15b-integrations-communications | NO | — |
| `pms_import_type_settings` | CONFIGURATION | PMS | `id` | 30 | import_type_id→pms_import_types | pms_import_types | — | 15b-integrations-communications | NO | — |
| `pms_import_types` | LOOKUP | PMS | `id` | 5 | — | — | pms_import_duplicate_policies, pms_import_field_definitions, pms_import_jobs, pms_import_mapping_templates, pms_import_type_settings, +1 more | 15b-integrations-communications | NO | — |
| `pms_import_validation_rules` | CONFIGURATION | PMS | `id` | 102 | import_type_id→pms_import_types | pms_import_types | — | 15b-integrations-communications | NO | — |
| `pms_integration_activity` | AUDIT | PMS | `id` | 194 | integration_id→pms_integrations | pms_integrations | — | 15b-integrations-communications | NO | — |
| `pms_integrations` | INTEGRATION | PMS | `id` | 6 | — | — | distribution_channels, fiscal_buyer_code_mappings, fiscal_credential_refs, fiscal_integration_tokens, fiscal_item_mappings, +4 more | 15b-integrations-communications | NO | MULTIW, XWRITE, XREF |
| `pms_notification_templates` | CONFIGURATION | PMS | `id` | 1 | — | — | — | 15b-integrations-communications | NO | DUP |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_communication_automation_rules` | Integrations | Integrations: direct | — | Communication automation rules. DB comment: “Card 4 property automation-rule configuration. Not a delivery engine or SET5 catalogue.” |
| `pms_communication_channels` | Integrations, Reservations, Distribution, Property Setup, Guest Profile | Distribution: direct, Property Setup: direct | — | Email/SMS channel configuration. Direct writes from: Distribution. |
| `pms_communication_defaults` | Integrations, Guest Profile | Integrations: direct | — | Communication defaults. DB comment: “Card 4 property communication defaults. Does not store secrets or drive delivery.” |
| `pms_communication_notification_events` | Reservations, Integrations | Reservations: direct | triggers: `protect_pms_card4_system_notification_event` | Notification event catalogue. Direct writes from: Reservations. |
| `pms_communication_sender_settings` | Integrations, Property Setup | Property Setup: direct | — | Sender identity settings. DB comment: “Card 4 per-channel sender settings. Provider secrets are never stored.” |
| `pms_communication_templates` | Integrations, Reservations | Integrations: direct | — | Communication templates. Overlaps pms_notification_templates. |
| `pms_import_duplicate_policies` | Integrations | Integrations: direct | — | Import duplicate handling. DB comment: “Card 7 duplicate handling. Guest match keys are email and phone. Action cannot merge. guest_merge_ledger stays in the guest module.” |
| `pms_import_field_definitions` | Integrations | — | — | Import field catalogue (no app writer). DB comment: “Card 7 target fields for mapping templates. Codes match domain writer inputs. Not executable transforms.” |
| `pms_import_job_issues` | Integrations | — | — | Import job issues (no app writer). DB comment: “Card 7 import error/warning history. Empty until a later domain-safe run records issues.” |
| `pms_import_jobs` | Integrations | — | — | Import jobs (no app writer). DB comment: “Card 7 import history. Status is a record. This table does not enqueue work, parse files, or write domain rows.” |
| `pms_import_mapping_template_fields` | Integrations | Integrations: direct | — | Import mapping template fields. DB comment: “Source CSV column names mapped to pms_import_field_definitions. No SQL or formula payload.” |
| `pms_import_mapping_templates` | Integrations | Integrations: direct | — | Import mapping templates. DB comment: “Card 7 tenant field-mapping templates. Configuration only. Not a CSV reader.” |
| `pms_import_policies` | Integrations | Integrations: direct | — | Import policies. DB comment: “Card 7 tenant import defaults. CSV only. Not a parser, storage bucket, or Excel engine.” |
| `pms_import_type_settings` | Integrations | Integrations: direct | — | Per-property import type settings. DB comment: “Card 7 tenant enablement of supported import types. Deferred types are not catalogued.” |
| `pms_import_types` | Integrations | — | — | Global import type catalogue (no restaurant_id). DB comment: “Card 7 global import-type catalogue. handler_key names an existing domain writer. Not a generic table importer.” |
| `pms_import_validation_rules` | Integrations | Integrations: direct | — | Import validation rules. DB comment: “Card 7 import validation flags. Domain writers remain the real validators. Not executable expressions.” |
| `pms_integration_activity` | Integrations, Fiscal / Invoicing | Integrations: direct, Fiscal / Invoicing: direct | — | Integration activity log. DB comment: “Integration history. integration_name is denormalised so the feed survives deletion.” |
| `pms_integrations` | Fiscal / Invoicing, Distribution, Night Audit, Integrations | Integrations: direct, Fiscal / Invoicing: direct, Distribution: direct | reads: `fiscal_store_api_credentials` | Integration registry (channel manager, fiscal, etc.). Direct writes from: Fiscal / Invoicing, Distribution. |
| `pms_notification_templates` | Property Setup | Property Setup: direct | — | Notification templates. Overlaps pms_communication_templates. |

### Reports / Analytics (8 tables)

Domain: **Reports / Analytics** · Primary owner: **Reports / Analytics**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_metric_definition_settings` | CONFIGURATION | PMS | `id` | 8 | metric_id→pms_metric_definitions | pms_metric_definitions | — | 15c-reports-analytics | NO | — |
| `pms_metric_definitions` | LOOKUP | PMS | `id` | 4 | — | — | pms_metric_definition_settings | 15c-reports-analytics | NO | — |
| `pms_report_access_events` | AUDIT | PMS | `id` | 4 | — | — | — | 15c-reports-analytics | NO | — |
| `pms_report_categories` | LOOKUP | PMS | `id` | 5 | — | — | pms_report_definitions | 15c-reports-analytics | NO | — |
| `pms_report_definition_settings` | CONFIGURATION | PMS | `id` | 30 | definition_id→pms_report_definitions | pms_report_definitions | — | 15c-reports-analytics | NO | — |
| `pms_report_definitions` | LOOKUP | PMS | `id` | 5 | category_id→pms_report_categories | pms_report_categories | pms_report_definition_settings, pms_report_permissions | 15c-reports-analytics | NO | — |
| `pms_report_permissions` | SECURITY | PMS | `id` | 20 | definition_id→pms_report_definitions, permission_id→pms_permissions | pms_report_definitions, pms_permissions | — | 15c-reports-analytics | NO | — |
| `pms_report_policies` | CONFIGURATION | PMS | `id` | 6 | — | — | — | 15c-reports-analytics | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_metric_definition_settings` | Reports / Analytics | Reports / Analytics: direct | — | Per-property metric settings. DB comment: “Card 7 tenant metric enablement. display_name is a label. Formula stays on pms_metric_definitions.” |
| `pms_metric_definitions` | Reports / Analytics | — | — | Global metric catalogue (no restaurant_id). DB comment: “Card 7 global KPI registry. One row per code. occupancy_range and occupancy_in_house stay distinct.” |
| `pms_report_access_events` | Fiscal / Invoicing, Guest Services, Direct Booking | Fiscal / Invoicing: direct, Guest Services: direct, Direct Booking: direct | — | Report access audit. DB comment: “Who printed or exported a PMS report, for which property, with which filters and row count. Report rows are not stored.” |
| `pms_report_categories` | Reports / Analytics | — | — | Global report categories. DB comment: “Card 7 global report packs. Aligns with SET6 REPORT_PACKS. Not a BI cube.” |
| `pms_report_definition_settings` | Reports / Analytics | Reports / Analytics: direct | — | Per-property report settings. DB comment: “Card 7 tenant enablement of global report definitions. Does not hide live Reports tabs in 0087.” |
| `pms_report_definitions` | Reports / Analytics | — | — | Global report catalogue. DB comment: “Card 7 global report registry. query_key names an existing Reports-module function. Not a second query engine.” |
| `pms_report_permissions` | Reports / Analytics | Reports / Analytics: direct | — | Report permissions. DB comment: “Card 7 mapping of report definitions to pms_permissions. Not STAFF_ROLES and not live RLS.” |
| `pms_report_policies` | Reports / Analytics | Reports / Analytics: direct | — | Report policies. DB comment: “Card 7 tenant report defaults. Not a CSV generator, scheduler, or fiscal-year table. SET6 JSON is not dropped.” |

### Security / Permissions (12 tables)

Domain: **Security / Permissions** · Primary owner: **Security / Permissions**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `pms_approval_rules` | CONFIGURATION | PMS | `id` | 1 | permission_id→pms_permissions, approver_role_id→pms_hotel_roles | pms_permissions, pms_hotel_roles | — | 15a-security-platform | NO | — |
| `pms_audit_categories` | LOOKUP | PMS | `id` | 8 | — | — | pms_audit_category_settings | 15a-security-platform | NO | — |
| `pms_audit_category_settings` | CONFIGURATION | PMS | `id` | 8 | category_id→pms_audit_categories | pms_audit_categories | — | 15a-security-platform | NO | — |
| `pms_audit_policies` | CONFIGURATION | PMS | `id` | 6 | — | — | — | 15a-security-platform | NO | — |
| `pms_audit_sensitive_coverage` | CONFIGURATION | PMS | `id` | 24 | permission_id→pms_permissions | pms_permissions | — | 15a-security-platform | NO | — |
| `pms_hotel_roles` | MASTER | PMS | `id` | 3 | department_id→pms_departments | pms_departments | pms_approval_rules, pms_membership_roles, pms_role_permissions, restaurant_users | 15a-security-platform | NO | — |
| `pms_membership_roles` | BRIDGE | PMS | `id` | 3 | role_id→pms_hotel_roles | pms_hotel_roles | — | 15a-security-platform | NO | — |
| `pms_permissions` | LOOKUP | PMS | `id` | 133 | — | — | pms_approval_rules, pms_audit_sensitive_coverage, pms_report_permissions, pms_role_permissions | 15a-security-platform | NO | XREF |
| `pms_role_permissions` | BRIDGE | PMS | `id` | 192 | permission_id→pms_permissions, role_id→pms_hotel_roles | pms_permissions, pms_hotel_roles | — | 15a-security-platform | NO | — |
| `profiles` | SECURITY | SHARED | `id` | 16 | — | — | — | 15a-security-platform | NO | MULTIW, XWRITE, XREF |
| `restaurant_staff_audit_log` | AUDIT | SHARED | `id` | 1,389 | — | — | — | 15a-security-platform | NO | LEGACY |
| `staff_module_access` | SECURITY | SHARED | `id` | 2 | — | — | — | 15a-security-platform | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `pms_approval_rules` | Security / Permissions, Rate & Revenue, Cashiering | Security / Permissions: direct | — | Permission-threshold approval rules. DB comment: “Card 7 setup approval configuration. Not an approval inbox, request log, or workflow engine.” |
| `pms_audit_categories` | Security / Permissions | — | — | Global audit category catalogue (no restaurant_id). DB comment: “Card 7 global audit categories. No restaurant_id. Not an event log.” |
| `pms_audit_category_settings` | Security / Permissions | Security / Permissions: direct | — | Per-property audit category settings. DB comment: “Card 7 tenant audit category matrix. Maps policy onto existing logs; does not store events.” |
| `pms_audit_policies` | Security / Permissions | Security / Permissions: direct | — | Audit retention / masking policy. DB comment: “Card 7 tenant audit policy. Not a purge job and not a second event log. SET5 pms_audit_retention_posture is not dropped.” |
| `pms_audit_sensitive_coverage` | Security / Permissions | Security / Permissions: direct | — | Sensitive-permission audit coverage. DB comment: “Card 7 checklist for 0085 sensitive permissions. Does not log refunds, activates, or module-access changes.” |
| `pms_hotel_roles` | Security / Permissions, Human Resources / Staff, Rate & Revenue | Security / Permissions: direct | — | Hotel role master. DB comment: “Card 7 tenant hotel roles. Parallel to restaurant_users.role (STAFF_ROLES). Not a second identity table.” |
| `pms_membership_roles` | Human Resources / Staff, Security / Permissions | Security / Permissions: direct | — | Staff membership to hotel role. DB comment: “PMS multi-role assignments. Live RBAC source. hotel_role_id is not used.” |
| `pms_permissions` | Security / Permissions, Human Resources / Staff, Rate & Revenue, Cashiering, Reports / Analytics | — | — | Global permission catalogue (no restaurant_id, no app writer). |
| `pms_role_permissions` | Security / Permissions, Human Resources / Staff | Security / Permissions: direct | — | Role to permission grants. DB comment: “Card 7 role-permission map. Configuration only. Existing RLS must not read this table in 0084.” |
| `profiles` | Cashiering, Front Office, Fiscal / Invoicing, Rate & Revenue, Shared Core, +12 more | Shared Core: direct, Human Resources / Staff: direct | triggers: `enforce_profile_account_type`, `protect_must_change_password`; reads: `is_platform_admin`, `issue_financial_account_invoice_draft`, `issue_invoice_credit_note_draft` +1 | Staff login identity (1:1 auth.users). Direct writes from: Human Resources / Staff. |
| `restaurant_staff_audit_log` | Property Setup, Guest Profile, Rate & Revenue, Guest Services, Integrations, +11 more | Human Resources / Staff: direct, Security / Permissions: direct, Reservations: direct, Property Setup: direct, +12 more | — | Property-wide staff/settings audit trail written by most setup modules. |
| `staff_module_access` | Shared Core | Shared Core: direct | — | Per-membership module access. |

### Platform Admin (2 tables)

Domain: **Platform Admin** · Primary owner: **Platform Admin**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `admin_audit_log` | AUDIT | PLATFORM | `id` | 62 | — | — | — | 15a-security-platform | NO | — |
| `restaurant_package_entitlements` | PLATFORM | PLATFORM | `id` | 11 | — | — | — | 15a-security-platform | NO | LEGACY |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `admin_audit_log` | Platform Admin, Marketing / CMS | Platform Admin: direct, Marketing / CMS: direct | — | Platform-admin actions on properties and users (FK to auth.users). |
| `restaurant_package_entitlements` | Platform Admin | Platform Admin: direct | writes: `seed_restaurant_package_entitlements[trg](I)` | Per-property package entitlement (PMS only). |

### Marketing / CMS (2 tables)

Domain: **Marketing / CMS** · Primary owner: **Marketing / CMS**

| Table | Type | Scope | PK | Rows | Important FKs | Parents | Children | ERD Group | High-Level ERD | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `leads` | MARKETING | MARKETING | `id` | 1 | — | — | — | 16-marketing-cms | NO | — |
| `marketing_content_revisions` | MARKETING | MARKETING | `status` | 2 | — | — | — | 16-marketing-cms | NO | — |

| Table | Readers (modules) | Writers (module: kind) | Main functions / RPCs | Notes |
|---|---|---|---|---|
| `leads` | Marketing / CMS | Marketing / CMS: direct | — | Public website contact leads (no restaurant_id). DB comment: “Public Request Demo and Contact submissions. Service-role access only. Not package entitlements.” |
| `marketing_content_revisions` | Marketing / CMS | Marketing / CMS: direct | — | Marketing CMS content revisions. DB comment: “Core marketing CMS. Draft/published MarketingContent JSONB. Not entitlements. Last-write-wins.” |

## Architecture Findings

Audit only. Nothing below is a deletion recommendation.

### A. Clear / Healthy

171 tables carry no warning flag. Healthy patterns observed:

- **Single financial ledger.** `folio_transactions` is the only money ledger for both guest folios and AR financial accounts; balances are derived (`folio_balance`, `financial_account_balance`). Invoices, allocations and withholding post through RPCs (`post_folio_transaction`, `post_financial_account_transaction`, `issue_*_invoice_draft`).
- **RPC-mediated lifecycle writes.** Reservation, room and folio state changes from Front Office, Housekeeping, Distribution and Direct Booking happen through owner RPCs (`check_in_hotel_reservation`, `housekeeping_complete_task`, `apply_external_reservation_event`, `create_direct_booking`, `open_folio_for_reservation`), not direct DML.
- **Immutable history tables** with documented append-only rules: `hotel_rate_change_events`, `hotel_rate_restriction_change_events`, `hotel_commercial_change_events`, `fiscal_registration_attempts`, `hotel_competitor_rate_observations`.
- **Tenant-scoped composite FKs.** Most PMS FKs are `(restaurant_id, x_id)` pairs, preventing cross-property references.
- **Business date has one source of truth.** `restaurants.business_date` is changed only by `close_business_date` and `adjust_business_date`; `night_audit_runs` and `business_date_adjustments` record the transitions.
- All 297 tables have a primary key and RLS enabled; all 764 FKs are validated (no `NOT VALID` constraints), so no orphaned FKs were found.

### B. Investigate

No INVESTIGATE tables remain (0). ARCH-02 resolved ownership as follows:

| Table | Rows | Resolved domain | ERD group | Basis |
|---|---|---|---|---|
| `fo_service_catalogue` | 0 | Rate & Revenue | 09b-packages-promotions | Legacy package-service catalogue (0 rows). Only FK children are pms_package_components.fo_service_id and pms_event_package_template_services; edited from the meals/packages and sales-events setup cards. Superseded by pms_guest_service_types (deprecate later, ARCH-02). |
| `pms_shift_definitions` | 0 | Human Resources / Staff | 12-staff-hr | Workforce shift templates (0 rows) maintained in the Administration roles/shifts/staff card. Template only; not a cashier drawer session (hotel_cashier_shifts) and not a rota instance (staff_shifts) (ARCH-02). |
| `restaurant_tables` | 3 | Human Resources / Staff | 12-staff-hr | Retained F&B outlet table master used only by workforce table assignment (docs/pms-only-architecture.md). No app writer; qr_token is a retired NOT NULL column (ARCH-02). |
| `staff_table_assignments` | 0 | Human Resources / Staff | 12-staff-hr | Workforce: staff member to outlet table per staff shift (0 rows). Written only by the workforce module (ARCH-02). |
| `housekeeping_maintenance_requests` | 5 | Housekeeping | 06-housekeeping-maintenance | Maintenance requests raised and progressed only by the Housekeeping module; owner moved from Maintenance to Housekeeping (ARCH-02). Maintenance owns rules and catalogues. |

Remaining items needing a decision (see the ARCH-02 review):

| Table | Rows | Reason |
|---|---|---|
| `hotel_rate_plans` (constraint) | — | Two duplicated FK constraint pairs: `hotel_rate_plans_cancellation_policy_fk` / `hotel_rate_plans_cancel…`, and `hotel_rate_plans_refundability_fk` / `hotel_rate_plans_refundabilit…` enforce the same relationship twice. |
| `financial_account_participants` | 0 | Documented in a DB comment but never referenced from source; master-account participant linking appears unimplemented in the app. |
| `restaurants` (width) | 11 | 150+ columns including ~20 JSON `pms_*_posture` / `*_rules` columns that overlap dedicated configuration tables (see section C). |

### C. Possible duplication

Evidence is from columns, relationships and write paths, not names alone.

| Concept | Tables / columns | Assessment |
|---|---|---|
| Reservation status | `hotel_reservations.status`, `hotel_reservation_rooms.status` | Intentional derivation: `rollup_hotel_reservation_status` rolls unit status up to the header. Not a defect, but two status columns must stay in sync. |
| Room assignment / stay dates | `hotel_reservations.room_id, room_type_id, arrival_date, departure_date, adults, children, rate_plan_id, room_subtotal` vs the same columns on `hotel_reservation_rooms` | Header mirrors unit-level data (`sync_reservation_room_total`, `rollup_hotel_reservation_status`). Multi-room stays make the header copy ambiguous. Candidate for a documented 'header = summary only' rule. |
| Room status | `hotel_rooms.status`, `housekeeping_status`, `maintenance_status`, `sellable`, `restriction_*` columns; `pms_operational_inventory_blocks`; `housekeeping_maintenance_requests.status` | Three status dimensions on one row plus a block table. Catalogued by `pms_housekeeping_status_catalog` / `pms_maintenance_status_rules`. Not duplicate data, but the ownership split (HK vs Maintenance vs Rooms) must be explicit. |
| Guest identity | `guest_profiles.id_document_type/number/expiry` vs `guest_documents`; `guest_profiles.vip_status` (text) vs `pms_guest_vip_levels` (0 rows, no FK) | Primary ID stored on the profile and again as document rows. VIP level catalogue exists but the profile column is free text. |
| Guest companions | `fo_stay_companions` (0 rows) vs `hotel_reservation_room_guests` (67 rows) | Same reservation-to-guest bridge. Live data is only in `hotel_reservation_room_guests`. |
| Guest preferences | `guest_preferences` (fixed columns) vs `guest_preference_values` (EAV on `pms_guest_preference_types`) vs `pms_preference_options` (0 rows) | Two storage models for the same concept; the options table duplicates `pms_guest_preference_types.options`. |
| Account / company on reservation | `hotel_reservations.company_name`, `group_name` (text) vs `company_master_id`, `group_account_master_id` | Free-text names coexist with FKs to `guest_account_masters`. |
| Payment | `folio_transactions.payment_method` (text) vs `pms_payment_methods`; `fo_checkin_progress.deposit_amount/deposit_method` vs the deposit `folio_transactions` row (`deposit_transaction_id`) | Payment method is not FK-linked to the catalogue. Check-in progress stores a copy of the deposit amount and method. |
| Payment-to-invoice allocation | `guest_payment_invoice_allocations`, `guest_deposit_invoice_allocations`, `folio_deposit_allocations`, `financial_account_payment_allocations` | Four allocation tables. Guest vs account split is intentional (parallel ledgers); `folio_deposit_allocations` (0 rows, no app writer) vs `guest_deposit_invoice_allocations` (5 rows) overlap. |
| Invoice documents | `guest_folio_invoices*` vs `financial_account_invoices*` | Parallel guest/account invoice families (draft, draft items, lines, events). Intentional, but doubles schema surface; credit notes already unify both via `invoice_credit_notes`. |
| Tax configuration | `pms_taxes` / `pms_tax_groups` vs `restaurants.tax_identities`, `vat_number`, `tin_number`, `default_room_tax_group_id`; `fiscal_tax_code_mappings`; `guest_account_masters.tax_exempt*` vs `pms_tax_exemption_rules` | Tax rates are single-sourced in `pms_taxes`; property tax identity lives in `restaurants` columns. Exemption is modelled both as rule table and as account columns (account references the rule via `tax_exemption_rule_id`). |
| Booking policies | `restaurants.deposit_required/type/value`, `cancel_window_hours`, `cancel_fee_basis`, `fo_cancel_fee_*`, `fo_noshow_fee_*`, `early_checkin_fee`, `late_checkout_fee` vs `pms_deposit_policies`, `pms_rate_cancellation_policies`, `pms_no_show_policies`, `pms_fees` | Property-level policy columns coexist with policy tables referenced by rate plans and reservations. |
| Restrictions | `hotel_rate_restrictions` (date-level) vs `pms_commercial_restrictions` + `pms_commercial_restriction_room_types`; `pms_restriction_reasons` (0 rows) | Two restriction models; `price_hotel_stay` reads only `hotel_rate_restrictions`. |
| Cashier shift | `hotel_cashier_shifts` vs `pms_shift_definitions` (0 rows) vs `staff_shifts` (0 rows); `folio_history.legacy_cashier_shift_id` | Cashier drawer sessions are single-sourced in `hotel_cashier_shifts`. Shift templates have no FK to either shift table; a legacy shift id column survives on folio history. |
| Staff permission | `restaurant_users.role` + `hotel_role_id` vs `pms_membership_roles` (multi-role bridge) vs `staff_module_access` vs `pms_report_permissions` | Role is stored both as a single column on membership and as a bridge. Module access and report permissions are further, separate grants. |
| Service catalogue / requests | `fo_service_catalogue` (0 rows) vs `pms_guest_service_types` (156); `pms_guest_request_types` vs `pms_guest_service_types`; `fo_guest_requests` vs `guest_service_history` | Three catalogues and two request stores for guest services. `pms_package_components.fo_service_id` still points at the empty FO catalogue. |
| Communication templates | `pms_communication_templates` vs `pms_notification_templates` | Both hold code/name/channel/body templates per property. |
| Distribution logging | `distribution_logs` (0 rows) vs `pms_distribution_sync_events` (18) | Two channel event logs; only the sync-events table is populated. |
| Inventory holds | `pms_agency_allotments`, `pms_group_blocks` / `pms_group_allotment_nights`, `pms_operational_inventory_blocks` | Three ways to hold room inventory. `pms_group_allotment_nights.inventory_block_id` hints at an intended link to operational blocks but has no FK. |
| Property configuration JSON | `restaurants.pms_offline_*_posture`, `pms_audit_retention_posture`, `property_areas`, `department_contacts`, `pms_hk_status_rules`, `pms_routing_defaults`, etc. | JSON posture columns on `restaurants` overlap `pms_offline_policies`, `pms_audit_policies`, `pms_property_areas`, `pms_property_department_contacts`, `pms_housekeeping_*`, `pms_department_routing_rules`. |
| Business date | `restaurants.business_date` + `business_date_config`; `night_audit_runs.business_date`; `hotel_revenue_otb_snapshots.as_of_business_date` | No duplication: one authoritative value; others are run/snapshot keys. |
| Inventory movement | `inventory_stock_movements` vs `pms_room_inventory_events` | No duplication: stock goods vs room inventory changes are different concepts. |

### D. Cross-domain ownership conflicts

Tables written with **direct DML** by a module outside the owner domain (RPC-mediated writes are not conflicts). Property Setup / Shared Core writes are excluded.

| Table | Owner | Direct writers outside owner | All writers |
|---|---|---|---|
| `distribution_logs` | Distribution | Direct Booking | Direct Booking: direct |
| `folio_history` | Cashiering | Front Office | Front Office: direct, Cashiering: rpc, Fiscal / Invoicing: rpc, Reservations: rpc |
| `guest_folios` | Cashiering | Front Office | Front Office: direct, Cashiering: rpc, Reservations: rpc, Distribution: rpc |
| `guest_profile_history` | Guest Profile | Direct Booking | Guest Profile: direct, Direct Booking: direct |
| `guest_profiles` | Guest Profile | Reservations, Front Office, Direct Booking | Reservations: direct, Front Office: direct, Guest Profile: direct, Direct Booking: direct, Distribution: rpc |
| `guest_service_history` | Guest Services | Guest Profile | Taxes & Fees: rpc, Front Office: rpc, Guest Profile: direct |
| `hotel_reservation_history` | Reservations | Direct Booking | Front Office: rpc, Rate & Revenue: rpc, Reservations: direct, Direct Booking: direct, Distribution: rpc |
| `hotel_reservation_rooms` | Reservations | Front Office | Front Office: direct, Rate & Revenue: rpc, Reservations: direct, Distribution: rpc |
| `hotel_reservations` | Reservations | Front Office, Direct Booking, Guest Profile | Front Office: direct, Rate & Revenue: rpc, Reservations: direct, Direct Booking: direct, Guest Profile: direct, Distribution: rpc |
| `hotel_rooms` | Rooms & Inventory | Housekeeping | Housekeeping: direct, Property Setup: direct, Rooms & Inventory: direct, Front Office: rpc |
| `housekeeping_history` | Housekeeping | Rooms & Inventory | Housekeeping: direct, Rooms & Inventory: direct, Front Office: rpc |
| `pms_communication_channels` | Integrations | Distribution | Distribution: direct, Property Setup: direct |
| `pms_communication_notification_events` | Integrations | Reservations | Reservations: direct |
| `pms_departments` | Property Core | Guest Services | Property Setup: direct, Guest Services: direct, Property Core: direct, Taxes & Fees: generic |
| `pms_group_types` | Guest Profile | Reservations | Reservations: direct, Guest Profile: direct |
| `pms_integrations` | Integrations | Fiscal / Invoicing, Distribution | Integrations: direct, Fiscal / Invoicing: direct, Distribution: direct |
| `pms_invoice_settings` | Fiscal / Invoicing | Cashiering | Cashiering: direct |
| `pms_meal_applicability_policies` | Guest Services | Rate & Revenue | Guest Services: direct, Rate & Revenue: direct |
| `pms_no_show_policies` | Rate & Revenue | Guest Profile | Rate & Revenue: direct, Guest Profile: direct |
| `pms_purpose_of_stay` | Reservations | Direct Booking | Direct Booking: direct |
| `pms_registration_agreement_versions` | Front Office | Guest Profile | Front Office: direct, Guest Profile: direct |
| `profiles` | Security / Permissions | Human Resources / Staff | Shared Core: direct, Human Resources / Staff: direct |
| `restaurants` | Property Core | Platform Admin, Security / Permissions, Rooms & Inventory, Maintenance, Reports / Analytics, Distribution, Taxes & Fees, Housekeeping, Guest Profile | Platform Admin: direct, Shared Core: direct, Property Setup: direct, Security / Permissions: direct, Rooms & Inventory: direct, Maintenance: direct, Reports / Analytics: direct, Night Audit: rpc, +4 more |

23 tables. Multiple-writer tables (any kind, excluding AUDIT): 44.

Cross-domain shared reference tables (read by 4+ non-setup modules; one primary owner kept):

| Table | Owner | Reader modules |
|---|---|---|
| `restaurants` | Property Core | 21: Guest Profile, Front Office, Rate & Revenue, Reservations, Cashiering, Fiscal / Invoicing, Distribution, Rooms & Inventory, +13 more |
| `profiles` | Security / Permissions | 15: Cashiering, Front Office, Fiscal / Invoicing, Rate & Revenue, Inventory / Procurement, Human Resources / Staff, Platform Admin, Night Audit, +7 more |
| `restaurant_users` | Human Resources / Staff | 15: Cashiering, Front Office, Fiscal / Invoicing, Rate & Revenue, Human Resources / Staff, Inventory / Procurement, Night Audit, Guest Profile, +7 more |
| `hotel_reservations` | Reservations | 12: Front Office, Reservations, Rate & Revenue, Guest Profile, Night Audit, Rooms & Inventory, Distribution, Direct Booking, +4 more |
| `hotel_rooms` | Rooms & Inventory | 11: Front Office, Reservations, Rate & Revenue, Rooms & Inventory, Housekeeping, Night Audit, Guest Services, Direct Booking, +3 more |
| `pms_departments` | Property Core | 11: Property Core, Guest Profile, Guest Services, Security / Permissions, Housekeeping, Cashiering, Maintenance, Taxes & Fees, +3 more |
| `hotel_reservation_rooms` | Reservations | 10: Front Office, Reservations, Rate & Revenue, Rooms & Inventory, Night Audit, Housekeeping, Cashiering, Guest Services, +2 more |
| `guest_profiles` | Guest Profile | 9: Front Office, Guest Profile, Reservations, Cashiering, Direct Booking, Fiscal / Invoicing, Housekeeping, Guest Services, +1 more |
| `hotel_rate_plans` | Rate & Revenue | 9: Rate & Revenue, Guest Profile, Distribution, Reservations, Front Office, Direct Booking, Guest Services, Cashiering, +1 more |
| `room_types` | Rooms & Inventory | 9: Rate & Revenue, Guest Profile, Rooms & Inventory, Reservations, Front Office, Distribution, Direct Booking, Cashiering, +1 more |
| `guest_folios` | Cashiering | 8: Cashiering, Front Office, Night Audit, Guest Profile, Fiscal / Invoicing, Reservations, Taxes & Fees, Distribution |
| `hotel_reservation_history` | Reservations | 8: Front Office, Reservations, Rate & Revenue, Housekeeping, Security / Permissions, Direct Booking, Guest Profile, Distribution |
| `folio_transactions` | Cashiering | 7: Cashiering, Fiscal / Invoicing, Front Office, Guest Profile, Reservations, Night Audit, Taxes & Fees |
| `pms_guest_service_types` | Guest Services | 7: Guest Services, Guest Profile, Housekeeping, Taxes & Fees, Front Office, Cashiering, Fiscal / Invoicing |
| `hotel_rate_restrictions` | Rate & Revenue | 6: Rate & Revenue, Reservations, Direct Booking, Front Office, Night Audit, Distribution |
| `pms_source_codes` | Reservations | 5: Guest Profile, Reservations, Cashiering, Distribution, Rate & Revenue |
| `folio_history` | Cashiering | 5: Cashiering, Fiscal / Invoicing, Front Office, Security / Permissions, Reservations |
| `guest_account_masters` | Guest Profile | 5: Guest Profile, Cashiering, Rate & Revenue, Fiscal / Invoicing, Front Office |
| `guest_service_history` | Guest Services | 5: Guest Profile, Front Office, Housekeeping, Taxes & Fees, Guest Services |
| `hotel_rate_calendar` | Rate & Revenue | 5: Rate & Revenue, Reservations, Direct Booking, Front Office, Distribution |
| `hotel_reservation_packages` | Reservations | 4: Reservations, Rate & Revenue, Guest Services, Front Office |
| `hotel_reservation_room_guests` | Reservations | 5: Front Office, Guest Profile, Direct Booking, Reservations, Distribution |
| `pms_communication_channels` | Integrations | 4: Integrations, Reservations, Distribution, Guest Profile |
| `pms_exchange_rates` | Accounting / Finance | 5: Rate & Revenue, Reservations, Accounting / Finance, Direct Booking, Front Office |
| `pms_guest_service_department_assignments` | Guest Services | 5: Guest Services, Housekeeping, Taxes & Fees, Cashiering, Guest Profile |
| `pms_market_segments` | Reservations | 4: Guest Profile, Reservations, Cashiering, Rate & Revenue |
| `pms_meal_plans` | Rate & Revenue | 4: Guest Profile, Rate & Revenue, Guest Services, Distribution |
| `pms_permissions` | Security / Permissions | 5: Security / Permissions, Human Resources / Staff, Rate & Revenue, Cashiering, Reports / Analytics |
| `room_amenities` | Rooms & Inventory | 4: Rate & Revenue, Rooms & Inventory, Guest Services, Front Office |
| `distribution_channels` | Distribution | 4: Distribution, Cashiering, Direct Booking, Guest Profile |
| `fo_service_catalogue` | Rate & Revenue | 4: Rate & Revenue, Front Office, Reservations, Guest Services |
| `guest_folio_counters` | Cashiering | 4: Front Office, Cashiering, Reservations, Distribution |
| `guest_folio_invoices` | Fiscal / Invoicing | 4: Fiscal / Invoicing, Night Audit, Cashiering, Reservations |
| `housekeeping_history` | Housekeeping | 4: Front Office, Housekeeping, Rooms & Inventory, Security / Permissions |
| `housekeeping_tasks` | Housekeeping | 4: Night Audit, Housekeeping, Rooms & Inventory, Front Office |
| `pms_deposit_policies` | Cashiering | 4: Rate & Revenue, Reservations, Cashiering, Guest Profile |
| `pms_guest_service_categories` | Guest Services | 4: Guest Services, Housekeeping, Cashiering, Guest Profile |
| `pms_integrations` | Integrations | 4: Fiscal / Invoicing, Distribution, Night Audit, Integrations |
| `pms_property_currencies` | Accounting / Finance | 4: Guest Profile, Accounting / Finance, Property Core, Reservations |
| `pms_tax_groups` | Taxes & Fees | 4: Property Core, Reservations, Taxes & Fees, Guest Profile |
| `room_type_images` | Rooms & Inventory | 4: Rooms & Inventory, Direct Booking, Front Office, Reservations |

### E. Zero-reference tables

1 table(s) with no reference in non-test source: `financial_account_participants`.

Related: 15 tables are referenced but have **no application writer** (seeded, RPC/trigger-only, or not yet implemented): `folio_deposit_allocations`, `guest_folio_windows`, `inventory_units`, `pms_audit_categories`, `pms_import_field_definitions`, `pms_import_job_issues`, `pms_import_jobs`, `pms_import_types`, `pms_metric_definitions`, `pms_permissions`, `pms_property_department_contacts`, `pms_report_categories`, `pms_report_definitions`, `pms_reservation_overbooking_approvals`, `restaurant_tables`.

### F. Zero-row tables

55 tables have zero rows.

| Domain | Count | Tables |
|---|---|---|
| Property Core | 4 | `pms_department_routing_rules`, `pms_golive_plans`, `pms_golive_tasks`, `pms_property_department_contacts` |
| Reservations | 5 | `pms_event_package_template_services`, `pms_group_allotment_nights`, `pms_purpose_of_stay`, `pms_reservation_overbooking_approvals`, `reservation_traces` |
| Front Office | 1 | `fo_stay_companions` |
| Guest Profile | 8 | `guest_merge_ledger`, `pms_agency_allowed_room_types`, `pms_agency_commission_entries`, `pms_agency_notification_prefs`, `pms_agency_rate_defaults`, `pms_group_templates`, `pms_guest_vip_levels`, `pms_preference_options` |
| Rooms & Inventory | 1 | `pms_overbooking_date_limits` |
| Cashiering | 3 | `financial_account_participants`, `financial_account_payment_allocations`, `folio_deposit_allocations` |
| Taxes & Fees | 2 | `pms_service_charge_department_targets`, `pms_tax_department_targets` |
| Rate & Revenue | 7 | `fo_service_catalogue`, `hotel_competitor_provider_mappings`, `hotel_competitor_rate_observations`, `hotel_competitor_room_mappings`, `hotel_competitors`, `hotel_rate_shopping_fetch_runs`, `pms_restriction_reasons` |
| Inventory | 5 | `inventory_items`, `inventory_stock_movements`, `inventory_units`, `restaurant_asset_history`, `restaurant_assets` |
| Procurement | 4 | `purchase_order_history`, `purchase_order_items`, `purchase_orders`, `restaurant_suppliers` |
| Human Resources / Staff | 4 | `pms_shift_definitions`, `staff_attendance`, `staff_shifts`, `staff_table_assignments` |
| Fiscal / Invoicing | 5 | `financial_account_invoice_draft_items`, `fiscal_buyer_code_mappings`, `guest_folio_invoice_draft_items`, `invoice_credit_note_draft_items`, `invoice_credit_note_drafts` |
| Distribution | 1 | `distribution_logs` |
| Maintenance | 3 | `pms_maintenance_categories`, `pms_maintenance_priorities`, `pms_maintenance_type_tags` |
| Integrations | 2 | `pms_import_job_issues`, `pms_import_jobs` |

### G. Naming inconsistencies

- **Mixed domain prefixes.** Table prefixes in use: `pms_` (159), `hotel_` (37), `guest_` (26), `financial_` (9), `fiscal_` (9), `other_` (8), `restaurant_` (7), `distribution_` (5), `fo_` (5), `housekeeping_` (5), `invoice_` (5), `room_` (5), `night_` (4), `staff_` (4), `folio_` (3), `inventory_` (3), `purchase_` (3). Configuration is mostly `pms_*`, operational PMS data mostly `hotel_*`, but cashiering uses `guest_folio*` / `folio_*` / `financial_account*`, Front Office uses `fo_*`, and guest services split between `guest_service_*` and `pms_guest_service_*`.
- **Retired-product names** on retained tables: `restaurant_asset_history`, `restaurant_assets`, `restaurant_package_entitlements`, `restaurant_staff_audit_log`, `restaurant_suppliers`, `restaurant_tables`, `restaurant_users`, `restaurants`. Per `docs/pms-only-architecture.md` these are intentional and must not be renamed for cosmetics; `restaurant_id` is the property key on almost every table.
- **Misleading suffixes**: `guest_service_history` holds live service requests; `housekeeping_maintenance_requests` is a Housekeeping-owned maintenance request table (name kept); `folio_history.legacy_cashier_shift_id` references a retired shift model.
- **Singular / plural and catalog spellings**: `hotel_revenue_approval_policy` (singular) vs `*_policies`; `pms_housekeeping_status_catalog` vs `fo_service_catalogue`.
- **Counter tables** use five naming styles: `*_counters` (`guest_folio_counters`, `hotel_reservation_counters`, `guest_profile_counters`, `guest_service_counters`, `financial_account_counters`), `pms_*_counters`, and `fiscal_item_code_counters`.
- **Duplicated FK constraints** on `hotel_rate_plans` (two pairs) have inconsistent names (`*_fk` vs truncated `*_cancel` / `*_refundabilit`).

#### Relationship columns without FK (NOFK detail)

108 uuid `_id` / `_by` columns in 69 tables have no FK. Most are actor columns (`*_membership_id`, `updated_by`, `actor_*`) or polymorphic ids (`reference_id`, `entity_id`, `source_id`, `operation_id`) and are intentionally loose. The relationship columns below are the ones flagged NOFK:

| Table | Columns |
|---|---|
| `financial_account_invoice_events` | `invoice_id` |
| `fiscal_item_mappings` | `service_type_id`, `department_id` |
| `folio_history` | `legacy_cashier_shift_id` |
| `guest_folio_invoice_lines` | `folio_id`, `source_transaction_id`, `component_transaction_id` |
| `guest_service_history` | `folio_transaction_id` |
| `invoice_credit_note_events` | `guest_invoice_id`, `account_invoice_id`, `credit_note_id`, `folio_id`, `financial_account_id` |
| `invoice_credit_note_lines` | `ledger_transaction_id` |
| `invoice_credit_notes` | `folio_id`, `financial_account_id` |
| `pms_agency_commission_plans` | `agreement_id` |
| `pms_group_allotment_nights` | `inventory_block_id` |
| `pms_group_rooming_rows` | `group_block_id`, `guest_id`, `room_type_id`, `reservation_id` |
| `pms_groups` | `leader_guest_id`, `rate_plan_id` |
| `pms_meal_applicability_policies` | `breakfast_department_id`, `lunch_department_id`, `dinner_department_id` |
| `pms_operational_inventory_blocks` | `group_id` |
| `pms_package_components` | `fulfillment_department_id` |
| `pms_reservation_service_entitlements` | `guest_id`, `component_id`, `department_id` |
| `pms_waitlist_offers` | `rate_plan_id` |

## Recommended ERD Set

Each table is assigned to exactly one detailed ERD group. The recommended 16 groups were kept, but five were split into a/b(/c) sub-diagrams because a single diagram would exceed ~30 tables: 02 guest profile (42), 03 reservations (31), 09 rates & revenue (39), 13 finance & fiscal (31), 15 platform / security / integrations (41). Groups 08, 10, 12, 14 and 16 are below 10 tables because the schema domain is genuinely small; they can be merged into a neighbouring diagram if preferred.

| ERD | Tables | Anchor tables | Domains inside |
|---|---|---|---|
| `01-property-core` | 14 | `restaurants` | Property Core (14) |
| `02a-guest-profile-individual` | 17 | `guest_profiles` | Guest Profile (17) |
| `02b-guest-accounts-agreements` | 25 | `guest_account_masters` | Guest Profile (25) |
| `03a-reservations-core` | 16 | `hotel_reservation_rooms`, `hotel_reservations` | Reservations (16) |
| `03b-groups-sales-events` | 15 | `pms_groups`, `pms_event_package_templates` | Reservations (15) |
| `04-rooms-inventory` | 14 | `hotel_rooms`, `room_types` | Rooms & Inventory (14) |
| `05-front-office-guest-services` | 16 | `pms_guest_service_types`, `pms_guest_service_categories` | Guest Services (11), Front Office (5) |
| `06-housekeeping-maintenance` | 14 | `housekeeping_tasks` | Housekeeping (9), Maintenance (5) |
| `07-cashiering-ledger` | 17 | `financial_accounts`, `folio_transactions`, `guest_folios`, `hotel_cashier_shifts` | Cashiering (17) |
| `08-taxes-fees` | 8 | `pms_taxes` | Taxes & Fees (8) |
| `09a-rate-plans-pricing` | 16 | `hotel_rate_plans` | Rate & Revenue (16) |
| `09b-packages-promotions` | 14 | `pms_packages`, `hotel_package_activations` | Rate & Revenue (14) |
| `09c-revenue-management` | 9 | `hotel_competitors`, `hotel_rate_shopping_fetch_runs` | Rate & Revenue (9) |
| `10-night-audit` | 5 | `night_audit_runs` | Night Audit (5) |
| `11-inventory-procurement` | 9 | `inventory_items`, `purchase_orders` | Inventory (5), Procurement (4) |
| `12-staff-hr` | 6 | `restaurant_users`, `staff_shifts` | Human Resources / Staff (6) |
| `13a-invoicing-credit-notes` | 18 | `guest_folio_invoices` | Fiscal / Invoicing (18) |
| `13b-fiscal-finance` | 13 | `fiscal_registrations` | Fiscal / Invoicing (9), Accounting / Finance (4) |
| `14-distribution-direct-booking` | 8 | `distribution_channels` | Distribution (8) |
| `15a-security-platform` | 14 | `pms_hotel_roles`, `pms_permissions` | Security / Permissions (12), Platform Admin (2) |
| `15b-integrations-communications` | 19 | `pms_import_types`, `pms_communication_channels` | Integrations (19) |
| `15c-reports-analytics` | 8 | `pms_report_definitions`, `pms_metric_definitions` | Reports / Analytics (8) |
| `16-marketing-cms` | 2 | `leads`, `marketing_content_revisions` | Marketing / CMS (2) |

### 01-property-core

- **ERD name:** 01-property-core
- **Estimated table count:** 14 (plus 2 cross-domain reference tables shown as stubs)
- **Anchor tables:** `restaurants`
- **Supporting tables:** `hotel_buildings`, `hotel_floors`, `hotel_wings`, `pms_department_routing_rules`, `pms_departments`, `pms_golive_plans`, `pms_golive_tasks`, `pms_offline_capabilities`, `pms_offline_policies`, `pms_outlets`, `pms_property_areas`, `pms_property_department_contacts`, `pms_work_centers`
- **Cross-domain references:** `pms_tax_groups` (08-taxes-fees), `pms_property_currencies` (13b-fiscal-finance)

### 02a-guest-profile-individual

- **ERD name:** 02a-guest-profile-individual
- **Estimated table count:** 17 (plus 0 cross-domain reference tables shown as stubs)
- **Anchor tables:** `guest_profiles`
- **Supporting tables:** `guest_documents`, `guest_emergency_contacts`, `guest_merge_ledger`, `guest_preference_values`, `guest_preferences`, `guest_profile_counters`, `guest_profile_history`, `guest_tax_identities`, `pms_guest_create_drafts`, `pms_guest_fields`, `pms_guest_id_types`, `pms_guest_preference_categories`, `pms_guest_preference_types`, `pms_guest_profile_types`, `pms_guest_vip_levels`, `pms_preference_options`
- **Cross-domain references:** none besides `restaurants` (tenant) and actor links to `restaurant_users`

### 02b-guest-accounts-agreements

- **ERD name:** 02b-guest-accounts-agreements
- **Estimated table count:** 25 (plus 13 cross-domain reference tables shown as stubs)
- **Anchor tables:** `guest_account_masters`
- **Supporting tables:** `guest_account_history`, `guest_account_links`, `guest_company_contact_roles`, `guest_company_contacts`, `guest_company_documents`, `pms_account_create_drafts`, `pms_account_type_labels`, `pms_agency_allotments`, `pms_agency_allowed_room_types`, `pms_agency_commission_entries`, `pms_agency_commission_plans`, `pms_agency_commission_rules`, `pms_agency_notification_prefs`, `pms_agency_rate_defaults`, `pms_business_contact_roles`, `pms_business_profile_settings`, `pms_business_profile_types`, `pms_company_document_types`, `pms_contract_rates`, `pms_contract_types`, `pms_corporate_agreements`, `pms_group_create_drafts`, `pms_group_templates`, `pms_group_types`
- **Cross-domain references:** `room_types` (04-rooms-inventory), `hotel_rate_plans` (09a-rate-plans-pricing), `guest_profiles` (02a-guest-profile-individual), `hotel_reservations` (03a-reservations-core), `pms_deposit_policies` (07-cashiering-ledger), `pms_no_show_policies` (09a-rate-plans-pricing), `pms_rate_cancellation_policies` (09a-rate-plans-pricing), `pms_billing_rules` (07-cashiering-ledger), `pms_payment_methods` (07-cashiering-ledger), `pms_market_segments` (03a-reservations-core), `pms_source_codes` (03a-reservations-core), `pms_tax_exemption_rules` (08-taxes-fees), `pms_departments` (01-property-core); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 03a-reservations-core

- **ERD name:** 03a-reservations-core
- **Estimated table count:** 16 (plus 16 cross-domain reference tables shown as stubs)
- **Anchor tables:** `hotel_reservation_rooms`, `hotel_reservations`
- **Supporting tables:** `hotel_reservation_counters`, `hotel_reservation_history`, `hotel_reservation_packages`, `hotel_reservation_promotions`, `hotel_reservation_room_guests`, `pms_market_segments`, `pms_purpose_of_stay`, `pms_reservation_overbooking_approvals`, `pms_sales_channel_labels`, `pms_source_codes`, `pms_waitlist_history`, `pms_waitlist_offers`, `pms_waitlist_requests`, `reservation_traces`
- **Cross-domain references:** `guest_profiles` (02a-guest-profile-individual), `room_types` (04-rooms-inventory), `guest_account_masters` (02b-guest-accounts-agreements), `pms_group_blocks` (03b-groups-sales-events), `hotel_rate_plans` (09a-rate-plans-pricing), `hotel_rooms` (04-rooms-inventory), `guest_company_contacts` (02b-guest-accounts-agreements), `hotel_package_activations` (09b-packages-promotions), `pms_packages` (09b-packages-promotions), `hotel_promotion_activations` (09b-packages-promotions), `pms_promotions` (09b-packages-promotions), `pms_billing_rules` (07-cashiering-ledger), `pms_deposit_policies` (07-cashiering-ledger), `pms_early_departure_policies` (09a-rate-plans-pricing), `pms_no_show_policies` (09a-rate-plans-pricing), `pms_groups` (03b-groups-sales-events); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 03b-groups-sales-events

- **ERD name:** 03b-groups-sales-events
- **Estimated table count:** 15 (plus 7 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_groups`, `pms_event_package_templates`
- **Supporting tables:** `pms_event_contract_defaults`, `pms_event_package_template_outlets`, `pms_event_package_template_services`, `pms_event_statuses`, `pms_event_types`, `pms_function_space_labels`, `pms_function_space_outlets`, `pms_group_allotment_nights`, `pms_group_blocks`, `pms_group_history`, `pms_group_rooming_rows`, `pms_lead_types`, `pms_sales_pipeline_stages`
- **Cross-domain references:** `guest_account_masters` (02b-guest-accounts-agreements), `pms_outlets` (01-property-core), `pms_deposit_policies` (07-cashiering-ledger), `fo_service_catalogue` (09b-packages-promotions), `pms_property_currencies` (13b-fiscal-finance), `pms_tax_groups` (08-taxes-fees), `room_types` (04-rooms-inventory); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 04-rooms-inventory

- **ERD name:** 04-rooms-inventory
- **Estimated table count:** 14 (plus 4 cross-domain reference tables shown as stubs)
- **Anchor tables:** `hotel_rooms`, `room_types`
- **Supporting tables:** `hotel_room_amenity_overrides`, `hotel_room_links`, `pms_inventory_block_type_rules`, `pms_inventory_rules`, `pms_operational_inventory_blocks`, `pms_overbooking_date_limits`, `pms_room_inventory_events`, `pms_room_type_overbooking_rules`, `room_amenities`, `room_type_amenities`, `room_type_beds`, `room_type_images`
- **Cross-domain references:** `hotel_buildings` (01-property-core), `hotel_floors` (01-property-core), `hotel_wings` (01-property-core), `housekeeping_maintenance_requests` (06-housekeeping-maintenance); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 05-front-office-guest-services

- **ERD name:** 05-front-office-guest-services
- **Estimated table count:** 16 (plus 5 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_guest_service_types`, `pms_guest_service_categories`
- **Supporting tables:** `fo_checkin_agreement_instances`, `fo_checkin_progress`, `fo_guest_requests`, `fo_stay_companions`, `guest_service_counters`, `guest_service_history`, `pms_guest_request_types`, `pms_guest_service_availability`, `pms_guest_service_department_assignments`, `pms_guest_service_pricing`, `pms_guest_service_sla_rules`, `pms_meal_applicability_policies`, `pms_registration_agreement_versions`, `pms_reservation_service_entitlements`
- **Cross-domain references:** `hotel_reservations` (03a-reservations-core), `guest_profiles` (02a-guest-profile-individual), `hotel_reservation_rooms` (03a-reservations-core), `pms_departments` (01-property-core), `folio_transactions` (07-cashiering-ledger); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 06-housekeeping-maintenance

- **ERD name:** 06-housekeeping-maintenance
- **Estimated table count:** 14 (plus 2 cross-domain reference tables shown as stubs)
- **Anchor tables:** `housekeeping_tasks`
- **Supporting tables:** `housekeeping_discrepancies`, `housekeeping_history`, `housekeeping_inspections`, `housekeeping_maintenance_requests`, `pms_housekeeping_priority_rules`, `pms_housekeeping_settings`, `pms_housekeeping_status_catalog`, `pms_housekeeping_transition_rules`, `pms_maintenance_categories`, `pms_maintenance_priorities`, `pms_maintenance_rules`, `pms_maintenance_status_rules`, `pms_maintenance_type_tags`
- **Cross-domain references:** `hotel_rooms` (04-rooms-inventory), `pms_departments` (01-property-core); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 07-cashiering-ledger

- **ERD name:** 07-cashiering-ledger
- **Estimated table count:** 17 (plus 8 cross-domain reference tables shown as stubs)
- **Anchor tables:** `financial_accounts`, `folio_transactions`, `guest_folios`, `hotel_cashier_shifts`
- **Supporting tables:** `financial_account_counters`, `financial_account_participants`, `financial_account_payment_allocations`, `folio_deposit_allocations`, `folio_history`, `guest_deposit_invoice_allocations`, `guest_folio_counters`, `guest_folio_windows`, `guest_payment_invoice_allocations`, `hotel_drawer_movements`, `pms_billing_rules`, `pms_deposit_policies`, `pms_payment_methods`
- **Cross-domain references:** `guest_folio_invoices` (13a-invoicing-credit-notes), `financial_account_invoices` (13a-invoicing-credit-notes), `guest_account_masters` (02b-guest-accounts-agreements), `pms_departments` (01-property-core), `hotel_reservation_rooms` (03a-reservations-core), `pms_guest_service_types` (05-front-office-guest-services), `guest_profiles` (02a-guest-profile-individual), `hotel_reservations` (03a-reservations-core); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 08-taxes-fees

- **ERD name:** 08-taxes-fees
- **Estimated table count:** 8 (plus 1 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_taxes`
- **Supporting tables:** `pms_fees`, `pms_service_charge_department_targets`, `pms_service_charges`, `pms_tax_department_targets`, `pms_tax_exemption_rules`, `pms_tax_group_taxes`, `pms_tax_groups`
- **Cross-domain references:** `pms_departments` (01-property-core); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 09a-rate-plans-pricing

- **ERD name:** 09a-rate-plans-pricing
- **Estimated table count:** 16 (plus 2 cross-domain reference tables shown as stubs)
- **Anchor tables:** `hotel_rate_plans`
- **Supporting tables:** `hotel_rate_calendar`, `hotel_rate_categories`, `hotel_rate_change_events`, `hotel_rate_restriction_change_events`, `hotel_rate_restrictions`, `pms_commercial_restriction_room_types`, `pms_commercial_restrictions`, `pms_early_departure_policies`, `pms_meal_plans`, `pms_no_show_policies`, `pms_rate_cancellation_policies`, `pms_rate_refundability_codes`, `pms_restriction_reasons`, `pms_season_room_types`, `pms_seasons`
- **Cross-domain references:** `room_types` (04-rooms-inventory), `pms_deposit_policies` (07-cashiering-ledger); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 09b-packages-promotions

- **ERD name:** 09b-packages-promotions
- **Estimated table count:** 14 (plus 4 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_packages`, `hotel_package_activations`
- **Supporting tables:** `fo_service_catalogue`, `hotel_commercial_change_events`, `hotel_package_activation_rate_plans`, `hotel_package_activation_room_types`, `hotel_promotion_activation_rate_plans`, `hotel_promotion_activation_room_types`, `hotel_promotion_activations`, `pms_package_components`, `pms_package_rate_plans`, `pms_package_room_types`, `pms_promotion_room_types`, `pms_promotions`
- **Cross-domain references:** `room_types` (04-rooms-inventory), `hotel_rate_plans` (09a-rate-plans-pricing), `pms_meal_plans` (09a-rate-plans-pricing), `room_amenities` (04-rooms-inventory); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 09c-revenue-management

- **ERD name:** 09c-revenue-management
- **Estimated table count:** 9 (plus 1 cross-domain reference tables shown as stubs)
- **Anchor tables:** `hotel_competitors`, `hotel_rate_shopping_fetch_runs`
- **Supporting tables:** `hotel_competitor_provider_mappings`, `hotel_competitor_rate_observations`, `hotel_competitor_room_mappings`, `hotel_revenue_approval_events`, `hotel_revenue_approval_policy`, `hotel_revenue_approval_requests`, `hotel_revenue_otb_snapshots`
- **Cross-domain references:** `room_types` (04-rooms-inventory); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 10-night-audit

- **ERD name:** 10-night-audit
- **Estimated table count:** 5 (plus 0 cross-domain reference tables shown as stubs)
- **Anchor tables:** `night_audit_runs`
- **Supporting tables:** `business_date_adjustments`, `night_audit_exceptions`, `night_audit_fiscal_overrides`, `night_audit_warning_reviews`
- **Cross-domain references:** none besides `restaurants` (tenant) and actor links to `restaurant_users`

### 11-inventory-procurement

- **ERD name:** 11-inventory-procurement
- **Estimated table count:** 9 (plus 0 cross-domain reference tables shown as stubs)
- **Anchor tables:** `inventory_items`, `purchase_orders`
- **Supporting tables:** `inventory_stock_movements`, `inventory_units`, `purchase_order_history`, `purchase_order_items`, `restaurant_asset_history`, `restaurant_assets`, `restaurant_suppliers`
- **Cross-domain references:** none besides `restaurants` (tenant) and actor links to `restaurant_users`

### 12-staff-hr

- **ERD name:** 12-staff-hr
- **Estimated table count:** 6 (plus 1 cross-domain reference tables shown as stubs)
- **Anchor tables:** `restaurant_users`, `staff_shifts`
- **Supporting tables:** `pms_shift_definitions`, `restaurant_tables`, `staff_attendance`, `staff_table_assignments`
- **Cross-domain references:** `pms_hotel_roles` (15a-security-platform); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 13a-invoicing-credit-notes

- **ERD name:** 13a-invoicing-credit-notes
- **Estimated table count:** 18 (plus 3 cross-domain reference tables shown as stubs)
- **Anchor tables:** `guest_folio_invoices`
- **Supporting tables:** `financial_account_invoice_draft_items`, `financial_account_invoice_drafts`, `financial_account_invoice_events`, `financial_account_invoice_lines`, `financial_account_invoices`, `guest_folio_invoice_draft_items`, `guest_folio_invoice_drafts`, `guest_folio_invoice_lines`, `invoice_credit_note_draft_items`, `invoice_credit_note_drafts`, `invoice_credit_note_events`, `invoice_credit_note_lines`, `invoice_credit_notes`, `pms_credit_note_counters`, `pms_debit_note_counters`, `pms_invoice_settings`, `pms_issued_invoice_counters`
- **Cross-domain references:** `folio_transactions` (07-cashiering-ledger), `financial_accounts` (07-cashiering-ledger), `guest_folios` (07-cashiering-ledger); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 13b-fiscal-finance

- **ERD name:** 13b-fiscal-finance
- **Estimated table count:** 13 (plus 5 cross-domain reference tables shown as stubs)
- **Anchor tables:** `fiscal_registrations`
- **Supporting tables:** `fiscal_buyer_code_mappings`, `fiscal_credential_refs`, `fiscal_integration_tokens`, `fiscal_item_code_counters`, `fiscal_item_mappings`, `fiscal_mode_mappings`, `fiscal_registration_attempts`, `fiscal_tax_code_mappings`, `pms_exchange_rates`, `pms_financial_settings`, `pms_property_currencies`, `withholding_certificates`
- **Cross-domain references:** `pms_integrations` (15b-integrations-communications), `pms_taxes` (08-taxes-fees), `financial_accounts` (07-cashiering-ledger), `financial_account_invoices` (13a-invoicing-credit-notes), `folio_transactions` (07-cashiering-ledger); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 14-distribution-direct-booking

- **ERD name:** 14-distribution-direct-booking
- **Estimated table count:** 8 (plus 5 cross-domain reference tables shown as stubs)
- **Anchor tables:** `distribution_channels`
- **Supporting tables:** `distribution_logs`, `distribution_meal_mappings`, `distribution_rate_mappings`, `distribution_room_mappings`, `pms_distribution_sync_events`, `pms_external_reservation_mappings`, `pms_external_reservation_snapshots`
- **Cross-domain references:** `hotel_reservations` (03a-reservations-core), `pms_integrations` (15b-integrations-communications), `pms_meal_plans` (09a-rate-plans-pricing), `hotel_rate_plans` (09a-rate-plans-pricing), `room_types` (04-rooms-inventory); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 15a-security-platform

- **ERD name:** 15a-security-platform
- **Estimated table count:** 14 (plus 1 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_hotel_roles`, `pms_permissions`
- **Supporting tables:** `admin_audit_log`, `pms_approval_rules`, `pms_audit_categories`, `pms_audit_category_settings`, `pms_audit_policies`, `pms_audit_sensitive_coverage`, `pms_membership_roles`, `pms_role_permissions`, `profiles`, `restaurant_package_entitlements`, `restaurant_staff_audit_log`, `staff_module_access`
- **Cross-domain references:** `pms_departments` (01-property-core); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 15b-integrations-communications

- **ERD name:** 15b-integrations-communications
- **Estimated table count:** 19 (plus 0 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_import_types`, `pms_communication_channels`
- **Supporting tables:** `pms_communication_automation_rules`, `pms_communication_defaults`, `pms_communication_notification_events`, `pms_communication_sender_settings`, `pms_communication_templates`, `pms_import_duplicate_policies`, `pms_import_field_definitions`, `pms_import_job_issues`, `pms_import_jobs`, `pms_import_mapping_template_fields`, `pms_import_mapping_templates`, `pms_import_policies`, `pms_import_type_settings`, `pms_import_validation_rules`, `pms_integration_activity`, `pms_integrations`, `pms_notification_templates`
- **Cross-domain references:** none besides `restaurants` (tenant) and actor links to `restaurant_users`

### 15c-reports-analytics

- **ERD name:** 15c-reports-analytics
- **Estimated table count:** 8 (plus 1 cross-domain reference tables shown as stubs)
- **Anchor tables:** `pms_report_definitions`, `pms_metric_definitions`
- **Supporting tables:** `pms_metric_definition_settings`, `pms_report_access_events`, `pms_report_categories`, `pms_report_definition_settings`, `pms_report_permissions`, `pms_report_policies`
- **Cross-domain references:** `pms_permissions` (15a-security-platform); plus `restaurants` (tenant) and actor links to `restaurant_users`

### 16-marketing-cms

- **ERD name:** 16-marketing-cms
- **Estimated table count:** 2 (plus 0 cross-domain reference tables shown as stubs)
- **Anchor tables:** `leads`, `marketing_content_revisions`
- **Supporting tables:** —
- **Cross-domain references:** none besides `restaurants` (tenant) and actor links to `restaurant_users`

## High-Level Architecture Proposal

High-level ERD anchor tables (22): `distribution_channels`, `financial_accounts`, `fiscal_registrations`, `folio_transactions`, `guest_account_masters`, `guest_folio_invoices`, `guest_folios`, `guest_profiles`, `hotel_cashier_shifts`, `hotel_rate_plans`, `hotel_reservation_rooms`, `hotel_reservations`, `hotel_rooms`, `housekeeping_tasks`, `inventory_items`, `night_audit_runs`, `pms_taxes`, `purchase_orders`, `restaurant_users`, `restaurants`, `room_types`, `staff_shifts`.

Conceptual relationship map (not a final diagram):

```text
Property (restaurants: tenant, business_date)
│
├─→ Guest Profile ........ guest_profiles, guest_account_masters (company / group / agent)
│     │
│     └─→ Reservations ..... hotel_reservations ─→ hotel_reservation_rooms (unit)
│           │                     │
│           │                     ├─→ Rooms ........ room_types ─→ hotel_rooms
│           │                     └─→ Rates ........ hotel_rate_plans, hotel_rate_calendar, packages/promotions
│           │
│           ├─→ Front Office ..... check-in progress, registration cards (RPC-mediated state changes)
│           ├─→ Housekeeping ..... housekeeping_tasks ─→ hotel_rooms (HK / maintenance status)
│           └─→ Cashiering ....... guest_folios ─→ folio_transactions ←─ financial_accounts (AR)
│                                       │             └─ hotel_cashier_shifts (drawer)
│                                       ├─→ Taxes / Fees ... pms_taxes, pms_tax_groups, pms_service_charges
│                                       └─→ Fiscal ......... guest_folio_invoices / financial_account_invoices
│                                                              ─→ fiscal_registrations (outbox)
│
├─→ Night Audit .......... night_audit_runs (closes restaurants.business_date; reads folios, reservations, fiscal)
└─→ Finance .............. currencies, FX, withholding_certificates (posts to folio_transactions)

Shared capabilities (reference restaurants; consumed by PMS):
  Inventory / Procurement .. inventory_items, inventory_stock_movements, purchase_orders, restaurant_suppliers, restaurant_assets
  Staff / HR ............... restaurant_users (membership) ─→ staff_shifts, staff_attendance
  Security / Platform ...... profiles (auth.users), pms_hotel_roles, pms_role_permissions, audit logs, package entitlements
  Integrations ............. pms_integrations, distribution_channels (+ mappings), communications, imports
```

## Appendix A — Full Foreign Key Relationships

All 764 FKs, grouped by source table. Cardinality: `N:1` = many source rows per parent; `1:1` = source FK columns are unique. Optionality is from NOT NULL on the FK columns. Composite `(restaurant_id, x)` keys are shown with `restaurant_id` omitted unless it is the only column.

<details><summary><code>admin_audit_log</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `admin_user_id` | `auth.users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | optional | set null |
| `target_user_id` | `auth.users.id` | N:1 | optional | no action |

</details>

<details><summary><code>business_date_adjustments</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `changed_by_membership_id` | `restaurant_users.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>distribution_channels</code> — 2 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | N:1 | optional | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>distribution_logs</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `channel_id` | `distribution_channels.id` | N:1 | optional | set null |

</details>

<details><summary><code>distribution_meal_mappings</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `channel_id` | `distribution_channels.id` | N:1 | mandatory | cascade |
| `meal_plan_id` | `pms_meal_plans.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>distribution_rate_mappings</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `channel_id` | `distribution_channels.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>distribution_room_mappings</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `channel_id` | `distribution_channels.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>financial_account_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>financial_account_invoice_draft_items</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `draft_id` | `financial_account_invoice_drafts.id` | N:1 | mandatory | cascade |
| `source_group_id` | `folio_transactions.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>financial_account_invoice_drafts</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `financial_account_id` | `financial_accounts.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>financial_account_invoice_events</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `financial_account_id` | `financial_accounts.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>financial_account_invoice_lines</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `component_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `invoice_id` | `financial_account_invoices.id` | N:1 | mandatory | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `financial_account_id` | `financial_accounts.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>financial_account_invoices</code> — 2 outbound, 5 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `financial_account_id` | `financial_accounts.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>financial_account_participants</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `financial_account_id` | `financial_accounts.id` | N:1 | mandatory | cascade |
| `guest_folio_id` | `guest_folios.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>financial_account_payment_allocations</code> — 5 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | no action |
| `financial_account_id` | `financial_accounts.id` | N:1 | mandatory | no action |
| `invoice_id` | `financial_account_invoices.id` | N:1 | mandatory | no action |
| `payment_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `reverses_allocation_id` | `financial_account_payment_allocations.id` | N:1 | optional | no action |

</details>

<details><summary><code>financial_accounts</code> — 3 outbound, 8 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `master_id` | `guest_account_masters.id` | 1:1 | mandatory | no action |

</details>

<details><summary><code>fiscal_buyer_code_mappings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_credential_refs</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | 1:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_integration_tokens</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | 1:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_item_code_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_item_mappings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | 1:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_mode_mappings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_registration_attempts</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `registration_id` | `fiscal_registrations.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>fiscal_registrations</code> — 3 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | N:1 | mandatory | cascade |
| `related_registration_id` | `fiscal_registrations.id` | N:1 | optional | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fiscal_tax_code_mappings</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | 1:1 | mandatory | cascade |
| `pms_tax_id` | `pms_taxes.id` | N:1 | optional | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fo_checkin_agreement_instances</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | no action |
| `agreement_version_id` | `pms_registration_agreement_versions.id` | N:1 | mandatory | no action |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `reservation_room_id` | `hotel_reservation_rooms.id` | N:1 | optional | cascade |

</details>

<details><summary><code>fo_checkin_progress</code> — 9 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `deposit_transaction_id` | `folio_transactions.id` | N:1 | optional | set null |
| `deposit_waived_by` | `restaurant_users.id` | N:1 | optional | set null |
| `key_issued_by` | `restaurant_users.id` | N:1 | optional | set null |
| `key_waived_by` | `restaurant_users.id` | N:1 | optional | set null |
| `registration_waived_by` | `restaurant_users.id` | N:1 | optional | set null |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | no action |
| `reservation_room_id` | `hotel_reservation_rooms.id` | N:1 | optional | cascade |

</details>

<details><summary><code>fo_guest_requests</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>fo_service_catalogue</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>fo_stay_companions</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>folio_deposit_allocations</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `charge_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `deposit_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>folio_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `folio_id` | `guest_folios.id` | N:1 | optional | no action |

</details>

<details><summary><code>folio_transactions</code> — 10 outbound, 13 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `posted_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | optional | no action |
| `financial_account_id` | `financial_accounts.id` | N:1 | optional | no action |
| `folio_id` | `guest_folios.id` | N:1 | optional | no action |
| `folio_id,original_transaction_id` | `folio_transactions.id,folio_id` | N:1 | optional | no action |
| `folio_window_id` | `guest_folio_windows.id` | N:1 | optional | no action |
| `hotel_cashier_shift_id` | `hotel_cashier_shifts.id` | N:1 | optional | no action |
| `reservation_room_id` | `hotel_reservation_rooms.id` | N:1 | optional | no action |
| `service_type_id` | `pms_guest_service_types.id` | N:1 | optional | no action |

</details>

<details><summary><code>guest_account_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `master_id` | `guest_account_masters.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>guest_account_links</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `master_id` | `guest_account_masters.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | optional | set null |

</details>

<details><summary><code>guest_account_masters</code> — 18 outbound, 22 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `anonymised_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `business_profile_type_id` | `pms_business_profile_types.id` | N:1 | optional | set null |
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `default_billing_rule_id` | `pms_billing_rules.id` | N:1 | optional | set null |
| `default_deposit_policy_id` | `pms_deposit_policies.id` | N:1 | optional | set null |
| `default_no_show_policy_id` | `pms_no_show_policies.id` | N:1 | optional | set null |
| `default_payment_method_id` | `pms_payment_methods.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `company_master_id` | `guest_account_masters.id` | N:1 | optional | set null |
| `default_travel_agent_master_id` | `guest_account_masters.id` | N:1 | optional | no action |
| `group_type_id` | `pms_group_types.id` | N:1 | optional | set null |
| `market_segment_id` | `pms_market_segments.id` | N:1 | optional | set null |
| `primary_contact_guest_id` | `guest_profiles.id` | N:1 | optional | set null |
| `rate_cancellation_policy_id` | `pms_rate_cancellation_policies.id` | N:1 | optional | set null |
| `source_code_id` | `pms_source_codes.id` | N:1 | optional | set null |
| `travel_agent_master_id` | `guest_account_masters.id` | N:1 | optional | set null |
| `tax_exemption_rule_id` | `pms_tax_exemption_rules.id` | N:1 | optional | set null |
| `updated_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |

</details>

<details><summary><code>guest_company_contact_roles</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `contact_id` | `guest_company_contacts.id` | N:1 | mandatory | cascade |
| `role_id` | `pms_business_contact_roles.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>guest_company_contacts</code> — 3 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `department_id` | `pms_departments.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `company_master_id` | `guest_account_masters.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>guest_company_documents</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `agreement_id` | `pms_corporate_agreements.id` | N:1 | optional | set null |
| `document_type_id` | `pms_company_document_types.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `company_master_id` | `guest_account_masters.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>guest_deposit_invoice_allocations</code> — 5 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | no action |
| `deposit_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `guest_folio_id` | `guest_folios.id` | N:1 | mandatory | no action |
| `invoice_id` | `guest_folio_invoices.id` | N:1 | mandatory | no action |
| `reverses_allocation_id` | `guest_deposit_invoice_allocations.id` | N:1 | optional | no action |

</details>

<details><summary><code>guest_documents</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `id_type_id` | `pms_guest_id_types.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |
| `uploaded_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `verified_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |

</details>

<details><summary><code>guest_emergency_contacts</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>guest_folio_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>guest_folio_invoice_draft_items</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `draft_id` | `guest_folio_invoice_drafts.id` | N:1 | mandatory | cascade |
| `source_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>guest_folio_invoice_drafts</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `folio_id` | `guest_folios.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>guest_folio_invoice_lines</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `invoice_id` | `guest_folio_invoices.id` | N:1 | mandatory | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>guest_folio_invoices</code> — 2 outbound, 5 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `folio_id` | `guest_folios.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>guest_folio_windows</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `folio_id` | `guest_folios.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>guest_folios</code> — 4 outbound, 8 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | 1:1 | optional | no action |

</details>

<details><summary><code>guest_merge_ledger</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `retired_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `survivor_id` | `guest_profiles.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>guest_payment_invoice_allocations</code> — 5 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | no action |
| `guest_folio_id` | `guest_folios.id` | N:1 | mandatory | no action |
| `invoice_id` | `guest_folio_invoices.id` | N:1 | mandatory | no action |
| `payment_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `reverses_allocation_id` | `guest_payment_invoice_allocations.id` | N:1 | optional | no action |

</details>

<details><summary><code>guest_preference_values</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |
| `preference_type_id` | `pms_guest_preference_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>guest_preferences</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>guest_profile_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>guest_profile_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>guest_profiles</code> — 8 outbound, 20 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `anonymised_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `data_processing_consent_recorded_by` | `restaurant_users.id` | N:1 | optional | no action |
| `marketing_consent_recorded_by` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `merged_into_guest_id` | `guest_profiles.id` | N:1 | optional | no action |
| `profile_type_id` | `pms_guest_profile_types.id` | N:1 | optional | restrict |
| `restriction_set_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |

</details>

<details><summary><code>guest_service_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>guest_service_history</code> — 6 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `assigned_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | optional | set null |
| `service_type_id` | `pms_guest_service_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>guest_tax_identities</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | no action |
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `guest_profile_id` | `guest_profiles.id` | 1:1 | mandatory | no action |

</details>

<details><summary><code>hotel_buildings</code> — 1 outbound, 5 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_cashier_shifts</code> — 2 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `membership_id` | `restaurant_users.id` | 1:1 | mandatory | no action |

</details>

<details><summary><code>hotel_commercial_change_events</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_competitor_provider_mappings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `competitor_id` | `hotel_competitors.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_competitor_rate_observations</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `competitor_id` | `hotel_competitors.id` | N:1 | mandatory | no action |
| `fetch_run_id` | `hotel_rate_shopping_fetch_runs.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_competitor_room_mappings</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `competitor_id` | `hotel_competitors.id` | N:1 | mandatory | cascade |
| `our_room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_competitors</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_drawer_movements</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `hotel_cashier_shift_id` | `hotel_cashier_shifts.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_floors</code> — 3 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `building_id` | `hotel_buildings.id` | N:1 | mandatory | no action |
| `wing_id` | `hotel_wings.id` | N:1 | optional | restrict |

</details>

<details><summary><code>hotel_package_activation_rate_plans</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `activation_id` | `hotel_package_activations.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_package_activation_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `activation_id` | `hotel_package_activations.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_package_activations</code> — 3 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `package_id` | `pms_packages.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_promotion_activation_rate_plans</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `activation_id` | `hotel_promotion_activations.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_promotion_activation_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `activation_id` | `hotel_promotion_activations.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_promotion_activations</code> — 3 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `promotion_id` | `pms_promotions.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_rate_calendar</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_rate_categories</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_rate_change_events</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | no action |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_rate_plans</code> — 12 outbound, 13 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `cancellation_policy_id` | `pms_rate_cancellation_policies.id` | N:1 | optional | set null |
| `cancellation_policy_id` | `pms_rate_cancellation_policies.id` | N:1 | optional | set null |
| `deposit_policy_id` | `pms_deposit_policies.id` | N:1 | optional | set null |
| `early_departure_policy_id` | `pms_early_departure_policies.id` | N:1 | optional | set null |
| `meal_plan_id` | `pms_meal_plans.id` | N:1 | optional | set null |
| `no_show_policy_id` | `pms_no_show_policies.id` | N:1 | optional | set null |
| `rate_category_id` | `hotel_rate_categories.id` | N:1 | mandatory | no action |
| `refundability_id` | `pms_rate_refundability_codes.id` | N:1 | optional | set null |
| `refundability_id` | `pms_rate_refundability_codes.id` | N:1 | optional | set null |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_rate_restriction_change_events</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | no action |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_rate_restrictions</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_rate_shopping_fetch_runs</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_reservation_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_reservation_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_reservation_packages</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `package_activation_id` | `hotel_package_activations.id` | N:1 | mandatory | no action |
| `package_id` | `pms_packages.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `reservation_room_id` | `hotel_reservation_rooms.id` | N:1 | optional | cascade |

</details>

<details><summary><code>hotel_reservation_promotions</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `promotion_activation_id` | `hotel_promotion_activations.id` | N:1 | mandatory | no action |
| `promotion_id` | `pms_promotions.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_reservation_room_guests</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `reservation_id,reservation_room_id` | `hotel_reservation_rooms.id,reservation_id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_reservation_rooms</code> — 6 outbound, 6 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `pms_group_block_id` | `pms_group_blocks.id` | N:1 | optional | no action |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | optional | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |
| `room_type_id,room_id` | `hotel_rooms.id,room_type_id` | N:1 | optional | no action |

</details>

<details><summary><code>hotel_reservations</code> — 18 outbound, 22 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `company_contact_id` | `guest_company_contacts.id` | N:1 | optional | set null |
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `billing_rule_id` | `pms_billing_rules.id` | N:1 | optional | set null |
| `booker_guest_id` | `guest_profiles.id` | N:1 | optional | set null |
| `company_master_id` | `guest_account_masters.id` | N:1 | optional | no action |
| `deposit_policy_id` | `pms_deposit_policies.id` | N:1 | optional | set null |
| `early_departure_policy_id` | `pms_early_departure_policies.id` | N:1 | optional | set null |
| `group_account_master_id` | `guest_account_masters.id` | N:1 | optional | no action |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `no_show_policy_id` | `pms_no_show_policies.id` | N:1 | optional | set null |
| `pms_group_block_id` | `pms_group_blocks.id` | N:1 | optional | no action |
| `pms_group_id` | `pms_groups.id` | N:1 | optional | no action |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | optional | no action |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |
| `room_type_id,room_id` | `hotel_rooms.id,room_type_id` | N:1 | optional | no action |
| `travel_agent_master_id` | `guest_account_masters.id` | N:1 | optional | no action |
| `travel_agent_contact_id` | `guest_company_contacts.id` | N:1 | optional | set null |

</details>

<details><summary><code>hotel_revenue_approval_events</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_id` | `restaurant_users.id` | N:1 | mandatory | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `approval_request_id` | `hotel_revenue_approval_requests.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_revenue_approval_policy</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_revenue_approval_requests</code> — 3 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `requested_by` | `restaurant_users.id` | N:1 | mandatory | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reviewed_by` | `restaurant_users.id` | N:1 | optional | no action |

</details>

<details><summary><code>hotel_revenue_otb_snapshots</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>hotel_room_amenity_overrides</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `amenity_id` | `room_amenities.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_room_links</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `other_room_id` | `hotel_rooms.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>hotel_rooms</code> — 9 outbound, 12 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `building_id` | `hotel_buildings.id` | N:1 | optional | no action |
| `floor_id` | `hotel_floors.id` | N:1 | optional | no action |
| `restriction_approved_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restriction_maintenance_request_id` | `housekeeping_maintenance_requests.id` | N:1 | optional | restrict |
| `restriction_placed_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |
| `wing_id` | `hotel_wings.id` | N:1 | optional | no action |

</details>

<details><summary><code>hotel_wings</code> — 3 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `parent_building_id` | `hotel_buildings.id` | N:1 | optional | no action |
| `parent_floor_id` | `hotel_floors.id` | N:1 | optional | no action |

</details>

<details><summary><code>housekeeping_discrepancies</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `reported_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `resolved_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>housekeeping_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | N:1 | optional | no action |

</details>

<details><summary><code>housekeeping_inspections</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `inspector_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | N:1 | mandatory | no action |
| `task_id` | `housekeeping_tasks.id` | N:1 | optional | no action |

</details>

<details><summary><code>housekeeping_maintenance_requests</code> — 4 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `resolved_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>housekeeping_tasks</code> — 4 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `assigned_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_id` | `hotel_rooms.id` | 1:1 | mandatory | no action |

</details>

<details><summary><code>inventory_items</code> — 3 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `base_unit_id` | `inventory_units.id` | N:1 | mandatory | no action |
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>inventory_stock_movements</code> — 7 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `inventory_item_id` | `inventory_items.id` | N:1 | mandatory | cascade |
| `purchase_order_id` | `purchase_orders.id` | N:1 | optional | set null |
| `purchase_order_item_id` | `purchase_order_items.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `supplier_id` | `restaurant_suppliers.id` | N:1 | optional | set null |
| `unit_id` | `inventory_units.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>invoice_credit_note_draft_items</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `draft_id` | `invoice_credit_note_drafts.id` | N:1 | mandatory | cascade |
| `source_group_id` | `folio_transactions.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>invoice_credit_note_drafts</code> — 3 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `account_invoice_id` | `financial_account_invoices.id` | N:1 | optional | cascade |
| `guest_invoice_id` | `guest_folio_invoices.id` | N:1 | optional | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>invoice_credit_note_events</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>invoice_credit_note_lines</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `component_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `credit_note_id` | `invoice_credit_notes.id` | N:1 | mandatory | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>invoice_credit_notes</code> — 3 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `account_invoice_id` | `financial_account_invoices.id` | N:1 | optional | no action |
| `guest_invoice_id` | `guest_folio_invoices.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>marketing_content_revisions</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `updated_by` | `auth.users.id` | N:1 | optional | set null |

</details>

<details><summary><code>night_audit_exceptions</code> — 3 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `night_audit_run_id` | `night_audit_runs.id` | N:1 | mandatory | cascade |
| `resolved_by_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>night_audit_fiscal_overrides</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `exception_id` | `night_audit_exceptions.id` | 1:1 | mandatory | restrict |
| `night_audit_run_id` | `night_audit_runs.id` | N:1 | mandatory | cascade |
| `overridden_by_membership_id` | `restaurant_users.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>night_audit_runs</code> — 3 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `closed_by_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `started_by_membership_id` | `restaurant_users.id` | N:1 | optional | set null |

</details>

<details><summary><code>night_audit_warning_reviews</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `exception_id` | `night_audit_exceptions.id` | 1:1 | mandatory | restrict |
| `night_audit_run_id` | `night_audit_runs.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reviewed_by_membership_id` | `restaurant_users.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_account_create_drafts</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_account_type_labels</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_agency_allotments</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agency_master_id` | `guest_account_masters.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_agency_allowed_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agency_master_id` | `guest_account_masters.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_agency_commission_entries</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `commission_rule_id` | `pms_agency_commission_rules.id` | N:1 | optional | set null |
| `plan_id` | `pms_agency_commission_plans.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agency_master_id` | `guest_account_masters.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_agency_commission_plans</code> — 2 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agency_master_id` | `guest_account_masters.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_agency_commission_rules</code> — 4 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `commission_plan_id` | `pms_agency_commission_plans.id` | 1:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | optional | cascade |
| `room_type_id` | `room_types.id` | N:1 | optional | cascade |

</details>

<details><summary><code>pms_agency_notification_prefs</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agency_master_id` | `guest_account_masters.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_agency_rate_defaults</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agency_master_id` | `guest_account_masters.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_approval_rules</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `permission_id` | `pms_permissions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `approver_role_id` | `pms_hotel_roles.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_audit_category_settings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `category_id` | `pms_audit_categories.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_audit_policies</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_audit_sensitive_coverage</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `permission_id` | `pms_permissions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_billing_rules</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_business_contact_roles</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_business_profile_settings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `default_business_type_id` | `pms_business_profile_types.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_business_profile_types</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_commercial_restriction_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `restriction_id` | `pms_commercial_restrictions.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_commercial_restrictions</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_communication_automation_rules</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `event_id` | `pms_communication_notification_events.id` | N:1 | mandatory | restrict |
| `template_id` | `pms_communication_templates.id` | N:1 | optional | restrict |

</details>

<details><summary><code>pms_communication_channels</code> — 1 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_communication_defaults</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |
| `default_guest_channel_id` | `pms_communication_channels.id` | N:1 | optional | set null |
| `default_internal_channel_id` | `pms_communication_channels.id` | N:1 | optional | set null |
| `default_marketing_channel_id` | `pms_communication_channels.id` | N:1 | optional | set null |
| `default_sender_id` | `pms_communication_sender_settings.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_communication_notification_events</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `default_template_id` | `pms_communication_templates.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_communication_sender_settings</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `channel_type` | `pms_communication_channels.channel_type` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_communication_templates</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_company_document_types</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_contract_rates</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `agreement_id` | `pms_corporate_agreements.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_contract_types</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_corporate_agreements</code> — 8 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `agency_master_id` | `guest_account_masters.id` | N:1 | optional | restrict |
| `contract_type_id` | `pms_contract_types.id` | N:1 | optional | set null |
| `deposit_policy_id` | `pms_deposit_policies.id` | N:1 | optional | set null |
| `no_show_policy_id` | `pms_no_show_policies.id` | N:1 | optional | set null |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `company_id` | `guest_account_masters.id` | N:1 | mandatory | restrict |
| `rate_cancellation_policy_id` | `pms_rate_cancellation_policies.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_credit_note_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_debit_note_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_department_routing_rules</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_departments</code> — 4 outbound, 14 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `escalation_manager_user_id` | `restaurant_users.user_id` | N:1 | optional | set null |
| `manager_user_id` | `restaurant_users.user_id` | N:1 | optional | set null |
| `parent_id` | `pms_departments.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_deposit_policies</code> — 1 outbound, 5 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_distribution_sync_events</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_early_departure_policies</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_event_contract_defaults</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `deposit_policy_id` | `pms_deposit_policies.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_event_package_template_outlets</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `outlet_id` | `pms_outlets.id` | N:1 | mandatory | cascade |
| `template_id` | `pms_event_package_templates.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_event_package_template_services</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `fo_service_id` | `fo_service_catalogue.id` | N:1 | mandatory | cascade |
| `template_id` | `pms_event_package_templates.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_event_package_templates</code> — 4 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `currency_code` | `pms_property_currencies.code` | N:1 | optional | set null |
| `event_type_id` | `pms_event_types.id` | N:1 | optional | set null |
| `tax_group_id` | `pms_tax_groups.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_event_statuses</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_event_types</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_exchange_rates</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `quote_currency_code` | `pms_property_currencies.code` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_external_reservation_mappings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_external_reservation_snapshots</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_fees</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_financial_settings</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_function_space_labels</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_function_space_outlets</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `function_space_label_id` | `pms_function_space_labels.id` | N:1 | mandatory | cascade |
| `outlet_id` | `pms_outlets.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_golive_plans</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_golive_tasks</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `golive_plan_id` | `pms_golive_plans.id` | N:1 | mandatory | cascade |
| `owner_department_id` | `pms_departments.id` | N:1 | optional | set null |
| `owner_user_id` | `restaurant_users.user_id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_group_allotment_nights</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `group_block_id` | `pms_group_blocks.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_group_blocks</code> — 3 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `group_id` | `pms_groups.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>pms_group_create_drafts</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_group_history</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `group_id` | `pms_groups.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_group_rooming_rows</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `group_id` | `pms_groups.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_group_templates</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_group_types</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_groups</code> — 4 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `company_master_id` | `guest_account_masters.id` | N:1 | optional | no action |
| `group_account_master_id` | `guest_account_masters.id` | N:1 | optional | no action |
| `travel_agent_master_id` | `guest_account_masters.id` | N:1 | optional | no action |

</details>

<details><summary><code>pms_guest_create_drafts</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_fields</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_id_types</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_preference_categories</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_preference_types</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `category_id` | `pms_guest_preference_categories.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_profile_types</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_request_types</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `department_id` | `pms_departments.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_service_availability</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `service_type_id` | `pms_guest_service_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_guest_service_categories</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_service_department_assignments</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | mandatory | restrict |
| `service_type_id` | `pms_guest_service_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_guest_service_pricing</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `service_type_id` | `pms_guest_service_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_guest_service_sla_rules</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `service_type_id` | `pms_guest_service_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_guest_service_types</code> — 2 outbound, 6 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `category_id` | `pms_guest_service_categories.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_guest_vip_levels</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_hotel_roles</code> — 2 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_housekeeping_priority_rules</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_housekeeping_settings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |
| `default_housekeeping_status` | `pms_housekeeping_status_catalog.code` | N:1 | mandatory | no action |

</details>

<details><summary><code>pms_housekeeping_status_catalog</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_housekeeping_transition_rules</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `from_status_code` | `pms_housekeeping_status_catalog.code` | N:1 | mandatory | no action |
| `to_status_code` | `pms_housekeeping_status_catalog.code` | N:1 | mandatory | no action |

</details>

<details><summary><code>pms_import_duplicate_policies</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `import_type_id` | `pms_import_types.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_field_definitions</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `import_type_id` | `pms_import_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_import_job_issues</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `job_id` | `pms_import_jobs.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_jobs</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `import_type_id` | `pms_import_types.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_mapping_template_fields</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `field_definition_id` | `pms_import_field_definitions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `template_id` | `pms_import_mapping_templates.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_mapping_templates</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `import_type_id` | `pms_import_types.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_policies</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_type_settings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `import_type_id` | `pms_import_types.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_import_validation_rules</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `import_type_id` | `pms_import_types.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_integration_activity</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `integration_id` | `pms_integrations.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_integrations</code> — 1 outbound, 9 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_inventory_block_type_rules</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `pms_inventory_rules.restaurant_id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_inventory_rules</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_invoice_settings</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_issued_invoice_counters</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_lead_types</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_maintenance_categories</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_maintenance_priorities</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_maintenance_rules</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |
| `preventive_assigned_department_id` | `pms_departments.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_maintenance_status_rules</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `pms_maintenance_rules.restaurant_id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_maintenance_type_tags</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_market_segments</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_meal_applicability_policies</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_meal_plans</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_membership_roles</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `assigned_by_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `assigned_by_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `membership_id` | `restaurant_users.id` | N:1 | mandatory | cascade |
| `role_id` | `pms_hotel_roles.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_metric_definition_settings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `metric_id` | `pms_metric_definitions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_no_show_policies</code> — 1 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_notification_templates</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_offline_capabilities</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `pms_offline_policies.restaurant_id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_offline_policies</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_operational_inventory_blocks</code> — 8 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `activated_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `approved_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `cancelled_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `created_by_membership_id` | `restaurant_users.id` | N:1 | mandatory | no action |
| `released_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `room_id` | `hotel_rooms.id` | N:1 | optional | no action |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>pms_outlets</code> — 8 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |
| `building_id` | `hotel_buildings.id` | N:1 | optional | set null |
| `currency_code` | `pms_property_currencies.code` | N:1 | optional | set null |
| `department_id` | `pms_departments.id` | N:1 | optional | set null |
| `floor_id` | `hotel_floors.id` | N:1 | optional | set null |
| `manager_user_id` | `restaurant_users.user_id` | N:1 | optional | set null |
| `tax_group_id` | `pms_tax_groups.id` | N:1 | optional | set null |
| `wing_id` | `hotel_wings.id` | N:1 | optional | set null |

</details>

<details><summary><code>pms_overbooking_date_limits</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |
| `updated_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |

</details>

<details><summary><code>pms_package_components</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `fo_service_id` | `fo_service_catalogue.id` | N:1 | optional | restrict |
| `meal_plan_id` | `pms_meal_plans.id` | N:1 | optional | restrict |
| `package_id` | `pms_packages.id` | N:1 | mandatory | cascade |
| `room_amenity_id` | `room_amenities.id` | N:1 | optional | restrict |

</details>

<details><summary><code>pms_package_rate_plans</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `package_id` | `pms_packages.id` | N:1 | mandatory | cascade |
| `rate_plan_id` | `hotel_rate_plans.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_package_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `package_id` | `pms_packages.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_packages</code> — 1 outbound, 5 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_payment_methods</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_preference_options</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_promotion_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `promotion_id` | `pms_promotions.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_promotions</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_property_areas</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_property_currencies</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_property_department_contacts</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_purpose_of_stay</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_rate_cancellation_policies</code> — 1 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_rate_refundability_codes</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_registration_agreement_versions</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | no action |

</details>

<details><summary><code>pms_report_access_events</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_user_id` | `auth.users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `membership_id` | `restaurant_users.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>pms_report_definition_settings</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `definition_id` | `pms_report_definitions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_report_definitions</code> — 1 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `category_id` | `pms_report_categories.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>pms_report_permissions</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `definition_id` | `pms_report_definitions.id` | N:1 | mandatory | restrict |
| `permission_id` | `pms_permissions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_report_policies</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>pms_reservation_overbooking_approvals</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `approved_by_membership_id` | `restaurant_users.id` | N:1 | mandatory | no action |
| `requested_by_membership_id` | `restaurant_users.id` | N:1 | mandatory | no action |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_reservation_service_entitlements</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `reservation_room_id` | `hotel_reservation_rooms.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_restriction_reasons</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_role_permissions</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `permission_id` | `pms_permissions.id` | N:1 | mandatory | restrict |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `role_id` | `pms_hotel_roles.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_room_inventory_events</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `actor_membership_id` | `restaurant_users.id` | N:1 | mandatory | no action |
| `block_id` | `pms_operational_inventory_blocks.id` | N:1 | optional | no action |
| `room_id` | `hotel_rooms.id` | N:1 | optional | no action |

</details>

<details><summary><code>pms_room_type_overbooking_rules</code> — 4 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `room_type_id` | `room_types.id` | 1:1 | mandatory | cascade |
| `updated_by_membership_id` | `restaurant_users.id` | N:1 | optional | no action |

</details>

<details><summary><code>pms_sales_channel_labels</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_sales_pipeline_stages</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_season_room_types</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | restrict |
| `season_id` | `pms_seasons.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_seasons</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_service_charge_department_targets</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | mandatory | cascade |
| `service_charge_id` | `pms_service_charges.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_service_charges</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_shift_definitions</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_source_codes</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_tax_department_targets</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `department_id` | `pms_departments.id` | N:1 | mandatory | cascade |
| `tax_id` | `pms_taxes.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_tax_exemption_rules</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_tax_group_taxes</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `tax_group_id` | `pms_tax_groups.id` | N:1 | mandatory | cascade |
| `tax_id` | `pms_taxes.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_tax_groups</code> — 1 outbound, 4 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_taxes</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_waitlist_history</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `waitlist_request_id` | `pms_waitlist_requests.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_waitlist_offers</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | no action |
| `waitlist_request_id` | `pms_waitlist_requests.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>pms_waitlist_requests</code> — 4 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `reservation_id` | `hotel_reservations.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `guest_id` | `guest_profiles.id` | N:1 | mandatory | no action |
| `requested_room_type_id` | `room_types.id` | N:1 | optional | no action |

</details>

<details><summary><code>pms_work_centers</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `department_id` | `pms_departments.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>profiles</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `id` | `auth.users.id` | 1:1 | mandatory | cascade |

</details>

<details><summary><code>purchase_order_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `purchase_order_id` | `purchase_orders.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>purchase_order_items</code> — 4 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `inventory_item_id` | `inventory_items.id` | N:1 | mandatory | restrict |
| `purchase_order_id` | `purchase_orders.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `unit_id` | `inventory_units.id` | N:1 | mandatory | no action |

</details>

<details><summary><code>purchase_orders</code> — 4 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `ordered_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `supplier_id` | `restaurant_suppliers.id` | N:1 | mandatory | restrict |

</details>

<details><summary><code>reservation_traces</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `reservation_id` | `hotel_reservations.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurant_asset_history</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `asset_id` | `restaurant_assets.id` | N:1 | mandatory | cascade |
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurant_assets</code> — 2 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurant_package_entitlements</code> — 1 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurant_staff_audit_log</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `actor_user_id` | `auth.users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `target_user_id` | `auth.users.id` | N:1 | optional | set null |

</details>

<details><summary><code>restaurant_suppliers</code> — 2 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurant_tables</code> — 1 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurant_users</code> — 3 outbound, 94 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `hotel_role_id` | `pms_hotel_roles.id` | N:1 | optional | set null |
| `user_id` | `auth.users.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>restaurants</code> — 2 outbound, 278 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `approved_by` | `auth.users.id` | N:1 | optional | no action |
| `id,default_room_tax_group_id` | `pms_tax_groups.id` | N:1 | optional | set null |

</details>

<details><summary><code>room_amenities</code> — 1 outbound, 3 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>room_type_amenities</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `amenity_id` | `room_amenities.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>room_type_beds</code> — 2 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>room_type_images</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `room_type_id` | `room_types.id` | N:1 | mandatory | cascade |
| `uploaded_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |

</details>

<details><summary><code>room_types</code> — 5 outbound, 29 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_staff_membership_id` | `restaurant_users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `default_building_id` | `hotel_buildings.id` | N:1 | optional | set null |
| `default_wing_id` | `hotel_wings.id` | N:1 | optional | set null |
| `preferred_floor_id` | `hotel_floors.id` | N:1 | optional | set null |

</details>

<details><summary><code>staff_attendance</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `shift_id` | `staff_shifts.id` | N:1 | mandatory | cascade |
| `staff_membership_id` | `restaurant_users.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>staff_module_access</code> — 3 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by_membership_id` | `restaurant_users.id` | N:1 | optional | set null |
| `membership_id` | `restaurant_users.id` | N:1 | mandatory | cascade |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>staff_shifts</code> — 3 outbound, 2 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by` | `auth.users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `staff_membership_id` | `restaurant_users.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>staff_table_assignments</code> — 5 outbound, 0 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `created_by` | `auth.users.id` | N:1 | optional | no action |
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | cascade |
| `restaurant_table_id` | `restaurant_tables.id` | N:1 | mandatory | cascade |
| `shift_id` | `staff_shifts.id` | N:1 | mandatory | cascade |
| `staff_membership_id` | `restaurant_users.id` | N:1 | mandatory | cascade |

</details>

<details><summary><code>withholding_certificates</code> — 5 outbound, 1 inbound</summary>

| FK column(s) | References | Cardinality | Optionality | On delete |
|---|---|---|---|---|
| `restaurant_id` | `restaurants.id` | N:1 | mandatory | no action |
| `financial_account_id` | `financial_accounts.id` | N:1 | mandatory | no action |
| `invoice_id` | `financial_account_invoices.id` | N:1 | mandatory | no action |
| `ledger_transaction_id` | `folio_transactions.id` | N:1 | mandatory | no action |
| `reverses_certificate_id` | `withholding_certificates.id` | N:1 | optional | no action |

</details>

Tables with no outbound FK (7): `inventory_units`, `leads`, `pms_audit_categories`, `pms_import_types`, `pms_metric_definitions`, `pms_permissions`, `pms_report_categories`.

## Appendix B — Validation

| Check | Result |
|---|---|
| Deployed `public` tables (`pg_class` relkind r/p) | 297 |
| Classified tables | 297 |
| Missing from catalogue | 0 |
| Extra in catalogue | 0 |
| Tables with exactly one domain, type, scope and ERD group | 297 |
| Migration created / applied | NO / NO |
| Schema changed / data changed | NO / NO |

