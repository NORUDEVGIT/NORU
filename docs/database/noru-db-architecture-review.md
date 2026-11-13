# NORU Database Architecture Review

Task: **NORU-DB-ARCH-02 — Domain Boundary & Relationship Normalization Review** (read-only).

- Input: `docs/database/noru-db-architecture-catalogue.md` (NORU-DB-ARCH-01) plus fresh read-only evidence.
- Source database: deployed Supabase project `qcwptraosaudcbjasmul`, schema `public` (read-only `SELECT` / `pg_catalog` queries only).
- Source code: `src/` (non-test files), `supabase/migrations/` for intent only.
- Review date: 2026-11-10.
- Migrations created: **NO**. Migrations applied: **NO**. Schema changed: **NO**. Data changed: **NO**. Application code changed: **NO**.

Classification vocabulary used throughout:

- Warning categories: HEALTHY BY DESIGN, DOCUMENTATION ISSUE, OWNERSHIP ISSUE, NORMALIZATION ISSUE, MISSING RELATIONSHIP, LEGACY RESIDUE, POTENTIAL FUTURE REFACTOR.
- Severity: **P0** data integrity risk, **P1** ownership / write conflict, **P2** normalization / duplication, **P3** naming / documentation, **P4** future / optional.

---

## 1. Executive Summary

| Item | Result |
|---|---|
| INVESTIGATE tables resolved | 4 / 4 (0 remain) |
| Additional ownership correction | `housekeeping_maintenance_requests`: Maintenance → Housekeeping |
| Cross-domain write conflicts classified | 24 / 24 (A 12 · B 7 · C 3 · D 2) |
| Duplicate-concept tables reviewed | 19 / 19 (KEEP BOTH 12 · MERGE LATER 5 · DEPRECATE LATER 2) |
| NOFK warnings classified | 16 / 16 tables, 32 columns (FK SHOULD EXIST 25 · INTENTIONAL SOFT REFERENCE 6 · POLYMORPHIC 1) |
| Zero-row tables classified | 55 / 55 |
| Legacy naming warnings decided | 11 / 11 (KEEP 3 · DOCUMENT ALIAS 7 · RENAME LATER 1) |
| P0 findings | 1 (P0-1, latent; 0 affected rows) — **RESOLVED** by NORU-DATA-INTEGRITY-01 |
| P1 findings | 7 |
| ERD readiness | 23 groups: READY 5 · READY WITH NOTES 18 · BLOCKED 0 |

Headline decisions:

1. **Reservation header vs room units.** Room units are the source for everything that can differ per room. The header is the booking envelope plus derived summaries. Two availability paths still read **header** status, and one cancellation path writes the header only (see P0-1, P1-1, P1-2).
2. **Guest services.** `pms_guest_service_types` is the single service catalogue and `guest_service_history` is the single request store. `fo_service_catalogue`, `pms_guest_request_types` and `fo_guest_requests` are legacy and are to be merged or deprecated later.
3. **Roles.** `restaurant_users.role` is the access tier used by RLS. `pms_membership_roles` is the functional hotel-role source used by the permission resolver. `restaurant_users.hotel_role_id` is legacy residue: it is not read, and it disagrees with the bridge for all 3 bridge members.
4. **`restaurants` policy columns.** Property-level deposit, fee, early check-in and late checkout columns are the **current runtime source** for property defaults. Most `pms_*_posture` / `*_rules` JSON columns are **compatibility snapshots** of setup-card state, with no runtime reader.
5. **Shift models are not duplicates.** `hotel_cashier_shifts` is the cash session, `staff_shifts` the rota instance, and `pms_shift_definitions` the template. `folio_history.legacy_cashier_shift_id` is the only legacy residue.

---

## 2. Investigate Table Resolution

Evidence: deployed FKs, unique constraints, row counts, every source reference, migration comments and `docs/pms-only-architecture.md`.

| Table | Final domain | Owner | Type | Scope | ERD group | Why |
|---|---|---|---|---|---|---|
| `fo_service_catalogue` | Rate & Revenue | Rate & Revenue | CONFIGURATION (legacy) | PMS | 09b-packages-promotions | 0 rows. Its only FK children are `pms_package_components.fo_service_id` and `pms_event_package_template_services`, both package/event-package structures. It is written only by the meals/packages setup card and the sales-events card (generic CRUD), and read by rate quoting and service entitlement. It is not used for guest service requests, which use `pms_guest_service_types`. Decision: **DEPRECATE LATER** once package components reference `pms_guest_service_types`. |
| `pms_shift_definitions` | Human Resources / Staff | Human Resources / Staff | CONFIGURATION (template) | PMS | 12-staff-hr | 0 rows; unique `(restaurant_id, code)`; no FK children. Edited only in the Administration "roles · shifts · staff · thin HR" card (`pms-polish1-payment-admin`). The module header states "Shifts live on pms_shift_definitions … Not staff_shifts." It is a workforce shift template, not a cash session. |
| `restaurant_tables` | Human Resources / Staff | Human Resources / Staff | MASTER (retained) | SHARED | 12-staff-hr | 3 rows. Read only by `workforce.server.ts` / `workforce.functions.ts`, which assign staff to outlet tables. No app writer. Retained explicitly by `docs/pms-only-architecture.md`. Its only child is `staff_table_assignments`. It is an F&B outlet table list used by staff scheduling, so HR owns it. |
| `staff_table_assignments` | Human Resources / Staff | Human Resources / Staff | BRIDGE | SHARED | 12-staff-hr | 0 rows. FKs to `restaurant_tables`, `staff_shifts` (cascade) and `restaurant_users`; unique `(shift_id, restaurant_table_id)`. Written only by the workforce module. |

Additional ownership correction (strong evidence, applied to the catalogue):

| Table | Old owner | New owner | Why |
|---|---|---|---|
| `housekeeping_maintenance_requests` | Maintenance | Housekeeping | All app writes (insert at `housekeeping.functions.ts:1431`, status update at `:1487`) come from the Housekeeping module. Readers are Housekeeping, Rooms & Inventory (`pms_set_room_operational_restriction`) and Night Audit; the Maintenance module never reads or writes it. Maintenance keeps ownership of rules, categories, priorities and type tags. ERD group is unchanged (06-housekeeping-maintenance). |

Result: **0 INVESTIGATE tables remain.** The UNCLEAR OWNER flag count drops from 4 to 0.

---

## 3. Cross-Domain Write Review

Classes:

- **A** VALID ORCHESTRATION. The write is legitimate for the calling flow, or the conflict was a module-mapping artefact.
- **B** OWNER RPC/FUNCTION SHOULD BE USED. An owner function exists or should exist; the caller bypasses it.
- **C** DIRECT CROSS-DOMAIN WRITE SMELL. The caller mutates another domain's business state with no owner path.
- **D** SHARED TABLE WITH MULTIPLE LEGITIMATE OWNERS. Row or column groups have distinct owners.

| # | Table | Owner | Out-of-owner writer and evidence | Class | Severity | Decision |
|---|---|---|---|---|---|---|
| 1 | `distribution_logs` | Distribution | Direct Booking inserts a channel log (`public-booking.server.ts:170`). | A | P4 | The booking engine is a distribution channel, and logging its own events is valid. |
| 2 | `folio_history` | Cashiering | Front Office inserts a `checkout_unsettled_exception` event (`fo-check-out.functions.ts:1009`). | B | P1 | Cashiering should expose one "record settlement exception" function that writes this together with #3. |
| 3 | `guest_folios` | Cashiering | Front Office updates settlement-exception columns (`fo-check-out.functions.ts:996`). | B | P1 | Same as #2. This is a folio state change made outside the cashiering RPC family. |
| 4 | `guest_profile_history` | Guest Profile | Direct Booking inserts `created` (`public-booking.server.ts:146`). | B | P2 | Should come from the Guest Profile create service (see #5). |
| 5 | `guest_profiles` | Guest Profile | Reservations updates companion name/phone/ID/notes (`reservation-detail-controls.functions.ts:109`). Front Office updates identity columns at check-in (`fo-check-in-registration.functions.ts:197`, `fo-check-in.functions.ts:610`). Direct Booking inserts a guest (`public-booking.server.ts:133`) without `next_guest_profile_number`, and no trigger assigns `profile_number`. | C | P1 | Guest Profile owns identity writes. Callers should use a Guest Profile service for create (numbering, duplicate detection, history) and for identity edits. |
| 6 | `guest_service_history` | Guest Services | The Guest Profile workspace inserts and updates requests (`guests.functions.ts:3477/3483/3490`, `guests.server.ts:226`). Front Office and reservation charges use `post_reservation_service_requests`. | B | P2 | Two create paths. Consolidate request creation behind the Guest Services path that the RPC already uses. |
| 7 | `hotel_reservation_history` | Reservations | Direct Booking inserts `cancelled` (`public-booking.functions.ts:486`). | B | P1 | Part of the header-only cancellation in #9; must come from the owner cancel path. |
| 8 | `hotel_reservation_rooms` | Reservations | Front Office cancel fallback sets the unit to `cancelled` with `room_id = null` when there is one unit and no `reservationRoomId` (`fo-cancel-noshow.functions.ts:747`). | B | P2 | Owner RPC `cancel_hotel_reservation_unit` exists and is used on the multi-unit path. The single-unit fallback should use it too. Today header and unit stay consistent. |
| 9 | `hotel_reservations` | Reservations | Front Office: `expected_arrival_at`, `late_checkout_*` (`arrivals-departures.functions.ts:90/149`), `guest_id` and `special_request_category` (`fo-amendments.functions.ts:773/1063`), `source: walk_in` (`fo-check-in.functions.ts:514`), and cancel fallback (`fo-cancel-noshow.functions.ts:734`). Direct Booking: `cancelDirectBooking` set header status only (fixed by NORU-DATA-INTEGRITY-01; now cancels units through the owner function). Guest Profile: account master links (`guest-accounts.functions.ts:1376`) and guest merge re-pointing (`guest-privacy.functions.ts:1081`, `guests.functions.ts:4769`). | C | **P0** (status), P1 (other fields) | Status must only change through unit RPCs plus `rollup_hotel_reservation_status`. Operational fields need owner functions. Merge re-pointing is acceptable orchestration but should be one Reservations function. See P0-1. |
| 10 | `hotel_rooms` | Rooms & Inventory | Housekeeping updates `maintenance_status` (`housekeeping.server.ts:323`). | B | P1 | Room operational state has the owner RPC `pms_set_room_operational_restriction` and the guard trigger `pms_hotel_rooms_operational_status_guard`; Housekeeping should go through it. |
| 11 | `housekeeping_history` | Housekeeping | Rooms & Inventory sets `room_id = null` before deleting a room (`rooms.functions.ts:395`). | A | P4 | Valid cleanup when a room is deleted. Could later become an `ON DELETE SET NULL` FK action. |
| 12 | `housekeeping_maintenance_requests` | Housekeeping (corrected) | Housekeeping insert/update. | A | — | Resolved by the ownership correction in section 2. No longer a conflict in the catalogue. |
| 13 | `pms_communication_channels` | Integrations | `communication-channels-card4` (a settings card; ARCH-01 mapped it to Distribution because of the word "channel"). | A | P3 | Module-mapping artefact. This is a Property Setup write. |
| 14 | `pms_communication_notification_events` | Integrations | `notification-events-card4` (settings card; mapped to Reservations because of the word "event"). | A | P3 | Module-mapping artefact. |
| 15 | `pms_departments` | Property Core | `service-department-assignment-card4` inserts departments inline. | A | P3 | Setup card. Acceptable, but department creation should reuse the department setup function so defaults stay consistent. |
| 16 | `pms_group_types` | Guest Profile | `group-types-card4` (setup) and `guest-group-types`. | A | P3 | Two editors of one lookup. Both are setup surfaces; keep one editor later. |
| 17 | `pms_integrations` | Integrations | Fiscal upserts config and test status (`fiscal.functions.ts:439/444/556/585`); Distribution/Aiosell (`aiosell-connection.server.ts:189/199/408`). | D | P3 | A registry: Integrations owns the table, and each provider module owns its own row (`provider` key). Document this row-ownership rule. |
| 18 | `pms_invoice_settings` | Fiscal / Invoicing | `billing-card3` (setup card). | A | P3 | Module-mapping artefact; Property Setup write. |
| 19 | `pms_meal_applicability_policies` | Guest Services | `meals-card3` (setup card). | A | P3 | Property Setup write. |
| 20 | `pms_no_show_policies` | Rate & Revenue | `corporate-contracts.functions.ts` creates and updates policies and resets `is_default`. | C | P2 | A second editor of a property-wide policy catalogue from an account-agreement screen. Contracts should select a policy, not edit the catalogue. |
| 21 | `pms_purpose_of_stay` | Reservations | `purpose-of-stay.functions.ts` (setup CRUD; mapped to Direct Booking because of the word "stay"). | A | P3 | Module-mapping artefact. |
| 22 | `pms_registration_agreement_versions` | Front Office | `guest-agreement.*` (registration agreement editor; mapped to Guest Profile because of the word "guest"). | A | P3 | Module-mapping artefact. |
| 23 | `profiles` | Security / Permissions | HR staff onboarding upserts `account_type = restaurant_user` and deletes profiles via the service role (`staff.functions.ts:348/392`, `pms-staff.functions.ts:113/240/334`). | A | P3 | Staff onboarding legitimately provisions the login identity. `enforce_profile_account_type` guards untrusted writes (section 8). |
| 24 | `restaurants` | Property Core | Many setup cards persist their own column groups and `pms_property_setup_status`; plus admin-authz. | D | P2 | Column-group ownership: each setup card owns its posture/rule columns, Property Core owns identity and business date, and Night Audit owns `business_date` transitions via RPC. `enforce_restaurant_protected_fields` protects key fields. See section 4.9. |

Counts: **A 12 · B 7 · C 3 · D 2 = 24.** After the ownership correction, the regenerated catalogue shows 23 XWRITE tables.

### Reservation header vs room units

Evidence:

- `create_hotel_reservation_priced` creates the header, prices it, inserts unit 1 copying header values, then runs `assert_reservation_room_units`, `sync_reservation_room_total` and `assign_reservation_room_guests`.
- `sync_reservation_room_total` derives the header subtotal, currency, nightly snapshot and `priced_at` from the units.
- `rollup_hotel_reservation_status` derives header status, and header `room_id` from the first unit.
- `hotel_reservation_rooms_align_insert_status` copies pending/confirmed to new units.
- `change_hotel_stay_dates` updates header dates and the units with matching dates.

| Value | Classification | Rule |
|---|---|---|
| `room_id`, `room_type_id`, `rate_plan_id`, `arrival_date`, `departure_date`, `adults`, `children`, `infants`, `pms_group_block_id`, unit `status`, room guests (`hotel_reservation_room_guests`) | **ROOM-UNIT SOURCE** | Written only on `hotel_reservation_rooms` through reservation RPCs. |
| Unit `nightly_rate_snapshot`, `room_subtotal`, `currency`, `priced_at` | **SNAPSHOT** (unit-level) | Frozen at pricing time per unit. |
| Header `status` | **DERIVED** | Only `rollup_hotel_reservation_status` writes it. Direct writes are prohibited (P0-1). |
| Header `room_id` | **DERIVED** | First unit by `unit_sequence`. |
| Header `room_subtotal`, `currency`, `nightly_rate_snapshot`, `priced_at` | **DERIVED** | `sync_reservation_room_total` (sum, or copy of unit 1). No mismatches found. |
| Header `arrival_date`, `departure_date` | **DERIVED** (stay envelope) | Maintained by `change_hotel_stay_dates`. No mismatches found. |
| Header `adults`, `children`, `infants`, `room_type_id`, `rate_plan_id`, `pms_group_block_id` | **DUPLICATE-RISKY** | Not maintained by any rollup. Drift observed: NR-000023 header 1/0 occupancy vs unit 2/2; NR-000024 header `rate_plan_id` ≠ unit. Multi-unit headers (NR-000020, NR-000030) carry unit 1 values only. Treat as "unit 1 copy, display only" until a rollup or removal is decided (P2). |
| `guest_id`, `booker_guest_id`, `confirmation_number`, `source`, `commercial_*`, `market_segment`, account master ids and contacts, `billing_rule_id`, `guarantee_method`, `pms_group_id`, `purpose_of_stay`, `special_requests`, `special_request_category`, `notes`, `cancellation_reason`, `external_reference`, `reservation_mode`, `rooms_requested` | **HEADER SOURCE** | Booking-level facts. |
| `cancellation_policy_snapshot`, `refundability_snapshot`, `deposit_requirement_snapshot`, `no_show_policy_snapshot`, `early_departure_policy_snapshot` (with their `*_policy_id`) | **SNAPSHOT** (header) | Booking-time policy terms. |
| `expected_arrival_at`, `late_checkout_granted/until/note`, `arrival_transport`, `pickup_note` | **HEADER SOURCE** (unit-level concept) | Correct for single-room stays. For multi-room stays these are per-room facts; potential future refactor (P4). |

**Ownership rule.** The reservation header owns booking identity, parties, commercial classification and booking-time policy snapshots. Room units own the stay: room, type, rate, dates, occupancy, status and guests. Header status, room, totals and dates are derived and must only be written by `rollup_hotel_reservation_status`, `sync_reservation_room_total` and `change_hotel_stay_dates`. Availability and inventory must count **units by unit status**.

Findings against this rule:

- **P0-1 (latent) — RESOLVED (NORU-DATA-INTEGRITY-01).** `cancelDirectBooking` used to set header `status = cancelled` and leave units live, so any later unit-level RPC re-running `rollup_hotel_reservation_status` could bring the cancelled booking back. 0 direct-source reservations existed, so no rows were affected. It now calls `cancel_hotel_reservation_all_units` (migration 0203), which cancels every pending/confirmed unit through `cancel_hotel_reservation_unit` in one transaction; the header is produced only by the rollup.
  - **Canonical lifecycle rule:** `hotel_reservation_rooms.status` is the stay lifecycle source; `hotel_reservations.status` is derived and written only by `rollup_hotel_reservation_status`. Whole-booking cancellation: `pending`/`confirmed` → `cancelled`; `cancelled` is left unchanged; any `checked_in`, `checked_out` or `no_show` unit rejects the whole booking (`INVALID_TRANSITION`) and changes nothing.
  - Not changed (still open): Front Office and Reservations cancellation paths, and the P1 items below.
- **P1-1.** `pms_stay_overlaps_room`, `pms_room_unit_claims_room` and `pms_unassigned_room_demand` join units but filter on **header** status. Evidence: NR-000030 unit 1 is `checked_out` (2026-10-27 → 29), but the header is `confirmed`, so the unit still claims inventory.
- **P1-2.** `count_reserved_rooms` (used by `room-inventory-compat.ts:192`) counts headers, not units, so it under-counts multi-unit stays.
- **P2.** Header occupancy and rate drift (NR-000023, NR-000024).

---

## 4. Duplicate Concept Review

All 19 DUP-flagged tables, grouped by concept.

| Table | Concept | Decision | Category | Severity |
|---|---|---|---|---|
| `fo_stay_companions` | Companions | MERGE LATER (into `hotel_reservation_room_guests`) | LEGACY RESIDUE | P2 |
| `guest_preferences` | Preferences | MERGE LATER (into `guest_preference_values`) | LEGACY RESIDUE | P2 |
| `guest_preference_values` | Preferences | KEEP (current value store) | HEALTHY BY DESIGN | — |
| `pms_preference_options` | Preferences | DEPRECATE LATER | LEGACY RESIDUE | P3 |
| `fo_service_catalogue` | Guest services | DEPRECATE LATER | LEGACY RESIDUE | P2 |
| `pms_guest_request_types` | Guest services | MERGE LATER (into `pms_guest_service_types`) | NORMALIZATION ISSUE | P2 |
| `fo_guest_requests` | Guest services | MERGE LATER (into `guest_service_history`) | NORMALIZATION ISSUE | P2 |
| `pms_communication_templates` | Templates | KEEP (current template source) | HEALTHY BY DESIGN | — |
| `pms_notification_templates` | Templates | MERGE LATER (into `pms_communication_templates`) | LEGACY RESIDUE | P3 |
| `distribution_logs` | Distribution logging | KEEP BOTH (different semantics) | DOCUMENTATION ISSUE | P3 |
| `pms_distribution_sync_events` | Distribution logging | KEEP BOTH | HEALTHY BY DESIGN | — |
| `hotel_rate_restrictions` | Restrictions | KEEP BOTH (enforced source) | HEALTHY BY DESIGN | — |
| `pms_commercial_restrictions` | Restrictions | KEEP BOTH (non-enforced template; document) | DOCUMENTATION ISSUE | P2 |
| `pms_agency_allotments` | Room holds | KEEP (contract allocation, not an inventory hold) | POTENTIAL FUTURE REFACTOR | P4 |
| `guest_payment_invoice_allocations` | Allocations | KEEP BOTH (guest subject) | HEALTHY BY DESIGN | — |
| `financial_account_payment_allocations` | Allocations | KEEP BOTH (account subject) | HEALTHY BY DESIGN | — |
| `guest_deposit_invoice_allocations` | Allocations | KEEP BOTH (deposit → issued invoice) | HEALTHY BY DESIGN | — |
| `folio_deposit_allocations` | Allocations | KEEP BOTH (deposit → folio charge at posting) | HEALTHY BY DESIGN | — |
| `pms_shift_definitions` | Shifts | KEEP (template) | HEALTHY BY DESIGN | — |

Totals: KEEP / KEEP BOTH **12** · MERGE LATER **5** · DEPRECATE LATER **2**.

### 4.1 Companions — `fo_stay_companions` vs `hotel_reservation_room_guests`

- `hotel_reservation_room_guests` (67 rows) has `reservation_room_id`, `guest_id` and `is_primary`. It is written by `manage_reservation_room_guest` / `apply_external_reservation_event`, and read by check-in, check-out, the police stay report and room-unit guest names.
- `fo_stay_companions` (0 rows) has only `reservation_id, guest_id`. It is used only by `fo-amendments`, which already tolerates a missing table (`isMissingSchemaError`).
- **Decision: MERGE LATER.** `hotel_reservation_room_guests` (non-primary rows) is the companion source. `fo_stay_companions` is legacy residue with no data.

### 4.2 Preferences

| Role | Table | Status |
|---|---|---|
| Catalogue | `pms_guest_preference_categories` (28) + `pms_guest_preference_types` (53, with `value_type`, `options`) | Current |
| Guest value | `guest_preference_values` (41; `preference_type_id`, `value_json`) | Current |
| Legacy fixed columns | `guest_preferences` (7; room/bed/floor/view/food/communication/accessibility) | Legacy. Still read by `front-office-room-operations.server.ts` for room selection and by the guest workspace. |
| Legacy option lookup | `pms_preference_options` (0) | Duplicates `pms_guest_preference_types.options`. |
| Snapshot | none | No reservation-level preference snapshot exists. |

**Ownership model.** Guest Profile owns all preference tables. The catalogue defines the questions, `guest_preference_values` holds the answers, and `guest_preferences` is migrated into values later. Room-assignment logic (`pms_inventory_rules.use_guest_preference`) must then read values.

### 4.3 Guest service catalogues and request stores

| Store | Rows | Role | Decision |
|---|---|---|---|
| `pms_guest_service_types` (+ categories, department assignments, SLA, pricing, availability) | 156 | **Single service catalogue** | Owner: Guest Services |
| `fo_service_catalogue` | 0 | Package-service catalogue (legacy) | DEPRECATE LATER. Repoint `pms_package_components.fo_service_id` and event-template services to `pms_guest_service_types`. |
| `pms_guest_request_types` | 4 | Request types with department (setup card set5 only) | MERGE LATER into `pms_guest_service_types` (non-chargeable types). |
| `guest_service_history` | 27 | **Single request store** (typed, priced, assignable, folio-linked) | Owner: Guest Services. Rename later (section 7). |
| `fo_guest_requests` | 1 | Free-text request per reservation with status | MERGE LATER into `guest_service_history` as an untyped / "general request" service type. |

**Ownership model.** Guest Services owns one catalogue (`pms_guest_service_types`) and one request lifecycle (`guest_service_history`). Front Office, Housekeeping and the guest workspace create and progress requests through a single Guest Services path (`post_reservation_service_requests` or its successor). Packages reference the same catalogue.

### 4.4 Templates — communication vs notification

- `pms_communication_templates` (2 rows) has code, category, `event_trigger`, `channel_type`, language, subject, message, `allow_manual_sending` and `attach_pdf`. It is used by communication templates, automation rules and notification events.
- `pms_notification_templates` (1 row) has only code, name, channel and body, and only setup card set5 uses it.
- **Decision.** Communication templates are the current source; notification templates are MERGE LATER. Owner: Integrations (communications).

### 4.5 Distribution logs vs sync events

- `pms_distribution_sync_events` (18 rows) is the provider-level technical sync log: provider, direction, operation, attempts, retry eligibility. It is written by the Aiosell services and read by night audit.
- `distribution_logs` (0 rows) is a channel-level business event log (`channel_id`, `event_type`, polymorphic `reference_type/reference_id`). It is written only by the booking engine and read by distribution and audit screens.
- **Decision: KEEP BOTH** with these documented roles. MERGE LATER is a valid option if no second channel writer appears.

### 4.6 `hotel_rate_restrictions` vs `pms_commercial_restrictions`

- `hotel_rate_restrictions` (7 rows) is per rate plan per date (min/max stay, CTA, CTD, stop-sell). It is enforced by pricing, ARI push, public booking and revenue control, and written through `apply_hotel_rate_restrictions`.
- `pms_commercial_restrictions` (4) + `pms_commercial_restriction_room_types` (4) are named restriction definitions (kind, min nights, validity window, room types). They are read and written only by `commercial-card3` and are **not enforced** by pricing.
- **Decision: KEEP BOTH, different semantics.** Document `pms_commercial_restrictions` as a commercial template that is not applied automatically. A later decision is needed on whether to materialise it into `hotel_rate_restrictions` or retire it (P2: users may assume it is enforced).

### 4.7 Room holds

| Table | Inventory impact | Role |
|---|---|---|
| `pms_operational_inventory_blocks` (3) | **Yes**: the only hold read by calendar, room board and inventory | Operational hold source. Owner: Rooms & Inventory (RPC lifecycle create/approve/activate/release). |
| `pms_group_blocks` (1) + `pms_group_allotment_nights` (0) | Through operational blocks: `groups.functions.ts` calls `pms_create_operational_block` / `pms_activate_operational_block` / `pms_release_operational_block` | Group commercial allotment layered on operational blocks. Owner: Reservations (groups). |
| `pms_agency_allotments` (1) | **No**: read only by travel-agent screens | Contractual allocation for a travel agent. Owner: Guest Profile (agreements). |

**Decision.** This is a layered model, not duplication. Operational blocks are the only inventory-impacting hold. Agency allotments could later be materialised through operational blocks like group blocks (P4). `pms_group_allotment_nights.inventory_block_id` should get an FK (section 5).

### 4.8 Payment method — catalogue vs free text

- `folio_transactions.payment_method` values are `cash` 40, `card` 31, `other` 8, `bank_transfer` 2. These are exactly the `pms_payment_methods.type_class` values, not catalogue codes (codes include `BANK`, `CARD`, `CASH`, `MOBILE_BANKING`, `ONLINE`, `PAYCHECK`, `TEL`, and a typo `CAHS`).
- **Decision.** `payment_method` is a **method class** (an enumerated tender class used by cashier reconciliation), not a reference to the catalogue. It is HEALTHY BY DESIGN as a class. MISSING RELATIONSHIP: the specific catalogue method used is not recorded. Future: add a nullable `payment_method_id` (FK to `pms_payment_methods`) alongside the class (P4). Fix the `CAHS` code via the setup UI (P3, data).
- `fo_checkin_progress.deposit_amount/deposit_method` is a check-in progress snapshot; `deposit_transaction_id` is the ledger source.

### 4.9 Policy fields on `restaurants` (high priority)

Population: `deposit_*` is set on 1 of 11 properties; FO fee columns, posture JSON and `pms_property_setup_status` on 11 of 11. Policy tables: deposit 7, cancellation 11, no-show 8, fees 6.

| Column(s) | Runtime readers | Classification | Rule |
|---|---|---|---|
| `deposit_required`, `deposit_type`, `deposit_value` | fo-arrival, fo-walkin, fo-control, reservations, cashiering, payments-card3 | **CURRENT SOURCE** (property default) | Fallback only when the reservation has no `deposit_policy_id` / `deposit_requirement_snapshot`. |
| `fo_cancel_fee_required/default`, `cancel_fee_basis` | fo-cancel-noshow, fo-fee-defaults | **CURRENT SOURCE** (FO cancel fee default) | Used by Front Office cancellation. Rate-plan `pms_rate_cancellation_policies` and the reservation `cancellation_policy_snapshot` remain the booking-time terms. |
| `fo_noshow_fee_required/default`, `noshow_fee_basis` | fo-cancel-noshow, fo-fee-defaults | **CURRENT SOURCE** (fallback) | `no_show_policy_snapshot` on the reservation takes precedence. |
| `early_checkin_allowed`, `early_checkin_needs_approval` | fo-arrival, fo-check-in, fo-check-in-readiness | **CURRENT SOURCE** | Property operating rule. |
| `late_checkout_allowed`, `late_checkout_fee` | arrivals-departures, fo-departure, fo-inhouse, fo-control | **CURRENT SOURCE** | Property operating rule. |
| `early_checkin_fee` | setup card only | **LEGACY** | Superseded by `pms_fees`. |
| `cancel_window_hours` | setup card only | **LEGACY** | Superseded by `pms_rate_cancellation_policies`. |
| `checkin_policy_text`, `checkout_policy_text`, `early_checkin_policy_text`, `late_checkout_policy_text` | setup card1 | **CURRENT SOURCE** | Property-facing text; no other store. |
| `department_contacts` | setup card1 | **CURRENT SOURCE** (de facto) | `pms_property_department_contacts` has 0 rows and no writer. |
| `property_areas` | setup card1 | **COMPATIBILITY SNAPSHOT** | `pms_property_areas` (4 rows) is the table source. |
| `checkin_ops`, `structure_rules_posture`, `tax_identities` | setup cards only | **COMPATIBILITY SNAPSHOT** | Setup-card state; tax identity is sourced from `vat_number` / `tin_number` / `fiscal_registrations`. |
| `pms_guest_profile_rules` | guest-profile-listing, guest-travel-agency-types | **CURRENT SOURCE** | Read at runtime by guest listing. |
| `pms_rate_package_rules`, `pms_hk_status_rules`, `pms_hk_cleaning_posture`, `pms_ooo_oos_posture`, `pms_routing_defaults`, `pms_notification_event_rules`, `pms_session_access_posture`, `pms_audit_retention_posture`, `pms_distribution_channel_posture`, `pms_distribution_mapping_posture`, `pms_reports_catalogue_posture`, `pms_reports_schedule_access_posture`, `pms_offline_enablement_posture`, `pms_offline_sync_posture` | setup cards only (housekeeping-card2, audit-card7 and reports-card7 are setup cards) | **COMPATIBILITY SNAPSHOT** | Setup-card state mirroring dedicated tables (`pms_housekeeping_*`, `pms_department_routing_rules`, `pms_communication_notification_events`, `pms_audit_policies`, `pms_offline_policies`, `pms_report_*`). |
| `pms_property_setup_status` | readiness checks across setup modules | **DERIVED CACHE** | Readiness state recomputed by setup cards. |

**Ownership rule.** Policy tables hold booking-time terms, and reservations snapshot them. `restaurants` policy columns are property-level **defaults and operating rules** owned by Property Core and edited only by Property Setup. Posture JSON columns are setup-card state; runtime code must not depend on them where a dedicated table exists.

### 4.10 Staff role model

| Store | Data | Used by | Decision |
|---|---|---|---|
| `restaurant_users.role` | owner 11, receptionist 2, waiter 1, cashier 1 | RLS helpers (`has_restaurant_role`), owner checks | **Access tier.** KEEP. Kitchen/waiter roles stay per the PMS-only contract. |
| `pms_membership_roles` (+ `pms_hotel_roles`, `pms_role_permissions`) | 3 members, single role each | `pms-permissions.server.ts`, the authoritative functional-role resolver | **Functional hotel role.** KEEP (source). |
| `restaurant_users.hotel_role_id` | set on 2 owners; differs from the bridge for all 3 bridge members | Not read ("hotel_role_id and staff_module_access are not read") | **LEGACY RESIDUE.** DEPRECATE LATER (P2). |
| `staff_module_access`, `pms_report_permissions` | — | Separate grants | Scoped grants; document. |

### 4.11 Shift models

| Model | Table | Decision |
|---|---|---|
| Cash handling | `hotel_cashier_shifts` (2) | Cashiering source for drawer sessions. KEEP. |
| Workforce instance | `staff_shifts` (0), `staff_attendance`, `staff_table_assignments` | HR rota. KEEP. |
| Template | `pms_shift_definitions` (0) | HR shift template. KEEP. Optional future `staff_shifts.shift_definition_id` FK (P4). |
| Legacy | `folio_history.legacy_cashier_shift_id` | LEGACY RESIDUE. Document; drop later after history review (P3). |

### 4.12 Duplicate FKs on `hotel_rate_plans`

| Pair | Definition | Decision |
|---|---|---|
| `hotel_rate_plans_cancellation_policy_fk` / `hotel_rate_plans_cancellation_same_property` | Both `(cancellation_policy_id, restaurant_id) → pms_rate_cancellation_policies(id, restaurant_id) ON DELETE SET NULL` | **SAFE DUPLICATE**. Drop one later (P3). |
| `hotel_rate_plans_refundability_fk` / `hotel_rate_plans_refundability_same_property` | Both `(refundability_id, restaurant_id) → pms_rate_refundability_codes(id, restaurant_id) ON DELETE SET NULL` | **SAFE DUPLICATE**. Drop one later (P3). |

---

## 5. Missing FK Review

16 NOFK tables, 32 relationship columns.

| Table | Column(s) | Classification | Note |
|---|---|---|---|
| `financial_account_invoice_events` | `invoice_id` | INTENTIONAL SOFT REFERENCE | Append-only event log; keeps events if a draft is removed. |
| `fiscal_item_mappings` | `service_type_id`, `department_id` | FK SHOULD EXIST | → `pms_guest_service_types`, `pms_departments`. |
| `guest_folio_invoice_lines` | `folio_id`, `source_transaction_id`, `component_transaction_id` | FK SHOULD EXIST | The ledger is immutable, so the FKs are safe. |
| `guest_service_history` | `folio_transaction_id` | FK SHOULD EXIST | → `folio_transactions`. |
| `invoice_credit_note_events` | `guest_invoice_id`, `account_invoice_id`, `credit_note_id`, `folio_id`, `financial_account_id` | INTENTIONAL SOFT REFERENCE (5) | Append-only audit events. |
| `invoice_credit_note_lines` | `ledger_transaction_id` | FK SHOULD EXIST | → `folio_transactions`. |
| `invoice_credit_notes` | `folio_id`, `financial_account_id` | FK SHOULD EXIST | Denormalised from the parent invoice; FK plus consistency check. |
| `pms_agency_commission_plans` | `agreement_id` | FK SHOULD EXIST | → agreement table. |
| `pms_group_allotment_nights` | `inventory_block_id` | FK SHOULD EXIST | → `pms_operational_inventory_blocks` (section 4.7). |
| `pms_group_rooming_rows` | `group_block_id`, `guest_id`, `room_type_id`, `reservation_id` | FK SHOULD EXIST (4) | Nullable FKs; rooming rows are pre-reservation work rows. |
| `pms_groups` | `leader_guest_id`, `rate_plan_id` | FK SHOULD EXIST | |
| `pms_meal_applicability_policies` | `breakfast_department_id`, `lunch_department_id`, `dinner_department_id` | FK SHOULD EXIST (3) | → `pms_departments`. |
| `pms_operational_inventory_blocks` | `group_id` | FK SHOULD EXIST | → `pms_groups`. |
| `pms_package_components` | `fulfillment_department_id` | FK SHOULD EXIST | → `pms_departments`. |
| `pms_reservation_service_entitlements` | `guest_id`, `department_id` / `component_id` | FK SHOULD EXIST (2) / **POLYMORPHIC** (1) | `component_id` follows `source_type/source_id` (package activation or meal plan). |
| `pms_waitlist_offers` | `rate_plan_id` | FK SHOULD EXIST | |

Column totals: **FK SHOULD EXIST 25 · INTENTIONAL SOFT REFERENCE 6 · POLYMORPHIC 1 · EXTERNAL ID 0 · JSON 0 · FALSE POSITIVE 0.**

Table-level primary classification: FK SHOULD EXIST 13 · INTENTIONAL SOFT REFERENCE 2 · POLYMORPHIC 1 (mixed: `pms_reservation_service_entitlements`).

Adding these FKs is P2 (MISSING RELATIONSHIP). Each needs a pre-check for orphans before a future migration. None are P0: all writers set them from validated reads.

Also listed in the ARCH-01 NOFK detail, but flagged LEGACY rather than NOFK: `folio_history.legacy_cashier_shift_id` (section 4.11).

### `financial_account_participants`

- 0 rows; PK `(financial_account_id, guest_folio_id)`; same-property composite FKs with `ON DELETE CASCADE`; manager RLS for INSERT/SELECT/DELETE.
- Created by `0128_cashiering_phase8_financial_accounts.sql` with the comment "Links a master billing account to participant guest folios".
- No source references and no function references.
- **Decision: FUTURE FEATURE (KEEP DB-ONLY).** The structure is correct and cheap. Before any UI uses it, Cashiering must provide an owner RPC. If master-account participant linking is not on the roadmap at the next review, reclassify it as REMOVE CANDIDATE (P4).

---

## 6. Zero-Reference / Zero-Row Review

Zero-reference: 1 table, `financial_account_participants` (FUTURE FEATURE, section 5).

The six referenced tables with no direct app writer all have a database-function or setup writer, so none is orphaned:

- `folio_deposit_allocations`: `post_folio_transaction`, `apply_guest_deposit_invoice_allocations`.
- `pms_reservation_overbooking_approvals`: `pms_enforce_explicit_overbooking`.
- `pms_import_jobs` / `pms_import_job_issues`: import card7, history only per migration 0088.
- `inventory_units`: inventory and purchasing modules.
- `pms_property_department_contacts`: setup card1.

55 zero-row tables:

| Class | Count | Tables |
|---|---|---|
| VALID EMPTY CAPABILITY (event/transaction tables, empty until the event happens) | 17 | `financial_account_payment_allocations`, `folio_deposit_allocations`, `distribution_logs`, `financial_account_invoice_draft_items`, `guest_folio_invoice_draft_items`, `invoice_credit_note_draft_items`, `invoice_credit_note_drafts`, `guest_merge_ledger`, `pms_agency_commission_entries`, `pms_import_jobs`, `pms_import_job_issues`, `pms_reservation_overbooking_approvals`, `pms_group_allotment_nights`, `reservation_traces`, `staff_attendance`, `staff_shifts`, `staff_table_assignments` |
| NOT YET USED (implemented capability not configured or used by any property) | 28 | Inventory/Procurement: `inventory_items`, `inventory_stock_movements`, `restaurant_assets`, `restaurant_asset_history`, `purchase_orders`, `purchase_order_items`, `purchase_order_history`, `restaurant_suppliers`. Rate shopping: `hotel_competitors`, `hotel_competitor_provider_mappings`, `hotel_competitor_room_mappings`, `hotel_competitor_rate_observations`, `hotel_rate_shopping_fetch_runs`. Others: `fiscal_buyer_code_mappings`, `pms_agency_allowed_room_types`, `pms_agency_notification_prefs`, `pms_agency_rate_defaults`, `pms_group_templates`, `pms_event_package_template_services`, `pms_department_routing_rules`, `pms_golive_plans`, `pms_golive_tasks`, `pms_property_department_contacts`, `pms_overbooking_date_limits`, `pms_service_charge_department_targets`, `pms_tax_department_targets`, `pms_shift_definitions`, `financial_account_participants` |
| SEED EXPECTED (lookups every property should have) | 8 | `pms_guest_vip_levels`, `pms_preference_options`, `pms_maintenance_categories`, `pms_maintenance_priorities`, `pms_maintenance_type_tags`, `pms_restriction_reasons`, `pms_purpose_of_stay`, `inventory_units` |
| DEAD-POSSIBLE CLEANUP (superseded, no data) | 2 | `fo_stay_companions`, `fo_service_catalogue` |
| ENVIRONMENT-SPECIFIC | 0 | Only one deployed project was inspected. |

Notes:

- `pms_preference_options` is SEED EXPECTED by the current code but DEPRECATE LATER by design (section 4.2).
- `pms_guest_vip_levels` being empty explains why `guest_profiles.vip_status` is free text (P3).

---

## 7. Legacy Naming Review

| Table | Decision | Reason |
|---|---|---|
| `restaurants` | DOCUMENT ALIAS (= property) | Tenant root; `restaurant_id` is in nearly every table and composite FK. Renaming is high-risk and low-value; protected by `docs/pms-only-architecture.md`. |
| `restaurant_users` | DOCUMENT ALIAS (= property membership) | Same reason. Used by RLS helpers. |
| `restaurant_staff_audit_log` | DOCUMENT ALIAS (= staff audit log) | |
| `restaurant_package_entitlements` | DOCUMENT ALIAS (= property package entitlements) | Platform Admin. |
| `restaurant_suppliers` | DOCUMENT ALIAS (= property suppliers) | |
| `restaurant_assets` | DOCUMENT ALIAS (= property assets) | |
| `restaurant_asset_history` | DOCUMENT ALIAS (= property asset history) | |
| `restaurant_tables` | KEEP | The name is accurate: these are F&B outlet tables (section 2). |
| `folio_history` | KEEP | Consistent with the `guest_folios` / `folio_transactions` family. |
| `housekeeping_maintenance_requests` | KEEP | Accurate now that Housekeeping owns it. |
| `guest_service_history` | RENAME LATER | Holds live service requests, not history. Candidate: `guest_service_requests` (P3). |

Totals: **KEEP 3 · DOCUMENT ALIAS 7 · RENAME LATER 1 · DEPRECATE LATER 0.**

### `restaurant_tables.qr_token`

- `text NOT NULL`, no default, unique constraint `restaurant_tables_qr_token_key`; populated on 3 of 3 rows (3 distinct).
- No reference anywhere in `src/` (the workforce readers select other columns). Only three migrations mention it, including the greenfield schema.
- Because it is NOT NULL with no default, any future insert into `restaurant_tables` must invent a token.
- **Decision: SAFE FUTURE DROP** (with its unique constraint), or relax it to nullable first (P3). Not changed now.

---

## 8. Security / Account-Type Review

`enforce_profile_account_type` is SECURITY DEFINER and runs as a BEFORE INSERT/UPDATE trigger on `profiles`, alongside `protect_must_change_password`.

- A session is trusted when there are no JWT claims or the role is `service_role`.
- On INSERT, an untrusted session gets `account_type` forced to `customer`; NULL becomes `customer`.
- On UPDATE, an untrusted change by a non-platform-admin is reverted.
- The CHECK allows `customer`, `restaurant_user` and `platform_admin`. Data: `restaurant_user` 14, `platform_admin` 2, `customer` 0.
- RLS "Users can insert their own profile" (`WITH CHECK (id = auth.uid())`) lets any authenticated user create their own profile, which is coerced to `customer`. There is no `auth.users` trigger.
- Staff profiles are created by the service role with `restaurant_user`.
- `anon` and `authenticated` hold full table grants on `profiles`; RLS is the only barrier.

Assessment: there is no privilege escalation path, because untrusted writes can only produce `customer`. However, `customer` is a retired account type in the PMS-only product, and 0 such profiles exist.

**Recommended future behaviour (not changed):**

1. Reject untrusted inserts with an error instead of coercing to `customer`, since all legitimate profile creation is server-side (service role).
2. After that, remove `customer` from the CHECK once confirmed unused.
3. Tighten grants to `SELECT, INSERT, UPDATE` for `authenticated` and none for `anon` (defence in depth).

Severity: P2 (security hardening, no current exposure).

Related P1 found during this review: seven code sites query `restaurant_memberships`, a table that is **not deployed**:

- `public-booking.functions.ts` (`cancelDirectBooking` actor lookup)
- `room-inventory.functions.ts:367`
- `guest-travel-agent-detail.functions.ts:959`
- `guest-travel-agent-create.functions.ts:125`
- `guest-company-create.functions.ts:146`
- `guest-company-detail.functions.ts:1332` and `:1458`

These lookups fail at runtime and fall back or error depending on the caller. The correct table is `restaurant_users`.

---

## 9. Recommended Future Refactors

None of these are performed here. Each needs its own migration or code task.

| ID | Severity | Category | Refactor |
|---|---|---|---|
| P0-1 | P0 | OWNERSHIP ISSUE | **RESOLVED** (NORU-DATA-INTEGRITY-01): `cancelDirectBooking` cancels all units via `cancel_hotel_reservation_all_units`; header status is only produced by rollup. |
| P1-1 | P1 | OWNERSHIP ISSUE | Availability functions (`pms_stay_overlaps_room`, `pms_room_unit_claims_room`, `pms_unassigned_room_demand`) should filter on unit status. |
| P1-2 | P1 | NORMALIZATION ISSUE | `count_reserved_rooms` should count units. |
| P1-3 | P1 | OWNERSHIP ISSUE | Replace the 7 `restaurant_memberships` queries with `restaurant_users`. |
| P1-4 | P1 | OWNERSHIP ISSUE | Guest Profile create/identity-update service for Front Office, Reservations and Direct Booking (numbering, duplicate detection, history). |
| P1-5 | P1 | OWNERSHIP ISSUE | Reservations owner functions for FO operational fields (`expected_arrival_at`, late checkout, `special_request_category`, walk-in source) and guest re-pointing. |
| P1-6 | P1 | OWNERSHIP ISSUE | Cashiering "record settlement exception" function for check-out (`guest_folios` + `folio_history`). |
| P1-7 | P1 | OWNERSHIP ISSUE | Housekeeping must set `hotel_rooms.maintenance_status` through `pms_set_room_operational_restriction`. |
| R-01 | P2 | NORMALIZATION ISSUE | Decide header `adults/children/infants/room_type_id/rate_plan_id`: roll up from units or treat as unit-1 display copies. |
| R-02 | P2 | MISSING RELATIONSHIP | Add the 25 FKs in section 5 after orphan checks. |
| R-03 | P2 | LEGACY RESIDUE | Guest services: repoint package components to `pms_guest_service_types`; merge `pms_guest_request_types` and `fo_guest_requests`; retire `fo_service_catalogue`. |
| R-04 | P2 | LEGACY RESIDUE | Migrate `guest_preferences` into `guest_preference_values`; retire `pms_preference_options`. |
| R-05 | P2 | LEGACY RESIDUE | Retire `fo_stay_companions`. |
| R-06 | P2 | OWNERSHIP ISSUE | Corporate contracts select no-show policies instead of editing the catalogue. |
| R-07 | P2 | LEGACY RESIDUE | Deprecate `restaurant_users.hotel_role_id`. |
| R-08 | P2 | DOCUMENTATION ISSUE | Document or decide `pms_commercial_restrictions` (template vs enforced). |
| R-09 | P2 | NORMALIZATION ISSUE | Retire `restaurants` posture JSON columns that mirror dedicated tables, one setup card at a time; retire `cancel_window_hours` and `early_checkin_fee`. |
| R-10 | P2 | NORMALIZATION ISSUE | Consolidate guest service request creation behind one Guest Services path. |
| R-11 | P2 | DOCUMENTATION ISSUE | Harden `enforce_profile_account_type` (section 8). |
| R-12 | P3 | DOCUMENTATION ISSUE | Drop one of each duplicate FK pair on `hotel_rate_plans`. |
| R-13 | P3 | LEGACY RESIDUE | Drop `restaurant_tables.qr_token`; drop `folio_history.legacy_cashier_shift_id` after history review. |
| R-14 | P3 | DOCUMENTATION ISSUE | Rename `guest_service_history` → `guest_service_requests`; merge `pms_notification_templates`; document the `restaurant_*` aliases. |
| R-15 | P3 | DOCUMENTATION ISSUE | Fix the `CAHS` payment method code; seed VIP levels and link `guest_profiles.vip_status`. |
| R-16 | P4 | POTENTIAL FUTURE REFACTOR | Add `folio_transactions.payment_method_id`; materialise agency allotments through operational blocks; move per-room operational fields to units; add `staff_shifts.shift_definition_id`; decide `financial_account_participants`. |

---

## 10. ERD Readiness Matrix

| ERD group | Tables | Readiness | Notes for the ERD author |
|---|---|---|---|
| 01-property-core | 14 | READY WITH NOTES | Show `restaurants` column groups (identity, policy defaults, setup snapshots) as notes, not tables. |
| 02a-guest-profile-individual | 17 | READY WITH NOTES | Mark `guest_preferences` and `pms_preference_options` legacy; `vip_status` free text. |
| 02b-guest-accounts-agreements | 25 | READY WITH NOTES | Agency allotments are non-inventory; `pms_agency_commission_plans.agreement_id` is a dashed (missing FK) link. |
| 03a-reservations-core | 16 | READY WITH NOTES | Header = booking envelope + derived summary; units = stay source (section 3 rule). |
| 03b-groups-sales-events | 15 | READY WITH NOTES | Dashed links for rooming rows, `pms_groups` and allotment nights; group blocks layer on operational blocks. |
| 04-rooms-inventory | 14 | READY WITH NOTES | Operational blocks are the only inventory hold; room status dimensions owned by HK / Rooms. |
| 05-front-office-guest-services | 16 | READY WITH NOTES | One catalogue + one request store; show `pms_guest_request_types`, `fo_guest_requests` and `fo_stay_companions` as legacy. |
| 06-housekeeping-maintenance | 14 | READY WITH NOTES | `housekeeping_maintenance_requests` is now owned by Housekeeping. |
| 07-cashiering-ledger | 17 | READY WITH NOTES | `payment_method` is a class; `financial_account_participants` is a future feature; four allocation tables by subject and stage. |
| 08-taxes-fees | 8 | READY | — |
| 09a-rate-plans-pricing | 16 | READY WITH NOTES | Duplicate FK pairs drawn once; commercial restrictions not enforced. |
| 09b-packages-promotions | 14 | READY WITH NOTES | `fo_service_catalogue` now here, marked legacy. |
| 09c-revenue-management | 9 | READY | — |
| 10-night-audit | 5 | READY | — |
| 11-inventory-procurement | 9 | READY WITH NOTES | `restaurant_*` aliases; all tables empty but structured. |
| 12-staff-hr | 6 | READY WITH NOTES | Includes `pms_shift_definitions`, `restaurant_tables`, `staff_table_assignments`; role model per section 4.10. |
| 13a-invoicing-credit-notes | 18 | READY WITH NOTES | Soft references on event tables; missing FKs on invoice and credit-note lines. |
| 13b-fiscal-finance | 13 | READY WITH NOTES | `fiscal_item_mappings` missing FKs. |
| 14-distribution-direct-booking | 8 | READY WITH NOTES | Two logs with distinct roles. |
| 15a-security-platform | 14 | READY WITH NOTES | `account_type` hardening note. |
| 15b-integrations-communications | 19 | READY WITH NOTES | Communication vs notification templates; `pms_integrations` row ownership per provider. |
| 15c-reports-analytics | 8 | READY | — |
| 16-marketing-cms | 2 | READY | — |

Totals: **READY 5 · READY WITH NOTES 18 · BLOCKED BY OWNERSHIP DECISION 0.**

Hard stop observed: no ER diagrams were created; no schema, data, FK, name or code changes were made.
